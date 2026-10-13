import {
  __sellerBrandingTestables,
  SELLER_BRANDING_ALLOWED_MIME_TYPES,
  SELLER_BRANDING_BUCKET,
  SELLER_BRANDING_MAX_FILE_SIZE,
  SELLER_BRANDING_SELECT,
  SELLER_BRANDING_SELLER_SELECT,
  SELLER_BRANDING_SIGNED_URL_SECONDS,
  SELLER_PROFILE_MAX_DESCRIPTION_LENGTH,
  SELLER_PROFILE_MAX_NAME_LENGTH,
  SELLER_PROFILE_RPC,
  validateBrandingImage,
  validateSellerProfileUpdate,
  validateSellerBrandingSellerId,
} from './sellerBranding';
import { SellerBrandingServiceError } from '../types/sellerBranding';

// Teste de contrato compilável: não há executor Jest/Vitest configurado.
if (SELLER_BRANDING_BUCKET !== 'seller-branding') throw new Error('branding bucket contract changed');
if (SELLER_BRANDING_SIGNED_URL_SECONDS !== 300) throw new Error('signed URL expiry must remain five minutes');
if (SELLER_BRANDING_MAX_FILE_SIZE !== 5 * 1024 * 1024) throw new Error('branding file limit changed');
if (SELLER_BRANDING_SELLER_SELECT !== 'id,nome_negocio,descricao,status') throw new Error('seller select exposes unexpected fields');
if (SELLER_BRANDING_SELECT !== 'seller_id,logo_path,banner_path,atualizado_em') throw new Error('branding select contract changed');
if (SELLER_BRANDING_ALLOWED_MIME_TYPES.join('|') !== 'image/jpeg|image/png|image/webp') throw new Error('branding MIME contract changed');
if (SELLER_PROFILE_RPC !== 'set_seller_profile') throw new Error('seller profile RPC name changed');
if (SELLER_PROFILE_MAX_NAME_LENGTH !== 255 || SELLER_PROFILE_MAX_DESCRIPTION_LENGTH !== 5000) throw new Error('seller profile limits changed');

const sellerId = validateSellerBrandingSellerId('00000000-0000-4000-8000-000000000041');
const logoPath = `${sellerId}/logo/00000000-0000-4000-8000-000000000042.png`;
const bannerPath = `${sellerId}/banner/00000000-0000-4000-8000-000000000043.webp`;
if (!__sellerBrandingTestables.validPath(sellerId, 'logo', logoPath)) throw new Error('valid logo path rejected');
if (!__sellerBrandingTestables.validPath(sellerId, 'banner', bannerPath)) throw new Error('valid banner path rejected');
if (__sellerBrandingTestables.validPath(sellerId, 'logo', bannerPath)) throw new Error('banner path accepted as logo');
if (__sellerBrandingTestables.validPath(sellerId, 'logo', `00000000-0000-4000-8000-000000000099/logo/00000000-0000-4000-8000-000000000042.png`)) throw new Error('cross-seller path accepted');

for (const image of [
  { uri: 'blob:jpeg', fileName: 'logo.jpg', fileSize: 100, mimeType: 'image/jpeg' },
  { uri: 'blob:png', fileName: 'logo.png', fileSize: 100, mimeType: 'image/png' },
  { uri: 'blob:webp', fileName: 'logo.webp', fileSize: 100, mimeType: 'image/webp' },
]) validateBrandingImage(image);

try { validateBrandingImage({ uri: 'blob:gif', fileName: 'logo.gif', mimeType: 'image/gif' }); throw new Error('GIF accepted'); } catch (error) { if (!(error instanceof SellerBrandingServiceError)) throw error; }
try { validateBrandingImage({ uri: 'blob:large', fileName: 'logo.png', mimeType: 'image/png', fileSize: SELLER_BRANDING_MAX_FILE_SIZE + 1 }); throw new Error('oversized image accepted'); } catch (error) { if (!(error instanceof SellerBrandingServiceError)) throw error; }
try { validateSellerBrandingSellerId('not-a-uuid'); throw new Error('invalid seller id accepted'); } catch (error) { if (!(error instanceof SellerBrandingServiceError)) throw error; }

const mapped = __sellerBrandingTestables.mapBranding({ seller_id: sellerId, logo_path: logoPath, banner_path: null, atualizado_em: '2026-10-12T00:00:00.000Z' }, sellerId);
if (mapped.logoPath !== logoPath || mapped.bannerPath !== null) throw new Error('branding mapping failed');
try { __sellerBrandingTestables.mapBranding({ seller_id: sellerId, logo_path: 'other/logo/invalid.png', banner_path: null, atualizado_em: '2026-10-12T00:00:00.000Z' }, sellerId); throw new Error('cross-seller branding mapping accepted'); } catch (error) { if (!(error instanceof SellerBrandingServiceError)) throw error; }
try { __sellerBrandingTestables.rpcRow(null); throw new Error('unexpected RPC response accepted'); } catch (error) { if (!(error instanceof SellerBrandingServiceError)) throw error; }

const networkError = __sellerBrandingTestables.normalizeError(new Error('Failed to fetch'));
if (networkError.kind !== 'network' || !networkError.retryable) throw new Error('network errors must be retryable');
const authError = __sellerBrandingTestables.normalizeError({ code: 'PGRST301', message: 'JWT expired' });
if (authError.kind !== 'auth') throw new Error('authentication errors must be classified as auth');
const authorizationError = __sellerBrandingTestables.normalizeError({ code: '42501', message: 'permission denied' });
if (authorizationError.kind !== 'authorization') throw new Error('authorization errors must be classified as authorization');
const rpcValidationError = __sellerBrandingTestables.normalizeError({ code: 'P0001', message: 'nome do negocio e obrigatorio' });
if (rpcValidationError.kind !== 'validation') throw new Error('RPC validation errors must be classified as validation');
const rpcAuthError = __sellerBrandingTestables.normalizeError({ code: 'P0001', message: 'usuario autenticado e obrigatorio' });
if (rpcAuthError.kind !== 'auth') throw new Error('RPC authentication errors must be classified as auth');
const rpcAuthorizationError = __sellerBrandingTestables.normalizeError({ code: 'P0001', message: 'vendedor suspenso nao pode atualizar o perfil comercial' });
if (rpcAuthorizationError.kind !== 'authorization') throw new Error('RPC authorization errors must be classified as authorization');
const rpcNoSellerError = __sellerBrandingTestables.normalizeError({ code: 'P0001', message: 'usuario autenticado nao possui vendedor' });
if (rpcNoSellerError.kind !== 'authorization') throw new Error('seller-less users must be classified as authorization');

const profileArgs = __sellerBrandingTestables.buildSellerProfileRpcArgs({ storeName: '  Loja   segura  ', description: undefined });
if (profileArgs.p_nome_negocio !== '  Loja   segura  ' || profileArgs.p_descricao !== null) throw new Error('seller profile RPC parameters changed');
if ('seller_id' in profileArgs || 'user_id' in profileArgs || 'status' in profileArgs || 'role' in profileArgs) throw new Error('seller profile RPC leaked forbidden parameters');

try { validateSellerProfileUpdate({ storeName: '   ', description: null }); throw new Error('empty seller profile name accepted'); } catch (error) { if (!(error instanceof SellerBrandingServiceError)) throw error; }
try { validateSellerProfileUpdate({ storeName: 'x'.repeat(256) }); throw new Error('long seller profile name accepted'); } catch (error) { if (!(error instanceof SellerBrandingServiceError)) throw error; }
try { validateSellerProfileUpdate({ storeName: 'Loja', description: 'x'.repeat(5001) }); throw new Error('long seller profile description accepted'); } catch (error) { if (!(error instanceof SellerBrandingServiceError)) throw error; }
const mappedProfile = __sellerBrandingTestables.mapSellerProfile({ seller_id: sellerId, nome_negocio: 'Loja segura', descricao: '', atualizado_em: '2026-10-12T00:00:00.000Z' });
if (mappedProfile.sellerId !== sellerId || mappedProfile.storeName !== 'Loja segura' || mappedProfile.description !== '') throw new Error('seller profile mapping failed');
try { __sellerBrandingTestables.mapSellerProfile({ seller_id: sellerId, nome_negocio: 'Loja', atualizado_em: '2026-10-12T00:00:00.000Z' }); throw new Error('unexpected seller profile response accepted'); } catch (error) { if (!(error instanceof SellerBrandingServiceError)) throw error; }
