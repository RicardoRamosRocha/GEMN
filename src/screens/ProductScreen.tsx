import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Image, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppBadge, AppButton, AppCard, AppScreen } from '../components/ui';
import { getGemnPresentationEligibility } from '../services/gemnPresentation';
import { OrderServiceError, createOrder } from '../services/orders';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import type { GemnProduct } from '../context/ProductsContext';
import type { OrderRpcResult } from '../types/orders';
import { colors, layout, radius, shadows, spacing, typography } from '../theme/tokens';
type ProductStackParamList = {
  Product: { listing: GemnProduct; listingSequence?: GemnProduct[]; listingIndex?: number };
  OrderConfirmation: OrderConfirmationParams;
  SellerStorefront: { sellerId: string };
};

export type OrderConfirmationParams = OrderRpcResult & {
  itemName: string;
};

type ProductScreenProps = {
  route: { params?: { listing?: GemnProduct; listingSequence?: GemnProduct[]; listingIndex?: number } };
  navigation: NativeStackNavigationProp<ProductStackParamList, 'Product'>;
};

function createSecureUuid() {
  return Crypto.randomUUID();
}

function purchaseErrorMessage(error: unknown) {
  if (error instanceof OrderServiceError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Não foi possível registrar o pedido. Tente novamente.';
}

function SellerCard({ storeName, onPress, disabled }: { storeName: string; onPress: () => void; disabled: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Conhecer a loja ${storeName}`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.sellerCard, pressed && !disabled && styles.sellerCardPressed]}
    >
      <View style={styles.sellerLogo}><MaterialCommunityIcons name="store-outline" size={24} color={colors.brand} /></View>
      <View style={styles.sellerCardCopy}>
        <Text style={styles.sellerCardLabel}>Vendido por</Text>
        <Text style={styles.sellerCardName}>{storeName}</Text>
        <View style={styles.sellerApproved}>
          <MaterialCommunityIcons name="check-decagram" size={14} color={colors.success} />
          <Text style={styles.sellerApprovedText}>Vendedor aprovado</Text>
        </View>
      </View>
      <View style={styles.sellerVisit}>
        <Text style={styles.sellerVisitText}>Conhecer a loja</Text>
        <MaterialCommunityIcons name="arrow-right" size={17} color={colors.primary} />
      </View>
    </Pressable>
  );
}

function GalleryThumbnail({ url }: { url: string }) {
  const [loading, setLoading] = useState(Boolean(url));
  const [failed, setFailed] = useState(!url);
  if (failed) return <View style={styles.thumbnailFallback}><MaterialCommunityIcons name="image-off-outline" size={22} color={colors.textMuted} /></View>;
  return <View style={styles.thumbnailImageWrap}><Image source={{ uri: url }} style={styles.thumbnailImage} onLoad={() => setLoading(false)} onError={() => { setLoading(false); setFailed(true); }} />{loading ? <View pointerEvents="none" style={styles.thumbnailLoading}><ActivityIndicator size="small" color={colors.brand} /></View> : null}</View>;
}

export default function ProductScreen({ route, navigation }: ProductScreenProps) {
  const { width, height } = useWindowDimensions();
  const { user } = useAuth();
  const { addItem } = useCart();
  const wide = width >= layout.breakpoints.tablet;
  const productImageHeight = Math.min(300, Math.max(220, Math.round(width * 0.66)));
  const listing = route?.params?.listing;
  const listingSequence = route?.params?.listingSequence ?? [];
  const listingIndex = route?.params?.listingIndex ?? listingSequence.findIndex((item) => item.id === listing?.id);
  const hasProductSequence = listingSequence.length > 1 && listingIndex >= 0;
  const galleryImages = listing?.images?.length ? listing.images : listing?.imageUrl ? [{ id: `legacy-${listing.id}`, storagePath: '', url: listing.imageUrl, sortOrder: 0, isPrimary: true }] : [];
  const [quantity, setQuantity] = useState(1);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [fullscreenGallery, setFullscreenGallery] = useState(false);
  const [zoomScale, setZoomScale] = useState(1);
  const [galleryImageFailed, setGalleryImageFailed] = useState(false);
  const [galleryImageLoading, setGalleryImageLoading] = useState(true);
  const [fullscreenImageFailed, setFullscreenImageFailed] = useState(false);
  const [fullscreenImageLoading, setFullscreenImageLoading] = useState(true);
  const pinchDistanceRef = useRef(0);
  const galleryTranslateX = useRef(new Animated.Value(0)).current;
  const fullscreenPanX = useRef(new Animated.Value(0)).current;
  const fullscreenPanY = useRef(new Animated.Value(0)).current;
  const fullscreenPanOffsetRef = useRef({ x: 0, y: 0 });
  const fullscreenImageSizeRef = useRef({ width: 1, height: 1 });
  const fullscreenScaleRef = useRef(1);
  const galleryAnimatingRef = useRef(false);
  const swipeMovedRef = useRef(false);
  const fullscreenGestureRef = useRef<'tap' | 'pinch' | 'pan'>('tap');
  const fullscreenPinchStartRef = useRef({ distance: 0, scale: 1, contentX: 0, contentY: 0 });
  const fullscreenPinchInProgressRef = useRef(false);
  const fullscreenHadPinchRef = useRef(false);
  const fullscreenPanStartRef = useRef({ x: 0, y: 0 });
  const fullscreenLastTapRef = useRef(0);
  const [gemnInput, setGemnInput] = useState('0');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cartFeedback, setCartFeedback] = useState<string | null>(null);
  const intentRef = useRef<{ signature: string; key: string } | null>(null);
  const name = listing?.name ?? 'Anúncio indisponível';
  const numericPrice = listing?.price ?? 0;
  const price = numericPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const icon = listing?.icon ?? 'package-variant-closed';
  const total = numericPrice * quantity;
  const formattedTotal = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const gemnEligibility = getGemnPresentationEligibility({ sellerAcceptsGemn: listing?.sellerAcceptsGemn, listingAcceptsGemn: listing?.acceptsGemn, gemnValue: listing?.gemnValue });
  const parsedGemnInput = gemnEligibility.enabled ? Number(gemnInput.replace(',', '.')) : 0;
  const gemnUtilizado = Number.isFinite(parsedGemnInput) ? Math.min(total, Math.max(0, Math.round(parsedGemnInput * 100) / 100)) : 0;
  const paymentMethod = gemnUtilizado === 0 ? 'real' : gemnUtilizado === total ? 'gemn' : 'misto';
  const activeGalleryImage = galleryImages[selectedImageIndex] ?? galleryImages[0];

  useEffect(() => { setSelectedImageIndex(0); fullscreenScaleRef.current = 1; fullscreenPanOffsetRef.current = { x: 0, y: 0 }; setZoomScale(1); galleryTranslateX.setValue(0); fullscreenPanX.setValue(0); fullscreenPanY.setValue(0); setGalleryImageFailed(false); setGalleryImageLoading(true); setFullscreenImageFailed(false); setFullscreenImageLoading(true); }, [listing?.id, galleryTranslateX, fullscreenPanX, fullscreenPanY]);
  useEffect(() => { setGalleryImageFailed(false); setGalleryImageLoading(true); setFullscreenImageFailed(false); setFullscreenImageLoading(true); }, [selectedImageIndex]);
  useEffect(() => {
    if (!activeGalleryImage?.url) return;
    Image.getSize(activeGalleryImage.url, (imageWidth, imageHeight) => {
      fullscreenImageSizeRef.current = { width: imageWidth, height: imageHeight };
    }, () => undefined);
  }, [activeGalleryImage?.url]);

  function fullscreenViewportSize() {
    return { width, height: Math.max(1, height * 0.78) };
  }
  function fullscreenDisplayedImageSize() {
    const viewport = fullscreenViewportSize();
    const source = fullscreenImageSizeRef.current;
    const sourceRatio = source.width / Math.max(1, source.height);
    const viewportRatio = viewport.width / viewport.height;
    if (!Number.isFinite(sourceRatio) || sourceRatio <= 0) return viewport;
    return sourceRatio > viewportRatio
      ? { width: viewport.width, height: viewport.width / sourceRatio }
      : { width: viewport.height * sourceRatio, height: viewport.height };
  }
  function clampFullscreenPan(scale: number, x: number, y: number) {
    const viewport = fullscreenViewportSize();
    const image = fullscreenDisplayedImageSize();
    const scaledWidth = image.width * scale;
    const scaledHeight = image.height * scale;
    const minX = scaledWidth > viewport.width ? viewport.width - scaledWidth : 0;
    const minY = scaledHeight > viewport.height ? viewport.height - scaledHeight : 0;
    return { x: Math.min(0, Math.max(minX, x)), y: Math.min(0, Math.max(minY, y)) };
  }
  function touchFocalPoint(touches: Array<{ pageX: number; pageY: number }>) {
    return {
      x: (touches[0].pageX + touches[1].pageX) / 2 - width / 2,
      y: (touches[0].pageY + touches[1].pageY) / 2 - height / 2,
    };
  }
  function beginFullscreenPinch(touches: Array<{ pageX: number; pageY: number }>) {
    if (touches.length < 2) return;
    const focal = touchFocalPoint(touches);
    const scale = fullscreenScaleRef.current;
    const pan = fullscreenPanOffsetRef.current;
    fullscreenPinchStartRef.current = {
      distance: Math.max(1, touchDistance(touches)),
      scale,
      contentX: (focal.x - pan.x) / scale,
      contentY: (focal.y - pan.y) / scale,
    };
  }
  function applyFullscreenPinch(scale: number, x: number, y: number) {
    const nextScale = Math.min(4, Math.max(1, scale));
    const nextPan = nextScale === 1 ? { x: 0, y: 0 } : clampFullscreenPan(nextScale, x, y);
    fullscreenScaleRef.current = nextScale;
    fullscreenPanOffsetRef.current = nextPan;
    setZoomScale(nextScale);
    fullscreenPanX.setValue(nextPan.x);
    fullscreenPanY.setValue(nextPan.y);
  }
  function updateFullscreenPinch(touches: Array<{ pageX: number; pageY: number }>) {
    if (touches.length < 2) return;
    if (!fullscreenPinchInProgressRef.current) {
      fullscreenPinchInProgressRef.current = true;
      fullscreenHadPinchRef.current = true;
      beginFullscreenPinch(touches);
    }
    const start = fullscreenPinchStartRef.current;
    const focal = touchFocalPoint(touches);
    const nextScale = start.scale * touchDistance(touches) / Math.max(1, start.distance);
    applyFullscreenPinch(nextScale, focal.x - start.contentX * Math.min(4, Math.max(1, nextScale)), focal.y - start.contentY * Math.min(4, Math.max(1, nextScale)));
  }

  function setFullscreenZoom(value: number) {
    const nextZoom = Math.min(4, Math.max(1, value));
    const nextPan = nextZoom === 1 ? { x: 0, y: 0 } : clampFullscreenPan(nextZoom, fullscreenPanOffsetRef.current.x, fullscreenPanOffsetRef.current.y);
    fullscreenScaleRef.current = nextZoom;
    fullscreenPanOffsetRef.current = nextPan;
    setZoomScale(nextZoom);
    fullscreenPanX.setValue(nextPan.x);
    fullscreenPanY.setValue(nextPan.y);
  }
  function resetFullscreenTransform() { fullscreenScaleRef.current = 1; fullscreenPanOffsetRef.current = { x: 0, y: 0 }; setZoomScale(1); fullscreenPanX.setValue(0); fullscreenPanY.setValue(0); }
  function touchDistance(touches: Array<{ pageX: number; pageY: number }>) {
    if (touches.length < 2) return 0;
    const dx = touches[0].pageX - touches[1].pageX;
    const dy = touches[0].pageY - touches[1].pageY;
    return Math.sqrt(dx * dx + dy * dy);
  }
  function handleFullscreenTouchStart(event: { nativeEvent: { touches: Array<{ pageX: number; pageY: number }> } }) {
    const touches = event.nativeEvent.touches ?? [];
    if (touches.length < 2) { if (!fullscreenPinchInProgressRef.current) fullscreenHadPinchRef.current = false; return; }
    fullscreenGestureRef.current = 'pinch';
    fullscreenPinchInProgressRef.current = true;
    fullscreenHadPinchRef.current = true;
    beginFullscreenPinch(touches);
  }
  function handleFullscreenTouchMove(event: { nativeEvent: { touches: Array<{ pageX: number; pageY: number }> } }) {
    const touches = event.nativeEvent.touches ?? [];
    if (touches.length < 2) return;
    if (!fullscreenPinchInProgressRef.current) {
      fullscreenPinchInProgressRef.current = true;
      fullscreenHadPinchRef.current = true;
      beginFullscreenPinch(touches);
    }
    updateFullscreenPinch(touches);
  }
  function handleFullscreenTouchEnd(event: { nativeEvent: { touches: Array<{ pageX: number; pageY: number }> } }) {
    if ((event.nativeEvent.touches ?? []).length < 2) fullscreenPinchInProgressRef.current = false;
  }
  function openGallery(index = selectedImageIndex) { setSelectedImageIndex(index); resetFullscreenTransform(); setFullscreenImageFailed(false); setFullscreenImageLoading(true); setFullscreenGallery(true); }
  function closeGallery() { resetFullscreenTransform(); setFullscreenGallery(false); }
  function selectGalleryImage(index: number) { if (galleryAnimatingRef.current || index < 0 || index >= galleryImages.length) return; galleryTranslateX.setValue(0); setSelectedImageIndex(index); resetFullscreenTransform(); }
  function changeGalleryImage(direction: -1 | 1) {
    if (galleryImages.length < 2 || galleryAnimatingRef.current) return;
    const nextIndex = selectedImageIndex + direction;
    if (nextIndex < 0 || nextIndex >= galleryImages.length) return;
    galleryAnimatingRef.current = true;
    const exitX = direction === 1 ? -width : width;
    const enterX = -exitX;
    Animated.timing(galleryTranslateX, { toValue: exitX, duration: 170, useNativeDriver: true }).start(({ finished }) => {
      if (!finished) { galleryTranslateX.setValue(0); galleryAnimatingRef.current = false; return; }
      setSelectedImageIndex(nextIndex);
      resetFullscreenTransform();
      galleryTranslateX.setValue(enterX);
      Animated.timing(galleryTranslateX, { toValue: 0, duration: 190, useNativeDriver: true }).start(() => { galleryAnimatingRef.current = false; });
    });
  }

  const mainImagePanResponder = React.useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_event, gestureState) => Math.abs(gestureState.dx) > 12 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
    onMoveShouldSetPanResponder: (_event, gestureState) => Math.abs(gestureState.dx) > 12 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
    onPanResponderGrant: () => { swipeMovedRef.current = false; },
    onPanResponderRelease: (_event, gestureState) => {
      if (Math.abs(gestureState.dx) > 56 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy)) {
        swipeMovedRef.current = true;
        changeGalleryImage(gestureState.dx < 0 ? 1 : -1);
      }
    },
    onPanResponderTerminate: () => { swipeMovedRef.current = false; },
  }), [galleryImages.length, selectedImageIndex, width]);

  const fullscreenPanResponder = React.useMemo(() => PanResponder.create({
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponderCapture: (event, gestureState) => {
      const touches = event.nativeEvent.touches ?? [];
      return touches.length >= 2 || fullscreenScaleRef.current > 1 || (Math.abs(gestureState.dx) > 12 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy));
    },
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
    onPanResponderGrant: (event) => {
      const touches = event.nativeEvent.touches ?? [];
      fullscreenGestureRef.current = touches.length >= 2 ? 'pinch' : 'tap';
      if (touches.length >= 2) {
        fullscreenPinchInProgressRef.current = true;
        fullscreenHadPinchRef.current = true;
        beginFullscreenPinch(touches);
      } else {
        fullscreenPanStartRef.current = { ...fullscreenPanOffsetRef.current };
      }
      pinchDistanceRef.current = 0;
    },
    onPanResponderMove: (event, gestureState) => {
      const touches = event.nativeEvent.touches ?? [];
      if (touches.length >= 2) {
        fullscreenGestureRef.current = 'pinch';
        updateFullscreenPinch(touches);
        return;
      }
      if (fullscreenScaleRef.current > 1) {
        fullscreenGestureRef.current = 'pan';
        const nextPan = clampFullscreenPan(fullscreenScaleRef.current, fullscreenPanStartRef.current.x + gestureState.dx, fullscreenPanStartRef.current.y + gestureState.dy);
        fullscreenPanOffsetRef.current = nextPan;
        fullscreenPanX.setValue(nextPan.x);
        fullscreenPanY.setValue(nextPan.y);
      } else if (Math.abs(gestureState.dx) > 12 || Math.abs(gestureState.dy) > 12) {
        fullscreenGestureRef.current = 'pan';
      }
    },
    onPanResponderRelease: (_event, gestureState) => {
      pinchDistanceRef.current = 0;
      const gesture = fullscreenGestureRef.current;
      if (fullscreenHadPinchRef.current || gesture === 'pinch') { fullscreenHadPinchRef.current = false; fullscreenGestureRef.current = 'tap'; return; }
      if (Math.abs(gestureState.dx) < 12 && Math.abs(gestureState.dy) < 12) {
        const now = Date.now();
        if (now - fullscreenLastTapRef.current < 300) setFullscreenZoom(fullscreenScaleRef.current > 1 ? 1 : 2.5);
        fullscreenLastTapRef.current = now;
        return;
      }
      if (fullscreenScaleRef.current > 1 || gesture === 'pan' && (Math.abs(gestureState.dx) <= 56 || Math.abs(gestureState.dx) <= Math.abs(gestureState.dy))) return;
      if (Math.abs(gestureState.dx) > 56 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy)) changeGalleryImage(gestureState.dx < 0 ? 1 : -1);
    },
    onPanResponderTerminate: () => { pinchDistanceRef.current = 0; fullscreenGestureRef.current = 'tap'; },
  }), [galleryImages.length, selectedImageIndex, width]);

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && fullscreenGallery) closeGallery(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [fullscreenGallery]);

  function openAdjacentProduct(direction: -1 | 1) {
    if (!hasProductSequence) return;
    const nextIndex = listingIndex + direction;
    const nextListing = listingSequence[nextIndex];
    if (!nextListing) return;
    navigation.replace('Product', { listing: nextListing, listingSequence, listingIndex: nextIndex });
  }

  const productPanResponder = React.useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gestureState) => hasProductSequence && Math.abs(gestureState.dx) > 18 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.25,
    onPanResponderRelease: (_event, gestureState) => {
      if (Math.abs(gestureState.dx) < 64 || Math.abs(gestureState.dx) < Math.abs(gestureState.dy)) return;
      openAdjacentProduct(gestureState.dx < 0 ? 1 : -1);
    },
  }), [hasProductSequence, listingIndex, listingSequence]);

  useEffect(() => {
    if (!listing || isSubmitting) return;
    intentRef.current = null;
    setErrorMessage(null);
  }, [listing?.id, quantity, gemnInput]);

  useEffect(() => {
    setQuantity(1);
    setGemnInput('0');
    intentRef.current = null;
    setErrorMessage(null);
  }, [listing?.id]);


  async function handleConfirmPurchase() {
    if (isSubmitting) return;
    if (!user) {
      setErrorMessage('Entre na sua conta para registrar um pedido.');
      return;
    }
    if (!listing) {
      setErrorMessage('Este anúncio não está disponível.');
      return;
    }

    const signature = `${listing.id}:${quantity}:${gemnUtilizado}`;
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      if (!intentRef.current || intentRef.current.signature !== signature) {
        intentRef.current = { signature, key: createSecureUuid() };
      }
      const idempotencyKey = intentRef.current?.key;
      if (!idempotencyKey) throw new Error('Não foi possível preparar a chave do pedido.');
      const result = await createOrder({
        listingId: listing.id,
        quantidade: quantity,
        formaPagamento: paymentMethod,
        gemnUtilizado,
        idempotencyKey,
      });
      // push força a confirmação no stack atual (MarketplaceStack ou HomeStack).
      // A navegação só ocorre depois do retorno validado da RPC.
      navigation.push('OrderConfirmation', { ...result, itemName: listing.name });
    } catch (error) {
      setErrorMessage(purchaseErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleAddToCart() {
    if (!listing) {
      setCartFeedback('Este anúncio não está disponível.');
      return;
    }
    addItem({ listingId: listing.id, sellerId: listing.sellerId, quantity });
    setCartFeedback(`${quantity} ${quantity === 1 ? 'unidade adicionada' : 'unidades adicionadas'} ao carrinho.`);
  }

  return (
    <AppScreen scroll edges={['top', 'right', 'bottom', 'left']} style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={() => navigation.goBack()} hitSlop={8} style={styles.backButton}>
          <MaterialCommunityIcons name="chevron-left" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.topBarTitle}>Detalhes do produto</Text>
        <View style={styles.topBarSpacer} />
      </View>
      <View style={[styles.layout, wide && styles.layoutWide]}>
        <View style={[styles.detailsColumn, wide && styles.detailsColumnWide]} {...productPanResponder.panHandlers}>
          <AppCard padding={0} style={[styles.productCard, wide && styles.productCardWide]}>
            <View style={styles.galleryColumn}>
            <View style={[styles.productVisual, !wide && { height: productImageHeight }, wide && styles.productVisualWide]}>
              {activeGalleryImage && activeGalleryImage.url && !galleryImageFailed ? <Pressable accessibilityRole="button" accessibilityLabel="Abrir galeria de imagens" onPress={() => { if (swipeMovedRef.current) { swipeMovedRef.current = false; return; } openGallery(selectedImageIndex); }} {...mainImagePanResponder.panHandlers} style={styles.galleryMainPressable}><Animated.View style={[styles.galleryAnimatedFrame, { transform: [{ translateX: galleryTranslateX }] }]}><Image source={{ uri: activeGalleryImage.url }} style={styles.productImage} onLoadStart={() => setGalleryImageLoading(true)} onLoad={() => setGalleryImageLoading(false)} onError={() => { setGalleryImageLoading(false); setGalleryImageFailed(true); }} /></Animated.View><View pointerEvents="none" style={styles.galleryPosition}><Text style={styles.galleryPositionText}>{selectedImageIndex + 1}/{galleryImages.length}</Text></View>{galleryImageLoading ? <View pointerEvents="none" style={styles.imageLoadingOverlay}><ActivityIndicator color={colors.brand} /></View> : null}</Pressable> : <View style={styles.iconDisc}><MaterialCommunityIcons name={icon} size={wide ? 72 : 60} color={colors.primary} /></View>}
              <AppBadge label={listing?.category ?? 'ANÚNCIO DA COMUNIDADE'} variant="neutral" />
            </View>
            <AppBadge label={listing?.category ?? 'ANÚNCIO DA COMUNIDADE'} variant="neutral" />
            {galleryImages.length > 1 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbnailList}>{galleryImages.map((image, index) => <Pressable key={image.id} accessibilityRole="button" accessibilityLabel={`Ver imagem ${index + 1} de ${galleryImages.length}`} onPress={() => selectGalleryImage(index)} style={[styles.thumbnailButton, selectedImageIndex === index && styles.thumbnailButtonActive]}><GalleryThumbnail url={image.url} /></Pressable>)}</ScrollView> : null}
            </View>
            <View style={styles.productCopy}>
              <Text style={styles.productName}>{name}</Text>
              {listing?.sellerName && listing.sellerId ? <SellerCard
                storeName={listing.sellerName}
                disabled={false}
                onPress={() => navigation.navigate('SellerStorefront', { sellerId: listing.sellerId })}
              /> : null}
              <View style={styles.priceRow}><Text style={styles.price}>{price}</Text></View>
              {gemnEligibility.enabled ? <View style={styles.gemnLine}><MaterialCommunityIcons name="star-four-points" size={15} color={colors.gemn} /><Text style={styles.gemnText}>Aceita Moeda GEMN · {gemnEligibility.value} GEMN por unidade</Text></View> : <View style={styles.gemnLine}><MaterialCommunityIcons name="information-outline" size={15} color={colors.textSecondary} /><Text style={styles.gemnMutedText}>Pagamento somente em reais</Text></View>}
            </View>
          </AppCard>

          {hasProductSequence ? <View style={[styles.productNavigation, wide && styles.productNavigationWide]}>
            {wide ? <TouchableOpacity accessibilityRole="button" accessibilityLabel="Produto anterior" disabled={listingIndex <= 0} onPress={() => openAdjacentProduct(-1)} style={[styles.productNavigationButton, listingIndex <= 0 && styles.productNavigationButtonDisabled]}><MaterialCommunityIcons name="chevron-left" size={20} color={listingIndex <= 0 ? colors.textMuted : colors.primary} /><Text style={styles.productNavigationButtonText}>Anterior</Text></TouchableOpacity> : null}
            <Text style={styles.productPosition}>{listingIndex + 1} de {listingSequence.length}</Text>
            {wide ? <TouchableOpacity accessibilityRole="button" accessibilityLabel="Próximo produto" disabled={listingIndex >= listingSequence.length - 1} onPress={() => openAdjacentProduct(1)} style={[styles.productNavigationButton, listingIndex >= listingSequence.length - 1 && styles.productNavigationButtonDisabled]}><Text style={styles.productNavigationButtonText}>Próximo</Text><MaterialCommunityIcons name="chevron-right" size={20} color={listingIndex >= listingSequence.length - 1 ? colors.textMuted : colors.primary} /></TouchableOpacity> : null}
          </View> : null}

          <View style={styles.aboutSection}>
            <Text style={styles.sectionTitle}>Sobre o produto</Text>
              <Text style={styles.description}>{listing?.description ?? 'O anúncio não está disponível para compra.'}</Text>
          </View>
        </View>

        <AppCard elevated={wide} style={[styles.purchaseCard, wide && styles.purchaseCardWide]}>
          <Text style={styles.purchaseTitle}>Sua compra</Text>
          <Text style={styles.sectionTitle}>Quantidade</Text>
          <View style={styles.quantityContainer}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Diminuir quantidade" hitSlop={4} style={styles.quantityButton} onPress={() => setQuantity((current) => Math.max(1, current - 1))}><MaterialCommunityIcons name="minus" size={22} color={colors.primary} /></TouchableOpacity>
            <Text style={styles.quantityText}>{quantity}</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Aumentar quantidade" hitSlop={4} style={styles.quantityButton} onPress={() => setQuantity((current) => current + 1)}><MaterialCommunityIcons name="plus" size={22} color={colors.primary} /></TouchableOpacity>
          </View>

          <Text style={styles.sectionTitle}>Forma de pagamento</Text>
          <View style={styles.paymentOptions}>
            <TouchableOpacity accessibilityRole="radio" accessibilityState={{ selected: paymentMethod === 'real' }} style={[styles.paymentOption, paymentMethod === 'real' && styles.paymentOptionActive]} onPress={() => setGemnInput('0')}>
              <MaterialCommunityIcons name="cash" size={23} color={paymentMethod === 'real' ? colors.primary : colors.textSecondary} /><Text style={styles.paymentTitle}>Reais</Text><Text style={styles.paymentAmount}>{formattedTotal}</Text>{paymentMethod === 'real' ? <MaterialCommunityIcons name="check-circle" size={20} color={colors.primary} /> : null}
            </TouchableOpacity>
            {gemnEligibility.enabled ? <View style={styles.gemnPaymentBox}>
              <View style={styles.gemnPaymentHeader}><MaterialCommunityIcons name="star-four-points" size={21} color={colors.gemn} /><Text style={styles.paymentTitle}>Usar GEMN</Text><Text style={styles.paymentAmount}>{gemnUtilizado.toFixed(2)} GEMN</Text></View>
              <TextInput accessibilityLabel="Quantidade de GEMN utilizada" keyboardType="decimal-pad" value={gemnInput} onChangeText={setGemnInput} style={styles.gemnInput} placeholder="0,00" />
              <TouchableOpacity accessibilityRole="button" onPress={() => setGemnInput(total.toFixed(2))}><Text style={styles.gemnMax}>Usar 100% em GEMN</Text></TouchableOpacity>
            </View> : null}
          </View>

          <View style={styles.summary}>
            <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Quantidade</Text><Text style={styles.summaryValue}>{quantity}</Text></View>
            <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Pagamento</Text><Text style={styles.summaryValue}>{paymentMethod === 'real' ? 'Reais' : paymentMethod === 'gemn' ? '100% GEMN' : 'Misto'}</Text></View>
            <View style={styles.summaryRow}><Text style={styles.summaryLabel}>GEMN utilizado</Text><Text style={styles.summaryValue}>{gemnUtilizado.toFixed(2)} GEMN</Text></View>
            <View style={styles.divider} />
            <View style={styles.totalRow}><Text style={styles.totalLabel}>Devido em reais</Text><Text style={styles.totalValue}>{(total - gemnUtilizado).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</Text></View>
          </View>
          {errorMessage ? <Text accessibilityRole="alert" style={styles.error}>{errorMessage}</Text> : null}
          <Text style={styles.paymentNote}>A forma escolhida registra apenas sua intenção de pagamento. Nenhum pagamento ou débito GEMN é realizado nesta etapa.</Text>
          {cartFeedback ? <Text accessibilityRole="text" style={styles.cartFeedback}>{cartFeedback}</Text> : null}
          <AppButton title="Adicionar ao carrinho" variant="outline" fullWidth onPress={handleAddToCart} disabled={!listing} style={styles.cartButton} />
          <AppButton title="Registrar pedido" fullWidth onPress={() => { void handleConfirmPurchase(); }} loading={isSubmitting} disabled={!listing} style={styles.confirmButton} />
        </AppCard>
      </View>
      <Modal visible={fullscreenGallery} transparent animationType="fade" onRequestClose={closeGallery}>
        <View style={styles.fullscreenBackdrop}>
          <Pressable accessibilityRole="button" accessibilityLabel="Fechar galeria" onPress={closeGallery} style={styles.fullscreenClose}><MaterialCommunityIcons name="close" size={25} color={colors.white} /></Pressable>
          <Animated.View style={[styles.fullscreenPanLayer, { transform: [{ translateX: fullscreenPanX }, { translateY: fullscreenPanY }] }]} onTouchStart={handleFullscreenTouchStart} onTouchMove={handleFullscreenTouchMove} onTouchEnd={handleFullscreenTouchEnd} onTouchCancel={handleFullscreenTouchEnd}>
          {activeGalleryImage && activeGalleryImage.url && !fullscreenImageFailed ? <View style={styles.fullscreenImageWrap} {...fullscreenPanResponder.panHandlers}><Animated.View style={[styles.galleryAnimatedFrame, { transform: [{ translateX: galleryTranslateX }, { scale: zoomScale }] }]}><Image source={{ uri: activeGalleryImage.url }} style={styles.fullscreenImage} resizeMode="contain" onLoadStart={() => setFullscreenImageLoading(true)} onLoad={() => setFullscreenImageLoading(false)} onError={() => { setFullscreenImageLoading(false); setFullscreenImageFailed(true); }} /></Animated.View>{fullscreenImageLoading ? <View pointerEvents="none" style={styles.fullscreenLoading}><ActivityIndicator color={colors.white} /></View> : null}</View> : <View style={styles.fullscreenImageFallback}><MaterialCommunityIcons name="image-off-outline" size={48} color={colors.white} /><Text style={styles.fullscreenImageFallbackText}>Não foi possível abrir esta imagem.</Text></View>}
          {galleryImages.length > 1 ? <><Pressable accessibilityRole="button" accessibilityLabel="Foto anterior" accessibilityState={{ disabled: selectedImageIndex === 0 }} disabled={selectedImageIndex === 0} onPress={() => changeGalleryImage(-1)} style={[styles.fullscreenArrow, styles.fullscreenArrowLeft, selectedImageIndex === 0 && styles.fullscreenArrowDisabled]}><MaterialCommunityIcons name="chevron-left" size={34} color={colors.white} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Próxima foto" accessibilityState={{ disabled: selectedImageIndex === galleryImages.length - 1 }} disabled={selectedImageIndex === galleryImages.length - 1} onPress={() => changeGalleryImage(1)} style={[styles.fullscreenArrow, styles.fullscreenArrowRight, selectedImageIndex === galleryImages.length - 1 && styles.fullscreenArrowDisabled]}><MaterialCommunityIcons name="chevron-right" size={34} color={colors.white} /></Pressable></> : null}
          </Animated.View>
          <View style={styles.fullscreenControls}><Pressable accessibilityRole="button" accessibilityLabel="Diminuir zoom" onPress={() => setFullscreenZoom(fullscreenScaleRef.current - 0.25)} style={styles.fullscreenControl}><MaterialCommunityIcons name="minus" size={22} color={colors.white} /></Pressable><Text style={styles.fullscreenCounter}>{selectedImageIndex + 1}/{galleryImages.length}</Text><Pressable accessibilityRole="button" accessibilityLabel="Aumentar zoom" onPress={() => setFullscreenZoom(fullscreenScaleRef.current + 0.25)} style={styles.fullscreenControl}><MaterialCommunityIcons name="plus" size={22} color={colors.white} /></Pressable></View>
        </View>
      </Modal>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background },
  content: { paddingTop: spacing.xs, paddingBottom: spacing.xxl, gap: spacing.md },
  topBar: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { width: 40, height: 40, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  topBarTitle: { ...typography.heading4, color: colors.text },
  topBarSpacer: { width: 40, height: 40 },
  layout: { gap: spacing.md },
  layoutWide: { flexDirection: 'row', alignItems: 'flex-start' },
  detailsColumn: { gap: spacing.md },
  detailsColumnWide: { flex: 1, minWidth: 0 },
  productCard: { overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, ...shadows.subtle },
  productCardWide: { flexDirection: 'row' },
  galleryColumn: { minWidth: 0 },
  productNavigation: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  productNavigationWide: { justifyContent: 'space-between' },
  productNavigationButton: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  productNavigationButtonDisabled: { opacity: 0.55 },
  productNavigationButtonText: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  productPosition: { ...typography.caption, color: colors.textMuted },
  productVisual: { backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center', gap: spacing.md, position: 'relative', overflow: 'hidden' },
  productVisualWide: { width: '42%', minHeight: 300 },
  galleryMainPressable: { width: '100%', height: '100%' },
  galleryAnimatedFrame: { width: '100%', height: '100%' },
  galleryPosition: { position: 'absolute', right: spacing.sm, bottom: spacing.sm, paddingHorizontal: spacing.sm, minHeight: 26, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15, 81, 57, 0.78)' },
  galleryPositionText: { ...typography.caption, color: colors.white, fontWeight: '700' },
  imageLoadingOverlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.24)' },
  productImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  thumbnailList: { gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  thumbnailButton: { width: 64, height: 64, borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  thumbnailButtonActive: { borderWidth: 2, borderColor: colors.brand },
  thumbnailImageWrap: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  thumbnailImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  thumbnailFallback: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted },
  thumbnailLoading: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.5)' },
  fullscreenBackdrop: { flex: 1, backgroundColor: 'rgba(6, 19, 14, 0.96)', alignItems: 'center', justifyContent: 'center' },
  fullscreenPanLayer: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  fullscreenClose: { position: 'absolute', top: spacing.xl, right: spacing.lg, zIndex: 2, width: 44, height: 44, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.14)' },
  fullscreenArrow: { position: 'absolute', top: '46%', zIndex: 2, width: 46, height: 54, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.14)' },
  fullscreenArrowLeft: { left: spacing.md },
  fullscreenArrowRight: { right: spacing.md },
  fullscreenArrowDisabled: { opacity: 0.28 },
  fullscreenImageWrap: { width: '100%', height: '78%', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  fullscreenImage: { width: '100%', height: '100%' },
  fullscreenLoading: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  fullscreenImageFallback: { height: '78%', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  fullscreenImageFallbackText: { ...typography.bodySmall, color: colors.white },
  fullscreenControls: { position: 'absolute', bottom: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  fullscreenControl: { width: 42, height: 42, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.14)' },
  fullscreenCounter: { ...typography.bodySmall, color: colors.white, minWidth: 44, textAlign: 'center' },
  iconDisc: { width: 116, height: 116, borderRadius: radius.full, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadows.subtle },
  productCopy: { flex: 1, padding: spacing.md, gap: spacing.sm },
  productName: { ...typography.heading1, color: colors.brandDark },
  sellerCard: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  sellerCardPressed: { opacity: 0.82, backgroundColor: colors.brandLight },
  sellerLogo: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryLight, borderWidth: 1, borderColor: colors.border, flexShrink: 0 },
  sellerCardCopy: { flex: 1, minWidth: 0, gap: 2 },
  sellerCardLabel: { ...typography.caption, color: colors.textSecondary },
  sellerCardName: { ...typography.heading4, color: colors.brandDark, fontWeight: '600', flexShrink: 1 },
  sellerApproved: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  sellerApprovedText: { ...typography.caption, color: colors.brand, fontWeight: '600' },
  sellerVisit: { flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 0 },
  sellerVisitText: { ...typography.caption, color: colors.brand, fontWeight: '600' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  price: { ...typography.heading1, color: colors.brandDark },
  gemnLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  gemnText: { ...typography.caption, color: colors.brand, fontWeight: '600' },
  gemnMutedText: { ...typography.caption, color: colors.textSecondary },
  aboutSection: { gap: spacing.sm },
  sectionTitle: { ...typography.heading3, color: colors.text, marginTop: spacing.xs, marginBottom: spacing.xs },
  description: { ...typography.bodySmall, color: colors.textSecondary },
  purchaseCard: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, gap: spacing.sm, backgroundColor: colors.surface, ...shadows.subtle },
  purchaseCardWide: { width: 368, flexShrink: 0 },
  purchaseTitle: { ...typography.heading2, color: colors.text, marginBottom: spacing.xs },
  quantityContainer: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: spacing.xs },
  quantityButton: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  quantityText: { width: 52, textAlign: 'center', ...typography.heading3, color: colors.text },
  paymentOptions: { gap: spacing.sm },
  paymentOption: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  paymentOptionActive: { borderColor: colors.brand, backgroundColor: colors.brandLight },
  paymentOptionGemnActive: { borderColor: colors.gemn, backgroundColor: colors.gemnLight },
  gemnPaymentBox: { borderWidth: 1, borderColor: colors.gemn, borderRadius: radius.md, padding: spacing.sm, gap: spacing.xs, backgroundColor: colors.gemnLight },
  gemnPaymentHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  gemnInput: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.surface, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, color: colors.text },
  gemnMax: { color: colors.warning, fontWeight: '700', fontSize: 12 },
  paymentTitle: { ...typography.label, color: colors.text },
  paymentAmount: { flex: 1, textAlign: 'right', ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  summary: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.sm },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryLabel: { ...typography.bodySmall, color: colors.textSecondary },
  summaryValue: { ...typography.bodySmall, color: colors.text, fontWeight: '600' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { ...typography.heading3, color: colors.text },
  totalValue: { ...typography.heading2, color: colors.brandDark },
  confirmButton: { width: '100%', marginTop: spacing.sm, backgroundColor: colors.brand },
  cartButton: { width: '100%', marginTop: spacing.sm },
  cartFeedback: { ...typography.caption, color: colors.success, textAlign: 'center', marginTop: spacing.xs },
  error: { ...typography.bodySmall, color: colors.error },
  paymentNote: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
});
