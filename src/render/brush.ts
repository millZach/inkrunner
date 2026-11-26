import { INK } from '../config';
import { cumLengths, type Vec } from '../math';
import { noise1, type RNG } from '../rng';

export function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function normals(pts: Vec[]): Vec[] {
  const out: Vec[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l = Math.hypot(dx, dy) || 1;
    out.push({ x: -dy / l, y: dx / l });
  }
  return out;
}

export function polyPath(ctx: CanvasRenderingContext2D, pts: Vec[], close = true) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  if (close) ctx.closePath();
}

export function linePath(ctx: CanvasRenderingContext2D, pts: Vec[]) {
  polyPath(ctx, pts, false);
}

export interface BrushOpts {
  w: number;
  color?: string;
  alpha?: number;
  taperIn?: number;
  taperOut?: number;
  bristles?: number;
  dry?: number;
  wobble?: number;
}

/**
 * A sumi-e brush stroke: a tapered body with a wobbling edge, plus optional
 * bristle streaks that break up (dry brush) toward the end of the stroke.
 */
export function brushLine(ctx: CanvasRenderingContext2D, input: Vec[], r: RNG, o: BrushOpts) {
  if (input.length < 2) return;
  const pts = densify(input, Math.max(1.5, Math.min(10, o.w * 0.6)));
  const cum = cumLengths(pts);
  const L = cum[cum.length - 1];
  if (L < 0.5) return;
  const ns = normals(pts);
  const seed = Math.floor(r() * 100000);
  const tin = Math.max(0.01, o.taperIn ?? Math.min(L * 0.25, o.w * 1.5));
  const tout = Math.max(0.01, o.taperOut ?? Math.min(L * 0.4, o.w * 4));
  const prof = (s: number) => Math.pow(Math.min(1, s / tin), 0.55) * Math.pow(Math.min(1, (L - s) / tout), 0.75);
  const wob = o.wobble ?? 0.3;
  const color = o.color ?? INK;
  const alpha = o.alpha ?? 1;

  const left: Vec[] = [];
  const right: Vec[] = [];
  for (let i = 0; i < pts.length; i++) {
    const s = cum[i];
    const hw = (o.w * prof(s) * (1 + wob * (noise1(s * 0.05, seed) - 0.5) * 2)) / 2;
    const off = (noise1(s * 0.03, seed + 7) - 0.5) * o.w * 0.15;
    left.push({ x: pts[i].x + ns[i].x * (hw + off), y: pts[i].y + ns[i].y * (hw + off) });
    right.push({ x: pts[i].x - ns[i].x * (hw - off), y: pts[i].y - ns[i].y * (hw - off) });
  }
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha * 0.88;
  polyPath(ctx, left.concat(right.reverse()));
  ctx.fill();

  const nb = o.bristles ?? 0;
  if (nb > 0) {
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    const dry = o.dry ?? 0;
    for (let b = 0; b < nb; b++) {
      const off = (r() - 0.5) * o.w * 1.05;
      ctx.lineWidth = o.w * (0.05 + r() * 0.09);
      ctx.globalAlpha = alpha * (0.25 + r() * 0.45);
      if (dry > 0) {
        ctx.setLineDash([L * (0.2 + r() * 0.5), 4 + r() * dry * 40, 8 + r() * 40, 2 + r() * dry * 25]);
        ctx.lineDashOffset = r() * 60;
      }
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const k = off * prof(cum[i]);
        const x = pts[i].x + ns[i].x * k;
        const y = pts[i].y + ns[i].y * k;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  ctx.globalAlpha = 1;
}

/** Subdivide long segments so tapers and wobble have vertices to act on. */
export function densify(pts: Vec[], step: number): Vec[] {
  const out: Vec[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let k = 1; k <= n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  return out;
}

/** Points along a quadratic-ish curve from a through control c to b. */
export function curve(a: Vec, c: Vec, b: Vec, n = 16): Vec[] {
  const out: Vec[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push({ x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y });
  }
  return out;
}

/** A leaf / petal / blade: a pointed lens shape along a curve. */
export function leaf(ctx: CanvasRenderingContext2D, a: Vec, c: Vec, b: Vec, w: number) {
  const pts = curve(a, c, b, 12);
  const ns = normals(pts);
  const left: Vec[] = [];
  const right: Vec[] = [];
  for (let i = 0; i < pts.length; i++) {
    const t = i / (pts.length - 1);
    const hw = (w / 2) * Math.sin(Math.PI * Math.pow(t, 0.7));
    left.push({ x: pts[i].x + ns[i].x * hw, y: pts[i].y + ns[i].y * hw });
    right.push({ x: pts[i].x - ns[i].x * hw, y: pts[i].y - ns[i].y * hw });
  }
  polyPath(ctx, left.concat(right.reverse()));
  ctx.fill();
}
