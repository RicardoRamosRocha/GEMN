import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions } from 'react-native';

import { AppButton, AppCard, AppInput, AppScreen } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { colors, layout, spacing, typography } from '../theme/tokens';

const MIN_PASSWORD_LENGTH = 10;

function validatePassword(password: string, confirmation: string) {
  if (password.length < MIN_PASSWORD_LENGTH) return `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return 'Use letras e números na senha.';
  if (password !== confirmation) return 'A senha e a confirmação precisam ser iguais.';
  return '';
}

export default function ResetPasswordScreen({ navigation }: any) {
  const { width } = useWindowDimensions();
  const wide = width >= layout.breakpoints.tablet;
  const { passwordRecoveryState, updatePassword, finishPasswordRecovery, dismissPasswordRecovery } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function leaveRecovery() {
    if (passwordRecoveryState === 'ready') {
      const result = await finishPasswordRecovery();
      if (result.error) {
        setError('Não foi possível encerrar esta sessão de recuperação. Tente novamente.');
        return;
      }
    } else {
      dismissPasswordRecovery();
    }
    navigation.navigate('Login');
  }

  async function handleSubmit() {
    setError('');
    setNotice('');
    const validationError = validatePassword(password, confirmation);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    const result = await updatePassword(password);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setPassword('');
    setConfirmation('');
    setNotice('Senha atualizada. Entre novamente para continuar no GEMN.');
  }

  const invalidLink = passwordRecoveryState !== 'ready';

  return (
    <AppScreen scroll maxWidth={520} contentContainerStyle={styles.content}>
      <Pressable accessibilityRole="button" accessibilityLabel="Voltar para entrar" onPress={() => void leaveRecovery()} hitSlop={8}>
        <Text style={styles.back}>‹ Voltar</Text>
      </Pressable>
      <Text style={styles.eyebrow}>Segurança da conta</Text>
      <Text style={styles.title}>{invalidLink ? 'Link indisponível' : 'Crie uma nova senha'}</Text>
      <Text style={styles.subtitle}>
        {invalidLink ? 'Este link de recuperação é inválido ou expirou. Solicite um novo link para continuar.' : 'Escolha uma senha forte para proteger seu acesso ao GEMN.'}
      </Text>

      {invalidLink ? (
        <AppButton title="Voltar para entrar" variant="accent" fullWidth={!wide} onPress={() => void leaveRecovery()} style={[styles.button, wide && styles.buttonWide]} />
      ) : (
        <AppCard style={styles.card}>
          <AppInput label="Nova senha" value={password} onChangeText={setPassword} placeholder={`Mínimo de ${MIN_PASSWORD_LENGTH} caracteres`} secureTextEntry textContentType="newPassword" icon="lock-outline" containerStyle={styles.field} />
          <AppInput label="Confirmar nova senha" value={confirmation} onChangeText={setConfirmation} placeholder="Digite a senha novamente" secureTextEntry textContentType="newPassword" icon="lock-check-outline" containerStyle={styles.field} />
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          {notice ? <AppButton title="Ir para o login" variant="accent" fullWidth={!wide} onPress={() => void leaveRecovery()} style={[styles.button, wide && styles.buttonWide]} /> : <AppButton title="Atualizar senha" variant="accent" fullWidth={!wide} onPress={handleSubmit} loading={submitting} style={[styles.button, wide && styles.buttonWide]} />}
        </AppCard>
      )}
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
