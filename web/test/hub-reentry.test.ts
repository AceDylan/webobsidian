import assert from 'node:assert/strict';
import test from 'node:test';

// Minimal browser stand-ins: a frame whose parent is someone else, a location we can
// watch, and a sessionStorage.
const replaced: string[] = [];
const store = new Map<string, string>();
const fakeTop = {};
(globalThis as any).window = { top: fakeTop, self: {} };
(globalThis as any).location = {
  pathname: '/note/Inbox/Today.md',
  search: '',
  replace: (url: string) => replaced.push(url),
};
(globalThis as any).sessionStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
};

const hub = await import('../src/lib/hub.ts');

test('without a Hub that can sign us in, nothing happens', () => {
  hub.rememberHub(null);
  assert.equal(hub.reenterThroughHub(), false);
  hub.rememberHub({ url: 'https://hub.example.test:5526', sso: false });
  assert.equal(hub.reenterThroughHub(), false);
  assert.deepEqual(replaced, []);
});

test('outside a frame, a lost session is not sent to the Hub automatically', () => {
  hub.rememberHub({ url: 'https://hub.example.test:5526', sso: true });
  (globalThis as any).window.self = fakeTop;
  try {
    assert.equal(hub.reenterThroughHub(), false);
  } finally {
    (globalThis as any).window.self = {};
  }
});

test('inside the Hub frame it goes back through the Hub once, keeping the page, then holds off', () => {
  hub.rememberHub({ url: 'https://hub.example.test:5526', sso: true });
  assert.equal(hub.reenterThroughHub(), true);
  assert.deepEqual(replaced, ['https://hub.example.test:5526/vault/open?to=%2Fnote%2FInbox%2FToday.md']);
  // A cookie that does not stick must not turn into an endless bounce.
  assert.equal(hub.reenterThroughHub(), false);
  assert.equal(replaced.length, 1);
});
