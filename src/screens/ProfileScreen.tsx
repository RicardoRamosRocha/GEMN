import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { AppBadge, AppButton, AppCard, AppScreen } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { colors, layout, radius, shadows, spacing, typography } from '../theme/tokens';
import { WalletCard } from '../components/WalletCard';

export default function ProfileScreen({ navigation }: any) {
  const { user, signOut } = useAuth();
  const { width } = useWindowDimensions();
  const desktop = width >= layout.breakpoints.desktop;
  const [signOutError, setSignOutError] = React.useState('');
  const [isSeller, setIsSeller] = React.useState(false);
  const [isAdmin, setIsAdmin] = React.useState(false);
  const displayName = user?.user_metadata?.nome_completo?.trim() || 'Usuário GEMN';
  const email = user?.email || 'E-mail não informado';

  React.useEffect(() => {
    let mounted = true;
    if (!user) return () => { mounted = false; };
    Promise.all([
      supabase.from('sellers').select('id').eq('user_id', user.id).eq('status', 'ativo').maybeSingle(),
      supabase.from('profiles').select('is_admin').eq('id', user.id).maybeSingle(),
    ]).then(([sellerResult, profileResult]) => {
      if (!mounted) return;
      setIsSeller(Boolean(sellerResult.data));
      setIsAdmin(Boolean(profileResult.data?.is_admin));
    });
    return () => { mounted = false; };
  }, [user]);

  async function handleSignOut() {
    setSignOutError('');
    const result = await signOut();
    if (result.error) setSignOutError(result.error);
  }

  return (
    <AppScreen maxWidth={desktop ? 1180 : layout.contentMaxWidth} scroll edges={['top', 'right', 'bottom', 'left']} contentContainerStyle={[styles.content, desktop && styles.contentDesktop]}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.eyebrow}>Comunidade Mundo Novo</Text>
          <Text style={[styles.title, desktop && styles.titleDesktop]}>Meu perfil</Text>
        </View>
        <View style={styles.headerIcon}>
          <MaterialCommunityIcons name="account-outline" size={22} color={colors.primary} />
        </View>
      </View>

      <View style={[styles.overview, desktop && styles.overviewDesktop, desktop && styles.overviewWide]}>
        <AppCard elevated={desktop} style={[styles.profileCard, desktop && styles.profileCardWide]}>
          <View style={[styles.avatar, desktop && styles.avatarWide]}>
            <MaterialCommunityIcons name="account" size={desktop ? 46 : 42} color={colors.primary} />
          </View>
          <View style={styles.profileInfo}>
            <Text style={[styles.name, desktop && styles.nameDesktop]}>{displayName}</Text>
            <Text style={styles.email}>{email}</Text>
            <AppBadge label={isSeller ? 'MEMBRO GEMN' : 'CLIENTE'} variant={isSeller ? 'success' : 'neutral'} />
          </View>
          <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} />
        </AppCard>

        <View style={[styles.walletWrap, desktop && styles.walletWrapWide]}><WalletCard /></View>
      </View>

      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>Minha conta</Text>
          <Text style={styles.sectionSubtitle}>Acesse seus recursos e preferências</Text>
        </View>
      </View>

      <AppCard padding={0} elevated={desktop} style={styles.menu}>
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
        {!isSeller ? (
          <MenuItem
            icon="store-plus-outline"
            title="Quero vender no GEMN"
            subtitle="Solicite autorização para vender"
            featured
            onPress={() => navigation.navigate('SellerApplication')}
          />
        ) : null}
        {isAdmin ? (
          <MenuItem
            icon="shield-account-outline"
            title="Administração"
            subtitle="Analise solicitações de vendedores"
            featured
            onPress={() => navigation.navigate('AdminHome')}
          />
        ) : null}
        <MenuItem icon="heart-outline" title="Favoritos" subtitle="Em desenvolvimento" />
        <MenuItem icon="wallet-outline" title="Minha carteira" subtitle="Em desenvolvimento" />
        <MenuItem icon="cog-outline" title="Configurações" subtitle="Em desenvolvimento" last />
      </AppCard>

      {signOutError ? <Text accessibilityRole="alert" style={styles.signOutError}>{signOutError}</Text> : null}
      <AppButton title="Sair" variant="outline" onPress={handleSignOut} style={styles.signOutButton} />
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
  const { width } = useWindowDimensions();
  const desktop = width >= layout.breakpoints.desktop;

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ disabled: !onPress }}
      style={[styles.menuItem, desktop && styles.menuItemDesktop, !last && styles.menuItemBorder, !onPress && styles.menuItemDisabled]}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={[styles.menuIcon, desktop && styles.menuIconDesktop, featured && styles.menuIconFeatured, !onPress && styles.menuIconDisabled]}>
        <MaterialCommunityIcons name={icon} size={desktop ? 24 : 22} color={featured ? colors.primary : colors.textMuted} />
      </View>
      <View style={styles.menuText}>
        <Text style={[styles.menuTitle, desktop && styles.menuTitleDesktop]}>{title}</Text>
        <Text style={[styles.menuSubtitle, desktop && styles.menuSubtitleDesktop]}>{subtitle}</Text>
      </View>
      <MaterialCommunityIcons name={onPress ? 'chevron-right' : 'clock-outline'} size={19} color={onPress && featured ? colors.primary : colors.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  contentDesktop: { paddingTop: spacing.xl, gap: spacing.xl },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.xs },
  title: { ...typography.heading1, color: colors.text },
  titleDesktop: { fontSize: 30, lineHeight: 38 },
  headerIcon: { width: 44, height: 44, borderRadius: radius.full, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  overview: { gap: spacing.md },
  overviewDesktop: { gap: spacing.lg },
  overviewWide: { flexDirection: 'row', alignItems: 'stretch' },
  profileCard: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  profileCardWide: { flex: 1 },
  avatar: { width: 68, height: 68, borderRadius: radius.full, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  avatarWide: { width: 76, height: 76 },
  profileInfo: { flex: 1, marginLeft: spacing.md, gap: spacing.xs },
  name: { ...typography.heading3, color: colors.text },
  nameDesktop: { fontSize: 20, lineHeight: 26 },
  email: { ...typography.bodySmall, color: colors.textSecondary },
  walletWrap: { width: '100%' },
  walletWrapWide: { width: 360, flexShrink: 0 },
  sectionHeader: { marginTop: spacing.xs },
  sectionTitle: { ...typography.heading2, color: colors.text },
  sectionSubtitle: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.xs },
  menu: { overflow: 'hidden', borderWidth: 1, borderColor: colors.border, ...shadows.subtle },
  menuItem: { minHeight: 70, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface },
  menuItemDesktop: { minHeight: 80, paddingHorizontal: spacing.lg },
  menuItemDisabled: { backgroundColor: '#FAFAFB' },
  menuItemBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  menuIcon: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  menuIconDesktop: { width: 48, height: 48 },
  menuIconFeatured: { backgroundColor: colors.primaryLight },
  menuIconDisabled: { backgroundColor: colors.surfaceMuted, opacity: 0.7 },
  menuText: { flex: 1, marginLeft: spacing.md, gap: spacing.xs },
  menuTitle: { ...typography.label, color: colors.text },
  menuTitleDesktop: { ...typography.heading4 },
  menuSubtitle: { ...typography.caption, color: colors.textSecondary },
  menuSubtitleDesktop: { ...typography.bodySmall },
  signOutError: { ...typography.bodySmall, color: colors.error, textAlign: 'center' },
  signOutButton: { marginTop: spacing.xs },
});
