import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { AppButton, AppCard, AppInput, AppScreen } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { colors, layout, radius, spacing, typography } from '../theme/tokens';

export default function LoginScreen({ navigation }: any) {
  const { width } = useWindowDimensions();
  const wide = width >= layout.breakpoints.tablet;
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError('');
    const normalizedEmail = email.trim();

    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      setError('Informe um e-mail válido.');
      return;
    }
    if (!password) {
      setError('Informe sua senha.');
      return;
    }

    setSubmitting(true);
    const result = await signIn(normalizedEmail, password);
    setSubmitting(false);
    if (result.error) setError(result.error);
  }

  return (
    <AppScreen scroll maxWidth={440} contentContainerStyle={styles.content}>
      <View style={styles.brandMark}><Text style={styles.brandText}>G</Text></View>
      <Text style={styles.eyebrow}>MUNDO NOVO</Text>
      <Text style={styles.title}>Bem-vindo ao GEMN</Text>
      <Text style={styles.subtitle}>Entre para explorar o marketplace e acompanhar seus pedidos.</Text>

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
        <AppInput
          label="Senha"
          value={password}
          onChangeText={setPassword}
          placeholder="Sua senha"
          secureTextEntry
          textContentType="password"
          icon="lock-outline"
          containerStyle={styles.field}
        />
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <AppButton title="Entrar" variant="accent" fullWidth={!wide} onPress={handleSubmit} loading={submitting} style={[styles.button, wide && styles.buttonWide]} />
      </AppCard>

      <View style={styles.registerRow}>
        <Text style={styles.registerText}>Ainda não tem uma conta?</Text>
        <Pressable accessibilityRole="button" onPress={() => navigation.navigate('Register')} hitSlop={8}>
          <Text style={styles.registerLink}>Criar cadastro</Text>
        </Pressable>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'center', paddingTop: spacing.xl, paddingBottom: spacing.xl },
  brandMark: { width: 56, height: 56, borderRadius: radius.full, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  brandText: { color: colors.white, fontSize: 30, fontWeight: '700' },
  eyebrow: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.xs },
  title: { ...typography.heading1, color: colors.text },
  subtitle: { ...typography.body, color: colors.textSecondary, marginTop: spacing.sm, marginBottom: spacing.lg },
  card: { width: '100%', borderWidth: 1, borderColor: colors.border },
  field: { marginBottom: spacing.md },
  error: { ...typography.bodySmall, color: colors.error, marginBottom: spacing.md },
  button: { marginTop: spacing.xs },
  buttonWide: { width: 320, maxWidth: 320 },
  registerRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.xs, marginTop: spacing.lg },
  registerText: { ...typography.bodySmall, color: colors.textSecondary },
  registerLink: { ...typography.label, color: colors.primary },
});
