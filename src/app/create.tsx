import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';

const GOOGLE_PLACES_KEY = 'AIzaSyCBg-Tq8VIWljmdsT5FDaO_SYoGhSPomgs'; // TODO: rotate + restrict before shipping

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { TopBar } from '@/components/TopBar';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { DEFAULT_COVER, PRESET_IMAGES } from '@/constants/presetImages';
import { PRESET_GIFS } from '@/constants/presetGifs';
import { CoverPickerModal } from '@/components/CoverPickerModal';
import { useAuth } from '@/context/auth';
import { bulkInviteToRound, createRound, getClubWithMembers } from '@/lib/db';
import type { Club } from '@/lib/database.types';

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

const FORMATS = ['Stroke play', 'Match play', 'Stableford', 'Skins', 'Other'];
const FORMAT_MAP: Record<string, 'stroke' | 'match' | 'stableford' | 'skins' | 'other'> = {
  'Stroke play': 'stroke', 'Match play': 'match', 'Stableford': 'stableford', 'Skins': 'skins', 'Other': 'other',
};

// ─── Video cover preview ─────────────────────────────────────────────────────

function VideoCoverPreview({ source, style }: { source: number; style: object }) {
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

// ─── Screen ───────────────────────────────────────────────────────────────────

const DEFAULT_PARS = [4,4,3,4,5,3,4,5,4, 4,3,4,5,4,3,5,4,4];

export default function CreateScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile } = useAuth();
  const { club_id: clubIdParam } = useLocalSearchParams<{ club_id?: string }>();
  const [saving, setSaving] = useState(false);
  const [sourceClub, setSourceClub] = useState<Club | null>(null);

  const [eventName, setEventName] = useState('The Next Round');
  const [coverImage, setCoverImage] = useState<number>(DEFAULT_COVER);
  const [coverIsVideo, setCoverIsVideo] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [date, setDate] = useState<Date | null>(null);
  const [time, setTime] = useState<Date | null>(null);
  const [courseName, setCourseName] = useState('');
  const [formatIdx, setFormatIdx] = useState(0);
  const [spots, setSpots] = useState(4);
  const [cost, setCost] = useState('');
  const [pollGuests, setPollGuests] = useState(false);
  const [note, setNote] = useState('');

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
    FORMATS[formatIdx],
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

          {/* Date & tee time */}
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

          {/* Poll guests — inline, under date/time */}
          <TouchableOpacity
            style={s.pollRow}
            onPress={() => setPollGuests(!pollGuests)}
            activeOpacity={0.7}
          >
            <Text style={s.pollText}>Not sure on time? Poll your guests</Text>
            <View style={[s.toggle, pollGuests && s.toggleOn]}>
              <View style={[s.knob, pollGuests && s.knobOn]} />
            </View>
          </TouchableOpacity>

          {/* Course, format, spots, cost */}
          <View style={s.fieldStack}>
            <TouchableOpacity onPress={() => setShowCourseSearch(true)} activeOpacity={0.7}>
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
                  <Text style={s.fieldValue}>{FORMATS[formatIdx]}</Text>
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
              <Text style={s.fieldLabel}>Cost / person</Text>
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
              if (saving || !profile) return;
              setSaving(true);

              // Resolve cover ID from source number
              const allImages = [...PRESET_IMAGES, ...PRESET_GIFS];
              const matched = allImages.find((i) => i.source === coverImage);

              const round = await createRound({
                hostId: profile.id,
                clubId: sourceClub?.id ?? null,
                title: eventName || null,
                courseName: courseName || null,
                format: FORMAT_MAP[FORMATS[formatIdx]],
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
                  .filter((m) => m.user_id !== profile.id && m.status === 'member')
                  .map((m) => m.user_id);
                if (memberIds.length > 0) await bulkInviteToRound(round.id, memberIds);
              }

              setSaving(false);
              if (round) router.replace(`/manage/${round.id}`);
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
        onClose={() => setShowFormatModal(false)}
        title="Format"
      >
        <View style={s.formatList}>
          {FORMATS.map((f, i) => (
            <TouchableOpacity
              key={i}
              style={[s.formatOption, i < FORMATS.length - 1 && s.formatOptionBorder]}
              onPress={() => {
                setFormatIdx(i);
                setShowFormatModal(false);
              }}
              activeOpacity={0.7}
            >
              <Text style={[s.formatOptionText, i === formatIdx && s.formatOptionActive]}>
                {f}
              </Text>
              {i === formatIdx && <Text style={s.checkmark}>✓</Text>}
            </TouchableOpacity>
          ))}
        </View>
      </PickerSheet>

      {/* ── Cover picker ── */}
      <CoverPickerModal
        visible={showPicker}
        current={coverImage}
        userId={profile?.id}
        onSelect={(source, isVideo) => { setCoverImage(source); setCoverIsVideo(isVideo); }}
        onClose={() => setShowPicker(false)}
      />

      {/* ── Course search modal ── */}
      <Modal visible={showCourseSearch} animationType="slide" onRequestClose={() => setShowCourseSearch(false)}>
        <SafeAreaView style={s.courseModal} edges={['top']}>
          <View style={s.courseModalHeader}>
            <TouchableOpacity onPress={() => setShowCourseSearch(false)} activeOpacity={0.7}>
              <Text style={s.courseModalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={s.courseModalTitle}>Location</Text>
            <View style={{ width: 56 }} />
          </View>
          <GooglePlacesAutocomplete
            placeholder="Search..."
            textInputProps={{ autoFocus: true }}
            fetchDetails={false}
            enablePoweredByContainer={false}
            minLength={2}
            debounce={300}
            onPress={(data) => {
              setCourseName(data.structured_formatting?.main_text ?? data.description);
              setShowCourseSearch(false);
            }}
            onFail={(error) => console.log('Places error:', error)}
            onNotFound={() => console.log('Places: no results')}
            query={{ key: GOOGLE_PLACES_KEY, language: 'en' }}
            styles={{
              container: { flex: 1 },
              textInputContainer: s.courseInputContainer,
              textInput: s.courseInput,
              listView: s.courseList,
              row: s.courseRow,
              description: s.courseRowText,
              separator: s.courseRowSep,
              poweredContainer: { display: 'none' },
            }}
          />
        </SafeAreaView>
      </Modal>

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

  // Poll guests inline row
  pollRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 4, paddingVertical: 10, marginBottom: 4,
  },
  pollText: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.muted, flex: 1 },

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
  checkmark: { fontFamily: Fonts.sansMedium, fontSize: 16, color: Colors.green },

  // Course search modal
  courseModal: { flex: 1, backgroundColor: Colors.bg },
  courseModalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 0.5, borderBottomColor: Colors.border,
  },
  courseModalTitle: { fontFamily: Fonts.sansMedium, fontSize: 15, color: Colors.text  },
  courseModalCancel: { fontFamily: Fonts.sans, fontSize: 15, color: Colors.green, width: 56 },
  courseInputContainer: {
    backgroundColor: Colors.bg,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  courseInput: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    color: Colors.text,
    backgroundColor: Colors.creamLight,
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 42,
  },
  courseList: { backgroundColor: Colors.bg },
  courseRow: { paddingHorizontal: 16, paddingVertical: 14, backgroundColor: Colors.bg },
  courseRowText: { fontFamily: Fonts.sans, fontSize: 14, color: Colors.text },
  courseRowSep: { height: 0.5, backgroundColor: Colors.border, marginHorizontal: 16 },

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
