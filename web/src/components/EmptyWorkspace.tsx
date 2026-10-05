import { useMemo } from 'react';
import { useStore } from '../lib/store';
import { findNode } from '../lib/tree';
import { t } from '../lib/i18n';
import Icon from './Icon';
import ChromeLabel from './ChromeLabel';

/** A root-level note that reads as the vault's home page ("00-主页.md", "Home.md", "首页.md"…). */
const HOME_NOTE = /^(?:0+[-_ .]?)?(?:主页|首页|home|index|readme)\.md$/i;
const RECENT_SHOWN = 6;

function title(path: string): string {
  const name = path.split('/').pop() || path;
  return name.replace(/\.md$/i, '');
}

function folder(path: string): string {
  const i = path.lastIndexOf('/');
  return i > 0 ? path.slice(0, i) : '';
}

/**
 * What an empty workspace offers instead of a dead end: the notes opened last, the vault's
 * home note, and (on a phone, where the file list is a hidden drawer) the way to all notes.
 * No daily-note button here: it creates Daily/<date>.md, which a vault may not use.
 * Opening the Bookmark Hub's 笔记 tab lands here when no tab is open.
 */
export function EmptyWorkspace({ isMobile }: { isMobile: boolean }) {
  const tree = useStore((s) => s.tree);
  const recent = useStore((s) => s.recent);
  const openFile = useStore((s) => s.openFile);
  const openGraph = useStore((s) => s.openGraph);
  const setMobileDrawer = useStore((s) => s.setMobileDrawer);

  const home = useMemo(
    () => (tree?.children ?? []).find((n) => n.type === 'file' && HOME_NOTE.test(n.name))?.path ?? null,
    [tree],
  );
  // Recent notes that still exist (renamed or deleted ones would open an error).
  const notes = useMemo(
    () =>
      recent
        .filter((p) => p !== home && (!tree || findNode(tree, p)?.type === 'file'))
        .slice(0, RECENT_SHOWN),
    [recent, tree, home],
  );

  return (
    <div className="empty-state">
      <div className="empty-launch">
        <div className="neural-launch-kicker">NEURAL / 知识空间</div>
        <div className="big">
          <Icon name="file-text" size={40} />
        </div>
        <p className="empty-launch-title">{t('No note is open')}</p>
        <p className="empty-launch-hint">
          {isMobile ? t('Pick a note below, or open the file list.') : t('Pick a note from the file list, or open one below.')}
        </p>
        <div className="empty-launch-actions">
          <button className="btn" onClick={() => void openGraph()}>
            <Icon name="graph" size={16} /> {t('Open graph')}
          </button>
          {home && (
            <button className="btn secondary" onClick={() => void openFile(home)}>
              {t('Open home note')}
            </button>
          )}
          {isMobile && (
            <button className="btn secondary" onClick={() => setMobileDrawer('left')}>
              {t('Show all notes')}
            </button>
          )}
        </div>
        {notes.length > 0 && (
          <div className="empty-launch-recent">
            <div className="empty-launch-label">{t('Recent notes')}<ChromeLabel english="Recent notes" chinese="最近打开" /></div>
            {notes.map((path) => (
              <button key={path} className="empty-launch-item" onClick={() => void openFile(path)} title={path}>
                <Icon name="file-text" size={15} />
                <span className="empty-launch-name">{title(path)}</span>
                {folder(path) && <span className="empty-launch-folder">{folder(path)}</span>}
              </button>
            ))}
          </div>
        )}
        {!isMobile && <p className="empty-launch-keys">{t('Press ⌘O to find a note, ⌘P for commands.')}</p>}
      </div>
    </div>
  );
}
