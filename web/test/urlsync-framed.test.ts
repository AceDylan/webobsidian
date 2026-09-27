import assert from 'node:assert/strict';
import test from 'node:test';

// Inside the Bookmark Hub's frame, opening another note must not add an entry to
// the page's history (the Hub owns Back); on its own the app keeps pushing.
const calls: string[] = [];
const listeners: Record<string, Array<() => void>> = {};
const fakeTop = {};
(globalThis as any).window = {
  top: fakeTop,
  self: {},
  location: { pathname: '/' },
  history: {
    pushState: (_s: unknown, _t: string, url: string) => { calls.push(`push ${url}`); (globalThis as any).window.location.pathname = url; },
    replaceState: (_s: unknown, _t: string, url: string) => { calls.push(`replace ${url}`); (globalThis as any).window.location.pathname = url; },
  },
  addEventListener: (type: string, fn: () => void) => { (listeners[type] ||= []).push(fn); },
};
(globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

const { initUrlSync } = await import('../src/lib/urlsync.ts');
const { useStore } = await import('../src/lib/store.ts');

test('framed by the Hub, switching notes only replaces the address', () => {
  initUrlSync();
  useStore.setState({ activePath: 'Inbox/a.md' });
  useStore.setState({ activePath: 'Projects/b c.md' });
  useStore.setState({ activePath: null });
  assert.deepEqual(calls, ['replace /note/Inbox/a.md', 'replace /note/Projects/b%20c.md', 'replace /']);
});
