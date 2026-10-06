import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppCard } from './ui';
import { colors, radius, spacing, typography } from '../theme/tokens';

export function WalletCard() {
  return (
    <AppCard style={styles.wallet}>
      <View style={styles.moneyBlock}>
        <View style={styles.heading}><MaterialCommunityIcons name="wallet-outline" size={18} color={colors.primary} /><Text style={styles.label}>SALDO EM REAIS</Text></View>
        <Text style={styles.money}>R$ 150,00</Text>
      </View>
      <View style={styles.divider} />
      <View style={styles.gemnBlock}>
        <View style={styles.gemnIcon}><MaterialCommunityIcons name="star-four-points" size={17} color="#886512" /></View>
        <View style={styles.gemnCopy}><Text style={styles.gemnLabel}>MOEDA SOCIAL GEMN</Text><Text style={styles.gemnValue}>50 GEMN</Text></View>
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  wallet: { flex: 1, minWidth: 220, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  moneyBlock: { gap: spacing.xs },
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { ...typography.caption, color: colors.textSecondary, fontWeight: '700', letterSpacing: 0.5 },
  money: { ...typography.heading2, color: colors.text },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  gemnBlock: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  gemnIcon: { width: 34, height: 34, borderRadius: radius.md, backgroundColor: colors.secondaryLight, alignItems: 'center', justifyContent: 'center' },
  gemnCopy: { gap: 2 },
  gemnLabel: { ...typography.caption, color: colors.textSecondary },
  gemnValue: { ...typography.label, color: '#886512' },
});
