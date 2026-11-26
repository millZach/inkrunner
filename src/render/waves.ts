import { INK, PAPER } from '../config';
import { BOTTOM } from '../level';
import { rgba } from './brush';

const ROWS = [
  { dy: 0, amp: 26, len: 300, speed: 26, ink: 0.16 },
  { dy: 30, amp: 34, len: 380, speed: -34, ink: 0.24 },
  { dy: 64, amp: 44, len: 470, speed: 48, ink: 0.32 },
];

function crest(u: number): number {
  // slow swell, sharp break
  if (u < 0.72) {
    const t = u / 0.72;
    return t * t * (3 - 2 * t);
  }
  const t = (u - 0.72) / 0.28;
  return 1 - t * t * (3 - 2 * t);
}

/** Hokusai-style rows of curling waves across [x0, x1]. */
export function drawSea(ctx: CanvasRenderingContext2D, seaY: number, x0: number, x1: number, t: number) {
  for (const row of ROWS) {
    const base = seaY + row.dy;
    const off = t * row.speed;
    const step = 6;
    const xs0 = Math.floor((x0 - row.len) / step) * step;
    const xs1 = x1 + row.len;
    const top: { x: number; y: number }[] = [];
    for (let x = xs0; x <= xs1; x += step) {
      const u = (((x + off) / row.len) % 1 + 1) % 1;
      top.push({ x, y: base - crest(u) * row.amp });
    }

    // body: opaque paper, tinted with ink so islands sink into it
    ctx.beginPath();
    ctx.moveTo(top[0].x, top[0].y);
    for (const p of top) ctx.lineTo(p.x, p.y);
    ctx.lineTo(xs1, BOTTOM);
    ctx.lineTo(xs0, BOTTOM);
    ctx.closePath();
    ctx.fillStyle = PAPER;
    ctx.fill();
    const g = ctx.createLinearGradient(0, base - row.amp, 0, base + 160);
    g.addColorStop(0, rgba(INK, row.ink * 0.5));
    g.addColorStop(0.25, rgba(INK, row.ink));
    g.addColorStop(1, rgba(INK, row.ink * 0.6));
    ctx.fillStyle = g;
    ctx.fill();

    // contour lines following the swell
    ctx.strokeStyle = rgba(INK, 0.45);
    ctx.lineCap = 'round';
    for (let k = 1; k <= 3; k++) {
      ctx.lineWidth = 1.4 - k * 0.25;
      ctx.beginPath();
      for (let i = 0; i < top.length; i++) {
        const p = top[i];
        const y = p.y + k * 9 + (base - p.y) * 0.25 * k * 0.4;
        if (i === 0) ctx.moveTo(p.x, y);
        else ctx.lineTo(p.x, y);
      }
      ctx.stroke();
    }

    // crest outline
    ctx.strokeStyle = rgba(INK, 0.85);
    ctx.lineWidth = 2;
    ctx.beginPath();
    top.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();

    // curling lips with foam claws at every break
    const first = Math.floor((xs0 + off) / row.len) - 1;
    const last = Math.ceil((xs1 + off) / row.len) + 1;
    for (let k = first; k <= last; k++) {
      const cx = k * row.len + 0.72 * row.len - off;
      if (cx < x0 - 80 || cx > x1 + 80) continue;
      const cy = base - row.amp;
      const R = row.amp * 0.42;
      ctx.strokeStyle = rgba(INK, 0.9);
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(cx + R * 0.6, cy + R * 0.9, R, Math.PI * 1.05, Math.PI * 2.2);
      ctx.stroke();
      // foam fingers
      ctx.fillStyle = PAPER;
      ctx.strokeStyle = rgba(INK, 0.75);
      ctx.lineWidth = 1;
      for (let f = 0; f < 6; f++) {
        const a = Math.PI * (1.15 + f * 0.17);
        const fx = cx + R * 0.6 + Math.cos(a) * R * 1.15;
        const fy = cy + R * 0.9 + Math.sin(a) * R * 1.15;
        const fr = 2.6 + (f % 3) * 0.9 + Math.sin(t * 3 + k + f) * 0.6;
        ctx.beginPath();
        ctx.arc(fx, fy, fr, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      // spray dots
      ctx.fillStyle = rgba(INK, 0.5);
      for (let f = 0; f < 4; f++) {
        const sx = cx + R * (1.6 + f * 0.4) + Math.sin(t * 2 + f + k) * 3;
        const sy = cy - 4 - f * 5 + Math.cos(t * 2.5 + f) * 2;
        ctx.beginPath();
        ctx.arc(sx, sy, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}
