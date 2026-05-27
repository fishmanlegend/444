import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Modal, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Fonts, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { getRoundWithPlayers, getScores, getTempScores, upsertScore, upsertTempScore, getWolfHoles, upsertWolfHole } from '@/lib/db';
import { EditPlayersSheet } from '@/components/EditPlayersSheet';
import type { WolfHole } from '@/lib/database.types';

// ─── Types ────────────────────────────────────────────────────────────────────

type Player = { id: string; name: string; initials: string; color: string; isTempPlayer: boolean };

type WolfHoleLocal = {
  wolfPlayerId: string;
  partnerId: string | null;   // null = lone wolf
  isBlind: boolean;
  scores: Record<string, number | null>;
  result: 'wolf' | 'pack' | null;
};

type Transaction = { fromId: string; toId: string; amount: number };

const CIRCLE_SIZE = 34;
const CIRCLE_GAP  = 6;
const CIRCLE_STEP = CIRCLE_SIZE + CIRCLE_GAP;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n % 1 === 0 ? `$${n}` : `$${n.toFixed(2)}`;
}

// Returns the wolf player for a given hole (0-indexed).
function wolfForHole(holeIdx: number, players: Player[]): Player {
  return players[holeIdx % players.length];
}

// Points delta for the wolf side after a hole result.
// Returns Record<playerId, pointsDelta>.
function wolfPoints(
  wolfId: string,
  partnerId: string | null,
  isBlind: boolean,
  result: 'wolf' | 'pack',
  players: Player[],
  stakePerPt: number,
): Record<string, number> {
  const multiplier = isBlind ? 2 : 1;
  const others = players.filter((p) => p.id !== wolfId && p.id !== partnerId);

  if (!partnerId) {
    // Lone wolf
    if (result === 'wolf') {
      const gain = others.length * stakePerPt * multiplier;
      const delta: Record<string, number> = { [wolfId]: gain };
      others.forEach((p) => { delta[p.id] = -stakePerPt * multiplier; });
      return delta;
    } else {
      const loss = others.length * stakePerPt * multiplier;
      const delta: Record<string, number> = { [wolfId]: -loss };
      others.forEach((p) => { delta[p.id] = stakePerPt * multiplier; });
      return delta;
    }
  } else {
    // 2v2
    const wolfSide = [wolfId, partnerId];
    const packSide = others.map((p) => p.id);
    const delta: Record<string, number> = {};
    if (result === 'wolf') {
      wolfSide.forEach((id) => { delta[id] = stakePerPt * multiplier * packSide.length; });
      packSide.forEach((id) => { delta[id] = -stakePerPt * multiplier * wolfSide.length; });
    } else {
      wolfSide.forEach((id) => { delta[id] = -stakePerPt * multiplier * packSide.length; });
      packSide.forEach((id) => { delta[id] = stakePerPt * multiplier * wolfSide.length; });
    }
    return delta;
  }
}

function autoResult(wolfId: string, partnerId: string | null, scores: Record<string, number | null>, players: Player[]): 'wolf' | 'pack' | null {
  const wolfSide   = players.filter((p) => p.id === wolfId || p.id === partnerId);
  const packSide   = players.filter((p) => p.id !== wolfId && p.id !== partnerId);
  const allFilled  = players.every((p) => scores[p.id] != null);
  if (!allFilled) return null;
  const wolfBest = Math.min(...wolfSide.map((p) => scores[p.id]!));
  const packBest = Math.min(...packSide.map((p) => scores[p.id]!));
  if (wolfBest === packBest) return null; // tie — no auto result
  return wolfBest < packBest ? 'wolf' : 'pack';
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
  players, stakePerPt, setStakePerPt, totalHoles, setTotalHoles,
  playerOrder, setPlayerOrder, onStart, onBack, onEditPlayers,
}: {
  players: Player[];
  stakePerPt: number; setStakePerPt: (v: number) => void;
  totalHoles: number; setTotalHoles: (v: number) => void;
  playerOrder: Player[]; setPlayerOrder: (o: Player[]) => void;
  onStart: () => void; onBack: () => void; onEditPlayers: () => void;
}) {
  const insets = useSafeAreaInsets();
  const PRESETS = [1, 2, 5, 10] as const;
  type PresetMode = 1 | 2 | 5 | 10 | 'custom';
  const initMode: PresetMode = ([1, 2, 5, 10] as number[]).includes(stakePerPt) ? (stakePerPt as any) : 'custom';
  const [mode, setMode] = useState<PresetMode>(initMode);
  const [holeMode, setHoleMode] = useState<'9' | '18'>(totalHoles === 9 ? '9' : '18');
  const tooFew = players.length < 4;
  const canStart = !tooFew;

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
          <Text style={g.topBarTitle}>Wolf 🐺</Text>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={[g.setupContent, { paddingBottom: insets.bottom + 32 }]}>
        <Text style={g.setupHeading}>Set up Wolf</Text>

        {tooFew && (
          <View style={g.warningCard}>
            <Text style={g.warningText}>Wolf requires exactly 4 players.</Text>
          </View>
        )}

        <View style={g.fieldCard}>
          <Text style={g.fieldLabel}>Stake per point</Text>
          <View style={g.segRow}>
            {PRESETS.map((amt) => (
              <TouchableOpacity key={amt} style={[g.seg, mode === amt && g.segActive]}
                onPress={() => { setMode(amt); setStakePerPt(amt); }} activeOpacity={0.8}>
                <Text style={[g.segText, mode === amt && g.segTextActive]}>${amt}</Text>
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
            <Text style={g.fieldLabel}>Wolf rotation order</Text>
            <TouchableOpacity onPress={onEditPlayers} activeOpacity={0.7}><Text style={g.editLink}>Edit players</Text></TouchableOpacity>
          </View>
          <Text style={g.fieldHint}>Tap arrows to reorder. Wolf rotates down this list each hole.</Text>
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

        <TouchableOpacity style={[g.primaryBtn, !canStart && g.primaryBtnDisabled]}
          onPress={canStart ? onStart : undefined} activeOpacity={0.85}>
          <Text style={g.primaryBtnText}>Start Wolf</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

// ─── Partner picker modal ─────────────────────────────────────────────────────

function PartnerPickerModal({
  visible, wolf, others, onPick, onLone, onBlind, onClose,
}: {
  visible: boolean; wolf: Player; others: Player[];
  onPick: (pid: string) => void; onLone: () => void; onBlind: () => void; onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={g.overlay}>
        <TouchableOpacity style={{ flex: 1 }} onPress={onClose} activeOpacity={1} />
        <View style={[g.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={g.sheetHeader}>
            <Text style={g.sheetTitle}>🐺 {wolf.name} is the Wolf</Text>
          </View>
          <Text style={g.sheetHint}>Pick a partner or go solo</Text>

          {others.map((p) => (
            <TouchableOpacity key={p.id} style={g.sheetOption} onPress={() => onPick(p.id)} activeOpacity={0.7}>
              <Pip player={p} />
              <Text style={g.sheetOptionText}>Partner with {p.name}</Text>
            </TouchableOpacity>
          ))}

          <TouchableOpacity style={[g.sheetOption, g.sheetOptionLone]} onPress={onLone} activeOpacity={0.7}>
            <Text style={g.sheetOptionTextLone}>Go Lone Wolf</Text>
            <Text style={g.sheetOptionSub}>1 vs 3 · standard stakes</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[g.sheetOption, g.sheetOptionBlind]} onPress={onBlind} activeOpacity={0.7}>
            <Text style={g.sheetOptionTextLone}>Blind Wolf</Text>
            <Text style={g.sheetOptionSub}>Declare before scores · 2× stakes</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
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
  wolfHoles, players, playerOrder, stakePerPt, totalHoles,
  currentHole, viewingHole, running,
  onPartnerDecision, onScoreChange, onResult, onNavigate, onEndRound,
}: {
  wolfHoles: (WolfHoleLocal | null)[];
  players: Player[];
  playerOrder: Player[];
  stakePerPt: number;
  totalHoles: number;
  currentHole: number;
  viewingHole: number;
  running: Record<string, number>;
  onPartnerDecision: (holeIdx: number, partnerId: string | null, isBlind: boolean) => void;
  onScoreChange: (holeIdx: number, pid: string, v: number | null) => void;
  onResult: (holeIdx: number, result: 'wolf' | 'pack') => void;
  onNavigate: (i: number) => void;
  onEndRound: () => void;
}) {
  const insets = useSafeAreaInsets();
  const stripRef = useRef<ScrollView>(null);
  const isFirstRender = useRef(true);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    const x = Math.max(0, viewingHole * CIRCLE_STEP - 120);
    stripRef.current?.scrollTo({ x, animated: !isFirstRender.current });
    isFirstRender.current = false;
  }, [viewingHole]);

  const isViewingCurrent = viewingHole === currentHole;
  const wolfPlayer = wolfForHole(viewingHole, playerOrder);
  const hole = wolfHoles[viewingHole];
  const decisionMade = hole !== null;
  const others = playerOrder.filter((p) => p.id !== wolfPlayer.id);
  const partner = hole?.partnerId ? players.find((p) => p.id === hole.partnerId) ?? null : null;
  const allScores = hole && players.every((p) => hole.scores[p.id] != null);
  const auto = hole && decisionMade ? autoResult(wolfPlayer.id, hole.partnerId, hole.scores, players) : null;

  function circleState(i: number): CircleState {
    if (wolfHoles[i]?.result !== null && wolfHoles[i] !== null) return 'done';
    if (i === currentHole) return 'active';
    return 'future';
  }

  return (
    <View style={g.root}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.green }}>
        <View style={g.topBar}>
          <Text style={g.topBarSub}>Hole {viewingHole + 1} of {totalHoles}</Text>
          <Text style={g.topBarTitle}>Wolf 🐺</Text>
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

        {/* Wolf banner */}
        <View style={g.wolfBanner}>
          <Pip player={wolfPlayer} size={44} />
          <View style={{ flex: 1 }}>
            <Text style={g.wolfBannerLabel}>Wolf on hole {viewingHole + 1}</Text>
            <Text style={g.wolfBannerName}>{wolfPlayer.name}</Text>
            {hole?.isBlind && <Text style={g.wolfBannerBlind}>BLIND WOLF · 2× stakes</Text>}
            {decisionMade && partner && <Text style={g.wolfBannerPartner}>Partner: {partner.name}</Text>}
            {decisionMade && !hole?.partnerId && !hole?.isBlind && <Text style={g.wolfBannerPartner}>Lone Wolf</Text>}
          </View>
          {isViewingCurrent && !decisionMade && (
            <TouchableOpacity style={g.decideBtn} onPress={() => setShowPicker(true)} activeOpacity={0.8}>
              <Text style={g.decideBtnText}>Decide</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Score entry */}
        {decisionMade && (
          <View style={g.holeCard}>
            <View style={g.holeCardHeader}>
              <Text style={g.holeCardTitle}>Scores</Text>
            </View>
            {players.map((p) => {
              const score = hole.scores[p.id] ?? null;
              const isWolf = p.id === wolfPlayer.id;
              const isPartner = p.id === hole.partnerId;
              return (
                <View key={p.id} style={g.scoreRow}>
                  <Pip player={p} />
                  <Text style={g.scorePlayerName}>
                    {p.name}{isWolf ? ' 🐺' : isPartner ? ' 🤝' : ''}
                  </Text>
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
                </View>
              );
            })}

            {/* Result buttons */}
            <View style={g.resultRow}>
              {(['wolf', 'pack'] as const).map((r) => {
                const label = r === 'wolf'
                  ? (hole.partnerId ? `${wolfPlayer.name} & ${partner?.name}` : `${wolfPlayer.name}`)
                  : 'Pack wins';
                const isSelected = hole.result === r;
                return (
                  <TouchableOpacity key={r} style={[g.resultBtn, isSelected && g.resultBtnActive]}
                    onPress={() => onResult(viewingHole, r)} activeOpacity={0.7}>
                    <Text style={[g.resultBtnText, isSelected && g.resultBtnTextActive]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {auto && !hole.result && (
              <View style={g.autoBox}>
                <Text style={g.autoLabel}>Looks like {auto === 'wolf' ? 'Wolf side' : 'Pack'} wins</Text>
                <TouchableOpacity style={g.autoBtn} onPress={() => onResult(viewingHole, auto)} activeOpacity={0.8}>
                  <Text style={g.autoBtnText}>Confirm →</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Running leaderboard */}
        <View style={g.scoreboardCard}>
          <Text style={g.scoreboardTitle}>Running balance</Text>
          {players.slice().sort((a, b) => running[b.id] - running[a.id]).map((p) => {
            const val = running[p.id];
            const isWolf = p.id === wolfForHole(viewingHole, playerOrder).id;
            return (
              <View key={p.id} style={g.scoreboardRow}>
                <Pip player={p} />
                <Text style={[g.scoreboardName, { flex: 1, marginLeft: 10 }]}>
                  {p.name}{isWolf ? ' 🐺' : ''}
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

      <PartnerPickerModal
        visible={showPicker}
        wolf={wolfPlayer}
        others={others}
        onPick={(pid) => { setShowPicker(false); onPartnerDecision(viewingHole, pid, false); }}
        onLone={() => { setShowPicker(false); onPartnerDecision(viewingHole, null, false); }}
        onBlind={() => { setShowPicker(false); onPartnerDecision(viewingHole, null, true); }}
        onClose={() => setShowPicker(false)}
      />
    </View>
  );
}

// ─── Settlement phase ─────────────────────────────────────────────────────────

function SettlementPhase({
  players, running, stakePerPt, onDone,
}: {
  players: Player[]; running: Record<string, number>; stakePerPt: number; onDone: () => void;
}) {
  const insets = useSafeAreaInsets();
  const transactions = minimumTransactions(running, players);
  const sorted = players.slice().sort((a, b) => running[b.id] - running[a.id]);

  return (
    <View style={g.root}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.green }}>
        <View style={g.topBar}><Text style={g.topBarTitle}>Wolf Results</Text></View>
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

export default function WolfScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();
  const { session } = useAuth();
  const userId  = session?.user.id ?? (__DEV__ ? '46bae3d3-2c18-450e-b267-f36b91a94a31' : null);

  const [players, setPlayers]           = useState<Player[]>([]);
  const [playerOrder, setPlayerOrder]   = useState<Player[]>([]);
  const [loading, setLoading]           = useState(true);
  const [phase, setPhase]               = useState<'setup' | 'playing' | 'settled'>('setup');
  const [stakePerPt, setStakePerPt]     = useState(2);
  const [totalHoles, setTotalHoles]     = useState(18);
  const [wolfHoles, setWolfHoles]       = useState<(WolfHoleLocal | null)[]>([]);
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
    Promise.all([getRoundWithPlayers(id), getWolfHoles(id)]).then(([round, dbWolfHoles]) => {
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

  const running = useMemo(() => {
    const totals: Record<string, number> = Object.fromEntries(players.map((p) => [p.id, 0]));
    for (let i = 0; i < wolfHoles.length; i++) {
      const hole = wolfHoles[i];
      if (!hole || !hole.result) continue;
      const wolf = wolfForHole(i, playerOrder);
      const delta = wolfPoints(wolf.id, hole.partnerId, hole.isBlind, hole.result, playerOrder, stakePerPt);
      for (const [pid, d] of Object.entries(delta)) totals[pid] = (totals[pid] ?? 0) + d;
    }
    return totals;
  }, [wolfHoles, playerOrder, stakePerPt, players]);

  function startGame() {
    setWolfHoles(Array(totalHoles).fill(null));
    setCurrentHole(0);
    setViewingHole(0);
    setPhase('playing');
  }

  function handlePartnerDecision(holeIdx: number, partnerId: string | null, isBlind: boolean) {
    const wolf = wolfForHole(holeIdx, playerOrder);
    setWolfHoles((prev) => {
      const next = [...prev];
      next[holeIdx] = {
        wolfPlayerId: wolf.id,
        partnerId,
        isBlind,
        scores: Object.fromEntries(playerOrder.map((p) => [p.id, null])),
        result: null,
      };
      return next;
    });
    if (id) {
      upsertWolfHole({
        round_id: id, hole_number: holeIdx + 1,
        wolf_player_id: wolf.id, partner_player_id: partnerId,
        is_blind: isBlind, result: null,
      });
    }
  }

  function handleScoreChange(holeIdx: number, pid: string, v: number | null) {
    setWolfHoles((prev) => {
      const next = [...prev];
      if (!next[holeIdx]) return next;
      next[holeIdx] = { ...next[holeIdx]!, scores: { ...next[holeIdx]!.scores, [pid]: v } };
      return next;
    });
    const isTemp = players.find((p) => p.id === pid)?.isTempPlayer ?? false;
    if (isTemp) upsertTempScore(id, pid, holeIdx + 1, v);
    else upsertScore(id, pid, holeIdx + 1, v, userId ?? undefined);
  }

  function handleResult(holeIdx: number, result: 'wolf' | 'pack') {
    setWolfHoles((prev) => {
      const next = [...prev];
      if (!next[holeIdx]) return next;
      next[holeIdx] = { ...next[holeIdx]!, result };
      return next;
    });
    const hole = wolfHoles[holeIdx];
    if (id && hole) {
      upsertWolfHole({
        round_id: id, hole_number: holeIdx + 1,
        wolf_player_id: hole.wolfPlayerId, partner_player_id: hole.partnerId,
        is_blind: hole.isBlind, result,
      });
    }
    if (holeIdx === currentHole && currentHole < totalHoles - 1) {
      setCurrentHole(holeIdx + 1);
      setViewingHole(holeIdx + 1);
    } else if (holeIdx === totalHoles - 1) {
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
          players={players} stakePerPt={stakePerPt} setStakePerPt={setStakePerPt}
          totalHoles={totalHoles} setTotalHoles={setTotalHoles}
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
        wolfHoles={wolfHoles} players={players} playerOrder={playerOrder}
        stakePerPt={stakePerPt} totalHoles={totalHoles}
        currentHole={currentHole} viewingHole={viewingHole} running={running}
        onPartnerDecision={handlePartnerDecision}
        onScoreChange={handleScoreChange}
        onResult={handleResult}
        onNavigate={(i) => setViewingHole(i)}
        onEndRound={() => setPhase('settled')}
      />
    );
  }

  return (
    <SettlementPhase
      players={players} running={running} stakePerPt={stakePerPt}
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

  wolfBanner: { backgroundColor: Colors.card, borderRadius: 14, borderWidth: 0.5, borderColor: Colors.border, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 16 },
  wolfBannerLabel: { fontFamily: Fonts.sans, fontSize: 11, color: Colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  wolfBannerName: { fontFamily: Fonts.serifMedium, fontSize: 20, color: Colors.text },
  wolfBannerBlind: { fontFamily: Fonts.sansSemiBold, fontSize: 10, color: '#b04030', textTransform: 'uppercase', letterSpacing: 0.5 },
  wolfBannerPartner: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.muted },
  decideBtn: { backgroundColor: Colors.green, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  decideBtnText: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: Colors.cream },

  setupContent: { backgroundColor: Colors.bg, padding: Spacing.lg },
  playContent: { backgroundColor: Colors.bg, gap: 12 },
  settleContent: { backgroundColor: Colors.bg, padding: Spacing.lg, gap: 12 },

  setupHeading: { fontFamily: Fonts.serifMedium, fontSize: 24, color: Colors.text, marginBottom: 20, marginTop: 4 },

  fieldCard: { backgroundColor: Colors.card, borderRadius: 14, borderWidth: 0.5, borderColor: Colors.border, padding: 16, gap: 12, marginBottom: 12 },
  fieldLabel: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.muted },
  fieldHint: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.muted, lineHeight: 17 },
  cardLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  editLink: { fontFamily: Fonts.sansMedium, fontSize: 13, color: Colors.green },
  playerName: { fontFamily: Fonts.sans, fontSize: 14, color: Colors.text, flex: 1 },

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

  warningCard: { backgroundColor: '#fff3cd', borderRadius: 10, padding: 12, marginBottom: 12 },
  warningText: { fontFamily: Fonts.sans, fontSize: 13, color: '#856404' },

  pip: { alignItems: 'center', justifyContent: 'center' },
  pipText: { fontFamily: Fonts.sansSemiBold, fontSize: 11, color: '#fff' },

  holeCard: { backgroundColor: Colors.card, borderRadius: 14, borderWidth: 0.5, borderColor: Colors.border, overflow: 'hidden', marginHorizontal: 16 },
  holeCardHeader: { backgroundColor: Colors.creamLight, paddingHorizontal: 16, paddingVertical: 12 },
  holeCardTitle: { fontFamily: Fonts.serifMedium, fontSize: 18, color: Colors.text },

  scoreRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 0.5, borderTopColor: Colors.border, gap: 10 },
  scorePlayerName: { flex: 1, fontFamily: Fonts.sans, fontSize: 14, color: Colors.text },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.creamLight, alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { fontFamily: Fonts.sansSemiBold, fontSize: 16, color: Colors.green, lineHeight: 19 },
  stepValue: { fontFamily: Fonts.sansSemiBold, fontSize: 16, color: Colors.text, minWidth: 32, textAlign: 'center' },
  stepValueDim: { color: Colors.muted },

  resultRow: { flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: Colors.border },
  resultBtn: { flex: 1, paddingVertical: 16, alignItems: 'center', borderRightWidth: 0.5, borderRightColor: Colors.border },
  resultBtnActive: { backgroundColor: Colors.green },
  resultBtnText: { fontFamily: Fonts.sansMedium, fontSize: 13, color: Colors.text },
  resultBtnTextActive: { color: Colors.cream },

  autoBox: { borderTopWidth: 0.5, borderTopColor: Colors.border, padding: 14, gap: 8, backgroundColor: '#f8f6ef' },
  autoLabel: { fontFamily: Fonts.sansMedium, fontSize: 13, color: Colors.text },
  autoBtn: { backgroundColor: Colors.green, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  autoBtnText: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: Colors.cream },

  scoreboardCard: { backgroundColor: Colors.card, borderRadius: 14, borderWidth: 0.5, borderColor: Colors.border, padding: 14, gap: 10, marginHorizontal: 16 },
  scoreboardTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 11, color: Colors.muted, textTransform: 'uppercase', letterSpacing: 1 },
  scoreboardRow: { flexDirection: 'row', alignItems: 'center' },
  scoreboardName: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.text },
  scoreboardVal: { fontFamily: Fonts.sansSemiBold, fontSize: 14 },
  scorePos: { color: '#2a7a2a' },
  scoreNeg: { color: '#b04030' },
  scoreZero: { color: Colors.muted },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: Colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 10 },
  sheetHeader: { alignItems: 'center', paddingBottom: 4 },
  sheetTitle: { fontFamily: Fonts.serifMedium, fontSize: 20, color: Colors.text },
  sheetHint: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.muted, textAlign: 'center', marginBottom: 4 },
  sheetOption: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.card, borderRadius: 12, padding: 14, borderWidth: 0.5, borderColor: Colors.border },
  sheetOptionLone: { borderColor: Colors.green },
  sheetOptionBlind: { borderColor: '#b04030' },
  sheetOptionText: { fontFamily: Fonts.sansMedium, fontSize: 15, color: Colors.text },
  sheetOptionTextLone: { flex: 1, fontFamily: Fonts.sansSemiBold, fontSize: 15, color: Colors.text },
  sheetOptionSub: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.muted },

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
  primaryBtnDisabled: { opacity: 0.4 },
  primaryBtnText: { fontFamily: Fonts.sansSemiBold, fontSize: 16, color: Colors.cream },
});
