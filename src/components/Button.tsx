import React from 'react';
import { StyleSheet, Text, TouchableOpacity, ViewStyle } from 'react-native';

import { Colors, Fonts } from '@/constants/theme';

type Variant = 'primary' | 'secondary' | 'maybe';

interface ButtonProps {
  label: string;
  variant?: Variant;
  onPress?: () => void;
  style?: ViewStyle;
}

function getBgStyle(variant: Variant) {
  if (variant === 'primary') return s.primary;
  if (variant === 'maybe') return s.maybe;
  return s.secondary;
}

function getTextStyle(variant: Variant) {
  if (variant === 'primary') return s.primaryText;
  if (variant === 'maybe') return s.maybeText;
  return s.secondaryText;
}

export function Button({ label, variant = 'primary', onPress, style }: ButtonProps) {
  return (
    <TouchableOpacity
      style={[s.base, getBgStyle(variant), style]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[s.text, getTextStyle(variant)]}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  base: { borderRadius: 14, padding: 15, alignItems: 'center', marginBottom: 10 },
  primary: { backgroundColor: Colors.green },
  secondary: { backgroundColor: Colors.card, borderWidth: 0.5, borderColor: Colors.border },
  maybe: { backgroundColor: '#f5f0df', borderWidth: 0.5, borderColor: '#e0d8b8' },
  text: { fontFamily: Fonts.sansMedium, fontSize: 14 },
  primaryText: { color: Colors.cream },
  secondaryText: { color: '#aaa' },
  maybeText: { color: '#8a7840' },
});
