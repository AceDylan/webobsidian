// How much of this frame the on-screen keyboard covers, as measured by the Hub.
//
// On a phone the mobile format toolbar sits on the keyboard by measuring the visual
// viewport (FormatToolbar.tsx). Inside the Hub's frame that measures nothing: the
// keyboard only shrinks the top page's visual viewport, never a frame's, so the
// toolbar stayed under the keyboard. The Hub measures it for us and sends
// {source:'hub', type:'keyboard', covered} (pixels hidden at the bottom of the frame).
import { useEffect, useState } from 'react';
import { fromHub, isFramed } from './hub';

/** The covered height in a message from the framing Hub, else null. */
export function acceptHubKeyboard(event: { source: unknown; origin: string; data: unknown }): number | null {
  if (!fromHub(event)) return null;
  const data = event.data as { source?: unknown; type?: unknown; covered?: unknown } | null;
  if (!data || typeof data !== 'object' || data.source !== 'hub' || data.type !== 'keyboard') return null;
  const covered = data.covered;
  if (typeof covered !== 'number' || !Number.isFinite(covered)) return null;
  return Math.min(Math.max(0, Math.round(covered)), 4000);
}

/** Pixels of this frame the keyboard covers, per the Hub (0 outside a frame). */
export function useHubKeyboard(): number {
  const [covered, setCovered] = useState(0);
  useEffect(() => {
    if (!isFramed()) return;
    const onMessage = (event: MessageEvent) => {
      const next = acceptHubKeyboard(event);
      if (next !== null) setCovered(next);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);
  return covered;
}
