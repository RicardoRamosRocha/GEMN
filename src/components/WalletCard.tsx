import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppCard } from './ui';
import { getMyWallet, WalletServiceError } from '../services/wallet';
import type { Wallet } from '../types/wallet';
import { colors, radius, spacing, typography } from '../theme/tokens';

type WalletCardProps = { onPress?: () => void; refreshKey?: number; compact?: boolean; embedded?: boolean };

function formatGemn(value: number) {
  return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} GEMN`;
}

export function WalletCard({ onPress, refreshKey = 0, compact = false, embedded = false }: WalletCardProps) {
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

  const body = (
    <View style={[styles.body, embedded && styles.embeddedBody, compact && !embedded && styles.compactBody]}>
      <View style={styles.heading}>
        <MaterialCommunityIcons name="wallet-outline" size={18} color={colors.white} />
        <Text style={styles.label}>{embedded ? 'MINHA CARTEIRA' : 'CARTEIRA GEMN'}</Text>
      </View>
      {loading ? (
        <View style={styles.feedback}><ActivityIndicator color={colors.white} /><Text style={styles.feedbackText}>Consultando saldo...</Text></View>
      ) : error ? (
        <View style={styles.feedback}><MaterialCommunityIcons name="alert-circle-outline" size={22} color={colors.white} /><Text style={styles.feedbackText}>{error}</Text></View>
      ) : (
        <>
          <Text style={styles.moneyLabel}>Saldo disponível</Text>
          <Text style={[styles.money, compact && styles.moneyCompact]}>{formatGemn(wallet?.saldoDisponivel ?? 0)}</Text>
          {!embedded ? <>
            <View style={styles.divider} />
            <View style={styles.gemnBlock}><View style={styles.gemnIcon}><MaterialCommunityIcons name="lock-outline" size={18} color="#886512" /></View><View style={styles.gemnCopy}><Text style={styles.gemnLabel}>Saldo reservado</Text><Text style={styles.gemnValue}>{formatGemn(wallet?.saldoReservado ?? 0)}</Text></View></View>
            {(wallet?.saldoARecuperar ?? 0) > 0 ? <Text style={styles.recovery}>A recuperar: {formatGemn(wallet?.saldoARecuperar ?? 0)}</Text> : null}
            {!compact ? <Text style={styles.disclaimer}>1 GEMN = R$ 1,00 em desconto. Não disponível para saque.</Text> : null}
          </> : null}
        </>
      )}
      {embedded ? <View style={styles.detailsAction}><Text style={styles.detailsText}>Ver detalhes</Text><MaterialCommunityIcons name="arrow-right" size={16} color={colors.white} /></View> : null}
    </View>
  );

  if (embedded) {
    return <Pressable accessibilityRole="button" accessibilityLabel="Ver detalhes da minha carteira" onPress={onPress} style={({ pressed }) => [styles.embeddedPressable, pressed && styles.pressed]}>{body}</Pressable>;
  }

  const content = <AppCard style={[styles.wallet, compact && styles.walletCompact]}>{body}</AppCard>;
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel="Abrir carteira GEMN" onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>{content}</Pressable> : content;
}

const styles = StyleSheet.create({
  wallet: { padding: 0, borderRadius: radius.xl, backgroundColor: colors.primary, borderWidth: 0, overflow: 'hidden' },
  walletCompact: { borderRadius: radius.lg },
  body: { padding: spacing.lg },
  compactBody: { padding: spacing.md },
  embeddedPressable: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.22)' },
  embeddedBody: { padding: spacing.lg, paddingTop: spacing.md },
  pressed: { opacity: 0.9 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { ...typography.caption, color: '#DCE7FF', fontWeight: '700', letterSpacing: 0.8 },
  moneyLabel: { ...typography.caption, color: '#C9D9FF', marginTop: spacing.md },
  money: { ...typography.display, fontSize: 32, lineHeight: 40, color: colors.white },
  moneyCompact: { fontSize: 26, lineHeight: 34 },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.22)', marginVertical: spacing.md },
  gemnBlock: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  gemnIcon: { width: 38, height: 38, borderRadius: radius.md, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center' },
  gemnCopy: { gap: 2 },
  gemnLabel: { ...typography.bodySmall, color: '#E8F0FF' },
  gemnValue: { ...typography.heading3, color: colors.white },
  recovery: { ...typography.caption, color: '#C9D9FF', marginTop: spacing.sm },
  disclaimer: { ...typography.caption, color: '#C9D9FF', marginTop: spacing.md },
  feedback: { minHeight: 64, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.md },
  feedbackText: { ...typography.caption, color: colors.white, textAlign: 'center' },
  detailsAction: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.md },
  detailsText: { ...typography.caption, color: colors.white, fontWeight: '700' },
});
