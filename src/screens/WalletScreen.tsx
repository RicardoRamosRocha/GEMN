import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppButton, AppCard, AppHeader, AppScreen } from '../components/ui';
import { getMyWallet, WalletServiceError } from '../services/wallet';
import type { Wallet, WalletTransaction, WalletTransactionType } from '../types/wallet';
import { colors, layout, radius, shadows, spacing, typography } from '../theme/tokens';

const transactionLabels: Record<WalletTransactionType, string> = {
  cashback_credito: 'Cashback creditado', reserva_gemn: 'GEMN reservado', liberacao_reserva: 'Reserva liberada', debito_gemn: 'GEMN utilizado', credito_venda_gemn: 'Crédito de venda GEMN', estorno_gemn: 'GEMN estornado', estorno_cashback: 'Cashback estornado', cashback_divida_criada: 'Dívida de cashback criada', cashback_recuperacao: 'Recuperação de cashback', ajuste_administrativo: 'Ajuste administrativo', compensacao_simulada: 'Compensação simulada',
};
function formatGemn(value: number) { return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} GEMN`; }
function formatDate(value: string) { return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); }
function transactionIcon(type: WalletTransactionType) { return type.includes('reserva') ? 'lock-outline' as const : type.includes('debito') ? 'arrow-up-circle-outline' as const : type.includes('estorno') || type.includes('liberacao') ? 'undo-variant' as const : 'arrow-down-circle-outline' as const; }
function transactionColor(type: WalletTransactionType) { return type === 'reserva_gemn' || type === 'debito_gemn' ? colors.gemn : colors.brand; }

export default function WalletScreen({ navigation }: any) {
  const { width } = useWindowDimensions();
  const wide = width >= layout.breakpoints.tablet;
  const [wallet, setWallet] = React.useState<Wallet | null>(null);
  const [transactions, setTransactions] = React.useState<WalletTransaction[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [cashbackFilterActive, setCashbackFilterActive] = React.useState(false);
  const load = React.useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try { const result = await getMyWallet(); setWallet(result.wallet); setTransactions(result.transactions); setError(null); }
    catch (loadError) { setError(loadError instanceof WalletServiceError ? loadError.message : 'Não foi possível consultar sua carteira.'); }
    finally { if (refresh) setRefreshing(false); else setLoading(false); }
  }, []);
  useFocusEffect(React.useCallback(() => { void load(); }, [load]));
  const hasWallet = Boolean(wallet);
  const visibleTransactions = cashbackFilterActive ? transactions.filter((transaction) => transaction.tipo.includes('cashback')) : transactions;

  return <AppScreen scroll edges={['top', 'right', 'bottom', 'left']} contentContainerStyle={styles.content}>
    <AppHeader
      title="Minha carteira"
      subtitle="Acompanhe seus saldos e movimentações GEMN."
      onBack={() => navigation?.goBack()}
      action={<Pressable accessibilityRole="button" accessibilityLabel="Atualizar carteira" accessibilityState={{ busy: refreshing, disabled: loading || refreshing }} style={styles.refreshButton} disabled={loading || refreshing} onPress={() => { void load(true); }}><MaterialCommunityIcons name="refresh" size={21} color={loading || refreshing ? colors.textMuted : colors.brand} /></Pressable>}
    />
    {wallet && !error && !loading ? <View style={styles.balanceCard}>
      <View style={styles.balanceHeading}><View style={styles.balanceIcon}><MaterialCommunityIcons name="wallet-outline" size={19} color={colors.brand} /></View><Text style={styles.balanceHeadingText}>Saldo GEMN</Text></View>
      <Text style={styles.balanceLabel}>Saldo disponível</Text><Text style={styles.balanceValue}>{formatGemn(wallet.saldoDisponivel)}</Text>
      <View style={styles.secondaryBalances}><View style={styles.secondaryItem}><Text style={styles.secondaryLabel}>Saldo reservado</Text><Text style={styles.secondaryValue}>{formatGemn(wallet.saldoReservado)}</Text></View>{wallet.saldoARecuperar > 0 ? <View style={styles.secondaryItem}><Text style={styles.secondaryLabel}>A recuperar</Text><Text style={styles.secondaryValue}>{formatGemn(wallet.saldoARecuperar)}</Text></View> : null}</View>
      {wallet.saldoARecuperar > 0 ? <Text style={styles.recoveryNote}>Valor pendente de recuperação conforme as movimentações da carteira.</Text> : null}
      <Text style={styles.disclaimer}>1 GEMN = R$ 1,00 em desconto. Não disponível para saque.</Text>
    </View> : null}
    {wallet && !error && !loading ? <>
      <View style={styles.quickActions}>
        <Pressable accessibilityRole="button" accessibilityLabel={cashbackFilterActive ? 'Remover filtro de cashback' : 'Filtrar movimentações de cashback'} accessibilityState={{ selected: cashbackFilterActive }} style={[styles.quickAction, cashbackFilterActive && styles.quickActionActive]} onPress={() => setCashbackFilterActive((current) => !current)}><View style={[styles.quickIcon, cashbackFilterActive && styles.quickIconActive]}><MaterialCommunityIcons name="cash-plus" size={19} color={colors.brand} /></View><Text style={[styles.quickText, cashbackFilterActive && styles.quickTextActive]}>Cashback</Text><MaterialCommunityIcons name={cashbackFilterActive ? 'check-circle-outline' : 'chevron-right'} size={18} color={cashbackFilterActive ? colors.brand : colors.textMuted} /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Usar GEMN no Marketplace" style={styles.quickAction} onPress={() => navigation.getParent()?.navigate('Marketplace', { screen: 'MarketplaceHome' })}><View style={styles.quickIcon}><MaterialCommunityIcons name="storefront-outline" size={19} color={colors.brand} /></View><Text style={styles.quickText}>Usar GEMN</Text><MaterialCommunityIcons name="chevron-right" size={18} color={colors.textMuted} /></Pressable>
      </View>
      {cashbackFilterActive ? <View style={styles.filterNotice}><View style={styles.filterNoticeCopy}><MaterialCommunityIcons name="filter-variant" size={17} color={colors.brand} /><Text style={styles.filterNoticeText}>Cashback · {visibleTransactions.length} {visibleTransactions.length === 1 ? 'movimentação' : 'movimentações'}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Mostrar todas as movimentações" onPress={() => setCashbackFilterActive(false)} style={styles.clearFilter}><Text style={styles.clearFilterText}>Ver todas</Text></Pressable></View> : null}
    </> : null}
    {error ? <AppCard style={styles.feedbackCard}><MaterialCommunityIcons name="alert-circle-outline" size={36} color={colors.error} /><Text accessibilityRole="alert" style={styles.feedbackTitle}>Não foi possível carregar a carteira</Text><Text style={styles.feedbackText}>{error}</Text><AppButton title="Tentar novamente" variant="outline" onPress={() => { void load(true); }} /></AppCard> : loading ? <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={styles.feedbackText}>Carregando carteira...</Text></View> : !hasWallet ? <AppCard style={styles.feedbackCard}><MaterialCommunityIcons name="wallet-outline" size={42} color={colors.primary} /><Text style={styles.feedbackTitle}>Carteira ainda não disponível</Text><Text style={styles.feedbackText}>Seu saldo GEMN aparecerá aqui quando houver uma carteira registrada.</Text></AppCard> : visibleTransactions.length === 0 ? <AppCard style={styles.feedbackCard}><MaterialCommunityIcons name="receipt-text-outline" size={42} color={colors.primary} /><Text style={styles.feedbackTitle}>{cashbackFilterActive ? 'Nenhuma movimentação de cashback' : 'Nenhuma movimentação'}</Text><Text style={styles.feedbackText}>{cashbackFilterActive ? 'Não há movimentações de cashback nesta carteira.' : 'Suas movimentações GEMN aparecerão aqui.'}</Text>{cashbackFilterActive ? <AppButton title="Ver todas as movimentações" size="compact" variant="outline" onPress={() => setCashbackFilterActive(false)} /> : null}</AppCard> : <View style={[styles.list, wide && styles.listWide]}>{visibleTransactions.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} />)}</View>}
  </AppScreen>;
}

function TransactionRow({ transaction }: { transaction: WalletTransaction }) {
  const color = transactionColor(transaction.tipo);
  const label = `${transactionLabels[transaction.tipo]}. ${formatGemn(transaction.valor)}. ${transaction.descricao}. ${formatDate(transaction.criadoEm)}.`;
  return <View accessible accessibilityRole="text" accessibilityLabel={label}><AppCard style={styles.transaction}><View style={[styles.transactionIcon, { backgroundColor: color === colors.gemn ? colors.gemnLight : colors.brandLight }]}><MaterialCommunityIcons name={transactionIcon(transaction.tipo)} size={21} color={color} /></View><View style={styles.transactionCopy}><Text style={styles.transactionTitle}>{transactionLabels[transaction.tipo]}</Text><Text style={styles.transactionDescription} numberOfLines={2}>{transaction.descricao}</Text><Text style={styles.transactionDate}>{formatDate(transaction.criadoEm)}</Text></View><Text style={[styles.transactionValue, { color }]}>{formatGemn(transaction.valor)}</Text></AppCard></View>;
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.xs, paddingBottom: spacing.xxl, gap: spacing.md },
  refreshButton: { width: 44, height: 44, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  balanceCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border, ...shadows.subtle },
  balanceHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  balanceIcon: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandLight },
  balanceHeadingText: { ...typography.heading4, color: colors.text },
  balanceLabel: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.md },
  balanceValue: { ...typography.display, color: colors.brandDark, fontSize: 30, lineHeight: 38, marginTop: spacing.xs },
  secondaryBalances: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  secondaryItem: { flex: 1, minWidth: 0 },
  secondaryLabel: { ...typography.caption, color: colors.textSecondary },
  secondaryValue: { ...typography.heading4, color: colors.text, marginTop: spacing.xs },
  recoveryNote: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.sm },
  disclaimer: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.md },
  quickActions: { flexDirection: 'row', gap: spacing.sm },
  quickAction: { flex: 1, minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, ...shadows.subtle },
  quickActionActive: { backgroundColor: colors.brandLight, borderColor: colors.brand },
  quickIcon: { width: 34, height: 34, borderRadius: radius.md, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  quickIconActive: { backgroundColor: colors.surface },
  quickText: { ...typography.heading4, color: colors.text, flex: 1 },
  quickTextActive: { color: colors.brandDark },
  filterNotice: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, paddingHorizontal: spacing.smMd, borderRadius: radius.md, backgroundColor: colors.brandLight, borderWidth: 1, borderColor: colors.border },
  filterNoticeCopy: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  filterNoticeText: { ...typography.caption, color: colors.brandDark, fontWeight: '600' },
  clearFilter: { minHeight: 32, justifyContent: 'center', paddingHorizontal: spacing.xs },
  clearFilterText: { ...typography.caption, color: colors.brandDark, fontWeight: '700' },
  loading: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl }, feedbackCard: { alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.border }, feedbackTitle: { ...typography.heading3, color: colors.text, textAlign: 'center' }, feedbackText: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center' }, list: { gap: spacing.sm }, listWide: { maxWidth: 1120, width: '100%', alignSelf: 'center' }, transaction: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderColor: colors.border }, transactionIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }, transactionCopy: { flex: 1, minWidth: 0, gap: 2 }, transactionTitle: { ...typography.label, color: colors.text }, transactionDescription: { ...typography.caption, color: colors.textSecondary }, transactionDate: { ...typography.caption, color: colors.textMuted }, transactionValue: { ...typography.label, textAlign: 'right' },
});
