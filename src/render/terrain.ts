import { FONT_BRUSH, FONT_SERIF, INK, PAPER } from '../config';
import { BOTTOM, groundAt, type Hint, type Island, type Level, type ThemeId } from '../level';
import type { Vec } from '../math';
import { mulberry32, noise1, range } from '../rng';
import { SNOW } from './backdrop';
import { brushLine, leaf, linePath, polyPath, rgba } from './brush';
import { drawDecor, drawLanternStone } from './decor';

export const CHUNK_W = 1024;
export const CHUNK_Y0 = -220;
export const CHUNK_Y1 = 1000;

function drawIsland(ctx: CanvasRenderingContext2D, isl: Island, vx0: number, vx1: number, theme: ThemeId) {
  const r = mulberry32(isl.seed);
  const pts = isl.pts;
  let minY = Infinity;
  for (const p of pts) minY = Math.min(minY, p.y);

  // sea stacks taper toward the waves; land masses run straight down
  const inset = theme === 'sea' ? Math.min(70, (isl.x1 - isl.x0) * 0.12) : 0;
  const body: Vec[] = [...pts, { x: isl.x1 - inset, y: BOTTOM }, { x: isl.x0 + inset, y: BOTTOM }];
  ctx.save();
  polyPath(ctx, body);
  ctx.clip();
  ctx.fillStyle = PAPER;
  ctx.fillRect(isl.x0 - 10, minY - 20, isl.x1 - isl.x0 + 20, BOTTOM - minY + 40);
  const g = ctx.createLinearGradient(0, minY, 0, minY + 420);
  g.addColorStop(0, rgba(INK, 0.5));
  g.addColorStop(0.07, rgba(INK, 0.22));
  g.addColorStop(0.3, rgba(INK, 0.07));
  g.addColorStop(1, rgba(INK, 0));
  ctx.fillStyle = g;
  ctx.fillRect(isl.x0 - 10, minY - 20, isl.x1 - isl.x0 + 20, BOTTOM - minY + 40);

  // pooled ink just under the lip
  ctx.strokeStyle = rgba(INK, 0.16);
  ctx.lineWidth = 22;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y + 12) : ctx.moveTo(p.x, p.y + 12)));
  ctx.stroke();

  // dry-brush strata (consume RNG identically regardless of the visible window)
  const nStreaks = Math.floor((isl.x1 - isl.x0) / 22);
  for (let k = 0; k < nStreaks; k++) {
    const x = range(r, isl.x0, isl.x1);
    const len = range(r, 30, 180);
    const depth = Math.pow(r(), 1.6) * 300 + 14;
    const a = range(r, 0.04, 0.16) * (1 - depth / 380);
    const w = range(r, 1.5, 5);
    const sub = mulberry32(Math.floor(r() * 1e9));
    if (x + len < vx0 - 50 || x > vx1 + 50) continue;
    const y = groundAt(isl, Math.max(isl.x0, Math.min(isl.x1, x))) + depth;
    brushLine(ctx, [{ x, y }, { x: x + len * 0.5, y: y + range(sub, -3, 3) }, { x: x + len, y: y + range(sub, -4, 4) }], sub, {
      w,
      alpha: a,
      bristles: 2,
      dry: 1,
    });
  }

  // soft wash blots and downward texture strokes just under the surface
  const tr = mulberry32(isl.seed + 7);
  const nBlots = Math.floor((isl.x1 - isl.x0) / 90);
  for (let k = 0; k < nBlots; k++) {
    const x = range(tr, isl.x0, isl.x1);
    const depth = range(tr, 18, 110);
    const rad = range(tr, 30, 90);
    const a = range(tr, 0.04, 0.1);
    const nCun = 2 + Math.floor(tr() * 3);
    const sub = mulberry32(Math.floor(tr() * 1e9));
    if (x + rad < vx0 - 50 || x - rad > vx1 + 50) continue;
    const gy = groundAt(isl, x);
    const bg = ctx.createRadialGradient(x, gy + depth, 2, x, gy + depth, rad);
    bg.addColorStop(0, rgba(INK, a));
    bg.addColorStop(1, rgba(INK, 0));
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.ellipse(x, gy + depth, rad * 1.6, rad * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    for (let j = 0; j < nCun; j++) {
      const cx = x + range(sub, -rad, rad);
      const cy = groundAt(isl, Math.max(isl.x0, Math.min(isl.x1, cx))) + range(sub, 8, 26);
      const len = range(sub, 16, 46);
      brushLine(ctx, [{ x: cx, y: cy }, { x: cx + range(sub, -6, 6), y: cy + len }], sub, { w: range(sub, 2, 4), alpha: 0.22, taperIn: 2, bristles: 2, dry: 1 });
    }
    if (sub() < 0.4) {
      // a half-buried pebble
      const px = x + range(sub, -rad, rad) * 0.5;
      const py = groundAt(isl, Math.max(isl.x0, Math.min(isl.x1, px))) + range(sub, 20, 60);
      ctx.strokeStyle = rgba(INK, 0.35);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(px, py, range(sub, 6, 14), range(sub, 3, 6), range(sub, -0.3, 0.3), 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();

  // the ground line itself: a confident, loaded brush
  brushLine(ctx, pts, mulberry32(isl.seed + 1), { w: 7.5, taperIn: 6, taperOut: 10, bristles: 7, dry: 0.5, wobble: 0.45 });
  brushLine(ctx, pts.map((p) => ({ x: p.x, y: p.y + 4 })), mulberry32(isl.seed + 2), {
    w: 3,
    alpha: 0.45,
    taperIn: 30,
    taperOut: 30,
    bristles: 3,
    dry: 1,
  });

  // cliff faces
  for (const side of [0, 1]) {
    const p = side ? pts[pts.length - 1] : pts[0];
    const sr = mulberry32(isl.seed + 10 + side);
    const dir = side ? 1 : -1;
    const face: Vec[] = [];
    const depth = theme === 'sea' ? range(sr, 260, 360) : range(sr, 110, 170);
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const lean = theme === 'sea' ? inset * (depth / (BOTTOM - p.y)) : 16;
      face.push({ x: p.x + dir * Math.sin(t * 3) * 4 - dir * t * lean, y: p.y + t * depth });
    }
    // shadowed rock face
    const fg = ctx.createLinearGradient(0, p.y, 0, p.y + depth * 1.2);
    fg.addColorStop(0, rgba(INK, 0.35));
    fg.addColorStop(1, rgba(INK, 0));
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    for (const q of face) ctx.lineTo(q.x, q.y);
    ctx.lineTo(p.x - dir * 34, p.y + depth);
    ctx.lineTo(p.x - dir * 30, p.y);
    ctx.closePath();
    ctx.fill();
    brushLine(ctx, face, sr, { w: 8, taperIn: 4, taperOut: depth * 0.7, bristles: 6, dry: 0.9 });
    // hanging roots
    for (let k = 0; k < 3; k++) {
      const y0 = p.y + range(sr, 6, 40);
      const x0 = p.x - dir * range(sr, 2, 14);
      const len = range(sr, 24, 70);
      brushLine(ctx, [{ x: x0, y: y0 }, { x: x0 + dir * range(sr, 2, 8), y: y0 + len * 0.6 }, { x: x0 + dir * range(sr, -4, 10), y: y0 + len }], sr, {
        w: 1.8,
        alpha: 0.7,
        taperIn: 1,
      });
    }
  }

  if (theme === 'snow') {
    const top: Vec[] = pts.map((p) => ({ x: p.x, y: p.y - 4 - 8 * noise1(p.x * 0.015, isl.seed) }));
    const under: Vec[] = pts.map((p) => ({ x: p.x, y: p.y + 3 })).reverse();
    ctx.fillStyle = SNOW;
    polyPath(ctx, top.concat(under));
    ctx.fill();
    ctx.strokeStyle = rgba(INK, 0.5);
    ctx.lineWidth = 1.3;
    linePath(ctx, top);
    ctx.stroke();
    ctx.strokeStyle = rgba(INK, 0.12);
    ctx.lineWidth = 4;
    linePath(ctx, pts.map((p) => ({ x: p.x, y: p.y + 4 })));
    ctx.stroke();
  }

  // grass tufts along the lip
  const gr = mulberry32(isl.seed + 3);
  let x = isl.x0 + range(gr, 10, 60);
  ctx.fillStyle = INK;
  while (x < isl.x1 - 10) {
    const n = 2 + Math.floor(gr() * 4);
    const visible = x > vx0 - 60 && x < vx1 + 60 && (theme !== 'snow' || n >= 5);
    const y = groundAt(isl, x) + (theme === 'snow' ? -6 : 2);
    for (let k = 0; k < n; k++) {
      const h = range(gr, 8, 22);
      const lean = range(gr, -10, 14);
      const ox = range(gr, -6, 6);
      const a = range(gr, 0.5, 0.95);
      if (!visible) continue;
      ctx.globalAlpha = a;
      leaf(ctx, { x: x + ox, y }, { x: x + ox + lean * 0.2, y: y - h * 0.6 }, { x: x + ox + lean, y: y - h }, range(gr, 1.6, 2.8));
    }
    x += range(gr, 30, 140);
  }
  ctx.globalAlpha = 1;
}

function drawHint(ctx: CanvasRenderingContext2D, h: Hint) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  let y = h.y;
  if (h.kanji) {
    ctx.font = `120px ${FONT_BRUSH}`;
    ctx.fillStyle = rgba(INK, 0.12);
    ctx.fillText(h.kanji, h.x + 4, y - 36 + 4);
    ctx.fillStyle = rgba(INK, 0.82);
    ctx.fillText(h.kanji, h.x, y - 36);
    y += 18;
  }
  ctx.font = `italic 25px ${FONT_SERIF}`;
  ctx.fillStyle = rgba(INK, 0.78);
  ctx.fillText(h.text, h.x, y);
  ctx.restore();
}

export function drawTerrain(ctx: CanvasRenderingContext2D, level: Level, x0: number, x1: number) {
  for (const d of level.decor) {
    if (d.x > x0 - 320 && d.x < x1 + 320) drawDecor(ctx, d, level.theme === 'snow');
  }
  for (const isl of level.islands) {
    if (isl.x1 > x0 - 300 && isl.x0 < x1 + 300) drawIsland(ctx, isl, x0, x1, level.theme);
  }
  for (const l of level.lanterns) {
    if (l.x > x0 - 60 && l.x < x1 + 60) drawLanternStone(ctx, l);
  }
  for (const h of level.hints) {
    if (h.x > x0 - 500 && h.x < x1 + 500) drawHint(ctx, h);
  }
}

interface Chunk {
  canvas: HTMLCanvasElement;
  scale: number;
  used: number;
}

/** Pre-renders static terrain into fixed-width world chunks, rendered lazily. */
export class TerrainCache {
  private chunks = new Map<number, Chunk>();
  private frame = 0;
  constructor(
    private level: Level,
    private maxChunks = 9,
  ) {}

  clear() {
    this.chunks.clear();
  }

  private render(i: number, scale: number): Chunk {
    const c = document.createElement('canvas');
    const pad = 2;
    c.width = Math.ceil((CHUNK_W + pad) * scale);
    c.height = Math.ceil((CHUNK_Y1 - CHUNK_Y0) * scale);
    const ctx = c.getContext('2d')!;
    ctx.setTransform(scale, 0, 0, scale, -i * CHUNK_W * scale, -CHUNK_Y0 * scale);
    drawTerrain(ctx, this.level, i * CHUNK_W, (i + 1) * CHUNK_W + pad);
    return { canvas: c, scale, used: this.frame };
  }

  /** Draw all chunks overlapping [x0, x1] using the current world transform. */
  draw(ctx: CanvasRenderingContext2D, x0: number, x1: number, scale: number, prefetchAhead = 1) {
    this.frame++;
    const i0 = Math.max(0, Math.floor(x0 / CHUNK_W));
    const i1 = Math.min(Math.floor(this.level.length / CHUNK_W), Math.floor(x1 / CHUNK_W));
    for (let i = i0; i <= i1; i++) {
      let ch = this.chunks.get(i);
      if (!ch || Math.abs(ch.scale - scale) > 1e-3) {
        ch = this.render(i, scale);
        this.chunks.set(i, ch);
      }
      ch.used = this.frame;
      ctx.drawImage(ch.canvas, i * CHUNK_W, CHUNK_Y0, ch.canvas.width / scale, ch.canvas.height / scale);
    }
    // prefetch at most one chunk ahead per frame
    for (let i = i1 + 1; i <= i1 + prefetchAhead; i++) {
      if (i * CHUNK_W > this.level.length) break;
      const ch = this.chunks.get(i);
      if (!ch || Math.abs(ch.scale - scale) > 1e-3) {
        this.chunks.set(i, this.render(i, scale));
        break;
      }
    }
    if (this.chunks.size > this.maxChunks) {
      const sorted = [...this.chunks.entries()].sort((a, b) => a[1].used - b[1].used);
      while (sorted.length && this.chunks.size > this.maxChunks) this.chunks.delete(sorted.shift()![0]);
    }
  }
}
