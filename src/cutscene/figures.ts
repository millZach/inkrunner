import { brushLine, curve, normals, polyPath, rgba } from '../render/brush';
import { FONT_BRUSH, INK, INKS, PAPER, type InkKind } from '../config';
import type { Vec } from '../math';
import { mulberry32 } from '../rng';

/** Kohaku's own colour in cutscenes (docs/story.md, section 2): warmer and browner than gold ink. */
export const AMBER = '#d9902a';
export const AMBER_LIGHT = '#ffc66a';
/** a pale, slightly warm paper for faces, hands, feet and white hair */
export const SKIN = '#f6eedd';

export function ribbon(ctx: CanvasRenderingContext2D, pts: Vec[], width: (t: number) => number) {
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

/** Two-bone reach: the elbow for a shoulder, a hand and the two lengths. bend picks the side. */
export function elbow(a: Vec, b: Vec, l1: number, l2: number, bend: number): Vec {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.min(Math.hypot(dx, dy), l1 + l2 - 0.01);
  const ang = Math.atan2(dy, dx);
  const k = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
  return { x: a.x + Math.cos(ang - k * bend) * l1, y: a.y + Math.sin(ang - k * bend) * l1 };
}

/** clamp a hand target to what an arm of total length `reach` can touch from the shoulder */
export function within(sh: Vec, p: Vec, reach: number): Vec {
  const d = Math.hypot(p.x - sh.x, p.y - sh.y);
  if (d <= reach) return p;
  return { x: sh.x + ((p.x - sh.x) * reach) / d, y: sh.y + ((p.y - sh.y) * reach) / d };
}

// ───────────────────────────────────────────── Master Usuzumi

/**
 * Master Usuzumi, kneeling in profile facing right (seiza), drawn in the travelers' language: a solid ink robe,
 * tapered brush contours, and paper left bare for her face, hands, feet and white hair. Local space: origin on
 * the floor under her seat, about 135 units to the top of her head.
 */
export const MASTER = {
  shoulder: { x: 10, y: -97 },
  upper: 46,
  fore: 44,
};

/** Her body without the painting arm (that one moves). `bow` tilts the head down a little more. */
export function drawMasterBody(ctx: CanvasRenderingContext2D, seed: number, bow = 0) {
  const r = mulberry32(seed);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // bare feet tucked under her, soles toward us: always drawn
  ctx.fillStyle = SKIN;
  ctx.strokeStyle = rgba(INK, 0.85);
  ctx.lineWidth = 1.6;
  for (const [fx, fy, s] of [
    [-50, -3, 1],
    [-41, -6, 0.9],
  ]) {
    ctx.beginPath();
    ctx.ellipse(fx, fy, 9 * s, 5 * s, -0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // toes
    ctx.beginPath();
    ctx.arc(fx + 7 * s, fy - 3 * s, 1.6 * s, 0, Math.PI * 2);
    ctx.stroke();
  }

  // robe: one solid mass, hunched a little, leaning toward her work
  const robe: Vec[] = [
    ...curve({ x: 2, y: -108 }, { x: -24, y: -104 }, { x: -34, y: -74 }, 10),
    ...curve({ x: -34, y: -74 }, { x: -46, y: -40 }, { x: -44, y: -6 }, 10).slice(1),
    { x: -38, y: 0 },
    { x: 30, y: 1 },
    ...curve({ x: 56, y: 0 }, { x: 64, y: -6 }, { x: 58, y: -18 }, 6),
    ...curve({ x: 58, y: -18 }, { x: 46, y: -30 }, { x: 34, y: -34 }, 6).slice(1),
    ...curve({ x: 34, y: -34 }, { x: 30, y: -62 }, { x: 30, y: -84 }, 8).slice(1),
    ...curve({ x: 30, y: -84 }, { x: 28, y: -98 }, { x: 16, y: -106 }, 6).slice(1),
  ];
  ctx.fillStyle = INK;
  ctx.globalAlpha = 0.93;
  polyPath(ctx, robe);
  ctx.fill();
  ctx.globalAlpha = 1;
  // the back as one confident stroke, and the folds of the lap in dry brush
  brushLine(ctx, [{ x: 0, y: -110 }, { x: -26, y: -102 }, { x: -38, y: -70 }, { x: -46, y: -34 }, { x: -46, y: -4 }], r, {
    w: 9,
    taperIn: 6,
    taperOut: 30,
    bristles: 7,
    dry: 0.5,
  });
  ctx.strokeStyle = rgba(PAPER, 0.16);
  ctx.lineWidth = 1.4;
  for (const pts of [
    [{ x: -30, y: -16 }, { x: 4, y: -22 }, { x: 40, y: -20 }],
    [{ x: -24, y: -8 }, { x: 10, y: -10 }, { x: 48, y: -8 }],
    [{ x: -20, y: -60 }, { x: -14, y: -40 }, { x: -18, y: -22 }],
  ]) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    ctx.quadraticCurveTo(pts[1].x, pts[1].y, pts[2].x, pts[2].y);
    ctx.stroke();
  }
  // kimono collar: the inner layer shows as a pale V at the neck
  ctx.strokeStyle = rgba(SKIN, 0.85);
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(4, -107);
  ctx.quadraticCurveTo(14, -96, 26, -80);
  ctx.stroke();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = rgba(SKIN, 0.5);
  ctx.beginPath();
  ctx.moveTo(9, -106);
  ctx.quadraticCurveTo(18, -97, 28, -86);
  ctx.stroke();
  // the cord that ties her sleeves back (tasuki): a pale loop over the shoulder and across the back
  ctx.strokeStyle = rgba(SKIN, 0.55);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-20, -100);
  ctx.quadraticCurveTo(-8, -86, 18, -70);
  ctx.moveTo(-28, -94);
  ctx.quadraticCurveTo(-2, -100, 20, -96);
  ctx.stroke();
  // the hand that rests on her knee
  ctx.fillStyle = SKIN;
  ctx.strokeStyle = rgba(INK, 0.8);
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.ellipse(44, -31, 7, 4, 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  drawMasterHead(ctx, { x: 13, y: -118 }, 0.28 + bow, r);
  ctx.restore();
}

/** Her head in profile: bare paper face, a few calm strokes, white hair in a low knot. */
function drawMasterHead(ctx: CanvasRenderingContext2D, at: Vec, tilt: number, r: () => number) {
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.rotate(tilt);
  // neck
  ctx.fillStyle = SKIN;
  ctx.beginPath();
  ctx.moveTo(-4, 4);
  ctx.lineTo(5, 3);
  ctx.lineTo(4, 13);
  ctx.lineTo(-6, 13);
  ctx.closePath();
  ctx.fill();
  // face and skull
  const face: Vec[] = [
    { x: -9, y: -10 },
    ...curve({ x: -4, y: -15 }, { x: 6, y: -16 }, { x: 10, y: -8 }, 6),
    { x: 11, y: -4 }, // brow
    { x: 14.5, y: 0.5 }, // nose tip
    { x: 11, y: 2 },
    { x: 11.5, y: 4.5 }, // lips
    { x: 10.5, y: 6 },
    ...curve({ x: 10, y: 8 }, { x: 8, y: 12 }, { x: 2, y: 11 }, 5),
    { x: -6, y: 8 },
    { x: -11, y: 0 },
  ];
  ctx.fillStyle = SKIN;
  polyPath(ctx, face);
  ctx.fill();
  // the profile line, one stroke from brow to chin
  brushLine(ctx, [{ x: 9.5, y: -9 }, { x: 11, y: -4 }, { x: 14.5, y: 0.5 }, { x: 11, y: 2.2 }, { x: 11.6, y: 4.5 }, { x: 10.5, y: 6.2 }, { x: 10, y: 8.5 }, { x: 6, y: 11.5 }, { x: 1, y: 11 }], r, {
    w: 1.7,
    taperIn: 2,
    taperOut: 4,
  });
  // downcast eye, a calm brow, the small smile
  ctx.strokeStyle = INK;
  ctx.lineCap = 'round';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(4.5, -2.2);
  ctx.quadraticCurveTo(6.8, -0.6, 8.6, -2);
  ctx.stroke();
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(4, -6.4);
  ctx.quadraticCurveTo(6.5, -7.6, 9, -6.6);
  ctx.stroke();
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.moveTo(8.2, 5.4);
  ctx.quadraticCurveTo(9.6, 6.2, 10.6, 5.2);
  ctx.stroke();
  // a fine line of age at the cheek
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.moveTo(6.5, 1.5);
  ctx.quadraticCurveTo(7.5, 4, 7, 6);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // white hair: bare paper swept back over the skull, a few grey strands, and a low knot at the nape
  const hair: Vec[] = [
    { x: 9, y: -9 },
    ...curve({ x: 7, y: -16 }, { x: -2, y: -19 }, { x: -11, y: -12 }, 8),
    ...curve({ x: -11, y: -12 }, { x: -15, y: -4 }, { x: -11, y: 4 }, 6).slice(1),
    { x: -6, y: 4 },
    ...curve({ x: -8, y: -2 }, { x: -3, y: -9 }, { x: 6, y: -9 }, 6),
  ];
  ctx.fillStyle = '#fbf7ee';
  polyPath(ctx, hair);
  ctx.fill();
  ctx.fillStyle = rgba(INK, 0.1);
  ctx.fill();
  // knot
  ctx.fillStyle = '#fbf7ee';
  ctx.beginPath();
  ctx.ellipse(-14, 4, 5.5, 4.6, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgba(INK, 0.12);
  ctx.fill();
  ctx.strokeStyle = rgba(INK, 0.85);
  ctx.lineWidth = 1.2;
  ctx.stroke();
  // outline and strands
  brushLine(ctx, [{ x: 8, y: -11 }, { x: 4, y: -16.5 }, { x: -4, y: -18.5 }, { x: -11, y: -13 }, { x: -13.5, y: -4 }, { x: -11, y: 2 }], r, {
    w: 1.8,
    taperIn: 3,
    taperOut: 3,
  });
  ctx.strokeStyle = rgba(INK, 0.4);
  ctx.lineWidth = 0.7;
  for (let i = 0; i < 6; i++) {
    const y = -14 + i * 2.6;
    ctx.beginPath();
    ctx.moveTo(6 - i * 1.4, y - 2);
    ctx.quadraticCurveTo(-4, y - 3 + i * 0.4, -11 + i * 0.3, y + 4);
    ctx.stroke();
  }
  // a cord binding the knot
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-10, 1);
  ctx.lineTo(-11.5, 5.5);
  ctx.stroke();
  ctx.restore();
}

/**
 * Her painting arm and long brush. `tip` is where the brush touches the paper (local space); the hand sits a
 * brush-length back along `ang`. The forearm is bare (sleeves tied back); the upper arm stays in the sleeve.
 */
export function drawMasterArm(ctx: CanvasRenderingContext2D, tip: Vec, ang: number, seed: number, wet: string = INK, len = 118, sh: Vec = MASTER.shoulder) {
  const r = mulberry32(seed);
  const want = { x: tip.x - Math.cos(ang) * len, y: tip.y - Math.sin(ang) * len };
  const hand = within(sh, want, MASTER.upper + MASTER.fore - 1);
  const brushTip = { x: hand.x + Math.cos(ang) * len, y: hand.y + Math.sin(ang) * len };
  const el = elbow(sh, hand, MASTER.upper, MASTER.fore, -1);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // the long brush: a bamboo handle with two nodes, the ferrule, then the wet tip
  const tail = { x: hand.x - Math.cos(ang) * 16, y: hand.y - Math.sin(ang) * 16 };
  ctx.strokeStyle = rgba(INK, 0.9);
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(tail.x, tail.y);
  const neck = { x: brushTip.x - Math.cos(ang) * 16, y: brushTip.y - Math.sin(ang) * 16 };
  ctx.lineTo(neck.x, neck.y);
  ctx.stroke();
  ctx.lineWidth = 3.6;
  for (const f of [0.3, 0.62]) {
    const x = tail.x + (neck.x - tail.x) * f;
    const y = tail.y + (neck.y - tail.y) * f;
    ctx.beginPath();
    ctx.moveTo(x - Math.cos(ang) * 1.2, y - Math.sin(ang) * 1.2);
    ctx.lineTo(x + Math.cos(ang) * 1.2, y + Math.sin(ang) * 1.2);
    ctx.stroke();
  }
  ctx.lineWidth = 4.6;
  ctx.beginPath();
  ctx.moveTo(neck.x - Math.cos(ang) * 5, neck.y - Math.sin(ang) * 5);
  ctx.lineTo(neck.x, neck.y);
  ctx.stroke();
  // the hair tip, loaded with ink
  const nx = -Math.sin(ang);
  const ny = Math.cos(ang);
  ctx.fillStyle = wet;
  ctx.beginPath();
  ctx.moveTo(neck.x + nx * 3, neck.y + ny * 3);
  ctx.quadraticCurveTo(neck.x + Math.cos(ang) * 10 + nx * 3.6, neck.y + Math.sin(ang) * 10 + ny * 3.6, brushTip.x, brushTip.y);
  ctx.quadraticCurveTo(neck.x + Math.cos(ang) * 10 - nx * 3.6, neck.y + Math.sin(ang) * 10 - ny * 3.6, neck.x - nx * 3, neck.y - ny * 3);
  ctx.closePath();
  ctx.fill();

  // sleeve bunched at the shoulder and upper arm (tied back), then the bare forearm
  ctx.fillStyle = INK;
  const mid = { x: (sh.x + el.x) / 2, y: (sh.y + el.y) / 2 };
  ctx.beginPath();
  ctx.ellipse(mid.x, mid.y, MASTER.upper * 0.62, 10, Math.atan2(el.y - sh.y, el.x - sh.x), 0, Math.PI * 2);
  ctx.fill();
  brushLine(ctx, [{ x: sh.x - 6, y: sh.y - 6 }, mid, { x: el.x + 2, y: el.y + 4 }], r, { w: 6, taperIn: 4, taperOut: 8, bristles: 4, dry: 0.5 });
  const fa = Math.atan2(hand.y - el.y, hand.x - el.x);
  const fnx = -Math.sin(fa);
  const fny = Math.cos(fa);
  const arm: Vec[] = [
    { x: el.x + fnx * 4.6, y: el.y + fny * 4.6 },
    { x: hand.x + fnx * 3.2, y: hand.y + fny * 3.2 },
    { x: hand.x - fnx * 3.2, y: hand.y - fny * 3.2 },
    { x: el.x - fnx * 4.6, y: el.y - fny * 4.6 },
  ];
  ctx.fillStyle = SKIN;
  polyPath(ctx, arm);
  ctx.fill();
  ctx.strokeStyle = rgba(INK, 0.85);
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(arm[0].x, arm[0].y);
  ctx.lineTo(arm[1].x, arm[1].y);
  ctx.moveTo(arm[2].x, arm[2].y);
  ctx.lineTo(arm[3].x, arm[3].y);
  ctx.stroke();
  // the hand around the handle
  ctx.fillStyle = SKIN;
  ctx.beginPath();
  ctx.ellipse(hand.x, hand.y, 5.2, 4.2, ang, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  return { hand, tip: brushTip };
}

// ───────────────────────────────────────────── props

/** A standing paper lamp (andon): a tall box of thin ink lines with paper sides. Foot at (x, y). */
export function drawAndon(ctx: CanvasRenderingContext2D, x: number, y: number, seed: number) {
  const r = mulberry32(seed);
  const w = 40;
  const h = 96;
  const top = y - h - 14;
  ctx.save();
  // glowing paper
  const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  g.addColorStop(0, 'rgba(255,214,140,0.85)');
  g.addColorStop(0.5, 'rgba(255,236,190,0.95)');
  g.addColorStop(1, 'rgba(255,206,130,0.8)');
  ctx.fillStyle = g;
  ctx.fillRect(x - w / 2, top, w, h);
  // a lattice of thin bars
  ctx.strokeStyle = rgba(INK, 0.35);
  ctx.lineWidth = 0.9;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(x - w / 2, top + (h * i) / 4);
    ctx.lineTo(x + w / 2, top + (h * i) / 4);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(x, top);
  ctx.lineTo(x, top + h);
  ctx.stroke();
  // frame: posts, rims, feet and a carrying handle
  const line = (a: Vec, b: Vec, w2: number) => brushLine(ctx, [a, b], r, { w: w2, taperIn: 1, taperOut: 1, bristles: 2, dry: 0.3 });
  line({ x: x - w / 2 - 1, y: top - 6 }, { x: x - w / 2 - 1, y: y }, 3.4);
  line({ x: x + w / 2 + 1, y: top - 6 }, { x: x + w / 2 + 1, y: y }, 3.4);
  line({ x: x - w / 2 - 5, y: top }, { x: x + w / 2 + 5, y: top }, 3.2);
  line({ x: x - w / 2 - 4, y: top + h }, { x: x + w / 2 + 4, y: top + h }, 3.6);
  line({ x: x - w / 2 - 3, y: y - 5 }, { x: x + w / 2 + 3, y: y - 5 }, 2.4);
  brushLine(ctx, curve({ x: x - w / 2 + 2, y: top - 6 }, { x: x, y: top - 26 }, { x: x + w / 2 - 2, y: top - 6 }), r, { w: 2.2, taperIn: 1, taperOut: 1 });
  ctx.restore();
}

/**
 * Lamp light, the room's hot spot: a warm multiply tint over everything it reaches, a screen bloom that lifts the
 * night wash around the lamp, and a bright core in the paper. k = 0..1 brightness.
 */
export function drawAndonGlow(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, t: number, radius = 470) {
  if (k <= 0) return;
  const flick = 0.9 + 0.1 * Math.sin(t * 9.3 + 1.1) * Math.sin(t * 5.1);
  const cy = y - 62;
  const a = k * flick;
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  const g = ctx.createRadialGradient(x, cy, 10, x, cy, radius);
  g.addColorStop(0, `rgba(240,160,50,${0.62 * a})`);
  g.addColorStop(0.4, `rgba(236,150,40,${0.3 * a})`);
  g.addColorStop(1, 'rgba(236,150,40,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - radius, cy - radius, radius * 2, radius * 2);
  // the bloom: light, not tint, so the lamp reads as the brightest warm thing in the frame
  ctx.globalCompositeOperation = 'screen';
  const R = 190;
  const b = ctx.createRadialGradient(x, cy, 6, x, cy, R);
  b.addColorStop(0, `rgba(255,196,110,${0.62 * a})`);
  b.addColorStop(0.35, `rgba(255,170,80,${0.24 * a})`);
  b.addColorStop(1, 'rgba(255,160,70,0)');
  ctx.fillStyle = b;
  ctx.fillRect(x - R, cy - R, R * 2, R * 2);
  ctx.globalCompositeOperation = 'source-over';
  const c = ctx.createRadialGradient(x, cy, 1, x, cy, 40);
  c.addColorStop(0, `rgba(255,250,226,${0.95 * a})`);
  c.addColorStop(1, 'rgba(255,232,176,0)');
  ctx.fillStyle = c;
  ctx.fillRect(x - 20, cy - 48, 40, 96);
  ctx.restore();
}

/** An inkstone (suzuri) seen from a little above, with its well of ink. */
export function drawInkstone(ctx: CanvasRenderingContext2D, x: number, y: number, seed: number) {
  const r = mulberry32(seed);
  ctx.save();
  ctx.fillStyle = rgba(INK, 0.18);
  ctx.beginPath();
  ctx.ellipse(x + 4, y + 2, 26, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  // body
  ctx.fillStyle = rgba(INK, 0.85);
  polyPath(ctx, [
    { x: x - 22, y: y - 2 },
    { x: x - 18, y: y - 9 },
    { x: x + 24, y: y - 9 },
    { x: x + 20, y: y - 2 },
    { x: x + 20, y: y + 2 },
    { x: x - 22, y: y + 2 },
  ]);
  ctx.fill();
  // grinding face, slightly lighter, and the dark well
  ctx.fillStyle = rgba(PAPER, 0.16);
  ctx.beginPath();
  ctx.ellipse(x - 2, y - 5.6, 13, 2.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.ellipse(x + 15, y - 5.6, 5, 1.8, 0, 0, Math.PI * 2);
  ctx.fill();
  brushLine(ctx, [{ x: x - 22, y: y + 2.4 }, { x: x + 20, y: y + 2.4 }], r, { w: 1.6, taperIn: 2, taperOut: 2 });
  ctx.restore();
}

/** An ink stone of the in-game selector: a coloured disc with its kanji in paper. lit = 0..1. */
export function drawInkStoneDisc(ctx: CanvasRenderingContext2D, kind: InkKind, x: number, y: number, rad: number, lit: number) {
  const d = INKS[kind];
  ctx.save();
  ctx.fillStyle = rgba(INK, 0.15);
  ctx.beginPath();
  ctx.arc(x + 2, y + 3, rad, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgba(INK, 0.22);
  ctx.beginPath();
  ctx.arc(x, y, rad, 0, Math.PI * 2);
  ctx.fill();
  if (lit > 0) {
    ctx.globalAlpha = lit;
    ctx.shadowColor = rgba(d.light, 0.9);
    ctx.shadowBlur = 18 * lit * ctx.getTransform().a;
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = PAPER;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${rad * 1.04}px ${FONT_BRUSH}`;
  ctx.fillText(d.kanji, x, y + 1);
  ctx.restore();
}
