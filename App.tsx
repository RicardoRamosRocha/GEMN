import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFonts as useOutfitFonts, Outfit_400Regular, Outfit_600SemiBold, Outfit_700Bold, Outfit_800ExtraBold } from '@expo-google-fonts/outfit';
import { useFonts as useGeistFonts, Geist_400Regular, Geist_500Medium, Geist_600SemiBold } from '@expo-google-fonts/geist';

import HomeScreen from './src/screens/HomeScreen';
import ProductScreen from './src/screens/ProductScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import MarketplaceScreen from './src/screens/MarketplaceScreen';
import OrderConfirmationScreen from './src/screens/OrderConfirmationScreen';
import OrdersScreen from './src/screens/OrdersScreen';
import MyProductsScreen from './src/screens/MyProductsScreen';
import CreateProductScreen from './src/screens/CreateProductScreen';
import SellerApplicationScreen from './src/screens/SellerApplicationScreen';
import AdminHomeScreen from './src/screens/AdminHomeScreen';
import AdminSellerApplicationsScreen from './src/screens/AdminSellerApplicationsScreen';
import AdminSellerApplicationDetailScreen from './src/screens/AdminSellerApplicationDetailScreen';
import { ProductsProvider } from './src/context/ProductsContext';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import { colors } from './src/theme/tokens';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const AuthStack = createNativeStackNavigator();

function AuthNavigator() {
  return (
    <NavigationContainer>
      <AuthStack.Navigator screenOptions={{ headerShown: false }}>
        <AuthStack.Screen name="Login" component={LoginScreen} />
        <AuthStack.Screen name="Register" component={RegisterScreen} />
      </AuthStack.Navigator>
    </NavigationContainer>
  );
}

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
      <Stack.Screen
        name="SellerApplication"
        component={SellerApplicationScreen}
        options={{ title: 'Quero vender no GEMN' }}
      />
      <Stack.Screen
        name="AdminHome"
        component={AdminHomeScreen}
        options={{ title: 'Administração' }}
      />
      <Stack.Screen
        name="AdminSellerApplications"
        component={AdminSellerApplicationsScreen}
        options={{ title: 'Solicitações de vendedores' }}
      />
      <Stack.Screen
        name="AdminSellerApplicationDetail"
        component={AdminSellerApplicationDetailScreen}
        options={{ title: 'Análise da solicitação' }}
      />
    </Stack.Navigator>
  );
}

function AuthenticatedApp() {
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

function AuthLoadingScreen() {
  return (
    <View style={styles.loadingScreen}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

function AppContent() {
  const { session, loading } = useAuth();

  if (loading) return <AuthLoadingScreen />;
  return session ? <AuthenticatedApp /> : <AuthNavigator />;
}

export default function App() {
  const [outfitLoaded] = useOutfitFonts({ Outfit_400Regular, Outfit_600SemiBold, Outfit_700Bold, Outfit_800ExtraBold });
  const [geistLoaded] = useGeistFonts({ Geist_400Regular, Geist_500Medium, Geist_600SemiBold });

  if (!outfitLoaded || !geistLoaded) return <AuthLoadingScreen />;

  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
