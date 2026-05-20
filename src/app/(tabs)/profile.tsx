import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Linking, Modal, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { TopBar } from '@/components/TopBar';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { BADGE_DEFINITIONS, PROFILE_BADGE_IDS, computeEarnedBadges, type UserStats } from '@/lib/badges';
import * as ImagePicker from 'expo-image-picker';
import { getPals, getProfile, getLiveProfileStats, updateProfile, uploadAvatar } from '@/lib/db';
import { useAuth } from '@/context/auth';
import type { Pal, Profile } from '@/lib/database.types';

// ─── Fallback while profile loads ─────────────────────────────────────────────

const FALLBACK_STATS: UserStats = {
  roundsPlayed: 0, roundsHosted: 0, palsMade: 0, currentStreakWeeks: 0,
  coursesPlayed: 0, skinsWon: 0, earlyBirdRounds: 0, clubsJoined: 0,
  introductions: 0, bestScore: null, biggestSkinsPot: 0, connectors: 0,
  rivalries: 0, regularGroupRounds: 0, guestRounds: 0, largeRoundsHosted: 0,
  uniqueGroupsHosted: 0, citiesPlayed: 0, reunions: 0, eaglesMade: 0,
  birdiesMade: 0, glueRounds: 0, scorecardsKept: 0, photosShared: 0,
};


// ─── Edit Profile Modal ───────────────────────────────────────────────────────

function EditProfileModal({
  visible, profile, userId, onSaved, onClose,
}: {
  visible: boolean;
  profile: Profile | null;
  userId: string;
  onSaved: (p: Profile) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [name, setName]           = useState('');
  const [location, setLocation]   = useState('');
  const [bio, setBio]             = useState('');
  const [instagram, setInstagram]       = useState('');
  const [venmo, setVenmo]               = useState('');
  const [snapchat, setSnapchat]         = useState('');
  const [saving, setSaving]             = useState(false);
  const [avatarUri, setAvatarUri]       = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => {
    if (visible && profile) {
      setName(profile.name ?? '');
      setLocation(profile.location ?? '');
      setBio(profile.bio ?? '');
      setInstagram(profile.instagram_handle ?? '');
      setVenmo(profile.venmo_handle ?? '');
      setSnapchat(profile.snapchat_handle ?? '');
      setAvatarUri(profile.avatar_url ?? null);
    }
  }, [visible, profile]);

  const handlePickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to set a profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled) return;
    const uri = result.assets[0].uri;
    setUploadingPhoto(true);
    try {
      const url = await uploadAvatar(userId, uri);
      await updateProfile(userId, { avatar_url: url });
      setAvatarUri(url);
      const fresh = await getProfile(userId);
      if (fresh) onSaved(fresh);
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message ?? 'Could not upload photo.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProfile(userId, {
        name:             name.trim() || null,
        location:         location.trim() || null,
        bio:              bio.trim() || null,
        instagram_handle: instagram.trim().replace(/^@/, '') || null,
        venmo_handle:     venmo.trim().replace(/^@/, '') || null,
        snapchat_handle:  snapchat.trim().replace(/^@/, '') || null,
      });
      const fresh = await getProfile(userId);
      if (fresh) onSaved(fresh);
      onClose();
    } catch (e: any) {
      Alert.alert('Save failed', e?.message ?? 'Something went wrong. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={{ flex: 1, backgroundColor: Colors.bg }}>
        <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.bg }}>
          <View style={es.header}>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
              <Text style={es.cancelBtn}>Cancel</Text>
            </TouchableOpacity>
            <Text style={es.title}>Edit Profile</Text>
            <TouchableOpacity onPress={handleSave} activeOpacity={0.7} disabled={saving}>
              <Text style={[es.saveBtn, saving && { opacity: 0.4 }]}>Save</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[es.scroll, { paddingBottom: insets.bottom + 40 }]}
          >
            {/* Photo section */}
            <View style={es.photoSection}>
              <TouchableOpacity activeOpacity={0.8} onPress={handlePickPhoto} disabled={uploadingPhoto}>
                <View style={es.photoWrap}>
                  <Avatar
                    initials={profile?.initials ?? '??'}
                    bg={profile?.avatar_color ?? Colors.creamLight}
                    textColor={profile?.avatar_text_color ?? Colors.green}
                    size={80}
                    borderWidth={0}
                    borderColor="transparent"
                    uri={avatarUri}
                  />
                  <View style={es.cameraBadge}>
                    <Text style={es.cameraIcon}>{uploadingPhoto ? '…' : '📷'}</Text>
                  </View>
                </View>
              </TouchableOpacity>
              <Text style={es.photoLabel}>{avatarUri ? 'Change Photo' : 'Add Photo'}</Text>
            </View>

            {/* Fields */}
            <View style={es.group}>
              <View style={es.fieldRow}>
                <Text style={es.fieldLabel}>Name</Text>
                <TextInput
                  style={es.fieldInput}
                  value={name}
                  onChangeText={setName}
                  placeholder="Your name"
                  placeholderTextColor={Colors.muted}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </View>
              <View style={[es.fieldRow, es.fieldRowBorder]}>
                <Text style={es.fieldLabel}>Location</Text>
                <TextInput
                  style={es.fieldInput}
                  value={location}
                  onChangeText={setLocation}
                  placeholder="City, State"
                  placeholderTextColor={Colors.muted}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </View>
            </View>

            <View style={[es.group, { marginTop: 20 }]}>
              <Text style={es.groupLabel}>Bio</Text>
              <View style={es.fieldRow}>
                <TextInput
                  style={[es.fieldInput, es.bioInput]}
                  value={bio}
                  onChangeText={setBio}
                  placeholder="Write a short bio..."
                  placeholderTextColor={Colors.muted}
                  multiline
                  numberOfLines={3}
                />
              </View>
            </View>

            <View style={[es.group, { marginTop: 20 }]}>
              <Text style={es.groupLabel}>Links</Text>
              <View style={es.fieldRow}>
                <Text style={es.fieldLabel}>Instagram</Text>
                <TextInput
                  style={es.fieldInput}
                  value={instagram}
                  onChangeText={setInstagram}
                  placeholder="@handle"
                  placeholderTextColor={Colors.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                />
              </View>
              <View style={[es.fieldRow, es.fieldRowBorder]}>
                <Text style={es.fieldLabel}>Venmo</Text>
                <TextInput
                  style={es.fieldInput}
                  value={venmo}
                  onChangeText={setVenmo}
                  placeholder="@handle"
                  placeholderTextColor={Colors.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                />
              </View>
              <View style={[es.fieldRow, es.fieldRowBorder]}>
                <Text style={es.fieldLabel}>Snapchat</Text>
                <TextInput
                  style={es.fieldInput}
                  value={snapchat}
                  onChangeText={setSnapchat}
                  placeholder="@handle"
                  placeholderTextColor={Colors.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                />
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function BadgeTile({ defn, earned }: {
  defn: (typeof BADGE_DEFINITIONS)[number];
  earned: ReturnType<typeof computeEarnedBadges>[number];
}) {
  const hasEarned = earned.tierIndex >= 0;
  const descText = hasEarned
    ? defn.describe(earned.progress)
    : defn.describe(defn.tiers[0].threshold);

  return (
    <View style={[s.badgeTile, !hasEarned && s.badgeTileLocked]}>
      <Text style={[s.badgeEmoji, !hasEarned && s.badgeLocked]}>{defn.emoji}</Text>
      <Text style={[s.badgeTitle, !hasEarned && s.badgeLocked]} numberOfLines={1}>
        {hasEarned ? earned.title : '–'}
      </Text>
      <Text style={[s.badgeSub, !hasEarned && s.badgeLocked]} numberOfLines={2}>
        {descText}
      </Text>
    </View>
  );
}

function PalRow({ pal, showBorder }: { pal: Pal & { profile: Profile }; showBorder: boolean }) {
  const p = pal.profile;
  return (
    <View style={[s.palRow, showBorder && s.palRowBorder]}>
      <Avatar
        initials={p?.initials ?? '?'}
        bg={p?.avatar_color ?? Colors.green}
        textColor={p?.avatar_text_color ?? Colors.cream}
        size={36}
        borderWidth={0}
        borderColor="transparent"
      />
      <View style={s.palInfo}>
        <Text style={s.palName}>{p?.name ?? 'Player'}</Text>
        {p?.handle ? <Text style={s.palHandle}>@{p.handle}</Text> : null}
      </View>
      {pal.rounds_together > 0 ? (
        <Text style={s.palRounds}>{pal.rounds_together} {pal.rounds_together === 1 ? 'round' : 'rounds'}</Text>
      ) : (
        <Text style={s.palAlmost}>{pal.invites_together ?? 1} {(pal.invites_together ?? 1) === 1 ? 'almost-round' : 'almost-rounds'}</Text>
      )}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session, profile: authProfile, signOut } = useAuth();

  const [pals, setPals]               = useState<(Pal & { profile: Profile })[]>([]);
  const [localProfile, setLocalProfile] = useState<Profile | null>(null);
  const [editVisible, setEditVisible]  = useState(false);

  const userId  = session?.user.id ?? (__DEV__ ? '46bae3d3-2c18-450e-b267-f36b91a94a31' : null);
  const profile = localProfile ?? authProfile;

  useFocusEffect(useCallback(() => {
    if (!userId) return;
    Promise.all([getPals(userId), getProfile(userId), getLiveProfileStats(userId)])
      .then(([palsData, profileData, liveStats]) => {
        setPals(palsData);
        if (profileData) {
          setLocalProfile({ ...profileData, ...liveStats });
        }
      });
  }, [userId]));

  const userStats: UserStats = useMemo(() => profile ? {
    roundsPlayed:       profile.rounds_played,
    roundsHosted:       profile.rounds_hosted,
    palsMade:           profile.pals_count,
    currentStreakWeeks: profile.streak_weeks,
    coursesPlayed:      profile.courses_played,
    skinsWon:           profile.skins_won,
    earlyBirdRounds:    profile.early_bird_rounds,
    clubsJoined:        profile.clubs_joined,
    introductions:      profile.introductions,
    bestScore:          profile.best_score,
    biggestSkinsPot:    profile.biggest_skins_pot,
    connectors:         profile.connectors,
    rivalries:          profile.rivalries,
    regularGroupRounds: profile.regular_group_rounds,
    guestRounds:        profile.guest_rounds,
    largeRoundsHosted:  profile.large_rounds_hosted,
    uniqueGroupsHosted: profile.unique_groups_hosted,
    citiesPlayed:       profile.cities_played,
    reunions:           profile.reunions,
    eaglesMade:         profile.eagles_made,
    birdiesMade:        profile.birdies_made,
    glueRounds:         profile.glue_rounds,
    scorecardsKept:     profile.scorecards_kept,
    photosShared:       profile.photos_shared,
  } : FALLBACK_STATS, [profile]);

  const ALL_EARNED  = useMemo(() => computeEarnedBadges(userStats), [userStats]);
  const realPals    = pals.filter((p) => p.rounds_together > 0);
  const almostPals  = pals.filter((p) => p.rounds_together === 0);

  const displayName = profile?.name ?? 'You';
  const initials    = profile?.initials ?? displayName.slice(0, 2).toUpperCase();
  const location    = profile?.location ?? '';
  const bio         = profile?.bio ?? '';
  const instagram   = profile?.instagram_handle ?? '';
  const venmo       = profile?.venmo_handle ?? '';
  const snapchat    = profile?.snapchat_handle ?? '';

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.green }}>
        <TopBar
          right={
            <TouchableOpacity activeOpacity={0.7} onPress={() => setEditVisible(true)}>
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
          <View style={s.avatarInfoRow}>

            {/* Avatar with photo badge */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => Alert.alert('Profile photo', 'Coming soon — tap Edit to update your other info.')}
            >
              <View style={s.avatarWrap}>
                <Avatar
                  initials={initials}
                  bg={profile?.avatar_color ?? Colors.creamLight}
                  textColor={profile?.avatar_text_color ?? Colors.green}
                  size={88}
                  borderColor="rgba(216,214,175,0.3)"
                  borderWidth={2}
                  uri={profile?.avatar_url ?? null}
                />
                <View style={s.cameraBadge}>
                  <Text style={s.cameraIcon}>+</Text>
                </View>
              </View>
            </TouchableOpacity>

            <View style={s.userInfo}>
              <Text style={s.userName}>{displayName}</Text>

              {location ? <Text style={s.userSubline}>{location}</Text> : null}

              {/* Bio */}
              {bio ? (
                <Text style={s.userBio}>{bio}</Text>
              ) : (
                <TouchableOpacity activeOpacity={0.6} onPress={() => setEditVisible(true)}>
                  <Text style={s.emptyField}>Add a bio</Text>
                </TouchableOpacity>
              )}

              {/* Socials */}
              {(instagram || venmo || snapchat) ? (
                <View style={s.linksRow}>
                  {instagram ? (
                    <TouchableOpacity activeOpacity={0.7} onPress={() => Linking.openURL(`https://instagram.com/${instagram}`)}>
                      <Text style={s.linkChip}>Instagram</Text>
                    </TouchableOpacity>
                  ) : null}
                  {venmo ? (
                    <TouchableOpacity activeOpacity={0.7} onPress={() => Linking.openURL(`https://venmo.com/${venmo}`)}>
                      <Text style={s.linkChip}>Venmo</Text>
                    </TouchableOpacity>
                  ) : null}
                  {snapchat ? (
                    <TouchableOpacity activeOpacity={0.7} onPress={() => Linking.openURL(`https://snapchat.com/add/${snapchat}`)}>
                      <Text style={s.linkChip}>Snapchat</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : (
                <TouchableOpacity activeOpacity={0.6} onPress={() => setEditVisible(true)}>
                  <Text style={s.emptyField}>Add socials</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Stats bar */}
          <View style={s.statsBar}>
            {[
              { value: String(profile?.rounds_played ?? 0), label: 'rounds' },
              { value: String(profile?.rounds_hosted ?? 0), label: 'hosted' },
              { value: String(profile?.pals_count ?? 0),    label: 'pals' },
            ].map((stat, i, arr) => (
              <React.Fragment key={stat.label}>
                <View style={s.statItem}>
                  <Text style={s.statValue}>{stat.value}</Text>
                  <Text style={s.statLabel}>{stat.label}</Text>
                </View>
                {i < arr.length - 1 && <View style={s.statDivider} />}
              </React.Fragment>
            ))}
          </View>
        </View>

        {/* ── Drawer ── */}
        <View style={s.drawer}>
          <View style={s.handle} />

          {/* ── Badges ── */}
          <Text style={[s.sectionLabel, { marginBottom: 10 }]}>Badges</Text>
          <View style={s.badgeGrid}>
            {BADGE_DEFINITIONS
              .filter((d) => PROFILE_BADGE_IDS.includes(d.id))
              .sort((a, b) => PROFILE_BADGE_IDS.indexOf(a.id) - PROFILE_BADGE_IDS.indexOf(b.id))
              .map((defn) => {
                const earned = ALL_EARNED.find((e) => e.badgeId === defn.id)!;
                return <BadgeTile key={defn.id} defn={defn} earned={earned} />;
              })}
          </View>

          <View style={s.comingSoonRow}>
            <Text style={s.comingSoonText}>+ more badges (coming soon...)</Text>
          </View>

          {/* ── Pals ── */}
          <View style={[s.sectionRow, { marginTop: 28 }]}>
            <Text style={s.sectionLabel}>Pals</Text>
          </View>
          <View style={s.card}>
            {realPals.length === 0 ? (
              <View style={s.emptyPals}>
                <Text style={s.emptyPalsText}>Play a round to earn your first pal.</Text>
              </View>
            ) : (
              realPals.map((pal, i) => (
                <PalRow key={`${pal.user_a_id}-${pal.user_b_id}`} pal={pal} showBorder={i < realPals.length - 1} />
              ))
            )}
          </View>
          {almostPals.length > 0 && (
            <TouchableOpacity
              activeOpacity={0.6}
              style={s.missedLink}
              onPress={() => router.push('/missed-connections' as any)}
            >
              <Text style={s.missedLinkText}>...and some missed connections 👀</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            activeOpacity={0.7}
            style={{ marginTop: 32 }}
            onPress={() =>
              Alert.alert('Sign out', 'Are you sure?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
              ])
            }
          >
            <Text style={s.signOutLink}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {userId && (
        <EditProfileModal
          visible={editVisible}
          profile={profile}
          userId={userId}
          onSaved={(fresh) => setLocalProfile(fresh)}
          onClose={() => setEditVisible(false)}
        />
      )}
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
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
    gap: 20,
  },
  avatarInfoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 18,
  },
  avatarWrap: {
    width: 88,
    height: 88,
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.green,
  },
  cameraIcon: {
    fontSize: 13,
    color: Colors.green,
    fontFamily: Fonts.sansSemiBold,
    lineHeight: 16,
  },
  userInfo: {
    flex: 1,
    gap: 4,
    paddingTop: 4,
  },
  userName: {
    fontFamily: Fonts.serifMedium,
    fontSize: 30,
    color: Colors.cream,
    lineHeight: 34,
  },
  userSubline: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: 'rgba(216,214,175,0.6)',
  },
  userBio: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: 'rgba(216,214,175,0.8)',
    lineHeight: 18,
  },
  emptyField: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: 'rgba(216,214,175,0.35)',
    fontStyle: 'italic',
  },
  linksRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  linkChip: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: 'rgba(216,214,175,0.55)',
    backgroundColor: 'rgba(216,214,175,0.1)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  // Stats bar
  statsBar: {
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderRadius: 16,
    flexDirection: 'row',
    paddingVertical: 18,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontFamily: Fonts.serifMedium,
    fontSize: 32,
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
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 10,
    color: Colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },

  // Badges
  badgeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  badgeTile: {
    width: '31%',
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
    fontSize: 11,
    color: Colors.text,
    textAlign: 'center',
  },
  badgeSub: {
    fontFamily: Fonts.sans,
    fontSize: 9,
    color: Colors.muted,
    textAlign: 'center',
  },
  badgeLocked: { opacity: 0.35 },

  comingSoonRow: {
    alignItems: 'center',
    paddingVertical: 10,
    marginBottom: 4,
  },
  comingSoonText: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: Colors.muted,
  },

  // Pals
  card: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: Colors.border,
    paddingHorizontal: 14,
  },
  emptyPals: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyPalsText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: Colors.muted,
    textAlign: 'center',
  },
  palRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
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
  palAlmost: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: Colors.muted,
    fontStyle: 'italic',
  },

  missedLink: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 4,
  },
  missedLinkText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: Colors.muted,
    fontStyle: 'italic',
  },

  signOutLink: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: Colors.muted,
    textAlign: 'center',
    textDecorationLine: 'underline',
    paddingVertical: 8,
    marginBottom: 8,
  },
});

// ─── Edit modal styles ────────────────────────────────────────────────────────

const es = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  cancelBtn: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    color: Colors.muted,
    minWidth: 60,
  },
  title: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 15,
    color: Colors.text,
  },
  saveBtn: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 15,
    color: Colors.green,
    minWidth: 60,
    textAlign: 'right',
  },

  scroll: {
    paddingTop: 24,
    paddingHorizontal: 16,
  },

  photoSection: {
    alignItems: 'center',
    marginBottom: 32,
    gap: 6,
  },
  photoWrap: {
    width: 80,
    height: 80,
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.bg,
  },
  cameraIcon: {
    fontSize: 13,
  },
  photoLabel: {
    fontFamily: Fonts.sansMedium,
    fontSize: 14,
    color: Colors.green,
  },

  group: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    overflow: 'hidden',
  },
  groupLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 10,
    color: Colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    paddingTop: 12,
    paddingBottom: 6,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  fieldRowBorder: {
    borderTopWidth: 0.5,
    borderTopColor: Colors.border,
  },
  fieldLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    color: Colors.muted,
    width: 80,
  },
  fieldInput: {
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: 14,
    color: Colors.text,
  },
  bioInput: {
    minHeight: 72,
    textAlignVertical: 'top',
    paddingTop: 0,
  },
});
