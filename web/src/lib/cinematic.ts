/**
 * Cinematic layer (PRD FR-16): when it is on, when the boot title card plays, and the
 * decoding text it shows. Pure helpers; the DOM side lives in components/CinematicLayer.
 */
import type { TreeNode } from './api';

export type Effects = 'cinematic' | 'calm';

/** Themes dark enough to carry the layer: Neural and Halo's night. */
export function cinematicOn(themeClass: string, effects: Effects, reduced: boolean): boolean {
  return effects === 'cinematic' && !reduced && themeClass.includes('theme-dark') && /\b(neural|halo)-theme\b/.test(themeClass);
}

export const BOOT_KEY = 'webobsidian.bootAt';
export const BOOT_EVERY = 6 * 3600 * 1000;

/** The title card plays at most once per 6 hours per browser, and never inside the Hub's frame. */
export function shouldBoot(now: number, last: number | null, framed: boolean): boolean {
  if (framed) return false;
  return last === null || !Number.isFinite(last) || now - last >= BOOT_EVERY || last > now;
}

const GLYPHS = '01<>/\\|=+*#%ΣΔΛΞΨΩ░▒▓';

/** `target` decoding from noise: characters lock left to right as `p` goes 0 → 1. Spaces and `·` stay put. */
export function decode(target: string, p: number, seed = 0): string {
  const chars = [...target];
  const locked = Math.floor(Math.max(0, Math.min(1, p)) * chars.length);
  return chars
    .map((c, i) => (i < locked || c === ' ' || c === '·' ? c : GLYPHS[(i * 7 + seed * 13 + c.charCodeAt(0)) % GLYPHS.length]))
    .join('');
}

/** Real numbers for the title card: notes (Markdown files) and sectors — top-level folders,
 *  plus the root itself when notes sit there (as the galaxy shows 「根目录」). */
export function vaultTelemetry(tree: TreeNode | null): { notes: number; folders: number } {
  if (!tree) return { notes: 0, folders: 0 };
  let notes = 0;
  const walk = (n: TreeNode) => {
    if (n.type === 'file') { if (/\.(md|markdown)$/i.test(n.name)) notes++; return; }
    n.children?.forEach(walk);
  };
  walk(tree);
  const top = tree.children ?? [];
  const folders = top.filter((c) => c.type === 'folder' && !c.name.startsWith('.')).length
    + (top.some((c) => c.type === 'file' && /\.(md|markdown)$/i.test(c.name)) ? 1 : 0);
  return { notes, folders };
}
