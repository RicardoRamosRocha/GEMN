import React from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton, AppCard, AppScreen } from '../components/ui';
import { colors, layout, radius, spacing, typography } from '../theme/tokens';

export default function GuestProfileScreen({ navigation }: any) {
  return (
    <AppScreen maxWidth={520} contentContainerStyle={styles.content}>
      <View style={styles.heroIcon}><MaterialCommunityIcons name="account-circle-outline" size={44} color={colors.primary} /></View>
      <Text style={styles.eyebrow}>COMUNIDADE MUNDO NOVO</Text>
      <Text style={styles.title}>Entre para acessar sua conta</Text>
      <Text style={styles.subtitle}>Explore o GEMN livremente. Entre ou crie sua conta quando quiser comprar, consultar sua carteira ou gerenciar anúncios.</Text>
      <AppCard style={styles.card}>
        <AppButton title="Entrar" variant="accent" fullWidth onPress={() => navigation.navigate('Login')} />
        <AppButton title="Criar conta" variant="outline" fullWidth onPress={() => navigation.navigate('Register')} />
      </AppCard>
      <Text style={styles.note}>Seu carrinho pode ser montado sem login e será preservado quando você entrar.</Text>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'center', paddingTop: spacing.xl, paddingBottom: spacing.xl },
  heroIcon: { width: 76, height: 76, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandLight, marginBottom: spacing.md },
  eyebrow: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.xs },
  title: { ...typography.heading1, color: colors.text },
  subtitle: { ...typography.body, color: colors.textSecondary, marginTop: spacing.sm, marginBottom: spacing.lg },
  card: { gap: spacing.sm, borderWidth: 1, borderColor: colors.border },
  note: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.lg, maxWidth: layout.contentMaxWidth },
});
