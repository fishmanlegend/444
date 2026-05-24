import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Fonts } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { redeemClubInvite } from '@/lib/db';

export default function JoinScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!code) { setStatus('error'); setErrorMsg('Invalid invite link.'); return; }
    if (!session) {
      router.replace({ pathname: '/auth', params: { redirect: `/join/${code}` } } as any);
      return;
    }
    redeemClubInvite(code).then((result) => {
      if ('error' in result) {
        const msg =
          result.error.includes('invite_not_found') ? 'Invite link not found.' :
          result.error.includes('invite_expired')   ? 'This invite has expired.' :
          result.error.includes('invite_already_used') ? 'This invite has already been used.' :
          'Something went wrong. Please try again.';
        setErrorMsg(msg);
        setStatus('error');
      } else {
        router.replace(`/club/${result.clubId}` as any);
      }
    });
  }, [code, session]);

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.green }}>
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} activeOpacity={0.7}>
            <Text style={s.back}>← Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <View style={s.center}>
        {status === 'loading' ? (
          <>
            <ActivityIndicator color={Colors.cream} size="large" />
            <Text style={s.loadingText}>Joining club...</Text>
          </>
        ) : (
          <>
            <Text style={s.errorEmoji}>⛳</Text>
            <Text style={s.errorTitle}>{errorMsg}</Text>
            <TouchableOpacity
              style={s.btn}
              onPress={() => router.replace('/(tabs)/clubs' as any)}
              activeOpacity={0.8}
            >
              <Text style={s.btnText}>Go to Clubs</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.green },
  topBar: {
    paddingHorizontal: 16, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center',
  },
  back: { fontFamily: Fonts.sans, fontSize: 13, color: 'rgba(216,214,175,0.6)' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 },
  loadingText: { fontFamily: Fonts.sans, fontSize: 14, color: 'rgba(216,214,175,0.6)', marginTop: 12 },
  errorEmoji: { fontSize: 48 },
  errorTitle: { fontFamily: Fonts.serifMedium, fontSize: 20, color: Colors.cream, textAlign: 'center' },
  btn: {
    backgroundColor: Colors.cream, borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 24, marginTop: 8,
  },
  btnText: { fontFamily: Fonts.sansMedium, fontSize: 14, color: Colors.green },
});
