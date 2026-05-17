import React from 'react';
import { StyleSheet, View, ViewProps } from 'react-native';

import { Colors } from '@/constants/theme';

interface CardProps extends ViewProps {
  children: React.ReactNode;
}

export function Card({ children, style, ...props }: CardProps) {
  return (
    <View style={[s.card, style]} {...props}>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    borderWidth: 0.5,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 12,
  },
});
