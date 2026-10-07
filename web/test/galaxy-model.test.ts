import assert from 'node:assert/strict';
import test from 'node:test';
import { BRANCH_REACH, branchScene, buildGalaxy, countChars, excerpt, folderColors, formatSize, galaxyScene, OTHER_KEY, PALETTE, ROOT_KEY, type RawGraph } from '../src/lib/galaxyModel';
import type { TreeNode } from '../src/lib/api';

const file = (path: string, size = 100, mtime = 1): TreeNode => ({ name: path.split('/').pop()!, path, type: 'file', size, mtime });
const tree: TreeNode = {
  name: '', path: '', type: 'folder', children: [
    { name: 'A', path: 'A', type: 'folder', children: [file('A/one.md', 300, 5), { name: 'deep', path: 'A/deep', type: 'folder', children: [file('A/deep/two.md', 200, 9)] }] },
    { name: 'B', path: 'B', type: 'folder', children: [file('B/three.md')] },
    { name: 'Daily', path: 'Daily', type: 'folder', children: [] },
    { name: '.obsidian', path: '.obsidian', type: 'folder', children: [] },
    file('home.md', 50, 3),
  ],
};
const note = (id: string) => ({ id, label: id.split('/').pop()!.replace(/\.md$/, ''), kind: 'note' as const, tags: [] });
const raw: RawGraph = {
  nodes: [note('A/one.md'), note('A/deep/two.md'), note('B/three.md'), note('home.md'), { id: 'Ghost', label: 'Ghost', kind: 'unresolved' }],
  edges: [
    { source: 'A/one.md', target: 'B/three.md' }, { source: 'B/three.md', target: 'A/one.md' },
    { source: 'A/deep/two.md', target: 'B/three.md' }, { source: 'A/deep/two.md', target: 'B/three.md' },
    { source: 'home.md', target: 'Ghost' },
  ],
};

test('one hub per top-level folder: subfolders roll up, empty folders stay, hidden ones never', () => {
  const g = buildGalaxy(raw, tree);
  assert.deepEqual(g.folders.map(f => [f.key, f.notes.length]), [['A', 2], ['B', 1], [ROOT_KEY, 1], ['Daily', 0]]);
  const a = g.folders[0];
  assert.deepEqual(a.notes.map(n => n.id), ['A/deep/two.md', 'A/one.md'], 'newest first');
  assert.equal(a.updated, 9);
  assert.equal(g.folders[3].updated, 0);
});

test('links are real note-to-note links: deduplicated, mutual pairs drawn once, unresolved dropped', () => {
  const g = buildGalaxy(raw, tree);
  assert.deepEqual(g.links, [{ a: 'A/one.md', b: 'B/three.md', mutual: true }, { a: 'A/deep/two.md', b: 'B/three.md', mutual: false }]);
  assert.deepEqual(g.notes.get('B/three.md')!.in.sort(), ['A/deep/two.md', 'A/one.md']);
  assert.deepEqual(g.notes.get('home.md')!.out, []);
});

test('too many folders merge the smallest into one 其他 hub without losing notes', () => {
  const nodes = Array.from({ length: 6 }, (_, i) => note(`F${i}/n.md`));
  const g = buildGalaxy({ nodes, edges: [] }, null, 4);
  assert.equal(g.folders.length, 4);
  const other = g.folders.at(-1)!;
  assert.equal(other.key, OTHER_KEY);
  assert.equal(other.members.length, 3);
  assert.equal(g.folders.reduce((s, f) => s + f.notes.length, 0), 6);
  assert.ok(other.notes.every(n => n.folder === OTHER_KEY));
});

test('folder colours are stable and distinct while the palette lasts', () => {
  const one = folderColors(['系统', '运维', '项目']);
  const two = folderColors(['项目', 'Zeta', '运维', '系统']);
  assert.equal(one.get('系统'), two.get('系统'));
  const many = folderColors(PALETTE.map((_, i) => 'f' + i));
  assert.equal(new Set(many.values()).size, PALETTE.length);
});

test('overview keeps hubs inside the pane and switches to chips when crowded', () => {
  const s = galaxyScene(11, 1200, 800, false);
  for (const h of s.hubs) assert.ok(h.x > 0 && h.x < 1200 && h.y > 40 && h.y < 800 - 92, `${h.x},${h.y}`);
  assert.equal(Math.round(s.hubs[0].x), 600, 'first hub at 12 o’clock');
  assert.equal(s.compact, false);
  assert.equal(galaxyScene(30, 900, 600, false).compact, true);
  const p = galaxyScene(11, 390, 700, true);
  assert.equal(p.compact, true);
  assert.ok(p.hubs.every(h => Math.abs(h.x - p.core.x) > 40), 'phone hubs sit on the two sides, none at the poles');
});

test('branch scene puts the open folder level with the core and hides far hubs', () => {
  const s = branchScene(11, 4, 700, 800, false);
  assert.equal(Math.round(s.hubs[4].y), Math.round(s.core.y));
  assert.ok(s.hubs[4].x > s.core.x);
  assert.ok(s.hubs[4].x < 700);
  assert.equal(s.hubs[4].a, 1);
  const ys = s.hubs.filter(h => h.a > 0).map(h => h.y).sort((p, q) => p - q);
  assert.ok(ys.every((y, i) => i === 0 || y - ys[i - 1] >= 30), 'even vertical spacing');
  const wide = branchScene(11, 4, 1120, 900, false);
  assert.ok(Math.abs(1120 - wide.hubs[4].x - BRANCH_REACH) < 1, 'wide screens: the open folder hugs the panels, fibres stay short');
  assert.ok(wide.core.x > 80 && wide.core.x < wide.hubs[4].x);
  const narrow = branchScene(11, 4, 420, 800, false);
  assert.ok(narrow.core.x >= 80 && narrow.hubs[4].x > narrow.core.x, 'narrow scenes keep the core on screen');
  const phone = branchScene(11, 2, 390, 300, true);
  assert.equal(phone.hubs.filter(h => h.a > 0).length, 1);
});

test('character count follows Chinese reading: CJK characters plus Latin words', () => {
  assert.equal(countChars('---\ntitle: x\n---\n# 标题\n你好 world 2026\n```\ncode here\n```'), 6);
  assert.equal(excerpt('---\na: 1\n---\n# Head\nSee [[Note|别名]] and **bold**'), 'Head See 别名 and bold');
  assert.equal(formatSize(512), '512 B');
  assert.equal(formatSize(2048), '2.0 KB');
});
