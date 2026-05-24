import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Redirect, router, Tabs } from 'expo-router';
import React from 'react';
import { AppIcon } from '@/components/AppIcon';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const GOLF_BALL_ICON = require('../../../assets/images/golf-ball-plus.png');

import { useAuth } from '@/context/auth';
import { Colors, Fonts } from '@/constants/theme';


function CustomTabBar({ state, navigation, insets }: BottomTabBarProps) {
  const current = state.routes[state.index]?.name;

  return (
    <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
      <TouchableOpacity style={s.tab} onPress={() => navigation.navigate('index')} activeOpacity={0.7}>
        <AppIcon name="house" size={22} tintColor={current === 'index' ? Colors.green : Colors.muted} type="monochrome" />
        <Text style={[s.tabLabel, { color: current === 'index' ? Colors.green : Colors.muted, fontFamily: current === 'index' ? Fonts.sansMedium : Fonts.sans }]}>Home</Text>
      </TouchableOpacity>

      <TouchableOpacity style={s.tab} onPress={() => navigation.navigate('clubs')} activeOpacity={0.7}>
        <AppIcon name="person.2" size={22} tintColor={current === 'clubs' ? Colors.green : Colors.muted} type="monochrome" />
        <Text style={[s.tabLabel, { color: current === 'clubs' ? Colors.green : Colors.muted, fontFamily: current === 'clubs' ? Fonts.sansMedium : Fonts.sans }]}>Clubs</Text>
      </TouchableOpacity>

      <TouchableOpacity style={s.tab} onPress={() => navigation.navigate('profile')} activeOpacity={0.7}>
        <AppIcon name="person" size={22} tintColor={current === 'profile' ? Colors.green : Colors.muted} type="monochrome" />
        <Text style={[s.tabLabel, { color: current === 'profile' ? Colors.green : Colors.muted, fontFamily: current === 'profile' ? Fonts.sansMedium : Fonts.sans }]}>Profile</Text>
      </TouchableOpacity>

      <TouchableOpacity style={s.tab} onPress={() => router.push('/create' as any)} activeOpacity={0.75}>
        <Image source={GOLF_BALL_ICON} style={s.newRoundIcon} />
        <Text style={[s.tabLabel, { color: Colors.muted, fontFamily: Fonts.sans }]}>New round</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    backgroundColor: '#e4e1d5',
    borderTopWidth: 0.5,
    borderTopColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  tabLabel: {
    fontSize: 12,
  },
  newRoundIcon: {
    width: 35,
    height: 35,
  },
});

export default function TabsLayout() {
  // const { session } = useAuth();
  // if (!session) return <Redirect href="/auth" />;

  return (
    <Tabs tabBar={(props) => <CustomTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="clubs" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
