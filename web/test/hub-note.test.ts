import assert from 'node:assert/strict';
import test from 'node:test';

// A frame whose parent is the Hub: messages in through window listeners, answers
// out through postMessage on the sending window.
const listeners = new Set<(e: any) => void>();
const toParent: Array<{ data: any; origin: string }> = [];
const parent = { postMessage: (data: any, origin: string) => toParent.push({ data, origin }) };
(globalThis as any).window = {
  top: parent,
  self: {},
  parent,
  addEventListener: (type: string, fn: any) => type === 'message' && listeners.add(fn),
  removeEventListener: (type: string, fn: any) => type === 'message' && listeners.delete(fn),
};

const hub = await import('../src/lib/hub.ts');
const note = await import('../src/lib/hubNote.ts');
const HUB = 'https://hub.example.test:5526';
const send = (data: unknown, extra: object = {}) =>
  [...listeners].forEach((fn) => fn({ source: parent, origin: HUB, data, ...extra }));
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test('note paths: vault-relative only', () => {
  assert.equal(note.cleanNotePath(' 项目/HaloWebUI.md '), '项目/HaloWebUI.md');
  for (const bad of ['../x.md', '/etc/passwd', '.obsidian/app.json', 'a//b.md', 'a\\b.md', '', 42, 'x\u0000.md', 'a/.git/config']) {
    assert.equal(note.cleanNotePath(bad), '', JSON.stringify(bad));
  }
});

test('without a known Hub nothing is announced and nothing is accepted', async () => {
  const opened: string[] = [];
  const stop = note.onHubOpenNote(async (p) => void opened.push(p));
  send({ source: 'hub', type: 'open-note', id: 1, path: 'a.md' });
  await settle();
  assert.deepEqual(opened, []);
  assert.deepEqual(toParent, []);
  stop();
});

test('ready is announced to the Hub origin; only the Hub can open notes, and it gets an answer', async () => {
  hub.rememberHub({ url: HUB, sso: true });
  const opened: string[] = [];
  const stop = note.onHubOpenNote(async (p) => {
    if (p === 'missing.md') throw new Error('404');
    opened.push(p);
  });
  assert.deepEqual(toParent.shift(), { data: { source: 'webobsidian', type: 'ready' }, origin: HUB });

  send({ source: 'hub', type: 'open-note', id: 1, path: 'a.md' }, { origin: 'https://evil.example' });
  send({ source: 'hub', type: 'open-note', id: 2, path: 'a.md' }, { source: {} });
  send({ source: 'hub', type: 'theme', theme: 'dark' });
  await settle();
  assert.deepEqual(opened, []);
  assert.deepEqual(toParent, []);

  send({ source: 'hub', type: 'open-note', id: 3, path: '项目/HaloWebUI.md' });
  send({ source: 'hub', type: 'open-note', id: 4, path: '../secret.md' });
  send({ source: 'hub', type: 'open-note', id: 5, path: 'missing.md' });
  await settle();
  await settle();
  assert.deepEqual(opened, ['项目/HaloWebUI.md']);
  assert.deepEqual(
    toParent.map((m) => [m.origin, m.data.type, m.data.id, m.data.ok]).sort((a, b) => a[2] - b[2]),
    [
      [HUB, 'open-note', 3, true],
      [HUB, 'open-note', 4, false],
      [HUB, 'open-note', 5, false],
    ],
  );

  stop();
  toParent.length = 0;
  send({ source: 'hub', type: 'open-note', id: 6, path: 'a.md' });
  await settle();
  assert.deepEqual(toParent, []);
});
