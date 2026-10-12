import {
  __sellerStorefrontTestables,
  SELLER_STOREFRONT_LISTING_SELECT,
  SELLER_STOREFRONT_SELLER_SELECT,
  validateSellerId,
} from './sellerStorefront';
import { SellerStorefrontServiceError } from '../types/sellerStorefront';

// Teste de contrato compilável: o projeto não possui executor Jest/Vitest.
// O tsc valida o shape e os invariantes de segurança do serviço.
const validSellerId = validateSellerId('00000000-0000-4000-8000-000000000031');
void validSellerId;

if (SELLER_STOREFRONT_SELLER_SELECT !== 'id,nome_negocio,descricao,status,aceita_gemn') {
  throw new Error('seller storefront must select only the approved seller fields');
}
if (!SELLER_STOREFRONT_LISTING_SELECT.includes('categories(id,nome,ativo)')) {
  throw new Error('seller storefront must include category activity for defensive filtering');
}
for (const forbidden of ['telefone', 'user_id', 'application_id', 'profiles', 'seller_applications', 'cashback_rules']) {
  if (SELLER_STOREFRONT_SELLER_SELECT.includes(forbidden) || SELLER_STOREFRONT_LISTING_SELECT.includes(forbidden)) {
    throw new Error(`forbidden storefront field/source selected: ${forbidden}`);
  }
}

const seller = __sellerStorefrontTestables.mapSeller({
  id: validSellerId,
  nome_negocio: 'Loja segura',
  descricao: 'Descrição pública',
  status: 'ativo',
  aceita_gemn: true,
});
void seller;

const listing = __sellerStorefrontTestables.mapListing({
  id: '00000000-0000-4000-8000-000000000032',
  seller_id: validSellerId,
  category_id: '00000000-0000-4000-8000-000000000033',
  tipo: 'produto',
  nome: 'Produto público',
  descricao: 'Descrição pública',
  preco_real: '10.50',
  aceita_gemn: true,
  preco_gemn: '5.00',
  imagem_principal: null,
  status: 'ativo',
  categories: { id: '00000000-0000-4000-8000-000000000033', nome: 'Alimentos', ativo: true },
}, validSellerId);
if (!listing || listing.acceptsGemn !== true || listing.gemnValue !== 5) throw new Error('public listing mapping failed');

const hiddenListing = __sellerStorefrontTestables.mapListing({
  id: '00000000-0000-4000-8000-000000000034',
  seller_id: validSellerId,
  category_id: '00000000-0000-4000-8000-000000000033',
  tipo: 'produto',
  nome: 'Rascunho privado',
  descricao: 'Não deve aparecer',
  preco_real: 10,
  aceita_gemn: false,
  preco_gemn: null,
  imagem_principal: null,
  status: 'rascunho',
  categories: { id: '00000000-0000-4000-8000-000000000033', nome: 'Alimentos', ativo: true },
}, validSellerId);
if (hiddenListing !== null) throw new Error('inactive listing must be hidden');

try { validateSellerId('not-a-uuid'); throw new Error('invalid seller id was accepted'); } catch (error) { if (!(error instanceof SellerStorefrontServiceError)) throw error; }
try { __sellerStorefrontTestables.mapSeller({ id: validSellerId, nome_negocio: 'Suspensa', descricao: 'Privada', status: 'suspenso', aceita_gemn: false }); throw new Error('suspended seller was accepted'); } catch (error) { if (!(error instanceof SellerStorefrontServiceError)) throw error; }
const networkError = __sellerStorefrontTestables.normalizeError(new Error('Failed to fetch'));
if (networkError.kind !== 'network' || !networkError.retryable) throw new Error('network errors must be retryable');
const authError = __sellerStorefrontTestables.normalizeError({ code: 'PGRST301', message: 'JWT expired' });
if (authError.kind !== 'auth') throw new Error('authentication errors must be classified as auth');
