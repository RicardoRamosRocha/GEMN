import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { AppBadge, AppButton, AppCard, AppScreen } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { countAdminPendingOrders } from '../services/adminOrders';
import { listAdminCancellationRequests } from '../services/cancellationRequestQueries';
import { isAdminCancellationUiFixturesEnabled, listAdminCancellationFixtureRequests } from '../dev/adminCancellationUiFixtures';
import { colors, layout, radius, spacing, typography } from '../theme/tokens';

type AdminSummary = { pendingOrders: number; pendingCancellations: number; pendingSellerApplications: number };
const EMPTY_SUMMARY: AdminSummary = { pendingOrders: 0, pendingCancellations: 0, pendingSellerApplications: 0 };

export default function AdminHomeScreen({ navigation }: any) {
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const wide = width >= layout.breakpoints.tablet;
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [isAdmin, setIsAdmin] = React.useState<boolean | null>(null);
  const [summary, setSummary] = React.useState<AdminSummary | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const loadSummary = React.useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    setErrorMessage(null);
    try {
      if (!user) {
        setIsAdmin(false);
        setSummary(null);
        return;
      }
      const { data: profile, error: profileError } = await supabase.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
      if (profileError) throw new Error('Não foi possível verificar o acesso administrativo.');
      if (profile?.is_admin !== true) {
        setIsAdmin(false);
        setSummary(null);
        return;
      }
      setIsAdmin(true);
      if (isAdminCancellationUiFixturesEnabled()) {
        setSummary({ ...EMPTY_SUMMARY, pendingCancellations: listAdminCancellationFixtureRequests('pendente').length });
        return;
      }
      const [pendingOrders, pendingCancellations, sellerApplications] = await Promise.all([
        countAdminPendingOrders(),
        listAdminCancellationRequests('pendente'),
        supabase.from('seller_applications').select('id', { count: 'exact', head: true }).eq('status', 'pendente'),
      ]);
      if (sellerApplications.error) throw new Error('Não foi possível carregar as solicitações de vendedores.');
      setSummary({ pendingOrders, pendingCancellations: pendingCancellations.length, pendingSellerApplications: sellerApplications.count ?? 0 });
    } catch (error) {
      setSummary(null);
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível carregar o resumo administrativo.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(React.useCallback(() => { void loadSummary(); }, [loadSummary]));

  if (loading && isAdmin === null) return <AppScreen><View style={styles.feedback}><ActivityIndicator color={colors.primary} /><Text style={styles.feedbackText}>Carregando administração...</Text></View></AppScreen>;
  if (isAdmin === false) return <AccessDenied />;

  const currentSummary = summary ?? EMPTY_SUMMARY;
  return <AppScreen scroll edges={['bottom']} contentContainerStyle={[styles.content, wide && styles.contentWide]}>
    <View style={styles.heading}><View style={styles.headingCopy}><Text style={styles.eyebrow}>GEMN</Text><Text style={styles.title}>Administração</Text><Text style={styles.subtitle}>Gerencie as pendências administrativas do GEMN.</Text></View><View style={styles.headingIcon}><MaterialCommunityIcons name="shield-account-outline" size={25} color={colors.primary} /></View></View>
    {isAdminCancellationUiFixturesEnabled() ? <View style={styles.demoBanner} accessibilityRole="text"><MaterialCommunityIcons name="flask-outline" size={18} color={colors.warning} /><Text style={styles.demoBannerText}>Modo de demonstração — dados sintéticos locais</Text></View> : null}
    {errorMessage ? <AppCard style={styles.errorCard}><MaterialCommunityIcons name="alert-circle-outline" size={20} color={colors.error} /><Text accessibilityRole="alert" style={styles.errorText}>{errorMessage}</Text><AppButton title="Tentar novamente" size="compact" variant="outline" onPress={() => { void loadSummary(true); }} /></AppCard> : null}
    {!errorMessage && summary ? <View style={[styles.menuCard, wide && styles.menuCardWide]}><ActionItem icon="clipboard-text-clock-outline" title="Pedidos pendentes" subtitle="Revise e confirme pagamentos simulados" count={currentSummary.pendingOrders} onPress={() => navigation.navigate('AdminPendingOrders')} /><ActionItem icon="backup-restore" title="Cancelamentos de pedidos" subtitle="Analise solicitações aguardando decisão" count={currentSummary.pendingCancellations} onPress={() => navigation.navigate('AdminCancellationRequests')} /><ActionItem icon="store-clock-outline" title="Solicitações de vendedores" subtitle="Analise novos pedidos de aprovação" count={currentSummary.pendingSellerApplications} onPress={() => navigation.navigate('AdminSellerApplications')} /></View> : null}
    {loading || refreshing ? <View style={styles.refreshing}><ActivityIndicator size="small" color={colors.primary} /><Text style={styles.feedbackText}>Atualizando indicadores...</Text></View> : null}
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Atualizar indicadores administrativos" accessibilityState={{ disabled: loading || refreshing }} disabled={loading || refreshing} onPress={() => { void loadSummary(true); }} style={styles.refreshButton}><MaterialCommunityIcons name="refresh" size={18} color={colors.primary} /><Text style={styles.refreshText}>Atualizar indicadores</Text></TouchableOpacity>
  </AppScreen>;
}

export function AccessDenied() {
  return <AppScreen contentContainerStyle={styles.denied}><MaterialCommunityIcons name="lock-outline" size={48} color={colors.textMuted} /><Text style={styles.deniedTitle}>Acesso restrito</Text><Text style={styles.deniedMessage}>Esta área está disponível somente para administradores.</Text></AppScreen>;
}

function ActionItem({ icon, title, subtitle, count, onPress }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; subtitle: string; count: number; onPress: () => void }) {
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${title}, ${count} pendência${count === 1 ? '' : 's'}`} onPress={onPress} style={styles.actionRow}><View style={styles.actionIcon}><MaterialCommunityIcons name={icon} size={23} color={colors.primary} /></View><View style={styles.actionCopy}><Text style={styles.actionTitle}>{title}</Text><Text style={styles.actionSubtitle}>{subtitle}</Text></View><AppBadge label={String(count)} variant={count > 0 ? 'warning' : 'neutral'} /><MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} /></TouchableOpacity>;
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.lg },
  contentWide: { maxWidth: 980, width: '100%', alignSelf: 'center' },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  headingCopy: { flex: 1, gap: spacing.xs },
  eyebrow: { ...typography.caption, color: colors.textSecondary, letterSpacing: 1 },
  title: { ...typography.heading1, color: colors.text },
  subtitle: { ...typography.bodySmall, color: colors.textSecondary },
  headingIcon: { width: 48, height: 48, borderRadius: radius.full, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  menuCard: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surface },
  menuCardWide: { maxWidth: 760, width: '100%', alignSelf: 'center' },
  actionRow: { minHeight: 72, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  actionIcon: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  actionCopy: { flex: 1, gap: 2 },
  actionTitle: { ...typography.label, color: colors.text },
  actionSubtitle: { ...typography.caption, color: colors.textSecondary },
  feedback: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.xxl },
  feedbackText: { ...typography.bodySmall, color: colors.textSecondary },
  refreshing: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  refreshButton: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: spacing.xs, padding: spacing.sm },
  refreshText: { ...typography.label, color: colors.primary },
  errorCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.error },
  errorText: { ...typography.bodySmall, color: colors.error, flex: 1 },
  demoBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, backgroundColor: '#FBF1DF', borderWidth: 1, borderColor: '#F5D9A0' },
  demoBannerText: { ...typography.caption, color: colors.warning, flex: 1 },
  denied: { alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  deniedTitle: { ...typography.heading2, color: colors.text },
  deniedMessage: { ...typography.body, color: colors.textSecondary, textAlign: 'center', maxWidth: 420 },
});
