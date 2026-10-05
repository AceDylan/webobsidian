import assert from 'node:assert/strict';
import test from 'node:test';

const timers = new Set<ReturnType<typeof setTimeout>>();
(globalThis as any).window = {
  clearTimeout: (id: ReturnType<typeof setTimeout>) => { clearTimeout(id); timers.delete(id); },
  setTimeout: (fn: () => void, ms: number) => { const id = setTimeout(fn, ms); timers.add(id); return id; },
};
const { api } = await import('../src/lib/api.ts');
const { useStore, GRAPH_PATH } = await import('../src/lib/store.ts');
const reads: string[] = [];
let restored: Record<string, unknown> = {};
let failed = false;
api.getUiState = async () => { if (failed) throw new Error('offline'); return restored; };
api.read = async (path) => { reads.push(path); return { content: '# Selected note', version: 'v1' }; };
api.putUiState = async () => ({ ok: true });

test('root lands on Graph while preserving saved tabs, mode and note navigation', async () => {
  restored = { tabs: [{ path: 'Saved.md', title: 'Saved.md' }], activePath: 'Saved.md', graphMode: 'graph' };
  await useStore.getState().loadUiState(GRAPH_PATH);
  assert.equal(useStore.getState().activePath, GRAPH_PATH);
  assert.deepEqual(useStore.getState().tabs.map((t) => t.path), ['Saved.md', GRAPH_PATH]);
  assert.equal(useStore.getState().graphMode, 'graph');
  assert.equal(useStore.getState().content, '');
  assert.deepEqual(reads, []);
  await useStore.getState().openFile('Saved.md');
  assert.equal(useStore.getState().content, '# Selected note');
  useStore.getState().goBack();
  await Promise.resolve();
  assert.equal(useStore.getState().activePath, GRAPH_PATH);
});

test('explicit note link wins over the saved selection and graph home', async () => {
  reads.length = 0;
  await useStore.getState().loadUiState('Linked.md');
  assert.equal(useStore.getState().activePath, 'Linked.md');
  assert.deepEqual(reads, ['Linked.md']);
  assert.equal(useStore.getState().content, '# Selected note');
  assert.deepEqual(useStore.getState().tabs.map((t) => t.path), ['Saved.md', 'Linked.md']);
});

test('empty workspace opens exactly one graph tab, even when restore fails', async () => {
  restored = {};
  await useStore.getState().loadUiState(GRAPH_PATH);
  failed = true;
  await useStore.getState().loadUiState(GRAPH_PATH);
  assert.equal(useStore.getState().activePath, GRAPH_PATH);
  assert.equal(useStore.getState().tabs.filter((t) => t.path === GRAPH_PATH).length, 1);
  assert.equal(useStore.getState().content, '');
});

test.after(() => { for (const id of timers) clearTimeout(id); });
