import { INK, PAPER } from '../config';
import type { Vec } from '../math';
import { Backdrop } from '../render/backdrop';
import { brushLine, curve, polyPath, rgba } from '../render/brush';
import { drawDecor, drawTorii } from '../render/decor';
import { drawSea } from '../render/waves';
import { fbm1, mulberry32, noise1, range, type RNG } from '../rng';

/** The great scroll lying on the floor, seen a little from above: a parallelogram band. */
export interface Band {
  /** near (lower) edge, left and right x */
  nx0: number;
  nx1: number;
  /** far (upper) edge is the near edge shifted right by skew and up to yFar */
  yFar: number;
  yNear: number;
  skew: number;
}

export const SCROLL_PAPER = '#f8f2e4';

export function bandPath(ctx: CanvasRenderingContext2D, b: Band, x1 = b.nx1) {
  polyPath(ctx, [
    { x: b.nx0, y: b.yNear },
    { x: b.nx0 + b.skew, y: b.yFar },
    { x: x1 + b.skew, y: b.yFar },
    { x: x1, y: b.yNear },
  ]);
}

/** whiter paper, a soft shadow on the floor, thin ink edges */
export function drawScrollPaper(ctx: CanvasRenderingContext2D, b: Band, r: RNG) {
  ctx.save();
  ctx.fillStyle = rgba(INK, 0.14);
  ctx.beginPath();
  ctx.ellipse((b.nx0 + b.nx1) / 2, b.yNear + 4, (b.nx1 - b.nx0) / 2 + 14, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  bandPath(ctx, b);
  ctx.fillStyle = SCROLL_PAPER;
  ctx.fill();
  // a faint mounting border inside the edges, like a real handscroll's
  ctx.strokeStyle = rgba(INK, 0.16);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(b.nx0 + b.skew * 0.06 + 2, b.yNear - 6);
  ctx.lineTo(b.nx1, b.yNear - 6);
  ctx.moveTo(b.nx0 + b.skew * 0.94 + 2, b.yFar + 6);
  ctx.lineTo(b.nx1 + b.skew, b.yFar + 6);
  ctx.stroke();
  brushLine(ctx, [{ x: b.nx0, y: b.yNear }, { x: b.nx1, y: b.yNear }], r, { w: 1.8, alpha: 0.6, taperIn: 6, taperOut: 6 });
  brushLine(ctx, [{ x: b.nx0 + b.skew, y: b.yFar }, { x: b.nx1 + b.skew, y: b.yFar }], r, { w: 1.2, alpha: 0.4, taperIn: 6, taperOut: 6 });
  ctx.restore();
}

/** The rolled-up end: a cylinder lying across the band, its rod ends showing. `d` is its diameter. */
export function drawRoll(ctx: CanvasRenderingContext2D, b: Band, x: number, d: number, r: RNG) {
  // x is where the roll meets the paper on the near edge
  const near = { x: x + d * 0.5, y: b.yNear - d * 0.5 };
  const far = { x: x + b.skew + d * 0.5, y: b.yFar - d * 0.5 };
  const ax = far.x - near.x;
  const ay = far.y - near.y;
  const al = Math.hypot(ax, ay);
  const nx = -ay / al;
  const ny = ax / al;
  const h = d / 2;
  ctx.save();
  // shadow on the floor to the right
  ctx.fillStyle = rgba(INK, 0.16);
  ctx.beginPath();
  ctx.ellipse(near.x + d * 0.7, b.yNear + 2, d * 0.9, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // body
  const body: Vec[] = [
    { x: near.x + nx * h, y: near.y + ny * h },
    { x: far.x + nx * h, y: far.y + ny * h },
    { x: far.x - nx * h, y: far.y - ny * h },
    { x: near.x - nx * h, y: near.y - ny * h },
  ];
  const g = ctx.createLinearGradient(near.x - nx * h, near.y - ny * h, near.x + nx * h, near.y + ny * h);
  g.addColorStop(0, '#e9dfc9');
  g.addColorStop(0.35, SCROLL_PAPER);
  g.addColorStop(1, '#cdbf9f');
  ctx.fillStyle = g;
  polyPath(ctx, body);
  ctx.fill();
  // the spiral of rolled paper on the near end
  ctx.fillStyle = '#efe5cf';
  ctx.beginPath();
  ctx.ellipse(near.x, near.y, h * 0.42, h, Math.atan2(ay, ax), 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rgba(INK, 0.45);
  ctx.lineWidth = 0.8;
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath();
    ctx.ellipse(near.x, near.y, h * 0.42 * (i / 4), h * (i / 4), Math.atan2(ay, ax), 0, Math.PI * 2);
    ctx.stroke();
  }
  // rod knobs (jiku)
  ctx.fillStyle = INK;
  for (const [p, s] of [
    [near, -1],
    [far, 1],
  ] as const) {
    ctx.beginPath();
    ctx.ellipse(p.x + (ax / al) * 5 * s, p.y + (ay / al) * 5 * s, 2.6, 4, Math.atan2(ay, ax), 0, Math.PI * 2);
    ctx.fill();
  }
  brushLine(ctx, [body[0], body[1]], r, { w: 1.6, alpha: 0.7, taperIn: 3, taperOut: 3 });
  brushLine(ctx, [body[3], body[2]], r, { w: 1.2, alpha: 0.5, taperIn: 3, taperOut: 3 });
  ctx.restore();
}

/** A simple ridge line for small landscapes. */
export function ridgeY(x: number, base: number, amp: number, freq: number, seed: number) {
  const n = fbm1(x * freq, seed, 3);
  const sharp = 1 - Math.abs(noise1(x * freq * 2.3, seed + 5) * 2 - 1);
  return base - (n * 0.75 + sharp * 0.35) * amp;
}

/** A small mountain range: wash body fading downward plus a dry-brush ridge stroke and a few cun texture strokes. */
export function miniRange(ctx: CanvasRenderingContext2D, x0: number, x1: number, base: number, amp: number, freq: number, seed: number, alpha: number, r: RNG) {
  const pts: Vec[] = [];
  for (let x = x0; x <= x1; x += 3) {
    const e = Math.min(1, (x - x0) / 30, (x1 - x) / 30);
    pts.push({ x, y: base - (base - ridgeY(x, base, amp, freq, seed)) * Math.max(0, e) });
  }
  let top = base;
  for (const p of pts) top = Math.min(top, p.y);
  const g = ctx.createLinearGradient(0, top, 0, base + 4);
  g.addColorStop(0, rgba(INK, alpha * 0.6));
  g.addColorStop(1, rgba(INK, 0));
  ctx.fillStyle = g;
  polyPath(ctx, [...pts, { x: x1, y: base + 4 }, { x: x0, y: base + 4 }]);
  ctx.fill();
  brushLine(ctx, pts, r, { w: 1.8, alpha: Math.min(1, alpha * 2.2), taperIn: 8, taperOut: 10, bristles: 2, dry: 0.6 });
  for (let i = 0; i < (x1 - x0) / 14; i++) {
    const x = range(r, x0 + 10, x1 - 10);
    const y = ridgeY(x, base, amp, freq, seed);
    if (y > base - 6) continue;
    const len = range(r, 5, 14);
    brushLine(ctx, [{ x, y: y + 1 }, { x: x - len * 0.3, y: y + len }], r, { w: range(r, 0.8, 1.6), alpha: alpha * 1.3, taperIn: 1 });
  }
}

/** A tiny shrine hall: posts, a sweeping roof. Foot at (x, y). */
export function drawShrine(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, r: RNG) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = rgba(INK, 0.16);
  ctx.fillRect(-16, -18, 32, 18);
  for (const px of [-15, -5, 5, 15]) brushLine(ctx, [{ x: px, y: 0 }, { x: px, y: -19 }], r, { w: 1.6, taperIn: 0.5, taperOut: 0.5 });
  brushLine(ctx, [{ x: -20, y: 0.5 }, { x: 20, y: 0.5 }], r, { w: 2.2, taperIn: 2, taperOut: 2 });
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(-27, -17);
  ctx.quadraticCurveTo(-12, -20, -4, -33);
  ctx.lineTo(4, -33);
  ctx.quadraticCurveTo(12, -20, 27, -17);
  ctx.quadraticCurveTo(0, -21, -27, -17);
  ctx.fill();
  brushLine(ctx, [{ x: -6, y: -34 }, { x: 6, y: -34 }], r, { w: 2, taperIn: 1, taperOut: 1 });
  ctx.restore();
}

/** A village house: walls in wash, a heavy roof stroke. */
export function drawHouse(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, r: RNG) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = rgba(INK, 0.12);
  ctx.fillRect(-12, -12, 24, 12);
  brushLine(ctx, [{ x: -12, y: 0 }, { x: -12, y: -12 }], r, { w: 1.3, taperIn: 0.5, taperOut: 0.5 });
  brushLine(ctx, [{ x: 12, y: 0 }, { x: 12, y: -12 }], r, { w: 1.3, taperIn: 0.5, taperOut: 0.5 });
  ctx.fillStyle = INK;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.moveTo(-18, -11);
  ctx.lineTo(-6, -24);
  ctx.lineTo(6, -24);
  ctx.lineTo(18, -11);
  ctx.quadraticCurveTo(0, -13, -18, -11);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = rgba(INK, 0.5);
  ctx.fillRect(-3, -8, 4, 8);
  ctx.restore();
}

/**
 * The miniature world on the master's scroll (P1 to P3), drawn on the band from left to right: the shrine and
 * its torii on the first page, a village, hills with pines, then waves and an island. `until` stops the painting
 * at an x (P2: the world stops where her last stroke begins).
 */
export function drawMiniWorld(ctx: CanvasRenderingContext2D, b: Band, seed: number, until = Infinity) {
  const r = mulberry32(seed);
  const ground = b.yNear - 16;
  const x0 = b.nx0 + 24;
  ctx.save();
  bandPath(ctx, b);
  ctx.clip();
  if (until < Infinity) {
    ctx.beginPath();
    ctx.rect(b.nx0 - 10, b.yFar - 40, until - b.nx0 + 10, b.yNear - b.yFar + 60);
    ctx.clip();
  }
  // far hills across the whole scroll, very pale
  miniRange(ctx, x0 + 120, b.nx1 - 80, ground - 30, 46, 0.012, seed + 1, 0.12, r);
  // nearer hills in the middle
  miniRange(ctx, x0 + 290, x0 + 470, ground - 6, 54, 0.02, seed + 2, 0.22, r);
  // pines on the near hills
  for (const [px, s] of [
    [x0 + 318, 0.11],
    [x0 + 356, 0.14],
    [x0 + 410, 0.12],
    [x0 + 446, 0.1],
  ]) {
    const y = ridgeY(px, ground - 6, 54, 0.02, seed + 2);
    drawDecor(ctx, { kind: 'pine', x: px, y: Math.min(ground - 2, y + 22), s, seed: Math.floor(px), flip: px % 2 > 1 });
  }
  // ground line through the first pages
  brushLine(ctx, [{ x: x0 - 6, y: ground }, { x: x0 + 250, y: ground + 1 }, { x: x0 + 480, y: ground }], r, { w: 2.2, alpha: 0.7, taperIn: 10, taperOut: 30, bristles: 3, dry: 0.6 });
  // the first page: a shrine hall and its torii
  drawShrine(ctx, x0 + 26, ground, 0.95, r);
  ctx.save();
  ctx.translate(x0 + 78, ground);
  ctx.scale(0.19, 0.19);
  drawTorii(ctx, 0, 0, 0);
  ctx.restore();
  // a village of a few roofs
  for (const [hx, s] of [
    [x0 + 172, 0.9],
    [x0 + 200, 1.05],
    [x0 + 232, 0.85],
    [x0 + 262, 1],
  ]) drawHouse(ctx, hx, ground + (hx % 3), s, r);
  // waves and an island toward the rolled end: painted on a scratch sheet, faded in from the hills along x with a
  // gradient mask, then laid onto the band (whose clip is still on), so the paper tone stays continuous
  const seaX0 = x0 + 470;
  {
    const m = ctx.getTransform();
    const sc = document.createElement('canvas');
    sc.width = ctx.canvas.width;
    sc.height = ctx.canvas.height;
    const g = sc.getContext('2d')!;
    g.setTransform(m);
    g.save();
    g.translate(seaX0, ground - 4);
    g.scale(0.2, 0.2);
    drawSea(g, 0, 0, (b.nx1 + b.skew - seaX0 + 60) / 0.2, 1.3);
    g.restore();
    g.globalCompositeOperation = 'destination-in';
    const fg = g.createLinearGradient(seaX0, 0, seaX0 + 70, 0);
    fg.addColorStop(0, 'rgba(0,0,0,0)');
    fg.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = fg;
    g.fillRect(seaX0 - 200, b.yFar - 60, b.nx1 + b.skew - seaX0 + 400, b.yNear - b.yFar + 120);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(sc, 0, 0);
    ctx.restore();
    sc.width = sc.height = 0;
  }
  const ix = seaX0 + 70;
  ctx.fillStyle = rgba(INK, 0.55);
  ctx.beginPath();
  ctx.moveTo(ix - 26, ground - 3);
  ctx.quadraticCurveTo(ix - 6, ground - 30, ix + 22, ground - 3);
  ctx.fill();
  drawDecor(ctx, { kind: 'pine', x: ix - 2, y: ground - 18, s: 0.09, seed: 77, flip: false });
  ctx.restore();
}

/** The hill ridge the master is painting in P1 (a separate layer, revealed under her brush). */
export function heldRidge(x0: number, x1: number, y: number): Vec[] {
  const pts: Vec[] = [];
  for (let i = 0; i <= 24; i++) {
    const u = i / 24;
    pts.push({ x: x0 + (x1 - x0) * u, y: y - Math.sin(u * Math.PI) * 15 - Math.sin(u * 9) * 2.5 + u * 4 });
  }
  return pts;
}

// ───────────────────────────────────────────── the blot (墨染)

/**
 * The blot: heavy wet black with a fibrous bleed edge, small satellite drips and a faint wet sheen. No eyes, no
 * face, no limbs (docs/story.md, section 2). `edge(y)` gives its left boundary; it fills to the right, to the x
 * `right`. When `right` is a function the wall's far side is a bleed edge of its own (fibres reaching right), so the
 * wall can end on paper instead of at a straight cut.
 */
export function drawBlotWall(ctx: CanvasRenderingContext2D, edge: (y: number) => number, y0: number, y1: number, right: number | ((y: number) => number), t: number, seed: number) {
  const pts: Vec[] = [];
  for (let y = y0; y <= y1; y += 6) pts.push({ x: edge(y) + (noise1(y * 0.05, seed) - 0.5) * 22 + (noise1(y * 0.21 + t * 0.4, seed + 3) - 0.5) * 7, y });
  const ragged = typeof right === 'function';
  const back: Vec[] = ragged
    ? pts.map((p) => ({ x: Math.max(p.x + 4, right(p.y) + (noise1(p.y * 0.06, seed + 21) - 0.5) * 20 + (noise1(p.y * 0.19 + t * 0.4, seed + 23) - 0.5) * 6), y: p.y })).reverse()
    : [
        { x: right, y: y1 },
        { x: right, y: y0 },
      ];
  const a0 = ctx.globalAlpha;
  ctx.save();
  // the bleed: a darker halo just ahead of the edge, like ink wicking into paper
  ctx.fillStyle = rgba(INK, 0.12);
  polyPath(ctx, [...pts.map((p) => ({ x: p.x - 10 - noise1(p.y * 0.09, seed + 9) * 16, y: p.y })), ...back.map((p) => ({ x: p.x + (ragged ? 10 + noise1(p.y * 0.09, seed + 29) * 16 : 0), y: p.y }))]);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.globalAlpha = a0 * (0.96);
  polyPath(ctx, [...pts, ...back]);
  ctx.fill();
  ctx.globalAlpha = a0;
  // fibres reaching out along the paper grain (both ways when the far side bleeds too)
  const r = mulberry32(seed);
  ctx.strokeStyle = INK;
  ctx.lineCap = 'round';
  const sides: [Vec[], number][] = ragged ? [[pts, Math.PI], [back, 0]] : [[pts, Math.PI]];
  for (const [line, dir] of sides) {
    const sgn = dir === 0 ? -1 : 1;
    for (let i = 0; i < line.length; i += 2) {
      const p = line[i];
      if (r() < 0.35) continue;
      const len = (8 + r() * 30) * (0.7 + 0.3 * Math.sin(t * 1.3 + i));
      const a = dir + (r() - 0.5) * 0.9;
      ctx.globalAlpha = a0 * (0.35 + r() * 0.4);
      ctx.lineWidth = 0.8 + r() * 1.6;
      ctx.beginPath();
      ctx.moveTo(p.x + 2 * sgn, p.y);
      ctx.quadraticCurveTo(p.x + Math.cos(a) * len * 0.5, p.y + Math.sin(a) * len * 0.5 + (r() - 0.5) * 6, p.x + Math.cos(a) * len, p.y + Math.sin(a) * len);
      ctx.stroke();
    }
  }
  // satellite drips
  for (let i = 0; i < 10; i++) {
    const p = pts[Math.floor(r() * pts.length)];
    const d = 10 + r() * 34;
    ctx.globalAlpha = a0 * (0.6 + r() * 0.3);
    ctx.beginPath();
    ctx.arc(p.x - d, p.y + (r() - 0.5) * 10, 1 + r() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // wet sheen just inside the edge
  ctx.globalAlpha = a0;
  ctx.strokeStyle = 'rgba(255,255,255,0.09)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x + 9, p.y) : ctx.moveTo(p.x + 9, p.y)));
  ctx.stroke();
  ctx.restore();
}

/** The wet pool at the end of her last stroke, spreading as the blot (P2, P3). */
export function drawBlotPool(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, t: number, seed: number, squash = 0.42) {
  const pts: Vec[] = [];
  const n = 72;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const tendril = Math.pow(Math.max(0, noise1(i * 0.37, seed) - 0.45) * 2.2, 2) * (0.6 + 0.4 * Math.sin(t * 2 + i));
    const rr = R * (0.85 + 0.25 * noise1(i * 0.15 + t * 0.3, seed + 1) + tendril * 0.9);
    pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr * squash });
  }
  const a0 = ctx.globalAlpha;
  ctx.save();
  ctx.fillStyle = rgba(INK, 0.14);
  ctx.beginPath();
  ctx.ellipse(cx, cy, R * 1.25, R * 1.25 * squash, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.globalAlpha = a0 * (0.97);
  polyPath(ctx, pts);
  ctx.fill();
  ctx.globalAlpha = a0;
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = Math.max(1, R * 0.05);
  ctx.beginPath();
  ctx.ellipse(cx - R * 0.15, cy - R * 0.12 * squash, R * 0.45, R * 0.45 * squash * 0.6, -0.1, Math.PI * 1.1, Math.PI * 1.7);
  ctx.stroke();
  ctx.restore();
}

// ───────────────────────────────────────────── landscapes from the game's own backdrop

let backdropCache: { k: number; bd: Backdrop } | null = null;

/** The spring Backdrop (the First Scroll's look), built once per device scale and shared by panels. */
export function springBackdrop(k: number): Backdrop {
  if (backdropCache && Math.abs(backdropCache.k - k) < 1e-3) return backdropCache.bd;
  const bd = new Backdrop(1600, 'spring');
  bd.build(k);
  backdropCache = { k, bd };
  return bd;
}

export function releaseBackdrop() {
  backdropCache = null;
}

/**
 * Paint the game's spring backdrop into a layer context (which is in design units). The Backdrop sets its own
 * transform, so it is drawn into a scratch canvas first. camX picks which stretch of hills shows; originX is the
 * design x where the backdrop's own x = 0 sits (default: the layer's left edge). Anchoring it to the frame rather than
 * to the layer keeps the ensō and the birds in the same place on every screen shape. With the 1600-unit spring
 * backdrop, every strip covers design x -450..1800 when originX - 0.1 * camX <= -450 and
 * originX + 5472 - 0.42 * camX >= 1800; the ensō's left edge is at originX + 760 - 0.04 * camX (300 wide), the
 * birds at originX - 300 + (0, 911, 1822) (y about 130, 235, 315).
 */
export function paintBackdrop(ctx: CanvasRenderingContext2D, k: number, x: number, y: number, w: number, h: number, camX: number, camY = 0, originX = x) {
  const bd = springBackdrop(k);
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * k);
  c.height = Math.ceil(h * k);
  const g = c.getContext('2d')!;
  // Backdrop maps world (wx, wy) to device k * (wx - camX * p, wy - camY * p) with setTransform; shift every one of
  // its transforms so its x = 0 lands on originX
  const shift = (originX - x) * k;
  const set = g.setTransform.bind(g) as (a: number, b: number, c: number, d: number, e: number, f: number) => void;
  (g as unknown as { setTransform: (...m: number[]) => void }).setTransform = (...m: number[]) => set(m[0], m[1], m[2], m[3], m[4] + shift, m[5]);
  bd.draw(g, camX, camY + y, k, 0);
  ctx.drawImage(c, x, y, w, h);
  c.width = c.height = 0;
}

/** A ground mass like the game's islands: paper body, graded ink under the lip, a dry-brush edge. */
export function drawGround(ctx: CanvasRenderingContext2D, x0: number, x1: number, y: number, seed: number, depth = 260) {
  const r = mulberry32(seed);
  const pts: Vec[] = [];
  for (let x = x0; x <= x1; x += 20) pts.push({ x, y: y + (noise1(x * 0.004, seed) - 0.5) * 10 });
  ctx.save();
  ctx.fillStyle = PAPER;
  polyPath(ctx, [...pts, { x: x1, y: y + depth }, { x: x0, y: y + depth }]);
  ctx.fill();
  const g = ctx.createLinearGradient(0, y - 6, 0, y + depth);
  g.addColorStop(0, rgba(INK, 0.45));
  g.addColorStop(0.08, rgba(INK, 0.2));
  g.addColorStop(0.4, rgba(INK, 0.06));
  g.addColorStop(1, rgba(INK, 0));
  ctx.fillStyle = g;
  ctx.fill();
  brushLine(ctx, pts, r, { w: 7, taperIn: 4, taperOut: 4, bristles: 6, dry: 0.5 });
  for (let i = 0; i < (x1 - x0) / 30; i++) {
    const x = range(r, x0, x1);
    const d = Math.pow(r(), 1.5) * depth * 0.8 + 16;
    const len = range(r, 30, 140);
    brushLine(ctx, [{ x, y: y + d }, { x: x + len, y: y + d + range(r, -3, 3) }], r, { w: range(r, 1.5, 4), alpha: 0.12 * (1 - d / depth), bristles: 2, dry: 1 });
  }
  // grass tufts along the lip
  ctx.fillStyle = INK;
  for (let x = x0 + 10; x < x1; x += range(r, 30, 120)) {
    for (let k = 0; k < 3; k++) {
      const hh = range(r, 7, 18);
      const lean = range(r, -8, 10);
      ctx.globalAlpha = range(r, 0.5, 0.9);
      ctx.beginPath();
      ctx.moveTo(x + k * 3 - 1, y + 2);
      ctx.quadraticCurveTo(x + k * 3 + lean * 0.2, y - hh * 0.6, x + k * 3 + lean, y - hh);
      ctx.lineTo(x + k * 3 + 1, y + 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/** smoke from a lamp that has gone out: a thin curling thread, thinning as it rises */
export function drawSmoke(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, k: number) {
  if (k <= 0) return;
  const pts: Vec[] = [];
  for (let i = 0; i <= 20; i++) {
    const u = i / 20;
    pts.push({ x: x + Math.sin(u * 6 + t * 1.5) * 6 * u + u * 14, y: y - u * 120 * Math.min(1, 0.4 + k) });
  }
  ctx.save();
  ctx.strokeStyle = rgba(INK, 0.3 * Math.min(1, k * 2) * (1 - Math.max(0, k - 0.6)));
  ctx.lineWidth = 1.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.stroke();
  ctx.restore();
}

export { curve };
