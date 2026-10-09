import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { AppBadge, AppButton, AppCard, AppInput, AppScreen } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { AccessDenied } from './AdminHomeScreen';
import type { SellerApplication } from './AdminSellerApplicationsScreen';
import { colors, radius, spacing, typography } from '../theme/tokens';

type Decision = 'aprovar' | 'recusar';

export default function AdminSellerApplicationDetailScreen({ route, navigation }: any) {
  const { user } = useAuth();
  const applicationId = route?.params?.applicationId as string | undefined;
  const [isAdmin, setIsAdmin] = React.useState<boolean | null>(null);
  const [application, setApplication] = React.useState<SellerApplication | null>(null);
  const [note, setNote] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [processing, setProcessing] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState('');
  const [confirmationDecision, setConfirmationDecision] = React.useState<Decision | null>(null);

  const loadApplication = React.useCallback(async () => {
    if (!user || !applicationId) { setIsAdmin(false); setLoading(false); return; }
    setLoading(true); setErrorMessage('');
    const { data: profile, error: profileError } = await supabase.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
    if (profileError || !profile?.is_admin) { setIsAdmin(false); setLoading(false); return; }
    setIsAdmin(true);
    const { data, error } = await supabase.from('seller_applications').select('id, tipo_membro, nome_negocio, cpf, cnpj, responsavel, telefone, categoria, descricao, criado_em').eq('id', applicationId).maybeSingle();
    if (error || !data) { setErrorMessage('Não foi possível carregar esta solicitação.'); setLoading(false); return; }
    setApplication(data as SellerApplication);
    setLoading(false);
  }, [applicationId, user]);

  useFocusEffect(React.useCallback(() => { loadApplication(); }, [loadApplication]));

  function requestDecision(decision: Decision) {
    if (!application || processing) return;
    setConfirmationDecision(decision);
  }

  async function performDecision(decision: Decision) {
    if (!application || processing) return;
    setProcessing(true);
    setErrorMessage('');
    setConfirmationDecision(null);

    const { error } = await supabase.rpc('review_seller_application', {
      p_application_id: application.id,
      p_decisao: decision,
      p_observacao_admin: note.trim() || null,
    });

    setProcessing(false);
    if (error) {
      setErrorMessage('Não foi possível concluir essa decisão. A solicitação pode já ter sido analisada.');
      return;
    }
    navigation.goBack();
  }

  if (loading && isAdmin === null) return <AppScreen><Text style={styles.feedback}>Carregando solicitação...</Text></AppScreen>;
  if (isAdmin === false) return <AccessDenied />;
  if (!application) return <AppScreen><Text accessibilityRole="alert" style={styles.error}>{errorMessage || 'Solicitação não encontrada.'}</Text></AppScreen>;

  return (
    <>
      <AppScreen scroll edges={['bottom']} contentContainerStyle={styles.content}>
        <View>
          <AppBadge label={application.tipo_membro === 'empresa' ? 'Empresa' : 'Empreendedor'} variant="neutral" />
          <Text style={styles.title}>{application.nome_negocio}</Text>
          <Text style={styles.date}>Solicitada em {new Date(application.criado_em).toLocaleString('pt-BR')}</Text>
        </View>
        <AppCard style={styles.details}>
          <Detail label="Responsável" value={application.responsavel || 'Não informado'} />
          <Detail label="Telefone" value={application.telefone} />
          <Detail label="Categoria" value={application.categoria} />
          <Detail label={application.tipo_membro === 'empresa' ? 'CNPJ' : 'CPF'} value={application.tipo_membro === 'empresa' ? application.cnpj || '' : application.cpf || ''} />
          <Detail label="Descrição" value={application.descricao} />
        </AppCard>
        <AppInput label="Observação administrativa (opcional)" value={note} onChangeText={setNote} placeholder="Adicione uma observação para o histórico" multiline />
        <Text style={styles.warning}><MaterialCommunityIcons name="shield-check-outline" size={16} color={colors.warning} /> A decisão será registrada no banco.</Text>
        {errorMessage ? <Text accessibilityRole="alert" style={styles.error}>{errorMessage}</Text> : null}
        <View style={styles.actions}>
          <AppButton title="Aprovar" onPress={() => requestDecision('aprovar')} loading={processing} disabled={processing} style={styles.actionButton} />
          <AppButton title="Recusar" variant="outline" onPress={() => requestDecision('recusar')} disabled={processing} style={styles.actionButton} />
        </View>
      </AppScreen>
      <DecisionModal decision={confirmationDecision} processing={processing} onCancel={() => setConfirmationDecision(null)} onConfirm={performDecision} />
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <View style={styles.detail}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View>;
}

function DecisionModal({ decision, processing, onCancel, onConfirm }: { decision: Decision | null; processing: boolean; onCancel: () => void; onConfirm: (decision: Decision) => void }) {
  if (!decision) return null;
  const approving = decision === 'aprovar';
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.modalBackdrop}>
        <View accessibilityViewIsModal style={styles.modalCard}>
          <Text style={styles.modalTitle}>{approving ? 'Aprovar solicitação' : 'Recusar solicitação'}</Text>
          <Text style={styles.modalMessage}>{approving ? 'Deseja aprovar esta solicitação?' : 'Deseja recusar esta solicitação?'}</Text>
          <View style={styles.modalActions}>
            <AppButton title="Cancelar" variant="outline" onPress={onCancel} disabled={processing} style={styles.modalButton} />
            <AppButton title={approving ? 'Aprovar' : 'Recusar'} variant={approving ? 'primary' : 'secondary'} onPress={() => onConfirm(decision)} loading={processing} disabled={processing} style={styles.modalButton} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },
  title: { ...typography.heading1, color: colors.text, marginTop: spacing.sm },
  date: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
  details: { gap: spacing.md, borderWidth: 1, borderColor: colors.border },
  detail: { gap: spacing.xs },
  detailLabel: { ...typography.caption, color: colors.textSecondary },
  detailValue: { ...typography.body, color: colors.text },
  warning: { ...typography.caption, color: colors.warning },
  error: { ...typography.bodySmall, color: colors.error },
  actions: { alignSelf: 'flex-start', flexDirection: 'row', gap: spacing.sm },
  actionButton: { minWidth: 120 },
  feedback: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xxl },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.45)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  modalCard: { width: '100%', maxWidth: 440, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  modalTitle: { ...typography.heading3, color: colors.text },
  modalMessage: { ...typography.body, color: colors.textSecondary },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.sm },
  modalButton: { flex: 1 },
});
