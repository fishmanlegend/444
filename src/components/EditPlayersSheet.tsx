import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from './Avatar';
import { Colors, Fonts } from '@/constants/theme';
import {
  createTempPlayer, addTempPlayerToRound, invitePlayer,
  removePlayerFromRound, removeTempPlayerFromRound,
  lookupProfileByPhone, getRoundWithPlayers,
} from '@/lib/db';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EditablePlayer {
  id: string;           // profile.id for real players, temp_player.id for guests
  isTempPlayer: boolean;
  name: string;
  initials: string;
  avatarColor: string;
  avatarTextColor: string;
  isHost: boolean;
}

interface Props {
  roundId: string;
  hostId: string;
  visible: boolean;
  currentUserId: string | null;
  onClose: () => void;
  onDone: () => void;  // parent re-fetches its own player state
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name.trim().split(/\s+/).map((w) => w[0]?.toUpperCase() ?? '').slice(0, 2).join('') || '?';
}

const TEMP_COLOR = '#7a7060';
const TEMP_TEXT  = '#fff';

// ─── Component ────────────────────────────────────────────────────────────────

export function EditPlayersSheet({ roundId, hostId, visible, currentUserId, onClose, onDone }: Props) {
  const insets = useSafeAreaInsets();
  const [players, setPlayers] = useState<EditablePlayer[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addName, setAddName] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');

  async function loadPlayers() {
    setLoading(true);
    const round = await getRoundWithPlayers(roundId);
    if (round) {
      const mapped: EditablePlayer[] = (round.players as any[]).map((rp) => {
        if (rp.temp_player_id) {
          const tp = rp.temp_player;
          const name = tp?.name ?? 'Guest';
          return {
            id: tp?.id ?? rp.temp_player_id,
            isTempPlayer: true,
            name,
            initials: getInitials(name),
            avatarColor: TEMP_COLOR,
            avatarTextColor: TEMP_TEXT,
            isHost: false,
          };
        }
        const p = rp.profile ?? {};
        return {
          id: rp.player_id,
          isTempPlayer: false,
          name: p.name ?? 'Player',
          initials: p.initials ?? '?',
          avatarColor: p.avatar_color ?? Colors.green,
          avatarTextColor: p.avatar_text_color ?? Colors.cream,
          isHost: rp.is_host,
        };
      });
      setPlayers(mapped);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (visible) {
      loadPlayers();
      setShowAddForm(false);
      setAddName('');
      setAddPhone('');
      setAddError('');
    }
  }, [visible, roundId]);

  async function handleRemove(player: EditablePlayer) {
    if (player.isHost) return;
    if (player.isTempPlayer) {
      await removeTempPlayerFromRound(roundId, player.id);
    } else {
      await removePlayerFromRound(roundId, player.id);
    }
    await loadPlayers();
  }

  async function handleAdd() {
    const name = addName.trim();
    if (!name) { setAddError('Name is required'); return; }
    if (!currentUserId) { setAddError('Not signed in'); return; }
    setAddLoading(true);
    setAddError('');
    try {
      const phone = addPhone.trim();
      if (phone) {
        const profile = await lookupProfileByPhone(phone);
        if (profile) {
          await invitePlayer(roundId, profile.id);
        } else {
          const temp = await createTempPlayer(roundId, name, phone, currentUserId);
          if (temp) await addTempPlayerToRound(roundId, temp.id);
        }
      } else {
        const temp = await createTempPlayer(roundId, name, null, currentUserId);
        if (temp) await addTempPlayerToRound(roundId, temp.id);
      }
      setAddName('');
      setAddPhone('');
      setShowAddForm(false);
      await loadPlayers();
    } catch {
      setAddError('Failed to add player. Try again.');
    } finally {
      setAddLoading(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={() => { onDone(); onClose(); }} />
        <View style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={s.handle} />

          <View style={s.header}>
            <Text style={s.title}>Players</Text>
            <TouchableOpacity onPress={() => { onDone(); onClose(); }} activeOpacity={0.7} style={s.doneHit}>
              <Text style={s.doneText}>Done</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator color={Colors.green} style={{ marginVertical: 32 }} />
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={s.card}>
                {players.map((p, i) => (
                  <View key={p.id} style={[s.playerRow, i < players.length - 1 && s.rowBorder]}>
                    <Avatar
                      initials={p.initials}
                      bg={p.avatarColor}
                      textColor={p.avatarTextColor}
                      size={34} borderWidth={0} borderColor="transparent"
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={s.playerName}>{p.name}</Text>
                      {p.isTempPlayer && <Text style={s.guestLabel}>Guest</Text>}
                    </View>
                    {p.isHost ? (
                      <Text style={s.hostLabel}>host</Text>
                    ) : (
                      <TouchableOpacity onPress={() => handleRemove(p)} activeOpacity={0.7} style={s.removeHit}>
                        <Text style={s.removeIcon}>×</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}

                {!showAddForm ? (
                  <TouchableOpacity style={s.addRow} onPress={() => setShowAddForm(true)} activeOpacity={0.7}>
                    <View style={s.addCircle}>
                      <Text style={s.addCircleText}>+</Text>
                    </View>
                    <Text style={s.addLabel}>Add player</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={s.addForm}>
                    <TextInput
                      style={s.input}
                      placeholder="Full name"
                      placeholderTextColor={Colors.muted}
                      value={addName}
                      onChangeText={setAddName}
                      autoFocus
                      returnKeyType="next"
                    />
                    <TextInput
                      style={s.input}
                      placeholder="Phone (optional — links to account)"
                      placeholderTextColor={Colors.muted}
                      value={addPhone}
                      onChangeText={setAddPhone}
                      keyboardType="phone-pad"
                      returnKeyType="done"
                    />
                    {addError ? <Text style={s.errorText}>{addError}</Text> : null}
                    <View style={s.addFormBtns}>
                      <TouchableOpacity
                        style={s.cancelBtn}
                        onPress={() => { setShowAddForm(false); setAddName(''); setAddPhone(''); setAddError(''); }}
                        activeOpacity={0.7}
                      >
                        <Text style={s.cancelText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.confirmBtn, (!addName.trim() || addLoading) && s.confirmBtnOff]}
                        onPress={handleAdd}
                        activeOpacity={0.8}
                        disabled={!addName.trim() || addLoading}
                      >
                        {addLoading
                          ? <ActivityIndicator color={Colors.cream} size="small" />
                          : <Text style={s.confirmText}>Add</Text>
                        }
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    backgroundColor: Colors.bg,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 12, paddingHorizontal: 16, maxHeight: '85%',
  },
  handle: {
    width: 32, height: 3, backgroundColor: '#d8d4c0',
    borderRadius: 4, alignSelf: 'center', marginBottom: 14,
  },
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 16,
  },
  title: { fontFamily: Fonts.serifMedium, fontSize: 20, color: Colors.text },
  doneHit: { padding: 4 },
  doneText: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: Colors.green },

  card: {
    backgroundColor: Colors.card, borderRadius: 14,
    borderWidth: 0.5, borderColor: Colors.border,
    overflow: 'hidden', marginBottom: 12,
  },
  playerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 12,
  },
  rowBorder: { borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  playerName: { fontFamily: Fonts.sansMedium, fontSize: 14, color: Colors.text },
  guestLabel: { fontFamily: Fonts.sans, fontSize: 11, color: Colors.muted },
  hostLabel:  { fontFamily: Fonts.sans, fontSize: 12, color: Colors.muted, paddingRight: 4 },
  removeHit:  { padding: 8 },
  removeIcon: { fontFamily: Fonts.sansSemiBold, fontSize: 22, color: '#c84030', lineHeight: 26 },

  addRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 12,
  },
  addCircle: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: Colors.creamLight, alignItems: 'center', justifyContent: 'center',
  },
  addCircleText: { fontFamily: Fonts.sansSemiBold, fontSize: 20, color: Colors.green, lineHeight: 24 },
  addLabel: { fontFamily: Fonts.sansMedium, fontSize: 14, color: Colors.green },

  addForm: { padding: 12, gap: 10 },
  input: {
    backgroundColor: Colors.creamLight, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    fontFamily: Fonts.sans, fontSize: 14, color: Colors.text,
  },
  errorText: { fontFamily: Fonts.sans, fontSize: 12, color: '#c84030' },
  addFormBtns: { flexDirection: 'row', gap: 10 },
  cancelBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    backgroundColor: Colors.creamLight, alignItems: 'center',
  },
  cancelText: { fontFamily: Fonts.sansMedium, fontSize: 14, color: Colors.text },
  confirmBtn: {
    flex: 2, paddingVertical: 10, borderRadius: 10,
    backgroundColor: Colors.green, alignItems: 'center',
  },
  confirmBtnOff: { opacity: 0.4 },
  confirmText: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: Colors.cream },
});
