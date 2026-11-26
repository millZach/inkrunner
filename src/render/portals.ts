/**
 * How a 紫 ring reads (docs/summer-design.md 1.7): shape and motion, not only colour.
 * A ring is a closed loop whose brush dashes turn around the rim, with a dark, swirling middle
 * (a hole in the paper) and a tomoe spout. Indigo currents are open lines whose flecks flow along
 * them, so the two never read alike, in greyscale or at phone size.
 * Everything here is drawn per frame with a handful of arcs and gradients (no blur, no shadows).
 */
import { FONT_BRUSH, INK, INKS, PAPER } from '../config';
import type { LoopFit } from '../mechanics/ringfit';
import type { Projectile, Ring } from '../mechanics/portals';
import type { Vec } from '../math';
import { rgba } from './brush';

const M = INKS.murasaki;
const TAU = Math.PI * 2;

/** The tomoe spout: a tapered comma leaving the rim along `dir`, curling with the drawn direction. */
function spoutPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, dir: Vec, curl: number, len: number) {
  const a = Math.atan2(dir.y, dir.x);
  const nx = -Math.sin(a);
  const ny = Math.cos(a);
  const bx = cx + Math.cos(a) * r * 0.92;
  const by = cy + Math.sin(a) * r * 0.92;
  const w = r * 0.2;
  const tx = cx + Math.cos(a) * (r + len) + nx * curl * len * 0.35;
  const ty = cy + Math.sin(a) * (r + len) + ny * curl * len * 0.35;
  const mx = cx + Math.cos(a) * (r + len * 0.55);
  const my = cy + Math.sin(a) * (r + len * 0.55);
  ctx.beginPath();
  ctx.moveTo(bx + nx * w, by + ny * w);
  ctx.quadraticCurveTo(mx + nx * w * 0.9, my + ny * w * 0.9, tx, ty);
  ctx.quadraticCurveTo(mx - nx * w * 0.3, my - ny * w * 0.3, bx - nx * w, by - ny * w);
  ctx.closePath();
}

function swirlArms(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rot: number, dir: number, arms: number) {
  ctx.beginPath();
  for (let k = 0; k < arms; k++) {
    const a0 = rot + (k / arms) * TAU;
    for (let i = 0; i <= 9; i++) {
      const u = i / 9;
      const rr = r * (0.16 + 0.7 * u);
      const a = a0 - dir * u * 2.3;
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
  }
  ctx.stroke();
}

export interface RingLook {
  linked: boolean;
  /** dashes turn this many turns per second */
  speed: number;
  /** overall alpha (closing rings fade) */
  alpha: number;
  /** draw the automatic short spout (no real tail was flicked, or line aim) */
  autoSpout: boolean;
  spout: Vec;
  /** her pre-painted rings: pale wash with a thin purple rim */
  hers: boolean;
}

/** The living ring drawn over its painted stroke (or alone, for her rings). */
export function drawRing(ctx: CanvasRenderingContext2D, ring: Ring, look: RingLook, t: number) {
  const { cx, cy } = ring;
  const close = ring.state === 'closing' ? Math.min(1, ring.closeT / 0.4) : 0;
  const r = ring.r * (1 - 0.18 * close);
  const dir = ring.dir;
  const rot = t * TAU * look.speed * dir;
  // linked pairs breathe in step (one shared clock), waiting rings stay still and dull
  const breath = look.linked ? 0.5 + 0.5 * Math.sin(t * 3.4) : 0;
  ctx.save();
  ctx.globalAlpha = look.alpha * (1 - close);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (look.linked) {
    const g = ctx.createRadialGradient(cx, cy, r * 0.8, cx, cy, r * 1.55);
    g.addColorStop(0, rgba(M.light, 0.3 + 0.22 * breath + ring.flash * 0.4));
    g.addColorStop(1, rgba(M.light, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.55, 0, TAU);
    ctx.fill();
  }
  // the hole: a dark, deep middle (reads as a door in greyscale, never as a line)
  const depth = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  if (look.hers) {
    depth.addColorStop(0, 'rgba(250,240,255,0.75)');
    depth.addColorStop(0.75, rgba(M.light, 0.35));
    depth.addColorStop(1, rgba(M.light, 0.05));
  } else {
    depth.addColorStop(0, rgba(M.dark, look.linked ? 0.62 : 0.32));
    depth.addColorStop(0.7, rgba(M.dark, look.linked ? 0.3 : 0.14));
    depth.addColorStop(1, rgba(M.dark, 0));
  }
  ctx.fillStyle = depth;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.97, 0, TAU);
  ctx.fill();

  // swirl arms turning inside
  ctx.strokeStyle = look.hers ? rgba(M.color, 0.55) : rgba(M.light, look.linked ? 0.85 : 0.4);
  ctx.lineWidth = look.linked ? 3.2 : 2.2;
  swirlArms(ctx, cx, cy, r, rot * 0.8, dir, 3);

  if (look.hers) {
    ctx.strokeStyle = M.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.stroke();
  }
  // brush dashes travelling around the rim
  const circ = TAU * r;
  ctx.setLineDash([circ / 7, circ / 7 * 0.6]);
  ctx.lineDashOffset = -rot * r;
  ctx.strokeStyle = look.linked ? rgba('#fff4ff', 0.9) : rgba(M.light, 0.55);
  ctx.lineWidth = look.linked ? 4.5 : 3;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.0, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([circ / 11, circ / 11 * 1.4]);
  ctx.lineDashOffset = -rot * r * 1.3 + 9;
  ctx.strokeStyle = rgba(M.dark, look.linked ? 0.85 : 0.5);
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.8, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);

  // the spout (tomoe tail); an automatic short one when no tail was flicked
  if (look.autoSpout) {
    ctx.fillStyle = look.linked ? M.color : rgba(M.color, 0.6);
    spoutPath(ctx, cx, cy, r, look.spout, dir, r * 0.55);
    ctx.fill();
    ctx.fillStyle = rgba(M.light, 0.7);
    spoutPath(ctx, cx, cy, r * 0.97, look.spout, dir, r * 0.3);
    ctx.fill();
  }
  // shimmer running out along the spout when something comes out
  if (ring.flash > 0) {
    const u = 1 - ring.flash;
    for (let k = 0; k < 3; k++) {
      const s = Math.min(1, u * 1.4 + k * 0.12);
      const d = r * (0.3 + 1.3 * s);
      ctx.fillStyle = rgba('#fff4ff', ring.flash * (1 - k * 0.25));
      ctx.beginPath();
      ctx.arc(cx + look.spout.x * d, cy + look.spout.y * d, 5 - k, 0, TAU);
      ctx.fill();
    }
  }
  // a swallow pulse when something goes in
  if (ring.pulse > 0) {
    ctx.strokeStyle = rgba(M.light, ring.pulse);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, r * (1 + (1 - ring.pulse) * 0.5), 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

/** While the brush is down: the loop has just closed. Legal → it swirls; illegal → grey and still. */
export function drawSnap(ctx: CanvasRenderingContext2D, fit: LoopFit, legal: boolean, sinceSnap: number, t: number) {
  ctx.save();
  ctx.lineCap = 'round';
  const r = fit.r;
  const circ = TAU * r;
  if (legal) {
    const k = Math.min(1, sinceSnap / 0.25);
    const g = ctx.createRadialGradient(fit.cx, fit.cy, r * 0.75, fit.cx, fit.cy, r * 1.6);
    g.addColorStop(0, rgba(M.light, 0.5 * k));
    g.addColorStop(1, rgba(M.light, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(fit.cx, fit.cy, r * 1.6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = rgba(M.dark, 0.35 * k);
    ctx.beginPath();
    ctx.arc(fit.cx, fit.cy, r * 0.9, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = rgba(M.light, 0.9 * k);
    ctx.lineWidth = 3;
    swirlArms(ctx, fit.cx, fit.cy, r, t * TAU * fit.dir, fit.dir, 3);
    ctx.setLineDash([circ / 7, (circ / 7) * 0.6]);
    ctx.lineDashOffset = -t * TAU * r * fit.dir;
    ctx.strokeStyle = rgba('#fff4ff', 0.95);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(fit.cx, fit.cy, r, 0, TAU);
    ctx.stroke();
    // the snap ring: a quick bright ripple at the moment it closes
    if (sinceSnap < 0.35) {
      ctx.setLineDash([]);
      ctx.strokeStyle = rgba(M.light, 1 - sinceSnap / 0.35);
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(fit.cx, fit.cy, r * (1 + sinceSnap * 1.4), 0, TAU);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = 'rgba(70,68,74,0.22)';
    ctx.beginPath();
    ctx.arc(fit.cx, fit.cy, Math.max(8, r), 0, TAU);
    ctx.fill();
    ctx.setLineDash([10, 8]);
    ctx.strokeStyle = 'rgba(70,68,74,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(fit.cx, fit.cy, Math.max(8, r), 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

/** The reach circle around the ring the brush will pair with, and a dotted thread to the brush tip. */
export function drawReach(ctx: CanvasRenderingContext2D, from: Vec, span: number, tip: Vec | null, t: number) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.setLineDash([2, 14]);
  ctx.lineDashOffset = -t * 20;
  if (Number.isFinite(span)) {
    ctx.strokeStyle = rgba(M.dark, 0.55);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(from.x, from.y, span, 0, TAU);
    ctx.stroke();
  }
  if (tip) {
    const out = Math.hypot(tip.x - from.x, tip.y - from.y) > span;
    ctx.strokeStyle = out ? 'rgba(70,68,74,0.7)' : rgba(M.color, 0.6);
    ctx.lineWidth = 2.5;
    ctx.setLineDash([2, 10]);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();
  }
  ctx.restore();
}

/** A fizzled ring: a dotted ghost of the fitted circle and the reason in brush text, for 1.2 s. */
export function drawGhost(ctx: CanvasRenderingContext2D, fit: LoopFit, label: string, age: number) {
  const k = 1 - Math.min(1, age / 1.2);
  if (k <= 0) return;
  const r = Math.max(14, Math.min(fit.r, 220));
  ctx.save();
  ctx.globalAlpha = k;
  ctx.setLineDash([3, 9]);
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(60,58,66,0.85)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(fit.cx, fit.cy, r, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = `34px ${FONT_BRUSH}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.lineWidth = 6;
  ctx.strokeStyle = rgba(PAPER, 0.85);
  const y = fit.cy - r - 10 - (1 - k) * 12;
  ctx.strokeText(label, fit.cx, y);
  ctx.fillStyle = INK;
  ctx.fillText(label, fit.cx, y);
  ctx.restore();
}

/** Sparks, embers and bolts. Black ink until they pass a ring, then their trail carries your purple. */
export function drawProjectile(ctx: CanvasRenderingContext2D, p: Projectile, t: number) {
  const tr = p.trail;
  const tint = p.fromRing ? M.color : INK;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (p.kind === 'bolt') {
    // a jagged column of light outlined in ink
    if (tr.length > 1) {
      ctx.beginPath();
      for (let i = 0; i < tr.length; i++) {
        const q = tr[i];
        const j = i && i < tr.length - 1 ? Math.sin(i * 12.9 + t * 40) * 7 : 0;
        if (i) ctx.lineTo(q.x + j, q.y - j * 0.5);
        else ctx.moveTo(q.x, q.y);
      }
      ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = rgba(tint, 0.9);
      ctx.lineWidth = 9;
      ctx.stroke();
      ctx.strokeStyle = rgba(PAPER, 0.95);
      ctx.lineWidth = 3.5;
      ctx.stroke();
    }
    ctx.restore();
    return;
  }
  // trail
  for (let i = 1; i < tr.length; i++) {
    const a = tr[i - 1];
    const b = tr[i];
    const u = i / tr.length;
    ctx.strokeStyle = rgba(tint, 0.15 + 0.55 * u);
    ctx.lineWidth = (p.kind === 'ember' ? 14 : 9) * u + 1;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  const r = p.kind === 'ember' ? 17 : 12;
  const flick = 0.85 + 0.15 * Math.sin(t * 31 + p.x * 0.1);
  const g = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, r * 1.9);
  g.addColorStop(0, rgba(INK, 0.95));
  g.addColorStop(0.5, rgba(INK, 0.75));
  g.addColorStop(1, rgba(INK, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r * 1.9 * flick, 0, TAU);
  ctx.fill();
  // licks of flame streaming back from the head, and a paper-white heart like the ground fires
  const sp = Math.hypot(p.vx, p.vy) || 1;
  const bx = -p.vx / sp;
  const by = -p.vy / sp;
  ctx.fillStyle = rgba(INK, 0.85);
  for (let k = -1; k <= 1; k++) {
    const a = Math.atan2(by, bx) + k * 0.5 + Math.sin(t * 20 + k) * 0.15;
    const len = r * (2 - Math.abs(k) * 0.6) * flick;
    ctx.beginPath();
    ctx.moveTo(p.x + Math.cos(a + 1.4) * r * 0.6, p.y + Math.sin(a + 1.4) * r * 0.6);
    ctx.quadraticCurveTo(p.x + Math.cos(a) * len * 0.6, p.y + Math.sin(a) * len * 0.6, p.x + Math.cos(a) * len, p.y + Math.sin(a) * len);
    ctx.quadraticCurveTo(p.x + Math.cos(a) * len * 0.5, p.y + Math.sin(a) * len * 0.5, p.x + Math.cos(a - 1.4) * r * 0.6, p.y + Math.sin(a - 1.4) * r * 0.6);
    ctx.fill();
  }
  ctx.fillStyle = rgba(PAPER, 0.9);
  ctx.beginPath();
  ctx.arc(p.x, p.y, r * 0.38 * flick, 0, TAU);
  ctx.fill();
  if (p.fromRing) {
    ctx.strokeStyle = rgba(M.light, 0.8);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 1.05, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}
