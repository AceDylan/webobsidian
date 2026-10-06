import { useEffect, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { isFramed } from '../lib/hub';
import { onHubEnter } from '../lib/haloMotion';
import { BOOT_KEY, decode, shouldBoot, vaultTelemetry } from '../lib/cinematic';
import { t } from '../lib/i18n';

/** Live `prefers-reduced-motion`, so turning it on mid-visit drops the layer at once. */
export function useReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

const TITLE = 'NEURAL · VAULT';

/**
 * The cinematic layer (PRD FR-16): boot title card, Hub warp flash and the scan that
 * materializes the main pane when the active note changes. Everything here is
 * decoration over the app — `pointer-events: none`, `aria-hidden` — and only the pane
 * wrapper is animated, never the editor or preview inside it.
 */
export default function CinematicLayer({ on, ready }: { on: boolean; ready: boolean }) {
  const [boot, setBoot] = useState<'play' | 'skip' | null>(null);
  const [warp, setWarp] = useState(0);
  const [scan, setScan] = useState<{ n: number; box: { top: number; left: number; width: number; height: number } } | null>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const decided = useRef(false);
  const tree = useStore((s) => s.tree);
  const activePath = useStore((s) => s.activePath);
  const { notes, folders } = vaultTelemetry(tree);

  // Boot title card: decided once, after the settings said whether effects are on.
  useEffect(() => {
    if (!ready || decided.current) return;
    decided.current = true;
    if (!on || document.hidden) return;
    let last: number | null = null;
    try { const v = localStorage.getItem(BOOT_KEY); last = v === null ? null : Number(v); } catch { /* private mode */ }
    if (!shouldBoot(Date.now(), last, isFramed())) return;
    try { localStorage.setItem(BOOT_KEY, String(Date.now())); } catch { /* private mode */ }
    setBoot('play');
  }, [on, ready]);

  useEffect(() => {
    if (!boot) return;
    if (boot === 'skip') {
      const id = window.setTimeout(() => { setBoot(null); window.dispatchEvent(new Event('wo-fx-reveal')); }, 220);
      return () => window.clearTimeout(id);
    }
    const phone = window.matchMedia('(max-width: 768px)').matches;
    const end = window.setTimeout(() => setBoot(null), phone ? 1650 : 2150);
    // The shutters open here: the galaxy's warp-in starts with the reveal.
    const reveal = window.setTimeout(() => window.dispatchEvent(new Event('wo-fx-reveal')), phone ? 950 : 1300);
    const skip = () => setBoot('skip');
    window.addEventListener('keydown', skip, { once: true });
    window.addEventListener('pointerdown', skip, { once: true });
    // Decode the title from noise; written straight to the node (no React render per frame).
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = (now - t0 - 220) / 900;
      if (titleRef.current) titleRef.current.textContent = decode(TITLE, p, Math.floor(now / 60));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      window.clearTimeout(end);
      window.clearTimeout(reveal);
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', skip);
      window.removeEventListener('pointerdown', skip);
    };
  }, [boot]);

  // The Hub switched to this tab: a short warp flash instead of the full title card.
  useEffect(() => {
    if (!on) return;
    return onHubEnter(() => { if (!document.hidden) setWarp((n) => n + 1); });
  }, [on]);
  useEffect(() => {
    if (!warp) return;
    const id = window.setTimeout(() => setWarp(0), 900);
    return () => window.clearTimeout(id);
  }, [warp]);

  // Active note / view changed: scan the main pane in (skipped for the first view and during the title card).
  const lastPath = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const prev = lastPath.current;
    lastPath.current = activePath;
    if (!on || prev === undefined || prev === activePath || !activePath || boot) return;
    const pane = document.querySelector<HTMLElement>('.workspace .main-pane');
    if (!pane) return;
    pane.classList.remove('fx-materialize');
    void pane.offsetWidth;
    pane.classList.add('fx-materialize');
    const done = () => pane.classList.remove('fx-materialize');
    pane.addEventListener('animationend', done, { once: true });
    const r = pane.getBoundingClientRect();
    setScan((s) => ({ n: (s?.n ?? 0) + 1, box: { top: r.top, left: r.left, width: r.width, height: r.height } }));
    const id = window.setTimeout(() => { done(); setScan(null); }, 760);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePath, on]);

  if (!on && !boot) return null;
  return (
    <>
      {boot && (
        <div className={`fx-boot${boot === 'skip' ? ' is-skip' : ''}`} aria-hidden="true" data-testid="fx-boot">
          <div className="fx-boot-shutter is-top" />
          <div className="fx-boot-shutter is-bottom" />
          <div className="fx-boot-line" />
          <div className="fx-boot-core">
            <div className="fx-boot-ring" />
            <div className="fx-boot-kicker">WEBOBSIDIAN // {t('Knowledge vault')}</div>
            <div className="fx-boot-title" ref={titleRef}>{decode(TITLE, 0)}</div>
            <div className="fx-boot-meta">
              {tree ? t('{notes} notes · {folders} sectors', { notes: String(notes), folders: String(folders) }) : t('Linking vault…')}
              <span>LINK ESTABLISHED</span>
            </div>
            <div className="fx-boot-bar"><i /></div>
          </div>
          <i className="fx-corner is-tl" /><i className="fx-corner is-tr" /><i className="fx-corner is-bl" /><i className="fx-corner is-br" />
        </div>
      )}
      {warp > 0 && <div key={warp} className="fx-warp" aria-hidden="true" />}
      {scan && (
        <div key={scan.n} className="fx-scan" aria-hidden="true" style={scan.box}>
          <i />
        </div>
      )}
    </>
  );
}
