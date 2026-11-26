import { INK, INKS, PAPER, type CharId, type InkKind } from '../config';
import type { Vec } from '../math';
import { brushLine, curve, rgba } from '../render/brush';
import { Character, CHAR_SCALE, type Pose } from '../render/characters';
import { drawTorii } from '../render/decor';
import { Particles } from '../render/particles';
import { mulberry32 } from '../rng';
import {
  AMBER,
  AMBER_LIGHT,
  drawAndon,
  drawAndonGlow,
  drawInkstone,
  drawInkStoneDisc,
  drawMasterArm,
  drawMasterBody,
  MASTER,
} from './figures';
import { clipPull, featherPull, pullCamera } from './handover';
import { Layer, span } from './layers';
import {
  bandPath,
  drawBlotPool,
  drawBlotWall,
  drawGround,
  drawMiniWorld,
  drawRoll,
  drawScrollPaper,
  drawSmoke,
  heldRidge,
  paintBackdrop,
  springBackdrop,
  type Band,
} from './scene';
import type { CutsceneDef, PanelDef, PanelScene, View } from './types';

// ───────────────────────────────────────────── shared staging

export const FLOOR = 560;
const LAMP_X = 150;
/** the great scroll on the floor (P1 to P3) */
const BAND: Band = { nx0: 484, nx1: 1120, yNear: 608, yFar: 504, skew: 56 };
const MASTER_AT = { x: 395, y: FLOOR, s: 1.05 };
const REN_KNEEL = { x: 240, s: 1.55 };
/** under the tip of Ren's brush when its aim circles low (grinding, P1) */
const STONE_AT = { x: 304, y: 558 };
/** the ridge she is painting in P1, on the scroll's first page */
const RIDGE = heldRidge(526, 606, 534);

export const ease = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
export const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

export function pose(x: number, y: number, state: Pose['state'], accent: string, light: string, t: number, extra: Partial<Pose> = {}): Pose {
  return { x, y, phase: 0, state, vy: 0, accent, accentLight: light, aim: null, t, ...extra };
}

/**
 * The master's room at night, suggested by almost nothing: a dry-brush floor line, an ink-wash dark that pools at
 * the top and the edges and lifts around the lamp and where the inscription goes, the lamp itself, and soft
 * shadows thrown to the right by its light.
 */
function paintRoom(ctx: CanvasRenderingContext2D, v: View, seed: number, opts: { stone: boolean; textAt: Vec }) {
  const r = mulberry32(seed);
  const x0 = v.x0 - 40;
  const x1 = v.x1 + 40;
  const y0 = v.y0 - 10;
  const y1 = v.y1 + 10;
  // the night wash, on its own scratch so the lamp and the inscription can lift it
  const k = v.k;
  const c = document.createElement('canvas');
  c.width = Math.ceil((x1 - x0) * k);
  c.height = Math.ceil((y1 - y0) * k);
  const w = c.getContext('2d')!;
  w.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
  // night: a deep base wash, darker still toward the top (down to the floor line) and the sides
  w.fillStyle = rgba(INK, 0.47);
  w.fillRect(x0, y0, x1 - x0, y1 - y0);
  const top = w.createLinearGradient(0, y0, 0, FLOOR);
  top.addColorStop(0, rgba(INK, 0.86));
  top.addColorStop(0.55, rgba(INK, 0.5));
  top.addColorStop(1, rgba(INK, 0));
  w.fillStyle = top;
  w.fillRect(x0, y0, x1 - x0, FLOOR - y0);
  // broad, uneven horizontal washes, like a wet brush dragged across the dark
  for (let i = 0; i < 4; i++) {
    const y = y0 + 10 + i * 46 + r() * 30;
    brushLine(w, [{ x: x0 - 50, y }, { x: (x0 + x1) / 2, y: y + (r() - 0.5) * 20 }, { x: x1 + 50, y: y + (r() - 0.5) * 24 }], r, {
      w: 70 + r() * 50,
      alpha: 0.04 + r() * 0.03,
      taperIn: 300,
      taperOut: 400,
      wobble: 0.25,
    });
  }
  for (const [ex, dir] of [
    [x0, 1],
    [x1, -1],
  ]) {
    const g = w.createLinearGradient(ex, 0, ex + dir * 420, 0);
    g.addColorStop(0, rgba(INK, 0.6));
    g.addColorStop(1, rgba(INK, 0));
    w.fillStyle = g;
    w.fillRect(Math.min(ex, ex + dir * 420), y0, 420, y1 - y0);
  }
  const floor = w.createLinearGradient(0, FLOOR, 0, y1);
  floor.addColorStop(0, rgba(INK, 0.04));
  floor.addColorStop(1, rgba(INK, 0.42));
  w.fillStyle = floor;
  w.fillRect(x0, FLOOR, x1 - x0, y1 - FLOOR);
  // only two lifts open the dark: the lamp and the two figures in its light, and a smaller, cooler one just
  // behind the words so the ink text still reads
  w.globalCompositeOperation = 'destination-out';
  const lift = (x: number, y: number, rx: number, ry: number, a: number) => {
    w.save();
    w.translate(x, y);
    w.scale(1, ry / rx);
    // a long, soft falloff (no plateau, no rim), like a wash thinned with water rather than a spotlight
    const g = w.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, `rgba(0,0,0,${a})`);
    g.addColorStop(0.3, `rgba(0,0,0,${a * 0.86})`);
    g.addColorStop(0.6, `rgba(0,0,0,${a * 0.45})`);
    g.addColorStop(0.82, `rgba(0,0,0,${a * 0.14})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    w.fillStyle = g;
    w.fillRect(-rx, -rx, rx * 2, rx * 2);
    w.restore();
  };
  lift(LAMP_X + 130, FLOOR - 50, 500, 290, 1);
  lift(opts.textAt.x, opts.textAt.y + 5, 560, 150, 0.86);
  w.globalCompositeOperation = 'source-over';
  ctx.drawImage(c, x0, y0, x1 - x0, y1 - y0);
  c.width = c.height = 0;

  // tatami edges: two faint dry lines receding on the floor
  brushLine(ctx, [{ x: x0, y: FLOOR + 62 }, { x: x1, y: FLOOR + 58 }], r, { w: 2, alpha: 0.12, taperIn: 60, taperOut: 60, bristles: 3, dry: 1 });
  brushLine(ctx, [{ x: x0, y: FLOOR + 118 }, { x: x1, y: FLOOR + 112 }], r, { w: 2.4, alpha: 0.1, taperIn: 60, taperOut: 60, bristles: 3, dry: 1 });
  // the floor line, one long dry stroke
  brushLine(ctx, [{ x: x0, y: FLOOR + 1 }, { x: (x0 + x1) / 2, y: FLOOR - 1 }, { x: x1, y: FLOOR + 2 }], r, {
    w: 5,
    alpha: 0.85,
    taperIn: 80,
    taperOut: 120,
    bristles: 8,
    dry: 0.9,
    wobble: 0.5,
  });
  // shadows thrown to the right by the lamp
  ctx.fillStyle = rgba(INK, 0.13);
  for (const [sx, rx] of [
    [REN_KNEEL.x + 50, 62],
    [MASTER_AT.x + 70, 92],
  ]) {
    ctx.beginPath();
    ctx.ellipse(sx, FLOOR + 3, rx, 7, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  drawAndon(ctx, LAMP_X, FLOOR, seed + 5);
  if (opts.stone) drawInkstone(ctx, STONE_AT.x, STONE_AT.y, seed + 9);
}

/**
 * Ren kneeling, drawn by the shared Character renderer (BRIEF section 6: "Reuse, don't fork"). Until Character has
 * a kneel pose this is docs/story.md section 10's fallback: Ren in `idle`, lowered 8 units into the floor (clipped
 * there) on a dark cushion that hides the folded legs, and the brush `aim` doing the hand work. `bow` tips the
 * whole figure forward about its seat (head bowed); `lower` is 1 kneeling, 0 standing. The pose lives in the figure's
 * own space (foot at 0, 0), so its scarf physics is stepped with kneelPose() in the scene's update.
 */
export function kneelPose(aim: number, t: number, lower = 1): Pose {
  return pose(0, 8 * CHAR_SCALE * lower, 'idle', INK, INK, t, { aim });
}

export function drawRenKneeling(ctx: CanvasRenderingContext2D, ren: Character, p: Pose, x: number, s: number, bow = 0) {
  ctx.save();
  ctx.translate(x, FLOOR);
  ctx.scale(s, s);
  // below the floor line is the floor
  ctx.beginPath();
  ctx.rect(-80, -140, 180, 140.5);
  ctx.save();
  ctx.clip();
  ctx.rotate(bow);
  ren.draw(ctx, p);
  ctx.restore();
  ctx.restore();
  drawRenCushion(ctx, x, s);
}

/** the cushion (zabuton) Ren kneels on, in front of the lowered legs; x is Ren's seat */
function drawRenCushion(ctx: CanvasRenderingContext2D, x: number, s: number) {
  ctx.save();
  ctx.translate(x, FLOOR);
  ctx.scale(s, s);
  ctx.fillStyle = rgba(INK, 0.82);
  ctx.beginPath();
  ctx.moveTo(-19, 0.5);
  ctx.quadraticCurveTo(-21, -9, -12, -9.5);
  ctx.lineTo(16, -9.5);
  ctx.quadraticCurveTo(25, -9, 23, 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = rgba(PAPER, 0.22);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(-15, -7.6);
  ctx.quadraticCurveTo(2, -9, 19, -7.6);
  ctx.stroke();
  ctx.restore();
}

/**
 * Kohaku as the master painted it: a small amber fox on the scroll's first page, deliberately out of scale, just
 * right of the torii so its tail stays clear of the post ("beside them, not over them").
 */
const FOX_AT = { x: 644, y: BAND.yNear - 16, s: 0.62 };

/** `tilt` cocks the fox about its feet (the twitch that draws the eye in P1; radians, + leans forward) */
function drawPaintedFox(ctx: CanvasRenderingContext2D, fox: Character, p: Pose, tilt: number, halo: number) {
  // the one thing she painted with love bleeds a little amber into the paper around it
  if (halo > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    const g = ctx.createRadialGradient(FOX_AT.x + 4, FOX_AT.y - 14, 2, FOX_AT.x + 4, FOX_AT.y - 14, 46);
    g.addColorStop(0, rgba(AMBER_LIGHT, 0.5 * halo));
    g.addColorStop(1, rgba(AMBER_LIGHT, 0));
    ctx.fillStyle = g;
    ctx.fillRect(FOX_AT.x - 50, FOX_AT.y - 64, 100, 100);
    ctx.restore();
  }
  ctx.save();
  ctx.translate(FOX_AT.x, FOX_AT.y);
  ctx.scale(FOX_AT.s, FOX_AT.s);
  ctx.rotate(tilt);
  fox.draw(ctx, p);
  ctx.restore();
}

/** a few warm motes drifting up through the lamplight (a function of time, so seeking is exact) */
function drawMotes(ctx: CanvasRenderingContext2D, t: number) {
  ctx.save();
  for (let i = 0; i < 14; i++) {
    const r = mulberry32(900 + i);
    const life = 3 + r() * 3;
    const u = ((t + r() * life) % life) / life;
    const x = LAMP_X + 20 + (r() - 0.3) * 300 + Math.sin(t * 0.7 + i) * 12;
    const y = FLOOR - 20 - u * (160 + r() * 120);
    const d = Math.hypot(x - LAMP_X, (y - (FLOOR - 62)) * 1.4);
    const a = Math.sin(u * Math.PI) * Math.max(0, 1 - d / 320) * (0.7 + 0.3 * Math.sin(t * 6 + i * 2));
    if (a <= 0.02) continue;
    ctx.fillStyle = `rgba(255,214,140,${0.75 * a})`;
    ctx.beginPath();
    ctx.arc(x, y, 1.1 + r() * 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ───────────────────────────────────────────── P1 "The painter" (final quality)

/** her brush tip along the ridge as it paints (u = 0..1), and the brush's angle there */
function ridgeAt(u: number): { p: Vec; ang: number } {
  const f = Math.max(0, Math.min(1, u)) * (RIDGE.length - 1);
  const i = Math.min(RIDGE.length - 2, Math.floor(f));
  const a = RIDGE[i];
  const b = RIDGE[i + 1];
  const q = f - i;
  return { p: { x: a.x + (b.x - a.x) * q, y: a.y + (b.y - a.y) * q }, ang: lerp(0.85, 0.45, u) };
}

const P1_PAINT = { t0: 1.6, dur: 1.5 };
const P1_UNROLL = { t0: 0.45, dur: 1.1 };

function p1Scene(): PanelScene {
  let room: Layer | null = null;
  let band: Layer | null = null;
  let ridge: Layer | null = null;
  let ridgeWash: Layer | null = null;
  let master: Layer | null = null;
  const fox = new Character('kohaku');
  const ren = new Character('ren');
  let foxPose = pose(0, 0, 'idle', AMBER, AMBER_LIGHT, 0);
  let renPose = kneelPose(0.62, 0);

  return {
    bake(k, view) {
      const bx0 = BAND.nx0 - 4;
      const bx1 = BAND.nx1 + BAND.skew + 4;
      room = new Layer(view.x0 - 40, view.y0 - 10, view.x1 - view.x0 + 80, view.y1 - view.y0 + 20, (ctx) =>
        paintRoom(ctx, view, 11, { stone: true, textAt: { x: 760, y: 200 } }),
      );
      band = new Layer(bx0, BAND.yFar - 70, bx1 - bx0, BAND.yNear - BAND.yFar + 90, (ctx) => {
        const r = mulberry32(12);
        drawScrollPaper(ctx, BAND, r);
        drawMiniWorld(ctx, BAND, 21);
      });
      ridge = new Layer(500, 500, 120, 50, (ctx) =>
        brushLine(ctx, RIDGE, mulberry32(13), { w: 3.4, alpha: 0.92, taperIn: 6, taperOut: 18, bristles: 4, dry: 0.5 }),
      );
      ridgeWash = new Layer(490, 500, 140, 70, (ctx) => {
        ctx.save();
        bandPath(ctx, BAND);
        ctx.clip();
        const under = RIDGE.map((p) => ({ x: p.x, y: p.y + 9 }));
        brushLine(ctx, under, mulberry32(14), { w: 20, alpha: 0.13, taperIn: 10, taperOut: 20, wobble: 0.5 });
        ctx.restore();
      });
      master = new Layer(MASTER_AT.x - 70, MASTER_AT.y - 160, 150, 172, (ctx) => {
        ctx.translate(MASTER_AT.x, MASTER_AT.y);
        ctx.scale(MASTER_AT.s, MASTER_AT.s);
        drawMasterBody(ctx, 41);
      });
      return [() => room!.bake(k), () => band!.bake(k), () => ridge!.bake(k), () => ridgeWash!.bake(k), () => master!.bake(k)];
    },

    update(t, dt) {
      const blinkFlick = t > 3.75 && t < 4.05;
      // the tail flicks: a moment of the running wind on the rope, while the fox itself stays put (drawn idle)
      foxPose = pose(0, 0, 'idle', AMBER, AMBER_LIGHT, t);
      fox.update({ ...foxPose, state: blinkFlick ? 'run' : 'idle', vy: blinkFlick ? -900 : 0 }, dt);
      // Ren grinds ink: the brush tip circles low in the inkstone, one slow circle per 1.2 s
      renPose = kneelPose(0.6 + Math.cos((t / 1.2) * Math.PI * 2) * 0.09, t);
      ren.update(renPose, dt);
    },

    camera(t) {
      // a slow drift right and a gentle push in toward her place and the painted fox
      const u = ease(Math.min(1, t / 5));
      return { z: 1 + 0.16 * u, cx: 560, cy: FLOOR, dx: 30 * u, dy: 0 };
    },

    draw(ctx, t) {
      room?.draw(ctx);
      // the great scroll unrolls along the floor, its roll travelling right
      const u = ease(span(t, P1_UNROLL.t0, P1_UNROLL.dur));
      const front = lerp(BAND.nx0 + 6, BAND.nx1, u);
      band?.reveal(ctx, 'x', front + BAND.skew * 0.5, 10);
      const r = mulberry32(15);
      drawRoll(ctx, BAND, front, lerp(30, 22, u), r);
      // the ridge paints in under her brush, then its wash blooms
      const pu = span(t, P1_PAINT.t0, P1_PAINT.dur);
      const tipAt = ridgeAt(ease(pu));
      if (pu > 0) {
        ridgeWash?.reveal(ctx, 'x', tipAt.p.x - 6, 24, Math.min(1, span(t, P1_PAINT.t0 + 0.3, 1.2) * 1.4));
        ridge?.reveal(ctx, 'x', tipAt.p.x + 1, 5);
      }
      // the painted fox appears as the paper reaches it
      const foxIn = Math.min(1, Math.max(0, (front - FOX_AT.x + 10) / 30));
      if (foxIn > 0) {
        ctx.save();
        ctx.globalAlpha = foxIn;
        // a quick twitch of the head (a cock and back) just before the tail flicks
        const tw = span(t, 3.35, 0.4);
        drawPaintedFox(ctx, fox, foxPose, Math.sin(tw * Math.PI) * 0.09, foxIn);
        ctx.restore();
      }

      // Ren kneels a step behind her, grinding ink in slow circles
      drawRenKneeling(ctx, ren, renPose, REN_KNEEL.x, REN_KNEEL.s, 0.04);

      // the master: body baked, the painting arm live; she leans into the stroke as it travels
      const lean = 0.04 + Math.sin(t * 1.1) * 0.006 + 0.22 * ease(pu) - 0.12 * ease(span(t, P1_PAINT.t0 + P1_PAINT.dur, 0.8)) + 0.03 * ease(span(t, 1.05, 0.55));
      // a lean that keeps her knees and feet on the floor: shear about the floor line
      ctx.save();
      ctx.translate(MASTER_AT.x, MASTER_AT.y);
      ctx.transform(1, 0, -lean, 1, 0, 0);
      ctx.translate(-MASTER_AT.x, -MASTER_AT.y);
      master?.draw(ctx);
      let tip: Vec;
      let ang: number;
      const start = ridgeAt(0);
      const end = ridgeAt(1);
      if (t < P1_PAINT.t0) {
        // poised above the paper, then lowering to touch it
        const d = ease(span(t, 1.05, P1_PAINT.t0 - 1.05));
        tip = { x: start.p.x - 10 + 10 * d, y: start.p.y - 26 + 26 * d };
        ang = start.ang + 0.08 * (1 - d) + Math.sin(t * 1.3) * 0.01 * (1 - d);
      } else if (pu < 1) {
        tip = tipAt.p;
        ang = tipAt.ang;
      } else {
        // lifts away and rests, looking at the line
        const d = ease(span(t, P1_PAINT.t0 + P1_PAINT.dur, 0.6));
        tip = { x: end.p.x - 6 * d, y: end.p.y - 22 * d };
        ang = end.ang + 0.1 * d;
      }
      ctx.restore();
      // the arm hangs from where the lean carried her shoulder, and is not itself sheared
      ctx.save();
      ctx.translate(MASTER_AT.x, MASTER_AT.y);
      ctx.scale(MASTER_AT.s, MASTER_AT.s);
      const sh = { x: MASTER.shoulder.x - lean * MASTER.shoulder.y, y: MASTER.shoulder.y };
      drawMasterArm(ctx, { x: (tip.x - MASTER_AT.x) / MASTER_AT.s, y: (tip.y - MASTER_AT.y) / MASTER_AT.s }, ang, 43, INK, 92, sh);
      ctx.restore();

      drawAndonGlow(ctx, LAMP_X, FLOOR, 1, t);
      drawMotes(ctx, t);
    },

    release() {
      for (const l of [room, band, ridge, ridgeWash, master]) l?.release();
    },
  };
}

// ───────────────────────────────────────────── P2 "The last stroke" (board)

const CUSHION = { x: 405, y: 572 };
/** her brush, laid along the cushion's front edge: handle end, tip */
const LAID = { a: { x: 298, y: 574 }, b: { x: 436, y: 578 } };
const LAST_STROKE: Vec[] = curve({ x: 792, y: 516 }, { x: 900, y: 524 }, { x: 990, y: 556 }, 14);
const POOL = { x: 1000, y: 560 };

/** her long brush as a prop: handle, ferrule, tip */
function drawLooseBrush(ctx: CanvasRenderingContext2D, a: Vec, b: Vec) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy);
  const ux = dx / l;
  const uy = dy / l;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = rgba(INK, 0.9);
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x - ux * 16, b.y - uy * 16);
  ctx.stroke();
  ctx.lineWidth = 4.6;
  ctx.beginPath();
  ctx.moveTo(b.x - ux * 21, b.y - uy * 21);
  ctx.lineTo(b.x - ux * 16, b.y - uy * 16);
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(b.x - ux * 16 - uy * 3, b.y - uy * 16 + ux * 3);
  ctx.quadraticCurveTo(b.x - ux * 6 - uy * 3.6, b.y - uy * 6 + ux * 3.6, b.x, b.y);
  ctx.quadraticCurveTo(b.x - ux * 6 + uy * 3.6, b.y - uy * 6 - ux * 3.6, b.x - ux * 16 + uy * 3, b.y - uy * 16 - ux * 3);
  ctx.fill();
  ctx.restore();
}

/** the room with the scroll whose world stops at her last stroke (P2 and the start of P3) */
function lastStrokeLayers(view: View) {
  const bx0 = BAND.nx0 - 4;
  const bx1 = BAND.nx1 + BAND.skew + 4;
  const room = new Layer(view.x0 - 40, view.y0 - 10, view.x1 - view.x0 + 80, view.y1 - view.y0 + 20, (ctx) => {
    paintRoom(ctx, view, 11, { stone: false, textAt: { x: 640, y: 190 } });
    // her place, empty: her cushion in the lamplight, still pressed where she sat
    const c = CUSHION;
    ctx.save();
    // its shadow on the floor
    ctx.fillStyle = rgba(INK, 0.22);
    ctx.beginPath();
    ctx.ellipse(c.x + 8, c.y + 7, 76, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    // the cushion seen a little from above: a top face and a darker front edge
    const top = [
      { x: c.x - 58, y: c.y - 2 },
      { x: c.x - 44, y: c.y - 17 },
      { x: c.x + 58, y: c.y - 17 },
      { x: c.x + 70, y: c.y - 2 },
    ];
    ctx.fillStyle = rgba(INK, 0.62);
    ctx.beginPath();
    ctx.moveTo(top[0].x, top[0].y);
    ctx.quadraticCurveTo(c.x - 62, c.y + 6, c.x - 50, c.y + 7);
    ctx.lineTo(c.x + 62, c.y + 7);
    ctx.quadraticCurveTo(c.x + 74, c.y + 6, top[3].x, top[3].y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = rgba(INK, 0.4);
    ctx.beginPath();
    ctx.moveTo(top[0].x, top[0].y);
    ctx.quadraticCurveTo(c.x - 56, c.y - 16, top[1].x, top[1].y);
    ctx.lineTo(top[2].x, top[2].y);
    ctx.quadraticCurveTo(c.x + 70, c.y - 16, top[3].x, top[3].y);
    ctx.closePath();
    ctx.fill();
    // the dent where she knelt: a soft dark hollow with a lit rim on its far side
    const dg = ctx.createRadialGradient(c.x - 4, c.y - 9, 2, c.x - 4, c.y - 9, 34);
    dg.addColorStop(0, rgba(INK, 0.5));
    dg.addColorStop(1, rgba(INK, 0));
    ctx.fillStyle = dg;
    ctx.beginPath();
    ctx.ellipse(c.x - 4, c.y - 9, 36, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,236,200,0.35)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(c.x - 4, c.y - 9.5, 34, 5.5, 0, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();
    brushLine(ctx, [{ x: c.x - 50, y: c.y + 7 }, { x: c.x + 62, y: c.y + 7 }], mulberry32(17), { w: 2.2, alpha: 0.85, taperIn: 6, taperOut: 6 });
    brushLine(ctx, [top[1], top[2]], mulberry32(18), { w: 1.4, alpha: 0.55, taperIn: 6, taperOut: 6 });
    ctx.restore();
  });
  const band = new Layer(bx0, BAND.yFar - 70, bx1 - bx0, BAND.yNear - BAND.yFar + 90, (ctx) => {
    const r = mulberry32(12);
    drawScrollPaper(ctx, BAND, r);
    drawMiniWorld(ctx, BAND, 21, 780);
    // the ridge she finished in P1 is there now
    brushLine(ctx, RIDGE, mulberry32(13), { w: 3.4, alpha: 0.92, taperIn: 6, taperOut: 18, bristles: 4, dry: 0.5 });
    // her last stroke: heavy, a hard stop instead of a taper
    brushLine(ctx, LAST_STROKE, mulberry32(16), { w: 16, alpha: 0.95, taperIn: 10, taperOut: 0.01, bristles: 7, dry: 0.15 });
    drawRoll(ctx, BAND, BAND.nx1, 22, mulberry32(15));
  });
  return { room, band };
}

/** Ren's brush aim through P2: resting low, reaching to her brush, lifting it, then holding it low across the lap */
function p2Aim(t: number) {
  const reach = ease(span(t, 1.0, 0.6));
  const lift = ease(span(t, 1.7, 0.6));
  const settle = ease(span(t, 2.5, 0.8));
  return lerp(lerp(lerp(1.15, 0.8, reach), 0.3, lift), 0.62, settle);
}

/** as the lamp goes out (out = 0..1), the night closes over the place it kept open; `paper` darkens its paper */
function drawLampOut(ctx: CanvasRenderingContext2D, out: number, paper: number) {
  if (out > 0) {
    ctx.save();
    ctx.translate(LAMP_X + 130, FLOOR - 50);
    ctx.scale(1, 290 / 500);
    const dg = ctx.createRadialGradient(0, 0, 0, 0, 0, 520);
    dg.addColorStop(0, rgba(INK, 0.5 * out));
    dg.addColorStop(0.6, rgba(INK, 0.28 * out));
    dg.addColorStop(1, rgba(INK, 0));
    ctx.fillStyle = dg;
    ctx.fillRect(-520, -520, 1040, 1040);
    ctx.restore();
  }
  if (paper > 0) {
    ctx.fillStyle = rgba(INK, 0.35 * paper);
    ctx.fillRect(LAMP_X - 20, FLOOR - 110, 40, 96);
  }
}

function p2Scene(): PanelScene {
  let L: ReturnType<typeof lastStrokeLayers> | null = null;
  const ren = new Character('ren');
  let renPose = kneelPose(1.15, 0);
  return {
    bake(k, view) {
      L = lastStrokeLayers(view);
      return [() => L!.room.bake(k), () => L!.band.bake(k)];
    },
    update(t, dt) {
      renPose = kneelPose(p2Aim(t), t);
      ren.update(renPose, dt);
    },
    camera() {
      // pushed in a little on her place
      return { z: 1.15, cx: 420, cy: 560, dx: 0, dy: 0 };
    },
    draw(ctx, t) {
      if (!L) return;
      L.room.draw(ctx);
      L.band.draw(ctx);
      // the pool at the end of the stroke, still wet, trembling
      drawBlotPool(ctx, POOL.x, POOL.y, 20 + Math.sin(t * 7) * 0.8, t, 5);
      // her brush on the floor until Ren's brush touches it; then Ren takes it up (the brush swings up)
      const gone = ease(span(t, 1.7, 0.3));
      if (gone < 1) {
        ctx.save();
        ctx.globalAlpha = 1 - gone;
        const up = { x: -6 * gone, y: -14 * gone };
        drawLooseBrush(ctx, { x: LAID.a.x + up.x, y: LAID.a.y + up.y }, { x: LAID.b.x + up.x, y: LAID.b.y + up.y });
        ctx.restore();
      }
      // Ren, head bowed beside the empty place
      drawRenKneeling(ctx, ren, renPose, REN_KNEEL.x, REN_KNEEL.s, 0.13);
      // the lamp dims and goes out; a thread of smoke rises
      const glow = 1 - ease(span(t, 0.8, 2.0));
      drawLampOut(ctx, 1 - glow, span(t, 2.6, 0.4));
      drawAndonGlow(ctx, LAMP_X, FLOOR, glow, t);
      drawSmoke(ctx, LAMP_X, FLOOR - 136, t, span(t, 2.6, 1.4));
    },
    release() {
      L?.room.release();
      L?.band.release();
    },
  };
}

// ───────────────────────────────────────────── P3 "The blot" (board)

const P3_IN = { t0: 1.8, dur: 0.5 };

/**
 * Which stretch of the game's spring backdrop each inside panel shows. The backdrop is anchored to the frame
 * (origin = design x of its world 0), so its ensō sun and its birds land in the same place on every screen: here
 * picked to keep both off each panel's text (the ensō at the top right in P3, where the blot comes in; at the top
 * left in P4 and P5, above the torii). Ranges that keep every strip covering the view: see paintBackdrop.
 */
const BACKDROP = {
  p3: { camX: 10000, origin: 540 },
  p4: { camX: 6000, origin: -480 },
  p5: { camX: 7000, origin: -480 },
};
const STEP_FOOT = { x: BAND.nx0 + 14, y: FLOOR };

function insideLayers(view: View, camX: number, originX: number, seed: number) {
  const x0 = view.x0 - 40;
  const w = view.x1 - view.x0 + 80;
  return new Layer(x0, view.y0 - 10, w, view.y1 - view.y0 + 20, (ctx) => {
    const k = ctx.getTransform().a;
    paintBackdrop(ctx, k, x0, view.y0 - 10, w, view.y1 - view.y0 + 20, camX, 30, originX);
    drawGround(ctx, x0 - 10, x0 + w + 10, FLOOR, seed);
  });
}

/** P3 lasts 4.5 s; the pan into P4 then slides it off to the left */
const P3_DUR = 4.5;
const REN_INSIDE = { x: 260, y: FLOOR };

function p3Scene(lead: CharId): PanelScene {
  let L: ReturnType<typeof lastStrokeLayers> | null = null;
  let inside: Layer | null = null;
  const ren = new Character('ren');
  const fox = new Character('kohaku');
  // Ren lives in its own space (foot at 0, 0) and is placed by draw(), so one figure crosses both framings
  let renPose = kneelPose(0.62, 0);
  let foxPose = pose(0, 0, 'idle', AMBER, AMBER_LIGHT, 0);
  void lead;
  /** where Ren's foot is in the room (design units), and how bowed */
  const roomAt = (t: number) => lerp(REN_KNEEL.x, STEP_FOOT.x, ease(span(t, 1.0, 0.8)));
  return {
    bake(k, view) {
      L = lastStrokeLayers(view);
      inside = insideLayers(view, BACKDROP.p3.camX, BACKDROP.p3.origin, 3);
      return [() => L!.room.bake(k), () => L!.band.bake(k), () => inside!.bake(k)];
    },
    update(t, dt) {
      if (t < 0.6) {
        // still kneeling, then rising: the head comes up and Ren stands
        const rise = ease(span(t, 0.25, 0.35));
        renPose = kneelPose(lerp(0.62, -0.25, rise), t, 1 - rise);
      } else if (t < P3_IN.t0) {
        // a step to the right, onto the first page of the scroll
        const walk = span(t, 1.0, 0.8);
        renPose = pose(0, 0, walk > 0 && walk < 1 ? 'run' : 'idle', INK, INK, t, { phase: walk * 7, aim: -0.25 });
      } else {
        renPose = pose(0, 0, 'idle', INK, INK, t, { aim: -0.35 });
      }
      ren.update(renPose, dt);
      foxPose = pose(0, 0, 'idle', AMBER, AMBER_LIGHT, t, { vy: t > 0.9 && t < 1.05 ? -1400 : 0 });
      fox.update(foxPose, dt);
    },
    draw(ctx, t, view) {
      if (!L || !inside) return;
      const u = span(t, P3_IN.t0, P3_IN.dur);
      const fade = ease(u);
      // the room goes a little faster than the world arrives, so the two never sit on each other for long
      const outA = 1 - ease(Math.min(1, u * 2));
      const zo = 1.15 * lerp(1, 1.6, fade);
      const zi = lerp(0.85, 1, fade);
      if (outA > 0) {
        // inside the room: the pool spreads along the fibres, soaking the little world black
        ctx.save();
        ctx.globalAlpha = outA;
        ctx.translate(STEP_FOOT.x, STEP_FOOT.y);
        ctx.scale(zo, zo);
        ctx.translate(-STEP_FOOT.x, -STEP_FOOT.y);
        L.room.draw(ctx);
        // the lamp went out at the end of P2
        drawLampOut(ctx, 1, 1);
        L.band.draw(ctx);
        ctx.save();
        bandPath(ctx, BAND);
        ctx.clip();
        const R = 20 + 300 * ease(span(t, 0.15, 1.7));
        drawBlotPool(ctx, POOL.x, POOL.y - 8, R, t, 5, 0.36);
        ctx.restore();
        // the painted fox's ears prick up
        ctx.save();
        ctx.translate(FOX_AT.x, FOX_AT.y - (t > 0.9 && t < 1.15 ? 3 : 0));
        ctx.scale(FOX_AT.s, FOX_AT.s);
        fox.draw(ctx, foxPose);
        ctx.restore();
        // the cushion Ren rose from stays in the room
        if (t >= 0.6) drawRenCushion(ctx, REN_KNEEL.x, REN_KNEEL.s);
        ctx.restore();
      }
      if (fade > 0) {
        // inside the scroll, at full scale: the spring hills, and the blot coming from the right
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(REN_INSIDE.x, REN_INSIDE.y);
        ctx.scale(zi, zi);
        ctx.translate(-REN_INSIDE.x, -REN_INSIDE.y);
        inside.draw(ctx);
        ctx.restore();
      }
      // Ren, once: in the room's framing, then carried across to the world's (position and scale interpolated)
      const roomX = STEP_FOOT.x + (roomAt(t) - STEP_FOOT.x) * zo;
      const x = lerp(roomX, REN_INSIDE.x, fade);
      const sc = lerp(zo * REN_KNEEL.s, zi, fade);
      if (t < 0.6) {
        ctx.save();
        ctx.translate(STEP_FOOT.x, STEP_FOOT.y);
        ctx.scale(zo, zo);
        ctx.translate(-STEP_FOOT.x, -STEP_FOOT.y);
        drawRenKneeling(ctx, ren, renPose, roomAt(t), REN_KNEEL.s, 0.13 * (1 - ease(span(t, 0.2, 0.3))));
        ctx.restore();
      } else {
        ctx.save();
        ctx.translate(x, FLOOR);
        ctx.scale(sc, sc);
        ren.draw(ctx, renPose);
        ctx.restore();
      }
      if (fade > 0) {
        const w = span(t, 2.0, 2.5);
        // uneven pulses: slow, a sudden reaching, slow again
        const adv = w < 0.45 ? w * 0.5 : w < 0.6 ? 0.225 + (w - 0.45) * 3.2 : 0.705 + (w - 0.6) * 0.6;
        const front = lerp(view.sheetX1 - 20, Math.min(980, view.sheetX1 - 300), adv);
        // as the pan carries this sheet away, the wall's far side draws in to its own bleed edge, so the sheet's
        // joint never cuts solid black
        const back = view.sheetX1 + 60 - 150 * ease(span(t, P3_DUR - 0.25, 0.5));
        ctx.save();
        ctx.globalAlpha = fade;
        drawBlotWall(ctx, (y) => front + Math.pow(Math.max(0, (FLOOR - y) / 600), 2) * 140, view.y0 - 20, view.y1 + 20, () => back, t, 9);
        ctx.restore();
      }
    },
    release() {
      L?.room.release();
      L?.band.release();
      inside?.release();
    },
  };
}

// ───────────────────────────────────────────── P4 "The apprentice" (board)

/** a figure scaled about its own foot point */
export function drawAt(ctx: CanvasRenderingContext2D, c: Character, p: Pose, s: number) {
  if (s === 1) return c.draw(ctx, p);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(s, s);
  ctx.translate(-p.x, -p.y);
  c.draw(ctx, p);
  ctx.restore();
}

/** Both travelers, by the lead rule (docs/story.md, section 7): the other one behind and a little smaller (0.92). */
export function drawPair(ctx: CanvasRenderingContext2D, lead: CharId, ren: Character, renPose: Pose, fox: Character, foxPose: Pose) {
  const OTHER = 0.92;
  if (lead === 'kohaku') {
    drawAt(ctx, ren, renPose, OTHER);
    drawAt(ctx, fox, foxPose, 1);
  } else {
    drawAt(ctx, fox, foxPose, OTHER);
    drawAt(ctx, ren, renPose, 1);
  }
}

const STONES: { kind: InkKind; x: number; y: number; at: number }[] = [
  { kind: 'shu', x: 528, y: 636, at: 0.9 },
  { kind: 'ai', x: 600, y: 650, at: 1.3 },
  { kind: 'kin', x: 672, y: 636, at: 1.7 },
];
const TORII_AT = { x: 250, s: 0.62 };
const FOX_SEAT = { x: 352, y: FLOOR };
const LEAP = { t0: 2.3, dur: 0.7 };
const P4_DUR = 4.0;

function p4Scene(lead: CharId): PanelScene {
  let inside: Layer | null = null;
  const ren = new Character('ren');
  const fox = new Character('kohaku');
  const sparks = new Particles();
  let renPose = pose(600, FLOOR, 'idle', INK, INK, 0);
  let foxPose = pose(FOX_SEAT.x, FOX_SEAT.y, 'idle', AMBER, AMBER_LIGHT, 0);
  const landX = lead === 'kohaku' ? 662 : 540;
  const lit = new Set<number>();
  return {
    bake(k, view) {
      inside = new Layer(view.x0 - 40, view.y0 - 10, view.x1 - view.x0 + 80, view.y1 - view.y0 + 20, (ctx) => {
        const x0 = view.x0 - 40;
        const w = view.x1 - view.x0 + 80;
        paintBackdrop(ctx, k, x0, view.y0 - 10, w, view.y1 - view.y0 + 20, BACKDROP.p4.camX, 30, BACKDROP.p4.origin);
        drawGround(ctx, x0 - 10, x0 + w + 10, FLOOR, 4);
      });
      return [() => inside!.bake(k)];
    },
    update(t, dt) {
      // Ren raises the master's brush; the scarf takes vermilion with the first stone
      const raise = ease(span(t, 0.3, 0.6));
      const red = t >= STONES[0].at;
      renPose = pose(600, FLOOR, 'idle', red ? INKS.shu.color : INK, red ? INKS.shu.light : INK, t, { aim: lerp(-0.4, -1.35, raise) });
      ren.update({ ...renPose, state: red ? 'run' : 'idle' }, dt);
      // Kohaku wakes (a shake), then leaps down from its painted place in an arc, left to right, and lands
      const lu = span(t, LEAP.t0, LEAP.dur);
      if (lu <= 0) {
        const shake = t > 1.9 && t < 2.2;
        foxPose = pose(FOX_SEAT.x, FOX_SEAT.y - (shake ? Math.abs(Math.sin(t * 40)) * 3 : 0), 'idle', AMBER, AMBER_LIGHT, t, { vy: shake ? -1200 : 0 });
      } else if (lu < 1) {
        const x = lerp(FOX_SEAT.x, landX, lu);
        const y = FOX_SEAT.y - Math.sin(lu * Math.PI) * 130;
        foxPose = pose(x, y, 'air', AMBER, AMBER_LIGHT, t, { vy: Math.cos(lu * Math.PI) * -900 });
      } else {
        foxPose = pose(landX, FLOOR, 'idle', AMBER, AMBER_LIGHT, t);
      }
      fox.update(foxPose, dt);
      STONES.forEach((s, i) => {
        if (t >= s.at && !lit.has(i)) {
          lit.add(i);
          sparks.burst('paint', s.x, s.y, 14, 160, 0.6, 3, INKS[s.kind].color, 120);
        }
      });
      sparks.update(dt);
    },
    draw(ctx, t, view) {
      inside?.draw(ctx);
      // the blot, small and far, still bleeding at the right edge
      // (as the pan to P5 carries the sheet away, its far side draws in to a bleed edge, as in P3)
      const pull = ease(span(t, P4_DUR - 0.15, 0.45));
      const left = Math.max(1180, view.sheetX1 - 60) - 60 * pull;
      const back = view.sheetX1 + 60 - 100 * pull;
      drawBlotWall(ctx, (y) => left + Math.pow(Math.max(0, (FLOOR - y) / 500), 2) * 60, view.y0 - 20, FLOOR + 40, () => back, t, 19);
      // the shrine gate of the first page: the first thing Ren gives colour back to
      ctx.save();
      ctx.translate(TORII_AT.x, FLOOR);
      ctx.scale(TORII_AT.s, TORII_AT.s);
      drawTorii(ctx, 0, 0, ease(span(t, 0.95, 0.7)));
      ctx.restore();
      drawPair(ctx, lead, ren, renPose, fox, foxPose);
      for (const s of STONES) drawInkStoneDisc(ctx, s.kind, s.x, s.y, 22, ease(span(t, s.at, 0.25)));
      sparks.draw(ctx);
    },
    release() {
      inside?.release();
    },
  };
}

// ───────────────────────────────────────────── P5 "Setting out" (board)

const RUN_SPEED = 300;
const PULL = { t0: 2.1, dur: 1.15 };

function p5Scene(lead: CharId): PanelScene {
  let hills: Layer | null = null;
  let ground: Layer | null = null;
  const ren = new Character('ren');
  const fox = new Character('kohaku');
  const xs = { lead: 590, other: 505 };
  let renPose = pose(0, FLOOR, 'run', INKS.shu.color, INKS.shu.light, 0);
  let foxPose = pose(0, FLOOR, 'run', AMBER, AMBER_LIGHT, 0);
  let phase = 0;
  return {
    bake(k, view) {
      const x0 = view.x0 - 60;
      const w = view.x1 - view.x0 + 60 + RUN_SPEED * 4;
      hills = new Layer(x0, view.y0 - 10, view.x1 - view.x0 + 400, view.y1 - view.y0 + 20, (ctx) =>
        paintBackdrop(ctx, k, x0, view.y0 - 10, view.x1 - view.x0 + 400, view.y1 - view.y0 + 20, BACKDROP.p5.camX, 30, BACKDROP.p5.origin),
      );
      ground = new Layer(x0, FLOOR - 40, w, view.y1 - FLOOR + 50, (ctx) => {
        drawGround(ctx, x0 - 10, x0 + w + 10, FLOOR, 8);
        // the torii they leave behind, in vermilion now
        ctx.save();
        ctx.translate(200, FLOOR);
        ctx.scale(0.5, 0.5);
        drawTorii(ctx, 0, 0, 1);
        ctx.restore();
      });
      return [() => hills!.bake(k), () => ground!.bake(k)];
    },
    update(t, dt) {
      phase += dt * 19;
      const rx = lead === 'ren' ? xs.lead : xs.other;
      const fx = lead === 'kohaku' ? xs.lead : xs.other;
      renPose = pose(rx, FLOOR, 'run', INKS.shu.color, INKS.shu.light, t, { phase });
      foxPose = pose(fx, FLOOR, 'run', AMBER, AMBER_LIGHT, t, { phase: phase * 1.08 + 1 });
      ren.update(renPose, dt);
      fox.update(foxPose, dt);
    },
    camera(t) {
      // the camera pulls back: the picture becomes a small painting on the paper, and the map takes over
      return pullCamera(ease(span(t, PULL.t0, PULL.dur)));
    },
    draw(ctx, t, view) {
      const u = ease(span(t, PULL.t0, PULL.dur));
      ctx.save();
      clipPull(ctx, view, u);
      const run = t * RUN_SPEED;
      if (hills) {
        ctx.save();
        ctx.translate(-run * 0.12, 0);
        hills.draw(ctx);
        ctx.restore();
      }
      // the blot, a dark smudge on the far right horizon
      ctx.save();
      ctx.globalAlpha = 0.5;
      drawBlotPool(ctx, 1150 - run * 0.05, 520, 52, t, 7, 0.16);
      ctx.restore();
      if (ground) {
        ctx.save();
        ctx.translate(-run, 0);
        ground.draw(ctx);
        ctx.restore();
      }
      drawPair(ctx, lead, ren, renPose, fox, foxPose);
      featherPull(ctx, view, u);
      ctx.restore();
    },
    release() {
      hills?.release();
      ground?.release();
    },
  };
}


// ───────────────────────────────────────────── the prologue

const P1: PanelDef = {
  id: 'p1',
  title: 'The painter',
  dur: 5.0,
  quality: 'final',
  text: { kanji: '絵巻', line: 'Master Usuzumi painted the world on one long scroll.', x: 760, y: 230, at: 0.9 },
  cues: [
    { t: 1.0, run: (a) => a.motif(1) },
    { t: 1.6, run: (a) => a.audio?.brush(2400) },
    { t: 2.3, run: (a) => a.motif(2) },
    { t: 3.1, run: (a) => a.audio?.brush(0) },
  ],
  create: () => p1Scene(),
};

const P2: PanelDef = {
  id: 'p2',
  title: 'The last stroke',
  dur: 4.0,
  quality: 'board',
  text: { line: 'She died before the last stroke.', x: 640, y: 200, at: 0.5 },
  cues: [
    { t: 0.5, run: (a) => a.motif(3) },
    { t: 1.9, run: (a) => a.audio?.fx('bell') },
  ],
  create: () => p2Scene(),
};

const P3: PanelDef = {
  id: 'p3',
  title: 'The blot',
  dur: 4.5,
  quality: 'board',
  text: { kanji: '墨染', line: 'Her last stroke began to run, soaking the world black.', x: 470, y: 220, at: 0.4 },
  cues: [
    { t: 0.3, run: (a) => a.audio?.fx('hiss') },
    { t: 0.9, run: (a) => a.audio?.fx('splash') },
    { t: 1.6, run: (a) => a.audio?.brush(1600) },
    { t: 1.9, run: (a) => a.audio?.brush(0) },
    { t: 2.9, run: (a) => a.audio?.fx('hiss') },
  ],
  create: (lead) => p3Scene(lead),
};

const P4: PanelDef = {
  id: 'p4',
  title: 'The apprentice',
  dur: 4.0,
  quality: 'board',
  text: { line: 'Her last apprentice took up her colors.', x: 640, y: 190, at: 0.4 },
  // three koto notes rising, one per stone: scale degrees 12, 13, 15 (Audio.fx('note'): base + round((1 - h) * 6))
  cues: [
    { t: STONES[0].at, run: (a) => a.audio?.fx('note', 'shu:0.5:0.7') },
    { t: STONES[1].at, run: (a) => a.audio?.fx('note', 'ai:0:0.7') },
    { t: STONES[2].at, run: (a) => a.audio?.fx('note', 'kin:0.5:0.7') },
    { t: LEAP.t0, run: (a) => a.audio?.fx('double') },
  ],
  create: (lead) => p4Scene(lead),
};

const P5: PanelDef = {
  id: 'p5',
  title: 'Setting out',
  dur: 3.5,
  quality: 'board',
  text: { line: 'Together, they set out to finish it.', x: 640, y: 200, at: 0.4, fadeAt: PULL.t0 + 0.4 },
  cues: [{ t: 0.4, run: (a) => a.audio?.fx('taiko') }],
  create: (lead) => p5Scene(lead),
};

/** The prologue (docs/story.md, section 8): five panels, 21.0 s. */
export const PROLOGUE: CutsceneDef = {
  id: 'prologue',
  title: 'The Unfinished Scroll: prologue',
  panels: [P1, P2, P3, P4, P5],
  outro: 'map',
  // the spring hills of P3 to P5 come from the game's own Backdrop; build it before the paper unrolls
  prepare: (k) => void springBackdrop(k),
};
