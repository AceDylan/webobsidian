import assert from 'node:assert/strict';
import test from 'node:test';

const calls: string[] = [];
const win = {
  location: { pathname: '/note/Linked.md' },
  history: {
    pushState: (_s: unknown, _t: string, url: string) => { calls.push(`push ${url}`); win.location.pathname = url; },
    replaceState: (_s: unknown, _t: string, url: string) => { calls.push(`replace ${url}`); win.location.pathname = url; },
  },
  addEventListener: () => {},
};
(globalThis as any).window = Object.assign(win, { self: win, top: win });
const { initUrlSync } = await import('../src/lib/urlsync.ts');
const { useStore, GRAPH_PATH } = await import('../src/lib/store.ts');

test('landing on an explicit note keeps it in browser history when opening Graph', () => {
  assert.equal(initUrlSync(), 'Linked.md');
  useStore.setState({ activePath: 'Linked.md' });
  useStore.setState({ activePath: GRAPH_PATH });
  assert.deepEqual(calls, ['push /graph']);
});
