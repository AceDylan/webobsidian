import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import Icon from './Icon';
import { t } from '../lib/i18n';

export default function StatusBar() {
  const content = useStore((s) => s.content);
  const activePath = useStore((s) => s.activePath);
  const dirty = useStore((s) => s.dirty);
  const loadTree = useStore((s) => s.loadTree);
  const notify = useStore((s) => s.notify);
  const [git, setGit] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);

  const refresh = () => api.gitStatus().then(setGit).catch(() => setGit(null));
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15000);
    return () => clearInterval(id);
  }, []);

  const sync = async () => {
    if (syncing) return;
    setSyncing(true);
    notify(t('Syncing…'));
    try {
      const r = await api.gitSync();
      notify(r.ok ? t('Synced ✓') : `Sync: ${r.log.at(-1)}`);
      await loadTree();
      await refresh();
    } catch (e: any) {
      notify(`Sync failed: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const isText = activePath && /\.(md|markdown|txt)$/i.test(activePath);
  const words = isText ? content.trim().split(/\s+/).filter(Boolean).length : 0;

  // Only WebObsidian's own git sync is shown here. With it off (Settings → Git) the vault
  // may well be backed up by something else — a "no sync" warning would be wrong, and
  // clicking it could only fail.
  const showGit = Boolean(git?.enabled);
  const gitLabel = !git?.isRepo
    ? t('No vault sync')
    : git.clean
      ? `git ${git.branch}${git.ahead ? ` ↑${git.ahead}` : ''}${git.behind ? ` ↓${git.behind}` : ''}`
      : t('{n} unsaved changes', { n: git.modified + git.notAdded });

  return (
    <div className="status-bar">
      {dirty && <span>{t('Saving…')}</span>}
      {isText && <span>{t('{n} words', { n: words })}</span>}
      {isText && <span>{t('{n} characters', { n: content.length })}</span>}
      {showGit && (
        <span className="clickable" title={t('Git sync')} onClick={sync}>
          <Icon name="refresh-cw" size={13} style={syncing ? { animation: 'spin 1s linear infinite' } : undefined} />
          {gitLabel}
        </span>
      )}
    </div>
  );
}
