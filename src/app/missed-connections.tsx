import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { Colors, Fonts } from '@/constants/theme';
import { getPals } from '@/lib/db';
import { useAuth } from '@/context/auth';
import type { Pal, Profile } from '@/lib/database.types';

export default function MissedConnectionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { userId: paramUserId } = useLocalSearchParams<{ userId?: string }>();

  const userId = session?.user.id ?? (__DEV__ ? '46bae3d3-2c18-450e-b267-f36b91a94a31' : null);

  const [almostPals, setAlmostPals] = useState<(Pal & { profile: Profile })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    getPals(userId).then((all) => {
      setAlmostPals(all.filter((p) => p.rounds_together === 0));
      setLoading(false);
    });
  }, [userId]);

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.green }}>
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
            <Text style={s.backBtn}>← Back</Text>
          </TouchableOpacity>
          <Text style={s.topTitle}>Missed Connections</Text>
          <View style={{ width: 60 }} />
        </View>
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}
      >
        <View style={s.drawer}>
          <View style={s.handle} />

          <Text style={s.explainer}>
            People you've shared an invite with — but never actually played with yet.
          </Text>

          <Text style={s.sectionLabel}>Almost Pals</Text>

          <View style={s.card}>
            {loading ? null : almostPals.length === 0 ? (
              <View style={s.empty}>
                <Text style={s.emptyText}>No missed connections. You've played with everyone!</Text>
              </View>
            ) : (
              almostPals.map((pal, i) => {
                const p = pal.profile;
                const n = pal.invites_together ?? 1;
                return (
                  <View key={`${pal.user_a_id}-${pal.user_b_id}`} style={[s.row, i < almostPals.length - 1 && s.rowBorder]}>
                    <Avatar
                      initials={p?.initials ?? '?'}
                      bg={p?.avatar_color ?? Colors.green}
                      textColor={p?.avatar_text_color ?? Colors.cream}
                      uri={p?.avatar_url ?? null}
                      size={36}
                      borderWidth={0}
                      borderColor="transparent"
                    />
                    <View style={s.info}>
                      <Text style={s.name}>{p?.name ?? 'Player'}</Text>
                      {p?.location ? <Text style={s.sub}>{p.location}</Text> : null}
                    </View>
                    <Text style={s.almostCount}>
                      {n} {n === 1 ? 'almost-round' : 'almost-rounds'}
                    </Text>
                  </View>
                );
              })
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.green },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  backBtn: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: 'rgba(216,214,175,0.6)',
    minWidth: 60,
  },
  topTitle: {
    fontFamily: Fonts.serifMedium,
    fontSize: 18,
    color: Colors.cream,
  },

  scroll: {},
  drawer: {
    backgroundColor: Colors.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    minHeight: 500,
    paddingHorizontal: 16,
    paddingTop: 22,
  },
  handle: {
    width: 32,
    height: 3,
    backgroundColor: '#d8d4c0',
    borderRadius: 4,
    alignSelf: 'center',
    marginBottom: 20,
  },

  explainer: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: Colors.muted,
    lineHeight: 19,
    marginBottom: 24,
    textAlign: 'center',
    paddingHorizontal: 16,
  },

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
  },
  empty: {
    paddingVertical: 28,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: Colors.muted,
    textAlign: 'center',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  rowBorder: {
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  info: { flex: 1 },
  name: {
    fontFamily: Fonts.sansMedium,
    fontSize: 14,
    color: Colors.text,
    marginBottom: 1,
  },
  sub: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: Colors.muted,
  },
  almostCount: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: Colors.muted,
    fontStyle: 'italic',
  },
});
