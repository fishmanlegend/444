import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Redirect, router, Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import React from 'react';
import { Image as RNImage, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useAuth } from '@/context/auth';
import { Colors, Fonts } from '@/constants/theme';

const GOLF_BALL_ICON = require('../../../assets/images/golf-ball-plus.png');

function CustomTabBar({ state, navigation, insets }: BottomTabBarProps) {
  const current = state.routes[state.index]?.name;

  return (
    <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
      <TouchableOpacity
        style={s.tab}
        onPress={() => navigation.navigate('index')}
        activeOpacity={0.7}
      >
        <SymbolView
          name="house"
          size={22}
          tintColor={current === 'index' ? Colors.green : '#bbb'}
          type="monochrome"
        />
        <Text style={[s.tabLabel, { color: current === 'index' ? Colors.green : '#bbb', fontFamily: current === 'index' ? Fonts.sansMedium : Fonts.sans }]}>
          Home
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={s.tab}
        onPress={() => navigation.navigate('clubs')}
        activeOpacity={0.7}
      >
        <SymbolView
          name="person.2"
          size={22}
          tintColor={current === 'clubs' ? Colors.green : '#bbb'}
          type="monochrome"
        />
        <Text style={[s.tabLabel, { color: current === 'clubs' ? Colors.green : '#bbb', fontFamily: current === 'clubs' ? Fonts.sansMedium : Fonts.sans }]}>
          Clubs
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={s.tab}
        onPress={() => navigation.navigate('profile')}
        activeOpacity={0.7}
      >
        <SymbolView
          name="person"
          size={22}
          tintColor={current === 'profile' ? Colors.green : '#bbb'}
          type="monochrome"
        />
        <Text style={[s.tabLabel, { color: current === 'profile' ? Colors.green : '#bbb', fontFamily: current === 'profile' ? Fonts.sansMedium : Fonts.sans }]}>
          Profile
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={s.tab}
        onPress={() => router.push('/create')}
        activeOpacity={0.8}
      >
        <RNImage source={GOLF_BALL_ICON} style={s.ballIcon} />
        <Text style={[s.tabLabel, { color: '#bbb', fontFamily: Fonts.sans }]}>
          New round
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    backgroundColor: Colors.bg,
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
  ballIcon: {
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
