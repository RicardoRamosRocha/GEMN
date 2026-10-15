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
import { colors, layout, radius, shadows, spacing, typography } from '../theme/tokens';

type SellerStatus = 'ativo' | 'suspenso';
type SellerDashboardData = {
  seller: Omit<SellerDashboardFixture['seller'], 'aceitaGemn'> & { aceitaGemn: boolean | null };
  listingsCount: number;
  ordersCount: number | null;
  confirmedOrdersCount: number | null;
  cashbackPercentual: number | null;
};

type SellerRow = {
  id: string;
  nome_negocio: string;
  descricao: string;
  telefone: string;
  status: SellerStatus;
};

type CashbackRuleRow = { percentual: number | string };

type OptionalResourceState = 'available' | 'unavailable' | 'error';

function resourceState(error: unknown): OptionalResourceState {
  const record = typeof error === 'object' && error !== null ? error as { code?: unknown; status?: unknown; message?: unknown } : {};
  const code = typeof record.code === 'string' ? record.code : '';
  const status = record.status === 401 || record.status === 403 ? record.status : undefined;
  const message = typeof record.message === 'string' ? record.message.toLowerCase() : String(error).toLowerCase();
  if (status || code === '401' || code === '403' || code === '42501' || message.includes('permission denied') || message.includes('row-level security') || message.includes('not authorized')) return 'error';
  if (code === '42P01' || code === '42703' || code === 'PGRST202' || code === 'PGRST204' || code === 'PGRST205' || message.includes('does not exist') || message.includes('could not find the table') || message.includes('could not find the function') || message.includes('schema cache')) return 'unavailable';
  return 'error';
}

function diagnosticMessage(error: unknown) {
  const record = typeof error === 'object' && error !== null ? error as { code?: unknown; status?: unknown; message?: unknown } : {};
  const code = typeof record.code === 'string' ? record.code : undefined;
  const status = typeof record.status === 'number' ? record.status : undefined;
  const message = typeof record.message === 'string' ? record.message : String(error);
  return {
    code,
    status,
    message: message
      .replace(/Bearer\s+[^\s]+/gi, 'Bearer <redacted>')
      .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '<email>')
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, '<uuid>'),
  };
}

function reportOptionalFailure(operation: string, error: unknown) {
  if (__DEV__) console.warn(`[SellerDashboard] ${operation} failed`, diagnosticMessage(error));
}

function mapSeller(seller: SellerRow, listingsCount: number, ordersCount: number | null, confirmedOrdersCount: number | null, cashbackPercentual: number | null, aceitaGemn: boolean | null): SellerDashboardData {
  return {
    seller: {
      id: seller.id,
      nomeNegocio: seller.nome_negocio,
      descricao: seller.descricao,
      telefone: seller.telefone,
      status: seller.status,
      aceitaGemn,
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
  const [optionalResourceError, setOptionalResourceError] = React.useState<string | null>(null);

  const loadDashboard = React.useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    setErrorMessage(null);
    setSettingsUnavailable(false);
    setOptionalResourceError(null);

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
      .select('id,nome_negocio,descricao,telefone,status')
      .eq('user_id', user.id)
      .maybeSingle();

    if (sellerError || !seller || (seller.status !== 'ativo' && seller.status !== 'suspenso')) {
      setData(null);
      if (sellerError) {
        reportOptionalFailure('seller-base', sellerError);
        setErrorMessage('Não foi possível consultar os dados da loja. Verifique sua conexão e permissões.');
      } else {
        setErrorMessage('Esta área está disponível somente para vendedores aprovados.');
      }
      if (refresh) setRefreshing(false); else setLoading(false);
      return;
    }

    const sellerRow = seller as SellerRow;
    const { count: listingsCount, error: listingsError } = await supabase
      .from('listings')
      .select('id', { count: 'exact', head: true })
      .eq('seller_id', sellerRow.id);

    if (listingsError) {
      reportOptionalFailure('listings-count', listingsError);
      setData(null);
      setErrorMessage('Não foi possível consultar os produtos da loja. Verifique sua conexão e permissões.');
      if (refresh) setRefreshing(false); else setLoading(false);
      return;
    }

    const [acceptanceResult, ordersResult, cashbackResult] = await Promise.allSettled([
      supabase.from('sellers').select('aceita_gemn').eq('id', sellerRow.id).maybeSingle(),
      listSellerRelatedOrders(),
      supabase.from('cashback_rules').select('percentual').eq('seller_id', sellerRow.id).is('vigente_ate', null).maybeSingle(),
    ]);

    let aceitaGemn: boolean | null = null;
    if (acceptanceResult.status === 'fulfilled' && !acceptanceResult.value.error) {
      const acceptance = acceptanceResult.value.data as { aceita_gemn?: unknown } | null;
      aceitaGemn = acceptance?.aceita_gemn === true || acceptance?.aceita_gemn === false ? acceptance.aceita_gemn : null;
    } else {
      const acceptanceError = acceptanceResult.status === 'fulfilled' ? acceptanceResult.value.error : acceptanceResult.reason;
      const state = resourceState(acceptanceError);
      reportOptionalFailure('seller-acceptance', acceptanceError);
      if (state === 'unavailable') setOptionalResourceError('A aceitação de GEMN ainda não está disponível nesta versão do banco.');
      else setOptionalResourceError('Não foi possível consultar a aceitação de GEMN.');
    }

    let ordersCount: number | null = null;
    let confirmedOrdersCount: number | null = null;
    if (ordersResult.status === 'fulfilled') {
      ordersCount = ordersResult.value.length;
      confirmedOrdersCount = ordersResult.value.filter((order) => order.orderStatus === 'confirmado').length;
    } else {
      const state = resourceState(ordersResult.reason);
      reportOptionalFailure('seller-related-orders', ordersResult.reason);
      setOptionalResourceError((current) => current ?? (state === 'unavailable' ? 'O histórico de pedidos ainda não está disponível nesta versão do banco.' : 'Não foi possível consultar o histórico de pedidos.'));
    }

    let cashbackPercentual: number | null = null;
    if (cashbackResult.status === 'fulfilled' && !cashbackResult.value.error) {
      const row = cashbackResult.value.data as CashbackRuleRow | null;
      const value = row ? Number(row.percentual) : null;
      cashbackPercentual = value !== null && Number.isFinite(value) ? value : null;
    } else {
      const cashbackError = cashbackResult.status === 'fulfilled' ? cashbackResult.value.error : cashbackResult.reason;
      const state = resourceState(cashbackError);
      reportOptionalFailure('cashback-rule', cashbackError);
      setSettingsUnavailable(true);
      setOptionalResourceError((current) => current ?? (state === 'unavailable' ? 'As regras de cashback ainda não estão disponíveis nesta versão do banco.' : 'Não foi possível consultar a regra de cashback.'));
    }

    setData(mapSeller(
      sellerRow,
      listingsCount ?? 0,
      ordersCount,
      confirmedOrdersCount,
      cashbackPercentual,
      aceitaGemn,
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
      <View style={styles.storeHero}>
      <View style={styles.header}>
        <View style={styles.headerCopy}><Text style={styles.eyebrow}>GEMN · ÁREA DO EMPREENDEDOR</Text><Text style={styles.title}>Minha Loja</Text><Text style={styles.subtitle}>Acompanhe sua operação no GEMN.</Text></View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Atualizar Minha Loja" style={styles.refreshButton} disabled={loading || refreshing} onPress={() => { void loadDashboard(true); }}><MaterialCommunityIcons name="refresh" size={22} color={loading || refreshing ? colors.textSecondary : colors.primary} /></TouchableOpacity>
      </View>

      {fixturesEnabled ? <View style={styles.demoBanner}><MaterialCommunityIcons name="flask-outline" size={18} color={colors.warning} /><Text style={styles.demoBannerText}>Modo de demonstração — dados locais sintéticos</Text></View> : null}

      <AppCard elevated={wide} style={[styles.storeCard, wide && styles.storeCardWide]}>
        <View style={styles.storeIcon}><MaterialCommunityIcons name="storefront-outline" size={34} color={colors.primary} /></View>
        <View style={styles.storeCopy}><Text style={styles.storeName}>{data.seller.nomeNegocio}</Text><View style={styles.statusRow}><AppBadge label={suspended ? 'Suspensa' : 'Ativa'} variant={suspended ? 'warning' : 'success'} /><Text style={styles.storePhone}>{data.seller.telefone}</Text></View><Text style={styles.storeDescription}>{data.seller.descricao}</Text></View>
      </AppCard>
      </View>

      {suspended ? <AppCard style={styles.warningCard}><MaterialCommunityIcons name="alert-outline" size={22} color={colors.warning} /><View style={styles.warningCopy}><Text style={styles.warningTitle}>Loja suspensa</Text><Text style={styles.warningText}>Você pode consultar seus dados e histórico. Publicações e configurações comerciais permanecem restritas pelo banco.</Text></View></AppCard> : null}

      <View style={[styles.metricsGrid, wide && styles.metricsGridWide]}>
        <MetricCard icon="view-grid-outline" label="Anúncios próprios" value={String(data.listingsCount)} wide={wide} />
        <MetricCard icon="clipboard-arrow-down-outline" label="Pedidos relacionados" value={data.ordersCount === null ? 'Indisponível' : String(data.ordersCount)} wide={wide} />
        <MetricCard icon="progress-check" label="Pedidos confirmados" value={data.confirmedOrdersCount === null ? 'Indisponível' : String(data.confirmedOrdersCount)} wide={wide} />
      </View>

      <AppCard style={styles.settingsCard}>
        <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Resumo comercial</Text><Text style={styles.sectionSubtitle}>Somente informações autorizadas para este seller.</Text></View><MaterialCommunityIcons name="shield-check-outline" size={22} color={colors.primary} /></View>
        <View style={styles.settingRow}><View style={styles.settingIcon}><MaterialCommunityIcons name="cash-plus" size={20} color={colors.primary} /></View><View style={styles.settingCopy}><Text style={styles.settingLabel}>Cashback vigente</Text><Text style={styles.settingValue}>{settingsUnavailable ? 'Indisponível nesta versão' : data.cashbackPercentual === null ? 'Não configurado' : `${data.cashbackPercentual.toLocaleString('pt-BR')}%`}</Text></View></View>
        <View style={styles.settingRow}><View style={styles.settingIcon}><MaterialCommunityIcons name="star-four-points-outline" size={20} color={colors.primary} /></View><View style={styles.settingCopy}><Text style={styles.settingLabel}>Aceita GEMN</Text><Text style={styles.settingValue}>{data.seller.aceitaGemn === null ? 'Indisponível nesta versão' : data.seller.aceitaGemn ? 'Sim' : 'Não'}</Text></View></View>
        {settingsUnavailable ? <Text style={styles.helperText}>A regra de cashback não pôde ser consultada. Nenhuma alteração financeira foi executada.</Text> : null}
      </AppCard>

      {optionalResourceError ? <AppCard style={styles.infoCard}><MaterialCommunityIcons name="information-outline" size={22} color={colors.primary} /><Text style={styles.infoText}>{optionalResourceError}</Text></AppCard> : null}

      <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Gerenciamento da loja</Text><Text style={styles.sectionSubtitle}>Acesse as ferramentas do seu negócio.</Text></View></View>
      <AppCard padding={0} style={styles.managementList}>
        <ManagementItem icon="store-edit-outline" title="Personalizar loja" onPress={() => navigation.navigate('SellerStoreBranding')} />
        <ManagementItem icon="cog-outline" title="Configurações da loja" onPress={() => navigation.navigate('SellerStoreSettings')} />
        <ManagementItem icon="view-grid-outline" title="Meus produtos" onPress={() => navigation.navigate('MyProducts')} />
        <ManagementItem icon="clipboard-arrow-down-outline" title="Pedidos recebidos" onPress={() => navigation.navigate('SellerOrders')} last />
      </AppCard>
    </AppScreen>
  );
}

function MetricCard({ icon, label, value, wide }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value: string; wide: boolean }) {
  return <AppCard style={[styles.metricCard, wide && styles.metricCardWide]}><View style={styles.metricIcon}><MaterialCommunityIcons name={icon} size={21} color={colors.primary} /></View><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></AppCard>;
}

function ManagementItem({ icon, title, onPress, last = false }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; onPress: () => void; last?: boolean }) {
  return <TouchableOpacity accessibilityRole="button" style={[styles.managementItem, !last && styles.managementItemBorder]} onPress={onPress}><View style={styles.managementIcon}><MaterialCommunityIcons name={icon} size={20} color={colors.primary} /></View><Text style={styles.managementTitle}>{title}</Text><MaterialCommunityIcons name="chevron-right" size={20} color={colors.textMuted} /></TouchableOpacity>;
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.lg },
  storeHero: { backgroundColor: '#123B7A', borderRadius: radius.xl, overflow: 'hidden', padding: spacing.lg, gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  headerCopy: { flex: 1, gap: spacing.xs },
  eyebrow: { ...typography.caption, color: '#A9DCD0', letterSpacing: 0.7, fontWeight: '700' },
  title: { ...typography.heading1, color: colors.white },
  subtitle: { ...typography.bodySmall, color: '#C9D9FF' },
  refreshButton: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  demoBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, backgroundColor: '#FBF1DF', borderWidth: 1, borderColor: '#F5D9A0' },
  demoBannerText: { ...typography.caption, color: colors.warning, flex: 1 },
  storeCard: { flexDirection: 'row', gap: spacing.md, padding: 0, backgroundColor: 'transparent' },
  storeCardWide: { padding: 0 },
  storeIcon: { width: 64, height: 64, borderRadius: radius.lg, backgroundColor: '#E8F0FF', alignItems: 'center', justifyContent: 'center' },
  storeCopy: { flex: 1, gap: spacing.xs },
  storeName: { ...typography.heading2, color: colors.white },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  storePhone: { ...typography.caption, color: '#C9D9FF' },
  storeDescription: { ...typography.bodySmall, color: '#C9D9FF' },
  warningCard: { flexDirection: 'row', gap: spacing.sm, backgroundColor: '#FBF1DF', borderWidth: 1, borderColor: '#F5D9A0' },
  warningCopy: { flex: 1, gap: spacing.xs },
  warningTitle: { ...typography.heading4, color: colors.warning },
  warningText: { ...typography.bodySmall, color: colors.textSecondary },
  infoCard: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, backgroundColor: colors.primaryLight, borderWidth: 1, borderColor: colors.border },
  infoText: { ...typography.bodySmall, color: colors.textSecondary, flex: 1 },
  metricsGrid: { gap: spacing.md },
  metricsGridWide: { flexDirection: 'row' },
  metricCard: { flex: 1, padding: spacing.md, borderWidth: 1, borderColor: colors.border, gap: spacing.xs, ...shadows.subtle },
  metricCardWide: { minWidth: 0 },
  metricIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  metricValue: { ...typography.heading2, color: colors.primary },
  metricLabel: { ...typography.caption, color: colors.textSecondary },
  settingsCard: { borderWidth: 1, borderColor: colors.border, gap: spacing.md },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  sectionTitle: { ...typography.heading2, color: colors.text },
  sectionSubtitle: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.xs },
  managementList: { width: '100%', overflow: 'hidden', borderWidth: 1, borderColor: colors.border, ...shadows.subtle },
  managementItem: { minHeight: 64, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface },
  managementItemBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  managementIcon: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  managementTitle: { ...typography.heading4, color: '#123B7A', flex: 1 },
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
