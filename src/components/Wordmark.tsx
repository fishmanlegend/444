import React from 'react';
import { Image, StyleSheet } from 'react-native';

const WORDMARK = require('../../assets/images/wordmark.png');

export function Wordmark({ size = 26 }: { size?: number }) {
  // PNG is 588×119 ≈ 4.94:1
  const height = size * 1.68;
  const width = height * (588 / 119);
  return <Image source={WORDMARK} style={[s.img, { width, height }]} resizeMode="contain" />;
}

const s = StyleSheet.create({
  img: {},
});
