import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { TopBar } from '@/components/TopBar';
import { Colors, Fonts } from '@/constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Player {
  id: string;
  initials: string;
  bg: string;
  textColor: string;
  name: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_YARDAGE = 380;
const PAR_OPTIONS = [3, 4, 5] as const;
type ParValue = (typeof PAR_OPTIONS)[number];

// ─── Mock data ────────────────────────────────────────────────────────────────

const ROUND = {
  course: 'Cog Hill No. 4 🌿',
  meta: 'Stroke play · Sat May 17',
  totalHoles: 18,
  startingHole: 7,
};

const PLAYERS: Player[] = [
  { id: 'wk', initials: 'WK', bg: Colors.creamLight, textColor: Colors.green, name: 'Wyatt K.' },
  { id: 'mr', initials: 'MR', bg: '#c8a96e', textColor: '#fff', name: 'Mike R.' },
  { id: 'dk', initials: 'DK', bg: '#5a8a5a', textColor: '#fff', name: 'Dave K.' },
  { id: 'pw', initials: 'PW', bg: '#7a6a9a', textColor: '#fff', name: 'Pete W.' },
];

const ME = PLAYERS[0];
const OTHERS = PLAYERS.slice(1);

const PARS: Record<number, number> = {
  1: 4, 2: 5, 3: 3, 4: 4, 5: 4, 6: 3, 7: 4, 8: 5, 9: 4,
  10: 4, 11: 3, 12: 5, 13: 4, 14: 4, 15: 3, 16: 4, 17: 5, 18: 4,
};

const YARDAGES: Record<number, number> = {
  1: 385, 2: 520, 3: 175, 4: 430, 5: 380, 6: 165, 7: 410, 8: 545, 9: 395,
  10: 420, 11: 185, 12: 535, 13: 405, 14: 380, 15: 170, 16: 395, 17: 545, 18: 440,
};

const INITIAL_SCORES: Record<string, Record<number, number>> = {
  wk: { 1: 4, 2: 5, 3: 4, 4: 4, 5: 5, 6: 3 },
  mr: { 1: 5, 2: 4, 3: 3, 4: 5, 5: 4, 6: 4 },
  dk: { 1: 4, 2: 6, 3: 3, 4: 4, 5: 4, 6: 3 },
  pw: { 1: 5, 2: 5, 3: 4, 4: 4, 5: 5, 6: 4 },
};

const COMPLETED_HOLES = 6;
const TAB_ITEM_WIDTH = 40; // 34px circle + 6px gap

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toParLabel(diff: number): string {
  if (diff === 0) return 'E';
  return diff > 0 ? `+${diff}` : `${diff}`;
}

function toParColor(diff: number): string {
  if (diff <= -2) return '#1a7a1a';
  if (diff === -1) return '#2a9a2a';
  if (diff === 0) return Colors.muted;
  if (diff === 1) return '#c08a20';
  return '#b04030';
}

function calcStandings(
  scores: Record<string, Record<number, number | null>>,
  holePars: Record<number, number | null>,
  throughHole: number,
) {
  return PLAYERS.map((p) => {
    let diff = 0;
    for (let h = 1; h <= throughHole; h++) {
      const score = scores[p.id]?.[h];
      const par = holePars[h];
      if (score != null && par != null) diff += score - par;
    }
    return { player: p, diff };
  }).sort((a, b) => a.diff - b.diff);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function HoleTab({
  hole, isActive, isComplete, onPress,
}: {
  hole: number; isActive: boolean; isComplete: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <View style={[s.holeTab, isActive && s.holeTabActive, isComplete && s.holeTabComplete]}>
        <Text style={[
          s.holeTabNum,
          isActive && { color: Colors.cream },
          isComplete && { color: Colors.text },
        ]}>
          {hole}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function ParChipsRow({
  confirmedPar,
  onSelect,
}: {
  confirmedPar: number | null;
  onSelect: (p: ParValue) => void;
}) {
  return (
    <View style={[s.infoRow, s.infoRowBorder]}>
      <Text style={s.infoLabel}>Par</Text>
      <View style={s.parChips}>
        {PAR_OPTIONS.map((p) => {
          const isSelected = confirmedPar === p;
          return (
            <TouchableOpacity
              key={p}
              onPress={() => onSelect(p)}
              activeOpacity={0.7}
              style={[s.parChip, isSelected && s.parChipSelected]}
            >
              <Text style={[s.parChipText, isSelected && s.parChipTextSelected]}>
                {p}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function YardageRow({
  defaultValue,
  isConfirmed,
  onChangeText,
}: {
  defaultValue: string;
  isConfirmed: boolean;
  onChangeText: (t: string) => void;
}) {
  return (
    <View style={s.infoRow}>
      <Text style={s.infoLabel}>Yardage</Text>
      <TextInput
        style={[s.infoInput, isConfirmed ? s.infoInputConfirmed : s.infoInputPlaceholder]}
        defaultValue={defaultValue}
        onChangeText={onChangeText}
        keyboardType="numeric"
        placeholder={`${DEFAULT_YARDAGE}`}
        placeholderTextColor={Colors.muted}
        textAlign="right"
        maxLength={4}
        returnKeyType="done"
        onSubmitEditing={() => Keyboard.dismiss()}
      />
    </View>
  );
}

function ScoreRow({
  player, score, confirmedPar, displayPar, showBorder, readOnly, onDecrement, onIncrement,
}: {
  player: Player;
  score: number | null;
  confirmedPar: number | null;
  displayPar: number;
  showBorder: boolean;
  readOnly: boolean;
  onDecrement: () => void;
  onIncrement: () => void;
}) {
  const diff = (score !== null && confirmedPar !== null) ? score - confirmedPar : null;

  return (
    <View style={[s.scoreRow, showBorder && s.scoreRowBorder]}>
      <View style={s.scoreLeft}>
        <Avatar
          initials={player.initials}
          bg={player.bg}
          textColor={player.textColor}
          size={30}
          borderWidth={0}
          borderColor="transparent"
        />
        <Text style={s.scorePlayerName}>{player.name}</Text>
      </View>

      {readOnly ? (
        <View style={s.scoreNums}>
          <Text style={[s.scoreNum, score === null && s.scoreNumEmpty]}>
            {score !== null ? score : '–'}
          </Text>
          {diff !== null && (
            <Text style={[s.scoreDiff, { color: toParColor(diff) }]}>{toParLabel(diff)}</Text>
          )}
        </View>
      ) : (
        <View style={s.scoreControls}>
          <TouchableOpacity
            onPress={onDecrement}
            activeOpacity={0.7}
            style={s.scoreBtn}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Text style={s.scoreBtnText}>−</Text>
          </TouchableOpacity>

          <View style={s.scoreNums}>
            <Text style={[s.scoreNum, score === null && s.scoreNumEmpty]}>
              {score !== null ? score : '–'}
            </Text>
            {diff !== null && (
              <Text style={[s.scoreDiff, { color: toParColor(diff) }]}>{toParLabel(diff)}</Text>
            )}
          </View>

          <TouchableOpacity
            onPress={onIncrement}
            activeOpacity={0.7}
            style={s.scoreBtn}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Text style={s.scoreBtnText}>+</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function TrackOthersToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <TouchableOpacity onPress={onToggle} activeOpacity={0.7} style={s.trackToggle}>
      <Text style={s.trackToggleText}>
        {open ? 'Hide others ▴' : 'Track for others ▾'}
      </Text>
    </TouchableOpacity>
  );
}

function StandingRow({
  player, diff, rank, showBorder,
}: {
  player: Player; diff: number; rank: number; showBorder: boolean;
}) {
  return (
    <View style={[s.standingRow, showBorder && s.standingRowBorder]}>
      <Text style={s.standingRank}>{rank}</Text>
      <Avatar
        initials={player.initials}
        bg={player.bg}
        textColor={player.textColor}
        size={24}
        borderWidth={0}
        borderColor="transparent"
      />
      <Text style={s.standingName}>{player.name}</Text>
      <Text style={[s.standingDiff, { color: toParColor(diff) }]}>{toParLabel(diff)}</Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ScorecardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const holeTabsRef = useRef<ScrollView>(null);
  const isFirstRender = useRef(true);

  const [activeHole, setActiveHole] = useState(ROUND.startingHole);
  const [trackOthers, setTrackOthers] = useState(false);
  const [unlockedHoles, setUnlockedHoles] = useState<Record<number, boolean>>({});

  const [holePars, setHolePars] = useState<Record<number, number | null>>(() => {
    const init: Record<number, number | null> = {};
    for (let h = 1; h <= COMPLETED_HOLES; h++) init[h] = PARS[h];
    return init;
  });

  const [holeYardageTexts, setHoleYardageTexts] = useState<Record<number, string>>(() => {
    const init: Record<number, string> = {};
    for (let h = 1; h <= COMPLETED_HOLES; h++) init[h] = `${YARDAGES[h]}`;
    return init;
  });

  const [scores, setScores] = useState<Record<string, Record<number, number | null>>>(() => {
    const init: Record<string, Record<number, number | null>> = {};
    for (const p of PLAYERS) {
      init[p.id] = {};
      for (let h = 1; h <= ROUND.totalHoles; h++) {
        init[p.id][h] = INITIAL_SCORES[p.id]?.[h] ?? null;
      }
    }
    return init;
  });

  // Auto-scroll tabs to keep active hole visible
  useEffect(() => {
    const scrollX = Math.max(0, (activeHole - 1) * TAB_ITEM_WIDTH - 162);
    holeTabsRef.current?.scrollTo({ x: scrollX, animated: !isFirstRender.current });
    isFirstRender.current = false;
  }, [activeHole]);

  function updateScore(playerId: string, hole: number, delta: number) {
    setScores((prev) => {
      const current = prev[playerId]?.[hole] ?? null;
      const next = current === null ? (holePars[hole] ?? 4) : Math.max(1, current + delta);
      return { ...prev, [playerId]: { ...prev[playerId], [hole]: next } };
    });
  }

  const confirmedPar = holePars[activeHole] ?? null;
  const displayPar = confirmedPar ?? 4;
  const yardageText = holeYardageTexts[activeHole] ?? '';
  const isYardageConfirmed = yardageText.length > 0;
  const isLockedHole = activeHole <= COMPLETED_HOLES && !unlockedHoles[activeHole];
  const completedThrough = activeHole - 1;

  const hasStandingsData = completedThrough > 0 &&
    Object.entries(holePars).some(([h, par]) => parseInt(h) <= completedThrough && par !== null);
  const standings = hasStandingsData ? calcStandings(scores, holePars, completedThrough) : [];

  const isLastHole = activeHole === ROUND.totalHoles;

  function goNext() {
    Keyboard.dismiss();
    if (isLastHole) {
      Alert.alert('Wrap it up?', 'End the round and see final scores.', [
        { text: 'Keep playing', style: 'cancel' },
        { text: 'Finish round', onPress: () => router.push('/post-round/1') },
      ]);
    } else {
      setActiveHole((h) => h + 1);
    }
  }

  function goPrev() {
    Keyboard.dismiss();
    setActiveHole((h) => Math.max(1, h - 1));
  }

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.green }}>
        <TopBar
          left={
            <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
              <Text style={s.backBtn}>← Back</Text>
            </TouchableOpacity>
          }
          right={<Text style={s.liveBadge}>● Live</Text>}
        />
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {/* ── Green header ── */}
        <View style={s.header}>
          <Text style={s.courseName}>{ROUND.course}</Text>
          <Text style={s.meta}>{ROUND.meta}</Text>
          <View style={s.avatarStack}>
            {PLAYERS.map((p, i) => (
              <Avatar
                key={p.id}
                initials={p.initials}
                bg={p.bg}
                textColor={p.textColor}
                size={30}
                borderColor={Colors.green}
                borderWidth={2}
                style={{ marginRight: -7, zIndex: PLAYERS.length - i }}
              />
            ))}
          </View>
        </View>

        {/* ── Drawer ── */}
        <View style={s.drawer}>
          <View style={s.handle} />

          {/* Hole tabs */}
          <ScrollView
            ref={holeTabsRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={s.holeTabsContent}
            style={s.holeTabs}
          >
            {Array.from({ length: ROUND.totalHoles }, (_, i) => i + 1).map((hole) => (
              <HoleTab
                key={hole}
                hole={hole}
                isActive={hole === activeHole}
                isComplete={hole < activeHole}
                onPress={() => { Keyboard.dismiss(); setActiveHole(hole); }}
              />
            ))}
          </ScrollView>

          {/* Hole label */}
          <Text style={s.sectionLabel}>HOLE {activeHole}</Text>

          {/* Par + yardage */}
          <View style={[s.card, { marginBottom: 12 }]}>
            <ParChipsRow
              confirmedPar={confirmedPar}
              onSelect={(p) => setHolePars((prev) => ({ ...prev, [activeHole]: p }))}
            />
            <YardageRow
              key={activeHole}
              defaultValue={yardageText}
              isConfirmed={isYardageConfirmed}
              onChangeText={(t) =>
                setHoleYardageTexts((prev) => ({ ...prev, [activeHole]: t }))
              }
            />
          </View>

          {/* Score entry */}
          <View style={s.card}>
            <ScoreRow
              player={ME}
              score={scores[ME.id]?.[activeHole] ?? null}
              confirmedPar={confirmedPar}
              displayPar={displayPar}
              showBorder
              readOnly={isLockedHole}
              onDecrement={() => updateScore(ME.id, activeHole, -1)}
              onIncrement={() => updateScore(ME.id, activeHole, 1)}
            />
            {trackOthers && OTHERS.map((p) => (
              <ScoreRow
                key={p.id}
                player={p}
                score={scores[p.id]?.[activeHole] ?? null}
                confirmedPar={confirmedPar}
                displayPar={displayPar}
                showBorder
                readOnly={isLockedHole}
                onDecrement={() => updateScore(p.id, activeHole, -1)}
                onIncrement={() => updateScore(p.id, activeHole, 1)}
              />
            ))}
            <TrackOthersToggle open={trackOthers} onToggle={() => setTrackOthers((v) => !v)} />
          </View>

          {/* Unlock completed holes */}
          {isLockedHole && (
            <TouchableOpacity
              style={s.adjustLink}
              activeOpacity={0.7}
              onPress={() => setUnlockedHoles((prev) => ({ ...prev, [activeHole]: true }))}
            >
              <Text style={s.adjustLinkText}>Adjust scores ›</Text>
            </TouchableOpacity>
          )}

          {/* Standings */}
          {hasStandingsData && (
            <>
              <Text style={[s.sectionLabel, { marginBottom: 10 }]}>The board 📊</Text>
              <View style={s.card}>
                {standings.map((item, i) => (
                  <StandingRow
                    key={item.player.id}
                    player={item.player}
                    diff={item.diff}
                    rank={i + 1}
                    showBorder={i < standings.length - 1}
                  />
                ))}
              </View>
            </>
          )}
        </View>
      </ScrollView>

      {/* ── Fixed bottom bar — stays above keyboard via KeyboardAvoidingView ── */}
      <View style={s.bottomBar}>
        <View style={[s.bottomBarInner, { paddingBottom: insets.bottom + 10 }]}>
          <TouchableOpacity
            onPress={goPrev}
            activeOpacity={activeHole === 1 ? 1 : 0.7}
            style={[s.holeNavBtn, activeHole === 1 && s.holeNavBtnDisabled]}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Text style={[s.holeNavBtnText, activeHole === 1 && s.holeNavBtnTextDisabled]}>
              ← Prev
            </Text>
          </TouchableOpacity>

          <Text style={s.holeNavCenter}>{activeHole} / {ROUND.totalHoles}</Text>

          <TouchableOpacity
            onPress={goNext}
            activeOpacity={0.7}
            style={[s.holeNavBtn, isLastHole && s.holeNavBtnFinish]}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Text style={[s.holeNavBtnText, isLastHole && s.holeNavBtnTextFinish]}>
              {isLastHole ? 'Finish 🏁' : 'Next →'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.green },

  backBtn: { fontFamily: Fonts.sans, fontSize: 13, color: 'rgba(216,214,175,0.6)' },
  liveBadge: { fontFamily: Fonts.sans, fontSize: 12, color: '#5aaa5a' },

  // Header
  header: { backgroundColor: Colors.green, paddingHorizontal: 18, paddingBottom: 30 },
  courseName: { fontFamily: Fonts.serifMedium, fontSize: 23, color: Colors.cream, marginBottom: 4 },
  meta: { fontFamily: Fonts.sans, fontSize: 13, color: 'rgba(216,214,175,0.6)', marginBottom: 14 },
  avatarStack: { flexDirection: 'row' },

  // Drawer
  drawer: {
    backgroundColor: Colors.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -12,
    paddingTop: 22,
    paddingHorizontal: 16,
  },
  handle: {
    width: 32,
    height: 3,
    backgroundColor: '#d8d4c0',
    borderRadius: 4,
    alignSelf: 'center',
    marginBottom: 16,
  },

  // Hole tabs
  holeTabs: { marginBottom: 16 },
  holeTabsContent: { gap: 6, paddingHorizontal: 2 },
  holeTab: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  holeTabActive: { backgroundColor: Colors.green, borderColor: Colors.green },
  holeTabComplete: { backgroundColor: Colors.card, borderColor: Colors.border },
  holeTabNum: { fontFamily: Fonts.sansMedium, fontSize: 12, color: Colors.muted },

  sectionLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 10,
    color: Colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 10,
  },

  // Shared card
  card: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    marginBottom: 20,
  },

  // Par chips + yardage rows
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 11,
  },
  infoRowBorder: { borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  infoLabel: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.muted },
  parChips: { flexDirection: 'row', gap: 6 },
  parChip: {
    width: 38,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.creamLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  parChipSelected: { backgroundColor: Colors.green, borderColor: Colors.green },
  parChipText: { fontFamily: Fonts.sansMedium, fontSize: 13, color: Colors.muted },
  parChipTextSelected: { color: Colors.cream },
  infoInput: {
    fontFamily: Fonts.sansMedium,
    fontSize: 13,
    minWidth: 60,
    textAlign: 'right',
    padding: 0,
  },
  infoInputConfirmed: { color: Colors.text },
  infoInputPlaceholder: { color: Colors.muted },

  // Score entry
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  scoreRowBorder: { borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  scoreLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  scorePlayerName: { fontFamily: Fonts.sansMedium, fontSize: 14, color: Colors.text },
  scoreControls: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  scoreBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.creamLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreBtnText: { fontFamily: Fonts.sans, fontSize: 18, color: Colors.text, lineHeight: 22 },
  scoreNums: { alignItems: 'center', width: 40 },
  scoreNum: { fontFamily: Fonts.serifMedium, fontSize: 28, color: Colors.text, lineHeight: 32 },
  scoreNumEmpty: { color: Colors.muted },
  scoreDiff: { fontFamily: Fonts.sansMedium, fontSize: 11, lineHeight: 14 },

  // Track others + adjust link
  trackToggle: {
    paddingVertical: 11,
    alignItems: 'center',
    borderTopWidth: 0.5,
    borderTopColor: Colors.border,
  },
  trackToggleText: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.muted },
  adjustLink: {
    alignSelf: 'flex-end',
    marginTop: -14,
    marginBottom: 16,
    paddingVertical: 4,
  },
  adjustLinkText: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: Colors.muted,
    textDecorationLine: 'underline',
  },

  // Standings — to-par only, no raw strokes mid-round
  standingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 },
  standingRowBorder: { borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  standingRank: { fontFamily: Fonts.sansSemiBold, fontSize: 12, color: Colors.muted, width: 14, textAlign: 'center' },
  standingName: { fontFamily: Fonts.sansMedium, fontSize: 14, color: Colors.text, flex: 1 },
  standingDiff: { fontFamily: Fonts.serifMedium, fontSize: 20, textAlign: 'right' },

  // Fixed bottom bar
  bottomBar: { backgroundColor: Colors.bg, borderTopWidth: 0.5, borderTopColor: Colors.border },
  bottomBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  holeNavBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: Colors.creamLight,
    minWidth: 90,
    alignItems: 'center',
  },
  holeNavBtnDisabled: { opacity: 0.35 },
  holeNavBtnFinish: { backgroundColor: Colors.green },
  holeNavBtnText: { fontFamily: Fonts.sansMedium, fontSize: 14, color: Colors.text },
  holeNavBtnTextDisabled: { color: Colors.muted },
  holeNavBtnTextFinish: { color: Colors.cream },
  holeNavCenter: { fontFamily: Fonts.sansMedium, fontSize: 13, color: Colors.muted },
});
