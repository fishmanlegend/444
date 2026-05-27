import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useFocusEffect, useIsFocused, usePathname, useRootNavigationState, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { TopBar } from '@/components/TopBar';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { PRESET_IMAGES } from '@/constants/presetImages';
import { PRESET_GIFS } from '@/constants/presetGifs';
import { useAuth } from '@/context/auth';
import { getHomeRounds, updateRsvp, type HomeRound } from '@/lib/db';
import { onRoundsChanged } from '@/lib/roundsRefresh';
import type { Round } from '@/lib/database.types';

// ─── Types ────────────────────────────────────────────────────────────────────

type Role = 'hosting' | 'going' | 'invited' | 'finished';

interface CardRound extends HomeRound {
  role: Role;
}

const CARD_GAP = 10;
const CARD_PADDING = 16;
const REMATCH_SEEN_KEY = 'rematch_card_seen';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCoverSource(round: Round): string | null {
  if (!round.cover_image_id) return null;
  if (round.cover_is_video) return PRESET_GIFS.find((g) => g.id === round.cover_image_id)?.source ?? null;
  return PRESET_IMAGES.find((i) => i.id === round.cover_image_id)?.source ?? null;
}

function fmtCardDate(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${date} · ${time}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function VideoThumb({ source, style }: { source: string; style: object }) {
  const player = useVideoPlayer(source, (p) => { p.loop = true; p.muted = true; p.play(); });
  return <VideoView player={player} style={style} contentFit="cover" contentPosition="center" nativeControls={false} />;
}

function RoleBadge({ role }: { role: Role }) {
  const label =
    role === 'hosting'  ? 'Hosting' :
    role === 'going'    ? 'Going ✓' :
    role === 'finished' ? 'Done ✓' :
                          'Reply needed';
  const bg =
    role === 'hosting'  ? Colors.green :
    role === 'going'    ? '#4a8a4a' :
    role === 'finished' ? Colors.muted :
                          '#b07818';
  return (
    <View style={[s.badge, { backgroundColor: bg }]}>
      <Text style={s.badgeText}>{label}</Text>
    </View>
  );
}

function EventCard({ round, cardSize, onPress }: {
  round: CardRound;
  cardSize: number;
  onPress: () => void;
}) {
  const source = getCoverSource(round);
  return (
    <TouchableOpacity style={[s.cardWrap, { width: cardSize }]} activeOpacity={0.88} onPress={onPress}>
      <View style={s.card}>
        {/* Square image with badge overlay */}
        <View style={[s.cardImage, { width: cardSize, height: cardSize }]}>
          {source ? (
            round.cover_is_video
              ? <VideoThumb source={source} style={StyleSheet.absoluteFill} />
              : <Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="center" />
          ) : null}
          <RoleBadge role={round.role} />
        </View>

        {/* Text below image */}
        <View style={s.cardInfo}>
          <Text style={s.cardTitle} numberOfLines={2}>
            {round.course_name ?? 'Golf Round'}
          </Text>
          <Text style={s.cardDate}>
            {round.scheduled_at ? fmtCardDate(round.scheduled_at) : 'Date TBD'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function ReplyCard({ round, cardSize, userId, onNavigate }: {
  round: HomeRound;
  cardSize: number;
  userId: string;
  onNavigate: (rsvp: 'in' | 'maybe') => void;
}) {
  const [declined, setDeclined] = useState(false);
  const [busy, setBusy] = useState(false);
  const frownScale = useRef(new Animated.Value(0)).current;
  const frownOpacity = useRef(new Animated.Value(0)).current;

  const handleRsvp = async (rsvp: 'in' | 'maybe' | 'out') => {
    if (busy) return;
    setBusy(true);
    await updateRsvp(round.id, userId, rsvp);
    if (rsvp === 'out') {
      setDeclined(true);
      Animated.sequence([
        Animated.parallel([
          Animated.spring(frownScale, { toValue: 1, useNativeDriver: true, friction: 5 }),
          Animated.timing(frownOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
        ]),
        Animated.delay(900),
        Animated.timing(frownOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]).start();
    } else {
      onNavigate(rsvp);
    }
    setBusy(false);
  };

  const source = getCoverSource(round);
  return (
    <View style={[s.cardWrap, { width: cardSize }]}>
      <View style={s.card}>
      <View style={[s.cardImage, { width: cardSize, height: cardSize }]}>
        {source ? (
          round.cover_is_video
            ? <VideoThumb source={source} style={StyleSheet.absoluteFill} />
            : <Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="center" />
        ) : null}
        <Animated.View style={[StyleSheet.absoluteFill, s.frownOverlay, { opacity: frownOpacity }]}>
          <Animated.Text style={[s.frownEmoji, { transform: [{ scale: frownScale }] }]}>☹️</Animated.Text>
        </Animated.View>
      </View>
      <View style={s.cardInfo}>
        <Text style={s.cardTitle} numberOfLines={2}>
          {round.course_name ?? 'Golf Round'}
        </Text>
        <Text style={s.cardDate}>
          {round.scheduled_at ? fmtCardDate(round.scheduled_at) : 'Date TBD'}
        </Text>
        {declined ? (
          <TouchableOpacity style={s.notGoingBanner} activeOpacity={0.75} onPress={() => onNavigate('maybe')}>
            <Text style={s.notGoingText}>Not going · tap to change</Text>
          </TouchableOpacity>
        ) : (
          <View style={s.replyBtns}>
            <TouchableOpacity style={s.replyIn} activeOpacity={0.75} onPress={() => handleRsvp('in')}>
              <Text style={s.replyInText}>✓</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.replyMaybe} activeOpacity={0.75} onPress={() => handleRsvp('maybe')}>
              <Text style={s.replyMaybeText}>?</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.replyOut} activeOpacity={0.75} onPress={() => handleRsvp('out')}>
              <Text style={s.replyOutText}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
      </View>
    </View>
  );
}

function RematchCard({ round, onPress, onDismiss }: { round: HomeRound; onPress: () => void; onDismiss: () => void }) {
  const hostProfile = (round.players as any[]).find((p) => p.is_host)?.profile;
  const hostName = hostProfile?.name ?? null;
  return (
    <View style={s.rematchWrap}>
      <TouchableOpacity style={s.rematchCard} activeOpacity={0.85} onPress={onPress}>
        <Text style={s.rematchEmoji}>🏌️</Text>
        <View style={s.rematchBody}>
          <Text style={s.rematchTitle} numberOfLines={1}>
            {round.course_name ?? 'Golf Round'}{hostName ? ` with ${hostName}'s crew` : ''}
          </Text>
          <Text style={s.rematchSub}>Host the rematch — or bring other pals →</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity style={s.rematchDismiss} activeOpacity={0.7} onPress={onDismiss} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
        <Text style={s.rematchDismissText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

function EmptyState() {
  return (
    <View style={s.emptyState}>
      <Text style={s.emptyEmoji}>🏌️</Text>
      <Text style={s.emptyHeading}>No rounds on the card.</Text>
      <Text style={s.emptySub}>Tap + below to get one going.</Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session, profile } = useAuth();
  const userId = session?.user.id ?? (__DEV__ ? '46bae3d3-2c18-450e-b267-f36b91a94a31' : '');

  const [hosting, setHosting] = useState<HomeRound[]>([]);
  const [confirmed, setConfirmed] = useState<HomeRound[]>([]);
  const [awaiting, setAwaiting] = useState<HomeRound[]>([]);
  const [finished, setFinished] = useState<HomeRound[]>([]);
  const [rematchSeen, setRematchSeen] = useState(true);

  useEffect(() => {
    SecureStore.getItemAsync(REMATCH_SEEN_KEY).then((val) => {
      if (val === null) setRematchSeen(false);
    });
  }, []);

  const handleRematchDismiss = async () => {
    await SecureStore.setItemAsync(REMATCH_SEEN_KEY, '1');
    setRematchSeen(true);
  };

  const fetchSeq = useRef(0);
  const fetchRounds = useCallback(() => {
    if (!userId) return;
    const seq = ++fetchSeq.current;
    getHomeRounds(userId).then(({ hosting, confirmed, awaiting, finished }) => {
      if (seq !== fetchSeq.current) return; // a newer fetch started — discard this stale result
      setHosting(hosting);
      setConfirmed(confirmed);
      setAwaiting(awaiting);
      setFinished(finished);
    });
  }, [userId]);

  // Strategy 1: useFocusEffect (standard pattern)
  useFocusEffect(useCallback(() => { fetchRounds(); }, [fetchRounds]));

  // Strategy 2: useIsFocused — fires when focus state toggles
  const isFocused = useIsFocused();
  useEffect(() => { if (isFocused) fetchRounds(); }, [isFocused]);

  // Strategy 3: root navigation stack depth — fires when returning from any stack screen
  const rootState = useRootNavigationState();
  useEffect(() => {
    if (rootState?.index === 0) fetchRounds();
  }, [rootState?.index]);

  // Strategy 4: pathname change — fires on every navigation
  const pathname = usePathname();
  useEffect(() => { fetchRounds(); }, [pathname]);

  // Pub/sub from manage screen saves
  useEffect(() => onRoundsChanged(fetchRounds), [fetchRounds]);

  const upcomingRounds: CardRound[] = [
    ...hosting.map((r) => ({ ...r, role: 'hosting' as Role })),
    ...confirmed.map((r) => ({ ...r, role: 'going' as Role })),
  ].sort((a, b) => {
    if (!a.scheduled_at && !b.scheduled_at) return 0;
    if (!a.scheduled_at) return 1;
    if (!b.scheduled_at) return -1;
    return new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime();
  });

  const cardSize = Math.floor((width - CARD_PADDING * 2 - CARD_GAP) / 2);
  const isEmpty = upcomingRounds.length === 0 && awaiting.length === 0 && finished.length === 0;

  const latestGuestRound = hosting.length === 0
    ? finished
        .filter((r) => r.host_id !== userId)
        .sort((a, b) => {
          if (!a.completed_at && !b.completed_at) return 0;
          if (!a.completed_at) return 1;
          if (!b.completed_at) return -1;
          return new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime();
        })[0] ?? null
    : null;

  function handleCardPress(round: CardRound) {
    if (round.role === 'hosting') {
      router.push(`/manage/${round.id}` as any);
    } else {
      router.push(`/invite/${round.id}` as any);
    }
  }

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.green }}>
        <TopBar />
      </SafeAreaView>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 80 }]}
        showsVerticalScrollIndicator={false}
      >
        {latestGuestRound && !rematchSeen && (
          <RematchCard
            round={latestGuestRound}
            onPress={() => {
              handleRematchDismiss();
              router.push(`/play-again/${latestGuestRound.id}` as any);
            }}
            onDismiss={handleRematchDismiss}
          />
        )}

        {isEmpty ? (
          <EmptyState />
        ) : (
          <>
            {upcomingRounds.length > 0 && (
              <>
                <Text style={s.sectionLabel}>Upcoming</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={s.grid}
                >
                  {upcomingRounds.map((round) => (
                    <EventCard
                      key={`${round.id}:${round.cover_image_id ?? ''}`}
                      round={round}
                      cardSize={cardSize}
                      onPress={() => handleCardPress(round)}
                    />
                  ))}
                </ScrollView>
              </>
            )}

            {awaiting.length > 0 && (
              <>
                <Text style={[s.sectionLabel, { marginTop: upcomingRounds.length > 0 ? 24 : 0 }]}>
                  Reply now 👋
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={s.grid}
                >
                  {awaiting.map((round) => (
                    <ReplyCard
                      key={`${round.id}:${round.cover_image_id ?? ''}`}
                      round={round}
                      cardSize={cardSize}
                      userId={userId}
                      onNavigate={(rsvp) => router.push(`/invite/${round.id}?rsvp=${rsvp}` as any)}
                    />
                  ))}
                </ScrollView>
              </>
            )}

            {finished.length > 0 && (
              <>
                <Text style={[s.sectionLabel, { marginTop: 24 }]}>Finished</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={s.grid}
                >
                  {finished.map((round) => (
                    <EventCard
                      key={round.id}
                      round={{ ...round, role: 'finished' }}
                      cardSize={cardSize}
                      onPress={() => router.push(`/post-round/${round.id}` as any)}
                    />
                  ))}
                </ScrollView>
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.green },
  scroll: { flex: 1, backgroundColor: Colors.bg },
  content: { paddingTop: CARD_PADDING, paddingBottom: CARD_PADDING },

  sectionLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 10,
    color: Colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 12,
    paddingHorizontal: CARD_PADDING,
  },

  grid: {
    flexDirection: 'row',
    gap: CARD_GAP,
    paddingHorizontal: CARD_PADDING,
    paddingBottom: 4,
  },

  cardWrap: {
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 2,
  },
  card: {
    borderRadius: 14,
    backgroundColor: Colors.card,
    borderWidth: 1.5,
    borderColor: Colors.green,
    overflow: 'hidden',
  },

  cardImage: {
    overflow: 'hidden',
    backgroundColor: '#1a3320',
  },

  cardInfo: {
    paddingHorizontal: 11,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 4,
  },

  badge: {
    position: 'absolute',
    top: 8,
    left: 8,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  badgeText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 9,
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },

  cardTitle: {
    fontFamily: Fonts.serifMedium,
    fontSize: 15,
    color: Colors.text,
    lineHeight: 20,
  },
  cardDate: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    color: Colors.muted,
    lineHeight: 16,
  },

  replyBtns: {
    flexDirection: 'row',
    gap: 5,
    marginTop: 6,
  },
  replyIn: {
    flex: 1, backgroundColor: '#c2d9c2', borderRadius: 7,
    paddingVertical: 4, alignItems: 'center',
  },
  replyInText: { fontFamily: Fonts.sansMedium, fontSize: 12, color: '#2a5428' },
  replyMaybe: {
    flex: 1, backgroundColor: Colors.creamLight, borderRadius: 7,
    paddingVertical: 4, alignItems: 'center',
  },
  replyMaybeText: { fontFamily: Fonts.sansMedium, fontSize: 12, color: Colors.muted },
  replyOut: {
    flex: 1, backgroundColor: '#fce8e8', borderRadius: 7,
    paddingVertical: 4, alignItems: 'center',
  },
  replyOutText: { fontFamily: Fonts.sansMedium, fontSize: 12, color: '#b04030' },

  notGoingBanner: {
    marginTop: 6, backgroundColor: '#fce8e8', borderRadius: 7,
    paddingVertical: 5, alignItems: 'center',
  },
  notGoingText: { fontFamily: Fonts.sansMedium, fontSize: 12, color: '#b04030' },

  frownOverlay: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  frownEmoji: { fontSize: 52 },

  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
  },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyHeading: {
    fontFamily: Fonts.serifMedium,
    fontSize: 22,
    color: Colors.text,
    marginBottom: 8,
  },
  emptySub: { fontFamily: Fonts.sans, fontSize: 14, color: Colors.muted },

  rematchWrap: {
    marginHorizontal: CARD_PADDING,
    marginBottom: 20,
  },
  rematchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    paddingRight: 36,
    backgroundColor: Colors.creamLight,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.green,
  },
  rematchEmoji: { fontSize: 22 },
  rematchBody: { flex: 1 },
  rematchTitle: { fontFamily: Fonts.serifMedium, fontSize: 15, color: Colors.text, marginBottom: 2 },
  rematchSub: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.green },
  rematchDismiss: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rematchDismissText: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.muted },
});
