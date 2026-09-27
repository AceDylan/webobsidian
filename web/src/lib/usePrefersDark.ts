import { useEffect, useState } from 'react';
import { hubTheme, onHubTheme, type HubTheme } from './hubTheme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

/**
 * Reactive `true` when "system" should be dark: the device's preference, or —
 * inside the Bookmark Hub's frame — the Hub's own theme (see hubTheme.ts; a
 * cross-origin frame's prefers-color-scheme does not follow its frame element).
 */
export function usePrefersDark(): boolean {
  const [dark, setDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(DARK_QUERY).matches,
  );
  const [hub, setHub] = useState<HubTheme | null>(() => hubTheme());
  useEffect(() => {
    const mq = window.matchMedia(DARK_QUERY);
    const onChange = () => setDark(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  useEffect(() => onHubTheme(setHub), []);
  return hub ? hub === 'dark' : dark;
}
