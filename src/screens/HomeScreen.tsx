import React from 'react';
import { ActivityIndicator, AppState, Image, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useIsFocused } from '@react-navigation/native';

import { AppCard, AppScreen } from '../components/ui';
import { HorizontalProductCarousel } from '../components/HorizontalProductCarousel';
import { ProductCard } from '../components/ProductCard';
import { useProducts } from '../context/ProductsContext';
import type { GemnProduct } from '../context/ProductsContext';
import { getGemnPresentationEligibility } from '../services/gemnPresentation';
import { colors, layout, radius, spacing, typography } from '../theme/tokens';

const promotionalBanner = require('../../assets/images/gemn-banner-home.png');
const presentationVideo = require('../../assets/videos/mercado-gemn.mp4');
const presentationPoster = require('../../assets/videos/mercado-gemn-poster.jpg');

function formatPrice(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function HomeScreen({ navigation }: any) {
  const { width } = useWindowDimensions();
  const desktop = width >= layout.breakpoints.desktop;
  const mobile = width < layout.breakpoints.tablet;
  const { marketplaceProducts, marketplaceLoading, marketplaceError } = useProducts();
  const spotlightProducts = marketplaceProducts.slice(0, 6);

  function openMarketplace(params?: { category?: string; search?: string }) {
    navigation.navigate('Marketplace', { screen: 'MarketplaceHome', params });
  }

  return (
    <AppScreen scroll fullBleed edges={['top', 'right', 'bottom', 'left']} style={mobile ? styles.mobileSafeArea : undefined} maxWidth={desktop ? 1180 : layout.contentMaxWidth} contentContainerStyle={styles.content}>
      <View accessibilityLabel="Apresentação do GEMN" style={styles.presentationSection}>
        <View style={styles.presentationFrame}>
          <View style={styles.presentationFrameInner}>
            <View style={styles.promoBannerFrame}>
              <Image
                accessibilityLabel="Banner promocional do GEMN"
                source={promotionalBanner}
                resizeMode="contain"
                style={styles.promoBanner}
              />
            </View>
            <PresentationVideo />
          </View>
        </View>
      </View>

      <View style={[styles.paddedContent, !mobile && styles.paddedContentWide]}>
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
      </View>

    </AppScreen>
  );
}

function PresentationVideo() {
  return Platform.OS === 'web' ? <WebPresentationVideo /> : <NativePresentationVideo />;
}

function WebPresentationVideo() {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const [hasStarted, setHasStarted] = React.useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = React.useState(false);
  const [appActive, setAppActive] = React.useState(AppState.currentState === 'active');
  const manualPauseRef = React.useRef(false);
  const commandRef = React.useRef<'play' | 'pause' | null>(null);
  const isFocused = useIsFocused();
  const videoUri = Image.resolveAssetSource(presentationVideo)?.uri;
  const posterUri = Image.resolveAssetSource(presentationPoster)?.uri;

  const playVideo = React.useCallback((withAudio: boolean) => {
    const video = videoRef.current;
    if (!video) return;
    if (withAudio) {
      video.defaultMuted = false;
      video.muted = false;
    } else {
      video.defaultMuted = true;
      video.muted = true;
    }
    const result = video.play();
    if (result) {
      result.catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'NotAllowedError') setAutoplayBlocked(true);
      });
    }
  }, []);

  const attemptAutoplay = React.useCallback(() => {
    if (!isFocused || !appActive || manualPauseRef.current || videoRef.current?.paused === false) return;
    commandRef.current = 'play';
    playVideo(false);
  }, [appActive, isFocused, playVideo]);

  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => setAppActive(nextState === 'active'));
    return () => subscription.remove();
  }, []);

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    const handlePlaying = () => {
      commandRef.current = null;
      manualPauseRef.current = false;
      setHasStarted(true);
      setAutoplayBlocked(false);
    };
    const handlePause = () => {
      if (commandRef.current) {
        commandRef.current = null;
      } else {
        manualPauseRef.current = true;
      }
    };
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('pause', handlePause);
    attemptAutoplay();
    return () => {
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('pause', handlePause);
    };
  }, [attemptAutoplay]);

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    if (!isFocused || !appActive) {
      if (!video.paused) {
        commandRef.current = 'pause';
        video.pause();
      }
      return undefined;
    }
    attemptAutoplay();
    return undefined;
  }, [appActive, attemptAutoplay, isFocused]);

  function handleManualPlay() {
    manualPauseRef.current = false;
    commandRef.current = 'play';
    playVideo(true);
  }

  return (
    <View style={styles.videoFrame}>
      {React.createElement('video', {
        ref: videoRef,
        src: videoUri,
        autoPlay: true,
        muted: true,
        defaultMuted: true,
        playsInline: true,
        controls: true,
        loop: true,
        preload: 'auto',
        'aria-label': 'Vídeo de apresentação do GEMN',
        style: { width: '100%', height: '100%', objectFit: 'contain', display: 'block' } as React.CSSProperties,
      })}
      {!hasStarted ? <View pointerEvents="box-none" style={styles.videoPoster}>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}><Image accessibilityLabel="Poster do vídeo de apresentação do GEMN" source={{ uri: posterUri }} resizeMode="cover" style={styles.posterImage} /></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Reproduzir vídeo de apresentação do GEMN" onPress={handleManualPlay} style={styles.videoPlayButton}>
          <MaterialCommunityIcons name="play-circle" size={42} color={colors.white} />
          <Text style={styles.videoPlayText}>{autoplayBlocked ? 'Reproduzir vídeo' : 'Iniciar vídeo'}</Text>
        </Pressable>
      </View> : null}
    </View>
  );
}

function NativePresentationVideo() {
  const [firstFrameReady, setFirstFrameReady] = React.useState(false);
  const [hasStarted, setHasStarted] = React.useState(false);
  const [appActive, setAppActive] = React.useState(AppState.currentState === 'active');
  const manualPauseRef = React.useRef(false);
  const commandRef = React.useRef<'play' | 'pause' | null>(null);
  const isFocused = useIsFocused();
  const player = useVideoPlayer(presentationVideo, (videoPlayer) => {
    videoPlayer.loop = true;
    videoPlayer.muted = true;
  });

  const attemptAutoplay = React.useCallback(() => {
    if (!isFocused || !appActive || manualPauseRef.current || player.playing) return;
    commandRef.current = 'play';
    player.play();
  }, [appActive, isFocused, player]);

  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => setAppActive(nextState === 'active'));
    return () => subscription.remove();
  }, []);

  React.useEffect(() => {
    const subscription = player.addListener('playingChange', ({ isPlaying }) => {
      if (commandRef.current) {
        commandRef.current = null;
      } else {
        manualPauseRef.current = !isPlaying;
      }
      if (isPlaying) setHasStarted(true);
    });
    return () => subscription.remove();
  }, [player]);

  React.useEffect(() => {
    if (!isFocused || !appActive || manualPauseRef.current) {
      if (player.playing) {
        commandRef.current = 'pause';
        player.pause();
      }
      return undefined;
    }
    const frame = requestAnimationFrame(attemptAutoplay);
    return () => cancelAnimationFrame(frame);
  }, [appActive, attemptAutoplay, isFocused, player]);

  function handleManualPlay() {
    manualPauseRef.current = false;
    commandRef.current = 'play';
    player.muted = false;
    player.play();
  }

  function handleFirstFrameRender() {
    setFirstFrameReady(true);
    attemptAutoplay();
  }

  const showPoster = !firstFrameReady || !hasStarted;

  return (
    <View style={styles.videoFrame}>
      <VideoView
        accessibilityLabel="Vídeo de apresentação do GEMN"
        player={player}
        nativeControls
        playsInline
        contentFit="contain"
        onFirstFrameRender={handleFirstFrameRender}
        style={styles.video}
      />
      {showPoster ? <View pointerEvents="box-none" style={styles.videoPoster}>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}><Image accessibilityLabel="Poster do vídeo de apresentação do GEMN" source={presentationPoster} resizeMode="cover" style={styles.posterImage} /></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Reproduzir vídeo de apresentação do GEMN" onPress={handleManualPlay} style={styles.videoPlayButton}>
          <MaterialCommunityIcons name="play-circle" size={42} color={colors.white} />
          <Text style={styles.videoPlayText}>Reproduzir vídeo</Text>
        </Pressable>
      </View> : null}
    </View>
  );
}

function HomeProductCard({ product, onPress, onSellerPress }: { product: GemnProduct; onPress: () => void; onSellerPress: (sellerId: string) => void }) {
  const eligibility = getGemnPresentationEligibility({ sellerAcceptsGemn: product.sellerAcceptsGemn, listingAcceptsGemn: product.acceptsGemn, gemnValue: product.gemnValue });
  return <ProductCard layout="homeCompact" icon={product.icon} imageUrl={product.imageUrl} category={product.category} name={product.name} price={formatPrice(product.price)} seller={product.sellerName ?? ''} sellerId={product.sellerId} onSellerPress={onSellerPress} coinPrice={eligibility.enabled && eligibility.value !== undefined ? `${eligibility.value} GEMN` : undefined} acceptanceGemn={eligibility.enabled} onPress={onPress} />;
}

const styles = StyleSheet.create({
  content: { paddingTop: 0, paddingBottom: spacing.xl, gap: spacing.sm, backgroundColor: colors.background },
  paddedContent: { width: '100%', paddingHorizontal: spacing.md, gap: spacing.sm },
  paddedContentWide: { paddingHorizontal: layout.desktopHorizontalPadding },
  mobileSafeArea: { backgroundColor: colors.brandDark },
  promoBanner: { width: '100%', height: '100%' },
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
  presentationSection: { width: '100%', maxWidth: 820, alignSelf: 'center' },
  presentationFrame: { width: '100%', padding: 3, borderRadius: radius.xl, backgroundColor: colors.brandDark, borderWidth: 1, borderColor: colors.gemn },
  presentationFrameInner: { overflow: 'hidden', borderRadius: radius.lg, backgroundColor: colors.brandDark },
  promoBannerFrame: { width: '100%', aspectRatio: 1774 / 887, overflow: 'hidden', backgroundColor: colors.brandDark },
  video: { width: '100%', height: '100%' },
  videoFrame: { width: '100%', aspectRatio: 16 / 9, overflow: 'hidden', backgroundColor: colors.brandDark },
  videoPoster: { ...StyleSheet.absoluteFill, width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandDark },
  posterImage: { width: '100%', height: '100%' },
  videoPlayButton: { position: 'absolute', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.lg, backgroundColor: 'rgba(7, 32, 29, 0.82)' },
  videoPlayText: { ...typography.bodySmall, color: colors.white },
  pressed: { opacity: 0.78 },
});
