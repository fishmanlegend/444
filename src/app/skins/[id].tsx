import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Fonts, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { getRoundWithPlayers, getScores, getTempScores, getSkinsResults, upsertScore, upsertTempScore, upsertSkinsResult } from '@/lib/db';
import { EditPlayersSheet } from '@/components/EditPlayersSheet';

// ─── Types ────────────────────────────────────────────────────────────────────

type Player = { id: string; name: string; initials: string; color: string; isTempPlayer: boolean };

type HoleEntry = {
  scores: Record<string, number | null>;
  winnerId: string | null;
  skinsWon: number;
  carryoverBefore: number;
  resolved: boolean;
};

type Transaction = { fromId: string; toId: string; amount: number };

const CIRCLE_SIZE = 34;
const CIRCLE_GAP  = 6;
const CIRCLE_STEP = CIRCLE_SIZE + CIRCLE_GAP;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function potEmoji(carryoverBefore: number): string {
  const skins = carryoverBefore + 1;
  if (skins >= 7) return '🤯';
  if (skins >= 5) return '🤑';
  if (carryoverBefore >= 2) return '🔥';
  if (carryoverBefore === 1) return '🤨';
  return '🥱';
}

function potLabel(carryoverBefore: number): string {
  if (carryoverBefore === 0) return 'Pot';
  return `Carryover · ${carryoverBefore + 1} skins`;
}

function blankHole(carryoverBefore: number, players: Player[]): HoleEntry {
  return {
    scores: Object.fromEntries(players.map((p) => [p.id, null])),
    winnerId: null,
    skinsWon: 0,
    carryoverBefore,
    resolved: false,
  };
}

function autoWinner(scores: Record<string, number | null>, players: Player[]): string | 'tie' | null {
  const filled = players.filter((p) => scores[p.id] != null);
  if (filled.length < players.length) return null;
  const min = Math.min(...filled.map((p) => scores[p.id]!));
  const winners = filled.filter((p) => scores[p.id] === min);
  return winners.length === 1 ? winners[0].id : 'tie';
}

function minimumTransactions(nets: Record<string, number>, players: Player[]): Transaction[] {
  const debtors = players
    .map((p) => ({ id: p.id, bal: Math.round(nets[p.id] * 100) / 100 }))
    .filter((x) => x.bal < -0.005)
    .sort((a, b) => a.bal - b.bal);
  const creditors = players
    .map((p) => ({ id: p.id, bal: Math.round(nets[p.id] * 100) / 100 }))
    .filter((x) => x.bal > 0.005)
    .sort((a, b) => b.bal - a.bal);
  const txns: Transaction[] = [];
  let d = 0, c = 0;
  while (d < debtors.length && c < creditors.length) {
    const amount = Math.min(Math.abs(debtors[d].bal), creditors[c].bal);
    if (amount > 0.005) txns.push({ fromId: debtors[d].id, toId: creditors[c].id, amount: Math.round(amount * 100) / 100 });
    debtors[d].bal += amount;
    creditors[c].bal -= amount;
    if (Math.abs(debtors[d].bal) < 0.005) d++;
    if (creditors[c].bal < 0.005) c++;
  }
  return txns;
}

function fmt(n: number) {
  return n % 1 === 0 ? `$${n}` : `$${n.toFixed(2)}`;
}

// ─── Hole circle ──────────────────────────────────────────────────────────────

type CircleState = 'won' | 'carry' | 'active' | 'future';

function HoleCircle({
  holeNum, state, isViewing, onPress,
}: {
  holeNum: number;
  state: CircleState;
  isViewing: boolean;
  onPress: () => void;
}) {
  const bg =
    state === 'won'    ? Colors.green :
    state === 'carry'  ? '#d4a020' :
                         'transparent';

  const borderColor =
    state === 'won'    ? Colors.green :
    state === 'carry'  ? '#d4a020' :
    state === 'active' ? Colors.green :
                         Colors.border;

  const textColor =
    state === 'won'    ? Colors.cream :
    state === 'carry'  ? '#fff' :
    state === 'active' ? Colors.green :
                         Colors.muted;

  const label =
    state === 'won'   ? '✓' :
    state === 'carry' ? '→' :
                        `${holeNum}`;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <View style={[
        g.circle,
        { backgroundColor: bg, borderColor },
        isViewing && state !== 'active' && g.circleViewing,
      ]}>
        <Text style={[g.circleText, { color: textColor }]}>{label}</Text>
      </View>
    </TouchableOpacity>
  );
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
  players, dollarPerSkin, setDollarPerSkin, totalHoles, setTotalHoles, onStart, onBack, onEditPlayers,
}: {
  players: Player[];
  dollarPerSkin: number; setDollarPerSkin: (v: number) => void;
  totalHoles: number; setTotalHoles: (v: number) => void;
  onStart: () => void;
  onBack: () => void;
  onEditPlayers: () => void;
}) {
  const insets = useSafeAreaInsets();

  const initMode: '9' | '18' | '36' | 'custom' =
    totalHoles === 9 ? '9' : totalHoles === 18 ? '18' : totalHoles === 36 ? '36' : 'custom';
  const [holeMode, setHoleMode] = useState<'9' | '18' | '36' | 'custom'>(initMode);
  const [customText, setCustomText] = useState(initMode === 'custom' ? String(totalHoles) : '');

  const PRESET_AMOUNTS = [1, 5, 10, 20] as const;
  type AmountMode = 1 | 5 | 10 | 20 | 'custom';
  const initAmountMode: AmountMode = (PRESET_AMOUNTS as readonly number[]).includes(dollarPerSkin)
    ? (dollarPerSkin as 1 | 5 | 10 | 20) : 'custom';
  const [amountMode, setAmountMode] = useState<AmountMode>(initAmountMode);
  const [customAmountText, setCustomAmountText] = useState(
    initAmountMode === 'custom' ? String(dollarPerSkin) : '',
  );

  function selectAmountMode(mode: AmountMode) {
    setAmountMode(mode);
    if (mode !== 'custom') setDollarPerSkin(mode);
  }

  function handleCustomAmountChange(text: string) {
    setCustomAmountText(text);
    const n = parseFloat(text);
    if (!isNaN(n) && n > 0) setDollarPerSkin(n);
  }

  function selectMode(mode: '9' | '18' | '36' | 'custom') {
    setHoleMode(mode);
    if (mode === '9') setTotalHoles(9);
    else if (mode === '18') setTotalHoles(18);
    else if (mode === '36') setTotalHoles(36);
  }

  function handleCustomChange(text: string) {
    setCustomText(text);
    const n = parseInt(text, 10);
    if (!isNaN(n) && n > 0) setTotalHoles(n);
  }

  return (
    <View style={g.root}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.green }}>
        <View style={g.topBar}>
          <TouchableOpacity onPress={onBack} activeOpacity={0.7} style={g.topBarBackHit}>
            <Text style={g.topBarBack}>← Back</Text>
          </TouchableOpacity>
          <Text style={g.topBarTitle}>Skins</Text>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={[g.setupContent, { paddingBottom: insets.bottom + 32 }]}>
        <Text style={g.setupHeading}>Set up the game</Text>

        <View style={g.fieldCard}>
          <Text style={g.fieldLabel}>Dollar per skin</Text>
          <View style={g.segRow}>
            {([1, 5, 10, 20] as const).map((amt) => (
              <TouchableOpacity key={amt} style={[g.seg, amountMode === amt && g.segActive]} onPress={() => selectAmountMode(amt)} activeOpacity={0.8}>
                <Text style={[g.segText, amountMode === amt && g.segTextActive]}>${amt}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[g.seg, amountMode === 'custom' && g.segActive]} onPress={() => selectAmountMode('custom')} activeOpacity={0.8}>
              <Text style={[g.segText, amountMode === 'custom' && g.segTextActive]}>
                {amountMode === 'custom' && dollarPerSkin > 0 ? fmt(dollarPerSkin) : 'Custom'}
              </Text>
            </TouchableOpacity>
          </View>
          {amountMode === 'custom' && (
            <TextInput
              style={g.customHolesInput}
              value={customAmountText}
              onChangeText={handleCustomAmountChange}
              keyboardType="decimal-pad"
              placeholder="e.g., 7.50"
              placeholderTextColor={Colors.muted}
              maxLength={8}
              autoFocus
            />
          )}
        </View>

        <View style={g.fieldCard}>
          <Text style={g.fieldLabel}>Holes</Text>
          <View style={g.segRow}>
            {(['9', '18', '36', 'custom'] as const).map((mode) => (
              <TouchableOpacity key={mode} style={[g.seg, holeMode === mode && g.segActive]} onPress={() => selectMode(mode)} activeOpacity={0.8}>
                <Text style={[g.segText, holeMode === mode && g.segTextActive]}>{mode === 'custom' ? 'Custom' : mode}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {holeMode === 'custom' && (
            <TextInput
              style={g.customHolesInput}
              value={customText}
              onChangeText={handleCustomChange}
              keyboardType="number-pad"
              placeholder="# of holes"
              placeholderTextColor={Colors.muted}
              maxLength={3}
              autoFocus
            />
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
            Each skin worth {fmt(dollarPerSkin)} · {totalHoles} holes · {players.length} players
          </Text>
        </View>

        <TouchableOpacity style={g.primaryBtn} onPress={onStart} activeOpacity={0.85}>
          <Text style={g.primaryBtnText}>Start</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

// ─── Hole card ────────────────────────────────────────────────────────────────

function HoleCard({
  hole, players, myId, trackOthers, dollarPerSkin, onScoreChange, onResolve, onToggleTrackOthers,
}: {
  hole: HoleEntry; players: Player[]; myId: string | null; trackOthers: boolean;
  dollarPerSkin: number;
  onScoreChange: (pid: string, score: number | null) => void;
  onResolve: (winnerId?: string) => void;
  onToggleTrackOthers: () => void;
}) {
  const potValue = (hole.carryoverBefore + 1) * dollarPerSkin;
  const auto = autoWinner(hole.scores, players);
  const allEntered = players.every((p) => hole.scores[p.id] != null);
  const potFontSize = Math.min(16 + hole.carryoverBefore * 6, 42);
  const hasOthers = players.some((p) => p.id !== myId);

  return (
    <View style={g.holeCard}>
      <View style={[g.potBanner, hole.carryoverBefore > 0 && g.potBannerHot]}>
        <View style={{ flex: 1 }}>
          <View style={g.potEmojiRow}>
            <Text style={{ fontSize: potFontSize, lineHeight: potFontSize + 4 }}>{potEmoji(hole.carryoverBefore)}</Text>
            <Text style={g.potLabelSmall}>{potLabel(hole.carryoverBefore)}</Text>
          </View>
          <Text style={[g.potAmount, { fontSize: potFontSize }]}>{fmt(potValue)}</Text>
        </View>
        <TouchableOpacity style={g.noWinnerPill} onPress={() => onResolve()} activeOpacity={0.75}>
          <Text style={g.noWinnerPillText}>No winner</Text>
        </TouchableOpacity>
      </View>

      {players.map((p) => {
        const score = hole.scores[p.id];
        const canEdit = myId === null || p.id === myId || trackOthers;
        return (
          <View key={p.id} style={g.scoreRow}>
            <Pip player={p} />
            <Text style={g.scorePlayerName}>{p.name}</Text>
            {canEdit ? (
              <View style={g.stepper}>
                <TouchableOpacity style={g.stepBtn} activeOpacity={0.7}
                  onPress={() => { if (score == null) return; onScoreChange(p.id, score <= 1 ? null : score - 1); }}>
                  <Text style={g.stepBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={[g.stepValue, score == null && g.stepValueDim]}>{score ?? '—'}</Text>
                <TouchableOpacity style={g.stepBtn} activeOpacity={0.7}
                  onPress={() => onScoreChange(p.id, (score ?? 0) + 1)}>
                  <Text style={g.stepBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={[g.stepValue, score == null && g.stepValueDim]}>{score ?? '—'}</Text>
            )}
          </View>
        );
      })}

      {hasOthers && (
        <TouchableOpacity onPress={onToggleTrackOthers} activeOpacity={0.7} style={g.trackToggle}>
          <Text style={g.trackToggleText}>
            {trackOthers ? 'Done tracking others ▾' : 'Track for others ▴'}
          </Text>
        </TouchableOpacity>
      )}

      {allEntered && auto !== null && (
        <View style={g.resolveBox}>
          {auto === 'tie' ? (
            <>
              <Text style={g.resolveLabel}>Tied — skin carries over</Text>
              <TouchableOpacity style={g.resolveBtn} onPress={() => onResolve()} activeOpacity={0.8}>
                <Text style={g.resolveBtnText}>Carry Over →</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={g.resolveLabel}>
                {players.find((p) => p.id === auto)?.name} wins{' '}
                {hole.carryoverBefore > 0 ? `${hole.carryoverBefore + 1} skins` : 'the skin'}
              </Text>
              <TouchableOpacity style={g.resolveBtn} onPress={() => onResolve(auto)} activeOpacity={0.8}>
                <Text style={g.resolveBtnText}>
                  {hole.carryoverBefore > 0 ? '🎉 Award Skins' : 'Record Hole →'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      <View style={g.manualBox}>
        <Text style={g.manualLabel}>Or manually assign winner</Text>
        <View style={g.manualBtns}>
          {players.map((p) => (
            <TouchableOpacity key={p.id} style={g.manualPlayerBtn} onPress={() => onResolve(p.id)} activeOpacity={0.8}>
              <Text style={g.manualPlayerBtnText}>{p.name}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={[g.manualPlayerBtn, g.manualNoWinnerBtn]} onPress={() => onResolve()} activeOpacity={0.8}>
            <Text style={[g.manualPlayerBtnText, { color: Colors.muted }]}>No winner</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ─── Resolved hole summary (read-only) ───────────────────────────────────────

function ResolvedHoleView({
  hole, holeNum, players, dollarPerSkin,
}: {
  hole: HoleEntry; holeNum: number; players: Player[]; dollarPerSkin: number;
}) {
  const winner = players.find((p) => p.id === hole.winnerId);
  return (
    <View style={g.holeCard}>
      <View style={[g.potBanner, hole.winnerId ? g.potBannerResolved : g.potBannerCarry]}>
        <Text style={g.potLabelSmall}>Hole {holeNum} result</Text>
        {winner ? (
          <Text style={[g.potAmount, { fontSize: 22 }]}>
            {winner.name} · {hole.skinsWon} skin{hole.skinsWon !== 1 ? 's' : ''} ({fmt(hole.skinsWon * dollarPerSkin)})
          </Text>
        ) : (
          <Text style={[g.potAmount, { fontSize: 22, color: '#d4a020' }]}>Carry →</Text>
        )}
      </View>
      {players.map((p) => {
        const score = hole.scores[p.id];
        const isWinner = p.id === hole.winnerId;
        return (
          <View key={p.id} style={g.scoreRow}>
            <Pip player={p} />
            <Text style={[g.scorePlayerName, isWinner && { fontFamily: Fonts.sansSemiBold }]}>{p.name}</Text>
            <Text style={[g.stepValue, score == null && g.stepValueDim, isWinner && { color: Colors.green }]}>
              {score ?? '—'}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── Playing phase ────────────────────────────────────────────────────────────

function PlayingPhase({
  holes, players, myId, trackOthers, onToggleTrackOthers,
  currentHole, viewingHole, dollarPerSkin, totalHoles,
  skinCounts, onScoreChange, onResolve, onNavigate, onEndRound,
}: {
  holes: HoleEntry[]; players: Player[]; myId: string | null;
  trackOthers: boolean; onToggleTrackOthers: () => void;
  currentHole: number; viewingHole: number;
  dollarPerSkin: number; totalHoles: number;
  skinCounts: Record<string, number>;
  onScoreChange: (holeIdx: number, pid: string, score: number | null) => void;
  onResolve: (holeIdx: number, winnerId?: string) => void;
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

  const lastResolved = currentHole > 0 ? holes[currentHole - 1] : null;
  const isCelebrating =
    viewingHole === currentHole &&
    lastResolved?.resolved &&
    lastResolved.winnerId != null &&
    lastResolved.carryoverBefore > 0;

  const isViewingCurrent = viewingHole === currentHole;
  const viewedHole = holes[viewingHole];

  function circleState(i: number): CircleState {
    if (i < currentHole) return holes[i].winnerId ? 'won' : 'carry';
    if (i === currentHole) return 'active';
    return 'future';
  }

  return (
    <View style={g.root}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.green }}>
        <View style={g.topBar}>
          <Text style={g.topBarSub}>Hole {viewingHole + 1} of {totalHoles}</Text>
          <Text style={g.topBarTitle}>Skins</Text>
          <TouchableOpacity onPress={onEndRound} activeOpacity={0.7} style={g.topBarEndHit}>
            <Text style={g.topBarEnd}>End</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[g.playContent, { paddingBottom: insets.bottom + 72 }]}
      >
        <View style={g.stripWrap}>
          <ScrollView
            ref={stripRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={g.stripContent}
          >
            {Array.from({ length: totalHoles }, (_, i) => (
              <HoleCircle
                key={i}
                holeNum={i + 1}
                state={circleState(i)}
                isViewing={i === viewingHole}
                onPress={() => onNavigate(i)}
              />
            ))}
          </ScrollView>
        </View>

        {isCelebrating && lastResolved && (
          <View style={g.celebBanner}>
            <Text style={g.celebEmoji}>🎉</Text>
            <Text style={g.celebText}>
              {players.find((p) => p.id === lastResolved.winnerId)?.name} just won{' '}
              {lastResolved.skinsWon} skins — {fmt(lastResolved.skinsWon * dollarPerSkin)}!
            </Text>
          </View>
        )}

        {viewedHole && (
          isViewingCurrent && !viewedHole.resolved ? (
            <HoleCard
              hole={viewedHole}
              players={players}
              myId={myId}
              trackOthers={trackOthers}
              onToggleTrackOthers={onToggleTrackOthers}
              dollarPerSkin={dollarPerSkin}
              onScoreChange={(pid, score) => onScoreChange(viewingHole, pid, score)}
              onResolve={(winnerId) => onResolve(viewingHole, winnerId)}
            />
          ) : (
            <ResolvedHoleView
              hole={viewedHole}
              holeNum={viewingHole + 1}
              players={players}
              dollarPerSkin={dollarPerSkin}
            />
          )
        )}

        <View style={g.scoreboardCard}>
          <Text style={g.scoreboardTitle}>Standings</Text>
          {players.map((p) => (
            <View key={p.id} style={g.scoreboardRow}>
              <Pip player={p} />
              <Text style={g.scoreboardName}>{p.name}</Text>
              <Text style={g.scoreboardSkins}>{skinCounts[p.id]} skin{skinCounts[p.id] !== 1 ? 's' : ''}</Text>
              <Text style={g.scoreboardValue}>{fmt(skinCounts[p.id] * dollarPerSkin)}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={[g.bottomBar, { paddingBottom: insets.bottom + 10 }]}>
        <TouchableOpacity
          style={[g.navBtn, viewingHole === 0 && g.navBtnDisabled]}
          activeOpacity={viewingHole === 0 ? 1 : 0.7}
          onPress={() => viewingHole > 0 && onNavigate(viewingHole - 1)}
        >
          <Text style={[g.navBtnText, viewingHole === 0 && g.navBtnTextDisabled]}>← Prev</Text>
        </TouchableOpacity>

        <Text style={g.navCenter}>{viewingHole + 1} / {totalHoles}</Text>

        <TouchableOpacity
          style={[g.navBtn, isViewingCurrent && currentHole === totalHoles - 1 && g.navBtnFinish]}
          activeOpacity={0.7}
          onPress={() => {
            if (isViewingCurrent && !holes[viewingHole]?.resolved) {
              // Auto-carryover: no scores entered or not yet resolved — move on
              onResolve(viewingHole, undefined);
            } else if (viewingHole < totalHoles - 1) {
              onNavigate(viewingHole + 1);
            } else {
              onEndRound();
            }
          }}
        >
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
  players, dollarPerSkin, skinCounts, nets, transactions, totalSkinsAwarded, onDone,
}: {
  players: Player[];
  dollarPerSkin: number; skinCounts: Record<string, number>;
  nets: Record<string, number>; transactions: Transaction[];
  totalSkinsAwarded: number; onDone: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={g.root}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.green }}>
        <View style={g.topBar}>
          <Text style={g.topBarTitle}>Final Settlement</Text>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={[g.settleContent, { paddingBottom: insets.bottom + 32 }]}>
        <Text style={g.settleSubhead}>
          {totalSkinsAwarded} skin{totalSkinsAwarded !== 1 ? 's' : ''} awarded · {fmt(totalSkinsAwarded * dollarPerSkin)} total pot
        </Text>

        <View style={g.fieldCard}>
          {players.map((p, i) => {
            const net = nets[p.id];
            const isLast = i === players.length - 1;
            return (
              <View key={p.id} style={[g.settleRow, !isLast && g.settleRowBorder]}>
                <Pip player={p} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={g.settleName}>{p.name}</Text>
                  <Text style={g.settleSkinsLine}>{skinCounts[p.id]} skin{skinCounts[p.id] !== 1 ? 's' : ''}</Text>
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
            <Text style={g.noTxnText}>Everyone's even — nothing to settle.</Text>
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

export default function SkinsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id ?? (__DEV__ ? '46bae3d3-2c18-450e-b267-f36b91a94a31' : null);

  const [players, setPlayers] = useState<Player[]>([]);
  const [myId, setMyId] = useState<string | null>(null);
  const [trackOthers, setTrackOthers] = useState(false);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<'setup' | 'playing' | 'settled'>('setup');
  const [dollarPerSkin, setDollarPerSkin] = useState(5);
  const [totalHoles, setTotalHoles] = useState<number>(18);
  const [holes, setHoles] = useState<HoleEntry[]>([]);
  const [currentHole, setCurrentHole] = useState(0);
  const [viewingHole, setViewingHole] = useState(0);
  const [hostId, setHostId] = useState<string>('');
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
        return {
          id: p.player_id,
          name: p.profile?.name ?? 'Player',
          initials: p.profile?.initials ?? '?',
          color: p.profile?.avatar_color ?? Colors.green,
          isTempPlayer: false,
        };
      });
  }

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    getRoundWithPlayers(id).then((round) => {
      if (round) {
        const mapped = buildPlayerList(round.players as any[]);
        setPlayers(mapped);
        const myPlayer = mapped.find((p) => p.id === userId) ?? mapped[0] ?? null;
        setMyId(myPlayer?.id ?? null);
        setHostId(round.host_id);
        if (round.skins_bet_cents > 0) setDollarPerSkin(round.skins_bet_cents / 100);
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
      const myPlayer = mapped.find((p) => p.id === userId) ?? mapped[0] ?? null;
      setMyId(myPlayer?.id ?? null);
    }
  }

  const skinCounts = useMemo(() => {
    const c: Record<string, number> = Object.fromEntries(players.map((p) => [p.id, 0]));
    for (const h of holes) if (h.resolved && h.winnerId) c[h.winnerId] += h.skinsWon;
    return c;
  }, [holes, players]);

  const totalSkinsAwarded = useMemo(
    () => Object.values(skinCounts).reduce((a, b) => a + b, 0),
    [skinCounts],
  );

  const nets = useMemo(() => {
    const totalPot = totalSkinsAwarded * dollarPerSkin;
    const share = players.length > 0 ? totalPot / players.length : 0;
    return Object.fromEntries(players.map((p) => [p.id, skinCounts[p.id] * dollarPerSkin - share]));
  }, [skinCounts, totalSkinsAwarded, dollarPerSkin, players]);

  const transactions = useMemo(() => minimumTransactions(nets, players), [nets, players]);

  async function startGame() {
    const [dbScores, dbTempScores, dbSkins] = await Promise.all([
      id ? getScores(id) : Promise.resolve([]),
      id ? getTempScores(id) : Promise.resolve([]),
      id ? getSkinsResults(id) : Promise.resolve([]),
    ]);

    // Reconstruct hole state from persisted data
    let carryover = 0;
    const h = Array.from({ length: totalHoles }, (_, i) => {
      const holeNum = i + 1;
      const entry = blankHole(carryover, players);

      for (const p of players) {
        const s = p.isTempPlayer
          ? dbTempScores.find((ts) => ts.temp_player_id === p.id && ts.hole_number === holeNum)
          : dbScores.find((ds) => ds.player_id === p.id && ds.hole_number === holeNum);
        if (s) entry.scores[p.id] = s.strokes;
      }

      const skinResult = dbSkins.find((r) => r.hole_number === holeNum);
      if (skinResult) {
        entry.resolved = true;
        entry.winnerId = skinResult.winner_id;
        entry.skinsWon = skinResult.winner_id ? Math.round(skinResult.pot_value / dollarPerSkin) : 0;
        carryover = skinResult.winner_id ? 0 : carryover + 1;
      }

      return entry;
    });

    const firstUnresolved = h.findIndex((hole) => !hole.resolved);
    const startIdx = firstUnresolved === -1 ? totalHoles - 1 : firstUnresolved;
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
    const isTempPlayer = players.find((p) => p.id === pid)?.isTempPlayer ?? false;
    if (isTempPlayer) {
      upsertTempScore(id, pid, holeIdx + 1, score);
    } else {
      upsertScore(id, pid, holeIdx + 1, score, userId ?? undefined);
    }
  }

  function handleResolve(holeIdx: number, winnerId?: string) {
    setHoles((prev) => {
      const next = [...prev];
      const hole = { ...next[holeIdx] };
      const skinsThisHole = hole.carryoverBefore + 1;
      hole.winnerId = winnerId ?? null;
      hole.skinsWon = winnerId ? skinsThisHole : 0;
      hole.resolved = true;
      next[holeIdx] = hole;
      if (holeIdx + 1 < next.length) {
        next[holeIdx + 1] = { ...next[holeIdx + 1], carryoverBefore: winnerId ? 0 : hole.carryoverBefore + 1 };
      }
      if (id) {
        upsertSkinsResult({
          round_id: id,
          hole_number: holeIdx + 1,
          winner_id: winnerId ?? null,
          pot_value: skinsThisHole * dollarPerSkin,
        });
      }
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
    return (
      <View style={[g.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={Colors.cream} />
      </View>
    );
  }

  if (phase === 'setup') {
    return (
      <>
        <SetupPhase
          players={players}
          dollarPerSkin={dollarPerSkin} setDollarPerSkin={setDollarPerSkin}
          totalHoles={totalHoles} setTotalHoles={setTotalHoles}
          onStart={startGame}
          onBack={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}
          onEditPlayers={() => setShowEditSheet(true)}
        />
        <EditPlayersSheet
          roundId={id ?? ''}
          hostId={hostId}
          visible={showEditSheet}
          currentUserId={userId}
          onClose={() => setShowEditSheet(false)}
          onDone={reloadPlayers}
        />
      </>
    );
  }

  if (phase === 'playing') {
    return (
      <PlayingPhase
        holes={holes}
        players={players}
        myId={myId}
        trackOthers={trackOthers}
        onToggleTrackOthers={() => setTrackOthers((v) => !v)}
        currentHole={currentHole}
        viewingHole={viewingHole}
        dollarPerSkin={dollarPerSkin}
        totalHoles={totalHoles}
        skinCounts={skinCounts}
        onScoreChange={handleScoreChange}
        onResolve={handleResolve}
        onNavigate={(i) => setViewingHole(Math.min(i, currentHole))}
        onEndRound={() => setPhase('settled')}
      />
    );
  }

  return (
    <SettlementPhase
      players={players}
      dollarPerSkin={dollarPerSkin} skinCounts={skinCounts}
      nets={nets} transactions={transactions}
      totalSkinsAwarded={totalSkinsAwarded}
      onDone={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}
    />
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const g = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.green },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 16, paddingVertical: 12, position: 'relative',
  },
  topBarTitle: { fontFamily: Fonts.serifMedium, fontSize: 18, color: Colors.cream },
  topBarSub: { position: 'absolute', left: 16, fontFamily: Fonts.sans, fontSize: 12, color: 'rgba(216,214,175,0.6)' },
  topBarBack: { fontFamily: Fonts.sans, fontSize: 13, color: 'rgba(216,214,175,0.6)' },
  topBarBackHit: { position: 'absolute', left: 0, paddingHorizontal: 16, paddingVertical: 12 },
  topBarEnd: { fontFamily: Fonts.sansMedium, fontSize: 13, color: 'rgba(216,214,175,0.7)' },
  topBarEndHit: { position: 'absolute', right: 0, paddingHorizontal: 16, paddingVertical: 12 },

  // Hole strip
  stripWrap: { backgroundColor: Colors.bg, paddingVertical: 12 },
  stripContent: { gap: CIRCLE_GAP, paddingHorizontal: 16 },
  circle: {
    width: CIRCLE_SIZE, height: CIRCLE_SIZE, borderRadius: CIRCLE_SIZE / 2,
    borderWidth: 1.5, alignItems: 'center', justifyContent: 'center',
  },
  circleViewing: { borderWidth: 2.5 },
  circleText: { fontFamily: Fonts.sansSemiBold, fontSize: 11 },

  // Content areas
  setupContent:  { backgroundColor: Colors.bg, padding: Spacing.lg },
  playContent:   { backgroundColor: Colors.bg, gap: 12 },
  settleContent: { backgroundColor: Colors.bg, padding: Spacing.lg, gap: 12 },

  setupHeading: { fontFamily: Fonts.serifMedium, fontSize: 24, color: Colors.text, marginBottom: 20, marginTop: 4 },
  setupNote: { paddingVertical: 10, alignItems: 'center' },
  setupNoteText: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.muted },

  settleSubhead: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.muted, marginBottom: 4 },
  sectionHead: {
    fontFamily: Fonts.sansSemiBold, fontSize: 11, color: Colors.muted,
    textTransform: 'uppercase', letterSpacing: 1, marginTop: 8,
  },

  // Field cards
  fieldCard: {
    backgroundColor: Colors.card, borderRadius: 14, borderWidth: 0.5,
    borderColor: Colors.border, padding: 16, gap: 12,
  },
  fieldLabel: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.muted },

  // Stepper
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.creamLight, alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { fontFamily: Fonts.sansSemiBold, fontSize: 16, color: Colors.green, lineHeight: 19 },
  stepValue: { fontFamily: Fonts.sansSemiBold, fontSize: 16, color: Colors.text, minWidth: 32, textAlign: 'center' },
  stepValueDim: { color: Colors.muted },

  // Segment
  segRow: { flexDirection: 'row', gap: 8 },
  seg: { flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.creamLight, alignItems: 'center' },
  segActive: { backgroundColor: Colors.green },
  segText: { fontFamily: Fonts.sansMedium, fontSize: 14, color: Colors.text },
  segTextActive: { color: Colors.cream },

  customHolesInput: {
    fontFamily: Fonts.sansSemiBold, fontSize: 20, color: Colors.text,
    backgroundColor: Colors.creamLight, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    textAlign: 'center',
  },

  // Players setup
  cardLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  editLink: { fontFamily: Fonts.sansMedium, fontSize: 13, color: Colors.green },
  playerList: { gap: 10 },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  playerName: { fontFamily: Fonts.sans, fontSize: 14, color: Colors.text, flex: 1 },
  guestBadge: { fontFamily: Fonts.sans, fontSize: 11, color: Colors.muted },

  // Pip
  pip: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  pipText: { fontFamily: Fonts.sansSemiBold, fontSize: 11, color: '#fff' },

  // Hole card
  holeCard: { backgroundColor: Colors.card, borderRadius: 14, borderWidth: 0.5, borderColor: Colors.border, overflow: 'hidden', marginHorizontal: 16 },
  potBanner: {
    backgroundColor: Colors.creamLight, paddingHorizontal: 16, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center',
  },
  potBannerHot:      { backgroundColor: '#fef3c0' },
  potBannerResolved: { backgroundColor: '#e8f4e8' },
  potBannerCarry:    { backgroundColor: '#fef9e7' },
  potEmojiRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginBottom: 2 },
  potLabelSmall: { fontFamily: Fonts.sans, fontSize: 11, color: Colors.muted, paddingBottom: 2 },
  potAmount: { fontFamily: Fonts.serifMedium, color: Colors.text },
  noWinnerPill: {
    backgroundColor: 'rgba(0,0,0,0.07)', borderRadius: 20,
    paddingHorizontal: 11, paddingVertical: 6,
  },
  noWinnerPillText: { fontFamily: Fonts.sansMedium, fontSize: 12, color: Colors.muted },

  scoreRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingVertical: 12, borderTopWidth: 0.5, borderTopColor: Colors.border, gap: 10,
  },
  scorePlayerName: { flex: 1, fontFamily: Fonts.sans, fontSize: 14, color: Colors.text },

  trackToggle: { paddingVertical: 11, alignItems: 'center', borderTopWidth: 0.5, borderTopColor: Colors.border },
  trackToggleText: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.muted },

  resolveBox: { borderTopWidth: 0.5, borderTopColor: Colors.border, padding: 14, gap: 8, backgroundColor: '#f8f6ef' },
  resolveLabel: { fontFamily: Fonts.sansMedium, fontSize: 13, color: Colors.text },
  resolveBtn: { backgroundColor: Colors.green, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  resolveBtnText: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: Colors.cream },

  manualBox: {
    borderTopWidth: 1.5, borderTopColor: Colors.border,
    backgroundColor: Colors.creamLight,
    padding: 14, gap: 10,
    borderBottomLeftRadius: 14, borderBottomRightRadius: 14,
  },
  manualLabel: {
    fontFamily: Fonts.sansSemiBold, fontSize: 10, color: Colors.muted,
    textTransform: 'uppercase', letterSpacing: 1,
  },
  manualBtns: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  manualPlayerBtn: {
    backgroundColor: Colors.card, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 0.5, borderColor: Colors.border,
  },
  manualNoWinnerBtn: { borderColor: '#c8c4b0' },
  manualPlayerBtnText: { fontFamily: Fonts.sansMedium, fontSize: 12, color: Colors.text },

  // Celebration
  celebBanner: { backgroundColor: Colors.green, borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16 },
  celebEmoji: { fontSize: 28 },
  celebText: { flex: 1, fontFamily: Fonts.sansSemiBold, fontSize: 14, color: Colors.cream, lineHeight: 20 },

  // Scoreboard
  scoreboardCard: { backgroundColor: Colors.card, borderRadius: 14, borderWidth: 0.5, borderColor: Colors.border, padding: 14, gap: 10, marginHorizontal: 16 },
  scoreboardTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 11, color: Colors.muted, textTransform: 'uppercase', letterSpacing: 1 },
  scoreboardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  scoreboardName: { flex: 1, fontFamily: Fonts.sans, fontSize: 13, color: Colors.text },
  scoreboardSkins: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.muted, marginRight: 6 },
  scoreboardValue: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: Colors.text, minWidth: 32, textAlign: 'right' },

  // Fixed bottom nav
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: Colors.bg, borderTopWidth: 0.5, borderTopColor: Colors.border,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 12,
  },
  navBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 10, backgroundColor: Colors.creamLight, minWidth: 90, alignItems: 'center' },
  navBtnDisabled: { opacity: 0.35 },
  navBtnFinish: { backgroundColor: Colors.green },
  navBtnText: { fontFamily: Fonts.sansMedium, fontSize: 14, color: Colors.text },
  navBtnTextDisabled: { color: Colors.muted },
  navBtnTextFinish: { color: Colors.cream },
  navCenter: { fontFamily: Fonts.sansMedium, fontSize: 13, color: Colors.muted },

  // Settlement
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

  // Shared
  primaryBtn: { backgroundColor: Colors.green, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  primaryBtnText: { fontFamily: Fonts.sansSemiBold, fontSize: 16, color: Colors.cream },
});
