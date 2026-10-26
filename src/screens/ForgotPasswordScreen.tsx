import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions } from 'react-native';

import { AppButton, AppCard, AppInput, AppScreen } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { colors, layout, spacing, typography } from '../theme/tokens';

export default function ForgotPasswordScreen({ navigation }: any) {
  const { width } = useWindowDimensions();
  const wide = width >= layout.breakpoints.tablet;
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError('');
    setNotice('');
    const normalizedEmail = email.trim();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      setError('Informe um e-mail válido.');
      return;
    }

    setSubmitting(true);
    const result = await requestPasswordReset(normalizedEmail);
    setSubmitting(false);
    if (result.error) {
      setError('Não foi possível enviar o e-mail agora. Tente novamente.');
      return;
    }
    setNotice('Se houver uma conta associada a este e-mail, enviaremos instruções para recuperar o acesso.');
  }

  return (
    <AppScreen scroll maxWidth={520} contentContainerStyle={styles.content}>
      <Pressable accessibilityRole="button" accessibilityLabel="Voltar para entrar" onPress={() => navigation.navigate('Login')} hitSlop={8}>
        <Text style={styles.back}>‹ Voltar</Text>
      </Pressable>
      <Text style={styles.eyebrow}>Recuperação de acesso</Text>
      <Text style={styles.title}>Esqueci minha senha</Text>
      <Text style={styles.subtitle}>Informe seu e-mail e enviaremos um link seguro para redefinir sua senha.</Text>

      <AppCard style={styles.card}>
        <AppInput
          label="E-mail"
          value={email}
          onChangeText={setEmail}
          placeholder="voce@email.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="emailAddress"
          icon="email-outline"
          containerStyle={styles.field}
        />
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        <AppButton title="Enviar link" variant="accent" fullWidth={!wide} onPress={handleSubmit} loading={submitting} style={[styles.button, wide && styles.buttonWide]} />
      </AppCard>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'center', paddingTop: spacing.xl, paddingBottom: spacing.xl },
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
});
