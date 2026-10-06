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

export default function OrdersScreen({ navigation }: any) {
    const orders = [
        {
            id: '#GEMN-0001',
            product: 'Cesta de frutas',
            quantity: 2,
            total: 'R$ 100,00',
            status: 'Confirmado',
            statusIcon: 'check-circle' as const,
        },
        {
            id: '#GEMN-0002',
            product: 'Camisa GEMN',
            quantity: 1,
            total: 'R$ 80,00',
            status: 'Em processamento',
            statusIcon: 'clock-outline' as const,
        },
    ];

    return (
        <SafeAreaView style={styles.safeArea}>
            <ScrollView
                style={styles.container}
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
            >
                {/* Cabeçalho */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <MaterialCommunityIcons
              name="arrow-left"
              size={24}
              color={colors.text}
            />
          </TouchableOpacity>

          <View>
            <Text style={styles.title}>Meus pedidos</Text>
            <Text style={styles.subtitle}>
              Acompanhe suas compras
            </Text>
          </View>
        </View>

        {/* Lista */}
        {orders.map((order) => (
          <TouchableOpacity
            key={order.id}
            style={styles.orderCard}
            activeOpacity={0.8}
          >
            <View style={styles.orderHeader}>
              <View>
                <Text style={styles.orderLabel}>
                  Pedido
                </Text>

                <Text style={styles.orderId}>
                  {order.id}
                </Text>
              </View>

              <View style={styles.status}>
                <MaterialCommunityIcons
                  name={order.statusIcon}
                  size={18}
                  color={colors.primary}
                />

                <Text style={styles.statusText}>
                  {order.status}
                </Text>
              </View>
            </View>

            <View style={styles.divider} />

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
                  {order.product}
                </Text>

                <Text style={styles.quantity}>
                  Quantidade: {order.quantity}
                </Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>
                Total
              </Text>

              <Text style={styles.total}>
                {order.total}
              </Text>
            </View>
          </TouchableOpacity>
        ))}

        {/* Estado futuro */}
        <View style={styles.infoBox}>
          <MaterialCommunityIcons
            name="information-outline"
            size={22}
            color={colors.primary}
          />

          <Text style={styles.infoText}>
            Aqui você poderá acompanhar todos os seus
            pedidos realizados no GEMN.
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
    alignItems: 'center',
    marginBottom: 24,
  },

  backButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },

  title: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.text,
  },

  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 3,
  },

  orderCard: {
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
  },

  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  orderLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },

  orderId: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
    marginTop: 3,
  },

  status: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
  },

  statusText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    marginLeft: 5,
  },

  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 16,
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

  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  totalLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },

  total: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.primary,
  },

  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: 16,
    padding: 16,
    marginTop: 8,
  },

  infoText: {
    flex: 1,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
    marginLeft: 10,
  },
});