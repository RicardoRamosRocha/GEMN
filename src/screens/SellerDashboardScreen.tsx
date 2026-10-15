import React from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';

import { AppBadge, AppButton, AppCard, AppScreen } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { isGemnUiFixturesEnabled } from '../dev/ordersUiFixtures';
import { sellerDashboardUiFixture, type SellerDashboardFixture } from '../dev/sellerDashboardUiFixtures';
import { listSellerRelatedOrders } from '../services/cancellationRequestQueries';
import { getSellerBranding } from '../services/sellerBranding';
import { supabase } from '../lib/supabase';
import { colors, layout, radius, shadows, spacing, typography } from '../theme/tokens';

type SellerStatus = 'ativo' | 'suspenso';
type SellerDashboardData = {
  seller: Omit<SellerDashboardFixture['seller'], 'aceitaGemn'> & { aceitaGemn: boolean | null };
  listingsCount: number;
  ordersCount: number | null;
  confirmedOrdersCount: number | null;
  cashbackPercentual: number | null;
  logoUrl?: string;
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

function presentDescription(value: string) {
  return value
    .replace(/\*\*|__|`/g, '')
    .replace(/(^|\n)\s{0,3}#{1,6}\s+/g, '$1')
    .replace(/(^|\n)\s*[-*+]\s+/g, '$1');
}

function mapSeller(seller: SellerRow, listingsCount: number, ordersCount: number | null, confirmedOrdersCount: number | null, cashbackPercentual: number | null, aceitaGemn: boolean | null, logoUrl?: string): SellerDashboardData {
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
    logoUrl,
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
  const [descriptionExpanded, setDescriptionExpanded] = React.useState(false);

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
    let logoUrl: string | undefined;
    try {
      const branding = await getSellerBranding(sellerRow.id);
      logoUrl = branding.branding.logoUrl;
    } catch (brandingError) {
      reportOptionalFailure('seller-branding', brandingError);
    }
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
      logoUrl,
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
  const description = presentDescription(data.seller.descricao);
  const descriptionCanExpand = description.length > 180 || description.split('\n').length > 3;
  const confirmedRatio = data.ordersCount !== null
    && data.confirmedOrdersCount !== null
    && data.ordersCount > 0
    && data.confirmedOrdersCount >= 0
    && data.confirmedOrdersCount <= data.ordersCount
    ? data.confirmedOrdersCount / data.ordersCount
    : null;

  return (
    <AppScreen scroll edges={['top', 'right', 'bottom', 'left']} contentContainerStyle={styles.content}>
      <View style={styles.storeHero}>
      <View style={styles.header}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Voltar para o perfil" style={styles.backButton} onPress={() => { if (navigation?.canGoBack?.()) navigation.goBack(); else navigation?.navigate?.('Perfil', { screen: 'ProfileHome' }); }}><MaterialCommunityIcons name="arrow-left" size={21} color={colors.text} /></TouchableOpacity>
        <View style={styles.headerCopy}><Text style={styles.eyebrow}>GEMN · ÁREA DO EMPREENDEDOR</Text><Text style={styles.title}>Minha Loja</Text><Text style={styles.subtitle}>Acompanhe sua operação no GEMN.</Text></View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Atualizar Minha Loja" style={styles.refreshButton} disabled={loading || refreshing} onPress={() => { void loadDashboard(true); }}><MaterialCommunityIcons name="refresh" size={22} color={loading || refreshing ? colors.textSecondary : colors.primary} /></TouchableOpacity>
      </View>

      {fixturesEnabled ? <View style={styles.demoBanner}><MaterialCommunityIcons name="flask-outline" size={18} color={colors.warning} /><Text style={styles.demoBannerText}>Modo de demonstração — dados locais sintéticos</Text></View> : null}

      <AppCard elevated={wide} style={[styles.storeCard, wide && styles.storeCardWide]}>
        <View style={styles.storeIcon}>{data.logoUrl ? <Image accessibilityLabel={`Logotipo de ${data.seller.nomeNegocio}`} source={{ uri: data.logoUrl }} style={styles.storeLogoImage} /> : <MaterialCommunityIcons name="storefront-outline" size={30} color={colors.brand} />}</View>
        <View style={styles.storeCopy}><Text style={styles.storeName}>{data.seller.nomeNegocio}</Text><View style={styles.statusRow}><AppBadge label={suspended ? 'Suspensa' : 'Ativa'} variant={suspended ? 'warning' : 'success'} /><Text style={styles.storePhone}>{data.seller.telefone}</Text></View><Text style={styles.storeDescription} numberOfLines={descriptionExpanded ? undefined : 3}>{description}</Text>{descriptionCanExpand ? <TouchableOpacity accessibilityRole="button" accessibilityLabel={descriptionExpanded ? 'Mostrar menos da descrição da loja' : 'Mostrar mais da descrição da loja'} onPress={() => setDescriptionExpanded((current) => !current)}><Text style={styles.descriptionToggle}>{descriptionExpanded ? 'Ver menos' : 'Ver mais'}</Text></TouchableOpacity> : null}</View>
      </AppCard>
      </View>

      {suspended ? <AppCard style={styles.warningCard}><MaterialCommunityIcons name="alert-outline" size={22} color={colors.warning} /><View style={styles.warningCopy}><Text style={styles.warningTitle}>Loja suspensa</Text><Text style={styles.warningText}>Você pode consultar seus dados e histórico. Publicações e configurações comerciais permanecem restritas pelo banco.</Text></View></AppCard> : null}

      <AppCard style={styles.overviewCard}>
        <View style={styles.sectionHeader}>
          <View><Text style={styles.sectionTitle}>Visão geral</Text><Text style={styles.sectionSubtitle}>Indicadores da sua operação no GEMN.</Text></View>
          <MaterialCommunityIcons name="chart-box-outline" size={22} color={colors.brand} />
        </View>
        <View style={styles.metricsRow}>
          <MetricCard icon="view-grid-outline" label="Anúncios próprios" value={String(data.listingsCount)} />
          <MetricCard icon="clipboard-arrow-down-outline" label="Pedidos relacionados" value={data.ordersCount === null ? 'Indisponível' : String(data.ordersCount)} />
          <MetricCard icon="progress-check" label="Pedidos confirmados" value={data.confirmedOrdersCount === null ? 'Indisponível' : String(data.confirmedOrdersCount)} />
        </View>
        {confirmedRatio !== null ? <View style={styles.donutSummary}>
          <DonutChart ratio={confirmedRatio} />
          <View style={styles.donutCopy}>
            <Text style={styles.donutTitle}>Pedidos confirmados</Text>
            <Text style={styles.donutValue}>{Math.round(confirmedRatio * 100)}%</Text>
            <Text style={styles.donutDescription}>{data.confirmedOrdersCount} de {data.ordersCount} pedidos relacionados</Text>
          </View>
        </View> : null}
      </AppCard>

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

function MetricCard({ icon, label, value }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value: string }) {
  return <View style={styles.metricCard}><View style={styles.metricIcon}><MaterialCommunityIcons name={icon} size={17} color={colors.brand} /></View><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

function DonutChart({ ratio }: { ratio: number }) {
  const segmentCount = 24;
  const activeSegments = Math.round(ratio * segmentCount);
  return (
    <View accessibilityRole="image" accessibilityLabel={`Pedidos confirmados: ${Math.round(ratio * 100)} por cento`} style={styles.donut}>
      {Array.from({ length: segmentCount }, (_, index) => (
        <View key={index} style={[styles.donutRotation, { transform: [{ rotate: `${index * (360 / segmentCount)}deg` }] }]}>
          <View style={[styles.donutSegment, index < activeSegments ? styles.donutSegmentActive : styles.donutSegmentTrack]} />
        </View>
      ))}
      <View style={styles.donutHole}><Text style={styles.donutPercent}>{Math.round(ratio * 100)}%</Text></View>
    </View>
  );
}

function ManagementItem({ icon, title, onPress, last = false }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; onPress: () => void; last?: boolean }) {
  return <TouchableOpacity accessibilityRole="button" style={[styles.managementItem, !last && styles.managementItemBorder]} onPress={onPress}><View style={styles.managementIcon}><MaterialCommunityIcons name={icon} size={20} color={colors.primary} /></View><Text style={styles.managementTitle}>{title}</Text><MaterialCommunityIcons name="chevron-right" size={20} color={colors.textMuted} /></TouchableOpacity>;
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.lg },
  storeHero: { backgroundColor: colors.surface, borderRadius: radius.xl, overflow: 'hidden', padding: spacing.md, gap: spacing.sm, borderWidth: 1, borderColor: colors.borderStrong, ...shadows.subtle },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.smMd },
  backButton: { width: 40, height: 40, borderRadius: radius.full, backgroundColor: colors.brandLight, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, gap: spacing.xs },
  eyebrow: { ...typography.caption, color: colors.brand, letterSpacing: 0.7, fontWeight: '700' },
  title: { ...typography.heading1, color: colors.brandDark },
  subtitle: { ...typography.bodySmall, color: colors.textSecondary },
  refreshButton: { width: 40, height: 40, borderRadius: radius.full, backgroundColor: colors.brandLight, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  demoBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, backgroundColor: '#FBF1DF', borderWidth: 1, borderColor: '#F5D9A0' },
  demoBannerText: { ...typography.caption, color: colors.warning, flex: 1 },
  storeCard: { flexDirection: 'row', gap: spacing.md, padding: 0, backgroundColor: 'transparent', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  storeCardWide: { padding: 0, paddingTop: spacing.sm },
  storeIcon: { width: 72, height: 72, borderRadius: radius.lg, padding: spacing.xs, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  storeLogoImage: { width: '100%', height: '100%', resizeMode: 'contain' },
  storeCopy: { flex: 1, gap: spacing.xs },
  storeName: { ...typography.heading2, color: colors.text },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  storePhone: { ...typography.caption, color: colors.textSecondary },
  storeDescription: { ...typography.bodySmall, color: colors.textSecondary },
  descriptionToggle: { ...typography.caption, color: colors.brand, fontWeight: '700', marginTop: spacing.xxs },
  warningCard: { flexDirection: 'row', gap: spacing.sm, backgroundColor: '#FBF1DF', borderWidth: 1, borderColor: '#F5D9A0' },
  warningCopy: { flex: 1, gap: spacing.xs },
  warningTitle: { ...typography.heading4, color: colors.warning },
  warningText: { ...typography.bodySmall, color: colors.textSecondary },
  infoCard: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, backgroundColor: colors.primaryLight, borderWidth: 1, borderColor: colors.border },
  infoText: { ...typography.bodySmall, color: colors.textSecondary, flex: 1 },
  overviewCard: { borderWidth: 1, borderColor: colors.border, gap: spacing.md, ...shadows.subtle },
  metricsRow: { flexDirection: 'row', gap: spacing.xs, width: '100%' },
  metricCard: { flex: 1, minWidth: 0, alignItems: 'center', gap: spacing.xxs, paddingVertical: spacing.xs },
  metricIcon: { width: 30, height: 30, borderRadius: radius.full, backgroundColor: colors.brandLight, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xxs },
  metricValue: { ...typography.heading3, color: colors.brandDark },
  metricLabel: { ...typography.caption, color: colors.textSecondary, textAlign: 'center', minHeight: 32 },
  donutSummary: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  donut: { width: 78, height: 78, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  donutRotation: { position: 'absolute', width: 78, height: 78, alignItems: 'center' },
  donutSegment: { width: 7, height: 12, marginTop: 1, borderRadius: radius.full },
  donutSegmentActive: { backgroundColor: colors.brand },
  donutSegmentTrack: { backgroundColor: colors.brandLight },
  donutHole: { width: 54, height: 54, borderRadius: radius.full, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  donutPercent: { ...typography.heading4, color: colors.brandDark },
  donutCopy: { flex: 1, minWidth: 0, gap: spacing.xxs },
  donutTitle: { ...typography.heading4, color: colors.text },
  donutValue: { ...typography.heading2, color: colors.brand },
  donutDescription: { ...typography.caption, color: colors.textSecondary },
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
