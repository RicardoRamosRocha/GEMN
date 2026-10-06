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

export default function OrderConfirmationScreen({
  route,
  navigation,
}: any) {
  const {
    name = 'Produto Exemplo',
    quantity = 1,
    paymentMethod = 'money',
    total = 'R$ 50,00',
  } = route?.params ?? {};

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Ícone de sucesso */}
        <View style={styles.successIcon}>
          <MaterialCommunityIcons
            name="check"
            size={55}
            color={colors.white}
          />
        </View>

        <Text style={styles.title}>
          Pedido confirmado!
        </Text>

        <Text style={styles.subtitle}>
          Sua compra foi registrada com sucesso.
        </Text>

        {/* Número do pedido */}
        <View style={styles.orderNumber}>
          <Text style={styles.orderNumberLabel}>
            Número do pedido
          </Text>

          <Text style={styles.orderNumberValue}>
            #GEMN-0001
          </Text>
        </View>

        {/* Resumo */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            Resumo do pedido
          </Text>

          <View style={styles.productRow}>
            <View style={styles.productIcon}>
              <MaterialCommunityIcons
                name="package-variant-closed"
                size={30}
                color={colors.primary}
              />
            </View>

            <View style={styles.productInfo}>
              <Text style={styles.productName}>
                {name}
              </Text>

              <Text style={styles.quantity}>
                Quantidade: {quantity}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.row}>
            <Text style={styles.label}>
              Forma de pagamento
            </Text>

            <Text style={styles.value}>
              {paymentMethod === 'money'
                ? 'Reais'
                : 'Moeda GEMN'}
            </Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>
              Total
            </Text>

            <Text style={styles.total}>
              {total}
            </Text>
          </View>
        </View>

        {/* Próximos passos */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            Próximos passos
          </Text>

          <View style={styles.step}>
            <MaterialCommunityIcons
              name="check-circle"
              size={24}
              color={colors.primary}
            />

            <Text style={styles.stepText}>
              Pedido recebido
            </Text>
          </View>

          <View style={styles.step}>
            <MaterialCommunityIcons
              name="clock-outline"
              size={24}
              color={colors.secondary}
            />

            <Text style={styles.stepText}>
              Aguardando processamento
            </Text>
          </View>

          <View style={styles.step}>
            <MaterialCommunityIcons
              name="package-variant"
              size={24}
              color={colors.textSecondary}
            />

            <Text style={styles.stepText}>
              Preparação do pedido
            </Text>
          </View>
        </View>

        {/* Botão voltar ao marketplace */}
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() =>
            navigation.navigate('MarketplaceHome')
          }
        >
          <MaterialCommunityIcons
            name="storefront-outline"
            size={22}
            color={colors.white}
          />

          <Text style={styles.primaryButtonText}>
            Continuar comprando
          </Text>
        </TouchableOpacity>

        {/* Botão voltar */}
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.secondaryButtonText}>
            Voltar
          </Text>
        </TouchableOpacity>
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
    padding: 24,
    paddingBottom: 40,
    alignItems: 'center',
  },

  successIcon: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },

  title: {
    fontSize: 27,
    fontWeight: '800',
    color: colors.text,
    marginTop: 20,
    textAlign: 'center',
  },

  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
  },

  orderNumber: {
    width: '100%',
    backgroundColor: colors.primaryLight,
    borderRadius: 16,
    padding: 16,
    marginTop: 24,
    alignItems: 'center',
  },

  orderNumberLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },

  orderNumberValue: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.primary,
    marginTop: 5,
  },

  card: {
    width: '100%',
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 18,
    marginTop: 18,
  },

  cardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 18,
  },

  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  productIcon: {
    width: 58,
    height: 58,
    borderRadius: 14,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },

  productInfo: {
    flex: 1,
    marginLeft: 14,
  },

  productName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },

  quantity: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 5,
  },

  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 18,
  },

  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },

  label: {
    fontSize: 14,
    color: colors.textSecondary,
  },

  value: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },

  total: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.primary,
  },

  step: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },

  stepText: {
    fontSize: 14,
    color: colors.text,
    marginLeft: 10,
  },

  primaryButton: {
    width: '100%',
    height: 54,
    borderRadius: 16,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },

  primaryButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 8,
  },

  secondaryButton: {
    paddingVertical: 16,
  },

  secondaryButtonText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '600',
  },
});