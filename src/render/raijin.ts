/**
 * 雷神 Raijin, drawn in our ink (docs/story.md section 3; docs/summer-design.md 4.1 to 4.8).
 *
 * In the spirit of Tawaraya Sōtatsu's Fūjin and Raijin screens, redrawn, never traced: a chalk-white oni in an
 * airborne crouch (both knees flung up and out, the shins dropping to clawed feet that break out past his hoop),
 * a round belly, the head thrust forward out of a great mane, two small horns, round fierce eyes and a delighted
 * grin, one bachi raised behind the mane and one low; a heavy black sash with a pale lining over his shoulders,
 * looping up behind the mane and streaming back in an S; all inside a thin brushed hoop of eight taiko marked with
 * mitsudomoe, riding a smudge of black cloud. Mirrored from the screen as story.md decides: he faces right and his
 * sash streams back to the left (he travels right with the view, so the sash trails behind his motion).
 * `face: -1` flips him if the director prefers. The drums are drawn over everything: they are the health bar.
 *
 * Everything is painted by code at runtime (F1). The still parts (each leg, the trunk, the head per expression,
 * the mane, the blot that soaks him, his cloud, both drum faces, the storm band, the arena road) are painted once
 * into offscreen canvases at the game's scale; per frame only the arms, the sash, the hoop and a few drawImage
 * calls (the legs paddle, the head and mane sway) are drawn (F2).
 *
 * Also here: the strike's look (the tomoe mark on the road, the crackling thread, the bolt, the impact, the
 * scorch), the screen-anchored storm sky of the arena, and the arena's road, painted periodically so the loop's
 * wrap (4.5) shows nothing jump.
 */
import { INK, INKS, PAPER, VIEW_H } from '../config';
import type { Vec } from '../math';
import { mulberry32, range, type RNG } from '../rng';
import { brushLine, leaf, normals, polyPath, rgba } from './brush';

const TAU = Math.PI * 2;
/** his chalk-white body: whiter than the paper, so he reads as negative space against his cloud */
export const BODY = '#f8f4ea';
const SHADE = 'rgba(96,92,108,';
const M = INKS.murasaki;

/** Hoop radius (drum centres) and drum head radius, in world units. */
export const HOOP_R = 104;
export const DRUM_R = 16;
/** Arm bones (world units). */
const UPPER = 37;
const FORE = 35;
const BACHI = 34;

// ───────────────────────────────────────────── small painting helpers

interface Layer {
  c: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** local origin inside the canvas, in local units */
  ox: number;
  oy: number;
  s: number;
}

/** A canvas covering local [-ox, w - ox] x [-oy, h - oy] at scale s, with the local transform set. */
function layer(w: number, h: number, ox: number, oy: number, s: number): Layer {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w * s));
  c.height = Math.max(1, Math.ceil(h * s));
  const ctx = c.getContext('2d')!;
  ctx.setTransform(s, 0, 0, s, ox * s, oy * s);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  return { c, ctx, ox, oy, s };
}

function blit(ctx: CanvasRenderingContext2D, L: Layer, x: number, y: number, k = 1) {
  ctx.drawImage(L.c, x - L.ox * k, y - L.oy * k, (L.c.width / L.s) * k, (L.c.height / L.s) * k);
}

/** A tapered limb along `pts` with half-widths `hw`, filled pale and outlined in ink. */
function limbPath(pts: Vec[], hw: number[]): Vec[] {
  const ns = normals(pts);
  const left: Vec[] = [];
  const right: Vec[] = [];
  for (let i = 0; i < pts.length; i++) {
    left.push({ x: pts[i].x + ns[i].x * hw[i], y: pts[i].y + ns[i].y * hw[i] });
    right.push({ x: pts[i].x - ns[i].x * hw[i], y: pts[i].y - ns[i].y * hw[i] });
  }
  return left.concat(right.reverse());
}

function paleFill(ctx: CanvasRenderingContext2D, path: Vec[], line = 2.6) {
  polyPath(ctx, path);
  ctx.fillStyle = BODY;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = line;
  ctx.stroke();
}

/** Sōtatsu's grey modeling: soft, short curved strokes inside a pale shape. */
function modeling(ctx: CanvasRenderingContext2D, r: RNG, a: Vec, b: Vec, c: Vec, w = 2.4, alpha = 0.5) {
  brushLine(ctx, [a, b, c], r, { w, color: '#5c5868', alpha, taperIn: 3, taperOut: 6, bristles: 2, dry: 0.4 });
}

function lerp(a: Vec, b: Vec, t: number): Vec {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Points on a quadratic through a, control c, b. */
function quad(a: Vec, c: Vec, b: Vec, n = 8): Vec[] {
  const out: Vec[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push(lerp(lerp(a, c, t), lerp(c, b, t), t));
  }
  return out;
}

// ───────────────────────────────────────────── the tomoe (巴) and the mitsudomoe on his drums

/**
 * Three commas turning around (cx, cy): each a round head and a tail that sweeps round the centre.
 * `rot` turns the whole mark; `squash` flattens it (a mark painted on the road, seen from the side).
 */
export function tomoePath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rot = 0, squash = 1) {
  ctx.beginPath();
  for (let k = 0; k < 3; k++) {
    const a = rot + (k * TAU) / 3;
    const hr = r * 0.3;
    const hx = Math.cos(a) * r * 0.46;
    const hy = Math.sin(a) * r * 0.46;
    // the tail: from the head's outer edge, sweeping round (clockwise) and thinning to a point
    const pts: Vec[] = [];
    const n = 10;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const aa = a + u * 2.1;
      const rr = r * (0.46 + 0.5 * u * (1 - u * 0.15));
      pts.push({ x: Math.cos(aa) * rr, y: Math.sin(aa) * rr });
    }
    const out: Vec[] = [];
    const inn: Vec[] = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const w = hr * (1 - u) * 0.95;
      const p = pts[i];
      const d = Math.hypot(p.x, p.y) || 1;
      out.push({ x: p.x + (p.x / d) * w, y: p.y + (p.y / d) * w });
      inn.push({ x: p.x - (p.x / d) * w * 0.2, y: p.y - (p.y / d) * w * 0.2 });
    }
    const poly = [...out, ...inn.reverse()];
    ctx.moveTo(cx + poly[0].x, cy + poly[0].y * squash);
    for (const p of poly) ctx.lineTo(cx + p.x, cy + p.y * squash);
    ctx.closePath();
    ctx.moveTo(cx + hx + hr, cy + hy * squash);
    ctx.ellipse(cx + hx, cy + hy * squash, hr, hr * squash, 0, 0, TAU);
  }
}

/** A drum face: ink rim with tacks, mitsudomoe, and the barrel's shadowed edge. `soaked`: drunk black with blot. */
function paintDrum(L: Layer, soaked: boolean) {
  const ctx = L.ctx;
  const r = DRUM_R;
  // barrel side, peeking out behind the head (lower left)
  ctx.fillStyle = soaked ? '#0d0c10' : '#cfc9bd';
  ctx.beginPath();
  ctx.ellipse(-4, 5, r * 1.02, r * 1.02, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.2;
  ctx.stroke();
  // barrel hoops
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(-2, 2.5, r * 1.02, 1.6, 3.4);
  ctx.stroke();
  // the head
  const g = ctx.createRadialGradient(-4, -5, 2, 0, 0, r * 1.15);
  if (soaked) {
    g.addColorStop(0, '#3a3740');
    g.addColorStop(0.6, '#15141a');
    g.addColorStop(1, '#050507');
  } else {
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.75, BODY);
    g.addColorStop(1, '#ddd6c7');
  }
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.lineWidth = 3.2;
  ctx.strokeStyle = INK;
  ctx.stroke();
  // tacks round the rim
  ctx.fillStyle = soaked ? '#5a5662' : INK;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * (r - 3.4), Math.sin(a) * (r - 3.4), 0.95, 0, TAU);
    ctx.fill();
  }
  // mitsudomoe
  tomoePath(ctx, 0, 0, r * 0.66, 0.4);
  ctx.fillStyle = soaked ? 'rgba(120,114,128,0.55)' : INK;
  ctx.fill();
  if (soaked) {
    // a wet sheen and a drip of blot
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.72, -2.6, -1.6);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(13,12,16,0.7)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-6, r - 2);
    ctx.quadraticCurveTo(-6.5, r + 2, -5.5, r + 4.5);
    ctx.stroke();
  }
}

// ───────────────────────────────────────────── the still parts, painted once (per expression for the head)

export type Expr = 'grin' | 'scowl';

/**
 * Where things attach, in his local frame (facing right, origin at the hoop's centre). The pose is Sōtatsu's
 * airborne crouch, redrawn: both knees flung up and out, the shins dropping, clawed feet breaking out past the
 * hoop; a round belly; the head thrust forward and down out of a great mane; one arm raised behind the mane with
 * its bachi, the other low and forward.
 */
export const SHOULDER_F: Vec = { x: 26, y: -30 };
export const SHOULDER_B: Vec = { x: -20, y: -36 };
const HIP_F: Vec = { x: 14, y: 28 };
const HIP_B: Vec = { x: -12, y: 26 };
const NECK: Vec = { x: 18, y: -44 };
const HEAD: Vec = { x: 31, y: -62 };
const MANE_ROOT: Vec = { x: 20, y: -66 };

/** Closed Catmull-Rom through `p` (n points per span): turns a polygon of control points into a soft outline. */
function closedSpline(p: Vec[], n = 4): Vec[] {
  const out: Vec[] = [];
  const m = p.length;
  for (let i = 0; i < m; i++) {
    const p0 = p[(i - 1 + m) % m];
    const p1 = p[i];
    const p2 = p[(i + 1) % m];
    const p3 = p[(i + 2) % m];
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  return out;
}

/** A muscled limb from joint points (hip/shoulder, knee/elbow, ankle/wrist) with a width profile, softly outlined. */
function limbOutline(a: Vec, b: Vec, c: Vec, hw: [number, number, number, number, number, number, number]): Vec[] {
  const pts = [a, lerp(a, b, 0.4), lerp(a, b, 0.8), b, lerp(b, c, 0.35), lerp(b, c, 0.7), c];
  return closedSpline(limbPath(pts, hw), 3);
}

/** Grey modeling down one side of a shape (Sōtatsu's soft shading), clipped to it. */
function shadeSide(ctx: CanvasRenderingContext2D, path: Vec[], from: Vec, to: Vec, a = 0.3) {
  ctx.save();
  polyPath(ctx, path);
  ctx.clip();
  const g = ctx.createLinearGradient(from.x, from.y, to.x, to.y);
  g.addColorStop(0, SHADE + a + ')');
  g.addColorStop(1, SHADE + '0)');
  ctx.fillStyle = g;
  ctx.fillRect(-150, -150, 300, 300);
  ctx.restore();
}

/** A clawed foot from the ankle toward `toe`: a broad pale foot, three curled toes with ink claws, an anklet. */
function paintFoot(ctx: CanvasRenderingContext2D, r: RNG, knee: Vec, an: Vec, toe: Vec) {
  const dx = toe.x - an.x;
  const dy = toe.y - an.y;
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L;
  const uy = dy / L;
  // the side of the foot the sole is on: away from the knee
  const kx = an.x - knee.x;
  const ky = an.y - knee.y;
  const s = ux * ky - uy * kx > 0 ? 1 : -1;
  const nx = -uy * s;
  const ny = ux * s;
  const P = (a: number, b: number): Vec => ({ x: an.x + ux * a + nx * b, y: an.y + uy * a + ny * b });
  const foot = closedSpline([P(-6, -6), P(L * 0.55, -7), P(L * 0.95, -4), P(L + 2, 3), P(L * 0.8, 9), P(L * 0.3, 10), P(-4, 7)], 3);
  paleFill(ctx, foot, 2.4);
  shadeSide(ctx, foot, P(L * 0.5, 10), P(L * 0.5, -2), 0.3);
  // toes and claws
  for (let t = 0; t < 3; t++) {
    const base = P(L * 0.72 + t * 3, -4 + t * 5.5);
    const tip = P(L + 6 - t * 1.5, -2 + t * 6.5);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(base.x, base.y);
    ctx.quadraticCurveTo(lerp(base, tip, 0.6).x + nx * -2, lerp(base, tip, 0.6).y + ny * -2, tip.x, tip.y);
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.ellipse(tip.x, tip.y, 2.6, 1.5, Math.atan2(uy, ux) + 0.6 * s, 0, TAU);
    ctx.fill();
  }
  modeling(ctx, r, P(L * 0.15, 2), P(L * 0.4, 5), P(L * 0.62, 3), 1.8, 0.45);
}

/** One leg in the airborne crouch: hip → knee (flung up and out) → ankle, the foot toward `toe`. */
function paintLeg(L: Layer, hip: Vec, knee: Vec, an: Vec, toe: Vec, far: boolean) {
  const ctx = L.ctx;
  const r = mulberry32(far ? 41 : 43);
  paintFoot(ctx, r, knee, an, toe);
  const path = limbOutline(hip, knee, an, [16, 15, 12.5, 10.5, 12, 9, 7]);
  paleFill(ctx, path, 2.8);
  // shade the underside of the thigh and the back of the calf; a far leg sits a little in shadow
  shadeSide(ctx, path, { x: knee.x, y: knee.y + 18 }, { x: knee.x, y: knee.y - 4 }, far ? 0.42 : 0.32);
  if (far) {
    polyPath(ctx, path);
    ctx.fillStyle = 'rgba(96,92,108,0.12)';
    ctx.fill();
  }
  // Sōtatsu's knotted muscle lines: the kneecap and the calf
  modeling(ctx, r, lerp(hip, knee, 0.25), lerp(hip, knee, 0.55), lerp(hip, knee, 0.85), 2.6, 0.5);
  ctx.strokeStyle = 'rgba(70,66,80,0.6)';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(knee.x, knee.y, 6.5, Math.atan2(hip.y - knee.y, hip.x - knee.x) + 1.9, Math.atan2(hip.y - knee.y, hip.x - knee.x) + 4.4);
  ctx.stroke();
  const c = lerp(knee, an, 0.4);
  modeling(ctx, r, lerp(knee, an, 0.15), { x: c.x + (an.y - knee.y) * 0.12, y: c.y - (an.x - knee.x) * 0.12 }, lerp(knee, an, 0.7), 2.4, 0.45);
  // a ring at the ankle
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(lerp(knee, an, 0.9).x, lerp(knee, an, 0.9).y, 8.5, 3.4, Math.atan2(an.y - knee.y, an.x - knee.x) + Math.PI / 2, 0, TAU);
  ctx.stroke();
}

/** The two legs: the far one kicked back and up, the near one flung forward; both shins drop to clawed feet. */
// (each foot breaks out past the hoop through a gap between two drums, so the drums, drawn over him, never hide it)
const LEG_B = { hip: HIP_B, knee: { x: -52, y: -8 }, an: { x: -70, y: 30 }, toe: { x: -104, y: 40 } };
const LEG_F = { hip: HIP_F, knee: { x: 62, y: 8 }, an: { x: 36, y: 68 }, toe: { x: 46, y: 104 } };

const TORSO: Vec[] = [
  { x: -24, y: -40 },
  { x: -6, y: -49 },
  { x: 18, y: -48 },
  { x: 33, y: -38 },
  { x: 37, y: -22 },
  { x: 47, y: -4 },
  { x: 49, y: 13 },
  { x: 38, y: 29 },
  { x: 16, y: 35 },
  { x: -8, y: 34 },
  { x: -25, y: 22 },
  { x: -31, y: 0 },
  { x: -30, y: -24 },
];

/** The trunk: a broad chest and a round belly, Sōtatsu's soft grey modeling, then the tiger-skin wrap. */
function paintTorso(ctx: CanvasRenderingContext2D, r: RNG) {
  const path = closedSpline(TORSO, 4);
  paleFill(ctx, path, 3.2);
  shadeSide(ctx, path, { x: -34, y: 0 }, { x: 4, y: 0 }, 0.36);
  shadeSide(ctx, path, { x: 10, y: 38 }, { x: 10, y: 14 }, 0.22);
  // the chest's two curves, the ribs, the belly's round swell and its navel swirl
  modeling(ctx, r, { x: -2, y: -34 }, { x: 14, y: -24 }, { x: 34, y: -28 }, 3, 0.55);
  modeling(ctx, r, { x: 20, y: -12 }, { x: 34, y: -6 }, { x: 40, y: 2 }, 2.4, 0.4);
  modeling(ctx, r, { x: 6, y: -6 }, { x: 4, y: 8 }, { x: 12, y: 20 }, 2.2, 0.38);
  modeling(ctx, r, { x: -22, y: -28 }, { x: -16, y: -10 }, { x: -22, y: 8 }, 2.6, 0.45);
  ctx.strokeStyle = 'rgba(70,66,80,0.6)';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(26, 12, 3.4, 0.3, 5.6);
  ctx.stroke();
  // the tiger-skin wrap round the hips: grey wash, striped brush marks, a knotted belt
  const wrap = closedSpline(
    [
      { x: -30, y: 14 },
      { x: 4, y: 10 },
      { x: 38, y: 16 },
      { x: 44, y: 34 },
      { x: 28, y: 48 },
      { x: 2, y: 47 },
      { x: -26, y: 40 },
    ],
    3,
  );
  polyPath(ctx, wrap);
  ctx.fillStyle = '#b9b2a5';
  ctx.fill();
  ctx.save();
  polyPath(ctx, wrap);
  ctx.clip();
  shadeSide(ctx, wrap, { x: 0, y: 50 }, { x: 0, y: 24 }, 0.4);
  for (let i = 0; i < 8; i++) {
    const x = -28 + i * 9.4 + range(r, -2, 2);
    brushLine(ctx, [{ x, y: 13 }, { x: x - 5, y: 30 }, { x: x - 1, y: 50 }], r, { w: range(r, 3.5, 5.5), alpha: 0.85, taperIn: 2, taperOut: 8 });
  }
  ctx.restore();
  polyPath(ctx, wrap);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.8;
  ctx.stroke();
  brushLine(ctx, [{ x: -30, y: 16 }, { x: 4, y: 11 }, { x: 39, y: 17 }], r, { w: 8, alpha: 0.95, taperIn: 2, taperOut: 2 });
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.ellipse(32, 17, 5.5, 4.2, 0.4, 0, TAU);
  ctx.fill();
  // the knot's two short ends, flicked back
  brushLine(ctx, [{ x: 30, y: 19 }, { x: 22, y: 30 }, { x: 14, y: 36 }], r, { w: 5, alpha: 0.9, taperIn: 2, taperOut: 6 });
}

/** The head (pivots at the neck): broad and fierce, round eyes set deep under heavy brows, two small horns. */
function paintHead(ctx: CanvasRenderingContext2D, r: RNG, expr: Expr) {
  const H = HEAD;
  const at = (x: number, y: number): Vec => ({ x: H.x + x, y: H.y + y });
  // two small horns, curving back, before the skull so their roots sit under its outline
  for (const [bx, len, lean] of [
    [-4, 19, -12],
    [10, 16, -8],
  ] as const) {
    const base = at(bx, -19);
    const tip = { x: base.x + lean, y: base.y - len };
    const path = closedSpline(limbPath(quad(base, { x: base.x + 5, y: base.y - len * 0.9 }, tip, 6), [3.8, 3.5, 3, 2.4, 1.6, 0.9, 0.2]), 2);
    polyPath(ctx, path);
    ctx.fillStyle = '#8d8796';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.2;
    ctx.stroke();
    // the horn's rings
    ctx.lineWidth = 1.1;
    for (const u of [0.25, 0.5]) {
      const q = lerp(base, tip, u);
      ctx.beginPath();
      ctx.moveTo(q.x - 3.6 + u * 1.5, q.y + 1);
      ctx.lineTo(q.x + 3.6 - u * 1.5, q.y - 0.5);
      ctx.stroke();
    }
  }
  // the skull and the big jowls, jaw thrust forward and down
  const head = closedSpline([at(-18, -10), at(-10, -20), at(4, -23), at(17, -19), at(25, -9), at(31, 3), at(29, 15), at(15, 24), at(-2, 22), at(-14, 12)], 4);
  paleFill(ctx, head, 3);
  shadeSide(ctx, head, at(-19, 0), at(2, 0), 0.32);
  // cheek furrows (Sōtatsu's grey modeling round the grin)
  modeling(ctx, r, at(-10, -2), at(-12, 8), at(-6, 17), 2.2, 0.55);
  modeling(ctx, r, at(-4, 1), at(-5, 7), at(-1, 12), 1.8, 0.4);
  // the headband
  brushLine(ctx, [at(-17, -11), at(0, -18), at(18, -15)], r, { w: 5, alpha: 0.92, taperIn: 1, taperOut: 1 });
  // brows: thick, knotted, slanting down to the nose (lower in a scowl)
  const drop = expr === 'scowl' ? 3 : 0;
  brushLine(ctx, [at(-9, -14), at(-1, -15 + drop * 0.3), at(7, -11 + drop)], r, { w: 6.5, alpha: 0.95, taperIn: 2, taperOut: 3, bristles: 3, dry: 0.3 });
  brushLine(ctx, [at(12, -12 + drop), at(18, -14 + drop * 0.5), at(25, -11)], r, { w: 5.5, alpha: 0.95, taperIn: 2, taperOut: 2, bristles: 2, dry: 0.3 });
  // eyes: round, wide and set in the face, glaring down at the road
  for (const [ex, ey, er] of [
    [-1, -6, 5.4],
    [17, -7, 4.4],
  ] as const) {
    const e = at(ex, ey);
    const sq = expr === 'scowl' ? 0.7 : 1;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(e.x, e.y, er, er * sq, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.2;
    ctx.stroke();
    // a grey iris and a black pupil, glaring down at the road
    ctx.fillStyle = '#9a94a2';
    ctx.beginPath();
    ctx.arc(e.x + er * 0.18, e.y + er * 0.22 * sq, er * 0.62 * Math.min(1, sq + 0.1), 0, TAU);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(e.x + er * 0.2, e.y + er * 0.26 * sq, er * 0.36, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(e.x + er * 0.02, e.y + er * 0.04, er * 0.13, 0, TAU);
    ctx.fill();
    // the bag under the eye
    ctx.strokeStyle = 'rgba(70,66,80,0.6)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.ellipse(e.x, e.y + 1.5, er * 1.15, er * 1.1, 0, 0.35, Math.PI - 0.35);
    ctx.stroke();
    // the heavy upper lid
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(e.x, e.y, er, er * sq, 0, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
  }
  // a broad snub nose
  ctx.fillStyle = BODY;
  ctx.beginPath();
  ctx.ellipse(H.x + 11, H.y + 2, 7, 5.6, 0.15, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.3;
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.ellipse(H.x + 8, H.y + 4.5, 1.9, 1.3, 0.2, 0, TAU);
  ctx.ellipse(H.x + 15, H.y + 4.5, 1.9, 1.3, -0.2, 0, TAU);
  ctx.fill();
  if (expr === 'grin') {
    // the big delighted grin: open wide, both rows of teeth, fangs at the corners
    const m = closedSpline([at(-9, 8), at(6, 12), at(27, 9), at(24, 18), at(9, 24), at(-5, 17)], 3);
    polyPath(ctx, m);
    ctx.fillStyle = '#3a2a2e';
    ctx.fill();
    ctx.save();
    polyPath(ctx, m);
    ctx.clip();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(H.x - 10, H.y + 6, 40, 6.4);
    ctx.fillRect(H.x - 10, H.y + 19.5, 40, 6);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    for (let k = 0; k < 7; k++) {
      ctx.moveTo(H.x - 3 + k * 4.2, H.y + 8);
      ctx.lineTo(H.x - 3 + k * 4.2, H.y + 13);
      ctx.moveTo(H.x - 1 + k * 4.2, H.y + 19);
      ctx.lineTo(H.x - 1 + k * 4.2, H.y + 24);
    }
    ctx.stroke();
    ctx.restore();
    polyPath(ctx, m);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.6;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    for (const [fx, fy, d] of [
      [-6, 10, 1],
      [23, 11, -1],
    ] as const) {
      const f = at(fx, fy);
      ctx.beginPath();
      ctx.moveTo(f.x, f.y);
      ctx.lineTo(f.x + 1.8 * d, f.y + 8);
      ctx.lineTo(f.x + 4 * d, f.y);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  } else {
    // clenched: a band of teeth, corners turned down
    const m = closedSpline([at(-3, 12), at(20, 11), at(19, 18), at(-2, 19)], 3);
    polyPath(ctx, m);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(H.x - 2, H.y + 15.2);
    ctx.lineTo(H.x + 19, H.y + 14.4);
    for (let k = 1; k < 6; k++) {
      ctx.moveTo(H.x - 3 + k * 3.8, H.y + 12);
      ctx.lineTo(H.x - 2.5 + k * 3.8, H.y + 18.5);
    }
    ctx.stroke();
    brushLine(ctx, [at(-7, 21), at(-3, 15)], r, { w: 2.4, alpha: 0.8 });
  }
}

/**
 * The mane: a great dark mass round the top and back of the head (the screen's mane, here in ink), combed in
 * pale strands, its locks flaring up and back. Painted once; it sways per frame. Kept under the ring's top.
 */
function paintMane(L: Layer) {
  const ctx = L.ctx;
  const r = mulberry32(31);
  const c = { x: 8, y: -74 };
  const top = -107;
  // the soft bleed round the mass
  const g = ctx.createRadialGradient(c.x, c.y, 24, c.x, c.y, 66);
  g.addColorStop(0, rgba(INK, 0.55));
  g.addColorStop(0.7, rgba(INK, 0.3));
  g.addColorStop(1, rgba(INK, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, 66, 50, 0, 0, TAU);
  ctx.fill();
  // the mass: a big irregular blob, fuller behind the head
  const pts: Vec[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    const back = Math.max(0, -Math.cos(a)) * 0.2;
    const rr = range(r, 0.9, 1.06) * (1 + back);
    pts.push({ x: c.x + Math.cos(a) * 46 * rr, y: Math.max(top, c.y + Math.sin(a) * 32 * rr) });
  }
  const mass = closedSpline(pts, 3);
  // grey ink wash, lighter on the crown (the screen's brown mane, as a mid tone that reads on the storm)
  const wash = ctx.createLinearGradient(0, top, 0, c.y + 34);
  wash.addColorStop(0, '#6c6676');
  wash.addColorStop(1, '#3a3641');
  polyPath(ctx, mass);
  ctx.fillStyle = wash;
  ctx.fill();
  // locks flaring out of its back and crown, up and back
  for (let i = 0; i < 22; i++) {
    const a = range(r, Math.PI * 0.8, Math.PI * 1.75);
    const s0 = { x: c.x + Math.cos(a) * 34, y: c.y + Math.sin(a) * 22 };
    const len = range(r, 22, 40);
    const a2 = a + range(r, -0.1, 0.35);
    const e = { x: s0.x + Math.cos(a2) * len, y: Math.max(top - 4, s0.y + Math.sin(a2) * len) };
    const m = { x: (s0.x + e.x) / 2 + range(r, -4, 4), y: (s0.y + e.y) / 2 + range(r, -4, 4) };
    brushLine(ctx, [s0, m, e], r, { w: range(r, 7, 12), color: i % 3 ? '#5a5462' : '#2a2830', alpha: 1, taperIn: 4, taperOut: len * 0.7, bristles: 3, dry: 0.6, wobble: 0.5 });
  }
  // combed strands, pale over the dark, following the mass from the brow back and up
  ctx.save();
  polyPath(ctx, mass);
  ctx.clip();
  const from = { x: HEAD.x - 4, y: HEAD.y - 4 };
  for (let i = 0; i < 18; i++) {
    const a = Math.PI * 0.85 + (i / 17) * Math.PI * 0.75 + range(r, -0.06, 0.06);
    const r0 = range(r, 24, 30);
    const r1 = range(r, 52, 66);
    const s0 = { x: from.x + Math.cos(a) * r0, y: from.y + Math.sin(a) * r0 };
    const e = { x: from.x + Math.cos(a - 0.3) * r1, y: from.y + Math.sin(a - 0.3) * r1 };
    const m = { x: from.x + Math.cos(a - 0.08) * (r0 + r1) * 0.5, y: from.y + Math.sin(a - 0.08) * (r0 + r1) * 0.5 };
    brushLine(ctx, [s0, m, e], r, { w: range(r, 1.2, 2.2), color: i % 4 ? '#1e1d24' : '#b9b3c4', alpha: range(r, 0.45, 0.7), taperIn: 6, taperOut: 12 });
  }
  ctx.restore();
  // a pale rim along the top of the mass, so its silhouette reads against the storm
  ctx.save();
  ctx.beginPath();
  ctx.rect(-200, -200, 400, c.y + 200 + 4);
  ctx.clip();
  polyPath(ctx, mass);
  ctx.strokeStyle = 'rgba(190,183,200,0.45)';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.restore();
}

/** One spill of blot: an irregular wet black pool with a bleeding rim and a drip. */
function spill(ctx: CanvasRenderingContext2D, r: RNG, x: number, y: number, size: number) {
  const bleed = ctx.createRadialGradient(x, y, size * 0.4, x, y, size * 1.6);
  bleed.addColorStop(0, rgba(INK, 0.3));
  bleed.addColorStop(1, rgba(INK, 0));
  ctx.fillStyle = bleed;
  ctx.beginPath();
  ctx.arc(x, y, size * 1.6, 0, TAU);
  ctx.fill();
  const pts: Vec[] = [];
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * TAU;
    const rr = size * range(r, 0.55, 1.15);
    pts.push({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr * 0.85 });
  }
  polyPath(ctx, closedSpline(pts, 3));
  ctx.fillStyle = rgba(INK, 0.93);
  ctx.fill();
  const dx = x + range(r, -size * 0.3, size * 0.3);
  ctx.beginPath();
  ctx.moveTo(dx - size * 0.16, y + size * 0.6);
  ctx.quadraticCurveTo(dx - size * 0.1, y + size * 1.6, dx, y + size * 1.8);
  ctx.quadraticCurveTo(dx + size * 0.1, y + size * 1.6, dx + size * 0.16, y + size * 0.6);
  ctx.fill();
}

/**
 * His blot (story 3): spilled ink running over the white body, not spots. A splash over the far shoulder that
 * runs down his back in streaks and drips, and spatter. Clipped to the body so it soaks, not floats.
 */
function paintBlot(L: Layer) {
  const ctx = L.ctx;
  const r = mulberry32(77);
  ctx.save();
  polyPath(ctx, closedSpline(TORSO, 4));
  ctx.clip();
  spill(ctx, r, -14, -36, 14);
  // two runs down the back
  for (const [x, y1] of [
    [-22, -6],
    [-11, -16],
  ] as const) {
    brushLine(ctx, [{ x, y: -32 }, { x: x - 2, y: (y1 - 32) / 2 }, { x: x - 1, y: y1 }], r, { w: 5, alpha: 0.92, taperIn: 2, taperOut: 4 });
    ctx.fillStyle = rgba(INK, 0.92);
    ctx.beginPath();
    ctx.arc(x - 1, y1, 3, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  // spatter flung off it
  for (let i = 0; i < 9; i++) {
    const a = range(r, -2.6, -0.4);
    const d = range(r, 18, 34);
    ctx.fillStyle = rgba(INK, 0.9);
    ctx.beginPath();
    ctx.arc(-16 + Math.cos(a) * d, -36 + Math.sin(a) * d * 0.6 + 8, range(r, 1, 2.6), 0, TAU);
    ctx.fill();
  }
}

/** His cloud: smudges of black ink cloud under and behind him, and a dark halo so the white body reads. */
function paintCloud(L: Layer) {
  const ctx = L.ctx;
  const r = mulberry32(19);
  const halo = ctx.createRadialGradient(0, -6, 30, 0, -6, 160);
  halo.addColorStop(0, rgba(INK, 0.5));
  halo.addColorStop(0.55, rgba(INK, 0.24));
  halo.addColorStop(1, rgba(INK, 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, -6, 160, 0, TAU);
  ctx.fill();
  for (let i = 0; i < 26; i++) {
    const t = i / 25;
    const x = -160 + t * 320 + range(r, -20, 20);
    const y = 82 + Math.sin(t * Math.PI) * 18 + range(r, -16, 16) - (1 - Math.sin(t * Math.PI)) * 10;
    const rad = range(r, 24, 50) * (0.6 + 0.6 * Math.sin(t * Math.PI));
    const g = ctx.createRadialGradient(x, y, rad * 0.15, x, y, rad);
    const a = range(r, 0.4, 0.75);
    g.addColorStop(0, rgba(INK, a));
    g.addColorStop(0.6, rgba(INK, a * 0.55));
    g.addColorStop(1, rgba(INK, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, TAU);
    ctx.fill();
  }
  // dry wisps trailing back (left), the way he came from
  for (let i = 0; i < 8; i++) {
    const y = range(r, 56, 120);
    const x = range(r, -120, 50);
    brushLine(ctx, [{ x, y }, { x: x - 50, y: y + range(r, -8, 8) }, { x: x - range(r, 100, 160), y: y + range(r, -16, 10) }], r, {
      w: range(r, 6, 14),
      alpha: range(r, 0.25, 0.5),
      taperIn: 10,
      taperOut: 60,
      bristles: 5,
      dry: 1,
    });
  }
}

// ───────────────────────────────────────────── the living figure

export interface DrumLook {
  /** 1 soaked with blot .. 0 clean */
  soak: number;
  /** 1 → 0 just after he hits it (a white ring) */
  flash: number;
}

export interface ArmLook {
  /** strike progress 0..1 (0 = rest): wind up, hit at 0.5, return */
  k: number;
  /** the drum being hit */
  drum: number;
}

export interface RaijinLook {
  /** the hoop's centre, world */
  x: number;
  y: number;
  /** 1 faces right (story.md's mirrored redraw), -1 faces left */
  face: 1 | -1;
  /** animation clock (real seconds) */
  t: number;
  /** painted in (entrance) 0..1 */
  alpha: number;
  hoopRot: number;
  drums: DrumLook[];
  front: ArmLook;
  back: ArmLook;
  expr: Expr;
  /** how much blot is on his body, 0..1 */
  blot: number;
  /** body tilt (radians): recoil when hit, a rocking laugh */
  lean: number;
}

/** A drum's centre on the hoop (local frame), drum 0 at the top, then clockwise. */
export function drumPos(i: number, n: number, hoopRot: number): Vec {
  const a = -Math.PI / 2 + (i / n) * TAU + hoopRot;
  return { x: Math.cos(a) * HOOP_R * 1.04, y: Math.sin(a) * HOOP_R * 0.96 };
}

/** Two-bone IK: the elbow for a hand at `t` from shoulder `s` (bend +1 / -1 picks the side). */
function ik(s: Vec, t: Vec, bend: number): { elbow: Vec; hand: Vec } {
  let dx = t.x - s.x;
  let dy = t.y - s.y;
  let d = Math.hypot(dx, dy) || 1;
  const max = UPPER + FORE - 0.5;
  if (d > max) {
    dx *= max / d;
    dy *= max / d;
    d = max;
  }
  d = Math.max(8, d);
  const a = Math.atan2(dy, dx);
  const cosA = Math.max(-1, Math.min(1, (UPPER * UPPER + d * d - FORE * FORE) / (2 * UPPER * d)));
  const A = Math.acos(cosA) * bend;
  const elbow = { x: s.x + Math.cos(a + A) * UPPER, y: s.y + Math.sin(a + A) * UPPER };
  return { elbow, hand: { x: s.x + dx, y: s.y + dy } };
}

/** Catmull-Rom through `p`, `n` points per span. */
function spline(p: Vec[], n: number): Vec[] {
  const out: Vec[] = [];
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[Math.max(0, i - 1)];
    const p1 = p[i];
    const p2 = p[i + 1];
    const p3 = p[Math.min(p.length - 1, i + 2)];
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  out.push(p[p.length - 1]);
  return out;
}

/**
 * A ribbon of sash along `c` that twists: where it turns over, its pale underside shows (Sōtatsu's heavy black
 * sash with the white lining). Width tapers from w0 to w1 and flares a little at the free end.
 */
function drawSash(ctx: CanvasRenderingContext2D, c: Vec[], w0: number, w1: number, twist: (u: number) => number) {
  const ns = normals(c);
  const n = c.length;
  const edgeA: Vec[] = [];
  const edgeB: Vec[] = [];
  const side: number[] = [];
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const tw = twist(u);
    const flare = 1 + Math.max(0, (u - 0.85) / 0.15) * 0.5;
    const hw = ((w0 + (w1 - w0) * u) / 2) * flare * Math.max(0.16, Math.abs(tw));
    edgeA.push({ x: c[i].x + ns[i].x * hw, y: c[i].y + ns[i].y * hw });
    edgeB.push({ x: c[i].x - ns[i].x * hw, y: c[i].y - ns[i].y * hw });
    side.push(tw >= 0 ? 1 : -1);
  }
  // fill runs of the same face in one path each
  let i = 0;
  while (i < n - 1) {
    let j = i + 1;
    while (j < n - 1 && side[j] === side[i]) j++;
    ctx.beginPath();
    ctx.moveTo(edgeA[i].x, edgeA[i].y);
    for (let k = i + 1; k <= j; k++) ctx.lineTo(edgeA[k].x, edgeA[k].y);
    for (let k = j; k >= i; k--) ctx.lineTo(edgeB[k].x, edgeB[k].y);
    ctx.closePath();
    ctx.fillStyle = side[i] > 0 ? '#17161c' : '#e4dfd6';
    ctx.fill();
    i = j;
  }
  // a pale rim (the lining's edge) so the black sash reads against the storm, then a fine ink line inside it
  ctx.beginPath();
  edgeA.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.lineTo(edgeB[n - 1].x, edgeB[n - 1].y);
  for (let k = n - 2; k >= 0; k--) ctx.lineTo(edgeB[k].x, edgeB[k].y);
  ctx.strokeStyle = 'rgba(226,219,206,0.7)';
  ctx.lineWidth = 2.4;
  ctx.stroke();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.9;
  ctx.stroke();
}

/** Where each arm rests, and where its bachi points at rest (radians, local frame). */
const REST_F = { hand: { x: 66, y: -2 }, bachi: 1.05 };
const REST_B = { hand: { x: -42, y: -80 }, bachi: -2.8 };

export class RaijinArt {
  private scale = 0;
  private torso: Layer | null = null;
  private head: Record<Expr, Layer> | null = null;
  private legF: Layer | null = null;
  private legB: Layer | null = null;
  private blot: Layer | null = null;
  private mane: Layer | null = null;
  private cloud: Layer | null = null;
  private drumSoaked: Layer | null = null;
  private drumClean: Layer | null = null;

  /** Paint the still parts at the game's scale (call again when it changes). */
  build(scale: number) {
    if (this.torso && Math.abs(scale - this.scale) / scale < 0.04) return;
    this.scale = scale;
    const s = scale;
    // every figure layer shares one frame: local x -115..115, y -125..115
    const fig = () => layer(230, 240, 115, 125, s);
    this.legB = fig();
    paintLeg(this.legB, LEG_B.hip, LEG_B.knee, LEG_B.an, LEG_B.toe, true);
    this.legF = fig();
    paintLeg(this.legF, LEG_F.hip, LEG_F.knee, LEG_F.an, LEG_F.toe, false);
    this.torso = fig();
    paintTorso(this.torso.ctx, mulberry32(5));
    const mk = (expr: Expr) => {
      const L = fig();
      paintHead(L.ctx, mulberry32(9), expr);
      return L;
    };
    this.head = { grin: mk('grin'), scowl: mk('scowl') };
    this.blot = fig();
    paintBlot(this.blot);
    this.mane = fig();
    paintMane(this.mane);
    this.cloud = layer(450, 370, 225, 190, s);
    paintCloud(this.cloud);
    this.drumSoaked = layer(48, 58, 24, 24, s);
    paintDrum(this.drumSoaked, true);
    this.drumClean = layer(48, 58, 24, 24, s);
    paintDrum(this.drumClean, false);
  }

  /** Blit a figure layer turned by `a` about the local point `p`. */
  private turned(ctx: CanvasRenderingContext2D, L: Layer, p: Vec, a: number) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(a);
    blit(ctx, L, -p.x, -p.y);
    ctx.restore();
  }

  private arm(ctx: CanvasRenderingContext2D, sh: Vec, rest: { hand: Vec; bachi: number }, a: ArmLook, L: RaijinLook, bend: number) {
    const d = drumPos(a.drum, L.drums.length, L.hoopRot);
    const dl = Math.hypot(d.x, d.y) || 1;
    // the hand that lands the bachi on the drum, and a wind-up drawn back past the rest pose
    const hit = { x: d.x - (d.x / dl) * (BACHI * 0.95 + DRUM_R * 0.4), y: d.y - (d.y / dl) * (BACHI * 0.95 + DRUM_R * 0.4) };
    const r0 = rest.hand;
    const wind = { x: r0.x + (r0.x - hit.x) * 0.35, y: r0.y - 8 };
    const k = a.k;
    let target: Vec;
    let toward = 0;
    if (k <= 0) target = r0;
    else if (k < 0.4) target = lerp(r0, wind, Math.sin((k / 0.4) * Math.PI * 0.5));
    else if (k < 0.55) {
      const u = (k - 0.4) / 0.15;
      target = lerp(wind, hit, u * u);
      toward = u;
    } else {
      const u = Math.min(1, (k - 0.55) / 0.45);
      target = lerp(hit, r0, 1 - (1 - u) * (1 - u));
      toward = 1 - u;
    }
    // a breath of idle motion
    target = { x: target.x + Math.sin(L.t * 2.1 + bend) * 2.5, y: target.y + Math.cos(L.t * 2.6 + bend) * 3 };
    const { elbow, hand } = ik(sh, target, bend);
    const path = closedSpline(limbPath([sh, lerp(sh, elbow, 0.5), elbow, lerp(elbow, hand, 0.45), hand], [12, 10.5, 8, 9, 6.5]), 3);
    paleFill(ctx, path, 2.6);
    // a crease at the elbow and the forearm's muscle
    ctx.strokeStyle = 'rgba(70,66,80,0.55)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    const q = lerp(elbow, hand, 0.4);
    ctx.moveTo(elbow.x, elbow.y);
    ctx.quadraticCurveTo(q.x + (hand.y - elbow.y) * 0.12 * bend, q.y - (hand.x - elbow.x) * 0.12 * bend, lerp(elbow, hand, 0.7).x, lerp(elbow, hand, 0.7).y);
    ctx.stroke();
    if (L.blot > 0.05) {
      // blot running down the forearm
      ctx.strokeStyle = rgba(INK, 0.85 * L.blot);
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(lerp(elbow, hand, 0.15).x, lerp(elbow, hand, 0.15).y);
      ctx.lineTo(lerp(elbow, hand, 0.6).x, lerp(elbow, hand, 0.6).y);
      ctx.stroke();
    }
    // wrist ring and fist
    const fa = Math.atan2(hand.y - elbow.y, hand.x - elbow.x);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.ellipse(lerp(elbow, hand, 0.82).x, lerp(elbow, hand, 0.82).y, 3.2, 8, fa, 0, TAU);
    ctx.stroke();
    // the bachi: held at its rest angle, swung onto the drum while striking
    const out = { x: Math.cos(rest.bachi), y: Math.sin(rest.bachi) };
    const td = { x: d.x - hand.x, y: d.y - hand.y };
    const tl = Math.hypot(td.x, td.y) || 1;
    let bx = out.x + (td.x / tl - out.x) * toward;
    let by = out.y + (td.y / tl - out.y) * toward;
    const bl = Math.hypot(bx, by) || 1;
    bx /= bl;
    by /= bl;
    const tip = { x: hand.x + bx * BACHI, y: hand.y + by * BACHI };
    // ink with a pale edge, so it reads against his dark cloud as well as the paper
    ctx.strokeStyle = 'rgba(228,221,208,0.75)';
    ctx.lineWidth = 7.6;
    ctx.beginPath();
    ctx.moveTo(hand.x - bx * 6, hand.y - by * 6);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();
    ctx.fillStyle = 'rgba(228,221,208,0.75)';
    ctx.beginPath();
    ctx.ellipse(tip.x, tip.y, 9, 7.4, Math.atan2(by, bx), 0, TAU);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4.6;
    ctx.beginPath();
    ctx.moveTo(hand.x - bx * 6, hand.y - by * 6);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.ellipse(tip.x, tip.y, 7.5, 6, Math.atan2(by, bx), 0, TAU);
    ctx.fill();
    // the fist round the bachi, knuckles toward the drum
    ctx.fillStyle = BODY;
    ctx.beginPath();
    ctx.ellipse(hand.x, hand.y, 9, 7.6, fa, 0, TAU);
    ctx.fill();
    ctx.lineWidth = 2.4;
    ctx.stroke();
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = -1; i <= 1; i++) {
      const kx = hand.x + Math.cos(fa) * 4 + Math.cos(fa + Math.PI / 2) * i * 3.4;
      const ky = hand.y + Math.sin(fa) * 4 + Math.sin(fa + Math.PI / 2) * i * 3.4;
      ctx.moveTo(kx, ky);
      ctx.lineTo(kx + Math.cos(fa) * 3.6, ky + Math.sin(fa) * 3.6);
    }
    ctx.stroke();
  }

  /**
   * The sash (heavy, black, pale-lined): worn over the shoulders, it loops up behind the mane and streams back
   * (left, with the wind of his travel) in a long S; its other end trails from the waist.
   */
  private sash(ctx: CanvasRenderingContext2D, L: RaijinLook) {
    const t = L.t;
    const w = (i: number, amp: number, f = 1) => Math.sin(t * 2.7 * f - i * 0.85) * amp;
    const main = [
      { x: 22, y: -40 },
      { x: 50 + w(0, 1.5), y: -74 + w(1, 2) },
      { x: 34 + w(1, 2), y: -98 + w(2, 2) },
      { x: -4 + w(2, 3), y: -100 + w(3, 3) },
      { x: -50 + w(3, 5), y: -88 + w(4, 6) },
      { x: -96 + w(4, 7), y: -66 + w(5, 9) },
      { x: -142 + w(5, 9), y: -90 + w(6, 11) },
      { x: -188 + w(6, 11), y: -70 + w(7, 14) },
      { x: -234 + w(7, 13), y: -94 + w(8, 14) },
      { x: -268 + w(8, 15), y: -78 + w(9, 16) },
    ];
    drawSash(ctx, spline(main, 6), 24, 11, (u) => Math.cos(u * 4.6 - t * 2.2 + 0.4));
    const tail = [
      { x: -22, y: 8 },
      { x: -58 + w(0, 3, 1.3), y: 22 + w(1, 4, 1.3) },
      { x: -100 + w(1, 6, 1.3), y: 6 + w(2, 7, 1.3) },
      { x: -142 + w(2, 9, 1.3), y: 26 + w(3, 10, 1.3) },
      { x: -182 + w(3, 11, 1.3), y: 10 + w(4, 12, 1.3) },
    ];
    drawSash(ctx, spline(tail, 6), 17, 8, (u) => Math.cos(u * 3.8 - t * 2.6 + 1.5));
  }

  /** The hoop: a thin ring behind him, brushed (it breaks where the brush lifts); his limbs break out past it. */
  private hoop(ctx: CanvasRenderingContext2D, L: RaijinLook) {
    const rx = HOOP_R * 1.04;
    const ry = HOOP_R * 0.96;
    const r0 = L.hoopRot;
    const arcs: [number, number, number][] = [
      [0.15, 2.05, 4.6],
      [2.2, 4.0, 3.6],
      [4.12, 6.08, 4.2],
    ];
    for (const [a, b, wdt] of arcs) {
      ctx.strokeStyle = rgba(INK, 0.92);
      ctx.lineWidth = wdt;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, a + r0, b + r0);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(214,204,186,0.72)';
      ctx.lineWidth = 1.3;
      ctx.stroke();
    }
  }

  draw(ctx: CanvasRenderingContext2D, L: RaijinLook) {
    if (!this.torso || !this.head || L.alpha <= 0.01) return;
    const t = L.t;
    ctx.save();
    ctx.translate(L.x, L.y);
    ctx.scale(L.face, 1);
    ctx.rotate(L.lean);
    ctx.globalAlpha = L.alpha;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // his cloud, drifting under him, and the hoop behind him
    blit(ctx, this.cloud!, Math.sin(t * 0.7) * 5, Math.sin(t * 0.9) * 3);
    this.hoop(ctx, L);
    // the figure rides the air: a slow heave, the legs paddling, the mane and head swaying
    ctx.save();
    ctx.translate(0, Math.sin(t * 2.6) * 2);
    this.sash(ctx, L);
    this.turned(ctx, this.mane!, MANE_ROOT, Math.sin(t * 2.3) * 0.05);
    this.arm(ctx, SHOULDER_B, REST_B, L.back, L, -1);
    this.turned(ctx, this.legB!, HIP_B, Math.sin(t * 2.6 + 2) * 0.07);
    blit(ctx, this.torso, 0, 0);
    if (L.blot > 0.01) {
      ctx.globalAlpha = L.alpha * Math.min(1, L.blot);
      blit(ctx, this.blot!, 0, 0);
      ctx.globalAlpha = L.alpha;
    }
    this.turned(ctx, this.legF!, HIP_F, Math.sin(t * 2.6) * 0.06);
    this.turned(ctx, this.head[L.expr], NECK, Math.sin(t * 1.9) * 0.035);
    this.arm(ctx, SHOULDER_F, REST_F, L.front, L, 1);
    ctx.restore();
    // the drums last, over everything: they are the health bar (4.8), so none is ever hidden behind him
    const n = L.drums.length;
    for (let i = 0; i < n; i++) {
      const d = L.drums[i];
      const p = drumPos(i, n, L.hoopRot);
      const jig = d.flash * 3;
      const px = p.x + Math.sin(t * 9 + i) * jig;
      const py = p.y + Math.cos(t * 11 + i) * jig;
      if (d.soak < 1) blit(ctx, this.drumClean!, px, py);
      if (d.soak > 0) {
        ctx.globalAlpha = L.alpha * Math.min(1, d.soak);
        blit(ctx, this.drumSoaked!, px, py);
        ctx.globalAlpha = L.alpha;
      }
    }
    // drum flashes: a white ring bursting off the head he just hit
    for (let i = 0; i < n; i++) {
      const f = L.drums[i].flash;
      if (f <= 0.02) continue;
      const p = drumPos(i, n, L.hoopRot);
      ctx.strokeStyle = `rgba(255,255,255,${0.9 * f})`;
      ctx.lineWidth = 3 + 3 * f;
      ctx.beginPath();
      ctx.arc(p.x, p.y, DRUM_R + (1 - f) * 22, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = rgba(INK, 0.6 * f);
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();
  }
}

// ───────────────────────────────────────────── the strike (4.2): mark, thread, bolt, impact, scorch

const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** A jagged line from a to b: segments of about `seg`, kicked sideways up to `amp` (ends stay put). */
function jag(a: Vec, b: Vec, seg: number, amp: number, seed: number): Vec[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = Math.hypot(dx, dy) || 1;
  const n = Math.max(2, Math.round(L / seg));
  const nx = -dy / L;
  const ny = dx / L;
  const out: Vec[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const k = i === 0 || i === n ? 0 : (hash(seed * 31 + i) - 0.5) * 2 * amp;
    out.push({ x: a.x + dx * u + nx * k, y: a.y + dy * u + ny * k });
  }
  return out;
}

function strokePts(ctx: CanvasRenderingContext2D, pts: Vec[], style: string, w: number) {
  ctx.strokeStyle = style;
  ctx.lineWidth = w;
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.stroke();
}

/**
 * The mark on the road: an ink circle 80 wide (seen from the side, so flattened) with a turning mitsudomoe,
 * painted in as it appears and filled solid in the last half second (`fill`).
 */
export function drawMark(ctx: CanvasRenderingContext2D, x: number, gy: number, appear: number, fill: number, t: number) {
  if (appear <= 0) return;
  ctx.save();
  ctx.lineCap = 'round';
  const a = Math.min(1, appear);
  const rx = 40 * (0.55 + 0.45 * a);
  const ry = 12 * (0.55 + 0.45 * a);
  const cy = gy + 1;
  // a pale halo on the road so the mark reads at phone size
  ctx.fillStyle = `rgba(255,255,255,${0.35 * a})`;
  ctx.beginPath();
  ctx.ellipse(x, cy - 2, rx + 12, ry + 6, 0, 0, TAU);
  ctx.fill();
  {
    ctx.fillStyle = rgba(INK, 0.2 * a + 0.55 * fill);
    ctx.beginPath();
    ctx.ellipse(x, cy, rx, ry, 0, 0, TAU);
    ctx.fill();
  }
  tomoePath(ctx, x, cy, rx * 0.86, t * 2.2, 0.25);
  ctx.fillStyle = rgba(INK, (0.45 + 0.5 * fill) * a);
  ctx.fill();
  ctx.strokeStyle = rgba(INK, 0.95 * a);
  ctx.lineWidth = 4.5 + fill * 2;
  ctx.beginPath();
  ctx.ellipse(x, cy, rx, ry, 0, 0, TAU * Math.min(1, appear * 1.6));
  ctx.stroke();
  // pale paper-white rim light so the mark reads on dark ground or in the pale
  ctx.strokeStyle = `rgba(255,255,255,${0.55 * a})`;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(x, cy - 1.5, rx + 3, ry + 1.5, 0, Math.PI * 1.05, Math.PI * 1.95);
  ctx.stroke();
  ctx.restore();
}

/** The crackling thread: paper-white edged in ink, grown from the cloud (yTop) down to the mark. */
export function drawThread(ctx: CanvasRenderingContext2D, x: number, yTop: number, gy: number, grow: number, bright: number, t: number, seed: number) {
  if (grow <= 0) return;
  const yEnd = yTop + (gy - yTop) * Math.min(1, grow);
  const pts = jag({ x, y: yTop }, { x, y: yEnd }, 24, 8 + 3 * bright, seed * 7 + Math.floor(t * 15));
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (bright > 0) strokePts(ctx, pts, `rgba(255,255,255,${0.25 * bright})`, 18);
  strokePts(ctx, pts, 'rgba(255,255,255,0.3)', 14);
  strokePts(ctx, pts, rgba(INK, 0.9), 8 + 3 * bright);
  strokePts(ctx, pts, `rgba(255,255,255,${0.9 + 0.1 * bright})`, 3 + 2.4 * bright);
  // where it leaves the cloud: a knot of black
  const g = ctx.createRadialGradient(x, yTop, 2, x, yTop, 34);
  g.addColorStop(0, rgba(INK, 0.75));
  g.addColorStop(1, rgba(INK, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, yTop, 34, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** A bolt: Raijin's (paper-white edged in black, from the cloud to its tip) or a returned one (purple, yours). */
export function drawBolt(ctx: CanvasRenderingContext2D, from: Vec, tip: Vec, t: number, mine: boolean, seed: number) {
  const pts = jag(from, tip, 22, mine ? 9 : 12, seed * 13 + Math.floor(t * 30));
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (mine) {
    strokePts(ctx, pts, rgba(M.light, 0.35), 24);
    strokePts(ctx, pts, rgba(M.color, 0.95), 11);
    strokePts(ctx, pts, rgba(M.light, 0.95), 5.5);
    strokePts(ctx, pts, 'rgba(255,255,255,0.95)', 2.2);
  } else {
    strokePts(ctx, pts, 'rgba(255,255,255,0.4)', 30);
    strokePts(ctx, pts, rgba(INK, 0.95), 14);
    strokePts(ctx, pts, 'rgba(255,255,255,1)', 6);
    // two forks
    for (let k = 1; k <= 2; k++) {
      const i = Math.floor(pts.length * (0.3 + 0.25 * k));
      if (i <= 0 || i >= pts.length - 1) continue;
      const p = pts[i];
      const side = hash(seed + k) < 0.5 ? -1 : 1;
      const end = { x: p.x + side * (26 + 20 * hash(seed + k * 3)), y: p.y + 30 + 20 * hash(seed + k * 5) };
      const f = jag(p, end, 12, 5, seed + k * 17 + Math.floor(t * 30));
      strokePts(ctx, f, rgba(INK, 0.9), 6);
      strokePts(ctx, f, 'rgba(255,255,255,0.95)', 2.4);
    }
  }
  ctx.restore();
}

/**
 * Impact: the lethal column (hw each side, drawn at exactly the width that kills) for 0.2 s, a ±40 u splash for
 * 0.25 s, and a local glow (`glow` 1 with the group's flash, less without), ramped in over 80 ms. No full-screen flash.
 */
export function drawImpact(ctx: CanvasRenderingContext2D, x: number, yTop: number, gy: number, age: number, seed: number, glow = 1, hw = 20) {
  if (age > 0.45) return;
  ctx.save();
  if (age < 0.38) {
    const k = (age < 0.08 ? age / 0.08 : 1 - (age - 0.08) / 0.3) * glow;
    const g = ctx.createRadialGradient(x, gy - 30, 10, x, gy - 30, 190);
    g.addColorStop(0, `rgba(255,255,255,${0.5 * k})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 190, gy - 220, 380, 260);
  }
  if (age < 0.2) {
    // the column keeps its lethal width while it kills; only its light fades
    const k = 1 - (age / 0.2) * 0.55;
    const w = hw * 2 - 6;
    const pts = jag({ x, y: yTop }, { x, y: gy }, 30, 3, seed + Math.floor(age * 40));
    ctx.lineCap = 'butt';
    strokePts(ctx, pts, rgba(INK, 0.9 * k), w + 6);
    strokePts(ctx, pts, `rgba(255,255,255,${k})`, w - 2);
  }
  if (age < 0.25) {
    // the splash: ink flung up from the strike point
    const k = age / 0.25;
    ctx.fillStyle = rgba(INK, 0.85 * (1 - k));
    for (let i = 0; i < 12; i++) {
      const a = Math.PI + (i / 11) * Math.PI;
      const d = 14 + 40 * k * (0.6 + 0.4 * hash(seed + i));
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * d, gy + Math.sin(a) * d * 0.7, 4.5 * (1 - k * 0.6), 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** A ring painted on Raijin, torn by his storm: its circle flung apart in wind-blown purple scraps (k 0 → 1). */
export function drawTear(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, k: number) {
  if (k >= 1 || k < 0) return;
  ctx.save();
  ctx.lineCap = 'round';
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * TAU + k * 0.8;
    const a1 = a0 + (TAU / n) * (0.7 - 0.4 * k);
    // the wind drags each scrap back (left) and out
    const dx = -k * k * (90 + 50 * hash(i + 3));
    const dr = r * (1 + 0.5 * k);
    ctx.strokeStyle = rgba(M.color, 0.85 * (1 - k));
    ctx.lineWidth = 5 * (1 - k * 0.6);
    ctx.beginPath();
    ctx.arc(x + dx, y, dr, a0, a1);
    ctx.stroke();
  }
  ctx.strokeStyle = rgba(INK, 0.5 * (1 - k));
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 5; i++) {
    const yy = y - r + (2 * r * (i + 0.5)) / 5;
    const len = 60 + 80 * k;
    ctx.beginPath();
    ctx.moveTo(x + r * 0.8 - k * 120, yy);
    ctx.lineTo(x + r * 0.8 - k * 120 - len, yy + 6);
    ctx.stroke();
  }
  ctx.restore();
}

/** The flat black scorch a blotted bolt leaves on the road, fading over a few seconds. */
export function drawScorch(ctx: CanvasRenderingContext2D, x: number, gy: number, age: number, seed: number) {
  const k = age < 4 ? 1 : Math.max(0, 1 - (age - 4) / 4);
  if (k <= 0) return;
  ctx.save();
  ctx.fillStyle = rgba(INK, 0.8 * k);
  ctx.beginPath();
  ctx.ellipse(x, gy + 1.5, 42, 6.5, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = rgba(INK, 0.5 * k);
  ctx.lineWidth = 2;
  for (let i = 0; i < 9; i++) {
    const s = i % 2 ? 1 : -1;
    const len = 30 + 26 * hash(seed + i);
    ctx.beginPath();
    ctx.moveTo(x + s * 18, gy + 1);
    ctx.lineTo(x + s * (18 + len), gy + 1 + (hash(seed + i * 7) - 0.5) * 6);
    ctx.stroke();
  }
  ctx.restore();
}

/** N10: while the traveler is dying, the cause is outlined in red-brown ink (the column and the uncaught mark). */
export function drawCause(ctx: CanvasRenderingContext2D, x: number, yTop: number, gy: number, k: number, hw = 20) {
  if (k <= 0) return;
  ctx.save();
  ctx.strokeStyle = `rgba(150,40,20,${0.85 * k})`;
  ctx.lineWidth = 4;
  ctx.setLineDash([10, 8]);
  ctx.strokeRect(x - hw - 4, yTop, hw * 2 + 8, gy - yTop);
  ctx.setLineDash([]);
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.ellipse(x, gy + 1, 52, 14, 0, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

// ───────────────────────────────────────────── the arena's sky: screen-anchored storm cloud (4.5)

const SKY_W = 1600;
const SKY_H = 430;

/**
 * The storm over the arena, anchored to the screen (it never scrolls with the world, so the loop's wrap moves
 * nothing in it). A paper wash hides the far hills (their parallax would jump at the wrap), a deep band of black
 * cloud fills the top of the scroll and drifts in time, wind streaks race back across it, and lightning lights the
 * band from inside (through the flash limiter: ramped, capped, never full white). After the road, `grade` sinks
 * the whole view into an ink wash, so the storm reads in value and palette, not only in the sky.
 */
export class StormSky {
  private band: HTMLCanvasElement | null = null;
  private hs = 0;
  private wind: [number, number, number, number, number][] = [];

  build(hs: number) {
    if (this.band && Math.abs(hs - this.hs) / hs < 0.04) return;
    this.hs = hs;
    const L = layer(SKY_W, SKY_H, 0, 0, hs);
    const ctx = L.ctx;
    const r = mulberry32(2024);
    const g = ctx.createLinearGradient(0, 0, 0, SKY_H);
    g.addColorStop(0, rgba(INK, 0.78));
    g.addColorStop(0.35, rgba(INK, 0.5));
    g.addColorStop(0.7, rgba(INK, 0.16));
    g.addColorStop(1, rgba(INK, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SKY_W, SKY_H);
    // cloud masses, painted three times across the seam so the band tiles; the lowest hang in ragged bellies
    const blobs: [number, number, number, number][] = [];
    for (let i = 0; i < 56; i++) blobs.push([range(r, 0, SKY_W), range(r, -40, 230), range(r, 50, 140), range(r, 0.2, 0.48)]);
    for (const off of [-SKY_W, 0, SKY_W]) {
      for (const [x, y, rad, a] of blobs) {
        const bx = x + off;
        if (bx + rad < 0 || bx - rad > SKY_W) continue;
        const gg = ctx.createRadialGradient(bx, y, rad * 0.1, bx, y, rad);
        gg.addColorStop(0, rgba(INK, a));
        gg.addColorStop(0.6, rgba(INK, a * 0.5));
        gg.addColorStop(1, rgba(INK, 0));
        ctx.fillStyle = gg;
        ctx.beginPath();
        ctx.arc(bx, y, rad, 0, TAU);
        ctx.fill();
      }
    }
    // dry streaks of wind-driven cloud
    const streaks: [number, number, number, number][] = [];
    for (let i = 0; i < 28; i++) streaks.push([range(r, 0, SKY_W), range(r, 40, 330), range(r, 140, 380), range(r, 0.14, 0.34)]);
    for (const off of [-SKY_W, 0, SKY_W]) {
      for (const [x, y, len, a] of streaks) {
        const bx = x + off;
        if (bx + len < 0 || bx > SKY_W) continue;
        const sr = mulberry32(Math.floor(x * 13 + y));
        brushLine(ctx, [{ x: bx, y }, { x: bx + len * 0.5, y: y - 6 }, { x: bx + len, y: y + 4 }], sr, { w: range(sr, 8, 20), alpha: a, taperIn: 30, taperOut: 80, bristles: 6, dry: 1, wobble: 0.5 });
      }
    }
    this.band = L.c;
    // wind: thin streaks racing back (left) across the view, screen space: [x 0..1, y 0..1, length, speed, alpha]
    const wr = mulberry32(77);
    this.wind = Array.from({ length: 16 }, () => [wr(), range(wr, 0.08, 0.86), range(wr, 70, 190), range(wr, 0.5, 1.1), range(wr, 0.1, 0.26)] as [number, number, number, number, number]);
  }

  /** k: how much storm (0 none .. 1 the arena); flash: lightning in the band 0..1 (limiter-ramped). Screen space. */
  draw(ctx: CanvasRenderingContext2D, W: number, H: number, k: number, flash: number, t: number) {
    if (k <= 0.001 || !this.band) return;
    const hs = H / VIEW_H;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = k;
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);
    const bw = SKY_W * hs;
    const off = ((t * 18) % SKY_W) * hs;
    for (let x = -off; x < W; x += bw) ctx.drawImage(this.band, x, 0, bw, SKY_H * hs);
    if (flash > 0.001) {
      // a lit cloud: at most a 20 % luminance lift, in the band only
      const g = ctx.createLinearGradient(0, 0, 0, SKY_H * hs);
      g.addColorStop(0, `rgba(255,255,255,${0.2 * flash})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, SKY_H * hs);
    }
    ctx.restore();
  }

  /**
   * The storm's grade, drawn over the world's ground and backdrop (screen space): an ink wash multiplied over the
   * whole view, darkest at the top. A flash lifts it by at most a fifth (the limiter's 20 % rule). Then the wind.
   */
  grade(ctx: CanvasRenderingContext2D, W: number, H: number, k: number, flash: number, t: number) {
    if (k <= 0.001) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = k * (1 - 0.2 * flash);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgb(112,110,126)');
    g.addColorStop(0.45, 'rgb(150,147,160)');
    g.addColorStop(1, 'rgb(168,163,170)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    const hs = H / VIEW_H;
    ctx.lineCap = 'round';
    for (const [x0, y0, len, sp, a] of this.wind) {
      const span = W + len * hs * 2;
      const x = W + len * hs - ((x0 * span + t * sp * 900 * hs) % span);
      const y = y0 * H + Math.sin(t * 1.3 + x0 * 9) * 6 * hs;
      ctx.globalAlpha = k * a;
      ctx.strokeStyle = y0 < 0.4 ? 'rgba(239,230,211,0.9)' : rgba(INK, 0.8);
      ctx.lineWidth = 1.4 * hs;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + len * hs, y - len * hs * 0.08);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// ───────────────────────────────────────────── the arena road, painted with a period

/** One painted road tile per (period, scale), shared by every stretch of road. */
const ROAD_TILES = new Map<string, HTMLCanvasElement>();

/**
 * One stretch of the arena road (the storm ridge), drawn over the terrain over [a, b]. Its look repeats every
 * `period` u from `anchor` (a phase seam), so the view around a seam is the same picture at every seam: when the
 * loop wraps the traveler back from loopEnd to x0, the road under them is pixel-for-pixel the same, whatever the
 * loop's length. Stretches meet in mid-loop: `joinPrev` fades this one in over the previous one (a crossfade of
 * XFADE u), `joinNext` runs it XFADE/2 past b under the next. Outer ends fade into the terrain. Painted once into
 * one tile at the game's scale; per frame it is a few drawImage calls.
 */
export class ArenaGround {
  private tile: HTMLCanvasElement | null = null;
  private scale = 0;
  private static readonly TOP = 44;
  private static readonly DEPTH = 460;
  private static readonly PAD = 8;
  static readonly XFADE = 320;
  /** Torn-lip step down a gap's edge, and how deep the lip's ink runs. */
  private static readonly LIP_STEP = 14;
  private static readonly LIP_INK = 150;
  /**
   * The road's open gaps (world x0..x1, from the level's islands): the tile is cut out over each, with a torn paper
   * lip at each edge (the paper overhangs the drop by 0 to 9 u, jagged; above the line the soft top tapers back
   * 36 u), so the terrain's own chasm shows through.
   * The jag is seeded by the gap's x, so it is the same picture every pass.
   */
  holes: { x0: number; x1: number; l: number[]; r: number[] }[] = [];

  setGaps(gaps: [number, number][]) {
    const n = Math.ceil((ArenaGround.TOP + ArenaGround.DEPTH + 8) / ArenaGround.LIP_STEP) + 1;
    this.holes = gaps.map(([x0, x1]) => {
      const r = mulberry32(Math.round(x0) * 7 + Math.round(x1));
      // above the ground line (rows 0-2) the hole widens into the road's soft paper top, so that pale band tapers
      // into the drop instead of ending in a square corner; below it the paper overhangs the drop, jagged
      const jag = () => Array.from({ length: n }, (_, i) => (i < 3 ? -(3 - i) * 12 : i === 3 ? 0 : range(r, 0, 9) * Math.min(1, (i - 3) / 3)));
      return { x0, x1, l: jag(), r: jag() };
    });
  }

  constructor(
    readonly gy: number,
    readonly anchor: number,
    readonly period: number,
    readonly a: number,
    readonly b: number,
    readonly joinPrev = false,
    readonly joinNext = false,
  ) {}

  build(scale: number) {
    if (this.tile && Math.abs(scale - this.scale) / scale < 0.02) return;
    const key = `${this.period}:${scale.toFixed(4)}`;
    const shared = ROAD_TILES.get(key);
    if (shared) {
      this.scale = scale;
      this.tile = shared;
      return;
    }
    this.scale = scale;
    const P = this.period;
    const PAD = ArenaGround.PAD;
    const TOP = ArenaGround.TOP;
    // local frame: x 0 at a period start, y 0 at the ground line
    const L = layer(P + PAD, TOP + ArenaGround.DEPTH, 0, TOP, scale);
    const ctx = L.ctx;
    const r = mulberry32(4500);
    // paper: a soft top above the line (hides the terrain's own lip and grass), solid below
    const top = ctx.createLinearGradient(0, -TOP, 0, -26);
    top.addColorStop(0, 'rgba(239,230,211,0)');
    top.addColorStop(1, PAPER);
    ctx.fillStyle = top;
    ctx.fillRect(0, -TOP, P + PAD, TOP - 26);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, -26, P + PAD, 26 + ArenaGround.DEPTH);
    const g = ctx.createLinearGradient(0, 0, 0, 420);
    g.addColorStop(0, rgba(INK, 0.5));
    g.addColorStop(0.07, rgba(INK, 0.22));
    g.addColorStop(0.3, rgba(INK, 0.07));
    g.addColorStop(1, rgba(INK, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, P + PAD, 420);
    ctx.strokeStyle = rgba(INK, 0.16);
    ctx.lineWidth = 22;
    ctx.beginPath();
    ctx.moveTo(0, 12);
    ctx.lineTo(P + PAD, 12);
    ctx.stroke();
    const wrap = (fn: (o: number) => void) => {
      for (const o of [-P, 0, P]) fn(o);
    };
    // dry-brush strata
    for (let k = 0; k < Math.floor(P / 22); k++) {
      const x = range(r, 0, P);
      const len = range(r, 30, 180);
      const depth = Math.pow(r(), 1.6) * 300 + 14;
      const a = range(r, 0.04, 0.16) * (1 - depth / 380);
      const w = range(r, 1.5, 5);
      const sd = Math.floor(r() * 1e9);
      const d1 = range(r, -3, 3);
      const d2 = range(r, -4, 4);
      wrap((o) => {
        if (x + o + len < -10 || x + o > P + PAD + 10) return;
        brushLine(ctx, [{ x: x + o, y: depth }, { x: x + o + len * 0.5, y: depth + d1 }, { x: x + o + len, y: depth + d2 }], mulberry32(sd), { w, alpha: a, bristles: 2, dry: 1 });
      });
    }
    // soft wash blots
    for (let k = 0; k < Math.floor(P / 90); k++) {
      const x = range(r, 0, P);
      const depth = range(r, 18, 110);
      const rad = range(r, 30, 90);
      const a = range(r, 0.04, 0.1);
      wrap((o) => {
        const bx = x + o;
        if (bx + rad * 1.6 < 0 || bx - rad * 1.6 > P + PAD) return;
        const bg = ctx.createRadialGradient(bx, depth, 2, bx, depth, rad);
        bg.addColorStop(0, rgba(INK, a));
        bg.addColorStop(1, rgba(INK, 0));
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.ellipse(bx, depth, rad * 1.6, rad * 0.6, 0, 0, TAU);
        ctx.fill();
      });
    }
    // the ground line: a loaded brush whose wobble repeats with the period
    const f = (x: number, k: number, ph: number) => Math.sin((TAU * k * x) / P + ph);
    const n = Math.ceil((P + PAD) / 6);
    const upper: Vec[] = [];
    const lower: Vec[] = [];
    for (let i = 0; i <= n; i++) {
      const x = (i / n) * (P + PAD);
      upper.push({ x, y: -3.6 + 0.9 * f(x, 3, 1) + 0.6 * f(x, 7, 2) + 0.35 * f(x, 17, 0.5) });
      lower.push({ x, y: 3.4 + 0.8 * f(x, 5, 0.3) + 0.5 * f(x, 11, 1.7) });
    }
    polyPath(ctx, [...upper, ...lower.reverse()]);
    ctx.fillStyle = rgba(INK, 0.9);
    ctx.fill();
    // bristles: dashed strokes whose dash pattern sums to a divisor of the period
    for (let b = 0; b < 6; b++) {
      const off = range(r, -4, 4);
      const per = P / [3, 4, 5, 6, 3, 4][b];
      const d1 = per * range(r, 0.45, 0.8);
      const d2 = range(r, 4, 20);
      const d3 = range(r, 8, 30);
      ctx.setLineDash([d1, d2, d3, Math.max(1, per - d1 - d2 - d3)]);
      ctx.lineDashOffset = range(r, 0, per);
      ctx.strokeStyle = INK;
      ctx.lineWidth = range(r, 0.6, 1.4);
      ctx.globalAlpha = range(r, 0.3, 0.6);
      ctx.beginPath();
      ctx.moveTo(0, off);
      ctx.lineTo(P + PAD, off);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = rgba(INK, 0.45);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 4.5);
    ctx.lineTo(P + PAD, 4.5);
    ctx.stroke();
    // wind-flattened grass along the lip, leaning back (left) in the storm
    ctx.fillStyle = INK;
    let x = range(r, 10, 60);
    while (x < P) {
      const tufts = 2 + Math.floor(r() * 4);
      for (let k = 0; k < tufts; k++) {
        const h = range(r, 8, 20);
        const lean = range(r, -16, 4);
        const ox = range(r, -6, 6);
        const a = range(r, 0.5, 0.95);
        const w = range(r, 1.6, 2.8);
        wrap((o) => {
          const gx = x + ox + o;
          if (gx < -30 || gx > P + PAD + 30) return;
          ctx.globalAlpha = a;
          leaf(ctx, { x: gx, y: 2 }, { x: gx + lean * 0.2, y: 2 - h * 0.6 }, { x: gx + lean, y: 2 - h }, w);
        });
      }
      x += range(r, 30, 140);
    }
    ctx.globalAlpha = 1;
    this.tile = L.c;
    if (ROAD_TILES.size > 6) ROAD_TILES.clear();
    ROAD_TILES.set(key, L.c);
  }

  /** Draw its stretch (world), clipped to the view; ends fade over `fade` u (or crossfade where stretches join). */
  draw(ctx: CanvasRenderingContext2D, vx0: number, vx1: number, fade = 160) {
    const tile = this.tile;
    if (!tile) return;
    const X = ArenaGround.XFADE;
    const a = this.joinPrev ? this.a - X / 2 : this.a;
    const b = this.joinNext ? this.b + X / 2 : this.b;
    const lo = Math.max(a, vx0 - 4);
    const hi = Math.min(b, vx1 + 4);
    if (hi <= lo) return;
    const P = this.period;
    const s = tile.width / (P + ArenaGround.PAD);
    const y = this.gy - ArenaGround.TOP;
    const h = tile.height / s;
    const piece = (x0: number, x1: number, alpha: number) => {
      ctx.globalAlpha = alpha;
      let k = Math.floor((x0 - this.anchor) / P);
      while (this.anchor + k * P < x1) {
        const tx = this.anchor + k * P;
        const s0 = Math.max(x0, tx);
        const s1 = Math.min(x1, tx + P + 1);
        if (s1 > s0) ctx.drawImage(tile, (s0 - tx) * s, 0, (s1 - s0) * s, tile.height, s0, y, s1 - s0, h);
        k++;
      }
    };
    // the open gaps in view: cut out of the road (even-odd clip: the view strip minus each torn hole)
    const STEP = ArenaGround.LIP_STEP;
    const holes = this.holes.filter((g) => g.x1 > lo - 12 && g.x0 < hi + 12);
    if (holes.length) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(lo - 2, y - 2, hi - lo + 4, h + 4);
      for (const g of holes) {
        ctx.moveTo(g.x0 + g.l[0], y - 2);
        for (let i = 1; i < g.l.length; i++) ctx.lineTo(g.x0 + g.l[i], y - 2 + i * STEP);
        for (let i = g.r.length - 1; i >= 0; i--) ctx.lineTo(g.x1 - g.r[i], y - 2 + i * STEP);
        ctx.closePath();
      }
      ctx.clip('evenodd');
    }
    const fa = this.joinPrev ? X : Math.min(fade, (b - a) / 2);
    const fb = this.joinNext ? 0 : Math.min(fade, (b - a) / 2);
    // about one step per 5 u, so each alpha step is ~3% and the fade reads as one smooth wash (8 steps showed
    // as vertical bands where cream paper fades onto the moonlit road of the finale)
    const steps = Math.max(8, Math.min(40, Math.ceil(Math.max(fa, fb) / 5)));
    const core0 = Math.max(lo, a + fa);
    const core1 = Math.min(hi, b - fb);
    if (core1 > core0) piece(core0, core1, 1);
    for (let i = 0; i < steps; i++) {
      const al = (i + 0.5) / steps;
      for (const [s0, s1, f] of [
        [a + (fa * i) / steps, a + (fa * (i + 1)) / steps, fa],
        [b - (fb * (i + 1)) / steps, b - (fb * i) / steps, fb],
      ]) {
        if (f <= 0) continue;
        const c0 = Math.max(lo, s0);
        const c1 = Math.min(hi, s1);
        if (c1 > c0) piece(c0, c1, al);
      }
    }
    ctx.globalAlpha = 1;
    if (!holes.length) return;
    ctx.restore();
    // the torn lips: the road's line ends in a loaded blot at each edge, and ink runs down the torn paper edge
    const gy = this.gy;
    const n = Math.ceil(ArenaGround.LIP_INK / STEP);
    for (const g of holes) {
      for (const side of [-1, 1] as const) {
        const ex = side < 0 ? g.x0 : g.x1;
        const jag = side < 0 ? g.l : g.r;
        if (ex < lo - 30 || ex > hi + 30) continue;
        const along = (i: number) => ex - side * jag[i];
        const grad = ctx.createLinearGradient(0, gy - 4, 0, gy + ArenaGround.LIP_INK);
        grad.addColorStop(0, rgba(INK, 0.85));
        grad.addColorStop(0.25, rgba(INK, 0.4));
        grad.addColorStop(1, rgba(INK, 0));
        ctx.strokeStyle = grad;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 3.2;
        ctx.beginPath();
        const i0 = Math.floor((ArenaGround.TOP - 2) / STEP);
        ctx.moveTo(along(i0), gy - 4);
        for (let i = i0 + 1; i <= i0 + n && i < jag.length; i++) ctx.lineTo(along(i), y - 2 + i * STEP);
        ctx.stroke();
        // the ground line's end: a loaded brush lifted at the edge (a short, thick blot curling down)
        ctx.fillStyle = rgba(INK, 0.9);
        ctx.beginPath();
        ctx.moveTo(ex + side * 26, gy - 3.4);
        ctx.quadraticCurveTo(ex + side * 6, gy - 5.5, ex, gy - 2);
        ctx.quadraticCurveTo(ex - side * 1.5, gy + 7, ex + side * 2.5, gy + 12);
        ctx.quadraticCurveTo(ex + side * 7, gy + 5, ex + side * 26, gy + 3.4);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
}



