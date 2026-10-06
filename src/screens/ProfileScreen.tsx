import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function ProfileScreen({ navigation }: any) {
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>Meu Perfil</Text>

      {/* Perfil */}
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <MaterialCommunityIcons
            name="account"
            size={48}
            color="#555"
          />
        </View>

        <View style={styles.profileInfo}>
          <Text style={styles.name}>
            Usuário GEMN
          </Text>

          <Text style={styles.email}>
            usuario@gemn.com
          </Text>

          <View style={styles.member}>
            <MaterialCommunityIcons
              name="check-circle"
              size={16}
              color="#1B5E20"
            />

            <Text style={styles.memberText}>
              Membro GEMN
            </Text>
          </View>
        </View>
      </View>

      {/* Carteira */}
      <View style={styles.wallet}>
        <View>
          <Text style={styles.walletLabel}>
            Minha carteira
          </Text>

          <Text style={styles.walletValue}>
            R$ 150,00
          </Text>
        </View>

        <View style={styles.coin}>
          <MaterialCommunityIcons
            name="cash-multiple"
            size={28}
            color="#555"
          />

          <Text style={styles.coinValue}>
            50 GEMN
          </Text>
        </View>
      </View>

      {/* Minha conta */}
      <Text style={styles.sectionTitle}>
        Minha conta
      </Text>

      <View style={styles.menu}>
        <MenuItem
          icon="clipboard-text-outline"
          title="Meus pedidos"
          subtitle="Acompanhe suas compras"
          onPress={() => navigation.navigate('Orders')}
        />

        <MenuItem
          icon="store-outline"
          title="Meus produtos"
          subtitle="Produtos publicados por você"
        />

        <MenuItem
          icon="heart-outline"
          title="Favoritos"
          subtitle="Produtos que você salvou"
        />

        <MenuItem
          icon="wallet-outline"
          title="Minha carteira"
          subtitle="Saldo e movimentações"
        />

        <MenuItem
          icon="cog-outline"
          title="Configurações"
          subtitle="Preferências da sua conta"
        />
      </View>
    </ScrollView>
  );
}

function MenuItem({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: any;
  title: string;
  subtitle: string;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.menuItem}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={styles.menuIcon}>
        <MaterialCommunityIcons
          name={icon}
          size={24}
          color="#555"
        />
      </View>

      <View style={styles.menuText}>
        <Text style={styles.menuTitle}>
          {title}
        </Text>

        <Text style={styles.menuSubtitle}>
          {subtitle}
        </Text>
      </View>

      <MaterialCommunityIcons
        name="chevron-right"
        size={24}
        color="#999"
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F7F7',
  },

  content: {
    padding: 20,
    paddingBottom: 40,
  },

  title: {
    fontSize: 30,
    fontWeight: '800',
    marginBottom: 24,
  },

  profileCard: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
  },

  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#EDEDED',
    alignItems: 'center',
    justifyContent: 'center',
  },

  profileInfo: {
    marginLeft: 16,
    flex: 1,
  },

  name: {
    fontSize: 20,
    fontWeight: '700',
  },

  email: {
    fontSize: 14,
    color: '#777',
    marginTop: 4,
  },

  member: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },

  memberText: {
    fontSize: 13,
    color: '#1B5E20',
    fontWeight: '600',
    marginLeft: 5,
  },

  wallet: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 20,
    marginTop: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  walletLabel: {
    fontSize: 13,
    color: '#777',
  },

  walletValue: {
    fontSize: 24,
    fontWeight: '800',
    marginTop: 5,
  },

  coin: {
    alignItems: 'center',
  },

  coinValue: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
  },

  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 30,
    marginBottom: 14,
  },

  menu: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    overflow: 'hidden',
  },

  menuItem: {
    minHeight: 76,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },

  menuIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F1F1F1',
    alignItems: 'center',
    justifyContent: 'center',
  },

  menuText: {
    flex: 1,
    marginLeft: 14,
  },

  menuTitle: {
    fontSize: 15,
    fontWeight: '700',
  },

  menuSubtitle: {
    fontSize: 12,
    color: '#888',
    marginTop: 3,
  },
});