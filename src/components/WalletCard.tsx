import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppCard } from './ui';
import { getMyWallet, WalletServiceError } from '../services/wallet';
import type { Wallet } from '../types/wallet';
import { colors, radius, spacing, typography } from '../theme/tokens';

type WalletCardProps = { onPress?: () => void; refreshKey?: number; compact?: boolean; embedded?: boolean; variant?: 'default' | 'home' };

function formatGemnAmount(value: number) {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatGemn(value: number) {
  return `${formatGemnAmount(value)} GEMN`;
}

export function WalletCard({ onPress, refreshKey = 0, compact = false, embedded = false, variant = 'default' }: WalletCardProps) {
  const [wallet, setWallet] = React.useState<Wallet | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const result = await getMyWallet();
      setWallet(result.wallet);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof WalletServiceError ? loadError.message : 'Não foi possível consultar sua carteira.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(React.useCallback(() => { void load(); }, [load, refreshKey]));
  const homeVariant = compact && variant === 'home';

  const body = (
    <View style={[styles.body, embedded && styles.embeddedBody, compact && !embedded && styles.compactBody, homeVariant && styles.homeCompactBody]}>
      <View style={styles.heading}>
        <MaterialCommunityIcons name="wallet-outline" size={18} color={embedded ? colors.white : homeVariant ? colors.gemn : colors.brand} />
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82} style={[styles.label, !embedded && (homeVariant ? styles.homeLabel : styles.labelSurface)]}>{embedded ? 'MINHA CARTEIRA' : homeVariant ? 'Minha carteira' : 'SUA CARTEIRA'}</Text>
        {homeVariant ? <MaterialCommunityIcons name="chevron-right" size={18} color={colors.gemn} /> : null}
      </View>
      {loading ? (
        <View style={styles.feedback}><ActivityIndicator color={embedded ? colors.white : homeVariant ? colors.gemn : colors.brand} /><Text style={[styles.feedbackText, !embedded && (homeVariant ? styles.homeFeedbackText : styles.feedbackTextSurface)]}>Consultando saldo...</Text></View>
      ) : error ? (
        <View style={styles.feedback}><MaterialCommunityIcons name="alert-circle-outline" size={22} color={embedded ? colors.white : homeVariant ? colors.white : colors.error} /><Text style={[styles.feedbackText, !embedded && (homeVariant ? styles.homeFeedbackText : styles.feedbackTextSurface)]}>{error}</Text></View>
      ) : (
        <>
          {homeVariant ? (
            <>
              <View style={styles.balanceRow}>
                <View style={styles.balanceItem}>
                  <Text style={[styles.moneyLabel, styles.homeMoneyLabel, styles.balanceMoneyLabel]}>Disponível</Text>
                  <View style={styles.valueRow}><Text style={[styles.money, styles.homeMoney, styles.moneyCompact]}>{formatGemnAmount(wallet?.saldoDisponivel ?? 0)}</Text><View style={styles.gemnPill}><MaterialCommunityIcons name="star-four-points" size={11} color={colors.gemn} /><Text style={styles.gemnPillText}>GEMN</Text></View></View>
                </View>
                <View style={styles.balanceDivider} />
                <View style={styles.balanceItem}>
                  <Text style={[styles.moneyLabel, styles.homeMoneyLabel, styles.balanceMoneyLabel]}>Reservado</Text>
                  <View style={styles.valueRow}><Text style={[styles.money, styles.homeMoney, styles.moneyCompact]}>{formatGemnAmount(wallet?.saldoReservado ?? 0)}</Text><View style={styles.gemnPill}><MaterialCommunityIcons name="star-four-points" size={11} color={colors.gemn} /><Text style={styles.gemnPillText}>GEMN</Text></View></View>
                </View>
              </View>
              {(wallet?.saldoARecuperar ?? 0) > 0 ? <Text style={styles.homeRecovery}>A recuperar: {formatGemn(wallet?.saldoARecuperar ?? 0)}</Text> : null}
            </>
          ) : compact && !embedded ? (
            <>
              <View style={styles.balanceRow}>
                <View style={styles.balanceItem}>
                  <Text style={[styles.moneyLabel, styles.moneyLabelSurface, homeVariant && styles.homeMoneyLabel, styles.balanceMoneyLabel]}>Saldo disponível</Text>
                  <Text style={[styles.money, styles.moneySurface, homeVariant && styles.homeMoney, styles.moneyCompact]}>{formatGemn(wallet?.saldoDisponivel ?? 0)}</Text>
                </View>
                <View style={[styles.balanceDivider, homeVariant && styles.homeBalanceDivider]} />
                <View style={styles.balanceItem}>
                  <Text style={[styles.moneyLabel, styles.moneyLabelSurface, homeVariant && styles.homeMoneyLabel, styles.balanceMoneyLabel]}>Saldo reservado</Text>
                  <Text style={[styles.money, styles.moneySurface, homeVariant && styles.homeMoney, styles.moneyCompact]}>{formatGemn(wallet?.saldoReservado ?? 0)}</Text>
                </View>
              </View>
              {(wallet?.saldoARecuperar ?? 0) > 0 ? <Text style={[styles.recovery, homeVariant && styles.homeRecovery]}>A recuperar: {formatGemn(wallet?.saldoARecuperar ?? 0)}</Text> : null}
            </>
          ) : (
            <>
              <Text style={[styles.moneyLabel, !embedded && styles.moneyLabelSurface]}>Saldo disponível</Text>
              <Text style={[styles.money, !embedded && styles.moneySurface]}>{formatGemn(wallet?.saldoDisponivel ?? 0)}</Text>
              {!embedded ? <>
                <View style={styles.divider} />
                <View style={styles.gemnBlock}><View style={styles.gemnIcon}><MaterialCommunityIcons name="lock-outline" size={18} color={colors.gemn} /></View><View style={styles.gemnCopy}><Text style={styles.gemnLabel}>Saldo reservado</Text><Text style={styles.gemnValue}>{formatGemn(wallet?.saldoReservado ?? 0)}</Text></View></View>
                {(wallet?.saldoARecuperar ?? 0) > 0 ? <Text style={styles.recovery}>A recuperar: {formatGemn(wallet?.saldoARecuperar ?? 0)}</Text> : null}
                <Text style={styles.disclaimer}>1 GEMN = R$ 1,00 em desconto. Não disponível para saque.</Text>
              </> : null}
            </>
          )}
        </>
      )}
      {embedded ? <View style={styles.detailsAction}><Text style={styles.detailsText}>Ver detalhes</Text><MaterialCommunityIcons name="arrow-right" size={16} color={colors.white} /></View> : null}
    </View>
  );

  if (embedded) {
    return <Pressable accessibilityRole="button" accessibilityLabel="Ver detalhes da minha carteira" onPress={onPress} style={({ pressed }) => [styles.embeddedPressable, pressed && styles.pressed]}>{body}</Pressable>;
  }

  const content = <AppCard padding={0} style={[styles.wallet, compact && styles.walletCompact, compact && variant === 'home' && styles.homeWallet]}>{body}</AppCard>;
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel="Abrir carteira GEMN" onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>{content}</Pressable> : content;
}

const styles = StyleSheet.create({
  wallet: { padding: 0, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  walletCompact: { borderRadius: radius.lg },
  body: { padding: spacing.lg },
  compactBody: { padding: spacing.md },
  homeCompactBody: { padding: spacing.smMd, paddingTop: spacing.smMd },
  embeddedPressable: { borderTopWidth: 1, borderTopColor: colors.brandDivider },
  embeddedBody: { padding: spacing.lg, paddingTop: spacing.md },
  pressed: { opacity: 0.9 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minWidth: 0 },
  label: { ...typography.caption, color: colors.brandLight, fontWeight: '700', letterSpacing: 0.8, flex: 1, minWidth: 0, flexShrink: 1 },
  labelSurface: { color: colors.brandDark },
  homeLabel: { color: colors.white, textTransform: 'none', letterSpacing: 0.2 },
  moneyLabel: { ...typography.caption, color: colors.brandLight, marginTop: spacing.md },
  moneyLabelSurface: { color: colors.textSecondary },
  money: { ...typography.display, fontSize: 32, lineHeight: 40, color: colors.white },
  moneySurface: { color: colors.text },
  homeMoney: { color: colors.white },
  moneyCompact: { fontSize: 26, lineHeight: 34 },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minWidth: 0 },
  gemnPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: spacing.xs, minHeight: 20, borderRadius: radius.full, backgroundColor: colors.gemnLight },
  gemnPillText: { ...typography.caption, color: colors.brandDark, fontSize: 10, lineHeight: 13, fontWeight: '700' },
  balanceRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm, gap: spacing.md },
  balanceItem: { flex: 1, minWidth: 0 },
  balanceDivider: { width: 1, height: 40, backgroundColor: colors.border },
  homeBalanceDivider: { backgroundColor: colors.brandDivider },
  balanceMoneyLabel: { marginTop: 0 },
  homeMoneyLabel: { color: colors.brandLight, opacity: 0.82 },
  divider: { height: 1, backgroundColor: colors.brandDivider, marginVertical: spacing.md },
  gemnBlock: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  gemnIcon: { width: 38, height: 38, borderRadius: radius.md, backgroundColor: colors.gemnLight, alignItems: 'center', justifyContent: 'center' },
  gemnCopy: { gap: 2 },
  gemnLabel: { ...typography.bodySmall, color: colors.textSecondary },
  gemnValue: { ...typography.heading3, color: colors.text },
  recovery: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.sm },
  homeRecovery: { color: colors.brandDark, opacity: 0.72 },
  disclaimer: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.md },
  feedback: { minHeight: 64, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.md },
  feedbackText: { ...typography.caption, color: colors.white, textAlign: 'center' },
  feedbackTextSurface: { color: colors.textSecondary },
  homeFeedbackText: { color: colors.white },
  detailsAction: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.md },
  detailsText: { ...typography.caption, color: colors.white, fontWeight: '700' },
  homeWallet: { backgroundColor: 'transparent', borderWidth: 0, borderTopWidth: 1, borderTopColor: colors.brandDivider, borderRadius: 0 },
});
