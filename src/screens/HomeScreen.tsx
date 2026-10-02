import { SafeAreaView } from 'react-native-safe-area-context';
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function HomeScreen({ navigation }: any) {
  return (
  <SafeAreaView style={styles.container}>
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Cabeçalho */}
      <View style={styles.header}>
        <View>
          <Text style={styles.logo}>GEMN</Text>
          <Text style={styles.subtitle}>Comunidade Mundo Novo</Text>
        </View>

        <TouchableOpacity
          style={styles.profileButton}
          onPress={() => navigation.navigate('Profile')}
        >
          <MaterialCommunityIcons
            name="account-circle-outline"
            size={34}
            color="#333"
          />
        </TouchableOpacity>
      </View>

      {/* Busca */}
      <View style={styles.searchContainer}>
        <MaterialCommunityIcons
          name="magnify"
          size={24}
          color="#777"
        />

        <TextInput
          placeholder="Buscar produtos ou serviços..."
          placeholderTextColor="#888"
          style={styles.searchInput}
        />
      </View>

      {/* Carteira */}
      <View style={styles.wallet}>
        <View>
          <Text style={styles.walletLabel}>Sua carteira</Text>
          <Text style={styles.walletValue}>R$ 150,00</Text>
        </View>

        <View style={styles.coins}>
          <MaterialCommunityIcons
            name="cash-multiple"
            size={24}
            color="#D89B00"
          />

          <View>
            <Text style={styles.coinValue}>50</Text>
            <Text style={styles.coinLabel}>Moedas sociais</Text>
          </View>
        </View>
      </View>

      {/* Categorias */}
      <Text style={styles.sectionTitle}>Categorias</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categories}
      >
        <Category
          icon="food"
          label="Comida"
        />

        <Category
          icon="tools"
          label="Serviços"
        />

        <Category
          icon="tshirt-crew-outline"
          label="Moda"
        />

        <Category
          icon="package-variant-closed"
          label="Outros"
        />
      </ScrollView>

      {/* Produtos */}
      <Text style={styles.sectionTitle}>
        Produtos em destaque
      </Text>

      <View style={styles.products}>
        <ProductCard
          icon="food-apple"
          name="Cesta de frutas"
          price="R$ 30,00"
          onPress={() => navigation.navigate('Product')}
        />

        <ProductCard
          icon="tshirt-crew"
          name="Camiseta"
          price="R$ 45,00"
          onPress={() => navigation.navigate('Product')}
        />
      </View>
    </ScrollView>
    </SafeAreaView>
  );
}

function Category({
  icon,
  label,
}: {
  icon: any;
  label: string;
}) {
  return (
    <TouchableOpacity style={styles.category}>
      <MaterialCommunityIcons
        name={icon}
        size={28}
        color="#333"
      />

      <Text style={styles.categoryText}>{label}</Text>
    </TouchableOpacity>
  );
}

function ProductCard({
  icon,
  name,
  price,
  onPress,
}: {
  icon: any;
  name: string;
  price: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.productCard}
      onPress={onPress}
    >
      <View style={styles.productImage}>
        <MaterialCommunityIcons
          name={icon}
          size={60}
          color="#555"
        />
      </View>

      <Text style={styles.productName}>{name}</Text>

      <Text style={styles.productPrice}>{price}</Text>
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

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },

  logo: {
    fontSize: 30,
    fontWeight: '800',
    color: '#1B5E20',
  },

  subtitle: {
    fontSize: 14,
    color: '#777',
    marginTop: 2,
  },

  profileButton: {
    padding: 4,
  },

  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 52,
    marginBottom: 20,
  },

  searchInput: {
    flex: 1,
    fontSize: 15,
    marginLeft: 8,
  },

  wallet: {
    backgroundColor: '#E8F5E9',
    borderRadius: 18,
    padding: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 28,
  },

  walletLabel: {
    fontSize: 13,
    color: '#777',
  },

  walletValue: {
    fontSize: 24,
    fontWeight: '800',
    marginTop: 4,
    color: '#1B5E20',
  },

  coins: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  coinValue: {
    fontSize: 18,
    fontWeight: '700',
    marginLeft: 8,
  },

  coinLabel: {
    fontSize: 11,
    color: '#777',
    marginLeft: 8,
  },

  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 14,
  },

  categories: {
    marginBottom: 28,
  },

  category: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 14,
    width: 100,
    alignItems: 'center',
    marginRight: 12,
  },

  categoryText: {
    fontSize: 13,
    marginTop: 8,
    fontWeight: '600',
  },

  products: {
    flexDirection: 'row',
    gap: 14,
  },

  productCard: {
    backgroundColor: '#FFF',
    borderRadius: 18,
    padding: 12,
    width: '48%',
  },

  productImage: {
    height: 130,
    borderRadius: 14,
    backgroundColor: '#EEEEEE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },

  productName: {
    fontSize: 15,
    fontWeight: '600',
  },

  productPrice: {
    fontSize: 17,
    fontWeight: '800',
    marginTop: 6,
  },
});