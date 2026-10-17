import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { AdminScreenHeader, AppBadge, AppCard, AppScreen } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { AccessDenied } from './AdminHomeScreen';
import { colors, radius, spacing, typography } from '../theme/tokens';

export type SellerApplication = { id: string; tipo_membro: 'empreendedor' | 'empresa'; nome_negocio: string; cpf: string | null; cnpj: string | null; responsavel: string | null; telefone: string; categoria: string; descricao: string; criado_em: string; };

export default function AdminSellerApplicationsScreen({ navigation }: any) {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = React.useState<boolean | null>(null);
  const [applications, setApplications] = React.useState<SellerApplication[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState('');

  const loadApplications = React.useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    setErrorMessage('');
    if (!user) { setIsAdmin(false); setLoading(false); setRefreshing(false); return; }
    const { data: profile, error: profileError } = await supabase.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
    if (profileError || profile?.is_admin !== true) { setIsAdmin(false); setLoading(false); setRefreshing(false); return; }
    setIsAdmin(true);
    const { data, error } = await supabase.from('seller_applications').select('id, tipo_membro, nome_negocio, cpf, cnpj, responsavel, telefone, categoria, descricao, criado_em').eq('status', 'pendente').order('criado_em', { ascending: true });
    if (error) setErrorMessage('Não foi possível carregar as solicitações.');
    else setApplications((data ?? []) as SellerApplication[]);
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useFocusEffect(React.useCallback(() => { void loadApplications(); }, [loadApplications]));

  function goBackToAdmin() {
    if (navigation?.canGoBack?.()) navigation.goBack();
    else navigation?.navigate?.('AdminHome');
  }

  if (loading && isAdmin === null) return <AppScreen contentContainerStyle={styles.content}><AdminScreenHeader title="Solicitações de vendedores" subtitle="Analise novos pedidos de aprovação." onBack={goBackToAdmin} onRefresh={() => { void loadApplications(true); }} refreshing={loading || refreshing} refreshLabel="Atualizar solicitações" /><View style={styles.feedback}><ActivityIndicator color={colors.primary} /><Text style={styles.feedbackText}>Carregando solicitações...</Text></View></AppScreen>;
  if (isAdmin === false) return <AccessDenied />;

  return <AppScreen scroll edges={['bottom']} contentContainerStyle={styles.content}><AdminScreenHeader title="Solicitações de vendedores" subtitle="Analise novos pedidos de aprovação." onBack={goBackToAdmin} onRefresh={() => { void loadApplications(true); }} refreshing={loading || refreshing} refreshLabel="Atualizar solicitações" />{errorMessage ? <AppCard style={styles.errorCard}><MaterialCommunityIcons name="alert-circle-outline" size={20} color={colors.error} /><Text accessibilityRole="alert" style={styles.error}>{errorMessage}</Text></AppCard> : null}{loading ? <View style={styles.feedback}><ActivityIndicator color={colors.primary} /><Text style={styles.feedbackText}>Atualizando solicitações...</Text></View> : applications.length === 0 ? <EmptyState /> : applications.map((application) => <ApplicationItem key={application.id} application={application} onPress={() => navigation.navigate('AdminSellerApplicationDetail', { applicationId: application.id })} />)}</AppScreen>;
}

function ApplicationItem({ application, onPress }: { application: SellerApplication; onPress: () => void }) {
  return <TouchableOpacity accessibilityRole="button" onPress={onPress}><AppCard style={styles.applicationCard}><View style={styles.cardHeader}><AppBadge label={application.tipo_membro === 'empresa' ? 'Empresa' : 'Empreendedor'} variant="neutral" /><Text style={styles.date}>{formatDate(application.criado_em)}</Text></View><Text style={styles.businessName}>{application.nome_negocio}</Text><Text style={styles.detail}>{application.responsavel || 'Responsável não informado'} · {application.categoria}</Text><Text style={styles.description} numberOfLines={2}>{application.descricao}</Text><View style={styles.cardFooter}><Text style={styles.openText}>Ver detalhes</Text><MaterialCommunityIcons name="chevron-right" size={20} color={colors.primary} /></View></AppCard></TouchableOpacity>;
}

function EmptyState() { return <AppCard style={styles.empty}><MaterialCommunityIcons name="check-circle-outline" size={42} color={colors.success} /><Text style={styles.emptyTitle}>Nenhuma solicitação pendente</Text><Text style={styles.emptyText}>Novas solicitações aparecerão aqui para análise.</Text></AppCard>; }
function formatDate(value: string) { return new Date(value).toLocaleDateString('pt-BR'); }

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },
  applicationCard: { borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  date: { ...typography.caption, color: colors.textMuted },
  businessName: { ...typography.heading3, color: colors.text },
  detail: { ...typography.bodySmall, color: colors.textSecondary },
  description: { ...typography.bodySmall, color: colors.text },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: spacing.xs },
  openText: { ...typography.label, color: colors.primary },
  feedback: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl },
  feedbackText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  errorCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.error },
  error: { ...typography.bodySmall, color: colors.error, flex: 1 },
  empty: { alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.border, marginTop: spacing.lg },
  emptyTitle: { ...typography.heading3, color: colors.text, textAlign: 'center' },
  emptyText: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center' },
});
