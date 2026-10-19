/**
 * Backend-only cryptographic boundary for billing identities.
 *
 * Plaintext documents must exist only in the caller's memory while this module
 * is executing. This module never logs document values, keys or ciphertext.
 */

export type BillingDocumentType = 'cpf' | 'cnpj';

export interface BillingIdentityCryptoEnv {
  get(name: string): string | undefined;
}

export interface BillingDocument {
  type: BillingDocumentType;
  normalized: string;
}

export class BillingIdentityCryptoError extends Error {
  readonly code:
    | 'INVALID_DOCUMENT'
    | 'INVALID_USER_CONTEXT'
    | 'MISSING_KEY'
    | 'INVALID_KEY'
    | 'INVALID_KEY_VERSION'
    | 'INVALID_CIPHERTEXT'
    | 'DECRYPTION_FAILED';

  constructor(code: BillingIdentityCryptoError['code'], message: string) {
    super(message);
    this.name = 'BillingIdentityCryptoError';
    this.code = code;
  }
}

const FORMAT_VERSION = 'gbi1';
const ACTIVE_KEY_VERSION_ENV = 'GEMN_BILLING_ACTIVE_KEY_VERSION';
const ENCRYPTION_KEY_PREFIX = 'GEMN_BILLING_ENCRYPTION_KEY_V';
const HMAC_KEY_PREFIX = 'GEMN_BILLING_HMAC_KEY_V';
const AES_KEY_BYTES = 32;
const AES_NONCE_BYTES = 12;
const AES_TAG_BITS = 128;

function fail(code: BillingIdentityCryptoError['code'], message: string): never {
  throw new BillingIdentityCryptoError(code, message);
}

function isDocumentType(value: string): value is BillingDocumentType {
  return value === 'cpf' || value === 'cnpj';
}

function assertUserContext(userId: string): string {
  if (typeof userId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    fail('INVALID_USER_CONTEXT', 'Billing identity user context is invalid');
  }
  return userId.toLowerCase();
}

function assertAllowedDocumentCharacters(value: string): void {
  if (typeof value !== 'string' || !value.trim() || /[^0-9.\-/\s]/.test(value)) {
    fail('INVALID_DOCUMENT', 'Billing document is invalid');
  }
}

function allDigitsEqual(value: string): boolean {
  return /^([0-9])\1+$/.test(value);
}

function cpfCheckDigits(value: string): boolean {
  let first = 0;
  for (let index = 0; index < 9; index += 1) first += Number(value[index]) * (10 - index);
  let digit = (first * 10) % 11;
  if (digit === 10) digit = 0;
  if (digit !== Number(value[9])) return false;

  let second = 0;
  for (let index = 0; index < 10; index += 1) second += Number(value[index]) * (11 - index);
  digit = (second * 10) % 11;
  if (digit === 10) digit = 0;
  return digit === Number(value[10]);
}

function cnpjCheckDigits(value: string): boolean {
  const calculate = (length: number): number => {
    const weights = length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let index = 0; index < length; index += 1) sum += Number(value[index]) * weights[index];
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  return calculate(12) === Number(value[12]) && calculate(13) === Number(value[13]);
}

export function normalizeBillingDocument(value: string, expectedType?: BillingDocumentType): BillingDocument {
  assertAllowedDocumentCharacters(value);
  const normalized = value.replace(/\D/g, '');
  const type = normalized.length === 11 ? 'cpf' : normalized.length === 14 ? 'cnpj' : null;
  if (!type || (expectedType && expectedType !== type) || allDigitsEqual(normalized)) {
    fail('INVALID_DOCUMENT', 'Billing document is invalid');
  }
  if ((type === 'cpf' && !cpfCheckDigits(normalized)) || (type === 'cnpj' && !cnpjCheckDigits(normalized))) {
    fail('INVALID_DOCUMENT', 'Billing document is invalid');
  }
  return { type, normalized };
}

function decodeBase64Url(value: string, code: 'INVALID_KEY' | 'INVALID_CIPHERTEXT'): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) fail(code, code === 'INVALID_KEY' ? 'Billing key is invalid' : 'Billing ciphertext is invalid');
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    fail(code, code === 'INVALID_KEY' ? 'Billing key is invalid' : 'Billing ciphertext is invalid');
  }
}

function encodeBase64Url(value: ArrayBuffer | Uint8Array): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

function activeKeyVersion(env: BillingIdentityCryptoEnv): number {
  const raw = env.get(ACTIVE_KEY_VERSION_ENV);
  if (!raw || !/^[1-9][0-9]{0,8}$/.test(raw)) fail('INVALID_KEY_VERSION', 'Billing key version is invalid');
  const version = Number(raw);
  if (!Number.isSafeInteger(version) || version < 1) fail('INVALID_KEY_VERSION', 'Billing key version is invalid');
  return version;
}

function keySecret(env: BillingIdentityCryptoEnv, prefix: string, version: number): Uint8Array {
  const raw = env.get(`${prefix}${version}`);
  if (!raw) fail('MISSING_KEY', 'Billing cryptographic key is not configured');
  const key = decodeBase64Url(raw, 'INVALID_KEY');
  if (key.length !== AES_KEY_BYTES) fail('INVALID_KEY', 'Billing cryptographic key is invalid');
  return key;
}

function aad(userId: string, type: BillingDocumentType): Uint8Array {
  return new TextEncoder().encode(`${FORMAT_VERSION}|${assertUserContext(userId)}|${type}`);
}

async function importAesKey(env: BillingIdentityCryptoEnv, version: number): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', toArrayBuffer(keySecret(env, ENCRYPTION_KEY_PREFIX, version)), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function importHmacKey(env: BillingIdentityCryptoEnv, version: number): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', toArrayBuffer(keySecret(env, HMAC_KEY_PREFIX, version)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

export async function encryptBillingDocument(
  userId: string,
  document: string,
  env: BillingIdentityCryptoEnv = Deno.env,
  expectedType?: BillingDocumentType,
): Promise<{ ciphertext: string; documentType: BillingDocumentType; keyVersion: number; documentLast4: string }> {
  const contextUserId = assertUserContext(userId);
  const normalized = normalizeBillingDocument(document, expectedType);
  const version = activeKeyVersion(env);
  const key = await importAesKey(env, version);
  const nonce = crypto.getRandomValues(new Uint8Array(AES_NONCE_BYTES));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(nonce), additionalData: toArrayBuffer(aad(contextUserId, normalized.type)), tagLength: AES_TAG_BITS },
    key,
    new TextEncoder().encode(normalized.normalized),
  );
  return {
    ciphertext: `${FORMAT_VERSION}.${version}.${normalized.type}.${encodeBase64Url(nonce)}.${encodeBase64Url(encrypted)}`,
    documentType: normalized.type,
    keyVersion: version,
    documentLast4: normalized.normalized.slice(-4),
  };
}

export async function decryptBillingDocument(
  userId: string,
  ciphertext: string,
  env: BillingIdentityCryptoEnv = Deno.env,
  expectedType?: BillingDocumentType,
): Promise<BillingDocument> {
  const contextUserId = assertUserContext(userId);
  if (typeof ciphertext !== 'string') fail('INVALID_CIPHERTEXT', 'Billing ciphertext is invalid');
  const parts = ciphertext.split('.');
  if (parts.length !== 5 || parts[0] !== FORMAT_VERSION || !isDocumentType(parts[2])) {
    fail('INVALID_CIPHERTEXT', 'Billing ciphertext is invalid');
  }
  const version = parts[1] && /^[1-9][0-9]{0,8}$/.test(parts[1]) ? Number(parts[1]) : 0;
  if (!Number.isSafeInteger(version) || version < 1) fail('INVALID_KEY_VERSION', 'Billing key version is invalid');
  const type = parts[2] as BillingDocumentType;
  if (expectedType && expectedType !== type) fail('INVALID_CIPHERTEXT', 'Billing ciphertext type is invalid');
  const nonce = decodeBase64Url(parts[3], 'INVALID_CIPHERTEXT');
  const payload = decodeBase64Url(parts[4], 'INVALID_CIPHERTEXT');
  if (nonce.length !== AES_NONCE_BYTES || payload.length <= AES_TAG_BITS / 8) fail('INVALID_CIPHERTEXT', 'Billing ciphertext is invalid');
  try {
    const key = await importAesKey(env, version);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(nonce), additionalData: toArrayBuffer(aad(contextUserId, type)), tagLength: AES_TAG_BITS },
      key,
      toArrayBuffer(payload),
    );
    const document = new TextDecoder().decode(plaintext);
    return normalizeBillingDocument(document, type);
  } catch (error) {
    if (error instanceof BillingIdentityCryptoError) throw error;
    fail('DECRYPTION_FAILED', 'Billing ciphertext could not be decrypted');
  }
}

export async function fingerprintBillingDocument(
  document: string,
  env: BillingIdentityCryptoEnv = Deno.env,
  expectedType?: BillingDocumentType,
): Promise<{ fingerprint: string; documentType: BillingDocumentType; keyVersion: number; documentLast4: string }> {
  const normalized = normalizeBillingDocument(document, expectedType);
  const version = activeKeyVersion(env);
  const key = await importHmacKey(env, version);
  const message = new TextEncoder().encode(`${FORMAT_VERSION}|${normalized.type}|${normalized.normalized}`);
  const digest = await crypto.subtle.sign('HMAC', key, message);
  return {
    fingerprint: `${FORMAT_VERSION}.${version}.${encodeBase64Url(digest)}`,
    documentType: normalized.type,
    keyVersion: version,
    documentLast4: normalized.normalized.slice(-4),
  };
}
