import { fromHub } from './hub';

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const spring = (t: number) => {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const z = .74, w = Math.log(500) / z, d = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * t) * (Math.cos(d * t) + z * w / d * Math.sin(d * t));
};

/** The same contract as the existing theme/note bridge; never accept another frame. */
export function onHubEnter(fn: () => void): () => void {
  const listener = (e: MessageEvent) => {
    if (fromHub(e) && e.data?.source === 'hub' && e.data?.type === 'enter') fn();
  };
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}
