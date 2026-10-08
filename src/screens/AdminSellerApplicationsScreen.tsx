import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { AppBadge, AppCard, AppScreen } from '../components/ui';
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
  const [errorMessage, setErrorMessage] = React.useState('');

  const loadApplications = React.useCallback(async () => {
    if (!user) { setIsAdmin(false); setLoading(false); return; }
    setLoading(true); setErrorMessage('');
    const { data: profile, error: profileError } = await supabase.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
    if (profileError || !profile?.is_admin) { setIsAdmin(false); setLoading(false); return; }
    setIsAdmin(true);
    const { data, error } = await supabase.from('seller_applications').select('id, tipo_membro, nome_negocio, cpf, cnpj, responsavel, telefone, categoria, descricao, criado_em').eq('status', 'pendente').order('criado_em', { ascending: true });
    if (error) { setErrorMessage('Não foi possível carregar as solicitações.'); setLoading(false); return; }
    setApplications((data ?? []) as SellerApplication[]);
    setLoading(false);
  }, [user]);

  useFocusEffect(React.useCallback(() => { loadApplications(); }, [loadApplications]));

  if (loading && isAdmin === null) return <AppScreen><Text style={styles.feedback}>Carregando solicitações...</Text></AppScreen>;
  if (isAdmin === false) return <AccessDenied />;

  return <AppScreen scroll edges={['bottom']} contentContainerStyle={styles.content}><View><Text style={styles.title}>Solicitações de vendedores</Text><Text style={styles.subtitle}>Analise os pedidos pendentes de autorização.</Text></View>{errorMessage ? <Text accessibilityRole="alert" style={styles.error}>{errorMessage}</Text> : null}{loading ? <Text style={styles.feedback}>Atualizando...</Text> : applications.length === 0 ? <EmptyState /> : applications.map((application) => <ApplicationItem key={application.id} application={application} onPress={() => navigation.navigate('AdminSellerApplicationDetail', { applicationId: application.id })} />)}</AppScreen>;
}

function ApplicationItem({ application, onPress }: { application: SellerApplication; onPress: () => void }) {
  return <TouchableOpacity accessibilityRole="button" onPress={onPress}><AppCard style={styles.applicationCard}><View style={styles.cardHeader}><AppBadge label={application.tipo_membro === 'empresa' ? 'Empresa' : 'Empreendedor'} variant="neutral" /><Text style={styles.date}>{formatDate(application.criado_em)}</Text></View><Text style={styles.businessName}>{application.nome_negocio}</Text><Text style={styles.detail}>{application.responsavel || 'Responsável não informado'} · {application.categoria}</Text><Text style={styles.description} numberOfLines={2}>{application.descricao}</Text><View style={styles.cardFooter}><Text style={styles.openText}>Ver detalhes</Text><MaterialCommunityIcons name="chevron-right" size={20} color={colors.primary} /></View></AppCard></TouchableOpacity>;
}

function EmptyState() { return <AppCard style={styles.empty}><MaterialCommunityIcons name="check-circle-outline" size={42} color={colors.success} /><Text style={styles.emptyTitle}>Nenhuma solicitação pendente</Text><Text style={styles.emptyText}>Novas solicitações aparecerão aqui para análise.</Text></AppCard>; }
function formatDate(value: string) { return new Date(value).toLocaleDateString('pt-BR'); }

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md }, title: { ...typography.heading1, color: colors.text }, subtitle: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.xs }, applicationCard: { borderWidth: 1, borderColor: colors.border, gap: spacing.sm }, cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, date: { ...typography.caption, color: colors.textMuted }, businessName: { ...typography.heading3, color: colors.text }, detail: { ...typography.bodySmall, color: colors.textSecondary }, description: { ...typography.bodySmall, color: colors.text }, cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: spacing.xs }, openText: { ...typography.label, color: colors.primary }, feedback: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xxl }, error: { ...typography.bodySmall, color: colors.error }, empty: { alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.border, marginTop: spacing.lg }, emptyTitle: { ...typography.heading3, color: colors.text, textAlign: 'center' }, emptyText: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center' },
});
