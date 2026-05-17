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
      {left ?? <Wordmark />}
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
