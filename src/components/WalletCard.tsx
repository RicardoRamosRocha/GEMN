import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppCard } from './ui';
import { getMyWallet, WalletServiceError } from '../services/wallet';
import type { Wallet } from '../types/wallet';
import { colors, radius, spacing, typography } from '../theme/tokens';

type WalletCardProps = { onPress?: () => void; refreshKey?: number };
function formatGemn(value: number) { return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} GEMN`; }

export function WalletCard({ onPress, refreshKey = 0 }: WalletCardProps) {
  const [wallet, setWallet] = React.useState<Wallet | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const load = React.useCallback(async () => {
    setLoading(true);
    try { const result = await getMyWallet(); setWallet(result.wallet); setError(null); }
    catch (loadError) { setError(loadError instanceof WalletServiceError ? loadError.message : 'Não foi possível consultar sua carteira.'); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(React.useCallback(() => { void load(); }, [load, refreshKey]));
  const content = <AppCard style={styles.wallet}>
    <View style={styles.heading}><MaterialCommunityIcons name="wallet-outline" size={18} color={colors.white} /><Text style={styles.label}>CARTEIRA GEMN</Text></View>
    {loading ? <View style={styles.feedback}><ActivityIndicator color={colors.white} /><Text style={styles.feedbackText}>Consultando saldo...</Text></View> : error ? <View style={styles.feedback}><MaterialCommunityIcons name="alert-circle-outline" size={22} color={colors.white} /><Text style={styles.feedbackText}>{error}</Text></View> : <>
      <Text style={styles.moneyLabel}>Saldo disponível para descontos</Text>
      <Text style={styles.money}>{formatGemn(wallet?.saldoDisponivel ?? 0)}</Text>
      <View style={styles.divider} />
      <View style={styles.gemnBlock}><View style={styles.gemnIcon}><MaterialCommunityIcons name="lock-outline" size={18} color="#886512" /></View><View style={styles.gemnCopy}><Text style={styles.gemnLabel}>Saldo reservado</Text><Text style={styles.gemnValue}>{formatGemn(wallet?.saldoReservado ?? 0)}</Text></View></View>
      {(wallet?.saldoARecuperar ?? 0) > 0 ? <Text style={styles.recovery}>A recuperar: {formatGemn(wallet?.saldoARecuperar ?? 0)}</Text> : null}
      <Text style={styles.disclaimer}>1 GEMN = R$ 1,00 em desconto. Não disponível para saque.</Text>
    </>}
  </AppCard>;
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel="Abrir carteira GEMN" onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>{content}</Pressable> : content;
}

const styles = StyleSheet.create({
  wallet: { padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.primary, borderWidth: 0, overflow: 'hidden' },
  pressed: { opacity: 0.9 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { ...typography.caption, color: '#DCE7FF', fontWeight: '700', letterSpacing: 0.8 },
  moneyLabel: { ...typography.caption, color: '#C9D9FF', marginTop: spacing.md },
  money: { ...typography.display, fontSize: 32, lineHeight: 40, color: colors.white },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.22)', marginVertical: spacing.md },
  gemnBlock: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  gemnIcon: { width: 38, height: 38, borderRadius: radius.md, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center' },
  gemnCopy: { gap: 2 },
  gemnLabel: { ...typography.bodySmall, color: '#E8F0FF' },
  gemnValue: { ...typography.heading3, color: colors.white },
  recovery: { ...typography.caption, color: '#C9D9FF', marginTop: spacing.sm },
  disclaimer: { ...typography.caption, color: '#C9D9FF', marginTop: spacing.md },
  feedback: { minHeight: 72, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.md },
  feedbackText: { ...typography.caption, color: colors.white, textAlign: 'center' },
});
