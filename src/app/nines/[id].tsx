import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Fonts, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { getRoundWithPlayers, getScores, getTempScores, upsertScore, upsertTempScore } from '@/lib/db';
import { EditPlayersSheet } from '@/components/EditPlayersSheet';

// ─── Types ────────────────────────────────────────────────────────────────────

type Player = { id: string; name: string; initials: string; color: string; isTempPlayer: boolean };
type Transaction = { fromId: string; toId: string; amount: number };

type HoleEntry = {
  scores: Record<string, number | null>;
  points: Record<string, number> | null;
};

const CIRCLE_SIZE = 34;
const CIRCLE_GAP  = 6;
const CIRCLE_STEP = CIRCLE_SIZE + CIRCLE_GAP;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n % 1 === 0 ? `$${n}` : `$${n.toFixed(2)}`;
}

// Distributes 9 points per hole among 3 players.
// Also supports 4 players with a 4-3-2-0 distribution.
function calcNinesPoints(
  scores: Record<string, number | null>,
  players: Player[],
): Record<string, number> | null {
  if (players.some((p) => scores[p.id] == null)) return null;
  const sorted = players.slice().sort((a, b) => scores[a.id]! - scores[b.id]!);

  if (players.length === 3) {
    const [s0, s1, s2] = [scores[sorted[0].id]!, scores[sorted[1].id]!, scores[sorted[2].id]!];
    // Three-way tie
    if (s0 === s1 && s1 === s2) return Object.fromEntries(players.map((p) => [p.id, 3]));
    // Tie for 1st
    if (s0 === s1) {
      return Object.fromEntries(sorted.map((p, i) => [p.id, i < 2 ? 4 : 1]));
    }
    // Tie for 2nd
    if (s1 === s2) {
      return Object.fromEntries(sorted.map((p, i) => [p.id, i === 0 ? 5 : 2]));
    }
    // Clean sweep
    return Object.fromEntries(sorted.map((p, i) => [p.id, [5, 3, 1][i]]));
  }

  if (players.length === 4) {
    const [s0, s1, s2, s3] = sorted.map((p) => scores[p.id]!);
    // All tied
    if (s0 === s3) return Object.fromEntries(players.map((p) => [p.id, 2])); // 8 pts ÷ 4 ... round to 2 each
    // Distribute 4-3-2-0 adjusting for ties
    const pts: Record<string, number> = {};
    let i = 0;
    while (i < 4) {
      const val = scores[sorted[i].id]!;
      const tieGroup = sorted.filter((p) => scores[p.id] === val);
      const pool = [4, 3, 2, 0].slice(i, i + tieGroup.length).reduce((a, b) => a + b, 0);
      const share = Math.round((pool / tieGroup.length) * 10) / 10;
      tieGroup.forEach((p) => { pts[p.id] = share; });
      i += tieGroup.length;
    }
    return pts;
  }

  return null;
}

function minimumTransactions(nets: Record<string, number>, players: Player[]): Transaction[] {
  const debtors   = players.map((p) => ({ id: p.id, bal: Math.round(nets[p.id] * 100) / 100 })).filter((x) => x.bal < -0.005).sort((a, b) => a.bal - b.bal);
  const creditors = players.map((p) => ({ id: p.id, bal: Math.round(nets[p.id] * 100) / 100 })).filter((x) => x.bal > 0.005).sort((a, b) => b.bal - a.bal);
  const txns: Transaction[] = [];
  let d = 0, c = 0;
  while (d < debtors.length && c < creditors.length) {
    const amount = Math.min(Math.abs(debtors[d].bal), creditors[c].bal);
    if (amount > 0.005) txns.push({ fromId: debtors[d].id, toId: creditors[c].id, amount: Math.round(amount * 100) / 100 });
    debtors[d].bal += amount; creditors[c].bal -= amount;
    if (Math.abs(debtors[d].bal) < 0.005) d++;
    if (creditors[c].bal < 0.005) c++;
  }
  return txns;
}

function ptsColor(pts: number, max: number): string {
  if (pts === max) return Colors.green;
  if (pts === 1 || pts === 0) return '#b04030';
  return Colors.text;
}

// ─── Pip ──────────────────────────────────────────────────────────────────────

function Pip({ player }: { player: Player }) {
  return (
    <View style={[g.pip, { backgroundColor: player.color }]}>
      <Text style={g.pipText}>{player.initials}</Text>
    </View>
  );
}

// ─── Setup phase ──────────────────────────────────────────────────────────────

function SetupPhase({
  players, dollarPerPt, setDollarPerPt, totalHoles, setTotalHoles,
  onStart, onBack, onEditPlayers,
}: {
  players: Player[];
  dollarPerPt: number; setDollarPerPt: (v: number) => void;
  totalHoles: number; setTotalHoles: (v: number) => void;
  onStart: () => void; onBack: () => void; onEditPlayers: () => void;
}) {
  const insets = useSafeAreaInsets();
  const PRESET_AMOUNTS = [0.5, 1, 2, 5] as const;
  type AmtMode = 0.5 | 1 | 2 | 5 | 'custom';
  const initAmt: AmtMode = ([0.5, 1, 2, 5] as number[]).includes(dollarPerPt) ? (dollarPerPt as any) : 'custom';
  const [amtMode, setAmtMode] = useState<AmtMode>(initAmt);
  const [customAmt, setCustomAmt] = useState(initAmt === 'custom' ? String(dollarPerPt) : '');
  const [holeMode, setHoleMode] = useState<'9' | '18' | 'custom'>(totalHoles === 9 ? '9' : totalHoles === 18 ? '18' : 'custom');
  const [customHoles, setCustomHoles] = useState(holeMode === 'custom' ? String(totalHoles) : '');

  const tooFew = players.length < 3;
  const tooMany = players.length > 4;
  const canStart = !tooFew && !tooMany;

  return (
    <View style={g.root}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.green }}>
        <View style={g.topBar}>
          <TouchableOpacity onPress={onBack} activeOpacity={0.7} style={g.topBarBackHit}>
            <Text style={g.topBarBack}>← Back</Text>
          </TouchableOpacity>
          <Text style={g.topBarTitle}>9-Point</Text>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={[g.setupContent, { paddingBottom: insets.bottom + 32 }]}>
        <Text style={g.setupHeading}>Set up the game</Text>

        {(tooFew || tooMany) && (
          <View style={g.warningCard}>
            <Text style={g.warningText}>
              {tooFew ? '9-Point requires at least 3 players.' : '9-Point supports 3 or 4 players.'}
            </Text>
          </View>
        )}

        <View style={g.fieldCard}>
          <Text style={g.fieldLabel}>Value per point</Text>
          <View style={g.segRow}>
            {PRESET_AMOUNTS.map((amt) => (
              <TouchableOpacity key={amt} style={[g.seg, amtMode === amt && g.segActive]}
                onPress={() => { setAmtMode(amt); setDollarPerPt(amt); }} activeOpacity={0.8}>
                <Text style={[g.segText, amtMode === amt && g.segTextActive]}>${amt}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[g.seg, amtMode === 'custom' && g.segActive]}
              onPress={() => setAmtMode('custom')} activeOpacity={0.8}>
              <Text style={[g.segText, amtMode === 'custom' && g.segTextActive]}>
                {amtMode === 'custom' && dollarPerPt > 0 ? fmt(dollarPerPt) : 'Custom'}
              </Text>
            </TouchableOpacity>
          </View>
          {amtMode === 'custom' && (
            <TextInput style={g.customInput} value={customAmt} onChangeText={(t) => { setCustomAmt(t); const n = parseFloat(t); if (!isNaN(n) && n > 0) setDollarPerPt(n); }}
              keyboardType="decimal-pad" placeholder="e.g., 0.25" placeholderTextColor={Colors.muted} maxLength={8} autoFocus />
          )}
        </View>

        <View style={g.fieldCard}>
          <Text style={g.fieldLabel}>Holes</Text>
          <View style={g.segRow}>
            {(['9', '18', 'custom'] as const).map((m) => (
              <TouchableOpacity key={m} style={[g.seg, holeMode === m && g.segActive]}
                onPress={() => { setHoleMode(m); if (m === '9') setTotalHoles(9); if (m === '18') setTotalHoles(18); }} activeOpacity={0.8}>
                <Text style={[g.segText, holeMode === m && g.segTextActive]}>{m === 'custom' ? 'Custom' : m}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {holeMode === 'custom' && (
            <TextInput style={g.customInput} value={customHoles} onChangeText={(t) => { setCustomHoles(t); const n = parseInt(t, 10); if (!isNaN(n) && n > 0) setTotalHoles(n); }}
              keyboardType="number-pad" placeholder="# of holes" placeholderTextColor={Colors.muted} maxLength={3} autoFocus />
          )}
        </View>

        <View style={g.fieldCard}>
          <View style={g.cardLabelRow}>
            <Text style={g.fieldLabel}>Players</Text>
            <TouchableOpacity onPress={onEditPlayers} activeOpacity={0.7}>
              <Text style={g.editLink}>Edit</Text>
            </TouchableOpacity>
          </View>
          <View style={g.playerList}>
            {players.map((p) => (
              <View key={p.id} style={g.playerRow}>
                <Pip player={p} />
                <Text style={g.playerName}>{p.name}</Text>
                {p.isTempPlayer && <Text style={g.guestBadge}>Guest</Text>}
              </View>
            ))}
          </View>
        </View>

        <View style={g.setupNote}>
          <Text style={g.setupNoteText}>
            9 pts per hole · {fmt(dollarPerPt)}/pt · {totalHoles} holes · {players.length} players
          </Text>
        </View>

        <TouchableOpacity style={[g.primaryBtn, !canStart && g.primaryBtnDisabled]} onPress={canStart ? onStart : undefined} activeOpacity={0.85}>
          <Text style={g.primaryBtnText}>Start</Text>
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

function PlayingPhase({
  holes, players, myId, trackOthers, onToggleTrackOthers,
  currentHole, viewingHole, dollarPerPt, totalHoles, runningPts,
  onScoreChange, onLockHole, onNavigate, onEndRound,
}: {
  holes: HoleEntry[]; players: Player[]; myId: string | null;
  trackOthers: boolean; onToggleTrackOthers: () => void;
  currentHole: number; viewingHole: number;
  dollarPerPt: number; totalHoles: number;
  runningPts: Record<string, number>;
  onScoreChange: (holeIdx: number, pid: string, score: number | null) => void;
  onLockHole: (holeIdx: number) => void;
  onNavigate: (holeIdx: number) => void;
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

  const viewedHole = holes[viewingHole];
  const isViewingCurrent = viewingHole === currentHole;
  const allEntered = viewedHole && players.every((p) => viewedHole.scores[p.id] != null);
  const pts = viewedHole ? calcNinesPoints(viewedHole.scores, players) : null;
  const maxPts = players.length === 3 ? 5 : 4;
  const hasOthers = players.some((p) => p.id !== myId);

  function circleState(i: number): CircleState {
    if (i < currentHole) return 'done';
    if (i === currentHole) return 'active';
    return 'future';
  }

  return (
    <View style={g.root}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.green }}>
        <View style={g.topBar}>
          <Text style={g.topBarSub}>Hole {viewingHole + 1} of {totalHoles}</Text>
          <Text style={g.topBarTitle}>9-Point</Text>
          <TouchableOpacity onPress={onEndRound} activeOpacity={0.7} style={g.topBarEndHit}>
            <Text style={g.topBarEnd}>End</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[g.playContent, { paddingBottom: insets.bottom + 72 }]}>
        <View style={g.stripWrap}>
          <ScrollView ref={stripRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={g.stripContent}>
            {Array.from({ length: totalHoles }, (_, i) => (
              <HoleCircle key={i} holeNum={i + 1} state={circleState(i)} isViewing={i === viewingHole} onPress={() => onNavigate(i)} />
            ))}
          </ScrollView>
        </View>

        {/* Score entry card */}
        <View style={g.holeCard}>
          <View style={g.holeCardHeader}>
            <Text style={g.holeCardTitle}>Hole {viewingHole + 1}</Text>
            {viewedHole?.points && <Text style={g.holeCardSub}>Points awarded</Text>}
          </View>

          {players.map((p) => {
            const score = viewedHole?.scores[p.id] ?? null;
            const holePts = viewedHole?.points?.[p.id] ?? pts?.[p.id];
            const canEdit = myId === null || p.id === myId || trackOthers;
            const isLocked = !!viewedHole?.points;
            return (
              <View key={p.id} style={g.scoreRow}>
                <Pip player={p} />
                <Text style={g.scorePlayerName}>{p.name}</Text>
                {holePts != null && (
                  <Text style={[g.holePts, { color: ptsColor(holePts, maxPts) }]}>{holePts} pt{holePts !== 1 ? 's' : ''}</Text>
                )}
                {!isLocked && canEdit ? (
                  <View style={g.stepper}>
                    <TouchableOpacity style={g.stepBtn} activeOpacity={0.7}
                      onPress={() => { if (score == null) return; onScoreChange(viewingHole, p.id, score <= 1 ? null : score - 1); }}>
                      <Text style={g.stepBtnText}>−</Text>
                    </TouchableOpacity>
                    <Text style={[g.stepValue, score == null && g.stepValueDim]}>{score ?? '—'}</Text>
                    <TouchableOpacity style={g.stepBtn} activeOpacity={0.7}
                      onPress={() => onScoreChange(viewingHole, p.id, (score ?? 0) + 1)}>
                      <Text style={g.stepBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text style={[g.stepValue, score == null && g.stepValueDim]}>{score ?? '—'}</Text>
                )}
              </View>
            );
          })}

          {hasOthers && !viewedHole?.points && (
            <TouchableOpacity onPress={onToggleTrackOthers} activeOpacity={0.7} style={g.trackToggle}>
              <Text style={g.trackToggleText}>{trackOthers ? 'Done tracking others ▾' : 'Track for others ▴'}</Text>
            </TouchableOpacity>
          )}

          {isViewingCurrent && allEntered && !viewedHole?.points && pts && (
            <View style={g.resolveBox}>
              <Text style={g.resolveLabel}>
                {players.slice().sort((a, b) => (pts[b.id] ?? 0) - (pts[a.id] ?? 0))[0].name} leads with {Math.max(...players.map(p => pts[p.id] ?? 0))} pts
              </Text>
              <TouchableOpacity style={g.resolveBtn} onPress={() => onLockHole(viewingHole)} activeOpacity={0.8}>
                <Text style={g.resolveBtnText}>Lock Hole →</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Running leaderboard */}
        <View style={g.scoreboardCard}>
          <Text style={g.scoreboardTitle}>Running total</Text>
          {players.slice().sort((a, b) => runningPts[b.id] - runningPts[a.id]).map((p) => {
            const val = runningPts[p.id] * dollarPerPt;
            const avg = (currentHole > 0 ? (runningPts[p.id] / currentHole) * 3 : 0);
            return (
              <View key={p.id} style={g.scoreboardRow}>
                <Pip player={p} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={g.scoreboardName}>{p.name}</Text>
                  <Text style={g.scoreboardSub}>{runningPts[p.id]} pts</Text>
                </View>
                <Text style={g.scoreboardValue}>{fmt(val)}</Text>
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

        <Text style={g.navCenter}>{viewingHole + 1} / {totalHoles}</Text>

        <TouchableOpacity
          style={[g.navBtn, isViewingCurrent && currentHole === totalHoles - 1 && g.navBtnFinish]}
          activeOpacity={0.7}
          onPress={() => {
            if (isViewingCurrent && !holes[viewingHole]?.points) {
              onLockHole(viewingHole);
            } else if (viewingHole < totalHoles - 1) {
              onNavigate(viewingHole + 1);
            } else {
              onEndRound();
            }
          }}>
          <Text style={[g.navBtnText, isViewingCurrent && currentHole === totalHoles - 1 && g.navBtnTextFinish]}>
            {isViewingCurrent && currentHole === totalHoles - 1 ? 'Finish 🏁' : 'Next →'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Settlement phase ─────────────────────────────────────────────────────────

function SettlementPhase({
  players, dollarPerPt, runningPts, onDone,
}: {
  players: Player[]; dollarPerPt: number; runningPts: Record<string, number>; onDone: () => void;
}) {
  const insets = useSafeAreaInsets();
  const totalPts = Object.values(runningPts).reduce((a, b) => a + b, 0);
  const avgPts = totalPts / players.length;
  const nets = Object.fromEntries(players.map((p) => [p.id, (runningPts[p.id] - avgPts) * dollarPerPt]));
  const transactions = minimumTransactions(nets, players);
  const sorted = players.slice().sort((a, b) => runningPts[b.id] - runningPts[a.id]);

  return (
    <View style={g.root}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.green }}>
        <View style={g.topBar}><Text style={g.topBarTitle}>Final Results</Text></View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={[g.settleContent, { paddingBottom: insets.bottom + 32 }]}>
        <Text style={g.settleSubhead}>{totalPts} total pts · {fmt(dollarPerPt)}/pt</Text>

        <View style={g.fieldCard}>
          {sorted.map((p, i) => {
            const net = nets[p.id];
            return (
              <View key={p.id} style={[g.settleRow, i < sorted.length - 1 && g.settleRowBorder]}>
                <Text style={g.settleRank}>{i + 1}</Text>
                <Pip player={p} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={g.settleName}>{p.name}</Text>
                  <Text style={g.settleSkinsLine}>{runningPts[p.id]} pts</Text>
                </View>
                <Text style={[g.settleNet, net > 0 ? g.settleNetPos : net < 0 ? g.settleNetNeg : g.settleNetZero]}>
                  {net > 0 ? '+' : ''}{fmt(net)}
                </Text>
              </View>
            );
          })}
        </View>

        <Text style={g.sectionHead}>Settle up</Text>
        <View style={g.fieldCard}>
          {transactions.length === 0 ? (
            <Text style={g.noTxnText}>All even — nothing to settle.</Text>
          ) : transactions.map((t, i) => {
            const from = players.find((p) => p.id === t.fromId)!;
            const to   = players.find((p) => p.id === t.toId)!;
            return (
              <View key={i} style={[g.txnRow, i < transactions.length - 1 && g.txnRowBorder]}>
                <Text style={g.txnText}>
                  <Text style={g.txnName}>{from.name}</Text>{' owes '}
                  <Text style={g.txnName}>{to.name}</Text>{'  '}
                  <Text style={g.txnAmount}>{fmt(t.amount)}</Text>
                </Text>
              </View>
            );
          })}
        </View>

        <TouchableOpacity style={g.primaryBtn} onPress={onDone} activeOpacity={0.85}>
          <Text style={g.primaryBtnText}>Done</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function NinesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id ?? (__DEV__ ? '46bae3d3-2c18-450e-b267-f36b91a94a31' : null);

  const [players, setPlayers]         = useState<Player[]>([]);
  const [myId, setMyId]               = useState<string | null>(null);
  const [trackOthers, setTrackOthers] = useState(false);
  const [loading, setLoading]         = useState(true);
  const [phase, setPhase]             = useState<'setup' | 'playing' | 'settled'>('setup');
  const [dollarPerPt, setDollarPerPt] = useState(1);
  const [totalHoles, setTotalHoles]   = useState(18);
  const [holes, setHoles]             = useState<HoleEntry[]>([]);
  const [currentHole, setCurrentHole] = useState(0);
  const [viewingHole, setViewingHole] = useState(0);
  const [hostId, setHostId]           = useState('');
  const [showEditSheet, setShowEditSheet] = useState(false);

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
    getRoundWithPlayers(id).then((round) => {
      if (round) {
        const mapped = buildPlayerList(round.players as any[]);
        setPlayers(mapped);
        setMyId(mapped.find((p) => p.id === userId)?.id ?? mapped[0]?.id ?? null);
        setHostId(round.host_id);
      }
      setLoading(false);
    });
  }, [id]);

  async function reloadPlayers() {
    if (!id) return;
    const round = await getRoundWithPlayers(id);
    if (round) {
      const mapped = buildPlayerList(round.players as any[]);
      setPlayers(mapped);
      setMyId(mapped.find((p) => p.id === userId)?.id ?? mapped[0]?.id ?? null);
    }
  }

  const runningPts = useMemo(() => {
    const totals: Record<string, number> = Object.fromEntries(players.map((p) => [p.id, 0]));
    for (const h of holes) {
      if (h.points) for (const [id, pts] of Object.entries(h.points)) totals[id] = (totals[id] ?? 0) + pts;
    }
    return totals;
  }, [holes, players]);

  async function startGame() {
    const [dbScores, dbTempScores] = await Promise.all([
      id ? getScores(id) : Promise.resolve([]),
      id ? getTempScores(id) : Promise.resolve([]),
    ]);
    const h: HoleEntry[] = Array.from({ length: totalHoles }, (_, i) => {
      const holeNum = i + 1;
      const scores: Record<string, number | null> = Object.fromEntries(players.map((p) => [p.id, null]));
      for (const p of players) {
        const s = p.isTempPlayer
          ? dbTempScores.find((ts) => ts.temp_player_id === p.id && ts.hole_number === holeNum)
          : dbScores.find((ds) => ds.player_id === p.id && ds.hole_number === holeNum);
        if (s) scores[p.id] = s.strokes;
      }
      const points = calcNinesPoints(scores, players);
      return { scores, points };
    });
    const firstUnlocked = h.findIndex((hole) => !hole.points);
    const startIdx = firstUnlocked === -1 ? totalHoles - 1 : firstUnlocked;
    setHoles(h);
    setCurrentHole(startIdx);
    setViewingHole(startIdx);
    setPhase('playing');
  }

  function handleScoreChange(holeIdx: number, pid: string, score: number | null) {
    setHoles((prev) => {
      const next = [...prev];
      next[holeIdx] = { ...next[holeIdx], scores: { ...next[holeIdx].scores, [pid]: score } };
      return next;
    });
    const isTemp = players.find((p) => p.id === pid)?.isTempPlayer ?? false;
    if (isTemp) upsertTempScore(id, pid, holeIdx + 1, score);
    else upsertScore(id, pid, holeIdx + 1, score, userId ?? undefined);
  }

  function handleLockHole(holeIdx: number) {
    setHoles((prev) => {
      const next = [...prev];
      const pts = calcNinesPoints(next[holeIdx].scores, players);
      next[holeIdx] = { ...next[holeIdx], points: pts };
      return next;
    });
    if (holeIdx + 1 < totalHoles) {
      setCurrentHole(holeIdx + 1);
      setViewingHole(holeIdx + 1);
    } else {
      setPhase('settled');
    }
  }

  if (loading) {
    return <View style={[g.root, { alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator color={Colors.cream} /></View>;
  }

  if (phase === 'setup') {
    return (
      <>
        <SetupPhase
          players={players} dollarPerPt={dollarPerPt} setDollarPerPt={setDollarPerPt}
          totalHoles={totalHoles} setTotalHoles={setTotalHoles}
          onStart={startGame}
          onBack={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}
          onEditPlayers={() => setShowEditSheet(true)}
        />
        <EditPlayersSheet roundId={id ?? ''} hostId={hostId} visible={showEditSheet}
          currentUserId={userId} onClose={() => setShowEditSheet(false)} onDone={reloadPlayers} />
      </>
    );
  }

  if (phase === 'playing') {
    return (
      <PlayingPhase
        holes={holes} players={players} myId={myId}
        trackOthers={trackOthers} onToggleTrackOthers={() => setTrackOthers((v) => !v)}
        currentHole={currentHole} viewingHole={viewingHole}
        dollarPerPt={dollarPerPt} totalHoles={totalHoles} runningPts={runningPts}
        onScoreChange={handleScoreChange} onLockHole={handleLockHole}
        onNavigate={(i) => setViewingHole(Math.min(i, currentHole))}
        onEndRound={() => setPhase('settled')}
      />
    );
  }

  return (
    <SettlementPhase
      players={players} dollarPerPt={dollarPerPt} runningPts={runningPts}
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

  setupContent: { backgroundColor: Colors.bg, padding: Spacing.lg },
  playContent: { backgroundColor: Colors.bg, gap: 12 },
  settleContent: { backgroundColor: Colors.bg, padding: Spacing.lg, gap: 12 },

  setupHeading: { fontFamily: Fonts.serifMedium, fontSize: 24, color: Colors.text, marginBottom: 20, marginTop: 4 },
  setupNote: { paddingVertical: 10, alignItems: 'center' },
  setupNoteText: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.muted },

  warningCard: { backgroundColor: '#fff3cd', borderRadius: 10, padding: 12, marginBottom: 12 },
  warningText: { fontFamily: Fonts.sans, fontSize: 13, color: '#856404' },

  fieldCard: { backgroundColor: Colors.card, borderRadius: 14, borderWidth: 0.5, borderColor: Colors.border, padding: 16, gap: 12, marginBottom: 12 },
  fieldLabel: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.muted },
  cardLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  editLink: { fontFamily: Fonts.sansMedium, fontSize: 13, color: Colors.green },
  playerList: { gap: 10 },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  playerName: { fontFamily: Fonts.sans, fontSize: 14, color: Colors.text, flex: 1 },
  guestBadge: { fontFamily: Fonts.sans, fontSize: 11, color: Colors.muted },

  segRow: { flexDirection: 'row', gap: 8 },
  seg: { flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.creamLight, alignItems: 'center' },
  segActive: { backgroundColor: Colors.green },
  segText: { fontFamily: Fonts.sansMedium, fontSize: 13, color: Colors.text },
  segTextActive: { color: Colors.cream },
  customInput: { fontFamily: Fonts.sansSemiBold, fontSize: 20, color: Colors.text, backgroundColor: Colors.creamLight, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, textAlign: 'center' },

  pip: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  pipText: { fontFamily: Fonts.sansSemiBold, fontSize: 11, color: '#fff' },

  holeCard: { backgroundColor: Colors.card, borderRadius: 14, borderWidth: 0.5, borderColor: Colors.border, overflow: 'hidden', marginHorizontal: 16 },
  holeCardHeader: { backgroundColor: Colors.creamLight, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  holeCardTitle: { fontFamily: Fonts.serifMedium, fontSize: 18, color: Colors.text },
  holeCardSub: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.muted },

  scoreRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 0.5, borderTopColor: Colors.border, gap: 10 },
  scorePlayerName: { flex: 1, fontFamily: Fonts.sans, fontSize: 14, color: Colors.text },
  holePts: { fontFamily: Fonts.sansSemiBold, fontSize: 14, minWidth: 50, textAlign: 'right' },

  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.creamLight, alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { fontFamily: Fonts.sansSemiBold, fontSize: 16, color: Colors.green, lineHeight: 19 },
  stepValue: { fontFamily: Fonts.sansSemiBold, fontSize: 16, color: Colors.text, minWidth: 32, textAlign: 'center' },
  stepValueDim: { color: Colors.muted },

  trackToggle: { paddingVertical: 11, alignItems: 'center', borderTopWidth: 0.5, borderTopColor: Colors.border },
  trackToggleText: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.muted },

  resolveBox: { borderTopWidth: 0.5, borderTopColor: Colors.border, padding: 14, gap: 8, backgroundColor: '#f8f6ef' },
  resolveLabel: { fontFamily: Fonts.sansMedium, fontSize: 13, color: Colors.text },
  resolveBtn: { backgroundColor: Colors.green, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  resolveBtnText: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: Colors.cream },

  scoreboardCard: { backgroundColor: Colors.card, borderRadius: 14, borderWidth: 0.5, borderColor: Colors.border, padding: 14, gap: 10, marginHorizontal: 16 },
  scoreboardTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 11, color: Colors.muted, textTransform: 'uppercase', letterSpacing: 1 },
  scoreboardRow: { flexDirection: 'row', alignItems: 'center' },
  scoreboardName: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.text },
  scoreboardSub: { fontFamily: Fonts.sans, fontSize: 11, color: Colors.muted },
  scoreboardValue: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: Colors.text },

  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: Colors.bg, borderTopWidth: 0.5, borderTopColor: Colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12 },
  navBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 10, backgroundColor: Colors.creamLight, minWidth: 90, alignItems: 'center' },
  navBtnDisabled: { opacity: 0.35 },
  navBtnFinish: { backgroundColor: Colors.green },
  navBtnText: { fontFamily: Fonts.sansMedium, fontSize: 14, color: Colors.text },
  navBtnTextDisabled: { color: Colors.muted },
  navBtnTextFinish: { color: Colors.cream },
  navCenter: { fontFamily: Fonts.sansMedium, fontSize: 13, color: Colors.muted },

  settleSubhead: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.muted, marginBottom: 4 },
  sectionHead: { fontFamily: Fonts.sansSemiBold, fontSize: 11, color: Colors.muted, textTransform: 'uppercase', letterSpacing: 1, marginTop: 8 },
  settleRank: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: Colors.muted, width: 20, textAlign: 'center' },
  settleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  settleRowBorder: { borderBottomWidth: 0.5, borderBottomColor: Colors.border, paddingBottom: 12, marginBottom: 4 },
  settleName: { fontFamily: Fonts.sansMedium, fontSize: 14, color: Colors.text },
  settleSkinsLine: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.muted },
  settleNet: { fontFamily: Fonts.sansSemiBold, fontSize: 15 },
  settleNetPos: { color: '#2a7a2a' },
  settleNetNeg: { color: '#b04030' },
  settleNetZero: { color: Colors.muted },
  txnRow: { paddingVertical: 10 },
  txnRowBorder: { borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  txnText: { fontFamily: Fonts.sans, fontSize: 14, color: Colors.text, lineHeight: 20 },
  txnName: { fontFamily: Fonts.sansSemiBold },
  txnAmount: { fontFamily: Fonts.sansSemiBold, color: Colors.green },
  noTxnText: { fontFamily: Fonts.sans, fontSize: 14, color: Colors.muted, textAlign: 'center', paddingVertical: 4 },

  primaryBtn: { backgroundColor: Colors.green, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  primaryBtnDisabled: { opacity: 0.4 },
  primaryBtnText: { fontFamily: Fonts.sansSemiBold, fontSize: 16, color: Colors.cream },
});
