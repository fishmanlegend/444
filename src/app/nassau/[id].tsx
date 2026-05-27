import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Fonts, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import {
  getRoundWithPlayers, getMatchTeams, upsertMatchTeam, deleteMatchTeam,
  getNassauBets, insertNassauBet, getNassauHoles, upsertNassauHole,
} from '@/lib/db';
import { EditPlayersSheet } from '@/components/EditPlayersSheet';
import type { NassauBet } from '@/lib/database.types';

// ─── Types ────────────────────────────────────────────────────────────────────

type Player = { id: string; name: string; initials: string; color: string; isTempPlayer: boolean };
type TeamMap = Record<string, 'a' | 'b'>;
type HoleResult = 'a' | 'b' | 'halve' | null;

type LocalBet = { id: string; type: NassauBet['type']; startHole: number; endHole: number; parentBetId: string | null };

const CIRCLE_SIZE = 34;
const CIRCLE_GAP  = 6;
const CIRCLE_STEP = CIRCLE_SIZE + CIRCLE_GAP;
const TOTAL_HOLES = 18;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n % 1 === 0 ? `$${n}` : `$${n.toFixed(2)}`;
}

function betScore(bet: LocalBet, results: HoleResult[]): { aUp: number; played: number; holesLeft: number } {
  let a = 0, b = 0, played = 0;
  for (let h = bet.startHole; h <= bet.endHole; h++) {
    const r = results[h - 1];
    if (r === 'a') { a++; played++; }
    else if (r === 'b') { b++; played++; }
    else if (r === 'halve') played++;
  }
  const total = bet.endHole - bet.startHole + 1;
  return { aUp: a - b, played, holesLeft: total - played };
}

function betLabel(bet: LocalBet): string {
  if (bet.type === 'front')  return 'Front 9';
  if (bet.type === 'back')   return 'Back 9';
  if (bet.type === 'total')  return 'Total';
  return `Press (H${bet.startHole}–${bet.endHole})`;
}

function scoreLabel(aUp: number, holesLeft: number): string {
  if (aUp === 0) return holesLeft === 0 ? 'Halved' : 'AS';
  const side = aUp > 0 ? 'A' : 'B';
  const abs = Math.abs(aUp);
  if (holesLeft === 0) return `${side} wins ${abs}`;
  if (abs > holesLeft) return `${side} wins ${abs}&${holesLeft}`;
  return `${side} ${abs} up`;
}

function checkAutoPress(bets: LocalBet[], results: HoleResult[], holeJustCompleted: number): LocalBet[] {
  const newBets: LocalBet[] = [];
  for (const bet of bets) {
    if (bet.type !== 'front' && bet.type !== 'back' && bet.type !== 'total') continue;
    if (holeJustCompleted < bet.startHole || holeJustCompleted >= bet.endHole) continue;
    const { aUp, holesLeft } = betScore(bet, results);
    if (holesLeft === 0 || Math.abs(aUp) < 2) continue;
    const nextHole = holeJustCompleted + 1;
    const alreadyExists = bets.some((b) => b.parentBetId === bet.id && b.startHole === nextHole);
    if (!alreadyExists) {
      newBets.push({
        id: `press-${bet.id}-${nextHole}`,
        type: 'press',
        startHole: nextHole,
        endHole: bet.endHole,
        parentBetId: bet.id,
      });
    }
  }
  return newBets;
}

function teamName(players: Player[], team: 'a' | 'b', teams: TeamMap): string {
  const tp = players.filter((p) => teams[p.id] === team);
  if (!tp.length) return team === 'a' ? 'Team A' : 'Team B';
  return tp.length === 1 ? tp[0].name.split(' ')[0] : `${tp[0].name.split(' ')[0]} & ${tp[1].name.split(' ')[0]}`;
}

// ─── Pip ──────────────────────────────────────────────────────────────────────

function Pip({ player }: { player: Player }) {
  return (
    <View style={[g.pip, { backgroundColor: player.color }]}>
      <Text style={g.pipText}>{player.initials}</Text>
    </View>
  );
}

// ─── Setup phase — team assignment ────────────────────────────────────────────

function TeamSetupPhase({
  players, teams, stake, setStake, autoPress, setAutoPress,
  onToggle, onStart, onBack,
}: {
  players: Player[]; teams: TeamMap; stake: number; setStake: (v: number) => void;
  autoPress: boolean; setAutoPress: (v: boolean) => void;
  onToggle: (pid: string) => void; onStart: () => void; onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const aPlayers = players.filter((p) => teams[p.id] === 'a');
  const bPlayers = players.filter((p) => teams[p.id] === 'b');
  const canStart = aPlayers.length > 0 && bPlayers.length > 0;

  const PRESETS = [5, 10, 20, 25] as const;
  type PresetMode = 5 | 10 | 20 | 25 | 'custom';
  const initMode: PresetMode = ([5, 10, 20, 25] as number[]).includes(stake) ? (stake as any) : 'custom';
  const [mode, setMode] = useState<PresetMode>(initMode);

  return (
    <View style={g.root}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.green }}>
        <View style={g.topBar}>
          <TouchableOpacity onPress={onBack} activeOpacity={0.7} style={g.topBarBackHit}>
            <Text style={g.topBarBack}>← Back</Text>
          </TouchableOpacity>
          <Text style={g.topBarTitle}>Nassau</Text>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={[g.setupContent, { paddingBottom: insets.bottom + 32 }]}>
        <Text style={g.setupHeading}>Set up Nassau</Text>

        <View style={g.fieldCard}>
          <Text style={g.fieldLabel}>Stake per bet</Text>
          <Text style={g.fieldHint}>Front, Back, and Total are each worth this amount.</Text>
          <View style={g.segRow}>
            {PRESETS.map((amt) => (
              <TouchableOpacity key={amt} style={[g.seg, mode === amt && g.segActive]}
                onPress={() => { setMode(amt); setStake(amt); }} activeOpacity={0.8}>
                <Text style={[g.segText, mode === amt && g.segTextActive]}>${amt}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[g.seg, mode === 'custom' && g.segActive]} onPress={() => setMode('custom')} activeOpacity={0.8}>
              <Text style={[g.segText, mode === 'custom' && g.segTextActive]}>{mode === 'custom' ? fmt(stake) : 'Other'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={g.fieldCard}>
          <Text style={g.fieldLabel}>Automatic presses</Text>
          <View style={g.segRow}>
            <TouchableOpacity style={[g.seg, autoPress && g.segActive]} onPress={() => setAutoPress(true)} activeOpacity={0.8}>
              <Text style={[g.segText, autoPress && g.segTextActive]}>On (2 down)</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[g.seg, !autoPress && g.segActive]} onPress={() => setAutoPress(false)} activeOpacity={0.8}>
              <Text style={[g.segText, !autoPress && g.segTextActive]}>Off</Text>
            </TouchableOpacity>
          </View>
          <Text style={g.fieldHint}>When on, a new side bet starts whenever a team goes 2 down with holes remaining.</Text>
        </View>

        <View style={g.fieldCard}>
          <Text style={g.fieldLabel}>Assign teams — tap to toggle</Text>
          <View style={g.teamSection}>
            <Text style={g.teamLabel}>Team A</Text>
            {aPlayers.length === 0 && <Text style={g.teamEmpty}>No players assigned</Text>}
            {aPlayers.map((p) => (
              <TouchableOpacity key={p.id} style={g.teamPlayerRow} onPress={() => onToggle(p.id)} activeOpacity={0.7}>
                <Pip player={p} />
                <Text style={g.playerName}>{p.name}</Text>
                <Text style={g.teamBadge}>A</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={[g.teamSection, { borderTopWidth: 0.5, borderTopColor: Colors.border, marginTop: 8, paddingTop: 12 }]}>
            <Text style={g.teamLabel}>Team B</Text>
            {bPlayers.length === 0 && <Text style={g.teamEmpty}>No players assigned</Text>}
            {bPlayers.map((p) => (
              <TouchableOpacity key={p.id} style={g.teamPlayerRow} onPress={() => onToggle(p.id)} activeOpacity={0.7}>
                <Pip player={p} />
                <Text style={g.playerName}>{p.name}</Text>
                <Text style={[g.teamBadge, { backgroundColor: '#4a6fa5' }]}>B</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {!canStart && (
          <View style={g.warningCard}>
            <Text style={g.warningText}>Assign at least one player to each team.</Text>
          </View>
        )}

        <TouchableOpacity style={[g.primaryBtn, !canStart && g.primaryBtnDisabled]}
          onPress={canStart ? onStart : undefined} activeOpacity={0.85}>
          <Text style={g.primaryBtnText}>Start Nassau</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

// ─── Playing phase ────────────────────────────────────────────────────────────

type CircleState = 'done' | 'active' | 'future';

function HoleCircle({ holeNum, state, isViewing, onPress }: {
  holeNum: number; state: CircleState; isViewing: boolean; onPress: () => void;
}) {
  const bg = state === 'done' ? Colors.green : 'transparent';
  const borderColor = state === 'done' ? Colors.green : state === 'active' ? Colors.green : Colors.border;
  const textColor = state === 'done' ? Colors.cream : state === 'active' ? Colors.green : Colors.muted;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <View style={[g.circle, { backgroundColor: bg, borderColor }, isViewing && g.circleViewing]}>
        <Text style={[g.circleText, { color: textColor }]}>{state === 'done' ? '✓' : `${holeNum}`}</Text>
      </View>
    </TouchableOpacity>
  );
}

function BetScoreChip({ label, aUp, holesLeft, aName, bName, stake }: {
  label: string; aUp: number; holesLeft: number; aName: string; bName: string; stake: number;
}) {
  const won = holesLeft === 0;
  const lead = aUp > 0 ? aName : aUp < 0 ? bName : null;
  const bg = won ? (aUp !== 0 ? '#e8f4e8' : '#f5f0e8') : Colors.card;
  return (
    <View style={[g.betChip, { backgroundColor: bg }]}>
      <Text style={g.betChipLabel}>{label}</Text>
      <Text style={[g.betChipScore, won && aUp !== 0 && { color: Colors.green }]}>
        {scoreLabel(aUp, holesLeft)}
      </Text>
      {won && aUp !== 0 && <Text style={g.betChipValue}>{fmt(stake)}</Text>}
    </View>
  );
}

function PlayingPhase({
  results, bets, players, teams, stake, autoPress,
  currentHole, viewingHole, aName, bName,
  onResult, onNavigate, onEndRound,
}: {
  results: HoleResult[];
  bets: LocalBet[];
  players: Player[];
  teams: TeamMap;
  stake: number;
  autoPress: boolean;
  currentHole: number;
  viewingHole: number;
  aName: string;
  bName: string;
  onResult: (holeIdx: number, r: HoleResult) => void;
  onNavigate: (i: number) => void;
  onEndRound: () => void;
}) {
  const insets = useSafeAreaInsets();
  const stripRef = useRef<ScrollView>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    const x = Math.max(0, viewingHole * CIRCLE_STEP - 120);
    stripRef.current?.scrollTo({ x, animated: !isFirstRender.current });
    isFirstRender.current = false;
  }, [viewingHole]);

  const isViewingCurrent = viewingHole === currentHole;
  const currentResult = results[viewingHole];

  function circleState(i: number): CircleState {
    if (results[i] !== null) return 'done';
    if (i === currentHole) return 'active';
    return 'future';
  }

  const mainBets = bets.filter((b) => b.type !== 'press');
  const pressBets = bets.filter((b) => b.type === 'press');

  return (
    <View style={g.root}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.green }}>
        <View style={g.topBar}>
          <Text style={g.topBarSub}>Hole {viewingHole + 1}</Text>
          <Text style={g.topBarTitle}>Nassau</Text>
          <TouchableOpacity onPress={onEndRound} activeOpacity={0.7} style={g.topBarEndHit}>
            <Text style={g.topBarEnd}>End</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[g.playContent, { paddingBottom: insets.bottom + 72 }]}>
        <View style={g.stripWrap}>
          <ScrollView ref={stripRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={g.stripContent}>
            {Array.from({ length: TOTAL_HOLES }, (_, i) => (
              <HoleCircle key={i} holeNum={i + 1} state={circleState(i)} isViewing={i === viewingHole} onPress={() => onNavigate(i)} />
            ))}
          </ScrollView>
        </View>

        {/* Live bet scores */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={g.betsRow}>
          {mainBets.map((bet) => {
            const { aUp, holesLeft } = betScore(bet, results);
            return <BetScoreChip key={bet.id} label={betLabel(bet)} aUp={aUp} holesLeft={holesLeft} aName={aName} bName={bName} stake={stake} />;
          })}
          {pressBets.length > 0 && pressBets.map((bet) => {
            const { aUp, holesLeft } = betScore(bet, results);
            return <BetScoreChip key={bet.id} label={betLabel(bet)} aUp={aUp} holesLeft={holesLeft} aName={aName} bName={bName} stake={stake} />;
          })}
        </ScrollView>

        {/* Auto press notification */}
        {autoPress && pressBets.length > 0 && (
          <View style={g.pressBanner}>
            <Text style={g.pressText}>{pressBets.length} press{pressBets.length !== 1 ? 'es' : ''} active</Text>
          </View>
        )}

        {/* Hole result entry */}
        <View style={g.holeCard}>
          <View style={g.holeCardHeader}>
            <Text style={g.holeCardTitle}>Hole {viewingHole + 1}</Text>
            <Text style={g.holeCardSub}>{aName} vs {bName}</Text>
          </View>

          <View style={g.resultRow}>
            {(['a', 'halve', 'b'] as const).map((r) => {
              const label = r === 'a' ? aName : r === 'b' ? bName : 'Halve';
              const isSelected = currentResult === r;
              return (
                <TouchableOpacity
                  key={r}
                  style={[g.resultBtn, isSelected && (r === 'halve' ? g.resultBtnHalve : g.resultBtnActive)]}
                  onPress={() => onResult(viewingHole, isSelected ? null : r)}
                  activeOpacity={0.7}
                >
                  <Text style={[g.resultBtnText, isSelected && g.resultBtnTextActive]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Team rosters */}
        <View style={g.teamsCard}>
          {(['a', 'b'] as const).map((team) => {
            const tp = players.filter((p) => teams[p.id] === team);
            return (
              <View key={team} style={g.teamCol}>
                <Text style={g.teamColLabel}>{team === 'a' ? aName : bName}</Text>
                {tp.map((p) => (
                  <View key={p.id} style={g.teamColPlayer}>
                    <Pip player={p} />
                    <Text style={g.teamColName}>{p.name}</Text>
                  </View>
                ))}
              </View>
            );
          })}
        </View>
      </ScrollView>

      <View style={[g.bottomBar, { paddingBottom: insets.bottom + 10 }]}>
        <TouchableOpacity style={[g.navBtn, viewingHole === 0 && g.navBtnDisabled]}
          activeOpacity={viewingHole === 0 ? 1 : 0.7}
          onPress={() => viewingHole > 0 && onNavigate(viewingHole - 1)}>
          <Text style={[g.navBtnText, viewingHole === 0 && g.navBtnTextDisabled]}>← Prev</Text>
        </TouchableOpacity>

        <Text style={g.navCenter}>{viewingHole + 1} / {TOTAL_HOLES}</Text>

        <TouchableOpacity
          style={[g.navBtn, viewingHole === TOTAL_HOLES - 1 && g.navBtnFinish]}
          activeOpacity={0.7}
          onPress={() => viewingHole < TOTAL_HOLES - 1 ? onNavigate(viewingHole + 1) : onEndRound()}>
          <Text style={[g.navBtnText, viewingHole === TOTAL_HOLES - 1 && g.navBtnTextFinish]}>
            {viewingHole === TOTAL_HOLES - 1 ? 'Finish 🏁' : 'Next →'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Settlement phase ─────────────────────────────────────────────────────────

function SettlementPhase({
  players, teams, bets, results, stake, aName, bName, onDone,
}: {
  players: Player[]; teams: TeamMap; bets: LocalBet[]; results: HoleResult[];
  stake: number; aName: string; bName: string; onDone: () => void;
}) {
  const insets = useSafeAreaInsets();

  type BetOutcome = { bet: LocalBet; aUp: number; winner: 'a' | 'b' | 'push' };
  const outcomes: BetOutcome[] = bets.map((bet) => {
    const { aUp } = betScore(bet, results);
    return { bet, aUp, winner: aUp > 0 ? 'a' : aUp < 0 ? 'b' : 'push' };
  });

  const aWins = outcomes.filter((o) => o.winner === 'a').length;
  const bWins = outcomes.filter((o) => o.winner === 'b').length;
  const aNet = (aWins - bWins) * stake;

  const aPlayers = players.filter((p) => teams[p.id] === 'a');
  const bPlayers = players.filter((p) => teams[p.id] === 'b');

  return (
    <View style={g.root}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.green }}>
        <View style={g.topBar}><Text style={g.topBarTitle}>Nassau Results</Text></View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={[g.settleContent, { paddingBottom: insets.bottom + 32 }]}>
        {/* Overall winner banner */}
        <View style={[g.winnerBanner, aNet === 0 && { backgroundColor: '#f5f0e8' }]}>
          <Text style={g.winnerText}>
            {aNet === 0 ? 'All square — no money changes hands'
              : `${aNet > 0 ? aName : bName} wins ${fmt(Math.abs(aNet))} overall`}
          </Text>
        </View>

        {/* Per-bet breakdown */}
        <Text style={g.sectionHead}>Bet breakdown</Text>
        <View style={g.fieldCard}>
          {outcomes.map((o, i) => (
            <View key={o.bet.id} style={[g.outcomeRow, i < outcomes.length - 1 && g.outcomeRowBorder]}>
              <Text style={g.outcomeBetLabel}>{betLabel(o.bet)}</Text>
              <Text style={[g.outcomeResult,
                o.winner === 'a' ? { color: Colors.green } :
                o.winner === 'b' ? { color: '#4a6fa5' } :
                { color: Colors.muted }]}>
                {o.winner === 'push' ? 'Push' : `${o.winner === 'a' ? aName : bName} wins ${fmt(stake)}`}
              </Text>
            </View>
          ))}
        </View>

        {/* Settle up */}
        <Text style={g.sectionHead}>Settle up</Text>
        <View style={g.fieldCard}>
          {aNet === 0 ? (
            <Text style={g.noTxnText}>All square — nothing owed.</Text>
          ) : (
            <>
              <Text style={g.settleSubhead}>
                {aNet > 0 ? `${bName} owes ${aName}` : `${aName} owes ${bName}`} {fmt(Math.abs(aNet))} total
              </Text>
              <Text style={g.settleHint}>
                Split between {aNet < 0 ? aPlayers.length : bPlayers.length} player(s) as agreed.
              </Text>
            </>
          )}
        </View>

        <TouchableOpacity style={g.primaryBtn} onPress={onDone} activeOpacity={0.85}>
          <Text style={g.primaryBtnText}>Done</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function NassauScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id ?? (__DEV__ ? '46bae3d3-2c18-450e-b267-f36b91a94a31' : null);

  const [players, setPlayers]         = useState<Player[]>([]);
  const [teams, setTeams]             = useState<TeamMap>({});
  const [loading, setLoading]         = useState(true);
  const [phase, setPhase]             = useState<'setup' | 'playing' | 'settled'>('setup');
  const [stake, setStake]             = useState(10);
  const [autoPress, setAutoPress]     = useState(true);
  const [results, setResults]         = useState<HoleResult[]>(Array(TOTAL_HOLES).fill(null));
  const [bets, setBets]               = useState<LocalBet[]>([]);
  const [currentHole, setCurrentHole] = useState(0);
  const [viewingHole, setViewingHole] = useState(0);
  const [dbBetIds, setDbBetIds]       = useState<Record<string, string>>({}); // localId → dbId

  function buildPlayerList(rawPlayers: any[]): Player[] {
    return rawPlayers
      .filter((p) => p.rsvp === 'in' || p.temp_player_id != null)
      .map((p) => {
        if (p.temp_player_id) {
          const tp = p.temp_player;
          const name = tp?.name ?? 'Guest';
          const initials = name.split(/\s+/).map((w: string) => w[0]?.toUpperCase() ?? '').slice(0, 2).join('') || '?';
          return { id: tp?.id ?? p.temp_player_id, name, initials, color: '#7a7060', isTempPlayer: true };
        }
        return { id: p.player_id, name: p.profile?.name ?? 'Player', initials: p.profile?.initials ?? '?', color: p.profile?.avatar_color ?? Colors.green, isTempPlayer: false };
      });
  }

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    Promise.all([getRoundWithPlayers(id), getMatchTeams(id), getNassauBets(id), getNassauHoles(id)]).then(
      ([round, dbTeams, dbBets, dbHoles]) => {
        if (round) {
          const mapped = buildPlayerList(round.players as any[]);
          setPlayers(mapped);
          const tm: TeamMap = {};
          for (const p of mapped) tm[p.id] = 'a';
          for (const t of dbTeams) tm[t.player_id] = t.team;
          setTeams(tm);
        }
        if (dbBets.length > 0) {
          const localBets: LocalBet[] = dbBets.map((b) => ({
            id: b.id, type: b.type, startHole: b.start_hole, endHole: b.end_hole, parentBetId: b.parent_bet_id,
          }));
          setBets(localBets);
          const r: HoleResult[] = Array(TOTAL_HOLES).fill(null);
          for (const h of dbHoles) {
            const bet = localBets.find((b) => b.id === h.bet_id);
            if (bet?.type === 'front' || bet?.type === 'back' || bet?.type === 'total') {
              r[h.hole_number - 1] = h.result;
            }
          }
          setResults(r);
          const lastPlayed = r.findLastIndex((r) => r !== null);
          setCurrentHole(lastPlayed === -1 ? 0 : Math.min(lastPlayed + 1, TOTAL_HOLES - 1));
          setPhase('playing');
        }
        setLoading(false);
      }
    );
  }, [id]);

  function toggleTeam(pid: string) {
    setTeams((prev) => ({ ...prev, [pid]: prev[pid] === 'a' ? 'b' : 'a' }));
  }

  async function startGame() {
    // Persist teams
    for (const [pid, team] of Object.entries(teams)) {
      await upsertMatchTeam(id, pid, team);
    }
    // Create the 3 base bets
    const baseBets: LocalBet[] = [
      { id: '', type: 'front', startHole: 1,  endHole: 9,  parentBetId: null },
      { id: '', type: 'back',  startHole: 10, endHole: 18, parentBetId: null },
      { id: '', type: 'total', startHole: 1,  endHole: 18, parentBetId: null },
    ];
    const resolvedBets: LocalBet[] = [];
    const idMap: Record<string, string> = {};
    for (const bet of baseBets) {
      const db = await insertNassauBet({ round_id: id, type: bet.type, start_hole: bet.startHole, end_hole: bet.endHole, parent_bet_id: null });
      if (db) {
        resolvedBets.push({ ...bet, id: db.id });
        idMap[bet.type] = db.id;
      }
    }
    setBets(resolvedBets);
    setDbBetIds(idMap);
    setPhase('playing');
  }

  async function handleResult(holeIdx: number, r: HoleResult) {
    const newResults = [...results];
    newResults[holeIdx] = r;
    setResults(newResults);

    // Persist to each bet covering this hole
    for (const bet of bets) {
      if (holeIdx + 1 >= bet.startHole && holeIdx + 1 <= bet.endHole) {
        await upsertNassauHole(id, bet.id, holeIdx + 1, r);
      }
    }

    // Advance current hole
    if (r !== null && holeIdx === currentHole && currentHole < TOTAL_HOLES - 1) {
      setCurrentHole(holeIdx + 1);
      setViewingHole(holeIdx + 1);
    }

    // Auto press
    if (autoPress && r !== null) {
      const newPresses = checkAutoPress(bets, newResults, holeIdx + 1);
      if (newPresses.length > 0) {
        const saved: LocalBet[] = [];
        for (const press of newPresses) {
          const parentDbId = bets.find((b) => b.id === press.parentBetId)?.id ?? null;
          const db = await insertNassauBet({
            round_id: id, type: 'press',
            start_hole: press.startHole, end_hole: press.endHole,
            parent_bet_id: parentDbId,
          });
          if (db) saved.push({ ...press, id: db.id, parentBetId: parentDbId });
        }
        setBets((prev) => [...prev, ...saved]);
      }
    }
  }

  const aName = useMemo(() => teamName(players, 'a', teams), [players, teams]);
  const bName = useMemo(() => teamName(players, 'b', teams), [players, teams]);

  if (loading) {
    return <View style={[g.root, { alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator color={Colors.cream} /></View>;
  }

  if (phase === 'setup') {
    return (
      <TeamSetupPhase
        players={players} teams={teams} stake={stake} setStake={setStake}
        autoPress={autoPress} setAutoPress={setAutoPress}
        onToggle={toggleTeam} onStart={startGame}
        onBack={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}
      />
    );
  }

  if (phase === 'playing') {
    return (
      <PlayingPhase
        results={results} bets={bets} players={players} teams={teams}
        stake={stake} autoPress={autoPress}
        currentHole={currentHole} viewingHole={viewingHole}
        aName={aName} bName={bName}
        onResult={handleResult}
        onNavigate={(i) => setViewingHole(i)}
        onEndRound={() => setPhase('settled')}
      />
    );
  }

  return (
    <SettlementPhase
      players={players} teams={teams} bets={bets} results={results}
      stake={stake} aName={aName} bName={bName}
      onDone={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}
    />
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const g = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.green },

  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 12, position: 'relative' },
  topBarTitle: { fontFamily: Fonts.serifMedium, fontSize: 18, color: Colors.cream },
  topBarSub: { position: 'absolute', left: 16, fontFamily: Fonts.sans, fontSize: 12, color: 'rgba(216,214,175,0.6)' },
  topBarBack: { fontFamily: Fonts.sans, fontSize: 13, color: 'rgba(216,214,175,0.6)' },
  topBarBackHit: { position: 'absolute', left: 0, paddingHorizontal: 16, paddingVertical: 12 },
  topBarEnd: { fontFamily: Fonts.sansMedium, fontSize: 13, color: 'rgba(216,214,175,0.7)' },
  topBarEndHit: { position: 'absolute', right: 0, paddingHorizontal: 16, paddingVertical: 12 },

  stripWrap: { backgroundColor: Colors.bg, paddingVertical: 12 },
  stripContent: { gap: CIRCLE_GAP, paddingHorizontal: 16 },
  circle: { width: CIRCLE_SIZE, height: CIRCLE_SIZE, borderRadius: CIRCLE_SIZE / 2, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  circleViewing: { borderWidth: 2.5 },
  circleText: { fontFamily: Fonts.sansSemiBold, fontSize: 11 },

  betsRow: { paddingHorizontal: 16, gap: 8, paddingVertical: 4 },
  betChip: { borderRadius: 12, padding: 12, minWidth: 110, borderWidth: 0.5, borderColor: Colors.border },
  betChipLabel: { fontFamily: Fonts.sans, fontSize: 10, color: Colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  betChipScore: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: Colors.text },
  betChipValue: { fontFamily: Fonts.sans, fontSize: 11, color: Colors.green, marginTop: 2 },

  pressBanner: { backgroundColor: '#fff3cd', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8, marginHorizontal: 16 },
  pressText: { fontFamily: Fonts.sansMedium, fontSize: 13, color: '#856404' },

  setupContent: { backgroundColor: Colors.bg, padding: Spacing.lg },
  playContent: { backgroundColor: Colors.bg, gap: 12 },
  settleContent: { backgroundColor: Colors.bg, padding: Spacing.lg, gap: 12 },

  setupHeading: { fontFamily: Fonts.serifMedium, fontSize: 24, color: Colors.text, marginBottom: 20, marginTop: 4 },

  fieldCard: { backgroundColor: Colors.card, borderRadius: 14, borderWidth: 0.5, borderColor: Colors.border, padding: 16, gap: 12, marginBottom: 12 },
  fieldLabel: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.muted },
  fieldHint: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.muted, lineHeight: 17 },

  segRow: { flexDirection: 'row', gap: 8 },
  seg: { flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.creamLight, alignItems: 'center' },
  segActive: { backgroundColor: Colors.green },
  segText: { fontFamily: Fonts.sansMedium, fontSize: 13, color: Colors.text },
  segTextActive: { color: Colors.cream },

  pip: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  pipText: { fontFamily: Fonts.sansSemiBold, fontSize: 11, color: '#fff' },
  playerName: { fontFamily: Fonts.sans, fontSize: 14, color: Colors.text, flex: 1 },

  teamSection: { gap: 10 },
  teamLabel: { fontFamily: Fonts.sansSemiBold, fontSize: 12, color: Colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  teamEmpty: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.muted },
  teamPlayerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  teamBadge: { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.green, alignItems: 'center', justifyContent: 'center' },

  warningCard: { backgroundColor: '#fff3cd', borderRadius: 10, padding: 12, marginBottom: 12 },
  warningText: { fontFamily: Fonts.sans, fontSize: 13, color: '#856404' },

  holeCard: { backgroundColor: Colors.card, borderRadius: 14, borderWidth: 0.5, borderColor: Colors.border, overflow: 'hidden', marginHorizontal: 16 },
  holeCardHeader: { backgroundColor: Colors.creamLight, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  holeCardTitle: { fontFamily: Fonts.serifMedium, fontSize: 18, color: Colors.text },
  holeCardSub: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.muted },

  resultRow: { flexDirection: 'row', gap: 0 },
  resultBtn: { flex: 1, paddingVertical: 18, alignItems: 'center', borderRightWidth: 0.5, borderRightColor: Colors.border },
  resultBtnActive: { backgroundColor: Colors.green },
  resultBtnHalve: { backgroundColor: '#f5f0e8' },
  resultBtnText: { fontFamily: Fonts.sansMedium, fontSize: 14, color: Colors.text },
  resultBtnTextActive: { color: Colors.cream },

  teamsCard: { backgroundColor: Colors.card, borderRadius: 14, borderWidth: 0.5, borderColor: Colors.border, padding: 16, flexDirection: 'row', gap: 16, marginHorizontal: 16 },
  teamCol: { flex: 1, gap: 8 },
  teamColLabel: { fontFamily: Fonts.sansSemiBold, fontSize: 11, color: Colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  teamColPlayer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  teamColName: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.text },

  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: Colors.bg, borderTopWidth: 0.5, borderTopColor: Colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12 },
  navBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 10, backgroundColor: Colors.creamLight, minWidth: 90, alignItems: 'center' },
  navBtnDisabled: { opacity: 0.35 },
  navBtnFinish: { backgroundColor: Colors.green },
  navBtnText: { fontFamily: Fonts.sansMedium, fontSize: 14, color: Colors.text },
  navBtnTextDisabled: { color: Colors.muted },
  navBtnTextFinish: { color: Colors.cream },
  navCenter: { fontFamily: Fonts.sansMedium, fontSize: 13, color: Colors.muted },

  winnerBanner: { backgroundColor: '#e8f4e8', borderRadius: 12, padding: 16, alignItems: 'center' },
  winnerText: { fontFamily: Fonts.sansSemiBold, fontSize: 16, color: Colors.text, textAlign: 'center' },

  sectionHead: { fontFamily: Fonts.sansSemiBold, fontSize: 11, color: Colors.muted, textTransform: 'uppercase', letterSpacing: 1, marginTop: 8 },

  outcomeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  outcomeRowBorder: { borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  outcomeBetLabel: { fontFamily: Fonts.sansMedium, fontSize: 14, color: Colors.text },
  outcomeResult: { fontFamily: Fonts.sans, fontSize: 13 },

  settleSubhead: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: Colors.text },
  settleHint: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.muted },
  noTxnText: { fontFamily: Fonts.sans, fontSize: 14, color: Colors.muted, textAlign: 'center', paddingVertical: 4 },

  primaryBtn: { backgroundColor: Colors.green, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  primaryBtnDisabled: { opacity: 0.4 },
  primaryBtnText: { fontFamily: Fonts.sansSemiBold, fontSize: 16, color: Colors.cream },
});
