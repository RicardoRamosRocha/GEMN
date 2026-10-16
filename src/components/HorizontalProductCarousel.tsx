import React from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { colors, layout, radius, shadows, spacing } from '../theme/tokens';
import type { GemnProduct } from '../context/ProductsContext';

type HorizontalProductCarouselProps = {
  products: GemnProduct[];
  renderItem: (product: GemnProduct, index: number) => React.ReactNode;
  variant?: 'default' | 'home';
};

export function HorizontalProductCarousel({ products, renderItem, variant = 'default' }: HorizontalProductCarouselProps) {
  const { width } = useWindowDimensions();
  const scrollRef = React.useRef<ScrollView>(null);
  const [offset, setOffset] = React.useState(0);
  const desktop = width >= layout.breakpoints.desktop;
  const gap = variant === 'home' ? spacing.smMd : desktop ? spacing.md : spacing.smMd;
  const cardWidth = desktop ? variant === 'home' ? 240 : 300 : variant === 'home' ? Math.min(320, Math.max(252, width * 0.78)) : Math.min(286, Math.max(220, width * 0.74));
  const step = cardWidth + gap;

  function scrollBy(direction: -1 | 1) {
    scrollRef.current?.scrollTo({ x: Math.max(0, offset + direction * step * (desktop ? 2 : 1)), animated: true });
  }

  return (
    <View style={styles.wrapper}>
      {desktop ? (
        <View style={styles.controls}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Produtos anteriores"
            accessibilityState={{ disabled: offset <= 4 }}
            disabled={offset <= 4}
            onPress={() => scrollBy(-1)}
            style={[styles.arrow, offset <= 4 && styles.arrowDisabled]}
          >
            <MaterialCommunityIcons name="chevron-left" size={22} color={offset <= 4 ? colors.textMuted : colors.brandDark} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Próximos produtos" onPress={() => scrollBy(1)} style={styles.arrow}>
            <MaterialCommunityIcons name="chevron-right" size={22} color={colors.brandDark} />
          </Pressable>
        </View>
      ) : null}

      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.list, { gap }]}
        scrollEventThrottle={16}
        onScroll={(event) => setOffset(event.nativeEvent.contentOffset.x)}
      >
        {products.map((product, index) => (
          <View key={product.id} style={[styles.item, { width: cardWidth }]}>
            {renderItem(product, index)}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { width: '100%', position: 'relative' },
  list: { paddingRight: spacing.lg, alignItems: 'flex-start', justifyContent: 'flex-start', flexGrow: 0 },
  item: { alignSelf: 'flex-start' },
  controls: { position: 'absolute', right: spacing.xs, top: -spacing.xl, zIndex: 2, flexDirection: 'row', gap: spacing.xs },
  arrow: { width: 36, height: 36, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, ...shadows.subtle },
  arrowDisabled: { opacity: 0.55 },
});
