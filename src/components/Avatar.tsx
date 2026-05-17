import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';

import { Colors, Fonts } from '@/constants/theme';

interface AvatarProps {
  initials: string;
  bg: string;
  size?: number;
  textColor?: string;
  borderColor?: string;
  borderWidth?: number;
  style?: ViewStyle;
}

export function Avatar({
  initials,
  bg,
  size = 30,
  textColor = '#fff',
  borderColor = Colors.bg,
  borderWidth = 2,
  style,
}: AvatarProps) {
  return (
    <View
      style={[
        s.circle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg,
          borderColor,
          borderWidth,
        },
        style,
      ]}
    >
      <Text style={[s.text, { fontSize: Math.round(size * 0.33), color: textColor }]}>
        {initials}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  text: {
    fontFamily: Fonts.sansSemiBold,
    includeFontPadding: false,
  },
});
