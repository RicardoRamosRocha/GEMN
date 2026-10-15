import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppButton, AppCard, AppScreen } from '../components/ui';
import { getMyWallet, WalletServiceError } from '../services/wallet';
import type { Wallet, WalletTransaction, WalletTransactionType } from '../types/wallet';
import { colors, layout, radius, shadows, spacing, typography } from '../theme/tokens';

const transactionLabels: Record<WalletTransactionType, string> = {
  cashback_credito: 'Cashback creditado', reserva_gemn: 'GEMN reservado', liberacao_reserva: 'Reserva liberada', debito_gemn: 'GEMN utilizado', credito_venda_gemn: 'Crédito de venda GEMN', estorno_gemn: 'GEMN estornado', estorno_cashback: 'Cashback estornado', cashback_divida_criada: 'Dívida de cashback criada', cashback_recuperacao: 'Recuperação de cashback', ajuste_administrativo: 'Ajuste administrativo', compensacao_simulada: 'Compensação simulada',
};
function formatGemn(value: number) { return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} GEMN`; }
function formatDate(value: string) { return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); }
function transactionIcon(type: WalletTransactionType) { return type.includes('reserva') ? 'lock-outline' as const : type.includes('debito') ? 'arrow-up-circle-outline' as const : type.includes('estorno') || type.includes('liberacao') ? 'undo-variant' as const : 'arrow-down-circle-outline' as const; }
function transactionColor(type: WalletTransactionType) { return type === 'reserva_gemn' || type === 'debito_gemn' ? '#F4A340' : '#16866A'; }

export default function WalletScreen({ navigation }: any) {
  const { width } = useWindowDimensions();
  const wide = width >= layout.breakpoints.tablet;
  const [wallet, setWallet] = React.useState<Wallet | null>(null);
  const [transactions, setTransactions] = React.useState<WalletTransaction[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const load = React.useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try { const result = await getMyWallet(); setWallet(result.wallet); setTransactions(result.transactions); setError(null); }
    catch (loadError) { setError(loadError instanceof WalletServiceError ? loadError.message : 'Não foi possível consultar sua carteira.'); }
    finally { if (refresh) setRefreshing(false); else setLoading(false); }
  }, []);
  useFocusEffect(React.useCallback(() => { void load(); }, [load]));
  const hasWallet = Boolean(wallet);

  return <AppScreen scroll edges={['bottom']} contentContainerStyle={styles.content}>
    {wallet && !error && !loading ? <View style={styles.balanceCard}>
      <View style={styles.premiumHeader}><Pressable accessibilityRole="button" accessibilityLabel="Voltar" style={styles.premiumHeaderButton} onPress={() => navigation?.goBack()}><MaterialCommunityIcons name="arrow-left" size={22} color={colors.white} /></Pressable><View style={styles.headerCopy}><Text style={styles.premiumEyebrow}>MOEDA SOCIAL GEMN</Text><Text style={styles.premiumTitle}>Carteira GEMN</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Atualizar carteira" style={styles.premiumHeaderButton} disabled={loading || refreshing} onPress={() => { void load(true); }}><MaterialCommunityIcons name="refresh" size={22} color={loading || refreshing ? '#AFC2E8' : colors.white} /></Pressable></View>
      <Text style={styles.balanceLabel}>Saldo disponível</Text><Text style={styles.balanceValue}>{formatGemn(wallet.saldoDisponivel)}</Text>
      <View style={styles.secondaryBalances}><View><Text style={styles.secondaryLabel}>Saldo reservado</Text><Text style={styles.secondaryValue}>{formatGemn(wallet.saldoReservado)}</Text></View>{wallet.saldoARecuperar > 0 ? <View><Text style={styles.secondaryLabel}>A recuperar</Text><Text style={styles.secondaryValue}>{formatGemn(wallet.saldoARecuperar)}</Text></View> : null}</View>
      {wallet.saldoARecuperar > 0 ? <Text style={styles.recoveryNote}>Valor pendente de recuperação conforme as movimentações da carteira.</Text> : null}
      <Text style={styles.disclaimer}>1 GEMN = R$ 1,00 em desconto. Não disponível para saque.</Text>
    </View> : null}
    {wallet && !error && !loading ? <View style={styles.quickActions}><Pressable accessibilityRole="button" style={styles.quickAction} onPress={() => setTransactions((current) => current.filter((transaction) => transaction.tipo.includes('cashback')))}><View style={styles.quickIcon}><MaterialCommunityIcons name="cash-plus" size={19} color="#16866A" /></View><Text style={styles.quickText}>Cashback</Text><MaterialCommunityIcons name="chevron-right" size={18} color={colors.textMuted} /></Pressable><Pressable accessibilityRole="button" style={styles.quickAction} onPress={() => navigation.getParent()?.navigate('Marketplace', { screen: 'MarketplaceHome' })}><View style={styles.quickIcon}><MaterialCommunityIcons name="storefront-outline" size={19} color="#1D56D8" /></View><Text style={styles.quickText}>Usar GEMN</Text><MaterialCommunityIcons name="chevron-right" size={18} color={colors.textMuted} /></Pressable></View> : null}
    <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="Voltar" style={styles.backButton} onPress={() => navigation?.goBack()}><MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} /></Pressable><View style={styles.headerCopy}><Text style={styles.eyebrow}>Moeda social</Text><Text style={styles.title}>Minha carteira</Text><Text style={styles.subtitle}>Acompanhe seus saldos e movimentações GEMN.</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Atualizar carteira" style={styles.refreshButton} disabled={loading || refreshing} onPress={() => { void load(true); }}><MaterialCommunityIcons name="refresh" size={22} color={loading || refreshing ? colors.textSecondary : colors.primary} /></Pressable></View>
    {error ? <AppCard style={styles.feedbackCard}><MaterialCommunityIcons name="alert-circle-outline" size={36} color={colors.error} /><Text accessibilityRole="alert" style={styles.feedbackTitle}>Não foi possível carregar a carteira</Text><Text style={styles.feedbackText}>{error}</Text><AppButton title="Tentar novamente" variant="outline" onPress={() => { void load(true); }} /></AppCard> : loading ? <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={styles.feedbackText}>Carregando carteira...</Text></View> : !hasWallet ? <AppCard style={styles.feedbackCard}><MaterialCommunityIcons name="wallet-outline" size={42} color={colors.primary} /><Text style={styles.feedbackTitle}>Carteira ainda não disponível</Text><Text style={styles.feedbackText}>Seu saldo GEMN aparecerá aqui quando houver uma carteira registrada.</Text></AppCard> : transactions.length === 0 ? <AppCard style={styles.feedbackCard}><MaterialCommunityIcons name="receipt-text-outline" size={42} color={colors.primary} /><Text style={styles.feedbackTitle}>Nenhuma movimentação</Text><Text style={styles.feedbackText}>Suas movimentações GEMN aparecerão aqui.</Text></AppCard> : <View style={[styles.list, wide && styles.listWide]}>{transactions.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} />)}</View>}
  </AppScreen>;
}

function TransactionRow({ transaction }: { transaction: WalletTransaction }) {
  const color = transactionColor(transaction.tipo);
  return <AppCard style={styles.transaction}><View style={[styles.transactionIcon, { backgroundColor: color === '#F4A340' ? '#FFF4E3' : '#E8F4EF' }]}><MaterialCommunityIcons name={transactionIcon(transaction.tipo)} size={21} color={color} /></View><View style={styles.transactionCopy}><Text style={styles.transactionTitle}>{transactionLabels[transaction.tipo]}</Text><Text style={styles.transactionDescription} numberOfLines={2}>{transaction.descricao}</Text><Text style={styles.transactionDate}>{formatDate(transaction.criadoEm)}</Text></View><Text style={[styles.transactionValue, { color }]}>{formatGemn(transaction.valor)}</Text></AppCard>;
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },
  balanceCard: { backgroundColor: '#123B7A', borderRadius: radius.xl, padding: spacing.lg, ...shadows.card },
  premiumHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  premiumHeaderButton: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  premiumEyebrow: { ...typography.caption, color: '#A9DCD0', letterSpacing: 1, fontWeight: '700' },
  premiumTitle: { ...typography.heading1, color: colors.white, marginTop: spacing.xs },
  balanceLabel: { ...typography.caption, color: '#C9D9FF', marginTop: spacing.lg },
  balanceValue: { ...typography.display, color: colors.white, marginTop: spacing.xs },
  secondaryBalances: { flexDirection: 'row', gap: spacing.xl, marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.2)' },
  secondaryLabel: { ...typography.caption, color: '#C9D9FF' },
  secondaryValue: { ...typography.heading4, color: colors.white, marginTop: spacing.xs },
  recoveryNote: { ...typography.caption, color: '#C9D9FF', marginTop: spacing.sm },
  disclaimer: { ...typography.caption, color: '#C9D9FF', marginTop: spacing.lg },
  quickActions: { flexDirection: 'row', gap: spacing.sm },
  quickAction: { flex: 1, minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, ...shadows.subtle },
  quickIcon: { width: 34, height: 34, borderRadius: radius.md, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  quickText: { ...typography.heading4, color: '#123B7A', flex: 1 },
  header: { display: 'none' },
  backButton: { width: 44, height: 44 }, refreshButton: { width: 44, height: 44 }, headerCopy: { flex: 1, gap: spacing.xs }, eyebrow: { ...typography.caption, color: colors.textSecondary }, title: { ...typography.heading1, color: colors.text }, subtitle: { ...typography.bodySmall, color: colors.textSecondary },
  loading: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl }, feedbackCard: { alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.border }, feedbackTitle: { ...typography.heading3, color: colors.text, textAlign: 'center' }, feedbackText: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center' }, list: { gap: spacing.sm }, listWide: { maxWidth: 1120, width: '100%', alignSelf: 'center' }, transaction: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderColor: colors.border }, transactionIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }, transactionCopy: { flex: 1, minWidth: 0, gap: 2 }, transactionTitle: { ...typography.label, color: colors.text }, transactionDescription: { ...typography.caption, color: colors.textSecondary }, transactionDate: { ...typography.caption, color: colors.textMuted }, transactionValue: { ...typography.label, textAlign: 'right' },
});
