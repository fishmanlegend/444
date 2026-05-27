import {
  CormorantGaramond_400Regular,
  CormorantGaramond_500Medium,
  CormorantGaramond_600SemiBold,
} from '@expo-google-fonts/cormorant-garamond';
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
} from '@expo-google-fonts/dm-sans';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '@/context/auth';

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { loading } = useAuth();

  const [fontsLoaded] = useFonts({
    'CormorantGaramond-Regular': CormorantGaramond_400Regular,
    'CormorantGaramond-Medium':  CormorantGaramond_500Medium,
    'CormorantGaramond-SemiBold': CormorantGaramond_600SemiBold,
    'DMSans-Regular':   DMSans_400Regular,
    'DMSans-Medium':    DMSans_500Medium,
    'DMSans-SemiBold':  DMSans_600SemiBold,
  });

  useEffect(() => {
    if (fontsLoaded && !loading) SplashScreen.hideAsync();
  }, [fontsLoaded, loading]);

  // Return null keeps the native splash up while we wait.
  // Never return a raw View here — Expo Router layouts must render a navigator.
  if (!fontsLoaded || loading) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="auth/index" />
      <Stack.Screen name="auth/verify" />
      <Stack.Screen name="create"          options={{ presentation: 'modal' }} />
      <Stack.Screen name="location-search" options={{ presentation: 'modal' }} />
      <Stack.Screen name="poll-setup"      options={{ presentation: 'modal' }} />
      <Stack.Screen name="invite/[id]" />
      <Stack.Screen name="manage/[id]" />
      <Stack.Screen name="event/[id]" />
      <Stack.Screen name="match/[id]" />
      <Stack.Screen name="scorecard/[id]" />
      <Stack.Screen name="skins/[id]" />
      <Stack.Screen name="stableford/[id]" />
      <Stack.Screen name="nines/[id]" />
      <Stack.Screen name="snake/[id]" />
      <Stack.Screen name="nassau/[id]" />
      <Stack.Screen name="wolf/[id]" />
      <Stack.Screen name="banker/[id]" />
      <Stack.Screen name="post-round/[id]" />
      <Stack.Screen name="missed-connections" />
      <Stack.Screen name="play-now" options={{ presentation: 'modal' }} />
      <Stack.Screen name="play-again/[id]" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
