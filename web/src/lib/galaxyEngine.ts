/**
 * Galaxy (星图) renderer — one Canvas 2D loop, no WebGL (PRD 2.0, 2.3). React never re-renders
 * per frame: the engine eases every element toward its target and moves the DOM folder cards
 * with `style.transform`. In branch mode it reads the visible note rows and grows fibres to them.
 * Reduced motion → still frames redrawn only on change; hidden tab → nothing drawn.
 *
 * The core is a star (plasma body, accretion disk in front of and behind it, lensed far side,
 * corona streamers, jets, heartbeat shockwave); each folder is a bioluminescent jellyfish fed by
 * an energy conduit that now and then fires a surge at it.
 */
import { arcControls, cubicAt, galaxyScene, branchScene, type Galaxy, type Point, type Scene } from './galaxyModel';

const TAU = Math.PI * 2;
const GOLD = '#f2c46d';
const WARP_EVERY_MS = 60_000;
/** Accretion disk plane: tilt on screen and how flat it looks. */
const TILT = -0.3, FLAT = 0.27;
const TILT_C = Math.cos(TILT), TILT_S = Math.sin(TILT);
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
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${Math.max(0, a).toFixed(3)})`;
};
const frac = (v: number) => v - Math.floor(v);
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Soft round glow sprites, cached per colour (drawImage is far cheaper than shadowBlur). `hot` = white-hot centre. */
const glowCache = new Map<string, HTMLCanvasElement>();
function glow(color: string, hot = false): HTMLCanvasElement {
  const key = color + (hot ? '*' : '');
  let c = glowCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  if (hot) {
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.12, rgba(color, 0.95));
    grad.addColorStop(0.34, rgba(color, 0.3));
    grad.addColorStop(0.68, rgba(color, 0.05));
  } else {
    grad.addColorStop(0, rgba(color, 1));
    grad.addColorStop(0.25, rgba(color, 0.45));
  }
  grad.addColorStop(1, rgba(color, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowCache.set(key, c);
  return c;
}
function sprite(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, x: number, y: number, size: number, alpha: number) {
  if (alpha <= 0.004 || size <= 0.5) return;
  ctx.globalAlpha = alpha > 1 ? 1 : alpha;
  ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
}

/** Granulation texture for the star's surface: ridged value noise, warm grey (used to multiply). */
let plasmaTex: HTMLCanvasElement | null = null;
function plasma(): HTMLCanvasElement {
  if (plasmaTex) return plasmaTex;
  const S = 160, G = 64, r = rng(99), lattice = Float32Array.from({ length: G * G }, () => r());
  const at = (x: number, y: number) => lattice[((y % G) + G) % G * G + (((x % G) + G) % G)];
  const noise = (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * u, b = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * u;
    return a + (b - a) * v;
  };
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!, img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let v = 0, amp = 0.55, f = 6 / S;
    for (let o = 0; o < 4; o++) { v += amp * (1 - Math.abs(noise(x * f, y * f) * 2 - 1)); amp *= 0.5; f *= 2; }
    const k = Math.min(1, Math.max(0, (v - 0.35) * 1.4)), i = (y * S + x) * 4;
    img.data[i] = 150 + 105 * k; img.data[i + 1] = 95 + 145 * k; img.data[i + 2] = 50 + 170 * k; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return (plasmaTex = c);
}

/** Bell contraction 0..1: a quick squeeze, then a slow relax — the rhythm of a swimming medusa. */
function squeeze(p: number) {
  p = frac(p);
  return p < 0.28 ? Math.sin((p / 0.28) * Math.PI / 2) : Math.cos(((p - 0.28) / 0.72) * Math.PI / 2) ** 2;
}

/** A point on the accretion disk (radius `e` in body radii, angle `a`) relative to the star's centre. */
function onDisk(e: number, a: number, R: number, out: Point): Point {
  const x = Math.cos(a) * e * R, y = Math.sin(a) * e * R * FLAT;
  out.x = x * TILT_C - y * TILT_S; out.y = x * TILT_S + y * TILT_C;
  return out;
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
interface Hub extends Anim {
  key: string; color: string; count: number; phase: number; bend: number;
  surge: number; // progress of an energy surge running core → hub; -1 = none
  next: number; // scene time of the next surge
  flare: number; // 1 when a surge lands, fades out
}
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
  private hoverRow: string | null = null;
  private star = makeStar();
  private dust: { x: number; y: number; z: number; warm: boolean; ph: number }[] = [];
  private beacons: { x: number; y: number; s: number; ph: number }[] = [];
  private ro: ResizeObserver | null = null;
  private mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  private first = true;
  private fibreT0 = -Infinity; // scene time the open folder's fibres started growing
  private arc: { t0: number; pts: Point[] } | null = null;
  private nextArc = 3;
  private p = { x: 0, y: 0 }; private q = { x: 0, y: 0 };
  // Cinematic layer (PRD FR-16): warp-in on first entry, shockwaves on folder selection.
  private warp = -1; // seconds since the warp started; -1 = none
  private warped = false;
  private shocks: { key: string; x: number; y: number; color: string; t0: number }[] = [];

  constructor(private canvas: HTMLCanvasElement, private host: GalaxyHost) {
    this.ctx = canvas.getContext('2d')!;
    const r = rng(7);
    this.dust = Array.from({ length: 150 }, () => ({ x: r(), y: r(), z: 0.3 + r() * 0.7, warm: r() < 0.22, ph: r() * TAU }));
    this.beacons = Array.from({ length: 7 }, () => ({ x: r(), y: r(), s: 0.6 + r() * 0.8, ph: r() * TAU }));
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
      return {
        key: f.key, color: f.color, count: f.notes.length, phase: i * 1.37, bend: (i % 2 ? 1 : -1) * 0.1,
        x: prev?.x ?? 0, y: prev?.y ?? 0, s: prev?.s ?? 0.2, a: prev?.a ?? 0,
        surge: -1, next: this.t + 1.5 + r() * 6, flare: 0,
      };
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
    if (hub) this.fibreT0 = this.t;
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
    if (this.still) {
      this.snap(); this.warp = -1; this.shocks = [];
      for (const h of this.hubs) { h.surge = -1; h.flare = 0; }
      return false;
    }
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
    // Energy surges: every few seconds a conduit fires; the jellyfish flares when it lands.
    for (const h of this.hubs) {
      h.flare = Math.max(0, h.flare - dt * 1.4);
      if (h.surge >= 0) {
        h.surge += dt / 0.95;
        if (h.surge >= 1) { h.surge = -1; h.flare = 1; h.next = this.t + 4 + Math.random() * 7; }
      } else if (this.t >= h.next && h.a > 0.3) h.surge = 0;
    }
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
    this.drawBeacons();
    this.drawStarBack();
    this.drawConduits();

    // note specks along each arc, and real wikilinks between them
    const p = this.p;
    for (const s of this.specks) {
      const hub = s.hub, a = this.edge(hub);
      const [c1, c2] = arcControls(a, hub, hub.bend);
      cubicAt(a, c1, c2, hub, s.u, p);
      const dx = hub.x - a.x, dy = hub.y - a.y, len = Math.hypot(dx, dy) || 1;
      const wob = Math.sin(t * 0.6 + s.ph) * 2;
      s.x = p.x + (-dy / len) * (s.off + wob); s.y = p.y + (dx / len) * (s.off + wob);
      const hidden = branch && (this.state.sel === hub.key || this.phone);
      s.a = hidden ? 0 : hub.a * (branch ? 0.25 : this.hover && this.hover !== hub.key ? 0.3 : 1);
    }
    if (!branch) {
      for (const [i, l] of this.links.entries()) {
        const a = Math.min(l.a.a, l.b.a);
        if (a < 0.02) continue;
        const hot = this.hover && (l.a.hub.key === this.hover || l.b.hub.key === this.hover);
        ctx.strokeStyle = l.mutual ? rgba(GOLD, (hot ? 0.55 : 0.28) * a) : `rgba(220,228,245,${((hot ? 0.3 : 0.1) * a).toFixed(3)})`;
        ctx.lineWidth = l.mutual ? 1 : 0.7;
        const mx = (l.a.x + l.b.x) / 2, my = (l.a.y + l.b.y) / 2;
        const cx = mx + (c.x - mx) * 0.35, cy = my + (c.y - my) * 0.35;
        ctx.beginPath(); ctx.moveTo(l.a.x, l.a.y); ctx.quadraticCurveTo(cx, cy, l.b.x, l.b.y); ctx.stroke();
        if (l.mutual) {
          // a spark shuttles along every two-way link
          const u = 0.5 - 0.5 * Math.cos(t * 0.9 + i * 1.3), v = 1 - u;
          sprite(ctx, glow(GOLD, true), v * v * l.a.x + 2 * v * u * cx + u * u * l.b.x, v * v * l.a.y + 2 * v * u * cy + u * u * l.b.y, hot ? 9 : 6, a * 0.9);
        }
      }
    }
    for (const s of this.specks) {
      if (s.a < 0.02) continue;
      const tw = 0.7 + 0.3 * Math.sin(t * 1.7 + s.ph);
      sprite(ctx, glow(s.hub.color, true), s.x, s.y, s.r * 6, s.a * tw * 0.8);
    }
    ctx.globalAlpha = 1;

    this.drawStarBody();
    this.drawStarFront();
    for (const hub of this.hubs) if (hub.a > 0.02) this.drawJelly(hub);
    if (branch && !this.phone) this.drawFibres();
    if (this.shocks.length) this.drawShocks();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /** A few bright stars with diffraction spikes, twinkling. */
  private drawBeacons() {
    const { ctx, w, h, t } = this;
    ctx.lineWidth = 0.6;
    for (const b of this.beacons) {
      const x = b.x * w, y = b.y * h, tw = 0.55 + 0.45 * Math.sin(t * 0.7 + b.ph), L = (6 + 9 * b.s) * tw;
      ctx.globalAlpha = 0.35 * tw;
      ctx.strokeStyle = '#e8eeff';
      ctx.beginPath(); ctx.moveTo(x - L, y); ctx.lineTo(x + L, y); ctx.moveTo(x, y - L); ctx.lineTo(x, y + L); ctx.stroke();
      sprite(ctx, glow('#cfdcff', true), x, y, 7 * b.s, 0.7 * tw);
    }
  }

  /** Body radius of the star: the rest of the core (disk, corona) reaches out to ~2.6×. */
  private bodyR() { return this.core.r * 0.5; }

  /** Where a conduit leaves the core towards `to`: just outside the disk's inner glow. */
  private edge(to: Point): Point {
    const c = this.core, dx = to.x - c.x, dy = to.y - c.y, d = Math.hypot(dx, dy) || 1, k = this.bodyR() * 1.15;
    return { x: c.x + (dx / d) * k, y: c.y + (dy / d) * k };
  }

  /** Behind the star: corona glow, streamers, jets, the far half of the accretion disk. */
  private drawStarBack() {
    const { ctx, t } = this, c = this.core, R = this.bodyR(), S = this.star;
    if (R < 1) return;
    const breath = 1 + 0.06 * Math.sin(t * 0.9);
    sprite(ctx, glow('#ff9a3c'), c.x, c.y, R * 9 * breath, 0.22);
    sprite(ctx, glow('#ffd28a'), c.x, c.y, R * 5.2 * breath, 0.42);
    sprite(ctx, glow('#9b7bff'), c.x + R * 0.8, c.y - R * 0.5, R * 7, 0.08);

    // corona streamers drifting outwards
    ctx.lineWidth = 0.8;
    const n = this.phone ? 26 : S.rays.length;
    for (let i = 0; i < n; i++) {
      const s = S.rays[i], d = frac(t * s.sp + s.off), a = Math.sin(d * Math.PI);
      if (a < 0.03) continue;
      const r0 = R * (1.1 + d * 1.5), r1 = r0 + R * s.len * (0.35 + 0.6 * d);
      const ux = Math.cos(s.ang), uy = Math.sin(s.ang);
      ctx.strokeStyle = s.warm ? rgba('#ffd59a', 0.34 * a) : rgba('#f6f0ff', 0.24 * a);
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.moveTo(c.x + ux * r0, c.y + uy * r0); ctx.lineTo(c.x + ux * r1, c.y + uy * r1); ctx.stroke();
      sprite(ctx, glow('#ffe2b0', true), c.x + ux * r1, c.y + uy * r1, 4, a * 0.8);
    }

    // bipolar jets along the disk's axis, knots streaming out
    const nx = TILT_S, ny = -TILT_C;
    for (const sign of [1, -1]) {
      const L = R * 4.4, ex = c.x + nx * sign * L, ey = c.y + ny * sign * L;
      const g = ctx.createLinearGradient(c.x, c.y, ex, ey);
      g.addColorStop(0, 'rgba(255,236,200,0.38)'); g.addColorStop(0.4, 'rgba(190,170,255,0.12)'); g.addColorStop(1, 'rgba(160,140,255,0)');
      const wx = -ny * R * 0.12, wy = nx * R * 0.12;
      ctx.globalAlpha = 1; ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(c.x + wx, c.y + wy); ctx.lineTo(ex, ey); ctx.lineTo(c.x - wx, c.y - wy); ctx.closePath(); ctx.fill();
      for (let k = 0; k < 4; k++) {
        const u = frac(t * 0.22 + k / 4 + (sign > 0 ? 0 : 0.125)), d = R * (0.9 + u * 3.4);
        sprite(ctx, glow('#e6dcff', true), c.x + nx * sign * d, c.y + ny * sign * d, R * (0.5 * (1 - u) + 0.15), (1 - u) * 0.85);
      }
    }
    this.drawDisk(false);
  }

  /** The accretion disk: rings and Keplerian particle streaks, brighter on the side turning towards us. */
  private drawDisk(front: boolean) {
    const { ctx, t } = this, c = this.core, R = this.bodyR(), S = this.star, p = this.p, q = this.q;
    // the glowing band itself: a radial gradient squashed into the disk plane, one half at a time
    ctx.save();
    ctx.translate(c.x, c.y); ctx.rotate(TILT); ctx.scale(1, FLAT);
    const big = R * 4;
    ctx.beginPath(); ctx.rect(-big, front ? 0 : -big, big * 2, big); ctx.clip();
    const band = ctx.createRadialGradient(0, 0, R * 0.95, 0, 0, R * 3.1);
    band.addColorStop(0, 'rgba(255,250,235,0)'); band.addColorStop(0.05, 'rgba(255,244,214,0.8)'); band.addColorStop(0.3, 'rgba(255,196,118,0.38)');
    band.addColorStop(0.62, 'rgba(240,128,96,0.16)'); band.addColorStop(1, 'rgba(200,100,190,0)');
    ctx.globalAlpha = front ? 0.9 : 0.55; ctx.fillStyle = band;
    ctx.beginPath(); ctx.arc(0, 0, R * 3.1, 0, TAU); ctx.arc(0, 0, R * 0.95, 0, TAU, true); ctx.fill();
    ctx.restore();
    // rings (half ellipses: the far half is the upper one)
    ctx.globalAlpha = 1;
    for (const ring of S.rings) {
      ctx.strokeStyle = rgba(ring.color, ring.a * (front ? 1 : 0.6));
      ctx.lineWidth = ring.w;
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, ring.e * R, ring.e * R * FLAT, TILT, front ? 0 : Math.PI, front ? Math.PI : TAU);
      ctx.stroke();
    }
    ctx.lineCap = 'round';
    const n = this.phone ? 70 : S.disk.length;
    for (let i = 0; i < n; i++) {
      const d = S.disk[i], a = d.a0 + t * 0.75 / d.e ** 1.5;
      if ((Math.sin(a) > 0) !== front) continue;
      onDisk(d.e, a - 0.2 / d.e, R, p); onDisk(d.e, a, R, q);
      const doppler = 0.35 + 0.65 * (1 - 0.75 * Math.cos(a)) / 1.75;
      ctx.globalAlpha = doppler * (front ? 0.95 : 0.6);
      ctx.strokeStyle = d.tint; ctx.lineWidth = d.w;
      ctx.beginPath(); ctx.moveTo(c.x + p.x, c.y + p.y); ctx.lineTo(c.x + q.x, c.y + q.y); ctx.stroke();
    }
    ctx.lineCap = 'butt';
    ctx.globalAlpha = 1;
  }

  /** The star itself: white-hot plasma with turning granulation and a darker limb. */
  private drawStarBody() {
    const { ctx, t } = this, c = this.core, R = this.bodyR();
    if (R < 1) return;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    const base = ctx.createRadialGradient(c.x - R * 0.2, c.y - R * 0.25, 0, c.x, c.y, R);
    base.addColorStop(0, '#ffffff'); base.addColorStop(0.4, '#fff0c6'); base.addColorStop(0.78, '#ffc76a'); base.addColorStop(1, '#ff9334');
    ctx.save();
    ctx.beginPath(); ctx.arc(c.x, c.y, R, 0, TAU); ctx.fillStyle = base; ctx.fill();
    ctx.clip();
    const tex = plasma();
    ctx.translate(c.x, c.y);
    ctx.rotate(t * 0.05);
    ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.38;
    ctx.drawImage(tex, -R * 1.6, -R * 1.6, R * 3.2, R * 3.2);
    ctx.rotate(-t * 0.13);
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.14;
    ctx.drawImage(tex, -R * 1.3, -R * 1.3, R * 2.6, R * 2.6);
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
    const limb = ctx.createRadialGradient(c.x, c.y, R * 0.55, c.x, c.y, R);
    limb.addColorStop(0, 'rgba(150,50,0,0)'); limb.addColorStop(1, 'rgba(150,50,0,0.28)');
    ctx.fillStyle = limb; ctx.beginPath(); ctx.arc(c.x, c.y, R, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    sprite(ctx, glow('#fff1d6', true), c.x, c.y, R * 1.8, 0.45 + 0.12 * Math.sin(t * 1.9));
    sprite(ctx, glow('#ffd690'), c.x, c.y, R * 3, 0.55 + 0.1 * Math.sin(t * 1.3)); // bloom over the limb
  }

  /** In front of the star: near half of the disk, lensed far side, photon ring, prominences, HUD, heartbeat, plasma arcs. */
  private drawStarFront() {
    const { ctx, t } = this, c = this.core, R = this.bodyR(), S = this.star;
    if (R < 1) return;
    this.drawDisk(true);
    // gravitational lensing: the disk's far side bent over and under the star
    ctx.globalAlpha = 1;
    for (const [rx, ry, a0, a1, color, wd] of [[1.16, 1.07, Math.PI * 1.06, Math.PI * 1.94, '#fff0cf', 1.3], [1.1, 1.0, Math.PI * 0.1, Math.PI * 0.9, '#ffc27a', 0.8]] as const) {
      ctx.lineWidth = wd * 5; ctx.strokeStyle = rgba(color, 0.08);
      ctx.beginPath(); ctx.ellipse(c.x, c.y, rx * R, ry * R, TILT, a0, a1); ctx.stroke();
      ctx.lineWidth = wd; ctx.strokeStyle = rgba(color, wd > 1 ? 0.6 : 0.28);
      ctx.stroke();
    }
    ctx.lineWidth = 0.8; ctx.strokeStyle = 'rgba(255,248,230,0.3)';
    ctx.beginPath(); ctx.arc(c.x, c.y, R * 1.03, 0, TAU); ctx.stroke();

    // prominences: magnetic loops rising off the limb and falling back
    ctx.lineWidth = 1.1;
    for (const l of S.loops) {
      const life = frac(t * l.sp + l.ph), hgt = Math.sin(life * Math.PI);
      if (hgt < 0.05) continue;
      const a0 = l.ang - l.span / 2, a1 = l.ang + l.span / 2, m = R * (1.05 + hgt * l.lift * 0.45);
      ctx.strokeStyle = rgba('#ffc47a', 0.55 * hgt);
      ctx.beginPath();
      ctx.moveTo(c.x + Math.cos(a0) * R, c.y + Math.sin(a0) * R);
      ctx.quadraticCurveTo(c.x + Math.cos(l.ang) * m * 1.25, c.y + Math.sin(l.ang) * m * 1.25, c.x + Math.cos(a1) * R, c.y + Math.sin(a1) * R);
      ctx.stroke();
    }

    // HUD: a slowly turning dashed ring with counter-rotating arc brackets and ticks
    const H = R * (this.phone ? 2.7 : 3.1), branch = this.state.mode === 'branch';
    ctx.globalAlpha = branch ? 0.5 : 1;
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(GOLD, 0.2);
    ctx.setLineDash([H * 0.12, H * 0.05]); ctx.lineDashOffset = -t * H * 0.05;
    ctx.beginPath(); ctx.arc(c.x, c.y, H, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    for (let j = 0; j < 3; j++) {
      const a = t * (j % 2 ? -0.14 : 0.09) + j * 2.1;
      ctx.strokeStyle = rgba(j % 2 ? '#c3a6ff' : GOLD, 0.34);
      ctx.lineWidth = j === 0 ? 1.6 : 1;
      ctx.beginPath(); ctx.arc(c.x, c.y, H * (1.1 + j * 0.06), a, a + 0.9 + j * 0.3); ctx.stroke();
    }
    ctx.strokeStyle = rgba(GOLD, 0.3); ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * TAU + t * 0.03, r0 = H * 0.94, r1 = H * (k % 6 ? 0.97 : 0.9);
      ctx.moveTo(c.x + Math.cos(a) * r0, c.y + Math.sin(a) * r0); ctx.lineTo(c.x + Math.cos(a) * r1, c.y + Math.sin(a) * r1);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    if (this.still) return;
    // heartbeat: a shockwave across the disk plane every 6 s
    const wave = (t % 6) / 1.8;
    if (wave < 1) {
      ctx.globalAlpha = (1 - wave) ** 2;
      ctx.strokeStyle = rgba('#ffe1a8', 0.7); ctx.lineWidth = 0.8 + 2.4 * (1 - wave);
      ctx.beginPath(); ctx.ellipse(c.x, c.y, R * (1.3 + wave * 4), R * (1.3 + wave * 4) * FLAT, TILT, 0, TAU); ctx.stroke();
      ctx.strokeStyle = rgba('#c3a6ff', 0.35); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(c.x, c.y, R * (1.1 + wave * 2.4), 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // now and then a plasma arc jumps from the surface to the disk (desktop, cinematic)
    if (this.phone || !this.cinematic()) return;
    if (t > this.nextArc) {
      const a = Math.random() * TAU, e = 1.4 + Math.random() * 1.1, b = Math.random() * TAU, end = onDisk(e, a, 1, { x: 0, y: 0 });
      const pts: Point[] = [];
      for (let i = 0; i <= 10; i++) {
        const k = i / 10, jit = i && i < 10 ? (Math.random() - 0.5) * 0.22 : 0;
        const x = Math.cos(b) * (1 - k) + end.x * k, y = Math.sin(b) * (1 - k) + end.y * k;
        pts.push({ x: x - (end.y - Math.sin(b)) * jit, y: y + (end.x - Math.cos(b)) * jit });
      }
      this.arc = { t0: t, pts };
      this.nextArc = t + 2.2 + Math.random() * 4;
    }
    if (this.arc && t - this.arc.t0 < 0.28) {
      ctx.globalAlpha = 0.55 + 0.45 * Math.random();
      for (const [wd, col] of [[4, 'rgba(255,190,110,0.25)'], [1.2, 'rgba(255,246,225,0.95)']] as const) {
        ctx.lineWidth = wd; ctx.strokeStyle = col;
        ctx.beginPath();
        this.arc.pts.forEach((pt, i) => (i ? ctx.lineTo(c.x + pt.x * R, c.y + pt.y * R) : ctx.moveTo(c.x + pt.x * R, c.y + pt.y * R)));
        ctx.stroke();
      }
      const tip = this.arc.pts[this.arc.pts.length - 1];
      sprite(ctx, glow('#ffd28a', true), c.x + tip.x * R, c.y + tip.y * R, 18, 0.9);
      ctx.globalAlpha = 1;
    }
  }

  /** Energy conduits core → hub: fibre bundle, a running data stream, comet packets, and surges. */
  private drawConduits() {
    const { ctx, t } = this, branch = this.state.mode === 'branch', p = this.p;
    for (const hub of this.hubs) {
      if (hub.a < 0.02) continue;
      const lit = this.hover === hub.key || this.state.sel === hub.key;
      const A = hub.a * (branch && !lit ? 0.45 : 1);
      const a = this.edge(hub);
      const [c1, c2] = arcControls(a, hub, hub.bend);
      const path = (bend: number) => {
        const [k1, k2] = bend === hub.bend ? [c1, c2] : arcControls(a, hub, bend);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.bezierCurveTo(k1.x, k1.y, k2.x, k2.y, hub.x, hub.y);
      };
      ctx.globalAlpha = 1;
      ctx.lineWidth = 0.5;
      ctx.strokeStyle = rgba(hub.color, 0.16 * A);
      for (const off of [-0.035, 0.035]) { path(hub.bend + off); ctx.stroke(); }
      path(hub.bend);
      ctx.lineWidth = lit ? 7 : 5; ctx.strokeStyle = rgba(hub.color, (lit ? 0.11 : 0.05) * A); ctx.stroke();
      const grad = ctx.createLinearGradient(a.x, a.y, hub.x, hub.y);
      grad.addColorStop(0, rgba('#fff4e0', 0.35 * A));
      grad.addColorStop(1, rgba(hub.color, (lit ? 0.85 : 0.45) * A));
      ctx.lineWidth = lit ? 1.5 : 1; ctx.strokeStyle = grad; ctx.stroke();
      // data stream: dashes marching out of the core
      ctx.setLineDash([1.5, 9]); ctx.lineDashOffset = -t * (lit ? 70 : 34);
      ctx.lineWidth = lit ? 2 : 1.5; ctx.strokeStyle = rgba(hub.color, 0.55 * A); ctx.stroke();
      ctx.setLineDash([]);
      // comet packets
      const img = glow(hub.color, true);
      const n = this.phone ? 2 : lit ? 5 : 3, tail = this.phone ? 3 : 6;
      for (let i = 0; i < n; i++) {
        const u = frac(t * (lit ? 0.24 : 0.15) + i / n + hub.phase * 0.1), fade = Math.sin(u * Math.PI) * A;
        for (let j = 0; j < tail; j++) {
          const uj = u - j * 0.012;
          if (uj < 0) break;
          cubicAt(a, c1, c2, hub, uj, p);
          sprite(ctx, img, p.x, p.y, (lit ? 12 : 9) - j * 1.3, fade * (1 - j / tail) * 0.95);
        }
      }
      // surge: a bright pulse races along the conduit
      if (hub.surge >= 0) {
        const u = hub.surge * hub.surge * (3 - 2 * hub.surge), from = Math.max(0, u - 0.22);
        ctx.beginPath();
        for (let k = 0; k <= 12; k++) {
          cubicAt(a, c1, c2, hub, from + (u - from) * (k / 12), p);
          k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
        }
        ctx.globalAlpha = A;
        ctx.lineCap = 'round';
        ctx.lineWidth = 5; ctx.strokeStyle = rgba(hub.color, 0.25); ctx.stroke();
        ctx.lineWidth = 2; ctx.strokeStyle = rgba('#fff6e6', 0.85); ctx.stroke();
        ctx.lineCap = 'butt';
        cubicAt(a, c1, c2, hub, u, p);
        sprite(ctx, img, p.x, p.y, 30, A);
      }
    }
    ctx.globalAlpha = 1;
  }

  /** The bell's vertical offset: a gentle drift plus the push of each contraction (cards ride along). */
  private bob(h: Hub) {
    const R = (this.target?.hubR ?? 20) * h.s;
    return Math.sin(this.t * 0.9 + h.phase) * 2.5 - squeeze(this.t * 0.42 + h.phase - 0.08) * R * 0.08;
  }

  /** A bioluminescent jellyfish: translucent pulsing bell, turning meridians, glowing organs, rim lights, waving tentacles. */
  private drawJelly(h: Hub) {
    const { ctx, t } = this;
    const lit = this.hover === h.key || this.state.sel === h.key;
    const R = (this.target?.hubR ?? 20) * h.s * (lit ? 1.08 : 1);
    if (R < 2) return;
    const sq = squeeze(t * 0.42 + h.phase), fl = h.flare;
    const bw = R * (1.04 - 0.16 * sq), bh = R * (0.88 + 0.12 * sq);
    const x = h.x, rim = h.y + this.bob(h) + R * 0.3, top = rim - bh;
    const A = h.a * (lit ? 1 : 0.85), col = h.color, hot = glow(col, true);
    const rho = (s: number) => bw * Math.sin(s * Math.PI / 2) ** 0.72;
    const yAt = (s: number) => top + bh * (1 - Math.cos(s * Math.PI / 2));

    sprite(ctx, glow(col), x, rim - bh * 0.4, R * (4.4 + fl * 2.4), A * (0.3 + (lit ? 0.22 : 0) + fl * 0.45));

    // tentacles: a travelling wave, splaying out as the bell squeezes
    const tg = ctx.createLinearGradient(0, rim, 0, rim + R * 2.8);
    tg.addColorStop(0, rgba(col, 0.75)); tg.addColorStop(1, rgba(col, 0));
    ctx.strokeStyle = tg;
    const nt = this.phone ? 6 : 12;
    for (let i = 0; i < nt; i++) {
      const th = ((i + 0.5) / nt) * TAU + h.phase, front = Math.sin(th) > 0;
      const bx = x + Math.cos(th) * bw * 0.9, by = rim + Math.sin(th) * bw * 0.2;
      const L = R * (1.9 + 0.5 * Math.sin(i * 1.7 + h.phase)) * (lit ? 1.15 : 1);
      ctx.globalAlpha = A * (front ? 1 : 0.5);
      ctx.lineWidth = front ? 0.8 : 0.55;
      ctx.beginPath(); ctx.moveTo(bx, by);
      for (let k = 1; k <= 12; k++) {
        const f = k / 12;
        ctx.lineTo(bx + (bx - x) * f * (0.5 * sq - 0.25) + Math.sin(t * 2.3 - f * 5.5 + i * 1.3 + h.phase) * f * R * 0.24, by + f * L * (1 - 0.12 * sq));
      }
      ctx.stroke();
    }
    // oral arms: frilled ribbons from the centre
    for (let k = 0; k < (this.phone ? 2 : 4); k++) {
      const ox = (k - (this.phone ? 0.5 : 1.5)) * R * 0.14, L = R * (1.5 + 0.2 * (k % 2));
      for (const [wd, amp, ph, al] of [[1.6, 0.26, 0, 0.75], [0.7, 0.16, 1.7, 0.5]] as const) {
        ctx.globalAlpha = A * al; ctx.lineWidth = wd;
        ctx.beginPath(); ctx.moveTo(x + ox, rim - bh * 0.1);
        for (let s = 1; s <= 12; s++) {
          const f = s / 12;
          ctx.lineTo(x + ox * (1 + f) + Math.sin(t * 1.8 - f * 5 + k * 2 + ph) * f * R * amp, rim - bh * 0.1 + f * L);
        }
        ctx.stroke();
      }
    }

    // bell: dome silhouette with scalloped rim, translucent fill
    ctx.beginPath();
    for (let k = 0; k <= 10; k++) { const s = 1 - k / 10; k ? ctx.lineTo(x - rho(s), yAt(s)) : ctx.moveTo(x - rho(s), yAt(s)); }
    for (let k = 1; k <= 10; k++) { const s = k / 10; ctx.lineTo(x + rho(s), yAt(s)); }
    const lappets = 8;
    for (let k = 1; k <= lappets; k++) {
      const a0 = ((k - 1) / lappets) * Math.PI, a1 = (k / lappets) * Math.PI, am = (a0 + a1) / 2;
      ctx.quadraticCurveTo(x + Math.cos(am) * bw * 0.98, rim + Math.sin(am) * bw * 0.22 + R * 0.12, x + Math.cos(a1) * bw, rim + Math.sin(a1) * bw * 0.22);
    }
    ctx.closePath();
    const fill = ctx.createRadialGradient(x, top + bh * 0.4, 0, x, top + bh * 0.4, bw * 1.25);
    fill.addColorStop(0, rgba(col, 0.42)); fill.addColorStop(0.55, rgba(col, 0.1)); fill.addColorStop(0.88, rgba(col, 0.3)); fill.addColorStop(1, rgba(col, 0.05));
    ctx.globalAlpha = A * (1 + fl * 0.5); ctx.fillStyle = fill; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = rgba(col, 0.12 + fl * 0.15); ctx.stroke();
    ctx.lineWidth = 1; ctx.strokeStyle = rgba(col, 0.9); ctx.stroke();

    // turning meridians and two parallels give it volume
    ctx.lineWidth = 0.6;
    const nm = this.phone ? 5 : 8;
    for (let m = 0; m < nm; m++) {
      const u = (m / nm) * TAU + t * 0.35 + h.phase, cu = Math.cos(u), su = Math.sin(u);
      ctx.globalAlpha = A * (su > 0 ? 0.45 : 0.13);
      ctx.strokeStyle = col;
      ctx.beginPath();
      for (let k = 0; k <= 8; k++) { const s = k / 8, r = rho(s), px = x + r * cu, py = yAt(s) + r * 0.22 * su; k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
      ctx.stroke();
    }
    ctx.globalAlpha = A * 0.25;
    for (const s of [0.5, 0.78]) { ctx.beginPath(); ctx.ellipse(x, yAt(s), rho(s), rho(s) * 0.22, 0, 0, TAU); ctx.stroke(); }

    // organs: four glowing gonads turning with the bell, a bright mouth, a glassy sheen
    for (let k = 0; k < 4; k++) {
      const u = k * Math.PI / 2 + t * 0.35 + h.phase + Math.PI / 4, r = rho(0.62) * 0.45;
      sprite(ctx, glow(col), x + Math.cos(u) * r, yAt(0.62) + Math.sin(u) * r * 0.22, R * 0.62, A * (Math.sin(u) > 0 ? 0.7 : 0.35) * (0.8 + 0.4 * sq));
    }
    sprite(ctx, hot, x, rim - bh * 0.18, R * (0.7 + 0.25 * sq), A * (0.55 + 0.3 * sq + fl * 0.4));
    sprite(ctx, glow('#ffffff'), x - bw * 0.35, top + bh * 0.3, R * 0.55, A * 0.22);

    // rim lights: a ripple of light chasing round the margin
    const nb = this.phone ? 8 : 14;
    for (let i = 0; i < nb; i++) {
      const th = (i / nb) * TAU, chase = Math.max(0, Math.sin(th - t * 3.2 + h.phase)) ** 6;
      const b = Math.min(1, 0.22 + 0.78 * chase + fl);
      sprite(ctx, hot, x + Math.cos(th) * bw, rim + Math.sin(th) * bw * 0.22, 3.5 + 4 * chase + fl * 3, A * b * (Math.sin(th) > 0 ? 1 : 0.5));
    }
    // luminous motes drifting down from the tentacles
    for (let k = 0; k < (this.phone ? 2 : 4); k++) {
      const life = frac(t * 0.2 + k / 4 + h.phase);
      sprite(ctx, hot, x + Math.sin(k * 2.3 + h.phase) * bw * 0.7 + Math.sin(t * 1.3 + k) * 3, rim + R * (1 + life * 2.4), 4, A * Math.sin(life * Math.PI) * 0.7);
    }
    // lock-on brackets around the open folder
    if (this.state.sel === h.key) {
      const cy = rim - bh * 0.3, rr = R * 1.9 + Math.sin(t * 3) * 1.5;
      ctx.globalAlpha = A * 0.75; ctx.strokeStyle = col; ctx.lineWidth = 1.2;
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * TAU + Math.PI / 4 + t * 0.5;
        ctx.beginPath(); ctx.arc(x, cy, rr, a - 0.28, a + 0.28); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
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
        ctx.globalAlpha = 1;
        ctx.strokeStyle = rgba(s.color, 0.8 * (1 - u) ** 1.5);
        ctx.lineWidth = 2.6 * (1 - u) + 0.4;
        ctx.beginPath(); ctx.arc(x, y, Rmax * (1 - (1 - u) ** 3) * (1 - k * 0.18), 0, TAU); ctx.stroke();
      }
      const f = Math.max(0, 1 - (this.t - s.t0) / 0.45);
      sprite(ctx, glow(s.color), x, y, 60 + 120 * (1 - f), f);
    }
    ctx.globalAlpha = 1;
  }

  /** Branch mode: fibres grow from a splitter node beside the open folder's card to every visible note row. */
  private drawFibres() {
    const sel = this.state.sel === null ? null : this.host.cards.get(this.state.sel);
    const list = this.host.list();
    if (!sel || !list) return;
    const { ctx, t } = this, p = this.p;
    const origin = this.canvas.getBoundingClientRect();
    const cr = sel.getBoundingClientRect(), lr = list.getBoundingClientRect();
    if (!lr.width || !cr.width) return; // list covered by the note card (narrow panes)
    const hub = this.hubByKey.get(this.state.sel!)!;
    const cardX = cr.right - origin.left, j = { x: cardX + 22, y: cr.top + cr.height / 2 - origin.top };
    const ex = lr.left - origin.left - 2;
    if (ex - j.x < 24) return;
    const img = glow(hub.color, true), white = glow('#ffffff', true);
    const grow = this.still ? Infinity : t - this.fibreT0;
    // stub card → splitter
    ctx.globalAlpha = 1; ctx.lineWidth = 1.2; ctx.strokeStyle = rgba(hub.color, 0.7);
    ctx.beginPath(); ctx.moveTo(cardX, j.y); ctx.lineTo(j.x, j.y); ctx.stroke();

    const rows = this.host.rows().map(row => ({ id: row.id, r: row.el.getBoundingClientRect() }))
      .filter(({ r }) => !(r.bottom < lr.top + 4 || r.top > lr.bottom - 4));
    const stagger = Math.min(0.035, 0.5 / Math.max(1, rows.length));
    rows.forEach(({ id, r }, i) => {
      const prog = clamp01((grow - 0.12 - i * stagger) / 0.45);
      if (prog <= 0) return;
      const u = 1 - (1 - prog) ** 3;
      const e = { x: ex, y: r.top + r.height / 2 - origin.top };
      const mid = (e.x - j.x) * 0.5;
      const c1 = { x: j.x + mid, y: j.y }, c2 = { x: e.x - mid, y: e.y };
      const on = id === this.state.active, hov = id === this.hoverRow;
      ctx.beginPath();
      const steps = Math.max(2, Math.ceil(28 * u));
      for (let k = 0; k <= steps; k++) { cubicAt(j, c1, c2, e, (k / steps) * u, p); k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }
      ctx.globalAlpha = 1;
      if (on || hov) { ctx.lineWidth = 6; ctx.strokeStyle = rgba(hub.color, on ? 0.16 : 0.1); ctx.stroke(); }
      ctx.lineWidth = on ? 1.6 : hov ? 1.2 : 0.8;
      ctx.strokeStyle = rgba(hub.color, on ? 0.9 : hov ? 0.6 : 0.22);
      ctx.stroke();
      if (u < 0.999) { sprite(ctx, white, p.x, p.y, 10, 0.95); return; } // growing tip
      const n = on ? 3 : hov ? 2 : 1;
      for (let m = 0; m < n; m++) {
        const v = frac(t * (on ? 0.55 : 0.2) + i * 0.137 + m / n);
        for (let k = 0; k < 3; k++) {
          const vk = v - k * 0.02;
          if (vk < 0) break;
          cubicAt(j, c1, c2, e, vk, p);
          sprite(ctx, img, p.x, p.y, (on ? 11 : 7) - k * 1.5, (on ? 1 : 0.7) * (1 - k / 3) * (0.3 + 0.7 * Math.sin(v * Math.PI)));
        }
      }
      sprite(ctx, img, e.x, e.y, on ? 18 : hov ? 13 : 8, on ? 1 : 0.75);
      if (on) {
        ctx.globalAlpha = 0.8; ctx.strokeStyle = hub.color; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(e.x, e.y, 6 + Math.sin(t * 4) * 1.5, 0, TAU); ctx.stroke();
      }
    });
    // splitter node: a glowing junction with turning rings
    const on = clamp01(grow / 0.3);
    sprite(ctx, img, j.x, j.y, 38, on);
    sprite(ctx, white, j.x, j.y, 12, on);
    ctx.globalAlpha = on * 0.8; ctx.strokeStyle = hub.color; ctx.lineWidth = 1;
    for (let k = 0; k < 3; k++) { const a = t * 2 + (k / 3) * TAU; ctx.beginPath(); ctx.arc(j.x, j.y, 9, a, a + 1.3); ctx.stroke(); }
    ctx.globalAlpha = on * 0.35; ctx.setLineDash([2, 3]); ctx.lineDashOffset = t * 6;
    ctx.beginPath(); ctx.arc(j.x, j.y, 15 + Math.sin(t * 2.4) * 1.5, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  /** Cards follow their hubs: under it in the overview, to its right when a folder is open. */
  private placeCards() {
    const side = this.target?.cardSide ?? 'below';
    const hubR = this.target?.hubR ?? 20;
    for (const h of this.hubs) {
      const el = this.host.cards.get(h.key);
      if (!el) continue;
      const y = h.y + this.bob(h);
      const tf = side === 'below'
        ? `translate3d(${h.x.toFixed(1)}px,${(y + hubR * h.s * 1.55).toFixed(1)}px,0) translateX(-50%)`
        : `translate3d(${(h.x + hubR * h.s * 1.4).toFixed(1)}px,${y.toFixed(1)}px,0) translateY(-50%)`;
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
  /** A note row under the pointer: its fibre brightens. */
  setHoverRow(id: string | null) {
    if (this.hoverRow === id) return;
    this.hoverRow = id;
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

/** Fixed parts of the star: disk particles and rings, corona streamers, prominence loops. */
function makeStar() {
  const r = rng(42);
  const TINTS = ['#fff6e2', '#ffe0a0', '#f8b860', '#f08a5a', '#d877b8'];
  const disk = Array.from({ length: 200 }, () => {
    const e = 1.35 + r() ** 0.8 * 1.5;
    return { e, a0: r() * TAU, w: 0.5 + r() * 0.8, tint: TINTS[Math.min(4, Math.floor(((e - 1.35) / 1.5) * 5))] };
  });
  const rings = Array.from({ length: 9 }, (_, i) => {
    const k = i / 8;
    return { e: 1.4 + k * 1.4, w: i % 3 ? 0.5 : 0.9, a: 0.26 - k * 0.16, color: TINTS[Math.min(4, Math.floor(k * 4.99))] };
  });
  const rays = Array.from({ length: 64 }, () => ({ ang: r() * TAU, off: r(), sp: 0.06 + r() * 0.12, len: 0.2 + r() * 0.6, warm: r() < 0.7 }));
  const loops = Array.from({ length: 6 }, (_, i) => ({ ang: (i / 6) * TAU + r(), span: 0.25 + r() * 0.25, lift: 0.3 + r() * 0.5, sp: 0.08 + r() * 0.1, ph: r() }));
  return { disk, rings, rays, loops };
}
