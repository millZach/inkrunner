import { INK, PAPER, type CharId } from '../config';
import type { Vec } from '../math';
import { normals, polyPath } from './brush';

export type { CharId };

/** Characters are authored ~44 units tall and drawn larger. */
export const CHAR_SCALE = 1.35;

export interface Pose {
  x: number;
  y: number; // feet
  phase: number; // run cycle
  state: 'run' | 'air' | 'ride' | 'idle';
  vy: number;
  accent: string;
  accentLight: string;
  aim: number | null; // brush aim angle (radians) while painting
  t: number;
}

/** Verlet rope used for Ren's scarf and Kohaku's tail. */
class Rope {
  pts: Vec[] = [];
  prev: Vec[] = [];
  constructor(
    public n: number,
    public seg: number,
  ) {}

  reset(a: Vec, dir: Vec) {
    this.pts = [];
    this.prev = [];
    for (let i = 0; i < this.n; i++) {
      const p = { x: a.x + dir.x * this.seg * i, y: a.y + dir.y * this.seg * i };
      this.pts.push(p);
      this.prev.push({ ...p });
    }
  }

  update(anchor: Vec, dt: number, force: Vec, rest: Vec, stiff: number, t = 0, flutter = 0) {
    if (!this.pts.length || Math.hypot(this.pts[1].x - anchor.x, this.pts[1].y - anchor.y) > this.seg * this.n) {
      this.reset(anchor, rest);
    }
    const dt2 = dt * dt;
    this.pts[0] = { ...anchor };
    for (let i = 1; i < this.n; i++) {
      const p = this.pts[i];
      const q = this.prev[i];
      const vx = (p.x - q.x) * 0.9;
      const vy = (p.y - q.y) * 0.9;
      this.prev[i] = { ...p };
      const target = { x: anchor.x + rest.x * this.seg * i, y: anchor.y + rest.y * this.seg * i };
      const fy = force.y + Math.sin(t * 15 - i * 1.15) * flutter * (i / this.n);
      p.x += vx + force.x * dt2 + (target.x - p.x) * stiff;
      p.y += vy + fy * dt2 + (target.y - p.y) * stiff;
    }
    for (let it = 0; it < 4; it++) {
      for (let i = 1; i < this.n; i++) {
        const a = this.pts[i - 1];
        const b = this.pts[i];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1;
        const k = (d - this.seg) / d;
        if (i === 1) {
          b.x -= dx * k;
          b.y -= dy * k;
        } else {
          a.x += dx * k * 0.5;
          a.y += dy * k * 0.5;
          b.x -= dx * k * 0.5;
          b.y -= dy * k * 0.5;
        }
      }
    }
  }
}

function ribbon(ctx: CanvasRenderingContext2D, pts: Vec[], width: (t: number) => number) {
  const ns = normals(pts);
  const L: Vec[] = [];
  const R: Vec[] = [];
  for (let i = 0; i < pts.length; i++) {
    const w = width(i / (pts.length - 1)) / 2;
    L.push({ x: pts[i].x + ns[i].x * w, y: pts[i].y + ns[i].y * w });
    R.push({ x: pts[i].x - ns[i].x * w, y: pts[i].y - ns[i].y * w });
  }
  polyPath(ctx, L.concat(R.reverse()));
  ctx.fill();
}

/** Smooth a rope into a denser curve for nicer ribbons. */
function smoothRope(pts: Vec[]): Vec[] {
  const out: Vec[] = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
    out.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function limb(ctx: CanvasRenderingContext2D, hip: Vec, foot: Vec, l1: number, l2: number, bendDir: number, w: number) {
  const dx = foot.x - hip.x;
  const dy = foot.y - hip.y;
  let d = Math.hypot(dx, dy);
  d = Math.min(d, l1 + l2 - 0.01);
  const a = Math.atan2(dy, dx);
  const cosK = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const k = Math.acos(Math.max(-1, Math.min(1, cosK)));
  const knee = { x: hip.x + Math.cos(a - k * bendDir) * l1, y: hip.y + Math.sin(a - k * bendDir) * l1 };
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(hip.x, hip.y);
  ctx.lineTo(knee.x, knee.y);
  ctx.lineTo(foot.x, foot.y);
  ctx.stroke();
}

export class Character {
  private rope: Rope;
  constructor(public id: CharId) {
    this.rope = id === 'ren' ? new Rope(8, 5.2 * CHAR_SCALE) : new Rope(8, 5.4 * CHAR_SCALE);
  }

  reset() {
    this.rope.pts = [];
  }

  update(p: Pose, dt: number) {
    if (dt <= 0) return;
    const k = CHAR_SCALE;
    const moving = p.state !== 'idle';
    if (this.id === 'ren') {
      const lean = p.state === 'run' ? 0.12 : 0.05;
      const neck = { x: p.x + (-3 + lean * 30) * k, y: p.y - 39 * k };
      const wind = moving ? -700 : -40;
      this.rope.update(neck, dt, { x: wind, y: 300 - Math.min(0, p.vy) * 0.3 }, { x: -0.85, y: 0.35 }, 0.015, p.t, moving ? 9000 : 1500);
    } else {
      const bob = p.state === 'run' ? Math.sin(p.phase * 2) * 1.5 : 0;
      const rump = { x: p.x - 14 * k, y: p.y + (-19 + bob) * k };
      const wind = moving ? -260 : -30;
      this.rope.update(rump, dt, { x: wind, y: -60 - p.vy * 0.15 }, { x: -0.7, y: -0.72 }, 0.1, p.t * 0.7, moving ? 5000 : 1200);
    }
  }

  /** Draws at the context's current globalAlpha (the ghost runner relies on this). */
  draw(ctx: CanvasRenderingContext2D, p: Pose) {
    const a0 = ctx.globalAlpha;
    if (this.id === 'ren') this.drawRen(ctx, p, a0);
    else this.drawKohaku(ctx, p, a0);
    ctx.globalAlpha = a0;
  }

  private drawRen(ctx: CanvasRenderingContext2D, p: Pose, a0: number) {
    const rope = smoothRope(this.rope.pts);
    // scarf behind the body
    if (rope.length > 2) {
      ctx.fillStyle = p.accent;
      ctx.globalAlpha = a0 * 0.95;
      ribbon(ctx, rope, (t) => 6.5 * CHAR_SCALE * (1 - t * 0.55));
      ctx.fillStyle = p.accentLight;
      ctx.globalAlpha = a0 * 0.35;
      ribbon(ctx, rope, (t) => 2.2 * CHAR_SCALE * (1 - t));
      ctx.globalAlpha = a0;
    }

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(CHAR_SCALE, CHAR_SCALE);
    const lean = p.state === 'run' ? 0.12 : p.state === 'air' ? 0.04 : p.state === 'ride' ? 0.2 : 0.03;
    const bob = p.state === 'run' ? -Math.abs(Math.sin(p.phase)) * 2.2 : 0;
    ctx.strokeStyle = INK;
    ctx.fillStyle = INK;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // legs
    const hip = { x: 0, y: -19 + bob };
    for (let k = 0; k < 2; k++) {
      let foot: Vec;
      if (p.state === 'run') {
        const a = p.phase + k * Math.PI;
        foot = { x: -Math.sin(a) * 11, y: -Math.max(0, -Math.cos(a)) * 8 };
      } else if (p.state === 'air') {
        foot = k ? { x: 7, y: -9 } : { x: -6, y: -5 };
      } else if (p.state === 'ride') {
        foot = k ? { x: 9, y: -1 } : { x: -8, y: -1 };
      } else {
        foot = { x: k ? 4 : -4, y: 0 };
      }
      ctx.globalAlpha = a0 * (k ? 1 : 0.7);
      limb(ctx, hip, foot, 11, 11, 1, 3.6);
    }
    ctx.globalAlpha = a0;

    ctx.rotate(lean);
    const flut = Math.sin(p.t * 14) * 1.5;
    // robe
    ctx.beginPath();
    ctx.moveTo(-6, -38 + bob);
    ctx.quadraticCurveTo(-9, -28 + bob, -13 - flut, -14 + bob);
    ctx.quadraticCurveTo(-2, -12 + bob, 10, -16 + bob);
    ctx.quadraticCurveTo(9, -28 + bob, 6, -38 + bob);
    ctx.closePath();
    ctx.fill();
    // obi in the current ink
    ctx.fillStyle = p.accent;
    ctx.fillRect(-8.5, -28 + bob, 17, 3.6);
    ctx.fillStyle = INK;
    // head
    ctx.beginPath();
    ctx.arc(1.5, -42.5 + bob, 5.2, 0, Math.PI * 2);
    ctx.fill();
    // kasa hat
    ctx.beginPath();
    ctx.moveTo(-18, -43 + bob);
    ctx.quadraticCurveTo(-4, -51 + bob, 2, -58 + bob);
    ctx.quadraticCurveTo(8, -51 + bob, 21, -43.5 + bob);
    ctx.quadraticCurveTo(1, -46 + bob, -18, -43 + bob);
    ctx.fill();
    ctx.strokeStyle = PAPER;
    ctx.globalAlpha = a0 * 0.35;
    ctx.lineWidth = 0.7;
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(2, -57 + bob);
      ctx.lineTo(1.5 + i * 5.6, -45 + bob);
      ctx.stroke();
    }
    ctx.globalAlpha = a0;
    ctx.strokeStyle = INK;

    // arm + brush
    const shoulder = { x: 3, y: -35 + bob };
    let ang = p.aim !== null ? p.aim - lean : -0.75 + Math.sin(p.phase) * 0.15;
    if (p.state === 'air' && p.aim === null) ang = -1.1;
    const hand = { x: shoulder.x + Math.cos(ang * 0.6 + 0.5) * 11, y: shoulder.y + Math.sin(ang * 0.6 + 0.5) * 11 };
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(shoulder.x, shoulder.y);
    ctx.lineTo(hand.x, hand.y);
    ctx.stroke();
    const tip = { x: hand.x + Math.cos(ang) * 20, y: hand.y + Math.sin(ang) * 20 };
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(hand.x - Math.cos(ang) * 4, hand.y - Math.sin(ang) * 4);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();
    this.brushHead(ctx, tip, ang, p, 7);
    ctx.restore();
  }

  private brushHead(ctx: CanvasRenderingContext2D, at: Vec, ang: number, p: Pose, len: number) {
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(at.x, at.y, 2.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.accent;
    ctx.beginPath();
    ctx.moveTo(at.x - s * 2.6, at.y + c * 2.6);
    ctx.quadraticCurveTo(at.x + c * len * 0.6 - s * 3.2, at.y + s * len * 0.6 + c * 3.2, at.x + c * len, at.y + s * len);
    ctx.quadraticCurveTo(at.x + c * len * 0.6 + s * 3.2, at.y + s * len * 0.6 - c * 3.2, at.x + s * 2.6, at.y - c * 2.6);
    ctx.fill();
  }

  private drawKohaku(ctx: CanvasRenderingContext2D, p: Pose, a0: number) {
    const run = p.state === 'run';
    const bob = run ? Math.sin(p.phase * 2) * 1.6 : 0;

    // tail — the brush
    const rope = smoothRope(this.rope.pts);
    if (rope.length > 2) {
      ctx.fillStyle = INK;
      const width = (t: number) => (4 + 10 * Math.sin(Math.PI * Math.min(1, t * 1.05) ** 0.75) * (1 - t * 0.35)) * CHAR_SCALE;
      ribbon(ctx, rope, width);
      const tipStart = Math.floor(rope.length * 0.62);
      const tip = rope.slice(tipStart);
      ctx.fillStyle = p.accent;
      ribbon(ctx, tip, (t) => width(0.62 + t * 0.38) * (1 - t * 0.85) + 0.4);
      ctx.fillStyle = p.accentLight;
      ctx.globalAlpha = a0 * 0.4;
      ribbon(ctx, tip, (t) => 2.5 * CHAR_SCALE * (1 - t));
      ctx.globalAlpha = a0;
    }

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(CHAR_SCALE, CHAR_SCALE);
    ctx.strokeStyle = INK;
    ctx.fillStyle = INK;
    ctx.lineCap = 'round';
    const tilt = p.state === 'air' ? Math.max(-0.35, Math.min(0.35, p.vy / 2500)) : p.state === 'ride' ? -0.1 : 0;
    ctx.rotate(tilt);

    // legs
    const legs = [
      { hip: { x: -11, y: -14 + bob }, off: 0, far: true },
      { hip: { x: 10, y: -15 + bob }, off: Math.PI * 0.55, far: true },
      { hip: { x: -9, y: -14 + bob }, off: Math.PI * 0.25, far: false },
      { hip: { x: 12, y: -15 + bob }, off: Math.PI * 0.8, far: false },
    ];
    for (const l of legs) {
      let foot: Vec;
      if (run) {
        const a = p.phase + l.off;
        foot = { x: l.hip.x - Math.sin(a) * 8, y: -Math.max(0, -Math.cos(a)) * 5 };
      } else if (p.state === 'air') {
        foot = { x: l.hip.x + (l.hip.x > 0 ? 7 : -8), y: l.hip.y + 9 };
      } else {
        foot = { x: l.hip.x + (l.far ? 1 : -1), y: 0 };
      }
      ctx.globalAlpha = a0 * (l.far ? 0.65 : 1);
      limb(ctx, l.hip, foot, 7, 8, l.hip.x > 0 ? 1 : -1, 2.6);
    }
    ctx.globalAlpha = a0;

    // body
    const stretch = run ? 1 + Math.sin(p.phase * 2 + 1) * 0.05 : 1;
    ctx.beginPath();
    ctx.ellipse(0, -17 + bob, 15.5 * stretch, 7.2 / stretch, -0.06, 0, Math.PI * 2);
    ctx.fill();
    // chest ruff
    ctx.beginPath();
    ctx.moveTo(8, -23 + bob);
    ctx.quadraticCurveTo(17, -18 + bob, 12, -10 + bob);
    ctx.quadraticCurveTo(9, -15 + bob, 8, -23 + bob);
    ctx.fill();

    // head
    const hb = bob * 0.6;
    ctx.beginPath();
    ctx.moveTo(9, -19 + hb);
    ctx.lineTo(11, -27 + hb);
    ctx.lineTo(12.5, -37 + hb); // ear 1
    ctx.lineTo(15.5, -29 + hb);
    ctx.lineTo(19.5, -36.5 + hb); // ear 2
    ctx.lineTo(20, -28 + hb);
    ctx.quadraticCurveTo(24, -25 + hb, 28.5, -22.5 + hb); // snout
    ctx.lineTo(28, -20.5 + hb);
    ctx.quadraticCurveTo(22, -18 + hb, 17, -17.5 + hb);
    ctx.closePath();
    ctx.fill();
    // inner ears + eye (negative space)
    ctx.fillStyle = PAPER;
    ctx.globalAlpha = a0 * 0.5;
    ctx.beginPath();
    ctx.moveTo(12.6, -33.5 + hb);
    ctx.lineTo(14, -29.5 + hb);
    ctx.lineTo(12.2, -29.5 + hb);
    ctx.fill();
    ctx.globalAlpha = a0;
    ctx.strokeStyle = PAPER;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(18.2, -25.6 + hb);
    ctx.lineTo(21.4, -24.6 + hb);
    ctx.stroke();
    // kitsune marking in the current ink
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(16.4, -29 + hb);
    ctx.quadraticCurveTo(18.2, -27.2 + hb, 21, -27.6 + hb);
    ctx.stroke();
    ctx.restore();
  }
}
