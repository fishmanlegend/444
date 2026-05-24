import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { AppIcon } from '@/components/AppIcon';
import React, { useCallback, useRef, useState } from 'react';

const FLAG_ICON = require('../../../assets/images/new-club-flag.png');
import type { Round } from '@/lib/database.types';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { PRESET_IMAGES } from '@/constants/presetImages';
import { PRESET_GIFS } from '@/constants/presetGifs';

import { Avatar } from '@/components/Avatar';
import { TopBar } from '@/components/TopBar';
import { Colors, Fonts } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { getMyClubs, createClub } from '@/lib/db';
import type { Club, InvitePolicy } from '@/lib/database.types';

const INVITE_POLICIES: { value: InvitePolicy; label: string; sub: string }[] = [
  { value: 'any_member', label: 'All club members', sub: 'Anyone in the club can bring people in' },
  { value: 'officers',   label: 'Managed',          sub: 'Only you or chosen managers can invite' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtNextRound(round: Round): string {
  const name = round.course_name ?? round.title ?? 'Golf Round';
  if (!round.scheduled_at) return name;
  const d = new Date(round.scheduled_at);
  const date = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${name}  ·  ${date} ${time}`;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ClubsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();

  const [clubs, setClubs] = useState<Club[]>([]);
  const [ready, setReady] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showChats, setShowChats] = useState(false);
  const [newName, setNewName] = useState('');
  const [invitePolicy, setInvitePolicy] = useState<InvitePolicy>('any_member');
  const [saving, setSaving] = useState(false);
  const fetchId = useRef(0);

  const userId = session?.user.id ?? (__DEV__ ? '46bae3d3-2c18-450e-b267-f36b91a94a31' : null);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      const id = ++fetchId.current;
      setReady(false);
      getMyClubs(userId).then((data) => {
        if (fetchId.current !== id) return;
        setClubs(data);
        setReady(true);
      });
    }, [userId]),
  );

  async function handleCreate() {
    if (!userId || !newName.trim()) return;
    setSaving(true);
    const club = await createClub(userId, newName.trim(), invitePolicy);
    setSaving(false);
    if (club) {
      setNewName('');
      setInvitePolicy('any_member');
      setShowCreate(false);
      getMyClubs(userId).then((data) => { setClubs(data); setReady(true); });
      router.push(`/club/${club.id}` as any);
    }
  }

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.green }}>
        <TopBar
          right={
            clubs.length > 0 ? (
              <TouchableOpacity onPress={() => setShowChats(true)} activeOpacity={0.7}>
                <AppIcon name="ellipsis.message.fill" size={25} tintColor={Colors.cream} />
              </TouchableOpacity>
            ) : undefined
          }
        />
      </SafeAreaView>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 80 }]}
        showsVerticalScrollIndicator={false}
      >
        {ready && clubs.length === 0 ? (
          <View style={s.emptyState}>
            <Text style={s.emptyEmoji}>⛳</Text>
            <Text style={s.emptyHeading}>No clubs yet.</Text>
            <Text style={s.emptySub}>Create one to quickly invite your crew to rounds.</Text>
            <TouchableOpacity style={s.emptyBtn} onPress={() => setShowCreate(true)} activeOpacity={0.8}>
              <Text style={s.emptyBtnText}>Create a club</Text>
            </TouchableOpacity>
          </View>
        ) : ready ? (
          <>
            <Text style={s.sectionLabel}>Your clubs</Text>
            <View style={s.list}>
              {clubs.map((club) => {
                const members = club.members ?? [];
                const preview = members.slice(0, 4);
                const overflow = members.length - 4;
                const bannerSrc = club.banner_image_id
                  ? (club.banner_is_video
                      ? PRESET_GIFS.find((g) => g.id === club.banner_image_id)?.source
                      : PRESET_IMAGES.find((img) => img.id === club.banner_image_id)?.source)
                  : null;

                return (
                  <TouchableOpacity
                    key={club.id}
                    style={s.clubCard}
                    activeOpacity={0.88}
                    onPress={() => router.push(`/club/${club.id}` as any)}
                  >
                    {/* Left: square patch */}
                    <View style={s.clubLeft}>
                      <View style={s.clubPatch}>
                        {bannerSrc
                          ? <Image source={bannerSrc} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="center" />
                          : <Text style={s.clubPatchInitial}>{club.name.charAt(0).toUpperCase()}</Text>
                        }
                      </View>
                    </View>

                    {/* Right: info */}
                    <View style={s.clubRight}>
                      <View style={s.clubTopRow}>
                        <Text style={s.clubName} numberOfLines={2}>{club.name}</Text>
                        <TouchableOpacity
                          style={s.dotsBtn}
                          activeOpacity={0.7}
                          onPress={(e) => { e.stopPropagation(); router.push(`/club-chat/${club.id}` as any); }}
                        >
                          <Text style={s.dotsText}>•••</Text>
                        </TouchableOpacity>
                      </View>

                      <View style={s.memberRow}>
                        {preview.map((m, i) => {
                          const p = m.profile;
                          return (
                            <Avatar
                              key={m.id}
                              initials={p?.initials ?? '?'}
                              bg={p?.avatar_color ?? Colors.green}
                              textColor={p?.avatar_text_color ?? Colors.cream}
                              size={26}
                              borderWidth={2}
                              borderColor={Colors.card}
                              style={{ marginLeft: i === 0 ? 0 : -8, zIndex: preview.length - i }}
                            />
                          );
                        })}
                        {overflow > 0 && (
                          <View style={[s.overflowBadge, { marginLeft: -8, zIndex: 0 }]}>
                            <Text style={s.overflowText}>+{overflow}</Text>
                          </View>
                        )}
                      </View>

                      <View style={s.divider} />
                      {club.nextRound ? (
                        <Text style={s.nextRoundLine} numberOfLines={1}>
                          {club.nextRound.scheduled_at
                            ? `${new Date(club.nextRound.scheduled_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}: `
                            : ''}
                          <Text style={s.nextRoundLineName}>
                            {club.nextRound.course_name ?? club.nextRound.title ?? 'Golf Round'}
                          </Text>
                        </Text>
                      ) : (
                        <View style={s.noRoundsRow}>
                          <Text style={s.nextRoundLine}>No rounds yet · </Text>
                          <TouchableOpacity
                            activeOpacity={0.7}
                            onPress={() => router.push(`/create?club_id=${club.id}` as any)}
                          >
                            <Text style={s.noRoundsLink}>Create one</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}

              <TouchableOpacity style={s.newClubCard} onPress={() => setShowCreate(true)} activeOpacity={0.7}>
                <Image source={FLAG_ICON} style={s.newClubFlagImg} contentFit="contain" />
                <View style={{ gap: 3 }}>
                  <Text style={s.newClubHeading}>Start a new club</Text>
                  <Text style={s.newClubSub}>Bring your people together.</Text>
                </View>
              </TouchableOpacity>
            </View>
          </>
        ) : null}
      </ScrollView>

      {/* ── Club chats sheet ── */}
      <Modal visible={showChats} transparent animationType="slide" onRequestClose={() => setShowChats(false)}>
        <View style={s.overlay}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowChats(false)} activeOpacity={1} />
          <View style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 24) }]}>
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>Club chats</Text>
              <TouchableOpacity onPress={() => setShowChats(false)}>
                <Text style={s.sheetCancel}>Done</Text>
              </TouchableOpacity>
            </View>
            {clubs.map((club, i) => {
              const bannerSrc = club.banner_image_id
                ? (club.banner_is_video
                    ? PRESET_GIFS.find((g) => g.id === club.banner_image_id)?.source
                    : PRESET_IMAGES.find((img) => img.id === club.banner_image_id)?.source)
                : null;
              return (
                <TouchableOpacity
                  key={club.id}
                  style={[s.chatRow, i < clubs.length - 1 && s.chatRowBorder]}
                  onPress={() => { setShowChats(false); router.push(`/club-chat/${club.id}` as any); }}
                  activeOpacity={0.7}
                >
                  <View style={s.chatRowThumb}>
                    {bannerSrc
                      ? <Image source={bannerSrc} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="center" />
                      : <Text style={s.chatRowInitial}>{club.name.charAt(0).toUpperCase()}</Text>
                    }
                  </View>
                  <View style={s.chatRowBody}>
                    <Text style={s.chatRowName}>{club.name}</Text>
                    <Text style={s.chatRowSub}>
                      {(club.members ?? []).length} {(club.members ?? []).length === 1 ? 'member' : 'members'}
                    </Text>
                  </View>
                  <Text style={s.chatRowArrow}>›</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Modal>

      {/* ── Create club modal ── */}
      <Modal visible={showCreate} transparent animationType="slide" onRequestClose={() => setShowCreate(false)}>
        <View style={s.overlay}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowCreate(false)} activeOpacity={1} />
          <View style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 24) }]}>
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>New club</Text>
              <TouchableOpacity onPress={() => setShowCreate(false)}>
                <Text style={s.sheetCancel}>Cancel</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={s.nameInput}
              value={newName}
              onChangeText={setNewName}
              placeholder="Club name (e.g. Weekend Warriors)"
              placeholderTextColor={Colors.muted}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleCreate}
              maxLength={40}
            />

            <View style={s.policySection}>
              <Text style={s.policyHeading}>Who can invite</Text>
              {INVITE_POLICIES.map((p) => (
                <TouchableOpacity
                  key={p.value}
                  style={[s.policyRow, invitePolicy === p.value && s.policyRowActive]}
                  onPress={() => setInvitePolicy(p.value)}
                  activeOpacity={0.7}
                >
                  <View style={s.policyRadio}>
                    {invitePolicy === p.value && <View style={s.policyRadioDot} />}
                  </View>
                  <View style={s.policyText}>
                    <Text style={[s.policyLabel, invitePolicy === p.value && s.policyLabelActive]}>
                      {p.label}
                    </Text>
                    <Text style={s.policySub}>{p.sub}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[s.createBtn, (!newName.trim() || saving) && s.createBtnDim]}
              onPress={handleCreate}
              activeOpacity={0.8}
            >
              <Text style={s.createBtnText}>{saving ? 'Creating...' : 'Create club'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.green },
  scroll: { flex: 1, backgroundColor: Colors.bg },
  content: { paddingTop: 16, paddingHorizontal: 16 },

  sectionLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 10,
    color: Colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 12,
    marginTop: 4,
  },

  list: { gap: 12 },

  // ── Club card ──────────────────────────────────────────────────────────────
  clubCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Colors.green,
    overflow: 'hidden',
    flexDirection: 'row',
  },

  clubLeft: {
    width: 124,
    backgroundColor: '#1a3320',
    alignSelf: 'stretch',
    flexShrink: 0,
  },
  clubPatch: {
    flex: 1,
    alignSelf: 'stretch',
    backgroundColor: '#253d23',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clubPatchInitial: {
    fontFamily: Fonts.serifMedium,
    fontSize: 48,
    color: Colors.cream,
    opacity: 0.35,
  },

  clubRight: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    justifyContent: 'center',
  },
  clubTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  clubName: {
    fontFamily: Fonts.serifMedium,
    fontSize: 20,
    color: Colors.text,
    lineHeight: 24,
    flex: 1,
    marginRight: 4,
  },
  dotsBtn: { paddingLeft: 6, paddingTop: 2 },
  dotsText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 11,
    color: Colors.muted,
    letterSpacing: 2,
  },

  memberRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  overflowBadge: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: Colors.creamLight,
    borderWidth: 2, borderColor: Colors.card,
    alignItems: 'center', justifyContent: 'center',
  },
  overflowText: { fontFamily: Fonts.sansSemiBold, fontSize: 10, color: Colors.green },

  divider: { height: 0.5, backgroundColor: Colors.border, marginVertical: 8 },

  nextRoundLine: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.muted, lineHeight: 17 },
  nextRoundLineName: { fontFamily: Fonts.sansMedium, fontSize: 12, color: Colors.text },
  noRoundsRow: { flexDirection: 'row', alignItems: 'center' },
  noRoundsLink: { fontFamily: Fonts.sansMedium, fontSize: 12, color: Colors.green },

  // ── New club card ──────────────────────────────────────────────────────────
  newClubCard: {
    borderWidth: 1.5,
    borderColor: '#a8a48e',
    borderStyle: 'dashed',
    borderRadius: 16,
    height: 136,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 20,
  },
  newClubFlagImg: { width: 112, height: 112 },
  newClubHeading: {
    fontFamily: Fonts.serifMedium,
    fontSize: 20,
    color: Colors.text,
  },
  newClubSub: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: Colors.muted,
  },

  emptyState: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyEmoji: { fontSize: 48, marginBottom: 8 },
  emptyHeading: { fontFamily: Fonts.serifMedium, fontSize: 22, color: Colors.text },
  emptySub: { fontFamily: Fonts.sans, fontSize: 14, color: Colors.muted, textAlign: 'center', paddingHorizontal: 32 },
  emptyBtn: {
    marginTop: 8,
    backgroundColor: Colors.green,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  emptyBtnText: { fontFamily: Fonts.sansMedium, fontSize: 14, color: Colors.cream },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  sheetTitle: { fontFamily: Fonts.sansMedium, fontSize: 15, color: Colors.text },
  sheetCancel: { fontFamily: Fonts.sans, fontSize: 15, color: Colors.muted },
  nameInput: {
    fontFamily: Fonts.sans,
    fontSize: 16,
    color: Colors.text,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  policySection: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 4,
    gap: 2,
  },
  policyHeading: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 10,
    color: Colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  policyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  policyRowActive: {
    backgroundColor: Colors.creamLight,
  },
  policyRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: Colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  policyRadioDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: Colors.green,
  },
  policyText: { flex: 1, gap: 1 },
  policyLabel: {
    fontFamily: Fonts.sansMedium,
    fontSize: 14,
    color: Colors.muted,
  },
  policyLabelActive: {
    color: Colors.text,
  },
  policySub: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: Colors.muted,
    lineHeight: 16,
  },

  // Chat picker rows
  chatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  chatRowBorder: { borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  chatRowThumb: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#1a3320',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  chatRowInitial: { fontFamily: Fonts.serifMedium, fontSize: 20, color: Colors.cream, opacity: 0.5 },
  chatRowBody: { flex: 1, gap: 2 },
  chatRowName: { fontFamily: Fonts.sansMedium, fontSize: 15, color: Colors.text },
  chatRowSub: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.muted },
  chatRowArrow: { fontFamily: Fonts.sans, fontSize: 20, color: Colors.muted },

  createBtn: {
    margin: 16,
    backgroundColor: Colors.green,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  createBtnDim: { opacity: 0.5 },
  createBtnText: { fontFamily: Fonts.sansMedium, fontSize: 15, color: Colors.cream },
});
