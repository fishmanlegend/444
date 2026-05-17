import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { router, Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Colors, Fonts } from '@/constants/theme';

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
          size={18}
          tintColor={current === 'index' ? Colors.green : '#bbb'}
          type="monochrome"
        />
        <Text
          style={{
            fontFamily: current === 'index' ? Fonts.sansMedium : Fonts.sans,
            fontSize: 10,
            color: current === 'index' ? Colors.green : '#bbb',
          }}
        >
          Home
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={s.fabWrap}
        onPress={() => router.push('/create')}
        activeOpacity={0.8}
      >
        <View style={s.fab}>
          <Text style={s.fabPlus}>+</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={s.tab}
        onPress={() => navigation.navigate('profile')}
        activeOpacity={0.7}
      >
        <SymbolView
          name="person"
          size={18}
          tintColor={current === 'profile' ? Colors.green : '#bbb'}
          type="monochrome"
        />
        <Text
          style={{
            fontFamily: current === 'profile' ? Fonts.sansMedium : Fonts.sans,
            fontSize: 10,
            color: current === 'profile' ? Colors.green : '#bbb',
          }}
        >
          Profile
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
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  fabWrap: {
    flex: 1,
    alignItems: 'center',
    marginTop: -20,
  },
  fab: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: Colors.bg,
  },
  fabPlus: {
    color: Colors.cream,
    fontSize: 22,
    lineHeight: 24,
    fontFamily: Fonts.sans,
  },
});

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <CustomTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
