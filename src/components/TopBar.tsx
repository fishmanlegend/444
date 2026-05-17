import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { Wordmark } from './Wordmark';

interface TopBarProps {
  right?: React.ReactNode;
}

export function TopBar({ right }: TopBarProps) {
  return (
    <View style={s.bar}>
      <Wordmark />
      <View style={s.spacer} />
      {right}
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
  spacer: { flex: 1 },
});
