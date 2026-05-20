import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
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
import type { Club } from '@/lib/database.types';

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
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  const userId = session?.user.id ?? (__DEV__ ? '46bae3d3-2c18-450e-b267-f36b91a94a31' : null);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      getMyClubs(userId).then(setClubs);
    }, [userId]),
  );

  async function handleCreate() {
    if (!userId || !newName.trim()) return;
    setSaving(true);
    const club = await createClub(userId, newName.trim());
    setSaving(false);
    if (club) {
      setNewName('');
      setShowCreate(false);
      getMyClubs(userId).then(setClubs);
    }
  }

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.green }}>
        <TopBar
          right={
            <TouchableOpacity onPress={() => setShowCreate(true)} activeOpacity={0.7}>
              <Text style={s.newBtn}>+ New</Text>
            </TouchableOpacity>
          }
        />
      </SafeAreaView>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 80 }]}
        showsVerticalScrollIndicator={false}
      >
        {clubs.length === 0 ? (
          <View style={s.emptyState}>
            <Text style={s.emptyEmoji}>⛳</Text>
            <Text style={s.emptyHeading}>No clubs yet.</Text>
            <Text style={s.emptySub}>Create one to quickly invite your crew to rounds.</Text>
            <TouchableOpacity style={s.emptyBtn} onPress={() => setShowCreate(true)} activeOpacity={0.8}>
              <Text style={s.emptyBtnText}>Create a club</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={s.sectionLabel}>Your clubs</Text>
            <View style={s.list}>
              {clubs.map((club) => {
                const members = club.members ?? [];
                const preview = members.slice(0, 5);
                const bannerSrc = club.banner_image_id
                  ? (club.banner_is_video
                      ? PRESET_GIFS.find((g) => g.id === club.banner_image_id)?.source
                      : PRESET_IMAGES.find((i) => i.id === club.banner_image_id)?.source)
                  : null;

                return (
                  <TouchableOpacity
                    key={club.id}
                    style={s.clubCard}
                    activeOpacity={0.85}
                    onPress={() => router.push(`/club/${club.id}` as any)}
                  >
                    <View style={s.clubSquare}>
                      {bannerSrc
                        ? <Image source={bannerSrc} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="center" />
                        : <Text style={s.clubSquareInitial}>{club.name.charAt(0).toUpperCase()}</Text>
                      }
                    </View>

                    <View style={s.clubRight}>
                      <Text style={s.clubName}>{club.name}</Text>
                      <Text style={s.clubMeta}>
                        {members.length} {members.length === 1 ? 'member' : 'members'}
                      </Text>
                      {club.nextRound ? (
                        <View style={s.nextRoundPill}>
                          <Text style={s.nextRoundText} numberOfLines={2}>
                            {fmtNextRound(club.nextRound)}
                          </Text>
                        </View>
                      ) : (
                        <View style={s.avatarStack}>
                          {preview.map((m, i) => {
                            const p = m.profile;
                            return (
                              <Avatar
                                key={m.id}
                                initials={p?.initials ?? '?'}
                                bg={p?.avatar_color ?? Colors.green}
                                textColor={p?.avatar_text_color ?? Colors.cream}
                                size={28}
                                borderWidth={2}
                                borderColor={Colors.card}
                                style={{ marginLeft: i === 0 ? 0 : -8, zIndex: preview.length - i }}
                              />
                            );
                          })}
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>

      {/* ── Create club modal ── */}
      <Modal visible={showCreate} transparent animationType="slide" onRequestClose={() => setShowCreate(false)}>
        <View style={s.overlay}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowCreate(false)} activeOpacity={1} />
          <View style={s.sheet}>
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

  newBtn: { fontFamily: Fonts.sansMedium, fontSize: 14, color: Colors.cream },

  sectionLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 10,
    color: Colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 12,
    marginTop: 4,
  },

  list: { gap: 10 },

  clubCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.green,
    overflow: 'hidden',
    flexDirection: 'row',
    minHeight: 120,
  },

  clubSquare: {
    width: 120,
    height: 120,
    backgroundColor: '#1a3320',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    overflow: 'hidden',
  },

  clubSquareInitial: {
    fontFamily: Fonts.serifMedium,
    fontSize: 54,
    color: Colors.cream,
    opacity: 0.4,
  },

  clubRight: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 5,
    justifyContent: 'center',
  },

  clubName: { fontFamily: Fonts.serifMedium, fontSize: 18, color: Colors.text, lineHeight: 22 },
  clubMeta: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.muted },
  avatarStack: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },

  nextRoundPill: {
    marginTop: 4,
    backgroundColor: Colors.creamLight,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
    alignSelf: 'flex-start',
  },
  nextRoundText: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    color: Colors.green,
    lineHeight: 16,
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
