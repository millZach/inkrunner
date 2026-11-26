import { INK } from '../config';
import type { SkyId, ThemeId } from '../level';
import type { Vec } from '../math';
import { fbm1, mulberry32, noise1, range } from '../rng';
import { brushLine, rgba } from './brush';

export const SNOW = '#fbf8f1';

interface LayerSpec {
  p: number; // parallax factor
  base: number; // baseline y in layer space
  amp: number;
  alpha: number;
  freq: number;
  seed: number;
  trees: boolean;
  kind: 'ridge' | 'fuji' | 'isles';
  snow: boolean;
}

const L = (o: Partial<LayerSpec> & Pick<LayerSpec, 'p' | 'base' | 'amp' | 'alpha' | 'freq' | 'seed'>): LayerSpec => ({
  trees: false,
  kind: 'ridge',
  snow: false,
  ...o,
});

const THEME_LAYERS: Record<ThemeId, LayerSpec[]> = {
  spring: [
    L({ p: 0.1, base: 470, amp: 300, alpha: 0.2, freq: 0.0016, seed: 3 }),
    L({ p: 0.22, base: 540, amp: 220, alpha: 0.28, freq: 0.0024, seed: 9 }),
    L({ p: 0.42, base: 640, amp: 150, alpha: 0.36, freq: 0.0034, seed: 17, trees: true }),
  ],
  snow: [
    L({ p: 0.1, base: 480, amp: 380, alpha: 0.22, freq: 0.0018, seed: 41, snow: true }),
    L({ p: 0.22, base: 560, amp: 280, alpha: 0.3, freq: 0.0026, seed: 43, snow: true }),
    L({ p: 0.42, base: 650, amp: 170, alpha: 0.38, freq: 0.0036, seed: 47, trees: true, snow: true }),
  ],
  // summer: low, rounded riverside hills under a big sky (the sky itself is painted by SkyPainter)
  summer: [
    L({ p: 0.1, base: 520, amp: 210, alpha: 0.2, freq: 0.0013, seed: 83 }),
    L({ p: 0.22, base: 590, amp: 150, alpha: 0.28, freq: 0.002, seed: 89 }),
    L({ p: 0.42, base: 660, amp: 110, alpha: 0.36, freq: 0.003, seed: 97, trees: true }),
  ],
  sea: [
    L({ p: 0.08, base: 520, amp: 330, alpha: 0.2, freq: 0.002, seed: 61, kind: 'fuji', snow: true }),
    L({ p: 0.2, base: 600, amp: 90, alpha: 0.26, freq: 0.004, seed: 67, kind: 'isles', trees: true }),
  ],
};

const Y0 = -150;
const Y1 = 900;

interface Strip {
  canvas: HTMLCanvasElement;
  res: number;
  spec: LayerSpec;
}

function ridge(x: number, spec: LayerSpec): number {
  if (spec.kind === 'fuji') {
    const period = 2900;
    const cx = Math.round((x - 1100) / period) * period + 1100;
    const d = Math.abs(x - cx);
    const w = 1050;
    let h = 0;
    if (d < w) h = Math.min(0.94, Math.pow(1 - d / w, 1.8));
    const hills = fbm1(x * 0.003, spec.seed) * 0.18;
    return spec.base - Math.max(h, hills) * spec.amp + (noise1(x * 0.05, spec.seed) - 0.5) * 3;
  }
  if (spec.kind === 'isles') {
    const n = fbm1(x * spec.freq, spec.seed, 3);
    const h = Math.max(0, n - 0.48) * 4;
    return spec.base - Math.min(1, h) * spec.amp;
  }
  let h = 0;
  let amp = 1;
  let f = spec.freq;
  let norm = 0;
  for (let o = 0; o < 4; o++) {
    const n = 1 - Math.abs(noise1(x * f, spec.seed + o) * 2 - 1);
    h += n * n * amp;
    norm += amp;
    amp *= 0.45;
    f *= 2.1;
  }
  // big slow swell so ranges come and go
  const swell = 0.35 + 0.65 * fbm1(x * spec.freq * 0.25, spec.seed + 99, 2);
  return spec.base - (h / norm) * spec.amp * swell * 1.4;
}

function renderStrip(spec: LayerSpec, width: number, res: number): Strip {
  const c = document.createElement('canvas');
  c.width = Math.ceil(width * res);
  c.height = Math.ceil((Y1 - Y0) * res);
  const ctx = c.getContext('2d')!;
  ctx.setTransform(res, 0, 0, res, 0, -Y0 * res);
  const r = mulberry32(spec.seed * 1000);

  const pts: Vec[] = [];
  for (let x = -20; x <= width + 20; x += 5) pts.push({ x, y: ridge(x, spec) });

  const body = new Path2D();
  body.moveTo(pts[0].x, pts[0].y);
  for (const p of pts) body.lineTo(p.x, p.y);
  body.lineTo(width + 20, Y1);
  body.lineTo(-20, Y1);
  body.closePath();

  // body: faint fill fading downward into mist
  const g = ctx.createLinearGradient(0, spec.base - spec.amp, 0, spec.base + 120);
  g.addColorStop(0, rgba(INK, spec.alpha * 0.55));
  g.addColorStop(0.6, rgba(INK, spec.alpha * 0.3));
  g.addColorStop(1, rgba(INK, 0));
  ctx.fillStyle = g;
  ctx.fill(body);

  // graded ink concentrated along the ridge, bleeding downward (column by column)
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i];
    if (p.y >= spec.base - 1) continue;
    const fade = 60 + 120 * noise1(p.x * 0.006, spec.seed + 3);
    const g2 = ctx.createLinearGradient(0, p.y, 0, p.y + fade);
    g2.addColorStop(0, rgba(INK, spec.alpha * 0.85));
    g2.addColorStop(0.25, rgba(INK, spec.alpha * 0.4));
    g2.addColorStop(1, rgba(INK, 0));
    ctx.fillStyle = g2;
    const top = Math.min(p.y, pts[i + 1].y);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(pts[i + 1].x, pts[i + 1].y);
    ctx.lineTo(pts[i + 1].x, top + fade);
    ctx.lineTo(p.x, top + fade);
    ctx.closePath();
    ctx.fill();
  }

  // texture strokes (cun) running down the slopes
  const nc = Math.floor(width / 18);
  for (let k = 0; k < nc; k++) {
    const x = range(r, 0, width);
    const y = ridge(x, spec);
    const len = range(r, 14, 60);
    const wid = range(r, 1.5, 4);
    const al = spec.alpha * range(r, 0.3, 0.8);
    if (y >= spec.base - 2) continue;
    const slope = ridge(x + 4, spec) - ridge(x - 4, spec);
    const dx = slope > 0 ? -len * 0.35 : len * 0.35;
    brushLine(ctx, [{ x, y: y + 2 }, { x: x + dx * 0.5, y: y + len * 0.5 }, { x: x + dx, y: y + len }], r, {
      w: wid,
      alpha: al,
      taperIn: 2,
      bristles: 2,
      dry: 1,
    });
  }

  // snow caps: paper left bare above a ragged snowline
  if (spec.snow) {
    ctx.save();
    ctx.clip(body);
    const line: Vec[] = [];
    for (let x = -20; x <= width + 20; x += 6) {
      const sl = spec.kind === 'fuji' ? spec.base - spec.amp * 0.62 : spec.base - spec.amp * 0.5;
      line.push({ x, y: sl + (noise1(x * 0.03, spec.seed + 8) - 0.5) * 40 + (noise1(x * 0.2, spec.seed + 9) - 0.5) * 10 });
    }
    ctx.fillStyle = rgba(SNOW, 0.92);
    ctx.beginPath();
    ctx.moveTo(-20, Y0);
    for (const p of line) ctx.lineTo(p.x, p.y);
    ctx.lineTo(width + 20, Y0);
    ctx.closePath();
    ctx.fill();
    // snow streaks reaching down the gullies
    ctx.strokeStyle = rgba(SNOW, 0.85);
    ctx.lineCap = 'round';
    ctx.fillStyle = rgba(SNOW, 0.85);
    for (const p of line) {
      if (r() < 0.8) continue;
      // tapered gully wedges
      const w = range(r, 3, 7);
      const len = range(r, 8, 26);
      ctx.beginPath();
      ctx.moveTo(p.x - w, p.y - 2);
      ctx.lineTo(p.x + range(r, -3, 3), p.y + len);
      ctx.lineTo(p.x + w, p.y - 2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    // re-ink the ridge edge so white peaks keep their silhouette
    ctx.strokeStyle = rgba(INK, spec.alpha * 1.4);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
  }

  // tiny ridge pines on the nearest range
  if (spec.trees) {
    for (let k = 0; k < width / 40; k++) {
      const x = range(r, 0, width);
      const h = range(r, 10, 24);
      const ws = range(r, 0.8, 1.2);
      if (noise1(x * 0.004, spec.seed + 5) < 0.45) continue;
      const y = ridge(x, spec) + 3;
      if (y >= spec.base - 2) continue;
      ctx.fillStyle = rgba(INK, spec.alpha * 1.4);
      ctx.fillRect(x - 0.6, y - h, 1.2, h);
      for (let j = 0; j < 3; j++) {
        const yy = y - h + j * h * 0.28;
        const ww = (3 + j * 2.5) * ws;
        ctx.beginPath();
        ctx.ellipse(x, yy, ww, 1.8, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // mist band dissolving the base
  const m = ctx.createLinearGradient(0, spec.base - 40, 0, spec.base + 60);
  m.addColorStop(0, 'rgba(239,230,211,0)');
  m.addColorStop(1, 'rgba(239,230,211,0.9)');
  ctx.fillStyle = m;
  ctx.fillRect(-20, spec.base - 40, width + 40, Y1 - spec.base + 40);

  // sea horizon for island layers
  if (spec.kind === 'isles') {
    ctx.strokeStyle = rgba(INK, 0.18);
    ctx.lineWidth = 1.2;
    for (let k = 0; k < 4; k++) {
      ctx.setLineDash([range(r, 40, 200), range(r, 20, 90)]);
      ctx.beginPath();
      ctx.moveTo(-20, spec.base + 4 + k * 9);
      ctx.lineTo(width + 20, spec.base + 4 + k * 9);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  return { canvas: c, res, spec };
}

export class Backdrop {
  private strips: Strip[] = [];
  private enso: HTMLCanvasElement;
  /** birds cross the sky (off at night and in storms) */
  birds = true;
  constructor(
    private levelLength: number,
    private theme: ThemeId,
  ) {
    this.enso = makeEnso();
  }

  build(scale: number) {
    const res = Math.min(1, scale * 0.6);
    this.strips = THEME_LAYERS[this.theme].map((s) => renderStrip(s, this.levelLength * s.p + 4800, res));
  }

  /** For the exported scroll: each layer stretched across the whole level. */
  drawStretched(ctx: CanvasRenderingContext2D, ensoX: number) {
    ctx.globalAlpha = 0.9;
    ctx.drawImage(this.enso, ensoX, -120, 320, 320);
    ctx.globalAlpha = 1;
    for (const s of this.strips) {
      const used = this.levelLength * s.spec.p + 2000;
      const srcW = Math.min(s.canvas.width, used * s.res);
      ctx.drawImage(s.canvas, 0, 0, srcW, s.canvas.height, 0, Y0, this.levelLength, s.canvas.height / s.res);
    }
  }

  /** Draw parallax layers. camX/camY are the world camera; scale is world→screen. */
  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, scale: number, t: number) {
    // ensō sun (Summer paints its own sun and moon: see SkyPainter)
    const ep = 0.04;
    if (this.theme !== 'summer') {
      ctx.setTransform(scale, 0, 0, scale, -camX * ep * scale, -camY * ep * scale);
      ctx.globalAlpha = 0.9;
      ctx.drawImage(this.enso, 760, -40, 300, 300);
      ctx.globalAlpha = 1;
    }

    for (let i = 0; i < this.strips.length; i++) {
      const s = this.strips[i];
      const p = s.spec.p;
      ctx.setTransform(scale, 0, 0, scale, -camX * p * scale, -camY * p * scale);
      ctx.drawImage(s.canvas, 0, Y0, s.canvas.width / s.res, s.canvas.height / s.res);
      if (i === 1 && this.theme !== 'snow' && this.birds) drawBirds(ctx, camX * p, t);
    }
  }
}

function makeEnso(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 600;
  const ctx = c.getContext('2d')!;
  const r = mulberry32(108);
  const pts: Vec[] = [];
  const a0 = -Math.PI * 0.42;
  for (let i = 0; i <= 80; i++) {
    const a = a0 + (i / 80) * Math.PI * 1.86;
    const rr = 225 + Math.sin(i * 0.15) * 6;
    pts.push({ x: 300 + Math.cos(a) * rr, y: 300 + Math.sin(a) * rr });
  }
  brushLine(ctx, pts, r, { w: 40, alpha: 0.16, taperIn: 20, taperOut: 260, bristles: 14, dry: 1, wobble: 0.5 });
  return c;
}

function drawBirds(ctx: CanvasRenderingContext2D, offset: number, t: number) {
  ctx.strokeStyle = rgba(INK, 0.55);
  ctx.lineCap = 'round';
  ctx.lineWidth = 1.6;
  for (let f = 0; f < 3; f++) {
    const fx = offset + ((f * 911 + t * 26) % 2200) - 300;
    const fy = 130 + f * 70 + Math.sin(t * 0.3 + f) * 20;
    for (let b = 0; b < 4; b++) {
      const x = fx + b * 22 + Math.sin(b * 1.7) * 8;
      const y = fy + Math.cos(b * 2.3) * 10;
      const flap = Math.sin(t * 7 + b * 1.3 + f) * 3.5;
      ctx.beginPath();
      ctx.moveTo(x - 7, y - flap);
      ctx.quadraticCurveTo(x - 3, y - 2, x, y);
      ctx.quadraticCurveTo(x + 3, y - 2, x + 7, y - flap);
      ctx.stroke();
    }
  }
}


// ─────────────────────────────────────────────────────────────── Summer skies (N13)

interface SkySpec {
  /** multiplied over the paper, top → bottom of the view (stops at 0, 0.35, 0.62, 1) */
  wash: [string, string, string, string];
  /**
   * multiplied over the whole view after the terrain, top → bottom (stops at 0, 0.5, 1), so the paper ground sits
   * in the same light: at night the ground below the road goes into the dark with the sky
   */
  grade: [string, string, string];
  /** what hangs in it */
  body: 'sun' | 'moon' | null;
  stars: number;
  /** cloud band strength: 1 is one band at full alpha; above 1 a second band is laid over it */
  clouds: number;
  birds: boolean;
}

const SKIES: Record<SkyId, SkySpec> = {
  // 起 ~19:00: clear, a warm ochre wash low in the sky, the sun going down behind the hills
  dusk: { wash: ['#d9d3d6', '#e6d2b8', '#eab878', '#fbf3e6'], grade: ['#fbf4ea', '#f6e8d2', '#e2c7a6'], body: 'sun', stars: 0, clouds: 0.15, birds: true },
  // 承 ~21:00: festival night, an indigo wash, the horizon warm with lanterns, the ground in the night too
  night: { wash: ['#333c5e', '#6c7194', '#cf9f70', '#e6d9c6'], grade: ['#d9d6e6', '#a4a5c2', '#5c6190'], body: null, stars: 70, clouds: 0, birds: false },
  // 転 / 結: the storm, slate-teal cloud
  storm: { wash: ['#5f7775', '#8ea3a0', '#b9c4bd', '#ebe8dc'], grade: ['#e3e8e5', '#ccd3cf', '#9ea9a6'], body: null, stars: 0, clouds: 0.75, birds: false },
  // the gate: the storm's heart, darker and colder than 結, the cloud laid twice
  'storm-peak': { wash: ['#26313a', '#46545d', '#77868a', '#c4c6c0'], grade: ['#b4bcc4', '#959fa8', '#5f6b76'], body: null, stars: 0, clouds: 1.7, birds: false },
  // after the storm: clear, the full moon, the land in moonlight
  moon: { wash: ['#3f4a70', '#7d83a3', '#bdbbc8', '#e9e5dc'], grade: ['#e0e0ec', '#b0b2cb', '#6a7099'], body: 'moon', stars: 40, clouds: 0.2, birds: false },
};

/** No sky (the old chapters): multiplying white changes nothing. */
const NO_SKY: SkySpec = { wash: ['#ffffff', '#ffffff', '#ffffff', '#ffffff'], grade: ['#ffffff', '#ffffff', '#ffffff'], body: null, stars: 0, clouds: 0, birds: false };

const hexRgb = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
/** a colour between two #rrggbb at k (0..1) */
function mixHex(a: string, b: string, k: number): string {
  const A = hexRgb(a);
  const B = hexRgb(b);
  const c = (i: number) => Math.round(A[i] + (B[i] - A[i]) * k);
  return `rgb(${c(0)},${c(1)},${c(2)})`;
}

/** Paint a vertical multiply strip (8 x 256) from colour stops at `at`. */
function paintStrip(c: HTMLCanvasElement, cols: readonly string[], at: readonly number[]) {
  c.width = 8;
  c.height = 256;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 256);
  cols.forEach((col, i) => gr.addColorStop(at[i], col));
  g.fillStyle = gr;
  g.fillRect(0, 0, 8, 256);
}
const WASH_AT = [0, 0.35, 0.62, 1];
const GRADE_AT = [0, 0.5, 1];

interface BakedSky {
  wash: HTMLCanvasElement;
  grade: HTMLCanvasElement;
  front: HTMLCanvasElement;
}

/**
 * The Summer skies, painted once per sky and screen size into two canvases (no per-frame gradients): a wash
 * multiplied over the paper, and a front layer (sun or moon, stars, cloud blots) drawn over it, both before the
 * far hills. `grade()` lays the sky's light over the terrain. A sky change cross-fades.
 */
export class SkyPainter {
  private baked = new Map<SkyId, BakedSky>();
  private size = '';
  private clouds: HTMLCanvasElement | null = null;

  private bake(id: SkyId, W: number, H: number): BakedSky {
    const key = `${W}x${H}`;
    if (key !== this.size) {
      this.baked.clear();
      this.clouds = null;
      this.size = key;
    }
    let b = this.baked.get(id);
    if (b) return b;
    const spec = SKIES[id];
    const hs = H / 720;
    const wash = document.createElement('canvas');
    paintStrip(wash, spec.wash, WASH_AT);
    const grade = document.createElement('canvas');
    paintStrip(grade, spec.grade, GRADE_AT);
    const front = document.createElement('canvas');
    front.width = W;
    front.height = H;
    const f = front.getContext('2d')!;
    const r = mulberry32(id.length * 977 + 31);
    // stars: tiny paper flecks, denser up high
    for (let i = 0; i < spec.stars; i++) {
      const x = r() * W;
      const y = Math.pow(r(), 1.7) * H * 0.42;
      const rad = (0.6 + r() * 1.3) * hs;
      f.fillStyle = `rgba(250,246,232,${0.45 + r() * 0.5})`;
      f.beginPath();
      f.arc(x, y, rad, 0, Math.PI * 2);
      f.fill();
    }
    if (spec.body === 'sun') {
      // a vermilion-ochre sun low behind the hills, its edge brushed
      const cx = W * 0.7;
      const cy = H * 0.5;
      const R = 62 * hs;
      const sg = f.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 3.2);
      sg.addColorStop(0, 'rgba(250,170,80,0.55)');
      sg.addColorStop(0.35, 'rgba(245,150,70,0.18)');
      sg.addColorStop(1, 'rgba(245,150,70,0)');
      f.fillStyle = sg;
      f.fillRect(cx - R * 3.2, cy - R * 3.2, R * 6.4, R * 6.4);
      f.fillStyle = 'rgba(236,98,44,0.82)';
      f.beginPath();
      f.arc(cx, cy, R, 0, Math.PI * 2);
      f.fill();
      brushLine(f, Array.from({ length: 40 }, (_, i) => ({ x: cx + Math.cos(-1.9 + i * 0.16) * R * 1.02, y: cy + Math.sin(-1.9 + i * 0.16) * R * 1.02 })), r, { w: 6 * hs, color: '#a8240e', alpha: 0.5, taperIn: 20, taperOut: 40, bristles: 4, dry: 0.8 });
    } else if (spec.body === 'moon') {
      // the full moon: paper-white with a faint gold rim, an ensō of ink around it
      const cx = W * 0.68;
      const cy = H * 0.2;
      const R = 70 * hs;
      const mg = f.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * 3);
      mg.addColorStop(0, 'rgba(255,248,224,0.5)');
      mg.addColorStop(1, 'rgba(255,248,224,0)');
      f.fillStyle = mg;
      f.fillRect(cx - R * 3, cy - R * 3, R * 6, R * 6);
      f.fillStyle = '#fbf6e6';
      f.beginPath();
      f.arc(cx, cy, R, 0, Math.PI * 2);
      f.fill();
      f.fillStyle = 'rgba(200,180,140,0.18)';
      for (let i = 0; i < 6; i++) {
        f.beginPath();
        f.ellipse(cx + (r() - 0.5) * R, cy + (r() - 0.5) * R, R * (0.12 + r() * 0.18), R * (0.08 + r() * 0.12), r() * 3, 0, Math.PI * 2);
        f.fill();
      }
      brushLine(f, Array.from({ length: 50 }, (_, i) => ({ x: cx + Math.cos(-1.4 + i * 0.118) * R * 1.12, y: cy + Math.sin(-1.4 + i * 0.118) * R * 1.12 })), r, { w: 9 * hs, alpha: 0.35, taperIn: 30, taperOut: 90, bristles: 6, dry: 1 });
    }
    b = { wash, grade, front };
    this.baked.set(id, b);
    return b;
  }

  /** A band of ink cloud blots that tiles horizontally (canvas pixels). */
  private cloudBand(H: number): HTMLCanvasElement {
    if (this.clouds) return this.clouds;
    const hs = H / 720;
    const c = document.createElement('canvas');
    c.width = Math.ceil(1400 * hs);
    c.height = Math.ceil(260 * hs);
    const g = c.getContext('2d')!;
    const r = mulberry32(4401);
    for (let i = 0; i < 40; i++) {
      const x = r() * c.width;
      const y = (10 + Math.pow(r(), 1.5) * 170) * hs;
      const rad = (50 + r() * 120) * hs;
      const a = 0.12 + r() * 0.14;
      for (const dx of [-c.width, 0, c.width]) {
        const gr = g.createRadialGradient(x + dx, y, 4, x + dx, y, rad * 1.7);
        gr.addColorStop(0, rgba('#26302f', a));
        gr.addColorStop(1, rgba('#26302f', 0));
        g.fillStyle = gr;
        g.beginPath();
        g.ellipse(x + dx, y, rad * 1.7, rad * 0.5, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
    this.clouds = c;
    return c;
  }

  /** Does this sky want birds crossing it? */
  static birds(id: SkyId | null) {
    return !id || SKIES[id].birds;
  }

  /**
   * The wash and grade strips for a frame: the baked ones when settled, else (during a cross-fade) strips painted
   * now from the two skies' stops mixed at k, so the light moves evenly from the first frame to the last (no snap,
   * and no two half-strength multiplies brightening or darkening the middle of the fade).
   */
  private strips(W: number, H: number, id: SkyId | null, prev: SkyId | null, k: number): { wash: HTMLCanvasElement; grade: HTMLCanvasElement } | null {
    const fading = prev !== id && k < 1;
    if (!fading) return id ? this.bake(id, W, H) : null;
    const A = prev ? SKIES[prev] : NO_SKY;
    const B = id ? SKIES[id] : NO_SKY;
    const kq = Math.round(k * 64) / 64;
    const key = `${prev}>${id}@${kq}`;
    if (this.mixKey !== key) {
      this.mixKey = key;
      paintStrip(this.mixWash, A.wash.map((c, i) => mixHex(c, B.wash[i], kq)), WASH_AT);
      paintStrip(this.mixGrade, A.grade.map((c, i) => mixHex(c, B.grade[i], kq)), GRADE_AT);
    }
    return { wash: this.mixWash, grade: this.mixGrade };
  }
  private mixKey = '';
  private mixWash = document.createElement('canvas');
  private mixGrade = document.createElement('canvas');

  /** Screen space, right after the paper: the wash and what hangs in the sky, cross-faded from `prev` to `id` by `k`. */
  draw(ctx: CanvasRenderingContext2D, W: number, H: number, id: SkyId | null, prev: SkyId | null, k: number, camX: number, t: number) {
    const st = this.strips(W, H, id, prev, k);
    if (!st) return;
    const fading = prev !== id && k < 1;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(st.wash, 0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    // what hangs in the sky: the old sky's fades out as the new one's fades in
    if (fading && prev) {
      ctx.globalAlpha = 1 - k;
      ctx.drawImage(this.bake(prev, W, H).front, 0, 0);
    }
    if (id) {
      ctx.globalAlpha = fading ? k : 1;
      ctx.drawImage(this.bake(id, W, H).front, 0, 0);
    }
    // the cloud band: its strength mixes between the two skies
    const cl = fading ? (prev ? SKIES[prev].clouds : 0) * (1 - k) + (id ? SKIES[id].clouds : 0) * k : id ? SKIES[id].clouds : 0;
    if (cl > 0.01) {
      const band = this.cloudBand(H);
      const hs = H / 720;
      ctx.globalCompositeOperation = 'multiply';
      for (let pass = 0; pass < 2 && cl - pass > 0.01; pass++) {
        // the second band drifts at its own pace so the two never line up
        const off = -((((camX * (0.06 + pass * 0.03) * hs + t * (5 + pass * 3) * hs + pass * band.width * 0.43) % band.width) + band.width) % band.width);
        ctx.globalAlpha = Math.min(1, cl - pass);
        for (let x = off; x < W; x += band.width) ctx.drawImage(band, x, pass * 30 * hs);
      }
    }
    ctx.restore();
  }

  /** Screen space, after the terrain and before hazards: the sky's light over the paper ground (multiply). */
  grade(ctx: CanvasRenderingContext2D, W: number, H: number, id: SkyId | null, prev: SkyId | null, k: number) {
    const st = this.strips(W, H, id, prev, k);
    if (!st) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(st.grade, 0, 0, W, H);
    ctx.restore();
  }
}
