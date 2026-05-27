import * as Clipboard from 'expo-clipboard';
import * as Contacts from 'expo-contacts';
import * as SMS from 'expo-sms';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { TopBar } from '@/components/TopBar';
import { Colors, Fonts } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { getPals, bulkInviteToRound } from '@/lib/db';
import type { Pal, Profile } from '@/lib/database.types';

const DEV_USER_ID = '46bae3d3-2c18-450e-b267-f36b91a94a31';

// ─── Share button ─────────────────────────────────────────────────────────────

function ShareBtn({
  label,
  sublabel,
  color,
  image,
  onPress,
}: {
  label: string;
  sublabel: string;
  color?: string;
  image?: number;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={s.shareBtn} onPress={onPress} activeOpacity={0.75}>
      <View style={[s.shareBtnCircle, { backgroundColor: color }]}>
        {image
          ? <Image source={image} style={s.shareBtnImg} contentFit="contain" />
          : <Text style={s.shareBtnIcon}>{label}</Text>
        }
      </View>
      <Text style={s.shareBtnLabel}>{sublabel}</Text>
    </TouchableOpacity>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SendInvitesScreen() {
  const { id, next } = useLocalSearchParams<{ id: string; next?: string }>();
  const destination = next ? decodeURIComponent(next) : '/(tabs)';
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const userId = session?.user.id ?? (__DEV__ ? DEV_USER_ID : null);

  const [search, setSearch] = useState('');
  const [pals, setPals] = useState<(Pal & { profile: Profile })[]>([]);
  const [contacts, setContacts] = useState<Contacts.Contact[]>([]);
  const [contactsGranted, setContactsGranted] = useState(false);
  const [selectedPalOtherIds, setSelectedPalOtherIds] = useState<Set<string>>(new Set());
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showMore, setShowMore] = useState(false);

  const inviteUrl = `cc-golf://invite/${id}`;
  const inviteMsg = `You're invited to golf! RSVP: ${inviteUrl}`;

  useEffect(() => {
    if (!userId) return;
    getPals(userId).then(setPals).catch(() => {});
  }, [userId]);

  async function requestContacts() {
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Contacts needed', 'Enable contacts access in Settings to invite from your phone.');
      return;
    }
    setContactsGranted(true);
    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
      sort: Contacts.SortTypes.FirstName,
    });
    setContacts(data.filter((c) => (c.phoneNumbers ?? []).length > 0));
  }

  function togglePal(otherId: string) {
    setSelectedPalOtherIds((prev) => {
      const next = new Set(prev);
      next.has(otherId) ? next.delete(otherId) : next.add(otherId);
      return next;
    });
  }

  function toggleContact(contactId: string) {
    setSelectedContactIds((prev) => {
      const next = new Set(prev);
      next.has(contactId) ? next.delete(contactId) : next.add(contactId);
      return next;
    });
  }

  const filteredPals = useMemo(() => {
    if (!search.trim()) return pals;
    const q = search.toLowerCase();
    return pals.filter((p) => (p.profile?.name ?? '').toLowerCase().includes(q));
  }, [pals, search]);

  const filteredContacts = useMemo(() => {
    const q = search.toLowerCase();
    return contacts.filter((c) => {
      const name = [c.firstName, c.lastName].filter(Boolean).join(' ').toLowerCase();
      return name.includes(q);
    });
  }, [contacts, search]);

  async function handleSend() {
    if (!id || !userId) return;
    setSending(true);

    // In-app invites for pals already on CC.
    const palIds = [...selectedPalOtherIds];
    if (palIds.length > 0) await bulkInviteToRound(id, palIds);

    // SMS for phone contacts
    const phones = contacts
      .filter((c) => selectedContactIds.has(c.id ?? ''))
      .flatMap((c) => c.phoneNumbers?.map((p) => p.number ?? '') ?? [])
      .filter(Boolean);

    if (phones.length > 0) {
      const smsAvailable = await SMS.isAvailableAsync();
      if (smsAvailable) {
        await SMS.sendSMSAsync(phones, inviteMsg);
      }
    }

    setSending(false);
    router.replace(destination as any);
  }

  async function copyLink() {
    await Clipboard.setStringAsync(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function openMessages() {
    Linking.openURL(`sms:&body=${encodeURIComponent(inviteMsg)}`);
  }

  function openInstagram() {
    Linking.canOpenURL('instagram://').then((can) => {
      Linking.openURL(
        can
          ? `instagram://sharesheet?text=${encodeURIComponent(inviteMsg)}`
          : `https://www.instagram.com`
      );
    });
  }

  function openEmail() {
    Linking.openURL(
      `mailto:?subject=${encodeURIComponent("You're invited to golf!")}&body=${encodeURIComponent(inviteMsg)}`
    );
  }

  function openFacebook() {
    Linking.openURL(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(inviteUrl)}&quote=${encodeURIComponent(inviteMsg)}`);
  }

  function openX() {
    Linking.openURL(`https://twitter.com/intent/tweet?text=${encodeURIComponent(inviteMsg)}`);
  }

  function openWhatsApp() {
    Linking.canOpenURL('whatsapp://').then((can) => {
      Linking.openURL(
        can
          ? `whatsapp://send?text=${encodeURIComponent(inviteMsg)}`
          : `https://web.whatsapp.com/`
      );
    });
  }

  function openTikTok() {
    Linking.canOpenURL('tiktok://').then((can) => {
      Linking.openURL(can ? `tiktok://` : `https://www.tiktok.com`);
    });
  }

  const totalSelected = selectedPalOtherIds.size + selectedContactIds.size;

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.green }}>
        <TopBar
          right={
            <TouchableOpacity onPress={() => router.replace(destination as any)} activeOpacity={0.7}>
              <Text style={s.doneBtn}>Done</Text>
            </TouchableOpacity>
          }
        />
      </SafeAreaView>

      {/* Search */}
      <View style={s.searchWrap}>
        <TextInput
          style={s.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search..."
          placeholderTextColor={Colors.muted}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 180 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Phone contacts — top */}
        {!contactsGranted ? (
          <TouchableOpacity style={s.contactsBanner} onPress={requestContacts} activeOpacity={0.8}>
            <Text style={s.contactsBannerText}>Invite phone contacts</Text>
            <View style={s.contactsBannerBtn}>
              <Text style={s.contactsBannerBtnText}>Add contacts</Text>
            </View>
          </TouchableOpacity>
        ) : (
          filteredContacts.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionLabel}>Contacts</Text>
              {filteredContacts.map((contact) => {
                const cId = contact.id ?? '';
                const selected = selectedContactIds.has(cId);
                const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Unknown';
                return (
                  <TouchableOpacity
                    key={cId}
                    style={s.row}
                    onPress={() => toggleContact(cId)}
                    activeOpacity={0.7}
                  >
                    <Avatar
                      initials={name.charAt(0).toUpperCase()}
                      bg={Colors.green}
                      textColor={Colors.cream}
                      size={34}
                    />
                    <View style={s.rowMid}>
                      <Text style={s.rowName}>{name}</Text>
                      <Text style={s.rowSub}>{contact.phoneNumbers?.[0]?.number ?? ''}</Text>
                    </View>
                    <View style={[s.checkbox, selected && s.checkboxOn]}>
                      {selected && <Text style={s.checkmark}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )
        )}

        {/* Pals */}
        {filteredPals.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionLabel}>Pals</Text>
            {filteredPals.map((pal) => {
              const otherId = pal.user_a_id === userId ? pal.user_b_id : pal.user_a_id;
              const p = pal.profile;
              const selected = selectedPalOtherIds.has(otherId);
              const subText = pal.rounds_together > 0
                ? `${pal.rounds_together} ${pal.rounds_together === 1 ? 'round' : 'rounds'} together`
                : `shared ${pal.invites_together} ${pal.invites_together === 1 ? 'invite' : 'invites'}`;
              return (
                <TouchableOpacity
                  key={`${pal.user_a_id}-${pal.user_b_id}`}
                  style={s.row}
                  onPress={() => togglePal(otherId)}
                  activeOpacity={0.7}
                >
                  <Avatar
                    initials={p?.initials ?? '?'}
                    bg={p?.avatar_color ?? Colors.green}
                    textColor={p?.avatar_text_color ?? Colors.cream}
                    size={34}
                  />
                  <View style={s.rowMid}>
                    <Text style={s.rowName}>{p?.name ?? p?.initials ?? 'Unknown'}</Text>
                    <Text style={s.rowSub}>{subText}</Text>
                  </View>
                  <View style={[s.checkbox, selected && s.checkboxOn]}>
                    {selected && <Text style={s.checkmark}>✓</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Bottom bar */}
      <View style={[s.bottom, { paddingBottom: insets.bottom + 8 }]}>
        {!showMore && (
          <TouchableOpacity style={s.moreToggle} onPress={() => setShowMore(true)} activeOpacity={0.6} hitSlop={{ top: 8, bottom: 8, left: 16, right: 8 }}>
            <Text style={s.moreText}>or share via...</Text>
          </TouchableOpacity>
        )}

        <View style={s.shareRow}>
          <ShareBtn
            label={copied ? '✓' : '🔗'}
            sublabel={copied ? 'Copied!' : 'Copy Link'}
            color="#1a2e18"
            onPress={copyLink}
          />
          <ShareBtn label="💬" sublabel="Messages" color={Colors.green} onPress={openMessages} />
          <ShareBtn label="" sublabel="Instagram" color="#6b4c35" image={require('../../../assets/instagram.png')} onPress={openInstagram} />
          <ShareBtn label="✉️" sublabel="Email" color="#4a5c3e" onPress={openEmail} />
        </View>

        {showMore && (
          <View style={s.shareRow}>
            <ShareBtn label="" sublabel="Facebook" color="#3a4a38" image={require('../../../assets/facebook.png')} onPress={openFacebook} />
            <ShareBtn label="" sublabel="X" color="#2a2a28" image={require('../../../assets/x.png')} onPress={openX} />
            <ShareBtn label="" sublabel="WhatsApp" color="#1a3320" image={require('../../../assets/whatsapp.png')} onPress={openWhatsApp} />
            <ShareBtn label="" sublabel="TikTok" color="#1a1a18" image={require('../../../assets/tiktok.png')} onPress={openTikTok} />
          </View>
        )}

        {totalSelected > 0 && (
          <TouchableOpacity
            style={[s.sendBtn, sending && { opacity: 0.6 }]}
            onPress={handleSend}
            activeOpacity={0.85}
            disabled={sending}
          >
            <Text style={s.sendBtnText}>
              {sending
                ? 'Sending...'
                : `Send to ${totalSelected} ${totalSelected === 1 ? 'person' : 'people'}`}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },

  doneBtn: { fontFamily: Fonts.sansMedium, fontSize: 14, color: Colors.cream },

  searchWrap: {
    backgroundColor: Colors.green,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  searchInput: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    fontFamily: Fonts.sans,
    fontSize: 15,
    color: Colors.cream,
  },

  scroll: { flex: 1 },

  section: { marginTop: 24, paddingHorizontal: 16 },
  sectionLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 10,
    color: Colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 10,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    gap: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  rowMid: { flex: 1 },
  rowName: { fontFamily: Fonts.sansMedium, fontSize: 14, color: Colors.text },
  rowSub: { fontFamily: Fonts.sans, fontSize: 11, color: Colors.muted, marginTop: 1 },

  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: Colors.green, borderColor: Colors.green },
  checkmark: { fontFamily: Fonts.sansSemiBold, fontSize: 11, color: Colors.cream },

  contactsBanner: {
    marginHorizontal: 16,
    marginTop: 20,
    backgroundColor: Colors.creamLight,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderWidth: 1.5,
    borderColor: Colors.green,
  },
  contactsBannerText: { fontFamily: Fonts.sans, fontSize: 14, color: Colors.text },
  contactsBannerBtn: {
    backgroundColor: Colors.green,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  contactsBannerBtnText: { fontFamily: Fonts.sansMedium, fontSize: 13, color: Colors.cream },

  bottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.card,
    borderTopWidth: 0.5,
    borderTopColor: Colors.border,
    paddingTop: 14,
    paddingHorizontal: 16,
    gap: 10,
  },

  shareRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
  },
  shareBtn: { alignItems: 'center', gap: 6 },
  shareBtnCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareBtnIcon: { fontSize: 24 },
  shareBtnImg: { width: 30, height: 30 },

  moreToggle: { alignSelf: 'flex-end', paddingRight: 4 },
  moreText: { fontFamily: Fonts.sans, fontSize: 11, color: Colors.muted },
  shareBtnLabel: { fontFamily: Fonts.sans, fontSize: 11, color: Colors.text },

  sendBtn: {
    backgroundColor: Colors.green,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  sendBtnText: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: Colors.cream },
});
