import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AppIcon } from '@/components/AppIcon';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { TopBar } from '@/components/TopBar';
import { CoverPickerModal } from '@/components/CoverPickerModal';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { PRESET_IMAGES } from '@/constants/presetImages';
import { PRESET_GIFS } from '@/constants/presetGifs';
import { useAuth } from '@/context/auth';
import {
  getClubWithMembers, addClubMember, getProfilesExcluding,
  patchClub, getClubMessages, getClubRounds, createClubInvite,
} from '@/lib/db';
import type { Club, ClubMember, ClubPost, InvitePolicy, Profile, Round } from '@/lib/database.types';

const INVITE_POLICIES: { value: InvitePolicy; label: string; sub: string }[] = [
  { value: 'any_member', label: 'All club members', sub: 'All members can bring people in' },
  { value: 'officers',   label: 'Managed', sub: 'Only you or specific members can invite' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getBannerSource(club: Club): number | null {
  if (!club.banner_image_id) return null;
  if (club.banner_is_video) return PRESET_GIFS.find((g) => g.id === club.banner_image_id)?.source ?? null;
  return PRESET_IMAGES.find((i) => i.id === club.banner_image_id)?.source ?? null;
}

function getRoundCoverSource(round: Round): number | null {
  if (!round.cover_image_id) return null;
  if (round.cover_is_video) return PRESET_GIFS.find((g) => g.id === round.cover_image_id)?.source ?? null;
  return PRESET_IMAGES.find((i) => i.id === round.cover_image_id)?.source ?? null;
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtRoundDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function VideoBanner({ source, style }: { source: string; style: object }) {
  const player = useVideoPlayer(source, (p) => { p.loop = true; p.muted = true; p.play(); });
  return <VideoView player={player} style={style} contentFit="cover" nativeControls={false} />;
}

function RoundCard({ round, userId, onPress }: { round: Round; userId: string | null; onPress: () => void }) {
  const src = getRoundCoverSource(round);
  return (
    <TouchableOpacity style={rc.card} activeOpacity={0.85} onPress={onPress}>
      <View style={rc.img}>
        {src ? (
          round.cover_is_video
            ? <VideoBanner source={src} style={StyleSheet.absoluteFill} />
            : <Image source={src} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : null}
      </View>
      <View style={rc.info}>
        <Text style={rc.name} numberOfLines={2}>{round.course_name ?? 'Golf Round'}</Text>
        {round.scheduled_at ? <Text style={rc.date}>{fmtRoundDate(round.scheduled_at)}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

const CARD_W = 148;
const rc = StyleSheet.create({
  card: { width: CARD_W, borderRadius: 12, backgroundColor: Colors.card, borderWidth: 1.5, borderColor: Colors.green, overflow: 'hidden' },
  img: { width: CARD_W, height: CARD_W, backgroundColor: '#1a3320', overflow: 'hidden' },
  info: { paddingHorizontal: 10, paddingTop: 8, paddingBottom: 10, gap: 3 },
  name: { fontFamily: Fonts.serifMedium, fontSize: 13, color: Colors.text, lineHeight: 18 },
  date: { fontFamily: Fonts.sans, fontSize: 10, color: Colors.muted },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ClubScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();

  const [club, setClub] = useState<Club | null>(null);
  const [lastMessage, setLastMessage] = useState<ClubPost | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAddSheet, setShowAddSheet] = useState(false);
  const [candidates, setCandidates] = useState<Profile[]>([]);
  const [adding, setAdding] = useState<string | null>(null);
  const [invited, setInvited] = useState<Set<string>>(new Set());

  const [showBannerPicker, setShowBannerPicker] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const userId = session?.user.id ?? (__DEV__ ? '46bae3d3-2c18-450e-b267-f36b91a94a31' : null);

  async function reload() {
    if (!id) return;
    const [c, msgs, r] = await Promise.all([
      getClubWithMembers(id),
      getClubMessages(id, 1),
      getClubRounds(id),
    ]);
    setClub(c);
    setLastMessage(msgs[msgs.length - 1] ?? null);
    setRounds(r);
    setLoading(false);
  }

  useEffect(() => { reload(); }, [id]);

  const isCreator = club?.created_by === userId;
  const canCreateRound = !club?.only_host_can_create_rounds || isCreator;

  async function openAddSheet() {
    const currentIds = (club?.members ?? []).map((m) => m.user_id);
    const profiles = await getProfilesExcluding(currentIds);
    setCandidates(profiles);
    setShowAddSheet(true);
  }

  async function handleInvite(profile: Profile) {
    if (!id || !userId) return;
    setAdding(profile.id);
    await addClubMember(id, profile.id, userId);
    setAdding(null);
    setInvited((prev) => new Set(prev).add(profile.id));
    reload();
  }

  async function handleBannerSelect(source: string, isVideo: boolean) {
    if (!id) return;
    const allCovers = [...PRESET_IMAGES, ...PRESET_GIFS];
    const matched = allCovers.find((i) => i.source === source);
    if (!matched) return;
    const updates = { banner_image_id: matched.id, banner_is_video: isVideo };
    setClub((prev) => prev ? { ...prev, ...updates } : prev);
    await patchClub(id, updates);
  }

  async function handleShareInviteLink() {
    if (!id || !userId) return;
    const invite = await createClubInvite(id, userId);
    if (!invite) { Alert.alert('Error', 'Could not create invite link.'); return; }
    const url = `https://countryclub.golf/join/${invite.code}`;
    Share.share({ message: `Join ${club?.name ?? 'my club'} on Country Club:\n${url}` });
  }

  async function handleToggleHostOnly(val: boolean) {
    if (!id) return;
    setClub((prev) => prev ? { ...prev, only_host_can_create_rounds: val } : prev);
    await patchClub(id, { only_host_can_create_rounds: val });
  }

  if (loading) {
    return (
      <View style={[s.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={Colors.cream} />
      </View>
    );
  }

  if (!club) {
    return (
      <View style={[s.root, { alignItems: 'center', justifyContent: 'center', padding: 32 }]}>
        <Text style={{ fontFamily: Fonts.serifMedium, fontSize: 20, color: Colors.cream }}>Club not found</Text>
      </View>
    );
  }

  const members = club.members ?? [];
  const bannerSource = getBannerSource(club);

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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <TouchableOpacity onPress={() => router.push(`/club-chat/${club.id}` as any)} activeOpacity={0.7}>
                <AppIcon name="ellipsis.message.fill" size={23} tintColor={Colors.cream} />
              </TouchableOpacity>
              {isCreator && (
                <TouchableOpacity onPress={() => setShowSettings(true)} activeOpacity={0.7}>
                  <Text style={s.settingsBtn}>⚙ Settings</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      </SafeAreaView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>

        {/* ── Banner ── */}
        <TouchableOpacity
          style={s.banner}
          activeOpacity={isCreator ? 0.8 : 1}
          onPress={() => isCreator && setShowBannerPicker(true)}
        >
          {bannerSource ? (
            club.banner_is_video
              ? <VideoBanner source={bannerSource} style={StyleSheet.absoluteFill} />
              : <Image source={bannerSource} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : null}
          <View style={s.bannerOverlay}>
            <Text style={s.clubName}>{club.name}</Text>
            <Text style={s.clubMeta}>
              {members.length} {members.length === 1 ? 'member' : 'members'}
              {isCreator && !bannerSource ? '  ·  Tap to add banner' : ''}
            </Text>
          </View>
        </TouchableOpacity>

        {/* ── Drawer ── */}
        <View style={[s.drawer, { flex: 1, paddingBottom: insets.bottom + 80 }]}>
          <View style={s.handle} />

          {/* Create round */}
          {canCreateRound && (
            <TouchableOpacity
              style={s.createBtn}
              activeOpacity={0.85}
              onPress={() => router.push(`/create?club_id=${club.id}` as any)}
            >
              <Text style={s.createBtnText}>🏌️  Create round with this club</Text>
            </TouchableOpacity>
          )}

          {/* ── Upcoming rounds ── */}
          {rounds.length > 0 && (
            <>
              <Text style={[s.sectionLabel, { marginBottom: 12 }]}>Upcoming Rounds</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.roundsStrip}
              >
                {rounds.map((r) => (
                  <RoundCard
                    key={r.id}
                    round={r}
                    userId={userId}
                    onPress={() => router.push((r.host_id === userId ? `/manage/${r.id}` : `/invite/${r.id}`) as any)}
                  />
                ))}
              </ScrollView>
            </>
          )}

          {/* ── Chat ── */}
          <Text style={[s.sectionLabel, { marginTop: 24, marginBottom: 10 }]}>Chat</Text>
          <TouchableOpacity
            style={s.chatCard}
            activeOpacity={0.85}
            onPress={() => router.push(`/club-chat/${club.id}` as any)}
          >
            <View style={s.chatCardLeft}>
              <Text style={s.chatIcon}>💬</Text>
              <View style={s.chatCardBody}>
                <Text style={s.chatCardTitle}>Club Chat</Text>
                {lastMessage ? (
                  <Text style={s.chatCardPreview} numberOfLines={1}>
                    {lastMessage.profile?.name?.split(' ')[0] ?? 'Member'}: {lastMessage.body}
                  </Text>
                ) : (
                  <Text style={s.chatCardPreview}>No messages yet</Text>
                )}
              </View>
            </View>
            <Text style={s.chatArrow}>›</Text>
          </TouchableOpacity>

          {/* ── Members ── */}
          <View style={[s.sectionRow, { marginTop: 24 }]}>
            <Text style={s.sectionLabel}>Members · {members.length}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity onPress={handleShareInviteLink} activeOpacity={0.7} style={s.addBtn}>
                <Text style={s.addBtnText}>Share link</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={openAddSheet} activeOpacity={0.7} style={s.addBtn}>
                <Text style={s.addBtnText}>+ Add</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={s.card}>
            {members.map((m: ClubMember, i: number) => {
              const p = m.profile;
              const isMe = m.user_id === userId;
              return (
                <View key={m.id} style={[s.memberRow, i < members.length - 1 && s.memberRowBorder]}>
                  <Avatar
                    initials={p?.initials ?? '?'}
                    bg={p?.avatar_color ?? Colors.green}
                    textColor={p?.avatar_text_color ?? Colors.cream}
                    size={32}
                    borderWidth={0}
                    borderColor="transparent"
                  />
                  <Text style={s.memberName}>
                    {p?.name ?? 'Player'}
                    {isMe && <Text style={s.meTag}> you</Text>}
                  </Text>
                  {m.status === 'pending' && <Text style={s.pendingBadge}>Pending</Text>}
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>

      {/* ── Add member sheet ── */}
      <Modal visible={showAddSheet} transparent animationType="slide" onRequestClose={() => setShowAddSheet(false)}>
        <View style={s.overlay}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowAddSheet(false)} activeOpacity={1} />
          <View style={s.sheet}>
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>Add member</Text>
              <TouchableOpacity onPress={() => setShowAddSheet(false)}>
                <Text style={s.sheetCancel}>Cancel</Text>
              </TouchableOpacity>
            </View>
            {candidates.length === 0 ? (
              <View style={s.sheetEmpty}>
                <Text style={s.sheetEmptyText}>Everyone's already in this club.</Text>
              </View>
            ) : (
              candidates.map((p, i) => {
                const isInvited = invited.has(p.id);
                const isAdding = adding === p.id;
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[s.candidateRow, i < candidates.length - 1 && s.candidateBorder]}
                    activeOpacity={isInvited ? 1 : 0.7}
                    onPress={() => !isInvited && handleInvite(p)}
                    disabled={isAdding}
                  >
                    <Avatar
                      initials={p.initials ?? '?'}
                      bg={p.avatar_color ?? Colors.green}
                      textColor={p.avatar_text_color ?? Colors.cream}
                      size={36}
                      borderWidth={0}
                      borderColor="transparent"
                    />
                    <Text style={s.candidateName}>{p.name ?? 'Player'}</Text>
                    {isAdding
                      ? <ActivityIndicator size="small" color={Colors.muted} />
                      : isInvited
                        ? <Text style={s.candidatePending}>Pending</Text>
                        : <Text style={s.candidateInvite}>Invite</Text>
                    }
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        </View>
      </Modal>

      {/* ── Settings sheet (creator only) ── */}
      <Modal visible={showSettings} transparent animationType="slide" onRequestClose={() => setShowSettings(false)}>
        <View style={s.overlay}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowSettings(false)} activeOpacity={1} />
          <View style={s.sheet}>
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>Club Settings</Text>
              <TouchableOpacity onPress={() => setShowSettings(false)}>
                <Text style={s.sheetCancel}>Done</Text>
              </TouchableOpacity>
            </View>
            <View style={s.settingRow}>
              <View style={s.settingLeft}>
                <Text style={s.settingLabel}>Only creator can create rounds</Text>
                <Text style={s.settingDesc}>When off, any member can organize a round with this club</Text>
              </View>
              <Switch
                value={club.only_host_can_create_rounds}
                onValueChange={handleToggleHostOnly}
                trackColor={{ false: Colors.border, true: Colors.green }}
                thumbColor="#fff"
              />
            </View>

            <View style={s.settingDivider} />
            <Text style={s.settingGroupLabel}>Who can invite</Text>
            {INVITE_POLICIES.map((p) => (
              <TouchableOpacity
                key={p.value}
                style={[s.policyRow, club.invite_policy === p.value && s.policyRowActive]}
                onPress={async () => {
                  setClub((prev) => prev ? { ...prev, invite_policy: p.value } : prev);
                  await patchClub(id, { invite_policy: p.value });
                }}
                activeOpacity={0.7}
              >
                <View style={s.policyRadio}>
                  {club.invite_policy === p.value && <View style={s.policyRadioDot} />}
                </View>
                <View style={{ flex: 1, gap: 1 }}>
                  <Text style={[s.policyLabel, club.invite_policy === p.value && s.policyLabelActive]}>
                    {p.label}
                  </Text>
                  <Text style={s.policySub}>{p.sub}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* ── Banner picker ── */}
      <CoverPickerModal
        visible={showBannerPicker}
        current={bannerSource ?? 0}
        userId={userId ?? undefined}
        onSelect={handleBannerSelect}
        onClose={() => setShowBannerPicker(false)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.green },
  backBtn: { fontFamily: Fonts.sans, fontSize: 13, color: 'rgba(216,214,175,0.6)' },
  settingsBtn: { fontFamily: Fonts.sans, fontSize: 13, color: 'rgba(216,214,175,0.6)' },

  banner: {
    height: 200,
    backgroundColor: '#1e3a1c',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  bannerOverlay: {
    paddingHorizontal: 18,
    paddingBottom: 28,
    paddingTop: 60,
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  clubName: { fontFamily: Fonts.serifMedium, fontSize: 28, color: Colors.cream },
  clubMeta: { fontFamily: Fonts.sans, fontSize: 13, color: 'rgba(216,214,175,0.7)' },

  drawer: {
    backgroundColor: Colors.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -12,
    paddingTop: 22,
    paddingHorizontal: 16,
  },
  handle: { width: 32, height: 3, backgroundColor: '#d8d4c0', borderRadius: 4, alignSelf: 'center', marginBottom: 20 },

  createBtn: { backgroundColor: Colors.green, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginBottom: 24 },
  createBtnText: { fontFamily: Fonts.sansMedium, fontSize: 15, color: Colors.cream },

  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionLabel: {
    fontFamily: Fonts.sansSemiBold, fontSize: 10, color: Colors.muted,
    textTransform: 'uppercase', letterSpacing: 1.2,
  },

  roundsStrip: { gap: 10, paddingBottom: 4 },

  card: { backgroundColor: Colors.card, borderRadius: 14, borderWidth: 0.5, borderColor: Colors.border },

  // Chat card
  chatCard: {
    backgroundColor: Colors.card, borderRadius: 14, borderWidth: 0.5, borderColor: Colors.border,
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14,
    marginBottom: 0,
  },
  chatCardLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  chatIcon: { fontSize: 22 },
  chatCardBody: { flex: 1, gap: 2 },
  chatCardTitle: { fontFamily: Fonts.sansMedium, fontSize: 15, color: Colors.text },
  chatCardPreview: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.muted },
  chatArrow: { fontFamily: Fonts.sans, fontSize: 20, color: Colors.muted, marginLeft: 8 },

  // Members
  addBtn: { backgroundColor: Colors.creamLight, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  addBtnText: { fontFamily: Fonts.sansMedium, fontSize: 12, color: Colors.green },
  memberRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, gap: 12 },
  memberRowBorder: { borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  memberName: { fontFamily: Fonts.sansMedium, fontSize: 14, color: Colors.text, flex: 1 },
  meTag: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.muted },
  pendingBadge: { fontFamily: Fonts.sans, fontSize: 11, color: Colors.muted },

  // Sheets
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 40 },
  sheetHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 18, paddingVertical: 14,
    borderBottomWidth: 0.5, borderBottomColor: Colors.border,
  },
  sheetTitle: { fontFamily: Fonts.sansMedium, fontSize: 15, color: Colors.text },
  sheetCancel: { fontFamily: Fonts.sans, fontSize: 15, color: Colors.muted },
  sheetEmpty: { padding: 32, alignItems: 'center' },
  sheetEmptyText: { fontFamily: Fonts.sans, fontSize: 14, color: Colors.muted },
  candidateRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12, gap: 12 },
  candidateBorder: { borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  candidateName: { fontFamily: Fonts.sansMedium, fontSize: 15, color: Colors.text, flex: 1 },
  candidateInvite: { fontFamily: Fonts.sansMedium, fontSize: 13, color: Colors.green },
  candidatePending: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.muted },

  // Settings
  settingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 18, paddingVertical: 16,
  },
  settingLeft: { flex: 1, gap: 3 },
  settingLabel: { fontFamily: Fonts.sansMedium, fontSize: 15, color: Colors.text },
  settingDesc: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.muted, lineHeight: 17 },
  settingDivider: { height: 1, backgroundColor: Colors.border, marginHorizontal: 18, marginVertical: 4 },
  settingGroupLabel: {
    fontFamily: Fonts.sansSemiBold, fontSize: 10, color: Colors.muted,
    textTransform: 'uppercase', letterSpacing: 1.2,
    paddingHorizontal: 18, paddingTop: 12, paddingBottom: 6,
  },
  policyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, paddingHorizontal: 18, borderRadius: 10,
  },
  policyRowActive: { backgroundColor: Colors.creamLight },
  policyRadio: {
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 1.5, borderColor: Colors.green,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  policyRadioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: Colors.green },
  policyLabel: { fontFamily: Fonts.sansMedium, fontSize: 14, color: Colors.muted },
  policyLabelActive: { color: Colors.text },
  policySub: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.muted, lineHeight: 16 },
});
