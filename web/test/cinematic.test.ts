import test from 'node:test';
import assert from 'node:assert/strict';
import { cinematicOn, shouldBoot, decode, vaultTelemetry, BOOT_EVERY } from '../src/lib/cinematic';

test('the layer needs a dark Neural/Halo theme, cinematic effects and full motion', () => {
  assert.equal(cinematicOn('theme-dark neural-theme', 'cinematic', false), true);
  assert.equal(cinematicOn('theme-dark halo-theme', 'cinematic', false), true);
  assert.equal(cinematicOn('theme-light halo-theme', 'cinematic', false), false);
  assert.equal(cinematicOn('theme-dark', 'cinematic', false), false);
  assert.equal(cinematicOn('theme-dark neural-theme', 'calm', false), false);
  assert.equal(cinematicOn('theme-dark neural-theme', 'cinematic', true), false);
});

test('the title card plays at most every six hours and never framed', () => {
  const now = 1_800_000_000_000;
  assert.equal(shouldBoot(now, null, false), true);
  assert.equal(shouldBoot(now, now - 60_000, false), false);
  assert.equal(shouldBoot(now, now - BOOT_EVERY, false), true);
  assert.equal(shouldBoot(now, now + 60_000, false), true, 'a clock that went backwards does not mute it forever');
  assert.equal(shouldBoot(now, NaN, false), true);
  assert.equal(shouldBoot(now, null, true), false);
});

test('decoding locks characters left to right and keeps separators', () => {
  const t = 'NEURAL · VAULT';
  assert.equal(decode(t, 1), t);
  const half = decode(t, 0.5, 3);
  assert.equal(half.length, t.length);
  assert.equal(half.slice(0, 7), t.slice(0, 7));
  assert.equal(half[7], '·');
  assert.notEqual(decode(t, 0, 1), t);
  assert.equal(decode(t, 0, 1)[6], ' ');
});

test('telemetry counts Markdown notes and sectors (visible top-level folders + a root with notes)', () => {
  const tree = {
    name: '', path: '', type: 'folder' as const, children: [
      { name: 'a.md', path: 'a.md', type: 'file' as const },
      { name: 'img.png', path: 'img.png', type: 'file' as const },
      { name: '.trash', path: '.trash', type: 'folder' as const, children: [] },
      { name: '系统', path: '系统', type: 'folder' as const, children: [
        { name: 'b.md', path: '系统/b.md', type: 'file' as const },
        { name: 'deep', path: '系统/deep', type: 'folder' as const, children: [{ name: 'c.markdown', path: '系统/deep/c.markdown', type: 'file' as const }] },
      ] },
    ],
  };
  assert.deepEqual(vaultTelemetry(tree), { notes: 3, folders: 2 });
  assert.deepEqual(vaultTelemetry({ ...tree, children: tree.children.slice(1) }), { notes: 2, folders: 1 });
  assert.deepEqual(vaultTelemetry(null), { notes: 0, folders: 0 });
});
