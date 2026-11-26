/**
 * The Summer ending (docs/story.md, section 9): four panels, 20.0 s, at storyboard quality with the final text and
 * timing. E1 the storm rolls on, E2 the lanterns are sent off, E3 she leaves the purple, E4 onward, into the map.
 *
 * Boards: every beat the story names is on screen and readable at phone size, drawn simply. Reuses the gate's
 * Raijin (RaijinArt, clean and grinning), the shared Character renderer for both travelers (the lead rule from
 * section 7), the lantern palette of lanternGlow, the prologue's kneel fallback and its ink stones. What is still
 * a stand-in is listed in the panel comments (ripples and rain are drawn here, not by the shared weather renderer;
 * the master's standing figure is a board figure).
 */
import { INK, INKS, PAPER, type CharId } from '../config';
import type { Vec } from '../math';
import { brushLine, polyPath, rgba } from '../render/brush';
import { Character, CHAR_SCALE, type Pose } from '../render/characters';
import { drawDecor } from '../render/decor';
import { RaijinArt, type RaijinLook } from '../render/raijin';
import { mulberry32 } from '../rng';
import { AMBER, AMBER_LIGHT, drawInkStoneDisc, within } from './figures';
import { clipPull, featherPull, pullCamera } from './handover';
import { Layer, span } from './layers';
import { drawAt, drawRenKneeling, ease, FLOOR, kneelPose, lerp, pose } from './prologue';
import { drawGround, miniRange } from './scene';
import { LINE_PX } from './text';
import type { CutsceneDef, PanelDef, PanelScene, PanelText, View } from './types';

const TAU = Math.PI * 2;
const SHU = INKS.shu;
const MURA = INKS.murasaki;
/** the lead rule (docs/story.md, section 7): the other traveler is a step behind and a little smaller */
const OTHER = 0.92;

// ───────────────────────────────────────────── shared pieces

/** Warm lamp light, exactly lanternGlow's palette (src/render/decor.ts), scaled to a small paper lantern. */
const GLOW = { wash: '236,160,40', core: '255,200,80', hot: '255,240,190', bloom: '255,196,110' };

/**
 * A night wash over the panel: deep at the top, lifting toward a horizon, with soft "lifts" (destination-out) where
 * the brush text sits so the ink letters still read, and around lamps. Painted once into a layer.
 */
interface Lift {
  x: number;
  y: number;
  rx: number;
  ry: number;
  a: number;
}

/**
 * The lift under a panel's brush text, shaped to the text block (about 1.3 times it): a row of small overlapping
 * soft blobs along the English line and one round the kanji, each jittered, so the edge is feathered and uneven
 * like paper the night wash missed, never a plate or a spotlight. The line's width is estimated from its length
 * (the serif italic runs about 0.45 em a character), since panels paint before the fonts are guaranteed in.
 */
function textLift(t: PanelText, seed: number): Lift[] {
  const r = mulberry32(seed);
  const lineW = t.line.length * LINE_PX * 0.45;
  // the line's visual middle: its baseline (+18 under a kanji, as text.ts sets it) less half the x-height
  const lineY = t.y + (t.kanji ? 18 : 0) - 9;
  const out: Lift[] = [];
  const n = Math.max(3, Math.round(lineW / 90));
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    out.push({
      x: t.x - lineW * 0.46 + lineW * 0.92 * u + (r() - 0.5) * 26,
      y: lineY + (r() - 0.5) * 12,
      rx: 80 + r() * 40,
      ry: 40 + r() * 14,
      a: 0.5 + r() * 0.1,
    });
  }
  if (t.kanji) {
    // the kanji: baseline 36 above y, about 110 tall
    out.push({ x: t.x + (r() - 0.5) * 12, y: t.y - 86, rx: 88 + r() * 12, ry: 76 + r() * 8, a: 0.55 });
    out.push({ x: t.x - 30 + r() * 20, y: t.y - 120, rx: 54, ry: 40, a: 0.22 });
    out.push({ x: t.x + 20 + (r() - 0.5) * 30, y: t.y - 42, rx: 70 + r() * 20, ry: 42, a: 0.32 });
  }
  return out;
}

function paintNight(
  ctx: CanvasRenderingContext2D,
  v: View,
  o: { top: number; mid: number; low: number; horizon: number; lifts: Lift[]; seed: number },
) {
  const x0 = v.x0 - 40;
  const x1 = v.x1 + 40;
  const y0 = v.y0 - 10;
  const y1 = v.y1 + 10;
  const k = v.k;
  const c = document.createElement('canvas');
  c.width = Math.ceil((x1 - x0) * k);
  c.height = Math.ceil((y1 - y0) * k);
  const w = c.getContext('2d')!;
  w.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
  const g = w.createLinearGradient(0, y0, 0, y1);
  const hz = Math.max(0.05, Math.min(0.95, (o.horizon - y0) / (y1 - y0)));
  g.addColorStop(0, rgba(INK, o.top));
  g.addColorStop(hz, rgba(INK, o.mid));
  g.addColorStop(1, rgba(INK, o.low));
  w.fillStyle = g;
  w.fillRect(x0, y0, x1 - x0, y1 - y0);
  // uneven horizontal washes, like a wet brush dragged across the dark
  const r = mulberry32(o.seed);
  for (let i = 0; i < 5; i++) {
    const y = y0 + 20 + i * 70 + r() * 40;
    brushLine(w, [{ x: x0 - 50, y }, { x: (x0 + x1) / 2, y: y + (r() - 0.5) * 24 }, { x: x1 + 50, y: y + (r() - 0.5) * 24 }], r, {
      w: 60 + r() * 50,
      alpha: 0.04 + r() * 0.04,
      taperIn: 300,
      taperOut: 400,
      wobble: 0.25,
    });
  }
  w.globalCompositeOperation = 'destination-out';
  for (const l of o.lifts) {
    w.save();
    w.translate(l.x, l.y);
    w.scale(1, l.ry / l.rx);
    const lg = w.createRadialGradient(0, 0, 0, 0, 0, l.rx);
    lg.addColorStop(0, `rgba(0,0,0,${l.a})`);
    lg.addColorStop(0.35, `rgba(0,0,0,${l.a * 0.85})`);
    lg.addColorStop(0.7, `rgba(0,0,0,${l.a * 0.35})`);
    lg.addColorStop(1, 'rgba(0,0,0,0)');
    w.fillStyle = lg;
    w.fillRect(-l.rx, -l.rx, l.rx * 2, l.rx * 2);
    w.restore();
  }
  ctx.drawImage(c, x0, y0, x1 - x0, y1 - y0);
  c.width = c.height = 0;
}

/** Long horizontal dry-brush water lines between y0 and y1 (denser and darker toward the bottom). */
function waterLines(ctx: CanvasRenderingContext2D, x0: number, x1: number, y0: number, y1: number, seed: number, alpha: number) {
  const r = mulberry32(seed);
  const n = Math.round((y1 - y0) / 14);
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const y = y0 + Math.pow(u, 1.3) * (y1 - y0) + (r() - 0.5) * 6;
    let x = x0 + r() * 200 - 100;
    while (x < x1) {
      const len = 80 + r() * 320;
      if (r() < 0.7) {
        brushLine(ctx, [{ x, y }, { x: x + len * 0.5, y: y + (r() - 0.5) * 2 }, { x: x + len, y: y + (r() - 0.5) * 2 }], r, {
          w: 1 + r() * 2.2 * (0.5 + u),
          alpha: alpha * (0.4 + 0.6 * u) * (0.5 + r() * 0.5),
          taperIn: 30,
          taperOut: 40,
          bristles: 2,
          dry: 0.8,
        });
      }
      x += len + 30 + r() * 140;
    }
  }
}

/** A ring spreading on the water: an ellipse growing from r0 and fading (u = 0..1 through its life). */
function ripple(ctx: CanvasRenderingContext2D, x: number, y: number, u: number, R: number, color = INK, a = 0.45) {
  if (u <= 0 || u >= 1) return;
  const rr = 3 + R * Math.sqrt(u);
  ctx.save();
  ctx.strokeStyle = color.startsWith('#') ? rgba(color, a * (1 - u)) : color;
  ctx.lineWidth = 1.6 * (1 - u * 0.5);
  ctx.beginPath();
  ctx.ellipse(x, y, rr, rr * 0.2, 0, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

/**
 * A small floating paper lantern (tōrō) on the water: a little wooden base, a square paper box, plain and without
 * writing (docs/story.md, E2 sensitivity), lit warm from inside, with a shimmering reflection smear below.
 * (x, y) is where it sits on the water; `light` 0..1; `s` its scale.
 */
function floatLantern(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, light: number, t: number, seed: number, reflect = true) {
  const flick = 0.85 + 0.15 * Math.sin(t * 9 + seed) * Math.sin(t * 5.3 + seed * 0.7);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  if (light > 0 && reflect) {
    // the reflection: a warm vertical smear broken into shimmering slices
    for (let i = 0; i < 6; i++) {
      const yy = 4 + i * 7;
      const off = Math.sin(t * 3 + i * 1.7 + seed) * 2.5;
      ctx.fillStyle = `rgba(${GLOW.core},${0.32 * light * (1 - i / 6) * flick})`;
      ctx.fillRect(-7 + off, yy, 14 - i, 3);
    }
  }
  // the glow on the dark water (light, not tint)
  if (light > 0) {
    ctx.globalCompositeOperation = 'screen';
    const g = ctx.createRadialGradient(0, -12, 2, 0, -12, 46);
    g.addColorStop(0, `rgba(${GLOW.bloom},${0.55 * light * flick})`);
    g.addColorStop(1, `rgba(${GLOW.bloom},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(-46, -58, 92, 92);
    ctx.globalCompositeOperation = 'source-over';
  }
  // the wooden base
  ctx.fillStyle = rgba(INK, 0.85);
  ctx.fillRect(-11, -3, 22, 4);
  // the paper box
  ctx.fillStyle = light > 0 ? `rgba(${GLOW.core},${0.55 + 0.4 * light})` : rgba(PAPER, 0.9);
  ctx.fillRect(-8, -21, 16, 18);
  if (light > 0) {
    ctx.fillStyle = `rgba(${GLOW.hot},${0.85 * light * flick})`;
    ctx.fillRect(-4, -16, 8, 10);
  }
  // its frame: four thin ink lines
  ctx.strokeStyle = rgba(INK, 0.8);
  ctx.lineWidth = 1.3;
  ctx.strokeRect(-8, -21, 16, 18);
  ctx.beginPath();
  ctx.moveTo(-10, -21);
  ctx.lineTo(10, -21);
  ctx.stroke();
  ctx.restore();
}

/**
 * The near bank's face below its lip, as earth: a wash a shade darker than the water beside it, so the land reads by
 * tone (under the night it stays darker than the water), bounded on the right by the edge from `lip` down to `foot`.
 * The edge's ink stroke stops just below the lip, at the waterline, so it never reads as a pole standing in the water.
 */
function bankFace(ctx: CanvasRenderingContext2D, xLeft: number, lip: Vec, foot: Vec, r: () => number, stroke = true) {
  const g = ctx.createLinearGradient(0, lip.y, 0, foot.y);
  g.addColorStop(0, rgba(INK, 0.1));
  g.addColorStop(0.25, rgba(INK, 0.2));
  g.addColorStop(1, rgba(INK, 0.3));
  ctx.fillStyle = g;
  polyPath(ctx, [
    { x: xLeft, y: lip.y + 5 },
    { x: lip.x - 2, y: lip.y + 5 },
    { x: foot.x, y: foot.y },
    { x: xLeft, y: foot.y },
  ]);
  ctx.fill();
  if (!stroke) return;
  const k = 46 / Math.max(1, foot.y - lip.y);
  const end = { x: lip.x + (foot.x - lip.x) * k, y: lip.y + 46 };
  brushLine(ctx, [lip, { x: (lip.x + end.x) / 2 + 2, y: (lip.y + end.y) / 2 }, end], r, { w: 3, alpha: 0.35, taperIn: 4, taperOut: 26, bristles: 4, dry: 0.8 });
  // the water lapping at the foot of that stroke
  brushLine(ctx, [{ x: end.x - 4, y: end.y + 2 }, { x: end.x + 40, y: end.y + 1 }], r, { w: 1.4, color: PAPER, alpha: 0.2, taperIn: 10, taperOut: 20 });
}

/**
 * One of the people on the far bank at tōrō nagashi: kneeling in profile, bent low toward the water with both arms
 * reaching down, and the lantern they have just set on the water lit in front of their hands (facing `dir`: 1 right).
 */
function farKneeler(ctx: CanvasRenderingContext2D, x: number, y: number, dir: 1 | -1, seed: number) {
  const s = 1.15;
  const r = mulberry32(900 + seed);
  const lean = (r() - 0.5) * 0.12;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir * s, s);
  ctx.rotate(lean);
  ctx.fillStyle = INK;
  // folded legs, heels under the seat
  polyPath(ctx, [
    { x: -9, y: 0.5 },
    { x: 6, y: 0.5 },
    { x: 5, y: -5 },
    { x: -4, y: -8 },
    { x: -9, y: -5 },
  ]);
  ctx.fill();
  // the back, bent forward from the hips
  polyPath(ctx, [
    { x: -8, y: -6 },
    { x: -6, y: -14 },
    { x: 1, y: -20 },
    { x: 8, y: -19 },
    { x: 9, y: -14 },
    { x: 2, y: -6 },
  ]);
  ctx.fill();
  // the head, bowed over the water
  ctx.beginPath();
  ctx.ellipse(11.5, -17.5, 3.6, 3.3, 0.3, 0, TAU);
  ctx.fill();
  ctx.restore();
  // both arms reaching down to the water's edge, to the lantern
  const hx = x + dir * 15 * s;
  const hy = y + 4;
  for (const o of [0, 2.2]) {
    brushLine(ctx, [{ x: x + dir * (6 + o) * s, y: y - 16 * s }, { x: x + dir * (12 + o) * s, y: y - 7 * s }, { x: hx + dir * o, y: hy }], r, {
      w: 1.8,
      taperIn: 1,
      taperOut: 2,
    });
  }
  floatLantern(ctx, hx + dir * 5, y + 15, 0.5, 0.9, seed * 1.3, seed, true);
}

/** Ren's brush hand in the world, as Character draws it (shoulder, arm, then the brush along `aim`). */
function renHand(x: number, y: number, s: number, aim: number, bow = 0, yOff = 0): { hand: Vec; ang: number } {
  const lean = 0.03;
  const ang = aim - lean;
  const sh = { x: 3, y: -35 };
  const h = { x: sh.x + Math.cos(ang * 0.6 + 0.5) * 11, y: sh.y + Math.sin(ang * 0.6 + 0.5) * 11 };
  // Character rotates by `lean` after scaling by CHAR_SCALE about the feet
  const rot = (p: Vec, a: number) => ({ x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) });
  let p = rot(h, lean);
  p = { x: p.x * CHAR_SCALE, y: p.y * CHAR_SCALE + yOff };
  p = rot(p, bow);
  return { hand: { x: x + p.x * s, y: y + p.y * s }, ang: ang + lean + bow };
}

/** The purple ink stick: a small plain stick, the only solid purple in E3 until the stone fills. */
function drawInkStick(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, a = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.globalAlpha *= a;
  ctx.shadowColor = rgba(MURA.light, 0.8);
  ctx.shadowBlur = 8 * ctx.getTransform().a;
  ctx.fillStyle = MURA.color;
  ctx.fillRect(-9, -2.6, 18, 5.2);
  ctx.shadowBlur = 0;
  ctx.fillStyle = MURA.dark;
  ctx.fillRect(-9, -2.6, 3, 5.2);
  ctx.fillStyle = rgba(MURA.light, 0.6);
  ctx.fillRect(-5, -2, 12, 1.2);
  ctx.restore();
}

/**
 * The row of ink stones in front of Ren (as in prologue P4), with the fourth, purple, drawn as the lent stone
 * (purple outline, pale wash body) until it fills (0..1) to solid purple.
 */
function drawStoneRow(ctx: CanvasRenderingContext2D, cx: number, y: number, appear: number, fill: number) {
  if (appear <= 0) return;
  ctx.save();
  ctx.globalAlpha = appear;
  const kinds = ['shu', 'ai', 'kin'] as const;
  const R = 20;
  const gap = 58;
  const x0 = cx - gap * 1.5;
  kinds.forEach((kd, i) => drawInkStoneDisc(ctx, kd, x0 + i * gap, y + (i % 2) * 8, R, 1));
  const px = x0 + 3 * gap;
  const py = y + 8;
  // the lent stone: a pale wash inside a purple outline
  ctx.fillStyle = rgba(PAPER, 0.55);
  ctx.beginPath();
  ctx.arc(px, py, R, 0, TAU);
  ctx.fill();
  ctx.fillStyle = rgba(MURA.light, 0.22);
  ctx.fill();
  ctx.strokeStyle = MURA.color;
  ctx.lineWidth = 2.4;
  ctx.stroke();
  ctx.restore();
  // ...then filling with her purple
  if (fill > 0) {
    ctx.save();
    ctx.globalAlpha = appear;
    ctx.beginPath();
    ctx.rect(px - R - 4, py + R + 4 - (R * 2 + 8) * fill, R * 2 + 8, (R * 2 + 8) * fill);
    ctx.clip();
    drawInkStoneDisc(ctx, 'murasaki', px, py, R, 1);
    ctx.restore();
  }
}

// ───────────────────────────────────────────── Master Usuzumi, standing, in pale wash (E3, board)

export interface GhostLook {
  /** 0 facing right, away (toward the lantern), 1 head turned back over her shoulder toward Ren */
  turn: number;
  /** her near hand, in her own frame (feet at 0, 0); null rests it at the sleeve cord */
  hand: Vec | null;
  /** body lean about the feet (radians, negative leans back toward Ren) */
  lean: number;
  /** 0 standing .. 1 sunk down (knees bent under the robe) to reach the stone */
  crouch: number;
  /** the ink stick is in her hand */
  stick: boolean;
}

/**
 * Her wash: the prologue's figure (figures.ts drawMasterBody: a dark plain work robe, the sleeves tied back by a
 * pale cord, bare forearms, white hair in a low knot) painted thinner, INK at about 0.2 to 0.28 alpha
 * (docs/story.md, section 2), with a thin, unblurred purple edge. Never white-robed, never glowing.
 */
const WASH = rgba(INK, 0.24);
/** the obi and the bunched sleeve: the same wash, laid twice */
const WASH_DEEP = rgba(INK, 0.3);
/** her hair, face, forearm and feet: bare paper in the prologue, here only the faintest wash */
const BARE = rgba(INK, 0.07);
/** a contour in thin ink */
const LINE = rgba(INK, 0.5);
/** the thin purple edge (rim light): unblurred, about 1 to 1.5 px on screen */
const RIM = rgba(MURA.color, 0.8);
const RIM_W = 1.1;
/** the pale tasuki cord across her back, as in the prologue */
const CORD = rgba(PAPER, 0.62);
const GHOST_BOX = { x: -110, y: -205, w: 210, h: 222 };
const G_SHOULDER: Vec = { x: -16, y: -132 };
/** her hand at rest, at the sleeve cord by the obi */
const G_REST: Vec = { x: -14, y: -97 };
/** her arm's full reach (two bones of half this) */
const G_REACH = 84;
/** how far she sinks at a full crouch */
const G_SINK = 38;

/** a point of her body in her standing frame, moved down as she crouches (more the higher it is: the robe folds) */
export function sink(p: Vec, crouch: number): Vec {
  return { x: p.x, y: p.y + G_SINK * crouch * Math.min(1, Math.max(0, (-p.y - 7) / 140)) };
}

/**
 * Master Usuzumi as she returns with the lanterns: her prologue self in pale wash with a thin purple edge,
 * three-quarters from behind, facing right. Feet always drawn and on the stone (docs/story.md: never the yūrei sign).
 * She is painted whole into a scratch canvas each frame and laid down with one alpha, so her fade is even over the
 * whole figure.
 */
export class MasterGhost {
  private c: HTMLCanvasElement | null = null;
  private k = 0;

  private ensure(k: number) {
    if (this.c && this.k === k) return this.c;
    this.c ??= document.createElement('canvas');
    this.k = k;
    this.c.width = Math.ceil(GHOST_BOX.w * k);
    this.c.height = Math.ceil(GHOST_BOX.h * k);
    return this.c;
  }

  release() {
    if (this.c) this.c.width = this.c.height = 0;
    this.c = null;
  }

  /** draw her with her feet at (x, y), scale s, whole-figure alpha a */
  draw(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, look: GhostLook, a: number, k: number) {
    if (a <= 0.003) return;
    const ks = k * s;
    const c = this.ensure(ks);
    const g = c.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    g.setTransform(ks, 0, 0, ks, -GHOST_BOX.x * ks, -GHOST_BOX.y * ks);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    paintGhost(g, look);
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.drawImage(c, x + GHOST_BOX.x * s, y + GHOST_BOX.y * s, GHOST_BOX.w * s, GHOST_BOX.h * s);
    ctx.restore();
  }

  /** where her hand is in the world for a hand point in her frame (to hand the stick over to the scene) */
  static toWorld(x: number, y: number, s: number, lean: number, p: Vec): Vec {
    const q = rotAbout(p, { x: 0, y: -8 }, lean);
    return { x: x + q.x * s, y: y + q.y * s };
  }
}

function rotAbout(p: Vec, o: Vec, a: number): Vec {
  const dx = p.x - o.x;
  const dy = p.y - o.y;
  return { x: o.x + dx * Math.cos(a) - dy * Math.sin(a), y: o.y + dx * Math.sin(a) + dy * Math.cos(a) };
}

/** fill a shape in wash, its edge bleeding a little (a wider, fainter pass), then the thin purple edge */
function washed(g: CanvasRenderingContext2D, pts: Vec[], fill: string, rim = true) {
  polyPath(g, pts);
  g.strokeStyle = rgba(INK, 0.06);
  g.lineWidth = 4;
  g.stroke();
  g.fillStyle = fill;
  g.fill();
  if (!rim) return;
  g.strokeStyle = RIM;
  g.lineWidth = RIM_W;
  g.stroke();
}

function smooth(pts: Vec[], n = 6): Vec[] {
  // a closed Chaikin smoothing pass, for soft robe contours
  let p = pts;
  for (let it = 0; it < 2; it++) {
    const out: Vec[] = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i];
      const b = p[(i + 1) % p.length];
      out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    p = out;
  }
  return n ? p : pts;
}

function paintGhost(g: CanvasRenderingContext2D, L: GhostLook) {
  // feet first, planted on the stone: they never lean, and never fade before the rest. A contact shadow under them
  // says she stands on something solid.
  g.save();
  g.fillStyle = rgba(INK, 0.22);
  g.beginPath();
  g.ellipse(1, 0.5, 30, 3.2, 0, 0, TAU);
  g.fill();
  for (const [fx, fy, rx] of [
    [-11, -3, 9],
    [13, -2.5, 10.5],
  ]) {
    g.beginPath();
    g.ellipse(fx, fy, rx, 3.8, 0.04, 0, TAU);
    g.fillStyle = BARE;
    g.fill();
    g.strokeStyle = LINE;
    g.lineWidth = 1.1;
    g.stroke();
  }
  g.restore();

  g.save();
  g.translate(0, -8);
  g.rotate(L.lean);
  g.translate(0, 8);
  const c = L.crouch;
  const sq = (pts: Vec[]) => pts.map((p) => sink(p, c));
  const r = mulberry32(77);

  // the work robe: one plain mass, long to the hem just above the feet, a little fuller at the back (left)
  const robe = smooth(sq([
    { x: -7, y: -147 },
    { x: -25, y: -137 },
    { x: -31, y: -100 },
    { x: -37, y: -44 },
    { x: -43, y: -7 },
    { x: 33, y: -7 },
    { x: 26, y: -52 },
    { x: 21, y: -102 },
    { x: 15, y: -138 },
    { x: 5, y: -147 },
  ]));
  washed(g, robe, WASH);
  // the back as one confident stroke (the prologue's), thinner, and a few folds in dry brush
  brushLine(g, sq([{ x: -6, y: -148 }, { x: -26, y: -136 }, { x: -32, y: -96 }, { x: -38, y: -44 }, { x: -43, y: -9 }]), r, {
    w: 4.5,
    alpha: 0.32,
    taperIn: 6,
    taperOut: 30,
    bristles: 5,
    dry: 0.5,
  });
  for (const [x0, x1] of [
    [-14, -22],
    [2, 0],
    [14, 20],
  ]) {
    brushLine(g, sq([{ x: x0, y: -88 }, { x: (x0 + x1) / 2, y: -50 }, { x: x1, y: -12 }]), r, { w: 1.3, alpha: 0.24, taperIn: 20, taperOut: 10 });
  }
  // a plain obi, the same wash laid twice
  washed(
    g,
    sq([
      { x: -31, y: -106 },
      { x: 22, y: -106 },
      { x: 21, y: -93 },
      { x: -32, y: -93 },
    ]),
    WASH_DEEP,
    false,
  );
  // the tasuki: the pale cord that ties her sleeves back, crossing her back from the shoulders to the obi
  g.strokeStyle = CORD;
  g.lineWidth = 1.5;
  const cord = sq([
    { x: -22, y: -137 },
    { x: 14, y: -107 },
    { x: 11, y: -140 },
    { x: -27, y: -107 },
  ]);
  g.beginPath();
  g.moveTo(cord[0].x, cord[0].y);
  g.quadraticCurveTo((cord[0].x + cord[1].x) / 2 + 2, (cord[0].y + cord[1].y) / 2 + 3, cord[1].x, cord[1].y);
  g.moveTo(cord[2].x, cord[2].y);
  g.quadraticCurveTo((cord[2].x + cord[3].x) / 2 - 2, (cord[2].y + cord[3].y) / 2 + 3, cord[3].x, cord[3].y);
  g.stroke();

  paintGhostHead(g, sink({ x: 2 - 3 * L.turn, y: -160 }, c), L.turn, r);

  // her near arm, the sleeve tied back: bunched on the upper arm, the forearm bare (as she paints in the prologue)
  const sh = sink(G_SHOULDER, c);
  const hand = within(sh, L.hand ?? sink(G_REST, c), G_REACH);
  const el = elbowOf(sh, hand);
  const mid = { x: (sh.x + el.x) / 2, y: (sh.y + el.y) / 2 };
  const ua = Math.atan2(el.y - sh.y, el.x - sh.x);
  g.save();
  g.translate(mid.x, mid.y);
  g.rotate(ua);
  const half = Math.hypot(el.x - sh.x, el.y - sh.y) / 2 + 6;
  g.beginPath();
  g.ellipse(0, 1, half, 9.5, 0, 0, TAU);
  g.fillStyle = WASH_DEEP;
  g.fill();
  g.strokeStyle = RIM;
  g.lineWidth = RIM_W;
  g.stroke();
  g.restore();
  const fa = Math.atan2(hand.y - el.y, hand.x - el.x);
  const nx = -Math.sin(fa);
  const ny = Math.cos(fa);
  const arm: Vec[] = [
    { x: el.x + nx * 4.4, y: el.y + ny * 4.4 },
    { x: hand.x + nx * 3, y: hand.y + ny * 3 },
    { x: hand.x - nx * 3, y: hand.y - ny * 3 },
    { x: el.x - nx * 4.4, y: el.y - ny * 4.4 },
  ];
  polyPath(g, arm);
  g.fillStyle = BARE;
  g.fill();
  g.strokeStyle = LINE;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(arm[0].x, arm[0].y);
  g.lineTo(arm[1].x, arm[1].y);
  g.moveTo(arm[2].x, arm[2].y);
  g.lineTo(arm[3].x, arm[3].y);
  g.stroke();
  g.beginPath();
  g.ellipse(hand.x, hand.y, 4.8, 4, fa, 0, TAU);
  g.fillStyle = BARE;
  g.fill();
  g.stroke();
  if (L.stick) drawInkStick(g, hand.x + 2, hand.y + 3, 0.5);
  g.restore();
}

/**
 * Her head at `hc`: white hair swept back into a low knot at the nape (the prologue's), here a faint wash with a few
 * grey strands. From behind the hair is all we see; turning back over her shoulder toward Ren (left) she shows a
 * few calm strokes of profile: a closed, smiling eye and a small smile. The knot swings to the back of her head.
 */
function paintGhostHead(g: CanvasRenderingContext2D, hc: Vec, turn: number, r: () => number) {
  // the neck and the back of the collar
  g.fillStyle = BARE;
  g.fillRect(hc.x - 5, hc.y + 7, 10, 9);
  g.strokeStyle = CORD;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(hc.x - 9, hc.y + 16);
  g.quadraticCurveTo(hc.x, hc.y + 12, hc.x + 9, hc.y + 16);
  g.stroke();
  // the head: hair wash over the skull
  g.beginPath();
  g.arc(hc.x, hc.y, 12.5, 0, TAU);
  g.fillStyle = rgba(INK, 0.12);
  g.fill();
  g.strokeStyle = RIM;
  g.lineWidth = RIM_W;
  g.stroke();
  if (turn > 0.02) {
    // her face, turned back toward Ren: bare, a few calm strokes
    g.save();
    g.globalAlpha *= Math.min(1, turn * 1.4);
    const face: Vec[] = [
      { x: hc.x - 2, y: hc.y - 10 },
      { x: hc.x - 11, y: hc.y - 8.5 },
      { x: hc.x - 13, y: hc.y - 2 },
      { x: hc.x - 16, y: hc.y + 1.5 },
      { x: hc.x - 12.5, y: hc.y + 3 },
      { x: hc.x - 12, y: hc.y + 9 },
      { x: hc.x - 3, y: hc.y + 11 },
    ];
    polyPath(g, face);
    g.fillStyle = rgba(PAPER, 0.55);
    g.fill();
    brushLine(g, face.slice(1), r, { w: 1.3, alpha: 0.6, taperIn: 2, taperOut: 4 });
    g.strokeStyle = rgba(INK, 0.65);
    g.lineWidth = 1;
    // the eye: a closed, happy arc; then the smile
    g.beginPath();
    g.arc(hc.x - 7.5, hc.y - 3, 2.6, Math.PI * 1.1, Math.PI * 1.9);
    g.stroke();
    g.beginPath();
    g.arc(hc.x - 10, hc.y + 4.5, 2.4, Math.PI * 0.15, Math.PI * 0.75);
    g.stroke();
    g.restore();
  }
  // grey strands swept back toward the knot
  const knot = { x: hc.x + lerp(-9, 9, turn), y: hc.y + 7 };
  g.strokeStyle = rgba(INK, 0.3);
  g.lineWidth = 0.7;
  for (let i = 0; i < 5; i++) {
    const y = hc.y - 10 + i * 3;
    g.beginPath();
    g.moveTo(hc.x - lerp(-8, 8, turn) * (1 - i * 0.12), y - 1);
    g.quadraticCurveTo(hc.x, y - 2, knot.x * 0.6 + hc.x * 0.4, knot.y - 3 + i * 0.4);
    g.stroke();
  }
  // the low knot at the nape, bound with a cord
  g.beginPath();
  g.ellipse(knot.x, knot.y, 5.5, 4.6, turn > 0.5 ? 0.4 : -0.4, 0, TAU);
  g.fillStyle = rgba(INK, 0.16);
  g.fill();
  g.strokeStyle = LINE;
  g.lineWidth = 1.1;
  g.stroke();
  g.strokeStyle = rgba(INK, 0.6);
  g.lineWidth = 1.3;
  g.beginPath();
  g.moveTo(knot.x + lerp(3, -3, turn), knot.y - 4);
  g.lineTo(knot.x + lerp(1.5, -1.5, turn), knot.y + 1);
  g.stroke();
}

function elbowOf(sh: Vec, hand: Vec): Vec {
  // two equal bones, bending outward (down and back)
  const dx = hand.x - sh.x;
  const dy = hand.y - sh.y;
  const d = Math.min(Math.hypot(dx, dy), G_REACH - 0.1);
  const ang = Math.atan2(dy, dx);
  const k = Math.acos(Math.max(-1, Math.min(1, d / G_REACH)));
  return { x: sh.x + Math.cos(ang + k) * (G_REACH / 2), y: sh.y + Math.sin(ang + k) * (G_REACH / 2) };
}

// ───────────────────────────────────────────── staging helpers

/** Ren kneeling (the prologue's fallback: idle lowered into the floor on a cushion), the scarf in an ink */
function kneelIn(aim: number, t: number, ink: { color: string; light: string }): Pose {
  return { ...kneelPose(aim, t), accent: ink.color, accentLight: ink.light };
}

/** a traveler mirrored to face left (standing figures only; nobody ever runs mirrored), scaled about its feet */
function drawFacing(ctx: CanvasRenderingContext2D, c: Character, p: Pose, s: number, left: boolean) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(left ? -s : s, s);
  ctx.translate(-p.x, -p.y);
  c.draw(ctx, p);
  ctx.restore();
}

/** a taiko seen from the side, two pale heads and a laced barrel; `wet` adds a sheen and runs */
function drawTaiko(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number, wet: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = rgba(INK, 0.88);
  ctx.beginPath();
  ctx.moveTo(-14, -10);
  ctx.quadraticCurveTo(0, -14, 14, -10);
  ctx.lineTo(14, 10);
  ctx.quadraticCurveTo(0, 14, -14, 10);
  ctx.closePath();
  ctx.fill();
  for (const hx of [-14, 14]) {
    ctx.fillStyle = '#ece5d6';
    ctx.beginPath();
    ctx.ellipse(hx, 0, 4.2, 11.5, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }
  // lacing
  ctx.strokeStyle = rgba(PAPER, 0.45);
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  for (let i = 0; i <= 6; i++) {
    const xx = -11 + i * 3.7;
    ctx.lineTo(xx, i % 2 ? 7 : -7);
  }
  ctx.stroke();
  if (wet > 0) {
    ctx.strokeStyle = `rgba(255,255,255,${0.5 * wet})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-9, -9);
    ctx.quadraticCurveTo(0, -11.5, 9, -9);
    ctx.stroke();
  }
  ctx.restore();
}

// ───────────────────────────────────────────── E1 "The storm rolls on" (board)

const E1_DUR = 4.5;
/** Raijin on his cloud in Sōtatsu's corner, top left: the hoop's centre and his scale */
const RJ = { x: 296, y: 196, s: 0.92 };
const E1_RIVER = 528;
const E1_SURFACE = 552;
const E1_BANK = 556;
const HOOK_X = 640;
/** the drum rises out of the water on the hook, dripping */
const DRUM_UP = { t0: 0.15, dur: 1.6, from: 600, to: 448 };
/** one happy beat on a drum with the raised arm, then his cloud rolls off downriver (right) */
const BEAT = { t0: 3.4, dur: 0.55 };
const ROLL = { t0: 3.6, dur: 0.9 };

function e1Sky(ctx: CanvasRenderingContext2D, v: View) {
  const x0 = v.x0 - 40;
  const x1 = v.x1 + 40;
  const y0 = v.y0 - 10;
  const r = mulberry32(611);
  // what is left of the storm: a grey wash heavy over Raijin's corner, thinning to the right and down
  const g = ctx.createLinearGradient(0, y0, 0, 380);
  g.addColorStop(0, rgba(INK, 0.3));
  g.addColorStop(1, rgba(INK, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x0, y0, x1 - x0, 380 - y0);
  const rg = ctx.createRadialGradient(260, 150, 40, 260, 150, 520);
  rg.addColorStop(0, rgba(INK, 0.22));
  rg.addColorStop(1, rgba(INK, 0));
  ctx.fillStyle = rg;
  ctx.fillRect(x0, y0, 900, 640);
  // torn cloud to the upper right, with a gap where the night shows through and a few stars
  for (let i = 0; i < 7; i++) {
    const y = 28 + i * 22 + r() * 16;
    const xa = 640 + r() * 200;
    brushLine(ctx, [{ x: xa, y }, { x: xa + 180 + r() * 120, y: y - 6 + r() * 12 }, { x: x1 + 40, y: y + (r() - 0.5) * 16 }], r, {
      w: 18 + r() * 26,
      alpha: 0.08 + r() * 0.07,
      taperIn: 120,
      taperOut: 40,
      wobble: 0.4,
    });
  }
  const gap = ctx.createRadialGradient(1120, 66, 10, 1120, 66, 150);
  gap.addColorStop(0, rgba(INK, 0.5));
  gap.addColorStop(0.6, rgba(INK, 0.3));
  gap.addColorStop(1, rgba(INK, 0));
  ctx.save();
  ctx.translate(1120, 66);
  ctx.scale(1, 0.5);
  ctx.translate(-1120, -66);
  ctx.fillStyle = gap;
  ctx.fillRect(960, -90, 320, 310);
  ctx.restore();
  for (const [sx, sy, sr] of [
    [1060, 60, 2.2],
    [1105, 44, 1.5],
    [1150, 76, 2.6],
    [1188, 52, 1.6],
    [1088, 88, 1.4],
    [1215, 80, 1.8],
  ]) {
    ctx.fillStyle = 'rgba(255,252,240,0.95)';
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, TAU);
    ctx.fill();
  }
  // the far shore, low and pale, beyond the river mouth
  miniRange(ctx, 520, x1 + 20, E1_RIVER - 6, 46, 0.006, 71, 0.16, r);
}

function e1River(ctx: CanvasRenderingContext2D, v: View) {
  const x0 = v.x0 - 40;
  const x1 = v.x1 + 40;
  const y1 = v.y1 + 10;
  const g = ctx.createLinearGradient(0, E1_RIVER, 0, y1);
  g.addColorStop(0, rgba(INK, 0.04));
  g.addColorStop(1, rgba(INK, 0.22));
  ctx.fillStyle = g;
  ctx.fillRect(x0, E1_RIVER, x1 - x0, y1 - E1_RIVER);
  const r = mulberry32(613);
  brushLine(ctx, [{ x: x0, y: E1_RIVER }, { x: 700, y: E1_RIVER - 2 }, { x: x1, y: E1_RIVER + 1 }], r, { w: 2.2, alpha: 0.5, taperIn: 60, taperOut: 60, bristles: 3, dry: 0.7 });
  waterLines(ctx, x0, x1, E1_RIVER + 10, y1, 617, 0.55);
  // the near bank on the right, where the travelers stand, sloping into the water at its left end
  drawGround(ctx, 836, x1 + 20, E1_BANK, 619, 220);
  ctx.fillStyle = PAPER;
  polyPath(ctx, [
    { x: 838, y: E1_BANK + 2 },
    { x: 760, y: y1 + 10 },
    { x: 840, y: y1 + 10 },
  ]);
  ctx.fill();
  // the bank's side edge stops at the waterline (the paper face below it carries the rest by tone)
  brushLine(ctx, [{ x: 840, y: E1_BANK }, { x: 826, y: E1_BANK + 26 }, { x: 814, y: E1_BANK + 48 }], r, { w: 3, alpha: 0.35, taperIn: 4, taperOut: 26, bristles: 4, dry: 0.8 });
  brushLine(ctx, [{ x: 812, y: E1_BANK + 50 }, { x: 770, y: E1_BANK + 52 }], r, { w: 1.4, alpha: 0.25, taperIn: 20, taperOut: 10 });
  // reeds at the water's edge
  for (const [rx, rs] of [
    [818, 0.8],
    [1180, 0.7],
  ] as const) {
    ctx.save();
    drawDecor(ctx, { kind: 'reeds', x: rx, y: E1_BANK + 4, s: rs, seed: Math.floor(rx), flip: false });
    ctx.restore();
  }
}

function e1Scene(lead: CharId): PanelScene {
  let sky: Layer | null = null;
  let river: Layer | null = null;
  const art = new RaijinArt();
  const ren = new Character('ren');
  const fox = new Character('kohaku');
  // they watch him from the bank, facing left; the lead stands nearer him
  const at = lead === 'ren' ? { ren: 902, fox: 978 } : { fox: 902, ren: 978 };
  let renPose = pose(at.ren, E1_BANK, 'idle', SHU.color, SHU.light, 0);
  let foxPose = pose(at.fox, E1_BANK, 'idle', AMBER, AMBER_LIGHT, 0);
  const drums = Array.from({ length: 8 }, () => ({ soak: 0, flash: 0 }));
  /** the drum's swing on the line */
  let swing = 0;
  let swingV = 0;
  return {
    bake(k, view) {
      const x0 = view.x0 - 40;
      const w = view.x1 - view.x0 + 80;
      sky = new Layer(x0, view.y0 - 10, w, E1_RIVER + 30 - (view.y0 - 10), (ctx) => e1Sky(ctx, view));
      river = new Layer(x0, E1_RIVER - 10, w, view.y1 + 20 - (E1_RIVER - 10), (ctx) => e1River(ctx, view));
      return [() => sky!.bake(k), () => river!.bake(k), () => art.build(k * RJ.s)];
    },
    update(t, dt) {
      renPose = pose(at.ren, E1_BANK, 'idle', SHU.color, SHU.light, t);
      foxPose = pose(at.fox, E1_BANK, 'idle', AMBER, AMBER_LIGHT, t);
      ren.update(renPose, dt);
      fox.update(foxPose, dt);
      // a damped pendulum, kicked as the drum leaves the water and as his cloud starts rolling
      const kick = (t > DRUM_UP.t0 + DRUM_UP.dur - dt && t <= DRUM_UP.t0 + DRUM_UP.dur ? 1.2 : 0) + (t > ROLL.t0 && t - dt <= ROLL.t0 ? -1.6 : 0);
      swingV += (-swing * 30 - swingV * 1.6) * dt + kick;
      swing += swingV * dt;
    },
    draw(ctx, t, view) {
      sky?.draw(ctx);
      const roll = ease(span(t, ROLL.t0, ROLL.dur)) * 150;
      const rx = RJ.x + roll;
      const ry = RJ.y + Math.sin(t * 1.3) * 4;
      // one happy beat with the raised (back) arm on his upper-left drum
      const beat = span(t, BEAT.t0, BEAT.dur);
      drums[7].flash = beat > 0.5 ? Math.max(0, 1 - (beat - 0.5) * 2.2) : 0;
      const look: RaijinLook = {
        x: rx / RJ.s,
        y: ry / RJ.s,
        face: 1,
        t,
        alpha: 1,
        hoopRot: Math.sin(t * 0.6) * 0.05,
        drums,
        front: { k: 0, drum: 2 },
        back: { k: beat > 0 && beat < 1 ? beat : 0, drum: 7 },
        expr: 'grin',
        blot: 0,
        // a rocking laugh
        lean: Math.sin(t * 5.2) * 0.035 * (t > 2 ? 1 : 0.4),
      };
      ctx.save();
      ctx.scale(RJ.s, RJ.s);
      art.draw(ctx, look);
      ctx.restore();
      // the fishing line from his low (front) fist down to the hook over the water
      const hand = { x: rx + (66 + Math.sin(t * 2.1 + 1) * 2.5) * RJ.s, y: ry + (-2 + Math.cos(t * 2.6 + 1) * 3 + Math.sin(t * 2.6) * 2) * RJ.s };
      const up = ease(span(t, DRUM_UP.t0, DRUM_UP.dur));
      const hookY = lerp(DRUM_UP.from, DRUM_UP.to, up) - roll * 0.25;
      const hookX = HOOK_X + roll * 0.85 + Math.sin(swing) * 26;
      ctx.save();
      ctx.strokeStyle = rgba(INK, 0.8);
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(hand.x, hand.y);
      ctx.quadraticCurveTo((hand.x + hookX) / 2, Math.max(hand.y, hookY) - 30 + 40 * (1 - up), hookX, hookY);
      ctx.stroke();
      ctx.restore();
      river?.draw(ctx);
      // the drum, hanging from the hook; under the surface only a dim shape shows
      const drumY = hookY + 20;
      const drumRot = Math.sin(swing) * -0.5;
      ctx.save();
      ctx.beginPath();
      ctx.rect(view.x0 - 40, view.y0 - 40, view.x1 - view.x0 + 80, E1_SURFACE - (view.y0 - 40));
      ctx.clip();
      drawTaiko(ctx, hookX, drumY, drumRot, 1 - span(t, 2.5, 1.5));
      ctx.restore();
      if (drumY + 14 > E1_SURFACE) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(view.x0 - 40, E1_SURFACE, view.x1 - view.x0 + 80, 200);
        ctx.clip();
        ctx.globalAlpha = 0.22;
        drawTaiko(ctx, hookX, drumY, drumRot, 0);
        ctx.restore();
      }
      // the hook
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(hookX - 3, hookY + 4, 4, -0.2, Math.PI * 1.1);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(hookX, hookY);
      ctx.lineTo(hookX, drumY - 12);
      ctx.stroke();
      // rings where the drum broke the surface, then where each drip lands
      for (let i = 0; i < 3; i++) ripple(ctx, HOOK_X, E1_SURFACE, span(t, DRUM_UP.t0 + 0.55 + i * 0.25, 1.4), 70);
      for (let i = 0; i < 12; i++) {
        const t0 = DRUM_UP.t0 + 0.9 + i * 0.2 + (i % 3) * 0.05;
        const life = t - t0;
        if (life < 0) continue;
        // a drop leaves the drum's lower edge, where the drum was at that moment (close enough: where it is)
        const dx = HOOK_X + ((i * 37) % 17) - 8;
        const y0 = lerp(DRUM_UP.from, DRUM_UP.to, ease(span(t0, DRUM_UP.t0, DRUM_UP.dur))) + 32;
        const y = y0 + 0.5 * 1400 * life * life;
        if (y < E1_SURFACE) {
          ctx.fillStyle = rgba(INK, 0.7);
          ctx.beginPath();
          ctx.ellipse(dx, y, 1.4, 2.6, 0, 0, TAU);
          ctx.fill();
        } else {
          const land = t0 + Math.sqrt((2 * (E1_SURFACE - y0)) / 1400);
          ripple(ctx, dx, E1_SURFACE, span(t, land, 0.9), 26);
        }
      }
      // the last of the rain, thinning to nothing
      const rain = 1 - ease(span(t, 0.2, 2.4));
      if (rain > 0.01) {
        ctx.save();
        ctx.strokeStyle = rgba(INK, 0.28 * rain);
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        const r = mulberry32(5);
        for (let i = 0; i < 90; i++) {
          const x = view.x0 + r() * (view.x1 - view.x0 + 200);
          const sp = 900 + r() * 400;
          const h = view.y1 - view.y0 + 80;
          const y = view.y0 - 40 + ((r() * h + t * sp) % h);
          ctx.moveTo(x - (y - view.y0) * 0.22, y);
          ctx.lineTo(x - (y - view.y0) * 0.22 - 5, y + 22);
        }
        ctx.stroke();
        ctx.restore();
      }
      // the travelers on the bank, watching him (the lead nearer)
      if (lead === 'ren') {
        drawFacing(ctx, fox, foxPose, OTHER, true);
        drawFacing(ctx, ren, renPose, 1, true);
      } else {
        drawFacing(ctx, ren, renPose, OTHER, true);
        drawFacing(ctx, fox, foxPose, 1, true);
      }
    },
    release() {
      sky?.release();
      river?.release();
    },
  };
}

// ───────────────────────────────────────────── E2 "Sending the lanterns" (board)

const E2_DUR = 5.0;
const FAR_Y = 380;
const POLE = { x: 405, top: 432 };
/** the white first-Obon lantern hanging from the pole's arm (its wick at the bottom of the paper) */
const WHITE = { x: 424, y: 470 };
const REN2 = { x: 455, s: 1.3 };
/** the little floating lantern: on the bank in front of Ren, then set on the water, then drifting */
const LANT = { bank: { x: 532, y: 562 }, water: { x: 648, y: 606 } };
const E2_TAPER = 62;
const E2 = { raise: [0.35, 0.6], catch: 1.0, lower: [1.4, 0.8], lit: 2.2, set: [2.6, 0.7] };

/** the white lantern of the first Obon: a plain paper chōchin, warm-lit, no coloured rim */
function whiteLantern(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  const flick = 0.88 + 0.12 * Math.sin(t * 7.3) * Math.sin(t * 4.1 + 1);
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const g = ctx.createRadialGradient(x, y - 18, 4, x, y - 18, 120);
  g.addColorStop(0, `rgba(${GLOW.bloom},${0.5 * flick})`);
  g.addColorStop(1, `rgba(${GLOW.bloom},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - 120, y - 140, 240, 240);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#fbf6ea';
  ctx.beginPath();
  ctx.ellipse(x, y - 18, 13, 18, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = `rgba(${GLOW.hot},${0.55 * flick})`;
  ctx.beginPath();
  ctx.ellipse(x, y - 16, 7, 11, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = rgba(INK, 0.3);
  ctx.lineWidth = 0.8;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.ellipse(x, y - 18 + i * 6, 13 * Math.sqrt(1 - ((i * 6) / 18) ** 2), 1.2, 0, 0, Math.PI);
    ctx.stroke();
  }
  ctx.fillStyle = rgba(INK, 0.85);
  ctx.fillRect(x - 7, y - 38, 14, 4);
  ctx.fillRect(x - 7, y - 1, 14, 3);
  ctx.restore();
}

function e2Paint(ctx: CanvasRenderingContext2D, v: View) {
  const x0 = v.x0 - 40;
  const x1 = v.x1 + 40;
  const y1 = v.y1 + 10;
  const r = mulberry32(621);
  // the near bank first, so the night darkens it like everything else
  drawGround(ctx, x0 - 20, 640, FLOOR, 623, 260);
  ctx.fillStyle = PAPER;
  polyPath(ctx, [
    { x: 636, y: FLOOR + 2 },
    { x: 700, y: y1 + 10 },
    { x: 600, y: y1 + 10 },
  ]);
  ctx.fill();
  bankFace(ctx, x0 - 20, { x: 638, y: FLOOR }, { x: 700, y: y1 + 10 }, r);
  paintNight(ctx, v, {
    top: 0.9,
    mid: 0.66,
    low: 0.88,
    horizon: FAR_Y,
    seed: 625,
    lifts: [
      ...textLift(E2P.text, 701),
      // the white lantern's light on the bank round it
      { x: WHITE.x + 30, y: FLOOR - 50, rx: 230, ry: 120, a: 0.55 },
      { x: WHITE.x + 60, y: FLOOR + 6, rx: 260, ry: 34, a: 0.35 },
    ],
  });
  // the far bank: a low ink line with reeds and small kneeling silhouettes setting lanterns on the water
  brushLine(ctx, [{ x: x0, y: FAR_Y + 2 }, { x: 640, y: FAR_Y - 2 }, { x: x1, y: FAR_Y + 3 }], r, { w: 4, alpha: 0.85, taperIn: 40, taperOut: 40, bristles: 4, dry: 0.5 });
  miniRange(ctx, x0, x1, FAR_Y + 1, 26, 0.008, 629, 0.5, r);
  for (const [px, dir, seed] of [
    [170, 1, 1],
    [262, -1, 2],
    [742, 1, 3],
    [842, -1, 4],
    [1010, 1, 5],
    [1196, -1, 6],
  ] as const) farKneeler(ctx, px, FAR_Y, dir, seed);
  for (const [rx, ry, rs] of [
    [560, FAR_Y, 0.45],
    [930, FAR_Y, 0.4],
    [1110, FAR_Y, 0.5],
    [235, FLOOR, 0.9],
    [612, FLOOR, 0.85],
  ] as const) {
    drawDecor(ctx, { kind: 'reeds', x: rx, y: ry, s: rs, seed: Math.floor(rx), flip: rx > 600 });
  }
  // moonlit glints on the water
  const r2 = mulberry32(627);
  for (let i = 0; i < 26; i++) {
    const y = FAR_Y + 14 + Math.pow(r2(), 1.4) * (y1 - FAR_Y);
    const x = x0 + r2() * (x1 - x0);
    if (x < 680 && y > FLOOR - 6) continue;
    brushLine(ctx, [{ x, y }, { x: x + 40 + r2() * 160, y: y + (r2() - 0.5) * 2 }], r2, { w: 1.2 + r2() * 1.6, color: PAPER, alpha: 0.1 + r2() * 0.08, taperIn: 30, taperOut: 30 });
  }
  // the lantern pole and its arm
  brushLine(ctx, [{ x: POLE.x, y: FLOOR + 2 }, { x: POLE.x + 1, y: POLE.top }], r, { w: 3.6, taperIn: 2, taperOut: 2, bristles: 3, dry: 0.4 });
  brushLine(ctx, [{ x: POLE.x - 2, y: POLE.top + 4 }, { x: WHITE.x + 6, y: POLE.top - 2 }], r, { w: 2.4, taperIn: 2, taperOut: 4 });
  brushLine(ctx, [{ x: WHITE.x, y: POLE.top }, { x: WHITE.x, y: WHITE.y - 38 }], r, { w: 1, alpha: 0.8, taperIn: 1, taperOut: 1 });
}

interface Floater {
  x: number;
  y: number;
  s: number;
  seed: number;
  speed: number;
}

/** 20 lanterns on the river, drifting right; never on the near bank */
function makeFloaters(): Floater[] {
  const r = mulberry32(631);
  const out: Floater[] = [];
  for (let i = 0; i < 20; i++) {
    const y = FAR_Y + 18 + Math.pow(r(), 0.9) * 300;
    let x = -320 + r() * 1900;
    if (y > FAR_Y + 90 && x < 800) x += 840;
    const d = (y - FAR_Y) / 300;
    out.push({ x, y, s: 0.42 + d * 0.75, seed: i * 13 + 1, speed: 20 * (0.55 + 0.45 * d) });
  }
  return out.sort((a, b) => a.y - b.y);
}

/** the aim that puts a taper of length L held in Ren's kneeling hand closest to `target` */
function aimToward(target: Vec, x: number, s: number, L: number): number {
  let best = 0;
  let bd = Infinity;
  for (let a = -Math.PI; a <= Math.PI; a += 0.01) {
    const { hand, ang } = renHand(x, FLOOR, s, a, 0, 8 * CHAR_SCALE);
    const d = Math.hypot(hand.x + Math.cos(ang) * L - target.x, hand.y + Math.sin(ang) * L - target.y);
    if (d < bd) {
      bd = d;
      best = a;
    }
  }
  return best;
}

function e2Scene(lead: CharId): PanelScene {
  let night: Layer | null = null;
  const ren = new Character('ren');
  const fox = new Character('kohaku');
  const floaters = makeFloaters();
  const aimUp = aimToward({ x: WHITE.x + 2, y: WHITE.y + 2 }, REN2.x, REN2.s, E2_TAPER);
  const aimDown = aimToward({ x: LANT.bank.x, y: LANT.bank.y - 16 }, REN2.x, REN2.s, E2_TAPER);
  const aimRest = 0.55;
  const foxAt = lead === 'kohaku' ? { x: 352, s: 1 } : { x: 336, s: OTHER };
  let renPose = kneelIn(aimRest, 0, SHU);
  let foxPose = pose(foxAt.x, FLOOR, 'idle', AMBER, AMBER_LIGHT, 0);
  const aimAt = (t: number) => {
    if (t < E2.raise[0]) return aimRest;
    if (t < E2.lower[0]) return lerp(aimRest, aimUp, ease(span(t, E2.raise[0], E2.raise[1])));
    if (t < E2.set[0]) return lerp(aimUp, aimDown, ease(span(t, E2.lower[0], E2.lower[1])));
    // setting the lantern on the water: the arm reaches forward and down, then comes back to rest
    const u = span(t, E2.set[0], E2.set[1]);
    return lerp(aimDown, 0.9, Math.sin(u * Math.PI));
  };
  return {
    bake(k, view) {
      night = new Layer(view.x0 - 40, view.y0 - 10, view.x1 - view.x0 + 80, view.y1 - view.y0 + 20, (ctx) => e2Paint(ctx, view));
      return [() => night!.bake(k)];
    },
    update(t, dt) {
      renPose = kneelIn(aimAt(t), t, SHU);
      ren.update(renPose, dt);
      foxPose = pose(foxAt.x, FLOOR, 'idle', AMBER, AMBER_LIGHT, t);
      fox.update(foxPose, dt);
    },
    draw(ctx, t, view) {
      night?.draw(ctx);
      // the lanterns already on the river, drifting right and bobbing
      for (const f of floaters) {
        const x = f.x + f.speed * t;
        if (x < view.x0 - 60 || x > view.x1 + 60) continue;
        floatLantern(ctx, x, f.y + Math.sin(t * 1.4 + f.seed) * 1.5, f.s, 1, t, f.seed);
      }
      whiteLantern(ctx, WHITE.x, WHITE.y, t);
      // Ren's lantern: on the bank, lit by the taper, then set on the water, where it joins the drift
      const lit = ease(span(t, E2.lit, 0.35));
      const su = ease(span(t, E2.set[0], E2.set[1]));
      let lx = lerp(LANT.bank.x, LANT.water.x, su);
      let ly = lerp(LANT.bank.y, LANT.water.y, su) - Math.sin(su * Math.PI) * 14;
      if (su >= 1) {
        const drift = t - (E2.set[0] + E2.set[1]);
        lx += drift * 20;
        ly += Math.sin(drift * 1.6) * 1.2;
      }
      for (let i = 0; i < 2; i++) ripple(ctx, LANT.water.x + (su >= 1 ? (t - E2.set[0] - E2.set[1]) * 10 : 0), LANT.water.y + 1, span(t, E2.set[0] + E2.set[1] - 0.05 + i * 0.35, 1.3), 44, 'rgba(255,226,180,0.4)');
      floatLantern(ctx, lx, ly, 0.95, lit, t, 99, su >= 1);
      // the other traveler, beside Ren (behind and a little smaller unless it leads)
      drawAt(ctx, fox, foxPose, foxAt.s);
      drawRenKneeling(ctx, ren, renPose, REN2.x, REN2.s);
      // the taper in Ren's hand: one thin brush stroke; the flame passes along it from the white lantern down
      // to the little lantern, and the taper is put away once the lantern is lit
      const taperA = 1 - span(t, E2.lit + 0.2, 0.35);
      if (taperA > 0) {
        const { hand, ang } = renHand(REN2.x, FLOOR, REN2.s, renPose.aim ?? 0, 0, 8 * CHAR_SCALE);
        const tip = { x: hand.x + Math.cos(ang) * E2_TAPER, y: hand.y + Math.sin(ang) * E2_TAPER };
        ctx.save();
        ctx.globalAlpha = taperA;
        ctx.strokeStyle = rgba('#6b4a2a', 0.95);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(hand.x - Math.cos(ang) * 6, hand.y - Math.sin(ang) * 6);
        ctx.lineTo(tip.x, tip.y);
        ctx.stroke();
        const flame = span(t, E2.catch, 0.25) * (1 - span(t, E2.lit + 0.1, 0.3));
        if (flame > 0) {
          const fl = 0.8 + 0.2 * Math.sin(t * 23);
          ctx.globalCompositeOperation = 'screen';
          const g = ctx.createRadialGradient(tip.x, tip.y - 3, 0, tip.x, tip.y - 3, 18);
          g.addColorStop(0, `rgba(${GLOW.hot},${0.9 * flame * fl})`);
          g.addColorStop(1, `rgba(${GLOW.bloom},0)`);
          ctx.fillStyle = g;
          ctx.fillRect(tip.x - 18, tip.y - 21, 36, 36);
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = `rgba(255,214,120,${flame})`;
          ctx.beginPath();
          ctx.ellipse(tip.x, tip.y - 3, 2, 4.2, 0, 0, TAU);
          ctx.fill();
        }
        ctx.restore();
      }
    },
    release() {
      night?.release();
    },
  };
}

// ───────────────────────────────────────────── E3 "She leaves the purple" (board)

const E3_DUR = 5.5;
const E3_WATER = 590;
const E3_FAR = 404;
/** the stepping stone: tucked into the foot of the bank (its left end overlaps the bank's face), top surface at y */
const STONE = { x0: 600, x1: 744, y: 568 };
/** her feet on the stepping stone, and the little lantern on the water just past it */
const HER = { x: 684, y: STONE.y, s: 1 };
const E3_LANT = { x: 830, y: 606 };
/** where she sets the ink stick down: the stone's edge nearest Ren */
const STICK_AT = { x: 640, y: STONE.y - 3 };
const E3S = 1.2;
const E3 = {
  turn: [0.6, 0.6],
  draw: [1.2, 0.4],
  set: [1.6, 0.6],
  release: 1.95,
  back: [2.2, 0.45],
  fade: [2.6, 1.0],
  drift: 3.3,
  step: [3.4, 0.8],
  reach: [4.2, 0.35],
  lift: [4.55, 0.35],
  stones: 4.6,
  fill: [4.85, 0.6],
};
const E3_LEAN = -0.22;

function e3Paint(ctx: CanvasRenderingContext2D, v: View) {
  const x0 = v.x0 - 40;
  const x1 = v.x1 + 40;
  const y1 = v.y1 + 10;
  const r = mulberry32(641);
  drawGround(ctx, x0 - 20, 620, FLOOR, 643, 260);
  ctx.fillStyle = PAPER;
  polyPath(ctx, [
    { x: 616, y: FLOOR + 2 },
    { x: 680, y: y1 + 10 },
    { x: 580, y: y1 + 10 },
  ]);
  ctx.fill();
  // the bank's face runs down to the left of the stone (whose left end is tucked into it); no edge stroke here, the
  // tone carries it, so nothing reads as a pole in the water under her stone
  bankFace(ctx, x0 - 20, { x: 618, y: FLOOR }, { x: 560, y: y1 + 10 }, r, false);
  paintNight(ctx, v, {
    top: 0.88,
    mid: 0.64,
    low: 0.86,
    horizon: E3_FAR,
    seed: 645,
    lifts: [
      ...textLift(E3P.text, 703),
      // the light falls along the bank and the water, not in a disc: soft across where Ren and the fox stand, a
      // little up her thin figure, and long and low on the water out to her lantern
      { x: 520, y: FLOOR - 34, rx: 190, ry: 58, a: 0.5 },
      { x: 360, y: FLOOR - 20, rx: 150, ry: 40, a: 0.3 },
      { x: HER.x - 4, y: HER.y - 92, rx: 78, ry: 104, a: 0.42 },
      { x: HER.x + 14, y: HER.y - 20, rx: 150, ry: 46, a: 0.4 },
      { x: 760, y: E3_WATER + 26, rx: 330, ry: 34, a: 0.38 },
      { x: E3_LANT.x + 20, y: E3_WATER + 52, rx: 190, ry: 30, a: 0.32 },
    ],
  });
  // the far bank, faint, with a few lanterns already far downstream
  brushLine(ctx, [{ x: x0, y: E3_FAR }, { x: x1, y: E3_FAR - 3 }], r, { w: 3, alpha: 0.6, taperIn: 40, taperOut: 40, bristles: 3, dry: 0.6 });
  // the water's edge and a few long glints
  const r2 = mulberry32(647);
  for (let i = 0; i < 20; i++) {
    const y = E3_WATER + 4 + Math.pow(r2(), 1.2) * (y1 - E3_WATER);
    const x = 620 + r2() * (x1 - 620);
    brushLine(ctx, [{ x, y }, { x: x + 40 + r2() * 140, y: y + (r2() - 0.5) * 2 }], r2, { w: 1.2 + r2() * 1.5, color: PAPER, alpha: 0.1 + r2() * 0.08, taperIn: 30, taperOut: 30 });
  }
  for (let i = 0; i < 14; i++) {
    const y = E3_FAR + 10 + r2() * (E3_WATER - E3_FAR - 20);
    const x = 640 + r2() * (x1 - 640);
    brushLine(ctx, [{ x, y }, { x: x + 30 + r2() * 90, y }], r2, { w: 1, color: PAPER, alpha: 0.06 + r2() * 0.05, taperIn: 20, taperOut: 20 });
  }
  // the flat stepping stone at the foot of the bank: a squat, uneven stone tucked into the bank's face (its left end
  // under the lip), a couple of smaller stones beside it, never a slab on open water; its wet top catches a little light
  const S = STONE;
  const lump = (x: number, y: number, rx: number, ry: number, a: number) => {
    ctx.fillStyle = rgba(INK, a);
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
    ctx.fill();
  };
  // reflections first, under the waterline
  lump((S.x0 + S.x1) / 2 + 4, S.y + 44, (S.x1 - S.x0) / 2 - 4, 6, 0.18);
  const body = smooth([
    { x: S.x0 - 2, y: S.y + 22 },
    { x: S.x0 + 3, y: S.y + 8 },
    { x: S.x0 + 16, y: S.y + 1 },
    { x: S.x0 + 40, y: S.y - 2 },
    { x: S.x0 + 70, y: S.y - 1 },
    { x: S.x0 + 100, y: S.y - 2.5 },
    { x: S.x1 - 22, y: S.y + 1 },
    { x: S.x1 - 6, y: S.y + 8 },
    { x: S.x1, y: S.y + 20 },
    { x: S.x1 - 6, y: S.y + 32 },
    { x: S.x1 - 32, y: S.y + 38 },
    { x: S.x0 + 60, y: S.y + 39 },
    { x: S.x0 + 18, y: S.y + 37 },
    { x: S.x0, y: S.y + 32 },
  ]);
  const sg = ctx.createLinearGradient(0, S.y - 3, 0, S.y + 39);
  sg.addColorStop(0, rgba(INK, 0.6));
  sg.addColorStop(0.5, rgba(INK, 0.78));
  sg.addColorStop(1, rgba(INK, 0.9));
  ctx.fillStyle = sg;
  polyPath(ctx, body);
  ctx.fill();
  // the wet top: a soft pale sheen along its upper face
  ctx.fillStyle = rgba(PAPER, 0.28);
  polyPath(ctx, [
    { x: S.x0 + 12, y: S.y + 3 },
    { x: S.x0 + 40, y: S.y + 0.5 },
    { x: S.x0 + 100, y: S.y },
    { x: S.x1 - 16, y: S.y + 3 },
    { x: S.x1 - 30, y: S.y + 6 },
    { x: S.x0 + 40, y: S.y + 6.5 },
  ]);
  ctx.fill();
  brushLine(ctx, [{ x: S.x0 + 1, y: S.y + 12 }, { x: S.x0 + 16, y: S.y + 1 }, { x: S.x0 + 70, y: S.y - 1 }, { x: S.x1 - 20, y: S.y + 1 }, { x: S.x1 - 1, y: S.y + 16 }], r, { w: 2, alpha: 0.85, taperIn: 6, taperOut: 8 });
  // dry-brush texture on its side
  for (const [x, y] of [[S.x0 + 26, S.y + 18], [S.x0 + 72, S.y + 24], [S.x1 - 34, S.y + 15]]) {
    brushLine(ctx, [{ x, y }, { x: x + 16, y: y + 2 }], r, { w: 1.5, color: PAPER, alpha: 0.12, taperIn: 6, taperOut: 6 });
  }
  // two smaller stones at its foot, half in the water, and the water lapping round them
  lump(S.x0 + 4, S.y + 36, 16, 8, 0.82);
  lump(S.x1 + 12, S.y + 34, 11, 5.5, 0.75);
  brushLine(ctx, [{ x: S.x0 - 10, y: S.y + 42 }, { x: (S.x0 + S.x1) / 2, y: S.y + 41 }, { x: S.x1 + 28, y: S.y + 38 }], r, { w: 1.4, color: PAPER, alpha: 0.22, taperIn: 30, taperOut: 20 });
  drawDecor(ctx, { kind: 'reeds', x: 300, y: FLOOR, s: 0.9, seed: 300, flip: false });
}

/** Ren standing, crouched (0..1: knees bent, lowered and leaning in) to reach the stone; clipped at the bank */
function drawRenCrouch(ctx: CanvasRenderingContext2D, ren: Character, p: Pose, s: number, crouch: number) {
  ctx.save();
  ctx.translate(p.x, FLOOR);
  ctx.scale(s, s);
  ctx.beginPath();
  ctx.rect(-80, -140, 180, 140.5);
  ctx.clip();
  ctx.rotate(0.42 * crouch);
  ctx.translate(-p.x, -FLOOR + 10 * CHAR_SCALE * crouch);
  ren.draw(ctx, p);
  ctx.restore();
}

function e3Scene(lead: CharId): PanelScene {
  let night: Layer | null = null;
  const ren = new Character('ren');
  const fox = new Character('kohaku');
  const ghost = new MasterGhost();
  const pos = lead === 'ren' ? { ren: 478, fox: 392, foxS: OTHER } : { ren: 446, fox: 520, foxS: 1 };
  const STEP_TO = 600;
  let renX = pos.ren;
  let walk = 0;
  let renPose = pose(renX, FLOOR, 'idle', SHU.color, SHU.light, 0);
  let foxPose = pose(pos.fox, FLOOR, 'idle', AMBER, AMBER_LIGHT, 0);
  // her set-down point in her own (crouched, unleaned) frame: paintGhost leans the arm with her body
  const toFrame = (w: Vec) => rotAbout({ x: (w.x - HER.x) / HER.s, y: (w.y - HER.y) / HER.s }, { x: 0, y: -8 }, -E3_LEAN);
  const setFrame = within(sink(G_SHOULDER, 1), toFrame({ x: STICK_AT.x, y: STICK_AT.y - 3 }), G_REACH);
  const purple = (t: number) => t >= E3.fill[0] + 0.3;
  const crouchAt = (t: number) => ease(span(t, E3.reach[0], E3.reach[1])) * (1 - ease(span(t, E3.lift[0] + 0.15, E3.lift[1])));
  const renAim = (t: number) => {
    const c = crouchAt(t);
    const lifted = ease(span(t, E3.lift[0], E3.lift[1]));
    return lerp(lerp(-0.6, 1.2, c), -1.25, lifted * (1 - c));
  };
  return {
    bake(k, view) {
      night = new Layer(view.x0 - 40, view.y0 - 10, view.x1 - view.x0 + 80, view.y1 - view.y0 + 20, (ctx) => e3Paint(ctx, view));
      return [() => night!.bake(k)];
    },
    update(t, dt) {
      const su = span(t, E3.step[0], E3.step[1]);
      const nx = lerp(pos.ren, STEP_TO, ease(su));
      const moving = su > 0 && su < 1;
      if (moving) walk += dt * 11;
      renX = nx;
      const ink = purple(t) ? MURA : SHU;
      renPose = pose(renX, FLOOR, moving ? 'run' : 'idle', ink.color, ink.light, t, { phase: walk, aim: renAim(t) });
      ren.update(renPose, dt);
      foxPose = pose(pos.fox, FLOOR, 'idle', AMBER, AMBER_LIGHT, t);
      fox.update(foxPose, dt);
    },
    draw(ctx, t, view) {
      night?.draw(ctx);
      const fade = ease(span(t, E3.fade[0], E3.fade[1]));
      // her lantern on the water; it brightens a little as she goes into its glow, then drifts on downstream
      const lx = E3_LANT.x + Math.max(0, t - E3.drift) * 24;
      floatLantern(ctx, lx, E3_LANT.y + Math.sin(t * 1.5) * 1.2, 1.25, 1 + 0.7 * Math.sin(Math.PI * Math.min(1, fade * 1.2)), t, 99);
      // her: turn back toward Ren and smile; draw the stick from her sleeve cord; set it down on the stone; turn
      // back to the lantern; fade evenly as a whole
      const turn = ease(span(t, E3.turn[0], E3.turn[1])) * (1 - ease(span(t, E3.back[0], E3.back[1])));
      const setU = span(t, E3.set[0], E3.set[1]);
      const reach = Math.sin(Math.PI * setU);
      const lean = E3_LEAN * reach;
      const drawn = t >= E3.draw[0] + 0.2;
      const hand =
        setU > 0 && setU < 1
          ? lerpV(sink(G_REST, reach), setFrame, reach)
          : t >= E3.draw[0] && t < E3.set[0]
            ? lerpV(G_REST, { x: -2, y: -104 }, Math.sin(Math.PI * span(t, E3.draw[0], E3.draw[1])))
            : null;
      ghost.draw(ctx, HER.x, HER.y, HER.s, { turn, hand, lean, crouch: reach, stick: drawn && t < E3.release }, 1 - fade, view.k);
      // the stick: on the stone once she lets go, then in Ren's hand
      const lift = span(t, E3.lift[0], E3.lift[1]);
      if (t >= E3.release) {
        if (lift <= 0) drawInkStick(ctx, STICK_AT.x, STICK_AT.y - 1, 0.06);
        else {
          const crouch = crouchAt(t);
          const h = renHand(renX, FLOOR, E3S, renAim(t), 0.42 * crouch, 10 * CHAR_SCALE * crouch);
          const tip = { x: h.hand.x + Math.cos(h.ang) * 8, y: h.hand.y + Math.sin(h.ang) * 8 };
          const u = ease(Math.min(1, lift * 2));
          drawInkStick(ctx, lerp(STICK_AT.x, tip.x, u), lerp(STICK_AT.y - 1, tip.y, u), lerp(0.06, h.ang + 1.2, u));
        }
      }
      // the travelers on the bank (the lead in front); Ren steps forward to the stone and picks it up
      if (lead === 'ren') drawAt(ctx, fox, foxPose, E3S * pos.foxS);
      drawRenCrouch(ctx, ren, renPose, E3S, crouchAt(t));
      if (lead === 'kohaku') drawAt(ctx, fox, foxPose, E3S * pos.foxS);
      // the ink stones in front of Ren, the purple one lent (outline, pale wash), then filling with her purple
      drawStoneRow(ctx, STEP_TO - 40, 640, ease(span(t, E3.stones, 0.25)), ease(span(t, E3.fill[0], E3.fill[1])));
    },
    release() {
      night?.release();
      ghost.release();
    },
  };
}

function lerpV(a: Vec, b: Vec, u: number): Vec {
  return { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u) };
}

// ───────────────────────────────────────────── E4 "Onward" (board)

const E4_DUR = 5.0;
const E4_GROUND = 572;
const E4_RUN = 300;
const SUN = { x: 1020, y: 250, r: 52 };
/** the last 2 s: the camera pulls back and the frame becomes the map handscroll (the map takes over) */
const E4_PULL = { t0: 3.0, dur: 1.4 };

function e4Sky(ctx: CanvasRenderingContext2D, v: View, k: number) {
  const x0 = v.x0 - 60;
  const x1 = v.x1 + 460;
  const r = mulberry32(651);
  // dawn: pale paper with the faintest warm wash low in the sky
  const g = ctx.createLinearGradient(0, v.y0, 0, 480);
  g.addColorStop(0, rgba(INK, 0.05));
  g.addColorStop(1, 'rgba(255,170,110,0.08)');
  ctx.fillStyle = g;
  ctx.fillRect(x0, v.y0 - 10, x1 - x0, 490 - v.y0);
  // the low vermilion sun, in the player's own vermilion
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  const glow = ctx.createRadialGradient(SUN.x, SUN.y, SUN.r * 0.8, SUN.x, SUN.y, SUN.r * 3);
  glow.addColorStop(0, 'rgba(255,138,80,0.3)');
  glow.addColorStop(1, 'rgba(255,138,80,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(SUN.x - SUN.r * 3, SUN.y - SUN.r * 3, SUN.r * 6, SUN.r * 6);
  ctx.restore();
  ctx.fillStyle = rgba(SHU.color, 0.92);
  ctx.beginPath();
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * TAU;
    const rr = SUN.r * (1 + Math.sin(a * 5 + 1) * 0.012 + Math.sin(a * 11) * 0.008);
    const p = { x: SUN.x + Math.cos(a) * rr, y: SUN.y + Math.sin(a) * rr };
    if (i) ctx.lineTo(p.x, p.y);
    else ctx.moveTo(p.x, p.y);
  }
  ctx.fill();
  brushLine(ctx, [{ x: SUN.x - SUN.r * 0.7, y: SUN.y + SUN.r * 0.2 }, { x: SUN.x + SUN.r * 0.6, y: SUN.y + SUN.r * 0.35 }], r, { w: 5, color: SHU.dark, alpha: 0.25, bristles: 4, dry: 0.9 });
  // pale summer ridges, far and near, and a low cloud line across the sun
  miniRange(ctx, x0, x1, 470, 170, 0.0016, 653, 0.1, r);
  miniRange(ctx, x0, x1, 500, 90, 0.0028, 655, 0.15, r);
  brushLine(ctx, [{ x: SUN.x - 160, y: SUN.y + 18 }, { x: SUN.x + 30, y: SUN.y + 12 }, { x: SUN.x + 220, y: SUN.y + 20 }], r, { w: 7, color: PAPER, alpha: 0.75, taperIn: 60, taperOut: 80 });
  // the river, pale now, between the hills and the bank
  const wg = ctx.createLinearGradient(0, 488, 0, 560);
  wg.addColorStop(0, rgba(INK, 0.03));
  wg.addColorStop(1, rgba(INK, 0.1));
  ctx.fillStyle = wg;
  ctx.fillRect(x0, 488, x1 - x0, 90);
  waterLines(ctx, x0, x1, 494, 566, 657, 0.3);
  void k;
}

function e4Scene(lead: CharId): PanelScene {
  let sky: Layer | null = null;
  let ground: Layer | null = null;
  const ren = new Character('ren');
  const fox = new Character('kohaku');
  const xs = lead === 'ren' ? { ren: 600, fox: 515 } : { fox: 600, ren: 515 };
  let renPose = pose(xs.ren, E4_GROUND, 'run', MURA.color, MURA.light, 0);
  let foxPose = pose(xs.fox, E4_GROUND, 'run', AMBER, AMBER_LIGHT, 0);
  let phase = 0;
  return {
    bake(k, view) {
      const x0 = view.x0 - 60;
      const w = view.x1 - view.x0 + 60 + E4_RUN * 5.2;
      sky = new Layer(x0, view.y0 - 10, view.x1 - view.x0 + 520, 600 - (view.y0 - 10), (ctx) => e4Sky(ctx, view, k));
      ground = new Layer(x0, E4_GROUND - 40, w, view.y1 - E4_GROUND + 50, (ctx) => drawGround(ctx, x0 - 10, x0 + w + 10, E4_GROUND, 659));
      return [() => sky!.bake(k), () => ground!.bake(k)];
    },
    update(t, dt) {
      phase += dt * 19;
      renPose = pose(xs.ren, E4_GROUND, 'run', MURA.color, MURA.light, t, { phase });
      foxPose = pose(xs.fox, E4_GROUND, 'run', AMBER, AMBER_LIGHT, t, { phase: phase * 1.08 + 1 });
      ren.update(renPose, dt);
      fox.update(foxPose, dt);
    },
    camera(t) {
      return pullCamera(ease(span(t, E4_PULL.t0, E4_PULL.dur)));
    },
    draw(ctx, t, view) {
      const u = ease(span(t, E4_PULL.t0, E4_PULL.dur));
      ctx.save();
      clipPull(ctx, view, u);
      const run = t * E4_RUN;
      if (sky) {
        ctx.save();
        ctx.translate(-run * 0.08, 0);
        sky.draw(ctx);
        ctx.restore();
      }
      // the lanterns of the night, tiny warm dots far off downstream
      for (let i = 0; i < 6; i++) {
        const x = 1110 + i * 26 + ((i * 37) % 11) + t * 6 - run * 0.08;
        const y = 506 + ((i * 53) % 23);
        ctx.fillStyle = `rgba(${GLOW.core},0.85)`;
        ctx.beginPath();
        ctx.arc(x, y, 2.2, 0, TAU);
        ctx.fill();
        ctx.fillStyle = `rgba(${GLOW.wash},0.25)`;
        ctx.fillRect(x - 1.5, y + 3, 3, 6);
      }
      if (ground) {
        ctx.save();
        ctx.translate(-run, 0);
        ground.draw(ctx);
        ctx.restore();
      }
      if (lead === 'ren') {
        drawAt(ctx, fox, foxPose, OTHER);
        drawAt(ctx, ren, renPose, 1);
      } else {
        drawAt(ctx, ren, renPose, OTHER);
        drawAt(ctx, fox, foxPose, 1);
      }
      featherPull(ctx, view, u);
      ctx.restore();
    },
    release() {
      sky?.release();
      ground?.release();
    },
  };
}

// ───────────────────────────────────────────── the Summer ending

const E1: PanelDef = {
  id: 'e1',
  title: 'The storm rolls on',
  dur: E1_DUR,
  quality: 'board',
  text: { kanji: '雷', line: 'The storm rolled on, laughing.', x: 900, y: 200, at: 0.5 },
  cues: [
    { t: 0.35, run: (a) => a.audio?.fx('splash') },
    // the fūrin as the storm clears (stand-in: the bell, until the audio owner's wind chime lands)
    { t: 2.4, run: (a) => a.audio?.fx('bell') },
    { t: BEAT.t0 + BEAT.dur * 0.5, run: (a) => a.audio?.raijinFx('don', -0.4) },
    // his last drum roll, rolling away downriver to the right
    { t: ROLL.t0 + 0.1, run: (a) => a.audio?.raijinFx('roll', 0.7) },
  ],
  create: (lead) => e1Scene(lead),
};

const E2P: PanelDef = {
  id: 'e2',
  title: 'Sending the lanterns',
  dur: E2_DUR,
  quality: 'board',
  text: { kanji: '送', line: "On Obon's last night, the lanterns see the spirits off.", x: 640, y: 170, at: 0.4 },
  cues: [
    // one far festival drum: the dance is over
    { t: 0.3, run: (a) => a.audio?.fx('taiko') },
    // the master's motif again, notes 1 to 3, stopping where the prologue stopped
    { t: 1.1, run: (a) => a.motif(1) },
    { t: 2.0, run: (a) => a.motif(2) },
    { t: 2.9, run: (a) => a.motif(3) },
  ],
  create: (lead) => e2Scene(lead),
};

const E3P: PanelDef = {
  id: 'e3',
  title: 'She leaves the purple',
  dur: E3_DUR,
  quality: 'board',
  text: { kanji: '紫', line: 'She left Ren her purple.', x: 560, y: 200, at: 0.4 },
  cues: [
    // as the stone fills: the shimmer, and at last the fourth note of her motif
    { t: E3.fill[0] + 0.05, run: (a) => a.audio?.fx('shimmer') },
    { t: E3.fill[0] + 0.15, run: (a) => a.motif(4) },
  ],
  create: (lead) => e3Scene(lead),
};

const E4P: PanelDef = {
  id: 'e4',
  title: 'Onward',
  dur: E4_DUR,
  quality: 'board',
  text: { kanji: '秋', line: 'Autumn waits, still unpainted.', x: 400, y: 200, at: 0.4, fadeAt: E4_PULL.t0 + 0.4 },
  cues: [{ t: 0.4, run: (a) => a.audio?.fx('taiko') }],
  create: (lead) => e4Scene(lead),
};

/** The Summer ending (docs/story.md, section 9): four panels, 20.0 s. */
export const SUMMER_ENDING: CutsceneDef = {
  id: 'summer-ending',
  title: 'Summer ending: the lanterns float away',
  panels: [E1, E2P, E3P, E4P],
  outro: 'map',
};
