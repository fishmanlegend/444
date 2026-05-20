import { Image } from 'expo-image';
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
  uri?: string | null;
}

export function Avatar({
  initials,
  bg,
  size = 30,
  textColor = '#fff',
  borderColor = Colors.bg,
  borderWidth = 2,
  style,
  uri,
}: AvatarProps) {
  const circleStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    borderColor,
    borderWidth,
  };

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[s.circle, circleStyle, style] as any}
        contentFit="cover"
      />
    );
  }

  return (
    <View
      style={[s.circle, circleStyle, { backgroundColor: bg }, style]}
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
