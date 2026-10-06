import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../theme/colors';
import { useProducts } from '../context/ProductsContext';

export default function MyProductsScreen({ navigation }: any) {
  const { products } = useProducts();

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Meus produtos</Text>
            <Text style={styles.subtitle}>
              Gerencie seus produtos e serviços
            </Text>
          </View>

          <View style={styles.counter}>
            <Text style={styles.counterValue}>
              {products.length}
            </Text>
            <Text style={styles.counterLabel}>
              anúncios
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.addButton}
          onPress={() => navigation.navigate('CreateProduct')}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons
            name="plus"
            size={24}
            color={colors.white}
          />

          <Text style={styles.addButtonText}>
            Adicionar produto ou serviço
          </Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>
          Seus anúncios
        </Text>

        {products.map((product) => (
          <View
            key={product.id}
            style={styles.productCard}
          >
            <View style={styles.productIcon}>
              <MaterialCommunityIcons
                name={product.icon}
                size={34}
                color={colors.primary}
              />
            </View>

            <View style={styles.productInfo}>
              <View style={styles.typeRow}>
                <Text style={styles.productType}>
                  {product.type}
                </Text>

                <View style={styles.status}>
                  <View
                    style={[
                      styles.statusDot,
                      !product.active && styles.statusDotInactive,
                    ]}
                  />
                  <Text style={styles.statusText}>
                    {product.active ? 'Ativo' : 'Inativo'}
                  </Text>
                </View>
              </View>

              <Text style={styles.productName}>
                {product.name}
              </Text>

              <Text style={styles.productPrice}>
                {product.price.toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                })}
              </Text>
            </View>

            <TouchableOpacity style={styles.moreButton}>
              <MaterialCommunityIcons
                name="dots-vertical"
                size={24}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
          </View>
        ))}

        <View style={styles.infoCard}>
          <MaterialCommunityIcons
            name="information-outline"
            size={24}
            color={colors.primary}
          />

          <Text style={styles.infoText}>
            Seus produtos e serviços poderão ser encontrados
            pelos membros da comunidade no Marketplace GEMN.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
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
    padding: 20,
    paddingBottom: 40,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },

  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
  },

  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
  },

  counter: {
    backgroundColor: colors.primaryLight,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'center',
  },

  counterValue: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.primary,
  },

  counterLabel: {
    fontSize: 11,
    color: colors.primary,
  },

  addButton: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },

  addButtonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '700',
    marginLeft: 8,
  },

  sectionTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 14,
  },

  productCard: {
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },

  productIcon: {
    width: 62,
    height: 62,
    borderRadius: 16,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },

  productInfo: {
    flex: 1,
    marginLeft: 14,
  },

  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },

  productType: {
    fontSize: 12,
    color: colors.textSecondary,
    marginRight: 10,
  },

  status: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginRight: 4,
  },

  statusDotInactive: {
    backgroundColor: colors.textSecondary,
  },

  statusText: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: '600',
  },

  productName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },

  productPrice: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary,
    marginTop: 5,
  },

  moreButton: {
    padding: 8,
  },

  infoCard: {
    backgroundColor: colors.primaryLight,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    marginTop: 14,
  },

  infoText: {
    flex: 1,
    marginLeft: 10,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },
});
