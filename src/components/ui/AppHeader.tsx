import React from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, layout, radius, spacing, typography } from '../../theme/tokens';

export type AppHeaderProps = {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  onBack?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function AppHeader({ title, subtitle, action, onBack, style }: AppHeaderProps) {
  const { width } = useWindowDimensions();
  const wide = width >= layout.breakpoints.tablet;
  const [backFocused, setBackFocused] = React.useState(false);

  return (
    <View style={[styles.row, wide && styles.rowWide, style]}>
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Voltar"
          accessibilityHint="Volta para a tela anterior"
          onPress={onBack}
          onFocus={() => setBackFocused(true)}
          onBlur={() => setBackFocused(false)}
          style={({ pressed }) => [styles.back, backFocused && styles.backFocused, pressed && styles.backPressed]}
          hitSlop={8}
        >
          <MaterialCommunityIcons name="arrow-left" size={22} color={backFocused ? colors.brandDark : colors.text} />
        </Pressable>
      ) : null}
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingVertical: spacing.xs, gap: spacing.smMd },
  rowWide: { gap: spacing.md },
  back: { width: 44, height: 44, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  backFocused: { backgroundColor: colors.brandLight, borderWidth: 2, borderColor: colors.brand },
  backPressed: { opacity: 0.72 },
  copy: { flex: 1 },
  title: { ...typography.heading2, color: colors.text },
  subtitle: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.xs },
  action: { alignItems: 'flex-end', justifyContent: 'center' },
});
