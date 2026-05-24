import React, { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/context/auth';
import {
  ActivityIndicator, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { TopBar } from '@/components/TopBar';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import {
  getRoundWithPlayers, getHoles,
  getMatchTeams, upsertMatchTeam, deleteMatchTeam,
  getMatchHoles, upsertMatchHole,
} from '@/lib/db';
import { EditPlayersSheet } from '@/components/EditPlayersSheet';
import type { Round, RoundPlayer, Hole } from '@/lib/database.types';

// ─── Types ────────────────────────────────────────────────────────────────────

type TeamMap   = Record<string, 'a' | 'b'>;
type ResultMap = Record<number, 'a' | 'b' | 'halve'>;

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
  return p.player_id ? (((p as any).profile?.avatar_color as string) ?? '#284726') : '#7a7060';
}

function effAvatarTextColor(p: RoundPlayer): string {
  return p.player_id ? (((p as any).profile?.avatar_text_color as string) ?? '#d8d6af') : '#fff';
}

function teamName(players: RoundPlayer[], team: 'a' | 'b', teams: TeamMap): string {
  const tp = players.filter((p) => teams[effId(p)] === team);
  if (!tp.length) return team === 'a' ? 'Team A' : 'Team B';
  const first = effName(tp[0]).split(' ')[0];
  return tp.length > 1 ? `${first}'s` : first;
}

function calcScore(results: ResultMap): { diff: number; played: number } {
  let a = 0, b = 0;
  for (const r of Object.values(results)) {
    if (r === 'a') a++; else if (r === 'b') b++;
  }
  return { diff: a - b, played: Object.keys(results).length };
}

// ─── HoleRow ──────────────────────────────────────────────────────────────────

function HoleRow({ hole, result, aLabel, bLabel, onResult }: {
  hole: Hole;
  result: 'a' | 'b' | 'halve' | null;
  aLabel: string;
  bLabel: string;
  onResult(r: 'a' | 'b' | 'halve' | null): void;
}) {
  const tap = (r: 'a' | 'b' | 'halve') => onResult(result === r ? null : r);
  return (
    <View style={sc.row}>
      <View style={sc.holeInfo}>
        <Text style={sc.holeNum}>{hole.hole_number}</Text>
        <Text style={sc.holePar}>par {hole.par}</Text>
      </View>
      <View style={sc.btns}>
        <TouchableOpacity
          style={[sc.btn, sc.btnA, result === 'a' && sc.btnAOn]}
          onPress={() => tap('a')} activeOpacity={0.75}
        >
          <Text style={[sc.btnText, result === 'a' && sc.btnAOnText]} numberOfLines={1}>
            {aLabel}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[sc.btn, sc.btnH, result === 'halve' && sc.btnHOn]}
          onPress={() => tap('halve')} activeOpacity={0.75}
        >
          <Text style={[sc.btnText, result === 'halve' && sc.btnHOnText]}>Halve</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[sc.btn, sc.btnB, result === 'b' && sc.btnBOn]}
          onPress={() => tap('b')} activeOpacity={0.75}
        >
          <Text style={[sc.btnText, result === 'b' && sc.btnBOnText]} numberOfLines={1}>
            {bLabel}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function MatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const userId = session?.user.id ?? (__DEV__ ? '46bae3d3-2c18-450e-b267-f36b91a94a31' : null);

  const [round, setRound]       = useState<(Round & { players: RoundPlayer[] }) | null>(null);
  const [dbHoles, setDbHoles]   = useState<Hole[]>([]);
  const [holes, setHoles]       = useState<Hole[]>([]);
  const [teams, setTeams]       = useState<TeamMap>({});
  const [results, setResults]   = useState<ResultMap>({});
  const [phase, setPhase]       = useState<'setup' | 'scoring'>('setup');
  const [totalHoles, setTotalHoles] = useState(18);
  const [holeMode, setHoleMode] = useState<'9' | '18' | '36' | 'custom'>('18');
  const [customText, setCustomText] = useState('');
  const [loading, setLoading]   = useState(true);
  const [showEditSheet, setShowEditSheet] = useState(false);

  const DEFAULT_PARS = [4,4,3,4,5,3,4,5,4,4,3,4,5,4,3,5,4,4];

  useEffect(() => {
    if (!id) return;
    Promise.all([
      getRoundWithPlayers(id),
      getHoles(id),
      getMatchTeams(id).catch(() => []),
      getMatchHoles(id).catch(() => []),
    ]).then(([r, h, mt, mh]) => {
      setRound(r);
      setDbHoles(h);
      // totalHoles defaults to 18; user can change in setup
      const tm: TeamMap = {};
      for (const t of mt) tm[t.player_id] = t.team;
      setTeams(tm);
      const rm: ResultMap = {};
      for (const hole of mh) if (hole.result) rm[hole.hole_number] = hole.result;
      setResults(rm);
      setLoading(false);
    });
  }, [id]);

  async function reloadRound() {
    if (!id) return;
    const r = await getRoundWithPlayers(id);
    if (r) setRound(r);
  }

  function buildHoles(h: Hole[], nh: number, rid: string): Hole[] {
    return h.length > 0
      ? h.slice(0, nh)
      : Array.from({ length: nh }, (_, i) => ({
          round_id: rid,
          hole_number: i + 1,
          par: DEFAULT_PARS[i] ?? 4,
          yardage: null,
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

  function startMatch() {
    setHoles(buildHoles(dbHoles, totalHoles, id!));
    setPhase('scoring');
  }

  const toggle = useCallback(async (pid: string, t: 'a' | 'b', isTempPlayer: boolean) => {
    if (teams[pid] === t) {
      setTeams((prev) => { const n = { ...prev }; delete n[pid]; return n; });
      if (!isTempPlayer) deleteMatchTeam(id!, pid).catch(() => {});
    } else {
      setTeams((prev) => ({ ...prev, [pid]: t }));
      if (!isTempPlayer) upsertMatchTeam(id!, pid, t).catch(() => {});
    }
  }, [id, teams]);

  const setResult = useCallback((hole: number, r: 'a' | 'b' | 'halve' | null) => {
    setResults((prev) => {
      const n = { ...prev };
      if (r == null) delete n[hole]; else n[hole] = r;
      return n;
    });
    upsertMatchHole(id!, hole, r).catch(() => {});
  }, [id]);

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

  const players = round.players as RoundPlayer[];
  const aLabel  = teamName(players, 'a', teams);
  const bLabel  = teamName(players, 'b', teams);

  const { diff, played } = calcScore(results);
  const remaining = round.total_holes - played;
  const up        = Math.abs(diff);
  const leader    = diff > 0 ? aLabel : bLabel;
  const aCount    = Object.values(teams).filter((t) => t === 'a').length;
  const bCount    = Object.values(teams).filter((t) => t === 'b').length;
  const canStart  = aCount >= 1 && bCount >= 1;
  const hostId    = round.host_id;

  let scoreText: string, statusText: string;
  if (played === 0)      { scoreText = 'All Square'; statusText = `${round.total_holes} to play`; }
  else if (diff === 0)   { scoreText = 'All Square'; statusText = `thru ${played}`; }
  else if (up > remaining) { scoreText = `${leader} wins`; statusText = `${up} & ${remaining}`; }
  else if (up === remaining && remaining > 0) { scoreText = `${up} UP`; statusText = `${leader} · dormie`; }
  else                   { scoreText = `${up} UP`; statusText = `${leader} · thru ${played}`; }

  return (
    <View style={g.root}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.green }}>
        {phase === 'setup' ? (
          <View style={g.topBar}>
            <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} activeOpacity={0.7} style={g.topBarBackHit}>
              <Text style={g.back}>← Back</Text>
            </TouchableOpacity>
            <Text style={g.topBarTitle}>Match Play</Text>
          </View>
        ) : (
          <TopBar
            left={
              <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} activeOpacity={0.7}>
                <Text style={g.back}>← Back</Text>
              </TouchableOpacity>
            }
            right={<Text style={g.courseLabel}>{round.course_name ?? ''}</Text>}
          />
        )}

        {/* Score header — scoring phase only */}
        {phase === 'scoring' && (
          <View style={g.scoreHeader}>
            <View style={g.teamStack}>
              {players.filter((p) => teams[effId(p)] === 'a').map((p, i) => (
                <Avatar key={effId(p)}
                  initials={effInitials(p)}
                  bg={effAvatarColor(p)}
                  textColor={effAvatarTextColor(p)}
                  size={30} borderWidth={1.5} borderColor="rgba(216,214,175,0.4)"
                  style={{ marginRight: -8, zIndex: 10 - i }}
                />
              ))}
            </View>
            <View style={g.scoreMid}>
              <Text style={g.scoreMain}>{scoreText}</Text>
              <Text style={g.scoreSub}>{statusText}</Text>
            </View>
            <View style={[g.teamStack, { flexDirection: 'row-reverse' }]}>
              {players.filter((p) => teams[effId(p)] === 'b').map((p, i) => {
                return (
                  <Avatar key={effId(p)}
                    initials={effInitials(p)}
                    bg={effAvatarColor(p)}
                    textColor={effAvatarTextColor(p)}
                    size={30} borderWidth={1.5} borderColor="rgba(216,214,175,0.4)"
                    style={{ marginLeft: -8, zIndex: 10 - i }}
                  />
                );
              })}
            </View>
          </View>
        )}

      </SafeAreaView>

      {/* ── Setup phase — plain scrollview, no drawer ── */}
      {phase === 'setup' && (
        <ScrollView style={{ flex: 1, backgroundColor: Colors.bg }} showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}>
            <Text style={su.setupHeading}>Set up the game</Text>

            {/* Teams card */}
            <View style={su.fieldCard}>
              <View style={su.cardLabelRow}>
                <Text style={su.fieldLabel}>Teams</Text>
                <TouchableOpacity onPress={() => setShowEditSheet(true)} activeOpacity={0.7}>
                  <Text style={su.editLink}>Edit players</Text>
                </TouchableOpacity>
              </View>
              {players.map((p, i) => {
                const eid = effId(p);
                const cur = teams[eid];
                const isTempPlayer = p.player_id == null;
                return (
                  <View key={eid} style={[su.row, i < players.length - 1 && su.rowBorder]}>
                    <Avatar
                      initials={effInitials(p)}
                      bg={effAvatarColor(p)}
                      textColor={effAvatarTextColor(p)}
                      size={34} borderWidth={0} borderColor="transparent"
                    />
                    <Text style={su.name}>
                      {effName(p)}
                      {p.is_host ? <Text style={su.host}> host</Text> : null}
                      {isTempPlayer ? <Text style={su.host}> guest</Text> : null}
                    </Text>
                    <View style={su.toggles}>
                      <TouchableOpacity
                        onPress={() => toggle(eid, 'a', isTempPlayer)}
                        style={[su.teamBtn, cur === 'a' && su.teamBtnAOn]}
                        activeOpacity={0.7}
                      >
                        <Text style={[su.teamBtnText, cur === 'a' && su.teamBtnAOnText]}>A</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => toggle(eid, 'b', isTempPlayer)}
                        style={[su.teamBtn, cur === 'b' && su.teamBtnBOn]}
                        activeOpacity={0.7}
                      >
                        <Text style={[su.teamBtnText, cur === 'b' && su.teamBtnBOnText]}>B</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
            {/* Holes selector */}
            <View style={su.fieldCard}>
              <Text style={su.fieldLabel}>Holes</Text>
              <View style={su.segRow}>
                {(['9', '18', '36', 'custom'] as const).map((mode) => (
                  <TouchableOpacity
                    key={mode}
                    style={[su.seg, holeMode === mode && su.segActive]}
                    onPress={() => selectHoleMode(mode)}
                    activeOpacity={0.8}
                  >
                    <Text style={[su.segText, holeMode === mode && su.segTextActive]}>
                      {mode === 'custom' ? 'Custom' : mode}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {holeMode === 'custom' && (
                <TextInput
                  style={su.customInput}
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

            <View style={su.setupNote}>
              <Text style={su.setupNoteText}>
                Match play · {totalHoles} holes · {players.length} players
              </Text>
            </View>

            <TouchableOpacity
              style={[su.startBtn, !canStart && su.startBtnOff]}
              onPress={canStart ? startMatch : undefined}
              activeOpacity={0.8}
            >
              <Text style={su.startBtnText}>Start</Text>
            </TouchableOpacity>
        </ScrollView>
      )}
      <EditPlayersSheet
        roundId={id ?? ''}
        hostId={hostId}
        visible={showEditSheet}
        currentUserId={userId}
        onClose={() => setShowEditSheet(false)}
        onDone={reloadRound}
      />

      {/* ── Scoring phase — drawer with handle ── */}
      {phase === 'scoring' && (
        <View style={[g.drawer, { paddingBottom: insets.bottom + 24 }]}>
          <View style={g.handle} />
          <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
            {holes.map((hole) => (
              <HoleRow
                key={hole.hole_number}
                hole={hole}
                result={results[hole.hole_number] ?? null}
                aLabel={aLabel}
                bLabel={bLabel}
                onResult={(r) => setResult(hole.hole_number, r)}
              />
            ))}
            <TouchableOpacity
              style={sc.reassign}
              onPress={() => setPhase('setup')}
              activeOpacity={0.7}
            >
              <Text style={sc.reassignText}>← Re-assign teams</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const g = StyleSheet.create({
  root:       { flex: 1, backgroundColor: Colors.green },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 16, paddingVertical: 12, position: 'relative',
  },
  topBarTitle: { fontFamily: Fonts.serifMedium, fontSize: 18, color: Colors.cream },
  topBarBackHit: { position: 'absolute', left: 0, paddingHorizontal: 16, paddingVertical: 12 },
  back:       { fontFamily: Fonts.sans, fontSize: 13, color: 'rgba(216,214,175,0.6)' },
  courseLabel:{ fontFamily: Fonts.sans, fontSize: 13, color: 'rgba(216,214,175,0.6)' },
  notFound:   { fontFamily: Fonts.serifMedium, fontSize: 20, color: Colors.cream },

  scoreHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingBottom: 20, gap: 12,
  },
  teamStack: { flexDirection: 'row', minWidth: 48 },
  scoreMid:  { flex: 1, alignItems: 'center' },
  scoreMain: {
    fontFamily: Fonts.serifMedium, fontSize: 28,
    color: Colors.cream, textAlign: 'center',
  },
  scoreSub: {
    fontFamily: Fonts.sans, fontSize: 11,
    color: 'rgba(216,214,175,0.55)', textAlign: 'center', marginTop: 2,
  },

  setupSubtitle: { paddingHorizontal: 18, paddingBottom: 18 },
  setupSubtitleText: { fontFamily: Fonts.sans, fontSize: 13, color: 'rgba(216,214,175,0.55)' },

  drawer: {
    flex: 1,
    backgroundColor: Colors.bg,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    marginTop: -12,
    paddingTop: 16, paddingHorizontal: 16,
  },
  handle: {
    width: 32, height: 3, backgroundColor: '#d8d4c0',
    borderRadius: 4, alignSelf: 'center', marginBottom: 16,
  },
});

// Setup styles
const su = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12,
  },
  name: { fontFamily: Fonts.sansMedium, fontSize: 14, color: Colors.text, flex: 1 },
  host: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.muted },
  toggles: { flexDirection: 'row', gap: 8, width: 140 },
  teamBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    backgroundColor: Colors.creamLight,
    alignItems: 'center', justifyContent: 'center',
  },
  teamBtnText: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: Colors.muted },
  teamBtnAOn: { backgroundColor: Colors.green },
  teamBtnAOnText: { color: Colors.cream },
  teamBtnBOn: { backgroundColor: '#7a4020' },
  teamBtnBOnText: { color: '#fff' },
  fieldCard: {
    backgroundColor: Colors.card, borderRadius: 14, borderWidth: 0.5,
    borderColor: Colors.border, padding: 16, gap: 12, marginBottom: 12,
  },
  rowBorder: { borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  setupHeading: { fontFamily: Fonts.serifMedium, fontSize: 24, color: Colors.text, marginBottom: 12, marginTop: 4 },
  fieldLabel: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.muted, marginBottom: 4 },
  cardLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  editLink: { fontFamily: Fonts.sansMedium, fontSize: 13, color: Colors.green },
  setupNote: { paddingVertical: 10, alignItems: 'center' },
  setupNoteText: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.muted },
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
  startBtn: {
    marginTop: 4, backgroundColor: Colors.green,
    borderRadius: 14, paddingVertical: 16, alignItems: 'center',
  },
  startBtnOff: { opacity: 0.35 },
  startBtnText: { fontFamily: Fonts.sansSemiBold, fontSize: 16, color: Colors.cream },
});

// Scoring styles
const sc = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 0.5, borderBottomColor: Colors.border,
  },
  holeInfo: { width: 38 },
  holeNum:  { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: Colors.text },
  holePar:  { fontFamily: Fonts.sans, fontSize: 11, color: Colors.muted },

  btns: { flex: 1, flexDirection: 'row', gap: 4 },
  btn: {
    flex: 1, paddingVertical: 9, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  btnText: { fontFamily: Fonts.sansMedium, fontSize: 12, color: Colors.muted },

  btnA:       { backgroundColor: '#e4f0e4' },
  btnAOn:     { backgroundColor: Colors.green },
  btnAOnText: { color: Colors.cream, fontFamily: Fonts.sansSemiBold },

  btnH:       { backgroundColor: Colors.creamLight },
  btnHOn:     { backgroundColor: '#c0bc9c' },
  btnHOnText: { color: Colors.text, fontFamily: Fonts.sansSemiBold },

  btnB:       { backgroundColor: '#f5ede6' },
  btnBOn:     { backgroundColor: '#7a4020' },
  btnBOnText: { color: '#fff', fontFamily: Fonts.sansSemiBold },

  reassign: { paddingVertical: 22, alignItems: 'center' },
  reassignText: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.muted, textDecorationLine: 'underline' },
});
