import React from 'react';
import { StyleSheet, Text } from 'react-native';

import { Colors, Fonts } from '@/constants/theme';

export function Wordmark() {
  return <Text style={s.text}>444.</Text>;
}

const s = StyleSheet.create({
  text: {
    fontFamily: Fonts.serifMedium,
    fontSize: 26,
    color: Colors.cream,
    letterSpacing: 2,
    lineHeight: 30,
  },
});
