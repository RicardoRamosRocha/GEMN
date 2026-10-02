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

export default function MarketplaceScreen() {
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>Marketplace</Text>

      <Text style={styles.subtitle}>
        Encontre produtos e serviços da comunidade
      </Text>

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

      <Text style={styles.sectionTitle}>
        Categorias
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categories}
      >
        <Category icon="food" label="Comida" />
        <Category icon="tools" label="Serviços" />
        <Category icon="tshirt-crew-outline" label="Moda" />
        <Category
          icon="package-variant-closed"
          label="Outros"
        />
      </ScrollView>

      <View style={styles.productsHeader}>
        <Text style={styles.sectionTitle}>
          Produtos e serviços
        </Text>

        <TouchableOpacity>
          <Text style={styles.filter}>Filtrar</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.products}>
        <ProductCard
          icon="food-apple"
          name="Cesta de frutas"
          price="R$ 30,00"
        />

        <ProductCard
          icon="tshirt-crew"
          name="Camiseta"
          price="R$ 45,00"
        />

        <ProductCard
          icon="tools"
          name="Serviço de manutenção"
          price="R$ 80,00"
        />

        <ProductCard
          icon="cake-variant"
          name="Bolo caseiro"
          price="R$ 35,00"
        />
      </View>
    </ScrollView>
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

      <Text style={styles.categoryText}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function ProductCard({
  icon,
  name,
  price,
}: {
  icon: any;
  name: string;
  price: string;
}) {
  return (
    <TouchableOpacity style={styles.productCard}>
      <View style={styles.productImage}>
        <MaterialCommunityIcons
          name={icon}
          size={55}
          color="#555"
        />
      </View>

      <Text style={styles.productName}>
        {name}
      </Text>

      <Text style={styles.productPrice}>
        {price}
      </Text>
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
  },

  subtitle: {
    fontSize: 14,
    color: '#777',
    marginTop: 4,
    marginBottom: 20,
  },

  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 52,
    marginBottom: 28,
  },

  searchInput: {
    flex: 1,
    fontSize: 15,
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

  productsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  filter: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1B5E20',
    marginBottom: 14,
  },

  products: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },

  productCard: {
    backgroundColor: '#FFF',
    borderRadius: 18,
    padding: 12,
    width: '48%',
    marginBottom: 16,
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