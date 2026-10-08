import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { AppBadge, AppCard, AppScreen } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { colors, radius, spacing, typography } from '../theme/tokens';

export default function AdminHomeScreen({ navigation }: any) {
  const { user } = useAuth();
  const [loading, setLoading] = React.useState(true);
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [pendingCount, setPendingCount] = React.useState(0);
  const [errorMessage, setErrorMessage] = React.useState('');

  React.useEffect(() => {
    let mounted = true;
    async function loadAdminSummary() {
      if (!user) { if (mounted) setLoading(false); return; }
      const { data: profile, error: profileError } = await supabase.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
      if (!mounted) return;
      if (profileError || !profile?.is_admin) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }
      setIsAdmin(true);
      const { count, error: applicationsError } = await supabase.from('seller_applications').select('id', { count: 'exact', head: true }).eq('status', 'pendente');
      if (!mounted) return;
      if (applicationsError) setErrorMessage('Não foi possível carregar o resumo administrativo.');
      else setPendingCount(count ?? 0);
      setLoading(false);
    }
    loadAdminSummary();
    return () => { mounted = false; };
  }, [user]);

  if (loading) return <AppScreen><Text style={styles.feedback}>Carregando administração...</Text></AppScreen>;
  if (!isAdmin) return <AccessDenied />;

  return (
    <AppScreen scroll edges={['bottom']} contentContainerStyle={styles.content}>
      <View style={styles.heading}><View><Text style={styles.eyebrow}>GEMN</Text><Text style={styles.title}>Administração</Text></View><View style={styles.headingIcon}><MaterialCommunityIcons name="shield-account-outline" size={24} color={colors.primary} /></View></View>
      {errorMessage ? <Text accessibilityRole="alert" style={styles.error}>{errorMessage}</Text> : null}
      <AppCard padding={0} style={styles.menuCard}>
        <ActionItem title="Solicitações de vendedores" subtitle={pendingCount ? `${pendingCount} pendente${pendingCount === 1 ? '' : 's'} para analisar` : 'Nenhuma solicitação pendente'} count={pendingCount} onPress={() => navigation.navigate('AdminSellerApplications')} />
      </AppCard>
    </AppScreen>
  );
}

export function AccessDenied() {
  return <AppScreen contentContainerStyle={styles.denied}><MaterialCommunityIcons name="lock-outline" size={48} color={colors.textMuted} /><Text style={styles.deniedTitle}>Acesso restrito</Text><Text style={styles.deniedMessage}>Esta área está disponível somente para administradores.</Text></AppScreen>;
}

function ActionItem({ title, subtitle, count, onPress }: { title: string; subtitle: string; count: number; onPress: () => void }) {
  return <TouchableOpacity accessibilityRole="button" onPress={onPress} style={styles.actionRow}><View style={styles.actionIcon}><MaterialCommunityIcons name="file-document-outline" size={23} color={colors.primary} /></View><View style={styles.actionCopy}><Text style={styles.actionTitle}>{title}</Text><Text style={styles.actionSubtitle}>{subtitle}</Text></View>{count > 0 ? <AppBadge label={String(count)} variant="warning" /> : null}<MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} /></TouchableOpacity>;
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.lg },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { ...typography.caption, color: colors.textSecondary },
  title: { ...typography.heading1, color: colors.text, marginTop: spacing.xs },
  headingIcon: { width: 48, height: 48, borderRadius: radius.full, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  menuCard: { borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  actionRow: { minHeight: 86, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, position: 'relative' },
  actionIcon: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  actionCopy: { flex: 1, gap: 2 },
  actionTitle: { ...typography.label, color: colors.text },
  actionSubtitle: { ...typography.caption, color: colors.textSecondary },
  feedback: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xxl },
  error: { ...typography.bodySmall, color: colors.error },
  denied: { alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  deniedTitle: { ...typography.heading2, color: colors.text },
  deniedMessage: { ...typography.body, color: colors.textSecondary, textAlign: 'center', maxWidth: 420 },
});
