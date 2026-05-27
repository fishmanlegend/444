import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { TopBar } from '@/components/TopBar';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { createRound, updateRoundStatus } from '@/lib/db';
import type { RoundFormat } from '@/lib/database.types';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_PARS = [4, 4, 3, 4, 5, 3, 4, 5, 4, 4, 3, 4, 5, 4, 3, 5, 4, 4];

const FORMATS: { label: string; value: RoundFormat }[] = [
  { label: 'Stroke play', value: 'stroke' },
  { label: 'Skins',       value: 'skins' },
  { label: 'Nassau',      value: 'nassau' },
  { label: 'Match play',  value: 'match' },
  { label: 'Wolf',        value: 'wolf' },
  { label: 'Banker',      value: 'banker' },
  { label: '9-Point',     value: 'nines' },
  { label: 'Snake',       value: 'snake' },
  { label: 'Stableford',  value: 'stableford' },
  { label: 'Best ball',   value: 'best_ball' },
];

function scorecardRoute(format: RoundFormat, id: string): string {
  if (format === 'skins')      return `/skins/${id}`;
  if (format === 'stableford') return `/stableford/${id}`;
  if (format === 'match')      return `/match/${id}`;
  if (format === 'best_ball')  return `/best-ball/${id}`;
  if (format === 'nassau')     return `/nassau/${id}`;
  if (format === 'wolf')       return `/wolf/${id}`;
  if (format === 'nines')      return `/nines/${id}`;
  if (format === 'snake')      return `/snake/${id}`;
  if (format === 'banker')     return `/banker/${id}`;
  return `/scorecard/${id}`;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PlayNowScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const userId = session?.user.id ?? (__DEV__ ? '46bae3d3-2c18-450e-b267-f36b91a94a31' : null);

  const [selectedFormat, setSelectedFormat] = useState<RoundFormat | null>(null);
  const [courseName, setCourseName] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleStart() {
    if (!userId || !selectedFormat || saving) return;
    setSaving(true);

    const round = await createRound({
      hostId: userId,
      clubId: null,
      title: null,
      courseName: courseName.trim() || null,
      format: selectedFormat,
      scheduledAt: null,
      spots: 8,
      costCents: 0,
      skinsBetCents: 0,
      coverImageId: null,
      coverIsVideo: false,
      note: null,
      pollGuests: false,
      totalHoles: 18,
      startingHole: 1,
      pars: DEFAULT_PARS,
    });

    if (!round) {
      setSaving(false);
      Alert.alert('Error', 'Could not start the round. Try again.');
      return;
    }

    await updateRoundStatus(round.id, 'active');

    const next = encodeURIComponent(scorecardRoute(selectedFormat, round.id));
    router.replace(`/send-invites/${round.id}?next=${next}` as any);
  }

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.green }}>
        <TopBar
          left={
            <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
              <Text style={s.cancelBtn}>Cancel</Text>
            </TouchableOpacity>
          }
          right={<Text style={s.topLabel}>Play Now</Text>}
        />
      </SafeAreaView>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + Spacing.xxl }]}
      >
        {/* ── Format picker ── */}
        <Text style={s.sectionLabel}>Game format</Text>
        <View style={s.card}>
          {FORMATS.map((f, i) => (
            <TouchableOpacity
              key={f.value}
              style={[s.formatRow, i < FORMATS.length - 1 && s.formatRowBorder]}
              onPress={() => setSelectedFormat(f.value)}
              activeOpacity={0.7}
            >
              <Text style={[s.formatLabel, selectedFormat === f.value && s.formatLabelActive]}>
                {f.label}
              </Text>
              {selectedFormat === f.value && <Text style={s.checkmark}>✓</Text>}
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Course ── */}
        <Text style={s.sectionLabel}>Course</Text>
        <View style={s.card}>
          <TextInput
            style={s.courseInput}
            value={courseName}
            onChangeText={setCourseName}
            placeholder="Course name (optional)"
            placeholderTextColor={Colors.muted}
            returnKeyType="done"
          />
        </View>

        {/* ── Start button ── */}
        <TouchableOpacity
          style={[s.startBtn, (!selectedFormat || saving) && s.startBtnDisabled]}
          activeOpacity={0.85}
          onPress={handleStart}
          disabled={!selectedFormat || saving}
        >
          <Text style={s.startBtnText}>{saving ? 'Starting...' : "Let's Go →"}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.green },

  cancelBtn: { fontFamily: Fonts.sans, fontSize: 13, color: 'rgba(216,214,175,0.6)' },
  topLabel:  { fontFamily: Fonts.sans, fontSize: 13, color: 'rgba(216,214,175,0.6)' },

  scroll: { backgroundColor: Colors.bg, paddingTop: 28, paddingHorizontal: 16 },

  sectionLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 10,
    color: Colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 10,
  },

  card: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    marginBottom: 24,
    overflow: 'hidden',
  },

  formatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
  },
  formatRowBorder: { borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  formatLabel: { fontFamily: Fonts.sans, fontSize: 16, color: Colors.text },
  formatLabelActive: { fontFamily: Fonts.sansMedium, color: Colors.green },
  checkmark: { fontFamily: Fonts.sansMedium, fontSize: 16, color: Colors.green },

  courseInput: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    color: Colors.text,
    paddingVertical: 14,
  },

  startBtn: {
    backgroundColor: Colors.green,
    borderRadius: 14,
    paddingVertical: 17,
    alignItems: 'center',
  },
  startBtnDisabled: { opacity: 0.4 },
  startBtnText: { fontFamily: Fonts.sansSemiBold, fontSize: 16, color: Colors.cream },
});
