import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { colors, radius, shadows, spacing } from '../../theme/tokens';

export type AppCardProps = {
  children: React.ReactNode;
  padding?: number;
  elevated?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function AppCard({ children, padding = spacing.lg, elevated = false, style }: AppCardProps) {
  return <View style={[styles.card, { padding }, elevated ? shadows.card : null, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg },
});
