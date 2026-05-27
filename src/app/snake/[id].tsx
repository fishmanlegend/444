import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Fonts, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { getRoundWithPlayers, getScores, getTempScores, upsertScore, upsertTempScore } from '@/lib/db';
import { EditPlayersSheet } from '@/components/EditPlayersSheet';

// ─── Types ────────────────────────────────────────────────────────────────────

type Player = { id: string; name: string; initials: string; color: string; isTempPlayer: boolean };
type HoleEntry = { strokes: Record<string, number | null>; putts: Record<string, number | null>; locked: boolean };

const CIRCLE_SIZE = 34;
const CIRCLE_GAP  = 6;
const CIRCLE_STEP = CIRCLE_SIZE + CIRCLE_GAP;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n % 1 === 0 ? `$${n}` : `$${n.toFixed(2)}`;
}

// Returns id of player who most recently 3-putted (they hold the snake).
function snakeHolder(holes: HoleEntry[], players: Player[]): string | null {
  let holder: string | null = null;
  for (const hole of holes) {
    if (!hole.locked) break;
    for (const p of players) {
      if ((hole.putts[p.id] ?? 0) >= 3) holder = p.id;
    }
  }
  return holder;
}

// Returns per-player count of how many holes they held the snake (for per-hole mode).
function snakeHeldCounts(holes: HoleEntry[], players: Player[]): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries(players.map((p) => [p.id, 0]));
  let current: string | null = null;
  for (const hole of holes) {
    if (!hole.locked) break;
    for (const p of players) {
      if ((hole.putts[p.id] ?? 0) >= 3) current = p.id;
    }
    if (current) counts[current]++;
  }
  return counts;
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
  players, stakeCents, setStakeCents, totalHoles, setTotalHoles,
  perHole, setPerHole, onStart, onBack, onEditPlayers,
}: {
  players: Player[]; stakeCents: number; setStakeCents: (v: number) => void;
  totalHoles: number; setTotalHoles: (v: number) => void;
  perHole: boolean; setPerHole: (v: boolean) => void;
  onStart: () => void; onBack: () => void; onEditPlayers: () => void;
}) {
  const insets = useSafeAreaInsets();
  const PRESETS = [1, 2, 5, 10] as const;
  type PresetMode = 1 | 2 | 5 | 10 | 'custom';
  const initMode: PresetMode = ([1, 2, 5, 10] as number[]).includes(stakeCents) ? (stakeCents as any) : 'custom';
  const [mode, setMode]     = useState<PresetMode>(initMode);
  const [custom, setCustom] = useState(initMode === 'custom' ? String(stakeCents) : '');
  const [holeMode, setHoleMode] = useState<'9' | '18' | 'custom'>(totalHoles === 9 ? '9' : totalHoles === 18 ? '18' : 'custom');
  const [customH, setCustomH]   = useState(holeMode === 'custom' ? String(totalHoles) : '');

  return (
    <View style={g.root}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.green }}>
        <View style={g.topBar}>
          <TouchableOpacity onPress={onBack} activeOpacity={0.7} style={g.topBarBackHit}>
            <Text style={g.topBarBack}>← Back</Text>
          </TouchableOpacity>
          <Text style={g.topBarTitle}>Snake 🐍</Text>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={[g.setupContent, { paddingBottom: insets.bottom + 32 }]}>
        <Text style={g.setupHeading}>Set up the game</Text>

        <View style={g.fieldCard}>
          <Text style={g.fieldLabel}>Stake</Text>
          <View style={g.segRow}>
            {PRESETS.map((amt) => (
              <TouchableOpacity key={amt} style={[g.seg, mode === amt && g.segActive]}
                onPress={() => { setMode(amt); setStakeCents(amt); }} activeOpacity={0.8}>
                <Text style={[g.segText, mode === amt && g.segTextActive]}>${amt}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[g.seg, mode === 'custom' && g.segActive]} onPress={() => setMode('custom')} activeOpacity={0.8}>
              <Text style={[g.segText, mode === 'custom' && g.segTextActive]}>{mode === 'custom' && stakeCents > 0 ? fmt(stakeCents) : 'Other'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={g.fieldCard}>
          <Text style={g.fieldLabel}>Payout mode</Text>
          <View style={g.segRow}>
            <TouchableOpacity style={[g.seg, !perHole && g.segActive]} onPress={() => setPerHole(false)} activeOpacity={0.8}>
              <Text style={[g.segText, !perHole && g.segTextActive]}>End of round</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[g.seg, perHole && g.segActive]} onPress={() => setPerHole(true)} activeOpacity={0.8}>
              <Text style={[g.segText, perHole && g.segTextActive]}>Per hole held</Text>
            </TouchableOpacity>
          </View>
          <Text style={g.fieldHint}>
            {perHole
              ? 'Snake holder pays stake × others for each hole they hold it.'
              : 'Whoever holds the snake at round end pays stake × others.'}
          </Text>
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
        </View>

        <View style={g.fieldCard}>
          <View style={g.cardLabelRow}>
            <Text style={g.fieldLabel}>Players</Text>
            <TouchableOpacity onPress={onEditPlayers} activeOpacity={0.7}><Text style={g.editLink}>Edit</Text></TouchableOpacity>
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

        <TouchableOpacity style={g.primaryBtn} onPress={onStart} activeOpacity={0.85}>
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
  currentHole, viewingHole, stake, perHole, totalHoles,
  onStrokesChange, onPuttsChange, onLockHole, onNavigate, onEndRound,
}: {
  holes: HoleEntry[]; players: Player[]; myId: string | null;
  trackOthers: boolean; onToggleTrackOthers: () => void;
  currentHole: number; viewingHole: number;
  stake: number; perHole: boolean; totalHoles: number;
  onStrokesChange: (holeIdx: number, pid: string, v: number | null) => void;
  onPuttsChange:   (holeIdx: number, pid: string, v: number | null) => void;
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

  const lockedHoles = holes.slice(0, currentHole);
  const currentHolder = snakeHolder(holes, players);
  const heldCounts = perHole ? snakeHeldCounts(holes, players) : null;
  const viewedHole = holes[viewingHole];
  const isViewingCurrent = viewingHole === currentHole;
  const allStrokes = players.every((p) => (viewedHole?.strokes[p.id] ?? null) != null);
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
          <Text style={g.topBarTitle}>Snake 🐍</Text>
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

        {/* Snake status banner */}
        {currentHolder && (
          <View style={g.snakeBanner}>
            <Text style={g.snakeEmoji}>🐍</Text>
            <Text style={g.snakeText}>
              {players.find((p) => p.id === currentHolder)?.name} has the snake
            </Text>
          </View>
        )}

        {/* Score + putts entry */}
        <View style={g.holeCard}>
          <View style={g.holeCardHeader}>
            <Text style={g.holeCardTitle}>Hole {viewingHole + 1}</Text>
            <View style={g.colLabels}>
              <Text style={g.colLabel}>Strokes</Text>
              <Text style={g.colLabel}>Putts</Text>
            </View>
          </View>

          {players.map((p) => {
            const strokes = viewedHole?.strokes[p.id] ?? null;
            const putts   = viewedHole?.putts[p.id] ?? null;
            const isHolder = p.id === snakeHolder(holes.slice(0, viewingHole + 1), players);
            const canEdit = !viewedHole?.locked && (myId === null || p.id === myId || trackOthers);
            const threePutt = (putts ?? 0) >= 3;

            return (
              <View key={p.id} style={[g.scoreRow, isHolder && g.scoreRowSnake]}>
                <Pip player={p} />
                <Text style={[g.scorePlayerName, isHolder && { fontFamily: Fonts.sansSemiBold }]}>
                  {p.name}{isHolder ? ' 🐍' : ''}
                </Text>

                {/* Strokes stepper */}
                {canEdit ? (
                  <View style={g.stepper}>
                    <TouchableOpacity style={g.stepBtn} activeOpacity={0.7}
                      onPress={() => onStrokesChange(viewingHole, p.id, strokes == null ? null : strokes <= 1 ? null : strokes - 1)}>
                      <Text style={g.stepBtnText}>−</Text>
                    </TouchableOpacity>
                    <Text style={[g.stepValue, strokes == null && g.stepValueDim]}>{strokes ?? '—'}</Text>
                    <TouchableOpacity style={g.stepBtn} activeOpacity={0.7}
                      onPress={() => onStrokesChange(viewingHole, p.id, (strokes ?? 0) + 1)}>
                      <Text style={g.stepBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text style={[g.stepValue, strokes == null && g.stepValueDim]}>{strokes ?? '—'}</Text>
                )}

                {/* Putts stepper */}
                {canEdit ? (
                  <View style={[g.stepper, { marginLeft: 8 }]}>
                    <TouchableOpacity style={g.stepBtn} activeOpacity={0.7}
                      onPress={() => onPuttsChange(viewingHole, p.id, putts == null ? null : putts <= 1 ? null : putts - 1)}>
                      <Text style={g.stepBtnText}>−</Text>
                    </TouchableOpacity>
                    <Text style={[g.stepValue, putts == null && g.stepValueDim, threePutt && g.stepValueSnake]}>
                      {putts ?? '—'}
                    </Text>
                    <TouchableOpacity style={g.stepBtn} activeOpacity={0.7}
                      onPress={() => onPuttsChange(viewingHole, p.id, (putts ?? 0) + 1)}>
                      <Text style={g.stepBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text style={[g.stepValue, putts == null && g.stepValueDim, threePutt && g.stepValueSnake]}>
                    {putts ?? '—'}
                  </Text>
                )}
              </View>
            );
          })}

          {hasOthers && !viewedHole?.locked && (
            <TouchableOpacity onPress={onToggleTrackOthers} activeOpacity={0.7} style={g.trackToggle}>
              <Text style={g.trackToggleText}>{trackOthers ? 'Done tracking others ▾' : 'Track for others ▴'}</Text>
            </TouchableOpacity>
          )}

          {isViewingCurrent && allStrokes && !viewedHole?.locked && (
            <View style={g.resolveBox}>
              <TouchableOpacity style={g.resolveBtn} onPress={() => onLockHole(viewingHole)} activeOpacity={0.8}>
                <Text style={g.resolveBtnText}>Lock Hole →</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Snake scoreboard */}
        {perHole && heldCounts && (
          <View style={g.scoreboardCard}>
            <Text style={g.scoreboardTitle}>Holes with snake</Text>
            {players.slice().sort((a, b) => (heldCounts[b.id] ?? 0) - (heldCounts[a.id] ?? 0)).map((p) => {
              const held = heldCounts[p.id] ?? 0;
              const cost = held * stake * (players.length - 1);
              return (
                <View key={p.id} style={g.scoreboardRow}>
                  <Pip player={p} />
                  <Text style={[g.scoreboardName, { flex: 1, marginLeft: 10 }]}>{p.name}</Text>
                  <Text style={g.scoreboardSub}>{held} hole{held !== 1 ? 's' : ''}</Text>
                  {cost > 0 && <Text style={g.scoreboardCost}>−{fmt(cost)}</Text>}
                </View>
              );
            })}
          </View>
        )}
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
            if (isViewingCurrent && !holes[viewingHole]?.locked) {
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
  players, holes, stake, perHole, onDone,
}: {
  players: Player[]; holes: HoleEntry[]; stake: number; perHole: boolean; onDone: () => void;
}) {
  const insets = useSafeAreaInsets();
  const holder = snakeHolder(holes, players);
  const heldCounts = snakeHeldCounts(holes, players);
  const n = players.length;

  type TxnLine = { fromId: string; toId: string; amount: number };
  const txns: TxnLine[] = [];

  if (perHole) {
    for (const p of players) {
      const held = heldCounts[p.id] ?? 0;
      if (held === 0) continue;
      const owes = held * stake;
      for (const other of players) {
        if (other.id !== p.id) txns.push({ fromId: p.id, toId: other.id, amount: owes });
      }
    }
  } else if (holder) {
    const owes = stake;
    for (const other of players) {
      if (other.id !== holder) txns.push({ fromId: holder, toId: other.id, amount: owes });
    }
  }

  return (
    <View style={g.root}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.green }}>
        <View style={g.topBar}><Text style={g.topBarTitle}>Final Settlement</Text></View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={[g.settleContent, { paddingBottom: insets.bottom + 32 }]}>
        {holder ? (
          <View style={g.snakeBanner}>
            <Text style={g.snakeEmoji}>🐍</Text>
            <Text style={g.snakeText}>
              {players.find((p) => p.id === holder)?.name} ends with the snake
            </Text>
          </View>
        ) : (
          <View style={[g.snakeBanner, { backgroundColor: '#e8f4e8' }]}>
            <Text style={g.snakeText}>Nobody 3-putted — no snake! 🎉</Text>
          </View>
        )}

        {perHole && (
          <View style={g.fieldCard}>
            <Text style={g.fieldLabel}>Holes with snake</Text>
            {players.map((p) => {
              const held = heldCounts[p.id] ?? 0;
              return (
                <View key={p.id} style={g.settleRow}>
                  <Pip player={p} />
                  <Text style={[g.settleName, { flex: 1, marginLeft: 10 }]}>{p.name}</Text>
                  <Text style={g.settleSkinsLine}>{held} hole{held !== 1 ? 's' : ''}</Text>
                  {held > 0 && <Text style={g.settleNetNeg}>−{fmt(held * stake * (n - 1))}</Text>}
                </View>
              );
            })}
          </View>
        )}

        <Text style={g.sectionHead}>Settle up</Text>
        <View style={g.fieldCard}>
          {txns.length === 0 ? (
            <Text style={g.noTxnText}>Nothing to settle.</Text>
          ) : txns.map((t, i) => {
            const from = players.find((p) => p.id === t.fromId)!;
            const to   = players.find((p) => p.id === t.toId)!;
            return (
              <View key={i} style={[g.txnRow, i < txns.length - 1 && g.txnRowBorder]}>
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

export default function SnakeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id ?? (__DEV__ ? '46bae3d3-2c18-450e-b267-f36b91a94a31' : null);

  const [players, setPlayers]         = useState<Player[]>([]);
  const [myId, setMyId]               = useState<string | null>(null);
  const [trackOthers, setTrackOthers] = useState(false);
  const [loading, setLoading]         = useState(true);
  const [phase, setPhase]             = useState<'setup' | 'playing' | 'settled'>('setup');
  const [stake, setStake]             = useState(5);
  const [perHole, setPerHole]         = useState(false);
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

  async function startGame() {
    const [dbScores, dbTempScores] = await Promise.all([
      id ? getScores(id) : Promise.resolve([]),
      id ? getTempScores(id) : Promise.resolve([]),
    ]);
    const h: HoleEntry[] = Array.from({ length: totalHoles }, (_, i) => {
      const holeNum = i + 1;
      const strokes: Record<string, number | null> = Object.fromEntries(players.map((p) => [p.id, null]));
      const putts:   Record<string, number | null> = Object.fromEntries(players.map((p) => [p.id, null]));
      for (const p of players) {
        const s = p.isTempPlayer
          ? dbTempScores.find((ts) => ts.temp_player_id === p.id && ts.hole_number === holeNum)
          : dbScores.find((ds) => ds.player_id === p.id && ds.hole_number === holeNum);
        if (s) { strokes[p.id] = s.strokes; putts[p.id] = (s as any).putts ?? null; }
      }
      const allFilled = players.every((p) => strokes[p.id] != null);
      return { strokes, putts, locked: allFilled };
    });
    const firstUnlocked = h.findIndex((hole) => !hole.locked);
    const startIdx = firstUnlocked === -1 ? totalHoles - 1 : firstUnlocked;
    setHoles(h);
    setCurrentHole(startIdx);
    setViewingHole(startIdx);
    setPhase('playing');
  }

  function handleStrokesChange(holeIdx: number, pid: string, v: number | null) {
    setHoles((prev) => {
      const next = [...prev];
      next[holeIdx] = { ...next[holeIdx], strokes: { ...next[holeIdx].strokes, [pid]: v } };
      return next;
    });
    const isTemp = players.find((p) => p.id === pid)?.isTempPlayer ?? false;
    if (isTemp) upsertTempScore(id, pid, holeIdx + 1, v);
    else upsertScore(id, pid, holeIdx + 1, v, userId ?? undefined);
  }

  function handlePuttsChange(holeIdx: number, pid: string, v: number | null) {
    setHoles((prev) => {
      const next = [...prev];
      next[holeIdx] = { ...next[holeIdx], putts: { ...next[holeIdx].putts, [pid]: v } };
      return next;
    });
    // Persist putts alongside strokes - reuse upsertScore with putts field
    // For now stored in memory only; full persistence requires putts column migration
  }

  function handleLockHole(holeIdx: number) {
    setHoles((prev) => {
      const next = [...prev];
      next[holeIdx] = { ...next[holeIdx], locked: true };
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
          players={players} stakeCents={stake} setStakeCents={setStake}
          totalHoles={totalHoles} setTotalHoles={setTotalHoles}
          perHole={perHole} setPerHole={setPerHole}
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
        stake={stake} perHole={perHole} totalHoles={totalHoles}
        onStrokesChange={handleStrokesChange} onPuttsChange={handlePuttsChange}
        onLockHole={handleLockHole}
        onNavigate={(i) => setViewingHole(Math.min(i, currentHole))}
        onEndRound={() => setPhase('settled')}
      />
    );
  }

  return (
    <SettlementPhase
      players={players} holes={holes} stake={stake} perHole={perHole}
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

  snakeBanner: { backgroundColor: '#fef3c0', borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16 },
  snakeEmoji: { fontSize: 24 },
  snakeText: { flex: 1, fontFamily: Fonts.sansSemiBold, fontSize: 14, color: Colors.text },

  setupContent: { backgroundColor: Colors.bg, padding: Spacing.lg },
  playContent: { backgroundColor: Colors.bg, gap: 12 },
  settleContent: { backgroundColor: Colors.bg, padding: Spacing.lg, gap: 12 },

  setupHeading: { fontFamily: Fonts.serifMedium, fontSize: 24, color: Colors.text, marginBottom: 20, marginTop: 4 },

  fieldCard: { backgroundColor: Colors.card, borderRadius: 14, borderWidth: 0.5, borderColor: Colors.border, padding: 16, gap: 12, marginBottom: 12 },
  fieldLabel: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.muted },
  fieldHint: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.muted, lineHeight: 17 },
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

  pip: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  pipText: { fontFamily: Fonts.sansSemiBold, fontSize: 11, color: '#fff' },

  holeCard: { backgroundColor: Colors.card, borderRadius: 14, borderWidth: 0.5, borderColor: Colors.border, overflow: 'hidden', marginHorizontal: 16 },
  holeCardHeader: { backgroundColor: Colors.creamLight, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  holeCardTitle: { fontFamily: Fonts.serifMedium, fontSize: 18, color: Colors.text },
  colLabels: { flexDirection: 'row', gap: 32 },
  colLabel: { fontFamily: Fonts.sans, fontSize: 11, color: Colors.muted, width: 60, textAlign: 'center' },

  scoreRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 0.5, borderTopColor: Colors.border, gap: 6 },
  scoreRowSnake: { backgroundColor: '#fffbeb' },
  scorePlayerName: { flex: 1, fontFamily: Fonts.sans, fontSize: 14, color: Colors.text },

  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.creamLight, alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: Colors.green, lineHeight: 18 },
  stepValue: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: Colors.text, minWidth: 28, textAlign: 'center' },
  stepValueDim: { color: Colors.muted },
  stepValueSnake: { color: '#b04030' },

  trackToggle: { paddingVertical: 11, alignItems: 'center', borderTopWidth: 0.5, borderTopColor: Colors.border },
  trackToggleText: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.muted },

  resolveBox: { borderTopWidth: 0.5, borderTopColor: Colors.border, padding: 14 },
  resolveBtn: { backgroundColor: Colors.green, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  resolveBtnText: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: Colors.cream },

  scoreboardCard: { backgroundColor: Colors.card, borderRadius: 14, borderWidth: 0.5, borderColor: Colors.border, padding: 14, gap: 10, marginHorizontal: 16 },
  scoreboardTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 11, color: Colors.muted, textTransform: 'uppercase', letterSpacing: 1 },
  scoreboardRow: { flexDirection: 'row', alignItems: 'center' },
  scoreboardName: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.text },
  scoreboardSub: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.muted, marginRight: 8 },
  scoreboardCost: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: '#b04030' },

  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: Colors.bg, borderTopWidth: 0.5, borderTopColor: Colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12 },
  navBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 10, backgroundColor: Colors.creamLight, minWidth: 90, alignItems: 'center' },
  navBtnDisabled: { opacity: 0.35 },
  navBtnFinish: { backgroundColor: Colors.green },
  navBtnText: { fontFamily: Fonts.sansMedium, fontSize: 14, color: Colors.text },
  navBtnTextDisabled: { color: Colors.muted },
  navBtnTextFinish: { color: Colors.cream },
  navCenter: { fontFamily: Fonts.sansMedium, fontSize: 13, color: Colors.muted },

  sectionHead: { fontFamily: Fonts.sansSemiBold, fontSize: 11, color: Colors.muted, textTransform: 'uppercase', letterSpacing: 1, marginTop: 8 },
  settleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  settleName: { fontFamily: Fonts.sansMedium, fontSize: 14, color: Colors.text },
  settleSkinsLine: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.muted, marginRight: 8 },
  settleNetNeg: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: '#b04030' },
  txnRow: { paddingVertical: 10 },
  txnRowBorder: { borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  txnText: { fontFamily: Fonts.sans, fontSize: 14, color: Colors.text, lineHeight: 20 },
  txnName: { fontFamily: Fonts.sansSemiBold },
  txnAmount: { fontFamily: Fonts.sansSemiBold, color: Colors.green },
  noTxnText: { fontFamily: Fonts.sans, fontSize: 14, color: Colors.muted, textAlign: 'center', paddingVertical: 4 },

  primaryBtn: { backgroundColor: Colors.green, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  primaryBtnText: { fontFamily: Fonts.sansSemiBold, fontSize: 16, color: Colors.cream },
});
