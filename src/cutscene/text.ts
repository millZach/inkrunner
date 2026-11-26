import { FONT_BRUSH, FONT_SERIF, INK } from '../config';
import { Layer } from './layers';
import type { PanelText } from './types';

/** Sizes follow the in-game hint (drawHint in src/render/terrain.ts), with the line a little larger for cutscenes. */
export const KANJI_PX = 120;
export const LINE_PX = 30;
const KANJI_ALPHA = 0.82;
const SHADOW_ALPHA = 0.12;
const LINE_ALPHA = 0.8;
const SECS_PER_KANJI = 0.5;

interface Piece {
  c: HTMLCanvasElement;
  x: number;
  y: number;
  w: number;
  h: number;
  /** unit direction the brush travels through this piece */
  dx: number;
  dy: number;
  t0: number;
  t1: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Brush text that writes itself. The kanji is split into its separate brush marks (connected regions of the glyph
 * as the brush font draws it) and each mark is revealed in turn along its own direction, roughly in stroke order
 * (top to bottom, left to right). The English line is written left to right behind a soft wet brush front.
 */
export class BrushText {
  private pieces: Piece[] = [];
  private line: Layer | null = null;
  private lineT0 = 0;
  private lineDur = 1;
  private kanjiRect: Rect | null = null;
  private lineRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private k = 0;

  constructor(public spec: PanelText) {}

  get baked() {
    return this.k > 0;
  }

  /** seconds from the first mark to the last letter */
  get duration() {
    return this.lineT0 + this.lineDur;
  }

  /** the text's bounds in design units (kanji, line and shadow) */
  rect(): Rect {
    const r = this.lineRect;
    if (!this.kanjiRect) return { ...r };
    const k = this.kanjiRect;
    const x0 = Math.min(r.x, k.x);
    const y0 = Math.min(r.y, k.y);
    return { x: x0, y: y0, w: Math.max(r.x + r.w, k.x + k.w) - x0, h: Math.max(r.y + r.h, k.y + k.h) - y0 };
  }

  bake(k: number) {
    this.release();
    this.k = k;
    const { spec } = this;
    const measure = document.createElement('canvas').getContext('2d')!;

    // the English line, positioned like drawHint: baseline at y (+18 when a kanji sits above)
    const lineY = spec.y + (spec.kanji ? 18 : 0);
    measure.font = `italic ${LINE_PX}px ${FONT_SERIF}`;
    const lm = measure.measureText(spec.line);
    const asc = lm.actualBoundingBoxAscent || LINE_PX * 0.8;
    const desc = lm.actualBoundingBoxDescent || LINE_PX * 0.25;
    const lw = lm.width + 12;
    this.lineRect = { x: spec.x - lw / 2, y: lineY - asc - 4, w: lw, h: asc + desc + 8 };
    const lr = this.lineRect;
    this.line = new Layer(lr.x, lr.y, lr.w, lr.h, (ctx) => {
      ctx.font = `italic ${LINE_PX}px ${FONT_SERIF}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = INK;
      ctx.fillText(spec.line, spec.x, lineY);
    });
    this.line.bake(k);

    let t = 0;
    if (spec.kanji) {
      t = this.bakeKanji(k, spec.kanji, spec.x, spec.y - 36);
      t = Math.max(0, t - 0.12);
    }
    this.lineT0 = t;
    this.lineDur = Math.min(1.6, Math.max(0.9, spec.line.length * 0.027));
  }

  release() {
    for (const p of this.pieces) p.c.width = p.c.height = 0;
    this.pieces = [];
    this.line?.release();
    this.line = null;
    this.kanjiRect = null;
    this.k = 0;
  }

  /** Split the kanji into brush marks and give each a slot in time. Returns when the last mark finishes. */
  private bakeKanji(k: number, text: string, cx: number, baseline: number): number {
    const font = `${KANJI_PX}px ${FONT_BRUSH}`;
    const m = document.createElement('canvas').getContext('2d')!;
    m.font = font;
    const tm = m.measureText(text);
    const asc = tm.actualBoundingBoxAscent || KANJI_PX * 0.88;
    const desc = tm.actualBoundingBoxDescent || KANJI_PX * 0.12;
    const pad = 6;
    const ux = cx - tm.width / 2 - pad;
    const uy = baseline - asc - pad;
    const uw = tm.width + pad * 2;
    const uh = asc + desc + pad * 2;
    this.kanjiRect = { x: ux, y: uy, w: uw + 4, h: uh + 4 };

    const W = Math.ceil(uw * k);
    const H = Math.ceil(uh * k);
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.setTransform(k, 0, 0, k, -ux * k, -uy * k);
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.fillStyle = '#000';
    g.fillText(text, cx, baseline);
    const img = g.getImageData(0, 0, W, H);
    const a = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) a[i] = img.data[i * 4 + 3];

    // label connected marks (8-connected, solid pixels), then let the soft edge pixels join their neighbours
    const label = new Int32Array(W * H).fill(-1);
    const boxes: { x0: number; y0: number; x1: number; y1: number; n: number }[] = [];
    const stack: number[] = [];
    for (let i = 0; i < W * H; i++) {
      if (a[i] < 90 || label[i] >= 0) continue;
      const id = boxes.length;
      const b = { x0: W, y0: H, x1: 0, y1: 0, n: 0 };
      boxes.push(b);
      label[i] = id;
      stack.push(i);
      while (stack.length) {
        const j = stack.pop()!;
        const x = j % W;
        const y = (j - x) / W;
        b.n++;
        if (x < b.x0) b.x0 = x;
        if (x > b.x1) b.x1 = x;
        if (y < b.y0) b.y0 = y;
        if (y > b.y1) b.y1 = y;
        for (let oy = -1; oy <= 1; oy++) {
          const yy = y + oy;
          if (yy < 0 || yy >= H) continue;
          for (let ox = -1; ox <= 1; ox++) {
            const xx = x + ox;
            if (xx < 0 || xx >= W) continue;
            const q = yy * W + xx;
            if (label[q] < 0 && a[q] >= 90) {
              label[q] = id;
              stack.push(q);
            }
          }
        }
      }
    }
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < W * H; i++) {
        if (label[i] >= 0 || a[i] === 0) continue;
        const x = i % W;
        const y = (i - x) / W;
        for (let o = 0; o < 8 && label[i] < 0; o++) {
          const xx = x + [1, -1, 0, 0, 1, 1, -1, -1][o];
          const yy = y + [0, 0, 1, -1, 1, -1, 1, -1][o];
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const l = label[yy * W + xx];
          if (l >= 0) label[i] = l;
        }
      }
    }
    // specks (tiny islands of the brush texture) ride along with the nearest real mark
    const minN = Math.max(6, (W * H) / 4000);
    const real = boxes.map((b, i) => ({ b, i })).filter((o) => o.b.n >= minN);
    if (!real.length) return 0;
    const remap = new Int32Array(boxes.length).fill(-1);
    for (const o of real) remap[o.i] = o.i;
    boxes.forEach((b, i) => {
      if (remap[i] >= 0) return;
      const cxp = (b.x0 + b.x1) / 2;
      const cyp = (b.y0 + b.y1) / 2;
      let best = real[0].i;
      let bd = Infinity;
      for (const o of real) {
        const d = Math.hypot((o.b.x0 + o.b.x1) / 2 - cxp, (o.b.y0 + o.b.y1) / 2 - cyp);
        if (d < bd) {
          bd = d;
          best = o.i;
        }
      }
      remap[i] = best;
      const r = boxes[best];
      r.x0 = Math.min(r.x0, b.x0);
      r.y0 = Math.min(r.y0, b.y0);
      r.x1 = Math.max(r.x1, b.x1);
      r.y1 = Math.max(r.y1, b.y1);
    });

    // one canvas per mark, holding only that mark's pixels in ink
    const ink = parseInt(INK.slice(1), 16);
    const glyphW = (tm.width / Math.max(1, [...text].length)) * k;
    const order = real.map((o) => {
      const b = o.b;
      const w = b.x1 - b.x0 + 1;
      const h = b.y1 - b.y0 + 1;
      const glyph = Math.floor(((b.x0 + b.x1) / 2 - pad * k) / glyphW);
      const gx = ((b.x0 + b.x1) / 2 - pad * k - glyph * glyphW) / glyphW;
      const gy = (b.y0 + b.y1) / 2 / H;
      return { o, w, h, key: glyph * 10 + gy + gx * 0.6 };
    });
    order.sort((p, q) => p.key - q.key);
    let total = 0;
    const lens = order.map((p) => {
      const len = Math.max(p.w, p.h) + 0.35 * Math.min(p.w, p.h);
      total += len;
      return len;
    });
    const glyphs = [...text].length;
    const budget = SECS_PER_KANJI * glyphs;
    const gap = 0.035;
    const write = Math.max(0.2, budget - gap * order.length);
    let t = 0;
    order.forEach((p, n) => {
      const b = p.o.b;
      const pc = document.createElement('canvas');
      pc.width = p.w;
      pc.height = p.h;
      const pg = pc.getContext('2d')!;
      const out = pg.createImageData(p.w, p.h);
      for (let y = b.y0; y <= b.y1; y++) {
        for (let x = b.x0; x <= b.x1; x++) {
          const i = y * W + x;
          const l = label[i];
          if (l < 0 || remap[l] !== p.o.i) continue;
          const o = ((y - b.y0) * p.w + (x - b.x0)) * 4;
          out.data[o] = (ink >> 16) & 255;
          out.data[o + 1] = (ink >> 8) & 255;
          out.data[o + 2] = ink & 255;
          out.data[o + 3] = a[i];
        }
      }
      pg.putImageData(out, 0, 0);
      let dx = 0.72;
      let dy = 0.7;
      if (p.w > p.h * 1.35) {
        dx = 1;
        dy = 0.08;
      } else if (p.h > p.w * 1.35) {
        dx = 0.06;
        dy = 1;
      }
      const l = Math.hypot(dx, dy);
      const dur = (lens[n] / total) * write;
      this.pieces.push({ c: pc, x: ux + b.x0 / k, y: uy + b.y0 / k, w: p.w / k, h: p.h / k, dx: dx / l, dy: dy / l, t0: t, t1: t + dur });
      t += dur + gap;
    });
    c.width = c.height = 0;
    return t;
  }

  /** Draw at t seconds since the brush started writing (negative: nothing yet). */
  draw(ctx: CanvasRenderingContext2D, t: number, alpha = 1) {
    if (t <= 0 || alpha <= 0) return;
    const a0 = ctx.globalAlpha;
    for (const pass of [0, 1]) {
      const ox = pass === 0 ? 4 : 0;
      for (const p of this.pieces) {
        if (t <= p.t0) continue;
        // fresh ink is a touch darker, then settles as it dries (like the player's strokes)
        const wet = Math.max(0, 1 - (t - p.t1) / 0.5);
        const base = pass === 0 ? SHADOW_ALPHA : KANJI_ALPHA + 0.13 * Math.min(1, wet);
        ctx.globalAlpha = a0 * alpha * base;
        if (t >= p.t1) {
          ctx.drawImage(p.c, p.x + ox, p.y + ox, p.w, p.h);
          continue;
        }
        const u = (t - p.t0) / (p.t1 - p.t0);
        this.wipe(ctx, p, ox, u);
      }
    }
    if (this.line) {
      const u = (t - this.lineT0) / this.lineDur;
      if (u > 0) {
        const r = this.lineRect;
        const soft = 26;
        const front = r.x + (r.w + soft) * Math.min(1, u);
        ctx.globalAlpha = a0 * alpha * LINE_ALPHA;
        this.line.reveal(ctx, 'x', front, soft);
      }
    }
    ctx.globalAlpha = a0;
  }

  /** reveal a mark along its direction with a soft front; u is 0..1 through the mark */
  private wipe(ctx: CanvasRenderingContext2D, p: Piece, ox: number, u: number) {
    // project the box corners on the direction to find the sweep's extent
    const x0 = p.x + ox;
    const y0 = p.y + ox;
    const corners = [
      [x0, y0],
      [x0 + p.w, y0],
      [x0, y0 + p.h],
      [x0 + p.w, y0 + p.h],
    ];
    let lo = Infinity;
    let hi = -Infinity;
    for (const [cx, cy] of corners) {
      const s = cx * p.dx + cy * p.dy;
      lo = Math.min(lo, s);
      hi = Math.max(hi, s);
    }
    const soft = Math.min(10, (hi - lo) * 0.3);
    const front = lo + (hi - lo + soft) * u;
    const a = ctx.globalAlpha;
    const band = (s0: number, s1: number, alpha: number) => {
      // the strip of the plane between two lines perpendicular to the direction
      const nx = -p.dy;
      const ny = p.dx;
      const big = p.w + p.h + 40;
      const cxm = x0 + p.w / 2;
      const cym = y0 + p.h / 2;
      const c0 = cxm * p.dx + cym * p.dy;
      const ax = cxm + p.dx * (s0 - c0);
      const ay = cym + p.dy * (s0 - c0);
      const bx = cxm + p.dx * (s1 - c0);
      const by = cym + p.dy * (s1 - c0);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(ax + nx * big, ay + ny * big);
      ctx.lineTo(bx + nx * big, by + ny * big);
      ctx.lineTo(bx - nx * big, by - ny * big);
      ctx.lineTo(ax - nx * big, ay - ny * big);
      ctx.closePath();
      ctx.clip();
      ctx.globalAlpha = alpha;
      ctx.drawImage(p.c, x0, y0, p.w, p.h);
      ctx.restore();
    };
    band(lo - 1, front - soft, a);
    band(front - soft, front, a * 0.45);
    ctx.globalAlpha = a;
  }
}
