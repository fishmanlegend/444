import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { TopBar } from '@/components/TopBar';
import { Colors, Fonts, Spacing } from '@/constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

type AttendeeStatus = 'in' | 'maybe' | 'out';
type RsvpStatus = 'in' | 'maybe' | 'out' | null;

interface Attendee {
  initials: string;
  bg: string;
  textColor: string;
  name: string;
  status: AttendeeStatus;
  isHost?: boolean;
}

interface Round {
  emoji: string;
  course: string;
  meta: string;
  hostSubtitle: string;
  totalSpots: number;
  attendees: Attendee[];
  waitlisted: number;
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_ROUNDS: Record<string, Round> = {
  default: {
    emoji: '⛳',
    course: 'Cog Hill No. 4 🌿',
    meta: 'Sat May 17 · 7:42am · Stroke · $20 skins',
    hostSubtitle: 'Wyatt is calling his shot 🎯',
    totalSpots: 4,
    attendees: [
      { initials: 'WK', bg: Colors.creamLight, textColor: Colors.green, name: 'Wyatt K.', status: 'in', isHost: true },
      { initials: 'MR', bg: '#c8a96e', textColor: '#fff', name: 'Mike R.', status: 'in' },
      { initials: 'DK', bg: '#5a8a5a', textColor: '#fff', name: 'Dave K.', status: 'maybe' },
    ],
    waitlisted: 1,
  },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function AttendeeRow({
  attendee,
  showBorder,
}: {
  attendee: Attendee;
  showBorder: boolean;
}) {
  const statusText = attendee.status === 'in' ? '✓ in' : 'maybe';
  const statusColor = attendee.status === 'in' ? '#2a5428' : '#c08a20';
  const statusWeight = attendee.status === 'in' ? Fonts.sansSemiBold : Fonts.sansMedium;

  return (
    <View style={[s.attendeeRow, showBorder && s.attendeeRowBorder]}>
      <View style={s.attendeeLeft}>
        <Avatar
          initials={attendee.initials}
          bg={attendee.bg}
          textColor={attendee.textColor}
          size={30}
          borderWidth={0}
          borderColor="transparent"
        />
        <Text style={s.attendeeName}>
          {attendee.name}
          {attendee.isHost && <Text style={s.hostLabel}> host</Text>}
        </Text>
      </View>
      <Text style={[s.attendeeStatus, { color: statusColor, fontFamily: statusWeight }]}>
        {statusText}
      </Text>
    </View>
  );
}

function WaitlistRow() {
  return (
    <View style={s.attendeeRow}>
      <View style={s.attendeeLeft}>
        <View style={s.waitlistAvatar}>
          <Text style={s.waitlistQ}>?</Text>
        </View>
        <Text style={s.waitlistName}>Waitlisted</Text>
      </View>
      <Text style={s.waitlistStatus}>you're next 🤞</Text>
    </View>
  );
}

function RsvpConfirmBanner({
  rsvp,
  onChange,
}: {
  rsvp: NonNullable<RsvpStatus>;
  onChange: () => void;
}) {
  const config = {
    in: { bg: '#e4f0e4', text: "You're in! 🏌️", textColor: '#2a5428' },
    maybe: { bg: '#f5f0df', text: 'You said maybe', textColor: '#8a7840' },
    out: { bg: Colors.creamLight, text: "You can't make it", textColor: Colors.muted },
  }[rsvp];

  return (
    <View style={[s.confirmBanner, { backgroundColor: config.bg }]}>
      <Text style={[s.confirmText, { color: config.textColor }]}>{config.text}</Text>
      <TouchableOpacity onPress={onChange} activeOpacity={0.7}>
        <Text style={s.confirmChange}>Change</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function InviteScreen() {
  const { id, rsvp: initialRsvp } = useLocalSearchParams<{ id: string; rsvp?: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const round = MOCK_ROUNDS[id ?? ''] ?? MOCK_ROUNDS.default;

  const parsedInitial: RsvpStatus =
    initialRsvp === 'in' || initialRsvp === 'maybe' || initialRsvp === 'out'
      ? initialRsvp
      : null;
  const [rsvp, setRsvp] = useState<RsvpStatus>(parsedInitial);

  // Count people going (in + maybe) and spots remaining
  const confirmedIn = round.attendees.filter((a) => a.status === 'in').length + (rsvp === 'in' ? 1 : 0);
  const goingCount = round.attendees.filter((a) => a.status !== 'out').length + (rsvp === 'in' || rsvp === 'maybe' ? 1 : 0);
  const spotsLeft = Math.max(0, round.totalSpots - confirmedIn);
  const isFull = spotsLeft === 0;

  // Avatar stack: confirmed "in" attendees only
  const inAttendees = round.attendees.filter((a) => a.status === 'in');

  // Who's in list: show "You" row if user RSVPd
  const youRow: Attendee | null =
    rsvp && rsvp !== 'out'
      ? { initials: 'You', bg: Colors.cream, textColor: Colors.green, name: 'You', status: rsvp }
      : null;

  const visibleAttendees = youRow
    ? [...round.attendees, youRow]
    : round.attendees;

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.green }}>
        <TopBar
          left={
            <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
              <Text style={s.backBtn}>← Back</Text>
            </TouchableOpacity>
          }
          right={<Text style={s.topBarLabel}>{round.hostSubtitle}</Text>}
        />
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xxl }}
      >
        {/* ── Green header ── */}
        <View style={s.header}>
          {/* Big emoji display */}
          <View style={s.emojiBox}>
            <Text style={s.emojiDisplay}>{round.emoji}</Text>
          </View>

          {/* Course + meta */}
          <Text style={s.courseName}>{round.course}</Text>
          <Text style={s.meta}>{round.meta}</Text>

          {/* Large avatar stack */}
          <View style={s.avatarStack}>
            {inAttendees.map((a, i) => (
              <Avatar
                key={i}
                initials={a.initials}
                bg={a.bg}
                textColor={a.textColor}
                size={34}
                borderColor={Colors.green}
                borderWidth={2.5}
                style={{ marginRight: -8, zIndex: inAttendees.length - i }}
              />
            ))}
            {/* open spot or "you're in" indicator */}
            {rsvp === 'in' ? (
              <Avatar
                initials="You"
                bg={Colors.cream}
                textColor={Colors.green}
                size={34}
                borderColor={Colors.green}
                borderWidth={2.5}
                style={{ marginRight: -8, zIndex: 0 }}
              />
            ) : (
              <View style={s.avatarOpenLg}>
                <Text style={s.avatarOpenLgPlus}>+</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Drawer ── */}
        <View style={s.drawer}>
          <View style={s.handle} />

          {/* Spot count */}
          <Text style={s.spotCount}>
            {goingCount} going ·{' '}
            {isFull ? 'full' : `${spotsLeft} spot${spotsLeft !== 1 ? 's' : ''} left`}
          </Text>

          {/* Who's in card */}
          <View style={s.whosInCard}>
            <Text style={s.sectionLabel}>Who's in</Text>
            {visibleAttendees.map((a, i) => (
              <AttendeeRow
                key={i}
                attendee={a}
                showBorder={i < visibleAttendees.length - 1 || round.waitlisted > 0}
              />
            ))}
            {round.waitlisted > 0 && <WaitlistRow />}
          </View>

          {/* RSVP area */}
          {rsvp ? (
            <RsvpConfirmBanner rsvp={rsvp} onChange={() => setRsvp(null)} />
          ) : (
            <>
              <Button label="I'm in 🏌️" variant="primary" onPress={() => setRsvp('in')} />
              <Button label="Maybe" variant="maybe" onPress={() => setRsvp('maybe')} />
              <Button label="Can't make it" variant="secondary" onPress={() => setRsvp('out')} />
            </>
          )}

          {/* Footer */}
          <Text style={s.footer}>444. · golf with your people</Text>
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
  topBarLabel: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: 'rgba(216,214,175,0.55)',
  },

  // Green header
  header: {
    backgroundColor: Colors.green,
    paddingHorizontal: 18,
    paddingBottom: 30,
  },
  emojiBox: {
    width: '100%',
    height: 118,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emojiDisplay: { fontSize: 54 },
  courseName: {
    fontFamily: Fonts.serifMedium,
    fontSize: 23,
    color: Colors.cream,
    marginBottom: 4,
  },
  meta: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: 'rgba(216,214,175,0.6)',
    marginBottom: 14,
  },
  avatarStack: { flexDirection: 'row' },
  avatarOpenLg: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(216,214,175,0.1)',
    borderWidth: 2,
    borderColor: 'rgba(216,214,175,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarOpenLgPlus: {
    fontSize: 15,
    color: 'rgba(216,214,175,0.3)',
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
  spotCount: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: Colors.muted,
    marginBottom: 14,
  },

  // Who's in card
  whosInCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: Colors.border,
    padding: 13,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  sectionLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 10,
    color: Colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  attendeeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  attendeeRowBorder: {
    // visual spacing handled by marginBottom
  },
  attendeeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  attendeeName: {
    fontFamily: Fonts.sansMedium,
    fontSize: 14,
    color: Colors.text,
  },
  hostLabel: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: Colors.muted,
  },
  attendeeStatus: {
    fontSize: 12,
  },

  // Waitlist row
  waitlistAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#e8e4d0',
    borderWidth: 1.5,
    borderColor: '#c8c4b0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  waitlistQ: { fontSize: 13, color: '#b8b4a0' },
  waitlistName: { fontFamily: Fonts.sans, fontSize: 14, color: '#b8b4a0' },
  waitlistStatus: { fontFamily: Fonts.sans, fontSize: 11, color: '#b8b4a0' },

  // RSVP confirmation banner
  confirmBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    padding: 15,
    marginBottom: 10,
  },
  confirmText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 14,
  },
  confirmChange: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: Colors.muted,
    textDecorationLine: 'underline',
  },

  // Footer
  footer: {
    fontFamily: Fonts.sans,
    fontSize: 10,
    color: '#c0bca0',
    letterSpacing: 1,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: Spacing.lg,
  },
});
