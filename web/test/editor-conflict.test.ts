import assert from 'node:assert/strict';
import test from 'node:test';

(globalThis as any).window = {
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
  setTimeout: globalThis.setTimeout.bind(globalThis),
  dispatchEvent: () => true,
};

const requests: Array<{ url: string; method: string; body: any }> = [];
(globalThis as any).fetch = async (input: string | URL | Request, init: RequestInit = {}) => {
  const url = String(input);
  const method = init.method ?? 'GET';
  const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
  requests.push({ url, method, body });

  if (method === 'GET' && url.includes('/api/files/content')) {
    return new Response(JSON.stringify({ path: 'note.md', content: 'opened content', version: 'version-1' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  if (method === 'PUT' && url === '/api/files/content') {
    return new Response(JSON.stringify({ error: 'File changed since it was opened' }), {
      status: 409,
      headers: { 'content-type': 'application/json' },
    });
  }
  throw new Error(`Unexpected request: ${method} ${url}`);
};

const { useStore } = await import('../src/lib/store.js');

test('a stale editor sends its opened version and retains dirty content with a clear conflict notice', async () => {
  await useStore.getState().openFile('note.md');
  useStore.getState().setContent('my unsaved work');

  await useStore.getState().save();

  const write = requests.find((request) => request.method === 'PUT');
  assert(write);
  assert.equal(write.body.expectedVersion, 'version-1');
  assert.equal(useStore.getState().content, 'my unsaved work');
  assert.equal(useStore.getState().dirty, true);
  assert.match(useStore.getState().toast, /conflict/i);
  assert.match(useStore.getState().toast, /kept/i);
});
