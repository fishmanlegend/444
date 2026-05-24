import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Linking, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { PRESET_IMAGES } from '@/constants/presetImages';
import { PRESET_GIFS } from '@/constants/presetGifs';
import { useAuth } from '@/context/auth';
import { getRoundWithPlayers, updateRsvp, getGuestRsvps, getRoundComments, addRoundComment } from '@/lib/db';
import type { Round, RoundPlayer, RsvpStatus, GuestRsvp, RoundComment } from '@/lib/database.types';

const APP_STORE_URL = 'https://apps.apple.com/app/cc-golf';

type RoundWithPlayers = Round & { players: RoundPlayer[] };

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FORMAT_LABEL: Record<string, string> = {
  stroke: 'Stroke play', skins: 'Skins', stableford: 'Stableford', match: 'Match play', best_ball: 'Best ball',
};

function scorecardRoute(round: Round): string {
  if (round.format === 'skins') return `/skins/${round.id}`;
  if (round.format === 'stableford') return `/stableford/${round.id}`;
  if (round.format === 'match') return `/match/${round.id}`;
  if (round.format === 'best_ball') return `/best-ball/${round.id}`;
  return `/scorecard/${round.id}`;
}

function getCoverSource(round: Round): number | null {
  if (!round.cover_image_id) return null;
  if (round.cover_is_video) return PRESET_GIFS.find((g) => g.id === round.cover_image_id)?.source ?? null;
  return PRESET_IMAGES.find((i) => i.id === round.cover_image_id)?.source ?? null;
}

function formatMeta(round: Round): string {
  if (!round.scheduled_at) return FORMAT_LABEL[round.format] ?? round.format;
  const d = new Date(round.scheduled_at);
  const date = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${date} · ${time}`;
}

function fmtCents(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

function relTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PlayerRow({ player, showBorder }: { player: RoundPlayer; showBorder: boolean }) {
  const profile = (player as any).profile;
  const rsvpLabel =
    player.rsvp === 'in'      ? '✓ in' :
    player.rsvp === 'maybe'   ? 'maybe' :
    player.rsvp === 'out'     ? 'out' :
                                'invited';
  const rsvpStyle =
    player.rsvp === 'in'    ? s.rsvpIn :
    player.rsvp === 'maybe' ? s.rsvpMaybe :
    player.rsvp === 'out'   ? s.rsvpOut :
                              s.rsvpPending;
  return (
    <View style={[s.playerRow, showBorder && s.playerRowBorder]}>
      <Avatar
        initials={profile?.initials ?? '?'}
        bg={profile?.avatar_color ?? Colors.green}
        textColor={profile?.avatar_text_color ?? Colors.cream}
        size={32} borderWidth={0} borderColor="transparent"
      />
      <View style={s.playerInfo}>
        <Text style={s.playerName}>
          {profile?.name ?? 'Unknown'}
          {player.is_host ? <Text style={s.hostChip}>  host</Text> : null}
        </Text>
      </View>
      <Text style={[s.rsvpBadge, rsvpStyle]}>{rsvpLabel}</Text>
    </View>
  );
}

function CommentRow({ comment, showBorder }: { comment: RoundComment; showBorder: boolean }) {
  const profile = (comment as any).profile;
  return (
    <View style={[s.commentRow, showBorder && s.commentRowBorder]}>
      <Avatar
        initials={profile?.initials ?? '?'}
        bg={profile?.avatar_color ?? Colors.green}
        textColor={profile?.avatar_text_color ?? Colors.cream}
        size={28} borderWidth={0} borderColor="transparent"
      />
      <View style={s.commentBody}>
        <View style={s.commentMeta}>
          <Text style={s.commentName}>{profile?.name ?? 'Player'}</Text>
          <Text style={s.commentTime}>{relTime(comment.created_at)}</Text>
        </View>
        <Text style={s.commentText}>{comment.body}</Text>
      </View>
    </View>
  );
}

function AppNudge() {
  return (
    <TouchableOpacity style={s.nudge} activeOpacity={0.8} onPress={() => Linking.openURL(APP_STORE_URL)}>
      <Text style={s.nudgeEmoji}>⛳</Text>
      <View style={s.nudgeText}>
        <Text style={s.nudgeTitle}>Get CC. for live scoring</Text>
        <Text style={s.nudgeSub}>Real-time scorecard, no browser refresh needed</Text>
      </View>
      <Text style={s.nudgeArrow}>↗</Text>
    </TouchableOpacity>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function InviteScreen() {
  const { id, rsvp: initialRsvp } = useLocalSearchParams<{ id: string; rsvp?: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id ?? (__DEV__ ? '46bae3d3-2c18-450e-b267-f36b91a94a31' : null);

  const [round, setRound] = useState<RoundWithPlayers | null>(null);
  const [guests, setGuests] = useState<GuestRsvp[]>([]);
  const [comments, setComments] = useState<RoundComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [posting, setPosting] = useState(false);
  const [rsvp, setRsvp] = useState<RsvpStatus | null>(
    initialRsvp === 'in' || initialRsvp === 'maybe' || initialRsvp === 'out' ? initialRsvp : null
  );
  const autoNavDone = useRef(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([getRoundWithPlayers(id), getGuestRsvps(id), getRoundComments(id)]).then(([roundData, guestData, commentData]) => {
      setRound(roundData as RoundWithPlayers | null);
      setGuests(guestData);
      setComments(commentData as RoundComment[]);
      if (roundData && userId) {
        const me = (roundData.players as RoundPlayer[]).find((p) => p.player_id === userId);
        const myRsvp = me?.rsvp as RsvpStatus | undefined;
        if (myRsvp) setRsvp(myRsvp);
        // Auto-navigate to scorecard if round is live and player is in
        if (!autoNavDone.current && roundData.status === 'active' && myRsvp === 'in') {
          autoNavDone.current = true;
          router.replace(scorecardRoute(roundData as Round) as any);
          return;
        }
      }
      setLoading(false);
    });
  }, [id, userId]);

  const handleRsvp = async (status: RsvpStatus) => {
    if (!userId || !round) return;
    setRsvp(status);
    await updateRsvp(round.id, userId, status);
  };

  const handlePostComment = async () => {
    if (!userId || !round || !commentText.trim() || posting) return;
    setPosting(true);
    const body = commentText.trim();
    setCommentText('');
    await addRoundComment(round.id, userId, body);
    const fresh = await getRoundComments(round.id);
    setComments(fresh as RoundComment[]);
    setPosting(false);
  };

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
        <Text style={s.notFoundTitle}>Round not found</Text>
        <Text style={s.notFoundSub}>This invite link may have expired.</Text>
      </View>
    );
  }

  const coverSource = getCoverSource(round);
  const players = round.players as RoundPlayer[];
  const host = players.find((p) => p.is_host);
  const hostProfile = (host as any)?.profile;
  const inPlayers = players.filter((p) => p.rsvp === 'in');
  const inGuests = guests.filter((g) => g.rsvp === 'in');
  const goingCount = inPlayers.length + inGuests.length;
  const spotsLeft = Math.max(0, round.spots - goingCount);
  const isWeb = Platform.OS === 'web';
  const isActive = round.status === 'active';

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.green }}>
        {!isWeb && (
          <View style={s.topBar}>
            <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
              <Text style={s.backBtn}>← Back</Text>
            </TouchableOpacity>
            {hostProfile && <Text style={s.topBarLabel}>{hostProfile.name} is hosting</Text>}
            <View style={{ width: 48 }} />
          </View>
        )}
      </SafeAreaView>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={insets.top + 44}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            s.scroll,
            { paddingBottom: insets.bottom + Spacing.xxl },
            isWeb && s.scrollWeb,
          ]}
        >
          {/* ── Cover ── */}
          <View style={[s.coverBox, isWeb && s.coverBoxWeb]}>
            {coverSource
              ? <Image source={coverSource} style={StyleSheet.absoluteFill} contentFit="cover" />
              : <View style={[StyleSheet.absoluteFill, { backgroundColor: '#1a3320' }]} />
            }
            <View style={s.coverOverlay} />
            {isWeb && <View style={s.webBrand}><Text style={s.webBrandText}>CC.</Text></View>}
          </View>

          {/* ── Event info ── */}
          <View style={s.infoBlock}>
            <Text style={s.courseName}>{round.course_name ?? 'Golf round'}</Text>
            <Text style={s.meta}>{formatMeta(round)}</Text>
            <View style={s.avatarRow}>
              {inPlayers.slice(0, 4).map((p, i) => {
                const pr = (p as any).profile;
                return (
                  <Avatar key={p.id} initials={pr?.initials ?? '?'}
                    bg={pr?.avatar_color ?? Colors.green} textColor={pr?.avatar_text_color ?? Colors.cream}
                    size={34} borderColor={Colors.green} borderWidth={2.5}
                    style={{ marginRight: -8, zIndex: 10 - i }} />
                );
              })}
            </View>
            <Text style={s.spotCount}>
              {goingCount} going · {spotsLeft > 0 ? `${spotsLeft} spot${spotsLeft !== 1 ? 's' : ''} left` : 'full'}
            </Text>
          </View>

          {/* ── Drawer ── */}
          <View style={[s.drawer, isWeb && s.drawerWeb]}>

            {/* Live banner */}
            {isActive && (
              <TouchableOpacity
                style={s.liveBanner}
                activeOpacity={0.85}
                onPress={() => router.push(scorecardRoute(round) as any)}
              >
                <View style={s.liveDot} />
                <Text style={s.liveBannerText}>Game is live — open scorecard</Text>
                <Text style={s.liveBannerArrow}>→</Text>
              </TouchableOpacity>
            )}

            {/* ── RSVP — top when not 'in' ── */}
            {rsvp !== 'in' && (
              <View style={s.rsvpBlock}>
                {rsvp === 'maybe' && (
                  <View style={s.maybeBanner}>
                    <Text style={s.maybeBannerText}>Let us know soon! 👆</Text>
                  </View>
                )}
                {!rsvp && (
                  <>
                    <Button label="I'm in 🏌️" variant="primary" onPress={() => handleRsvp('in')} />
                    <Button label="🤷 Maybe..." variant="maybe" onPress={() => handleRsvp('maybe')} />
                    <Button label="Can't make it" variant="secondary" onPress={() => handleRsvp('out')} />
                  </>
                )}
                {rsvp && (
                  <View style={[s.confirmBanner, { backgroundColor: rsvp === 'maybe' ? '#f5f0df' : Colors.creamLight }]}>
                    <Text style={[s.confirmText, { color: rsvp === 'maybe' ? '#8a7840' : Colors.muted }]}>
                      {rsvp === 'maybe' ? 'Maybe — commit when you know 🫵' : "Can't make it"}
                    </Text>
                    <TouchableOpacity onPress={() => setRsvp(null)} activeOpacity={0.7}>
                      <Text style={s.confirmChange}>Change</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {/* ── Details ── */}
            <View style={s.section}>
              <Text style={s.sectionLabel}>Details</Text>
              <View style={s.detailRow}>
                <Text style={s.detailLabel}>Format</Text>
                <Text style={s.detailValue}>{FORMAT_LABEL[round.format] ?? round.format}</Text>
              </View>
              <View style={[s.detailRow, s.detailRowBorder]}>
                <Text style={s.detailLabel}>Holes</Text>
                <Text style={s.detailValue}>{round.total_holes}</Text>
              </View>
              <View style={[s.detailRow, s.detailRowBorder]}>
                <Text style={s.detailLabel}>Spots</Text>
                <Text style={s.detailValue}>{spotsLeft > 0 ? `${spotsLeft} left` : 'Full'}</Text>
              </View>
              {round.cost_cents > 0 && (
                <View style={[s.detailRow, s.detailRowBorder]}>
                  <Text style={s.detailLabel}>Cost</Text>
                  <Text style={s.detailValue}>{fmtCents(round.cost_cents)}</Text>
                </View>
              )}
              {round.skins_bet_cents > 0 && (
                <View style={[s.detailRow, s.detailRowBorder]}>
                  <Text style={s.detailLabel}>Skins</Text>
                  <Text style={s.detailValue}>{fmtCents(round.skins_bet_cents)} / hole</Text>
                </View>
              )}
              {round.note ? (
                <View style={[s.detailRow, s.detailRowBorder]}>
                  <Text style={s.detailLabel}>Note</Text>
                  <Text style={[s.detailValue, { flex: 1, textAlign: 'left', marginLeft: 8 }]}>{round.note}</Text>
                </View>
              ) : null}
            </View>

            {/* ── Players ── */}
            <View style={s.section}>
              <Text style={s.sectionLabel}>Players</Text>
              {players.map((p, i) => (
                <PlayerRow key={p.id} player={p} showBorder={i < players.length - 1} />
              ))}
              {players.length === 0 && (
                <Text style={s.emptyText}>No one yet — be the first.</Text>
              )}
            </View>

            {/* ── Comments ── */}
            <View style={s.section}>
              <Text style={s.sectionLabel}>Comments</Text>
              {comments.map((c, i) => (
                <CommentRow key={c.id} comment={c} showBorder={i < comments.length - 1} />
              ))}
              {comments.length === 0 && (
                <Text style={s.emptyText}>No comments yet.</Text>
              )}
              <View style={s.commentInput}>
                <TextInput
                  style={s.commentBox}
                  value={commentText}
                  onChangeText={setCommentText}
                  placeholder="Say something..."
                  placeholderTextColor={Colors.muted}
                  multiline
                  returnKeyType="send"
                  onSubmitEditing={handlePostComment}
                />
                <TouchableOpacity
                  style={[s.commentSend, (!commentText.trim() || posting) && s.commentSendDisabled]}
                  activeOpacity={0.75}
                  onPress={handlePostComment}
                  disabled={!commentText.trim() || posting}
                >
                  <Text style={s.commentSendText}>Post</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* ── RSVP confirmation — bottom when 'in' ── */}
            {rsvp === 'in' && (
              <View style={[s.confirmBanner, { backgroundColor: '#e4f0e4' }]}>
                <Text style={[s.confirmText, { color: '#2a5428' }]}>You're in! 🏌️</Text>
                <TouchableOpacity onPress={() => setRsvp(null)} activeOpacity={0.7}>
                  <Text style={s.confirmChange}>Change</Text>
                </TouchableOpacity>
              </View>
            )}

            {isWeb && <AppNudge />}
            <Text style={s.footer}>CC. · golf with your people</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.green },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  backBtn: { fontFamily: Fonts.sans, fontSize: 13, color: 'rgba(216,214,175,0.6)', minWidth: 48 },
  topBarLabel: { fontFamily: Fonts.sans, fontSize: 12, color: 'rgba(216,214,175,0.55)' },

  scroll: {},
  scrollWeb: { maxWidth: 480, alignSelf: 'center' as any, width: '100%' },

  coverBox: { width: '100%', height: 220, overflow: 'hidden' },
  coverBoxWeb: { height: 280 },
  coverOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.22)' },
  webBrand: { position: 'absolute', top: 20, left: 20 },
  webBrandText: { fontFamily: 'CormorantGaramond-Medium', fontSize: 28, color: Colors.cream },

  infoBlock: { backgroundColor: Colors.green, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 },
  courseName: { fontFamily: Fonts.serifMedium, fontSize: 26, color: Colors.cream, marginBottom: 4 },
  meta: { fontFamily: Fonts.sans, fontSize: 13, color: 'rgba(216,214,175,0.65)', marginBottom: 14, lineHeight: 19 },
  avatarRow: { flexDirection: 'row', marginBottom: 8 },
  spotCount: { fontFamily: Fonts.sans, fontSize: 12, color: 'rgba(216,214,175,0.5)' },

  guestAvatarSm: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(216,214,175,0.2)',
    borderWidth: 2.5, borderColor: Colors.green,
    alignItems: 'center', justifyContent: 'center',
  },
  guestInitialsSm: { fontFamily: Fonts.sansMedium, fontSize: 13, color: Colors.cream },

  drawer: {
    backgroundColor: Colors.bg,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    marginTop: -16, paddingTop: 24, paddingHorizontal: 18, paddingBottom: 8,
  },
  drawerWeb: { borderRadius: 0, marginTop: 0, paddingTop: 28 },

  // Live banner
  liveBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.green, borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 16,
    marginBottom: 16, gap: 8,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#6dcc6d' },
  liveBannerText: { fontFamily: Fonts.sansMedium, fontSize: 14, color: Colors.cream, flex: 1 },
  liveBannerArrow: { fontFamily: Fonts.sans, fontSize: 14, color: 'rgba(216,214,175,0.6)' },

  rsvpBlock: { marginBottom: 4 },

  // Details
  section: {
    backgroundColor: Colors.card, borderRadius: 14,
    borderWidth: 0.5, borderColor: Colors.border,
    paddingHorizontal: 14, marginBottom: 14,
  },
  sectionLabel: {
    fontFamily: Fonts.sansSemiBold, fontSize: 10, color: Colors.muted,
    textTransform: 'uppercase', letterSpacing: 1.2,
    paddingTop: 14, paddingBottom: 10,
  },
  detailRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', paddingVertical: 9,
  },
  detailRowBorder: { borderTopWidth: 0.5, borderTopColor: Colors.border },
  detailLabel: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.muted, width: 64 },
  detailValue: { fontFamily: Fonts.sansMedium, fontSize: 13, color: Colors.text, textAlign: 'right' },

  // Players
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  playerRowBorder: { borderTopWidth: 0.5, borderTopColor: Colors.border },
  playerInfo: { flex: 1 },
  playerName: { fontFamily: Fonts.sansMedium, fontSize: 14, color: Colors.text },
  hostChip: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.muted },
  rsvpBadge: { fontFamily: Fonts.sans, fontSize: 12 },
  rsvpIn: { color: '#2a5428', fontFamily: Fonts.sansSemiBold },
  rsvpMaybe: { color: '#c08a20' },
  rsvpOut: { color: Colors.muted },
  rsvpPending: { color: Colors.muted },
  emptyText: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.muted, textAlign: 'center', paddingVertical: 12 },

  // Comments
  commentRow: { flexDirection: 'row', gap: 10, paddingVertical: 10 },
  commentRowBorder: { borderTopWidth: 0.5, borderTopColor: Colors.border },
  commentBody: { flex: 1 },
  commentMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  commentName: { fontFamily: Fonts.sansMedium, fontSize: 13, color: Colors.text },
  commentTime: { fontFamily: Fonts.sans, fontSize: 11, color: Colors.muted },
  commentText: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.text, lineHeight: 18 },
  commentInput: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    borderTopWidth: 0.5, borderTopColor: Colors.border,
    paddingTop: 10, paddingBottom: 10,
  },
  commentBox: {
    flex: 1, backgroundColor: Colors.creamLight,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    fontFamily: Fonts.sans, fontSize: 13, color: Colors.text,
    maxHeight: 80,
  },
  commentSend: {
    backgroundColor: Colors.green, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  commentSendDisabled: { opacity: 0.4 },
  commentSendText: { fontFamily: Fonts.sansMedium, fontSize: 13, color: Colors.cream },

  // RSVP banners
  maybeBanner: {
    backgroundColor: '#f5ead0', borderRadius: 12,
    borderWidth: 1, borderColor: '#ddc878',
    paddingVertical: 11, paddingHorizontal: 16,
    marginBottom: 16, alignItems: 'center',
  },
  maybeBannerText: { fontFamily: Fonts.sansMedium, fontSize: 14, color: '#8a6820' },
  confirmBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 14, padding: 16, marginBottom: 20,
  },
  confirmText: { fontFamily: Fonts.sansMedium, fontSize: 14, flex: 1 },
  confirmChange: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.muted, textDecorationLine: 'underline' },

  notFoundTitle: { fontFamily: Fonts.serifMedium, fontSize: 20, color: Colors.cream },
  notFoundSub: { fontFamily: Fonts.sans, fontSize: 14, color: 'rgba(216,214,175,0.6)', marginTop: 8 },

  // App nudge
  nudge: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.card, borderRadius: 14,
    borderWidth: 0.5, borderColor: Colors.border,
    padding: 14, marginBottom: 16,
  },
  nudgeEmoji: { fontSize: 24 },
  nudgeText: { flex: 1 },
  nudgeTitle: { fontFamily: Fonts.sansMedium, fontSize: 14, color: Colors.text },
  nudgeSub: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.muted, marginTop: 2 },
  nudgeArrow: { fontFamily: Fonts.sans, fontSize: 18, color: Colors.muted },

  footer: {
    fontFamily: Fonts.sans, fontSize: 11, color: Colors.muted,
    textAlign: 'center', paddingVertical: 20,
  },
});
