/**
 * Planets for the galaxy (星图, PRD 2.4): one procedural world per folder, lit by the star.
 * Surface textures are generated once per (kind, colour) into small tileable canvases and
 * scrolled to spin; a light-facing night-side gradient, atmosphere rim, rings and moons give
 * depth. Canvas 2D only, no assets.
 */
export type PlanetKind = 'gas' | 'ice' | 'lava' | 'ocean' | 'rock' | 'storm';
export const PLANET_KINDS: PlanetKind[] = ['gas', 'ocean', 'lava', 'ice', 'storm', 'rock'];

export interface Planet {
  kind: PlanetKind;
  color: string;
  ringed: boolean;
  moons: number;
  tilt: number; // axial / ring tilt, radians
  spin: number; // texture turns per minute
  seed: number;
}

const TAU = Math.PI * 2;
const W = 256, H = 128;

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

/** Stable look per folder: the kind follows the folder name; big folders wear rings and keep more moons. */
export function planetFor(key: string, color: string, count: number, index: number): Planet {
  const h = hash(key || '\u0000root');
  const kind = PLANET_KINDS[(h + index) % PLANET_KINDS.length];
  return {
    kind, color,
    ringed: kind === 'gas' || count >= 15,
    moons: count === 0 ? 0 : Math.min(3, 1 + Math.floor(count / 12)),
    tilt: -0.5 + ((h >>> 8) % 100) / 100 * 0.6,
    spin: 1.2 + ((h >>> 16) % 100) / 100 * 1.6,
    seed: h,
  };
}

/** Planet size factor from the note count: small folders are moons-sized worlds, big ones giants. */
export const planetScale = (count: number) => 0.78 + 0.44 * Math.min(1, Math.log2(1 + count) / Math.log2(41));

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Value noise that wraps horizontally with period `px` lattice cells (so textures tile when spun). */
function noiseField(seed: number) {
  const G = 128, r = rng(seed), lat = Float32Array.from({ length: G * G }, () => r());
  return (x: number, y: number, px: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const at = (i: number, j: number) => lat[(((j % G) + G) % G) * G + ((((i % px) + px) % px) % G)];
    const a = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * u, b = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * u;
    return a + (b - a) * v;
  };
}

const rgbOf = (hex: string) => { const v = parseInt(hex.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
const mix = (a: number[], b: number[], k: number) => a.map((x, i) => x + (b[i] - x) * k);

interface Tex { surface: HTMLCanvasElement; glow?: HTMLCanvasElement; clouds?: HTMLCanvasElement }
const texCache = new Map<string, Tex>();

/** Surface (and emissive / cloud layers) for a planet, cached per kind + colour + seed. */
function textures(p: Planet): Tex {
  const key = `${p.kind}|${p.color}|${p.seed}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const n = noiseField(p.seed);
  const fbm = (x: number, y: number, oct = 4, base = 8) => {
    let v = 0, amp = 0.5, f = base;
    for (let o = 0; o < oct; o++) { v += amp * n((x / W) * f, (y / H) * f * 0.5, f); amp *= 0.5; f *= 2; }
    return v / 0.94;
  };
  const make = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const paint = (c: HTMLCanvasElement, px: (x: number, y: number) => number[]) => {
    const g = c.getContext('2d')!, img = g.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const [r, gg, b, a = 255] = px(x, y), i = (y * W + x) * 4;
      img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = a;
    }
    g.putImageData(img, 0, 0);
    return c;
  };
  const col = rgbOf(p.color), white = [255, 255, 255], dark = mix(col, [6, 6, 12], 0.78), deep = mix(col, [4, 6, 18], 0.6);
  const out: Tex = { surface: make() };
  switch (p.kind) {
    case 'gas':
    case 'storm': {
      const bands = p.kind === 'gas' ? 7 : 11;
      paint(out.surface, (x, y) => {
        const v = y / H, warp = fbm(x, y, 4, 6) * (p.kind === 'gas' ? 2.2 : 3.4);
        const b = 0.5 + 0.5 * Math.sin(v * Math.PI * bands + warp * 2.6);
        let c = mix(mix(dark, col, 0.55 + 0.45 * b), white, 0.18 * b * b);
        if (p.kind === 'storm') {
          const ex = (x - W * 0.35) / 18, ey = (y - H * 0.6) / 9, e = ex * ex + ey * ey;
          if (e < 1) c = mix(c, mix(col, white, 0.55), (1 - e) * 0.8 * (0.6 + 0.4 * Math.sin(Math.atan2(ey, ex) * 3 + e * 6)));
        }
        return c;
      });
      break;
    }
    case 'ocean': {
      paint(out.surface, (x, y) => {
        const k = fbm(x, y, 5, 5), v = Math.abs(y / H - 0.5) * 2;
        if (v > 0.86) return mix(white, col, 0.25);
        return k > 0.56 ? mix(mix(col, [70, 90, 60], 0.45), white, (k - 0.56) * 1.2) : mix(deep, col, k * 0.9);
      });
      out.clouds = paint(make(), (x, y) => {
        const k = fbm(x + 40, y, 5, 7);
        return [255, 255, 255, Math.max(0, k - 0.52) * 520];
      });
      break;
    }
    case 'lava': {
      const crack = (x: number, y: number) => 1 - Math.abs(n((x / W) * 12, (y / H) * 6, 12) * 2 - 1) * 0.65 - Math.abs(n((x / W) * 24, (y / H) * 12, 24) * 2 - 1) * 0.35;
      paint(out.surface, (x, y) => mix(mix([22, 13, 11], dark, 0.6), mix(dark, col, 0.25), fbm(x, y, 4, 6)));
      out.glow = paint(make(), (x, y) => {
        const c = crack(x, y), k = Math.max(0, c - 0.9) / 0.1;
        return [...mix([255, 120, 40], mix(col, white, 0.4), 0.35), Math.min(255, k * 255 * 1.4)];
      });
      break;
    }
    case 'ice': {
      paint(out.surface, (x, y) => {
        const k = fbm(x, y, 5, 6), c = 1 - Math.abs(fbm(x + 90, y, 4, 12) * 2 - 1);
        return mix(mix(mix(col, white, 0.62), white, k * 0.3), mix(col, [20, 40, 80], 0.5), Math.max(0, c - 0.82) * 3);
      });
      break;
    }
    default: {
      const r = rng(p.seed ^ 0x9e3779b9);
      const craters = Array.from({ length: 26 }, () => ({ x: r() * W, y: 10 + r() * (H - 20), s: 3 + r() ** 2 * 14 }));
      paint(out.surface, (x, y) => {
        let k = fbm(x, y, 5, 7);
        for (const c of craters) {
          const dx = Math.min(Math.abs(x - c.x), W - Math.abs(x - c.x)), d = Math.hypot(dx, y - c.y) / c.s;
          if (d < 1.15) k += d < 1 ? -0.18 * (1 - d * d) : 0.12;
        }
        return mix(mix(dark, col, 0.25), mix(col, white, 0.35), Math.max(0, Math.min(1, k)));
      });
    }
  }
  texCache.set(key, out);
  return out;
}

const rgba = (hex: string, a: number) => { const [r, g, b] = rgbOf(hex); return `rgba(${r},${g},${b},${Math.max(0, a).toFixed(3)})`; };

/** Draw a spinning texture strip inside the planet disc (two copies so the seam never shows). */
function strip(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, R: number, phase: number) {
  const w = R * 4, off = (phase % 1) * w;
  ctx.drawImage(img, -R * 2 - off, -R, w, R * 2);
  ctx.drawImage(img, -R * 2 - off + w, -R, w, R * 2);
}

export interface PlanetFrame {
  x: number; y: number; R: number; alpha: number;
  lx: number; ly: number; // unit vector towards the star
  t: number; lit: boolean; flare: number; phone: boolean;
  glow: (color: string, hot?: boolean) => HTMLCanvasElement;
}

/** Rings: concentric half ellipses; `front` = the half nearer to us (lower). */
function rings(ctx: CanvasRenderingContext2D, p: Planet, f: PlanetFrame, front: boolean) {
  const { x, y, R } = f;
  const tint = rgbOf(p.color), light = mix(tint, [255, 245, 225], 0.55);
  ctx.lineCap = 'butt';
  for (let k = 0; k < 7; k++) {
    const e = 1.42 + k * 0.13, a = (k === 2 || k === 5 ? 0.08 : 0.32 - k * 0.025) * f.alpha * (front ? 1 : 0.75);
    ctx.strokeStyle = `rgba(${light.map(Math.round).join(',')},${a.toFixed(3)})`;
    ctx.lineWidth = R * 0.11;
    ctx.beginPath(); ctx.ellipse(x, y, R * e, R * e * 0.26, p.tilt, front ? 0 : Math.PI, front ? Math.PI : TAU); ctx.stroke();
  }
}

/** Moons on a tilted orbit; returns nothing, draws only the ones on the requested side. */
function moons(ctx: CanvasRenderingContext2D, p: Planet, f: PlanetFrame, front: boolean) {
  const { x, y, R, t } = f;
  for (let i = 0; i < p.moons; i++) {
    const rx = R * (2.05 + i * 0.5), ry = rx * 0.3, a = t * (0.5 - i * 0.12) + i * 2.2 + (p.seed % 7);
    const s = Math.sin(a);
    if ((s > 0) !== front) continue;
    const ct = Math.cos(p.tilt), st = Math.sin(p.tilt), ox = Math.cos(a) * rx, oy = s * ry;
    const mx = x + ox * ct - oy * st, my = y + ox * st + oy * ct, mr = Math.max(1.6, R * (0.13 - i * 0.02));
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = f.alpha;
    const g = ctx.createRadialGradient(mx + f.lx * mr * 0.5, my + f.ly * mr * 0.5, 0, mx, my, mr * 1.1);
    g.addColorStop(0, '#f4f1ea'); g.addColorStop(0.55, '#8d8a86'); g.addColorStop(1, '#141418');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = f.alpha * 0.35;
    ctx.drawImage(f.glow('#e8e4ff'), mx - mr * 2.5, my - mr * 2.5, mr * 5, mr * 5);
  }
}

/** Faint orbit paths for the moons (behind everything). */
function orbits(ctx: CanvasRenderingContext2D, p: Planet, f: PlanetFrame) {
  ctx.lineWidth = 0.6;
  ctx.strokeStyle = rgba(p.color, (f.lit ? 0.3 : 0.14) * f.alpha);
  ctx.globalAlpha = 1;
  for (let i = 0; i < p.moons; i++) {
    const rx = f.R * (2.05 + i * 0.5);
    ctx.beginPath(); ctx.ellipse(f.x, f.y, rx, rx * 0.3, p.tilt, 0, TAU); ctx.stroke();
  }
}

/** One planet, lit from (lx, ly). Leaves the context in 'lighter' mode. */
export function drawPlanet(ctx: CanvasRenderingContext2D, p: Planet, f: PlanetFrame) {
  const { x, y, R, t, alpha } = f;
  if (R < 1.5 || alpha < 0.02) return;
  const tex = textures(p);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = alpha * (0.32 + (f.lit ? 0.2 : 0) + f.flare * 0.4);
  const halo = R * (3.4 + f.flare * 1.6);
  ctx.drawImage(f.glow(p.color), x - halo / 2, y - halo / 2, halo, halo);
  orbits(ctx, p, f);
  if (!f.phone) moons(ctx, p, f, false);
  ctx.globalCompositeOperation = 'lighter';
  if (p.ringed) rings(ctx, p, f, false);

  // body
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = alpha;
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.clip();
  ctx.fillStyle = '#05060a'; ctx.fillRect(x - R, y - R, R * 2, R * 2);
  ctx.translate(x, y); ctx.rotate(p.tilt * 0.6);
  const turn = (t * p.spin) / 60;
  strip(ctx, tex.surface, R, turn);
  if (tex.clouds) { ctx.globalAlpha = alpha * 0.75; strip(ctx, tex.clouds, R, turn * 1.35 + 0.3); ctx.globalAlpha = alpha; }
  ctx.restore();
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.clip();
  // night side: darkness grows away from the star; a soft terminator
  const cx = x + f.lx * R * 0.85, cy = y + f.ly * R * 0.85;
  const night = ctx.createRadialGradient(cx, cy, R * 0.15, cx, cy, R * 2.05);
  night.addColorStop(0, 'rgba(0,0,0,0)'); night.addColorStop(0.42, 'rgba(2,2,8,0.18)');
  night.addColorStop(0.62, 'rgba(2,2,8,0.82)'); night.addColorStop(1, 'rgba(1,1,4,0.96)');
  ctx.globalAlpha = alpha; ctx.fillStyle = night; ctx.fillRect(x - R, y - R, R * 2, R * 2);
  // emissive cracks shine on the night side too
  if (tex.glow) {
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = alpha * (0.75 + 0.25 * Math.sin(t * 1.7));
    ctx.translate(x, y); ctx.rotate(p.tilt * 0.6); strip(ctx, tex.glow, R, turn);
  }
  ctx.restore();

  // atmosphere: a bright crescent on the day side, a faint rim all round
  ctx.globalCompositeOperation = 'lighter';
  const a0 = Math.atan2(f.ly, f.lx), rim = rgbOf(p.color), rimL = mix(rim, [255, 255, 255], 0.5).map(Math.round).join(',');
  ctx.globalAlpha = alpha;
  ctx.lineWidth = R * 0.22; ctx.strokeStyle = `rgba(${rim.join(',')},0.14)`;
  ctx.beginPath(); ctx.arc(x, y, R * 1.04, a0 - 1.5, a0 + 1.5); ctx.stroke();
  ctx.lineWidth = Math.max(1, R * 0.05); ctx.strokeStyle = `rgba(${rimL},${(0.75 + f.flare * 0.25).toFixed(3)})`;
  ctx.beginPath(); ctx.arc(x, y, R * 1.005, a0 - 1.25, a0 + 1.25); ctx.stroke();
  ctx.lineWidth = 0.8; ctx.strokeStyle = `rgba(${rim.join(',')},0.22)`;
  ctx.beginPath(); ctx.arc(x, y, R * 1.01, 0, TAU); ctx.stroke();
  if (p.kind === 'ocean' || p.kind === 'ice') {
    ctx.globalAlpha = alpha * 0.35;
    const s = R * 0.7;
    ctx.drawImage(f.glow('#ffffff'), x + f.lx * R * 0.5 - s / 2, y + f.ly * R * 0.5 - s / 2, s, s);
  }
  if (p.ringed) rings(ctx, p, f, true);
  if (!f.phone) moons(ctx, p, f, true);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 1;
}
