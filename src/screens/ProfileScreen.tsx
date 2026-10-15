import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { AppBadge, AppButton, AppCard, AppScreen } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { colors, layout, radius, shadows, spacing, typography } from '../theme/tokens';
import { WalletCard } from '../components/WalletCard';
import { isGemnUiFixturesEnabled } from '../dev/ordersUiFixtures';

export default function ProfileScreen({ navigation }: any) {
  const { user, signOut } = useAuth();
  const { width } = useWindowDimensions();
  const desktop = width >= layout.breakpoints.desktop;
  const [signOutError, setSignOutError] = React.useState('');
  const [isSeller, setIsSeller] = React.useState(false);
  const [sellerStatus, setSellerStatus] = React.useState<'ativo' | 'suspenso' | null>(null);
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [profileName, setProfileName] = React.useState('');
  const displayName = user?.user_metadata?.nome_completo?.trim() || profileName || 'Usuário GEMN';
  const email = user?.email || 'E-mail não informado';

  React.useEffect(() => {
    let mounted = true;
    if (isGemnUiFixturesEnabled()) {
      setIsSeller(true);
      setSellerStatus('ativo');
      setIsAdmin(true);
      return () => { mounted = false; };
    }
    if (!user) return () => { mounted = false; };
    Promise.all([
      supabase.from('sellers').select('id, status').eq('user_id', user.id).maybeSingle(),
      supabase.from('profiles').select('is_admin, nome_completo').eq('id', user.id).maybeSingle(),
    ]).then(([sellerResult, profileResult]) => {
      if (!mounted) return;
      setIsSeller(Boolean(sellerResult.data));
      setSellerStatus(sellerResult.data?.status === 'ativo' || sellerResult.data?.status === 'suspenso' ? sellerResult.data.status : null);
      setIsAdmin(Boolean(profileResult.data?.is_admin));
      setProfileName(typeof profileResult.data?.nome_completo === 'string' ? profileResult.data.nome_completo.trim() : '');
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
      <View style={[styles.profileLayout, desktop && styles.profileLayoutDesktop]}>
        <View style={[styles.identityColumn, desktop && styles.identityColumnDesktop]}>
          <AppCard padding={0} style={[styles.identityCard, desktop && styles.identityCardDesktop]}>
            <View style={styles.identityHeading}>
              <Text style={styles.identityEyebrow}>COMUNIDADE MUNDO NOVO</Text>
              <Text style={styles.identityTitle}>Meu perfil</Text>
            </View>
            <View style={styles.identityTop}>
              <View style={[styles.avatar, desktop && styles.avatarWide]}>
                <MaterialCommunityIcons name="account-outline" size={desktop ? 40 : 36} color={colors.brand} />
              </View>
              <View style={styles.profileInfo}>
                <Text style={[styles.name, desktop && styles.nameDesktop]} numberOfLines={1}>{displayName}</Text>
                <Text style={styles.email} numberOfLines={1}>{email}</Text>
                <View style={styles.memberLine}>
                  <MaterialCommunityIcons name="star-four-points" size={14} color={colors.gemn} />
                  <Text style={styles.gemnLabel}>GEMN</Text>
                  <AppBadge label={isSeller ? 'MEMBRO GEMN' : 'CLIENTE'} variant={isSeller ? 'success' : 'neutral'} />
                </View>
              </View>
            </View>
          </AppCard>
          <WalletCard compact onPress={() => navigation.navigate('Wallet')} />
        </View>

        <View style={[styles.resourcesColumn, desktop && styles.resourcesColumnDesktop]}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Minha conta</Text>
              <Text style={styles.sectionSubtitle}>Acesse seus recursos e preferências</Text>
            </View>
          </View>

          <AppCard padding={0} elevated={desktop} style={styles.menu}>
            <Text style={styles.groupTitle}>Minhas compras</Text>
            <MenuItem
              icon="clipboard-text-outline"
              title="Meus pedidos"
              subtitle="Acompanhe suas compras"
              featured
              onPress={() => navigation.navigate('Orders')}
            />
            <MenuItem icon="wallet-outline" title="Minha carteira" subtitle="Saldo e movimentações GEMN" featured onPress={() => navigation.navigate('Wallet')} />
            <View style={styles.groupLabel}><Text style={styles.groupTitle}>Minha loja</Text></View>
            {isSeller ? (
              <MenuItem
                icon="store-outline"
                title="Minha Loja"
                subtitle={sellerStatus === 'suspenso' ? 'Consulta da loja suspensa' : 'Painel e atalhos do vendedor'}
                featured
                onPress={() => navigation.navigate('SellerDashboard')}
              />
            ) : null}
            <MenuItem
              icon="store-outline"
              title="Meus produtos"
              subtitle="Produtos publicados por você"
              featured
              onPress={() => navigation.navigate('MyProducts')}
            />
            {isSeller ? (
              <MenuItem
                icon="clipboard-arrow-down-outline"
                title="Pedidos recebidos"
                subtitle={sellerStatus === 'suspenso' ? 'Histórico do vendedor suspenso' : 'Acompanhe pedidos dos seus produtos'}
                featured
                onPress={() => navigation.navigate('SellerOrders')}
              />
            ) : null}
            {!isSeller ? (
              <MenuItem
                icon="store-plus-outline"
                title="Quero vender no GEMN"
                subtitle="Solicite autorização para vender"
                featured
                onPress={() => navigation.navigate('SellerApplication')}
              />
            ) : null}
            {isAdmin ? <View style={styles.groupLabel}><Text style={styles.groupTitle}>Administração</Text></View> : null}
            {isAdmin ? (
              <MenuItem
                icon="shield-account-outline"
                title="Administração"
                subtitle="Analise solicitações de vendedores"
                featured
                onPress={() => navigation.navigate('AdminHome')}
              />
            ) : null}
            <View style={styles.groupLabel}><Text style={styles.groupTitle}>Preferências</Text></View>
            <MenuItem icon="heart-outline" title="Favoritos" subtitle="Em desenvolvimento" />
            <MenuItem icon="cog-outline" title="Configurações" subtitle="Em desenvolvimento" last />
          </AppCard>
        </View>
      </View>

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
        <MaterialCommunityIcons name={icon} size={desktop ? 23 : 21} color={featured ? colors.brand : colors.textMuted} />
      </View>
      <View style={styles.menuText}>
        <Text style={[styles.menuTitle, desktop && styles.menuTitleDesktop]}>{title}</Text>
        <Text style={[styles.menuSubtitle, desktop && styles.menuSubtitleDesktop]}>{subtitle}</Text>
      </View>
      <MaterialCommunityIcons name={onPress ? 'chevron-right' : 'clock-outline'} size={19} color={onPress && featured ? colors.brand : colors.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },
  contentDesktop: { paddingTop: spacing.lg, gap: spacing.lg },
  profileLayout: { gap: spacing.md },
  profileLayoutDesktop: { flexDirection: 'column', gap: spacing.lg },
  identityColumn: { width: '100%' },
  identityColumnDesktop: { width: '100%' },
  resourcesColumn: { width: '100%', gap: spacing.sm },
  resourcesColumnDesktop: { width: '100%' },
  identityCard: { backgroundColor: colors.surface, borderRadius: radius.xl, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, ...shadows.subtle },
  identityCardDesktop: { width: '100%' },
  identityHeading: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xs },
  identityEyebrow: { ...typography.caption, color: colors.textSecondary, letterSpacing: 0.8, fontWeight: '700' },
  identityTitle: { ...typography.heading2, color: colors.brandDark, marginTop: spacing.xs },
  identityTop: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.lg },
  avatar: { width: 60, height: 60, borderRadius: radius.full, backgroundColor: colors.brandLight, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  avatarWide: { width: 68, height: 68 },
  profileInfo: { flex: 1, marginLeft: spacing.md, gap: spacing.xs },
  name: { ...typography.heading3, color: colors.text, letterSpacing: 0.1 },
  nameDesktop: { fontSize: 20, lineHeight: 26 },
  email: { ...typography.bodySmall, color: colors.textSecondary },
  memberLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  gemnLabel: { ...typography.caption, color: colors.gemn, fontWeight: '700', letterSpacing: 1 },
  sectionHeader: { marginTop: spacing.xs },
  sectionTitle: { ...typography.heading2, color: colors.brandDark },
  sectionSubtitle: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.xs },
  groupTitle: { ...typography.label, color: colors.textSecondary, letterSpacing: 0.6, textTransform: 'uppercase', paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.xs },
  groupLabel: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.xs },
  menu: { width: '100%', overflow: 'hidden', borderWidth: 1, borderColor: colors.border, ...shadows.subtle },
  menuItem: { width: '100%', minHeight: 68, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface },
  menuItemDesktop: { minHeight: 66, paddingHorizontal: spacing.lg },
  menuItemDisabled: { backgroundColor: colors.background },
  menuItemBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  menuIcon: { width: 38, height: 38, borderRadius: radius.md, backgroundColor: colors.brandLight, alignItems: 'center', justifyContent: 'center' },
  menuIconDesktop: { width: 38, height: 38 },
  menuIconFeatured: { backgroundColor: colors.brandLight },
  menuIconDisabled: { backgroundColor: colors.surfaceMuted, opacity: 0.7 },
  menuText: { flex: 1, minWidth: 0, marginLeft: spacing.sm },
  menuTitle: { ...typography.label, color: colors.text },
  menuTitleDesktop: { ...typography.heading4 },
  menuSubtitle: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xxs },
  menuSubtitleDesktop: { ...typography.bodySmall, fontSize: 13 },
  signOutError: { ...typography.bodySmall, color: colors.error, textAlign: 'center' },
  signOutButton: { marginTop: spacing.xs },
});
