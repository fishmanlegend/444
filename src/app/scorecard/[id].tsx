import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { useAuth } from '@/context/auth';
import { getRoundWithPlayers, getHoles, getMatchTeams, getMatchHoles, upsertMatchHole, upsertScore, upsertTempScore, getScores, getTempScores, upsertHole } from '@/lib/db';
import { EditPlayersSheet } from '@/components/EditPlayersSheet';
import { trackOthersStore } from '@/lib/trackOthersStore';
import type { RoundFormat, MatchTeam, MatchHole, Hole } from '@/lib/database.types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Player {
  id: string;
  initials: string;
  bg: string;
  textColor: string;
  name: string;
  isTempPlayer: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_YARDAGE = 380;
const PAR_CHIPS = [3, 4, 5] as const;
const TAB_ITEM_WIDTH = 40;

const FORMAT_LABEL: Record<RoundFormat, string> = {
  stroke: 'Stroke', skins: 'Skins', stableford: 'Stableford', match: 'Match', best_ball: 'Best ball', other: 'Other',
};

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
  players: Player[],
) {
  return players.map((p) => {
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
  onSelect: (p: number) => void;
}) {
  const step = (delta: number) => {
    const base = confirmedPar ?? 4;
    onSelect(Math.max(1, base + delta));
  };

  return (
    <View style={[s.infoRow, s.infoRowBorder]}>
      <Text style={s.infoLabel}>Par</Text>
      <View style={s.parChips}>
        <TouchableOpacity
          onPress={() => step(-1)}
          activeOpacity={0.7}
          style={s.parStepper}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Text style={s.parStepperText}>−</Text>
        </TouchableOpacity>
        {PAR_CHIPS.map((p) => {
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
        <TouchableOpacity
          onPress={() => step(1)}
          activeOpacity={0.7}
          style={s.parStepper}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Text style={s.parStepperText}>+</Text>
        </TouchableOpacity>
        {confirmedPar !== null && !PAR_CHIPS.includes(confirmedPar as never) && (
          <View style={s.parChipSelected}>
            <Text style={[s.parChipText, s.parChipTextSelected]}>{confirmedPar}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function YardageRow({
  defaultValue,
  isConfirmed,
  onChangeText,
  onBlur,
}: {
  defaultValue: string;
  isConfirmed: boolean;
  onChangeText: (t: string) => void;
  onBlur?: () => void;
}) {
  return (
    <View style={s.infoRow}>
      <Text style={s.infoLabel}>Yardage</Text>
      <TextInput
        style={[s.infoInput, isConfirmed ? s.infoInputConfirmed : s.infoInputPlaceholder]}
        defaultValue={defaultValue}
        onChangeText={onChangeText}
        keyboardType="numeric"
        placeholder={`e.g., ${DEFAULT_YARDAGE}`}
        placeholderTextColor={Colors.muted}
        textAlign="right"
        maxLength={4}
        returnKeyType="done"
        onSubmitEditing={() => Keyboard.dismiss()}
        onBlur={onBlur}
      />
    </View>
  );
}

function ScoreRow({
  player, score, confirmedPar, showBorder, readOnly, onDecrement, onIncrement,
}: {
  player: Player;
  score: number | null;
  confirmedPar: number | null;
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

function MatchHoleRow({
  holeNumber, result, teamALabel, teamBLabel, onPress,
}: {
  holeNumber: number;
  result: 'a' | 'b' | 'halve' | null;
  teamALabel: string;
  teamBLabel: string;
  onPress: () => void;
}) {
  const CYCLE: Array<'a' | 'b' | 'halve' | null> = ['a', 'halve', 'b', null];
  const label = result === 'a' ? teamALabel : result === 'b' ? teamBLabel : result === 'halve' ? 'Halve' : '–';
  const labelColor = result === null ? Colors.muted : result === 'halve' ? Colors.muted : Colors.text;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={s.matchHoleRow}>
      <Text style={s.matchHoleNum}>Hole {holeNumber}</Text>
      <Text style={[s.matchHoleResult, { color: labelColor }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function cycleMatchResult(current: 'a' | 'b' | 'halve' | null): 'a' | 'b' | 'halve' | null {
  if (current === null) return 'a';
  if (current === 'a') return 'halve';
  if (current === 'halve') return 'b';
  return null;
}

function TrackOthersToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <TouchableOpacity onPress={onToggle} activeOpacity={0.7} style={s.trackToggle}>
      <Text style={s.trackToggleText}>
        {open ? 'Hide others ▾' : 'Track for others ▴'}
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
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id ?? (__DEV__ ? '46bae3d3-2c18-450e-b267-f36b91a94a31' : null);
  const holeTabsRef = useRef<ScrollView>(null);
  const isFirstRender = useRef(true);
  const dbHolesRef = useRef<Hole[]>([]);

  const [phase, setPhase] = useState<'setup' | 'playing'>('setup');
  const [holeMode, setHoleMode] = useState<'9' | '18' | '36' | 'custom'>('18');
  const [customHoleText, setCustomHoleText] = useState('');

  const [players, setPlayers] = useState<Player[]>([]);
  const [me, setMe] = useState<Player | null>(null);
  const [others, setOthers] = useState<Player[]>([]);
  const [totalHoles, setTotalHoles] = useState(18);
  const [startingHole, setStartingHole] = useState(1);
  const [courseName, setCourseName] = useState('');
  const [roundMeta, setRoundMeta] = useState('');
  const [loading, setLoading] = useState(true);

  const [activeHole, setActiveHole] = useState(1);
  const [trackOthers, setTrackOthers] = useState(() => trackOthersStore.get(id ?? ''));
  const [format, setFormat] = useState<RoundFormat>('stroke');

  const [holePars, setHolePars] = useState<Record<number, number | null>>({});
  const [holeYardageTexts, setHoleYardageTexts] = useState<Record<number, string>>({});
  const [scores, setScores] = useState<Record<string, Record<number, number | null>>>({});

  const [matchTeams, setMatchTeams] = useState<MatchTeam[]>([]);
  const [matchHoleResults, setMatchHoleResults] = useState<Record<number, 'a' | 'b' | 'halve' | null>>({});
  const [hostId, setHostId] = useState('');
  const [showEditSheet, setShowEditSheet] = useState(false);

  function buildPlayerList(rawPlayers: any[]): Player[] {
    return rawPlayers
      .filter((p) => p.rsvp === 'in' || p.temp_player_id != null)
      .map((p) => {
        if (p.temp_player_id) {
          const tp = p.temp_player;
          const name = tp?.name ?? 'Guest';
          const initials = name.split(/\s+/).map((w: string) => w[0]?.toUpperCase() ?? '').slice(0, 2).join('') || '?';
          return { id: tp?.id ?? p.temp_player_id, name, initials, bg: '#7a7060', textColor: '#fff', isTempPlayer: true };
        }
        return {
          id: p.player_id,
          name: p.profile?.name ?? 'Player',
          initials: p.profile?.initials ?? '?',
          bg: p.profile?.avatar_color ?? Colors.creamLight,
          textColor: p.profile?.avatar_text_color ?? Colors.green,
          isTempPlayer: false,
        };
      });
  }

  useEffect(() => {
    if (!id) { setLoading(false); return; }

    const fetchData = async () => {
      const [round, holes] = await Promise.all([getRoundWithPlayers(id), getHoles(id)]);
      if (!round) { setLoading(false); return; }

      const mapped = buildPlayerList(round.players as any[]);
      setPlayers(mapped);
      setHostId(round.host_id);

      const myPlayer = mapped.find((p) => p.id === userId) ?? mapped[0] ?? null;
      setMe(myPlayer);
      setOthers(myPlayer ? mapped.filter((p) => p.id !== myPlayer.id) : mapped);

      const nh = round.total_holes ?? 18;
      const sh = round.starting_hole ?? 1;
      setTotalHoles(nh);
      setHoleMode(nh === 9 ? '9' : nh === 18 ? '18' : nh === 36 ? '36' : 'custom');
      if (nh !== 9 && nh !== 18 && nh !== 36) setCustomHoleText(String(nh));
      setStartingHole(sh);
      setActiveHole(sh);
      setCourseName(round.course_name ?? 'Golf Round');
      setFormat(round.format);

      const fmtLabel = FORMAT_LABEL[round.format];
      const dateStr = round.scheduled_at
        ? new Date(round.scheduled_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
        : null;
      setRoundMeta([fmtLabel, dateStr].filter(Boolean).join(' · '));

      const sortedHoles = holes.sort((a, b) => a.hole_number - b.hole_number);
      dbHolesRef.current = sortedHoles;

      if (round.format === 'match') {
        const [teams, mholes] = await Promise.all([getMatchTeams(id), getMatchHoles(id)]);
        setMatchTeams(teams);
        const results: Record<number, 'a' | 'b' | 'halve' | null> = {};
        for (let h = 1; h <= nh; h++) {
          const mh = mholes.find((x) => x.hole_number === h);
          results[h] = mh?.result ?? null;
        }
        setMatchHoleResults(results);
      }

      setLoading(false);
    };

    fetchData();
  }, [id, session]);

  useEffect(() => {
    const scrollX = Math.max(0, (activeHole - 1) * TAB_ITEM_WIDTH - 162);
    holeTabsRef.current?.scrollTo({ x: scrollX, animated: !isFirstRender.current });
    isFirstRender.current = false;
  }, [activeHole]);

  async function reloadPlayers() {
    if (!id) return;
    const round = await getRoundWithPlayers(id);
    if (round) {
      const mapped = buildPlayerList(round.players as any[]);
      setPlayers(mapped);
      const myPlayer = mapped.find((p) => p.id === userId) ?? mapped[0] ?? null;
      setMe(myPlayer);
      setOthers(myPlayer ? mapped.filter((p) => p.id !== myPlayer.id) : mapped);
    }
  }

  function updateScore(playerId: string, hole: number, delta: number) {
    const current = scores[playerId]?.[hole] ?? null;
    const next = current === null ? (holePars[hole] ?? 4) : Math.max(1, current + delta);
    setScores((prev) => ({ ...prev, [playerId]: { ...prev[playerId], [hole]: next } }));
    const isTempPlayer = players.find((p) => p.id === playerId)?.isTempPlayer ?? false;
    if (isTempPlayer) {
      upsertTempScore(id, playerId, hole, next);
    } else {
      upsertScore(id, playerId, hole, next, userId ?? undefined);
    }
  }

  async function startGame() {
    const parsMap: Record<number, number | null> = {};
    const yardsMap: Record<number, string> = {};
    for (let h = 1; h <= totalHoles; h++) {
      const hole = dbHolesRef.current.find((x) => x.hole_number === h);
      parsMap[h] = hole?.par ?? null;
      yardsMap[h] = hole?.yardage != null ? `${hole.yardage}` : '';
    }
    setHolePars(parsMap);
    setHoleYardageTexts(yardsMap);

    const initScores: Record<string, Record<number, number | null>> = {};
    for (const p of players) {
      initScores[p.id] = {};
      for (let h = 1; h <= totalHoles; h++) initScores[p.id][h] = null;
    }
    if (id) {
      const [dbScores, dbTempScores] = await Promise.all([getScores(id), getTempScores(id)]);
      for (const s of dbScores) {
        if (initScores[s.player_id]) initScores[s.player_id][s.hole_number] = s.strokes;
      }
      for (const s of dbTempScores) {
        if (initScores[s.temp_player_id]) initScores[s.temp_player_id][s.hole_number] = s.strokes;
      }
    }
    setScores(initScores);
    setActiveHole(startingHole);
    setPhase('playing');
  }

  if (loading) {
    return (
      <View style={[s.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={Colors.cream} />
      </View>
    );
  }

  if (phase === 'setup') {
    return (
      <>
      <View style={s.root}>
        <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.green }}>
          <View style={s.topBar}>
            <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} activeOpacity={0.7} style={s.topBarBackHit}>
              <Text style={s.backBtn}>← Back</Text>
            </TouchableOpacity>
            <Text style={s.topBarTitle}>Stroke Play</Text>
          </View>
        </SafeAreaView>

        <ScrollView contentContainerStyle={[s.setupContent, { paddingBottom: insets.bottom + 32 }]}>
          <Text style={s.setupHeading}>Set up the game</Text>

          <View style={s.setupCard}>
            <Text style={s.setupCardLabel}>Holes</Text>
            <View style={s.segRow}>
              {(['9', '18', '36', 'custom'] as const).map((mode) => (
                <TouchableOpacity
                  key={mode}
                  style={[s.seg, holeMode === mode && s.segActive]}
                  onPress={() => {
                    setHoleMode(mode);
                    if (mode === '9') setTotalHoles(9);
                    else if (mode === '18') setTotalHoles(18);
                    else if (mode === '36') setTotalHoles(36);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={[s.segText, holeMode === mode && s.segTextActive]}>
                    {mode === 'custom' ? 'Custom' : mode}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {holeMode === 'custom' && (
              <TextInput
                style={s.customInput}
                value={customHoleText}
                onChangeText={(t) => {
                  setCustomHoleText(t);
                  const n = parseInt(t, 10);
                  if (!isNaN(n) && n > 0) setTotalHoles(n);
                }}
                keyboardType="number-pad"
                placeholder="# of holes"
                placeholderTextColor={Colors.muted}
                maxLength={3}
                autoFocus
              />
            )}
          </View>

          <View style={s.setupCard}>
            <View style={s.cardLabelRow}>
              <Text style={s.setupCardLabel}>Players</Text>
              <TouchableOpacity onPress={() => setShowEditSheet(true)} activeOpacity={0.7}>
                <Text style={s.editLink}>Edit</Text>
              </TouchableOpacity>
            </View>
            {players.map((p) => (
              <View key={p.id} style={s.setupPlayerRow}>
                <Avatar initials={p.initials} bg={p.bg} textColor={p.textColor} size={28} borderWidth={0} borderColor="transparent" />
                <Text style={s.setupPlayerName}>{p.name}</Text>
                {p.isTempPlayer && <Text style={s.guestBadge}>Guest</Text>}
              </View>
            ))}
          </View>

          <View style={s.setupNote}>
            <Text style={s.setupNoteText}>
              Stroke play · {totalHoles} holes · {players.length} players
            </Text>
          </View>

          <TouchableOpacity style={s.startBtn} onPress={startGame} activeOpacity={0.85}>
            <Text style={s.startBtnText}>Start</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
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

  const confirmedPar = holePars[activeHole] ?? null;
  const yardageText = holeYardageTexts[activeHole] ?? '';
  const isYardageConfirmed = yardageText.length > 0;
  const completedThrough = activeHole - 1;

  const hasStandingsData = completedThrough > 0 &&
    Object.entries(holePars).some(([h, par]) => parseInt(h) <= completedThrough && par !== null);
  const standings = hasStandingsData ? calcStandings(scores, holePars, completedThrough, players) : [];

  const isLastHole = activeHole === totalHoles;

  const teamAPlayers = matchTeams.filter((t) => t.team === 'a').map((t) => players.find((p) => p.id === t.player_id)?.name ?? 'Team A');
  const teamBPlayers = matchTeams.filter((t) => t.team === 'b').map((t) => players.find((p) => p.id === t.player_id)?.name ?? 'Team B');
  const teamALabel = teamAPlayers.join(' & ') || 'Team A';
  const teamBLabel = teamBPlayers.join(' & ') || 'Team B';

  function goNext() {
    Keyboard.dismiss();
    if (isLastHole) {
      Alert.alert('Wrap it up?', 'End the round and see final scores.', [
        { text: 'Keep playing', style: 'cancel' },
        { text: 'Finish round', onPress: () => router.push(`/post-round/${id}` as any) },
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
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.green }}>
        <TopBar
          left={
            <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} activeOpacity={0.7}>
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
          <Text style={s.courseName}>{courseName}</Text>
          {roundMeta ? <Text style={s.meta}>{roundMeta}</Text> : null}
          <View style={s.avatarStack}>
            {players.map((p, i) => (
              <Avatar
                key={p.id}
                initials={p.initials}
                bg={p.bg}
                textColor={p.textColor}
                size={30}
                borderColor={Colors.green}
                borderWidth={2}
                style={{ marginRight: -7, zIndex: players.length - i }}
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
            {Array.from({ length: totalHoles }, (_, i) => i + 1).map((hole) => (
              <HoleTab
                key={hole}
                hole={hole}
                isActive={hole === activeHole}
                isComplete={hole < activeHole}
                onPress={() => { Keyboard.dismiss(); setActiveHole(hole); }}
              />
            ))}
          </ScrollView>

          <Text style={s.sectionLabel}>HOLE {activeHole}</Text>

          {/* Par + yardage */}
          <View style={[s.card, { marginBottom: 12 }]}>
            <ParChipsRow
              confirmedPar={confirmedPar}
              onSelect={(p) => {
                setHolePars((prev) => ({ ...prev, [activeHole]: p }));
                const yardage = holeYardageTexts[activeHole] ? parseInt(holeYardageTexts[activeHole], 10) || null : null;
                if (id) upsertHole(id, activeHole, p, yardage);
              }}
            />
            <YardageRow
              key={activeHole}
              defaultValue={yardageText}
              isConfirmed={isYardageConfirmed}
              onChangeText={(t) =>
                setHoleYardageTexts((prev) => ({ ...prev, [activeHole]: t }))
              }
              onBlur={() => {
                const par = holePars[activeHole];
                if (par !== null && id) {
                  const yardage = holeYardageTexts[activeHole] ? parseInt(holeYardageTexts[activeHole], 10) || null : null;
                  upsertHole(id, activeHole, par, yardage);
                }
              }}
            />
          </View>

          {/* Score entry */}
          {format === 'match' ? (
            <View style={s.card}>
              <View style={s.matchTeamHeader}>
                <Text style={s.matchTeamLabel}>{teamALabel}</Text>
                <Text style={s.matchTeamVs}>vs</Text>
                <Text style={s.matchTeamLabel}>{teamBLabel}</Text>
              </View>
              {Array.from({ length: totalHoles }, (_, i) => i + 1).map((h, i) => (
                <MatchHoleRow
                  key={h}
                  holeNumber={h}
                  result={matchHoleResults[h] ?? null}
                  teamALabel={teamALabel}
                  teamBLabel={teamBLabel}
                  onPress={() => {
                    const next = cycleMatchResult(matchHoleResults[h] ?? null);
                    setMatchHoleResults((prev) => ({ ...prev, [h]: next }));
                    upsertMatchHole(id, h, next);
                  }}
                />
              ))}
            </View>
          ) : (
            <View style={s.card}>
              {me && (
                <ScoreRow
                  player={me}
                  score={scores[me.id]?.[activeHole] ?? null}
                  confirmedPar={confirmedPar}
                  showBorder={trackOthers && others.length > 0}
                  readOnly={false}
                  onDecrement={() => updateScore(me.id, activeHole, -1)}
                  onIncrement={() => updateScore(me.id, activeHole, 1)}
                />
              )}
              {trackOthers && others.map((p, i) => (
                <ScoreRow
                  key={p.id}
                  player={p}
                  score={scores[p.id]?.[activeHole] ?? null}
                  confirmedPar={confirmedPar}
                  showBorder={i < others.length - 1}
                  readOnly={false}
                  onDecrement={() => updateScore(p.id, activeHole, -1)}
                  onIncrement={() => updateScore(p.id, activeHole, 1)}
                />
              ))}
              {others.length > 0 && (
                <TrackOthersToggle open={trackOthers} onToggle={() => setTrackOthers((v) => {
                  const next = !v;
                  trackOthersStore.set(id ?? '', next);
                  return next;
                })} />
              )}
            </View>
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

          <Text style={s.holeNavCenter}>{activeHole} / {totalHoles}</Text>

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

  // Setup phase
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 16, paddingVertical: 12, position: 'relative',
  },
  topBarTitle: { fontFamily: Fonts.serifMedium, fontSize: 18, color: Colors.cream },
  topBarBackHit: { position: 'absolute', left: 0, paddingHorizontal: 16, paddingVertical: 12 },
  setupContent: { backgroundColor: Colors.bg, padding: 16 },
  setupHeading: { fontFamily: Fonts.serifMedium, fontSize: 24, color: Colors.text, marginBottom: 20, marginTop: 4 },
  setupCard: {
    backgroundColor: Colors.card, borderRadius: 14, borderWidth: 0.5,
    borderColor: Colors.border, padding: 16, gap: 12, marginBottom: 12,
  },
  setupCardLabel: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.muted },
  cardLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  editLink: { fontFamily: Fonts.sansMedium, fontSize: 13, color: Colors.green },
  segRow: { flexDirection: 'row', gap: 8 },
  seg: { flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.creamLight, alignItems: 'center' },
  segActive: { backgroundColor: Colors.green },
  segText: { fontFamily: Fonts.sansMedium, fontSize: 14, color: Colors.text },
  segTextActive: { color: Colors.cream },
  customInput: {
    fontFamily: Fonts.sansSemiBold, fontSize: 20, color: Colors.text,
    backgroundColor: Colors.creamLight, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, textAlign: 'center',
  },
  setupPlayerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  setupPlayerName: { fontFamily: Fonts.sans, fontSize: 14, color: Colors.text, flex: 1 },
  guestBadge: { fontFamily: Fonts.sans, fontSize: 11, color: Colors.muted },
  setupNote: { paddingVertical: 10, alignItems: 'center' },
  setupNoteText: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.muted },
  startBtn: {
    backgroundColor: Colors.green, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', marginTop: 4,
  },
  startBtnText: { fontFamily: Fonts.sansSemiBold, fontSize: 16, color: Colors.cream },

  backBtn: { fontFamily: Fonts.sans, fontSize: 13, color: 'rgba(216,214,175,0.6)' },
  liveBadge: { fontFamily: Fonts.sans, fontSize: 12, color: '#5aaa5a' },

  header: { backgroundColor: Colors.green, paddingHorizontal: 18, paddingBottom: 30 },
  courseName: { fontFamily: Fonts.serifMedium, fontSize: 23, color: Colors.cream, marginBottom: 4 },
  meta: { fontFamily: Fonts.sans, fontSize: 13, color: 'rgba(216,214,175,0.6)', marginBottom: 14 },
  avatarStack: { flexDirection: 'row' },

  drawer: {
    backgroundColor: Colors.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -12,
    paddingTop: 22,
    paddingHorizontal: 16,
  },
  handle: {
    width: 32, height: 3, backgroundColor: '#d8d4c0',
    borderRadius: 4, alignSelf: 'center', marginBottom: 16,
  },

  holeTabs: { marginBottom: 16 },
  holeTabsContent: { gap: 6, paddingHorizontal: 2 },
  holeTab: {
    width: 34, height: 34, borderRadius: 17,
    borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  holeTabActive: { backgroundColor: Colors.green, borderColor: Colors.green },
  holeTabComplete: { backgroundColor: Colors.card, borderColor: Colors.border },
  holeTabNum: { fontFamily: Fonts.sansMedium, fontSize: 12, color: Colors.muted },

  sectionLabel: {
    fontFamily: Fonts.sansSemiBold, fontSize: 10, color: Colors.muted,
    textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10,
  },

  card: {
    backgroundColor: Colors.card, borderRadius: 14,
    borderWidth: 0.5, borderColor: Colors.border,
    paddingHorizontal: 14, marginBottom: 20,
  },

  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingVertical: 11,
  },
  infoRowBorder: { borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  infoLabel: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.muted },
  parChips: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  parStepper: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.creamLight, alignItems: 'center', justifyContent: 'center',
  },
  parStepperText: { fontFamily: Fonts.sansMedium, fontSize: 16, color: Colors.text, lineHeight: 20 },
  parChip: {
    width: 38, height: 30, borderRadius: 8, borderWidth: 1,
    borderColor: Colors.border, backgroundColor: Colors.creamLight,
    alignItems: 'center', justifyContent: 'center',
  },
  parChipSelected: { backgroundColor: Colors.green, borderColor: Colors.green },
  parChipText: { fontFamily: Fonts.sansMedium, fontSize: 13, color: Colors.muted },
  parChipTextSelected: { color: Colors.cream },
  infoInput: { fontFamily: Fonts.sansMedium, fontSize: 13, minWidth: 100, textAlign: 'right', padding: 0 },
  infoInputConfirmed: { color: Colors.text },
  infoInputPlaceholder: { color: Colors.muted },

  scoreRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingVertical: 12,
  },
  scoreRowBorder: { borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  scoreLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  scorePlayerName: { fontFamily: Fonts.sansMedium, fontSize: 14, color: Colors.text },
  scoreControls: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  scoreBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.creamLight, alignItems: 'center', justifyContent: 'center',
  },
  scoreBtnText: { fontFamily: Fonts.sans, fontSize: 18, color: Colors.text, lineHeight: 22 },
  scoreNums: { alignItems: 'center', width: 40 },
  scoreNum: { fontFamily: Fonts.serifMedium, fontSize: 28, color: Colors.text, lineHeight: 32 },
  scoreNumEmpty: { color: Colors.muted },
  scoreDiff: { fontFamily: Fonts.sansMedium, fontSize: 11, lineHeight: 14 },

  trackToggle: {
    paddingVertical: 11, alignItems: 'center',
    borderTopWidth: 0.5, borderTopColor: Colors.border,
  },
  trackToggleText: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.muted },

  standingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 },
  standingRowBorder: { borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  standingRank: { fontFamily: Fonts.sansSemiBold, fontSize: 12, color: Colors.muted, width: 14, textAlign: 'center' },
  standingName: { fontFamily: Fonts.sansMedium, fontSize: 14, color: Colors.text, flex: 1 },
  standingDiff: { fontFamily: Fonts.serifMedium, fontSize: 20, textAlign: 'right' },

  bottomBar: { backgroundColor: Colors.bg, borderTopWidth: 0.5, borderTopColor: Colors.border },
  bottomBarInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 12,
  },
  holeNavBtn: {
    paddingVertical: 8, paddingHorizontal: 16, borderRadius: 10,
    backgroundColor: Colors.creamLight, minWidth: 90, alignItems: 'center',
  },
  holeNavBtnDisabled: { opacity: 0.35 },
  holeNavBtnFinish: { backgroundColor: Colors.green },
  holeNavBtnText: { fontFamily: Fonts.sansMedium, fontSize: 14, color: Colors.text },
  holeNavBtnTextDisabled: { color: Colors.muted },
  holeNavBtnTextFinish: { color: Colors.cream },
  holeNavCenter: { fontFamily: Fonts.sansMedium, fontSize: 13, color: Colors.muted },

  matchTeamHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: Colors.border,
  },
  matchTeamLabel: { fontFamily: Fonts.sansMedium, fontSize: 13, color: Colors.text, flex: 1, textAlign: 'center' },
  matchTeamVs: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.muted, width: 24, textAlign: 'center' },
  matchHoleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 11, borderBottomWidth: 0.5, borderBottomColor: Colors.border,
  },
  matchHoleNum: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.muted },
  matchHoleResult: { fontFamily: Fonts.sansMedium, fontSize: 14 },
});
