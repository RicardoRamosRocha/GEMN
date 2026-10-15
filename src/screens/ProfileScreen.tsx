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
      <View style={[styles.identityCard, desktop && styles.identityCardDesktop]}>
        <View style={styles.identityHeading}>
          <View>
            <Text style={styles.identityEyebrow}>Comunidade Mundo Novo</Text>
            <Text style={styles.identityTitle}>Meu perfil</Text>
          </View>
        </View>
        <View style={styles.identityTop}>
          <View style={[styles.avatar, desktop && styles.avatarWide]}>
            <MaterialCommunityIcons name="account" size={desktop ? 42 : 38} color="#123B7A" />
          </View>
          <View style={styles.profileInfo}>
            <Text style={[styles.name, desktop && styles.nameDesktop]}>{displayName}</Text>
            <Text style={styles.email}>{email}</Text>
            <View style={styles.memberLine}>
              <Text style={styles.gemnLabel}>GEMN</Text>
              <AppBadge label={isSeller ? 'MEMBRO GEMN' : 'CLIENTE'} variant={isSeller ? 'success' : 'neutral'} />
            </View>
          </View>
        </View>
        <WalletCard embedded onPress={() => navigation.navigate('Wallet')} />
      </View>

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
        <Text style={styles.groupTitle}>Minha loja</Text>
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
            subtitle={sellerStatus === 'suspenso' ? 'HistÃ³rico do vendedor suspenso' : 'Acompanhe pedidos dos seus produtos'}
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
        {isAdmin ? (
          <View style={styles.groupLabel}><Text style={styles.groupTitle}>Administração</Text></View>
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

function MenuItem({ icon, title, onPress, featured = false, last = false }: {
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
      </View>
      <MaterialCommunityIcons name={onPress ? 'chevron-right' : 'clock-outline'} size={19} color={onPress && featured ? colors.primary : colors.textMuted} />
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
  identityCard: { backgroundColor: '#123B7A', borderRadius: radius.xl, overflow: 'hidden', ...shadows.card },
  identityCardDesktop: { width: '100%' },
  identityHeading: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  identityEyebrow: { ...typography.bodySmall, color: '#A9DCD0', letterSpacing: 0.4, fontWeight: '600' },
  identityTitle: { ...typography.heading1, color: colors.white, marginTop: spacing.xs },
  identityTop: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg },
  avatar: { width: 60, height: 60, borderRadius: radius.full, backgroundColor: '#E8F0FF', alignItems: 'center', justifyContent: 'center' },
  avatarWide: { width: 76, height: 76 },
  profileInfo: { flex: 1, marginLeft: spacing.md, gap: spacing.xs },
  name: { ...typography.heading3, color: colors.white, letterSpacing: 0.1 },
  nameDesktop: { fontSize: 20, lineHeight: 26 },
  email: { ...typography.bodySmall, color: '#C9D9FF' },
  memberLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  gemnLabel: { ...typography.caption, color: '#A9DCD0', fontWeight: '700', letterSpacing: 1 },
  sectionHeader: { marginTop: spacing.xs },
  sectionTitle: { ...typography.heading2, color: '#123B7A' },
  sectionSubtitle: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.xs },
  groupTitle: { display: 'none' },
  groupLabel: { display: 'none' },
  menu: { width: '100%', overflow: 'hidden', borderWidth: 1, borderColor: colors.border, ...shadows.subtle },
  menuItem: { width: '100%', minHeight: 62, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface },
  menuItemDesktop: { minHeight: 66, paddingHorizontal: spacing.lg },
  menuItemDisabled: { backgroundColor: '#FAFAFB' },
  menuItemBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  menuIcon: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  menuIconDesktop: { width: 38, height: 38 },
  menuIconFeatured: { backgroundColor: colors.primaryLight },
  menuIconDisabled: { backgroundColor: colors.surfaceMuted, opacity: 0.7 },
  menuText: { flex: 1, minWidth: 0, marginLeft: spacing.sm },
  menuTitle: { ...typography.label, color: colors.text },
  menuTitleDesktop: { ...typography.heading4 },
  menuSubtitle: { ...typography.caption, color: colors.textSecondary },
  menuSubtitleDesktop: { ...typography.bodySmall },
  signOutError: { ...typography.bodySmall, color: colors.error, textAlign: 'center' },
  signOutButton: { marginTop: spacing.xs },
});
