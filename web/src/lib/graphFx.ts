/**
 * Sci-fi effects for the always-night graph: where a light pulse sits on a link, and a
 * deep-space starfield painted on its own canvas behind the Pixi scene. Pure decoration;
 * GraphView turns it off for reduced motion and hidden tabs.
 */

/** Point at `t` (0..1) on a link, using the same gentle bend GraphView draws links with. */
export function linkPoint(ax: number, ay: number, bx: number, by: number, t: number): [number, number] {
  const bend = Math.min(45, Math.hypot(bx - ax, by - ay) * 0.12);
  const c1x = ax + (bx - ax) / 3 - bend, c1y = ay + (by - ay) / 3;
  const c2x = ax + (2 * (bx - ax)) / 3 + bend, c2y = ay + (2 * (by - ay)) / 3;
  const u = 1 - t;
  const x = u * u * u * ax + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * bx;
  const y = u * u * u * ay + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * by;
  return [x, y];
}

/** Where pulse `i` is along its link at `now` ms: staggered by the golden ratio, so they never march in step. */
export const pulseT = (i: number, now: number, periodMs: number) => (((now / periodMs + i * 0.618) % 1) + 1) % 1;

/**
 * Three depths of stars drifting towards the viewer behind the graph. Returns a stop function.
 * Draws one still frame when `still()` is true (reduced motion); never draws while the tab is hidden.
 */
export function mountStarfield(canvas: HTMLCanvasElement, still: () => boolean): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};
  const phone = window.matchMedia('(max-width: 768px)').matches;
  const TINTS = ['#ffffff', '#bfe9ff', '#9fd8ff', '#d7c8ff', '#ffe6c4'];
  type Star = { x: number; y: number; z: number; tint: string; ph: number };
  const spawn = (far: boolean): Star => ({
    x: (Math.random() * 2 - 1) * 1.2, y: (Math.random() * 2 - 1) * 1.2,
    z: far ? 1 : 0.15 + Math.random() * 0.85,
    tint: TINTS[(Math.random() * TINTS.length) | 0], ph: Math.random() * Math.PI * 2,
  });
  let stars: Star[] = [];
  let w = 0, h = 0, frame = 0, last = 0;
  const size = () => {
    w = canvas.clientWidth; h = canvas.clientHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, phone ? 1.5 : 2);
    canvas.width = Math.max(1, w * ratio); canvas.height = Math.max(1, h * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const n = Math.round(Math.min(phone ? 90 : 220, Math.max(50, (w * h) / 6000)));
    while (stars.length < n) stars.push(spawn(false));
    stars.length = n;
    draw(performance.now(), 0);
  };
  const draw = (now: number, dt: number) => {
    const cx = w / 2, cy = h / 2, scale = Math.max(w, h) * 0.55;
    ctx.clearRect(0, 0, w, h);
    for (const s of stars) {
      s.z -= 0.03 * dt;
      if (s.z <= 0.04) Object.assign(s, spawn(true));
      const x = cx + (s.x / s.z) * scale, y = cy + (s.y / s.z) * scale;
      if (x < -10 || x > w + 10 || y < -10 || y > h + 10) { Object.assign(s, spawn(true)); continue; }
      const near = 1 - s.z;
      ctx.globalAlpha = Math.min(1, (0.12 + near * 0.8) * (0.7 + 0.3 * Math.sin(now / 620 + s.ph)));
      ctx.fillStyle = s.tint;
      ctx.beginPath();
      ctx.arc(x, y, 0.3 + near * near * (phone ? 1.4 : 1.9), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };
  const loop = (now: number) => {
    frame = 0;
    if (document.hidden || still()) return;
    draw(now, last ? Math.min(0.05, (now - last) / 1000) : 0);
    last = now;
    frame = requestAnimationFrame(loop);
  };
  const start = () => {
    if (frame || document.hidden) return;
    if (still()) { draw(performance.now(), 0); return; }
    last = 0; frame = requestAnimationFrame(loop);
  };
  const stop = () => { if (frame) cancelAnimationFrame(frame); frame = 0; };
  const onVisibility = () => (document.hidden ? stop() : start());
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(size) : null;
  ro?.observe(canvas);
  size();
  start();
  document.addEventListener('visibilitychange', onVisibility);
  return () => { stop(); ro?.disconnect(); document.removeEventListener('visibilitychange', onVisibility); };
}
