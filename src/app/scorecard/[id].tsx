import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts } from '@/constants/theme';

export default function ScorecardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <View style={s.root}>
      <Text style={s.label}>Scorecard: {id} — coming soon</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: Fonts.sans, color: Colors.muted },
});
