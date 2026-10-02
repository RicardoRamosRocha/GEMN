import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function ProfileScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Meu Perfil</Text>

      <View style={styles.avatar}>
        <Text style={styles.avatarText}>👤</Text>
      </View>

      <Text style={styles.name}>Usuário GEMN</Text>

      <Text style={styles.email}>
        usuario@gemn.com
      </Text>

      <View style={styles.infoContainer}>
        <Text style={styles.infoTitle}>Minha conta</Text>

        <Text style={styles.infoItem}>🛍️ Meus produtos</Text>
        <Text style={styles.infoItem}>❤️ Favoritos</Text>
        <Text style={styles.infoItem}>💰 Minha carteira</Text>
        <Text style={styles.infoItem}>⚙️ Configurações</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    padding: 24,
    paddingTop: 60,
  },

  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 30,
  },

  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#eeeeee',
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatarText: {
    fontSize: 40,
  },

  name: {
    fontSize: 22,
    fontWeight: '600',
    marginTop: 16,
  },

  email: {
    fontSize: 15,
    marginTop: 6,
  },

  infoContainer: {
    width: '100%',
    marginTop: 40,
  },

  infoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },

  infoItem: {
    fontSize: 16,
    paddingVertical: 12,
  },
});