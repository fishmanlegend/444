import { useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { TopBar } from '@/components/TopBar';
import { Colors, Fonts, Spacing } from '@/constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Player {
  id: string;
  initials: string;
  bg: string;
  textColor: string;
  name: string;
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const ROUND = {
  course: 'Cog Hill No. 4 🌿',
  meta: 'Stroke play · Sat May 17 · 18 holes',
};

const PLAYERS: Player[] = [
  { id: 'wk', initials: 'WK', bg: Colors.creamLight, textColor: Colors.green, name: 'Wyatt K.' },
  { id: 'mr', initials: 'MR', bg: '#c8a96e', textColor: '#fff', name: 'Mike R.' },
  { id: 'dk', initials: 'DK', bg: '#5a8a5a', textColor: '#fff', name: 'Dave K.' },
  { id: 'pw', initials: 'PW', bg: '#7a6a9a', textColor: '#fff', name: 'Pete W.' },
];

const RESULTS = [
  { player: PLAYERS[2], strokes: 74, diff: 2, rank: 1 },
  { player: PLAYERS[0], strokes: 76, diff: 4, rank: 2 },
  { player: PLAYERS[1], strokes: 79, diff: 7, rank: 3 },
  { player: PLAYERS[3], strokes: 81, diff: 9, rank: 4 },
];

const HIGHLIGHTS = [
  { label: 'Low round', value: '74', sub: 'Dave K.' },
  { label: 'Eagle', value: '3', sub: 'Wyatt K. · #2' },
  { label: 'Most birdies', value: '4 🐦', sub: 'Dave K.' },
];

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

// ─── Sub-components ───────────────────────────────────────────────────────────

function ResultRow({
  player, strokes, diff, rank, showBorder,
}: {
  player: Player; strokes: number; diff: number; rank: number; showBorder: boolean;
}) {
  const isWinner = rank === 1;
  return (
    <View style={[s.resultRow, showBorder && s.resultRowBorder]}>
      <Text style={[s.resultRank, isWinner && s.resultRankWinner]}>{rank === 1 ? '🏆' : rank}</Text>
      <Avatar
        initials={player.initials}
        bg={player.bg}
        textColor={player.textColor}
        size={30}
        borderWidth={0}
        borderColor="transparent"
      />
      <Text style={[s.resultName, isWinner && s.resultNameWinner]}>{player.name}</Text>
      <View style={s.resultRight}>
        <Text style={[s.resultDiff, { color: toParColor(diff) }]}>{toParLabel(diff)}</Text>
        <Text style={s.resultStrokes}>{strokes}</Text>
      </View>
    </View>
  );
}

function HighlightTile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <View style={s.highlight}>
      <Text style={s.highlightValue}>{value}</Text>
      <Text style={s.highlightLabel}>{label}</Text>
      <Text style={s.highlightSub}>{sub}</Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PostRoundScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const winner = RESULTS[0];

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.green }}>
        <TopBar
          left={
            <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
              <Text style={s.backBtn}>← Back</Text>
            </TouchableOpacity>
          }
          right={<Text style={s.doneBtn} onPress={() => router.replace('/')}>Done</Text>}
        />
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xxl }}
      >
        {/* ── Green header ── */}
        <View style={s.header}>
          <View style={s.winnerBox}>
            <Avatar
              initials={winner.player.initials}
              bg={winner.player.bg}
              textColor={winner.player.textColor}
              size={56}
              borderColor={Colors.green}
              borderWidth={3}
            />
            <Text style={s.winnerName}>{winner.player.name}</Text>
            <Text style={s.winnerScore}>
              {winner.strokes} · {toParLabel(winner.diff)}
            </Text>
            <Text style={s.winnerTag}>wins the round 🏆</Text>
          </View>

          <Text style={s.courseName}>{ROUND.course}</Text>
          <Text style={s.meta}>{ROUND.meta}</Text>
        </View>

        {/* ── Drawer ── */}
        <View style={s.drawer}>
          <View style={s.handle} />

          {/* Final standings */}
          <Text style={s.sectionLabel}>Final standings</Text>
          <View style={s.card}>
            {RESULTS.map((r, i) => (
              <ResultRow
                key={r.player.id}
                player={r.player}
                strokes={r.strokes}
                diff={r.diff}
                rank={r.rank}
                showBorder={i < RESULTS.length - 1}
              />
            ))}
          </View>

          {/* Highlights */}
          <Text style={[s.sectionLabel, { marginBottom: 10 }]}>Highlights ⚡</Text>
          <View style={s.highlightRow}>
            {HIGHLIGHTS.map((h) => (
              <HighlightTile key={h.label} label={h.label} value={h.value} sub={h.sub} />
            ))}
          </View>

          {/* CTAs */}
          <TouchableOpacity style={s.shareBtn} activeOpacity={0.7}>
            <Text style={s.shareBtnText}>Share scorecard 🔗</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.replace('/')} activeOpacity={0.7}>
            <Text style={s.homeLink}>Back to home</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.green },

  backBtn: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: 'rgba(216,214,175,0.6)',
  },
  doneBtn: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: 'rgba(216,214,175,0.6)',
  },

  // Header
  header: {
    backgroundColor: Colors.green,
    paddingHorizontal: 18,
    paddingBottom: 30,
    alignItems: 'flex-start',
  },
  winnerBox: {
    alignSelf: 'center',
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 8,
  },
  winnerName: {
    fontFamily: Fonts.serifMedium,
    fontSize: 26,
    color: Colors.cream,
    marginTop: 10,
    marginBottom: 2,
  },
  winnerScore: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    color: 'rgba(216,214,175,0.7)',
    marginBottom: 6,
  },
  winnerTag: {
    fontFamily: Fonts.sansMedium,
    fontSize: 12,
    color: 'rgba(216,214,175,0.5)',
    letterSpacing: 0.5,
  },
  courseName: {
    fontFamily: Fonts.serifMedium,
    fontSize: 19,
    color: Colors.cream,
    marginBottom: 3,
  },
  meta: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: 'rgba(216,214,175,0.6)',
  },

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
  sectionLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 10,
    color: Colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 10,
  },

  // Results card
  card: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    marginBottom: 20,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 10,
  },
  resultRowBorder: {
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  resultRank: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 12,
    color: Colors.muted,
    width: 20,
    textAlign: 'center',
  },
  resultRankWinner: { fontSize: 16 },
  resultName: {
    fontFamily: Fonts.sansMedium,
    fontSize: 14,
    color: Colors.text,
    flex: 1,
  },
  resultNameWinner: {
    fontFamily: Fonts.sansSemiBold,
    color: Colors.text,
  },
  resultRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  resultDiff: {
    fontFamily: Fonts.serifMedium,
    fontSize: 20,
    minWidth: 28,
    textAlign: 'right',
  },
  resultStrokes: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: Colors.muted,
    width: 24,
    textAlign: 'right',
  },

  // Highlights
  highlightRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  highlight: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: Colors.border,
    padding: 12,
    alignItems: 'center',
  },
  highlightValue: {
    fontFamily: Fonts.serifMedium,
    fontSize: 22,
    color: Colors.text,
    marginBottom: 2,
  },
  highlightLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 9,
    color: Colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 3,
  },
  highlightSub: {
    fontFamily: Fonts.sans,
    fontSize: 10,
    color: Colors.muted,
    textAlign: 'center',
  },

  // CTAs
  shareBtn: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: Colors.border,
    padding: 15,
    alignItems: 'center',
    marginBottom: 12,
  },
  shareBtnText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 14,
    color: Colors.text,
  },
  homeLink: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: Colors.muted,
    textAlign: 'center',
    textDecorationLine: 'underline',
    paddingVertical: 4,
  },
});
