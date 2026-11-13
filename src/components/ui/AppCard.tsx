import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle, useWindowDimensions } from 'react-native';
import { colors, layout, radius, shadows, spacing } from '../../theme/tokens';

export type AppCardProps = {
  children: React.ReactNode;
  padding?: number;
  elevated?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function AppCard({ children, padding = spacing.lg, elevated = false, style }: AppCardProps) {
  const { width } = useWindowDimensions();
  const responsivePadding = padding === spacing.lg && width < layout.breakpoints.tablet ? spacing.md : padding;
  return <View style={[styles.card, { padding: responsivePadding }, elevated ? shadows.card : null, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
});
