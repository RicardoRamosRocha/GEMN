import assert from 'node:assert/strict';
import test from 'node:test';

import { getRecoveryParams } from '../src/context/authRecovery.ts';

test('detects implicit recovery parameters in the URL fragment', () => {
  const result = getRecoveryParams(
    'http://127.0.0.1:19000/#access_token=redacted&refresh_token=redacted&type=recovery',
  );

  assert.equal(result.isRecovery, true);
  assert.equal(result.accessToken, 'redacted');
  assert.equal(result.refreshToken, 'redacted');
  assert.equal(result.code, null);
});

test('detects a PKCE recovery code in the query string', () => {
  const result = getRecoveryParams('http://localhost:19000/?code=redacted&type=recovery');

  assert.equal(result.isRecovery, true);
  assert.equal(result.code, 'redacted');
  assert.equal(result.accessToken, null);
});

test('does not classify a normal application URL as recovery', () => {
  const result = getRecoveryParams('http://127.0.0.1:19000/');

  assert.deepEqual(result, {
    isRecovery: false,
    code: null,
    accessToken: null,
    refreshToken: null,
  });
});

