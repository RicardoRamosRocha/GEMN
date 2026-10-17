import React from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { AdminScreenHeader, AppBadge, AppCard, AppScreen } from '../components/ui';
import { listAdminCancellationRequests } from '../services/cancellationRequestQueries';
import type { CancellationRequestQuery } from '../types/cancellationRequestQueries';
import { CancellationRequestServiceError, type CancellationRequestStatus } from '../types/cancellationRequests';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { isAdminCancellationUiFixturesEnabled, listAdminCancellationFixtureRequests } from '../dev/adminCancellationUiFixtures';

function statusLabel(status: CancellationRequestStatus): string {
  return status === 'pendente' ? 'Pendente' : status === 'execucao_falhou' ? 'Execução falhou' : status === 'aprovada' ? 'Aprovada' : 'Rejeitada';
}

function statusVariant(status: CancellationRequestStatus): 'neutral' | 'success' | 'warning' {
  return status === 'aprovada' ? 'success' : status === 'pendente' || status === 'execucao_falhou' ? 'warning' : 'neutral';
}

export default function AdminCancellationRequestsScreen({ navigation }: any) {
  const { width } = useWindowDimensions();
  const [requests, setRequests] = React.useState<CancellationRequestQuery[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState('');

  const load = React.useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    setErrorMessage('');
    if (isAdminCancellationUiFixturesEnabled()) {
      const pending = listAdminCancellationFixtureRequests('pendente');
      const failed = listAdminCancellationFixtureRequests('execucao_falhou');
      setRequests([...pending, ...failed].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)));
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const [pending, failed] = await Promise.all([listAdminCancellationRequests('pendente'), listAdminCancellationRequests('execucao_falhou')]);
      const byId = new Map<string, CancellationRequestQuery>();
      [...pending, ...failed].forEach((request) => byId.set(request.requestId, request));
      setRequests([...byId.values()].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)));
    } catch (error) {
      setErrorMessage(error instanceof CancellationRequestServiceError ? error.message : 'Não foi possível carregar a fila de cancelamentos.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(React.useCallback(() => { void load(); }, [load]));

  function goBackToAdmin() {
    if (navigation?.canGoBack?.()) navigation.goBack();
    else navigation?.navigate?.('AdminHome');
  }

  return <AppScreen edges={['bottom']} contentContainerStyle={styles.screen}>
    <AdminScreenHeader title="Cancelamentos" subtitle="Solicitações aguardando decisão administrativa." onBack={goBackToAdmin} onRefresh={() => { void load(true); }} refreshing={loading || refreshing} refreshLabel="Atualizar cancelamentos" />
    {isAdminCancellationUiFixturesEnabled() ? <View style={styles.demoBanner} accessibilityRole="text"><MaterialCommunityIcons name="flask-outline" size={18} color={colors.warning} /><Text style={styles.demoBannerText}>Modo de demonstração — dados sintéticos locais</Text></View> : null}
    {loading && !refreshing ? <ActivityIndicator color={colors.primary} style={styles.feedback} /> : null}
    {errorMessage ? <AppCard style={styles.errorCard}><MaterialCommunityIcons name="alert-circle-outline" size={20} color={colors.error} /><Text accessibilityRole="alert" style={styles.error}>{errorMessage}</Text></AppCard> : null}
    {!loading && !errorMessage && requests.length === 0 ? <AppCard><Text style={styles.empty}>Nenhuma solicitação pendente ou com falha recuperável.</Text></AppCard> : null}
    <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void load(true); }} />} contentContainerStyle={[styles.list, width >= 760 && styles.listWide]}>
      {requests.map((request) => <TouchableOpacity key={request.requestId} accessibilityRole="button" onPress={() => navigation.navigate('AdminCancellationRequestDetail', { requestId: request.requestId })} style={[styles.itemWrap, width >= 760 && styles.itemWide]}><AppCard style={styles.item}><View style={styles.itemTop}><AppBadge label={statusLabel(request.status)} variant={statusVariant(request.status)} /><Text style={styles.role}>{request.requesterRole}</Text></View><Text style={styles.order}>Pedido {request.orderId.slice(0, 8)}</Text><Text style={styles.reason} numberOfLines={2}>{request.motivoSolicitacao}</Text><Text style={styles.date}>{new Date(request.criadoEm).toLocaleString('pt-BR')}</Text></AppCard></TouchableOpacity>)}
    </ScrollView>
  </AppScreen>;
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },
  list: { gap: spacing.md, paddingBottom: spacing.xl },
  listWide: { flexDirection: 'row', flexWrap: 'wrap' },
  itemWrap: { width: '100%' },
  itemWide: { width: '48%', minWidth: 300 },
  item: { borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  itemTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  role: { ...typography.caption, color: colors.textSecondary, textTransform: 'capitalize' },
  order: { ...typography.label, color: colors.text },
  reason: { ...typography.bodySmall, color: colors.textSecondary },
  date: { ...typography.caption, color: colors.textMuted },
  empty: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  feedback: { marginVertical: spacing.xl },
  errorCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.error },
  error: { ...typography.bodySmall, color: colors.error, flex: 1 },
  demoBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, backgroundColor: '#FBF1DF', borderWidth: 1, borderColor: '#F5D9A0' },
  demoBannerText: { ...typography.caption, color: colors.warning, flex: 1 },
});
