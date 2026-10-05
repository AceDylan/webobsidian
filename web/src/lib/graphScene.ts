import { t } from './i18n';

export type SceneKind = 'note' | 'attachment' | 'unresolved' | 'tag' | 'folder' | 'vault';
export interface SceneNode { id: string; label: string; kind: SceneKind; tags: string[]; deg: number; count?: number }
export interface SceneEdge { source: string; target: string; hierarchy?: boolean }
export const VAULT_ID = '\u0000halo:vault';
export const folderId = (folder: string) => '\u0000halo:folder:' + folder;
export const folderOf = (id: string) => id.includes('/') ? id.split('/')[0] : '';

/** Presentation-only aggregation. Raw note identities and backlinks are never changed. */
export function aggregateGraph(nodes: SceneNode[], edges: SceneEdge[], collapsed: boolean, expanded: Set<string>) {
  const notes = nodes.filter(n => n.kind === 'note');
  const folders = new Map<string, number>();
  for (const n of notes) { const f = folderOf(n.id); folders.set(f, (folders.get(f) ?? 0) + 1); }
  const visible = nodes.filter(n => n.kind !== 'note' || !collapsed || expanded.has(folderOf(n.id)));
  const result: SceneNode[] = [
    { id: VAULT_ID, label: t('Vault'), kind: 'vault', tags: [], deg: notes.length, count: notes.length },
    ...[...folders].map(([f, count]) => ({ id: folderId(f), label: f || t('Root'), kind: 'folder' as const, tags: [], deg: count, count })),
    ...visible,
  ];
  const ids = new Set(result.map(n => n.id));
  const identity = (id: string) => ids.has(id) ? id : folderId(folderOf(id));
  const links: SceneEdge[] = [];
  const seen = new Set<string>();
  for (const e of edges) {
    const source = identity(e.source), target = identity(e.target);
    const key = JSON.stringify([source, target]);
    if (source !== target && ids.has(source) && ids.has(target) && !seen.has(key)) {
      links.push({ source, target }); seen.add(key);
    }
  }
  for (const f of folders.keys()) links.push({ source: VAULT_ID, target: folderId(f), hierarchy: true });
  for (const n of visible.filter(n => n.kind === 'note')) links.push({ source: folderId(folderOf(n.id)), target: n.id, hierarchy: true });
  return { nodes: result, edges: links };
}
