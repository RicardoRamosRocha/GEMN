import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';

import { AppBadge, AppButton, AppCard, AppScreen } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { isGemnUiFixturesEnabled } from '../dev/ordersUiFixtures';
import { sellerDashboardUiFixture, type SellerDashboardFixture } from '../dev/sellerDashboardUiFixtures';
import { listSellerRelatedOrders } from '../services/cancellationRequestQueries';
import { supabase } from '../lib/supabase';
import { colors, layout, radius, spacing, typography } from '../theme/tokens';

type SellerStatus = 'ativo' | 'suspenso';
type SellerDashboardData = Omit<SellerDashboardFixture, 'cashbackPercentual'> & { cashbackPercentual: number | null };

type SellerRow = {
  id: string;
  nome_negocio: string;
  descricao: string;
  telefone: string;
  status: SellerStatus;
  aceita_gemn: boolean;
};

type CashbackRuleRow = { percentual: number | string };

function friendlyError() {
  return 'Não foi possível carregar os dados da Minha Loja. Tente novamente.';
}

function mapSeller(seller: SellerRow, listingsCount: number, ordersCount: number, confirmedOrdersCount: number, cashbackPercentual: number | null): SellerDashboardData {
  return {
    seller: {
      id: seller.id,
      nomeNegocio: seller.nome_negocio,
      descricao: seller.descricao,
      telefone: seller.telefone,
      status: seller.status,
      aceitaGemn: seller.aceita_gemn,
    },
    listingsCount,
    ordersCount,
    confirmedOrdersCount,
    cashbackPercentual,
  };
}

export default function SellerDashboardScreen({ navigation }: any) {
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const wide = width >= layout.breakpoints.tablet;
  const fixturesEnabled = isGemnUiFixturesEnabled();
  const [data, setData] = React.useState<SellerDashboardData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [settingsUnavailable, setSettingsUnavailable] = React.useState(false);

  const loadDashboard = React.useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    setErrorMessage(null);
    setSettingsUnavailable(false);

    if (fixturesEnabled) {
      setData(sellerDashboardUiFixture);
      if (refresh) setRefreshing(false); else setLoading(false);
      return;
    }

    if (!user) {
      setData(null);
      setErrorMessage('É necessário estar autenticado para acessar a Minha Loja.');
      if (refresh) setRefreshing(false); else setLoading(false);
      return;
    }

    const { data: seller, error: sellerError } = await supabase
      .from('sellers')
      .select('id,nome_negocio,descricao,telefone,status,aceita_gemn')
      .eq('user_id', user.id)
      .maybeSingle();

    if (sellerError || !seller || (seller.status !== 'ativo' && seller.status !== 'suspenso')) {
      setData(null);
      setErrorMessage(sellerError ? friendlyError() : 'Esta área está disponível somente para vendedores aprovados.');
      if (refresh) setRefreshing(false); else setLoading(false);
      return;
    }

    const sellerRow = seller as SellerRow;
    let listingsResult: { count: number | null; error: unknown };
    let orders: Awaited<ReturnType<typeof listSellerRelatedOrders>>;
    let cashbackResult: { data: CashbackRuleRow | null; error: unknown };
    try {
      [listingsResult, orders, cashbackResult] = await Promise.all([
        supabase.from('listings').select('id', { count: 'exact', head: true }).eq('seller_id', sellerRow.id),
        listSellerRelatedOrders(),
        supabase.from('cashback_rules').select('percentual').eq('seller_id', sellerRow.id).is('vigente_ate', null).maybeSingle(),
      ]);
    } catch {
      setData(null);
      setErrorMessage(friendlyError());
      if (refresh) setRefreshing(false); else setLoading(false);
      return;
    }

    if (listingsResult.error) {
      setData(null);
      setErrorMessage(friendlyError());
      if (refresh) setRefreshing(false); else setLoading(false);
      return;
    }

    if (cashbackResult.error) setSettingsUnavailable(true);
    const cashbackPercentual = cashbackResult.data
      ? Number((cashbackResult.data as CashbackRuleRow).percentual)
      : null;
    setData(mapSeller(
      sellerRow,
      listingsResult.count ?? 0,
      orders.length,
      orders.filter((order) => order.orderStatus === 'confirmado').length,
      cashbackPercentual !== null && Number.isFinite(cashbackPercentual) ? cashbackPercentual : null,
    ));
    if (refresh) setRefreshing(false); else setLoading(false);
  }, [fixturesEnabled, user]);

  useFocusEffect(React.useCallback(() => {
    void loadDashboard();
  }, [loadDashboard]));

  if (loading && !data) {
    return <AppScreen contentContainerStyle={styles.feedbackState}><ActivityIndicator color={colors.primary} /><Text style={styles.feedbackText}>Carregando sua loja...</Text></AppScreen>;
  }

  if (!data) {
    return <AppScreen contentContainerStyle={styles.feedbackState}><MaterialCommunityIcons name="store-off-outline" size={44} color={colors.textMuted} /><Text style={styles.feedbackTitle}>Minha Loja indisponível</Text><Text accessibilityRole="alert" style={styles.feedbackText}>{errorMessage}</Text><AppButton title="Tentar novamente" variant="outline" onPress={() => { void loadDashboard(true); }} /></AppScreen>;
  }

  const suspended = data.seller.status === 'suspenso';

  return (
    <AppScreen scroll edges={['bottom']} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerCopy}><Text style={styles.eyebrow}>Área do vendedor</Text><Text style={styles.title}>Minha Loja</Text><Text style={styles.subtitle}>Acompanhe sua operação no GEMN.</Text></View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Atualizar Minha Loja" style={styles.refreshButton} disabled={loading || refreshing} onPress={() => { void loadDashboard(true); }}><MaterialCommunityIcons name="refresh" size={22} color={loading || refreshing ? colors.textSecondary : colors.primary} /></TouchableOpacity>
      </View>

      {fixturesEnabled ? <View style={styles.demoBanner}><MaterialCommunityIcons name="flask-outline" size={18} color={colors.warning} /><Text style={styles.demoBannerText}>Modo de demonstração — dados locais sintéticos</Text></View> : null}

      <AppCard elevated={wide} style={[styles.storeCard, wide && styles.storeCardWide]}>
        <View style={styles.storeIcon}><MaterialCommunityIcons name="storefront-outline" size={34} color={colors.primary} /></View>
        <View style={styles.storeCopy}><Text style={styles.storeName}>{data.seller.nomeNegocio}</Text><View style={styles.statusRow}><AppBadge label={suspended ? 'Suspensa' : 'Ativa'} variant={suspended ? 'warning' : 'success'} /><Text style={styles.storePhone}>{data.seller.telefone}</Text></View><Text style={styles.storeDescription}>{data.seller.descricao}</Text></View>
      </AppCard>

      {suspended ? <AppCard style={styles.warningCard}><MaterialCommunityIcons name="alert-outline" size={22} color={colors.warning} /><View style={styles.warningCopy}><Text style={styles.warningTitle}>Loja suspensa</Text><Text style={styles.warningText}>Você pode consultar seus dados e histórico. Publicações e configurações comerciais permanecem restritas pelo banco.</Text></View></AppCard> : null}

      <View style={[styles.metricsGrid, wide && styles.metricsGridWide]}>
        <MetricCard icon="view-grid-outline" label="Anúncios próprios" value={String(data.listingsCount)} wide={wide} />
        <MetricCard icon="clipboard-arrow-down-outline" label="Pedidos relacionados" value={String(data.ordersCount)} wide={wide} />
        <MetricCard icon="progress-check" label="Pedidos confirmados" value={String(data.confirmedOrdersCount)} wide={wide} />
      </View>

      <AppCard style={styles.settingsCard}>
        <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Resumo comercial</Text><Text style={styles.sectionSubtitle}>Somente informações autorizadas para este seller.</Text></View><MaterialCommunityIcons name="shield-check-outline" size={22} color={colors.primary} /></View>
        <View style={styles.settingRow}><View style={styles.settingIcon}><MaterialCommunityIcons name="cash-plus" size={20} color={colors.primary} /></View><View style={styles.settingCopy}><Text style={styles.settingLabel}>Cashback vigente</Text><Text style={styles.settingValue}>{settingsUnavailable ? 'Indisponível nesta versão' : data.cashbackPercentual === null ? 'Não configurado' : `${data.cashbackPercentual.toLocaleString('pt-BR')}%`}</Text></View></View>
        <View style={styles.settingRow}><View style={styles.settingIcon}><MaterialCommunityIcons name="star-four-points-outline" size={20} color={colors.primary} /></View><View style={styles.settingCopy}><Text style={styles.settingLabel}>Aceita GEMN</Text><Text style={styles.settingValue}>{data.seller.aceitaGemn ? 'Sim' : 'Não'}</Text></View></View>
        {settingsUnavailable ? <Text style={styles.helperText}>A regra de cashback não pôde ser consultada. Nenhuma alteração financeira foi executada.</Text> : null}
      </AppCard>

      <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Acessos rápidos</Text><Text style={styles.sectionSubtitle}>Gerencie seus anúncios e acompanhe pedidos.</Text></View></View>
      <View style={[styles.actions, wide && styles.actionsWide]}>
        <AppButton title="Configurações da Loja" variant="outline" fullWidth={!wide} onPress={() => navigation.navigate('SellerStoreSettings')} style={[styles.actionButton, wide && styles.actionButtonWide]} />
        <AppButton title="Meus produtos" variant="outline" fullWidth={!wide} onPress={() => navigation.navigate('MyProducts')} style={[styles.actionButton, wide && styles.actionButtonWide]} />
        <AppButton title="Pedidos recebidos" fullWidth={!wide} onPress={() => navigation.navigate('SellerOrders')} style={[styles.actionButton, wide && styles.actionButtonWide]} />
      </View>
    </AppScreen>
  );
}

function MetricCard({ icon, label, value, wide }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value: string; wide: boolean }) {
  return <AppCard style={[styles.metricCard, wide && styles.metricCardWide]}><View style={styles.metricIcon}><MaterialCommunityIcons name={icon} size={21} color={colors.primary} /></View><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></AppCard>;
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  headerCopy: { flex: 1, gap: spacing.xs },
  eyebrow: { ...typography.caption, color: colors.textSecondary },
  title: { ...typography.heading1, color: colors.text },
  subtitle: { ...typography.bodySmall, color: colors.textSecondary },
  refreshButton: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  demoBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, backgroundColor: '#FBF1DF', borderWidth: 1, borderColor: '#F5D9A0' },
  demoBannerText: { ...typography.caption, color: colors.warning, flex: 1 },
  storeCard: { flexDirection: 'row', gap: spacing.md, borderWidth: 1, borderColor: colors.border },
  storeCardWide: { padding: spacing.xl },
  storeIcon: { width: 64, height: 64, borderRadius: radius.lg, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  storeCopy: { flex: 1, gap: spacing.xs },
  storeName: { ...typography.heading2, color: colors.text },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  storePhone: { ...typography.caption, color: colors.textSecondary },
  storeDescription: { ...typography.bodySmall, color: colors.textSecondary },
  warningCard: { flexDirection: 'row', gap: spacing.sm, backgroundColor: '#FBF1DF', borderWidth: 1, borderColor: '#F5D9A0' },
  warningCopy: { flex: 1, gap: spacing.xs },
  warningTitle: { ...typography.heading4, color: colors.warning },
  warningText: { ...typography.bodySmall, color: colors.textSecondary },
  metricsGrid: { gap: spacing.md },
  metricsGridWide: { flexDirection: 'row' },
  metricCard: { flex: 1, borderWidth: 1, borderColor: colors.border, gap: spacing.xs },
  metricCardWide: { minWidth: 0 },
  metricIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  metricValue: { ...typography.heading2, color: colors.primary },
  metricLabel: { ...typography.caption, color: colors.textSecondary },
  settingsCard: { borderWidth: 1, borderColor: colors.border, gap: spacing.md },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  sectionTitle: { ...typography.heading2, color: colors.text },
  sectionSubtitle: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.xs },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  settingIcon: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  settingCopy: { flex: 1, gap: 2 },
  settingLabel: { ...typography.caption, color: colors.textSecondary },
  settingValue: { ...typography.heading4, color: colors.text },
  helperText: { ...typography.caption, color: colors.textSecondary },
  actions: { gap: spacing.sm },
  actionsWide: { flexDirection: 'row', justifyContent: 'flex-end' },
  actionButton: { minHeight: 52 },
  actionButtonWide: { width: 220, maxWidth: 220 },
  feedbackState: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.xxl },
  feedbackTitle: { ...typography.heading3, color: colors.text, textAlign: 'center' },
  feedbackText: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center' },
});
