import assert from 'node:assert/strict';
import test from 'node:test';
import { isTrustedProxyAuth } from '../dist/middleware/auth.js';

const secret = 'test-proxy-secret';

test('trusted-proxy auth requires a matching secret and direct peer', () => {
  assert.equal(isTrustedProxyAuth(secret, '127.0.0.1', secret, '127.0.0.1'), true);
  assert.equal(isTrustedProxyAuth('wrong', '127.0.0.1', secret, '127.0.0.1'), false);
  assert.equal(isTrustedProxyAuth([secret], '127.0.0.1', secret, '127.0.0.1'), false);
  assert.equal(isTrustedProxyAuth(secret, '203.0.113.8', secret, '127.0.0.1'), false);
  assert.equal(isTrustedProxyAuth(secret, '127.0.0.1', secret, undefined), false);
  assert.equal(isTrustedProxyAuth(secret, '127.0.0.1', undefined, '127.0.0.1'), false);
});

test('IPv4 and IPv4-mapped socket addresses compare equivalently', () => {
  assert.equal(isTrustedProxyAuth(secret, '::ffff:127.0.0.1', secret, '127.0.0.1'), true);
  assert.equal(isTrustedProxyAuth(secret, '127.0.0.1', secret, '::ffff:127.0.0.1'), true);
});

test('trusted-proxy address accepts exact IP literals only', () => {
  assert.equal(isTrustedProxyAuth(secret, '10.1.2.3', secret, '10.0.0.0/8'), false);
  assert.equal(isTrustedProxyAuth(secret, '127.0.0.1', secret, 'localhost'), false);
});
