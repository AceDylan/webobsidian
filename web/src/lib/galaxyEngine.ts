/**
 * Galaxy (星图) renderer — one Canvas 2D loop, no WebGL (PRD 2.0). React never re-renders per
 * frame: the engine eases every element toward its target and moves the DOM folder cards with
 * `style.transform`. In branch mode it reads the visible note rows and fans fibres out to them.
 * Reduced motion → still frames redrawn only on change; hidden tab → nothing drawn.
 */
import { arcControls, cubicAt, galaxyScene, branchScene, type Galaxy, type Point, type Scene } from './galaxyModel';

const TAU = Math.PI * 2;
const GOLD = '#f2c46d';
const WARP_EVERY_MS = 60_000;
let lastWarp = -Infinity;

/** Deterministic random so the scene looks the same on every load. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rgba = (hex: string, a: number) => {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a.toFixed(3)})`;
};

/** Soft round glow sprites, cached per colour (drawImage is far cheaper than shadowBlur). */
const glowCache = new Map<string, HTMLCanvasElement>();
function glow(color: string): HTMLCanvasElement {
  let c = glowCache.get(color);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, rgba(color, 1));
  grad.addColorStop(0.25, rgba(color, 0.45));
  grad.addColorStop(1, rgba(color, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowCache.set(color, c);
  return c;
}

export interface GalaxyHost {
  /** Folder key → card element; the engine positions them. */
  cards: Map<string, HTMLElement>;
  /** Visible note rows of the open folder: fibre targets. */
  rows: () => { id: string; el: HTMLElement }[];
  /** The note list box: fibres end at its left edge. */
  list: () => HTMLElement | null;
  onHub: (key: string) => void;
}
export interface GalaxyState {
  mode: 'galaxy' | 'branch';
  sel: string | null;
  active: string | null;
  panelW: number; // width taken by panels on the right (branch, desktop)
  sheetH: number; // height taken by the bottom sheet (branch, phone)
}

interface Anim { x: number; y: number; s: number; a: number }
interface Hub extends Anim { key: string; color: string; count: number; phase: number; bend: number }
interface Speck { id: string; hub: Hub; u: number; off: number; r: number; ph: number; x: number; y: number; a: number }

export class GalaxyEngine {
  private ctx: CanvasRenderingContext2D;
  private w = 1; private h = 1; private dpr = 1;
  private phone = false;
  private still = false;
  private frame = 0; private last = 0; private t = 0;
  private dirty = true;
  private hubs: Hub[] = [];
  private hubByKey = new Map<string, Hub>();
  private specks: Speck[] = [];
  private speckById = new Map<string, Speck>();
  private links: { a: Speck; b: Speck; mutual: boolean }[] = [];
  private core: Anim & { r: number } = { x: 0, y: 0, s: 1, a: 1, r: 40 };
  private target: Scene | null = null;
  private state: GalaxyState = { mode: 'galaxy', sel: null, active: null, panelW: 0, sheetH: 0 };
  private hover: string | null = null;
  private sphere = makeSphere();
  private dust: { x: number; y: number; z: number; warm: boolean; ph: number }[] = [];
  private ro: ResizeObserver | null = null;
  private mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  private first = true;
  // Cinematic layer (PRD FR-16): warp-in on first entry, shockwaves on folder selection.
  private warp = -1; // seconds since the warp started; -1 = none
  private warped = false;
  private shocks: { key: string; x: number; y: number; color: string; t0: number }[] = [];

  constructor(private canvas: HTMLCanvasElement, private host: GalaxyHost) {
    this.ctx = canvas.getContext('2d')!;
    const r = rng(7);
    this.dust = Array.from({ length: 140 }, () => ({ x: r(), y: r(), z: 0.3 + r() * 0.7, warm: r() < 0.22, ph: r() * TAU }));
    this.still = this.mq.matches;
    this.mq.addEventListener('change', this.onMotion);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('wo-fx-reveal', this.startWarp);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerleave', this.onLeave);
    canvas.addEventListener('click', this.onClick);
    this.ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => this.resize()) : null;
    this.ro?.observe(canvas);
    this.resize();
  }

  destroy() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.ro?.disconnect();
    this.mq.removeEventListener('change', this.onMotion);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('wo-fx-reveal', this.startWarp);
    this.canvas.removeEventListener('pointermove', this.onMove);
    this.canvas.removeEventListener('pointerleave', this.onLeave);
    this.canvas.removeEventListener('click', this.onClick);
  }

  setData(g: Galaxy) {
    const old = this.hubByKey;
    const r = rng(1337);
    this.hubs = g.folders.map((f, i) => {
      const prev = old.get(f.key);
      return { key: f.key, color: f.color, count: f.notes.length, phase: i * 1.37, bend: (i % 2 ? 1 : -1) * 0.1, x: prev?.x ?? 0, y: prev?.y ?? 0, s: prev?.s ?? 0.2, a: prev?.a ?? 0 };
    });
    this.hubByKey = new Map(this.hubs.map(h => [h.key, h]));
    this.specks = [];
    for (const f of g.folders) {
      const hub = this.hubByKey.get(f.key)!;
      for (const n of f.notes) {
        const deg = n.in.length + n.out.length;
        this.specks.push({ id: n.id, hub, u: 0.16 + r() * 0.62, off: (r() - 0.5) * (18 + Math.min(f.notes.length, 40) * 1.1), r: 1.1 + Math.min(deg, 12) * 0.22, ph: r() * TAU, x: 0, y: 0, a: 0 });
      }
    }
    this.speckById = new Map(this.specks.map(s => [s.id, s]));
    this.links = g.links.map(l => ({ a: this.speckById.get(l.a)!, b: this.speckById.get(l.b)!, mutual: l.mutual })).filter(l => l.a && l.b);
    this.relayout();
  }

  setState(s: GalaxyState) {
    const sel = s.sel !== this.state.sel ? s.sel : null;
    this.state = s;
    const hub = sel === null ? undefined : this.hubByKey.get(sel);
    if (hub && !this.still && this.cinematic()) {
      this.shocks.push({ key: hub.key, x: hub.x, y: hub.y, color: hub.color, t0: this.t });
      if (this.shocks.length > 4) this.shocks.shift();
    }
    this.relayout();
  }

  /** The app's cinematic layer is on (dark Neural/Halo theme, effects on, full motion). */
  private cinematic() { return !!this.canvas.closest('.fx-cinematic'); }

  /** Where a folder's arc meets its hub, in canvas pixels (for tests and the view). */
  hubPoint(key: string): Point | null {
    const h = this.hubByKey.get(key);
    return h ? { x: h.x, y: h.y } : null;
  }

  private relayout() {
    const n = this.hubs.length;
    const { mode, sel, panelW, sheetH } = this.state;
    const idx = sel === null ? -1 : this.hubs.findIndex(h => h.key === sel);
    this.target = mode === 'branch' && idx >= 0
      ? (this.phone ? branchScene(n, idx, this.w, this.h - sheetH, true) : branchScene(n, idx, this.w - panelW, this.h, false))
      : galaxyScene(n, this.w, this.h, this.phone);
    const warping = this.warp >= 0;
    if ((this.first || this.still) && !warping) this.snap();
    // Under the boot title card the warp waits for its reveal (CinematicLayer fires wo-fx-reveal).
    if (!document.querySelector('.fx-boot')) this.startWarp();
    this.first = false;
    this.wake();
  }

  /** Warp-in, once per scene: everything starts collapsed in the core and flies out, staggered (see step). */
  private startWarp = () => {
    if (this.warped || !this.hubs.length || this.w <= 1 || this.still || !this.cinematic()) return;
    this.warped = true;
    // Hopping between tabs should not replay it every time: at most once a minute.
    if (performance.now() - lastWarp < WARP_EVERY_MS) return;
    lastWarp = performance.now();
    this.warp = 0;
    this.snap();
    for (const h of this.hubs) Object.assign(h, { x: this.core.x, y: this.core.y, s: 0.15, a: 0 });
    this.core.r *= 0.35;
    this.wake();
  };

  private snap() {
    const T = this.target!;
    Object.assign(this.core, T.core);
    this.hubs.forEach((h, i) => Object.assign(h, T.hubs[i]));
  }

  private resize() {
    const r = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, r.width); this.h = Math.max(1, r.height);
    this.phone = this.w <= 768;
    this.dpr = Math.min(window.devicePixelRatio || 1, this.phone ? 1.5 : 2);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.first = true;
    this.relayout();
  }

  private wake = () => {
    this.dirty = true;
    if (this.frame || document.hidden) return;
    this.last = 0;
    this.frame = requestAnimationFrame(this.loop);
  };

  private loop = (now: number) => {
    this.frame = 0;
    if (document.hidden) return;
    const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 0;
    this.last = now;
    if (!this.still) this.t += dt;
    const moving = this.step(dt);
    this.draw();
    this.placeCards();
    this.dirty = false;
    // Reduced motion: one frame per change (the view calls redraw() when the list scrolls).
    if (!this.still || moving) this.frame = requestAnimationFrame(this.loop);
  };

  private step(dt: number): boolean {
    const T = this.target;
    if (!T) return false;
    if (this.still) { this.snap(); this.warp = -1; this.shocks = []; return false; }
    if (this.warp >= 0) { this.warp += dt; if (this.warp > 2) this.warp = -1; }
    const k = 1 - Math.exp(-dt * 7);
    let moving = this.warp >= 0 || this.shocks.length > 0;
    type Eased = Anim & { r?: number };
    const KEYS = ['x', 'y', 's', 'a', 'r'] as const;
    const ease = (o: Eased, to: Partial<Eased>) => {
      for (const p of KEYS) {
        const from = o[p], tv = to[p];
        if (from === undefined || tv === undefined) continue;
        const d = tv - from;
        if (Math.abs(d) > 0.01) moving = true;
        o[p] = from + d * k;
      }
    };
    ease(this.core, T.core);
    this.hubs.forEach((h, i) => { if (this.warp < 0 || this.warp > 0.18 + i * 0.055) ease(h, T.hubs[i]); });
    return moving;
  }

  /* -------------------------------------------------------------- drawing */
  private draw() {
    const { ctx, w, h, t } = this;
    const branch = this.state.mode === 'branch';
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';

    // drifting dust
    for (const d of this.dust) {
      const x = ((d.x + t * 0.004 * d.z) % 1) * w, y = ((d.y + Math.sin(t * 0.1 + d.ph) * 0.01 + 1) % 1) * h;
      ctx.globalAlpha = (0.08 + 0.22 * d.z) * (0.75 + 0.25 * Math.sin(t * 0.8 + d.ph));
      ctx.fillStyle = d.warm ? '#ffd9a0' : '#cfd8ea';
      ctx.fillRect(x, y, d.z * 1.3, d.z * 1.3);
    }
    ctx.globalAlpha = 1;

    const c = this.core;
    if (this.warp >= 0) this.drawWarp();
    if (!branch && this.target) {
      // faint orbit through the hubs
      const T = this.target;
      const rx = T.hubs.reduce((m, q) => Math.max(m, Math.abs(q.x - T.core.x)), c.r * 2);
      const ry = T.hubs.reduce((m, q) => Math.max(m, Math.abs(q.y - T.core.y)), c.r * 2);
      ctx.strokeStyle = 'rgba(200,210,235,0.07)';
      ctx.setLineDash([2, 6]);
      ctx.beginPath(); ctx.ellipse(c.x, c.y, rx, ry, 0, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.globalCompositeOperation = 'lighter';
    // arcs core → hub, with particles flowing inward
    const p = { x: 0, y: 0 };
    for (const hub of this.hubs) {
      if (hub.a < 0.02) continue;
      const lit = this.hover === hub.key || this.state.sel === hub.key;
      const dim = branch && !lit ? 0.45 : 1;
      const [c1, c2] = arcControls(c, hub, hub.bend);
      const grad = ctx.createLinearGradient(c.x, c.y, hub.x, hub.y);
      grad.addColorStop(0, rgba('#fff4e0', 0.05 * hub.a));
      grad.addColorStop(1, rgba(hub.color, (lit ? 0.75 : 0.32) * hub.a * dim));
      ctx.strokeStyle = grad;
      ctx.lineWidth = lit ? 1.6 : 1;
      ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, hub.x, hub.y); ctx.stroke();
      const n = this.phone ? Math.min(6, 2 + (hub.count >> 1)) : Math.min(16, 3 + hub.count);
      const g = glow(hub.color);
      for (let i = 0; i < n; i++) {
        const u = 1 - ((t * (lit ? 0.22 : 0.1) + i / n + hub.phase) % 1);
        cubicAt(c, c1, c2, hub, u, p);
        const s = (lit ? 7 : 5) * (0.6 + 0.4 * Math.sin(u * Math.PI));
        ctx.globalAlpha = hub.a * dim * Math.sin(u * Math.PI) * 0.9;
        ctx.drawImage(g, p.x - s / 2, p.y - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
    }

    // note specks along each arc, and real wikilinks between them
    for (const s of this.specks) {
      const hub = s.hub;
      const [c1, c2] = arcControls(c, hub, hub.bend);
      cubicAt(c, c1, c2, hub, s.u, p);
      const dx = hub.x - c.x, dy = hub.y - c.y, len = Math.hypot(dx, dy) || 1;
      const wob = Math.sin(t * 0.6 + s.ph) * 2;
      s.x = p.x + (-dy / len) * (s.off + wob); s.y = p.y + (dx / len) * (s.off + wob);
      const hidden = branch && (this.state.sel === hub.key || this.phone);
      s.a = hidden ? 0 : hub.a * (branch ? 0.25 : this.hover && this.hover !== hub.key ? 0.3 : 1);
    }
    if (!branch) {
      for (const l of this.links) {
        const a = Math.min(l.a.a, l.b.a);
        if (a < 0.02) continue;
        const hot = this.hover && (l.a.hub.key === this.hover || l.b.hub.key === this.hover);
        ctx.strokeStyle = l.mutual ? rgba(GOLD, (hot ? 0.55 : 0.28) * a) : `rgba(220,228,245,${((hot ? 0.3 : 0.1) * a).toFixed(3)})`;
        ctx.lineWidth = l.mutual ? 1 : 0.7;
        const mx = (l.a.x + l.b.x) / 2, my = (l.a.y + l.b.y) / 2;
        ctx.beginPath(); ctx.moveTo(l.a.x, l.a.y);
        ctx.quadraticCurveTo(mx + (c.x - mx) * 0.35, my + (c.y - my) * 0.35, l.b.x, l.b.y);
        ctx.stroke();
      }
    }
    for (const s of this.specks) {
      if (s.a < 0.02) continue;
      const tw = 0.7 + 0.3 * Math.sin(t * 1.7 + s.ph);
      ctx.globalAlpha = s.a * tw * 0.55;
      const g = s.r * 5;
      ctx.drawImage(glow(s.hub.color), s.x - g / 2, s.y - g / 2, g, g);
      ctx.globalAlpha = s.a * tw;
      ctx.fillStyle = s.hub.color;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 0.75, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;

    this.drawCore();
    for (const hub of this.hubs) if (hub.a > 0.02) this.drawJelly(hub);
    if (branch && !this.phone) this.drawFibres();
    if (this.shocks.length) this.drawShocks();
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Warp-in: star streaks racing out of the core, a core flash and one expanding ring. */
  private drawWarp() {
    const { ctx, w, h } = this, c = this.core, e = this.warp;
    const I = Math.max(0, 1 - e / 1.5) ** 2;
    if (I <= 0) return;
    const reach = Math.hypot(w, h) / 2;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const d of this.dust) {
      const x = d.x * w, y = d.y * h, dx = x - c.x, dy = y - c.y, dist = Math.hypot(dx, dy) || 1;
      const len = I * (40 + 220 * d.z) * (0.3 + dist / reach);
      ctx.strokeStyle = d.warm ? `rgba(255,214,150,${(0.65 * I).toFixed(3)})` : `rgba(205,220,255,${(0.55 * I).toFixed(3)})`;
      ctx.lineWidth = 0.6 + d.z * 1.2;
      ctx.beginPath(); ctx.moveTo(x - (dx / dist) * len, y - (dy / dist) * len); ctx.lineTo(x, y); ctx.stroke();
    }
    const flash = Math.max(0, 1 - e / 0.7);
    if (flash > 0) {
      const R = reach * (0.25 + 0.6 * (1 - flash));
      const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, R);
      g.addColorStop(0, `rgba(255,244,220,${(0.85 * flash).toFixed(3)})`);
      g.addColorStop(0.3, `rgba(242,196,109,${(0.35 * flash).toFixed(3)})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c.x, c.y, R, 0, TAU); ctx.fill();
    }
    const u = Math.min(1, e / 1.1);
    if (u < 1) {
      ctx.strokeStyle = rgba(GOLD, 0.7 * (1 - u));
      ctx.lineWidth = 3 * (1 - u) + 0.5;
      ctx.beginPath(); ctx.arc(c.x, c.y, reach * (1 - (1 - u) ** 3), 0, TAU); ctx.stroke();
    }
    ctx.lineCap = 'butt';
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Selection shockwave: three staggered rings and a flash in the folder's colour. */
  private drawShocks() {
    const { ctx } = this;
    const Rmax = this.phone ? 150 : 280;
    this.shocks = this.shocks.filter((s) => this.t - s.t0 < 1.4);
    for (const s of this.shocks) {
      const hub = this.hubByKey.get(s.key);
      const x = hub ? hub.x : s.x, y = hub ? hub.y : s.y; // ride along as the scene moves aside
      for (let k = 0; k < 3; k++) {
        const u = (this.t - s.t0 - k * 0.12) / 1.1;
        if (u <= 0 || u >= 1) continue;
        ctx.strokeStyle = rgba(s.color, 0.8 * (1 - u) ** 1.5);
        ctx.lineWidth = 2.6 * (1 - u) + 0.4;
        ctx.beginPath(); ctx.arc(x, y, Rmax * (1 - (1 - u) ** 3) * (1 - k * 0.18), 0, TAU); ctx.stroke();
      }
      const f = Math.max(0, 1 - (this.t - s.t0) / 0.45);
      if (f > 0) {
        const g = 60 + 120 * (1 - f);
        ctx.globalAlpha = f;
        ctx.drawImage(glow(s.color), x - g / 2, y - g / 2, g, g);
        ctx.globalAlpha = 1;
      }
    }
  }

  /** Wireframe sphere: Fibonacci points, nearest-neighbour struts, a few gold hot struts, embers. */
  private drawCore() {
    const { ctx, t } = this, c = this.core, S = this.sphere;
    const R = c.r * (1 + 0.025 * Math.sin(t * 1.3));
    const halo = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, R * 2.4);
    halo.addColorStop(0, 'rgba(255,214,150,0.16)');
    halo.addColorStop(0.35, 'rgba(160,175,220,0.07)');
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(c.x, c.y, R * 2.4, 0, TAU); ctx.fill();

    const ry = t * 0.16, cosY = Math.cos(ry), sinY = Math.sin(ry), tilt = 0.42, cosX = Math.cos(tilt), sinX = Math.sin(tilt);
    const P = S.proj;
    for (let i = 0; i < S.pts.length; i++) {
      const q = S.pts[i], k = 1 + q.amp * Math.sin(t * 1.1 + q.ph);
      const x = q.x * k, y = q.y * k, z = q.z * k;
      const x1 = x * cosY + z * sinY, z1 = -x * sinY + z * cosY;
      const y2 = y * cosX - z1 * sinX, z2 = y * sinX + z1 * cosX;
      P[i * 3] = c.x + x1 * R; P[i * 3 + 1] = c.y + y2 * R; P[i * 3 + 2] = z2;
    }
    ctx.lineWidth = 0.8;
    for (const [i, j] of S.edges) {
      const z = (P[i * 3 + 2] + P[j * 3 + 2]) / 2;
      ctx.strokeStyle = `rgba(205,212,232,${(0.1 + (z + 1) * 0.16).toFixed(3)})`;
      ctx.beginPath(); ctx.moveTo(P[i * 3], P[i * 3 + 1]); ctx.lineTo(P[j * 3], P[j * 3 + 1]); ctx.stroke();
    }
    ctx.lineWidth = 1.4;
    for (const hot of S.hot) {
      const [i, j] = hot.e, a = 0.35 + 0.65 * Math.max(0, Math.sin(t * hot.sp + hot.ph));
      ctx.strokeStyle = rgba(GOLD, a * (0.45 + (P[i * 3 + 2] + 1) * 0.25));
      ctx.beginPath(); ctx.moveTo(P[i * 3], P[i * 3 + 1]); ctx.lineTo(P[j * 3], P[j * 3 + 1]); ctx.stroke();
    }
    const g = glow('#ffb35c');
    for (const e of S.embers) {
      const a = e.u + t * e.sp;
      const x = c.x + Math.cos(a) * e.r * R * 0.8, y = c.y + Math.sin(a) * e.r * R * 0.5 + Math.sin(t + e.ph) * 2;
      ctx.globalAlpha = 0.35 + 0.35 * Math.sin(t * 2 + e.ph);
      ctx.drawImage(g, x - 3, y - 3, 6, 6);
    }
    ctx.globalAlpha = 1;
    ctx.drawImage(glow('#fff1d6'), c.x - R * 0.5, c.y - R * 0.5, R, R);
  }

  /** A glowing jellyfish: wireframe bell, rim, swaying tentacles. Pure decoration. */
  private drawJelly(h: Hub) {
    const { ctx, t } = this;
    const lit = this.hover === h.key || this.state.sel === h.key;
    const R = (this.target?.hubR ?? 20) * h.s * (1 + 0.05 * Math.sin(t * 1.6 + h.phase));
    const x = h.x, y = h.y + Math.sin(t * 0.9 + h.phase) * 2.5;
    const a = h.a * (lit ? 1 : 0.8);
    ctx.globalAlpha = a * (lit ? 0.85 : 0.5);
    ctx.drawImage(glow(h.color), x - R * 1.6, y - R * 1.9, R * 3.2, R * 3.2);
    ctx.globalAlpha = a;
    ctx.strokeStyle = rgba(h.color, 0.9);
    ctx.lineWidth = 0.9;
    const top = y - R * 0.95, rim = y + R * 0.05;
    // bell meridians
    for (let k = -3; k <= 3; k++) {
      const f = k / 3;
      ctx.beginPath();
      ctx.moveTo(x + f * R, rim);
      ctx.quadraticCurveTo(x + f * R * 1.05, top + R * 0.15, x + f * R * 0.15, top);
      ctx.stroke();
    }
    // bell parallels
    for (const v of [0.35, 0.68]) {
      ctx.beginPath(); ctx.ellipse(x, rim - R * v * 0.9, R * Math.sqrt(1 - v * v) * 0.98, R * 0.16 * (1 - v), 0, 0, TAU); ctx.stroke();
    }
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(x, rim, R, R * 0.24, 0, 0, TAU); ctx.stroke();
    // tentacles
    ctx.lineWidth = 0.8;
    const n = this.phone ? 5 : 9, len = R * (lit ? 1.9 : 1.55);
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1) - 0.5, sx = x + f * R * 1.6;
      ctx.strokeStyle = rgba(h.color, 0.55);
      ctx.beginPath(); ctx.moveTo(sx, rim + R * 0.08);
      for (let s = 1; s <= 6; s++) {
        const q = s / 6;
        ctx.lineTo(sx + f * q * R * 0.5 + Math.sin(t * 2.2 + i * 0.7 + q * 4 + h.phase) * q * R * 0.18, rim + q * len);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** Branch mode: fibres from the open folder's card to every visible note row. */
  private drawFibres() {
    const sel = this.state.sel === null ? null : this.host.cards.get(this.state.sel);
    const list = this.host.list();
    if (!sel || !list) return;
    const { ctx, t } = this;
    const origin = this.canvas.getBoundingClientRect();
    const cr = sel.getBoundingClientRect(), lr = list.getBoundingClientRect();
    if (!lr.width || !cr.width) return; // list covered by the note card (narrow panes)
    const j = { x: cr.right - origin.left + 6, y: cr.top + cr.height / 2 - origin.top };
    const ex = lr.left - origin.left - 2;
    const hub = this.hubByKey.get(this.state.sel!)!;
    const g = glow(hub.color);
    ctx.fillStyle = rgba(hub.color, 0.9);
    ctx.beginPath(); ctx.arc(j.x, j.y, 2.6, 0, TAU); ctx.fill();
    const p = { x: 0, y: 0 };
    let i = 0;
    for (const row of this.host.rows()) {
      const r = row.el.getBoundingClientRect();
      if (r.bottom < lr.top + 4 || r.top > lr.bottom - 4) continue;
      const e = { x: ex, y: r.top + r.height / 2 - origin.top };
      const mid = (e.x - j.x) * 0.5;
      const c1 = { x: j.x + mid, y: j.y }, c2 = { x: e.x - mid, y: e.y };
      const on = row.id === this.state.active;
      ctx.strokeStyle = rgba(hub.color, on ? 0.85 : 0.22);
      ctx.lineWidth = on ? 1.5 : 0.8;
      ctx.beginPath(); ctx.moveTo(j.x, j.y); ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, e.x, e.y); ctx.stroke();
      const u = (t * (on ? 0.5 : 0.18) + i * 0.137) % 1;
      cubicAt(j, c1, c2, e, u, p);
      const s = on ? 9 : 5;
      ctx.globalAlpha = on ? 1 : 0.7;
      ctx.drawImage(g, p.x - s / 2, p.y - s / 2, s, s);
      ctx.globalAlpha = 1;
      ctx.fillStyle = rgba(hub.color, on ? 1 : 0.6);
      ctx.beginPath(); ctx.arc(e.x, e.y, on ? 2.6 : 1.8, 0, TAU); ctx.fill();
      i++;
    }
  }

  /** Cards follow their hubs: under it in the overview, to its right when a folder is open. */
  private placeCards() {
    const side = this.target?.cardSide ?? 'below';
    const hubR = this.target?.hubR ?? 20;
    for (const h of this.hubs) {
      const el = this.host.cards.get(h.key);
      if (!el) continue;
      const y = h.y + Math.sin(this.t * 0.9 + h.phase) * 2.5;
      const tf = side === 'below'
        ? `translate3d(${h.x.toFixed(1)}px,${(y + hubR * h.s * 1.25).toFixed(1)}px,0) translateX(-50%)`
        : `translate3d(${(h.x + hubR * h.s * 1.35).toFixed(1)}px,${y.toFixed(1)}px,0) translateY(-50%)`;
      if (el.style.transform !== tf) el.style.transform = tf;
      const op = Math.max(0, Math.min(1, h.a)).toFixed(2);
      if (el.style.opacity !== op) el.style.opacity = op;
      const hide = h.a < 0.05;
      if (el.hidden !== hide) el.hidden = hide;
    }
  }

  /* --------------------------------------------------------------- input */
  private hubAt(x: number, y: number): string | null {
    let best: string | null = null, bd = Infinity;
    const R = (this.target?.hubR ?? 20) * 1.7;
    for (const h of this.hubs) {
      if (h.a < 0.3) continue;
      const d = Math.hypot(h.x - x, h.y - y);
      if (d < R * h.s && d < bd) { bd = d; best = h.key; }
    }
    return best;
  }
  redraw() { this.wake(); }
  setHover(key: string | null) {
    if (this.hover === key) return;
    this.hover = key;
    this.wake();
  }
  private onMove = (e: PointerEvent) => {
    const r = this.canvas.getBoundingClientRect();
    const key = this.hubAt(e.clientX - r.left, e.clientY - r.top);
    this.canvas.style.cursor = key ? 'pointer' : '';
    this.setHover(key);
  };
  private onLeave = () => { this.canvas.style.cursor = ''; this.setHover(null); };
  private onClick = (e: MouseEvent) => {
    const r = this.canvas.getBoundingClientRect();
    const key = this.hubAt(e.clientX - r.left, e.clientY - r.top);
    if (key !== null) this.host.onHub(key);
  };
  private onMotion = () => { this.still = this.mq.matches; this.wake(); };
  private onVisibility = () => {
    if (document.hidden) { cancelAnimationFrame(this.frame); this.frame = 0; } else this.wake();
  };

  /** PNG of the current frame on the ink background (pane ⋯ → Copy screenshot). */
  snapshot(bg: string): HTMLCanvasElement {
    const out = document.createElement('canvas');
    out.width = this.canvas.width; out.height = this.canvas.height;
    const g = out.getContext('2d')!;
    g.fillStyle = bg; g.fillRect(0, 0, out.width, out.height);
    g.drawImage(this.canvas, 0, 0);
    return out;
  }
}

function makeSphere() {
  const r = rng(42);
  const pts: { x: number; y: number; z: number; ph: number; amp: number }[] = [];
  const N = 120, ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2, rad = Math.sqrt(1 - y * y), th = i * ga, k = 0.78 + r() * 0.4;
    pts.push({ x: Math.cos(th) * rad * k, y: y * k, z: Math.sin(th) * rad * k, ph: r() * TAU, amp: 0.02 + r() * 0.07 });
  }
  for (let i = 0; i < 30; i++) {
    const u = r() * TAU, v = Math.acos(r() * 2 - 1), k = 0.2 + r() * 0.5;
    pts.push({ x: Math.sin(v) * Math.cos(u) * k, y: Math.cos(v) * k, z: Math.sin(v) * Math.sin(u) * k, ph: r() * TAU, amp: 0.05 + r() * 0.1 });
  }
  const edges: [number, number][] = [];
  const seen = new Set<number>();
  for (let i = 0; i < pts.length; i++) {
    const near = pts.map((q, j) => [(q.x - pts[i].x) ** 2 + (q.y - pts[i].y) ** 2 + (q.z - pts[i].z) ** 2, j]).sort((a, b) => a[0] - b[0]);
    for (let k = 1; k <= 3; k++) {
      const j = near[k][1], key = Math.min(i, j) * 1000 + Math.max(i, j);
      if (!seen.has(key)) { seen.add(key); edges.push([i, j]); }
    }
  }
  const hot = Array.from({ length: 22 }, () => ({ e: edges[Math.floor(r() * edges.length)], ph: r() * TAU, sp: 1 + r() * 2.5 }));
  const embers = Array.from({ length: 46 }, () => ({ u: r() * TAU, r: 0.1 + r() * 0.7, sp: (r() - 0.5) * 1.2, ph: r() * TAU }));
  return { pts, edges, hot, embers, proj: new Float32Array(pts.length * 3) };
}
