import {
  __sellerDirectoryTestables,
  SELLER_DIRECTORY_DEFAULT_PAGE_SIZE,
  SELLER_DIRECTORY_MAX_PAGE_SIZE,
  SELLER_DIRECTORY_SELECT,
} from './sellerDirectory';
import { SELLER_DIRECTORY_BRANDING_SELECT } from './sellerBranding';
import { SellerDirectoryServiceError } from '../types/sellerDirectory';

// Contrato compilável: o projeto não possui runner Jest/Vitest configurado.
if (SELLER_DIRECTORY_SELECT !== 'id,nome_negocio,descricao,status') throw new Error('seller directory select contract changed');
if (SELLER_DIRECTORY_BRANDING_SELECT !== 'seller_id,logo_path') throw new Error('seller directory branding select contract changed');
if (SELLER_DIRECTORY_DEFAULT_PAGE_SIZE !== 12) throw new Error('seller directory default page size changed');
if (SELLER_DIRECTORY_MAX_PAGE_SIZE < SELLER_DIRECTORY_DEFAULT_PAGE_SIZE) throw new Error('seller directory page size bounds changed');

const sellerId = '00000000-0000-4000-8000-000000000041';
const mapped = __sellerDirectoryTestables.mapSellerDirectoryRow({
  id: sellerId,
  nome_negocio: 'Orizon Tecnologia',
  descricao: 'Serviços de tecnologia',
  status: 'ativo',
});
if (!mapped || mapped.id !== sellerId || mapped.storeName !== 'Orizon Tecnologia' || mapped.logoUrl !== null) throw new Error('active seller mapping failed');

if (__sellerDirectoryTestables.mapSellerDirectoryRow({ id: sellerId, nome_negocio: 'Suspensa', descricao: 'Oculta', status: 'suspenso' }) !== null) {
  throw new Error('suspended seller must not be mapped to public directory');
}

const filter = __sellerDirectoryTestables.buildSearchFilter('Orizon, 100%_ (teste)*');
if (!filter || !filter.startsWith('nome_negocio.ilike.*') || !filter.includes('descricao.ilike.*')) throw new Error('seller directory search filter missing fields');
if (filter.includes('100%_') || filter.includes('(teste)') || filter.includes(', 100')) throw new Error('search filter did not escape reserved characters');
if (__sellerDirectoryTestables.buildSearchFilter('   ') !== null) throw new Error('blank search must not add a filter');

const normalized = __sellerDirectoryTestables.normalizeParams({ page: 2 });
if (normalized.page !== 2 || normalized.pageSize !== 12) throw new Error('seller directory pagination defaults changed');
try { __sellerDirectoryTestables.normalizeParams({ page: 0 }); throw new Error('invalid page accepted'); } catch (error) { if (!(error instanceof SellerDirectoryServiceError)) throw error; }
try { __sellerDirectoryTestables.normalizeParams({ pageSize: SELLER_DIRECTORY_MAX_PAGE_SIZE + 1 }); throw new Error('oversized page accepted'); } catch (error) { if (!(error instanceof SellerDirectoryServiceError)) throw error; }

if (__sellerDirectoryTestables.normalizeError({ code: '42501', message: 'permission denied' }).kind !== 'authorization') throw new Error('authorization error classification changed');
if (__sellerDirectoryTestables.normalizeError({ code: '42703', message: 'column does not exist' }).kind !== 'schema') throw new Error('schema error classification changed');
if (__sellerDirectoryTestables.normalizeError(new Error('Failed to fetch')).kind !== 'network') throw new Error('network error classification changed');
if (__sellerDirectoryTestables.normalizeError({ code: 'PGRST301', message: 'JWT expired' }).kind !== 'auth') throw new Error('authentication error classification changed');

try { __sellerDirectoryTestables.mapSellerDirectoryRow({ id: 'not-a-uuid', nome_negocio: 'Loja', descricao: 'Descrição', status: 'ativo' }); throw new Error('invalid seller response accepted'); } catch (error) { if (!(error instanceof SellerDirectoryServiceError)) throw error; }
try { __sellerDirectoryTestables.mapSellerDirectoryRow({ id: sellerId, nome_negocio: 'Loja', status: 'ativo' }); throw new Error('incomplete seller response accepted'); } catch (error) { if (!(error instanceof SellerDirectoryServiceError)) throw error; }

// A ausência de listings não participa do contrato: o resumo público é
// mapeado somente a partir de sellers e deve ser retornado normalmente.
const sellerWithoutListings = __sellerDirectoryTestables.mapSellerDirectoryRow({ id: sellerId, nome_negocio: 'Loja sem anúncios', descricao: 'Em preparação', status: 'ativo' });
if (!sellerWithoutListings || sellerWithoutListings.storeName !== 'Loja sem anúncios') throw new Error('seller without listings must remain discoverable');
