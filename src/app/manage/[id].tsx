import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Linking, Modal, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';

import { Avatar } from '@/components/Avatar';
import { TopBar } from '@/components/TopBar';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { PRESET_IMAGES } from '@/constants/presetImages';
import { PRESET_GIFS } from '@/constants/presetGifs';
import { getRoundWithPlayers, getGuestRsvps, patchRound } from '@/lib/db';
import { notifyRoundsChanged } from '@/lib/roundsRefresh';
import type { Round, RoundPlayer, GuestRsvp, RoundFormat } from '@/lib/database.types';
import { useAuth } from '@/context/auth';
import { CoverPickerModal } from '@/components/CoverPickerModal';

const GOOGLE_PLACES_KEY = 'AIzaSyCBg-Tq8VIWljmdsT5FDaO_SYoGhSPomgs';

const FORMAT_LABEL: Record<RoundFormat, string> = {
  stroke: 'Stroke play', skins: 'Skins', stableford: 'Stableford', match: 'Match play', other: 'Other',
};
const FORMATS: RoundFormat[] = ['stroke', 'match', 'stableford', 'skins', 'other'];

function getCoverSource(round: Round): number | null {
  if (!round.cover_image_id) return null;
  if (round.cover_is_video) return PRESET_GIFS.find((g) => g.id === round.cover_image_id)?.source ?? null;
  return PRESET_IMAGES.find((i) => i.id === round.cover_image_id)?.source ?? null;
}

function scorecardRoute(round: Round): string {
  if (round.format === 'skins') return `/skins/${round.id}`;
  if (round.format === 'stableford') return `/stableford/${round.id}`;
  if (round.format === 'match') return `/match/${round.id}`;
  return `/scorecard/${round.id}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function VideoCover({ source, style }: { source: number; style: object }) {
  const player = useVideoPlayer(source, (p) => { p.loop = true; p.muted = true; p.play(); });
  return <VideoView player={player} style={style} contentFit="cover" nativeControls={false} />;
}

function PickerSheet({ visible, onClose, title, children }: {
  visible: boolean; onClose: () => void; title?: string; children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <TouchableOpacity style={{ flex: 1 }} onPress={onClose} activeOpacity={1} />
        <View style={s.sheet}>
          <View style={s.sheetHeader}>
            {title ? <Text style={s.sheetTitle}>{title}</Text> : <View />}
            <TouchableOpacity onPress={onClose}><Text style={s.sheetDone}>Done</Text></TouchableOpacity>
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}

function PlayerRow({ player, showBorder }: { player: RoundPlayer; showBorder: boolean }) {
  const profile = (player as any).profile;
  const rsvpLabel = player.rsvp === 'in' ? '✓ in' : player.rsvp === 'maybe' ? 'maybe' : player.rsvp === 'out' ? 'out' : 'invited';
  const rsvpColor = player.rsvp === 'in' ? '#2a5428' : player.rsvp === 'maybe' ? '#c08a20' : Colors.muted;
  return (
    <View style={[s.guestRow, showBorder && s.guestRowBorder]}>
      <Avatar initials={profile?.initials ?? '?'} bg={profile?.avatar_color ?? Colors.green}
        textColor={profile?.avatar_text_color ?? Colors.cream} size={30} borderWidth={0} borderColor="transparent" />
      <Text style={s.guestName}>{profile?.name ?? 'Unknown'}{player.is_host ? <Text style={s.hostTag}> host</Text> : null}</Text>
      <Text style={[s.guestStatus, { color: rsvpColor }]}>{rsvpLabel}</Text>
    </View>
  );
}

function GuestRow({ guest, showBorder }: { guest: GuestRsvp; showBorder: boolean }) {
  const rsvpLabel = guest.rsvp === 'in' ? '✓ in' : guest.rsvp === 'maybe' ? 'maybe' : 'out';
  const rsvpColor = guest.rsvp === 'in' ? '#2a5428' : guest.rsvp === 'maybe' ? '#c08a20' : Colors.muted;
  return (
    <View style={[s.guestRow, showBorder && s.guestRowBorder]}>
      <View style={s.guestInitialsCircle}>
        <Text style={s.guestInitialsText}>{guest.name.trim()[0]?.toUpperCase() ?? '?'}</Text>
      </View>
      <Text style={s.guestName}>{guest.name}</Text>
      <Text style={[s.guestStatus, { color: rsvpColor }]}>{rsvpLabel}</Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ManageScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();

  const [round, setRound] = useState<(Round & { players: RoundPlayer[] }) | null>(null);
  const [guests, setGuests] = useState<GuestRsvp[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit state
  const [showCoverPicker, setShowCoverPicker] = useState(false);
  const [showCourseSearch, setShowCourseSearch] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showFormatModal, setShowFormatModal] = useState(false);
  const [showCostSheet, setShowCostSheet] = useState(false);
  const [showSpotsSheet, setShowSpotsSheet] = useState(false);
  const [showTitleSheet, setShowTitleSheet] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [costDraft, setCostDraft] = useState('');
  const [spotsDraft, setSpotsDraft] = useState(4);

  useEffect(() => {
    if (!id) return;
    Promise.all([getRoundWithPlayers(id), getGuestRsvps(id)]).then(([r, g]) => {
      setRound(r);
      setGuests(g);
      if (r) {
        setTitleDraft(r.title ?? '');
        setCostDraft(r.cost_cents > 0 ? String(r.cost_cents / 100) : '');
        setSpotsDraft(r.spots);
      }
      setLoading(false);
    });
  }, [id]);

  async function save(updates: Partial<Round>) {
    if (!id || !round) return;
    try {
      await patchRound(id, updates);
      setRound((prev) => prev ? { ...prev, ...updates } : prev);
      notifyRoundsChanged();
    } catch (e) {
      console.error('[manage] save failed', e);
    }
  }

  const onDateChange = (_: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (!selected || !round) return;
    const existing = round.scheduled_at ? new Date(round.scheduled_at) : new Date();
    const merged = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate(),
      existing.getHours(), existing.getMinutes());
    save({ scheduled_at: merged.toISOString() });
  };

  const onTimeChange = (_: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') setShowTimePicker(false);
    if (!selected || !round) return;
    const existing = round.scheduled_at ? new Date(round.scheduled_at) : new Date();
    const merged = new Date(existing.getFullYear(), existing.getMonth(), existing.getDate(),
      selected.getHours(), selected.getMinutes());
    save({ scheduled_at: merged.toISOString() });
  };

  if (loading) {
    return <View style={[s.root, { alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator color={Colors.cream} /></View>;
  }
  if (!round) {
    return (
      <View style={[s.root, { alignItems: 'center', justifyContent: 'center', padding: 32 }]}>
        <Text style={{ fontFamily: Fonts.serifMedium, fontSize: 20, color: Colors.cream }}>Round not found</Text>
      </View>
    );
  }

  const coverSource = getCoverSource(round);
  const players = round.players as RoundPlayer[];
  const allRows = [...players, ...guests];
  const inCount = players.filter((p) => p.rsvp === 'in').length + guests.filter((g) => g.rsvp === 'in').length;
  const maybeCount = players.filter((p) => p.rsvp === 'maybe').length + guests.filter((g) => g.rsvp === 'maybe').length;
  const outCount = players.filter((p) => p.rsvp === 'out').length + guests.filter((g) => g.rsvp === 'out').length;
  const costLabel = round.cost_cents > 0 ? `$${round.cost_cents / 100} / person` : 'Free';
  const skinsLabel = round.format === 'skins' && round.skins_bet_cents > 0 ? ` · $${round.skins_bet_cents / 100}/skin` : '';

  const scheduledDate = round.scheduled_at ? new Date(round.scheduled_at) : new Date();

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.green }}>
        <TopBar
          left={<TouchableOpacity onPress={() => { notifyRoundsChanged(); router.back(); }} activeOpacity={0.7}><Text style={s.backBtn}>← Back</Text></TouchableOpacity>}
          right={<Text style={s.topBarTitle}>Manage</Text>}
        />
      </SafeAreaView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xxl }}>
        {/* ── Header ── */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <Text style={s.courseName}>{round.course_name ?? 'Golf round'}</Text>
            {round.scheduled_at && <Text style={s.courseMeta}>{fmtDate(round.scheduled_at)} · {fmtTime(round.scheduled_at)}</Text>}
            <Text style={s.courseMeta}>{FORMAT_LABEL[round.format]}{skinsLabel}</Text>
            <Text style={s.spotsText}>{round.spots} spots · {costLabel}</Text>
          </View>
          <TouchableOpacity
            style={s.coverSquareWrap}
            activeOpacity={0.85}
            onPress={() => setShowCoverPicker(true)}
          >
            {coverSource
              ? round.cover_is_video
                ? <VideoCover source={coverSource} style={s.coverSquare} />
                : <Image source={coverSource} style={s.coverSquare} contentFit="cover" />
              : <View style={[s.coverSquare, { backgroundColor: '#1a3320' }]} />
            }
            <View style={s.coverEditBadge}>
              <Text style={s.coverEditText}>✏</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* ── Drawer ── */}
        <View style={s.drawer}>
          <View style={s.handle} />

          <View style={s.ctaRow}>
            <TouchableOpacity
              style={s.ctaGhost}
              activeOpacity={0.7}
              onPress={() => {
                const phones = (round.players as any[])
                  .map((p) => p.profile?.phone)
                  .filter(Boolean);
                if (phones.length > 0) Linking.openURL(`sms:${phones.join(',')}`);
              }}
            >
              <Text style={s.ctaGhostText}>💬 Text all</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.ctaSolid} activeOpacity={0.8} onPress={() => router.push(scorecardRoute(round) as any)}>
              <Text style={s.ctaSolidText}>🏌️ Tee off!</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.ctaGhost} activeOpacity={0.7} onPress={() => router.push(`/post-round/${round.id}` as any)}>
              <Text style={s.ctaGhostText}>🏁 Wrap up</Text>
            </TouchableOpacity>
          </View>

          {/* Event details — all tappable */}
          <Text style={s.sectionLabel}>Event details</Text>
          <View style={s.card}>
            <TouchableOpacity style={s.detailRow} activeOpacity={0.7} onPress={() => { setTitleDraft(round.title ?? ''); setShowTitleSheet(true); }}>
              <Text style={s.detailLabel}>Title</Text>
              <View style={s.detailRight}>
                <Text style={s.detailValue} numberOfLines={1}>{round.title || 'Untitled Outing'}</Text>
                <Text style={s.detailArrow}>›</Text>
              </View>
            </TouchableOpacity>
            <View style={s.rowDivider} />

            <TouchableOpacity style={s.detailRow} activeOpacity={0.7} onPress={() => setShowCourseSearch(true)}>
              <Text style={s.detailLabel}>Location</Text>
              <View style={s.detailRight}>
                <Text style={s.detailValue} numberOfLines={1}>{round.course_name ?? 'Add location'}</Text>
                <Text style={s.detailArrow}>›</Text>
              </View>
            </TouchableOpacity>
            <View style={s.rowDivider} />

            <TouchableOpacity style={s.detailRow} activeOpacity={0.7} onPress={() => setShowDatePicker(true)}>
              <Text style={s.detailLabel}>Date</Text>
              <View style={s.detailRight}>
                <Text style={s.detailValue}>{round.scheduled_at ? fmtDate(round.scheduled_at) : 'Set date'}</Text>
                <Text style={s.detailArrow}>›</Text>
              </View>
            </TouchableOpacity>
            <View style={s.rowDivider} />

            <TouchableOpacity style={s.detailRow} activeOpacity={0.7} onPress={() => setShowTimePicker(true)}>
              <Text style={s.detailLabel}>Tee time</Text>
              <View style={s.detailRight}>
                <Text style={s.detailValue}>{round.scheduled_at ? fmtTime(round.scheduled_at) : 'Set time'}</Text>
                <Text style={s.detailArrow}>›</Text>
              </View>
            </TouchableOpacity>
            <View style={s.rowDivider} />

            <TouchableOpacity style={s.detailRow} activeOpacity={0.7} onPress={() => setShowFormatModal(true)}>
              <Text style={s.detailLabel}>Format</Text>
              <View style={s.detailRight}>
                <Text style={s.detailValue}>{FORMAT_LABEL[round.format]}</Text>
                <Text style={s.detailArrow}>›</Text>
              </View>
            </TouchableOpacity>
            <View style={s.rowDivider} />

            <TouchableOpacity style={s.detailRow} activeOpacity={0.7} onPress={() => setShowCostSheet(true)}>
              <Text style={s.detailLabel}>Cost</Text>
              <View style={s.detailRight}>
                <Text style={s.detailValue}>{costLabel}</Text>
                <Text style={s.detailArrow}>›</Text>
              </View>
            </TouchableOpacity>
            <View style={s.rowDivider} />

            <TouchableOpacity style={[s.detailRow, { borderBottomWidth: 0 }]} activeOpacity={0.7} onPress={() => setShowSpotsSheet(true)}>
              <Text style={s.detailLabel}>Spots</Text>
              <View style={s.detailRight}>
                <Text style={s.detailValue}>{round.spots} players</Text>
                <Text style={s.detailArrow}>›</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Guest list */}
          <Text style={s.sectionLabel}>
            Guest list · <Text style={s.guestCounts}>{inCount} in · {maybeCount} maybe · {outCount} out</Text>
          </Text>
          <View style={s.card}>
            {players.map((p, i) => <PlayerRow key={p.id} player={p} showBorder={i < allRows.length - 1} />)}
            {guests.map((g, i) => <GuestRow key={g.id} guest={g} showBorder={players.length + i < allRows.length - 1} />)}
            {allRows.length === 0 && (
              <Text style={{ fontFamily: Fonts.sans, fontSize: 13, color: Colors.muted, padding: 14, textAlign: 'center' }}>No players yet.</Text>
            )}
          </View>

          <TouchableOpacity style={s.inviteBtn} activeOpacity={0.7} onPress={() => router.push(`/invite/${round.id}` as any)}>
            <Text style={s.inviteBtnText}>+ Invite more people</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ── Location search ── */}
      <Modal visible={showCourseSearch} animationType="slide" onRequestClose={() => setShowCourseSearch(false)}>
        <SafeAreaView style={s.courseModal} edges={['top']}>
          <View style={s.sheetHeader}>
            <TouchableOpacity onPress={() => setShowCourseSearch(false)} activeOpacity={0.7}>
              <Text style={s.sheetDone}>Cancel</Text>
            </TouchableOpacity>
            <Text style={s.sheetTitle}>Location</Text>
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
              save({ course_name: data.structured_formatting?.main_text ?? data.description });
              setShowCourseSearch(false);
            }}
            query={{ key: GOOGLE_PLACES_KEY, language: 'en' }}
            styles={{
              container: { flex: 1 },
              textInputContainer: s.courseInputContainer,
              textInput: s.courseInput,
              listView: { backgroundColor: Colors.bg },
              row: { paddingHorizontal: 16, paddingVertical: 14, backgroundColor: Colors.bg },
              description: { fontFamily: Fonts.sans, fontSize: 14, color: Colors.text },
              separator: { height: 0.5, backgroundColor: Colors.border, marginHorizontal: 16 },
            }}
          />
        </SafeAreaView>
      </Modal>

      {/* ── Date picker ── */}
      {Platform.OS === 'android' && showDatePicker && (
        <DateTimePicker value={scheduledDate} mode="date" display="default" onChange={onDateChange} minimumDate={new Date()} />
      )}
      {Platform.OS !== 'android' && (
        <PickerSheet visible={showDatePicker} onClose={() => setShowDatePicker(false)}>
          <DateTimePicker value={scheduledDate} mode="date" display="spinner" onChange={onDateChange} minimumDate={new Date()} style={{ backgroundColor: 'white' }} />
        </PickerSheet>
      )}

      {/* ── Time picker ── */}
      {Platform.OS === 'android' && showTimePicker && (
        <DateTimePicker value={scheduledDate} mode="time" display="default" onChange={onTimeChange} />
      )}
      {Platform.OS !== 'android' && (
        <PickerSheet visible={showTimePicker} onClose={() => setShowTimePicker(false)}>
          <DateTimePicker value={scheduledDate} mode="time" display="spinner" onChange={onTimeChange} style={{ backgroundColor: 'white' }} />
        </PickerSheet>
      )}

      {/* ── Format picker ── */}
      <PickerSheet visible={showFormatModal} onClose={() => setShowFormatModal(false)} title="Format">
        <View style={s.formatList}>
          {FORMATS.map((f, i) => (
            <TouchableOpacity key={f} style={[s.formatOption, i < FORMATS.length - 1 && s.formatOptionBorder]}
              onPress={() => { save({ format: f }); setShowFormatModal(false); }} activeOpacity={0.7}>
              <Text style={[s.formatOptionText, round.format === f && s.formatOptionActive]}>{FORMAT_LABEL[f]}</Text>
              {round.format === f && <Text style={s.checkmark}>✓</Text>}
            </TouchableOpacity>
          ))}
        </View>
      </PickerSheet>

      {/* ── Cost sheet ── */}
      <PickerSheet visible={showCostSheet} onClose={() => {
        const cents = costDraft ? Math.round(parseFloat(costDraft) * 100) : 0;
        save({ cost_cents: isNaN(cents) ? 0 : cents });
        setShowCostSheet(false);
      }} title="Cost / person">
        <View style={s.simpleSheetBody}>
          <TextInput
            style={s.simpleInput}
            value={costDraft}
            onChangeText={setCostDraft}
            placeholder="0"
            placeholderTextColor={Colors.muted}
            keyboardType="numeric"
            returnKeyType="done"
            autoFocus
          />
        </View>
      </PickerSheet>

      {/* ── Spots sheet ── */}
      <PickerSheet visible={showSpotsSheet} onClose={() => { save({ spots: spotsDraft }); setShowSpotsSheet(false); }} title="Spots">
        <View style={s.stepperSheet}>
          <TouchableOpacity style={s.stepperBtn} onPress={() => setSpotsDraft((v) => Math.max(1, v - 1))} activeOpacity={0.7}>
            <Text style={s.stepperBtnText}>−</Text>
          </TouchableOpacity>
          <Text style={s.stepperValue}>{spotsDraft}</Text>
          <TouchableOpacity style={s.stepperBtn} onPress={() => setSpotsDraft((v) => Math.min(24, v + 1))} activeOpacity={0.7}>
            <Text style={s.stepperBtnText}>+</Text>
          </TouchableOpacity>
        </View>
      </PickerSheet>

      {/* ── Title sheet ── */}
      <PickerSheet visible={showTitleSheet} onClose={() => { save({ title: titleDraft || null }); setShowTitleSheet(false); }} title="Event title">
        <View style={s.simpleSheetBody}>
          <TextInput
            style={s.simpleInput}
            value={titleDraft}
            onChangeText={setTitleDraft}
            placeholder="Untitled Outing"
            placeholderTextColor={Colors.muted}
            returnKeyType="done"
            autoFocus
          />
        </View>
      </PickerSheet>

      {/* ── Cover picker ── */}
      <CoverPickerModal
        visible={showCoverPicker}
        current={coverSource ?? 0}
        userId={profile?.id}
        onSelect={(source, isVideo) => {
          const allCovers = [...PRESET_IMAGES, ...PRESET_GIFS];
          const matched = allCovers.find((i) => i.source === source);
          if (matched) save({ cover_image_id: matched.id, cover_is_video: isVideo });
        }}
        onClose={() => setShowCoverPicker(false)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.green },
  backBtn: { fontFamily: Fonts.sans, fontSize: 13, color: 'rgba(216,214,175,0.6)' },
  topBarTitle: { fontFamily: Fonts.sans, fontSize: 13, color: 'rgba(216,214,175,0.6)' },

  header: { backgroundColor: Colors.green, flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 18, paddingBottom: 24, gap: 14 },
  headerLeft: { flex: 1 },
  coverSquareWrap: { position: 'relative' },
  coverSquare: { width: 160, height: 160, borderRadius: 12 },
  coverEditBadge: {
    position: 'absolute', bottom: 8, right: 8,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  coverEditText: { fontFamily: Fonts.sansMedium, fontSize: 13, color: '#fff' },

  drawer: { backgroundColor: Colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, marginTop: -12, paddingTop: 22, paddingHorizontal: 16 },
  handle: { width: 32, height: 3, backgroundColor: '#d8d4c0', borderRadius: 4, alignSelf: 'center', marginBottom: 18 },

  courseName: { fontFamily: Fonts.serifMedium, fontSize: 22, color: Colors.cream, marginBottom: 3 },
  courseMeta: { fontFamily: Fonts.sans, fontSize: 13, color: 'rgba(216,214,175,0.6)', marginBottom: 4 },
  spotsText: { fontFamily: Fonts.sans, fontSize: 13, color: 'rgba(216,214,175,0.6)', marginTop: 4 },

  ctaRow: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  ctaGhost: { flex: 1, backgroundColor: Colors.creamLight, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  ctaGhostText: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.text },
  ctaSolid: { flex: 1, backgroundColor: Colors.green, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  ctaSolidText: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.cream },

  sectionLabel: { fontFamily: Fonts.sansSemiBold, fontSize: 10, color: Colors.muted, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10 },
  guestCounts: { fontFamily: Fonts.sans, fontSize: 10, color: Colors.muted, textTransform: 'none', letterSpacing: 0 },

  card: { backgroundColor: Colors.card, borderRadius: 14, borderWidth: 0.5, borderColor: Colors.border, paddingHorizontal: 14, marginBottom: 20 },
  rowDivider: { height: 0.5, backgroundColor: Colors.border },
  detailRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13 },
  detailLabel: { fontFamily: Fonts.sans, fontSize: 14, color: Colors.muted },
  detailRight: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'flex-end' },
  detailValue: { fontFamily: Fonts.sansMedium, fontSize: 14, color: Colors.text, maxWidth: 200 },
  detailArrow: { fontFamily: Fonts.sans, fontSize: 18, color: Colors.muted },

  guestRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, gap: 10 },
  guestRowBorder: { borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  guestName: { fontFamily: Fonts.sansMedium, fontSize: 14, color: Colors.text, flex: 1 },
  hostTag: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.muted },
  guestStatus: { fontFamily: Fonts.sansMedium, fontSize: 12 },
  guestInitialsCircle: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#e8e4d8', alignItems: 'center', justifyContent: 'center' },
  guestInitialsText: { fontFamily: Fonts.sansMedium, fontSize: 12, color: Colors.muted },
  inviteBtn: { paddingVertical: 14, alignItems: 'center' },
  inviteBtnText: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.muted, textDecorationLine: 'underline' },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 32 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  sheetTitle: { fontFamily: Fonts.sansMedium, fontSize: 15, color: Colors.text },
  sheetDone: { fontFamily: Fonts.sansMedium, fontSize: 15, color: Colors.green },

  formatList: { paddingVertical: 4 },
  formatOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 },
  formatOptionBorder: { borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  formatOptionText: { fontFamily: Fonts.sans, fontSize: 16, color: Colors.text },
  formatOptionActive: { fontFamily: Fonts.sansMedium, color: Colors.green },
  checkmark: { fontFamily: Fonts.sansMedium, fontSize: 16, color: Colors.green },

  simpleSheetBody: { paddingHorizontal: 20, paddingVertical: 16 },
  simpleInput: { fontFamily: Fonts.sans, fontSize: 22, color: Colors.text, borderBottomWidth: 1, borderBottomColor: Colors.border, paddingVertical: 8 },

  stepperSheet: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28, paddingVertical: 28 },
  stepperBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.creamLight, alignItems: 'center', justifyContent: 'center' },
  stepperBtnText: { fontFamily: Fonts.sansSemiBold, fontSize: 20, color: Colors.green, lineHeight: 22 },
  stepperValue: { fontFamily: Fonts.serifMedium, fontSize: 36, color: Colors.text, minWidth: 48, textAlign: 'center' },

  courseModal: { flex: 1, backgroundColor: Colors.bg },
  courseInputContainer: { backgroundColor: Colors.bg, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  courseInput: { fontFamily: Fonts.sans, fontSize: 15, color: Colors.text, backgroundColor: Colors.creamLight, borderRadius: 10, paddingHorizontal: 14, height: 42 },
});
