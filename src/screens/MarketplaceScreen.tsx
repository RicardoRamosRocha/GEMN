import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../theme/colors';

const { width } = Dimensions.get('window');

const products = [
  {
    icon: 'food-apple',
    category: 'Comida',
    name: 'Cesta de frutas',
    price: 'R$ 30,00',
    coinPrice: '15 GEMN',
    rating: '4.9',
    seller: 'Mundo Novo',
  },
  {
    icon: 'tshirt-crew',
    category: 'Moda',
    name: 'Camiseta exclusiva',
    price: 'R$ 45,00',
    coinPrice: '22 GEMN',
    rating: '4.8',
    seller: 'GEMN Store',
  },
  {
    icon: 'tools',
    category: 'Serviços',
    name: 'Serviço de manutenção',
    price: 'R$ 80,00',
    coinPrice: '40 GEMN',
    rating: '5.0',
    seller: 'João Serviços',
  },
  {
    icon: 'cake-variant',
    category: 'Comida',
    name: 'Bolo caseiro',
    price: 'R$ 35,00',
    coinPrice: '18 GEMN',
    rating: '4.9',
    seller: 'Sabor da Comunidade',
  },
];

const categories = [
  {
    icon: 'food-apple-outline',
    label: 'Comida',
  },
  {
    icon: 'tools',
    label: 'Serviços',
  },
  {
    icon: 'tshirt-crew-outline',
    label: 'Moda',
  },
  {
    icon: 'home-outline',
    label: 'Casa',
  },
  {
    icon: 'car-outline',
    label: 'Veículos',
  },
];

export default function MarketplaceScreen({ navigation }: any) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* HEADER */}

        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Olá, Ricardo</Text>

            <View style={styles.communityRow}>
              <View style={styles.communityDot} />

              <Text style={styles.communityText}>
                Comunidade Mundo Novo
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.profileButton}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons
              name="account-outline"
              size={23}
              color={colors.text}
            />

            <View style={styles.notificationDot} />
          </TouchableOpacity>
        </View>

        {/* SEARCH */}

        <View style={styles.searchContainer}>
          <MaterialCommunityIcons
            name="magnify"
            size={23}
            color="#8B8B8B"
          />

          <TextInput
            style={styles.searchInput}
            placeholder="O que você procura?"
            placeholderTextColor="#999"
          />

          <TouchableOpacity
            style={styles.searchFilter}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons
              name="tune-variant"
              size={19}
              color={colors.white}
            />
          </TouchableOpacity>
        </View>

        {/* WALLET */}

        <View style={styles.walletCard}>
          <View style={styles.walletTop}>
            <View>
              <Text style={styles.walletLabel}>
                SALDO DISPONÍVEL
              </Text>

              <Text style={styles.walletValue}>
                R$ 150,00
              </Text>
            </View>

            <View style={styles.walletIcon}>
              <MaterialCommunityIcons
                name="wallet-outline"
                size={23}
                color={colors.white}
              />
            </View>
          </View>

          <View style={styles.walletDivider} />

          <View style={styles.walletBottom}>
            <View style={styles.gemnBalance}>
              <View style={styles.gemnIcon}>
                <MaterialCommunityIcons
                  name="star-four-points"
                  size={14}
                  color={colors.secondary}
                />
              </View>

              <View>
                <Text style={styles.gemnLabel}>
                  Moeda Social
                </Text>

                <Text style={styles.gemnValue}>
                  50 GEMN
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.walletButton}
              activeOpacity={0.8}
            >
              <Text style={styles.walletButtonText}>
                Ver carteira
              </Text>

              <MaterialCommunityIcons
                name="arrow-right"
                size={16}
                color={colors.white}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* CATEGORIES */}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Explore
          </Text>

          <TouchableOpacity>
            <Text style={styles.seeAll}>
              Ver todas
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categories}
        >
          {categories.map((category, index) => (
            <Category
              key={category.label}
              icon={category.icon}
              label={category.label}
              active={index === 0}
            />
          ))}
        </ScrollView>

        {/* FEATURED */}

        <View style={styles.featuredHeader}>
          <View>
            <Text style={styles.sectionTitle}>
              Ofertas para você
            </Text>

            <Text style={styles.sectionSubtitle}>
              Produtos da nossa comunidade
            </Text>
          </View>

          <TouchableOpacity>
            <Text style={styles.seeAll}>
              Ver mais
            </Text>
          </TouchableOpacity>
        </View>

        {/* PRODUCTS */}

        <View style={styles.products}>
          {products.map((product) => (
            <ProductCard
              key={product.name}
              icon={product.icon}
              category={product.category}
              name={product.name}
              price={product.price}
              coinPrice={product.coinPrice}
              rating={product.rating}
              seller={product.seller}
              onPress={() =>
                navigation.navigate('Product', {
                  name: product.name,
                  price: product.price,
                  icon: product.icon,
                })
              }
            />
          ))}
        </View>

        {/* COMMUNITY BANNER */}

        <View style={styles.communityBanner}>
          <View style={styles.bannerIcon}>
            <MaterialCommunityIcons
              name="account-group-outline"
              size={26}
              color={colors.primary}
            />
          </View>

          <View style={styles.bannerText}>
            <Text style={styles.bannerTitle}>
              Compre de quem faz parte
            </Text>

            <Text style={styles.bannerDescription}>
              Valorize os produtos e serviços da nossa comunidade.
            </Text>
          </View>

          <MaterialCommunityIcons
            name="chevron-right"
            size={22}
            color={colors.primary}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/* CATEGORY */

function Category({
  icon,
  label,
  active = false,
}: {
  icon: any;
  label: string;
  active?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.category,
        active && styles.categoryActive,
      ]}
      activeOpacity={0.85}
    >
      <View
        style={[
          styles.categoryIcon,
          active && styles.categoryIconActive,
        ]}
      >
        <MaterialCommunityIcons
          name={icon}
          size={23}
          color={
            active
              ? colors.white
              : colors.primary
          }
        />
      </View>

      <Text
        style={[
          styles.categoryText,
          active && styles.categoryTextActive,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/* PRODUCT */

function ProductCard({
  icon,
  category,
  name,
  price,
  coinPrice,
  rating,
  seller,
  onPress,
}: {
  icon: any;
  category: string;
  name: string;
  price: string;
  coinPrice: string;
  rating: string;
  seller: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.productCard}
      onPress={onPress}
      activeOpacity={0.92}
    >
      <View style={styles.productVisual}>
        <View style={styles.productCircle}>
          <MaterialCommunityIcons
            name={icon}
            size={42}
            color={colors.primary}
          />
        </View>

        <TouchableOpacity
          style={styles.favoriteButton}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons
            name="heart-outline"
            size={19}
            color={colors.text}
          />
        </TouchableOpacity>

        <View style={styles.productCategory}>
          <Text style={styles.productCategoryText}>
            {category}
          </Text>
        </View>
      </View>

      <View style={styles.productInfo}>
        <Text
          style={styles.productName}
          numberOfLines={2}
        >
          {name}
        </Text>

        <View style={styles.sellerRow}>
          <MaterialCommunityIcons
            name="store-outline"
            size={14}
            color={colors.textSecondary}
          />

          <Text
            style={styles.seller}
            numberOfLines={1}
          >
            {seller}
          </Text>
        </View>

        <View style={styles.ratingRow}>
          <MaterialCommunityIcons
            name="star"
            size={14}
            color={colors.secondary}
          />

          <Text style={styles.rating}>
            {rating}
          </Text>
        </View>

        <Text style={styles.price}>
          {price}
        </Text>

        <View style={styles.coinRow}>
          <View style={styles.coinMini}>
            <MaterialCommunityIcons
              name="star-four-points"
              size={10}
              color={colors.secondary}
            />
          </View>

          <Text style={styles.coinText}>
            {coinPrice}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },

  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 40,
  },

  /* HEADER */

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 22,
  },

  greeting: {
    fontSize: 27,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.5,
  },

  communityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
  },

  communityDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.secondary,
    marginRight: 7,
  },

  communityText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },

  profileButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    position: 'relative',
  },

  notificationDot: {
    position: 'absolute',
    top: 9,
    right: 9,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.secondary,
    borderWidth: 1,
    borderColor: colors.white,
  },

  /* SEARCH */

  searchContainer: {
    height: 56,
    backgroundColor: colors.white,
    borderRadius: 17,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 6,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },

  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    marginLeft: 9,
    paddingVertical: 0,
  },

  searchFilter: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* WALLET */

  walletCard: {
    backgroundColor: colors.primary,
    borderRadius: 24,
    padding: 20,
    marginBottom: 30,
  },

  walletTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  walletLabel: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 6,
  },

  walletValue: {
    color: colors.white,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },

  walletIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.13)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  walletDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.14)',
    marginVertical: 17,
  },

  walletBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  gemnBalance: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  gemnIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: 'rgba(212,160,23,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
  },

  gemnLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.62)',
    marginBottom: 2,
  },

  gemnValue: {
    fontSize: 14,
    color: colors.white,
    fontWeight: '700',
  },

  walletButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },

  walletButtonText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
  },

  /* SECTIONS */

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },

  featuredHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 15,
  },

  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.3,
  },

  sectionSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },

  seeAll: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },

  /* CATEGORIES */

  categories: {
    gap: 10,
    paddingBottom: 30,
    paddingRight: 15,
  },

  category: {
    width: 82,
    height: 92,
    borderRadius: 18,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },

  categoryActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },

  categoryIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 7,
  },

  categoryIconActive: {
    backgroundColor: 'rgba(255,255,255,0.14)',
  },

  categoryText: {
    fontSize: 11,
    color: colors.text,
    fontWeight: '700',
  },

  categoryTextActive: {
    color: colors.white,
  },

  /* PRODUCTS */

  products: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 16,
  },

  productCard: {
    width: '48%',
    backgroundColor: colors.white,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },

  productVisual: {
    height: 155,
    backgroundColor: '#EEF6EF',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },

  productCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },

  favoriteButton: {
    position: 'absolute',
    top: 11,
    right: 11,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },

  productCategory: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },

  productCategoryText: {
    fontSize: 9,
    color: colors.primary,
    fontWeight: '800',
  },

  productInfo: {
    padding: 13,
  },

  productName: {
    fontSize: 15,
    lineHeight: 19,
    color: colors.text,
    fontWeight: '800',
    minHeight: 38,
  },

  sellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 7,
  },

  seller: {
    flex: 1,
    fontSize: 10,
    color: colors.textSecondary,
    marginLeft: 4,
  },

  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
  },

  rating: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: '600',
    marginLeft: 4,
  },

  price: {
    fontSize: 18,
    color: colors.text,
    fontWeight: '800',
    marginTop: 8,
  },

  coinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
  },

  coinMini: {
    width: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: colors.secondaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },

  coinText: {
    fontSize: 10,
    color: colors.secondary,
    fontWeight: '800',
    marginLeft: 5,
  },

  /* COMMUNITY BANNER */

  communityBanner: {
    marginTop: 26,
    padding: 16,
    borderRadius: 20,
    backgroundColor: colors.secondaryLight,
    flexDirection: 'row',
    alignItems: 'center',
  },

  bannerIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },

  bannerText: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },

  bannerTitle: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '800',
    marginBottom: 3,
  },

  bannerDescription: {
    fontSize: 10,
    color: colors.textSecondary,
    lineHeight: 15,
  },
});