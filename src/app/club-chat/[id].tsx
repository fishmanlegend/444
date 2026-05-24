import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Avatar } from '@/components/Avatar';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { getClubWithMembers, getClubMessages, addClubPost } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import type { Club, ClubPost } from '@/lib/database.types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dateSeparatorLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// ─── Item shape ───────────────────────────────────────────────────────────────

type DateItem = { kind: 'date'; label: string; key: string };
type MsgItem  = { kind: 'msg'; msg: ClubPost; showHeader: boolean; isMe: boolean; key: string };
type ChatItem = DateItem | MsgItem;

function buildItems(messages: ClubPost[], userId: string | null): ChatItem[] {
  const items: ChatItem[] = [];
  let lastDateStr = '';

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const dateStr = new Date(msg.created_at).toDateString();

    if (dateStr !== lastDateStr) {
      items.push({ kind: 'date', label: dateSeparatorLabel(msg.created_at), key: `date-${msg.created_at}` });
      lastDateStr = dateStr;
    }

    const prev = messages[i - 1];
    const sameGroup =
      prev != null &&
      prev.author_id === msg.author_id &&
      new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000;

    items.push({
      kind: 'msg',
      msg,
      showHeader: !sameGroup,
      isMe: msg.author_id === userId,
      key: msg.id,
    });
  }

  return items;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ClubChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, profile } = useAuth();

  const [club, setClub]         = useState<Club | null>(null);
  const [messages, setMessages] = useState<ClubPost[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending]   = useState(false);

  const listRef = useRef<FlatList<ChatItem>>(null);

  const userId = session?.user.id ?? (__DEV__ ? '46bae3d3-2c18-450e-b267-f36b91a94a31' : null);

  const scrollToBottom = useCallback((animated = true) => {
    listRef.current?.scrollToEnd({ animated });
  }, []);

  // Load club name + messages
  useEffect(() => {
    if (!id) return;
    Promise.all([getClubWithMembers(id), getClubMessages(id)]).then(([c, msgs]) => {
      setClub(c);
      setMessages(msgs);
    });
  }, [id]);

  // Scroll to bottom when messages first load
  useEffect(() => {
    if (messages.length > 0) {
      // small delay to let FlatList render before scrolling
      const t = setTimeout(() => scrollToBottom(false), 50);
      return () => clearTimeout(t);
    }
  }, [messages.length === 0 ? 0 : 1]); // only fire on first load

  // Supabase Realtime subscription
  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel(`club_chat_${id}`)
      .on(
        'postgres_changes' as any,
        {
          event: 'INSERT',
          schema: 'public',
          table: 'club_posts',
          filter: `club_id=eq.${id}`,
        },
        async (payload: { new: { id: string; author_id: string } }) => {
          // own messages are handled optimistically
          if (payload.new.author_id === userId) return;
          const { data } = await supabase
            .from('club_posts')
            .select('*, profile:profiles(*)')
            .eq('id', payload.new.id)
            .single();
          if (data) {
            setMessages((prev) => [...prev, data as ClubPost]);
            scrollToBottom(true);
          }
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [id, userId]);

  async function handleSend() {
    const body = inputText.trim();
    if (!body || !id || !userId) return;

    setSending(true);
    setInputText('');

    const tempId = `temp-${Date.now()}`;
    const tempMsg: ClubPost = {
      id: tempId,
      club_id: id,
      author_id: userId,
      body,
      created_at: new Date().toISOString(),
      profile: profile ?? undefined,
    };

    setMessages((prev) => [...prev, tempMsg]);
    scrollToBottom(true);

    const real = await addClubPost(id, userId, body);
    if (real) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? real : m)));
    }
    setSending(false);
  }

  const items = buildItems(messages, userId);

  function renderItem({ item }: { item: ChatItem }) {
    if (item.kind === 'date') {
      return (
        <View style={s.dateSepWrap}>
          <View style={s.dateSepLine} />
          <Text style={s.dateSepLabel}>{item.label}</Text>
          <View style={s.dateSepLine} />
        </View>
      );
    }

    const { msg, showHeader, isMe } = item;
    const p = msg.profile;
    const isTemp = msg.id.startsWith('temp-');

    if (isMe) {
      return (
        <View style={[s.bubbleWrap, s.bubbleWrapMe, !showHeader && s.bubbleCompact]}>
          <View style={[s.bubble, s.bubbleMe]}>
            <Text style={[s.bubbleText, s.bubbleTextMe]}>{msg.body}</Text>
          </View>
          {showHeader && <Text style={[s.timeLabel, s.timeLabelMe]}>{isTemp ? '' : fmtTime(msg.created_at)}</Text>}
        </View>
      );
    }

    return (
      <View style={[s.bubbleWrap, s.bubbleWrapThem, !showHeader && s.bubbleCompact]}>
        {showHeader ? (
          <Avatar
            initials={p?.initials ?? '?'}
            bg={p?.avatar_color ?? Colors.green}
            textColor={p?.avatar_text_color ?? Colors.cream}
            size={28}
            borderWidth={0}
            borderColor="transparent"
          />
        ) : (
          <View style={s.avatarSpacer} />
        )}
        <View style={s.bubbleThemCol}>
          {showHeader && (
            <Text style={s.senderName}>{p?.name?.split(' ')[0] ?? 'Member'}</Text>
          )}
          <View style={[s.bubble, s.bubbleThem]}>
            <Text style={[s.bubbleText, s.bubbleTextThem]}>{msg.body}</Text>
          </View>
          {showHeader && <Text style={s.timeLabel}>{fmtTime(msg.created_at)}</Text>}
        </View>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.green }}>
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={s.backHit}>
            <Text style={s.backBtn}>← Back</Text>
          </TouchableOpacity>
          <Text style={s.topBarTitle}>{club?.name ?? 'Chat'}</Text>
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={listRef}
          data={items}
          renderItem={renderItem}
          keyExtractor={(item) => item.key}
          contentContainerStyle={[s.listContent, { paddingBottom: 12 }]}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollToBottom(false)}
        />

        <View style={[s.inputBar, { paddingBottom: insets.bottom + 8 }]}>
          <TextInput
            style={s.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Message..."
            placeholderTextColor={Colors.muted}
            multiline
            maxLength={1000}
            returnKeyType="default"
          />
          <TouchableOpacity
            style={[s.sendBtn, (!inputText.trim() || sending) && s.sendBtnDim]}
            activeOpacity={0.8}
            onPress={handleSend}
            disabled={!inputText.trim() || sending}
          >
            <Text style={s.sendBtnText}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <SafeAreaView edges={['bottom']} style={{ backgroundColor: Colors.card }} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:  { flex: 1, backgroundColor: Colors.bg },
  flex:  { flex: 1 },

  // Top bar
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: 12, position: 'relative',
  },
  backHit: { position: 'absolute', left: 0, paddingHorizontal: Spacing.lg, paddingVertical: 12 },
  backBtn: { fontFamily: Fonts.sans, fontSize: 13, color: 'rgba(216,214,175,0.6)' },
  topBarTitle: { fontFamily: Fonts.serifMedium, fontSize: 17, color: Colors.cream },

  // List
  listContent: { paddingTop: 8, paddingHorizontal: 12 },

  // Date separator
  dateSepWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 16, paddingHorizontal: 4 },
  dateSepLine: { flex: 1, height: 0.5, backgroundColor: Colors.border },
  dateSepLabel: { fontFamily: Fonts.sans, fontSize: 11, color: Colors.muted },

  // Bubble wrappers
  bubbleWrap: { marginTop: 10 },
  bubbleCompact: { marginTop: 2 },
  bubbleWrapMe: { alignItems: 'flex-end', paddingLeft: 60 },
  bubbleWrapThem: { flexDirection: 'row', alignItems: 'flex-end', paddingRight: 60, gap: 6 },

  avatarSpacer: { width: 28 },

  bubbleThemCol: { flex: 1, gap: 2 },

  senderName: { fontFamily: Fonts.sansMedium, fontSize: 11, color: Colors.muted, marginBottom: 1, paddingLeft: 2 },

  // Bubbles
  bubble: { borderRadius: 18, paddingHorizontal: 13, paddingVertical: 9, maxWidth: '100%' },
  bubbleMe:   { backgroundColor: Colors.green, borderBottomRightRadius: 4 },
  bubbleThem: {
    backgroundColor: Colors.card,
    borderWidth: 0.5, borderColor: Colors.border,
    borderBottomLeftRadius: 4,
  },

  bubbleText:     { fontFamily: Fonts.sans, fontSize: 15, lineHeight: 21 },
  bubbleTextMe:   { color: Colors.cream },
  bubbleTextThem: { color: Colors.text },

  timeLabel:   { fontFamily: Fonts.sans, fontSize: 10, color: Colors.muted, marginTop: 2, paddingLeft: 2 },
  timeLabelMe: { textAlign: 'right', paddingLeft: 0, paddingRight: 2 },

  // Input bar
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    backgroundColor: Colors.card,
    borderTopWidth: 0.5, borderTopColor: Colors.border,
    paddingHorizontal: 12, paddingTop: 10,
  },
  input: {
    flex: 1,
    fontFamily: Fonts.sans, fontSize: 15, color: Colors.text,
    backgroundColor: Colors.bg,
    borderRadius: 20,
    borderWidth: 0.5, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 9,
    maxHeight: 120, minHeight: 38,
  },
  sendBtn: {
    backgroundColor: Colors.green,
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 9,
    alignSelf: 'flex-end',
  },
  sendBtnDim: { opacity: 0.4 },
  sendBtnText: { fontFamily: Fonts.sansMedium, fontSize: 14, color: Colors.cream },
});
