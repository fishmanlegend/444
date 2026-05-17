import { useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { Card } from '@/components/Card';
import { TopBar } from '@/components/TopBar';
import { Colors, Fonts, Spacing } from '@/constants/theme';

// ─── Mock data ────────────────────────────────────────────────────────────────

const HOSTING = [
  {
    id: '1',
    course: 'Cog Hill No. 4',
    tag: '$20 skins',
    meta: 'Sat May 17 · 7:42am',
    players: [
      { initials: 'WK', bg: Colors.green, textColor: Colors.cream },
      { initials: 'MR', bg: '#c8a96e', textColor: '#fff' },
    ],
    openSpots: 2,
  },
] as const;

const CONFIRMED = [
  {
    id: '2',
    course: 'Medinah No. 3',
    meta: 'Sun May 18 · 8:15am · Match play',
    players: [
      { initials: 'MR', bg: '#c8a96e', textColor: '#fff' },
      { initials: 'WK', bg: Colors.green, textColor: Colors.cream },
      { initials: 'DK', bg: '#5a8a5a', textColor: '#fff' },
      { initials: 'PW', bg: '#7a6a9a', textColor: '#fff' },
    ],
  },
] as const;

const AWAITING = [
  {
    id: '3',
    course: 'Cog Hill No. 2',
    replyBy: 'Reply by Fri',
    meta: 'Sat May 24 · 9:00am · Stroke',
  },
] as const;

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return <Text style={s.sectionLabel}>{label}</Text>;
}

function AvatarStack({
  players,
  openSpots = 0,
}: {
  players: readonly { initials: string; bg: string; textColor: string }[];
  openSpots?: number;
}) {
  return (
    <View style={s.avatarRow}>
      {players.map((p, i) => (
        <Avatar
          key={i}
          initials={p.initials}
          bg={p.bg}
          textColor={p.textColor}
          size={30}
          borderColor={Colors.card}
          borderWidth={2}
          style={{ marginRight: -7 }}
        />
      ))}
      {Array.from({ length: openSpots }).map((_, i) => (
        <View key={`open-${i}`} style={s.avatarOpen}>
          <Text style={s.avatarOpenPlus}>+</Text>
        </View>
      ))}
    </View>
  );
}

function SmallButtons({
  left, right, onLeftPress, onRightPress,
}: {
  left: string; right: string; onLeftPress?: () => void; onRightPress?: () => void;
}) {
  return (
    <View style={s.btnPair}>
      <TouchableOpacity style={s.btnGhost} activeOpacity={0.7} onPress={onLeftPress}>
        <Text style={s.btnGhostText}>{left}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.btnSolid} activeOpacity={0.7} onPress={onRightPress}>
        <Text style={s.btnSolidText}>{right}</Text>
      </TouchableOpacity>
    </View>
  );
}

function HostingCard({ round }: { round: (typeof HOSTING)[number] }) {
  const router = useRouter();
  return (
    <Card>
      <View style={s.cardTop}>
        <Text style={s.courseName}>{round.course}</Text>
        <View style={s.tag}>
          <Text style={s.tagText}>{round.tag}</Text>
        </View>
      </View>
      <Text style={s.meta}>{round.meta}</Text>
      <AvatarStack players={round.players} openSpots={round.openSpots} />
      <SmallButtons
        left="💬 Message"
        right="Manage →"
        onRightPress={() => router.push(`/scorecard/${round.id}`)}
      />
    </Card>
  );
}

function ConfirmedCard({ round }: { round: (typeof CONFIRMED)[number] }) {
  const router = useRouter();
  return (
    <Card style={{ opacity: 0.88 }}>
      <Text style={[s.courseName, { marginBottom: 5 }]}>{round.course}</Text>
      <Text style={s.meta}>{round.meta}</Text>
      <AvatarStack players={round.players} />
      <SmallButtons
        left="💬 Message"
        right="View →"
        onRightPress={() => router.push(`/scorecard/${round.id}`)}
      />
    </Card>
  );
}

function AwaitingCard({ round }: { round: (typeof AWAITING)[number] }) {
  const router = useRouter();
  return (
    <Card style={{ opacity: 0.72 }}>
      <View style={s.cardTop}>
        <Text style={s.courseName}>{round.course}</Text>
        <Text style={s.replyBy}>{round.replyBy}</Text>
      </View>
      <Text style={s.meta}>{round.meta}</Text>
      <View style={s.rsvpRow}>
        <TouchableOpacity style={s.rsvpIn} activeOpacity={0.7} onPress={() => router.push(`/invite/${round.id}`)}>
          <Text style={s.rsvpInText}>I'm in</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.rsvpMaybe} activeOpacity={0.7} onPress={() => router.push(`/invite/${round.id}`)}>
          <Text style={s.rsvpMaybeText}>Maybe</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.rsvpOut} activeOpacity={0.7} onPress={() => router.push(`/invite/${round.id}`)}>
          <Text style={s.rsvpOutText}>Can't go</Text>
        </TouchableOpacity>
      </View>
    </Card>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.green }}>
        <TopBar
          right={
            <Avatar
              initials="WK"
              bg={Colors.cream}
              textColor={Colors.green}
              size={32}
              borderWidth={0}
              borderColor="transparent"
            />
          }
        />
      </SafeAreaView>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        <SectionLabel label="You're running this 🎙️" />
        {HOSTING.map((r) => (
          <HostingCard key={r.id} round={r} />
        ))}

        <SectionLabel label="Locked in 🤝" />
        {CONFIRMED.map((r) => (
          <ConfirmedCard key={r.id} round={r} />
        ))}

        <SectionLabel label="Your move 👀" />
        {AWAITING.map((r) => (
          <AwaitingCard key={r.id} round={r} />
        ))}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.green },
  scroll: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl },

  sectionLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 10,
    color: Colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 10,
  },

  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 5,
  },
  courseName: {
    fontFamily: Fonts.serifMedium,
    fontSize: 19,
    color: Colors.text,
    flex: 1,
    marginRight: 8,
  },
  meta: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: Colors.muted,
    marginBottom: 13,
  },

  tag: {
    backgroundColor: '#e4f0e4',
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  tagText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 10,
    color: '#2a5428',
  },
  replyBy: {
    fontFamily: Fonts.sansMedium,
    fontSize: 11,
    color: '#c08a20',
  },

  avatarRow: {
    flexDirection: 'row',
    marginBottom: 13,
  },
  avatarOpen: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.creamLight,
    borderWidth: 1.5,
    borderColor: '#c8c4b0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -7,
  },
  avatarOpenPlus: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: '#b8b4a0',
  },

  btnPair: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  btnGhost: {
    flex: 1,
    backgroundColor: Colors.creamLight,
    borderRadius: 10,
    padding: Spacing.sm,
    alignItems: 'center',
  },
  btnGhostText: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: '#666',
  },
  btnSolid: {
    flex: 1,
    backgroundColor: Colors.green,
    borderRadius: 10,
    padding: Spacing.sm,
    alignItems: 'center',
  },
  btnSolidText: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: Colors.cream,
  },

  rsvpRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  rsvpIn: {
    flex: 1,
    backgroundColor: '#e4f0e4',
    borderRadius: 10,
    padding: Spacing.sm,
    alignItems: 'center',
  },
  rsvpInText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 12,
    color: '#2a5428',
  },
  rsvpMaybe: {
    flex: 1,
    backgroundColor: '#f5f0df',
    borderRadius: 10,
    padding: Spacing.sm,
    alignItems: 'center',
  },
  rsvpMaybeText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 12,
    color: '#8a7840',
  },
  rsvpOut: {
    flex: 1,
    backgroundColor: Colors.creamLight,
    borderRadius: 10,
    padding: Spacing.sm,
    alignItems: 'center',
  },
  rsvpOutText: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: '#999',
  },
});
