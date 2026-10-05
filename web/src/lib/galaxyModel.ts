/**
 * Galaxy (星图) model and layout — pure functions, no DOM. The galaxy groups the vault by
 * top-level folder, so it reads well even when a vault has few wikilinks (PRD 2.0).
 * Visual reference: Neural Vault (github.com/useroneoneone/neural-vault); no code reused.
 */
import type { TreeNode } from './api';

export interface RawGraph {
  nodes: { id: string; label: string; kind: 'note' | 'attachment' | 'unresolved'; tags?: string[] }[];
  edges: { source: string; target: string }[];
}
export interface GalaxyNote {
  id: string;
  label: string;
  folder: string; // key of the folder hub it belongs to
  tags: string[];
  mtime: number;
  out: string[]; // resolved notes this note links to
  in: string[]; // notes linking here
}
export interface GalaxyFolder {
  key: string;
  name: string; // '' = vault root, shown as t('Root') by the view
  color: string;
  notes: GalaxyNote[]; // newest first
  updated: number; // newest mtime in the folder (0 when empty)
  members: string[]; // real folder names (more than one only for the merged 「其他」 hub)
}
export interface GalaxyLink { a: string; b: string; mutual: boolean }
export interface Galaxy { folders: GalaxyFolder[]; notes: Map<string, GalaxyNote>; links: GalaxyLink[] }

export const ROOT_KEY = '';
export const OTHER_KEY = '\u0000other';
export const MAX_HUBS = 18;

/** Muted spectrum that sits on ink black: ion blue → teal → green → amber → rose → violet. */
export const PALETTE = ['#9db7ff', '#7fd6c2', '#a6e3a1', '#f2c46d', '#f4a27f', '#f5a3c7', '#c3a6ff', '#7dd8f0', '#e3d58a', '#b8c4d9'];
const ROOT_COLOR = '#d4d8e2';

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

/** Stable colour per folder name: the same folder keeps its colour when others come and go. */
export function folderColors(names: string[]): Map<string, string> {
  const out = new Map<string, string>();
  const used = new Set<number>();
  for (const name of [...names].sort()) {
    if (name === ROOT_KEY) { out.set(name, ROOT_COLOR); continue; }
    let i = hash(name) % PALETTE.length;
    for (let k = 0; k < PALETTE.length && used.has(i); k++) i = (i + 1) % PALETTE.length;
    used.add(i);
    if (used.size === PALETTE.length) used.clear();
    out.set(name, PALETTE[i]);
  }
  return out;
}

const topFolder = (id: string) => (id.includes('/') ? id.split('/')[0] : ROOT_KEY);

function fileTimes(tree: TreeNode | null): Map<string, number> {
  const out = new Map<string, number>();
  const walk = (n: TreeNode) => {
    if (n.type === 'file') out.set(n.path, n.mtime ?? 0);
    n.children?.forEach(walk);
  };
  if (tree) walk(tree);
  return out;
}

/** Folders and notes for the galaxy. Empty top-level folders get a hub too; hidden ones never. */
export function buildGalaxy(raw: RawGraph, tree: TreeNode | null, maxHubs = MAX_HUBS): Galaxy {
  const times = fileTimes(tree);
  const notes = new Map<string, GalaxyNote>();
  for (const n of raw.nodes) {
    if (n.kind !== 'note') continue;
    notes.set(n.id, { id: n.id, label: n.label, folder: topFolder(n.id), tags: n.tags ?? [], mtime: times.get(n.id) ?? 0, out: [], in: [] });
  }
  const pairs = new Set<string>();
  for (const e of raw.edges) {
    const a = notes.get(e.source), b = notes.get(e.target);
    if (!a || !b || a === b || pairs.has(a.id + '\n' + b.id)) continue;
    pairs.add(a.id + '\n' + b.id);
    a.out.push(b.id); b.in.push(a.id);
  }
  const links: GalaxyLink[] = [];
  for (const key of pairs) {
    const [a, b] = key.split('\n');
    const mutual = pairs.has(b + '\n' + a);
    if (!mutual || a < b) links.push({ a, b, mutual });
  }

  const byName = new Map<string, GalaxyNote[]>();
  for (const child of tree?.children ?? []) {
    if (child.type === 'folder' && !child.name.startsWith('.')) byName.set(child.name, []);
  }
  for (const n of notes.values()) {
    if (!byName.has(n.folder)) byName.set(n.folder, []);
    byName.get(n.folder)!.push(n);
  }
  const colors = folderColors([...byName.keys()]);
  let folders: GalaxyFolder[] = [...byName].map(([name, list]) => ({
    key: name, name, color: colors.get(name)!, members: [name],
    notes: list.sort((x, y) => y.mtime - x.mtime || x.label.localeCompare(y.label)),
    updated: list[0]?.mtime ?? 0,
  }));
  folders.sort((x, y) => y.notes.length - x.notes.length || Number(x.key === ROOT_KEY) - Number(y.key === ROOT_KEY) || x.name.localeCompare(y.name));
  if (folders.length > maxHubs) {
    const rest = folders.slice(maxHubs - 1);
    const merged = rest.flatMap(f => f.notes).sort((x, y) => y.mtime - x.mtime);
    for (const n of merged) n.folder = OTHER_KEY;
    folders = [...folders.slice(0, maxHubs - 1), {
      key: OTHER_KEY, name: OTHER_KEY, color: '#b8c4d9', notes: merged,
      updated: merged[0]?.mtime ?? 0, members: rest.map(f => f.name),
    }];
  }
  return { folders, notes, links };
}

export interface Point { x: number; y: number }
export interface Scene { core: Point & { r: number }; hubs: (Point & { s: number; a: number })[]; hubR: number; compact: boolean; cardSide: 'below' | 'right' }

/** Overview: core in the middle, hubs round an ellipse starting at 12 o'clock, clockwise. */
export function galaxyScene(n: number, w: number, h: number, phone: boolean): Scene {
  const top = phone ? 64 : 64, bottom = phone ? 84 : 92, card = phone ? 26 : 66;
  const hubR = phone ? 13 : 22;
  const cy = top + (h - top - bottom - card) / 2 + hubR * 0.6;
  const ry = Math.max(40, Math.min(h * 0.4, cy - top - hubR * 1.4, h - bottom - card - hubR - cy));
  const rx = Math.max(60, Math.min(w * 0.38, w / 2 - (phone ? 72 : 80)));
  const core = { x: w / 2, y: cy, r: Math.max(24, Math.min(rx, ry) * (phone ? 0.4 : 0.36)) };
  // Phone: two side arcs, so chips never meet at the poles of a narrow ellipse.
  const side = Math.ceil(n / 2);
  const hubs = Array.from({ length: n }, (_, i) => {
    if (phone) {
      const k = i >> 1, f = side === 1 ? 0.5 : k / (side - 1), th = (-70 + f * 140) * Math.PI / 180;
      return { x: core.x + (i % 2 ? -1 : 1) * Math.cos(th) * rx, y: core.y + Math.sin(th) * ry, s: 1, a: 1 };
    }
    const a = -Math.PI / 2 + (i / Math.max(1, n)) * Math.PI * 2;
    return { x: core.x + Math.cos(a) * rx, y: core.y + Math.sin(a) * ry, s: 1, a: 1 };
  });
  const perimeter = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
  return { core, hubs, hubR, compact: phone || perimeter / Math.max(1, n) < 150, cardSide: 'below' };
}

/**
 * One folder open: the scene moves into `sceneW` (left of the panels). Desktop: core on the
 * left, hubs on a right-facing arc with the selected one level with the core. Phone: the
 * selected hub faces the core across the top strip; the others step back.
 */
export function branchScene(n: number, sel: number, sceneW: number, h: number, phone: boolean): Scene {
  if (phone) {
    const core = { x: sceneW * 0.26, y: h / 2, r: Math.max(18, Math.min(h * 0.3, 44)) };
    const hubs = Array.from({ length: n }, (_, i) => i === sel
      ? { x: sceneW * 0.66, y: h / 2, s: 1.15, a: 1 }
      : { x: core.x, y: core.y, s: 0.3, a: 0 });
    return { core, hubs, hubR: 13, compact: true, cardSide: 'right' };
  }
  const core = { x: Math.max(80, sceneW * 0.16), y: h / 2, r: Math.max(30, Math.min(sceneW * 0.09, h * 0.13)) };
  // Hubs on a ")" curve with even vertical spacing, the open folder level with the core.
  const Rx = Math.max(110, Math.min(sceneW * 0.38, 420));
  const dy = Math.max(30, Math.min(58, (h - 150) / Math.max(1, n - 1)));
  const Ry = Math.max(120, dy * (n / 2 + 0.6));
  const hubs = Array.from({ length: n }, (_, i) => {
    let d = i - sel;
    if (d > n / 2) d -= n;
    if (d < -n / 2) d += n;
    const y = d * dy, far = Math.abs(y) > h / 2 - 50;
    return { x: core.x + Rx * Math.sqrt(Math.max(0, 1 - (y / Ry) ** 2)) * (d === 0 ? 1 : 0.88), y: core.y + y, s: d === 0 ? 1.25 : 0.72, a: far ? 0 : d === 0 ? 1 : 0.55 };
  });
  return { core, hubs, hubR: 22, compact: false, cardSide: 'right' };
}

/** Control points for the arc between the core and a hub; bend alternates per hub. */
export function arcControls(a: Point, b: Point, bend: number): [Point, Point] {
  const dx = b.x - a.x, dy = b.y - a.y;
  return [
    { x: a.x + dx * 0.33 - dy * bend, y: a.y + dy * 0.33 + dx * bend },
    { x: a.x + dx * 0.72 - dy * bend * 0.6, y: a.y + dy * 0.72 + dx * bend * 0.6 },
  ];
}

export function cubicAt(a: Point, c1: Point, c2: Point, b: Point, t: number, out: Point = { x: 0, y: 0 }): Point {
  const u = 1 - t, k0 = u * u * u, k1 = 3 * u * u * t, k2 = 3 * u * t * t, k3 = t * t * t;
  out.x = k0 * a.x + k1 * c1.x + k2 * c2.x + k3 * b.x;
  out.y = k0 * a.y + k1 * c1.y + k2 * c2.y + k3 * b.y;
  return out;
}

const CJK = /[㐀-鿿豈-﫿぀-ヿ가-힯]/g;
/** Characters as a Chinese reader counts them: each CJK character, plus each Latin word or number. */
export function countChars(markdown: string): number {
  const text = markdown.replace(/^---[\s\S]*?---\s*/, '').replace(/```[\s\S]*?```/g, ' ').replace(/[#>*_`~\-|[\]()!]/g, ' ');
  const cjk = text.match(CJK)?.length ?? 0;
  const words = text.replace(CJK, ' ').match(/[A-Za-z0-9][A-Za-z0-9'.]*/g)?.length ?? 0;
  return cjk + words;
}

/** Plain-text excerpt for the detail card. */
export function excerpt(markdown: string, max = 360): string {
  return markdown.replace(/^---[\s\S]*?---\s*/, '').replace(/```[\s\S]*?```/g, ' ').replace(/!?\[\[([^\]|]+)(\|([^\]]+))?\]\]/g, (_, a, __, b) => b || a)
    .replace(/[#*`>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
