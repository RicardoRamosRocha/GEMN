import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { AppBadge, AppButton, AppCard, AppInput, AppScreen } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { colors, radius, spacing, typography } from '../theme/tokens';

type MemberType = 'empreendedor' | 'empresa';
type ApplicationStatus = 'form' | 'pending' | 'approved' | 'rejected';
type FormValues = { nomeNegocio: string; documento: string; responsavel: string; telefone: string; categoria: string; descricao: string };

const initialValues: FormValues = { nomeNegocio: '', documento: '', responsavel: '', telefone: '', categoria: '', descricao: '' };

export default function SellerApplicationScreen() {
  const { user } = useAuth();
  const [status, setStatus] = React.useState<ApplicationStatus>('form');
  const [memberType, setMemberType] = React.useState<MemberType>('empreendedor');
  const [values, setValues] = React.useState(initialValues);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState('');
  const [adminNote, setAdminNote] = React.useState('');

  React.useEffect(() => {
    let mounted = true;
    async function loadApplication() {
      if (!user) { if (mounted) setLoading(false); return; }
      const [{ data: applications, error: applicationError }, { data: seller, error: sellerError }] = await Promise.all([
        supabase.from('seller_applications').select('status, observacao_admin').eq('user_id', user.id).order('criado_em', { ascending: false }).limit(1),
        supabase.from('sellers').select('id, status').eq('user_id', user.id).eq('status', 'ativo').maybeSingle(),
      ]);
      if (!mounted) return;
      if (applicationError || sellerError) {
        setErrorMessage('Não foi possível consultar sua solicitação. Tente novamente.');
        setLoading(false);
        return;
      }
      if (seller) setStatus('approved');
      else {
        const application = applications?.[0];
        if (application?.status === 'pendente') setStatus('pending');
        if (application?.status === 'aprovada') setStatus('approved');
        if (application?.status === 'recusada') { setStatus('rejected'); setAdminNote(application.observacao_admin || ''); }
      }
      setLoading(false);
    }
    loadApplication();
    return () => { mounted = false; };
  }, [user]);

  function updateValue(field: keyof FormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: '' }));
  }

  function validate() {
    const nextErrors: Record<string, string> = {};
    const requiredFields: Array<[keyof FormValues, string]> = [
      ['nomeNegocio', 'Informe o nome do negócio.'],
      ['documento', `Informe o ${memberType === 'empreendedor' ? 'CPF' : 'CNPJ'}.`],
      ['responsavel', 'Informe o responsável.'], ['telefone', 'Informe o telefone.'],
      ['categoria', 'Informe a categoria.'], ['descricao', 'Descreva seu negócio.'],
    ];
    requiredFields.forEach(([field, message]) => { if (!values[field].trim()) nextErrors[field] = message; });
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function submitApplication() {
    if (!user || !validate()) return;
    setSubmitting(true); setErrorMessage('');
    const commonFields = {
      user_id: user.id, tipo_membro: memberType, nome_negocio: values.nomeNegocio.trim(),
      responsavel: values.responsavel.trim(), telefone: values.telefone.trim(), categoria: values.categoria.trim(), descricao: values.descricao.trim(),
    };
    const { error } = memberType === 'empreendedor'
      ? await supabase.from('seller_applications').insert({ ...commonFields, cpf: values.documento.trim() })
      : await supabase.from('seller_applications').insert({ ...commonFields, cnpj: values.documento.trim() });
    setSubmitting(false);
    if (error) {
      if (error.code === '23505') { setStatus('pending'); setErrorMessage('Você já possui uma solicitação em análise.'); }
      else setErrorMessage('Não foi possível enviar sua solicitação. Confira os dados e tente novamente.');
      return;
    }
    setStatus('pending');
  }

  if (loading) return <AppScreen><Text style={styles.loading}>Consultando sua situação...</Text></AppScreen>;
  if (status === 'pending') return <StatusView icon="clock-outline" title="Solicitação em análise" message="Recebemos seus dados. Assim que houver uma decisão, sua situação será atualizada aqui." badge="Pendente" badgeVariant="warning" />;
  if (status === 'approved') return <StatusView icon="check-circle-outline" title="Solicitação aprovada" message="Sua autorização para vender no GEMN foi aprovada." badge="Vendedor aprovado" badgeVariant="success" />;

  return (
    <AppScreen scroll edges={['bottom']} contentContainerStyle={styles.content}>
      <Text style={styles.intro}>Conte um pouco sobre o seu negócio para solicitar autorização para vender no GEMN.</Text>
      {status === 'rejected' ? <AppCard style={styles.rejectedCard}><AppBadge label="Solicitação recusada" variant="warning" /><Text style={styles.rejectedText}>Você pode revisar seus dados e enviar uma nova solicitação.</Text>{adminNote ? <Text style={styles.note}>Observação: {adminNote}</Text> : null}</AppCard> : null}
      <Text style={styles.sectionTitle}>Tipo de vendedor</Text>
      <View style={styles.typeRow}>
        <TypeOption label="Empreendedor" icon="account-outline" selected={memberType === 'empreendedor'} onPress={() => setMemberType('empreendedor')} />
        <TypeOption label="Empresa" icon="domain" selected={memberType === 'empresa'} onPress={() => setMemberType('empresa')} />
      </View>
      <AppCard style={styles.formCard}>
        <AppInput label="Nome do negócio" value={values.nomeNegocio} onChangeText={(value) => updateValue('nomeNegocio', value)} error={errors.nomeNegocio} placeholder="Como seu negócio é conhecido" />
        <AppInput label={memberType === 'empreendedor' ? 'CPF' : 'CNPJ'} value={values.documento} onChangeText={(value) => updateValue('documento', value)} error={errors.documento} placeholder={memberType === 'empreendedor' ? '000.000.000-00' : '00.000.000/0000-00'} keyboardType="numeric" />
        <AppInput label="Responsável" value={values.responsavel} onChangeText={(value) => updateValue('responsavel', value)} error={errors.responsavel} placeholder="Nome do responsável" />
        <AppInput label="Telefone" value={values.telefone} onChangeText={(value) => updateValue('telefone', value)} error={errors.telefone} placeholder="(00) 00000-0000" keyboardType="phone-pad" />
        <AppInput label="Categoria" value={values.categoria} onChangeText={(value) => updateValue('categoria', value)} error={errors.categoria} placeholder="Ex.: alimentação, moda, serviços" />
        <AppInput label="Descrição" value={values.descricao} onChangeText={(value) => updateValue('descricao', value)} error={errors.descricao} placeholder="Apresente seu negócio" multiline />
        {errorMessage ? <Text accessibilityRole="alert" style={styles.error}>{errorMessage}</Text> : null}
        <AppButton title="Enviar solicitação" onPress={submitApplication} loading={submitting} style={styles.submitButton} />
      </AppCard>
    </AppScreen>
  );
}

function TypeOption({ label, icon, selected, onPress }: { label: string; icon: any; selected: boolean; onPress: () => void }) {
  return <Text accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.typeOption, selected && styles.typeOptionSelected]}><MaterialCommunityIcons name={icon} size={20} color={selected ? colors.primary : colors.textSecondary} />{'  '}{label}</Text>;
}

function StatusView({ icon, title, message, badge, badgeVariant }: { icon: any; title: string; message: string; badge: string; badgeVariant: 'success' | 'warning' }) {
  return <AppScreen contentContainerStyle={styles.statusScreen}><View style={styles.statusIcon}><MaterialCommunityIcons name={icon} size={46} color={colors.primary} /></View><AppBadge label={badge} variant={badgeVariant} /><Text style={styles.statusTitle}>{title}</Text><Text style={styles.statusMessage}>{message}</Text></AppScreen>;
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }, intro: { ...typography.body, color: colors.textSecondary }, sectionTitle: { ...typography.heading3, color: colors.text, marginTop: spacing.sm }, typeRow: { flexDirection: 'row', gap: spacing.sm }, typeOption: { flex: 1, minHeight: 52, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, color: colors.textSecondary, textAlign: 'center', textAlignVertical: 'center', ...typography.label }, typeOptionSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight, color: colors.primary }, formCard: { gap: spacing.md, borderWidth: 1, borderColor: colors.border }, rejectedCard: { gap: spacing.sm, borderWidth: 1, borderColor: '#E8D8B7' }, rejectedText: { ...typography.bodySmall, color: colors.text }, note: { ...typography.caption, color: colors.textSecondary }, error: { ...typography.bodySmall, color: colors.error }, submitButton: { marginTop: spacing.xs }, loading: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xxl }, statusScreen: { alignItems: 'center', justifyContent: 'center', gap: spacing.md }, statusIcon: { width: 88, height: 88, borderRadius: radius.full, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' }, statusTitle: { ...typography.heading2, color: colors.text, textAlign: 'center' }, statusMessage: { ...typography.body, color: colors.textSecondary, textAlign: 'center', maxWidth: 480 },
});
