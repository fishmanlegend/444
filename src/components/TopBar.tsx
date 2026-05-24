import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { Wordmark } from './Wordmark';

interface TopBarProps {
  left?: React.ReactNode;
  right?: React.ReactNode;
}

export function TopBar({ left, right }: TopBarProps) {
  return (
    <View style={s.bar}>
      <View style={s.side}>{left}</View>
      <View style={s.center}><Wordmark /></View>
      <View style={[s.side, s.sideRight]}>{right}</View>
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    backgroundColor: Colors.green,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  side: {
    width: 80,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  sideRight: {
    alignItems: 'flex-end',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
