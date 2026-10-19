import {
  BillingIdentityCryptoError,
  decryptBillingDocument,
  encryptBillingDocument,
  fingerprintBillingDocument,
  normalizeBillingDocument,
  type BillingIdentityCryptoEnv,
} from './index.ts';

function assert(condition: unknown, message = 'assertion failed'): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

async function assertRejects(operation: () => Promise<unknown> | unknown, code: BillingIdentityCryptoError['code']): Promise<void> {
  try {
    await operation();
  } catch (error) {
    assert(error instanceof BillingIdentityCryptoError, 'expected crypto error');
    assertEquals(error.code, code);
    return;
  }
  throw new Error('expected operation to reject');
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function testEnv(version = '1'): BillingIdentityCryptoEnv {
  return {
    get(name) {
      if (name === 'GEMN_BILLING_ACTIVE_KEY_VERSION') return version;
      if (name === 'GEMN_BILLING_ENCRYPTION_KEY_V1') return base64Url(new Uint8Array(32).fill(0x11));
      if (name === 'GEMN_BILLING_HMAC_KEY_V1') return base64Url(new Uint8Array(32).fill(0x22));
      if (name === 'GEMN_BILLING_ENCRYPTION_KEY_V2') return base64Url(new Uint8Array(32).fill(0x33));
      if (name === 'GEMN_BILLING_HMAC_KEY_V2') return base64Url(new Uint8Array(32).fill(0x44));
      return undefined;
    },
  };
}

const userA = 'e6000000-0000-0000-0000-000000000001';
const userB = 'e6000000-0000-0000-0000-000000000002';

Deno.test('normalizes and validates CPF/CNPJ check digits', () => {
  assertEquals(normalizeBillingDocument('529.982.247-25'), { type: 'cpf', normalized: '52998224725' });
  assertEquals(normalizeBillingDocument('04.252.011/0001-10'), { type: 'cnpj', normalized: '04252011000110' });
  assertRejects(() => normalizeBillingDocument('529.982.247-24'), 'INVALID_DOCUMENT');
  assertRejects(() => normalizeBillingDocument('11.111.111/1111-11'), 'INVALID_DOCUMENT');
  assertRejects(() => normalizeBillingDocument('52998224725', 'cnpj'), 'INVALID_DOCUMENT');
});

Deno.test('encrypts and decrypts with versioned AES-GCM ciphertext', async () => {
  const encrypted = await encryptBillingDocument(userA, '529.982.247-25', testEnv());
  assert(encrypted.ciphertext.startsWith('gbi1.1.cpf.'), 'ciphertext format is not versioned');
  assertEquals(encrypted.documentType, 'cpf');
  assertEquals(encrypted.documentLast4, '4725');
  const decrypted = await decryptBillingDocument(userA, encrypted.ciphertext, testEnv());
  assertEquals(decrypted, { type: 'cpf', normalized: '52998224725' });
});

Deno.test('authenticates user context and rejects tampering', async () => {
  const encrypted = await encryptBillingDocument(userA, '52998224725', testEnv());
  const parts = encrypted.ciphertext.split('.');
  parts[4] = `${parts[4].slice(0, -1)}${parts[4].endsWith('A') ? 'B' : 'A'}`;
  await assertRejects(() => decryptBillingDocument(userA, parts.join('.'), testEnv()), 'DECRYPTION_FAILED');
  await assertRejects(() => decryptBillingDocument(userB, encrypted.ciphertext, testEnv()), 'DECRYPTION_FAILED');
  await assertRejects(() => decryptBillingDocument(userA, encrypted.ciphertext, testEnv(), 'cnpj'), 'INVALID_CIPHERTEXT');
});

Deno.test('fingerprint is deterministic, typed and independent from encryption nonce', async () => {
  const first = await fingerprintBillingDocument('529.982.247-25', testEnv());
  const second = await fingerprintBillingDocument('52998224725', testEnv());
  const encryptedA = await encryptBillingDocument(userA, '52998224725', testEnv());
  const encryptedB = await encryptBillingDocument(userA, '52998224725', testEnv());
  assertEquals(first, second);
  assert(encryptedA.ciphertext !== encryptedB.ciphertext, 'encryption nonce was reused');
  assert(first.fingerprint.startsWith('gbi1.1.'), 'fingerprint format is not versioned');
});

Deno.test('supports key version selection without accepting missing or malformed keys', async () => {
  const encrypted = await encryptBillingDocument(userA, '04.252.011/0001-10', testEnv('2'));
  assert(encrypted.ciphertext.startsWith('gbi1.2.cnpj.'), 'active key version was not selected');
  assertEquals((await decryptBillingDocument(userA, encrypted.ciphertext, testEnv('1'))).normalized, '04252011000110');
  await assertRejects(() => decryptBillingDocument(userA, encrypted.ciphertext, { get: () => undefined }), 'MISSING_KEY');
  await assertRejects(() => fingerprintBillingDocument('52998224725', { get: () => undefined }), 'INVALID_KEY_VERSION');
  await assertRejects(() => encryptBillingDocument(userA, '52998224725', { get: () => '1' }), 'INVALID_KEY');
});

Deno.test('does not expose document data in crypto errors', async () => {
  const document = '52998224725';
  try {
    await decryptBillingDocument(userA, 'gbi1.1.cpf.invalid.invalid', testEnv());
  } catch (error) {
    assert(error instanceof Error);
    assert(!error.message.includes(document), 'error exposed document');
    assert(!error.message.includes('invalid.invalid'), 'error exposed ciphertext');
  }
});
