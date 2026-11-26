export interface Vec {
  x: number;
  y: number;
}

/** A brush sample: position plus stroke width. */
export interface BP extends Vec {
  w: number;
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const smoothstep = (t: number) => t * t * (3 - 2 * t);
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

export function cumLengths(pts: Vec[]): number[] {
  const c = [0];
  for (let i = 1; i < pts.length; i++) {
    c.push(c[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  return c;
}

export function chaikin(pts: BP[], iters: number): BP[] {
  let p = pts;
  for (let k = 0; k < iters; k++) {
    if (p.length < 3) return p;
    const out: BP[] = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i];
      const b = p[i + 1];
      out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25, w: a.w * 0.75 + b.w * 0.25 });
      out.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75, w: a.w * 0.25 + b.w * 0.75 });
    }
    out.push(p[p.length - 1]);
    p = out;
  }
  return p;
}

/** Resample a polyline at equal arc-length spacing. */
export function resample(pts: BP[], spacing: number): BP[] {
  if (pts.length < 2) return pts.slice();
  const cum = cumLengths(pts);
  const L = cum[cum.length - 1];
  const n = Math.max(1, Math.round(L / spacing));
  const out: BP[] = [];
  let j = 0;
  for (let i = 0; i <= n; i++) {
    const s = (L * i) / n;
    while (j < cum.length - 2 && cum[j + 1] < s) j++;
    const seg = cum[j + 1] - cum[j] || 1;
    const t = clamp((s - cum[j]) / seg, 0, 1);
    const a = pts[j];
    const b = pts[j + 1];
    out.push({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w: lerp(a.w, b.w, t) });
  }
  return out;
}

export interface PathPoint extends Vec {
  tx: number;
  ty: number;
}

export function pointAt(pts: Vec[], cum: number[], s: number): PathPoint {
  const L = cum[cum.length - 1];
  s = clamp(s, 0, L);
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (cum[m] <= s) lo = m;
    else hi = m;
  }
  const a = pts[lo];
  const b = pts[hi];
  const seg = cum[hi] - cum[lo] || 1;
  const t = (s - cum[lo]) / seg;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy) || 1;
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), tx: dx / l, ty: dy / l };
}

export function closestOnPolyline(pts: Vec[], cum: number[], p: Vec): { d: number; s: number } {
  let best = Infinity;
  let bestS = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy || 1;
    const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, 0, 1);
    const qx = a.x + dx * t;
    const qy = a.y + dy * t;
    const d = Math.hypot(p.x - qx, p.y - qy);
    if (d < best) {
      best = d;
      bestS = cum[i] + (cum[i + 1] - cum[i]) * t;
    }
  }
  return { d: best, s: bestS };
}

function segHitsRect(ax: number, ay: number, bx: number, by: number, x0: number, y0: number, x1: number, y1: number) {
  // Liang–Barsky clipping test
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dy = by - ay;
  const p = [-dx, dx, -dy, dy];
  const q = [ax - x0, x1 - ax, ay - y0, y1 - ay];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      const r = q[i] / p[i];
      if (p[i] < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
    }
  }
  return true;
}

export function polylineHitsRect(pts: Vec[], x0: number, y0: number, x1: number, y1: number): boolean {
  for (let i = 0; i < pts.length - 1; i++) {
    if (segHitsRect(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, x0, y0, x1, y1)) return true;
  }
  return pts.length === 1 && pts[0].x >= x0 && pts[0].x <= x1 && pts[0].y >= y0 && pts[0].y <= y1;
}

export function polylineDist(pts: Vec[], p: Vec): number {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy || 1;
    const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, 0, 1);
    best = Math.min(best, Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)));
  }
  return best;
}
