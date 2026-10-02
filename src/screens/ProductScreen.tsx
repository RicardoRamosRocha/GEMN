import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function ProductScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Detalhes do Produto</Text>

      <Text style={styles.productName}>
        Produto exemplo
      </Text>

      <Text style={styles.price}>
        R$ 50,00
      </Text>

      <Text style={styles.description}>
        Aqui veremos futuramente as informações completas
        do produto, vendedor, localização e formas de troca
        ou pagamento.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },

  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 30,
  },

  productName: {
    fontSize: 22,
    fontWeight: '600',
  },

  price: {
    fontSize: 20,
    marginTop: 12,
  },

  description: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 24,
    lineHeight: 24,
  },
});