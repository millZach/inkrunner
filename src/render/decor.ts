import { INK } from '../config';
import type { Decor, Lantern } from '../level';
import type { Vec } from '../math';
import { mulberry32, range, type RNG } from '../rng';
import { SNOW } from './backdrop';
import { brushLine, curve, leaf, polyPath, rgba } from './brush';

export function drawDecor(ctx: CanvasRenderingContext2D, d: Decor, snow = false) {
  const r = mulberry32(d.seed);
  ctx.save();
  ctx.translate(d.x, d.y + 2);
  if (d.flip) ctx.scale(-1, 1);
  ctx.scale(d.s, d.s);
  switch (d.kind) {
    case 'pine':
      pine(ctx, r, snow);
      break;
    case 'bamboo':
      bamboo(ctx, r);
      break;
    case 'rock':
      rock(ctx, r, snow);
      break;
    case 'reeds':
      reeds(ctx, r);
      break;
    case 'maple':
      maple(ctx, r);
      break;
  }
  ctx.restore();
}

function trunkPath(r: RNG, h: number, lean: number): Vec[] {
  const pts: Vec[] = [];
  const n = 18;
  const ph = r() * 1.5;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push({ x: Math.sin(t * 2.6 + 0.4 + ph) * 16 * lean + t * t * 30 * lean, y: -t * h });
  }
  return pts;
}

function needlePad(ctx: CanvasRenderingContext2D, r: RNG, c: Vec, rx: number, snow: boolean) {
  // soft wash under the pad
  ctx.fillStyle = rgba(INK, 0.1);
  ctx.beginPath();
  ctx.ellipse(c.x, c.y + 2, rx * 1.05, rx * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineCap = 'round';
  const fans = Math.max(3, Math.round(rx / 9));
  for (let f = 0; f < fans; f++) {
    const fx = c.x + (f / (fans - 1) - 0.5) * rx * 1.7 + range(r, -3, 3);
    const fy = c.y + Math.abs(f / (fans - 1) - 0.5) * rx * 0.25 + range(r, -2, 2);
    const n = 9 + Math.floor(r() * 5);
    for (let k = 0; k < n; k++) {
      const a = -Math.PI * (0.12 + 0.76 * (k / (n - 1))) + range(r, -0.08, 0.08);
      const len = range(r, 9, 15);
      ctx.globalAlpha = range(r, 0.55, 0.9);
      ctx.lineWidth = range(r, 0.9, 1.6);
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx + Math.cos(a) * len, fy + Math.sin(a) * len * 0.75);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  if (snow) {
    // a soft pillow of snow resting on the pad
    ctx.fillStyle = SNOW;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y - 8, rx * 0.95, rx * 0.2, 0, Math.PI, Math.PI * 2);
    ctx.quadraticCurveTo(c.x, c.y - 2, c.x - rx * 0.95, c.y - 8);
    ctx.fill();
    ctx.strokeStyle = rgba(INK, 0.45);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y - 8, rx * 0.95, rx * 0.2, 0, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
  }
}

function pine(ctx: CanvasRenderingContext2D, r: RNG, snow: boolean) {
  const h = range(r, 170, 210);
  const trunk = trunkPath(r, h, range(r, 0.6, 1.1));
  brushLine(ctx, trunk, r, { w: 15, taperIn: 2, taperOut: h * 0.7, bristles: 6, dry: 0.6, wobble: 0.4 });
  // bark marks
  for (let k = 0; k < 7; k++) {
    const p = trunk[2 + Math.floor(r() * 10)];
    brushLine(ctx, [{ x: p.x - 4, y: p.y }, { x: p.x + 3, y: p.y - 4 }], r, { w: 2.2, alpha: 0.6 });
  }
  const pads: Vec[] = [];
  const nb = 3 + Math.floor(r() * 2);
  for (let b = 0; b < nb; b++) {
    const t = 0.45 + (b / nb) * 0.5;
    const base = trunk[Math.round(t * (trunk.length - 1))];
    const dir = b % 2 === 0 ? 1 : -1;
    const len = range(r, 40, 75) * (1.1 - t * 0.5);
    const end = { x: base.x + dir * len, y: base.y - range(r, -6, 18) };
    brushLine(ctx, curve(base, { x: (base.x + end.x) / 2, y: base.y - 14 }, end, 10), r, {
      w: 5,
      taperIn: 2,
      taperOut: len * 0.6,
      bristles: 2,
    });
    pads.push(end);
  }
  pads.push(trunk[trunk.length - 1]);
  for (const p of pads) needlePad(ctx, r, { x: p.x, y: p.y - 3 }, range(r, 26, 40), snow);
}

function bamboo(ctx: CanvasRenderingContext2D, r: RNG) {
  const stalks = 3 + Math.floor(r() * 2);
  for (let s = 0; s < stalks; s++) {
    const x0 = (s - stalks / 2) * range(r, 10, 16);
    const h = range(r, 200, 300);
    const lean = range(r, -0.08, 0.12);
    const shade = s % 2 ? 0.55 : 0.85;
    let y = 0;
    while (y > -h) {
      const seg = range(r, 38, 56);
      const a = { x: x0 - y * lean, y: y - 2 };
      const b = { x: x0 - (y - seg) * lean, y: y - seg + 2 };
      brushLine(ctx, [a, b], r, { w: 7 - (s % 2), alpha: shade, taperIn: 1, taperOut: 1, bristles: 3, wobble: 0.15 });
      ctx.fillStyle = INK;
      ctx.globalAlpha = shade;
      ctx.fillRect(b.x - 5, b.y - 2.5, 10, 2.2);
      ctx.globalAlpha = 1;
      if (r() < 0.45 && y < -h * 0.35) {
        const n = 2 + Math.floor(r() * 3);
        for (let k = 0; k < n; k++) {
          const dir = r() < 0.5 ? -1 : 1;
          const len = range(r, 22, 36);
          const ang = range(r, 0.2, 0.9);
          const end = { x: b.x + dir * Math.cos(ang) * len, y: b.y + Math.sin(ang) * len * 0.6 };
          ctx.fillStyle = INK;
          ctx.globalAlpha = range(r, 0.65, 0.95) * shade;
          leaf(ctx, b, { x: (b.x + end.x) / 2, y: b.y - 4 }, end, range(r, 4.5, 6.5));
          ctx.globalAlpha = 1;
        }
      }
      y -= seg;
    }
  }
}

function rock(ctx: CanvasRenderingContext2D, r: RNG, snow: boolean) {
  const w = range(r, 44, 70);
  const h = range(r, 26, 40);
  const pts: Vec[] = [];
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = Math.PI + t * Math.PI;
    pts.push({ x: Math.cos(a) * w * 0.5 * range(r, 0.85, 1.05), y: Math.sin(a) * h * range(r, 0.8, 1.1) });
  }
  const g = ctx.createLinearGradient(0, -h, 0, 4);
  g.addColorStop(0, rgba(INK, 0.38));
  g.addColorStop(1, rgba(INK, 0.06));
  ctx.fillStyle = g;
  polyPath(ctx, pts);
  ctx.fill();
  brushLine(ctx, pts.slice(0, 6), r, { w: 4.5, taperIn: 2, bristles: 3, dry: 0.5 });
  brushLine(ctx, pts.slice(5), r, { w: 3, alpha: 0.7, bristles: 2, dry: 0.8 });
  for (let k = 0; k < 4; k++) {
    const x = range(r, -w * 0.3, w * 0.3);
    brushLine(ctx, [{ x, y: -h * range(r, 0.4, 0.8) }, { x: x + range(r, -6, 6), y: -h * 0.15 }], r, { w: 2, alpha: 0.5 });
  }
  if (snow) {
    ctx.fillStyle = SNOW;
    ctx.beginPath();
    ctx.ellipse(0, -h * 0.82, w * 0.38, h * 0.22, 0, Math.PI, Math.PI * 2);
    ctx.fill();
  }
}

function reeds(ctx: CanvasRenderingContext2D, r: RNG) {
  const n = 5 + Math.floor(r() * 4);
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  for (let k = 0; k < n; k++) {
    const x = range(r, -18, 18);
    const h = range(r, 50, 95);
    const bend = range(r, -18, 26);
    const top = { x: x + bend, y: -h };
    brushLine(ctx, curve({ x, y: 2 }, { x: x + bend * 0.2, y: -h * 0.6 }, top, 10), r, { w: 2.2, alpha: 0.8, taperIn: 1 });
    if (r() < 0.6) {
      ctx.globalAlpha = 0.85;
      leaf(ctx, { x: top.x, y: top.y + 12 }, { x: top.x + bend * 0.05, y: top.y + 2 }, { x: top.x + bend * 0.12, y: top.y - 8 }, 4.5);
      ctx.globalAlpha = 1;
    }
    if (r() < 0.5) {
      ctx.globalAlpha = 0.7;
      const side = r() < 0.5 ? -1 : 1;
      leaf(ctx, { x, y: -h * 0.2 }, { x: x + side * 10, y: -h * 0.45 }, { x: x + side * 22, y: -h * 0.4 }, 3);
      ctx.globalAlpha = 1;
    }
  }
}

function maple(ctx: CanvasRenderingContext2D, r: RNG) {
  const h = range(r, 130, 160);
  const trunk = trunkPath(r, h, range(r, -0.5, 0.5));
  brushLine(ctx, trunk, r, { w: 11, taperIn: 2, taperOut: h * 0.8, bristles: 5, dry: 0.7 });
  const top = trunk[trunk.length - 1];
  const tips: Vec[] = [top];
  for (let b = 0; b < 4; b++) {
    const base = trunk[Math.round((0.5 + b * 0.12) * (trunk.length - 1))];
    const dir = b % 2 ? 1 : -1;
    const end = { x: base.x + dir * range(r, 30, 60), y: base.y - range(r, 20, 45) };
    brushLine(ctx, curve(base, { x: (base.x + end.x) / 2, y: base.y - 10 }, end), r, { w: 4, taperIn: 1, bristles: 2 });
    tips.push(end);
  }
  // clouds of leaf dabs, in graded ink
  ctx.fillStyle = INK;
  for (const t of tips) {
    const n = 34 + Math.floor(r() * 16);
    for (let k = 0; k < n; k++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * 32;
      const x = t.x + Math.cos(a) * d * 1.35;
      const y = t.y + Math.sin(a) * d * 0.7 - 6;
      const s = range(r, 2.5, 5.5);
      ctx.globalAlpha = range(r, 0.1, 0.5) * (1 - d / 50);
      ctx.beginPath();
      ctx.ellipse(x, y, s * 1.3, s * 0.8, r() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

/** Stone tōrō lantern — the checkpoint. The glow is drawn separately when lit. */
export function drawLanternStone(ctx: CanvasRenderingContext2D, l: Lantern) {
  const r = mulberry32(Math.floor(l.x));
  ctx.save();
  ctx.translate(l.x, l.y + 3);
  const g = ctx.createLinearGradient(-20, 0, 20, 0);
  g.addColorStop(0, rgba(INK, 0.75));
  g.addColorStop(1, rgba(INK, 0.4));
  ctx.fillStyle = g;
  // base, post, platform
  ctx.fillRect(-16, -8, 32, 8);
  ctx.fillRect(-6, -40, 12, 32);
  ctx.fillRect(-15, -48, 30, 8);
  // firebox
  ctx.fillRect(-11, -70, 22, 22);
  ctx.fillStyle = '#efe6d3';
  ctx.fillRect(-6, -66, 12, 13);
  // roof
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(-24, -70);
  ctx.quadraticCurveTo(-8, -76, 0, -88);
  ctx.quadraticCurveTo(8, -76, 24, -70);
  ctx.quadraticCurveTo(0, -73, -24, -70);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, -91, 4, 0, Math.PI * 2);
  ctx.fill();
  brushLine(ctx, [{ x: -16, y: -1 }, { x: 16, y: -1 }], r, { w: 3, bristles: 2, dry: 0.6 });
  ctx.restore();
}

export function lanternGlow(ctx: CanvasRenderingContext2D, l: Lantern, t: number) {
  if (!l.lit) return;
  const k = Math.min(1, l.litT * 2);
  const flick = 0.85 + 0.15 * Math.sin(t * 9 + l.x) * Math.sin(t * 5.3);
  ctx.save();
  ctx.translate(l.x, l.y + 3);
  ctx.globalCompositeOperation = 'multiply';
  const g = ctx.createRadialGradient(0, -60, 2, 0, -60, 70);
  g.addColorStop(0, `rgba(236,160,40,${0.55 * k * flick})`);
  g.addColorStop(1, 'rgba(236,160,40,0)');
  ctx.fillStyle = g;
  ctx.fillRect(-80, -140, 160, 160);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = `rgba(255,200,80,${0.95 * k})`;
  ctx.fillRect(-6, -66, 12, 13);
  ctx.fillStyle = `rgba(255,240,190,${0.8 * k * flick})`;
  ctx.fillRect(-3, -63, 6, 8);
  ctx.restore();
}

/** Torii gate. `paint` (0..1) floods it with vermilion. */
export function drawTorii(ctx: CanvasRenderingContext2D, x: number, y: number, paint: number) {
  const r = mulberry32(4242);
  const r2 = mulberry32(4242);
  ctx.save();
  ctx.translate(x, y + 4);
  const H = 250;
  const parts = (rr: RNG, color: string, alpha: number, bristles: number) => {
    // pillars
    brushLine(ctx, [{ x: -78, y: 0 }, { x: -70, y: -H + 30 }], rr, { w: 16, color, alpha, taperIn: 1, taperOut: 2, bristles, dry: 0.4 });
    brushLine(ctx, [{ x: 78, y: 0 }, { x: 70, y: -H + 30 }], rr, { w: 16, color, alpha, taperIn: 1, taperOut: 2, bristles, dry: 0.4 });
    // nuki (lower beam)
    brushLine(ctx, [{ x: -96, y: -H + 78 }, { x: 96, y: -H + 78 }], rr, { w: 11, color, alpha, taperIn: 3, taperOut: 3, bristles });
    // gakuzuka
    brushLine(ctx, [{ x: 0, y: -H + 76 }, { x: 0, y: -H + 34 }], rr, { w: 9, color, alpha, taperIn: 1, taperOut: 1 });
    // shimaki + kasagi (curved top beams)
    brushLine(ctx, curve({ x: -112, y: -H + 34 }, { x: 0, y: -H + 46 }, { x: 112, y: -H + 34 }), rr, {
      w: 12,
      color,
      alpha,
      taperIn: 4,
      taperOut: 4,
      bristles,
    });
    brushLine(ctx, curve({ x: -132, y: -H + 4 }, { x: 0, y: -H + 30 }, { x: 132, y: -H + 4 }, 20), rr, {
      w: 15,
      color,
      alpha,
      taperIn: 18,
      taperOut: 18,
      bristles,
      dry: 0.3,
    });
  };
  parts(r, INK, 1, 6);
  if (paint > 0) {
    ctx.globalCompositeOperation = 'source-over';
    parts(r2, '#e2412a', paint * 0.92, 0);
  }
  ctx.restore();
}

// ───────────────────────────────────────────── Summer festival decor (N13)

/** One paper lantern (chōchin) on a festival line, ready to draw. `lit` 0..1. */
export interface ChochinLook {
  x: number;
  y: number;
  lit: number;
  sway: number;
}

/** The rope of a lantern line between posts, sagging, with dips; and the posts themselves. */
export function drawFestoonLine(ctx: CanvasRenderingContext2D, rope: Vec[], posts: Vec[], postH: number) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // posts: thin bamboo poles in ink
  ctx.strokeStyle = rgba(INK, 0.7);
  ctx.lineWidth = 4;
  ctx.beginPath();
  for (const p of posts) {
    ctx.moveTo(p.x, p.y + 2);
    ctx.lineTo(p.x + 2, p.y - postH);
  }
  ctx.stroke();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = rgba(INK, 0.45);
  ctx.beginPath();
  for (const p of posts) {
    for (let k = 1; k < 5; k++) {
      const y = p.y - (postH * k) / 5;
      ctx.moveTo(p.x - 3, y);
      ctx.lineTo(p.x + 4, y - 1);
    }
  }
  ctx.stroke();
  // the rope
  if (rope.length > 1) {
    ctx.strokeStyle = rgba(INK, 0.6);
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    rope.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Paper lanterns on the line: pale paper with ink ribs while dark; lit, a warm glow (gold to vermilion wash) with a
 * soft halo. The halo is local light only (never a full-screen change).
 */
export function drawChochin(ctx: CanvasRenderingContext2D, ls: ChochinLook[], t: number) {
  ctx.save();
  // halos first (multiply keeps the ink world's contrast)
  ctx.globalCompositeOperation = 'multiply';
  for (const l of ls) {
    if (l.lit <= 0.02) continue;
    const flick = 0.88 + 0.12 * Math.sin(t * 7 + l.x * 0.13);
    const g = ctx.createRadialGradient(l.x, l.y + 10, 2, l.x, l.y + 10, 46);
    g.addColorStop(0, `rgba(240,150,40,${0.42 * l.lit * flick})`);
    g.addColorStop(1, 'rgba(240,150,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(l.x - 46, l.y - 36, 92, 92);
  }
  ctx.globalCompositeOperation = 'source-over';
  for (const l of ls) {
    ctx.save();
    ctx.translate(l.x, l.y);
    ctx.rotate(l.sway);
    // string
    ctx.strokeStyle = rgba(INK, 0.6);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 4);
    ctx.stroke();
    // body
    const lit = l.lit;
    const body = ctx.createLinearGradient(-9, 0, 9, 0);
    body.addColorStop(0, lit > 0.05 ? `rgba(230,96,40,${0.55 + 0.4 * lit})` : 'rgba(220,206,180,0.9)');
    body.addColorStop(0.5, lit > 0.05 ? `rgba(255,${190 + 40 * lit},${90 + 60 * lit},${0.7 + 0.3 * lit})` : 'rgba(244,236,220,0.95)');
    body.addColorStop(1, lit > 0.05 ? `rgba(230,96,40,${0.55 + 0.4 * lit})` : 'rgba(220,206,180,0.9)');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, 14, 9, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgba(INK, 0.55);
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    for (let k = -2; k <= 2; k++) {
      const yy = 14 + k * 4;
      const w = 9 * Math.sqrt(Math.max(0, 1 - ((yy - 14) / 11) ** 2));
      ctx.moveTo(-w, yy);
      ctx.lineTo(w, yy);
    }
    ctx.stroke();
    ctx.fillStyle = rgba(INK, 0.85);
    ctx.fillRect(-5, 2, 10, 2.6);
    ctx.fillRect(-5, 24.4, 10, 2.6);
    ctx.restore();
  }
  ctx.restore();
}

/** A faint traced ring (the master's sketch, story device): dotted pale purple, breathing slowly. Decor only. */
export function drawSketchRing(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number) {
  ctx.save();
  const k = 0.75 + 0.25 * Math.sin(t * 1.6 + x * 0.01);
  ctx.strokeStyle = `rgba(165,30,230,${0.28 * k})`;
  ctx.lineWidth = 3;
  ctx.setLineDash([5, 9]);
  ctx.lineDashOffset = -t * 6;
  ctx.beginPath();
  ctx.arc(x, y, r, -Math.PI * 0.55, Math.PI * 1.4);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = rgba(INK, 0.18 * k);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(x, y, r + 5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** Stall-arcade eaves (屋台 roofs) from x0 to x1 over ground `gy(x)`: posts, a tiled roof line and short noren. */
export function drawArcade(ctx: CanvasRenderingContext2D, x0: number, x1: number, gy: (x: number) => number, vx0: number, vx1: number, t: number) {
  const step = 260;
  ctx.save();
  ctx.lineCap = 'round';
  for (let x = x0; x < x1; x += step) {
    const xe = Math.min(x1, x + step);
    if (xe < vx0 - 60 || x > vx1 + 60) continue;
    const ya = gy(x) - 238;
    const yb = gy(xe) - 238;
    // posts
    ctx.strokeStyle = rgba(INK, 0.75);
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x + 8, gy(x + 8));
    ctx.lineTo(x + 8, ya + 10);
    ctx.stroke();
    // the roof: a thick sloped band with tile ticks
    ctx.fillStyle = rgba(INK, 0.82);
    ctx.beginPath();
    ctx.moveTo(x - 14, ya + 8);
    ctx.lineTo(x + (xe - x) * 0.5, Math.min(ya, yb) - 26);
    ctx.lineTo(xe + 14, yb + 8);
    ctx.lineTo(xe + 14, yb + 18);
    ctx.lineTo(x - 14, ya + 18);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(239,230,211,0.35)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let k = x; k < xe; k += 16) {
      const u = (k - x) / (xe - x);
      const top = u < 0.5 ? ya + 8 - (26 + (ya - Math.min(ya, yb))) * (u / 0.5) : Math.min(ya, yb) - 26 + (yb + 8 - Math.min(ya, yb) + 26) * ((u - 0.5) / 0.5);
      ctx.moveTo(k, top + 3);
      ctx.lineTo(k, ya + 16);
    }
    ctx.stroke();
    // noren: short cloth panels that sway
    const sw = Math.sin(t * 1.3 + x * 0.01) * 3;
    ctx.fillStyle = 'rgba(40,52,90,0.55)';
    for (let k = 0; k < 4; k++) {
      const nx = x + 34 + k * 52;
      if (nx + 40 > xe) break;
      ctx.beginPath();
      ctx.moveTo(nx, ya + 18);
      ctx.lineTo(nx + 44, ya + 18);
      ctx.lineTo(nx + 44 + sw, ya + 66);
      ctx.lineTo(nx + sw, ya + 66);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

/** A firework star field (screen-ish space, world transform already scaled): `k` is time since the bloom. */
export interface HanabiLook {
  x: number;
  y: number;
  /** seconds since the shell left the ground; it blooms at RISE */
  age: number;
  size: 'first' | 'small' | 'great';
  seed: number;
  /** the shell's launch point (its rise starts here) */
  y0: number;
}

const HANABI_RISE = 0.9;
const HANABI_LIFE = 2.6;
const HANABI_COLORS: Record<HanabiLook['size'], string[]> = {
  first: ['#ffb01a', '#ffe46a', '#f5361b'],
  small: ['#ffb01a', '#f5361b'],
  great: ['#f5361b', '#ffb01a', '#a51ee6', '#ffe46a', '#4fb2ff'],
};

/** Is a firework still drawing at this age? */
export function hanabiLive(age: number) {
  return age < HANABI_RISE + HANABI_LIFE;
}

/** A shell rising, then a chrysanthemum of ink-edged colour that droops and fades. Local light only. */
export function drawHanabi(ctx: CanvasRenderingContext2D, h: HanabiLook) {
  const r = mulberry32(h.seed);
  ctx.save();
  ctx.lineCap = 'round';
  if (h.age < HANABI_RISE) {
    const u = h.age / HANABI_RISE;
    const y = h.y0 + (h.y - h.y0) * (1 - (1 - u) * (1 - u));
    ctx.strokeStyle = rgba(INK, 0.5);
    ctx.lineWidth = 2;
    ctx.setLineDash([2, 7]);
    ctx.beginPath();
    ctx.moveTo(h.x + Math.sin(u * 9) * 3, Math.min(h.y0, y + 120));
    ctx.lineTo(h.x, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ffe46a';
    ctx.beginPath();
    ctx.arc(h.x, y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  const a = h.age - HANABI_RISE;
  const u = Math.min(1, a / HANABI_LIFE);
  const R = (h.size === 'great' ? 230 : h.size === 'first' ? 150 : 95) * (1 - (1 - Math.min(1, a / 0.9)) ** 3);
  const fade = 1 - u * u;
  // a soft local glow at the heart
  const g = ctx.createRadialGradient(h.x, h.y, 4, h.x, h.y, R * 1.2);
  g.addColorStop(0, `rgba(255,236,190,${0.28 * fade * (1 - u)})`);
  g.addColorStop(1, 'rgba(255,236,190,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(h.x, h.y, R * 1.2, 0, Math.PI * 2);
  ctx.fill();
  const colors = HANABI_COLORS[h.size];
  const n = h.size === 'great' ? 54 : h.size === 'first' ? 36 : 22;
  const droop = 70 * u * u;
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + r() * 0.12;
    const ring = h.size === 'great' && i % 2 ? 0.62 : 1;
    const d = R * ring * (0.9 + 0.1 * r());
    const ex = h.x + Math.cos(ang) * d;
    const ey = h.y + Math.sin(ang) * d + droop;
    const tail = Math.min(d, 26 + 30 * (1 - u));
    const tx = h.x + Math.cos(ang) * (d - tail);
    const ty = h.y + Math.sin(ang) * (d - tail) + droop * 0.7;
    const col = colors[i % colors.length];
    ctx.strokeStyle = rgba(INK, 0.35 * fade);
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.strokeStyle = rgba(col, 0.95 * fade);
    ctx.lineWidth = 2.6;
    ctx.stroke();
    if (r() < 0.6) {
      ctx.fillStyle = rgba(col, fade);
      ctx.beginPath();
      ctx.arc(ex, ey, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}
export { HANABI_RISE };
