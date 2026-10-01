// Bookmark Hub embed (server/src/services/hubsso.ts). The Hub shows this app in a
// frame and signs its unlocked administrator in: the frame first loads a page of the
// Hub's own (/vault/open), which posts a single-use ticket to /auth/hub/sso. No
// ticket or Hub credential ever reaches this code — it only knows the Hub's origin.
//
// When a Hub session runs out while the frame is open, the frame goes back through
// the Hub the same way (re-entry). The Hub refuses if it has been locked meanwhile.
import type { HubStatus } from './api';

const REENTRY_KEY = 'webobsidian.hubReentryAt';
// At most one automatic re-entry per minute: if the cookie cannot stick (blocked
// by the browser, proxy misconfigured) the frame must not bounce forever.
const REENTRY_GUARD_MS = 60_000;

let hub: HubStatus | null = null;
let hubSession = false;

export function rememberHub(status: HubStatus | null | undefined): void {
  hub = status && typeof status.url === 'string' && status.url ? status : null;
}

export function knownHub(): HubStatus | null {
  return hub;
}

/** This browser was signed in by the Hub (the Hub's lock signs it out). */
export function setHubSession(value: boolean): void {
  hubSession = value;
}

export function isHubSession(): boolean {
  return hubSession;
}

/** Framed at all means framed by the Hub: frame-ancestors allows no one else. */
export function isFramed(): boolean {
  try {
    return window.top !== window.self;
  } catch {
    return true;
  }
}

/** The framing Hub's origin, or '' when no Hub is configured. */
export function hubOrigin(): string {
  try {
    return hub ? new URL(hub.url).origin : '';
  } catch {
    return '';
  }
}

/** A message really from the framing Hub: our parent window, on the Hub's origin. */
export function fromHub(event: { source: unknown; origin: string }): boolean {
  if (!isFramed() || event.source !== window.parent) return false;
  const origin = hubOrigin();
  return Boolean(origin) && event.origin === origin;
}

export function currentPath(): string {
  return `${location.pathname}${location.search}` || '/';
}

/** The Hub's page that signs this browser in and lands on `to` (a path on this site). */
export function hubEntryUrl(hubUrl: string, to: string = currentPath()): string {
  return `${hubUrl}/vault/open?to=${encodeURIComponent(to)}`;
}

/**
 * Inside the Hub's frame, go back through the Hub to get a fresh session. Returns
 * true when navigating away (the caller should render nothing more).
 */
export function reenterThroughHub(): boolean {
  if (!hub?.sso || !isFramed()) return false;
  const now = Date.now();
  try {
    const last = Number(sessionStorage.getItem(REENTRY_KEY) || 0);
    if (now - last < REENTRY_GUARD_MS) return false;
    sessionStorage.setItem(REENTRY_KEY, String(now));
  } catch {
    return false;
  }
  location.replace(hubEntryUrl(hub.url));
  return true;
}
