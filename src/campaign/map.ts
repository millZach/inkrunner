/**
 * The campaign map: one long horizontal handscroll, painted procedurally in the
 * game's ink style (F1: no image files). It reads the chapter structure from
 * data.ts and progress from save.ts; nothing here hard-codes the campaign.
 *
 * The painting. The scroll is plain sumi ink until the player clears a scroll;
 * then that scroll's stretch is painted with the player's own best strokes,
 * moved into the landscape so it reads as a picture, not confetti:
 *   朱 vermilion bridges  → bridges over the river, with posts and a broken reflection. A stroke that already
 *                          bows keeps its own bow (a flat one only gets topped up to a gentle arch); a near-straight
 *                          stroke becomes a plank bridge. Where two would overlap, the second stands on the far bank,
 *                          smaller and paler.
 *   藍 indigo currents    → the river's own currents, flowing left to right
 *   金 gold               → paper lanterns hung along the road, each lit from inside by one gold stroke
 *   紫 purple rings       → the chapter's first ring becomes the rim of its one full moon, in the sky of the stretch
 *                          that earned it (clear of the chapter titles and the lantern rigs, never over a stretch
 *                          still locked); every other ring is the wake of a floating lantern (tōrō nagashi)
 *                          drifting down the river, kept clear of the near bridges (or drifting behind them)
 * How the strokes are changed, exactly: each is rotated, scaled uniformly and sometimes mirrored, keeping its
 * wobble, width profile and painting order, and sits along the stretch where it was painted in the run. On top
 * of that: bridges get the arch they lack added (above), currents are flattened to 0.7 of their height so they
 * lie on the water, a floating lantern's ring is foreshortened to 0.36 of its height (seen lying on the water),
 * and a road lantern's gold stroke is clipped to the lantern's paper. Strokes are painted with the game's own
 * watercolor (`paintWatercolor`, `Stroke` from src/strokes.ts).
 *
 * After a new best, the stretch paints itself in live: each stroke is drawn wet in the order the
 * player painted it, lands with the game's pop, dries, and plays the game's painting notes. The camera
 * holds on the stretch (on a phone it leans in on the river, PAINT_ZOOM); when the paint-in brings the
 * chapter's moon, it rises last, in the same view.
 *
 * Rendering: the static scroll is baked into chunk canvases keyed by map x. Baking is time-sliced
 * (a few ms per frame, item by item; each painted stroke is baked once into small sprites, one piece per
 * step, and shared by every chunk it crosses) so opening and panning stay inside the frame budget; a chunk
 * that is still baking shows as plain paper. Nodes, the traveler, the walking trail and any
 * paint-in are drawn live on top. Map space is 720 units tall, like VIEW_H.
 */
import type { Audio } from '../audio';
import { FONT_BRUSH, FONT_SERIF, INK, INKS, IS_TOUCH, MAX_RENDER_H, PAPER, VIEW_H, type InkKind } from '../config';
import { GRADE_NAMES, loadBest, type Grade } from '../game';
import type { Decor } from '../level';
import type { BP, Vec } from '../math';
import { clamp, cumLengths, easeInOut, pointAt } from '../math';
import { brushLine, curve, polyPath, rgba } from '../render/brush';
import { Character, type CharId, type Pose } from '../render/characters';
import { drawDecor, drawTorii } from '../render/decor';
import { makeVignette } from '../render/paper';
import { fbm1, mulberry32, noise1, range, type RNG } from '../rng';
import { drawWetStroke, DRY_TIME, paintWatercolor, Stroke, strokeOutline } from '../strokes';
import { BEATS, CAMPAIGN, chapterState, scrollState, type Campaign, type Chapter, type CampaignScroll, type NodeState } from './data';
import { isCleared, loadCampaign, stampGrade, type ScrollStrokes } from './save';

const MAP_H = VIEW_H; // 720 map units tall
const BAND = 20; // silk mounting band at top and bottom
const CHUNK = 512; // map units per cached chunk
const NODE_R = 40;
const SHU = '#e2412a';

// layout spacing, in map units
const TITLE_W = 760;
const HEADER_W = 300;
const NODE_GAP = 520;
const SLOT_GAP = 220;
const SEALED_W = 560;
const END_W = 180;

// the painted landscape, in map units
const RIVER_Y = 640;
/** lanterns hang this far above the road */
const LANTERN_LIFT = 128;
/**
 * the chapter's moon hangs this high: clear of the top-corner buttons and the hint, above the lantern rigs.
 * A little lower on a phone, where the paint-in leans in on the river (PAINT_ZOOM) and the top of the sky is cropped.
 */
const MOON_Y = IS_TOUCH ? 212 : 186;
/** a paper lantern's half width and half height */
const LANTERN_RX = 17;
const LANTERN_RY = 22;

/**
 * On a phone the map is 720 units in 390 CSS px, so the river (where the paint-in happens) is a thin strip at
 * the foot of the screen: while a paint-in plays, the view leans in on it, anchored low, then eases back out.
 * A CSS transform on the already-painted canvas, so it costs no frame time; at the phone's render scale the
 * canvas still has about two device pixels per CSS pixel at this zoom.
 */
const PAINT_ZOOM = IS_TOUCH ? 1.3 : 1;
const ZOOM_ORIGIN = '50% 78%';

/** Milliseconds of baking allowed per frame (chunks and paint-in sprites), measured on the real clock. */
const BAKE_BUDGET = 2.5;

interface Item {
  x0: number;
  x1: number;
  /** what it is, for the dev bake profile (window.__mapBakeStats) */
  name?: string;
  draw: (ctx: CanvasRenderingContext2D) => void;
  /**
   * Shared baking an item needs before it can draw (a painted stroke's sprites): returns the next
   * piece of work at this scale, or null when ready. The chunk baker runs one piece per step, so no
   * single step is expensive.
   */
  prep?: (scale: number) => (() => void) | null;
  /** set on the player's painted strokes: the scroll they belong to */
  scroll?: string;
}

export interface MapNode {
  scroll: CampaignScroll;
  chapter: Chapter;
  x: number;
  y: number;
  state: NodeState;
  grade: string | null;
  /** path arclength at this node */
  s: number;
  /** map-x span this scroll's best strokes are laid over */
  stretch: [number, number];
}

type Role = 'bridge' | 'current' | 'lantern' | 'moon' | 'float';

/** One of the player's strokes, moved into the landscape of its scroll's stretch. */
export interface Mark {
  scroll: string;
  kind: InkKind;
  role: Role;
  /** the stroke in map units */
  pts: BP[];
  seed: number;
  /** painting order within the run */
  order: number;
  /** where it meets the landscape: the water line under a bridge, the string over a lantern, the moon's center */
  ax: number;
  ay: number;
  /** a bridge further off, on the far bank: smaller and paler */
  far?: boolean;
  /** a bridge's build, read from the stroke's own shape: a near-straight stroke is a plank bridge */
  plank?: boolean;
  /** extent including its ink context (posts, caps, reflections) */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

interface Layout {
  width: number;
  nodes: MapNode[];
  path: Vec[];
  pathCum: number[];
  /** arclength where the walked (inked) part of the path ends */
  inkedTo: number;
  items: Item[];
  /** the player's painted strokes per scroll id */
  marks: Map<string, Mark[]>;
}

const nodeY = (i: number) => 440 + Math.sin(i * 1.9 + 0.6) * 34;

/** The river's centerline along the foot of the scroll. */
export const riverY = (x: number) => RIVER_Y + Math.sin(x * 0.0031 + 1) * 10 + (fbm1(x * 0.002, 41) - 0.5) * 14;

// ─────────────────────────────────────────────────────────────── layout

interface LayoutOptions {
  /** hold the walked path at this scroll (the traveler is about to walk on from it) */
  holdAt?: string;
}

function layout(c: Campaign, strokes: Record<string, ScrollStrokes>, opts: LayoutOptions = {}): Layout {
  const nodes: MapNode[] = [];
  const items: Item[] = [];
  const anchors: Vec[] = [{ x: 560, y: 520 }];
  const slots: { x: number; y: number; title: string; label: string }[] = [];
  const sealed: { ch: Chapter; x0: number }[] = [];
  const headers: { ch: Chapter; x0: number; x1: number; state: string }[] = [];
  let x = TITLE_W;
  let k = 0;
  let prevEnd = TITLE_W - 60;

  for (const ch of c.chapters) {
    const st = chapterState(ch, isCleared, c);
    if (!ch.scrolls.length) {
      sealed.push({ ch, x0: x });
      x += SEALED_W;
      continue;
    }
    const x0 = x;
    x += HEADER_W;
    for (const s of ch.scrolls) {
      const before = c.cutscenes.find((cs) => cs.before === s.id);
      if (before) {
        slots.push({ x: x - 40, y: nodeY(k - 0.5) - 10, title: before.title, label: before.id === 'prologue' ? 'Prologue' : 'Cutscene' });
        anchors.push({ x: x - 40, y: nodeY(k - 0.5) + 30 });
        x += SLOT_GAP - 60;
      }
      const y = nodeY(k);
      const node: MapNode = {
        scroll: s,
        chapter: ch,
        x: x + 60,
        y,
        state: scrollState(s.id, isCleared, c),
        grade: stampGrade(s.id),
        s: 0,
        stretch: [prevEnd, x + 60],
      };
      nodes.push(node);
      anchors.push({ x: node.x, y });
      prevEnd = node.x + NODE_R + 10;
      x += NODE_GAP;
      k++;
      const after = c.cutscenes.find((cs) => cs.after === s.id);
      if (after) {
        slots.push({ x: x - 160, y: nodeY(k - 0.5) - 10, title: after.title, label: 'Chapter ending' });
        anchors.push({ x: x - 160, y: nodeY(k - 0.5) + 30 });
        x += SLOT_GAP - 120;
      }
    }
    x += 40;
    headers.push({ ch, x0, x1: x, state: st });
  }
  const width = x + END_W;
  const sealedX = sealed[0]?.x0 ?? width;
  // the path trails off into the blot
  anchors.push({ x: (sealed[0]?.x0 ?? x - 200) + 120, y: 520 });

  // Smooth the path through its anchors with gentle S-curves.
  const path: Vec[] = [];
  for (let i = 0; i + 1 < anchors.length; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + (i % 2 ? -46 : 46) };
    const seg = curve(a, mid, b, 24);
    path.push(...(i ? seg.slice(1) : seg));
  }
  const pathCum = cumLengths(path);
  for (const n of nodes) n.s = nearestS(path, pathCum, n.x);
  const front = nodes.find((n) => n.state === 'open') ?? nodes.filter((n) => n.state === 'cleared').pop();
  const hold = opts.holdAt ? nodes.find((n) => n.scroll.id === opts.holdAt) : undefined;
  const inkedTo = hold ? hold.s : front ? front.s : 0;

  // The player's strokes, composed into each cleared stretch's landscape.
  const marks = new Map<string, Mark[]>();
  // keep the sky clear of chapter titles, and the road (where lanterns hang) clear of cutscene glyphs
  const headerSpans = headers.map((h) => [h.x0 - 30, h.x0 + HEADER_W + 10] as [number, number]);
  const slotSpans = slots.map((sl) => [sl.x - 80, sl.x + 80] as [number, number]);
  const roadY = (x: number) => pathYAt(path, x);
  // one moon per chapter: the first purple ring cleared in it, hung in the sky of that scroll's own stretch
  // (never over a stretch the player has not unrolled yet)
  const moonDone = new Set<string>();
  for (const n of nodes) {
    const rec = strokes[n.scroll.id];
    if (n.state !== 'cleared' || !rec || !rec.strokes.length) continue;
    const moon = !moonDone.has(n.chapter.id) ? MOON_Y : null;
    const ms = compose(n.scroll.id, rec, n.stretch, headerSpans, roadY, slotSpans, moon);
    if (ms.some((m) => m.role === 'moon')) moonDone.add(n.chapter.id);
    marks.set(n.scroll.id, ms);
  }
  // back to front inside the river: far bridges, currents, near bridges, then the floating lanterns on top
  // (a far lantern drifts in front of a far bridge, behind everything near)
  const depth: Record<Role, number> = { moon: 0, bridge: 2, current: 1, float: 3, lantern: 4 };
  const farDepth = (m: Mark) => (m.role === 'float' ? 0.5 : 0);
  const onWater = [...marks.values()].flat().filter((m) => m.role !== 'lantern' && m.role !== 'moon');
  onWater.sort((a, b) => (a.far ? farDepth(a) : depth[a.role]) - (b.far ? farDepth(b) : depth[b.role]));

  // ── back to front
  paperStains(items, width);
  // the moon rises behind the mountains
  for (const [, ms] of marks) for (const m of ms) if (m.role === 'moon') markItem(items, m);
  for (const [i, seed] of [[0, 3], [1, 9]] as const) mountains(items, width, i, seed);
  river(items, 300, sealedX + 220);
  for (const h of headers) chapterScenery(items, h.ch, h.x0, h.x1, nodes.map((n) => n.x));
  for (const m of onWater) markItem(items, m);
  pathItems(items, path, pathCum, inkedTo, width);
  for (const [id, ms] of marks) festoon(items, id, ms, roadY);
  for (const [, ms] of marks) for (const m of ms) if (m.role === 'lantern') markItem(items, m);
  for (const n of nodes) {
    if (n.scroll.beat !== '門') continue;
    const paint = n.state === 'cleared' ? 1 : 0;
    items.push({
      name: 'torii',
      x0: n.x - 90,
      x1: n.x + 90,
      draw: (ctx) => {
        ctx.translate(n.x, n.y + 22);
        ctx.scale(0.6, 0.6);
        ctx.globalAlpha = 0.8;
        drawTorii(ctx, 0, 0, paint);
      },
    });
  }
  title(items, c);
  for (const h of headers) header(items, h.ch, h.x0, h.state);
  for (const s of slots) slotGlyph(items, s.x, s.y, s.label, s.title);
  for (const s of sealed) sealedChapter(items, s.ch, s.x0);
  if (sealed.length) sealedWash(items, sealed[0].x0, width);
  rollers(items, width);

  return { width, nodes, path, pathCum, inkedTo, items, marks };
}

/** y of the path at map x (the path runs left to right). */
function pathYAt(path: Vec[], x: number): number {
  let lo = 0;
  let hi = path.length - 1;
  if (x <= path[0].x) return path[0].y;
  if (x >= path[hi].x) return path[hi].y;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (path[m].x <= x) lo = m;
    else hi = m;
  }
  const a = path[lo];
  const b = path[hi];
  return a.y + (b.y - a.y) * clamp((x - a.x) / (b.x - a.x || 1), 0, 1);
}

function nearestS(path: Vec[], cum: number[], x: number): number {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < path.length; i++) {
    const d = Math.abs(path[i].x - x);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return cum[best];
}

// ─────────────────────────────────────────────────────────────── the player's strokes as landscape

interface Raw {
  i: number;
  kind: InkKind;
  pts: BP[];
  /** where along the run it was painted, 0..1 */
  u: number;
  len: number;
}

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) % 1e6;
}

function polyLen(p: Vec[]): number {
  let L = 0;
  for (let i = 1; i < p.length; i++) L += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
  return L;
}

/**
 * Rotate a stroke so its chord runs left to right, scale it uniformly so the chord is `width` long,
 * and center the chord on the origin. Loops (no real chord) keep their orientation.
 */
function alongChord(pts: BP[], width: number, wScale: [number, number, number]): BP[] {
  const a = pts[0];
  const b = pts[pts.length - 1];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let chord = Math.hypot(dx, dy);
  let ang = Math.atan2(dy, dx);
  const xs = pts.map((p) => p.x);
  const span = Math.max(...xs) - Math.min(...xs);
  if (chord < span * 0.5) {
    chord = Math.max(1, span);
    ang = 0;
  }
  const s = width / Math.max(1, chord);
  const cos = Math.cos(-ang);
  const sin = Math.sin(-ang);
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  return pts.map((p) => {
    const x = p.x - mx;
    const y = p.y - my;
    return { x: (x * cos - y * sin) * s, y: (x * sin + y * cos) * s, w: clamp(p.w * wScale[0], wScale[1], wScale[2]) };
  });
}

/** Scale a stroke uniformly so its larger side is `size`, centered on the origin. */
function fitBox(pts: BP[], size: number, wScale: [number, number, number], squashY = 1): BP[] {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const bw = Math.max(...xs) - x0;
  const bh = Math.max(...ys) - y0;
  const s = size / Math.max(1, bw, bh);
  const cx = x0 + bw / 2;
  const cy = y0 + bh / 2;
  return pts.map((p) => ({ x: (p.x - cx) * s, y: (p.y - cy) * s * squashY, w: clamp(p.w * wScale[0], wScale[1], wScale[2]) }));
}

const bboxOf = (pts: Vec[]) => {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x0, y0, x1, y1 };
};

/**
 * Spread items of the given widths along [a, b], each near its own run position `u`,
 * keeping them in order and at least `gap` apart (center to center: half widths + gap).
 * Returns centers. Squeezes evenly when they cannot fit.
 */
function spread(us: number[], widths: number[], a: number, b: number, overlap = 0): number[] {
  const n = us.length;
  if (!n) return [];
  const need = (i: number) => (widths[i - 1] + widths[i]) / 2 - overlap;
  const xs = us.map((u, i) => a + widths[i] / 2 + u * Math.max(0, b - a - widths[i]));
  for (let i = 1; i < n; i++) xs[i] = Math.max(xs[i], xs[i - 1] + need(i));
  // pull back from the right edge
  const over = xs[n - 1] + widths[n - 1] / 2 - b;
  if (over > 0) {
    xs[n - 1] -= over;
    for (let i = n - 2; i >= 0; i--) xs[i] = Math.min(xs[i], xs[i + 1] - need(i + 1));
  }
  // still past the left edge: squeeze evenly
  if (xs[0] - widths[0] / 2 < a) {
    const lo = a + widths[0] / 2;
    const hi = b - widths[n - 1] / 2;
    for (let i = 0; i < n; i++) xs[i] = n === 1 ? (a + b) / 2 : lo + ((hi - lo) * i) / (n - 1);
  }
  return xs;
}

/** The widest span of [a, b] not covered by any of `avoid`. */
function freeSpan(a: number, b: number, avoid: [number, number][]): [number, number] {
  let best: [number, number] = [a, a];
  let cur = a;
  const cuts = avoid.filter(([p, q]) => q > a && p < b).sort((m, n) => m[0] - n[0]);
  for (const [p, q] of cuts) {
    if (p > cur && p - cur > best[1] - best[0]) best = [cur, p];
    cur = Math.max(cur, q);
  }
  if (b - cur > best[1] - best[0]) best = [cur, b];
  return best[1] - best[0] > 80 ? best : [a, b];
}

/** The spans of [a, b] not covered by any of `cuts`, left to right. */
function gaps(a: number, b: number, cuts: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  let cur = a;
  for (const [p, q] of cuts.filter(([p, q]) => q > a && p < b).sort((m, n) => m[0] - n[0])) {
    if (p > cur) out.push([cur, p]);
    cur = Math.max(cur, q);
  }
  if (b > cur) out.push([cur, b]);
  return out;
}

/** Compose one scroll's best strokes into the landscape of its stretch. */
export function compose(
  id: string,
  rec: ScrollStrokes,
  stretch: [number, number],
  avoid: [number, number][] = [],
  roadY: (x: number) => number = () => 460,
  roadAvoid: [number, number][] = [],
  /** the height the chapter's moon hangs at, when this scroll's first ring is to become it (null: the chapter has its moon) */
  moonY: number | null = null,
): Mark[] {
  const [xa, xb] = stretch;
  const raws: Raw[] = [];
  rec.strokes.forEach((st, i) => {
    if (!(st.k in INKS)) return;
    const n = Math.floor(st.p.length / 3);
    if (n < 2) return;
    const pts: BP[] = [];
    for (let k = 0; k < n; k++) pts.push({ x: st.p[k * 3], y: st.p[k * 3 + 1], w: st.p[k * 3 + 2] });
    const cx = pts.reduce((a, p) => a + p.x, 0) / n;
    raws.push({ i, kind: st.k as InkKind, pts, u: clamp(cx / Math.max(1, rec.len), 0, 1), len: polyLen(pts) });
  });
  const seed0 = hashId(id);
  const out: Mark[] = [];
  const mark = (r: Raw, role: Role, pts: BP[], ax: number, ay: number, pad: [number, number, number, number], extra: Partial<Mark> = {}) => {
    const bb = bboxOf(pts);
    out.push({
      ...extra,
      scroll: id,
      kind: r.kind,
      role,
      pts,
      seed: seed0 + r.i * 131,
      order: r.i,
      ax,
      ay,
      x0: bb.x0 - pad[0],
      y0: bb.y0 - pad[1],
      x1: bb.x1 + pad[2],
      y1: bb.y1 + pad[3],
    });
  };
  const ground: [number, number] = [xa + 16, xb - 16];

  // 朱 bridges over the river. Where two would overlap, the second stands further off on the far bank,
  // smaller and paler. Each keeps its own bow; a near-straight stroke becomes a flat plank bridge.
  const bridges = raws.filter((r) => r.kind === 'shu');
  if (bridges.length) {
    let ws = bridges.map((r) => clamp(r.len * 0.18, 76, 170));
    const room = (ground[1] - ground[0]) * 1.5;
    const sum = ws.reduce((a, w) => a + w, 0);
    // crowded runs shrink to fit; sparse ones paint a little larger, up to the river's width
    ws = ws.map((w) => Math.min(210, Math.max(48, w * clamp((room * 0.6) / sum, 0.3, 1.35))));
    const xs = spread(bridges.map((r) => r.u), ws, ground[0], ground[1], ws.length > 1 ? Math.min(...ws) * 0.4 : 0);
    let farPrev = true;
    let nearEdge = -Infinity;
    bridges.forEach((r, i) => {
      const far = xs[i] - ws[i] / 2 < nearEdge - 6 ? !farPrev : false;
      farPrev = far;
      const k = far ? 0.6 : 1;
      const w = ws[i] * k;
      const X = xs[i];
      if (!far) nearEdge = X + w / 2;
      const ay = riverY(X) + (far ? -19 : 4);
      let rel = alongChord(r.pts, w, [0.42 * k, 4.5 * k, 8 * k]);
      // a bridge arches upward: mirror a sagging stroke
      const mean = rel.reduce((a, p) => a + p.y, 0) / rel.length;
      if (mean > 0) rel = rel.map((p) => ({ ...p, y: -p.y }));
      // how far the player's own stroke already bows above its chord, at its middle third
      const mid = rel.filter((p) => Math.abs(p.x) < w / 6);
      const bow = mid.length ? -mid.reduce((a, p) => a + p.y, 0) / mid.length : 0;
      const plank = bow < w * 0.035;
      // only top up an arch the stroke does not already have; a plank gets a whisper of camber
      const archH = plank ? w * 0.025 : Math.max(0, w * 0.14 - bow);
      rel = rel.map((p) => ({ ...p, y: p.y - Math.sin(Math.PI * clamp(p.x / w + 0.5, 0, 1)) * archH }));
      const lift = plank ? 12 * k : 4 * k;
      const pts = rel.map((p) => ({ x: p.x + X, y: p.y + ay - lift, w: p.w }));
      mark(r, 'bridge', pts, X, ay, [10, 10, 10, 26], { far, plank });
    });
  }

  // 藍 currents: the river's water, flowing left to right
  const currents = raws.filter((r) => r.kind === 'ai');
  if (currents.length) {
    let ws = currents.map((r) => clamp(r.len * 0.25, 80, 190));
    const room = (ground[1] - ground[0]) * 1.8;
    const sum = ws.reduce((a, w) => a + w, 0);
    ws = ws.map((w) => Math.min(220, Math.max(44, w * clamp((room * 0.5) / sum, 0.3, 1.35))));
    const xs = spread(currents.map((r) => r.u), ws, ground[0], ground[1], Math.min(...ws) * 0.45);
    currents.forEach((r, i) => {
      const X = xs[i];
      const ay = riverY(X) + (i % 2 ? 4 : 16);
      const rel = alongChord(r.pts, ws[i], [0.42, 5, 8.5]);
      // currents lie flat on the water: keep the player's wobble, flatten the overall bow a little
      const pts = rel.map((p) => ({ x: p.x + X, y: p.y * 0.7 + ay, w: p.w }));
      mark(r, 'current', pts, X, ay, [16, 12, 16, 12]);
    });
  }

  // 金 paper lanterns along the road, each lit from inside by one gold stroke
  const lanterns = raws.filter((r) => r.kind === 'kin');
  if (lanterns.length) {
    const road = freeSpan(xa + 40, xb - 70, roadAvoid);
    const xs = spread(lanterns.map((r) => r.u), lanterns.map(() => LANTERN_RX * 2 + 14), road[0], road[1]);
    lanterns.forEach((r, i) => {
      const X = xs[i];
      const hang = roadY(X) - LANTERN_LIFT + Math.sin(i * 2.1 + seed0) * 4;
      const cy = hang + 10 + LANTERN_RY;
      // fill the lantern: the stroke's larger side spans it, a little past the paper so the clip shapes it
      const rel = fitBox(r.pts, LANTERN_RY * 2.1, [0.5, 4, 7]);
      mark(r, 'lantern', rel.map((p) => ({ x: p.x + X, y: p.y + cy, w: p.w })), X, hang, [30, 26, 30, 30]);
    });
  }

  // 紫 rings. The chapter's first ring rises as its one moon; every other ring is the wake of a
  // floating lantern (tōrō nagashi) drifting down the river, the ring laid flat on the water around it.
  const rings = raws.filter((r) => r.kind === 'murasaki');
  let floats = rings;
  if (moonY !== null && rings.length) {
    const r = rings[0];
    floats = rings.slice(1);
    const bb = bboxOf(r.pts);
    const dia = Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0);
    const size = clamp(dia * 0.72, 70, 100);
    // in this stretch's own sky (its halo too), clear of the chapter titles, and in the widest gap
    // between this stretch's lantern rigs when there is room for it there
    const lo = xa + size * 1.25;
    const hi = Math.max(lo, xb - size * 1.25);
    const rigs = out.filter((m) => m.role === 'lantern').map((m) => [m.ax - 70, m.ax + 70] as [number, number]);
    const roomy = (cuts: [number, number][]) => gaps(lo, hi, cuts).filter(([p, q]) => q - p >= size * 0.6);
    const clear = roomy([...avoid, ...rigs]);
    const sky = clear.length ? clear : roomy(avoid);
    const [p0, q0] = sky.length ? sky.reduce((a, b) => (b[1] - b[0] > a[1] - a[0] ? b : a)) : [lo, hi];
    const X = (p0 + q0) / 2;
    const Y = moonY + (noise1(seed0 * 0.01, 3) - 0.5) * 24;
    const rel = fitBox(r.pts, size, [0.5, 5, 8.5]);
    mark(r, 'moon', rel.map((p) => ({ x: p.x + X, y: p.y + Y, w: p.w })), X, Y, [size * 0.8, size * 0.8, size * 0.8, 30]);
  }
  if (floats.length) {
    const sizes = floats.map((r) => {
      const bb = bboxOf(r.pts);
      return clamp(Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0) * 0.5, 42, 60);
    });
    const xs = spread(floats.map((r) => r.u), sizes.map((d) => d + 26), ground[0] + 14, ground[1] - 14);
    // a lantern never sits on a near bridge's deck or in front of its posts: it drifts clear of the bridge,
    // or, when there is no room, further out on the water, behind it
    const decks = out.filter((m) => m.role === 'bridge' && !m.far).map((m) => [m.x0 + 4, m.x1 - 4] as [number, number]);
    const behind = new Set<number>();
    const placed: number[] = [];
    xs.forEach((X, i) => {
      const half = sizes[i] / 2 + 8;
      const hits = (x: number) => decks.some(([p, q]) => x + half > p && x - half < q);
      if (hits(X)) {
        const tries = decks.flatMap(([p, q]) => [p - half - 2, q + half + 2]).sort((a, b) => Math.abs(a - X) - Math.abs(b - X));
        const ok = tries.find((x) => Math.abs(x - X) < 150 && x - half >= ground[0] && x + half <= ground[1] && !hits(x) && placed.every((y) => Math.abs(y - x) > sizes[i] + 14));
        if (ok !== undefined) xs[i] = ok;
        else behind.add(i);
      }
      placed.push(xs[i]);
    });
    floats.forEach((r, i) => {
      const X = xs[i];
      // they drift at different distances: every other one further out on the water, smaller and paler
      const far = i % 2 === 1 || behind.has(i);
      const k = far ? 0.72 : 1;
      const ay = riverY(X) + (far ? 1 : 14) + (noise1(X * 0.01, 7) - 0.5) * 4;
      // seen from the bank, a ring on the water is foreshortened
      const rel = fitBox(r.pts, sizes[i] * k, [0.42 * k, 3.8 * k, 6.5 * k], 0.36);
      mark(r, 'float', rel.map((p) => ({ x: p.x + X, y: p.y + ay, w: p.w })), X, ay, [26, 34, 26, 16], { far });
    });
  }

  return out.sort((a, b) => a.order - b.order);
}

/** How strongly a mark is painted: a far bridge is paler, as if seen through the evening haze. */
const markAlpha = (m: Mark) => (m.far ? (m.role === 'float' ? 0.8 : 0.62) : 1);

/** The washes and ink details under one painted stroke, as in its dried state. */
function drawMarkUnder(ctx: CanvasRenderingContext2D, m: Mark, alpha = 1) {
  const def = INKS[m.kind];
  const r = mulberry32(m.seed + 7);
  const bb = bboxOf(m.pts);
  const cx = (bb.x0 + bb.x1) / 2;
  const cy = (bb.y0 + bb.y1) / 2;
  alpha *= markAlpha(m);
  // pigment bled into the paper around it
  const rad = Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0) * 0.75 + 18;
  const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, rad);
  g.addColorStop(0, rgba(def.color, (m.role === 'lantern' ? 0 : 0.085) * alpha));
  g.addColorStop(1, rgba(def.color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
  ctx.globalAlpha = alpha;
  if (m.role === 'bridge') {
    // posts down to the water (a plank bridge stands on more of them), and the abutments on each bank
    const w = bb.x1 - bb.x0;
    const k = m.far ? 0.6 : 1;
    for (const t of m.plank ? [0.14, 0.38, 0.62, 0.86] : [0.24, 0.5, 0.76]) {
      const px = bb.x0 + w * t;
      const deck = deckY(m.pts, px);
      brushLine(ctx, [{ x: px, y: deck + 1 }, { x: px + range(r, -0.6, 0.6), y: m.ay + 3 * k }], r, { w: 2.4 * k, color: INK, alpha: 0.7 * alpha, taperIn: 1, taperOut: 2 });
    }
    for (const [x, dir] of [[bb.x0 + 2, -1], [bb.x1 - 2, 1]] as const) {
      brushLine(ctx, [{ x, y: m.ay - 3 * k }, { x: x + dir * 14 * k, y: m.ay + 2 * k }], r, { w: 3.2 * k, color: INK, alpha: 0.6 * alpha, taperOut: 8 });
    }
    // the reflection, broken by the water
    for (let j = 0; j < 4; j++) {
      const half = (w / 2) * (0.85 - j * 0.17);
      const y = m.ay + (6 + j * 4.2) * k;
      brushLine(ctx, [{ x: cx - half, y }, { x: cx + half * 0.92, y: y + 0.6 }], r, { w: (2.6 - j * 0.3) * k, color: def.color, alpha: (0.3 - j * 0.06) * alpha, taperIn: half * 0.4, taperOut: half * 0.5 });
    }
  } else if (m.role === 'lantern') {
    // warm light on the paper around it, then the paper body
    const cyL = m.ay + 10 + LANTERN_RY;
    const lg = ctx.createRadialGradient(m.ax, cyL, 4, m.ax, cyL, 54);
    lg.addColorStop(0, `rgba(255,190,70,${0.32 * alpha})`);
    lg.addColorStop(1, 'rgba(255,190,70,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(m.ax - 56, cyL - 56, 112, 112);
    ctx.fillStyle = `rgba(255,243,214,${0.92 * alpha})`;
    ctx.beginPath();
    ctx.ellipse(m.ax, cyL, LANTERN_RX, LANTERN_RY, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (m.role === 'moon') {
    // the player's ring is the rim of a full moon: the night washed in around it, a wide glow, the haze
    // drifting behind it, and a pale disc of moonlight filling the ring
    const rad2 = (bb.x1 - bb.x0) * 0.47;
    const sky = ctx.createRadialGradient(m.ax, m.ay, rad2 * 1.1, m.ax, m.ay, rad2 * 2.6);
    sky.addColorStop(0, rgba(def.dark, 0.13 * alpha));
    sky.addColorStop(0.45, rgba(def.dark, 0.055 * alpha));
    sky.addColorStop(1, rgba(def.dark, 0));
    ctx.fillStyle = sky;
    ctx.fillRect(m.ax - rad2 * 2.6, m.ay - rad2 * 2.6, rad2 * 5.2, rad2 * 5.2);
    const halo = ctx.createRadialGradient(m.ax, m.ay, rad2 * 0.9, m.ax, m.ay, rad2 * 2.3);
    halo.addColorStop(0, `rgba(255,246,222,${0.9 * alpha})`);
    halo.addColorStop(0.35, rgba(def.light, 0.22 * alpha));
    halo.addColorStop(1, rgba(def.light, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(m.ax - rad2 * 2.3, m.ay - rad2 * 2.3, rad2 * 4.6, rad2 * 4.6);
    const hy = m.ay + rad2 * 0.4;
    brushLine(ctx, [{ x: m.ax - rad2 * 2.1, y: hy + 3 }, { x: m.ax, y: hy }, { x: m.ax + rad2 * 1.7, y: hy + 2 }], r, { w: 7, color: INK, alpha: 0.2 * alpha, bristles: 4, dry: 0.7, taperIn: 30, taperOut: 40 });
    const disc = ctx.createRadialGradient(m.ax - rad2 * 0.25, m.ay - rad2 * 0.3, rad2 * 0.1, m.ax, m.ay, rad2 * 1.02);
    disc.addColorStop(0, `rgba(255,253,246,${alpha})`);
    disc.addColorStop(0.65, `rgba(255,247,226,${alpha})`);
    disc.addColorStop(0.92, `rgba(250,232,236,${alpha})`);
    disc.addColorStop(1, rgba(def.light, 0.55 * alpha));
    ctx.fillStyle = disc;
    ctx.beginPath();
    ctx.arc(m.ax, m.ay, rad2 * 1.02, 0, Math.PI * 2);
    ctx.fill();
    // a few faint seas, as a brush would leave them
    for (const [dx, dy, rr] of [[-0.3, -0.15, 0.28], [0.22, 0.2, 0.22], [0.1, -0.38, 0.14]]) {
      const sg = ctx.createRadialGradient(m.ax + dx * rad2, m.ay + dy * rad2, 0, m.ax + dx * rad2, m.ay + dy * rad2, rr * rad2);
      sg.addColorStop(0, `rgba(196,180,170,${0.22 * alpha})`);
      sg.addColorStop(1, 'rgba(196,180,170,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(m.ax + (dx - rr) * rad2, m.ay + (dy - rr) * rad2, rr * 2 * rad2, rr * 2 * rad2);
    }
    // its reflection, broken on the river below
    const wy = riverY(m.ax);
    for (let j = 0; j < 4; j++) {
      const half = rad2 * (0.9 - j * 0.2);
      const y = wy - 4 + j * 5;
      const x = m.ax + Math.sin(j * 1.7) * 4;
      brushLine(ctx, [{ x: x - half, y }, { x: x + half, y: y + 0.5 }], r, { w: 2.4, color: j % 2 ? def.light : def.color, alpha: (0.34 - j * 0.06) * alpha, taperIn: half * 0.5, taperOut: half * 0.5 });
    }
  } else if (m.role === 'float') {
    // the lantern's warm light on the water, and faint rings spreading past the player's ring
    const lg = ctx.createRadialGradient(m.ax, m.ay, 2, m.ax, m.ay, 40);
    lg.addColorStop(0, `rgba(255,190,70,${0.3 * alpha})`);
    lg.addColorStop(1, 'rgba(255,190,70,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(m.ax - 42, m.ay - 42, 84, 84);
    ctx.strokeStyle = rgba(INK, 0.16 * alpha);
    ctx.lineWidth = 1.1;
    for (const s of [1.3, 1.62]) {
      ctx.beginPath();
      ctx.ellipse(m.ax, m.ay, ((bb.x1 - bb.x0) / 2) * s, ((bb.y1 - bb.y0) / 2) * s, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

/** Details that sit over the stroke: a lantern's frame and caps, a floating lantern. */
function drawMarkOver(ctx: CanvasRenderingContext2D, m: Mark, alpha = 1) {
  if (m.role === 'lantern') {
    const cyL = m.ay + 10 + LANTERN_RY;
    const r = mulberry32(m.seed + 13);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = rgba(INK, 0.55);
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.ellipse(m.ax, cyL, LANTERN_RX, LANTERN_RY, 0, 0, Math.PI * 2);
    ctx.stroke();
    // the ribs, faint over the light
    ctx.strokeStyle = rgba(INK, 0.16);
    ctx.lineWidth = 0.9;
    for (const k of [-0.55, 0, 0.55]) {
      ctx.beginPath();
      ctx.ellipse(m.ax, cyL + k * LANTERN_RY, LANTERN_RX * Math.sqrt(1 - k * k), 2.2, 0, 0, Math.PI);
      ctx.stroke();
    }
    ctx.fillStyle = rgba(INK, 0.88);
    ctx.fillRect(m.ax - 0.7, m.ay, 1.4, 10);
    ctx.beginPath();
    ctx.roundRect(m.ax - 10, m.ay + 7, 20, 5, 1.5);
    ctx.roundRect(m.ax - 10, cyL + LANTERN_RY - 2.5, 20, 5, 1.5);
    ctx.fill();
    brushLine(ctx, [{ x: m.ax, y: cyL + LANTERN_RY + 2 }, { x: m.ax + range(r, -1, 1), y: cyL + LANTERN_RY + 12 }], r, { w: 2.2, color: SHU, alpha: 0.8 * alpha, taperIn: 1 });
    ctx.globalAlpha = 1;
    return;
  }
  if (m.role === 'float') {
    // a plain paper lantern on a little wooden float, lit from inside, drifting in the player's ring
    const r = mulberry32(m.seed + 17);
    const x = m.ax;
    const y = m.ay - 1;
    ctx.save();
    if (m.far) {
      ctx.translate(x, y);
      ctx.scale(0.72, 0.72);
      ctx.translate(-x, -y);
    }
    ctx.globalAlpha = alpha;
    brushLine(ctx, [{ x: x - 2, y: y + 4 }, { x: x + range(r, -1, 1), y: y + 15 }], r, { w: 3.2, color: '#f2b544', alpha: 0.4 * alpha, taperIn: 2, taperOut: 6 });
    ctx.fillStyle = rgba(INK, 0.82);
    ctx.beginPath();
    ctx.moveTo(x - 11, y - 3);
    ctx.lineTo(x + 11, y - 3);
    ctx.lineTo(x + 8.5, y + 2);
    ctx.lineTo(x - 8.5, y + 2);
    ctx.closePath();
    ctx.fill();
    const g = ctx.createLinearGradient(0, y - 21, 0, y - 3);
    g.addColorStop(0, 'rgba(255,236,190,0.95)');
    g.addColorStop(1, 'rgba(255,214,130,0.95)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 7.5, y - 21, 15, 18);
    ctx.strokeStyle = rgba(INK, 0.6);
    ctx.lineWidth = 1.1;
    ctx.strokeRect(x - 7.5, y - 21, 15, 18);
    ctx.fillStyle = rgba(INK, 0.85);
    ctx.fillRect(x - 9, y - 23.5, 18, 3);
    ctx.restore();
    ctx.globalAlpha = 1;
    return;
  }
}

/** y of a bridge deck (the stroke's upper edge, roughly) at x. */
function deckY(pts: BP[], x: number): number {
  let best = pts[0];
  for (const p of pts) if (Math.abs(p.x - x) < Math.abs(best.x - x)) best = p;
  return best.y;
}

/** A dried stroke baked once into a canvas, placed in map units and pixel-aligned with the chunks. */
interface MarkSprite {
  c: HTMLCanvasElement;
  x: number;
  y: number;
  w: number;
  h: number;
}

function markSprite(x0: number, y0: number, x1: number, y1: number, scale: number, res: number, paint: (g: CanvasRenderingContext2D) => void): MarkSprite {
  const k = scale * res;
  const x = Math.floor(x0 * k) / k;
  const y = Math.floor(y0 * k) / k;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil((x1 - x) * k));
  c.height = Math.max(1, Math.ceil((y1 - y) * k));
  const g = c.getContext('2d')!;
  g.setTransform(k, 0, 0, k, -x * k, -y * k);
  paint(g);
  return { c, x, y, w: c.width / k, h: c.height / k };
}

/**
 * The two sprites of a dried mark, the same look as the game's dried stroke: its soft resting halo
 * (blurred at quarter resolution, which a blur hides) and its watercolor. Each mark is baked once per
 * scale and shared by every chunk it crosses.
 */
const markSprites = new WeakMap<Mark, { scale: number; halo: MarkSprite | null; body: MarkSprite | null; wet?: MarkSprite }>();

/** The next piece of baking a mark still needs at this scale, or null when it is ready. One piece per call. */
function markPrep(m: Mark, scale: number): (() => void) | null {
  let e = markSprites.get(m);
  // (the canvas hands its transform back in single precision: compare scales loosely)
  if (!e || Math.abs(e.scale - scale) > 1e-3 * scale) markSprites.set(m, (e = { scale, halo: null, body: null }));
  const sp = e;
  const st = strokeFor(m);
  const bb = st.bbox;
  if (!sp.halo)
    return () => {
      const res = 0.25;
      sp.halo = markSprite(bb.x0 - 40, bb.y0 - 40, bb.x1 + 40, bb.y1 + 40, scale, res, (g) => {
        g.filter = `blur(${Math.max(1, 12 * scale * res)}px)`;
        g.fillStyle = m.kind === 'kin' ? 'rgba(255,196,70,0.95)' : rgba(INKS[m.kind].light, 0.9);
        polyPath(g, strokeOutline(st.pts.map((q) => ({ ...q, w: q.w * 2.2 })), true, st.seed));
        g.fill();
      });
    };
  if (!sp.body)
    return () => {
      sp.body = markSprite(bb.x0 - 20, bb.y0 - 20, bb.x1 + 20, bb.y1 + 20, scale, 1, (g) => paintWatercolor(g, st.pts, m.kind, st.seed, true));
    };
  return null;
}

/**
 * The sprites the game's Stroke.draw needs for a live paint-in (the dried look shared with the chunks,
 * plus the wet bloom), baked one piece per call instead of all at once in Stroke.bake.
 */
function livePrep(m: Mark, scale: number): (() => void) | null {
  const work = markPrep(m, scale);
  if (work) return work;
  const sp = markSprites.get(m)!;
  const st = strokeFor(m);
  const bb = st.bbox;
  if (!sp.wet)
    return () => {
      const res = 0.5;
      const def = INKS[m.kind];
      sp.wet = markSprite(bb.x0 - 40, bb.y0 - 40, bb.x1 + 40, bb.y1 + 40, scale, res, (g) => {
        g.filter = `blur(${Math.max(1, 5 * scale * res)}px)`;
        g.fillStyle = rgba(def.color, 0.75);
        polyPath(g, strokeOutline(st.pts.map((q) => ({ ...q, w: q.w * 1.9 })), true, st.seed));
        g.fill();
        g.fillStyle = rgba(def.light, 0.6);
        polyPath(g, strokeOutline(st.pts.map((q) => ({ ...q, w: q.w * 0.7 })), true, st.seed + 1));
        g.fill();
      });
    };
  const as = (x: MarkSprite, res: number) => ({ canvas: x.c, x: x.x, y: x.y, s: scale * res });
  st.sprite = as(sp.body!, 1);
  st.glow = as(sp.halo!, 0.25);
  st.wet = as(sp.wet, 0.5);
  return null;
}

/** A dried mark, drawn the way the game draws a dried stroke: a soft halo, then the watercolor. */
function drawMarkStatic(ctx: CanvasRenderingContext2D, m: Mark, scale: number) {
  let sp = markSprites.get(m);
  if (!sp || Math.abs(sp.scale - scale) > 1e-3 * scale || !sp.halo || !sp.body) {
    // not prepared (a caller outside the chunk baker): bake now
    for (let work = markPrep(m, scale); work; work = markPrep(m, scale)) work();
    sp = markSprites.get(m)!;
  }
  drawMarkUnder(ctx, m);
  const a = markAlpha(m);
  const h = sp.halo!;
  const b = sp.body!;
  ctx.globalAlpha = (m.kind === 'kin' ? 0.75 : 0.3) * a;
  ctx.drawImage(h.c, h.x, h.y, h.w, h.h);
  ctx.save();
  ctx.globalAlpha = a;
  clipMark(ctx, m);
  ctx.drawImage(b.c, b.x, b.y, b.w, b.h);
  ctx.restore();
  ctx.globalAlpha = 1;
  drawMarkOver(ctx, m, a);
}

/** A lantern's light stays inside its paper. */
function clipMark(ctx: CanvasRenderingContext2D, m: Mark) {
  if (m.role !== 'lantern') return;
  ctx.beginPath();
  ctx.ellipse(m.ax, m.ay + 10 + LANTERN_RY, LANTERN_RX - 0.5, LANTERN_RY - 0.5, 0, 0, Math.PI * 2);
  ctx.clip();
}

const strokeCache = new WeakMap<Mark, Stroke>();
/** The game's own stroke pipeline (smoothing, watercolor seed) for a mark. */
function strokeFor(m: Mark): Stroke {
  let s = strokeCache.get(m);
  if (!s) {
    s = new Stroke(m.kind, m.pts, 0, m.seed);
    strokeCache.set(m, s);
  }
  return s;
}

function markItem(items: Item[], m: Mark) {
  items.push({
    name: 'mark-' + m.role,
    x0: m.x0 - 20,
    x1: m.x1 + 20,
    scroll: m.scroll,
    prep: (scale) => markPrep(m, scale),
    draw: (ctx) => drawMarkStatic(ctx, m, ctx.getTransform().a),
  });
}

/** The festival line the lanterns hang from: an ink string between two bamboo poles standing by the road. */
function festoon(items: Item[], id: string, ms: Mark[], roadY: (x: number) => number) {
  const ls = ms.filter((m) => m.role === 'lantern').sort((a, b) => a.ax - b.ax);
  if (!ls.length) return;
  const xL = ls[0].ax - 40;
  const xR = ls[ls.length - 1].ax + 40;
  const top = (x: number) => roadY(x) - LANTERN_LIFT - 16;
  const pts: Vec[] = [{ x: xL, y: top(xL) }];
  for (const l of ls) {
    const p = pts[pts.length - 1];
    pts.push({ x: (p.x + l.ax) / 2, y: (p.y + l.ay) / 2 + 7 }, { x: l.ax, y: l.ay });
  }
  const p = pts[pts.length - 1];
  pts.push({ x: (p.x + xR) / 2, y: (p.y + top(xR)) / 2 + 7 }, { x: xR, y: top(xR) });
  const seed = hashId(id) + 3;
  items.push({
    name: 'festoon',
    x0: xL - 20,
    x1: xR + 20,
    draw: (ctx) => {
      const r = mulberry32(seed);
      for (const x of [xL, xR]) {
        const y0 = top(x) - 22;
        const y1 = roadY(x) + 2;
        brushLine(ctx, [{ x, y: y0 }, { x: x + range(r, -1.5, 1.5), y: y1 }], r, { w: 3.4, color: INK, alpha: 0.6, taperIn: 4, taperOut: 3, bristles: 2, dry: 0.4 });
        for (let y = y0 + 26; y < y1 - 10; y += 38) brushLine(ctx, [{ x: x - 3, y }, { x: x + 3, y: y + 1 }], r, { w: 1.6, color: INK, alpha: 0.5 });
      }
      brushLine(ctx, pts, r, { w: 1.7, color: INK, alpha: 0.6, taperIn: 1, taperOut: 1, wobble: 0.15 });
    },
  });
}

// ─────────────────────────────────────────────────────────────── static scenery

/** Faint foxing and water marks in the old paper. */
function paperStains(items: Item[], width: number) {
  const r = mulberry32(71);
  for (let x = 200; x < width; x += range(r, 500, 900)) {
    const cx = x;
    const cy = range(r, 120, 620);
    const rad = range(r, 120, 260);
    const a = range(r, 0.025, 0.05);
    items.push({
      name: 'stain',
      x0: cx - rad,
      x1: cx + rad,
      draw: (ctx) => {
        const g = ctx.createRadialGradient(cx, cy, rad * 0.2, cx, cy, rad);
        g.addColorStop(0, `rgba(150,120,80,${a})`);
        g.addColorStop(0.8, `rgba(150,120,80,${a * 0.6})`);
        g.addColorStop(1, 'rgba(150,120,80,0)');
        ctx.fillStyle = g;
        ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
      },
    });
  }
}

/** Two ranges of ink-wash mountains along the whole scroll. */
function mountains(items: Item[], width: number, layer: number, seed: number) {
  const base = layer ? 420 : 360;
  const amp = layer ? 110 : 170;
  const alpha = layer ? 0.17 : 0.1;
  const freq = layer ? 0.0042 : 0.0026;
  const ridge = (x: number) => base - Math.pow(fbm1(x * freq, seed), 1.6) * amp * 2.1 + 40;
  items.push({
    name: 'mountains',
    x0: 0,
    x1: width,
    draw: (ctx) => {
      const t = ctx.getTransform();
      // sample on a fixed 6-unit grid so neighbouring chunks meet seamlessly
      const vx0 = Math.max(0, Math.floor((-t.e / t.a - 16) / 6) * 6);
      const vx1 = Math.min(width, vx0 + ctx.canvas.width / t.a + 36);
      const pts: Vec[] = [{ x: vx0, y: 640 }];
      for (let x = vx0; x <= vx1; x += 6) pts.push({ x, y: ridge(x) });
      pts.push({ x: vx1, y: ridge(vx1) }, { x: vx1, y: 640 });
      const g = ctx.createLinearGradient(0, base - amp * 1.6, 0, 600);
      g.addColorStop(0, rgba(INK, alpha));
      g.addColorStop(0.55, rgba(INK, alpha * 0.45));
      g.addColorStop(1, rgba(INK, 0));
      ctx.fillStyle = g;
      polyPath(ctx, pts);
      ctx.fill();
      // a dry-brush contour along the ridge
      ctx.strokeStyle = rgba(INK, alpha * 1.4);
      ctx.lineWidth = layer ? 1.6 : 1.2;
      ctx.beginPath();
      for (let i = 1; i < pts.length - 1; i++) {
        if (noise1(pts[i].x * 0.01, seed + 3) < 0.42) {
          ctx.stroke();
          ctx.beginPath();
          continue;
        }
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.stroke();
    },
  });
}

/** The river along the foot of the scroll, in plain ink: a pale wash between two banks and broken brush lines. */
function river(items: Item[], xa: number, xb: number) {
  // fade in at the start and out into the blot at the end
  const fade = (x: number) => clamp((x - xa) / 260, 0, 1) * clamp((xb - x) / 320, 0, 1);
  const bankTop = (x: number) => riverY(x) - 17 - noise1(x * 0.01, 5) * 4;
  const bankBot = (x: number) => riverY(x) + 25 + noise1(x * 0.012, 6) * 5;
  // brush runs on a fixed 30-unit grid, so every chunk agrees where each one starts and ends
  const CELL = 30;
  const lines = [
    { y: bankTop, seed: 11, on: 0.36, w: 3.2, a: 0.42 },
    { y: bankBot, seed: 12, on: 0.34, w: 3.6, a: 0.36 },
    { y: (x: number) => riverY(x) - 3 + Math.sin(x * 0.03) * 1.5, seed: 13, on: 0.52, w: 1.7, a: 0.22 },
    { y: (x: number) => riverY(x) + 10 + Math.sin(x * 0.025 + 2) * 1.5, seed: 14, on: 0.5, w: 1.5, a: 0.2 },
  ];
  const runs: { line: number; x0: number; x1: number }[] = [];
  lines.forEach((ln, li) => {
    let start = -1;
    for (let c = Math.floor(xa / CELL); c * CELL <= xb; c++) {
      const on = noise1(c * 0.37, ln.seed) > ln.on && fade(c * CELL) > 0.05;
      if (on && start < 0) start = c;
      if ((!on || (c + 1) * CELL > xb) && start >= 0) {
        if (c - start >= 2) runs.push({ line: li, x0: start * CELL, x1: c * CELL });
        start = -1;
      }
    }
  });
  const STEP = 400;
  for (let s0 = xa; s0 < xb; s0 += STEP) {
    const s1 = Math.min(xb, s0 + STEP);
    const mine = runs.filter((r) => r.x0 >= s0 && r.x0 < s1);
    const reach = Math.max(s1, ...mine.map((r) => r.x1));
    items.push({
      name: 'river',
      x0: s0 - 4,
      x1: reach + 4,
      draw: (ctx) => {
        const top: Vec[] = [];
        const bot: Vec[] = [];
        for (let x = s0; x <= s1 + 0.1; x += 8) {
          top.push({ x, y: bankTop(x) });
          bot.push({ x, y: bankBot(x) });
        }
        const g = ctx.createLinearGradient(s0, 0, s1, 0);
        for (let k = 0; k <= 4; k++) g.addColorStop(k / 4, rgba(INK, 0.055 * fade(s0 + ((s1 - s0) * k) / 4)));
        ctx.fillStyle = g;
        polyPath(ctx, top.concat(bot.slice().reverse()));
        ctx.fill();
        for (const run of mine) {
          const ln = lines[run.line];
          const pts: Vec[] = [];
          for (let x = run.x0; x <= run.x1 + 0.1; x += 10) pts.push({ x, y: ln.y(x) });
          const len = run.x1 - run.x0;
          brushLine(ctx, pts, mulberry32(run.x0 * 7 + run.line), {
            w: ln.w,
            color: INK,
            alpha: ln.a * fade((run.x0 + run.x1) / 2),
            taperIn: len * 0.3,
            taperOut: len * 0.4,
            bristles: run.line < 2 ? 2 : 0,
            dry: 0.6,
          });
        }
      },
    });
  }
}

const SCENERY: Record<string, [Decor['kind'], number][]> = {
  spring: [['pine', 3], ['maple', 3], ['rock', 1], ['reeds', 1]],
  summer: [['bamboo', 3], ['reeds', 3], ['pine', 2], ['rock', 1]],
};

/** Trees and rocks on the far bank of the river along a chapter's stretch, small and in the distance. */
function chapterScenery(items: Item[], ch: Chapter, x0: number, x1: number, nodeXs: number[]) {
  const kinds = SCENERY[ch.id] ?? SCENERY.spring;
  const total = kinds.reduce((a, k) => a + k[1], 0);
  const r = mulberry32(ch.id.length * 977 + x0);
  for (let x = x0 + range(r, 160, 260); x < x1 - 40; x += range(r, 140, 300)) {
    let roll = r() * total;
    let kind = kinds[0][0];
    for (const [k, w] of kinds) if ((roll -= w) <= 0) { kind = k; break; }
    const s = range(r, 0.2, 0.3);
    const seed = Math.floor(r() * 1e6);
    const flip = r() < 0.5;
    // keep the bank under node labels clear
    if (nodeXs.some((nx) => Math.abs(nx - x) < 130)) continue;
    const d: Decor = { kind, x, y: riverY(x) - 18, s, seed, flip };
    items.push({ name: 'decor', x0: x - 110, x1: x + 110, draw: (ctx) => { ctx.globalAlpha = 0.6; drawDecor(ctx, d); ctx.globalAlpha = 1; } });
  }
}

/** The journey's path: inked where the traveler has walked, faint dots ahead. */
function pathItems(items: Item[], path: Vec[], cum: number[], inkedTo: number, width: number) {
  const total = cum[cum.length - 1];
  const STEP = 300;
  for (let s0 = 0; s0 < total; s0 += STEP) {
    const s1 = Math.min(total, s0 + STEP + 6);
    const xs: number[] = [];
    for (let s = s0; s <= s1; s += 8) xs.push(pointAt(path, cum, s).x);
    const seg0 = Math.min(...xs) - 30;
    const seg1 = Math.max(...xs) + 30;
    const seed = Math.floor(s0) + 11;
    // the inked part of this segment (the walked path ends exactly at the frontier node)
    const inkEnd = Math.min(s1, inkedTo);
    const inked: Vec[] = [];
    if (inkEnd > s0 + 2) {
      for (let s = s0; s < inkEnd; s += 8) inked.push(pointAt(path, cum, s));
      inked.push(pointAt(path, cum, inkEnd));
    }
    items.push({
      name: 'path',
      x0: seg0,
      x1: Math.min(width, seg1),
      draw: (ctx) => {
        if (inked.length > 1) {
          brushLine(ctx, inked, mulberry32(seed), { w: 7, color: INK, alpha: 0.85, taperIn: 0.01, taperOut: 0.01, bristles: 3, dry: 0.3 });
        }
        if (s1 > inkedTo) footsteps(ctx, path, cum, Math.max(s0, inkedTo + 50), s1);
      },
    });
  }
}

/** Dotted footsteps ahead along the path, on a fixed 20-unit grid of arclength. */
function footsteps(ctx: CanvasRenderingContext2D, path: Vec[], cum: number[], from: number, to: number) {
  ctx.fillStyle = rgba(INK, 0.32);
  for (let s = Math.ceil(from / 20) * 20; s < to; s += 20) {
    const p = pointAt(path, cum, s);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 3.2, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function title(items: Item[], c: Campaign) {
  items.push({
    name: 'title',
    x0: 0,
    x1: TITLE_W,
    draw: (ctx) => {
      ctx.fillStyle = INK;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.font = `150px ${FONT_BRUSH}`;
      ctx.globalAlpha = 0.9;
      ctx.fillText('墨', 120, 250);
    },
  });
  // large brush text is slow to rasterize the first time: the rest is its own baking step
  items.push({
    name: 'title',
    x0: 0,
    x1: TITLE_W,
    draw: (ctx) => {
      ctx.fillStyle = INK;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.font = `52px ${FONT_BRUSH}`;
      ctx.fillText(c.title, 120, 330);
      ctx.font = `italic 24px ${FONT_SERIF}`;
      ctx.globalAlpha = 0.72;
      ctx.fillText("Finish the master's scroll, one season at a time.", 122, 372);
      ctx.globalAlpha = 1;
      brushLine(ctx, [{ x: 122, y: 396 }, { x: 186, y: 397 }], mulberry32(5), { w: 5, color: SHU, alpha: 0.9 });
    },
  });
}

function header(items: Item[], ch: Chapter, x0: number, state: string) {
  items.push({
    name: 'header',
    x0,
    x1: x0 + 520,
    draw: (ctx) => {
      ctx.fillStyle = INK;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.globalAlpha = state === 'locked' ? 0.55 : 0.92;
      ctx.font = `128px ${FONT_BRUSH}`;
      ctx.fillText(ch.kanji, x0 + 40, 228);
    },
  });
  items.push({
    name: 'header',
    x0,
    x1: x0 + 520,
    draw: (ctx) => {
      ctx.fillStyle = INK;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.globalAlpha = state === 'locked' ? 0.55 : 0.92;
      ctx.font = `600 28px ${FONT_SERIF}`;
      ctx.fillText(ch.name, x0 + 46, 274);
      ctx.font = `italic 22px ${FONT_SERIF}`;
      ctx.globalAlpha *= 0.75;
      ctx.fillText(ch.subtitle, x0 + 46, 302);
      ctx.globalAlpha = 1;
      // a seam where two sheets of the scroll were joined
      ctx.strokeStyle = rgba(INK, 0.08);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x0 - 20, BAND);
      ctx.lineTo(x0 - 20, MAP_H - BAND);
      ctx.stroke();
    },
  });
}

/** A small hanging-scroll glyph marking a cutscene slot. */
function slotGlyph(items: Item[], x: number, y: number, label: string, name: string) {
  items.push({
    name: 'slot',
    x0: x - 110,
    x1: x + 110,
    draw: (ctx) => {
      ctx.save();
      ctx.translate(x, y - 70);
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = rgba(INK, 0.06);
      ctx.fillRect(-16, -26, 32, 58);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.strokeRect(-16, -26, 32, 58);
      ctx.fillStyle = INK;
      ctx.fillRect(-21, -31, 42, 6);
      ctx.fillRect(-21, 31, 42, 5);
      const gr = mulberry32(Math.floor(x));
      for (const lx of [7, 0, -7]) brushLine(ctx, [{ x: lx, y: -18 }, { x: lx, y: range(gr, 4, 20) }], gr, { w: 2.6, color: INK, taperOut: 6 });
      ctx.globalAlpha = 0.6;
      ctx.textAlign = 'center';
      ctx.font = `italic 19px ${FONT_SERIF}`;
      ctx.fillText(label, 0, 62);
      ctx.font = `15px ${FONT_SERIF}`;
      ctx.globalAlpha = 0.45;
      ctx.fillText(name, 0, 84);
      ctx.restore();
    },
  });
}

/** An irregular ink pool: a noisy disc. */
function blobPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, rad: number, seed: number, rough = 0.28) {
  const n = 64;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + (fbm1(Math.cos(a) * 1.6 + 5, seed) + fbm1(Math.sin(a) * 1.6 + 9, seed + 1) - 1) * rough * 2;
    const x = cx + Math.cos(a) * rad * k;
    const y = cy + Math.sin(a) * rad * k * 0.82;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
}

/** The blot (墨染) soaking a stretch of paper: a soft bleed, a pooled core with a darker rim, a few runs. */
function drawBlot(ctx: CanvasRenderingContext2D, cx: number, cy: number, rad: number, seed: number, r: RNG) {
  // the bleed: a soft radial wash, its edge broken up by a noisy clip
  ctx.save();
  blobPath(ctx, cx, cy, rad * 1.75, seed + 1, 0.22);
  ctx.clip();
  const g = ctx.createRadialGradient(cx, cy, rad * 0.5, cx, cy, rad * 1.8);
  g.addColorStop(0, rgba(INK, 0.32));
  g.addColorStop(0.55, rgba(INK, 0.12));
  g.addColorStop(1, rgba(INK, 0));
  ctx.fillStyle = g;
  ctx.fillRect(cx - rad * 2, cy - rad * 2, rad * 4, rad * 4);
  ctx.restore();
  // the pooled core: lighter inside, darker where the ink dried at its rim
  blobPath(ctx, cx, cy, rad, seed + 20, 0.2);
  const core = ctx.createRadialGradient(cx - rad * 0.2, cy - rad * 0.2, rad * 0.1, cx, cy, rad * 1.1);
  core.addColorStop(0, rgba(INK, 0.6));
  core.addColorStop(0.75, rgba(INK, 0.8));
  core.addColorStop(1, rgba(INK, 0.95));
  ctx.fillStyle = core;
  ctx.fill();
  ctx.strokeStyle = rgba(INK, 0.5);
  ctx.lineWidth = 3;
  ctx.stroke();
  // two runs down the paper
  for (let i = 0; i < 2; i++) {
    const dx = cx + range(r, -0.45, 0.45) * rad;
    const y0 = cy + rad * 0.6;
    const len = range(r, 50, 110);
    brushLine(ctx, [{ x: dx, y: y0 }, { x: dx + range(r, -3, 3), y: y0 + len * 0.6 }, { x: dx + range(r, -4, 4), y: y0 + len }], r, {
      w: range(r, 7, 11), color: INK, alpha: 0.7, taperIn: 2, taperOut: len * 0.7,
    });
    ctx.fillStyle = rgba(INK, 0.7);
    ctx.beginPath();
    ctx.arc(dx, y0 + len + 4, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // a little splatter
  ctx.fillStyle = rgba(INK, 0.6);
  for (let i = 0; i < 9; i++) {
    const a = r() * Math.PI * 2;
    const d = rad * range(r, 1.15, 1.6);
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, range(r, 1.2, 3.6), 0, Math.PI * 2);
    ctx.fill();
  }
}

/** A chapter with no scrolls yet: still rolled up, its label half drowned in the blot. */
function sealedChapter(items: Item[], ch: Chapter, x0: number) {
  const cx = x0 + SEALED_W / 2;
  const top = 150;
  const bot = 560;
  const rw = 96;
  const seed = ch.id.charCodeAt(0) * 31 + ch.id.length;
  items.push({
    name: 'sealed',
    x0: x0 - 120,
    x1: x0 + SEALED_W + 120,
    draw: (ctx) => {
      const r = mulberry32(seed);
      // shadow under the roll
      ctx.fillStyle = rgba(INK, 0.12);
      ctx.beginPath();
      ctx.ellipse(cx + 14, bot + 14, rw * 0.75, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      // the rolled paper cylinder
      const body = ctx.createLinearGradient(cx - rw / 2, 0, cx + rw / 2, 0);
      body.addColorStop(0, '#cbbd9f');
      body.addColorStop(0.3, '#f6efe0');
      body.addColorStop(0.62, '#e2d5bb');
      body.addColorStop(1, '#a8977a');
      ctx.fillStyle = body;
      ctx.fillRect(cx - rw / 2, top, rw, bot - top);
      // spiral end of the roll
      ctx.fillStyle = '#e8dcc4';
      ctx.beginPath();
      ctx.ellipse(cx, top, rw / 2, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = rgba(INK, 0.35);
      ctx.lineWidth = 1.2;
      for (let i = 1; i < 5; i++) {
        ctx.beginPath();
        ctx.ellipse(cx + i * 1.5, top, (rw / 2) * (1 - i * 0.18), 14 * (1 - i * 0.18), 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.strokeStyle = rgba(INK, 0.45);
      ctx.lineWidth = 2;
      ctx.strokeRect(cx - rw / 2, top, rw, bot - top);
      // the cord
      brushLine(ctx, [{ x: cx - rw / 2 - 4, y: 352 }, { x: cx, y: 356 }, { x: cx + rw / 2 + 4, y: 352 }], r, { w: 6, color: INK, alpha: 0.85 });
      brushLine(ctx, curve({ x: cx + rw / 2, y: 354 }, { x: cx + rw / 2 + 40, y: 380 }, { x: cx + rw / 2 + 22, y: 430 }), r, {
        w: 4, color: INK, alpha: 0.7, taperOut: 30,
      });
      // the title slip
      ctx.fillStyle = '#f3ecdc';
      ctx.fillRect(cx - 18, top + 30, 36, 130);
      ctx.strokeStyle = rgba(INK, 0.4);
      ctx.lineWidth = 1.2;
      ctx.strokeRect(cx - 18, top + 30, 36, 130);
      ctx.fillStyle = INK;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `40px ${FONT_BRUSH}`;
      ctx.globalAlpha = 0.85;
      ctx.fillText(ch.kanji, cx, top + 70);
      ctx.globalAlpha = 1;
    },
  });
  items.push({
    name: 'sealed',
    x0: x0 - 120,
    x1: x0 + SEALED_W + 120,
    draw: (ctx) => {
      const r = mulberry32(seed + 1);
      ctx.fillStyle = INK;
      ctx.textAlign = 'center';
      // the blot creeping over it
      drawBlot(ctx, cx + range(r, -40, 40), range(r, 390, 450), range(r, 82, 102), seed, r);
      // the name, faded
      ctx.textBaseline = 'alphabetic';
      ctx.font = `600 26px ${FONT_SERIF}`;
      ctx.globalAlpha = 0.6;
      ctx.fillText(ch.name, cx, 630);
      ctx.font = `italic 20px ${FONT_SERIF}`;
      ctx.globalAlpha = 0.45;
      ctx.fillText(`${ch.subtitle} · still rolled up`, cx, 660);
      ctx.globalAlpha = 1;
    },
  });
}

/** The blot soaking the paper from the first rolled-up chapter to the end: one smooth wash. */
function sealedWash(items: Item[], x0: number, width: number) {
  items.push({
    name: 'wash',
    x0: x0 - 260,
    x1: width,
    draw: (ctx) => {
      const g = ctx.createLinearGradient(x0 - 260, 0, x0 + 260, 0);
      g.addColorStop(0, rgba(INK, 0));
      g.addColorStop(1, rgba(INK, 0.075));
      ctx.fillStyle = g;
      ctx.fillRect(x0 - 260, BAND, width - x0 + 260, MAP_H - BAND * 2);
    },
  });
}

/** Wooden rollers at both ends of the handscroll. */
function rollers(items: Item[], width: number) {
  const rod = (ctx: CanvasRenderingContext2D, x: number) => {
    const g = ctx.createLinearGradient(x - 14, 0, x + 14, 0);
    g.addColorStop(0, '#2a241f');
    g.addColorStop(0.45, '#5a4a3c');
    g.addColorStop(1, '#1d1916');
    ctx.fillStyle = g;
    ctx.fillRect(x - 14, 0, 28, MAP_H);
    ctx.fillStyle = INK;
    ctx.fillRect(x - 18, 0, 36, 10);
    ctx.fillRect(x - 18, MAP_H - 10, 36, 10);
  };
  items.push({ x0: 0, x1: 40, draw: (ctx) => rod(ctx, 16) });
  items.push({ x0: width - 40, x1: width, draw: (ctx) => rod(ctx, width - 16) });
}

/** Silk mounting bands along the top and bottom edge. */
function bands(ctx: CanvasRenderingContext2D, x0: number, w: number) {
  for (const y of [0, MAP_H - BAND]) {
    ctx.fillStyle = '#3b3741';
    ctx.fillRect(x0, y, w, BAND);
    // a faint woven pattern, anchored to map x so chunks meet
    ctx.fillStyle = 'rgba(239,230,211,0.07)';
    for (let x = Math.floor(x0 / 24) * 24; x < x0 + w; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, y + BAND / 2);
      ctx.lineTo(x + 6, y + 4);
      ctx.lineTo(x + 12, y + BAND / 2);
      ctx.lineTo(x + 6, y + BAND - 4);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(190,160,100,0.55)';
    ctx.fillRect(x0, y === 0 ? BAND - 2 : y, w, 2);
  }
}

// ─────────────────────────────────────────────────────────────── the map

export interface OpenOptions {
  /** center the map on this scroll */
  focus?: string;
  /** walk the traveler from `focus` to this newly opened scroll and brush its node in */
  reveal?: string;
  /** this scroll has a new best: paint its stretch in live, stroke by stroke, before any walk */
  paint?: string;
}

interface Walk {
  s0: number;
  s1: number;
  t: number;
  dur: number;
}

interface LiveMark {
  m: Mark;
  stroke: Stroke;
  baked: boolean;
  start: number;
  dur: number;
  landed: boolean;
  nextNote: number;
}

interface PaintIn {
  id: string;
  marks: LiveMark[];
  t: number;
  /** when the last stroke lands */
  end: number;
  stretch: [number, number];
  /** map-x extent of the strokes painted in (all inside the stretch, the moon too) */
  span: [number, number];
  /** the camera follows the paint-in until the player takes it */
  cam: boolean;
  /** how long to stay on the last stroke once it has landed, before any walk */
  linger: number;
  /** the strokes are dry; the chunks under them are being rebaked with them in */
  settled: boolean;
}

interface ChunkJob {
  i: number;
  c: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
  items: Item[];
  k: number;
  x0: number;
  unitW: number;
}

/** What the map is showing, for tests and the proof page. */
export interface MapInspect {
  width: number;
  camX: number;
  scale: number;
  pr: number;
  painting: { id: string; landed: number; total: number; settled: boolean } | null;
  walking: boolean;
  /** the paint-in's lean-in on a phone (1: none) */
  zoom: number;
  chunks: { ready: number; baking: number; stale: number };
  marks: { scroll: string; kind: string; role: string; pts: [number, number][] }[];
  trail: number;
}

export class CampaignMap {
  onPlay: (id: string) => void = () => {};
  onBack: () => void = () => {};
  /** the game's audio, for the paint-in's notes */
  audio: Audio | null = null;
  isOpen = false;
  camX = 0;

  private view: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private nodesEl: HTMLElement;
  private hintEl: HTMLElement;
  private vignette: HTMLCanvasElement | null = null;
  private L: Layout | null = null;
  private signature = '';
  private chunks = new Map<number, HTMLCanvasElement>();
  private jobs = new Map<number, ChunkJob>();
  /** ready chunks that no longer match the layout; shown until their rebake finishes */
  private stale = new Set<number>();
  /** the scroll whose strokes are left out of the chunks (they are being painted in live) */
  private hidden: string | null = null;
  private buttons = new Map<string, HTMLButtonElement>();

  private W = 0;
  private H = 0;
  private pr = 1;
  private scale = 1;
  private chunkPx = 512;
  private targetX = 0;
  private vel = 0;
  private drag: { id: number; x: number; cam: number; moved: boolean; lastX: number; lastT: number } | null = null;
  private suppressClick = false;
  private t = 0;
  private hover: string | null = null;

  private charId: CharId = 'ren';
  private character = new Character('ren');
  private walk: Walk | null = null;
  /** the stretch of path inked live as the traveler walks it */
  private trail: { s0: number; s1: number } | null = null;
  private travelerS = 0;
  private revealId: string | null = null;
  private revealT = 1;
  private paint: PaintIn | null = null;
  private zoom = 1;
  private zoomShown = 1;
  private phase = 0;
  private hintTimer: ReturnType<typeof setTimeout> | undefined;
  /** the Escape that ended a run must not also close the map it opened */
  private openedAt = 0;

  constructor(
    public root: HTMLElement,
    private grain: HTMLCanvasElement,
    private campaign: Campaign = CAMPAIGN,
  ) {
    this.view = root.querySelector<HTMLElement>('.map-view')!;
    this.canvas = root.querySelector<HTMLCanvasElement>('canvas')!;
    this.ctx = this.canvas.getContext('2d')!;
    this.nodesEl = root.querySelector<HTMLElement>('.map-nodes')!;
    this.hintEl = root.querySelector<HTMLElement>('.map-hint')!;
    this.bindInput();
    window.addEventListener('resize', () => this.isOpen && this.resize());
  }

  /** map units visible across the view */
  private get viewUnits() {
    return this.W / this.scale;
  }

  open(char: CharId, opts: OpenOptions = {}) {
    this.isOpen = true;
    this.openedAt = performance.now();
    this.setChar(char);
    this.resize();
    const save = loadCampaign();
    const willPaint = !!opts.paint && isCleared(opts.paint) && !!save.strokes[opts.paint]?.strokes.length;
    this.rebuild(opts.reveal ? opts.focus : undefined, willPaint ? opts.paint! : null);
    let L = this.L!;
    const find = (id?: string) => (id ? L.nodes.find((n) => n.scroll.id === id) : undefined);
    const front = L.nodes.find((n) => n.state === 'open') ?? L.nodes.filter((n) => n.state === 'cleared').pop() ?? L.nodes[0];
    const from = find(opts.focus) ?? front;
    const to = find(opts.reveal);
    const walking = !!to && to !== from && to.state === 'open';
    if (opts.reveal && !walking) {
      // nothing to walk to after all: ink the path to the frontier as usual
      this.rebuild(undefined, this.hidden);
      L = this.L!;
    }
    this.walk = null;
    this.trail = null;
    this.revealId = null;
    this.revealT = 1;
    if (walking) {
      this.travelerS = from.s;
      this.walk = { s0: from.s, s1: to.s, t: -0.5, dur: 0.9 + Math.abs(to.s - from.s) / 420 };
      this.trail = { s0: from.s, s1: to.s };
      this.revealId = to.scroll.id;
      this.revealT = 0;
    } else {
      this.travelerS = (find(opts.focus) ?? front).s;
    }
    this.startPaint(willPaint ? opts.paint! : null);
    const focusX = this.paint ? this.paintFocus(this.paint) : from.x;
    this.camX = this.targetX = this.clampCam(focusX - this.viewUnits * (this.paint ? 0.5 : 0.42));
    this.vel = 0;
    this.character.reset();
    this.setHint(null);
    this.placeButtons();
  }

  /** Show the current lean-in (a CSS transform on the canvas and the node buttons over it). */
  private applyZoom() {
    if (Math.abs(this.zoom - this.zoomShown) < 0.0005) return;
    this.zoomShown = this.zoom;
    const tf = this.zoom === 1 ? '' : `scale(${this.zoom.toFixed(4)})`;
    for (const el of [this.canvas, this.nodesEl]) {
      el.style.transformOrigin = ZOOM_ORIGIN;
      el.style.transform = tf;
    }
  }

  close() {
    this.isOpen = false;
    this.zoom = 1;
    this.applyZoom();
    this.drag = null;
    clearTimeout(this.hintTimer);
    // an unfinished paint-in is over: the next open bakes the strokes in as usual
    this.paint = null;
  }

  setChar(c: CharId) {
    if (c === this.charId) return;
    this.charId = c;
    this.character = new Character(c);
  }

  /** Recompute the layout when progress changed; keep baked chunks otherwise. */
  private rebuild(holdAt: string | undefined, hide: string | null) {
    const save = loadCampaign();
    const sig = JSON.stringify([
      scrollStateSig(this.campaign),
      Object.entries(save.strokes).map(([id, s]) => [id, s.time, s.strokes.length]),
      holdAt ?? '',
    ]);
    if (sig !== this.signature || !this.L) {
      this.signature = sig;
      this.L = layout(this.campaign, save.strokes, { holdAt });
      this.dropChunks();
      this.makeButtons();
    }
    if (hide !== this.hidden) {
      this.hidden = hide;
      this.dropChunks();
    }
  }

  private dropChunks() {
    this.chunks.clear();
    this.jobs.clear();
    this.stale.clear();
  }

  resize() {
    const cssW = this.view.clientWidth || window.innerWidth;
    const cssH = this.view.clientHeight || window.innerHeight;
    const cap = IS_TOUCH ? 1000 : MAX_RENDER_H;
    let pr = window.devicePixelRatio || 1;
    if (cssH * pr > cap) pr = cap / cssH;
    const W = Math.round(cssW * pr);
    const H = Math.round(cssH * pr);
    if (W === this.W && H === this.H && this.pr === pr) return;
    this.pr = pr;
    this.W = this.canvas.width = W;
    this.H = this.canvas.height = H;
    this.canvas.style.width = cssW + 'px';
    this.canvas.style.height = cssH + 'px';
    this.scale = H / MAP_H;
    this.chunkPx = Math.round(CHUNK * this.scale);
    this.vignette = makeVignette(W, H);
    this.dropChunks();
    if (this.paint) for (const lm of this.paint.marks) lm.baked = false;
    if (this.L) this.camX = this.targetX = this.clampCam(this.camX);
  }

  private clampCam(x: number) {
    const max = (this.L?.width ?? 0) - this.viewUnits;
    return max <= 0 ? max / 2 : clamp(x, 0, max);
  }

  // ───────────────────────────────────────────── baking, a few ms per frame

  private startJob(i: number): ChunkJob {
    const L = this.L!;
    const c = document.createElement('canvas');
    c.width = this.chunkPx;
    c.height = this.H;
    const g = c.getContext('2d')!;
    const unitW = this.chunkPx / this.scale;
    const x0 = i * unitW;
    g.setTransform(this.scale, 0, 0, this.scale, -x0 * this.scale, 0);
    g.fillStyle = PAPER;
    g.fillRect(x0, 0, unitW, MAP_H);
    const items = L.items.filter((it) => !(it.x1 < x0 - 2 || it.x0 > x0 + unitW + 2) && !(it.scroll && it.scroll === this.hidden));
    const job = { i, c, g, items, k: 0, x0, unitW };
    this.jobs.set(i, job);
    return job;
  }

  /** Draw the next item of a chunk; finish the chunk (grain and silk bands) after the last one. */
  private stepJob(job: ChunkJob) {
    const g = job.g;
    if (job.k < job.items.length) {
      const it = job.items[job.k];
      const stats = (window as unknown as { __mapBakeStats?: Record<string, number[]> }).__mapBakeStats;
      const t0 = stats ? performance.now() : 0;
      const work = it.prep?.(this.scale);
      if (work) work();
      else {
        job.k++;
        g.save();
        it.draw(g);
        g.restore();
      }
      if (stats) (stats[(it.name ?? 'other') + (work ? ' (prep)' : '')] ??= []).push(performance.now() - t0);
      return;
    }
    // washi grain, anchored to the scroll so it pans with the paper
    g.setTransform(1, 0, 0, 1, -job.i * this.chunkPx, 0);
    g.globalCompositeOperation = 'multiply';
    const pat = g.createPattern(this.grain, 'repeat');
    if (pat) {
      g.fillStyle = pat;
      g.fillRect(job.i * this.chunkPx, 0, this.chunkPx, this.H);
    }
    g.globalCompositeOperation = 'source-over';
    g.setTransform(this.scale, 0, 0, this.scale, -job.x0 * this.scale, 0);
    bands(g, job.x0, job.unitW);
    this.jobs.delete(job.i);
    this.chunks.set(job.i, job.c);
    this.stale.delete(job.i);
  }

  /**
   * Spend up to BAKE_BUDGET ms baking, most urgent first: chunks on screen, the paint-in's sprites,
   * stale chunks on screen, then neighbours ahead of a pan. Always makes some progress on screen.
   */
  private bake(i0: number, i1: number) {
    const L = this.L!;
    const deadline = performance.now() + BAKE_BUDGET;
    const maxI = Math.ceil((L.width * this.scale) / this.chunkPx);
    const valid = (i: number) => i >= 0 && i <= maxI;
    let first = true;
    const pick = (): (() => void) | null => {
      for (let i = i0; i <= i1; i++) {
        if (!valid(i) || this.chunks.has(i)) continue;
        const job = this.jobs.get(i) ?? this.startJob(i);
        return () => this.stepJob(job);
      }
      const p = this.paint;
      if (p) {
        const lm = p.marks.find((x) => !x.baked);
        if (lm) return livePrep(lm.m, this.scale) ?? (() => (lm.baked = true));
      }
      for (let i = i0; i <= i1; i++) {
        if (!this.stale.has(i)) continue;
        const job = this.jobs.get(i) ?? this.startJob(i);
        return () => this.stepJob(job);
      }
      for (const i of [i1 + 1, i0 - 1, i1 + 2, i0 - 2]) {
        if (!valid(i) || (this.chunks.has(i) && !this.stale.has(i))) continue;
        const job = this.jobs.get(i) ?? this.startJob(i);
        return () => this.stepJob(job);
      }
      return null;
    };
    while (first || performance.now() < deadline) {
      const work = pick();
      if (!work) break;
      work();
      first = false;
    }
    // drop far chunks
    for (const i of this.chunks.keys()) if (i < i0 - 4 || i > i1 + 4) this.chunks.delete(i), this.stale.delete(i);
    // a half-baked chunk is only ever resumed within two of the view (pick above), so one left further out is
    // dropped too, or it would count as baking for ever
    for (const i of this.jobs.keys()) if (i < i0 - 2 || i > i1 + 2) this.jobs.delete(i);
  }

  // ───────────────────────────────────────────── the paint-in

  private startPaint(id: string | null) {
    this.paint = null;
    const ms = id ? this.L!.marks.get(id) : undefined;
    const node = id ? this.L!.nodes.find((n) => n.scroll.id === id) : undefined;
    if (!id || !ms?.length || !node) return;
    let t = 0.9; // let the map fade in first
    // the strokes land in the order the player painted them; the moon (in the same stretch, so the same
    // view) rises last, after a breath
    const order = [...ms.filter((m) => m.role !== 'moon'), ...ms.filter((m) => m.role === 'moon')];
    const marks: LiveMark[] = order.map((m) => {
      if (m.role === 'moon') t += 0.45;
      const dur = clamp(0.2 + polyLen(m.pts) / 420, 0.26, 0.6) * (m.role === 'moon' ? 2 : 1);
      const lm: LiveMark = { m, stroke: strokeFor(m), baked: false, start: t, dur, landed: false, nextNote: t };
      t += dur * 0.62;
      return lm;
    });
    const end = Math.max(...marks.map((lm) => lm.start + lm.dur));
    const span: [number, number] = [Math.min(...ms.map((m) => m.x0)), Math.max(...ms.map((m) => m.x1))];
    const moon = order.some((m) => m.role === 'moon');
    this.paint = { id, marks, t: 0, end, stretch: node.stretch, span, cam: true, linger: moon ? 0.7 : 0.3, settled: false };
  }

  /** Where the paint-in's camera looks: the middle of the strokes it paints (the moon hangs among them). */
  private paintFocus(p: PaintIn): number {
    return (p.span[0] + p.span[1]) / 2;
  }

  /** Jump to the end of the paint-in (the player took the camera). */
  private finishPaint() {
    const p = this.paint;
    if (!p) return;
    p.cam = false;
    if (p.t >= p.end + DRY_TIME) return;
    p.t = p.end + DRY_TIME;
    for (const lm of p.marks) lm.landed = true;
  }

  private updatePaint(dt: number) {
    const p = this.paint;
    if (!p) return;
    // hold the clock while a stroke that is due has no sprite yet
    const due = p.marks.find((lm) => !lm.baked && lm.start <= p.t + dt);
    if (!due) p.t += dt;
    for (const lm of p.marks) {
      if (p.t < lm.start) break;
      if (!lm.landed && p.t < lm.start + lm.dur && p.t >= lm.nextNote) {
        // the game's painting music: pitch from height on the scroll
        const f = (p.t - lm.start) / lm.dur;
        const q = lm.m.pts[Math.min(lm.m.pts.length - 1, Math.floor(f * lm.m.pts.length))];
        this.audio?.fx('note', `${lm.m.kind}:${clamp(q.y / MAP_H, 0, 1).toFixed(2)}:0.55`);
        lm.nextNote += 0.11;
      }
      if (!lm.landed && p.t >= lm.start + lm.dur) {
        lm.landed = true;
        this.audio?.fx('stroke', lm.m.kind);
      }
      lm.stroke.age = Math.max(0, p.t - lm.start - lm.dur);
    }
    if (!p.settled && p.t > p.end + DRY_TIME + 0.4) {
      // dry: bake the strokes into the paper underneath, keeping the live ones until that is done
      p.settled = true;
      this.hidden = null;
      const unitW = this.chunkPx / this.scale;
      const cover = (x0: number, x1: number) => {
        for (let i = Math.floor((x0 - 200) / unitW); i <= Math.floor((x1 + 200) / unitW); i++) {
          this.jobs.delete(i);
          if (this.chunks.has(i)) this.stale.add(i);
        }
      };
      cover(p.stretch[0], p.stretch[1]);
      for (const lm of p.marks) if (lm.m.role === 'moon') cover(lm.m.x0, lm.m.x1);
    }
    if (p.settled && !p.marks.some((lm) => this.coveredByStale(lm.m))) this.paint = null;
  }

  private coveredByStale(m: Mark) {
    const unitW = this.chunkPx / this.scale;
    for (let i = Math.floor((m.x0 - 22) / unitW); i <= Math.floor((m.x1 + 22) / unitW); i++) if (this.stale.has(i) || this.jobs.has(i)) return true;
    return false;
  }

  private drawPaint(ctx: CanvasRenderingContext2D, vx0: number, vx1: number) {
    const p = this.paint;
    if (!p) return;
    for (const lm of p.marks) {
      const m = lm.m;
      const lantern = m.role === 'lantern';
      if ((p.t < lm.start && !lantern) || m.x1 < vx0 || m.x0 > vx1) continue;
      // already baked into the paper underneath: drawing it again would double it
      if (p.settled && !this.coveredByStale(m)) continue;
      // a lantern's paper and frame are there first, waiting for its light
      const age = p.t < lm.start + lm.dur ? -1 : lm.stroke.age;
      if (age >= DRY_TIME && lm.baked) {
        // dry: exactly what the paper will hold once it is rebaked
        ctx.save();
        drawMarkStatic(ctx, m, this.scale);
        ctx.restore();
        continue;
      }
      const ctxA = lantern ? 1 : clamp(age / 0.8, 0, 1);
      if (lantern || age >= 0) {
        ctx.save();
        drawMarkUnder(ctx, m, lantern ? clamp(0.35 + age, 0.35, 1) : ctxA);
        ctx.restore();
      }
      ctx.save();
      clipMark(ctx, m);
      if (p.t < lm.start) {
        // not yet painted
      } else if (age < 0) {
        const n = Math.max(2, Math.ceil(((p.t - lm.start) / lm.dur) * m.pts.length));
        drawWetStroke(ctx, m.pts.slice(0, n), m.kind, this.t);
      } else if (lm.baked) lm.stroke.draw(ctx, 0.75);
      ctx.restore();
      if (lantern || age >= 0) drawMarkOver(ctx, m, ctxA);
      ctx.globalAlpha = 1;
    }
  }

  // ───────────────────────────────────────────── per frame

  frame(dtReal: number) {
    if (!this.isOpen || !this.L) return;
    const dt = Math.min(0.05, dtReal);
    this.t += dt;
    const L = this.L;

    this.updatePaint(dt);
    const p = this.paint;
    this.hintEl.classList.toggle('quiet', !!p && !p.settled);
    const paintBusy = !!p && p.t < p.end + p.linger;
    // the camera holds on the stretch as its strokes land
    if (p && p.cam && paintBusy && !this.drag) this.targetX = this.clampCam(this.paintFocus(p) - this.viewUnits * 0.5);

    // lean in on the river while the paint-in plays (phones), back out for the walk or under the player's hand
    const zTarget = p && p.cam && paintBusy ? PAINT_ZOOM : 1;
    this.zoom += (zTarget - this.zoom) * Math.min(1, dt * 2.2);
    if (Math.abs(zTarget - this.zoom) < 0.002) this.zoom = zTarget;
    this.applyZoom();

    // traveler walk (after "Continue the journey"), once any paint-in has had its moment
    if (this.walk && !paintBusy) {
      const w = this.walk;
      w.t += dt;
      const k = clamp(w.t / w.dur, 0, 1);
      this.travelerS = w.s0 + (w.s1 - w.s0) * easeInOut(k);
      this.phase += dt * 18;
      if (!this.drag) this.targetX = this.clampCam(pointAt(L.path, L.pathCum, this.travelerS).x - this.viewUnits * 0.42);
      if (k >= 1) this.walk = null;
    } else if (!this.walk && this.revealT < 1) {
      this.revealT = Math.min(1, this.revealT + dt / 0.9);
    }

    // camera: fling momentum, then ease toward the target
    if (!this.drag) {
      if (Math.abs(this.vel) > 1) {
        this.targetX += this.vel * dt;
        this.vel *= Math.exp(-dt * 4.5);
      } else this.vel = 0;
      this.targetX = this.clampCam(this.targetX);
      // a slow, painterly drift while the map is showing a paint-in or a walk; snappy under the player's hand
      const follow = (p && p.cam && paintBusy) || this.walk ? 2.6 : 9;
      this.camX += (this.targetX - this.camX) * Math.min(1, dt * follow);
      if (Math.abs(this.targetX - this.camX) < 0.01) this.camX = this.targetX;
    }

    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    const off = Math.round(this.camX * this.scale);
    const i0 = Math.floor(off / this.chunkPx);
    const i1 = Math.floor((off + this.W) / this.chunkPx);
    this.bake(i0, i1);
    for (let i = i0; i <= i1; i++) {
      const c = this.chunks.get(i);
      if (c) ctx.drawImage(c, i * this.chunkPx - off, 0);
      else {
        // still baking: plain paper for a frame or two
        ctx.fillStyle = PAPER;
        ctx.fillRect(i * this.chunkPx - off, 0, this.chunkPx, this.H);
      }
    }

    // live layer: the paint-in, the walked trail, nodes and the traveler
    ctx.setTransform(this.scale, 0, 0, this.scale, -off, 0);
    const vx0 = off / this.scale - 120;
    const vx1 = vx0 + this.viewUnits + 240;
    this.drawPaint(ctx, vx0, vx1);
    this.drawTrail(ctx);
    for (const n of L.nodes) if (n.x > vx0 && n.x < vx1) this.drawNode(ctx, n);
    this.drawTraveler(ctx, dt);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.vignette) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = 0.55;
      ctx.drawImage(this.vignette, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    this.placeButtons();
  }

  /** Where the live trail's ink has reached: at the traveler's feet while walking, then on into the node. */
  private trailEnd(): number {
    const tr = this.trail!;
    if (this.walk) return Math.max(tr.s0, this.travelerS - 62);
    return tr.s1 - 62 + 62 * this.revealT;
  }

  private drawTrail(ctx: CanvasRenderingContext2D) {
    const tr = this.trail;
    if (!tr) return;
    const L = this.L!;
    const end = this.trailEnd();
    if (end <= tr.s0 + 2) return;
    const pts: Vec[] = [];
    for (let s = tr.s0; s < end; s += 8) pts.push(pointAt(L.path, L.pathCum, s));
    pts.push(pointAt(L.path, L.pathCum, end));
    // the wet tip glistens while the traveler is still walking
    brushLine(ctx, pts, mulberry32(Math.floor(tr.s0) + 17), { w: 7, color: INK, alpha: 0.85, taperIn: 0.01, taperOut: this.walk ? 10 : 0.01, bristles: 3, dry: 0.3 });
  }

  private drawNode(ctx: CanvasRenderingContext2D, n: MapNode) {
    const { x, y } = n;
    const reveal = n.scroll.id === this.revealId ? this.revealT : 1;
    const hover = this.hover === n.scroll.id && n.state !== 'locked';
    const beat = BEATS[n.scroll.beat];
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (n.state === 'cleared') {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-0.09);
      const s = hover ? 1.08 : 1;
      ctx.scale(s, s);
      ctx.fillStyle = rgba(SHU, 0.22);
      ctx.beginPath();
      ctx.roundRect(-38, -38, 76, 76, 9);
      ctx.fill();
      ctx.fillStyle = SHU;
      ctx.beginPath();
      ctx.roundRect(-34, -34, 68, 68, 8);
      ctx.fill();
      ctx.fillStyle = PAPER;
      ctx.font = `48px ${FONT_BRUSH}`;
      ctx.fillText(n.grade ?? '梅', 0, 3);
      ctx.restore();
    } else {
      const open = n.state === 'open';
      if (open) {
        const pulse = 0.5 + 0.5 * Math.sin(this.t * 2.6);
        const g = ctx.createRadialGradient(x, y, NODE_R * 0.6, x, y, NODE_R * 2.1);
        g.addColorStop(0, rgba(SHU, (0.16 + 0.14 * pulse) * reveal));
        g.addColorStop(1, rgba(SHU, 0));
        ctx.fillStyle = g;
        ctx.fillRect(x - NODE_R * 2.2, y - NODE_R * 2.2, NODE_R * 4.4, NODE_R * 4.4);
      }
      ctx.fillStyle = PAPER;
      ctx.beginPath();
      ctx.arc(x, y, NODE_R, 0, Math.PI * 2);
      ctx.fill();
      if (open && reveal < 1) {
        // until its reveal, a newly opened scroll waits as it did while locked: a faint dashed ring
        ctx.setLineDash([5, 7]);
        ctx.strokeStyle = rgba(INK, 0.38 * (1 - reveal));
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(x, y, NODE_R, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (open) {
        // the ring brushes itself in during a reveal
        const sweep = Math.PI * 2 * reveal;
        const pts: Vec[] = [];
        for (let a = 0; a <= sweep + 0.001; a += 0.12) pts.push({ x: x + Math.cos(a - 1.9) * NODE_R, y: y + Math.sin(a - 1.9) * NODE_R });
        if (pts.length > 1) brushLine(ctx, pts, mulberry32(n.x), { w: hover ? 8 : 6.5, color: INK, taperIn: 6, taperOut: 10, bristles: 3, dry: 0.3 });
        ctx.globalAlpha = 0.36 + 0.64 * reveal;
      } else {
        ctx.setLineDash([5, 7]);
        ctx.strokeStyle = rgba(INK, 0.38);
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(x, y, NODE_R, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.36;
      }
      ctx.fillStyle = INK;
      ctx.font = `44px ${FONT_BRUSH}`;
      ctx.fillText(n.scroll.beat, x, y + 2);
      ctx.globalAlpha = 1;
    }
    // label
    const la = n.state === 'locked' ? 0.5 : n.state === 'open' ? 0.5 + 0.5 * reveal : reveal;
    ctx.globalAlpha = la;
    ctx.fillStyle = INK;
    ctx.textBaseline = 'alphabetic';
    // at least ~13 css px on a phone, but no larger than needed on a big screen
    const u = this.scale / this.pr; // css px per map unit
    const fName = Math.max(20, 13.5 / u);
    const fSub = Math.max(17, 12 / u);
    ctx.font = `600 ${fName}px ${FONT_SERIF}`;
    ctx.fillText(n.scroll.name, x, y + NODE_R + 14 + fName);
    ctx.font = `italic ${fSub}px ${FONT_SERIF}`;
    ctx.globalAlpha = la * 0.78;
    let sub = `${n.scroll.beat} ${beat.reading} · ${beat.role}`;
    if (n.state === 'cleared') {
      const best = loadBest(n.scroll.id)?.time;
      sub = `${n.scroll.beat} ${beat.reading} · ${GRADE_NAMES[(n.grade ?? '梅') as Grade]}${best ? ` · ${best.toFixed(1)}s` : ''}`;
    } else if (n.state === 'locked') sub = `${n.scroll.beat} ${beat.reading} · not yet open`;
    ctx.fillText(sub, x, y + NODE_R + 20 + fName + fSub);
    if (n.scroll.placeholder && n.state !== 'locked') {
      const fPh = Math.max(14, 10.5 / u);
      ctx.font = `${fPh}px ${FONT_SERIF}`;
      ctx.globalAlpha = la * 0.5;
      ctx.fillText('greybox placeholder', x, y + NODE_R + 26 + fName + fSub + fPh);
    }
    ctx.restore();
  }

  private drawTraveler(ctx: CanvasRenderingContext2D, dt: number) {
    const L = this.L!;
    const p = pointAt(L.path, L.pathCum, Math.max(0, this.travelerS - 70));
    const walking = !!this.walk && this.walk.t > 0;
    const pose: Pose = {
      x: 0,
      y: 0,
      phase: this.phase,
      state: walking ? 'run' : 'idle',
      vy: 0,
      accent: INKS.shu.color,
      accentLight: INKS.shu.light,
      aim: null,
      t: this.t,
    };
    ctx.save();
    ctx.translate(p.x, p.y + 4);
    ctx.scale(0.66, 0.66);
    // a soft ground shadow
    ctx.fillStyle = rgba(INK, 0.16);
    ctx.beginPath();
    ctx.ellipse(0, 2, 26, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    this.character.update(pose, dt);
    this.character.draw(ctx, pose);
    ctx.restore();
  }

  /** A snapshot of what the map shows, in CSS px relative to the map view (for tests and the proof page). */
  inspect(): MapInspect {
    const L = this.L;
    const off = Math.round(this.camX * this.scale);
    const k = 1 / this.pr;
    const toCss = (q: Vec): [number, number] => [Math.round((q.x * this.scale - off) * k * 10) / 10, Math.round(q.y * this.scale * k * 10) / 10];
    const p = this.paint;
    const marks: MapInspect['marks'] = [];
    if (L) for (const [, ms] of L.marks) for (const m of ms) marks.push({ scroll: m.scroll, kind: m.kind, role: m.role, pts: strokeFor(m).pts.map(toCss) });
    return {
      width: L?.width ?? 0,
      camX: this.camX,
      scale: this.scale,
      pr: this.pr,
      painting: p ? { id: p.id, landed: p.marks.filter((lm) => lm.landed).length, total: p.marks.length, settled: p.settled } : null,
      walking: !!this.walk,
      zoom: this.zoom,
      chunks: { ready: this.chunks.size, baking: this.jobs.size, stale: this.stale.size },
      marks,
      trail: this.trail ? Math.max(0, this.trailEnd() - this.trail.s0) : 0,
    };
  }

  /** Center the view on a scroll's painted stretch (proof page and captures). */
  showStretch(id: string) {
    const n = this.L?.nodes.find((x) => x.scroll.id === id);
    if (n) this.targetX = this.clampCam((n.stretch[0] + n.stretch[1]) / 2 - this.viewUnits * 0.5);
  }

  /** Jump the camera to a map x with no easing (captures). */
  jumpTo(x: number) {
    this.camX = this.targetX = this.clampCam(x);
    this.vel = 0;
  }

  // ───────────────────────────────────────────── DOM nodes and input

  private makeButtons() {
    this.nodesEl.innerHTML = '';
    this.buttons.clear();
    for (const n of this.L!.nodes) {
      const b = document.createElement('button');
      b.className = 'map-node';
      b.dataset.node = n.scroll.id;
      b.dataset.state = n.state;
      const beat = BEATS[n.scroll.beat];
      const status = n.state === 'cleared' ? `cleared, ${GRADE_NAMES[(n.grade ?? '梅') as Grade]} seal` : n.state === 'open' ? 'open' : 'locked';
      b.setAttribute('aria-label', `${n.chapter.name} ${beat.reading}: ${n.scroll.name} (${status})`);
      if (n.state === 'locked') b.setAttribute('aria-disabled', 'true');
      b.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.suppressClick) return;
        if (n.state === 'locked') {
          this.setHint('This scroll opens when the one before it is cleared.', 2600);
          return;
        }
        this.onPlay(n.scroll.id);
      });
      b.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && (this.hover = n.scroll.id));
      b.addEventListener('pointerleave', () => this.hover === n.scroll.id && (this.hover = null));
      b.addEventListener('focus', () => {
        this.hover = n.scroll.id;
        const vu = this.viewUnits;
        if (n.x < this.camX + vu * 0.1 || n.x > this.camX + vu * 0.9) this.targetX = this.clampCam(n.x - vu * 0.42);
      });
      b.addEventListener('blur', () => this.hover === n.scroll.id && (this.hover = null));
      this.nodesEl.appendChild(b);
      this.buttons.set(n.scroll.id, b);
    }
  }

  private placeButtons() {
    if (!this.L) return;
    const off = Math.round(this.camX * this.scale);
    const k = 1 / this.pr;
    const size = Math.max(48, (NODE_R + 8) * 2 * this.scale * k);
    for (const n of this.L.nodes) {
      const b = this.buttons.get(n.scroll.id);
      if (!b) continue;
      const cx = (n.x * this.scale - off) * k;
      const cy = n.y * this.scale * k;
      b.style.width = b.style.height = size + 'px';
      b.style.transform = `translate(${(cx - size / 2).toFixed(1)}px, ${(cy - size / 2).toFixed(1)}px)`;
    }
  }

  /** Skip the rest of a paint-in and a reveal walk (the player took the camera). */
  private finishWalk() {
    this.finishPaint();
    if (!this.walk) return;
    this.travelerS = this.walk.s1;
    this.walk = null;
  }

  private setHint(text: string | null, ms = 0) {
    clearTimeout(this.hintTimer);
    const base = IS_TOUCH ? 'Swipe to unroll the scroll · tap an open seal to travel' : 'Drag, scroll or press ← → to unroll · click an open seal to travel';
    this.hintEl.textContent = text ?? base;
    this.hintEl.classList.toggle('note', !!text);
    if (text && ms) this.hintTimer = setTimeout(() => this.setHint(null), ms);
  }

  private bindInput() {
    const v = this.view;
    const unitsPerCss = () => this.pr / this.scale / this.zoom;
    v.addEventListener('pointerdown', (e) => {
      if (!this.isOpen || this.drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
      this.drag = { id: e.pointerId, x: e.clientX, cam: this.camX, moved: false, lastX: e.clientX, lastT: performance.now() };
      this.vel = 0;
      this.suppressClick = false;
    });
    v.addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (!d || e.pointerId !== d.id) return;
      const dx = e.clientX - d.x;
      if (!d.moved && Math.abs(dx) > 8) {
        d.moved = true;
        this.suppressClick = true;
        this.finishWalk();
        v.setPointerCapture(e.pointerId);
        v.classList.add('dragging');
      }
      if (d.moved) {
        const now = performance.now();
        const dtm = Math.max(1, now - d.lastT);
        const inst = (-(e.clientX - d.lastX) * unitsPerCss()) / (dtm / 1000);
        this.vel = this.vel * 0.6 + inst * 0.4;
        d.lastX = e.clientX;
        d.lastT = now;
        this.camX = this.targetX = this.clampCam(d.cam - dx * unitsPerCss());
      }
    });
    const end = (e: PointerEvent) => {
      const d = this.drag;
      if (!d || e.pointerId !== d.id) return;
      this.drag = null;
      v.classList.remove('dragging');
      if (performance.now() - d.lastT > 90) this.vel = 0;
      this.vel = clamp(this.vel, -4000, 4000);
      // let the click that follows a drag be swallowed, then re-arm
      setTimeout(() => (this.suppressClick = false), 0);
    };
    v.addEventListener('pointerup', end);
    v.addEventListener('pointercancel', end);
    v.addEventListener(
      'wheel',
      (e) => {
        if (!this.isOpen) return;
        e.preventDefault();
        const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        const px = e.deltaMode === 1 ? d * 40 : e.deltaMode === 2 ? d * this.view.clientWidth : d;
        this.finishWalk();
        this.targetX = this.clampCam(this.targetX + px * unitsPerCss());
      },
      { passive: false },
    );
    window.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      const vu = this.viewUnits;
      let dx = 0;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') dx = 320;
      else if (e.code === 'ArrowLeft' || e.code === 'KeyA') dx = -320;
      else if (e.code === 'PageDown') dx = vu * 0.8;
      else if (e.code === 'PageUp') dx = -vu * 0.8;
      else if (e.code === 'Home') dx = -1e6;
      else if (e.code === 'End') dx = 1e6;
      else if (e.code === 'Escape') {
        if (e.timeStamp <= this.openedAt) return;
        e.preventDefault();
        this.onBack();
        return;
      }
      if (!dx) return;
      e.preventDefault();
      this.finishWalk();
      this.targetX = this.clampCam(this.targetX + dx);
    });
  }
}

function scrollStateSig(c: Campaign): string {
  return c.chapters
    .flatMap((ch) => ch.scrolls)
    .map((s) => `${s.id}:${scrollState(s.id, isCleared, c)}:${stampGrade(s.id) ?? ''}`)
    .join(',');
}
