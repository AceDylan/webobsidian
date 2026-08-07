import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'webobsidian-vault-compat-'));
const vaultRoot = path.join(testRoot, 'vault');
const dataRoot = path.join(testRoot, 'data');

process.env.VAULT_PATH = vaultRoot;
process.env.DATA_DIR = dataRoot;

const vault = await import('../src/services/vault.js');

const owner = typeof process.getuid === 'function' && process.getuid() === 0 ? 1000 : process.getuid?.() ?? 0;
const group = typeof process.getgid === 'function' && process.getuid?.() === 0 ? 1000 : process.getgid?.() ?? 0;

async function setMetadata(target: string, mode: number): Promise<void> {
  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    await fs.chown(target, owner, group);
  }
  await fs.chmod(target, mode);
}

async function assertMetadata(target: string, mode: number): Promise<void> {
  const stat = await fs.stat(target);
  assert.equal(stat.uid, owner, `${target} should inherit uid`);
  assert.equal(stat.gid, group, `${target} should inherit gid`);
  assert.equal(stat.mode & 0o777, mode, `${target} should inherit mode policy`);
}

before(async () => {
  await fs.mkdir(vaultRoot, { recursive: true });
  await setMetadata(vaultRoot, 0o770);
});

after(async () => {
  await fs.rm(testRoot, { recursive: true, force: true });
});

test('atomic text saves preserve an existing file owner, group, and mode', async () => {
  const target = path.join(vaultRoot, 'existing.md');
  await fs.writeFile(target, 'before');
  await setMetadata(target, 0o640);

  await vault.writeFileText('existing.md', 'after');

  assert.equal(await fs.readFile(target, 'utf8'), 'after');
  await assertMetadata(target, 0o640);
});

test('new text, binary, and folder paths inherit from the nearest existing vault ancestor', async () => {
  const ancestor = path.join(vaultRoot, 'team');
  await fs.mkdir(ancestor);
  await setMetadata(ancestor, 0o750);

  await vault.writeFileText('team/text/parents/note.md', 'text');
  await assertMetadata(path.join(ancestor, 'text'), 0o750);
  await assertMetadata(path.join(ancestor, 'text/parents'), 0o750);
  await assertMetadata(path.join(ancestor, 'text/parents/note.md'), 0o640);

  await vault.writeFileBuffer('team/uploads/parents/image.bin', Buffer.from([1, 2, 3]));
  await assertMetadata(path.join(ancestor, 'uploads'), 0o750);
  await assertMetadata(path.join(ancestor, 'uploads/parents'), 0o750);
  await assertMetadata(path.join(ancestor, 'uploads/parents/image.bin'), 0o640);

  await vault.createFolder('team/folders/parents/leaf');
  await assertMetadata(path.join(ancestor, 'folders'), 0o750);
  await assertMetadata(path.join(ancestor, 'folders/parents'), 0o750);
  await assertMetadata(path.join(ancestor, 'folders/parents/leaf'), 0o750);
});

test('binary overwrites retain existing metadata', async () => {
  const target = path.join(vaultRoot, 'existing.bin');
  await fs.writeFile(target, Buffer.from([0]));
  await setMetadata(target, 0o600);

  await vault.writeFileBuffer('existing.bin', Buffer.from([4, 5, 6]));

  assert.deepEqual(await fs.readFile(target), Buffer.from([4, 5, 6]));
  await assertMetadata(target, 0o600);
});

test('failed atomic text saves remove their temporary file', async () => {
  const blocked = path.join(vaultRoot, 'blocked.md');
  await fs.mkdir(blocked);
  await fs.writeFile(path.join(blocked, 'child'), 'keep directory non-empty');

  await assert.rejects(vault.writeFileText('blocked.md', 'cannot replace a directory'));

  const leftovers = (await fs.readdir(vaultRoot)).filter((name) => name.startsWith('blocked.md.tmp-'));
  assert.deepEqual(leftovers, []);
});
