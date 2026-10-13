import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppButton, AppCard, AppScreen } from '../components/ui';
import { getMyWallet, WalletServiceError } from '../services/wallet';
import type { WalletTransaction, WalletTransactionType } from '../types/wallet';
import { colors, layout, radius, spacing, typography } from '../theme/tokens';

const transactionLabels: Record<WalletTransactionType, string> = {
  cashback_credito: 'Cashback creditado', reserva_gemn: 'GEMN reservado', liberacao_reserva: 'Reserva liberada', debito_gemn: 'GEMN utilizado', credito_venda_gemn: 'Crédito de venda GEMN', estorno_gemn: 'GEMN estornado', estorno_cashback: 'Cashback estornado', cashback_divida_criada: 'Dívida de cashback criada', cashback_recuperacao: 'Recuperação de cashback', ajuste_administrativo: 'Ajuste administrativo', compensacao_simulada: 'Compensação simulada',
};
function formatGemn(value: number) { return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} GEMN`; }
function formatDate(value: string) { return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); }
function transactionIcon(type: WalletTransactionType) { return type.includes('reserva') ? 'lock-outline' as const : type.includes('debito') ? 'arrow-up-circle-outline' as const : type.includes('estorno') || type.includes('liberacao') ? 'undo-variant' as const : 'arrow-down-circle-outline' as const; }
function transactionColor(type: WalletTransactionType) { return type === 'reserva_gemn' || type === 'debito_gemn' ? colors.warning : colors.success; }

export default function WalletScreen({ navigation }: any) {
  const { width } = useWindowDimensions();
  const wide = width >= layout.breakpoints.tablet;
  const [transactions, setTransactions] = React.useState<WalletTransaction[]>([]);
  const [hasWallet, setHasWallet] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const load = React.useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try { const result = await getMyWallet(); setHasWallet(Boolean(result.wallet)); setTransactions(result.transactions); setError(null); }
    catch (loadError) { setError(loadError instanceof WalletServiceError ? loadError.message : 'Não foi possível consultar sua carteira.'); }
    finally { if (refresh) setRefreshing(false); else setLoading(false); }
  }, []);
  useFocusEffect(React.useCallback(() => { void load(); }, [load]));

  return <AppScreen scroll edges={['bottom']} contentContainerStyle={styles.content}>
    <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="Voltar" style={styles.backButton} onPress={() => navigation?.goBack()}><MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} /></Pressable><View style={styles.headerCopy}><Text style={styles.eyebrow}>Moeda social</Text><Text style={styles.title}>Minha carteira</Text><Text style={styles.subtitle}>Acompanhe seus saldos e movimentações GEMN.</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Atualizar carteira" style={styles.refreshButton} disabled={loading || refreshing} onPress={() => { void load(true); }}><MaterialCommunityIcons name="refresh" size={22} color={loading || refreshing ? colors.textSecondary : colors.primary} /></Pressable></View>
    {error ? <AppCard style={styles.feedbackCard}><MaterialCommunityIcons name="alert-circle-outline" size={36} color={colors.error} /><Text accessibilityRole="alert" style={styles.feedbackTitle}>Não foi possível carregar a carteira</Text><Text style={styles.feedbackText}>{error}</Text><AppButton title="Tentar novamente" variant="outline" onPress={() => { void load(true); }} /></AppCard> : loading ? <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={styles.feedbackText}>Carregando carteira...</Text></View> : !hasWallet ? <AppCard style={styles.feedbackCard}><MaterialCommunityIcons name="wallet-outline" size={42} color={colors.primary} /><Text style={styles.feedbackTitle}>Carteira ainda não disponível</Text><Text style={styles.feedbackText}>Seu saldo GEMN aparecerá aqui quando houver uma carteira registrada.</Text></AppCard> : transactions.length === 0 ? <AppCard style={styles.feedbackCard}><MaterialCommunityIcons name="receipt-text-outline" size={42} color={colors.primary} /><Text style={styles.feedbackTitle}>Nenhuma movimentação</Text><Text style={styles.feedbackText}>Suas movimentações GEMN aparecerão aqui.</Text></AppCard> : <View style={[styles.list, wide && styles.listWide]}>{transactions.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} />)}</View>}
  </AppScreen>;
}

function TransactionRow({ transaction }: { transaction: WalletTransaction }) {
  const color = transactionColor(transaction.tipo);
  return <AppCard style={styles.transaction}><View style={[styles.transactionIcon, { backgroundColor: color === colors.warning ? colors.secondaryLight : colors.primaryLight }]}><MaterialCommunityIcons name={transactionIcon(transaction.tipo)} size={21} color={color} /></View><View style={styles.transactionCopy}><Text style={styles.transactionTitle}>{transactionLabels[transaction.tipo]}</Text><Text style={styles.transactionDescription} numberOfLines={2}>{transaction.descricao}</Text><Text style={styles.transactionDate}>{formatDate(transaction.criadoEm)}</Text></View><Text style={[styles.transactionValue, { color }]}>{formatGemn(transaction.valor)}</Text></AppCard>;
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.lg }, header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }, backButton: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }, refreshButton: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }, headerCopy: { flex: 1, gap: spacing.xs }, eyebrow: { ...typography.caption, color: colors.textSecondary }, title: { ...typography.heading1, color: colors.text }, subtitle: { ...typography.bodySmall, color: colors.textSecondary }, loading: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl }, feedbackCard: { alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.border }, feedbackTitle: { ...typography.heading3, color: colors.text, textAlign: 'center' }, feedbackText: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center' }, list: { gap: spacing.sm }, listWide: { maxWidth: 900, width: '100%', alignSelf: 'center' }, transaction: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderColor: colors.border }, transactionIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }, transactionCopy: { flex: 1, minWidth: 0, gap: 2 }, transactionTitle: { ...typography.label, color: colors.text }, transactionDescription: { ...typography.caption, color: colors.textSecondary }, transactionDate: { ...typography.caption, color: colors.textMuted }, transactionValue: { ...typography.label, textAlign: 'right' },
});
