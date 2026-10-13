import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppBadge, AppCard } from './ui';
import type { SellerDirectoryStore } from '../types/sellerDirectory';
import { colors, radius, shadows, spacing, typography } from '../theme/tokens';

export type SellerDirectoryCardProps = {
  store: SellerDirectoryStore;
  onPress: () => void;
};

export function SellerDirectoryCard({ store, onPress }: SellerDirectoryCardProps) {
  const [imageFailed, setImageFailed] = React.useState(false);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Abrir vitrine de ${store.storeName}`}
      onPress={onPress}
      style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
    >
      <AppCard elevated style={styles.card} padding={0}>
        <View style={styles.logoArea}>
          {store.logoUrl && !imageFailed ? (
            <Image
              accessibilityLabel={`Logotipo de ${store.storeName}`}
              source={{ uri: store.logoUrl }}
              resizeMode="contain"
              style={styles.logo}
              onError={() => setImageFailed(true)}
            />
          ) : (
            <View style={styles.logoFallback}>
              <MaterialCommunityIcons name="storefront-outline" size={42} color={colors.primary} />
            </View>
          )}
        </View>
        <View style={styles.info}>
          <View style={styles.titleRow}>
            <Text style={styles.storeName} numberOfLines={2}>{store.storeName}</Text>
            <AppBadge label="Ativa" variant="success" />
          </View>
          <Text style={styles.description} numberOfLines={3}>{store.description}</Text>
          <View style={styles.linkRow}>
            <Text style={styles.linkText}>Ver vitrine</Text>
            <MaterialCommunityIcons name="arrow-right" size={17} color={colors.primary} />
          </View>
        </View>
      </AppCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: { width: '100%' },
  pressed: { opacity: 0.86 },
  card: { overflow: 'hidden', borderWidth: 1, borderColor: colors.border, ...shadows.card },
  logoArea: { aspectRatio: 16 / 7, minHeight: 132, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  logo: { width: '78%', height: '78%' },
  logoFallback: { width: 76, height: 76, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryLight },
  info: { padding: spacing.md, gap: spacing.sm },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  storeName: { ...typography.heading3, color: colors.text, flex: 1, minWidth: 0 },
  description: { ...typography.bodySmall, color: colors.textSecondary, minHeight: 40 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  linkText: { ...typography.caption, color: colors.primary, fontWeight: '700' },
});
