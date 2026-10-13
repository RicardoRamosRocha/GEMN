import React from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';

import { AppBadge, AppButton, AppCard, AppInput, AppScreen } from '../components/ui';
import { getCurrentSellerBranding, pickSellerBrandingImage, updateSellerBranding, updateSellerProfile } from '../services/sellerBranding';
import { SellerBrandingServiceError } from '../types/sellerBranding';
import type { SellerBrandingImage, SellerBrandingStore, SellerBrandingUpdateResult, SellerProfile } from '../types/sellerBranding';
import { getSellerBrandingUiFixture, isSellerBrandingUiFixturesEnabled } from '../dev/sellerBrandingUiFixtures';
import { colors, layout, radius, spacing, typography } from '../theme/tokens';

type PendingImage = SellerBrandingImage | null | undefined;

function friendlyError(error: unknown) {
  if (error instanceof SellerBrandingServiceError) return error.message;
  return 'Não foi possível concluir a operação. Verifique os dados e tente novamente.';
}

function imageUri(image: PendingImage, savedUrl?: string) {
  return image === undefined ? savedUrl : image?.uri;
}

function fixtureProfile(store: SellerBrandingStore, storeName: string, description: string): SellerProfile {
  return { sellerId: store.sellerId, storeName, description, atualizadoEm: new Date().toISOString() };
}

function fixtureBranding(store: SellerBrandingStore, logo: PendingImage, banner: PendingImage): SellerBrandingUpdateResult {
  const nextImage = (currentPath: string | null, currentUrl: string | undefined, image: PendingImage) => {
    if (image === undefined) return { path: currentPath, url: currentUrl };
    if (image === null) return { path: null, url: undefined };
    return { path: null, url: image.uri };
  };
  const nextLogo = nextImage(store.branding.logoPath, store.branding.logoUrl, logo);
  const nextBanner = nextImage(store.branding.bannerPath, store.branding.bannerUrl, banner);
  return {
    store: { ...store, branding: { ...store.branding, logoPath: nextLogo.path, logoUrl: nextLogo.url, bannerPath: nextBanner.path, bannerUrl: nextBanner.url, atualizadoEm: new Date().toISOString() } },
    cleanupPending: [],
  };
}

export default function SellerStoreBrandingScreen() {
  const { width } = useWindowDimensions();
  const wide = width >= layout.breakpoints.tablet;
  const fixturesEnabled = isSellerBrandingUiFixturesEnabled();
  const [store, setStore] = React.useState<SellerBrandingStore | null>(null);
  const [storeName, setStoreName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [logo, setLogo] = React.useState<PendingImage>(undefined);
  const [banner, setBanner] = React.useState<PendingImage>(undefined);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);
  const [cleanupPending, setCleanupPending] = React.useState<string[]>([]);

  const load = React.useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const fixture = fixturesEnabled ? getSellerBrandingUiFixture() : null;
      if (fixture?.scenario === 'load-error') throw new Error(fixture.loadError);
      const next = fixture?.store ?? await getCurrentSellerBranding();
      setStore(next);
      setStoreName(next.storeName);
      setDescription(next.description);
      setLogo(undefined);
      setBanner(undefined);
      setCleanupPending([]);
    } catch (error) {
      setStore(null);
      setErrorMessage(friendlyError(error));
    } finally {
      setLoading(false);
    }
  }, [fixturesEnabled]);

  useFocusEffect(React.useCallback(() => { void load(); }, [load]));

  async function chooseImage(kind: 'logo' | 'banner') {
    setErrorMessage(null);
    try {
      const image = await pickSellerBrandingImage();
      if (image) {
        if (kind === 'logo') setLogo(image); else setBanner(image);
      }
    } catch (error) {
      setErrorMessage(friendlyError(error));
    }
  }

  function removeImage(kind: 'logo' | 'banner') {
    setErrorMessage(null);
    if (kind === 'logo') setLogo(null); else setBanner(null);
  }

  async function save() {
    if (!store || saving || store.status === 'suspenso') return;
    setSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const profileDirty = storeName !== store.storeName || description !== store.description;
    const brandingDirty = logo !== undefined || banner !== undefined;
    if (!profileDirty && !brandingDirty) {
      setSuccessMessage('Nenhuma alteração pendente.');
      setSaving(false);
      return;
    }

    const fixture = fixturesEnabled ? getSellerBrandingUiFixture() : null;
    const profileTask = profileDirty
      ? (fixture
        ? fixture.scenario === 'save-error'
          ? Promise.reject(new Error(fixture.saveError))
          : Promise.resolve(fixtureProfile(store, storeName, description))
        : updateSellerProfile({ storeName, description }))
      : Promise.resolve(null);
    const brandingTask = brandingDirty
      ? (fixture
        ? fixture.scenario === 'save-error' || fixture.scenario === 'partial-save'
          ? Promise.reject(new Error(fixture.saveError))
          : Promise.resolve(fixtureBranding(store, logo, banner))
        : updateSellerBranding(store.sellerId, { ...(logo !== undefined ? { logo } : {}), ...(banner !== undefined ? { banner } : {}) }))
      : Promise.resolve(null);

    const [profileResult, brandingResult] = await Promise.allSettled([profileTask, brandingTask]);
    const failures: string[] = [];
    let pendingCleanup: string[] = [];
    let brandingSucceeded = false;
    if (profileResult.status === 'fulfilled') {
      const profile = profileResult.value;
      if (profile) setStore((current) => current ? { ...current, storeName: profile.storeName, description: profile.description } : current);
    } else failures.push('os dados comerciais');
    if (brandingResult.status === 'fulfilled' && brandingResult.value) {
      const branding = brandingResult.value as SellerBrandingUpdateResult;
      brandingSucceeded = true;
      setStore(branding.store);
      pendingCleanup = branding.cleanupPending;
      setCleanupPending(pendingCleanup);
      if (logo !== undefined) setLogo(undefined);
      if (banner !== undefined) setBanner(undefined);
    } else if (brandingResult.status === 'rejected') {
      if (brandingResult.reason instanceof SellerBrandingServiceError) {
        pendingCleanup = brandingResult.reason.cleanupPending;
        setCleanupPending(pendingCleanup);
      }
      failures.push('as imagens');
    }

    if (failures.length > 0) {
      setSuccessMessage(null);
      const cleanupNote = pendingCleanup.length > 0
        ? ` A limpeza de ${pendingCleanup.length} arquivo(s) permanece pendente e não confirma o salvamento.`
        : '';
      setErrorMessage(`Não foi possível salvar ${failures.join(' e ')}.${cleanupNote} As alterações pendentes continuam disponíveis para nova tentativa.`);
    } else if (brandingSucceeded && pendingCleanup.length > 0) {
      setErrorMessage(null);
      setSuccessMessage(`Alterações salvas, mas a limpeza de ${pendingCleanup.length} arquivo(s) permanece pendente. Nenhum arquivo referenciado foi removido.`);
    } else {
      setSuccessMessage('Alterações salvas com sucesso.');
    }
    setSaving(false);
  }

  if (loading) return <AppScreen contentContainerStyle={styles.feedback}><ActivityIndicator color={colors.primary} /><Text style={styles.feedbackText}>Carregando personalização...</Text></AppScreen>;
  if (!store) return <AppScreen contentContainerStyle={styles.feedback}><MaterialCommunityIcons name="store-off-outline" size={44} color={colors.textMuted} /><Text style={styles.feedbackTitle}>Personalização indisponível</Text><Text accessibilityRole="alert" style={styles.feedbackText}>{errorMessage}</Text><AppButton title="Tentar novamente" variant="outline" onPress={() => { void load(); }} /></AppScreen>;

  const suspended = store.status === 'suspenso';
  const disabled = suspended || saving;
  const logoPreview = imageUri(logo, store.branding.logoUrl);
  const bannerPreview = imageUri(banner, store.branding.bannerUrl);

  return (
    <AppScreen scroll edges={['bottom']} contentContainerStyle={styles.content}>
      <View style={styles.header}><View style={styles.headerCopy}><Text style={styles.eyebrow}>Identidade da loja</Text><Text style={styles.title}>Personalizar Loja</Text><Text style={styles.subtitle}>Apresente seu negócio com clareza e personalidade.</Text></View><AppBadge label={suspended ? 'Suspensa' : 'Ativa'} variant={suspended ? 'warning' : 'success'} /></View>
      {fixturesEnabled ? <View style={styles.demoBanner}><MaterialCommunityIcons name="flask-outline" size={18} color={colors.warning} /><Text style={styles.demoText}>Demonstração local — nenhuma chamada remota é feita.</Text></View> : null}
      {suspended ? <AppCard style={styles.warningCard}><MaterialCommunityIcons name="lock-outline" size={22} color={colors.warning} /><Text style={styles.warningText}>Sua loja está suspensa. Você pode visualizar os dados, mas alterações ficam bloqueadas.</Text></AppCard> : null}
      {errorMessage ? <AppCard style={styles.errorCard}><MaterialCommunityIcons name="alert-circle-outline" size={22} color={colors.error} /><Text accessibilityRole="alert" style={styles.errorText}>{errorMessage}</Text></AppCard> : null}
      {cleanupPending.length > 0 ? <AppCard style={styles.warningCard}><MaterialCommunityIcons name="book-alert" size={22} color={colors.warning} /><Text style={styles.warningText}>A limpeza de arquivos antigos ficou pendente. Os caminhos foram preservados para uma limpeza segura posterior.</Text></AppCard> : null}
      {successMessage ? <AppCard style={styles.successCard}><MaterialCommunityIcons name="check-circle-outline" size={22} color={colors.success} /><Text style={styles.successText}>{successMessage}</Text></AppCard> : null}

      <View style={[styles.mediaGrid, wide && styles.mediaGridWide]}>
        <MediaCard title="Imagem de capa" subtitle="Formato horizontal · proporção 16:9" uri={bannerPreview} disabled={disabled} onSelect={() => { void chooseImage('banner'); }} onRemove={() => removeImage('banner')} />
        <MediaCard title="Logotipo" subtitle="Formato quadrado · JPEG, PNG ou WebP · até 5 MiB" uri={logoPreview} logo disabled={disabled} onSelect={() => { void chooseImage('logo'); }} onRemove={() => removeImage('logo')} />
      </View>

      <AppCard style={styles.formCard}>
        <Text style={styles.sectionTitle}>Informações comerciais</Text>
        <Text style={styles.sectionSubtitle}>Esses dados aparecem na sua vitrine pública.</Text>
        <AppInput label="Nome comercial" value={storeName} onChangeText={setStoreName} editable={!disabled} maxLength={255} placeholder="Nome da sua loja" helperText={`${storeName.length}/255`} />
        <AppInput label="Descrição do estabelecimento" value={description} onChangeText={setDescription} editable={!disabled} maxLength={5000} multiline placeholder="Conte um pouco sobre o seu negócio" helperText={`${description.length}/5000`} />
      </AppCard>
      <View style={[styles.actions, wide && styles.actionsWide]}><AppButton title="Salvar alterações" onPress={() => { void save(); }} loading={saving} disabled={disabled} fullWidth={!wide} /><AppButton title="Recarregar dados" variant="outline" onPress={() => { void load(); }} disabled={saving} fullWidth={!wide} /></View>
    </AppScreen>
  );
}

function MediaCard({ title, subtitle, uri, logo = false, disabled, onSelect, onRemove }: { title: string; subtitle: string; uri?: string; logo?: boolean; disabled: boolean; onSelect: () => void; onRemove: () => void }) {
  return <AppCard style={styles.mediaCard}><Text style={styles.mediaTitle}>{title}</Text><Text style={styles.mediaSubtitle}>{subtitle}</Text><View style={[styles.preview, logo ? styles.logoPreview : styles.bannerPreview]}>{uri ? <Image accessibilityLabel={`Pré-visualização de ${title}`} source={{ uri }} resizeMode={logo ? 'contain' : 'cover'} style={styles.previewImage} /> : <View style={styles.emptyPreview}><MaterialCommunityIcons name={logo ? 'image-outline' : 'image-area-close'} size={32} color={colors.textMuted} /><Text style={styles.emptyText}>Nenhuma imagem selecionada</Text></View>}</View><View style={styles.mediaActions}><AppButton title="Selecionar" variant="outline" size="compact" onPress={onSelect} disabled={disabled} /><AppButton title="Remover" variant="outline" size="compact" onPress={onRemove} disabled={disabled || !uri} /></View></AppCard>;
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  headerCopy: { flex: 1, gap: spacing.xs },
  eyebrow: { ...typography.caption, color: colors.textSecondary },
  title: { ...typography.heading1, color: colors.text },
  subtitle: { ...typography.bodySmall, color: colors.textSecondary },
  demoBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: '#FBF1DF', borderWidth: 1, borderColor: '#F5D9A0' },
  demoText: { ...typography.caption, color: colors.warning, flex: 1 },
  warningCard: { flexDirection: 'row', gap: spacing.sm, backgroundColor: '#FBF1DF' },
  warningText: { ...typography.bodySmall, color: colors.textSecondary, flex: 1 },
  errorCard: { flexDirection: 'row', gap: spacing.sm, backgroundColor: '#FCECEC', borderWidth: 1, borderColor: colors.error },
  errorText: { ...typography.bodySmall, color: colors.error, flex: 1 },
  successCard: { flexDirection: 'row', gap: spacing.sm, backgroundColor: colors.primaryLight },
  successText: { ...typography.bodySmall, color: colors.success, flex: 1 },
  mediaGrid: { gap: spacing.md },
  mediaGridWide: { flexDirection: 'row' },
  mediaCard: { flex: 1, gap: spacing.xs, borderWidth: 1, borderColor: colors.border },
  mediaTitle: { ...typography.heading3, color: colors.text },
  mediaSubtitle: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.sm },
  preview: { width: '100%', borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  bannerPreview: { aspectRatio: 16 / 9 },
  logoPreview: { aspectRatio: 1 },
  previewImage: { width: '100%', height: '100%' },
  emptyPreview: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, padding: spacing.md },
  emptyText: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
  mediaActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  formCard: { gap: spacing.md, borderWidth: 1, borderColor: colors.border },
  sectionTitle: { ...typography.heading2, color: colors.text },
  sectionSubtitle: { ...typography.bodySmall, color: colors.textSecondary, marginTop: -spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  actionsWide: { justifyContent: 'flex-end' },
  feedback: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.xxl },
  feedbackTitle: { ...typography.heading3, color: colors.text, textAlign: 'center' },
  feedbackText: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center' },
});
