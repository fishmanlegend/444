import { useRouter } from 'expo-router';
import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { TopBar } from '@/components/TopBar';
import { Colors, Fonts, Spacing } from '@/constants/theme';

// ─── Mock data ────────────────────────────────────────────────────────────────

const USER = {
  initials: 'WK',
  name: 'Wyatt K.',
  handle: '@WyattK',
  location: 'Chicago, IL',
  bio: 'Weekend warrior. Cog Hill regular. Will bet on anything.',
  socialLinks: ['X @WyattK', '@wyatt.golf'],
  bg: Colors.creamLight,
  textColor: Colors.green,
};

const STATS = [
  { value: '47', label: 'rounds' },
  { value: '12', label: 'hosted' },
  { value: '8.4', label: 'handicap' },
];

const BADGES = [
  { emoji: '🏌️', title: '25 Rounds', sub: 'Played', earned: true },
  { emoji: '🎤', title: '10 Hosted', sub: 'Organizer', earned: true },
  { emoji: '🦅', title: 'Eagle Club', sub: 'Earned', earned: true },
  { emoji: '🏆', title: '50 Rounds', sub: '3 away', earned: false },
];

const PALS = [
  { initials: 'MR', bg: '#c8a96e', textColor: '#fff', name: 'Mike R.', handle: '@mikerounds', rounds: 18 },
  { initials: 'DL', bg: '#5a8a5a', textColor: '#fff', name: 'Darin L.', handle: '@darinl', rounds: 14 },
  { initials: 'CQ', bg: '#a06060', textColor: '#fff', name: 'Cathy Q.', handle: '@CathyQF', rounds: 9 },
  { initials: 'BS', bg: '#7a6a9a', textColor: '#fff', name: 'Broken Scaphoid', handle: '@brokenscaphoid', rounds: 8 },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function BadgeTile({ badge }: { badge: (typeof BADGES)[number] }) {
  return (
    <View style={[s.badgeTile, !badge.earned && s.badgeTileLocked]}>
      <Text style={[s.badgeEmoji, !badge.earned && s.badgeLocked]}>{badge.emoji}</Text>
      <Text style={[s.badgeTitle, !badge.earned && s.badgeLocked]}>{badge.title}</Text>
      <Text style={[s.badgeSub, !badge.earned && s.badgeLocked]}>{badge.sub}</Text>
    </View>
  );
}

function PalRow({ pal, showBorder }: { pal: (typeof PALS)[number]; showBorder: boolean }) {
  return (
    <View style={[s.palRow, showBorder && s.palRowBorder]}>
      <Avatar
        initials={pal.initials}
        bg={pal.bg}
        textColor={pal.textColor}
        size={36}
        borderWidth={0}
        borderColor="transparent"
      />
      <View style={s.palInfo}>
        <Text style={s.palName}>{pal.name}</Text>
        <Text style={s.palHandle}>{pal.handle}</Text>
      </View>
      <Text style={s.palRounds}>{pal.rounds} rounds</Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.green }}>
        <TopBar
          right={
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => Alert.alert('Edit profile', 'Coming soon.')}
            >
              <Text style={s.editBtn}>Edit</Text>
            </TouchableOpacity>
          }
        />
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
      >
        {/* ── Green header ── */}
        <View style={s.header}>
          {/* Avatar + info */}
          <View style={s.avatarInfoRow}>
            <View>
              <Avatar
                initials={USER.initials}
                bg={USER.bg}
                textColor={USER.textColor}
                size={76}
                borderColor="rgba(216,214,175,0.4)"
                borderWidth={3}
              />
              <View style={s.avatarAddBtn}>
                <Text style={s.avatarAddPlus}>+</Text>
              </View>
            </View>
            <View style={s.userInfo}>
              <Text style={s.userName}>{USER.name}</Text>
              <Text style={s.userHandle}>{USER.handle} · {USER.location}</Text>
              <Text style={s.userBio}>{USER.bio}</Text>
            </View>
          </View>

          {/* Social links */}
          <View style={s.socialRow}>
            {USER.socialLinks.map((link) => (
              <View key={link} style={s.socialPill}>
                <Text style={s.socialPillText}>{link}</Text>
              </View>
            ))}
          </View>

          {/* Stats bar */}
          <View style={s.statsBar}>
            {STATS.map((stat, i) => (
              <React.Fragment key={stat.label}>
                <View style={s.statItem}>
                  <Text style={s.statValue}>{stat.value}</Text>
                  <Text style={s.statLabel}>{stat.label}</Text>
                </View>
                {i < STATS.length - 1 && <View style={s.statDivider} />}
              </React.Fragment>
            ))}
          </View>
        </View>

        {/* ── Drawer ── */}
        <View style={s.drawer}>
          <View style={s.handle} />

          {/* Badges */}
          <Text style={s.sectionLabel}>Badges</Text>
          <View style={s.badgeRow}>
            {BADGES.map((b) => <BadgeTile key={b.title} badge={b} />)}
          </View>

          {/* Pals */}
          <Text style={s.sectionLabel}>Pals</Text>
          <View style={s.palsCard}>
            <Text style={s.palsSubtitle}>People you often golf with</Text>
            {PALS.map((pal, i) => (
              <PalRow key={pal.handle} pal={pal} showBorder={i < PALS.length - 1} />
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.green },

  editBtn: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: 'rgba(216,214,175,0.6)',
  },

  // Header
  header: {
    backgroundColor: Colors.green,
    paddingHorizontal: 18,
    paddingBottom: 20,
  },
  avatarInfoRow: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 14,
  },
  avatarAddBtn: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.green,
    borderWidth: 2,
    borderColor: Colors.creamLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarAddPlus: {
    fontSize: 13,
    color: Colors.cream,
    lineHeight: 16,
  },
  userInfo: {
    flex: 1,
    justifyContent: 'center',
    gap: 3,
  },
  userName: {
    fontFamily: Fonts.serifMedium,
    fontSize: 28,
    color: Colors.cream,
  },
  userHandle: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: 'rgba(216,214,175,0.6)',
  },
  userBio: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: 'rgba(216,214,175,0.75)',
    lineHeight: 18,
  },

  // Social pills
  socialRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  socialPill: {
    borderWidth: 1,
    borderColor: 'rgba(216,214,175,0.25)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  socialPillText: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: 'rgba(216,214,175,0.65)',
  },

  // Stats bar
  statsBar: {
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderRadius: 14,
    flexDirection: 'row',
    paddingVertical: 16,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontFamily: Fonts.serifMedium,
    fontSize: 30,
    color: Colors.cream,
    marginBottom: 2,
  },
  statLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 9,
    color: 'rgba(216,214,175,0.5)',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  statDivider: {
    width: 0.5,
    backgroundColor: 'rgba(216,214,175,0.2)',
    marginVertical: 6,
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
    marginBottom: 20,
  },
  sectionLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 10,
    color: Colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 10,
  },

  // Badges
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  badgeTile: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: Colors.border,
    padding: 10,
    alignItems: 'center',
    gap: 4,
  },
  badgeTileLocked: {
    backgroundColor: Colors.creamLight,
  },
  badgeEmoji: { fontSize: 22 },
  badgeTitle: {
    fontFamily: Fonts.sansMedium,
    fontSize: 10,
    color: Colors.text,
    textAlign: 'center',
  },
  badgeSub: {
    fontFamily: Fonts.sans,
    fontSize: 9,
    color: Colors.muted,
    textAlign: 'center',
  },
  badgeLocked: { opacity: 0.4 },

  // Pals
  palsCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingTop: 12,
    marginBottom: Spacing.xl,
  },
  palsSubtitle: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: Colors.muted,
    marginBottom: 12,
  },
  palRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  palRowBorder: {
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  palInfo: { flex: 1 },
  palName: {
    fontFamily: Fonts.sansMedium,
    fontSize: 14,
    color: Colors.text,
    marginBottom: 1,
  },
  palHandle: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: Colors.muted,
  },
  palRounds: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: Colors.muted,
  },
});
