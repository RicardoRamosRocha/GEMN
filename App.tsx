import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFonts as useOutfitFonts, Outfit_400Regular, Outfit_600SemiBold, Outfit_700Bold, Outfit_800ExtraBold } from '@expo-google-fonts/outfit';
import { useFonts as useGeistFonts, Geist_400Regular, Geist_500Medium, Geist_600SemiBold } from '@expo-google-fonts/geist';

import HomeScreen from './src/screens/HomeScreen';
import ProductScreen from './src/screens/ProductScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import MarketplaceScreen from './src/screens/MarketplaceScreen';
import OrderConfirmationScreen from './src/screens/OrderConfirmationScreen';
import OrdersScreen from './src/screens/OrdersScreen';
import WalletScreen from './src/screens/WalletScreen';
import MyProductsScreen from './src/screens/MyProductsScreen';
import SellerOrdersScreen from './src/screens/SellerOrdersScreen';
import SellerDashboardScreen from './src/screens/SellerDashboardScreen';
import SellerStoreSettingsScreen from './src/screens/SellerStoreSettingsScreen';
import SellerStoreBrandingScreen from './src/screens/SellerStoreBrandingScreen';
import SellerStorefrontScreen from './src/screens/SellerStorefrontScreen';
import CreateProductScreen from './src/screens/CreateProductScreen';
import SellerApplicationScreen from './src/screens/SellerApplicationScreen';
import AdminHomeScreen from './src/screens/AdminHomeScreen';
import AdminPendingOrdersScreen from './src/screens/AdminPendingOrdersScreen';
import AdminSellerApplicationsScreen from './src/screens/AdminSellerApplicationsScreen';
import AdminSellerApplicationDetailScreen from './src/screens/AdminSellerApplicationDetailScreen';
import AdminCancellationRequestsScreen from './src/screens/AdminCancellationRequestsScreen';
import AdminCancellationRequestDetailScreen from './src/screens/AdminCancellationRequestDetailScreen';
import { ProductsProvider } from './src/context/ProductsContext';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import { colors, layout, radius, shadows, spacing, typography } from './src/theme/tokens';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const AuthStack = createNativeStackNavigator();

const stackScreenOptions = {
  headerStyle: { backgroundColor: colors.surface },
  headerTintColor: colors.brandDark,
  headerTitleStyle: {
    fontFamily: typography.heading4.fontFamily,
    fontSize: typography.heading4.fontSize,
    fontWeight: typography.heading4.fontWeight,
    color: colors.text,
  },
  headerTitleAlign: 'left' as const,
  headerShadowVisible: false,
  headerBackTitle: 'Voltar',
  contentStyle: { backgroundColor: colors.background },
};

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
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen
        name="Home"
        component={HomeScreen}
        options={{ headerShown: false }}
      />

      <Stack.Screen
        name="Product"
        component={ProductScreen}
        options={{ title: 'Produto', headerShown: false }}
      />
      <Stack.Screen
        name="OrderConfirmation"
        component={OrderConfirmationScreen}
        options={{
          title: 'Pedido registrado',
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="SellerStorefront"
        component={SellerStorefrontScreen}
        options={{ title: 'Vitrine do vendedor' }}
      />
    </Stack.Navigator>
  );
}

function MarketplaceStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen
        name="MarketplaceHome"
        component={MarketplaceScreen}
        options={{ headerShown: false }}
      />

      <Stack.Screen
        name="Product"
        component={ProductScreen}
        options={{ title: 'Produto', headerShown: false }}
      />
      <Stack.Screen
        name="OrderConfirmation"
        component={OrderConfirmationScreen}
        options={{
          title: 'Pedido registrado',
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="SellerStorefront"
        component={SellerStorefrontScreen}
        options={{ title: 'Vitrine do vendedor' }}
      />
    </Stack.Navigator>
  );
}

function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen
        name="ProfileHome"
        component={ProfileScreen}
        options={{ headerShown: false }}
      />

      <Stack.Screen
        name="Orders"
        component={OrdersScreen}
        options={{ title: 'Meus pedidos', headerShown: false }}
      />
      <Stack.Screen
        name="Wallet"
        component={WalletScreen}
        options={{ title: 'Minha carteira', headerShown: false }}
      />
      <Stack.Screen
        name="SellerOrders"
        component={SellerOrdersScreen}
        options={{ title: 'Pedidos recebidos', headerShown: false }}
      />
      <Stack.Screen
        name="SellerDashboard"
        component={SellerDashboardScreen}
        options={{ title: 'Minha Loja', headerShown: false }}
      />
      <Stack.Screen
        name="SellerStoreSettings"
        component={SellerStoreSettingsScreen}
        options={{ title: 'Configurações da Loja', headerShown: false }}
      />
      <Stack.Screen
        name="SellerStoreBranding"
        component={SellerStoreBrandingScreen}
        options={{ title: 'Personalizar Loja', headerShown: false }}
      />
      <Stack.Screen
        name="MyProducts"
        component={MyProductsScreen}
        options={{ title: 'Meus produtos', headerShown: false }}
      />
      <Stack.Screen
        name="CreateProduct"
        component={CreateProductScreen}
        options={{ title: 'Cadastro do anúncio', headerShown: false }}
      />
      <Stack.Screen
        name="SellerApplication"
        component={SellerApplicationScreen}
        options={{ title: 'Quero vender no GEMN', headerShown: false }}
      />
      <Stack.Screen
        name="AdminHome"
        component={AdminHomeScreen}
        options={{ title: 'Administração', headerShown: false }}
      />
      <Stack.Screen
        name="AdminPendingOrders"
        component={AdminPendingOrdersScreen}
        options={{ title: 'Pedidos pendentes', headerShown: false }}
      />
      <Stack.Screen
        name="AdminSellerApplications"
        component={AdminSellerApplicationsScreen}
        options={{ title: 'Solicitações de vendedores', headerShown: false }}
      />
      <Stack.Screen
        name="AdminSellerApplicationDetail"
        component={AdminSellerApplicationDetailScreen}
        options={{ title: 'Análise da solicitação', headerShown: false }}
      />
      <Stack.Screen
        name="AdminCancellationRequests"
        component={AdminCancellationRequestsScreen}
        options={{ title: 'Cancelamentos', headerShown: false }}
      />
      <Stack.Screen
        name="AdminCancellationRequestDetail"
        component={AdminCancellationRequestDetailScreen}
        options={{ title: 'Detalhes do cancelamento', headerShown: false }}
      />
    </Stack.Navigator>
  );
}

function AuthenticatedApp() {
  const insets = useSafeAreaInsets();

  return (
    <ProductsProvider>
      <NavigationContainer>
        <Tab.Navigator
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: colors.brand,
            tabBarInactiveTintColor: colors.textMuted,
            tabBarLabelStyle: { ...typography.label, fontSize: 12 },
            tabBarStyle: {
              // Keep the tab content above Android's navigation bar and iOS's home indicator.
              height: 64 + insets.bottom,
              paddingTop: spacing.xs,
              paddingBottom: insets.bottom + spacing.xs,
              backgroundColor: colors.surface,
              borderTopWidth: 1,
              borderTopColor: colors.border,
              ...shadows.subtle,
            },
            tabBarItemStyle: { marginHorizontal: spacing.xs, borderRadius: radius.lg },
            // Reset nested stacks when their tab loses focus.
            popToTopOnBlur: true,
          }}
        >
        <Tab.Screen
          name="Início"
          component={HomeStack}
          listeners={({ navigation }) => ({
            tabPress: () => navigation.navigate('Início', { screen: 'Home' }),
          })}
          options={{
            tabBarIcon: ({ color, focused }) => (
              <View style={[styles.tabIcon, focused && styles.tabIconActive]}>
                <MaterialCommunityIcons name="home-variant" size={22} color={color} />
              </View>
            ),
          }}
        />

        <Tab.Screen
          name="Marketplace"
          component={MarketplaceStack}
          listeners={({ navigation }) => ({
            tabPress: () => navigation.navigate('Marketplace', { screen: 'MarketplaceHome' }),
          })}
          options={{
            tabBarIcon: ({ color, focused }) => (
              <View style={[styles.tabIcon, focused && styles.tabIconActive]}>
                <MaterialCommunityIcons name="storefront-outline" size={22} color={color} />
              </View>
            ),
          }}
        />

        <Tab.Screen
          name="Perfil"
          component={ProfileStack}
          listeners={({ navigation }) => ({
            tabPress: () => navigation.navigate('Perfil', { screen: 'ProfileHome' }),
          })}
          options={{
            tabBarIcon: ({ color, focused }) => (
              <View style={[styles.tabIcon, focused && styles.tabIconActive]}>
                <MaterialCommunityIcons name="account-circle-outline" size={22} color={color} />
              </View>
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
    <SafeAreaProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  tabIcon: {
    width: 36,
    height: 30,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconActive: {
    backgroundColor: colors.brandLight,
  },
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
