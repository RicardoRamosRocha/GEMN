import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { AppCard, AppScreen } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { WalletCard } from '../components/WalletCard';

type QuickAction = {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
};

export default function HomeScreen({ navigation }: any) {
  const { user } = useAuth();
  const fullName = user?.user_metadata?.nome_completo?.trim();
  const firstName = fullName?.split(/\s+/)[0] || 'membro GEMN';

  const quickActions: QuickAction[] = [
    { icon: 'storefront-outline', title: 'Marketplace', subtitle: 'Descubra negócios', onPress: () => navigation.navigate('Marketplace', { screen: 'MarketplaceHome' }) },
    { icon: 'clipboard-text-outline', title: 'Meus pedidos', subtitle: 'Acompanhe compras', onPress: () => navigation.navigate('Perfil', { screen: 'Orders' }) },
    { icon: 'account-circle-outline', title: 'Minha conta', subtitle: 'Perfil e preferências', onPress: () => navigation.navigate('Perfil', { screen: 'ProfileHome' }) },
  ];

  return (
    <AppScreen scroll edges={['top', 'right', 'bottom', 'left']} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <View style={styles.greetingBlock}>
          <Text style={styles.eyebrow}>Comunidade Mundo Novo</Text>
          <Text style={styles.greeting}>Olá, {firstName}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Abrir minha conta" style={styles.profileButton} onPress={() => navigation.navigate('Perfil', { screen: 'ProfileHome' })}>
          <MaterialCommunityIcons name="account-outline" size={23} color={colors.primary} />
        </Pressable>
      </View>

      <WalletCard />

      <View style={styles.communityBanner}>
        <View style={styles.bannerOrb} />
        <MaterialCommunityIcons name="account-group-outline" size={30} color={colors.white} style={styles.bannerIcon} />
        <View style={styles.bannerCopy}>
          <Text style={styles.bannerKicker}>NOSSA COMUNIDADE</Text>
          <Text style={styles.bannerTitle}>Juntos, fortalecemos quem empreende.</Text>
          <Text style={styles.bannerBody}>Conecte-se com os membros e ajude a movimentar a Comunidade Mundo Novo.</Text>
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>Acessos rápidos</Text>
          <Text style={styles.sectionSubtitle}>O que você quer fazer hoje?</Text>
        </View>
      </View>

      <View style={styles.quickActions}>
        {quickActions.map((action) => <QuickActionCard key={action.title} {...action} />)}
      </View>

      <AppCard style={styles.communityNote}>
        <View style={styles.noteIcon}><MaterialCommunityIcons name="heart-outline" size={22} color={colors.secondary} /></View>
        <View style={styles.noteCopy}><Text style={styles.noteTitle}>Um espaço feito por nós</Text><Text style={styles.noteBody}>Encontre, acompanhe e apoie as iniciativas dos membros da nossa comunidade.</Text></View>
      </AppCard>
    </AppScreen>
  );
}

function QuickActionCard({ icon, title, subtitle, onPress }: QuickAction) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${subtitle}`} onPress={onPress} style={({ pressed }) => [styles.quickActionPressable, pressed && styles.pressed]}>
      <AppCard padding={spacing.md} style={styles.quickActionCard}>
        <View style={styles.quickActionIcon}><MaterialCommunityIcons name={icon} size={22} color={colors.primary} /></View>
        <Text style={styles.quickActionTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.quickActionSubtitle} numberOfLines={2}>{subtitle}</Text>
        <MaterialCommunityIcons name="arrow-right" size={17} color={colors.primary} style={styles.quickActionArrow} />
      </AppCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  greetingBlock: { gap: spacing.xs },
  eyebrow: { ...typography.caption, color: colors.textSecondary },
  greeting: { ...typography.heading1, color: colors.text },
  profileButton: { width: 46, height: 46, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  communityBanner: { minHeight: 180, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.primary, padding: spacing.lg, position: 'relative', justifyContent: 'center' },
  bannerOrb: { position: 'absolute', width: 178, height: 178, borderRadius: 89, right: -62, top: -64, backgroundColor: colors.secondary },
  bannerIcon: { position: 'absolute', right: spacing.lg, top: spacing.lg, opacity: 0.9 },
  bannerCopy: { maxWidth: 600, paddingRight: spacing.md, gap: spacing.xs, zIndex: 1 },
  bannerKicker: { ...typography.label, color: '#C9D9FF', letterSpacing: 0.8 },
  bannerTitle: { ...typography.heading2, color: colors.white, maxWidth: 500 },
  bannerBody: { ...typography.bodySmall, color: '#E8F0FF', maxWidth: 500 },
  sectionHeader: { marginTop: spacing.xs },
  sectionTitle: { ...typography.heading2, color: colors.text },
  sectionSubtitle: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.xs },
  quickActions: { flexDirection: 'row', gap: spacing.sm, width: '100%' },
  quickActionPressable: { flex: 1, minWidth: 0 },
  pressed: { opacity: 0.82 },
  quickActionCard: { minHeight: 146, borderWidth: 1, borderColor: colors.border, gap: spacing.xs, position: 'relative' },
  quickActionIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryLight, marginBottom: spacing.xs },
  quickActionTitle: { ...typography.heading4, color: colors.text },
  quickActionSubtitle: { ...typography.caption, color: colors.textSecondary, paddingRight: spacing.sm },
  quickActionArrow: { position: 'absolute', right: spacing.md, bottom: spacing.md },
  communityNote: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.secondaryLight },
  noteIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  noteCopy: { flex: 1, gap: spacing.xs },
  noteTitle: { ...typography.label, color: colors.text },
  noteBody: { ...typography.bodySmall, color: colors.textSecondary },
});
