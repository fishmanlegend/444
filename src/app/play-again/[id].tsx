import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { TopBar } from '@/components/TopBar';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { getRoundWithPlayers, createRound, bulkInviteToRound, getHoles, patchRound } from '@/lib/db';
import { notifyRoundsChanged } from '@/lib/roundsRefresh';
import type { Round, RoundPlayer, Hole, RoundFormat } from '@/lib/database.types';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_PARS = [4, 4, 3, 4, 5, 3, 4, 5, 4, 4, 3, 4, 5, 4, 3, 5, 4, 4];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDateOption(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// Three suggested poll dates: tomorrow, 3 days out, one week out — all at 8am
function suggestedDates(): string[] {
  const base = new Date();
  base.setHours(8, 0, 0, 0);
  return [1, 3, 7].map((offset) => {
    const d = new Date(base);
    d.setDate(d.getDate() + offset);
    return d.toISOString();
  });
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PlayAgainScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id ?? (__DEV__ ? '46bae3d3-2c18-450e-b267-f36b91a94a31' : null);

  const [round, setRound] = useState<(Round & { players: RoundPlayer[] }) | null>(null);
  const [holes, setHoles] = useState<Hole[]>([]);
  const [loading, setLoading] = useState(true);

  // Mode: 'date' = lock a date, 'poll' = let crew vote
  const [mode, setMode] = useState<'date' | 'poll'>('date');

  // "Set date" mode
  const [pickedDate, setPickedDate] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    d.setHours(8, 0, 0, 0);
    return d;
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  // "Poll crew" mode — 3 editable option slots
  const [pollOptions, setPollOptions] = useState<string[]>(suggestedDates);

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    Promise.all([getRoundWithPlayers(id), getHoles(id)]).then(([r, h]) => {
      setRound(r);
      setHoles(h);
      setLoading(false);
    });
  }, [id]);

  const isGuest = round ? round.host_id !== userId : false;

  const confirmedPlayers = (round?.players as RoundPlayer[] ?? []).filter(
    (p) => p.rsvp === 'in' && p.player_id && p.player_id !== userId,
  );

  const parsFromHoles: number[] = holes.length > 0
    ? holes.map((h) => h.par)
    : DEFAULT_PARS;

  async function handleCreate() {
    if (!round || !userId || saving) return;
    setSaving(true);

    const scheduledAt = mode === 'date' ? pickedDate.toISOString() : null;
    const pollConfig = mode === 'poll'
      ? { pollOptions: pollOptions.filter(Boolean) }
      : {};

    const newRound = await createRound({
      hostId: userId,
      clubId: round.club_id,
      title: null,
      courseName: round.course_name,
      format: round.format,
      scheduledAt,
      spots: round.spots,
      costCents: round.cost_cents,
      skinsBetCents: round.skins_bet_cents,
      coverImageId: round.cover_image_id,
      coverIsVideo: round.cover_is_video,
      note: null,
      pollGuests: mode === 'poll',
      totalHoles: round.total_holes,
      startingHole: round.starting_hole,
      pars: parsFromHoles,
    });

    if (!newRound) {
      setSaving(false);
      Alert.alert('Error', 'Could not create round. Try again.');
      return;
    }

    if (mode === 'poll' && pollConfig.pollOptions && pollConfig.pollOptions.length > 0) {
      await patchRound(newRound.id, { format_config: pollConfig });
    }

    const playerIds = confirmedPlayers.map((p) => p.player_id as string);
    if (playerIds.length > 0) {
      await bulkInviteToRound(newRound.id, playerIds);
    }

    notifyRoundsChanged();
    router.replace(`/manage/${newRound.id}` as any);
  }

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
        <Text style={{ fontFamily: Fonts.serifMedium, fontSize: 20, color: Colors.cream }}>Round not found</Text>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.green }}>
        <TopBar
          left={
            <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
              <Text style={s.cancelBtn}>← Back</Text>
            </TouchableOpacity>
          }
          right={<Text style={s.topLabel}>Play Again</Text>}
        />
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + Spacing.xxl }]}
      >
        {/* ── Round summary ── */}
        <Text style={s.sectionLabel}>Replaying</Text>
        <View style={s.card}>
          <View style={s.summaryRow}>
            <View style={s.summaryInfo}>
              <Text style={s.summaryTitle}>{round.course_name ?? 'Golf round'}</Text>
              <Text style={s.summaryMeta}>
                {round.format.charAt(0).toUpperCase() + round.format.slice(1)} · {round.total_holes} holes
              </Text>
            </View>
          </View>
        </View>

        {/* ── Crew ── */}
        {confirmedPlayers.length > 0 && (
          <>
            <Text style={s.sectionLabel}>{isGuest ? 'Same crew · or bring new pals' : 'Same crew'}</Text>
            <View style={s.card}>
              {confirmedPlayers.map((p, i) => {
                const profile = (p as any).profile;
                return (
                  <View key={p.id} style={[s.crewRow, i < confirmedPlayers.length - 1 && s.crewRowBorder]}>
                    <Avatar
                      initials={profile?.initials ?? '?'}
                      bg={profile?.avatar_color ?? Colors.green}
                      textColor={profile?.avatar_text_color ?? Colors.cream}
                      size={30} borderWidth={0} borderColor="transparent"
                    />
                    <Text style={s.crewName}>{profile?.name ?? 'Player'}</Text>
                    <Text style={s.crewBadge}>will be invited</Text>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* ── Scheduling mode toggle ── */}
        <Text style={s.sectionLabel}>When</Text>
        <View style={s.modeToggle}>
          <TouchableOpacity
            style={[s.modeBtn, mode === 'date' && s.modeBtnActive]}
            onPress={() => setMode('date')}
            activeOpacity={0.7}
          >
            <Text style={[s.modeBtnText, mode === 'date' && s.modeBtnTextActive]}>Set a date</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.modeBtn, mode === 'poll' && s.modeBtnActive]}
            onPress={() => setMode('poll')}
            activeOpacity={0.7}
          >
            <Text style={[s.modeBtnText, mode === 'poll' && s.modeBtnTextActive]}>Poll crew</Text>
          </TouchableOpacity>
        </View>

        {/* ── Set date mode ── */}
        {mode === 'date' && (
          <View style={s.card}>
            <TouchableOpacity
              style={s.dateRow}
              onPress={() => setShowDatePicker(true)}
              activeOpacity={0.7}
            >
              <Text style={s.dateLabel}>Date</Text>
              <Text style={s.dateValue}>{fmtDateOption(pickedDate.toISOString())}</Text>
            </TouchableOpacity>
            <View style={s.rowBorder} />
            <TouchableOpacity
              style={s.dateRow}
              onPress={() => setShowTimePicker(true)}
              activeOpacity={0.7}
            >
              <Text style={s.dateLabel}>Time</Text>
              <Text style={s.dateValue}>{fmtTime(pickedDate.toISOString())}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Poll mode ── */}
        {mode === 'poll' && (
          <View style={s.card}>
            <Text style={s.pollHint}>Crew votes on which date works. You lock it in after.</Text>
            {pollOptions.map((opt, i) => (
              <View key={i} style={[s.pollOptionRow, i < pollOptions.length - 1 && s.rowBorder]}>
                <Text style={s.pollOptionNum}>{i + 1}</Text>
                <Text style={s.pollOptionDate}>{fmtDateOption(opt)}</Text>
                <TouchableOpacity
                  style={s.pollOptionEdit}
                  activeOpacity={0.7}
                  onPress={() => {
                    // Cycle through next available dates when tapped
                    const next = new Date(opt);
                    next.setDate(next.getDate() + 1);
                    const updated = [...pollOptions];
                    updated[i] = next.toISOString();
                    setPollOptions(updated);
                  }}
                >
                  <Text style={s.pollOptionEditText}>+1 day</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* ── DateTimePicker ── */}
        {showDatePicker && (
          <DateTimePicker
            value={pickedDate}
            mode="date"
            display="spinner"
            minimumDate={new Date()}
            onChange={(_: DateTimePickerEvent, d?: Date) => {
              setShowDatePicker(false);
              if (!d) return;
              const merged = new Date(d.getFullYear(), d.getMonth(), d.getDate(),
                pickedDate.getHours(), pickedDate.getMinutes());
              setPickedDate(merged);
            }}
          />
        )}
        {showTimePicker && (
          <DateTimePicker
            value={pickedDate}
            mode="time"
            display="spinner"
            onChange={(_: DateTimePickerEvent, d?: Date) => {
              setShowTimePicker(false);
              if (!d) return;
              const merged = new Date(pickedDate.getFullYear(), pickedDate.getMonth(), pickedDate.getDate(),
                d.getHours(), d.getMinutes());
              setPickedDate(merged);
            }}
          />
        )}

        {/* ── Create button ── */}
        <TouchableOpacity
          style={[s.createBtn, saving && s.createBtnDisabled]}
          activeOpacity={0.85}
          onPress={handleCreate}
          disabled={saving}
        >
          <Text style={s.createBtnText}>{saving ? 'Creating...' : isGuest ? 'Plan a round →' : 'Create round →'}</Text>
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
    fontFamily: Fonts.sansSemiBold, fontSize: 10, color: Colors.muted,
    textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10,
  },

  card: {
    backgroundColor: Colors.card, borderRadius: 14,
    borderWidth: 0.5, borderColor: Colors.border,
    paddingHorizontal: 14, marginBottom: 24, overflow: 'hidden',
  },

  summaryRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  summaryInfo: { flex: 1 },
  summaryTitle: { fontFamily: Fonts.serifMedium, fontSize: 18, color: Colors.text, marginBottom: 2 },
  summaryMeta: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.muted },

  crewRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 10 },
  crewRowBorder: { borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  crewName: { fontFamily: Fonts.sansMedium, fontSize: 14, color: Colors.text, flex: 1 },
  crewBadge: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.muted },

  modeToggle: {
    flexDirection: 'row', backgroundColor: Colors.card,
    borderRadius: 14, borderWidth: 0.5, borderColor: Colors.border,
    marginBottom: 16, overflow: 'hidden',
  },
  modeBtn: { flex: 1, paddingVertical: 13, alignItems: 'center' },
  modeBtnActive: { backgroundColor: Colors.green },
  modeBtnText: { fontFamily: Fonts.sansMedium, fontSize: 14, color: Colors.muted },
  modeBtnTextActive: { color: Colors.cream },

  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14 },
  dateLabel: { fontFamily: Fonts.sans, fontSize: 15, color: Colors.text },
  dateValue: { fontFamily: Fonts.sansMedium, fontSize: 15, color: Colors.green },
  rowBorder: { height: 0.5, backgroundColor: Colors.border },

  pollHint: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.muted, paddingTop: 14, paddingBottom: 10 },
  pollOptionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12 },
  pollOptionNum: { fontFamily: Fonts.sansMedium, fontSize: 13, color: Colors.muted, width: 16, textAlign: 'center' },
  pollOptionDate: { fontFamily: Fonts.sansMedium, fontSize: 15, color: Colors.text, flex: 1 },
  pollOptionEdit: {
    backgroundColor: Colors.bg, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  pollOptionEditText: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.muted },

  createBtn: {
    backgroundColor: Colors.green, borderRadius: 14,
    paddingVertical: 17, alignItems: 'center',
  },
  createBtnDisabled: { opacity: 0.4 },
  createBtnText: { fontFamily: Fonts.sansSemiBold, fontSize: 16, color: Colors.cream },
});
