import { useFocusEffect, useRouter } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Linking, Modal, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, runOnJS } from 'react-native-reanimated';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { TopBar } from '@/components/TopBar';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { BADGE_DEFINITIONS, computeEarnedBadges, type BadgeId, type BadgeDefinition, type EarnedBadgeTier, type UserStats } from '@/lib/badges';
import * as ImagePicker from 'expo-image-picker';
import { getPals, getProfile, getLiveProfileStats, updateProfile, uploadAvatar } from '@/lib/db';
import { useAuth } from '@/context/auth';
import type { Pal, Profile } from '@/lib/database.types';

// ─── Fallback while profile loads ─────────────────────────────────────────────

const FALLBACK_STATS: UserStats = {
  roundsPlayed: 0, roundsHosted: 0, palsMade: 0, currentStreakWeeks: 0,
  coursesPlayed: 0, skinsWon: 0, earlyBirdRounds: 0, clubsJoined: 0,
  introductions: 0, bestScore: null, biggestSkinsPot: 0, connectors: 0,
  rivalries: 0, regularGroupRounds: 0, guestRounds: 0, largeRounds: 0,
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
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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

function BadgeTile({ defn, earned, onPress, onLongPress, pinned, fullWidth }: {
  defn: (typeof BADGE_DEFINITIONS)[number];
  earned: ReturnType<typeof computeEarnedBadges>[number];
  onPress: () => void;
  onLongPress?: () => void;
  pinned?: boolean;
  fullWidth?: boolean;
}) {
  const hasEarned = earned.tierIndex >= 0;
  const descText = hasEarned
    ? defn.describe(earned.progress)
    : defn.describe(defn.tiers[0].threshold).replace(/\b\d+\b/, '_');
  const titleText = hasEarned ? earned.title : defn.tiers[0].title;

  if (defn.image) {
    return (
      <TouchableOpacity
        style={[s.badgeTilePatch, !hasEarned && s.badgeTilePatchLocked, fullWidth && { width: '100%' }]}
        onPress={onPress}
        onLongPress={onLongPress}
        activeOpacity={0.75}
      >
        <View style={s.badgePatchImgWrap}>
          <View style={[StyleSheet.absoluteFill, s.badgePatchBg]} />
          <ExpoImage
            source={defn.image}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
          />
          <View style={s.badgePatchTextArea}>
            <Text style={s.badgePatchTitle} numberOfLines={1}>{titleText}</Text>
            <Text style={s.badgePatchSub} numberOfLines={2}>{descText}</Text>
          </View>
          {pinned === true  && <View style={s.pinDot}><Text style={s.pinDotText}>✓</Text></View>}
          {pinned === false && <View style={[s.pinDot, s.pinDotEmpty]} />}
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[s.badgeTile, !hasEarned && s.badgeTileLocked]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.75}
    >
      <Text style={[s.badgeEmoji, !hasEarned && s.badgeLocked]}>{defn.emoji}</Text>
      <Text style={[s.badgeTitle, !hasEarned && s.badgeLocked]} numberOfLines={1}>
        {hasEarned ? earned.title : '–'}
      </Text>
      <Text style={[s.badgeSub, !hasEarned && s.badgeLocked]} numberOfLines={2}>
        {descText}
      </Text>
      {pinned === true  && <View style={s.pinDot}><Text style={s.pinDotText}>✓</Text></View>}
      {pinned === false && <View style={[s.pinDot, s.pinDotEmpty]} />}
    </TouchableOpacity>
  );
}

function PalProfileSheet({ pal, onClose, onBadgePress }: {
  pal: (Pal & { profile: Profile }) | null;
  onClose: () => void;
  onBadgePress: (defn: BadgeDefinition, earned: EarnedBadgeTier) => void;
}) {
  const insets = useSafeAreaInsets();
  if (!pal) return null;

  const p = pal.profile;
  const palStats: UserStats = {
    roundsPlayed:       p?.rounds_played        ?? 0,
    roundsHosted:       p?.rounds_hosted        ?? 0,
    palsMade:           p?.pals_count           ?? 0,
    currentStreakWeeks: p?.streak_weeks         ?? 0,
    coursesPlayed:      p?.courses_played       ?? 0,
    skinsWon:           p?.skins_won            ?? 0,
    earlyBirdRounds:    p?.early_bird_rounds    ?? 0,
    clubsJoined:        p?.clubs_joined         ?? 0,
    introductions:      p?.introductions        ?? 0,
    bestScore:          p?.best_score           ?? null,
    biggestSkinsPot:    p?.biggest_skins_pot    ?? 0,
    connectors:         p?.connectors           ?? 0,
    rivalries:          p?.rivalries            ?? 0,
    regularGroupRounds: p?.regular_group_rounds ?? 0,
    guestRounds:        p?.guest_rounds         ?? 0,
    largeRounds:        0,
    uniqueGroupsHosted: p?.unique_groups_hosted ?? 0,
    citiesPlayed:       p?.cities_played        ?? 0,
    reunions:           p?.reunions             ?? 0,
    eaglesMade:         p?.eagles_made          ?? 0,
    birdiesMade:        p?.birdies_made         ?? 0,
    glueRounds:         p?.glue_rounds          ?? 0,
    scorecardsKept:     p?.scorecards_kept      ?? 0,
    photosShared:       p?.photos_shared        ?? 0,
  };
  const palEarned = computeEarnedBadges(palStats);
  const displayName = p?.name ?? 'Player';
  const initials = p?.initials ?? displayName.slice(0, 2).toUpperCase();

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: Colors.green }}>
        <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.green }}>
          <View style={ps.topBar}>
            <View style={{ width: 60 }} />
            <Text style={ps.topBarTitle}>{displayName}</Text>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={{ width: 60, alignItems: 'flex-end' }}>
              <Text style={ps.doneBtn}>Done</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
          <View style={s.header}>
            <View style={s.avatarInfoRow}>
              <View style={s.avatarWrap}>
                <Avatar
                  initials={initials}
                  bg={p?.avatar_color ?? Colors.creamLight}
                  textColor={p?.avatar_text_color ?? Colors.green}
                  size={76}
                  borderColor="rgba(216,214,175,0.25)"
                  borderWidth={3}
                  uri={p?.avatar_url ?? null}
                />
              </View>
              <View style={s.userInfo}>
                <Text style={s.userName}>{displayName}</Text>
                {p?.location ? (
                  <View style={s.locationRow}>
                    <Text style={s.locationPin}>📍</Text>
                    <Text style={s.userSubline}>{p.location}</Text>
                  </View>
                ) : null}
                {p?.bio ? <Text style={s.userBio}>{p.bio}</Text> : null}
                {(p?.instagram_handle || p?.venmo_handle || p?.snapchat_handle) ? (
                  <View style={s.linksRow}>
                    {p.instagram_handle ? (
                      <TouchableOpacity activeOpacity={0.7} onPress={() => Linking.openURL(`https://instagram.com/${p.instagram_handle}`)}>
                        <View style={s.linkChip}>
                          <Text style={s.linkChipIcon}>📷</Text>
                          <Text style={s.linkChipText}>Instagram</Text>
                        </View>
                      </TouchableOpacity>
                    ) : null}
                    {p.venmo_handle ? (
                      <TouchableOpacity activeOpacity={0.7} onPress={() => Linking.openURL(`https://venmo.com/${p.venmo_handle}`)}>
                        <View style={s.linkChip}>
                          <Text style={s.linkChipIcon}>V</Text>
                          <Text style={s.linkChipText}>Venmo</Text>
                        </View>
                      </TouchableOpacity>
                    ) : null}
                    {p.snapchat_handle ? (
                      <TouchableOpacity activeOpacity={0.7} onPress={() => Linking.openURL(`https://snapchat.com/add/${p.snapchat_handle}`)}>
                        <View style={s.linkChip}>
                          <Text style={s.linkChipIcon}>👻</Text>
                          <Text style={s.linkChipText}>Snapchat</Text>
                        </View>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ) : null}
              </View>
            </View>

            <View style={s.statsCard}>
              {([
                { value: p?.rounds_played ?? 0, label: 'ROUNDS' },
                { value: p?.rounds_hosted ?? 0, label: 'HOSTED' },
                { value: p?.pals_count   ?? 0, label: 'PALS'   },
              ]).map((stat, i, arr) => (
                <React.Fragment key={stat.label}>
                  <View style={s.statsCol}>
                    <Text style={s.statsValue}>{stat.value}</Text>
                    <Text style={s.statsLabel}>{stat.label}</Text>
                  </View>
                  {i < arr.length - 1 && <View style={s.statsColDivider} />}
                </React.Fragment>
              ))}
            </View>
          </View>

          <View style={[s.drawer, { flex: 1, paddingBottom: insets.bottom + 40 }]}>
            <View style={s.handle} />

            <Text style={[s.sectionLabel, { marginBottom: 10 }]}>Badges</Text>
            <View style={s.badgeGrid}>
              {BADGE_DEFINITIONS.map((defn) => {
                  const earned = palEarned.find((e) => e.badgeId === defn.id)!;
                  return <BadgeTile key={defn.id} defn={defn} earned={earned} onPress={() => onBadgePress(defn, earned)} />;
                })}
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function PalRow({ pal, showBorder, onPress }: { pal: Pal & { profile: Profile }; showBorder: boolean; onPress?: () => void }) {
  const p = pal.profile;
  return (
    <TouchableOpacity style={[s.palRow, showBorder && s.palRowBorder]} onPress={onPress} activeOpacity={0.7}>
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
    </TouchableOpacity>
  );
}

// ─── Badge Manager Modal ─────────────────────────────────────────────────────

type DisplayItem = { key: string; defn: (typeof BADGE_DEFINITIONS)[number]; earned: ReturnType<typeof computeEarnedBadges>[number] };

// ─── Badge Display Grid (drag-to-reorder 3×2) ────────────────────────────────

const GRID_COLS = 3;
const GRID_GAP  = 8;

function BadgeDisplayGrid({
  items,
  onReorder,
  onItemPress,
  onRemove,
}: {
  items: DisplayItem[];
  onReorder: (ids: BadgeId[]) => void;
  onItemPress: (defn: BadgeDefinition, earned: EarnedBadgeTier) => void;
  onRemove: (id: BadgeId) => void;
}) {
  const [tileSize, setTileSize] = useState(0);
  const [order, setOrder]       = useState(items.map((i) => i.key));
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [targetIdx,   setTargetIdx]   = useState<number | null>(null);

  const floatL   = useSharedValue(0);
  const floatT   = useSharedValue(0);
  const isDrag   = useSharedValue(false);
  const tileSizeV = useSharedValue(0);
  const fromIdxV  = useSharedValue(-1);

  useEffect(() => {
    setOrder(items.map((i) => i.key));
  }, [items.map((i) => i.key).join(',')]);

  const calcIdx = (x: number, y: number, ts: number): number => {
    'worklet';
    const col = Math.max(0, Math.min(GRID_COLS - 1, Math.floor(x / (ts + GRID_GAP))));
    const row = Math.max(0, Math.min(1, Math.floor(y / (ts + GRID_GAP))));
    return row * GRID_COLS + col;
  };

  const finalize = (from: number, to: number, currentOrder: string[]) => {
    setDraggingIdx(null);
    setTargetIdx(null);
    if (from < 0 || from === to) return;
    const next = [...currentOrder];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setOrder(next);
    onReorder(next as BadgeId[]);
  };

  const pan = Gesture.Pan()
    .activateAfterLongPress(300)
    .onStart((e) => {
      const ts = tileSizeV.value;
      if (ts === 0) return;
      const idx = calcIdx(e.x, e.y, ts);
      fromIdxV.value = idx;
      floatL.value = e.x - ts / 2;
      floatT.value = e.y - ts / 2;
      isDrag.value = true;
      runOnJS(setDraggingIdx)(idx);
      runOnJS(setTargetIdx)(idx);
    })
    .onUpdate((e) => {
      const ts = tileSizeV.value;
      floatL.value = e.x - ts / 2;
      floatT.value = e.y - ts / 2;
      runOnJS(setTargetIdx)(calcIdx(e.x, e.y, ts));
    })
    .onEnd((e) => {
      const ts  = tileSizeV.value;
      const to  = calcIdx(e.x, e.y, ts);
      const from = fromIdxV.value;
      isDrag.value  = false;
      fromIdxV.value = -1;
      runOnJS(finalize)(from, to, order);
    })
    .onFinalize(() => {
      isDrag.value = false;
      runOnJS(setDraggingIdx)(null);
      runOnJS(setTargetIdx)(null);
    });

  const floatStyle = useAnimatedStyle(() => ({
    position: 'absolute' as const,
    left: floatL.value,
    top:  floatT.value,
    width:  tileSizeV.value,
    height: tileSizeV.value,
    opacity: isDrag.value ? 1 : 0,
    zIndex: 99,
    borderRadius: 12,
    overflow: 'hidden' as const,
    transform: [{ scale: 1.06 }],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 8,
  }));

  const orderedItems = order
    .map((id) => items.find((i) => i.key === id))
    .filter((i): i is DisplayItem => i != null);
  const draggingItem = draggingIdx !== null ? orderedItems[draggingIdx] : null;
  const emptyCount   = Math.max(0, 6 - orderedItems.length);

  return (
    <GestureDetector gesture={pan}>
      <View
        style={bm.displayGrid}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          const ts = (w - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;
          setTileSize(ts);
          tileSizeV.value = ts;
        }}
      >
        {orderedItems.map((item, idx) => {
          const isBeingDragged = draggingIdx === idx;
          const isTarget = targetIdx === idx && draggingIdx !== null && !isBeingDragged;
          const titleText = item.earned.tierIndex >= 0 ? item.earned.title : item.defn.tiers[0].title;
          const descText  = item.earned.tierIndex >= 0
            ? item.defn.describe(item.earned.progress)
            : item.defn.describe(item.defn.tiers[0].threshold).replace(/\b\d+\b/, '_');
          return (
            <TouchableOpacity
              key={item.key}
              style={[
                bm.displayGridTile,
                tileSize > 0 && { width: tileSize, height: tileSize },
                isBeingDragged && bm.displayGridTileDim,
                isTarget && bm.displayGridTileTarget,
              ]}
              onPress={() => onItemPress(item.defn, item.earned)}
              activeOpacity={0.8}
            >
              <View style={[StyleSheet.absoluteFill, { backgroundColor: Colors.bg }]} />
              <ExpoImage source={item.defn.image} style={StyleSheet.absoluteFill} contentFit="contain" />
              <View style={s.badgePatchTextArea}>
                <Text style={s.badgePatchTitle} numberOfLines={1}>{titleText}</Text>
                <Text style={s.badgePatchSub}   numberOfLines={2}>{descText}</Text>
              </View>
              <TouchableOpacity
                style={bm.removeDot}
                onPress={() => onRemove(item.key as BadgeId)}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Text style={bm.removeDotText}>×</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          );
        })}

        {Array.from({ length: emptyCount }, (_, i) => (
          <View key={`empty-${i}`} style={[bm.displayGridEmpty, tileSize > 0 && { width: tileSize, height: tileSize }]} />
        ))}

        {/* Floating ghost during drag */}
        <Animated.View style={floatStyle} pointerEvents="none">
          {draggingItem && (
            <>
              <View style={[StyleSheet.absoluteFill, { backgroundColor: Colors.bg }]} />
              <ExpoImage source={draggingItem.defn.image} style={StyleSheet.absoluteFill} contentFit="contain" />
              <View style={s.badgePatchTextArea}>
                <Text style={s.badgePatchTitle} numberOfLines={1}>
                  {draggingItem.earned.tierIndex >= 0 ? draggingItem.earned.title : draggingItem.defn.tiers[0].title}
                </Text>
                <Text style={s.badgePatchSub} numberOfLines={2}>
                  {draggingItem.earned.tierIndex >= 0
                    ? draggingItem.defn.describe(draggingItem.earned.progress)
                    : draggingItem.defn.describe(draggingItem.defn.tiers[0].threshold).replace(/\b\d+\b/, '_')}
                </Text>
              </View>
            </>
          )}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

function BadgeManagerModal({
  visible,
  allEarned,
  pinnedIds,
  onChangePinned,
  onBadgeTap,
  onClose,
}: {
  visible: boolean;
  allEarned: ReturnType<typeof computeEarnedBadges>;
  pinnedIds: BadgeId[];
  onChangePinned: (ids: BadgeId[]) => void;
  onBadgeTap: (defn: BadgeDefinition, earned: EarnedBadgeTier) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const imageBadges = BADGE_DEFINITIONS.filter((d) => d.image);

  const displayItems: DisplayItem[] = pinnedIds
    .map((id) => ({
      key: id,
      defn: imageBadges.find((d) => d.id === id)!,
      earned: allEarned.find((e) => e.badgeId === id)!,
    }))
    .filter((item) => item.defn && item.earned);

  const earnedNotDisplayed = imageBadges.filter(
    (d) =>
      (allEarned.find((e) => e.badgeId === d.id)?.tierIndex ?? -1) >= 0 &&
      !pinnedIds.includes(d.id as BadgeId),
  );
  const lockedDefs = imageBadges.filter(
    (d) => (allEarned.find((e) => e.badgeId === d.id)?.tierIndex ?? -1) < 0,
  );

  const addToDisplay = (id: BadgeId) => {
    if (pinnedIds.length < 6) onChangePinned([...pinnedIds, id]);
  };
  const removeFromDisplay = (id: BadgeId) => {
    onChangePinned(pinnedIds.filter((p) => p !== id));
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={[bm.root, { paddingTop: insets.top }]}>

          {/* Header */}
          <View style={bm.header}>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={bm.closeBtn}>
              <Text style={bm.closeBtnText}>✕</Text>
            </TouchableOpacity>
            <Text style={bm.title}>Badges</Text>
            <View style={{ width: 36 }} />
          </View>

          {/* Display on Profile — drag-to-reorder 3×2 grid */}
          <View style={bm.displayBox}>
            <View style={bm.displayBoxHeader}>
              <Text style={bm.displayBoxLabel}>DISPLAY ON PROFILE</Text>
              <Text style={bm.displayBoxCount}>{pinnedIds.length} / 6</Text>
            </View>
            <BadgeDisplayGrid
              items={displayItems}
              onReorder={onChangePinned}
              onItemPress={onBadgeTap}
              onRemove={removeFromDisplay}
            />
          </View>

          {/* Scrollable earned + locked */}
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[bm.scroll, { paddingBottom: insets.bottom + 24 }]}
            showsVerticalScrollIndicator={false}
          >
            {earnedNotDisplayed.length > 0 && (
              <>
                <Text style={bm.sectionLabel}>YOUR BADGES</Text>
                <View style={bm.grid}>
                  {earnedNotDisplayed.map((defn) => {
                    const earned = allEarned.find((e) => e.badgeId === defn.id)!;
                    return (
                      <View key={defn.id} style={bm.gridItemWrap}>
                        <BadgeTile defn={defn} earned={earned} fullWidth onPress={() => onBadgeTap(defn, earned)} />
                        {pinnedIds.length < 6 && (
                          <TouchableOpacity style={bm.addBtn} onPress={() => addToDisplay(defn.id as BadgeId)}>
                            <Text style={bm.addBtnText}>+</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}
                </View>
              </>
            )}

            {lockedDefs.length > 0 && (
              <>
                <Text style={[bm.sectionLabel, { marginTop: earnedNotDisplayed.length > 0 ? 24 : 0 }]}>LOCKED</Text>
                <View style={[bm.grid, { opacity: 0.35 }]}>
                  {lockedDefs.map((defn) => {
                    const earned = allEarned.find((e) => e.badgeId === defn.id)!;
                    return (
                      <View key={defn.id} style={bm.gridItemWrap}>
                        <BadgeTile defn={defn} earned={earned} fullWidth onPress={() => onBadgeTap(defn, earned)} />
                      </View>
                    );
                  })}
                </View>
              </>
            )}

            <View style={bm.comingSoon}>
              <Text style={bm.comingSoonText}>✨  New badges coming soon</Text>
            </View>
          </ScrollView>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

// ─── Badge Detail Modal ───────────────────────────────────────────────────────

function BadgeDetailModal({ defn, earned, onClose }: {
  defn: BadgeDefinition | null;
  earned: EarnedBadgeTier | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  if (!defn || !earned) return null;

  const hasEarned = earned.tierIndex >= 0;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={m.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={[m.sheet, { paddingBottom: insets.bottom + 20 }]}>
        <View style={m.handle} />

        {/* Badge image + identity */}
        <View style={m.imageRow}>
          {defn.image ? (
            <View style={[m.imageWrap, !hasEarned && m.imageWrapLocked]}>
              <View style={[StyleSheet.absoluteFill, { backgroundColor: Colors.bg }]} />
              <ExpoImage source={defn.image} style={StyleSheet.absoluteFill} contentFit="contain" />
            </View>
          ) : (
            <Text style={m.emoji}>{defn.emoji}</Text>
          )}
          <View style={m.imageInfo}>
            <Text style={m.badgeName}>{defn.name}</Text>
            {defn.statNote && (
              <Text style={m.statNote}>{defn.statNote}</Text>
            )}
            {!hasEarned && <Text style={m.lockedDesc}>Not yet earned</Text>}
            <Text style={m.flavorText}>{defn.flavorText}</Text>
          </View>
        </View>

        {/* Tier progression */}
        <Text style={m.progressionLabel}>PROGRESSION</Text>
        <ScrollView showsVerticalScrollIndicator={false} style={m.tierScroll}>
          {defn.tiers.map((tier, i) => {
            const isPast    = hasEarned && i < earned.tierIndex;
            const isCurrent = hasEarned && i === earned.tierIndex;
            const isFuture  = !isCurrent && !isPast;
            return (
              <View key={tier.title} style={[m.tierRow, isCurrent && m.tierRowCurrent]}>
                <View style={m.tierIconWrap}>
                  {isPast    && <Text style={m.tierCheck}>✓</Text>}
                  {isCurrent && <View style={m.tierDot} />}
                  {isFuture  && <View style={m.tierLockDot} />}
                </View>
                <View style={m.tierTexts}>
                  <Text style={[m.tierTitle, isFuture && m.tierFaded]}>{tier.title}</Text>
                  <Text style={[m.tierDesc, isFuture && m.tierFaded]}>{defn.describe(tier.threshold)}</Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
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
  const [menuVisible, setMenuVisible]  = useState(false);
  const [selectedPal, setSelectedPal]  = useState<(Pal & { profile: Profile }) | null>(null);
  const [badgeDetail, setBadgeDetail]  = useState<{ defn: BadgeDefinition; earned: EarnedBadgeTier } | null>(null);
  const [pinnedBadgeIds, setPinnedBadgeIds] = useState<BadgeId[] | null>(null);
  const [badgeManagerVisible, setBadgeManagerVisible] = useState(false);

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
    largeRounds:        profile.large_rounds_hosted ?? 0,
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

  const imageBadgeIds = useMemo(
    () => new Set(BADGE_DEFINITIONS.filter((d) => d.image).map((d) => d.id)),
    [],
  );

  const effectivePinnedIds = useMemo<BadgeId[]>(() => {
    if (pinnedBadgeIds !== null) return pinnedBadgeIds;
    return ALL_EARNED
      .filter((e) => e.tierIndex >= 0 && imageBadgeIds.has(e.badgeId))
      .slice(0, 6)
      .map((e) => e.badgeId as BadgeId);
  }, [pinnedBadgeIds, ALL_EARNED, imageBadgeIds]);

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
            <TouchableOpacity activeOpacity={0.7} onPress={() => setMenuVisible(true)}>
              <Text style={s.hamburger}>≡</Text>
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

            {/* Avatar with pencil edit badge */}
            <TouchableOpacity activeOpacity={0.85} onPress={() => setEditVisible(true)}>
              <View style={s.avatarWrap}>
                <Avatar
                  initials={initials}
                  bg={profile?.avatar_color ?? Colors.creamLight}
                  textColor={profile?.avatar_text_color ?? Colors.green}
                  size={76}
                  borderColor="rgba(216,214,175,0.25)"
                  borderWidth={3}
                  uri={profile?.avatar_url ?? null}
                />
                <View style={s.editBadge}>
                  <Text style={s.editBadgePlus}>+</Text>
                </View>
              </View>
            </TouchableOpacity>

            <View style={s.userInfo}>
              <Text style={s.userName}>{displayName}</Text>

              {location ? (
                <View style={s.locationRow}>
                  <Text style={s.locationPin}>📍</Text>
                  <Text style={s.userSubline}>{location}</Text>
                </View>
              ) : null}

              {bio ? (
                <Text style={s.userBio}>{bio}</Text>
              ) : (
                <TouchableOpacity activeOpacity={0.6} onPress={() => setEditVisible(true)}>
                  <Text style={s.emptyField}>Add a bio</Text>
                </TouchableOpacity>
              )}

              {(instagram || venmo || snapchat) ? (
                <View style={s.linksRow}>
                  {instagram ? (
                    <TouchableOpacity activeOpacity={0.7} onPress={() => Linking.openURL(`https://instagram.com/${instagram}`)}>
                      <View style={s.linkChip}>
                        <Text style={s.linkChipIcon}>📷</Text>
                        <Text style={s.linkChipText}>Instagram</Text>
                      </View>
                    </TouchableOpacity>
                  ) : null}
                  {venmo ? (
                    <TouchableOpacity activeOpacity={0.7} onPress={() => Linking.openURL(`https://venmo.com/${venmo}`)}>
                      <View style={s.linkChip}>
                        <Text style={s.linkChipIcon}>V</Text>
                        <Text style={s.linkChipText}>Venmo</Text>
                      </View>
                    </TouchableOpacity>
                  ) : null}
                  {snapchat ? (
                    <TouchableOpacity activeOpacity={0.7} onPress={() => Linking.openURL(`https://snapchat.com/add/${snapchat}`)}>
                      <View style={s.linkChip}>
                        <Text style={s.linkChipIcon}>👻</Text>
                        <Text style={s.linkChipText}>Snapchat</Text>
                      </View>
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

          {/* Stats card in green */}
          <View style={s.statsCard}>
            {([
              { value: profile?.rounds_played ?? 0, label: 'ROUNDS' },
              { value: profile?.rounds_hosted ?? 0, label: 'HOSTED' },
              { value: profile?.pals_count   ?? 0, label: 'PALS'   },
            ]).map((stat, i, arr) => (
              <React.Fragment key={stat.label}>
                <View style={s.statsCol}>
                  <Text style={s.statsValue}>{stat.value}</Text>
                  <Text style={s.statsLabel}>{stat.label}</Text>
                </View>
                {i < arr.length - 1 && <View style={s.statsColDivider} />}
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
            {effectivePinnedIds.map((id) => {
              const defn = BADGE_DEFINITIONS.find((d) => d.id === id);
              const earned = ALL_EARNED.find((e) => e.badgeId === id);
              if (!defn || !earned) return null;
              return <BadgeTile key={id} defn={defn} earned={earned} onPress={() => setBadgeDetail({ defn, earned })} />;
            })}
          </View>

          <TouchableOpacity style={s.moreBadgesRow} activeOpacity={0.7} onPress={() => setBadgeManagerVisible(true)}>
            <Text style={s.moreBadgesText}>+ {BADGE_DEFINITIONS.filter((d) => d.image).length - effectivePinnedIds.length} more</Text>
          </TouchableOpacity>

          {/* ── Pals ── */}
          <View style={[s.sectionRow, { marginTop: 14 }]}>
            <Text style={s.sectionLabel}>Pals</Text>
          </View>
          <View style={s.card}>
            {realPals.length === 0 ? (
              <View style={s.emptyPals}>
                <Text style={s.emptyPalsText}>Play a round to earn your first pal.</Text>
              </View>
            ) : (
              realPals.map((pal, i) => (
                <PalRow
                  key={`${pal.user_a_id}-${pal.user_b_id}`}
                  pal={pal}
                  showBorder={i < realPals.length - 1}
                  onPress={() => setSelectedPal(pal)}
                />
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

        </View>
      </ScrollView>

      <PalProfileSheet pal={selectedPal} onClose={() => setSelectedPal(null)} onBadgePress={(defn, earned) => setBadgeDetail({ defn, earned })} />

      <BadgeManagerModal
        visible={badgeManagerVisible}
        allEarned={ALL_EARNED}
        pinnedIds={effectivePinnedIds}
        onChangePinned={(ids) => setPinnedBadgeIds(ids)}
        onBadgeTap={(defn, earned) => setBadgeDetail({ defn, earned })}
        onClose={() => setBadgeManagerVisible(false)}
      />

      <BadgeDetailModal
        defn={badgeDetail?.defn ?? null}
        earned={badgeDetail?.earned ?? null}
        onClose={() => setBadgeDetail(null)}
      />

      {userId && (
        <EditProfileModal
          visible={editVisible}
          profile={profile}
          userId={userId}
          onSaved={(fresh) => setLocalProfile(fresh)}
          onClose={() => setEditVisible(false)}
        />
      )}

      {/* ── Hamburger menu ── */}
      <Modal visible={menuVisible} transparent animationType="slide" onRequestClose={() => setMenuVisible(false)}>
        <View style={s.menuOverlay}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setMenuVisible(false)} activeOpacity={1} />
          <View style={[s.menuSheet, { paddingBottom: Math.max(insets.bottom, 24) }]}>
            <View style={s.menuHandle} />

            {[
              { label: 'Edit profile', onPress: () => { setMenuVisible(false); setEditVisible(true); } },
              { label: 'Account status', onPress: () => {} },
              { label: 'Help', onPress: () => {} },
              { label: 'Privacy', onPress: () => {} },
            ].map((item, i, arr) => (
              <TouchableOpacity
                key={item.label}
                style={[s.menuItem, i < arr.length - 1 && s.menuItemBorder]}
                onPress={item.onPress}
                activeOpacity={0.7}
              >
                <Text style={s.menuItemText}>{item.label}</Text>
              </TouchableOpacity>
            ))}

            <View style={s.menuDivider} />

            <TouchableOpacity
              style={s.menuItem}
              activeOpacity={0.7}
              onPress={() => {
                setMenuVisible(false);
                Alert.alert('Sign out', 'Are you sure?', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
                ]);
              }}
            >
              <Text style={[s.menuItemText, s.menuItemDestructive]}>Sign out</Text>
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

  hamburger: {
    fontFamily: Fonts.sans,
    fontSize: 42,
    color: Colors.cream,
    lineHeight: 42,
  },

  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  menuSheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
  },
  menuHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: 12,
  },
  menuItem: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  menuItemBorder: {
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  menuItemText: {
    fontFamily: Fonts.sans,
    fontSize: 16,
    color: Colors.text,
  },
  menuItemDestructive: {
    color: '#c0392b',
  },
  menuDivider: {
    height: 8,
    backgroundColor: Colors.bg,
    marginVertical: 4,
  },

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
    paddingBottom: 28,
  },
  avatarInfoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 18,
  },
  avatarWrap: {
    width: 76,
    height: 76,
  },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.green,
  },
  editBadgePlus: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 15,
    color: Colors.green,
    lineHeight: 18,
  },
  userInfo: {
    flex: 1,
    gap: 5,
    paddingTop: 4,
  },
  userName: {
    fontFamily: Fonts.serifMedium,
    fontSize: 32,
    color: Colors.cream,
    lineHeight: 36,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  locationPin: { fontSize: 11 },
  userSubline: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: 'rgba(216,214,175,0.7)',
  },
  userBio: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: 'rgba(216,214,175,0.85)',
    lineHeight: 19,
  },
  emptyField: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: 'rgba(216,214,175,0.35)',
    fontStyle: 'italic',
  },
  linksRow: {
    flexDirection: 'row',
    gap: 5,
    marginTop: 2,
  },
  linkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(216,214,175,0.35)',
    backgroundColor: 'rgba(216,214,175,0.08)',
  },
  linkChipIcon: {
    fontSize: 10,
    color: 'rgba(216,214,175,0.7)',
  },
  linkChipText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 11,
    color: 'rgba(216,214,175,0.8)',
  },

  // Stats card (in green header)
  statsCard: {
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderRadius: 16,
    flexDirection: 'row',
    marginTop: 16,
    overflow: 'hidden',
  },
  statsCol: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    gap: 2,
  },
  statsColDivider: {
    width: 0.5,
    backgroundColor: 'rgba(216,214,175,0.2)',
    marginVertical: 12,
  },
  statsValue: {
    fontFamily: Fonts.serifMedium,
    fontSize: 28,
    color: Colors.cream,
    lineHeight: 32,
  },
  statsLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 9,
    color: 'rgba(216,214,175,0.65)',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
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
    borderWidth: 1.5,
    borderColor: Colors.green,
    paddingVertical: 3,
    paddingHorizontal: 10,
    alignItems: 'center',
    gap: 1,
  },
  badgeTileLocked: {
    backgroundColor: Colors.creamLight,
    borderColor: Colors.border,
  },
  badgeEmoji: { fontSize: 18 },
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

  badgeTilePatch: {
    width: '31%',
  },
  badgeTilePatchLocked: {
    opacity: 0.35,
  },
  badgePatchImgWrap: {
    width: '100%',
    aspectRatio: 1,
  },
  badgePatchBg: {
    backgroundColor: Colors.bg,
  },
  badgePatchTextArea: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: '22%',
    paddingHorizontal: '5%',
    alignItems: 'center',
    gap: 2,
  },
  badgePatchTitle: {
    fontFamily: Fonts.sansMedium,
    fontSize: 10,
    color: Colors.text,
    textAlign: 'center',
  },
  badgePatchSub: {
    fontFamily: Fonts.sans,
    fontSize: 8,
    color: Colors.muted,
    textAlign: 'center',
  },

  moreBadgesRow: {
    alignItems: 'center',
    paddingVertical: 10,
    marginBottom: 4,
  },
  moreBadgesText: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: Colors.muted,
  },

  pinDot: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinDotEmpty: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  pinDotText: {
    fontSize: 10,
    color: Colors.cream,
    fontFamily: Fonts.sansMedium,
  },

  // Pals
  card: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.green,
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

// ─── Pal profile sheet styles ─────────────────────────────────────────────────

const ps = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  topBarTitle: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 15,
    color: Colors.cream,
  },
  doneBtn: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 15,
    color: Colors.cream,
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

// ─── Badge Detail Modal Styles ─────────────────────────────────────────────────

const m = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: '85%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: 20,
  },

  imageRow: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
    marginBottom: 20,
  },
  imageWrap: {
    width: 146,
    height: 146,
    flexShrink: 0,
  },
  imageWrapLocked: {
    opacity: 0.35,
  },
  emoji: {
    fontSize: 64,
    width: 110,
    textAlign: 'center',
  },
  imageInfo: {
    flex: 1,
    gap: 4,
  },
  badgeName: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 16,
    color: Colors.text,
  },
  statNote: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    color: Colors.muted,
    marginTop: 1,
    marginBottom: 4,
  },
  earnedTitle: {
    fontFamily: Fonts.sansMedium,
    fontSize: 13,
    color: Colors.text,
    marginTop: 2,
  },
  lockedDesc: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: Colors.muted,
    fontStyle: 'italic',
    marginBottom: 4,
  },
  flavorText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: Colors.text,
    lineHeight: 19,
    marginTop: 6,
  },

  progressionLabel: {
    fontFamily: Fonts.sansMedium,
    fontSize: 11,
    color: Colors.muted,
    letterSpacing: 1,
    marginBottom: 10,
  },
  tierScroll: {
    flexGrow: 0,
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 9,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  tierRowCurrent: {
    backgroundColor: Colors.creamLight,
    marginHorizontal: -20,
    paddingHorizontal: 20,
  },
  tierIconWrap: {
    width: 20,
    alignItems: 'center',
  },
  tierCheck: {
    fontFamily: Fonts.sansMedium,
    fontSize: 13,
    color: Colors.green,
  },
  tierDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.green,
  },
  tierLockDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  tierTexts: {
    flex: 1,
    gap: 1,
  },
  tierTitle: {
    fontFamily: Fonts.sansMedium,
    fontSize: 14,
    color: Colors.text,
  },
  tierDesc: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: Colors.muted,
  },
  tierFaded: {
    opacity: 0.45,
  },
});

// ─── Badge Manager StyleSheet ─────────────────────────────────────────────────

const bm = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 0.5, borderBottomColor: Colors.border,
  },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.creamLight, alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText: { fontFamily: Fonts.sans, fontSize: 14, color: Colors.text },
  title: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: Colors.text },

  // ── Display on Profile box ───────────────────────────────────────────────────
  displayBox: {
    backgroundColor: Colors.creamLight,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
  },
  displayBoxHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 10,
  },
  displayBoxLabel: {
    fontFamily: Fonts.sansMedium, fontSize: 11, color: Colors.muted, letterSpacing: 1,
  },
  displayBoxCount: {
    fontFamily: Fonts.sans, fontSize: 12, color: Colors.muted,
  },
  displayGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP,
    overflow: 'visible',
  },
  displayGridTile: {
    borderRadius: 12, overflow: 'hidden',
    borderWidth: 1.5, borderColor: Colors.green,
  },
  displayGridTileDim: {
    opacity: 0.25,
  },
  displayGridTileTarget: {
    borderWidth: 2.5, borderColor: Colors.green,
    shadowColor: Colors.green, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 6,
    elevation: 4,
  },
  displayGridEmpty: {
    borderRadius: 12,
    borderWidth: 1.5, borderColor: Colors.border,
    borderStyle: 'dashed',
    backgroundColor: 'transparent',
  },
  removeDot: {
    position: 'absolute', top: 4, right: 4,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },
  removeDotText: {
    fontFamily: Fonts.sans, fontSize: 12, color: '#fff', lineHeight: 16,
  },

  // ── Scrollable section ───────────────────────────────────────────────────────
  scroll: { padding: 16 },

  sectionLabel: {
    fontFamily: Fonts.sansMedium, fontSize: 11, color: Colors.muted,
    letterSpacing: 1, marginBottom: 12,
  },

  grid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4,
  },
  gridItemWrap: {
    width: '31%', position: 'relative',
  },
  addBtn: {
    position: 'absolute', top: 5, right: 5, zIndex: 10,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.green, alignItems: 'center', justifyContent: 'center',
  },
  addBtnText: {
    fontFamily: Fonts.sansSemiBold, fontSize: 15, color: Colors.cream, lineHeight: 20,
  },

  comingSoon: {
    alignItems: 'center', paddingVertical: 24, marginTop: 8,
  },
  comingSoonText: {
    fontFamily: Fonts.sans, fontSize: 13, color: Colors.muted,
  },
});
