import React, { createContext, useContext, useState, type ReactNode } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export type ProductType = 'Produto' | 'Serviço';
export type ProductIcon = keyof typeof MaterialCommunityIcons.glyphMap;

export type GemnProduct = {
  id: string;
  type: ProductType;
  name: string;
  description: string;
  category: string;
  price: number;
  acceptsGemn: boolean;
  gemnValue?: number;
  active: boolean;
  icon: ProductIcon;
};

export type NewGemnProduct = Omit<GemnProduct, 'id' | 'active'>;

type ProductsContextValue = {
  products: GemnProduct[];
  addProduct: (product: NewGemnProduct) => void;
};

const initialProducts: GemnProduct[] = [
  {
    id: 'example-fruit-basket',
    type: 'Produto',
    name: 'Cesta de frutas',
    description: 'Cesta de frutas frescas.',
    category: 'Comida',
    price: 50,
    acceptsGemn: false,
    active: true,
    icon: 'basket-outline',
  },
  {
    id: 'example-electrical-maintenance',
    type: 'Serviço',
    name: 'Manutenção elétrica',
    description: 'Serviço de manutenção elétrica.',
    category: 'Serviços',
    price: 120,
    acceptsGemn: false,
    active: true,
    icon: 'lightning-bolt-outline',
  },
];

const ProductsContext = createContext<ProductsContextValue | undefined>(undefined);

export function ProductsProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState(initialProducts);

  function addProduct(product: NewGemnProduct) {
    const id = `gemn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setProducts((currentProducts) => [
      { ...product, id, active: true },
      ...currentProducts,
    ]);
  }

  return (
    <ProductsContext.Provider value={{ products, addProduct }}>
      {children}
    </ProductsContext.Provider>
  );
}

export function useProducts() {
  const context = useContext(ProductsContext);
  if (!context) {
    throw new Error('useProducts deve ser usado dentro de ProductsProvider.');
  }
  return context;
}
