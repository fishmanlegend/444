import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/context/auth';
import {
  ActivityIndicator, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import {
  getRoundWithPlayers, getHoles,
  getMatchTeams, upsertMatchTeam, deleteMatchTeam,
  getScores, getTempScores, upsertScore, upsertTempScore,
} from '@/lib/db';
import { EditPlayersSheet } from '@/components/EditPlayersSheet';
import type { Round, RoundPlayer, Hole, Score, TempScore } from '@/lib/database.types';

// ─── Types ────────────────────────────────────────────────────────────────────

type TeamMap  = Record<string, 'a' | 'b'>;
type ScoreMap = Record<string, Record<number, number | null>>; // [playerId][holeNumber]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function effId(p: RoundPlayer): string {
  return (p.player_id ?? p.temp_player_id) ?? '';
}
function effName(p: RoundPlayer): string {
  if (p.player_id) return ((p as any).profile?.name as string) ?? 'Player';
  return ((p as any).temp_player?.name as string) ?? 'Guest';
}
function effInitials(p: RoundPlayer): string {
  if (p.player_id) return ((p as any).profile?.initials as string) ?? '?';
  const name: string = ((p as any).temp_player?.name as string) ?? '';
  return name.split(/\s+/).map((w) => w[0]?.toUpperCase() ?? '').slice(0, 2).join('') || '?';
}
function effAvatarColor(p: RoundPlayer): string {
  return p.player_id ? (((p as any).profile?.avatar_color as string) ?? Colors.green) : '#7a7060';
}
function effAvatarTextColor(p: RoundPlayer): string {
  return p.player_id ? (((p as any).profile?.avatar_text_color as string) ?? Colors.cream) : '#fff';
}
function isTempPlayer(p: RoundPlayer): boolean { return p.player_id == null; }

function teamLabel(players: RoundPlayer[], team: 'a' | 'b', teams: TeamMap): string {
  const tp = players.filter((p) => teams[effId(p)] === team);
  if (!tp.length) return team === 'a' ? 'Team A' : 'Team B';
  const first = effName(tp[0]).split(' ')[0];
  return tp.length > 1 ? `${first}'s` : first;
}

function bestScore(players: RoundPlayer[], scores: ScoreMap, hole: number): number | null {
  const vals = players
    .map((p) => scores[effId(p)]?.[hole] ?? null)
    .filter((v): v is number => v != null);
  return vals.length ? Math.min(...vals) : null;
}

function holeResult(
  aPlayers: RoundPlayer[],
  bPlayers: RoundPlayer[],
  scores: ScoreMap,
  hole: number,
): 'a' | 'b' | 'halve' | null {
  const ba = bestScore(aPlayers, scores, hole);
  const bb = bestScore(bPlayers, scores, hole);
  if (ba == null || bb == null) return null;
  if (ba < bb) return 'a';
  if (bb < ba) return 'b';
  return 'halve';
}

function calcMatchScore(
  aPlayers: RoundPlayer[],
  bPlayers: RoundPlayer[],
  scores: ScoreMap,
  totalHoles: number,
): { diff: number; played: number } {
  let a = 0, b = 0, played = 0;
  for (let h = 1; h <= totalHoles; h++) {
    const r = holeResult(aPlayers, bPlayers, scores, h);
    if (r != null) {
      played++;
      if (r === 'a') a++;
      else if (r === 'b') b++;
    }
  }
  return { diff: a - b, played };
}

// ─── Hole circle strip ────────────────────────────────────────────────────────

const CIRCLE_SIZE = 34;
const CIRCLE_GAP  = 6;
const CIRCLE_STEP = CIRCLE_SIZE + CIRCLE_GAP;

function HoleCircle({ holeNum, hasScore, isViewing, onPress }: {
  holeNum: number; hasScore: boolean; isViewing: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[g.circle, isViewing && g.circleActive, hasScore && !isViewing && g.circleDone]}
      onPress={onPress} activeOpacity={0.7}
    >
      <Text style={[g.circleText, isViewing && g.circleTextActive]}>{holeNum}</Text>
    </TouchableOpacity>
  );
}

// ─── Player stepper row ───────────────────────────────────────────────────────

function PlayerStepper({ player, score, isBest, onChange }: {
  player: RoundPlayer;
  score: number | null;
  isBest: boolean;
  onChange: (s: number | null) => void;
}) {
  return (
    <View style={g.stepperRow}>
      <Avatar
        initials={effInitials(player)}
        bg={effAvatarColor(player)}
        textColor={effAvatarTextColor(player)}
        size={28} borderWidth={0} borderColor="transparent"
      />
      <Text style={g.stepperName} numberOfLines={1}>{effName(player)}</Text>
      {isBest && score != null && (
        <View style={g.bestBadge}><Text style={g.bestBadgeText}>★</Text></View>
      )}
      <View style={g.stepper}>
        <TouchableOpacity
          style={g.stepBtn}
          onPress={() => onChange(score != null && score > 1 ? score - 1 : null)}
          activeOpacity={0.7}
        >
          <Text style={g.stepBtnText}>−</Text>
        </TouchableOpacity>
        <Text style={[g.stepValue, score == null && g.stepValueDim]}>
          {score ?? '—'}
        </Text>
        <TouchableOpacity
          style={g.stepBtn}
          onPress={() => onChange(score != null ? score + 1 : 1)}
          activeOpacity={0.7}
        >
          <Text style={g.stepBtnText}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function BestBallScreen() {
  const { id }   = useLocalSearchParams<{ id: string }>();
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const { session } = useAuth();
  const userId   = session?.user.id ?? (__DEV__ ? '46bae3d3-2c18-450e-b267-f36b91a94a31' : null);

  const [round, setRound]     = useState<(Round & { players: RoundPlayer[] }) | null>(null);
  const [dbHoles, setDbHoles] = useState<Hole[]>([]);
  const [holes, setHoles]     = useState<Hole[]>([]);
  const [teams, setTeams]     = useState<TeamMap>({});
  const [scores, setScores]   = useState<ScoreMap>({});
  const [phase, setPhase]     = useState<'setup' | 'playing' | 'settle'>('setup');
  const [totalHoles, setTotalHoles] = useState(18);
  const [holeMode, setHoleMode] = useState<'9' | '18' | '36' | 'custom'>('18');
  const [customText, setCustomText] = useState('');
  const [viewingHole, setViewingHole] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showEditSheet, setShowEditSheet] = useState(false);

  const stripRef      = useRef<ScrollView>(null);
  const isFirstRender = useRef(true);
  const DEFAULT_PARS  = [4,4,3,4,5,3,4,5,4,4,3,4,5,4,3,5,4,4];

  useEffect(() => {
    if (!id) return;
    Promise.all([
      getRoundWithPlayers(id),
      getHoles(id),
      getMatchTeams(id).catch(() => []),
      getScores(id).catch((): Score[] => []),
      getTempScores(id).catch((): TempScore[] => []),
    ]).then(([r, h, mt, sc, ts]) => {
      setRound(r);
      setDbHoles(h);
      const tm: TeamMap = {};
      for (const t of mt) tm[t.player_id] = t.team;
      setTeams(tm);
      const sm: ScoreMap = {};
      for (const s of sc) {
        if (!sm[s.player_id]) sm[s.player_id] = {};
        sm[s.player_id][s.hole_number] = s.strokes;
      }
      for (const s of ts) {
        if (!sm[s.temp_player_id]) sm[s.temp_player_id] = {};
        sm[s.temp_player_id][s.hole_number] = s.strokes;
      }
      setScores(sm);
      setLoading(false);
    });
  }, [id]);

  useEffect(() => {
    if (phase !== 'playing') return;
    const x = Math.max(0, viewingHole * CIRCLE_STEP - 120);
    stripRef.current?.scrollTo({ x, animated: !isFirstRender.current });
    isFirstRender.current = false;
  }, [viewingHole, phase]);

  function buildHoles(h: Hole[], nh: number, rid: string): Hole[] {
    return h.length > 0
      ? h.slice(0, nh)
      : Array.from({ length: nh }, (_, i) => ({
          round_id: rid, hole_number: i + 1,
          par: DEFAULT_PARS[i] ?? 4, yardage: null,
        })) as Hole[];
  }

  function selectHoleMode(mode: '9' | '18' | '36' | 'custom') {
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

  function startGame() {
    isFirstRender.current = true;
    setHoles(buildHoles(dbHoles, totalHoles, id!));
    setPhase('playing');
  }

  const toggle = useCallback(async (pid: string, t: 'a' | 'b', isTemp: boolean) => {
    if (teams[pid] === t) {
      setTeams((prev) => { const n = { ...prev }; delete n[pid]; return n; });
      if (!isTemp) deleteMatchTeam(id!, pid).catch(() => {});
    } else {
      setTeams((prev) => ({ ...prev, [pid]: t }));
      if (!isTemp) upsertMatchTeam(id!, pid, t).catch(() => {});
    }
  }, [id, teams]);

  const setScore = useCallback((player: RoundPlayer, hole: number, s: number | null) => {
    const pid = effId(player);
    setScores((prev) => {
      const n = { ...prev, [pid]: { ...(prev[pid] ?? {}), [hole]: s } };
      return n;
    });
    if (isTempPlayer(player)) {
      upsertTempScore(id!, player.temp_player_id!, hole, s).catch(() => {});
    } else {
      upsertScore(id!, player.player_id!, hole, s, userId ?? undefined).catch(() => {});
    }
  }, [id, userId]);

  if (loading) {
    return (
      <View style={[g.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={Colors.cream} />
      </View>
    );
  }

  if (!round) {
    return (
      <View style={[g.root, { alignItems: 'center', justifyContent: 'center', padding: 32 }]}>
        <Text style={g.notFound}>Round not found</Text>
      </View>
    );
  }

  const players  = round.players as RoundPlayer[];
  const aPlayers = players.filter((p) => teams[effId(p)] === 'a');
  const bPlayers = players.filter((p) => teams[effId(p)] === 'b');
  const aLabel   = teamLabel(players, 'a', teams);
  const bLabel   = teamLabel(players, 'b', teams);
  const aCount   = aPlayers.length;
  const bCount   = bPlayers.length;
  const canStart = aCount >= 1 && bCount >= 1;

  const { diff, played } = calcMatchScore(aPlayers, bPlayers, scores, totalHoles);
  const remaining = totalHoles - played;
  const up        = Math.abs(diff);
  const leader    = diff > 0 ? aLabel : bLabel;

  let scoreText: string, statusText: string;
  if (played === 0)          { scoreText = 'All Square'; statusText = `${totalHoles} to play`; }
  else if (diff === 0)       { scoreText = 'All Square'; statusText = `thru ${played}`; }
  else if (up > remaining)   { scoreText = `${leader} wins`; statusText = `${up} & ${remaining}`; }
  else                       { scoreText = `${up} UP`; statusText = `${leader} · thru ${played}`; }

  // ─── Setup phase ─────────────────────────────────────────────────────────────

  if (phase === 'setup') {
    return (
      <View style={g.root}>
        <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.green }}>
          <View style={g.topBar}>
            <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={g.topBarBackHit}>
              <Text style={g.topBarBack}>← Back</Text>
            </TouchableOpacity>
            <Text style={g.topBarTitle}>Best Ball</Text>
          </View>
        </SafeAreaView>

        <ScrollView
          style={{ flex: 1, backgroundColor: Colors.bg }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: Spacing.lg, paddingBottom: insets.bottom + 32 }}
        >
          <Text style={g.setupHeading}>Set up the game</Text>

          {/* Teams card */}
          <View style={g.fieldCard}>
            <View style={g.cardLabelRow}>
              <Text style={g.fieldLabel}>Teams</Text>
              <TouchableOpacity onPress={() => setShowEditSheet(true)} activeOpacity={0.7}>
                <Text style={g.editLink}>Edit players</Text>
              </TouchableOpacity>
            </View>
            {players.map((p, i) => {
              const pid = effId(p);
              const cur = teams[pid];
              const isTemp = isTempPlayer(p);
              return (
                <View key={pid} style={[g.playerRow, i < players.length - 1 && g.playerRowBorder]}>
                  <Avatar
                    initials={effInitials(p)}
                    bg={effAvatarColor(p)}
                    textColor={effAvatarTextColor(p)}
                    size={34} borderWidth={0} borderColor="transparent"
                  />
                  <Text style={g.playerName} numberOfLines={1}>
                    {effName(p)}
                    {p.is_host ? <Text style={g.playerTag}> host</Text> : null}
                    {isTemp ? <Text style={g.playerTag}> guest</Text> : null}
                  </Text>
                  <View style={g.toggles}>
                    <TouchableOpacity
                      style={[g.teamBtn, cur === 'a' && g.teamBtnAOn]}
                      onPress={() => toggle(pid, 'a', isTemp)} activeOpacity={0.7}
                    >
                      <Text style={[g.teamBtnText, cur === 'a' && g.teamBtnAOnText]}>A</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[g.teamBtn, cur === 'b' && g.teamBtnBOn]}
                      onPress={() => toggle(pid, 'b', isTemp)} activeOpacity={0.7}
                    >
                      <Text style={[g.teamBtnText, cur === 'b' && g.teamBtnBOnText]}>B</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>

          {/* Holes card */}
          <View style={g.fieldCard}>
            <Text style={g.fieldLabel}>Holes</Text>
            <View style={g.segRow}>
              {(['9', '18', '36', 'custom'] as const).map((mode) => (
                <TouchableOpacity
                  key={mode}
                  style={[g.seg, holeMode === mode && g.segActive]}
                  onPress={() => selectHoleMode(mode)} activeOpacity={0.8}
                >
                  <Text style={[g.segText, holeMode === mode && g.segTextActive]}>
                    {mode === 'custom' ? 'Custom' : mode}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {holeMode === 'custom' && (
              <TextInput
                style={g.customInput}
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

          <View style={g.setupNote}>
            <Text style={g.setupNoteText}>
              Best ball · {totalHoles} holes · {players.length} players
            </Text>
          </View>

          <TouchableOpacity
            style={[g.primaryBtn, !canStart && g.primaryBtnOff]}
            onPress={canStart ? startGame : undefined}
            activeOpacity={0.8}
          >
            <Text style={g.primaryBtnText}>Start</Text>
          </TouchableOpacity>
        </ScrollView>

        <EditPlayersSheet
          visible={showEditSheet}
          roundId={id!}
          hostId={round.host_id ?? ''}
          currentUserId={userId}
          onClose={() => setShowEditSheet(false)}
          onDone={() => getRoundWithPlayers(id!).then((r) => r && setRound(r))}
        />
      </View>
    );
  }

  // ─── Playing phase ────────────────────────────────────────────────────────────

  if (phase === 'playing') {
    const holeNum = viewingHole + 1;
    const hole    = holes[viewingHole];
    const baScore = bestScore(aPlayers, scores, holeNum);
    const bbScore = bestScore(bPlayers, scores, holeNum);
    const result  = holeResult(aPlayers, bPlayers, scores, holeNum);

    return (
      <View style={g.root}>
        <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.green }}>
          <View style={g.topBar}>
            <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={g.topBarBackHit}>
              <Text style={g.topBarBack}>← Back</Text>
            </TouchableOpacity>
            <View style={{ alignItems: 'center' }}>
              <Text style={g.topBarSub}>Hole {holeNum} of {totalHoles}</Text>
              <Text style={g.topBarTitle}>Best Ball</Text>
            </View>
            <TouchableOpacity onPress={() => setPhase('settle')} activeOpacity={0.7} style={g.topBarEndHit}>
              <Text style={g.topBarEnd}>End</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>

        {/* Running score banner */}
        <View style={g.scoreBanner}>
          <Text style={g.scoreText}>{scoreText}</Text>
          <Text style={g.statusText}>{statusText}</Text>
        </View>

        {/* Hole strip */}
        <View style={g.stripWrap}>
          <ScrollView ref={stripRef} horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={g.stripContent}>
            {Array.from({ length: totalHoles }, (_, i) => {
              const h1 = i + 1;
              const r = holeResult(aPlayers, bPlayers, scores, h1);
              return (
                <HoleCircle
                  key={i}
                  holeNum={h1}
                  hasScore={r != null}
                  isViewing={i === viewingHole}
                  onPress={() => setViewingHole(i)}
                />
              );
            })}
          </ScrollView>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[g.playContent, { paddingBottom: insets.bottom + 80 }]}
        >
          {/* Hole info */}
          {hole && (
            <View style={g.holeInfoRow}>
              <Text style={g.holeInfoLabel}>Hole {holeNum}</Text>
              {hole.par ? <Text style={g.holeInfoSub}>Par {hole.par}</Text> : null}
            </View>
          )}

          {/* Team A */}
          <View style={g.teamSection}>
            <View style={g.teamHeader}>
              <Text style={g.teamHeaderLabel}>{aLabel}</Text>
              {baScore != null && (
                <View style={[g.teamBestBadge, g.teamBestBadgeA]}>
                  <Text style={g.teamBestBadgeText}>Best: {baScore}</Text>
                </View>
              )}
            </View>
            {aPlayers.map((p) => {
              const pid = effId(p);
              const s   = scores[pid]?.[holeNum] ?? null;
              const ba  = bestScore(aPlayers, scores, holeNum);
              return (
                <PlayerStepper
                  key={pid}
                  player={p}
                  score={s}
                  isBest={s != null && s === ba}
                  onChange={(v) => setScore(p, holeNum, v)}
                />
              );
            })}
          </View>

          {/* Hole result */}
          <View style={g.resultRow}>
            {result === 'a' && <Text style={[g.resultText, g.resultTextA]}>{aLabel} wins hole</Text>}
            {result === 'b' && <Text style={[g.resultText, g.resultTextB]}>{bLabel} wins hole</Text>}
            {result === 'halve' && <Text style={g.resultTextHalve}>Halved</Text>}
            {result == null && (baScore != null || bbScore != null) && (
              <Text style={g.resultTextPending}>
                {baScore != null ? `${aLabel}: ${baScore}` : '—'}
                {'  ·  '}
                {bbScore != null ? `${bLabel}: ${bbScore}` : '—'}
              </Text>
            )}
          </View>

          {/* Team B */}
          <View style={[g.teamSection, { marginBottom: 0 }]}>
            <View style={g.teamHeader}>
              <Text style={g.teamHeaderLabel}>{bLabel}</Text>
              {bbScore != null && (
                <View style={[g.teamBestBadge, g.teamBestBadgeB]}>
                  <Text style={g.teamBestBadgeText}>Best: {bbScore}</Text>
                </View>
              )}
            </View>
            {bPlayers.map((p) => {
              const pid = effId(p);
              const s   = scores[pid]?.[holeNum] ?? null;
              const bb  = bestScore(bPlayers, scores, holeNum);
              return (
                <PlayerStepper
                  key={pid}
                  player={p}
                  score={s}
                  isBest={s != null && s === bb}
                  onChange={(v) => setScore(p, holeNum, v)}
                />
              );
            })}
          </View>
        </ScrollView>

        {/* Nav bar */}
        <View style={[g.navBar, { paddingBottom: insets.bottom + 10 }]}>
          <TouchableOpacity
            style={[g.navBtn, viewingHole === 0 && g.navBtnDisabled]}
            activeOpacity={viewingHole === 0 ? 1 : 0.7}
            onPress={() => viewingHole > 0 && setViewingHole(viewingHole - 1)}
          >
            <Text style={[g.navBtnText, viewingHole === 0 && g.navBtnTextDim]}>← Prev</Text>
          </TouchableOpacity>
          <Text style={g.navCenter}>{holeNum} / {totalHoles}</Text>
          <TouchableOpacity
            style={[g.navBtn, viewingHole === totalHoles - 1 && g.navBtnFinish]}
            activeOpacity={0.7}
            onPress={() => {
              if (viewingHole < totalHoles - 1) setViewingHole(viewingHole + 1);
              else setPhase('settle');
            }}
          >
            <Text style={[g.navBtnText, viewingHole === totalHoles - 1 && g.navBtnFinishText]}>
              {viewingHole === totalHoles - 1 ? 'Finish' : 'Next →'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── Settle phase ─────────────────────────────────────────────────────────────

  let aWins = 0, bWins = 0, halved = 0;
  for (let h = 1; h <= totalHoles; h++) {
    const r = holeResult(aPlayers, bPlayers, scores, h);
    if (r === 'a') aWins++;
    else if (r === 'b') bWins++;
    else if (r === 'halve') halved++;
  }

  const winner = aWins > bWins ? aLabel : bWins > aWins ? bLabel : null;

  return (
    <View style={g.root}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.green }}>
        <View style={g.topBar}>
          <TouchableOpacity onPress={() => setPhase('playing')} activeOpacity={0.7} style={g.topBarBackHit}>
            <Text style={g.topBarBack}>← Back</Text>
          </TouchableOpacity>
          <Text style={g.topBarTitle}>Results</Text>
        </View>
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ backgroundColor: Colors.bg, padding: Spacing.lg, gap: 12, paddingBottom: insets.bottom + 32 }}
      >
        {/* Winner banner */}
        {winner ? (
          <View style={g.winnerBanner}>
            <Text style={g.winnerEmoji}>🏆</Text>
            <View>
              <Text style={g.winnerLabel}>{winner} wins!</Text>
              <Text style={g.winnerSub}>{aWins} – {bWins}{halved > 0 ? ` (${halved} halved)` : ''}</Text>
            </View>
          </View>
        ) : (
          <View style={g.winnerBanner}>
            <Text style={g.winnerEmoji}>🤝</Text>
            <View>
              <Text style={g.winnerLabel}>All Square</Text>
              <Text style={g.winnerSub}>{aWins} – {bWins}{halved > 0 ? ` (${halved} halved)` : ''}</Text>
            </View>
          </View>
        )}

        {/* Hole-by-hole table */}
        <View style={g.resultCard}>
          {/* Header */}
          <View style={[g.tableRow, g.tableRowBorder]}>
            <Text style={[g.tableCell, g.tableCellHole, g.tableHeader]}>Hole</Text>
            <Text style={[g.tableCell, g.tableCellTeam, g.tableHeader]}>{aLabel}</Text>
            <Text style={[g.tableCell, g.tableCellResult, g.tableHeader]}> </Text>
            <Text style={[g.tableCell, g.tableCellTeam, g.tableHeader, { textAlign: 'right' }]}>{bLabel}</Text>
          </View>

          {Array.from({ length: totalHoles }, (_, i) => {
            const h = i + 1;
            const ba = bestScore(aPlayers, scores, h);
            const bb = bestScore(bPlayers, scores, h);
            const r  = holeResult(aPlayers, bPlayers, scores, h);
            return (
              <View key={h} style={[g.tableRow, i < totalHoles - 1 && g.tableRowBorder]}>
                <Text style={[g.tableCell, g.tableCellHole, g.tableCellMuted]}>{h}</Text>
                <Text style={[g.tableCell, g.tableCellTeam, r === 'a' && g.tableCellWin]}>
                  {ba ?? '—'}
                </Text>
                <Text style={[g.tableCell, g.tableCellResult, g.tableCellMuted]}>
                  {r === 'a' ? '◀' : r === 'b' ? '▶' : r === 'halve' ? '=' : '·'}
                </Text>
                <Text style={[g.tableCell, g.tableCellTeam, { textAlign: 'right' }, r === 'b' && g.tableCellWin]}>
                  {bb ?? '—'}
                </Text>
              </View>
            );
          })}
        </View>

        <TouchableOpacity
          style={g.primaryBtn}
          onPress={() => router.replace('/' as any)}
          activeOpacity={0.85}
        >
          <Text style={g.primaryBtnText}>Done</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const g = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.green },
  notFound: { fontFamily: Fonts.serifMedium, fontSize: 20, color: Colors.cream },

  // Top bar
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: 12, position: 'relative',
  },
  topBarBackHit: { position: 'absolute', left: 0, paddingHorizontal: Spacing.lg, paddingVertical: 12 },
  topBarEndHit:  { position: 'absolute', right: 0, paddingHorizontal: Spacing.lg, paddingVertical: 12 },
  topBarBack:    { fontFamily: Fonts.sans, fontSize: 13, color: 'rgba(216,214,175,0.6)' },
  topBarEnd:     { fontFamily: Fonts.sans, fontSize: 13, color: 'rgba(216,214,175,0.6)' },
  topBarSub:     { fontFamily: Fonts.sans, fontSize: 11, color: 'rgba(216,214,175,0.55)' },
  topBarTitle:   { fontFamily: Fonts.serifMedium, fontSize: 17, color: Colors.cream },

  // Score banner
  scoreBanner: {
    backgroundColor: Colors.green, alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: 'rgba(216,214,175,0.2)',
  },
  scoreText:  { fontFamily: Fonts.serifMedium, fontSize: 20, color: Colors.cream },
  statusText: { fontFamily: Fonts.sans, fontSize: 12, color: 'rgba(216,214,175,0.6)', marginTop: 1 },

  // Hole strip
  stripWrap:    { backgroundColor: Colors.bg, paddingVertical: 12 },
  stripContent: { gap: CIRCLE_GAP, paddingHorizontal: Spacing.lg },
  circle: {
    width: CIRCLE_SIZE, height: CIRCLE_SIZE, borderRadius: CIRCLE_SIZE / 2,
    backgroundColor: Colors.creamLight, alignItems: 'center', justifyContent: 'center',
  },
  circleActive:     { backgroundColor: Colors.green },
  circleDone:       { backgroundColor: Colors.cream },
  circleText:       { fontFamily: Fonts.sansMedium, fontSize: 12, color: Colors.muted },
  circleTextActive: { color: Colors.cream },

  // Play content
  playContent: { backgroundColor: Colors.bg, padding: Spacing.lg, gap: 12 },

  holeInfoRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  holeInfoLabel: { fontFamily: Fonts.serifMedium, fontSize: 20, color: Colors.text },
  holeInfoSub:   { fontFamily: Fonts.sans, fontSize: 13, color: Colors.muted },

  // Team sections
  teamSection: {
    backgroundColor: Colors.card, borderRadius: 14,
    borderWidth: 0.5, borderColor: Colors.border,
    padding: 14, gap: 10, marginBottom: 0,
  },
  teamHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  teamHeaderLabel: { fontFamily: Fonts.sansSemiBold, fontSize: 11, color: Colors.muted, textTransform: 'uppercase', letterSpacing: 1 },
  teamBestBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  teamBestBadgeA: { backgroundColor: Colors.green },
  teamBestBadgeB: { backgroundColor: '#7a4020' },
  teamBestBadgeText: { fontFamily: Fonts.sansMedium, fontSize: 12, color: Colors.cream },

  // Player stepper
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepperName: { flex: 1, fontFamily: Fonts.sansMedium, fontSize: 14, color: Colors.text },
  bestBadge: { width: 18, height: 18, borderRadius: 9, backgroundColor: Colors.cream, alignItems: 'center', justifyContent: 'center' },
  bestBadgeText: { fontFamily: Fonts.sansMedium, fontSize: 10, color: Colors.green },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.creamLight, alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { fontFamily: Fonts.sansSemiBold, fontSize: 16, color: Colors.green, lineHeight: 19 },
  stepValue: { fontFamily: Fonts.sansSemiBold, fontSize: 16, color: Colors.text, minWidth: 28, textAlign: 'center' },
  stepValueDim: { color: Colors.muted },

  // Hole result row
  resultRow: { alignItems: 'center', paddingVertical: 4 },
  resultText: { fontFamily: Fonts.sansSemiBold, fontSize: 14 },
  resultTextA: { color: Colors.green },
  resultTextB: { color: '#7a4020' },
  resultTextHalve: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.muted },
  resultTextPending: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.muted },

  // Nav bar
  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.card, borderTopWidth: 0.5, borderTopColor: Colors.border,
    paddingHorizontal: 20, paddingTop: 12,
  },
  navBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 10, backgroundColor: Colors.creamLight, minWidth: 90, alignItems: 'center' },
  navBtnDisabled: { opacity: 0.4 },
  navBtnFinish: { backgroundColor: Colors.green },
  navBtnText: { fontFamily: Fonts.sansMedium, fontSize: 13, color: Colors.text },
  navBtnTextDim: { color: Colors.muted },
  navBtnFinishText: { color: Colors.cream },
  navCenter: { fontFamily: Fonts.sansMedium, fontSize: 13, color: Colors.muted },

  // Setup
  setupHeading: { fontFamily: Fonts.serifMedium, fontSize: 24, color: Colors.text, marginBottom: 20, marginTop: 4 },
  fieldCard: { backgroundColor: Colors.card, borderRadius: 14, borderWidth: 0.5, borderColor: Colors.border, padding: 16, gap: 12, marginBottom: 12 },
  fieldLabel: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.muted },
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
  playerRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 },
  playerRowBorder: { borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  playerName: { flex: 1, fontFamily: Fonts.sansMedium, fontSize: 14, color: Colors.text },
  playerTag: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.muted },
  toggles: { flexDirection: 'row', gap: 6 },
  teamBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.creamLight, alignItems: 'center', justifyContent: 'center' },
  teamBtnAOn: { backgroundColor: Colors.green },
  teamBtnBOn: { backgroundColor: '#7a4020' },
  teamBtnText: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: Colors.muted },
  teamBtnAOnText: { color: Colors.cream },
  teamBtnBOnText: { color: '#fff' },
  setupNote: { paddingVertical: 10, alignItems: 'center' },
  setupNoteText: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.muted },
  primaryBtn: { backgroundColor: Colors.green, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  primaryBtnOff: { opacity: 0.4 },
  primaryBtnText: { fontFamily: Fonts.sansSemiBold, fontSize: 16, color: Colors.cream },

  // Results
  winnerBanner: {
    backgroundColor: Colors.green, borderRadius: 14, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  winnerEmoji: { fontSize: 32 },
  winnerLabel: { fontFamily: Fonts.serifMedium, fontSize: 22, color: Colors.cream },
  winnerSub:   { fontFamily: Fonts.sans, fontSize: 13, color: 'rgba(216,214,175,0.7)', marginTop: 2 },

  resultCard: { backgroundColor: Colors.card, borderRadius: 14, borderWidth: 0.5, borderColor: Colors.border, overflow: 'hidden' },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10 },
  tableRowBorder: { borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  tableHeader: { fontFamily: Fonts.sansSemiBold, fontSize: 10, color: Colors.muted, textTransform: 'uppercase', letterSpacing: 0.8 },
  tableCell: { fontFamily: Fonts.sans, fontSize: 14, color: Colors.text },
  tableCellHole: { width: 36, color: Colors.muted },
  tableCellTeam: { flex: 1, fontFamily: Fonts.sansMedium },
  tableCellResult: { width: 24, textAlign: 'center' },
  tableCellMuted: { color: Colors.muted },
  tableCellWin:   { color: Colors.green, fontFamily: Fonts.sansSemiBold },
});
