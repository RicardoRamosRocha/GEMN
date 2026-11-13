import React from 'react';
import { ActivityIndicator, AppState, Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useIsFocused } from '@react-navigation/native';

import { AppCard, AppScreen } from '../components/ui';
import { HorizontalProductCarousel } from '../components/HorizontalProductCarousel';
import { ProductCard } from '../components/ProductCard';
import { WalletCard } from '../components/WalletCard';
import { useProducts } from '../context/ProductsContext';
import type { GemnProduct } from '../context/ProductsContext';
import { getGemnPresentationEligibility } from '../services/gemnPresentation';
import { colors, layout, radius, spacing, typography } from '../theme/tokens';

const promotionalBanner = require('../../assets/images/gemn-banner-home.png');
const presentationVideo = require('../../assets/videos/apresenta.mp4');

function formatPrice(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function HomeScreen({ navigation }: any) {
  const { width } = useWindowDimensions();
  const desktop = width >= layout.breakpoints.desktop;
  const { marketplaceProducts, marketplaceLoading, marketplaceError } = useProducts();
  const spotlightProducts = marketplaceProducts.slice(0, 6);
  const bannerHeight = desktop ? 320 : Math.min(250, Math.max(210, width * 0.58));

  function openMarketplace(params?: { category?: string; search?: string }) {
    navigation.navigate('Marketplace', { screen: 'MarketplaceHome', params });
  }

  return (
    <AppScreen scroll edges={['top', 'right', 'bottom', 'left']} maxWidth={desktop ? 1180 : layout.contentMaxWidth} contentContainerStyle={styles.content}>
      <View style={[styles.promoBannerFrame, { height: bannerHeight }]}>
        <Image
          accessibilityLabel="Banner promocional do GEMN"
          source={promotionalBanner}
          resizeMode="contain"
          style={styles.promoBanner}
        />
      </View>

      <View style={styles.walletSection}>
        <WalletCard compact variant="home" onPress={() => navigation.navigate('Perfil', { screen: 'Wallet' })} />
      </View>

      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>Destaques</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Ver mais destaques" onPress={() => openMarketplace()} style={styles.seeAll}>
          <Text style={styles.seeAllText}>Ver todas</Text>
          <MaterialCommunityIcons name="chevron-right" size={17} color={colors.textSecondary} />
        </Pressable>
      </View>

      {marketplaceLoading ? <View style={styles.inlineFeedback}><ActivityIndicator color={colors.brand} /><Text style={styles.helperText}>Carregando destaques...</Text></View> : marketplaceError ? <AppCard style={styles.feedbackCard}><Text style={styles.errorText}>{marketplaceError}</Text></AppCard> : spotlightProducts.length === 0 ? <AppCard style={styles.emptyCard}><MaterialCommunityIcons name="store-search-outline" size={28} color={colors.brand} /><Text style={styles.emptyTitle}>Ainda não há destaques</Text><Text style={styles.helperText}>Novos produtos e serviços aparecerão aqui.</Text></AppCard> : (
        <HorizontalProductCarousel
          products={spotlightProducts}
          variant="homeCompact"
          renderItem={(product, index) => <HomeProductCard product={product} onPress={() => navigation.navigate('Product', { listing: product, listingSequence: spotlightProducts, listingIndex: index })} onSellerPress={(sellerId) => navigation.navigate('SellerStorefront', { sellerId })} />}
        />
      )}

      <View style={styles.presentationSection}>
        <Text style={styles.sectionTitle}>Conheça o GEMN</Text>
        <Text style={styles.presentationSubtitle}>Uma comunidade de negócios, oportunidades e conexões.</Text>
        <PresentationVideo />
      </View>

    </AppScreen>
  );
}

function PresentationVideo() {
  const { height: viewportHeight } = useWindowDimensions();
  const [mounted, setMounted] = React.useState(false);
  const [firstFrameReady, setFirstFrameReady] = React.useState(false);
  const [visible, setVisible] = React.useState(false);
  const [appActive, setAppActive] = React.useState(AppState.currentState === 'active');
  const frameRef = React.useRef<View>(null);
  const manualPauseRef = React.useRef(false);
  const commandRef = React.useRef<'play' | 'pause' | null>(null);
  const isFocused = useIsFocused();
  const player = useVideoPlayer(mounted ? presentationVideo : null, (videoPlayer) => {
    videoPlayer.loop = true;
    videoPlayer.muted = true;
    videoPlayer.pause();
  });

  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => setAppActive(nextState === 'active'));
    return () => subscription.remove();
  }, []);

  React.useEffect(() => {
    if (!mounted) return undefined;
    const element = frameRef.current as unknown as Element | null;
    if (typeof IntersectionObserver === 'undefined' || !element) {
      const checkNativeVisibility = () => {
        frameRef.current?.measureInWindow((_x, y, _width, height) => setVisible(y < viewportHeight && y + height > 0));
      };
      checkNativeVisibility();
      const timer = setInterval(checkNativeVisibility, 250);
      return () => clearInterval(timer);
    }
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting && entry.intersectionRatio >= 0.1), { threshold: [0, 0.1] });
    observer.observe(element);
    return () => observer.disconnect();
  }, [mounted, viewportHeight]);

  React.useEffect(() => {
    const subscription = player.addListener('playingChange', ({ isPlaying }) => {
      if (commandRef.current) {
        commandRef.current = null;
        return;
      }
      manualPauseRef.current = !isPlaying;
    });
    return () => subscription.remove();
  }, [player]);

  React.useEffect(() => {
    if (!firstFrameReady) return;
    const canPlay = visible && isFocused && appActive && !manualPauseRef.current;
    if (canPlay && !player.playing) {
      commandRef.current = 'play';
      player.play();
    } else if (!canPlay && player.playing) {
      commandRef.current = 'pause';
      player.pause();
    }
  }, [appActive, firstFrameReady, isFocused, player, visible]);

  function handleFirstFrameRender() {
    setFirstFrameReady(true);
  }

  return (
    <View ref={frameRef} style={styles.videoFrame} onLayout={() => setMounted(true)}>
      {mounted ? <VideoView accessibilityLabel="Vídeo de apresentação do GEMN" player={player} nativeControls contentFit="contain" onFirstFrameRender={handleFirstFrameRender} style={styles.video} /> : null}
      {!firstFrameReady ? <View pointerEvents="none" style={styles.videoLoading}><ActivityIndicator color={colors.white} /></View> : null}
    </View>
  );
}

function HomeProductCard({ product, onPress, onSellerPress }: { product: GemnProduct; onPress: () => void; onSellerPress: (sellerId: string) => void }) {
  const eligibility = getGemnPresentationEligibility({ sellerAcceptsGemn: product.sellerAcceptsGemn, listingAcceptsGemn: product.acceptsGemn, gemnValue: product.gemnValue });
  return <ProductCard layout="marketplaceShowcase" icon={product.icon} imageUrl={product.imageUrl} category={product.category} name={product.name} price={formatPrice(product.price)} seller={product.sellerName ?? ''} sellerId={product.sellerId} onSellerPress={onSellerPress} coinPrice={eligibility.enabled && eligibility.value !== undefined ? `${eligibility.value} GEMN` : undefined} acceptanceGemn={eligibility.enabled} onPress={onPress} />;
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.sm, paddingBottom: spacing.xl, gap: spacing.sm },
  promoBannerFrame: { width: '100%', maxWidth: 820, alignSelf: 'center', overflow: 'hidden', borderRadius: radius.xl, backgroundColor: colors.brandDark, borderWidth: 1, borderColor: colors.brandDivider },
  promoBanner: { width: '100%', height: '100%' },
  walletSection: { width: '100%', maxWidth: 820, alignSelf: 'center' },
  sectionHeaderRow: { minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  sectionTitle: { ...typography.heading3, color: colors.text },
  seeAll: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  seeAllText: { ...typography.bodySmall, color: colors.textSecondary },
  inlineFeedback: { minHeight: 64, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  feedbackCard: { minHeight: 72, justifyContent: 'center' },
  emptyCard: { minHeight: 104, alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  emptyTitle: { ...typography.heading4, color: colors.text, textAlign: 'center' },
  helperText: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center' },
  errorText: { ...typography.bodySmall, color: colors.error, textAlign: 'center' },
  presentationSection: { width: '100%', maxWidth: 820, alignSelf: 'center', gap: spacing.xs },
  presentationSubtitle: { ...typography.bodySmall, color: colors.textSecondary, marginTop: -spacing.xxs },
  videoFrame: { width: '100%', aspectRatio: 16 / 9, overflow: 'hidden', borderRadius: radius.lg, backgroundColor: colors.brandDark },
  video: { width: '100%', height: '100%' },
  videoLoading: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandDark },
  pressed: { opacity: 0.78 },
});
