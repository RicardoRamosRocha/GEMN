import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';
import { getGemnPresentationEligibility } from '../services/gemnPresentation';

export type ProductType = 'Produto' | 'Serviço';
export type ProductIcon = keyof typeof MaterialCommunityIcons.glyphMap;
export type ListingStatus = 'rascunho' | 'ativo' | 'inativo';
export type ProductCategory = { id: string; name: string };
export type ListingImage = { uri: string; fileName?: string | null; fileSize?: number; mimeType?: string; file?: Blob; id?: string; storagePath?: string; sortOrder?: number; isPrimary?: boolean };
export type ListingImageRecord = { id: string; storagePath: string; url: string; sortOrder: number; isPrimary: boolean };
export type GemnProduct = { id: string; sellerId: string; type: ProductType; name: string; description: string; category: string; categoryId: string; price: number; acceptsGemn: boolean; sellerAcceptsGemn?: boolean; gemnValue?: number; active: boolean; status: ListingStatus; sellerName?: string; imageUrl?: string; images?: ListingImageRecord[]; icon: ProductIcon };
export type NewGemnProduct = { type: ProductType; name: string; description: string; categoryId: string; price: number; acceptsGemn: boolean; gemnValue?: number; status?: ListingStatus };

type ListingRelation<T> = T | T[] | null;
type ListingRow = { id: string; seller_id: string; category_id: string; tipo: 'produto' | 'servico'; nome: string; descricao: string; preco_real: number | string; aceita_gemn: boolean; preco_gemn: number | string | null; imagem_principal: string | null; status: ListingStatus; categories?: ListingRelation<{ id: string; nome: string; ativo: boolean }>; sellers?: ListingRelation<{ id: string; nome_negocio: string; status: string; aceita_gemn: boolean }>; listing_images?: Array<{ id: string; storage_path: string; sort_order: number; is_primary: boolean }> | null };
type SellerRow = { id: string; status: string };
type ProductMutationResult = { product?: GemnProduct; error?: string };
export type ProductDeletionAction = 'deleted' | 'archived';
type ProductDeletionResult = { action?: ProductDeletionAction; error?: string };
type ProductsContextValue = { products: GemnProduct[]; productsLoading: boolean; productsError: string | null; refreshProducts: () => Promise<void>; marketplaceProducts: GemnProduct[]; marketplaceLoading: boolean; marketplaceError: string | null; refreshMarketplaceProducts: () => Promise<void>; categories: ProductCategory[]; categoriesLoading: boolean; categoriesError: string | null; refreshCategories: () => Promise<void>; addProduct: (product: NewGemnProduct, images?: ListingImage[]) => Promise<ProductMutationResult>; updateProduct: (id: string, product: NewGemnProduct, images?: ListingImage[]) => Promise<ProductMutationResult>; updateProductStatus: (id: string, status: ListingStatus) => Promise<ProductMutationResult>; deleteProduct: (id: string) => Promise<ProductDeletionResult> };
const ProductsContext = createContext<ProductsContextValue | undefined>(undefined);
const listingSelect = 'id,seller_id,category_id,tipo,nome,descricao,preco_real,aceita_gemn,preco_gemn,imagem_principal,status,categories(id,nome,ativo),sellers(id,nome_negocio,status,aceita_gemn),listing_images(id,storage_path,sort_order,is_primary)';
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function imageMimeType(image: ListingImage) {
  const mimeType = (image.mimeType ?? image.file?.type)?.toLowerCase().split(';')[0];
  if (mimeType && ALLOWED_IMAGE_TYPES.has(mimeType)) return mimeType;
  const extension = image.fileName?.toLowerCase().split('.').pop();
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  return null;
}

function imageExtension(mimeType: string) {
  return mimeType === 'image/jpeg' ? 'jpg' : mimeType.slice('image/'.length);
}

function listingImageUrl(storagePath: string) {
  const value = storagePath.trim();
  if (/^https?:\/\//i.test(value)) return value;
  const normalizedPath = value.replace(/^\/+/, '').replace(/^listing-images\//i, '');
  return supabase.storage.from('listing-images').getPublicUrl(normalizedPath).data.publicUrl;
}

async function uploadListingImage(sellerId: string, listingId: string, image: ListingImage) {
  const mimeType = imageMimeType(image);
  if (!mimeType) throw new Error('A imagem precisa estar no formato JPEG, PNG ou WebP.');
  if (image.fileSize !== undefined && image.fileSize > MAX_IMAGE_SIZE) throw new Error('A imagem deve ter no máximo 5 MB.');

  const body = image.file ?? await (await fetch(image.uri)).arrayBuffer();
  const bodySize = body instanceof ArrayBuffer ? body.byteLength : body.size;
  if (bodySize > MAX_IMAGE_SIZE) {
    throw new Error('A imagem deve ter no máximo 5 MB.');
  }

  const fileName = `image-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}.${imageExtension(mimeType)}`;
  const path = `${sellerId}/${listingId}/${fileName}`;
  const { error } = await supabase.storage.from('listing-images').upload(path, body, { contentType: mimeType, upsert: false });
  if (error) throw error;
  return path;
}

const listingImageQueues = new Map<string, Promise<unknown>>();

async function replaceListingImagesUnsafe(sellerId: string, listingId: string, images: ListingImage[], previousPaths: string[]) {
  const uploadedPaths: string[] = [];
  try {
    const { data: currentImages } = await supabase.from('listing_images').select('storage_path').eq('listing_id', listingId);
    const pathsBeforeReplace = Array.from(new Set([
      ...previousPaths,
      ...((currentImages ?? []) as { storage_path: string }[]).map((image) => image.storage_path),
    ]));
    const payload: { storage_path: string; sort_order: number; is_primary: boolean }[] = [];
    for (let index = 0; index < images.length; index += 1) {
      const image = images[index];
      const path = image.storagePath ?? await uploadListingImage(sellerId, listingId, image);
      if (!image.storagePath) uploadedPaths.push(path);
      payload.push({ storage_path: path, sort_order: index, is_primary: image.isPrimary ?? index === 0 });
    }
    const { error } = await supabase.rpc('replace_listing_images', { p_listing_id: listingId, p_images: payload });
    if (error) throw error;

    const keepPaths = new Set(payload.map((image) => image.storage_path));
    const removedPaths = pathsBeforeReplace.filter((path) => !keepPaths.has(path));
    if (removedPaths.length > 0) await supabase.storage.from('listing-images').remove(removedPaths);
    return payload;
  } catch (error) {
    if (uploadedPaths.length > 0) await supabase.storage.from('listing-images').remove(uploadedPaths);
    throw error;
  }
}

async function replaceListingImages(sellerId: string, listingId: string, images: ListingImage[], previousPaths: string[]) {
  const previousOperation = listingImageQueues.get(listingId) ?? Promise.resolve();
  const operation = previousOperation.catch(() => undefined).then(() => replaceListingImagesUnsafe(sellerId, listingId, images, previousPaths));
  listingImageQueues.set(listingId, operation);
  try {
    return await operation;
  } finally {
    if (listingImageQueues.get(listingId) === operation) listingImageQueues.delete(listingId);
  }
}

function friendlyError(error: unknown) {
  const errorRecord = typeof error === 'object' && error !== null ? error as { message?: string; code?: string } : undefined;
  const code = errorRecord?.code;
  const message = (error instanceof Error ? error.message : errorRecord?.message ?? String(error)).toLowerCase();
  if (message.includes('imagem') || message.includes('5 mb') || message.includes('mime')) return errorRecord?.message ?? (error instanceof Error ? error.message : String(error));
  if (code === 'PGRST116' || message.includes('0 rows') || message.includes('no rows')) return 'O anúncio não foi encontrado ou você não tem permissão para alterá-lo.';
  if (message.includes('network') || message.includes('fetch')) return 'Não foi possível conectar ao GEMN. Verifique sua internet e tente novamente.';
  if (message.includes('seller') || message.includes('permission') || message.includes('row-level security') || message.includes('nao autorizado') || message.includes('não autorizado')) return 'Sua conta não tem autorização para realizar esta ação.';
  if (message.includes('anuncio nao encontrado') || message.includes('anúncio não encontrado')) return 'O anúncio já foi removido ou não está mais disponível.';
  if (message.includes('category') || message.includes('categoria')) return 'A categoria selecionada não está mais disponível.';
  return 'Não foi possível carregar ou salvar os anúncios. Tente novamente.';
}

function mapListing(row: ListingRow): GemnProduct {
  const type: ProductType = row.tipo === 'produto' ? 'Produto' : 'Serviço';
  const category = Array.isArray(row.categories) ? row.categories[0] : row.categories;
  const seller = Array.isArray(row.sellers) ? row.sellers[0] : row.sellers;
  const relationImages = (row.listing_images ?? []).slice().sort((a, b) => a.sort_order - b.sort_order).map((image) => ({ id: image.id, storagePath: image.storage_path, url: listingImageUrl(image.storage_path), sortOrder: image.sort_order, isPrimary: image.is_primary }));
  const images = relationImages.length > 0 ? relationImages : row.imagem_principal ? [{ id: `legacy-${row.id}`, storagePath: row.imagem_principal, url: listingImageUrl(row.imagem_principal), sortOrder: 0, isPrimary: true }] : [];
  const imageUrl = images.find((image) => image.isPrimary)?.url ?? images[0]?.url;
  const gemnEligibility = getGemnPresentationEligibility({ sellerAcceptsGemn: seller?.aceita_gemn, listingAcceptsGemn: row.aceita_gemn, gemnValue: row.preco_gemn });
  return { id: row.id, sellerId: row.seller_id, type, name: row.nome, description: row.descricao, category: category?.nome ?? 'Categoria', categoryId: row.category_id, price: Number(row.preco_real), acceptsGemn: row.aceita_gemn, ...(seller?.aceita_gemn !== undefined ? { sellerAcceptsGemn: seller.aceita_gemn } : {}), ...(gemnEligibility.enabled ? { gemnValue: gemnEligibility.value } : {}), active: row.status === 'ativo', status: row.status, sellerName: seller?.nome_negocio, imageUrl, images, icon: type === 'Produto' ? 'package-variant-closed' : 'tools' };
}

export function ProductsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [products, setProducts] = useState<GemnProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [marketplaceProducts, setMarketplaceProducts] = useState<GemnProduct[]>([]);
  const [marketplaceLoading, setMarketplaceLoading] = useState(true);
  const [marketplaceError, setMarketplaceError] = useState<string | null>(null);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);

  const getCurrentSeller = useCallback(async (): Promise<{ seller?: SellerRow; error?: string }> => {
    if (!user) return { error: 'É necessário estar autenticado para acessar seus anúncios.' };
    const { data: seller, error } = await supabase.from('sellers').select('id,status').eq('user_id', user.id).maybeSingle();
    if (error) return { error: friendlyError(error) };
    if (!seller) return { error: 'Seu perfil ainda não foi aprovado como vendedor.' };
    return { seller: seller as SellerRow };
  }, [user]);

  const refreshProducts = useCallback(async () => {
    if (!user) { setProducts([]); setProductsLoading(false); return; }
    setProductsLoading(true); setProductsError(null);
    const { seller, error: sellerError } = await getCurrentSeller();
    if (sellerError || !seller) {
      setProducts([]);
      setProductsError(sellerError ?? 'Não foi possível identificar o vendedor autenticado.');
      setProductsLoading(false);
      return;
    }
    // This is the owner panel: do not rely on the marketplace SELECT policy,
    // which also exposes active listings belonging to other sellers.
    const { data, error } = await supabase.from('listings').select(listingSelect).eq('seller_id', seller.id).order('criado_em', { ascending: false });
    if (error) setProductsError(friendlyError(error)); else setProducts((data as ListingRow[]).map(mapListing));
    setProductsLoading(false);
  }, [getCurrentSeller, user]);

  const refreshMarketplaceProducts = useCallback(async () => {
    if (!user) { setMarketplaceProducts([]); setMarketplaceLoading(false); return; }
    setMarketplaceLoading(true); setMarketplaceError(null);
    // RLS is the source of truth for which listings the marketplace may show.
    const { data, error } = await supabase.from('listings').select(listingSelect).order('criado_em', { ascending: false });
    if (error) setMarketplaceError(friendlyError(error)); else setMarketplaceProducts((data as ListingRow[]).filter((row) => row.status === 'ativo').map(mapListing));
    setMarketplaceLoading(false);
  }, [user]);

  const refreshCategories = useCallback(async () => {
    if (!user) { setCategories([]); setCategoriesLoading(false); return; }
    setCategoriesLoading(true); setCategoriesError(null);
    const { data, error } = await supabase.from('categories').select('id,nome').eq('ativo', true).order('nome');
    if (error) setCategoriesError(friendlyError(error)); else setCategories((data as { id: string; nome: string }[]).map((row) => ({ id: row.id, name: row.nome })));
    setCategoriesLoading(false);
  }, [user]);

  useEffect(() => { void refreshProducts(); void refreshMarketplaceProducts(); void refreshCategories(); }, [refreshProducts, refreshMarketplaceProducts, refreshCategories]);

  const addProduct = useCallback(async (product: NewGemnProduct, images?: ListingImage[]) => {
    if (!user) return { error: 'É necessário estar autenticado para publicar um anúncio.' };
    // seller_id comes from auth.uid() -> sellers.user_id, never from UI input.
    const { seller, error: sellerError } = await getCurrentSeller();
    if (sellerError || !seller) return { error: sellerError ?? 'Seu perfil ainda não foi aprovado como vendedor.' };
    const { data, error } = await supabase.from('listings').insert({ seller_id: seller.id, category_id: product.categoryId, tipo: product.type === 'Produto' ? 'produto' : 'servico', nome: product.name, descricao: product.description, preco_real: product.price, aceita_gemn: product.acceptsGemn, preco_gemn: product.acceptsGemn ? product.gemnValue : null, status: product.status ?? 'ativo' }).select(listingSelect).single();
    if (error) return { error: friendlyError(error) };
    let mapped = mapListing(data as ListingRow);
    if (images) {
      try {
        await replaceListingImages(seller.id, mapped.id, images, []);
      } catch (error) {
        return { product: mapped, error: friendlyError(error) };
      }
      const { data: updatedData } = await supabase.from('listings').select(listingSelect).eq('id', mapped.id).single();
      if (updatedData) mapped = mapListing(updatedData as ListingRow);
    }
    setProducts((current) => [mapped, ...current.filter((item) => item.id !== mapped.id)]);
    if (mapped.status === 'ativo') setMarketplaceProducts((current) => [mapped, ...current.filter((item) => item.id !== mapped.id)]);
    return { product: mapped };
  }, [getCurrentSeller, user]);

  const updateProduct = useCallback(async (id: string, product: NewGemnProduct, images?: ListingImage[]) => {
    if (!user) return { error: 'É necessário estar autenticado para editar um anúncio.' };
    // seller_id is intentionally absent: ownership is enforced by RLS and the database trigger.
    const { data, error } = await supabase.from('listings').update({ category_id: product.categoryId, tipo: product.type === 'Produto' ? 'produto' : 'servico', nome: product.name, descricao: product.description, preco_real: product.price, aceita_gemn: product.acceptsGemn, preco_gemn: product.acceptsGemn ? product.gemnValue : null, status: product.status ?? 'rascunho' }).eq('id', id).select(listingSelect).single();
    if (error) return { error: friendlyError(error) };
    let mapped = mapListing(data as ListingRow);
    if (images) {
      try {
        await replaceListingImages(mapped.sellerId, mapped.id, images, (mapped.images ?? []).map((image) => image.storagePath));
      } catch (error) {
        return { product: mapped, error: friendlyError(error) };
      }
      const { data: updatedData } = await supabase.from('listings').select(listingSelect).eq('id', mapped.id).single();
      if (updatedData) mapped = mapListing(updatedData as ListingRow);
    }
    setProducts((current) => current.map((item) => item.id === mapped.id ? mapped : item));
    setMarketplaceProducts((current) => mapped.status === 'ativo' ? [mapped, ...current.filter((item) => item.id !== mapped.id)] : current.filter((item) => item.id !== mapped.id));
    return { product: mapped };
  }, [user]);

  const updateProductStatus = useCallback(async (id: string, status: ListingStatus) => {
    if (!user) return { error: 'É necessário estar autenticado para alterar um anúncio.' };
    const { data, error } = await supabase.from('listings').update({ status }).eq('id', id).select(listingSelect).single();
    if (error) return { error: friendlyError(error) };
    const mapped = mapListing(data as ListingRow);
    setProducts((current) => current.map((item) => item.id === mapped.id ? mapped : item));
    setMarketplaceProducts((current) => mapped.status === 'ativo' ? [mapped, ...current.filter((item) => item.id !== mapped.id)] : current.filter((item) => item.id !== mapped.id));
    return { product: mapped };
  }, [user]);

  const deleteProduct = useCallback(async (id: string): Promise<ProductDeletionResult> => {
    if (!user) return { error: 'E necessario estar autenticado para remover um anuncio.' };
    const { data, error } = await supabase.rpc('delete_or_archive_listing', { p_listing_id: id });
    if (error) return { error: friendlyError(error) };
    const result = Array.isArray(data) ? data[0] as { action?: ProductDeletionAction } | undefined : data as { action?: ProductDeletionAction } | null;
    if (result?.action !== 'deleted' && result?.action !== 'archived') return { error: 'A operacao de remocao retornou uma resposta invalida.' };
    setProducts((current) => current.filter((item) => item.id !== id));
    setMarketplaceProducts((current) => current.filter((item) => item.id !== id));
    return { action: result.action };
  }, [user]);

  const value = useMemo(() => ({ products, productsLoading, productsError, refreshProducts, marketplaceProducts, marketplaceLoading, marketplaceError, refreshMarketplaceProducts, categories, categoriesLoading, categoriesError, refreshCategories, addProduct, updateProduct, updateProductStatus, deleteProduct }), [products, productsLoading, productsError, refreshProducts, marketplaceProducts, marketplaceLoading, marketplaceError, refreshMarketplaceProducts, categories, categoriesLoading, categoriesError, refreshCategories, addProduct, updateProduct, updateProductStatus, deleteProduct]);
  return <ProductsContext.Provider value={value}>{children}</ProductsContext.Provider>;
}

export function useProducts() {
  const context = useContext(ProductsContext);
  if (!context) throw new Error('useProducts deve ser usado dentro de ProductsProvider.');
  return context;
}
