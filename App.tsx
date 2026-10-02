import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';


import HomeScreen from './src/screens/HomeScreen';
import ProductScreen from './src/screens/ProductScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import MarketplaceScreen from './src/screens/MarketplaceScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function HomeStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="Home"
        component={HomeScreen}
        options={{ headerShown: false }}
      />

      <Stack.Screen
        name="Product"
        component={ProductScreen}
        options={{ title: 'Produto' }}
      />
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#1B5E20',
          tabBarInactiveTintColor: '#777',
        }}
      >
        <Tab.Screen
          name="Início"
          component={HomeStack}
          options={{
            tabBarIcon: () => (
              <MaterialCommunityIcons
                name="home"
                size={24}
              />
            ),
          }}
        />

        <Tab.Screen
          name="Marketplace"
          component={MarketplaceScreen}
          options={{
            tabBarIcon: () => (
              <MaterialCommunityIcons
                name="storefront-outline"
                size={24}
              />
            ),
          }}
        />

        <Tab.Screen
          name="Perfil"
          component={ProfileScreen}
          options={{
            tabBarIcon: () => (
              <MaterialCommunityIcons
                name="account-circle-outline"
                size={24}
              />
            ),
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
