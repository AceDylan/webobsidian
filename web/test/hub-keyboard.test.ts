import assert from 'node:assert/strict';
import test from 'node:test';

const parent = {};
(globalThis as any).window = { top: parent, self: {}, parent };

const hub = await import('../src/lib/hub.ts');
const { acceptHubKeyboard } = await import('../src/lib/hubKeyboard.ts');
const HUB = 'https://hub.example.test:5526';
const msg = (data: unknown, extra: object = {}) => ({ source: parent, origin: HUB, data, ...extra });

test('only the parent on the Hub origin can say how much the keyboard covers', () => {
  const data = { source: 'hub', type: 'keyboard', covered: 304 };
  assert.equal(acceptHubKeyboard(msg(data)), null); // no Hub known yet
  hub.rememberHub({ url: HUB, sso: true });
  assert.equal(acceptHubKeyboard(msg(data)), 304);
  assert.equal(acceptHubKeyboard(msg(data, { origin: 'https://evil.example' })), null);
  assert.equal(acceptHubKeyboard(msg(data, { source: {} })), null);
  assert.equal(acceptHubKeyboard(msg({ ...data, type: 'theme' })), null);
});

test('the covered height is a sane number of pixels', () => {
  const covered = (value: unknown) => acceptHubKeyboard(msg({ source: 'hub', type: 'keyboard', covered: value }));
  assert.equal(covered(0), 0);
  assert.equal(covered(-20), 0);
  assert.equal(covered(203.6), 204);
  assert.equal(covered(1e9), 4000);
  for (const bad of ['300', NaN, Infinity, null, undefined]) assert.equal(covered(bad), null, String(bad));
});
