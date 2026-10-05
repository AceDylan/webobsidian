import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateGraph, folderId, VAULT_ID, type SceneNode } from '../src/lib/graphScene';
const note = (id: string): SceneNode => ({ id, label: id, kind: 'note', tags: [], deg: 1 });
const nodes = [note('A/one.md'), note('A/two.md'), note('B/three.md'), note('home.md')];
const edges = [{ source: 'A/one.md', target: 'B/three.md' }, { source: 'A/two.md', target: 'B/three.md' }];
test('collapsed scene preserves real folder counts and deduplicates aggregate relations', () => {
  const scene = aggregateGraph(nodes, edges, true, new Set());
  assert.equal(scene.nodes.find(n => n.id === VAULT_ID)?.count, 4);
  assert.equal(scene.nodes.find(n => n.id === folderId('A'))?.count, 2);
  assert.equal(scene.nodes.find(n => n.id === folderId(''))?.count, 1);
  assert.equal(scene.nodes.filter(n => n.kind === 'note').length, 0);
  assert.deepEqual(scene.edges.filter(e => !e.hierarchy), [{ source: folderId('A'), target: folderId('B') }]);
});
test('expanding one folder reveals its notes while backlinks still target collapsed folders', () => {
  const scene = aggregateGraph(nodes, edges, true, new Set(['A']));
  assert.deepEqual(scene.nodes.filter(n => n.kind === 'note').map(n => n.id), ['A/one.md', 'A/two.md']);
  assert.ok(scene.edges.some(e => e.source === 'A/one.md' && e.target === folderId('B')));
  assert.equal(nodes.length, 4); assert.deepEqual(edges[0], { source: 'A/one.md', target: 'B/three.md' });
});
test('expanded scene keeps original backlink identities', () => {
  const scene = aggregateGraph(nodes, edges, false, new Set());
  assert.deepEqual(scene.edges.filter(e => !e.hierarchy), edges);
  assert.equal(scene.nodes.filter(n => n.kind === 'note').length, 4);
});
