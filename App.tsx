import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import HomeScreen from './src/screens/HomeScreen';
import ProductScreen from './src/screens/ProductScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import MarketplaceScreen from './src/screens/MarketplaceScreen';
import OrderConfirmationScreen from './src/screens/OrderConfirmationScreen';
import OrdersScreen from './src/screens/OrdersScreen';
import MyProductsScreen from './src/screens/MyProductsScreen';
import CreateProductScreen from './src/screens/CreateProductScreen';
import { ProductsProvider } from './src/context/ProductsContext';

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
      <Stack.Screen
        name="OrderConfirmation"
        component={OrderConfirmationScreen}
        options={{
          title: 'Pedido confirmado',
        }}
      />
    </Stack.Navigator>
  );
}

function MarketplaceStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="MarketplaceHome"
        component={MarketplaceScreen}
        options={{ headerShown: false }}
      />

      <Stack.Screen
        name="Product"
        component={ProductScreen}
        options={{ title: 'Produto' }}
      />
      <Stack.Screen
        name="OrderConfirmation"
        component={OrderConfirmationScreen}
        options={{
          title: 'Pedido confirmado',
        }}
      />
    </Stack.Navigator>
  );
}

function ProfileStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="ProfileHome"
        component={ProfileScreen}
        options={{ headerShown: false }}
      />

      <Stack.Screen
        name="Orders"
        component={OrdersScreen}
        options={{ title: 'Meus pedidos' }}
      />
      <Stack.Screen
  name="MyProducts"
  component={MyProductsScreen}
  options={{ title: 'Meus produtos' }}
/>
      <Stack.Screen
        name="CreateProduct"
        component={CreateProductScreen}
        options={{ title: 'Cadastro do anúncio' }}
      />
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <ProductsProvider>
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
          component={MarketplaceStack}
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
          component={ProfileStack}
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
    </ProductsProvider>
  );
}
