import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppCard } from './ui';
import { colors, radius, spacing, typography } from '../theme/tokens';

export function WalletCard() {
  return (
    <AppCard style={styles.wallet}>
      <View style={styles.moneyBlock}>
        <View style={styles.heading}><MaterialCommunityIcons name="wallet-outline" size={18} color={colors.white} /><Text style={styles.label}>CARTEIRA GEMN</Text></View>
        <Text style={styles.moneyLabel}>Saldo em reais · demonstrativo</Text>
        <Text style={styles.money}>R$ 150,00</Text>
      </View>
      <View style={styles.divider} />
      <View style={styles.gemnBlock}>
        <View style={styles.gemnIcon}><MaterialCommunityIcons name="star-four-points" size={18} color="#886512" /></View>
        <View style={styles.gemnCopy}><Text style={styles.gemnLabel}>Moeda social GEMN · demonstrativo</Text><Text style={styles.gemnValue}>50 GEMN</Text></View>
      </View>
      <Text style={styles.disclaimer}>Valores exibidos apenas para representação visual.</Text>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  wallet: { padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.primary, borderWidth: 0, overflow: 'hidden' },
  moneyBlock: { gap: spacing.xs },
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { ...typography.caption, color: '#DCE7FF', fontWeight: '700', letterSpacing: 0.8 },
  moneyLabel: { ...typography.caption, color: '#C9D9FF', marginTop: spacing.sm },
  money: { ...typography.display, fontSize: 36, lineHeight: 44, color: colors.white },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.22)', marginVertical: spacing.md },
  gemnBlock: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  gemnIcon: { width: 38, height: 38, borderRadius: radius.md, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center' },
  gemnCopy: { gap: 2 },
  gemnLabel: { ...typography.bodySmall, color: '#E8F0FF' },
  gemnValue: { ...typography.heading3, color: colors.white },
  disclaimer: { ...typography.caption, color: '#C9D9FF', marginTop: spacing.md },
});
