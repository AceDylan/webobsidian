/**
 * Minimal UI translation. The English source string is the key, so an untranslated
 * string simply shows in English: screens are moved over one at a time (PRD 1.7, Phase 29).
 * The locale follows the browser (a Chinese browser gets Chinese); no setting yet.
 */

const ZH: Record<string, string> = {
  // Empty workspace (Workspace.tsx)
  'No note is open': '还没有打开笔记',
  'Recent notes': '最近打开',
  'Open home note': '打开主页',
  'Show all notes': '查看全部笔记',
  'Press ⌘O to find a note, ⌘P for commands.': '按 ⌘O 查找笔记，⌘P 打开命令。',
  'Pick a note from the file list, or open one below.': '从文件列表里选一篇，或者打开下面的笔记。',
  'Pick a note below, or open the file list.': '打开下面的笔记，或者展开文件列表。',
  // Theme (App.tsx, Ribbon.tsx, Settings.tsx)
  'Toggle theme': '切换深浅色',
  'Follow system': '跟随系统',
  'Obsidian Dark': '深色',
  'Obsidian Light': '浅色',
  Theme: '主题',
  Appearance: '外观',
};

export const LOCALE: 'zh' | 'en' =
  typeof navigator !== 'undefined' && /^zh\b/i.test(navigator.language || '') ? 'zh' : 'en';

/** `text` in `locale`; `{name}` placeholders are filled from `vars`. */
export function translate(locale: 'zh' | 'en', text: string, vars?: Record<string, string | number>): string {
  let out = locale === 'zh' ? ZH[text] ?? text : text;
  if (vars) for (const [key, value] of Object.entries(vars)) out = out.split(`{${key}}`).join(String(value));
  return out;
}

/** `text` in the UI language. */
export function t(text: string, vars?: Record<string, string | number>): string {
  return translate(LOCALE, text, vars);
}

if (typeof document !== 'undefined') document.documentElement.lang = LOCALE === 'zh' ? 'zh-CN' : 'en';
