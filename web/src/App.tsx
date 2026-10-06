import { useEffect, useState } from 'react';
import { api, ApiError, setUnauthorizedHandler } from './lib/api';
import { useStore, GRAPH_PATH } from './lib/store';
import Login from './components/Login';
import ForceChangePassword from './components/ForceChangePassword';
import Ribbon from './components/Ribbon';
import Sidebar from './components/Sidebar';
import RightSidebar from './components/RightSidebar';
import Workspace from './components/Workspace';
import CommandPalette from './components/CommandPalette';
import Settings from './components/Settings';
import ShareDialog from './components/ShareDialog';
import VersionHistory from './components/VersionHistory';
import TrashView from './components/TrashView';
import ContextMenu from './components/ContextMenu';
import FolderPicker from './components/FolderPicker';
import { loadPlugins } from './lib/plugins';
import { initUrlSync } from './lib/urlsync';
import { useIsMobile } from './lib/useIsMobile';
import { reenterThroughHub, rememberHub, setHubSession, isFramed } from './lib/hub';
import { onHubOpenNote } from './lib/hubNote';
import { onHubEnter } from './lib/haloMotion';
import { useHubTheme, usePrefersDark } from './lib/usePrefersDark';
import { themePrefInHub } from './lib/hubTheme';

export default function App() {
  const authed = useStore((s) => s.authed);
  const setAuthed = useStore((s) => s.setAuthed);
  const mustChangePassword = useStore((s) => s.mustChangePassword);
  const setMustChangePassword = useStore((s) => s.setMustChangePassword);
  const loadTree = useStore((s) => s.loadTree);
  const leftOpen = useStore((s) => s.leftOpen);
  const rightOpen = useStore((s) => s.rightOpen);
  const mobileDrawer = useStore((s) => s.mobileDrawer);
  const setMobileDrawer = useStore((s) => s.setMobileDrawer);
  const activePath = useStore((s) => s.activePath);
  const isMobile = useIsMobile();
  const setPalette = useStore((s) => s.setPalette);
  const save = useStore((s) => s.save);
  const toast = useStore((s) => s.toast);
  const [checking, setChecking] = useState(true);
  // Saved choice ('system' follows the device) plus the Ribbon's toggle for this visit.
  const [savedThemePref, setThemePref] = useState<string>('neural');
  const [themeOverride, setThemeOverride] = useState<'theme-dark' | 'theme-light' | null>(null);
  const hubTheme = useHubTheme();
  const prefersDark = usePrefersDark(hubTheme);
  const themePref = themePrefInHub(savedThemePref, hubTheme);
  const theme =
    themeOverride ??
    (themePref === 'neural' || themePref === 'obsidian-dark' || themePref === 'halo-dark' || ((themePref === 'system' || themePref === 'halo-system') && prefersDark) ? 'theme-dark' : 'theme-light');

  const halo = themePref.startsWith('halo-') || (themePref === 'system' && isFramed());
  const themeClass = theme + (halo ? ' halo-theme' : '') + (themePref === 'neural' && theme === 'theme-dark' ? ' neural-theme' : '');

  useEffect(() => {
    const pause = () => document.documentElement.classList.toggle('motion-paused', document.hidden);
    pause();
    document.addEventListener('visibilitychange', pause);
    const stop = onHubEnter(() => {
      const shell = document.querySelector('.app');
      if (!shell || document.hidden) return;
      shell.classList.remove('halo-enter');
      void (shell as HTMLElement).offsetWidth;
      shell.classList.add('halo-enter');
    });
    return () => { document.removeEventListener('visibilitychange', pause); stop(); };
  }, []);

  useEffect(() => {
    let leaving = false;
    // Which Bookmark Hub may frame us (null when none). Behind a proxy that keeps its
    // own login this 401s until signed in — nothing to re-enter through then anyway.
    api
      .authStatus()
      .then((s) => rememberHub(s.hub))
      .catch(() => {})
      .then(() => api.me())
      .then((r) => {
        setHubSession(Boolean(r.hub));
        setMustChangePassword(Boolean(r.mustChangePassword));
        setAuthed(true);
      })
      .catch((e) => {
        if (!(e instanceof ApiError && e.status === 401)) console.error(e);
        // Inside the Hub's frame without a session: let the Hub sign us in rather
        // than showing a second login (the Hub refuses if it is locked).
        else leaving = reenterThroughHub();
      })
      .finally(() => {
        if (!leaving) setChecking(false);
      });
  }, [setAuthed, setMustChangePassword]);

  // A Hub session ran out while the frame was open: go back through the Hub.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (useStore.getState().authed) reenterThroughHub();
    });
    return () => setUnauthorizedHandler(undefined);
  }, []);

  useEffect(() => {
    if (!authed) return;
    loadTree();
    // Deep link (/note/<path>) wins over the restored workspace's active note.
    const deepLink = initUrlSync();
    // Inside the Hub's frame, notes the Hub hands over open here once the workspace
    // is restored (earlier, the restore would overwrite them; see hubNote.ts).
    let stopHubNotes: (() => void) | null = null;
    let closed = false;
    useStore
      .getState()
      .loadUiState(deepLink ?? GRAPH_PATH) // restore tabs, then land on the graph or explicit note
      .catch(() => {})
      .then(() => {
        if (!closed) stopHubNotes = onHubOpenNote((path) => useStore.getState().openFile(path));
      });
    api
      .getSettings()
      .then((s) => setThemePref(s?.ui?.theme || 'neural'))
      .catch(() => {});
    useStore.getState().loadShares(); // badge shared notes in the file tree
    loadPlugins().catch(() => {});
    // websocket live updates
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    let treeTimer: number | undefined;
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'fs') {
          // coalesce bursts of fs events into a single tree refresh
          window.clearTimeout(treeTimer);
          treeTimer = window.setTimeout(() => loadTree(), 800);
        } else if (msg.type === 'uistate') {
          // another tab/device changed the workspace → sync live
          useStore.getState().applyRemoteState(msg.state, msg.originId);
        }
      } catch {
        /* ignore */
      }
    };
    return () => {
      closed = true;
      stopHubNotes?.();
      window.clearTimeout(treeTimer);
      ws.close();
    };
  }, [authed, loadTree]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      const s = useStore.getState();
      if (k === 'p') { e.preventDefault(); setPalette(true, e.shiftKey ? 'commands' : 'commands'); }
      else if (k === 'o') { e.preventDefault(); setPalette(true, 'files'); }
      else if (k === 's') { e.preventDefault(); save(); }
      else if (k === 'n') { e.preventDefault(); s.newNote(); }
      else if (k === 'e') { e.preventDefault(); s.setViewMode(s.viewMode === 'reading' ? 'live' : 'reading'); }
      else if (k === 'f' && e.shiftKey) { e.preventDefault(); s.setLeftPanel('search'); }
      else if (k === '\\') { e.preventDefault(); s.toggleLeft(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setPalette, save]);

  // Mobile: close the overlay drawer once a note is opened (tap note → read it).
  useEffect(() => {
    if (isMobile && useStore.getState().mobileDrawer) setMobileDrawer(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePath]);

  // Mobile: edge-swipe to open/close the drawers (Obsidian Mobile gesture).
  useEffect(() => {
    if (!isMobile) return;
    let sx = 0, sy = 0, fromLeftEdge = false, fromRightEdge = false, tracking = false;
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      sx = t.clientX; sy = t.clientY;
      fromLeftEdge = sx <= 28;
      fromRightEdge = sx >= window.innerWidth - 28;
      tracking = true;
    };
    const onEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) < 45 || Math.abs(dy) > Math.abs(dx)) return; // mostly-horizontal only
      const open = useStore.getState().mobileDrawer;
      if (dx > 0) {
        if (open === 'right') setMobileDrawer(null);
        else if (fromLeftEdge && !open) setMobileDrawer('left');
      } else {
        if (open === 'left') setMobileDrawer(null);
        else if (fromRightEdge && !open) setMobileDrawer('right');
      }
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchend', onEnd);
    };
  }, [isMobile, setMobileDrawer]);

  if (checking) return <div className={themeClass} style={{ height: '100%' }} />;
  if (!authed) return <div className={themeClass}><Login onAuthed={() => setAuthed(true)} /></div>;
  // Signed in but still on the default password → block the app until it's changed.
  if (mustChangePassword) return <div className={themeClass}><ForceChangePassword /></div>;

  // On mobile the sidebars are overlay drawers (always mounted, slid in/out by
  // CSS), driven by the device-local `mobileDrawer` state — not the persisted
  // leftOpen/rightOpen that sync across desktops.
  const showLeft = isMobile || leftOpen;
  const showRight = isMobile || rightOpen;
  const appCls = [
    'app',
    leftOpen ? '' : 'left-closed',
    rightOpen ? '' : 'right-closed',
    isMobile ? 'mobile' : '',
    isMobile && mobileDrawer === 'left' ? 'drawer-left-open' : '',
    isMobile && mobileDrawer === 'right' ? 'drawer-right-open' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={themeClass}>
      <div className={appCls}>
        <Ribbon onTheme={() => setThemeOverride(theme === 'theme-dark' ? 'theme-light' : 'theme-dark')} />
        {showLeft && <Sidebar />}
        <Workspace />
        {showRight && <RightSidebar />}
        {isMobile && mobileDrawer && (
          <div className="drawer-backdrop" onClick={() => setMobileDrawer(null)} />
        )}
      </div>
      <CommandPalette />
      <Settings />
      <ShareDialog />
      <VersionHistory />
      <TrashView />
      <ContextMenu />
      <FolderPicker />
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
