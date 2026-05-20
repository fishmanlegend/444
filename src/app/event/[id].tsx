import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { TopBar } from '@/components/TopBar';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { PRESET_IMAGES } from '@/constants/presetImages';
import { PRESET_GIFS } from '@/constants/presetGifs';
import { useAuth } from '@/context/auth';
import { getRoundWithPlayers, getGuestRsvps } from '@/lib/db';
import type { Round, RoundPlayer, GuestRsvp, RoundFormat, RsvpStatus } from '@/lib/database.types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FORMAT_LABEL: Record<RoundFormat, string> = {
  stroke: 'Stroke play', skins: 'Skins', stableford: 'Stableford', match: 'Match play', other: 'Other',
};

function getCoverSource(round: Round): number | null {
  if (!round.cover_image_id) return null;
  if (round.cover_is_video) return PRESET_GIFS.find((g) => g.id === round.cover_image_id)?.source ?? null;
  return PRESET_IMAGES.find((i) => i.id === round.cover_image_id)?.source ?? null;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface GuestItem {
  key: string;
  initials: string;
  bg: string;
  textColor: string;
  name: string;
  rsvp: RsvpStatus;
  isHost: boolean;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function VideoCover({ source, style }: { source: number; style: object }) {
  const player = useVideoPlayer(source, (p) => { p.loop = true; p.muted = true; p.play(); });
  return <VideoView player={player} style={style} contentFit="cover" nativeControls={false} />;
}

function GuestRow({ guest, showBorder }: { guest: GuestItem; showBorder: boolean }) {
  const statusConfig = {
    in:      { label: '✓ in',  color: '#2a5428' },
    maybe:   { label: 'maybe', color: '#c08a20' },
    out:     { label: 'out',   color: Colors.muted },
    pending: { label: 'invited', color: Colors.muted },
  }[guest.rsvp] ?? { label: guest.rsvp, color: Colors.muted };

  return (
    <View style={[s.guestRow, showBorder && s.guestRowBorder]}>
      <Avatar
        initials={guest.initials}
        bg={guest.bg}
        textColor={guest.textColor}
        size={30}
        borderWidth={0}
        borderColor="transparent"
      />
      <Text style={s.guestName}>
        {guest.name}
        {guest.isHost && <Text style={s.hostTag}> host</Text>}
      </Text>
      <Text style={[s.guestStatus, { color: statusConfig.color }]}>{statusConfig.label}</Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();

  const [round, setRound] = useState<Round | null>(null);
  const [players, setPlayers] = useState<RoundPlayer[]>([]);
  const [guests, setGuests] = useState<GuestRsvp[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    Promise.all([getRoundWithPlayers(id), getGuestRsvps(id)]).then(([r, g]) => {
      if (r) {
        setRound(r);
        setPlayers(r.players as RoundPlayer[]);
      }
      setGuests(g);
      setLoading(false);
    });
  }, [id]);

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

  const userId = session?.user.id ?? (__DEV__ ? '46bae3d3-2c18-450e-b267-f36b91a94a31' : null);
  const myPlayer = players.find((p) => p.player_id === userId);
  const myRsvp: RsvpStatus = (myPlayer?.rsvp ?? 'pending') as RsvpStatus;

  const allGuests: GuestItem[] = [
    ...players.map((p) => {
      const profile = (p as any).profile;
      return {
        key: p.id,
        initials: profile?.initials ?? '?',
        bg: profile?.avatar_color ?? Colors.green,
        textColor: profile?.avatar_text_color ?? Colors.cream,
        name: profile?.name ?? 'Player',
        rsvp: p.rsvp,
        isHost: p.is_host,
      };
    }),
    ...guests.map((g) => ({
      key: g.id,
      initials: g.name.trim()[0]?.toUpperCase() ?? '?',
      bg: '#e8e4d8',
      textColor: Colors.muted,
      name: g.name,
      rsvp: g.rsvp as RsvpStatus,
      isHost: false,
    })),
  ];

  const inGuests    = allGuests.filter((g) => g.rsvp === 'in');
  const maybeGuests = allGuests.filter((g) => g.rsvp === 'maybe');
  const outGuests   = allGuests.filter((g) => g.rsvp === 'out');

  const myStatusConfig = {
    in:      { bg: '#e4f0e4', text: "You're in 🏌️",    color: '#2a5428' },
    maybe:   { bg: '#f5f0df', text: 'You said maybe',  color: '#8a7840' },
    out:     { bg: Colors.creamLight, text: "You can't make it", color: Colors.muted },
    pending: { bg: Colors.creamLight, text: 'You haven\'t replied yet', color: Colors.muted },
  }[myRsvp] ?? { bg: Colors.creamLight, text: 'Reply to this invite', color: Colors.muted };

  const coverSource = getCoverSource(round);
  const costLabel = round.cost_cents > 0 ? `$${round.cost_cents / 100} / person` : 'Free';
  const skinsLabel = round.format === 'skins' && round.skins_bet_cents > 0
    ? ` · $${round.skins_bet_cents / 100}/skin` : '';
  const formatLabel = `${FORMAT_LABEL[round.format]}${skinsLabel}`;

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.green }}>
        <TopBar
          left={
            <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
              <Text style={s.backBtn}>← Back</Text>
            </TouchableOpacity>
          }
        />
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xxl }}
      >
        {/* ── Header ── */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <Text style={s.courseName}>{round.course_name ?? 'Golf Round'}</Text>
            {round.scheduled_at && (
              <Text style={s.courseMeta}>{fmtDate(round.scheduled_at)} · {fmtTime(round.scheduled_at)}</Text>
            )}
            <Text style={s.courseMeta}>{formatLabel}</Text>
            <Text style={s.courseMeta}>{costLabel}</Text>
            <View style={s.avatarStack}>
              {inGuests.slice(0, 6).map((g, i) => (
                <Avatar
                  key={g.key}
                  initials={g.initials}
                  bg={g.bg}
                  textColor={g.textColor}
                  size={32}
                  borderColor={Colors.green}
                  borderWidth={2}
                  style={{ marginRight: -8, zIndex: inGuests.length - i }}
                />
              ))}
            </View>
          </View>
          {coverSource ? (
            round.cover_is_video
              ? <VideoCover source={coverSource} style={s.coverSquare} />
              : <Image source={coverSource} style={s.coverSquare} contentFit="cover" />
          ) : (
            <View style={[s.coverSquare, { backgroundColor: '#1a3320' }]} />
          )}
        </View>

        {/* ── Drawer ── */}
        <View style={s.drawer}>
          <View style={s.handle} />

          {/* Your RSVP status */}
          <View style={[s.myRsvpBanner, { backgroundColor: myStatusConfig.bg }]}>
            <Text style={[s.myRsvpText, { color: myStatusConfig.color }]}>{myStatusConfig.text}</Text>
            <TouchableOpacity activeOpacity={0.7} onPress={() => router.push(`/invite/${id}` as any)}>
              <Text style={s.changeRsvp}>Change</Text>
            </TouchableOpacity>
          </View>

          {/* Guest list */}
          {inGuests.length > 0 && (
            <>
              <Text style={s.sectionLabel}>Going · {inGuests.length}</Text>
              <View style={s.card}>
                {inGuests.map((g, i) => (
                  <GuestRow key={g.key} guest={g} showBorder={i < inGuests.length - 1} />
                ))}
              </View>
            </>
          )}

          {maybeGuests.length > 0 && (
            <>
              <Text style={s.sectionLabel}>Maybe · {maybeGuests.length}</Text>
              <View style={s.card}>
                {maybeGuests.map((g, i) => (
                  <GuestRow key={g.key} guest={g} showBorder={i < maybeGuests.length - 1} />
                ))}
              </View>
            </>
          )}

          {outGuests.length > 0 && (
            <>
              <Text style={s.sectionLabel}>Can't make it · {outGuests.length}</Text>
              <View style={s.card}>
                {outGuests.map((g, i) => (
                  <GuestRow key={g.key} guest={g} showBorder={i < outGuests.length - 1} />
                ))}
              </View>
            </>
          )}

          {/* Event details */}
          <Text style={s.sectionLabel}>Details</Text>
          <View style={s.card}>
            {[
              round.course_name   ? { label: 'Course', value: round.course_name } : null,
              round.scheduled_at  ? { label: 'Date',   value: fmtDate(round.scheduled_at) } : null,
              round.scheduled_at  ? { label: 'Time',   value: fmtTime(round.scheduled_at) } : null,
              { label: 'Format', value: FORMAT_LABEL[round.format] },
              { label: 'Cost',   value: costLabel },
            ].filter(Boolean).map((row, i, arr) => (
              <React.Fragment key={row!.label}>
                <View style={s.detailRow}>
                  <Text style={s.detailLabel}>{row!.label}</Text>
                  <Text style={s.detailValue}>{row!.value}</Text>
                </View>
                {i < arr.length - 1 && <View style={s.rowDivider} />}
              </React.Fragment>
            ))}
          </View>

          <Text style={s.footer}>CC. · golf with your people</Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.green },

  backBtn: { fontFamily: Fonts.sans, fontSize: 13, color: 'rgba(216,214,175,0.6)' },

  header: {
    backgroundColor: Colors.green,
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 18,
    paddingBottom: 24,
    gap: 14,
  },
  headerLeft: { flex: 1 },
  coverSquare: { width: 160, height: 160, borderRadius: 12 },
  courseName: { fontFamily: Fonts.serifMedium, fontSize: 22, color: Colors.cream, marginBottom: 4 },
  courseMeta: { fontFamily: Fonts.sans, fontSize: 13, color: 'rgba(216,214,175,0.6)', marginBottom: 5 },
  avatarStack: { flexDirection: 'row', marginTop: 10 },

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

  myRsvpBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 12, padding: 14, marginBottom: 20,
  },
  myRsvpText: { fontFamily: Fonts.sansMedium, fontSize: 14 },
  changeRsvp: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.muted, textDecorationLine: 'underline' },

  sectionLabel: {
    fontFamily: Fonts.sansSemiBold, fontSize: 10, color: Colors.muted,
    textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10,
  },

  card: {
    backgroundColor: Colors.card, borderRadius: 14,
    borderWidth: 0.5, borderColor: Colors.border,
    paddingHorizontal: 14, marginBottom: 20,
  },
  rowDivider: { height: 0.5, backgroundColor: Colors.border },

  guestRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, gap: 10 },
  guestRowBorder: { borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  guestName: { fontFamily: Fonts.sansMedium, fontSize: 14, color: Colors.text, flex: 1 },
  hostTag: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.muted },
  guestStatus: { fontFamily: Fonts.sansMedium, fontSize: 12 },

  detailRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingVertical: 13,
  },
  detailLabel: { fontFamily: Fonts.sans, fontSize: 14, color: Colors.muted },
  detailValue: { fontFamily: Fonts.sansMedium, fontSize: 14, color: Colors.text },

  footer: { fontFamily: Fonts.sans, fontSize: 10, color: '#c0bca0', letterSpacing: 1, textAlign: 'center', marginTop: 4 },
});
