import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { promises as fs } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'webobsidian-files-route-'));
const vaultRoot = path.join(testRoot, 'vault');

process.env.VAULT_PATH = vaultRoot;
process.env.DATA_DIR = path.join(testRoot, 'data');
process.env.WEBOBSIDIAN_TRUSTED_PROXY_SECRET = 'route-test-secret';
process.env.WEBOBSIDIAN_TRUSTED_PROXY_ADDRESS = '127.0.0.1';

const { filesRouter } = await import('../src/routes/files.js');
const { errorHandler } = await import('../src/middleware/error.js');
const { buildFileIndex } = await import('../src/services/fileindex.js');

let server: http.Server;
let baseUrl = '';

function request(pathname: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${baseUrl}${pathname}`, {
    ...init,
    headers: {
      'x-webobsidian-proxy-auth': 'route-test-secret',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });
}

before(async () => {
  await fs.mkdir(path.join(vaultRoot, 'nested'), { recursive: true });
  await fs.writeFile(path.join(vaultRoot, 'note.md'), 'initial');
  await fs.writeFile(path.join(vaultRoot, 'nested/image.bin'), Buffer.from([1, 2, 3]));
  await buildFileIndex();

  const app = express();
  app.use(express.json());
  app.use('/api/files', filesRouter);
  app.use(errorHandler);
  server = http.createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  assert(address && typeof address !== 'string');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  await fs.rm(testRoot, { recursive: true, force: true });
});

test('GET content returns 404 for unresolved missing text and binary paths', async () => {
  for (const missing of ['missing.md', 'missing.bin']) {
    const response = await request(`/api/files/content?path=${encodeURIComponent(missing)}`);
    assert.equal(response.status, 404, missing);
    assert.deepEqual(await response.json(), { error: 'Not found' });
  }
});

test('GET content still resolves an existing basename', async () => {
  const response = await request('/api/files/content?path=image.bin');
  assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.from([1, 2, 3]));
});

test('text reads return a version and stale versioned writes return 409 without overwriting', async () => {
  const readResponse = await request('/api/files/content?path=note.md');
  assert.equal(readResponse.status, 200);
  const opened = (await readResponse.json()) as { content: string; version?: string };
  assert.equal(opened.content, 'initial');
  assert.equal(typeof opened.version, 'string');
  assert(opened.version);

  await fs.writeFile(path.join(vaultRoot, 'note.md'), 'external change');
  const staleResponse = await request('/api/files/content', {
    method: 'PUT',
    body: JSON.stringify({ path: 'note.md', content: 'stale editor', expectedVersion: opened.version }),
  });
  assert.equal(staleResponse.status, 409);
  assert.equal(await fs.readFile(path.join(vaultRoot, 'note.md'), 'utf8'), 'external change');

  const compatibleResponse = await request('/api/files/content', {
    method: 'PUT',
    body: JSON.stringify({ path: 'note.md', content: 'deliberate tokenless write' }),
  });
  assert.equal(compatibleResponse.status, 200);
  const compatible = (await compatibleResponse.json()) as { version?: string };
  assert.equal(typeof compatible.version, 'string');
  assert.equal(await fs.readFile(path.join(vaultRoot, 'note.md'), 'utf8'), 'deliberate tokenless write');
});
