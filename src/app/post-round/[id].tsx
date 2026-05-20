import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { TopBar } from '@/components/TopBar';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { getRoundWithPlayers, getScores, getHoles, finalizeRound, updateRoundStatus } from '@/lib/db';
import { notifyRoundsChanged } from '@/lib/roundsRefresh';
import type { Round, RoundPlayer, Score, Hole } from '@/lib/database.types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Standing {
  player: RoundPlayer;
  strokes: number;
  diff: number;
  rank: number;
  holesPlayed: number;
}

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

function calcStandings(players: RoundPlayer[], scores: Score[], holes: Hole[], totalHoles: number): Standing[] {
  const parMap: Record<number, number> = {};
  for (const h of holes) parMap[h.hole_number] = h.par;
  const defaultPar = 4;

  return players
    .map((p) => {
      const playerScores = scores.filter((s) => s.player_id === p.player_id);
      const strokes = playerScores.reduce((sum, s) => sum + (s.strokes ?? 0), 0);
      const totalPar = playerScores.reduce((sum, s) => sum + (parMap[s.hole_number] ?? defaultPar), 0);
      const diff = strokes > 0 ? strokes - totalPar : 0;
      return { player: p, strokes, diff, rank: 0, holesPlayed: playerScores.filter((s) => s.strokes != null).length };
    })
    .sort((a, b) => {
      if (a.holesPlayed === 0 && b.holesPlayed === 0) return 0;
      if (a.holesPlayed === 0) return 1;
      if (b.holesPlayed === 0) return -1;
      return a.strokes - b.strokes;
    })
    .map((s, i) => ({ ...s, rank: i + 1 }));
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ResultRow({ standing, showBorder }: { standing: Standing; showBorder: boolean }) {
  const { player, strokes, diff, rank, holesPlayed } = standing;
  const profile = (player as any).profile;
  const isWinner = rank === 1;
  const noScore = holesPlayed === 0;

  return (
    <View style={[s.resultRow, showBorder && s.resultRowBorder]}>
      <Text style={[s.resultRank, isWinner && s.resultRankWinner]}>{rank === 1 ? '🏆' : rank}</Text>
      <Avatar
        initials={profile?.initials ?? '?'}
        bg={profile?.avatar_color ?? Colors.green}
        textColor={profile?.avatar_text_color ?? Colors.cream}
        size={30}
        borderWidth={0}
        borderColor="transparent"
      />
      <Text style={[s.resultName, isWinner && s.resultNameWinner]}>
        {profile?.name ?? 'Player'}
      </Text>
      <View style={s.resultRight}>
        {noScore ? (
          <Text style={s.resultStrokes}>—</Text>
        ) : (
          <>
            <Text style={[s.resultDiff, { color: toParColor(diff) }]}>{toParLabel(diff)}</Text>
            <Text style={s.resultStrokes}>{strokes}</Text>
          </>
        )}
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PostRoundScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [round, setRound] = useState<(Round & { players: RoundPlayer[] }) | null>(null);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    Promise.all([getRoundWithPlayers(id), getScores(id), getHoles(id)]).then(([r, scores, holes]) => {
      if (!r) { setLoading(false); return; }
      setRound(r);
      const players = (r.players as RoundPlayer[]).filter((p) => p.rsvp === 'in');
      setStandings(calcStandings(players, scores, holes, r.total_holes));
      setLoading(false);
    });
  }, [id]);

  async function handleDone() {
    if (!id) return;
    setCompleting(true);
    if (round && round.status !== 'completed') {
      const playerIds = (round.players as RoundPlayer[])
        .filter((p) => p.rsvp === 'in')
        .map((p) => p.player_id);
      await finalizeRound(id, playerIds, round.host_id, round.scheduled_at);
    } else if (!round || round.status !== 'completed') {
      await updateRoundStatus(id, 'completed');
    }
    notifyRoundsChanged();
    router.replace('/' as any);
  }

  if (loading) {
    return (
      <View style={[s.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={Colors.cream} />
      </View>
    );
  }

  if (!round) {
    return (
      <View style={[s.root, { alignItems: 'center', justifyContent: 'center', padding: 32 }]}>
        <Text style={{ fontFamily: Fonts.serifMedium, fontSize: 20, color: Colors.cream }}>Round not found</Text>
      </View>
    );
  }

  const winner = standings[0];
  const winnerProfile = winner ? (winner.player as any).profile : null;

  const meta = [
    round.format.charAt(0).toUpperCase() + round.format.slice(1),
    round.scheduled_at ? fmtDate(round.scheduled_at) : null,
    `${round.total_holes} holes`,
  ].filter(Boolean).join(' · ');

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.green }}>
        <TopBar
          left={
            <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
              <Text style={s.backBtn}>← Back</Text>
            </TouchableOpacity>
          }
          right={
            <TouchableOpacity onPress={handleDone} activeOpacity={0.7} disabled={completing}>
              <Text style={s.doneBtn}>{completing ? 'Saving...' : 'Done'}</Text>
            </TouchableOpacity>
          }
        />
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xxl }}
      >
        {/* ── Green header ── */}
        <View style={s.header}>
          {winner && winner.holesPlayed > 0 && (
            <View style={s.winnerBox}>
              <Avatar
                initials={winnerProfile?.initials ?? '?'}
                bg={winnerProfile?.avatar_color ?? Colors.green}
                textColor={winnerProfile?.avatar_text_color ?? Colors.cream}
                size={56}
                borderColor={Colors.green}
                borderWidth={3}
              />
              <Text style={s.winnerName}>{winnerProfile?.name ?? 'Player'}</Text>
              <Text style={s.winnerScore}>
                {winner.strokes} · {toParLabel(winner.diff)}
              </Text>
              <Text style={s.winnerTag}>wins the round 🏆</Text>
            </View>
          )}
          <Text style={s.courseName}>{round.course_name ?? 'Golf Round'}</Text>
          <Text style={s.metaText}>{meta}</Text>
        </View>

        {/* ── Drawer ── */}
        <View style={s.drawer}>
          <View style={s.handle} />

          <Text style={s.sectionLabel}>Final standings</Text>
          <View style={s.card}>
            {standings.length > 0 ? standings.map((st, i) => (
              <ResultRow key={st.player.id} standing={st} showBorder={i < standings.length - 1} />
            )) : (
              <View style={{ padding: 20, alignItems: 'center' }}>
                <Text style={{ fontFamily: Fonts.sans, fontSize: 14, color: Colors.muted }}>No scores recorded</Text>
              </View>
            )}
          </View>

          <TouchableOpacity onPress={handleDone} style={s.homeBtn} activeOpacity={0.7} disabled={completing}>
            <Text style={s.homeBtnText}>{completing ? 'Saving...' : 'Back to home'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.green },

  backBtn: { fontFamily: Fonts.sans, fontSize: 13, color: 'rgba(216,214,175,0.6)' },
  doneBtn: { fontFamily: Fonts.sansMedium, fontSize: 13, color: Colors.cream },

  header: { backgroundColor: Colors.green, paddingHorizontal: 18, paddingBottom: 30, alignItems: 'flex-start' },
  winnerBox: { alignSelf: 'center', alignItems: 'center', marginBottom: 24, marginTop: 8 },
  winnerName: { fontFamily: Fonts.serifMedium, fontSize: 26, color: Colors.cream, marginTop: 10, marginBottom: 2 },
  winnerScore: { fontFamily: Fonts.sans, fontSize: 14, color: 'rgba(216,214,175,0.7)', marginBottom: 6 },
  winnerTag: { fontFamily: Fonts.sansMedium, fontSize: 12, color: 'rgba(216,214,175,0.5)', letterSpacing: 0.5 },
  courseName: { fontFamily: Fonts.serifMedium, fontSize: 19, color: Colors.cream, marginBottom: 3 },
  metaText: { fontFamily: Fonts.sans, fontSize: 13, color: 'rgba(216,214,175,0.6)' },

  drawer: {
    backgroundColor: Colors.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -12,
    paddingTop: 22,
    paddingHorizontal: 16,
  },
  handle: { width: 32, height: 3, backgroundColor: '#d8d4c0', borderRadius: 4, alignSelf: 'center', marginBottom: 16 },
  sectionLabel: {
    fontFamily: Fonts.sansSemiBold, fontSize: 10, color: Colors.muted,
    textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10,
  },

  card: {
    backgroundColor: Colors.card, borderRadius: 14,
    borderWidth: 0.5, borderColor: Colors.border,
    paddingHorizontal: 14, marginBottom: 20,
  },
  resultRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 10 },
  resultRowBorder: { borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  resultRank: { fontFamily: Fonts.sansSemiBold, fontSize: 12, color: Colors.muted, width: 20, textAlign: 'center' },
  resultRankWinner: { fontSize: 16 },
  resultName: { fontFamily: Fonts.sansMedium, fontSize: 14, color: Colors.text, flex: 1 },
  resultNameWinner: { fontFamily: Fonts.sansSemiBold, color: Colors.text },
  resultRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  resultDiff: { fontFamily: Fonts.serifMedium, fontSize: 20, minWidth: 28, textAlign: 'right' },
  resultStrokes: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.muted, width: 24, textAlign: 'right' },

  homeBtn: {
    backgroundColor: Colors.card, borderRadius: 14,
    borderWidth: 0.5, borderColor: Colors.border,
    padding: 15, alignItems: 'center', marginBottom: 12,
  },
  homeBtnText: { fontFamily: Fonts.sansMedium, fontSize: 14, color: Colors.text },
});
