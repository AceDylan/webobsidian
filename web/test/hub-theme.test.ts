import assert from 'node:assert/strict';
import test from 'node:test';

// Minimal browser stand-ins: a frame whose parent is the Hub, an address we can
// rewrite, a sessionStorage, and window message listeners.
const store = new Map<string, string>();
const replaced: string[] = [];
const listeners = new Set<(e: any) => void>();
const parent = {};
const win: any = {
  top: parent,
  self: {},
  parent,
  addEventListener: (type: string, fn: any) => type === 'message' && listeners.add(fn),
  removeEventListener: (type: string, fn: any) => type === 'message' && listeners.delete(fn),
};
(globalThis as any).window = win;
(globalThis as any).location = { pathname: '/note/Inbox/Today.md', search: '', hash: '' };
(globalThis as any).history = {
  state: null,
  replaceState: (_s: unknown, _t: string, url: string) => {
    replaced.push(url);
    const [path, hash] = url.split('#');
    (globalThis as any).location.pathname = path;
    (globalThis as any).location.hash = hash ? `#${hash}` : '';
  },
};
(globalThis as any).sessionStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
};

const hub = await import('../src/lib/hub.ts');
const theme = await import('../src/lib/hubTheme.ts');
const HUB = 'https://hub.example.test:5526';
const send = (data: unknown, extra: object = {}) =>
  [...listeners].forEach((fn) => fn({ source: parent, origin: HUB, data, ...extra }));

test('the theme in the address is kept for the tab and removed from the address', () => {
  (globalThis as any).location.hash = '#hub_theme=dark';
  assert.equal(theme.takeHubTheme(), 'dark');
  assert.deepEqual(replaced, ['/note/Inbox/Today.md']);
  assert.equal(theme.hubTheme(), 'dark');
  // A reload inside the frame (no fragment any more) still knows it.
  assert.equal(theme.takeHubTheme(), 'dark');
  assert.equal(replaced.length, 1);
});

test('other fragment parameters stay; junk is removed but not believed', () => {
  (globalThis as any).location.hash = '#hub_theme=purple&x=1';
  assert.equal(theme.takeHubTheme(), 'dark');
  assert.equal(replaced.at(-1), '/note/Inbox/Today.md#x=1');
});

test('only the parent on the Hub origin can change it', () => {
  hub.rememberHub({ url: HUB, sso: true });
  const seen: string[] = [];
  const stop = theme.onHubTheme((t) => seen.push(t));
  send({ source: 'hub', type: 'theme', theme: 'light' }, { origin: 'https://evil.example' });
  send({ source: 'hub', type: 'theme', theme: 'light' }, { source: {} });
  send({ source: 'hub', type: 'theme', theme: 'system' });
  send({ source: 'halowebui', type: 'theme', theme: 'light' });
  send('light');
  assert.deepEqual(seen, []);
  assert.equal(theme.hubTheme(), 'dark');
  send({ source: 'hub', type: 'theme', theme: 'light' });
  assert.deepEqual(seen, ['light']);
  assert.equal(theme.hubTheme(), 'light');
  stop();
  send({ source: 'hub', type: 'theme', theme: 'dark' });
  assert.deepEqual(seen, ['light']);
});

test('without knowing the Hub, no message counts', () => {
  hub.rememberHub(null);
  assert.equal(theme.acceptHubTheme({ source: parent, origin: HUB, data: { source: 'hub', type: 'theme', theme: 'dark' } }), null);
});

test('outside a frame there is no Hub theme and the address is left alone', () => {
  win.self = parent;
  try {
    (globalThis as any).location.hash = '#hub_theme=dark';
    const before = replaced.length;
    assert.equal(theme.takeHubTheme(), null);
    assert.equal(theme.hubTheme(), null);
    assert.equal(replaced.length, before);
  } finally {
    win.self = {};
  }
});
