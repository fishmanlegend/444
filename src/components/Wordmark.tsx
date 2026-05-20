import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';

export function Wordmark({ size = 26 }: { size?: number }) {
  const dotSize = Math.round(size * 0.28);
  return (
    <View style={s.row}>
      <Text style={[s.text, { fontSize: size, lineHeight: size * 1.15, letterSpacing: size * 0.135 }]}>CC</Text>
      <View style={[s.dot, { width: dotSize, height: dotSize, borderRadius: dotSize / 2, marginLeft: size * 0.20, marginBottom: size * 0.46 }]} />
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  text: {
    fontFamily: 'Georgia',
    color: Colors.cream,
  },
  dot: {
    backgroundColor: '#6b7f65',
  },
});
