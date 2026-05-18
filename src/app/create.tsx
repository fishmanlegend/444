import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
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

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { TopBar } from '@/components/TopBar';
import { Colors, Fonts, Spacing } from '@/constants/theme';

// ─── Constants ────────────────────────────────────────────────────────────────

const EMOJIS = ['⛳', '🏌️', '🏆', '🍺', '😤'];
const FORMATS = ['Stroke play', 'Match play', 'Stableford', 'Skins'];

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

export default function CreateScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [emojiIdx, setEmojiIdx] = useState(0);
  const [date, setDate] = useState<Date | null>(null);
  const [time, setTime] = useState<Date | null>(null);
  const [formatIdx, setFormatIdx] = useState(0);
  const [spots, setSpots] = useState(4);
  const [cost, setCost] = useState('');
  const [pollGuests, setPollGuests] = useState(false);
  const [note, setNote] = useState('');

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showFormatModal, setShowFormatModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);

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
          right={<Text style={s.topBarLabel}>New round</Text>}
        />
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xxl }}
      >
        {/* ── Green header ── */}
        <View style={s.header}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginBottom: 14 }}
            contentContainerStyle={s.emojiRow}
          >
            {EMOJIS.map((emoji, i) => (
              <TouchableOpacity
                key={i}
                style={[s.emojiBtn, i === emojiIdx && s.emojiBtnSelected]}
                onPress={() => setEmojiIdx(i)}
                activeOpacity={0.7}
              >
                <Text style={s.emojiText}>{emoji}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={s.emojiAdd} activeOpacity={0.7}>
              <Text style={s.emojiAddText}>+</Text>
            </TouchableOpacity>
          </ScrollView>

          <Text style={s.eventNamePlaceholder}>Event name...</Text>
          <Text style={s.metaPreview}>{metaPreview}</Text>

          <View style={s.avatarRow}>
            <Avatar
              initials="WK"
              bg="rgba(216,214,175,0.85)"
              textColor={Colors.green}
              size={30}
              borderColor={Colors.green}
              borderWidth={2}
            />
            {[0, 1, 2].map((i) => (
              <View key={i} style={s.avatarEmpty}>
                <Text style={s.avatarEmptyPlus}>+</Text>
              </View>
            ))}
          </View>
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

          {/* Course, format, spots, cost */}
          <View style={s.fieldStack}>
            <View style={s.fieldRow}>
              <Text style={s.fieldLabel}>Course name</Text>
              <TextInput
                style={[s.fieldValue, s.inlineInput]}
                placeholder="Optional"
                placeholderTextColor="#c8c4b0"
                returnKeyType="done"
                textAlign="right"
              />
            </View>
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

          {/* Poll & note */}
          <View style={s.fieldStack}>
            <View style={s.fieldRow}>
              <Text style={s.fieldLabel}>Poll guests</Text>
              <TouchableOpacity
                style={[s.toggle, pollGuests && s.toggleOn]}
                onPress={() => setPollGuests(!pollGuests)}
                activeOpacity={0.9}
              >
                <View style={[s.knob, pollGuests && s.knobOn]} />
              </TouchableOpacity>
            </View>
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

          <Button label="Create & invite 🏌️" variant="primary" />
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
    paddingBottom: 26,
  },
  emojiRow: { flexDirection: 'row', gap: 7 },
  emojiBtn: {
    width: 52,
    height: 46,
    borderRadius: 10,
    backgroundColor: 'rgba(216,214,175,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiBtnSelected: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderWidth: 2,
    borderColor: Colors.cream,
  },
  emojiText: { fontSize: 22 },
  emojiAdd: {
    width: 52,
    height: 46,
    borderRadius: 10,
    backgroundColor: 'rgba(216,214,175,0.05)',
    borderWidth: 1.5,
    borderColor: 'rgba(216,214,175,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiAddText: { fontSize: 16, color: 'rgba(216,214,175,0.3)' },

  eventNamePlaceholder: {
    fontFamily: Fonts.serifMedium,
    fontSize: 22,
    color: 'rgba(216,214,175,0.35)',
    marginBottom: 4,
  },
  metaPreview: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: 'rgba(216,214,175,0.45)',
    marginBottom: 12,
  },
  avatarRow: { flexDirection: 'row', gap: 5 },
  avatarEmpty: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(216,214,175,0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(216,214,175,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmptyPlus: { fontSize: 14, color: 'rgba(216,214,175,0.2)' },

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
