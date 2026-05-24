import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { TopBar } from '@/components/TopBar';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { DEFAULT_COVER, PRESET_IMAGES } from '@/constants/presetImages';
import { PRESET_GIFS } from '@/constants/presetGifs';
import { CoverPickerModal } from '@/components/CoverPickerModal';
import { useAuth } from '@/context/auth';
import { bulkInviteToRound, createRound, getClubWithMembers } from '@/lib/db';
import { pollStore } from '@/lib/pollStore';
import { locationStore } from '@/lib/locationStore';
import type { Club, RoundFormat } from '@/lib/database.types';

// ─── Smart defaults ───────────────────────────────────────────────────────────

function comingSaturday(): Date {
  const d = new Date();
  const daysUntil = d.getDay() === 6 ? 0 : (6 - d.getDay());
  d.setDate(d.getDate() + daysUntil);
  d.setHours(0, 0, 0, 0);
  return d;
}

function defaultTeeTime(): Date {
  const d = new Date();
  d.setHours(8, 0, 0, 0);
  return d;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAIN_FORMATS: { label: string; value: RoundFormat }[] = [
  { label: 'Stroke play', value: 'stroke' },
  { label: 'Match play',  value: 'match' },
  { label: 'Stableford', value: 'stableford' },
  { label: 'Skins',      value: 'skins' },
];

const FORMAT_DISPLAY: Record<RoundFormat, string> = {
  stroke: 'Stroke play', match: 'Match play', stableford: 'Stableford',
  skins: 'Skins', best_ball: 'Best ball', other: 'Other',
};

// ─── Video cover preview ─────────────────────────────────────────────────────

function VideoCoverPreview({ source, style }: { source: string; style: object }) {
  const player = useVideoPlayer(source, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return <VideoView player={player} style={style} contentFit="cover" nativeControls={false} />;
}


// ─── Bottom sheet wrapper ─────────────────────────────────────────────────────

function PickerSheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <TouchableOpacity style={{ flex: 1 }} onPress={onClose} activeOpacity={1} />
        <View style={s.sheet}>
          <View style={s.sheetHeader}>
            {title ? <Text style={s.sheetTitle}>{title}</Text> : <View />}
            <TouchableOpacity onPress={onClose}>
              <Text style={s.sheetDone}>Done</Text>
            </TouchableOpacity>
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}

// ─── Format picker (two-panel horizontal slide) ───────────────────────────────

function FormatPickerContent({
  selected,
  slideAnim,
  onSelect,
}: {
  selected: RoundFormat | null;
  slideAnim: Animated.Value;
  onSelect: (f: RoundFormat) => void;
}) {
  const { width } = useWindowDimensions();

  function goToOther() {
    Animated.timing(slideAnim, { toValue: -width, duration: 220, useNativeDriver: true }).start();
  }
  function goBack() {
    Animated.timing(slideAnim, { toValue: 0, duration: 220, useNativeDriver: true }).start();
  }

  return (
    <View style={{ overflow: 'hidden' }}>
      <Animated.View style={{ flexDirection: 'row', width: width * 2, transform: [{ translateX: slideAnim }] }}>

        {/* Panel 1 — main formats */}
        <View style={{ width }}>
          <View style={s.formatList}>
            {MAIN_FORMATS.map((f, i) => (
              <TouchableOpacity
                key={f.value}
                style={[s.formatOption, i < MAIN_FORMATS.length && s.formatOptionBorder]}
                onPress={() => onSelect(f.value)}
                activeOpacity={0.7}
              >
                <Text style={[s.formatOptionText, selected === f.value && s.formatOptionActive]}>{f.label}</Text>
                {selected === f.value && <Text style={s.checkmark}>✓</Text>}
              </TouchableOpacity>
            ))}
            {/* Other → navigation row */}
            <TouchableOpacity style={s.formatOption} onPress={goToOther} activeOpacity={0.7}>
              <Text style={s.formatOptionText}>Other</Text>
              <Text style={s.formatChevron}>›</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Panel 2 — other formats */}
        <View style={{ width }}>
          <View style={s.formatList}>
            {/* Back nav */}
            <TouchableOpacity style={[s.formatOption, s.formatOptionBorder]} onPress={goBack} activeOpacity={0.7}>
              <Text style={s.formatBackText}>‹ Back</Text>
            </TouchableOpacity>
            {/* Best Ball */}
            <TouchableOpacity
              style={[s.formatOption, s.formatOptionBorder]}
              onPress={() => onSelect('best_ball')}
              activeOpacity={0.7}
            >
              <Text style={[s.formatOptionText, selected === 'best_ball' && s.formatOptionActive]}>Best Ball</Text>
              {selected === 'best_ball' && <Text style={s.checkmark}>✓</Text>}
            </TouchableOpacity>
            {/* Practice / Range — stub */}
            <TouchableOpacity style={[s.formatOption, s.formatOptionBorder]} activeOpacity={1} disabled>
              <Text style={s.formatOptionDim}>Practice / Range</Text>
              <Text style={s.formatComingSoon}>Coming soon</Text>
            </TouchableOpacity>
            {/* Custom — stub */}
            <TouchableOpacity style={s.formatOption} activeOpacity={1} disabled>
              <Text style={s.formatOptionDim}>Custom</Text>
              <Text style={s.formatComingSoon}>Coming soon</Text>
            </TouchableOpacity>
          </View>
        </View>

      </Animated.View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

const DEFAULT_PARS = [4,4,3,4,5,3,4,5,4, 4,3,4,5,4,3,5,4,4];


export default function CreateScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session, profile } = useAuth();
  const userId = session?.user.id ?? (__DEV__ ? '46bae3d3-2c18-450e-b267-f36b91a94a31' : null);
  const { club_id: clubIdParam } = useLocalSearchParams<{ club_id?: string }>();
  const [saving, setSaving] = useState(false);
  const [sourceClub, setSourceClub] = useState<Club | null>(null);

  const [eventName, setEventName] = useState('The Next Round');
  const [coverImage, setCoverImage] = useState<string>(DEFAULT_COVER);
  const [coverIsVideo, setCoverIsVideo] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [date, setDate] = useState<Date | null>(null);
  const [time, setTime] = useState<Date | null>(null);
  const [courseName, setCourseName] = useState('');
  const [selectedFormat, setSelectedFormat] = useState<RoundFormat | null>(null);
  const formatSlide = useRef(new Animated.Value(0)).current;
  const [spots, setSpots] = useState(4);
  const [cost, setCost] = useState('');
  const [pollGuests, setPollGuests] = useState(false);
  const [note, setNote] = useState('');

  // Sync state back from standalone screens on return
  useFocusEffect(
    useCallback(() => {
      setPollGuests(pollStore.isActive());
      const loc = locationStore.get();
      if (loc) setCourseName(loc);
    }, [])
  );

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showFormatModal, setShowFormatModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showCourseSearch, setShowCourseSearch] = useState(false);

  useEffect(() => {
    if (!clubIdParam) return;
    getClubWithMembers(clubIdParam).then((club) => {
      if (club) setSourceClub(club);
    });
  }, [clubIdParam]);

  const fmtDate = (d: Date) =>
    d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const fmtTime = (d: Date) =>
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  const metaPreview = [
    date ? fmtDate(date) : 'Date TBD',
    time ? fmtTime(time) : null,
    selectedFormat !== null ? FORMAT_DISPLAY[selectedFormat] : null,
    `${spots} spots`,
  ]
    .filter(Boolean)
    .join(' · ');

  const onDateChange = (_: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (selected) setDate(selected);
  };

  const onTimeChange = (_: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') setShowTimePicker(false);
    if (selected) setTime(selected);
  };

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.green }}>
        <TopBar
          left={
            <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
              <Text style={s.cancelBtn}>Cancel</Text>
            </TouchableOpacity>
          }
          right={
            sourceClub
              ? <Text style={s.topBarLabel}>{sourceClub.name}</Text>
              : <Text style={s.topBarLabel}>New round</Text>
          }
        />
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xxl }}
      >
        {/* ── Green header ── */}
        <View style={s.header}>
          {/* Editable event name */}
          <TextInput
            style={[s.eventName, eventName === 'The Next Round' && s.eventNameDim]}
            value={eventName}
            onChangeText={setEventName}
            returnKeyType="done"
            selectTextOnFocus
          />
          {eventName === 'The Next Round' && (
            <Text style={s.renameHint}>Tap to rename</Text>
          )}

          {/* Square cover preview — tap to open full picker */}
          <TouchableOpacity
            style={s.coverPreview}
            onPress={() => setShowPicker(true)}
            activeOpacity={0.92}
          >
            {coverIsVideo
              ? <VideoCoverPreview source={coverImage} style={s.coverImg} />
              : <Image source={coverImage} style={s.coverImg} contentFit="cover" />
            }
            <View style={s.coverEditBadge}>
              <Text style={s.coverEditText}>✏ Change</Text>
            </View>
          </TouchableOpacity>

          {/* Thumbnail strip — quick swap without opening modal */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={s.thumbStrip}
            contentContainerStyle={s.thumbStripContent}
          >
            {PRESET_IMAGES.map((img) => (
              <TouchableOpacity
                key={img.id}
                onPress={() => { setCoverImage(img.source); setCoverIsVideo(false); }}
                activeOpacity={0.8}
                style={[s.thumb, coverImage === img.source && s.thumbSelected]}
              >
                <Image source={img.source} style={s.thumbImg} contentFit="cover" />
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* ── Drawer ── */}
        <View style={s.drawer}>
          <View style={s.handle} />

          {/* Date & tee time — hidden when polling */}
          {!pollGuests && (
            <View style={s.fieldStack}>
              <TouchableOpacity onPress={() => setShowDatePicker(true)} activeOpacity={0.7}>
                <View style={s.fieldRow}>
                  <Text style={s.fieldLabel}>Date</Text>
                  <Text style={date ? s.fieldValue : s.fieldValueDim}>
                    {date ? fmtDate(date) : 'Pick a date'}
                  </Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowTimePicker(true)} activeOpacity={0.7}>
                <View style={[s.fieldRow, s.fieldRowLast]}>
                  <Text style={s.fieldLabel}>Tee time</Text>
                  <Text style={time ? s.fieldValue : s.fieldValueDim}>
                    {time ? fmtTime(time) : 'Pick a time'}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          )}

          {/* Poll guests row */}
          <TouchableOpacity
            style={s.pollRow}
            onPress={() => {
              if (pollGuests) {
                pollStore.clear();
                setPollGuests(false);
              } else {
                router.push('/poll-setup' as any);
              }
            }}
            activeOpacity={0.7}
          >
            <View style={{ flex: 1 }}>
              <Text style={s.pollText}>Not sure on date? Poll your guests</Text>
              {pollGuests && (
                <Text style={s.pollSummary}>
                  {pollStore.getOptions().length} options · tap to edit
                </Text>
              )}
            </View>
            <View style={[s.toggle, pollGuests && s.toggleOn]}>
              <View style={[s.knob, pollGuests && s.knobOn]} />
            </View>
          </TouchableOpacity>

          {/* Course, format, spots, cost */}
          <View style={s.fieldStack}>
            <TouchableOpacity onPress={() => router.push('/location-search' as any)} activeOpacity={0.7}>
              <View style={s.fieldRow}>
                <Text style={s.fieldLabel}>Location</Text>
                <View style={s.rowRight}>
                  <Text style={courseName ? s.fieldValue : s.fieldValueDim} numberOfLines={1}>
                    {courseName || 'Search'}
                  </Text>
                  <Text style={s.chevron}>›</Text>
                </View>
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowFormatModal(true)} activeOpacity={0.7}>
              <View style={s.fieldRow}>
                <Text style={s.fieldLabel}>Format</Text>
                <View style={s.rowRight}>
                  <Text style={selectedFormat !== null ? s.fieldValue : s.fieldValueDim}>
                    {selectedFormat !== null ? FORMAT_DISPLAY[selectedFormat] : 'e.g. Stroke play'}
                  </Text>
                  <Text style={s.chevron}>›</Text>
                </View>
              </View>
            </TouchableOpacity>
            <View style={s.fieldRow}>
              <Text style={s.fieldLabel}>Spots</Text>
              <View style={s.stepper}>
                <TouchableOpacity
                  style={s.stepperBtn}
                  onPress={() => setSpots(Math.max(1, spots - 1))}
                  activeOpacity={0.7}
                >
                  <Text style={s.stepperBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={s.stepperValue}>{spots}</Text>
                <TouchableOpacity
                  style={s.stepperBtn}
                  onPress={() => setSpots(Math.min(12, spots + 1))}
                  activeOpacity={0.7}
                >
                  <Text style={s.stepperBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={[s.fieldRow, s.fieldRowLast]}>
              <Text style={s.fieldLabel}>Cost per person</Text>
              <TextInput
                style={[s.fieldValue, s.inlineInput]}
                value={cost}
                onChangeText={setCost}
                placeholder="$0"
                placeholderTextColor="#c8c4b0"
                keyboardType="numeric"
                returnKeyType="done"
                textAlign="right"
              />
            </View>
          </View>

          {/* Note */}
          <View style={s.fieldStack}>
            <TouchableOpacity
              onPress={() => setShowNoteModal(true)}
              activeOpacity={0.7}
            >
              <View style={[s.fieldRow, s.fieldRowLast]}>
                <Text style={s.fieldLabel}>Note to group</Text>
                <View style={s.rowRight}>
                  {note ? (
                    <Text style={s.notePreview} numberOfLines={1}>
                      {note}
                    </Text>
                  ) : null}
                  <Text style={s.chevron}>›</Text>
                </View>
              </View>
            </TouchableOpacity>
          </View>

          <Button
            label={saving ? 'Creating...' : 'Create & invite 🏌️'}
            variant="primary"
            onPress={async () => {
              if (saving || !userId) return;
              if (selectedFormat === null) {
                Alert.alert('Pick a format', 'Choose a game format before creating the round.');
                return;
              }
              setSaving(true);

              // Resolve cover ID from source number
              const allImages = [...PRESET_IMAGES, ...PRESET_GIFS];
              const matched = allImages.find((i) => i.source === coverImage);

              const round = await createRound({
                hostId: userId,
                clubId: sourceClub?.id ?? null,
                title: eventName || null,
                courseName: courseName || null,
                format: selectedFormat!,
                scheduledAt: date && time
                  ? new Date(
                      date.getFullYear(), date.getMonth(), date.getDate(),
                      time.getHours(), time.getMinutes()
                    ).toISOString()
                  : null,
                spots,
                costCents: cost ? Math.round(parseFloat(cost) * 100) : 0,
                skinsBetCents: 0,
                coverImageId: matched?.id ?? null,
                coverIsVideo,
                note: note || null,
                pollGuests,
                totalHoles: 18,
                startingHole: 1,
                pars: DEFAULT_PARS,
              });

              if (round && sourceClub?.members) {
                const memberIds = sourceClub.members
                  .filter((m) => m.user_id !== userId && m.status === 'member')
                  .map((m) => m.user_id);
                if (memberIds.length > 0) await bulkInviteToRound(round.id, memberIds);
              }

              setSaving(false);
              if (round) {
                router.replace(`/send-invites/${round.id}`);
              } else {
                Alert.alert('Error', 'Failed to create round — check Metro logs for details.');
              }
            }}
          />
        </View>
      </ScrollView>

      {/* ── Date picker ── */}
      {Platform.OS === 'android' && showDatePicker && (
        <DateTimePicker
          value={date ?? new Date()}
          mode="date"
          display="default"
          onChange={onDateChange}
          minimumDate={new Date()}
        />
      )}
      {Platform.OS !== 'android' && (
        <PickerSheet visible={showDatePicker} onClose={() => setShowDatePicker(false)}>
          <DateTimePicker
            value={date ?? new Date()}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={onDateChange}
            minimumDate={new Date()}
            style={{ backgroundColor: 'white' }}
          />
        </PickerSheet>
      )}

      {/* ── Time picker ── */}
      {Platform.OS === 'android' && showTimePicker && (
        <DateTimePicker
          value={time ?? new Date()}
          mode="time"
          display="default"
          onChange={onTimeChange}
        />
      )}
      {Platform.OS !== 'android' && (
        <PickerSheet visible={showTimePicker} onClose={() => setShowTimePicker(false)}>
          <DateTimePicker
            value={time ?? new Date()}
            mode="time"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={onTimeChange}
            style={{ backgroundColor: 'white' }}
          />
        </PickerSheet>
      )}

      {/* ── Format picker ── */}
      <PickerSheet
        visible={showFormatModal}
        onClose={() => {
          setShowFormatModal(false);
          formatSlide.setValue(0);
        }}
        title="Format"
      >
        <FormatPickerContent
          selected={selectedFormat}
          slideAnim={formatSlide}
          onSelect={(f) => { setSelectedFormat(f); setShowFormatModal(false); formatSlide.setValue(0); }}
        />
      </PickerSheet>

      {/* ── Cover picker ── */}
      <CoverPickerModal
        visible={showPicker}
        current={coverImage}
        userId={userId ?? undefined}
        onSelect={(source, isVideo) => { setCoverImage(source); setCoverIsVideo(isVideo); }}
        onClose={() => setShowPicker(false)}
      />


      {/* ── Note modal ── */}
      <Modal
        visible={showNoteModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowNoteModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <View style={s.overlay}>
            <TouchableOpacity
              style={{ flex: 1 }}
              onPress={() => setShowNoteModal(false)}
              activeOpacity={1}
            />
            <View style={[s.sheet, s.noteSheet]}>
              <View style={s.sheetHeader}>
                <Text style={s.sheetTitle}>Note to group</Text>
                <TouchableOpacity onPress={() => setShowNoteModal(false)}>
                  <Text style={s.sheetDone}>Done</Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={s.noteInput}
                value={note}
                onChangeText={setNote}
                placeholder="Add a note for the group..."
                placeholderTextColor={Colors.muted}
                multiline
                autoFocus
                maxLength={280}
                textAlignVertical="top"
              />
              <Text style={s.charCount}>{note.length}/280</Text>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.green },

  topBarLabel: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: 'rgba(216,214,175,0.6)',
  },
  cancelBtn: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: 'rgba(216,214,175,0.6)',
  },

  // Green header
  header: {
    backgroundColor: Colors.green,
    paddingHorizontal: 18,
    paddingBottom: 18,
  },

  // Event name
  eventName: {
    fontFamily: Fonts.serifMedium,
    fontStyle: 'italic',
    fontSize: 26,
    color: Colors.cream,
    marginBottom: 2,
    paddingVertical: 0,
  },
  eventNameDim: {
    color: 'rgba(216,214,175,0.4)',
  },
  renameHint: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    color: 'rgba(216,214,175,0.5)',
    marginBottom: 12,
  },

  // Cover preview
  coverPreview: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 10,
  },
  coverImg: { width: '100%', height: '100%' },
  coverEditBadge: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  coverEditText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 12,
    color: '#fff',
  },

  // Thumbnail strip
  thumbStrip: { marginHorizontal: -4 },
  thumbStripContent: { gap: 8, paddingHorizontal: 4 },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thumbSelected: { borderColor: Colors.cream },
  thumbImg: { width: '100%', height: '100%' },

  // Drawer
  drawer: {
    backgroundColor: Colors.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -12,
    paddingTop: 18,
    paddingHorizontal: 16,
    paddingBottom: Spacing.xxl,
  },
  handle: {
    width: 32,
    height: 3,
    backgroundColor: '#d8d4c0',
    borderRadius: 4,
    alignSelf: 'center',
    marginBottom: 16,
  },

  // Field groups
  fieldStack: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: Colors.border,
    marginBottom: 12,
    overflow: 'hidden',
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#f2ede0',
  },
  fieldRowLast: { borderBottomWidth: 0 },
  fieldLabel: { fontFamily: Fonts.sans, fontSize: 14, color: Colors.muted },
  fieldValue: { fontFamily: Fonts.sansMedium, fontSize: 14, color: Colors.text },
  fieldValueDim: { fontFamily: Fonts.sans, fontSize: 14, color: '#c8c4b0' },
  inlineInput: {
    flex: 1,
    textAlign: 'right',
    paddingVertical: 0,
    paddingHorizontal: 0,
    minHeight: 0,
  },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chevron: { fontSize: 18, color: '#ccc' },

  // Stepper
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepperBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.creamLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnText: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: Colors.green, lineHeight: 18 },
  stepperValue: {
    fontFamily: Fonts.sansMedium,
    fontSize: 14,
    color: Colors.text,
    minWidth: 16,
    textAlign: 'center',
  },

  // Poll guests toggle row
  pollRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 4, paddingVertical: 10, marginBottom: 4,
  },
  pollText: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.muted },
  pollSummary: { fontFamily: Fonts.sans, fontSize: 11, color: Colors.green, marginTop: 2 },

  // Toggle
  toggle: { width: 30, height: 17, backgroundColor: '#d4d0bc', borderRadius: 20 },
  toggleOn: { backgroundColor: Colors.green },
  knob: {
    position: 'absolute',
    top: 2,
    left: 2,
    width: 13,
    height: 13,
    borderRadius: 6.5,
    backgroundColor: 'white',
  },
  knobOn: { left: 15 },

  // Note preview in row
  notePreview: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: Colors.muted,
    maxWidth: 180,
  },

  // Bottom sheet
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 32,
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
  sheetDone: { fontFamily: Fonts.sansMedium, fontSize: 15, color: Colors.green },

  // Format list
  formatList: { paddingVertical: 4 },
  formatOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  formatOptionBorder: { borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  formatOptionText: { fontFamily: Fonts.sans, fontSize: 16, color: Colors.text },
  formatOptionActive: { fontFamily: Fonts.sansMedium, color: Colors.green },
  formatOptionDim: { fontFamily: Fonts.sans, fontSize: 16, color: Colors.muted },
  formatChevron: { fontFamily: Fonts.sans, fontSize: 18, color: Colors.muted },
  formatBackText: { fontFamily: Fonts.sansMedium, fontSize: 15, color: Colors.green },
  formatComingSoon: { fontFamily: Fonts.sans, fontSize: 11, color: Colors.muted, backgroundColor: Colors.creamLight, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  checkmark: { fontFamily: Fonts.sansMedium, fontSize: 16, color: Colors.green },


  // Note sheet
  noteSheet: { paddingBottom: 0 },
  noteInput: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    color: Colors.text,
    padding: 18,
    height: 140,
  },
  charCount: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    color: Colors.muted,
    textAlign: 'right',
    paddingHorizontal: 18,
    paddingBottom: 16,
  },
});
