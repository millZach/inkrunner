/**
 * 紫 ring gesture (docs/summer-design.md 1.1): incremental closing detection on a Purple stroke.
 *
 * Fed one raw brush point at a time while the brush is down. Points are resampled every 4 u; the
 * signed turning angle is tracked from 12 u chords (it telescopes, so hand jitter cancels out). The loop
 * closes at the first point after `closeAngle` degrees of turning where the brush is within
 * max(closeDist, closeScale·R̂) of the start (closeScale 0.35 unless tuned), or the newest segment crosses an earlier one. Everything after the
 * closing point is the tail. A stroke that never closed still counts when the brush lifts after most of a circle
 * (closeOnLift). No imports, so node can load this file directly for unit tests.
 */
export interface P {
  x: number;
  y: number;
}

export interface CloseTuning {
  /** brush within this many units of the start closes the loop (or 0.35 of its mean radius if larger) */
  closeDist: number;
  /** degrees of turning needed before the loop may close */
  closeAngle: number;
  /** the start distance also grows with the ring: max(closeDist, closeScale·R̂) (default 0.35) */
  closeScale?: number;
}

/**
 * The turning a clean circle of radius r really needs before it closes: the closing angle, or more when
 * the start distance is shorter than the chord of the missing arc (a 40 u gap needs 317° at R 55).
 */
export function effectiveCloseAngle(t: CloseTuning, r: number): number {
  const d = Math.max(t.closeDist, (t.closeScale ?? 0.35) * r);
  const gap = d >= 2 * r ? 360 : (2 * Math.asin(d / (2 * r)) * 180) / Math.PI;
  return Math.max(t.closeAngle, 360 - gap);
}

export interface LoopFit {
  cx: number;
  cy: number;
  /** mean distance of the loop's points from its centroid */
  r: number;
  /** shortest ÷ longest distance from the centroid */
  roundness: number;
  /** +1 when drawn clockwise on screen (y down), -1 anticlockwise */
  dir: 1 | -1;
}

export type RingFail = 'open' | 'small' | 'large' | 'flat' | 'blocked' | 'far';

/** The brush-text label shown on a fizzled ring. */
export const FAIL_LABEL: Record<RingFail, string> = {
  open: 'open',
  small: 'too small',
  large: 'too big',
  flat: 'too flat',
  blocked: 'blocked',
  far: 'too far',
};

export const RING_MIN_R = 40;
export const RING_MAX_R = 150;
/** Zach (2026-10-11): rings were too hard to draw; ovals up to about 3:1 count */
export const RING_MIN_ROUND = 0.3;
/** a stroke lifted before it closed still counts with this much turning (degrees)... */
export const LIFT_CLOSE_ANGLE = 260;
/** ...and the brush within this many radii of the start (a 260° arc ends 1.53 R away) */
export const LIFT_CLOSE_GAP = 1.6;
/** a flicked tail must be this long, and end this far past the rim, to aim the spout */
export const TAIL_MIN_LEN = 30;
export const TAIL_PAST_RIM = 15;
const SPACING = 4;
const CHORD = 3;

/** Size and roundness verdict for a closed loop (placement and reach are judged by the game). */
export function shapeFail(f: LoopFit): RingFail | null {
  if (f.r < RING_MIN_R) return 'small';
  if (f.r > RING_MAX_R) return 'large';
  if (f.roundness < RING_MIN_ROUND) return 'flat';
  return null;
}

export function fitPoints(pts: P[], dir: 1 | -1 = 1): LoopFit {
  let sx = 0;
  let sy = 0;
  for (const p of pts) {
    sx += p.x;
    sy += p.y;
  }
  const n = Math.max(1, pts.length);
  let cx = sx / n;
  let cy = sy / n;
  // the area centroid of the loop (closed by a chord) is far steadier than the point mean when the loop
  // stops short of a full turn, which is the normal case: the mean leans toward the drawn side
  let a2 = 0;
  let ax = 0;
  let ay = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const c = p.x * q.y - q.x * p.y;
    a2 += c;
    ax += (p.x + q.x) * c;
    ay += (p.y + q.y) * c;
  }
  if (Math.abs(a2) > 1e-6 * Math.max(1, n)) {
    cx = ax / (3 * a2);
    cy = ay / (3 * a2);
  }
  let sum = 0;
  let lo = Infinity;
  let hi = 0;
  for (const p of pts) {
    const d = Math.hypot(p.x - cx, p.y - cy);
    sum += d;
    if (d < lo) lo = d;
    if (d > hi) hi = d;
  }
  return { cx, cy, r: sum / n, roundness: hi > 0 ? lo / hi : 0, dir };
}

/**
 * Least-squares circle through the points (Kåsa): the true centre of an arc that stops short of a full turn, where
 * the area centroid leans toward the drawn side. Falls back to fitPoints when the points are nearly straight.
 */
export function fitArc(pts: P[], dir: 1 | -1 = 1): LoopFit {
  const n = pts.length;
  let mx = 0;
  let my = 0;
  for (const p of pts) {
    mx += p.x / n;
    my += p.y / n;
  }
  let suu = 0;
  let svv = 0;
  let suv = 0;
  let suuu = 0;
  let svvv = 0;
  let suvv = 0;
  let svuu = 0;
  for (const p of pts) {
    const u = p.x - mx;
    const v = p.y - my;
    suu += u * u;
    svv += v * v;
    suv += u * v;
    suuu += u * u * u;
    svvv += v * v * v;
    suvv += u * v * v;
    svuu += v * u * u;
  }
  const det = suu * svv - suv * suv;
  if (Math.abs(det) < 1e-9 * Math.max(1, suu * svv)) return fitPoints(pts, dir);
  const bu = (suuu + suvv) / 2;
  const bv = (svvv + svuu) / 2;
  const cx = mx + (bu * svv - bv * suv) / det;
  const cy = my + (bv * suu - bu * suv) / det;
  let sum = 0;
  let lo = Infinity;
  let hi = 0;
  for (const p of pts) {
    const d = Math.hypot(p.x - cx, p.y - cy);
    sum += d;
    if (d < lo) lo = d;
    if (d > hi) hi = d;
  }
  return { cx, cy, r: sum / n, roundness: hi > 0 ? lo / hi : 0, dir };
}

function segCross(a: P, b: P, c: P, d: P): boolean {
  const d1 = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const d2 = (b.x - a.x) * (d.y - a.y) - (b.y - a.y) * (d.x - a.x);
  const d3 = (d.x - c.x) * (a.y - c.y) - (d.y - c.y) * (a.x - c.x);
  const d4 = (d.x - c.x) * (b.y - c.y) - (d.y - c.y) * (b.x - c.x);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

export class RingTracker {
  /** the stroke resampled every 4 u */
  pts: P[] = [];
  /** signed turning of the chord headings so far, radians (positive = clockwise on screen) */
  turn = 0;
  /** `turn` corrected to the arc actually drawn (what `closeAngle` is compared with) */
  drawn = 0;
  /** the closed loop, once it closes */
  loop: LoopFit | null = null;
  /** index in `pts` of the closing point; the tail is everything after it */
  closeIdx = -1;
  /** last raw point fed (the brush tip) */
  tip: P | null = null;
  private carry = 0;
  private h0: number | null = null;
  /** previous chord heading, raw (−π..π) */
  private hr = 0;
  private sx = 0;
  private sy = 0;

  tune: CloseTuning;

  constructor(tune: CloseTuning) {
    this.tune = tune;
  }

  /** Add a raw brush point. Returns true on the call where the loop closes. */
  feed(p: P): boolean {
    const was = this.loop !== null;
    const last = this.tip;
    this.tip = { x: p.x, y: p.y };
    if (!last) {
      this.emit(p);
      return false;
    }
    const d = Math.hypot(p.x - last.x, p.y - last.y);
    if (d <= 0) return false;
    let along = SPACING - this.carry;
    while (along <= d) {
      const t = along / d;
      this.emit({ x: last.x + (p.x - last.x) * t, y: last.y + (p.y - last.y) * t });
      along += SPACING;
    }
    this.carry = d - (along - SPACING);
    // the brush tip can be up to one spacing past the last sample: a loop that stops just short is judged
    // at the tip itself, not up to 4 u back along the stroke
    if (!this.loop && this.carry > 0.5 && this.h0 !== null && Math.abs(this.drawn) >= (this.tune.closeAngle * Math.PI) / 180) {
      const pts = this.pts;
      if (Math.hypot(p.x - pts[0].x, p.y - pts[0].y) <= this.startReach()) {
        pts.push({ x: p.x, y: p.y });
        this.sx += p.x;
        this.sy += p.y;
        this.carry = 0;
        this.close(0, pts.length - 1, this.turn >= 0 ? 1 : -1);
      }
    }
    return !was && this.loop !== null;
  }

  /** How near the start the brush must come to close: max(closeDist, closeScale · mean radius so far). */
  private startReach(): number {
    const pts = this.pts;
    const n = pts.length;
    const cx = this.sx / n;
    const cy = this.sy / n;
    let mean = 0;
    for (const p of pts) mean += Math.hypot(p.x - cx, p.y - cy);
    mean /= n;
    return Math.max(this.tune.closeDist, (this.tune.closeScale ?? 0.35) * mean);
  }

  private emit(q: P) {
    const pts = this.pts;
    pts.push(q);
    this.sx += q.x;
    this.sy += q.y;
    const i = pts.length - 1;
    if (i < CHORD) return;
    const a = pts[i - CHORD];
    const hd = Math.atan2(q.y - a.y, q.x - a.x);
    if (this.h0 === null) {
      this.h0 = this.hr = hd;
      return;
    }
    let dh = hd - this.hr;
    if (dh > Math.PI) dh -= 2 * Math.PI;
    else if (dh < -Math.PI) dh += 2 * Math.PI;
    this.hr = hd;
    this.turn += dh;
    // chord headings see the arc from one chord in to one chord short: scale back up to the drawn arc
    const arc = i * SPACING;
    this.drawn = (this.turn * arc) / Math.max(SPACING, arc - CHORD * SPACING);
    if (this.loop || Math.abs(this.drawn) < (this.tune.closeAngle * Math.PI) / 180) return;
    const dir: 1 | -1 = this.turn >= 0 ? 1 : -1;
    // near the start?
    if (Math.hypot(q.x - pts[0].x, q.y - pts[0].y) <= this.startReach()) {
      this.close(0, i, dir);
      return;
    }
    // or crossing an earlier part of itself (a loop drawn after a lead-in)
    const b = pts[i - 1];
    for (let j = 0; j + 1 < i - 3; j++) {
      if (segCross(b, q, pts[j], pts[j + 1])) {
        this.close(j + 1, i, dir);
        return;
      }
    }
  }

  private close(from: number, to: number, dir: 1 | -1) {
    this.closeIdx = to;
    this.loop = fitPoints(this.pts.slice(from, to + 1), dir);
  }

  /**
   * The brush lifted before the loop closed: most of a circle still counts. With LIFT_CLOSE_ANGLE of turning and
   * the brush within LIFT_CLOSE_GAP radii of the start, the whole stroke is the loop and the ring finishes the
   * missing arc (no tail, so the spout points ahead). Returns true when it closed.
   */
  closeOnLift(): boolean {
    if (this.loop || this.pts.length < 8 || Math.abs(this.drawn) < (LIFT_CLOSE_ANGLE * Math.PI) / 180) return false;
    const pts = this.pts;
    const fit = fitArc(pts, this.turn >= 0 ? 1 : -1);
    const end = this.tip ?? pts[pts.length - 1];
    if (Math.hypot(end.x - pts[0].x, end.y - pts[0].y) > LIFT_CLOSE_GAP * fit.r) return false;
    this.closeIdx = pts.length - 1;
    this.loop = fit;
    return true;
  }

  /** Best-effort circle through the whole stroke (the ghost shown for an open stroke). */
  fitAll(): LoopFit {
    return fitPoints(this.pts.length ? this.pts : [this.tip ?? { x: 0, y: 0 }], this.turn >= 0 ? 1 : -1);
  }

  /** Length of the tail painted after the closing point, and its tip. */
  tail(): { len: number; tip: P } | null {
    if (this.closeIdx < 0) return null;
    let len = 0;
    for (let i = this.closeIdx + 1; i < this.pts.length; i++) {
      len += Math.hypot(this.pts[i].x - this.pts[i - 1].x, this.pts[i].y - this.pts[i - 1].y);
    }
    const tip = this.tip ?? this.pts[this.pts.length - 1];
    return { len, tip };
  }

  /**
   * The spout: centre → tail tip when the tail is long enough and ends past the rim, otherwise
   * straight ahead (+x). Returns the unit vector and whether a real tail aimed it.
   */
  spout(): { x: number; y: number; tailed: boolean } {
    const L = this.loop;
    const t = this.tail();
    if (L && t && t.len >= TAIL_MIN_LEN) {
      const dx = t.tip.x - L.cx;
      const dy = t.tip.y - L.cy;
      const d = Math.hypot(dx, dy);
      if (d >= L.r + TAIL_PAST_RIM) return { x: dx / d, y: dy / d, tailed: true };
    }
    return { x: 1, y: 0, tailed: false };
  }
}
