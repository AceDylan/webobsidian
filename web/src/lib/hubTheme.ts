// The Bookmark Hub's dark / light, inside its frame.
//
// The Hub keeps its own theme (dark unless changed), while this app follows the
// device by default ("system"): on a light device the dark Hub showed white notes.
// A cross-origin frame cannot see the Hub's choice (the frame element's
// color-scheme does not reach our prefers-color-scheme), so the Hub tells us: in
// the address when it opens the frame (#hub_theme=dark, carried over the sign-in
// redirect), kept for this tab; and by a message when it changes its theme later.
// Framed, "system" then means the Hub's theme; an explicit theme still wins.
import { isFramed, knownHub } from './hub';

export type HubTheme = 'dark' | 'light';

const KEY = 'webobsidian.hubTheme';
const PARAM = 'hub_theme';

const asTheme = (value: unknown): HubTheme | null =>
  value === 'dark' || value === 'light' ? value : null;

/** The Hub's theme for this tab (framed only), else null. */
export function hubTheme(): HubTheme | null {
  if (!isFramed()) return null;
  try {
    return asTheme(sessionStorage.getItem(KEY));
  } catch {
    return null;
  }
}

/**
 * Reads #hub_theme= from the address, keeps it for this tab and removes it from
 * the address (other fragment parameters stay). Call once, before anything reads
 * the address. Returns the Hub's theme for this tab.
 */
export function takeHubTheme(): HubTheme | null {
  if (!isFramed()) return null;
  try {
    const params = new URLSearchParams(location.hash.slice(1));
    if (params.has(PARAM)) {
      const given = asTheme(params.get(PARAM));
      params.delete(PARAM);
      const rest = params.toString();
      history.replaceState(history.state, '', `${location.pathname}${location.search}${rest ? `#${rest}` : ''}`);
      if (given) sessionStorage.setItem(KEY, given);
    }
  } catch {
    /* no storage: follow the device */
  }
  return hubTheme();
}

type HubMessage = { source: unknown; origin: string; data: unknown };

/** The theme in a message from the framing Hub (our parent, on the Hub's origin), else null. */
export function acceptHubTheme(event: HubMessage): HubTheme | null {
  if (!isFramed() || event.source !== window.parent) return null;
  const hub = knownHub();
  let origin = '';
  try {
    origin = hub ? new URL(hub.url).origin : '';
  } catch {
    origin = '';
  }
  if (!origin || event.origin !== origin) return null;
  const data = event.data as { source?: unknown; type?: unknown; theme?: unknown } | null;
  if (!data || typeof data !== 'object' || data.source !== 'hub' || data.type !== 'theme') return null;
  const theme = asTheme(data.theme);
  if (theme) {
    try {
      sessionStorage.setItem(KEY, theme);
    } catch {
      /* this page still follows it */
    }
  }
  return theme;
}

/** Calls `fn` with each theme the Hub sends from now on. Returns the unsubscribe. */
export function onHubTheme(fn: (theme: HubTheme) => void): () => void {
  const onMessage = (event: MessageEvent) => {
    const theme = acceptHubTheme(event);
    if (theme) fn(theme);
  };
  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
}
