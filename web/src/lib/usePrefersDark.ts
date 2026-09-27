import { useEffect, useState } from 'react';

const DARK_QUERY = '(prefers-color-scheme: dark)';

/** Reactive `true` when the device (or, in an iframe, the frame's `color-scheme`) prefers dark. */
export function usePrefersDark(): boolean {
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
  return dark;
}
