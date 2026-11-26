import { INK, PAPER } from '../config';
import type { Bramble, Fire, Pillar, Yokai } from '../level';
import { mulberry32, noise1, range } from '../rng';
import { rgba } from './brush';

export function drawFire(ctx: CanvasRenderingContext2D, f: Fire, t: number) {
  if (!f.alive) {
    // charred smudge and a last few wisps
    const k = Math.max(0, 1 - f.deadT / 2.5);
    ctx.fillStyle = rgba(INK, 0.22);
    ctx.beginPath();
    ctx.ellipse(f.x + f.w / 2, f.y - 3, f.w * 0.55, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    if (k > 0) {
      ctx.strokeStyle = rgba(INK, 0.3 * k);
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const x = f.x + (i + 0.5) * (f.w / 4);
        ctx.beginPath();
        ctx.moveTo(x, f.y - 6);
        for (let s = 1; s <= 8; s++) ctx.lineTo(x + Math.sin(t * 3 + s + i) * 6, f.y - 6 - s * 10 * (1 - k * 0.3));
        ctx.stroke();
      }
    }
    return;
  }
  const n = Math.max(4, Math.round(f.w / 26));
  const cxm = f.x + f.w / 2;
  // smoke wash above
  const sg = ctx.createRadialGradient(cxm, f.y - f.h, 4, cxm, f.y - f.h, f.w * 0.8);
  sg.addColorStop(0, rgba(INK, 0.16));
  sg.addColorStop(1, rgba(INK, 0));
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.arc(cxm, f.y - f.h, f.w * 0.8, 0, Math.PI * 2);
  ctx.fill();
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      const cx = f.x + u * f.w;
      const centerBoost = 0.45 + 0.55 * Math.sin(Math.PI * u);
      const flick = noise1(t * 3.2 + i * 3.1, 5);
      const hh = f.h * centerBoost * (0.7 + 0.45 * flick) * (pass ? 0.5 : 1);
      const sway = (noise1(t * 2.4 + i * 7.7, 9) - 0.5) * 40 * (hh / f.h);
      const bw = (f.w / n) * (pass ? 0.38 : 0.95);
      const by = pass ? f.y - hh * 0.12 : f.y;
      const tip = { x: cx + sway, y: by - hh };
      const curl = sway > 0 ? 1 : -1;
      if (pass) {
        ctx.fillStyle = PAPER;
        ctx.globalAlpha = 0.9;
      } else {
        const g = ctx.createLinearGradient(0, f.y, 0, tip.y);
        g.addColorStop(0, rgba(INK, 0.97));
        g.addColorStop(0.7, rgba(INK, 0.85));
        g.addColorStop(1, rgba(INK, 0.55));
        ctx.fillStyle = g;
        ctx.globalAlpha = 1;
      }
      ctx.beginPath();
      ctx.moveTo(cx - bw, by);
      ctx.bezierCurveTo(cx - bw * 1.4, by - hh * 0.45, cx + sway * 0.2 - bw * 0.9, by - hh * 0.7, tip.x, tip.y);
      ctx.quadraticCurveTo(tip.x + curl * bw * 0.5, tip.y + hh * 0.06, tip.x + curl * bw * 0.25, tip.y + hh * 0.1);
      ctx.bezierCurveTo(cx + sway * 0.3 + bw * 0.6, by - hh * 0.55, cx + bw * 1.4, by - hh * 0.3, cx + bw, by);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  // curling brushed wisps rising off the tips
  for (let i = 0; i < 3; i++) {
    const ph = (t * 0.7 + i / 3) % 1;
    const x = f.x + f.w * (0.25 + 0.25 * i) + Math.sin(t * 2 + i) * 8;
    const y = f.y - f.h * (0.85 + ph * 0.6);
    ctx.strokeStyle = rgba(INK, 0.55 * (1 - ph));
    ctx.lineWidth = 3 * (1 - ph) + 0.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(x, y, 6 + ph * 8, Math.PI * (0.2 + ph), Math.PI * (1.6 + ph));
    ctx.stroke();
  }
}

export function drawYokai(ctx: CanvasRenderingContext2D, y: Yokai, t: number) {
  const k = y.alive ? 1 : Math.max(0, 1 - y.deadT * 1.6);
  if (k <= 0) return;
  const R = y.r * (y.alive ? 1 : 1 + (1 - k) * 0.6);
  ctx.save();
  const shake = y.flinch * 3;
  ctx.translate(y.cx + Math.sin(t * 60) * shake, y.cy + Math.cos(t * 53) * shake);
  ctx.globalAlpha = k;

  // tendrils
  ctx.strokeStyle = INK;
  ctx.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    const bx = (i - 2) * R * 0.32;
    ctx.lineWidth = 4 - Math.abs(i - 2);
    ctx.beginPath();
    ctx.moveTo(bx, R * 0.5);
    for (let s = 1; s <= 6; s++) {
      ctx.lineTo(bx + Math.sin(t * 4 + s * 0.9 + i * 1.7) * 5 * (s / 6), R * 0.5 + s * R * 0.18);
    }
    ctx.stroke();
  }

  // ink bleed halo
  const g = ctx.createRadialGradient(0, 0, R * 0.5, 0, 0, R * 1.5);
  g.addColorStop(0, rgba(INK, 0.5));
  g.addColorStop(1, rgba(INK, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, R * 1.5, 0, Math.PI * 2);
  ctx.fill();

  // wobbling body
  ctx.fillStyle = INK;
  ctx.beginPath();
  const N = 36;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const rr = R * (1 + 0.1 * Math.sin(a * 3 + t * 2.3) + 0.07 * Math.sin(a * 5 - t * 3.1));
    const px = Math.cos(a) * rr;
    const py = Math.sin(a) * rr * 0.92;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.fill();

  // eyes: paper-white slits, angled; pupils follow the traveler
  const blink = Math.sin(t * 0.9 + y.phase) > 0.97 ? 0.15 : 1;
  const wide = 1 + y.flinch * 0.9;
  const lx = Math.cos(y.look);
  const ly = Math.sin(y.look);
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.translate(s * R * 0.33, -R * 0.1);
    ctx.rotate(s * 0.35 * (1 - y.flinch));
    ctx.fillStyle = PAPER;
    ctx.beginPath();
    ctx.ellipse(0, 0, R * 0.2, R * 0.075 * blink * wide, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (blink > 0.5) {
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(s * R * 0.33 + lx * R * 0.09, -R * 0.1 + ly * R * 0.035, R * 0.05, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

export function drawBramble(ctx: CanvasRenderingContext2D, b: Bramble, t: number) {
  const k = b.alive ? 1 : Math.max(0, 1 - b.deadT * 1.4);
  if (k <= 0) return;
  const r = mulberry32(b.seed);
  ctx.save();
  ctx.globalAlpha = k;
  // dark wash core
  const cx = b.x + b.w / 2;
  const cy = b.y - b.h * 0.3;
  const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, b.h * 0.6);
  g.addColorStop(0, rgba(INK, 0.4));
  g.addColorStop(1, rgba(INK, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, b.h * 0.6, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = INK;
  ctx.lineCap = 'round';
  const W = b.w * 1.6;
  const bx = b.x + b.w / 2;
  for (let i = 0; i < 30; i++) {
    const x0 = bx + range(r, -0.5, 0.5) * W * 0.7;
    const h = b.h * range(r, 0.5, 1.0) * (1 - Math.abs(x0 - bx) / W);
    const sway = Math.sin(t * 1.3 + i) * 3;
    const c1 = { x: bx + range(r, -0.6, 0.6) * W, y: b.y - h * range(r, 0.2, 0.5) };
    const c2 = { x: bx + range(r, -0.6, 0.6) * W, y: b.y - h * range(r, 0.5, 0.9) };
    const top = { x: bx + range(r, -0.35, 0.35) * W + sway, y: b.y - h };
    ctx.lineWidth = range(r, 1.6, 4.2);
    ctx.globalAlpha = k * range(r, 0.65, 1);
    ctx.beginPath();
    ctx.moveTo(x0, b.y);
    ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, top.x, top.y);
    ctx.stroke();
    // thorns along the vine
    ctx.lineWidth = 1.6;
    for (let j = 1; j < 8; j++) {
      const u = j / 8;
      const v = 1 - u;
      const px = v * v * v * x0 + 3 * v * v * u * c1.x + 3 * v * u * u * c2.x + u * u * u * top.x;
      const py = v * v * v * b.y + 3 * v * v * u * c1.y + 3 * v * u * u * c2.y + u * u * u * top.y;
      const side = j % 2 ? 1 : -1;
      const len = range(r, 6, 12);
      ctx.beginPath();
      ctx.moveTo(px - 2, py);
      ctx.lineTo(px + side * len, py - len * 0.6);
      ctx.lineTo(px + 2, py);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// ───────────────────────────────────────────── blot pillar (墨 column, N5)

interface PillarShape {
  left: { x: number; y: number }[];
  right: { x: number; y: number }[];
  hairs: { x: number; y: number; dx: number; dy: number }[];
  drips: { x: number; speed: number; phase: number; len: number }[];
}
const pillarShapes = new WeakMap<Pillar, PillarShape>();

function pillarShape(p: Pillar): PillarShape {
  let s = pillarShapes.get(p);
  if (s) return s;
  const r = mulberry32(Math.round(p.x * 7 + p.w));
  const left: PillarShape['left'] = [];
  const right: PillarShape['right'] = [];
  for (let y = p.yTop; y <= 1100; y += 18) {
    left.push({ x: p.x + (noise1(y * 0.02, p.x) - 0.5) * 14 - 2, y });
    right.push({ x: p.x + p.w + (noise1(y * 0.02, p.x + 77) - 0.5) * 14 + 2, y });
  }
  const hairs: PillarShape['hairs'] = [];
  for (let i = 0; i < 60; i++) {
    const side = i % 2 ? 1 : -1;
    const y = range(r, p.yTop + 20, 1000);
    hairs.push({ x: side > 0 ? p.x + p.w : p.x, y, dx: side * range(r, 6, 26), dy: range(r, -10, 14) });
  }
  const drips: PillarShape['drips'] = [];
  for (let i = 0; i < 5; i++) drips.push({ x: p.x + range(r, 0.1, 0.9) * p.w, speed: range(r, 40, 90), phase: r() * 1000, len: range(r, 30, 70) });
  s = { left, right, hairs, drips };
  pillarShapes.set(p, s);
  return s;
}

/** A wet black column with a fibrous bleed edge and slow drips. It has no face: it is the blot. */
export function drawPillar(ctx: CanvasRenderingContext2D, p: Pillar, groundY: number, t: number, vy0: number, vy1: number) {
  const s = pillarShape(p);
  const top = Math.max(p.yTop, vy0 - 40);
  const bot = Math.min(1100, vy1 + 40);
  ctx.save();
  // bleed into the paper either side
  for (const [x0, x1] of [
    [p.x - 34, p.x],
    [p.x + p.w + 34, p.x + p.w],
  ]) {
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, rgba(INK, 0));
    g.addColorStop(1, rgba(INK, 0.28));
    ctx.fillStyle = g;
    ctx.fillRect(Math.min(x0, x1), top, 34, bot - top);
  }
  ctx.fillStyle = rgba(INK, 0.96);
  ctx.beginPath();
  let first = true;
  for (const q of s.left) {
    if (q.y < top - 18 || q.y > bot + 18) continue;
    if (first) ctx.moveTo(q.x, q.y);
    else ctx.lineTo(q.x, q.y);
    first = false;
  }
  for (let i = s.right.length - 1; i >= 0; i--) {
    const q = s.right[i];
    if (q.y < top - 18 || q.y > bot + 18) continue;
    ctx.lineTo(q.x, q.y);
  }
  ctx.closePath();
  ctx.fill();
  // fibres where the ink has crept along the paper
  ctx.strokeStyle = rgba(INK, 0.55);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (const h of s.hairs) {
    if (h.y < top || h.y > bot) continue;
    ctx.moveTo(h.x, h.y);
    ctx.lineTo(h.x + h.dx, h.y + h.dy);
  }
  ctx.stroke();
  // a wet sheen down the column
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(p.x + p.w * 0.28, top, p.w * 0.1, bot - top);
  // drips sliding down the face, pooling at the foot
  ctx.fillStyle = rgba(INK, 0.9);
  for (const d of s.drips) {
    const span = groundY - top;
    if (span <= 0) continue;
    const y = top + ((t * d.speed + d.phase) % span);
    ctx.beginPath();
    ctx.ellipse(d.x, y, 5, d.len * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const pool = ctx.createRadialGradient(p.x + p.w / 2, groundY, 4, p.x + p.w / 2, groundY, p.w * 0.9);
  pool.addColorStop(0, rgba(INK, 0.5));
  pool.addColorStop(1, rgba(INK, 0));
  ctx.fillStyle = pool;
  ctx.beginPath();
  ctx.ellipse(p.x + p.w / 2, groundY + 4, p.w * 0.9, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ───────────────────────────────────────────── hanabi sparks (N6)

const EMBER = '#e8742a';

/**
 * A spark's mark: an ink circle 80 wide on the road (flattened, seen from the side) that fills with ember orange
 * over the telegraph (`fill` 0 → 1), so the time left reads at a glance.
 */
export function drawSparkMark(ctx: CanvasRenderingContext2D, x: number, gy: number, appear: number, fill: number, t: number) {
  if (appear <= 0) return;
  const a = Math.min(1, appear);
  const rx = 40 * (0.6 + 0.4 * a);
  const ry = 11 * (0.6 + 0.4 * a);
  const cy = gy + 1;
  ctx.save();
  ctx.fillStyle = `rgba(255,255,255,${0.32 * a})`;
  ctx.beginPath();
  ctx.ellipse(x, cy - 2, rx + 12, ry + 6, 0, 0, Math.PI * 2);
  ctx.fill();
  // the orange fills from the rim inward as the spark falls
  if (fill > 0) {
    const k = Math.min(1, fill);
    ctx.fillStyle = rgba(EMBER, 0.35 + 0.55 * k);
    ctx.beginPath();
    ctx.ellipse(x, cy, rx * k, ry * k, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = rgba(INK, 0.9 * a);
  ctx.lineWidth = 4 + 2 * fill;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.ellipse(x, cy, rx, ry, 0, 0, Math.PI * 2 * Math.min(1, appear * 1.5));
  ctx.stroke();
  // four short ticks round the rim, turning: it reads as "something lands here", not as a ring
  ctx.lineWidth = 2.5;
  for (let i = 0; i < 4; i++) {
    const ang = t * 1.5 + (i * Math.PI) / 2;
    const c = Math.cos(ang);
    const sn = Math.sin(ang);
    ctx.beginPath();
    ctx.moveTo(x + c * (rx + 4), cy + sn * (ry + 1.5));
    ctx.lineTo(x + c * (rx + 13), cy + sn * (ry + 4));
    ctx.stroke();
  }
  ctx.restore();
}

/** The dotted ember trail from the burst down to the mark, brightest just under the falling spark. */
export function drawEmberTrail(ctx: CanvasRenderingContext2D, x: number, yTop: number, ySpark: number, gy: number, t: number) {
  ctx.save();
  ctx.lineCap = 'round';
  // above the spark: the path it came down, fading
  ctx.strokeStyle = rgba(INK, 0.35);
  ctx.lineWidth = 3;
  ctx.setLineDash([2, 14]);
  ctx.lineDashOffset = -t * 40;
  ctx.beginPath();
  ctx.moveTo(x, yTop);
  ctx.lineTo(x, ySpark);
  ctx.stroke();
  // below: the line it will take, in ember dots
  ctx.strokeStyle = rgba(EMBER, 0.85);
  ctx.lineWidth = 4;
  ctx.setLineDash([3, 11]);
  ctx.lineDashOffset = -t * 90;
  ctx.beginPath();
  ctx.moveTo(x, ySpark + 18);
  ctx.lineTo(x, gy - 6);
  ctx.stroke();
  ctx.restore();
}

/** The shell bursting high over the mark (k 0 → 1 over 0.6 s): a small chrysanthemum of ink and ember. */
export function drawSparkBurst(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, seed: number) {
  if (k < 0 || k >= 1) return;
  const r = mulberry32(Math.floor(seed * 1000));
  ctx.save();
  ctx.lineCap = 'round';
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.3;
    const d0 = 8 + 50 * k;
    const d1 = 18 + 80 * k;
    ctx.strokeStyle = i % 3 ? rgba(INK, 0.8 * (1 - k)) : rgba(EMBER, 0.9 * (1 - k));
    ctx.lineWidth = 3 * (1 - k) + 1;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * d0, y + Math.sin(a) * d0 + 20 * k * k);
    ctx.lineTo(x + Math.cos(a) * d1, y + Math.sin(a) * d1 + 30 * k * k);
    ctx.stroke();
  }
  ctx.restore();
}
