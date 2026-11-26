import { INKS, type InkKind } from './config';
import { chaikin, cumLengths, resample, type BP, type Vec } from './math';
import { gauss, mulberry32, noise1, range, type RNG } from './rng';
import { normals, polyPath, rgba } from './render/brush';

/** Brush outline with a blunt start and a tapered tail. */
export function strokeOutline(pts: BP[], taperOut: boolean, seed: number): Vec[] {
  const cum = cumLengths(pts);
  const L = cum[cum.length - 1] || 1;
  const ns = normals(pts);
  const tin = Math.min(14, L * 0.2);
  const tout = Math.min(46, L * 0.35);
  const left: Vec[] = [];
  const right: Vec[] = [];
  for (let i = 0; i < pts.length; i++) {
    const s = cum[i];
    let prof = Math.pow(Math.min(1, s / Math.max(tin, 0.01)), 0.45);
    if (taperOut) prof *= Math.pow(Math.min(1, (L - s) / Math.max(tout, 0.01)), 0.7);
    const hw = (pts[i].w * Math.max(prof, 0.08) * (1 + (noise1(s * 0.06, seed) - 0.5) * 0.3)) / 2;
    left.push({ x: pts[i].x + ns[i].x * hw, y: pts[i].y + ns[i].y * hw });
    right.push({ x: pts[i].x - ns[i].x * hw, y: pts[i].y - ns[i].y * hw });
  }
  if (!taperOut && pts.length > 1) {
    // round wet end while painting
    const last = pts[pts.length - 1];
    const n = ns[ns.length - 1];
    const hw = last.w / 2;
    const cap: Vec[] = [];
    for (let k = 1; k < 8; k++) {
      const a = (k / 8) * Math.PI;
      cap.push({ x: last.x + n.x * Math.cos(a) * hw + n.y * Math.sin(a) * hw, y: last.y + n.y * Math.cos(a) * hw - n.x * Math.sin(a) * hw });
    }
    return left.concat(cap, right.reverse());
  }
  return left.concat(right.reverse());
}

function vertexNormals(poly: Vec[]): Vec[] {
  const out: Vec[] = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[(i - 1 + n) % n];
    const b = poly[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l = Math.hypot(dx, dy) || 1;
    out.push({ x: dy / l, y: -dx / l });
  }
  return out;
}

/** Push each vertex along its normal by smooth noise + a little jitter. */
function deform(poly: Vec[], ns: Vec[], amp: number, r: RNG, seed: number, freq: number): Vec[] {
  return poly.map((p, i) => {
    const k = ((noise1(i * freq, seed) - 0.5) * 2 + gauss(r) * 0.25) * amp;
    return { x: p.x + ns[i].x * k, y: p.y + ns[i].y * k };
  });
}

type Sprite = { canvas: HTMLCanvasElement; x: number; y: number; s: number };

function laplacian(pts: BP[], iters: number): BP[] {
  let p = pts;
  for (let k = 0; k < iters; k++) {
    const out = p.slice();
    for (let i = 1; i < p.length - 1; i++) {
      out[i] = {
        x: p[i - 1].x * 0.25 + p[i].x * 0.5 + p[i + 1].x * 0.25,
        y: p[i - 1].y * 0.25 + p[i].y * 0.5 + p[i + 1].y * 0.25,
        w: p[i].w,
      };
    }
    p = out;
  }
  return p;
}

function spriteCanvas(bx: number, by: number, w: number, h: number, scale: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w * scale));
  c.height = Math.max(1, Math.ceil(h * scale));
  const ctx = c.getContext('2d')!;
  ctx.setTransform(scale, 0, 0, scale, -bx * scale, -by * scale);
  return { c, ctx };
}

function drawSprite(ctx: CanvasRenderingContext2D, sp: Sprite, grow = 1) {
  const w = sp.canvas.width / sp.s;
  const h = sp.canvas.height / sp.s;
  ctx.drawImage(sp.canvas, sp.x - (w * (grow - 1)) / 2, sp.y - (h * (grow - 1)) / 2, w * grow, h * grow);
}

export const DRY_TIME = 0.9;

export class Stroke {
  pts: BP[];
  cum: number[];
  length: number;
  bbox = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  surface: Vec[] = []; // walkable top for vermilion
  sprite: Sprite | null = null;
  wet: Sprite | null = null;
  glow: Sprite | null = null;
  washes: { x: number; y: number; r: number }[] = [];
  seed: number;
  age = 0;
  bornT = 0;
  cost: number;
  rideCooldown = 0;
  /** glow strength, and the wet bloom up to 1 (portals: a waiting ring has none, a linked ring breathes) */
  glowK = 1;
  /** rain hooks (src/mechanics/rain.ts): painted in a rain zone, so it washes; washed = no longer solid */
  inRain = false;
  washed = false;

  constructor(
    public kind: InkKind,
    raw: BP[],
    cost: number,
    seed?: number,
  ) {
    this.cost = cost;
    this.seed = seed ?? Math.floor(Math.random() * 1e9);
    let p = resample(raw, 5);
    p = laplacian(p, 3);
    p = chaikin(p, 1);
    p = resample(p, 4);
    this.pts = p;
    this.cum = cumLengths(p);
    this.length = this.cum[this.cum.length - 1];
    for (const q of p) {
      this.bbox.x0 = Math.min(this.bbox.x0, q.x - q.w);
      this.bbox.y0 = Math.min(this.bbox.y0, q.y - q.w);
      this.bbox.x1 = Math.max(this.bbox.x1, q.x + q.w);
      this.bbox.y1 = Math.max(this.bbox.y1, q.y + q.w);
    }
    if (kind === 'shu') {
      this.surface = resample(p, 8).map((q) => ({ x: q.x, y: q.y - q.w * 0.32 }));
    }
    const r = mulberry32(this.seed + 5);
    for (let s = 0; s < this.length; s += 110) {
      const q = p[Math.min(p.length - 1, Math.round((s / Math.max(1, this.length)) * (p.length - 1)))];
      this.washes.push({ x: q.x + range(r, -20, 20), y: q.y + range(r, -10, 30), r: range(r, 70, 120) });
    }
  }

  /** Bake the dried watercolor look (plus the wet bleed and gold glow) into sprites. */
  bake(scale: number) {
    const def = INKS[this.kind];
    const pad = 40;
    const bx = this.bbox.x0 - pad;
    const by = this.bbox.y0 - pad;
    const w = this.bbox.x1 - this.bbox.x0 + pad * 2;
    const h = this.bbox.y1 - this.bbox.y0 + pad * 2;

    const main = spriteCanvas(bx, by, w, h, scale);
    paintWatercolor(main.ctx, this.pts, this.kind, this.seed, true);
    this.sprite = { canvas: main.c, x: bx, y: by, s: scale };

    // wet bleed: a fat, blurred bloom of pigment that spreads and soaks in
    const wet = spriteCanvas(bx, by, w, h, scale);
    wet.ctx.filter = `blur(${Math.max(1, 5 * scale)}px)`;
    wet.ctx.fillStyle = rgba(def.color, 0.75);
    polyPath(wet.ctx, strokeOutline(this.pts.map((q) => ({ ...q, w: q.w * 1.9 })), true, this.seed));
    wet.ctx.fill();
    wet.ctx.fillStyle = rgba(def.light, 0.6);
    polyPath(wet.ctx, strokeOutline(this.pts.map((q) => ({ ...q, w: q.w * 0.7 })), true, this.seed + 1));
    wet.ctx.fill();
    this.wet = { canvas: wet.c, x: bx, y: by, s: scale };

    // colored halo: a bright flash when the stroke lands, then a soft lasting aura
    const glow = spriteCanvas(bx, by, w, h, scale);
    glow.ctx.filter = `blur(${Math.max(1, 12 * scale)}px)`;
    glow.ctx.fillStyle = this.kind === 'kin' ? 'rgba(255,196,70,0.95)' : rgba(def.light, 0.9);
    polyPath(glow.ctx, strokeOutline(this.pts.map((q) => ({ ...q, w: q.w * 2.2 })), true, this.seed));
    glow.ctx.fill();
    this.glow = { canvas: glow.c, x: bx, y: by, s: scale };
  }

  /** 0 → just painted, 1 → dry */
  get dryness() {
    return Math.min(1, this.age / DRY_TIME);
  }

  draw(ctx: CanvasRenderingContext2D, glowPulse = 0.8) {
    if (!this.sprite) return;
    const k = this.dryness;
    const e = 1 - Math.pow(1 - k, 3);
    // landing "pop": a quick overshoot in size and a bright flash that settles
    const flash = Math.max(0, 1 - this.age / 0.55);
    const pop = 1 + 0.07 * Math.sin(Math.min(1, this.age / 0.32) * Math.PI) * (1 - Math.min(1, this.age / 0.32) * 0.5);
    if (this.glow && this.glowK > 0) {
      const rest = this.kind === 'kin' ? glowPulse * (0.4 + 0.6 * e) : 0.3;
      ctx.globalAlpha = Math.min(1, (rest + flash * 0.9) * this.glowK);
      drawSprite(ctx, this.glow, 1 + flash * 0.12);
    }
    if (this.wet && k < 1 && this.glowK > 0) {
      ctx.globalAlpha = (1 - e) * 0.85 * Math.min(1, this.glowK);
      drawSprite(ctx, this.wet, 1 + 0.1 * e);
    }
    ctx.globalAlpha = 0.6 + 0.4 * e;
    drawSprite(ctx, this.sprite, pop);
    ctx.globalAlpha = 1;
  }

  /** faint pigment that has bled into the paper around the stroke (draw with multiply) */
  drawWash(ctx: CanvasRenderingContext2D) {
    const def = INKS[this.kind];
    const k = Math.min(1, this.age / 2.5);
    if (k <= 0) return;
    for (const w of this.washes) {
      const g = ctx.createRadialGradient(w.x, w.y, 2, w.x, w.y, w.r * (0.6 + 0.4 * k));
      g.addColorStop(0, rgba(def.color, 0.2 * k));
      g.addColorStop(1, rgba(def.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function paintWatercolor(ctx: CanvasRenderingContext2D, pts: BP[], kind: InkKind, seed: number, taper: boolean) {
  const def = INKS[kind];
  const r = mulberry32(seed);
  const base = strokeOutline(pts, taper, seed);
  if (base.length < 3) return;
  const ns = vertexNormals(base);
  const avgW = pts.reduce((a, p) => a + p.w, 0) / pts.length;

  // 1. soft bleeding halo
  const halo = deform(base, ns, avgW * 0.3, r, seed + 1, 0.035);
  ctx.fillStyle = rgba(def.color, 0.1);
  polyPath(ctx, halo);
  ctx.fill();

  // 2. stacked translucent glazes, each a slightly different blob
  const layers = 26;
  for (let k = 0; k < layers; k++) {
    const poly = deform(base, ns, avgW * range(r, 0.04, 0.2), r, seed + 10 + k * 7, range(r, 0.03, 0.09));
    ctx.fillStyle = rgba(k % 6 === 0 ? def.light : def.color, 0.11);
    polyPath(ctx, poly);
    ctx.fill();
  }

  // 3. pigment granulation, clipped to the stroke
  ctx.save();
  polyPath(ctx, base);
  ctx.clip();
  const L = pts.length;
  ctx.fillStyle = rgba(def.dark, 0.1);
  for (let k = 0; k < L * 4; k++) {
    const p = pts[Math.floor(r() * L)];
    const x = p.x + gauss(r) * p.w * 0.35;
    const y = p.y + gauss(r) * p.w * 0.35;
    ctx.beginPath();
    ctx.arc(x, y, range(r, 0.3, 1.3), 0, Math.PI * 2);
    ctx.fill();
  }
  // backrun blooms (lighter cauliflower patches)
  ctx.globalCompositeOperation = 'destination-out';
  const blooms = Math.min(4, 1 + Math.floor(L / 50));
  for (let k = 0; k < blooms; k++) {
    const p = pts[Math.floor(range(r, 0.15, 0.85) * L)];
    const rad = p.w * range(r, 0.5, 0.9);
    const g = ctx.createRadialGradient(p.x, p.y, rad * 0.2, p.x, p.y, rad);
    g.addColorStop(0, 'rgba(0,0,0,0.28)');
    g.addColorStop(0.85, 'rgba(0,0,0,0.12)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // 4. dried pigment edge
  ctx.lineJoin = 'round';
  ctx.strokeStyle = rgba(def.dark, 0.55);
  ctx.lineWidth = 1.3;
  polyPath(ctx, deform(base, ns, avgW * 0.04, r, seed + 99, 0.1));
  ctx.stroke();
  ctx.strokeStyle = rgba(def.dark, 0.18);
  ctx.lineWidth = 2.4;
  polyPath(ctx, base);
  ctx.stroke();

  // 5. luminous core and a wet sheen along the upper side of the stroke
  ctx.save();
  polyPath(ctx, base);
  ctx.clip();
  ctx.filter = `blur(${Math.max(1, avgW * 0.18 * ctx.getTransform().a)}px)`;
  ctx.strokeStyle = rgba(def.light, 0.45);
  ctx.lineWidth = avgW * 0.35;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = rgba(def.light, 0.55);
  ctx.lineWidth = Math.max(1, avgW * 0.12);
  ctx.lineCap = 'round';
  ctx.beginPath();
  const sn = normals(pts);
  for (let i = 0; i < pts.length; i++) {
    const t = i / (pts.length - 1);
    if (t < 0.06 || t > 0.85) continue;
    const off = -pts[i].w * 0.22;
    const x = pts[i].x + sn[i].x * off;
    const y = pts[i].y + sn[i].y * off;
    if (t < 0.07) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

/** The wet stroke while it is still being painted. */
export function drawWetStroke(ctx: CanvasRenderingContext2D, raw: BP[], kind: InkKind, t: number) {
  if (raw.length < 2) return;
  const def = INKS[kind];
  const pts = raw.length > 3 ? chaikin(raw, 1) : raw;
  const outline = strokeOutline(pts, false, 3);
  ctx.save();
  ctx.shadowColor = rgba(def.light, 0.9);
  ctx.shadowBlur = 22 * ctx.getTransform().a;
  ctx.fillStyle = def.color;
  polyPath(ctx, outline);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = rgba(def.light, 0.5 + 0.2 * Math.sin(t * 8));
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  const sn = normals(pts);
  pts.forEach((p, i) => {
    const x = p.x + sn[i].x * -p.w * 0.2;
    const y = p.y + sn[i].y * -p.w * 0.2;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  });
  ctx.stroke();
}
