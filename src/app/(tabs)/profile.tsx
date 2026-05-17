import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { TopBar } from '@/components/TopBar';
import { Colors, Fonts, Spacing } from '@/constants/theme';

// ─── Mock data ────────────────────────────────────────────────────────────────

const USER = {
  initials: 'WK',
  name: 'Wyatt K.',
  handicap: 12.4,
  bg: Colors.creamLight,
  textColor: Colors.green,
};

const STATS = [
  { value: '24', label: 'rounds' },
  { value: '+6.2', label: 'avg score' },
  { value: '47', label: 'birdies' },
];

const RECENT_ROUNDS = [
  { id: '1', course: 'Cog Hill No. 4', date: 'May 17', format: 'Stroke', diff: 4 },
  { id: '2', course: 'Medinah No. 3', date: 'May 10', format: 'Match', diff: 9 },
  { id: '3', course: 'Cog Hill No. 2', date: 'May 3', format: 'Stroke', diff: 7 },
  { id: '4', course: 'Butler National', date: 'Apr 26', format: 'Stroke', diff: 2 },
] as const;

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

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <View style={s.statTile}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

function RoundRow({
  round, showBorder,
}: {
  round: (typeof RECENT_ROUNDS)[number]; showBorder: boolean;
}) {
  return (
    <View style={[s.roundRow, showBorder && s.roundRowBorder]}>
      <View style={s.roundLeft}>
        <Text style={s.roundCourse}>{round.course}</Text>
        <Text style={s.roundMeta}>{round.date} · {round.format}</Text>
      </View>
      <Text style={[s.roundScore, { color: toParColor(round.diff) }]}>
        {toParLabel(round.diff)}
      </Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.green }}>
        <TopBar right={<Text style={s.settingsBtn}>⚙️</Text>} />
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xxl }}
      >
        {/* ── Green header ── */}
        <View style={s.header}>
          <Avatar
            initials={USER.initials}
            bg={USER.bg}
            textColor={USER.textColor}
            size={72}
            borderColor={Colors.green}
            borderWidth={3}
          />
          <Text style={s.userName}>{USER.name}</Text>
          <View style={s.hcpBadge}>
            <Text style={s.hcpText}>HCP {USER.handicap.toFixed(1)}</Text>
          </View>
        </View>

        {/* ── Drawer ── */}
        <View style={s.drawer}>
          <View style={s.handle} />

          {/* Stats row */}
          <View style={s.statsRow}>
            {STATS.map((stat, i) => (
              <React.Fragment key={stat.label}>
                <StatTile value={stat.value} label={stat.label} />
                {i < STATS.length - 1 && <View style={s.statDivider} />}
              </React.Fragment>
            ))}
          </View>

          {/* Recent rounds */}
          <Text style={s.sectionLabel}>On the card 🃏</Text>
          <View style={s.card}>
            {RECENT_ROUNDS.map((r, i) => (
              <RoundRow
                key={r.id}
                round={r}
                showBorder={i < RECENT_ROUNDS.length - 1}
              />
            ))}
          </View>

          {/* Settings links */}
          <View style={s.settingsCard}>
            <TouchableOpacity style={s.settingsRow} activeOpacity={0.7}>
              <Text style={s.settingsRowText}>Edit profile</Text>
              <Text style={s.settingsArrow}>›</Text>
            </TouchableOpacity>
            <View style={s.settingsRowDivider} />
            <TouchableOpacity style={s.settingsRow} activeOpacity={0.7}>
              <Text style={s.settingsRowText}>Notifications</Text>
              <Text style={s.settingsArrow}>›</Text>
            </TouchableOpacity>
            <View style={s.settingsRowDivider} />
            <TouchableOpacity style={s.settingsRow} activeOpacity={0.7}>
              <Text style={[s.settingsRowText, { color: '#b04030' }]}>Sign out</Text>
              <Text style={s.settingsArrow}>›</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.green },

  settingsBtn: { fontSize: 16 },

  // Header
  header: {
    backgroundColor: Colors.green,
    paddingHorizontal: 18,
    paddingBottom: 28,
    alignItems: 'center',
  },
  userName: {
    fontFamily: Fonts.serifMedium,
    fontSize: 26,
    color: Colors.cream,
    marginTop: 12,
    marginBottom: 8,
  },
  hcpBadge: {
    backgroundColor: 'rgba(216,214,175,0.15)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(216,214,175,0.25)',
  },
  hcpText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 12,
    color: 'rgba(216,214,175,0.7)',
    letterSpacing: 0.5,
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

  // Stats
  statsRow: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: Colors.border,
    marginBottom: 20,
    overflow: 'hidden',
  },
  statTile: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
  },
  statValue: {
    fontFamily: Fonts.serifMedium,
    fontSize: 24,
    color: Colors.text,
    marginBottom: 3,
  },
  statLabel: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    color: Colors.muted,
  },
  statDivider: {
    width: 0.5,
    backgroundColor: Colors.border,
    marginVertical: 12,
  },

  // Recent rounds
  card: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    marginBottom: 20,
  },
  roundRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
  },
  roundRowBorder: {
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  roundLeft: { flex: 1 },
  roundCourse: {
    fontFamily: Fonts.sansMedium,
    fontSize: 14,
    color: Colors.text,
    marginBottom: 2,
  },
  roundMeta: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: Colors.muted,
  },
  roundScore: {
    fontFamily: Fonts.serifMedium,
    fontSize: 22,
    minWidth: 32,
    textAlign: 'right',
  },

  // Settings
  settingsCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: Colors.border,
    paddingHorizontal: 14,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  settingsRowDivider: {
    height: 0.5,
    backgroundColor: Colors.border,
  },
  settingsRowText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 14,
    color: Colors.text,
  },
  settingsArrow: {
    fontFamily: Fonts.sans,
    fontSize: 18,
    color: Colors.muted,
  },
});
