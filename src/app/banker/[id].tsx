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
  getRoundWithPlayers, getScores, getTempScores, upsertScore, upsertTempScore,
  getBankerHoles, upsertBankerHole, getBankerResults, upsertBankerResult,
} from '@/lib/db';
import { EditPlayersSheet } from '@/components/EditPlayersSheet';

// ─── Types ────────────────────────────────────────────────────────────────────

type Player = { id: string; name: string; initials: string; color: string; isTempPlayer: boolean };
type Result = 'win' | 'loss' | 'halve' | null;

type BankerHoleLocal = {
  bankerPlayerId: string;
  scores: Record<string, number | null>;
  results: Record<string, Result>;  // non-banker player id → result (from banker's perspective)
  locked: boolean;
};

type Transaction = { fromId: string; toId: string; amount: number };

const CIRCLE_SIZE = 34;
const CIRCLE_GAP  = 6;
const CIRCLE_STEP = CIRCLE_SIZE + CIRCLE_GAP;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n % 1 === 0 ? `$${n}` : `$${n.toFixed(2)}`;
}

// Returns the banker player for a given hole (0-indexed).
function bankerForHole(holeIdx: number, players: Player[]): Player {
  return players[holeIdx % players.length];
}

// Auto-compute results from scores (banker vs each other player).
function autoResults(bankerScore: number | null, others: Player[], scores: Record<string, number | null>): Record<string, Result> {
  if (bankerScore == null) return Object.fromEntries(others.map((p) => [p.id, null]));
  return Object.fromEntries(
    others.map((p) => {
      const s = scores[p.id];
      if (s == null) return [p.id, null];
      return [p.id, s < bankerScore ? 'win' : s > bankerScore ? 'loss' : 'halve'];
    })
  );
}

// Running balance for each player. Positive = they're owed money.
function calcRunning(holes: (BankerHoleLocal | null)[], players: Player[], stakePerHole: number, sweepMult: number): Record<string, number> {
  const bal: Record<string, number> = Object.fromEntries(players.map((p) => [p.id, 0]));
  for (const hole of holes) {
    if (!hole || !hole.locked) continue;
    const banker = players.find((p) => p.id === hole.bankerPlayerId)!;
    if (!banker) continue;
    const others = players.filter((p) => p.id !== banker.id);
    const wins  = others.filter((p) => hole.results[p.id] === 'win').length;
    const losses = others.filter((p) => hole.results[p.id] === 'loss').length;
    const isSweep = wins === others.length || losses === others.length;
    const mult = isSweep ? sweepMult : 1;

    for (const other of others) {
      const r = hole.results[other.id];
      if (r === 'win') {
        // Other player beats banker
        bal[other.id]  += stakePerHole * mult;
        bal[banker.id] -= stakePerHole * mult;
      } else if (r === 'loss') {
        // Banker beats other player
        bal[banker.id] += stakePerHole * mult;
        bal[other.id]  -= stakePerHole * mult;
      }
    }
  }
  return bal;
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

// ─── Pip ──────────────────────────────────────────────────────────────────────

function Pip({ player, size = 32 }: { player: Player; size?: number }) {
  return (
    <View style={[g.pip, { backgroundColor: player.color, width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[g.pipText, size > 32 && { fontSize: 14 }]}>{player.initials}</Text>
    </View>
  );
}

// ─── Setup phase ──────────────────────────────────────────────────────────────

function SetupPhase({
  players, stake, setStake, totalHoles, setTotalHoles, sweepMult, setSweepMult,
  playerOrder, setPlayerOrder, onStart, onBack, onEditPlayers,
}: {
  players: Player[];
  stake: number; setStake: (v: number) => void;
  totalHoles: number; setTotalHoles: (v: number) => void;
  sweepMult: number; setSweepMult: (v: number) => void;
  playerOrder: Player[]; setPlayerOrder: (o: Player[]) => void;
  onStart: () => void; onBack: () => void; onEditPlayers: () => void;
}) {
  const insets = useSafeAreaInsets();
  const PRESETS = [1, 2, 5, 10] as const;
  type PresetMode = 1 | 2 | 5 | 10 | 'custom';
  const initMode: PresetMode = ([1, 2, 5, 10] as number[]).includes(stake) ? (stake as any) : 'custom';
  const [mode, setMode] = useState<PresetMode>(initMode);
  const [holeMode, setHoleMode] = useState<'9' | '18'>(totalHoles === 9 ? '9' : '18');

  function moveUp(i: number) {
    if (i === 0) return;
    const o = [...playerOrder];
    [o[i - 1], o[i]] = [o[i], o[i - 1]];
    setPlayerOrder(o);
  }
  function moveDown(i: number) {
    if (i === playerOrder.length - 1) return;
    const o = [...playerOrder];
    [o[i], o[i + 1]] = [o[i + 1], o[i]];
    setPlayerOrder(o);
  }

  return (
    <View style={g.root}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.green }}>
        <View style={g.topBar}>
          <TouchableOpacity onPress={onBack} activeOpacity={0.7} style={g.topBarBackHit}>
            <Text style={g.topBarBack}>← Back</Text>
          </TouchableOpacity>
          <Text style={g.topBarTitle}>Banker 👑</Text>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={[g.setupContent, { paddingBottom: insets.bottom + 32 }]}>
        <Text style={g.setupHeading}>Set up Banker</Text>

        <View style={g.fieldCard}>
          <Text style={g.fieldLabel}>Stake per hole</Text>
          <Text style={g.fieldHint}>Each 1v1 match between banker and player is worth this amount.</Text>
          <View style={g.segRow}>
            {PRESETS.map((amt) => (
              <TouchableOpacity key={amt} style={[g.seg, mode === amt && g.segActive]}
                onPress={() => { setMode(amt); setStake(amt); }} activeOpacity={0.8}>
                <Text style={[g.segText, mode === amt && g.segTextActive]}>${amt}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={g.fieldCard}>
          <Text style={g.fieldLabel}>Sweep multiplier</Text>
          <Text style={g.fieldHint}>When the banker beats or loses to all players on one hole, multiply the stake.</Text>
          <View style={g.segRow}>
            {([1, 2, 3] as const).map((m) => (
              <TouchableOpacity key={m} style={[g.seg, sweepMult === m && g.segActive]}
                onPress={() => setSweepMult(m)} activeOpacity={0.8}>
                <Text style={[g.segText, sweepMult === m && g.segTextActive]}>{m === 1 ? 'Off' : `${m}×`}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={g.fieldCard}>
          <Text style={g.fieldLabel}>Holes</Text>
          <View style={g.segRow}>
            <TouchableOpacity style={[g.seg, holeMode === '9' && g.segActive]}
              onPress={() => { setHoleMode('9'); setTotalHoles(9); }} activeOpacity={0.8}>
              <Text style={[g.segText, holeMode === '9' && g.segTextActive]}>9</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[g.seg, holeMode === '18' && g.segActive]}
              onPress={() => { setHoleMode('18'); setTotalHoles(18); }} activeOpacity={0.8}>
              <Text style={[g.segText, holeMode === '18' && g.segTextActive]}>18</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={g.fieldCard}>
          <View style={g.cardLabelRow}>
            <Text style={g.fieldLabel}>Banker rotation order</Text>
            <TouchableOpacity onPress={onEditPlayers} activeOpacity={0.7}><Text style={g.editLink}>Edit players</Text></TouchableOpacity>
          </View>
          <Text style={g.fieldHint}>Banker rotates down this list each hole.</Text>
          {playerOrder.map((p, i) => (
            <View key={p.id} style={g.orderRow}>
              <Text style={g.orderNum}>{i + 1}</Text>
              <Pip player={p} />
              <Text style={g.playerName}>{p.name}</Text>
              <View style={g.orderBtns}>
                <TouchableOpacity style={[g.orderBtn, i === 0 && g.orderBtnDisabled]} onPress={() => moveUp(i)} activeOpacity={0.7}>
                  <Text style={g.orderBtnText}>↑</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[g.orderBtn, i === playerOrder.length - 1 && g.orderBtnDisabled]} onPress={() => moveDown(i)} activeOpacity={0.7}>
                  <Text style={g.orderBtnText}>↓</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>

        <TouchableOpacity style={g.primaryBtn} onPress={onStart} activeOpacity={0.85}>
          <Text style={g.primaryBtnText}>Start Banker</Text>
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

function ResultPill({ result, onPress }: { result: Result; onPress: () => void }) {
  const bg = result === 'win' ? '#e8f4e8' : result === 'loss' ? '#fde8e8' : result === 'halve' ? Colors.creamLight : Colors.border;
  const label = result === 'win' ? '✓ Win' : result === 'loss' ? '✗ Loss' : result === 'halve' ? '= Halve' : 'Tap';
  const color = result === 'win' ? '#2a7a2a' : result === 'loss' ? '#b04030' : Colors.text;
  return (
    <TouchableOpacity style={[g.resultPill, { backgroundColor: bg }]} onPress={onPress} activeOpacity={0.7}>
      <Text style={[g.resultPillText, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function PlayingPhase({
  bankerHoles, players, playerOrder, stake, sweepMult, totalHoles,
  currentHole, viewingHole, running,
  onScoreChange, onManualResult, onLockHole, onNavigate, onEndRound,
}: {
  bankerHoles: (BankerHoleLocal | null)[];
  players: Player[]; playerOrder: Player[];
  stake: number; sweepMult: number; totalHoles: number;
  currentHole: number; viewingHole: number;
  running: Record<string, number>;
  onScoreChange: (holeIdx: number, pid: string, v: number | null) => void;
  onManualResult: (holeIdx: number, pid: string, r: Result) => void;
  onLockHole: (holeIdx: number) => void;
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
  const banker = bankerForHole(viewingHole, playerOrder);
  const hole = bankerHoles[viewingHole];
  const others = playerOrder.filter((p) => p.id !== banker.id);
  const bankerScore = hole?.scores[banker.id] ?? null;
  const autoRes = hole ? autoResults(bankerScore, others, hole.scores) : {};
  const allScoresEntered = hole && players.every((p) => hole.scores[p.id] != null);

  function cycleResult(current: Result): Result {
    if (current === null) return 'win';
    if (current === 'win') return 'halve';
    if (current === 'halve') return 'loss';
    return null;
  }

  function circleState(i: number): CircleState {
    if (bankerHoles[i]?.locked) return 'done';
    if (i === currentHole) return 'active';
    return 'future';
  }

  // Detect sweep on current hole
  const isSweep = hole && sweepMult > 1 && (
    others.every((p) => (hole.results[p.id] ?? autoRes[p.id]) === 'win') ||
    others.every((p) => (hole.results[p.id] ?? autoRes[p.id]) === 'loss')
  );

  return (
    <View style={g.root}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.green }}>
        <View style={g.topBar}>
          <Text style={g.topBarSub}>Hole {viewingHole + 1} of {totalHoles}</Text>
          <Text style={g.topBarTitle}>Banker 👑</Text>
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

        {/* Banker banner */}
        <View style={g.bankerBanner}>
          <Pip player={banker} size={44} />
          <View style={{ flex: 1 }}>
            <Text style={g.bankerBannerLabel}>Banker on hole {viewingHole + 1}</Text>
            <Text style={g.bankerBannerName}>{banker.name}</Text>
          </View>
          {isSweep && <Text style={g.sweepBadge}>SWEEP {sweepMult}×</Text>}
        </View>

        {/* Score + result entry */}
        <View style={g.holeCard}>
          <View style={g.holeCardHeader}>
            <Text style={g.holeCardTitle}>Scores</Text>
            <Text style={g.holeCardSub}>Results auto-fill</Text>
          </View>

          {/* Banker row */}
          <View style={[g.scoreRow, g.scoreRowBanker]}>
            <Pip player={banker} />
            <Text style={[g.scorePlayerName, { fontFamily: Fonts.sansSemiBold }]}>{banker.name} 👑</Text>
            {!hole?.locked ? (
              <View style={g.stepper}>
                <TouchableOpacity style={g.stepBtn} activeOpacity={0.7}
                  onPress={() => onScoreChange(viewingHole, banker.id, bankerScore == null ? null : bankerScore <= 1 ? null : bankerScore - 1)}>
                  <Text style={g.stepBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={[g.stepValue, bankerScore == null && g.stepValueDim]}>{bankerScore ?? '—'}</Text>
                <TouchableOpacity style={g.stepBtn} activeOpacity={0.7}
                  onPress={() => onScoreChange(viewingHole, banker.id, (bankerScore ?? 0) + 1)}>
                  <Text style={g.stepBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={g.stepValue}>{bankerScore ?? '—'}</Text>
            )}
          </View>

          {/* Other players */}
          {others.map((p) => {
            const score = hole?.scores[p.id] ?? null;
            const currentResult: Result = hole?.results[p.id] ?? null;
            const displayResult: Result = currentResult ?? (bankerScore != null && score != null ? autoRes[p.id] : null);
            const isAuto = displayResult !== null && currentResult === null;

            return (
              <View key={p.id} style={g.scoreRow}>
                <Pip player={p} />
                <Text style={g.scorePlayerName}>{p.name}</Text>
                <ResultPill
                  result={displayResult}
                  onPress={() => {
                    if (!hole?.locked) {
                      onManualResult(viewingHole, p.id, cycleResult(displayResult));
                    }
                  }}
                />
                {!hole?.locked ? (
                  <View style={g.stepper}>
                    <TouchableOpacity style={g.stepBtn} activeOpacity={0.7}
                      onPress={() => onScoreChange(viewingHole, p.id, score == null ? null : score <= 1 ? null : score - 1)}>
                      <Text style={g.stepBtnText}>−</Text>
                    </TouchableOpacity>
                    <Text style={[g.stepValue, score == null && g.stepValueDim]}>{score ?? '—'}</Text>
                    <TouchableOpacity style={g.stepBtn} activeOpacity={0.7}
                      onPress={() => onScoreChange(viewingHole, p.id, (score ?? 0) + 1)}>
                      <Text style={g.stepBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text style={g.stepValue}>{score ?? '—'}</Text>
                )}
              </View>
            );
          })}

          {isViewingCurrent && !hole?.locked && (
            <View style={g.resolveBox}>
              <TouchableOpacity style={g.resolveBtn} onPress={() => onLockHole(viewingHole)} activeOpacity={0.8}>
                <Text style={g.resolveBtnText}>Lock Hole →</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Running balance */}
        <View style={g.scoreboardCard}>
          <Text style={g.scoreboardTitle}>Running balance</Text>
          {players.slice().sort((a, b) => running[b.id] - running[a.id]).map((p) => {
            const val = running[p.id];
            const isBanker = p.id === banker.id;
            return (
              <View key={p.id} style={g.scoreboardRow}>
                <Pip player={p} />
                <Text style={[g.scoreboardName, { flex: 1, marginLeft: 10 }]}>
                  {p.name}{isBanker ? ' 👑' : ''}
                </Text>
                <Text style={[g.scoreboardVal, val > 0 ? g.scorePos : val < 0 ? g.scoreNeg : g.scoreZero]}>
                  {val > 0 ? '+' : ''}{fmt(val)}
                </Text>
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
          style={[g.navBtn, viewingHole === totalHoles - 1 && g.navBtnFinish]}
          activeOpacity={0.7}
          onPress={() => viewingHole < totalHoles - 1 ? onNavigate(viewingHole + 1) : onEndRound()}>
          <Text style={[g.navBtnText, viewingHole === totalHoles - 1 && g.navBtnTextFinish]}>
            {viewingHole === totalHoles - 1 ? 'Finish 🏁' : 'Next →'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Settlement phase ─────────────────────────────────────────────────────────

function SettlementPhase({
  players, running, onDone,
}: {
  players: Player[]; running: Record<string, number>; onDone: () => void;
}) {
  const insets = useSafeAreaInsets();
  const transactions = minimumTransactions(running, players);
  const sorted = players.slice().sort((a, b) => running[b.id] - running[a.id]);

  return (
    <View style={g.root}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.green }}>
        <View style={g.topBar}><Text style={g.topBarTitle}>Banker Results</Text></View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={[g.settleContent, { paddingBottom: insets.bottom + 32 }]}>
        <View style={g.fieldCard}>
          {sorted.map((p, i) => {
            const val = running[p.id];
            return (
              <View key={p.id} style={[g.settleRow, i < sorted.length - 1 && g.settleRowBorder]}>
                <Text style={g.settleRank}>{i + 1}</Text>
                <Pip player={p} />
                <Text style={[g.settleName, { flex: 1, marginLeft: 10 }]}>{p.name}</Text>
                <Text style={[g.settleNet, val > 0 ? g.settleNetPos : val < 0 ? g.settleNetNeg : g.settleNetZero]}>
                  {val > 0 ? '+' : ''}{fmt(val)}
                </Text>
              </View>
            );
          })}
        </View>

        <Text style={g.sectionHead}>Settle up</Text>
        <View style={g.fieldCard}>
          {transactions.length === 0 ? (
            <Text style={g.noTxnText}>All even — nothing owed.</Text>
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

export default function BankerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();
  const { session } = useAuth();
  const userId  = session?.user.id ?? (__DEV__ ? '46bae3d3-2c18-450e-b267-f36b91a94a31' : null);

  const [players, setPlayers]           = useState<Player[]>([]);
  const [playerOrder, setPlayerOrder]   = useState<Player[]>([]);
  const [loading, setLoading]           = useState(true);
  const [phase, setPhase]               = useState<'setup' | 'playing' | 'settled'>('setup');
  const [stake, setStake]               = useState(2);
  const [sweepMult, setSweepMult]       = useState(1);
  const [totalHoles, setTotalHoles]     = useState(18);
  const [bankerHoles, setBankerHoles]   = useState<(BankerHoleLocal | null)[]>([]);
  const [currentHole, setCurrentHole]   = useState(0);
  const [viewingHole, setViewingHole]   = useState(0);
  const [hostId, setHostId]             = useState('');
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
        setPlayerOrder(mapped);
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
    }
  }

  const running = useMemo(
    () => calcRunning(bankerHoles, playerOrder, stake, sweepMult),
    [bankerHoles, playerOrder, stake, sweepMult]
  );

  function startGame() {
    const h: (BankerHoleLocal | null)[] = Array.from({ length: totalHoles }, (_, i) => {
      const banker = bankerForHole(i, playerOrder);
      return {
        bankerPlayerId: banker.id,
        scores: Object.fromEntries(playerOrder.map((p) => [p.id, null])),
        results: Object.fromEntries(playerOrder.filter((p) => p.id !== banker.id).map((p) => [p.id, null])),
        locked: false,
      };
    });
    setBankerHoles(h);
    setCurrentHole(0);
    setViewingHole(0);
    setPhase('playing');
  }

  function handleScoreChange(holeIdx: number, pid: string, v: number | null) {
    setBankerHoles((prev) => {
      const next = [...prev];
      if (!next[holeIdx]) return next;
      const hole = next[holeIdx]!;
      const newScores = { ...hole.scores, [pid]: v };
      const banker = playerOrder.find((p) => p.id === hole.bankerPlayerId)!;
      const others = playerOrder.filter((p) => p.id !== banker.id);
      const newResults: Record<string, Result> = { ...hole.results };
      // Only auto-fill results that haven't been manually overridden
      const autoRes = autoResults(newScores[banker.id], others, newScores);
      for (const other of others) {
        if (hole.results[other.id] === null) newResults[other.id] = autoRes[other.id];
      }
      next[holeIdx] = { ...hole, scores: newScores, results: newResults };
      return next;
    });
    const isTemp = players.find((p) => p.id === pid)?.isTempPlayer ?? false;
    if (isTemp) upsertTempScore(id, pid, holeIdx + 1, v);
    else upsertScore(id, pid, holeIdx + 1, v, userId ?? undefined);
  }

  function handleManualResult(holeIdx: number, pid: string, r: Result) {
    setBankerHoles((prev) => {
      const next = [...prev];
      if (!next[holeIdx]) return next;
      next[holeIdx] = { ...next[holeIdx]!, results: { ...next[holeIdx]!.results, [pid]: r } };
      return next;
    });
  }

  function handleLockHole(holeIdx: number) {
    setBankerHoles((prev) => {
      const next = [...prev];
      if (!next[holeIdx]) return next;
      const hole = next[holeIdx]!;
      const banker = playerOrder.find((p) => p.id === hole.bankerPlayerId)!;
      const others = playerOrder.filter((p) => p.id !== banker.id);
      // Fill any remaining null results from auto
      const autoRes = autoResults(hole.scores[banker.id], others, hole.scores);
      const finalResults = { ...hole.results };
      for (const other of others) {
        if (finalResults[other.id] === null && autoRes[other.id] !== null) {
          finalResults[other.id] = autoRes[other.id];
        }
      }
      next[holeIdx] = { ...hole, results: finalResults, locked: true };
      return next;
    });

    // Persist
    if (id) {
      const hole = bankerHoles[holeIdx];
      if (hole) {
        upsertBankerHole({ round_id: id, hole_number: holeIdx + 1, banker_player_id: hole.bankerPlayerId });
        for (const [pid, result] of Object.entries(hole.results)) {
          if (result) upsertBankerResult({ round_id: id, hole_number: holeIdx + 1, player_id: pid, result });
        }
      }
    }

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
          players={players} stake={stake} setStake={setStake}
          totalHoles={totalHoles} setTotalHoles={setTotalHoles}
          sweepMult={sweepMult} setSweepMult={setSweepMult}
          playerOrder={playerOrder} setPlayerOrder={setPlayerOrder}
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
        bankerHoles={bankerHoles} players={players} playerOrder={playerOrder}
        stake={stake} sweepMult={sweepMult} totalHoles={totalHoles}
        currentHole={currentHole} viewingHole={viewingHole} running={running}
        onScoreChange={handleScoreChange}
        onManualResult={handleManualResult}
        onLockHole={handleLockHole}
        onNavigate={(i) => setViewingHole(i)}
        onEndRound={() => setPhase('settled')}
      />
    );
  }

  return (
    <SettlementPhase
      players={players} running={running}
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

  bankerBanner: { backgroundColor: Colors.card, borderRadius: 14, borderWidth: 0.5, borderColor: Colors.border, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 16 },
  bankerBannerLabel: { fontFamily: Fonts.sans, fontSize: 11, color: Colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  bankerBannerName: { fontFamily: Fonts.serifMedium, fontSize: 20, color: Colors.text },
  sweepBadge: { backgroundColor: '#fff3cd', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, fontFamily: Fonts.sansSemiBold, fontSize: 11, color: '#856404' },

  setupContent: { backgroundColor: Colors.bg, padding: Spacing.lg },
  playContent: { backgroundColor: Colors.bg, gap: 12 },
  settleContent: { backgroundColor: Colors.bg, padding: Spacing.lg, gap: 12 },

  setupHeading: { fontFamily: Fonts.serifMedium, fontSize: 24, color: Colors.text, marginBottom: 20, marginTop: 4 },

  fieldCard: { backgroundColor: Colors.card, borderRadius: 14, borderWidth: 0.5, borderColor: Colors.border, padding: 16, gap: 12, marginBottom: 12 },
  fieldLabel: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.muted },
  fieldHint: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.muted, lineHeight: 17 },
  cardLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  editLink: { fontFamily: Fonts.sansMedium, fontSize: 13, color: Colors.green },

  segRow: { flexDirection: 'row', gap: 8 },
  seg: { flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.creamLight, alignItems: 'center' },
  segActive: { backgroundColor: Colors.green },
  segText: { fontFamily: Fonts.sansMedium, fontSize: 13, color: Colors.text },
  segTextActive: { color: Colors.cream },

  orderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  orderNum: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: Colors.muted, width: 20, textAlign: 'center' },
  orderBtns: { flexDirection: 'row', gap: 6 },
  orderBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: Colors.creamLight, alignItems: 'center', justifyContent: 'center' },
  orderBtnDisabled: { opacity: 0.3 },
  orderBtnText: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: Colors.text },
  playerName: { fontFamily: Fonts.sans, fontSize: 14, color: Colors.text, flex: 1 },

  pip: { alignItems: 'center', justifyContent: 'center' },
  pipText: { fontFamily: Fonts.sansSemiBold, fontSize: 11, color: '#fff' },

  holeCard: { backgroundColor: Colors.card, borderRadius: 14, borderWidth: 0.5, borderColor: Colors.border, overflow: 'hidden', marginHorizontal: 16 },
  holeCardHeader: { backgroundColor: Colors.creamLight, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  holeCardTitle: { fontFamily: Fonts.serifMedium, fontSize: 18, color: Colors.text },
  holeCardSub: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.muted },

  scoreRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 0.5, borderTopColor: Colors.border, gap: 8 },
  scoreRowBanker: { backgroundColor: '#f8f4ec' },
  scorePlayerName: { flex: 1, fontFamily: Fonts.sans, fontSize: 14, color: Colors.text },

  resultPill: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, minWidth: 62, alignItems: 'center' },
  resultPillText: { fontFamily: Fonts.sansSemiBold, fontSize: 12 },

  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.creamLight, alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: Colors.green, lineHeight: 18 },
  stepValue: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: Colors.text, minWidth: 28, textAlign: 'center' },
  stepValueDim: { color: Colors.muted },

  resolveBox: { borderTopWidth: 0.5, borderTopColor: Colors.border, padding: 14 },
  resolveBtn: { backgroundColor: Colors.green, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  resolveBtnText: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: Colors.cream },

  scoreboardCard: { backgroundColor: Colors.card, borderRadius: 14, borderWidth: 0.5, borderColor: Colors.border, padding: 14, gap: 10, marginHorizontal: 16 },
  scoreboardTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 11, color: Colors.muted, textTransform: 'uppercase', letterSpacing: 1 },
  scoreboardRow: { flexDirection: 'row', alignItems: 'center' },
  scoreboardName: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.text },
  scoreboardVal: { fontFamily: Fonts.sansSemiBold, fontSize: 14 },
  scorePos: { color: '#2a7a2a' },
  scoreNeg: { color: '#b04030' },
  scoreZero: { color: Colors.muted },

  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: Colors.bg, borderTopWidth: 0.5, borderTopColor: Colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12 },
  navBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 10, backgroundColor: Colors.creamLight, minWidth: 90, alignItems: 'center' },
  navBtnDisabled: { opacity: 0.35 },
  navBtnFinish: { backgroundColor: Colors.green },
  navBtnText: { fontFamily: Fonts.sansMedium, fontSize: 14, color: Colors.text },
  navBtnTextDisabled: { color: Colors.muted },
  navBtnTextFinish: { color: Colors.cream },
  navCenter: { fontFamily: Fonts.sansMedium, fontSize: 13, color: Colors.muted },

  settleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  settleRowBorder: { borderBottomWidth: 0.5, borderBottomColor: Colors.border, paddingBottom: 12, marginBottom: 4 },
  settleRank: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: Colors.muted, width: 20, textAlign: 'center' },
  settleName: { fontFamily: Fonts.sansMedium, fontSize: 14, color: Colors.text },
  settleNet: { fontFamily: Fonts.sansSemiBold, fontSize: 15 },
  settleNetPos: { color: '#2a7a2a' },
  settleNetNeg: { color: '#b04030' },
  settleNetZero: { color: Colors.muted },
  sectionHead: { fontFamily: Fonts.sansSemiBold, fontSize: 11, color: Colors.muted, textTransform: 'uppercase', letterSpacing: 1, marginTop: 8 },
  txnRow: { paddingVertical: 10 },
  txnRowBorder: { borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  txnText: { fontFamily: Fonts.sans, fontSize: 14, color: Colors.text, lineHeight: 20 },
  txnName: { fontFamily: Fonts.sansSemiBold },
  txnAmount: { fontFamily: Fonts.sansSemiBold, color: Colors.green },
  noTxnText: { fontFamily: Fonts.sans, fontSize: 14, color: Colors.muted, textAlign: 'center', paddingVertical: 4 },

  primaryBtn: { backgroundColor: Colors.green, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  primaryBtnText: { fontFamily: Fonts.sansSemiBold, fontSize: 16, color: Colors.cream },
});
