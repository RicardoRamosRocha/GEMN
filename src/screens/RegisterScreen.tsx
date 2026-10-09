import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { AppButton, AppCard, AppInput, AppScreen } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { colors, layout, radius, spacing, typography } from '../theme/tokens';

export default function RegisterScreen({ navigation }: any) {
  const { width } = useWindowDimensions();
  const wide = width >= layout.breakpoints.tablet;
  const { signUp } = useAuth();
  const [nomeCompleto, setNomeCompleto] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError('');
    setNotice('');

    if (!nomeCompleto.trim()) {
      setError('Informe seu nome completo.');
      return;
    }
    if (!telefone.trim()) {
      setError('Informe seu telefone ou WhatsApp.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setError('Informe um e-mail válido.');
      return;
    }
    if (password.length < 6) {
      setError('A senha precisa ter pelo menos 6 caracteres.');
      return;
    }
    if (password !== confirmation) {
      setError('A senha e a confirmação precisam ser iguais.');
      return;
    }

    setSubmitting(true);
    const result = await signUp({
      email,
      password,
      nomeCompleto,
      telefone,
    });
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setPassword('');
    setConfirmation('');
    if (result.session) return;
    setNotice('Cadastro criado. Verifique seu e-mail para confirmar a conta e depois entre no GEMN.');
  }

  return (
    <AppScreen scroll maxWidth={520} contentContainerStyle={styles.content}>
      <Pressable accessibilityRole="button" accessibilityLabel="Voltar para entrar" onPress={() => navigation.goBack()} hitSlop={8}>
        <Text style={styles.back}>‹ Voltar</Text>
      </Pressable>
      <Text style={styles.eyebrow}>Cadastro de cliente</Text>
      <Text style={styles.title}>Crie sua conta GEMN</Text>
      <Text style={styles.subtitle}>Comece como cliente e participe da comunidade.</Text>

      <AppCard style={styles.card}>
        <AppInput label="Nome completo" value={nomeCompleto} onChangeText={setNomeCompleto} placeholder="Como podemos chamar você?" containerStyle={styles.field} />
        <AppInput label="Telefone ou WhatsApp" value={telefone} onChangeText={setTelefone} placeholder="(00) 00000-0000" keyboardType="phone-pad" containerStyle={styles.field} />
        <AppInput label="E-mail" value={email} onChangeText={setEmail} placeholder="voce@email.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} textContentType="emailAddress" icon="email-outline" containerStyle={styles.field} />
        <AppInput label="Senha" value={password} onChangeText={setPassword} placeholder="Mínimo de 6 caracteres" secureTextEntry textContentType="newPassword" icon="lock-outline" containerStyle={styles.field} />
        <AppInput label="Confirmar senha" value={confirmation} onChangeText={setConfirmation} placeholder="Digite a senha novamente" secureTextEntry textContentType="newPassword" icon="lock-check-outline" containerStyle={styles.field} />
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        <AppButton title="Criar conta" variant="accent" fullWidth={!wide} onPress={handleSubmit} loading={submitting} style={[styles.button, wide && styles.buttonWide]} />
      </AppCard>

      <View style={styles.loginRow}>
        <Text style={styles.loginText}>Já tem uma conta?</Text>
        <Pressable accessibilityRole="button" onPress={() => navigation.navigate('Login')} hitSlop={8}>
          <Text style={styles.loginLink}>Entrar</Text>
        </Pressable>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, paddingTop: spacing.md, paddingBottom: spacing.xl },
  back: { ...typography.label, color: colors.primary, marginBottom: spacing.lg },
  eyebrow: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.xs },
  title: { ...typography.heading1, color: colors.text },
  subtitle: { ...typography.body, color: colors.textSecondary, marginTop: spacing.sm, marginBottom: spacing.lg },
  card: { width: '100%', borderWidth: 1, borderColor: colors.border },
  field: { marginBottom: spacing.md },
  error: { ...typography.bodySmall, color: colors.error, marginBottom: spacing.md },
  notice: { ...typography.bodySmall, color: colors.success, marginBottom: spacing.md },
  button: { marginTop: spacing.xs },
  buttonWide: { width: 320, maxWidth: 320 },
  loginRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.xs, marginTop: spacing.lg },
  loginText: { ...typography.bodySmall, color: colors.textSecondary },
  loginLink: { ...typography.label, color: colors.primary },
});
