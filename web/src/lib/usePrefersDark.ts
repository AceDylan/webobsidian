import { useEffect, useState } from 'react';
import { hubTheme, onHubTheme, type HubTheme } from './hubTheme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

/** Reactive Bookmark Hub theme for this tab (framed only), else null — see hubTheme.ts. */
export function useHubTheme(): HubTheme | null {
  const [hub, setHub] = useState<HubTheme | null>(() => hubTheme());
  useEffect(() => onHubTheme(setHub), []);
  return hub;
}

/**
 * Reactive `true` when "system" should be dark: the device's preference, or —
 * inside the Bookmark Hub's frame — the Hub's own theme (see hubTheme.ts; a
 * cross-origin frame's prefers-color-scheme does not follow its frame element).
 */
export function usePrefersDark(hub: HubTheme | null): boolean {
  const [dark, setDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(DARK_QUERY).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(DARK_QUERY);
    const onChange = () => setDark(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return hub ? hub !== 'light' : dark;
}
