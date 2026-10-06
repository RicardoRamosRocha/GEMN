import React, { useState } from 'react';
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

export default function ProductScreen({ route, navigation }: any) {
  const {
    name = 'Produto Exemplo',
    price = 'R$ 50,00',
    icon = 'package-variant-closed',
  } = route?.params ?? {};

  const [quantity, setQuantity] = useState(1);

  const [paymentMethod, setPaymentMethod] = useState<'money' | 'gemn'>(
    'money'
  );

  const numericPrice =
    Number(
      price.replace('R$', '').replace(/\./g, '').replace(',', '.')
    ) || 0;

  const total = numericPrice * quantity;

  const formattedTotal = total.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

  const gemnTotal = quantity * 10;

  function handleConfirmPurchase() {
    navigation.navigate('OrderConfirmation', {
      name,
      quantity,
      paymentMethod,
      total:
        paymentMethod === 'money'
          ? formattedTotal
          : `${gemnTotal} GEMN`,
    });
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Imagem do produto */}
        <View style={styles.productImage}>
          <MaterialCommunityIcons
            name={icon}
            size={90}
            color={colors.textSecondary}
          />
        </View>

        {/* Informações */}
        <View style={styles.info}>
          <Text style={styles.productName}>{name}</Text>

          {/* Avaliação */}
          <View style={styles.rating}>
            <MaterialCommunityIcons
              name="star"
              size={20}
              color={colors.secondary}
            />

            <Text style={styles.ratingText}>4,8</Text>

            <Text style={styles.reviews}>
              (12 avaliações)
            </Text>
          </View>

          {/* Preço */}
          <Text style={styles.price}>{price}</Text>

          {/* Descrição */}
          <Text style={styles.descriptionTitle}>
            Sobre o produto
          </Text>

          <Text style={styles.description}>
            Cesta com frutas frescas selecionadas, produzidas
            por membros da comunidade GEMN. Uma ótima opção
            para sua família.
          </Text>

          {/* Vendedor */}
          <View style={styles.seller}>
            <View style={styles.sellerIcon}>
              <MaterialCommunityIcons
                name="account"
                size={28}
                color={colors.textSecondary}
              />
            </View>

            <View>
              <Text style={styles.sellerLabel}>
                Vendedor
              </Text>

              <Text style={styles.sellerName}>
                Comunidade Mundo Novo
              </Text>
            </View>
          </View>

          {/* Localização */}
          <View style={styles.location}>
            <MaterialCommunityIcons
              name="map-marker-outline"
              size={24}
              color={colors.textSecondary}
            />

            <Text style={styles.locationText}>
              Belo Horizonte - MG
            </Text>
          </View>

          {/* Quantidade */}
          <Text style={styles.sectionTitle}>
            Quantidade
          </Text>

          <View style={styles.quantityContainer}>
            <TouchableOpacity
              style={styles.quantityButton}
              onPress={() =>
                setQuantity((current) =>
                  Math.max(1, current - 1)
                )
              }
            >
              <MaterialCommunityIcons
                name="minus"
                size={22}
                color={colors.primary}
              />
            </TouchableOpacity>

            <Text style={styles.quantityText}>
              {quantity}
            </Text>

            <TouchableOpacity
              style={styles.quantityButton}
              onPress={() =>
                setQuantity((current) => current + 1)
              }
            >
              <MaterialCommunityIcons
                name="plus"
                size={22}
                color={colors.primary}
              />
            </TouchableOpacity>
          </View>

          {/* Forma de pagamento */}
          <Text style={styles.sectionTitle}>
            Forma de pagamento
          </Text>

          <View style={styles.paymentOptions}>
            {/* Reais */}
            <TouchableOpacity
              style={[
                styles.paymentOption,
                paymentMethod === 'money' &&
                  styles.paymentOptionActive,
              ]}
              onPress={() => setPaymentMethod('money')}
            >
              <MaterialCommunityIcons
                name="cash"
                size={25}
                color={
                  paymentMethod === 'money'
                    ? colors.primary
                    : colors.textSecondary
                }
              />

              <View style={styles.paymentInfo}>
                <Text style={styles.paymentTitle}>
                  Reais
                </Text>

                <Text style={styles.paymentDescription}>
                  Pagamento tradicional
                </Text>
              </View>

              {paymentMethod === 'money' && (
                <MaterialCommunityIcons
                  name="check-circle"
                  size={22}
                  color={colors.primary}
                />
              )}
            </TouchableOpacity>

            {/* GEMN */}
            <TouchableOpacity
              style={[
                styles.paymentOption,
                paymentMethod === 'gemn' &&
                  styles.paymentOptionActive,
              ]}
              onPress={() => setPaymentMethod('gemn')}
            >
              <MaterialCommunityIcons
                name="circle-multiple"
                size={25}
                color={
                  paymentMethod === 'gemn'
                    ? colors.secondary
                    : colors.textSecondary
                }
              />

              <View style={styles.paymentInfo}>
                <Text style={styles.paymentTitle}>
                  Moeda GEMN
                </Text>

                <Text style={styles.paymentDescription}>
                  Use sua moeda social
                </Text>
              </View>

              {paymentMethod === 'gemn' && (
                <MaterialCommunityIcons
                  name="check-circle"
                  size={22}
                  color={colors.primary}
                />
              )}
            </TouchableOpacity>
          </View>

          {/* Resumo */}
          <View style={styles.summary}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>
                Quantidade
              </Text>

              <Text style={styles.summaryValue}>
                {quantity}
              </Text>
            </View>

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>
                Pagamento
              </Text>

              <Text style={styles.summaryValue}>
                {paymentMethod === 'money'
                  ? 'Reais'
                  : 'GEMN'}
              </Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>
                Total
              </Text>

              <Text style={styles.totalValue}>
                {paymentMethod === 'money'
                  ? formattedTotal
                  : `${gemnTotal} GEMN`}
              </Text>
            </View>
          </View>

          {/* Confirmar compra */}
          <TouchableOpacity
            style={styles.button}
            onPress={handleConfirmPurchase}
          >
            <MaterialCommunityIcons
              name="cart-outline"
              size={22}
              color={colors.white}
            />

            <Text style={styles.buttonText}>
              Confirmar compra
            </Text>
          </TouchableOpacity>
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
    paddingBottom: 40,
  },

  productImage: {
    height: 300,
    backgroundColor: '#EDEDED',
    alignItems: 'center',
    justifyContent: 'center',
  },

  info: {
    padding: 20,
  },

  productName: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
  },

  rating: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },

  ratingText: {
    fontSize: 15,
    fontWeight: '700',
    marginLeft: 5,
    color: colors.text,
  },

  reviews: {
    fontSize: 14,
    color: colors.textSecondary,
    marginLeft: 5,
  },

  price: {
    fontSize: 26,
    fontWeight: '800',
    marginTop: 18,
    color: colors.primary,
  },

  descriptionTitle: {
    fontSize: 19,
    fontWeight: '700',
    marginTop: 28,
    marginBottom: 8,
    color: colors.text,
  },

  description: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 23,
  },

  seller: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 28,
    padding: 14,
    backgroundColor: colors.white,
    borderRadius: 16,
  },

  sellerIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EDEDED',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  sellerLabel: {
    fontSize: 12,
    color: '#888',
  },

  sellerName: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 3,
    color: colors.text,
  },

  location: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
  },

  locationText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginLeft: 6,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginTop: 28,
    marginBottom: 12,
  },

  quantityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: 5,
  },

  quantityButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },

  quantityText: {
    width: 50,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },

  paymentOptions: {
    gap: 10,
  },

  paymentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },

  paymentOptionActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },

  paymentInfo: {
    flex: 1,
    marginLeft: 12,
  },

  paymentTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },

  paymentDescription: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 3,
  },

  summary: {
    marginTop: 24,
    padding: 18,
    backgroundColor: colors.white,
    borderRadius: 16,
  },

  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },

  summaryLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },

  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },

  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 8,
  },

  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  totalLabel: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },

  totalValue: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.primary,
  },

  button: {
    height: 54,
    borderRadius: 16,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },

  buttonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 8,
  },
});