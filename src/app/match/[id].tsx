import React, { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
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
import type { Round, RoundPlayer, Hole } from '@/lib/database.types';

// ─── Types ────────────────────────────────────────────────────────────────────

type TeamMap   = Record<string, 'a' | 'b'>;
type ResultMap = Record<number, 'a' | 'b' | 'halve'>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function teamName(players: RoundPlayer[], team: 'a' | 'b', teams: TeamMap): string {
  const tp = players.filter((p) => teams[p.player_id] === team);
  if (!tp.length) return team === 'a' ? 'Team A' : 'Team B';
  const first = (((tp[0] as any).profile?.name as string) ?? '').split(' ')[0];
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

  const [round, setRound]     = useState<(Round & { players: RoundPlayer[] }) | null>(null);
  const [holes, setHoles]     = useState<Hole[]>([]);
  const [teams, setTeams]     = useState<TeamMap>({});
  const [results, setResults] = useState<ResultMap>({});
  const [phase, setPhase]     = useState<'setup' | 'scoring'>('setup');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      getRoundWithPlayers(id),
      getHoles(id),
      getMatchTeams(id).catch(() => []),
      getMatchHoles(id).catch(() => []),
    ]).then(([r, h, mt, mh]) => {
      setRound(r);
      setHoles(h);
      const tm: TeamMap = {};
      for (const t of mt) tm[t.player_id] = t.team;
      setTeams(tm);
      const rm: ResultMap = {};
      for (const hole of mh) if (hole.result) rm[hole.hole_number] = hole.result;
      setResults(rm);
      if (mt.length >= 2) setPhase('scoring');
      setLoading(false);
    });
  }, [id]);

  const toggle = useCallback(async (pid: string, t: 'a' | 'b') => {
    if (teams[pid] === t) {
      setTeams((prev) => { const n = { ...prev }; delete n[pid]; return n; });
      deleteMatchTeam(id!, pid).catch(() => {});
    } else {
      setTeams((prev) => ({ ...prev, [pid]: t }));
      upsertMatchTeam(id!, pid, t).catch(() => {});
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

  let scoreText: string, statusText: string;
  if (played === 0)      { scoreText = 'All Square'; statusText = `${round.total_holes} to play`; }
  else if (diff === 0)   { scoreText = 'All Square'; statusText = `thru ${played}`; }
  else if (up > remaining) { scoreText = `${leader} wins`; statusText = `${up} & ${remaining}`; }
  else if (up === remaining && remaining > 0) { scoreText = `${up} UP`; statusText = `${leader} · dormie`; }
  else                   { scoreText = `${up} UP`; statusText = `${leader} · thru ${played}`; }

  return (
    <View style={g.root}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.green }}>
        <TopBar
          left={
            <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
              <Text style={g.back}>← Back</Text>
            </TouchableOpacity>
          }
          right={<Text style={g.courseLabel}>{round.course_name ?? 'Match play'}</Text>}
        />

        {/* Score header — scoring phase only */}
        {phase === 'scoring' && (
          <View style={g.scoreHeader}>
            <View style={g.teamStack}>
              {players.filter((p) => teams[p.player_id] === 'a').map((p, i) => {
                const pr = (p as any).profile;
                return (
                  <Avatar key={p.player_id}
                    initials={pr?.initials ?? '?'}
                    bg={pr?.avatar_color ?? Colors.green}
                    textColor={pr?.avatar_text_color ?? Colors.cream}
                    size={30} borderWidth={1.5} borderColor="rgba(216,214,175,0.4)"
                    style={{ marginRight: -8, zIndex: 10 - i }}
                  />
                );
              })}
            </View>
            <View style={g.scoreMid}>
              <Text style={g.scoreMain}>{scoreText}</Text>
              <Text style={g.scoreSub}>{statusText}</Text>
            </View>
            <View style={[g.teamStack, { flexDirection: 'row-reverse' }]}>
              {players.filter((p) => teams[p.player_id] === 'b').map((p, i) => {
                const pr = (p as any).profile;
                return (
                  <Avatar key={p.player_id}
                    initials={pr?.initials ?? '?'}
                    bg={pr?.avatar_color ?? Colors.green}
                    textColor={pr?.avatar_text_color ?? Colors.cream}
                    size={30} borderWidth={1.5} borderColor="rgba(216,214,175,0.4)"
                    style={{ marginLeft: -8, zIndex: 10 - i }}
                  />
                );
              })}
            </View>
          </View>
        )}

        {phase === 'setup' && (
          <View style={g.setupSubtitle}>
            <Text style={g.setupSubtitleText}>Assign players to teams</Text>
          </View>
        )}
      </SafeAreaView>

      {/* Cream drawer */}
      <View style={[g.drawer, { paddingBottom: insets.bottom + 24 }]}>
        <View style={g.handle} />

        {/* ── Setup phase ── */}
        {phase === 'setup' && (
          <>
            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
              {players.map((p) => {
                const pr  = (p as any).profile;
                const cur = teams[p.player_id];
                return (
                  <View key={p.player_id} style={su.row}>
                    <Avatar
                      initials={pr?.initials ?? '?'}
                      bg={pr?.avatar_color ?? Colors.green}
                      textColor={pr?.avatar_text_color ?? Colors.cream}
                      size={34} borderWidth={0} borderColor="transparent"
                    />
                    <Text style={su.name}>
                      {pr?.name ?? 'Unknown'}
                      {p.is_host ? <Text style={su.host}> host</Text> : null}
                    </Text>
                    <View style={su.toggles}>
                      <TouchableOpacity
                        onPress={() => toggle(p.player_id, 'a')}
                        style={[su.teamBtn, cur === 'a' && su.teamBtnAOn]}
                        activeOpacity={0.7}
                      >
                        <Text style={[su.teamBtnText, cur === 'a' && su.teamBtnAOnText]}>A</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => toggle(p.player_id, 'b')}
                        style={[su.teamBtn, cur === 'b' && su.teamBtnBOn]}
                        activeOpacity={0.7}
                      >
                        <Text style={[su.teamBtnText, cur === 'b' && su.teamBtnBOnText]}>B</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
            <TouchableOpacity
              style={[su.startBtn, !canStart && su.startBtnOff]}
              onPress={canStart ? () => setPhase('scoring') : undefined}
              activeOpacity={0.8}
            >
              <Text style={su.startBtnText}>Start Match →</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── Scoring phase ── */}
        {phase === 'scoring' && (
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
        )}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const g = StyleSheet.create({
  root:       { flex: 1, backgroundColor: Colors.green },
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
    borderBottomWidth: 0.5, borderBottomColor: Colors.border,
  },
  name: { fontFamily: Fonts.sansMedium, fontSize: 14, color: Colors.text, flex: 1 },
  host: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.muted },
  toggles: { flexDirection: 'row', gap: 6 },
  teamBtn: {
    width: 36, height: 32, borderRadius: 8,
    backgroundColor: Colors.creamLight,
    alignItems: 'center', justifyContent: 'center',
  },
  teamBtnText: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: Colors.muted },
  teamBtnAOn: { backgroundColor: Colors.green },
  teamBtnAOnText: { color: Colors.cream },
  teamBtnBOn: { backgroundColor: '#7a4020' },
  teamBtnBOnText: { color: '#fff' },
  startBtn: {
    marginTop: 16, backgroundColor: Colors.green,
    borderRadius: 14, paddingVertical: 15, alignItems: 'center',
  },
  startBtnOff: { opacity: 0.35 },
  startBtnText: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: Colors.cream },
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
