import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { AppBadge, AppCard, AppScreen } from '../components/ui';
import { colors, layout, radius, shadows, spacing, typography } from '../theme/tokens';

export default function ProfileScreen({ navigation }: any) {
  const { width } = useWindowDimensions();
  const wide = width >= layout.breakpoints.tablet;

  return (
    <AppScreen scroll edges={['bottom']} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.eyebrow}>Comunidade Mundo Novo</Text>
          <Text style={styles.title}>Meu perfil</Text>
        </View>
        <View style={styles.headerIcon}>
          <MaterialCommunityIcons name="account-outline" size={22} color={colors.primary} />
        </View>
      </View>

      <View style={[styles.overview, wide && styles.overviewWide]}>
        <AppCard elevated={wide} style={[styles.profileCard, wide && styles.profileCardWide]}>
          <View style={styles.avatar}>
            <MaterialCommunityIcons name="account" size={42} color={colors.primary} />
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.name}>Usuário GEMN</Text>
            <Text style={styles.email}>usuario@gemn.com</Text>
            <AppBadge label="MEMBRO GEMN" variant="success" />
          </View>
          <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} />
        </AppCard>

        <AppCard elevated={wide} style={[styles.wallet, wide && styles.walletWide]}>
          <View>
            <Text style={styles.walletLabel}>Minha carteira</Text>
            <Text style={styles.walletValue}>R$ 150,00</Text>
          </View>
          <View style={styles.coin}>
            <View style={styles.coinIcon}>
              <MaterialCommunityIcons name="star-four-points" size={20} color={colors.secondary} />
            </View>
            <Text style={styles.coinValue}>50 GEMN</Text>
          </View>
        </AppCard>
      </View>

      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>Minha conta</Text>
          <Text style={styles.sectionSubtitle}>Acesse seus recursos e preferências</Text>
        </View>
      </View>

      <AppCard padding={0} elevated={wide} style={styles.menu}>
        <MenuItem
          icon="clipboard-text-outline"
          title="Meus pedidos"
          subtitle="Acompanhe suas compras"
          featured
          onPress={() => navigation.navigate('Orders')}
        />
        <MenuItem
          icon="store-outline"
          title="Meus produtos"
          subtitle="Produtos publicados por você"
          featured
          onPress={() => navigation.navigate('MyProducts')}
        />
        <MenuItem icon="heart-outline" title="Favoritos" subtitle="Produtos que você salvou" />
        <MenuItem icon="wallet-outline" title="Minha carteira" subtitle="Saldo e movimentações" />
        <MenuItem icon="cog-outline" title="Configurações" subtitle="Preferências da sua conta" last />
      </AppCard>
    </AppScreen>
  );
}

function MenuItem({ icon, title, subtitle, onPress, featured = false, last = false }: {
  icon: any;
  title: string;
  subtitle: string;
  onPress?: () => void;
  featured?: boolean;
  last?: boolean;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ disabled: !onPress }}
      style={[styles.menuItem, !last && styles.menuItemBorder]}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={[styles.menuIcon, featured && styles.menuIconFeatured]}>
        <MaterialCommunityIcons name={icon} size={22} color={featured ? colors.primary : colors.textSecondary} />
      </View>
      <View style={styles.menuText}>
        <Text style={styles.menuTitle}>{title}</Text>
        <Text style={styles.menuSubtitle}>{subtitle}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={22} color={featured ? colors.primary : colors.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.lg },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.xs },
  title: { ...typography.heading1, color: colors.text },
  headerIcon: { width: 44, height: 44, borderRadius: radius.full, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  overview: { gap: spacing.md },
  overviewWide: { flexDirection: 'row', alignItems: 'stretch' },
  profileCard: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  profileCardWide: { flex: 1 },
  avatar: { width: 72, height: 72, borderRadius: radius.full, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  profileInfo: { flex: 1, marginLeft: spacing.md, gap: spacing.xs },
  name: { ...typography.heading3, color: colors.text },
  email: { ...typography.bodySmall, color: colors.textSecondary },
  wallet: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: colors.border },
  walletWide: { width: 300, flexShrink: 0 },
  walletLabel: { ...typography.caption, color: colors.textSecondary },
  walletValue: { ...typography.heading2, color: colors.text, marginTop: spacing.xs },
  coin: { alignItems: 'center', gap: spacing.xs },
  coinIcon: { width: 42, height: 42, borderRadius: radius.full, backgroundColor: colors.secondaryLight, alignItems: 'center', justifyContent: 'center' },
  coinValue: { ...typography.caption, color: colors.text, fontWeight: '600' },
  sectionHeader: { marginTop: spacing.xs },
  sectionTitle: { ...typography.heading2, color: colors.text },
  sectionSubtitle: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.xs },
  menu: { overflow: 'hidden', borderWidth: 1, borderColor: colors.border, ...shadows.subtle },
  menuItem: { minHeight: 76, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface },
  menuItemBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  menuIcon: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  menuIconFeatured: { backgroundColor: colors.primaryLight },
  menuText: { flex: 1, marginLeft: spacing.md, gap: 2 },
  menuTitle: { ...typography.label, color: colors.text },
  menuSubtitle: { ...typography.caption, color: colors.textSecondary },
});
