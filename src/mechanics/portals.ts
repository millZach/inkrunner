/**
 * 紫 Purple portals (docs/summer-design.md section 1) and the blot pillars they get you past (N5).
 *
 * A Purple stroke that closes on itself is a ring; two rings are a linked pair, and whatever enters
 * one leaves the other along the exit's spout. Game calls a handful of hooks (paint begin / extend /
 * end, stroke added / removed, one traveler check per physics substep, one update and three draws per
 * frame); everything else lives here.
 *
 * Generic projectile API for later systems (Raijin's bolts, festival sparks, embers):
 *   game.portals.spawn({ kind: 'bolt', x, y, vx, vy })   // flies, passes through rings, hits targets
 *   game.portals.targets.push({ x, y, r, alive, hit })    // extra things a ring-sent projectile can hit
 * See ProjectileSpec for the knobs (speed floor and flight time after a ring, gravity, harm, hooks).
 *
 * Extensions for Raijin (src/mechanics/raijin.ts): `safeAfterRing` (a returned bolt can't hurt you), `onPass`
 * (told when it comes out of a ring), `draw` (its own look), the stroke that stopped it in `onEnd`,
 * `cancel(p)`, `noRing` zones where a ring sputters out, and `shiftWorld(dx)` for the arena wrap.
 */
import { INKS, KILL_Y, PLAYER_H, PLAYER_HW, VIEW_H, type InkKind } from '../config';
import type { Game } from '../game';
import { groundAt, type Bramble, type Fire, type Pillar, type Yokai } from '../level';
import { polylineDist, type BP, type Vec } from '../math';
import { drawPillar } from '../render/hazards';
import { drawGhost, drawProjectile, drawReach, drawRing, drawSnap, type RingLook } from '../render/portals';
import { Stroke } from '../strokes';
import { FAIL_LABEL, RingTracker, shapeFail, type LoopFit, type RingFail } from './ringfit';

// ───────────────────────────────────────────── tuning (the proof page's A/Bs and knobs)

export interface PortalTuning {
  /** 'used-entry': a new ring closes the ring something last went into (else the older); 'strict': 1+2, then 3+4 */
  pairing: 'used-entry' | 'strict';
  /** 'tail': things leave along the flicked spout; 'line': along the line from the entry's centre to the exit's */
  aim: 'tail' | 'line';
  /** closing tolerance: distance to the start (u) and turning needed (degrees) */
  closeDist: number;
  closeAngle: number;
  /** the start distance also grows with the ring: max(closeDist, closeScale·R) */
  closeScale: number;
  /** exit speed = max(|v|, run speed) for the traveler (and spark speed for an ember) */
  exitFloor: boolean;
  /** launch state after a portal exit: no short-hop gravity, gentle air pull, Kohaku's leap refreshed */
  launch: boolean;
  /** rule 2: once the traveler has left an exit, both rings of that pair close */
  doorsClose: boolean;
  /** Deviation (draft B), off by default: the older ring of a pair only swallows, the newer only emits */
  oneWay: boolean;
}

/** The design's proposal (section 1). */
export const DEFAULT_TUNING: PortalTuning = {
  pairing: 'used-entry',
  aim: 'tail',
  // Zach (2026-10-11): 40/300/0.35 made rings too hard to draw; the loop now snaps from 280° within 60 u or 0.6 R
  closeDist: 60,
  closeAngle: 280,
  closeScale: 0.6,
  exitFloor: true,
  launch: true,
  doorsClose: true,
  oneWay: false,
};

/** Air pull back toward run speed while launched (instead of RUN_ACCEL). */
export const LAUNCH_ACCEL = 300;
/** Echo refund: ink returned when something you sent through a ring destroys a hazard. */
export const ECHO_REFUND = 15;
/** Ring passes one projectile may make before it burns out (a pair whose spouts face each other would loop it). */
export const MAX_PASSES = 3;
const CLOSE_TIME = 0.4;
const SOAK_TIME = 0.4;
const FIZZLE_FADE = 0.5;
const GHOST_TIME = 1.2;

// ───────────────────────────────────────────── rings

export type RingState = 'waiting' | 'linked' | 'closing';
/** How something left a ring's disc before the ring may take it again: box/disc fully apart, or centre out. */
type Ignore = 'full' | 'centre';

export interface Ring {
  id: number;
  cx: number;
  cy: number;
  r: number;
  /** unit vector things leave along (tail flick, or +x) */
  spout: Vec;
  /** a real tail was flicked */
  tailed: boolean;
  /** +1 drawn clockwise, -1 anticlockwise: the dashes turn the same way */
  dir: 1 | -1;
  /** the painted stroke (null for her rings) */
  stroke: Stroke | null;
  /** her pre-painted rings: never close, don't count, survive everything */
  fixed: boolean;
  born: number;
  /** game time something last went in (rule 3), -Infinity if never */
  lastIn: number;
  state: RingState;
  closeT: number;
  partner: Ring | null;
  /** for the one-way Deviation: the waiting ring swallows, the completing ring emits */
  role: 'entry' | 'exit';
  ignore: Map<object, Ignore>;
  /** a ground fire this ring was painted on: lifted out as an ember once the ring is linked */
  heldFire: Fire | null;
  /** spout shimmer when something comes out (1 → 0) */
  flash: number;
  /** swallow pulse when something goes in (1 → 0) */
  pulse: number;
  /** realT it last became linked (its stroke's glow flares then breathes), -Infinity if never */
  linkT: number;
  cost: number;
}

/** The traveler, as a key in ring ignore sets. */
export const TRAVELER = { what: 'traveler' };

// ───────────────────────────────────────────── projectiles

export interface ProjectileSpec {
  /** 'spark' | 'bolt' | 'ember', or a later system's own kind (drawn like a spark) */
  kind: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** seconds of flight before it fizzles (embers drop instead) */
  life?: number;
  /** hit radius */
  r?: number;
  /** kills the traveler on touch (default true) */
  harms?: boolean;
  /** downward acceleration before any ring (0 = straight line). After a ring, flight is always straight. */
  gravity?: number;
  /** speed floor on leaving a ring (spark/ember 400, bolt 2400) */
  exitSpeed?: number;
  /** flight time after a ring (spark/ember 1.2 s, bolt 0.5 s) */
  exitLife?: number;
  /** the leading tip sits this far ahead of (x, y): bolts are caught by their tip. Default 0: a drawn bolt's
   *  (x, y) is already its head (its column trails behind). Set it if your (x, y) is the middle of something long. */
  tip?: number;
  /** hits thickets, yokai and targets even before passing a ring */
  armed?: boolean;
  /** free data for the system that spawned it */
  data?: unknown;
  /** called once when it ends: 'hit' (a target), 'traveler', 'ground', 'ink', 'expire', 'gap', 'cancel';
   *  for 'ink', the stroke that stopped it */
  onEnd?: (p: Projectile, why: string, stroke?: Stroke) => void;
  /** after it comes out of a ring it can no longer hurt the traveler (a returned bolt) */
  safeAfterRing?: boolean;
  /** called each time it comes out of a ring */
  onPass?: (p: Projectile, entry: Ring, exit: Ring) => void;
  /** a hit-stop (real seconds) before the traveler it touched dies (Raijin's bolts: 0.15, summer-design 4.6) */
  hitStop?: number;
  /** its own look, drawn instead of drawProjectile (world transform set) */
  draw?: (ctx: CanvasRenderingContext2D, p: Projectile, t: number) => void;
  /** N10: the box outlined when it kills the traveler (default: its own hit circle; none if it has its own `draw`) */
  cause?: (p: Projectile) => { kind: string; x: number; y: number; w: number; h: number };
}

/** A place where a ring may not be painted (Raijin's storm tears it): the ring's centre within r of (x, y). */
export interface NoRingZone {
  x: number;
  y: number;
  r: number;
  /** for the event log */
  why: string;
  /** called when a ring fizzles because it was painted inside this zone (its centre and radius) */
  onFizzle?: (cx: number, cy: number, r: number) => void;
}

export interface Projectile {
  kind: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  r: number;
  harms: boolean;
  gravity: number;
  exitSpeed: number;
  exitLife: number;
  tip: number;
  armed: boolean;
  /** has passed at least one ring (its trail turns purple) */
  fromRing: boolean;
  /** the last ring it came out of was a player ring (echo refunds) */
  mine: boolean;
  through: number;
  trail: Vec[];
  dead: boolean;
  age: number;
  /** aim assist left to apply (radians) and its sign */
  bend: number;
  bendSign: number;
  /** an ember's own fire: re-formed where it lands */
  fire: Fire | null;
  dropping: boolean;
  data?: unknown;
  onEnd?: (p: Projectile, why: string, stroke?: Stroke) => void;
  safeAfterRing: boolean;
  onPass?: (p: Projectile, entry: Ring, exit: Ring) => void;
  hitStop: number;
  draw?: (ctx: CanvasRenderingContext2D, p: Projectile, t: number) => void;
  cause?: (p: Projectile) => { kind: string; x: number; y: number; w: number; h: number };
}

const KIND_DEFAULTS: Record<string, { r: number; life: number; exitSpeed: number; exitLife: number; tip: number }> = {
  spark: { r: 10, life: 4, exitSpeed: 400, exitLife: 1.2, tip: 0 },
  ember: { r: 14, life: 1.2, exitSpeed: 400, exitLife: 1.2, tip: 0 },
  // a bolt is caught by its leading tip (1.6). A bolt's (x, y) IS its leading tip: drawProjectile draws the
  // jagged column trailing behind it, so tip stays 0. A system whose (x, y) is a bolt's middle sets `tip`.
  bolt: { r: 8, life: 1.5, exitSpeed: 2400, exitLife: 0.5, tip: 0 },
};

/** Something a ring-sent projectile can hit (Raijin's drums, later). */
export interface ProjectileTarget {
  x: number;
  y: number;
  r: number;
  alive: () => boolean;
  hit: (p: Projectile) => void;
}

// ───────────────────────────────────────────── events (read by the proof page and its assertions)

export interface PortalEvent {
  /** increasing id, so readers can tell which events they have seen */
  seq: number;
  t: number;
  realT: number;
  kind: 'snap' | 'ring' | 'link' | 'fizzle' | 'close' | 'pass' | 'soak' | 'echo' | 'undo' | 'reform' | 'hit' | 'lift' | 'doors';
  [k: string]: unknown;
}

interface PaintState {
  ink: InkKind;
  /** fed points relative to the camera (what the player drew on the glass), never world points */
  tracker: RingTracker | null;
  /** the camera when each brush point was made (pts index → camCX, camCY) */
  camX: number[];
  camY: number[];
  /** the camera at the snap: the closed loop is placed in the world with it */
  snapCam: Vec | null;
  /** realT of the snap, or -1 */
  snapT: number;
  fail: RingFail | null;
  soaked: boolean;
}

interface Judged {
  fail: RingFail | null;
  /** what blocked it, for the event log: ground, pillar, thicket, yokai, ring, fire */
  why: string;
  blocker: object | null;
  fire: Fire | null;
  partner: Ring | null;
  /** the ring's centre, slid out of solid when it was only just inside (see judge) */
  cx: number;
  cy: number;
}

type Fx =
  | { kind: 'soak'; stroke: Stroke; t0: number }
  | { kind: 'fizzle'; stroke: Stroke | null; fit: LoopFit; label: string; t0: number }
  | { kind: 'flicker'; x: number; y: number; r: number; t0: number };

function boxHitsDisc(x0: number, y0: number, x1: number, y1: number, cx: number, cy: number, r: number) {
  const nx = cx < x0 ? x0 : cx > x1 ? x1 : cx;
  const ny = cy < y0 ? y0 : cy > y1 ? y1 : cy;
  return (nx - cx) * (nx - cx) + (ny - cy) * (ny - cy) < r * r;
}

function rotate(x: number, y: number, a: number): Vec {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: x * c - y * s, y: x * s + y * c };
}

// ───────────────────────────────────────────── the system

export class Portals {
  /** shared by every run in this page (the proof page's panel edits it live) */
  tuning: PortalTuning = { ...DEFAULT_TUNING };
  rings: Ring[] = [];
  projectiles: Projectile[] = [];
  /** extra projectile targets registered by other systems; cleared when a scroll loads */
  targets: ProjectileTarget[] = [];
  /** places a ring may not be painted (registered by other systems; cleared when a scroll loads) */
  noRing: NoRingZone[] = [];
  /** recent events, newest last (capped) */
  events: PortalEvent[] = [];
  paint: PaintState | null = null;
  private pending: { fit: LoopFit; spout: { x: number; y: number; tailed: boolean }; fire: Fire | null } | null = null;
  private fx: Fx[] = [];
  private nextId = 1;
  private seq = 1;
  /** the ring the traveler last came out of, until they leave its disc (rule 2) */
  private travelerExit: Ring | null = null;
  /** the ring the traveler last went into, paired with travelerExit (rule 2 closes this pair, not exit.partner) */
  private travelerEntry: Ring | null = null;
  private cooldown = new WeakMap<object, number>();
  /** a yokai goes through a given pair once (else one hovering by the exit would swing back and forth) */
  private yokaiUsed = new WeakMap<Yokai, Set<Ring>>();

  constructor(private g: Game) {}

  /** A scroll was loaded: her rings come from the level; everything else is cleared. */
  reset() {
    this.rings = [];
    this.projectiles = [];
    this.targets = [];
    this.noRing = [];
    this.fx = [];
    this.paint = null;
    this.pending = null;
    this.travelerExit = null;
    this.travelerEntry = null;
    // g.t restarts at 0 with each scroll and each Run again; a cooldown stamped on the last run's clock would refuse
    // the traveler at every door until the new clock caught up
    this.cooldown = new WeakMap();
    this.yokaiUsed = new WeakMap();
    for (const d of this.g.level.fixedRings) {
      const mk = (p: Vec, aim: number): Ring => this.makeRing(p.x, p.y, d.r, { x: Math.cos((aim * Math.PI) / 180), y: Math.sin((aim * Math.PI) / 180) }, true, null, 0);
      const a = mk(d.a, d.aimA);
      const b = mk(d.b, d.aimB);
      a.partner = b;
      b.partner = a;
      a.state = b.state = 'linked';
      this.rings.push(a, b);
    }
  }

  /** Player rings only (her rings never count, close or clear). */
  playerRings(): Ring[] {
    return this.rings.filter((r) => !r.fixed && r.state !== 'closing');
  }

  /** Remove every player ring (the gate does this on death; the proof page on a station jump). */
  clearPlayerRings() {
    for (const r of this.playerRings()) this.closeRing(r, true);
    this.rings = this.rings.filter((r) => r.fixed);
    this.projectiles = [];
    this.travelerExit = null;
    this.travelerEntry = null;
  }

  private log(e: Omit<PortalEvent, 'seq' | 't' | 'realT'>) {
    this.events.push({ seq: this.seq++, t: this.g.t, realT: this.g.realT, ...e } as PortalEvent);
    if (this.events.length > 300) this.events.splice(0, this.events.length - 300);
  }

  private makeRing(cx: number, cy: number, r: number, spout: Vec, fixed: boolean, stroke: Stroke | null, cost: number, dir: 1 | -1 = 1, tailed = false): Ring {
    return {
      id: this.nextId++,
      cx,
      cy,
      r,
      spout,
      tailed,
      dir,
      stroke,
      fixed,
      born: this.g.t,
      lastIn: -Infinity,
      state: 'waiting',
      closeT: 0,
      partner: null,
      role: 'entry',
      ignore: new Map(),
      heldFire: null,
      flash: 0,
      pulse: 0,
      linkT: -Infinity,
      cost,
    };
  }

  /** Where things leave `ring`: its spout, or (line aim) away from its partner. */
  exitDir(ring: Ring): Vec {
    if (this.tuning.aim === 'line' && ring.partner && !ring.fixed) {
      const dx = ring.cx - ring.partner.cx;
      const dy = ring.cy - ring.partner.cy;
      const d = Math.hypot(dx, dy) || 1;
      return { x: dx / d, y: dy / d };
    }
    return ring.spout;
  }

  private inPillar(x: number): Pillar | null {
    for (const p of this.g.level.pillars) if (x >= p.x - 24 && x <= p.x + p.w + 24) return p;
    return null;
  }

  /** The ring a new one would pair with, and the rings it would close (rules 1 and 3, or strict pairs). */
  /**
   * Which ring a new ring would link to, and which rings it closes. With a full pair live, a new ring placed
   * out of reach of the ring it would keep starts a fresh pair instead (both old rings close): a pair left
   * behind by sparks would otherwise make every later door fizzle "too far" until it is cleaned up. A lone
   * waiting ring keeps the reach lesson: its partner must be within rules.portalSpan.
   */
  partnerFor(cx?: number, cy?: number): { partner: Ring | null; victims: Ring[] } {
    const P = this.playerRings();
    if (P.length === 0) return { partner: null, victims: [] };
    if (this.tuning.pairing === 'strict') {
      if (P.length === 1) return { partner: P[0], victims: [] };
      return { partner: null, victims: P };
    }
    if (P.length === 1) return { partner: P[0], victims: [] };
    const [a, b] = P;
    let victim: Ring;
    if (a.lastIn === -Infinity && b.lastIn === -Infinity) victim = a.born <= b.born ? a : b;
    else victim = a.lastIn >= b.lastIn ? a : b;
    const partner = victim === a ? b : a;
    if (cx !== undefined && cy !== undefined && Math.hypot(partner.cx - cx, partner.cy - cy) > this.g.rules.portalSpan) {
      return { partner: null, victims: [a, b] };
    }
    return { partner, victims: [victim] };
  }

  /** Is a closed loop a legal ring right now? (size, then placement, then reach) */
  judge(fit: LoopFit): Judged {
    const g = this.g;
    const L = g.level;
    const out: Judged = { fail: shapeFail(fit), why: '', blocker: null, fire: null, partner: null, cx: fit.cx, cy: fit.cy };
    if (out.fail) return out;
    const r = fit.r;
    let cx = fit.cx;
    let cy = fit.cy;
    const blocked = (o: object | null, why: string) => {
      out.fail = 'blocked';
      out.blocker = o;
      out.why = why;
      return out;
    };
    // The centre may not be inside ground or a pillar (the rim may dip into either). A ring drawn around a
    // traveler stopped at a pillar sits 13 u from its face, so a hand-drawn centre often lands a little
    // inside: when it is less than 0.35·R deep it slides out to the surface instead of fizzling.
    for (const p of L.pillars) {
      if (cx < p.x || cx > p.x + p.w || cy <= p.yTop) continue;
      const left = cx - p.x;
      const right = p.x + p.w - cx;
      if (Math.min(left, right) > r * 0.35) return blocked(null, 'pillar');
      cx = left <= right ? p.x - 1 : p.x + p.w + 1;
    }
    for (const isl of L.islands) {
      if (cx < isl.x0 || cx > isl.x1) continue;
      const gy = groundAt(isl, cx);
      if (cy <= gy) continue;
      if (cy - gy > r * 0.35) return blocked(null, 'ground');
      cy = gy - 1;
    }
    out.cx = cx;
    out.cy = cy;
    for (const z of this.noRing) if (Math.hypot(z.x - cx, z.y - cy) < z.r) return blocked(z, z.why);
    for (const b of L.brambles) if (b.alive && boxHitsDisc(b.x, b.y - b.h, b.x + b.w, b.y, cx, cy, r)) return blocked(b, 'thicket');
    for (const y of L.yokai) if (y.alive && Math.hypot(y.cx - cx, y.cy - cy) < r + y.r) return blocked(y, 'yokai');
    const { partner, victims } = this.partnerFor(cx, cy);
    for (const o of this.rings) {
      if (o.state === 'closing' || victims.includes(o)) continue;
      if (Math.hypot(o.cx - cx, o.cy - cy) < r + o.r) return blocked(o, 'ring');
    }
    for (const f of L.fires) {
      if (!f.alive || !boxHitsDisc(f.x, f.y - f.h, f.x + f.w, f.y, cx, cy, r)) continue;
      // a ring painted on a ground fire captures it; any other overlap is blocked
      if (cx >= f.x && cx <= f.x + f.w && r >= f.w / 4 && !out.fire) out.fire = f;
      else return blocked(f, 'fire');
    }
    out.partner = partner;
    if (partner && Math.hypot(partner.cx - cx, partner.cy - cy) > g.rules.portalSpan) out.fail = 'far';
    return out;
  }

  // ───────────────────────────────────────────── painting hooks

  /*
   * The ring is judged on the glass: the camera can move while the brush is down (a portal jump, a fall),
   * so the tracker is fed camera-relative points, and the closed loop is put back in the world with the
   * camera at the snap. The stroke's own points get the same treatment at brush lift (screenTrue).
   */
  paintBegin(ink: InkKind, first: Vec) {
    const g = this.g;
    const T = this.tuning;
    const tr = ink === 'murasaki' ? new RingTracker({ closeDist: T.closeDist, closeAngle: T.closeAngle, closeScale: T.closeScale }) : null;
    tr?.feed({ x: first.x - g.camCX, y: first.y - g.camCY });
    this.paint = { ink, tracker: tr, camX: [g.camCX], camY: [g.camCY], snapCam: null, snapT: -1, fail: null, soaked: false };
    this.pending = null;
  }

  /** A fit from the tracker (camera-relative) placed in the world, with the snap camera once it snapped. */
  private toWorld(f: LoopFit, ps: PaintState): LoopFit {
    const c = ps.snapCam ?? { x: this.g.camCX, y: this.g.camCY };
    return { ...f, cx: f.cx + c.x, cy: f.cy + c.y };
  }

  /** The closed loop in the world, while the brush is down (null before the snap). */
  paintLoop(): LoopFit | null {
    const ps = this.paint;
    return ps?.tracker?.loop ? this.toWorld(ps.tracker.loop, ps) : null;
  }

  /** New brush points pts[from..]. Returns true when the stroke must end now (soaked by a pillar). */
  paintExtend(pts: BP[], from: number): boolean {
    const ps = this.paint;
    if (!ps) return false;
    const g = this.g;
    const i0 = Math.max(1, from);
    // Game fills the gap since the last point by interpolating in the world; if the camera moved since, the
    // camera is interpolated too, so the filled points run straight on the glass
    const px = ps.camX[i0 - 1] ?? g.camCX;
    const py = ps.camY[i0 - 1] ?? g.camCY;
    const span = pts.length - i0;
    for (let i = i0; i < pts.length; i++) {
      const u = (i - i0 + 1) / span;
      const cx = px + (g.camCX - px) * u;
      const cy = py + (g.camCY - py) * u;
      ps.camX[i] = cx;
      ps.camY[i] = cy;
      if (ps.tracker) {
        if (ps.tracker.feed({ x: pts[i].x - cx, y: pts[i].y - cy })) {
          ps.snapCam = { x: g.camCX, y: g.camCY };
          this.onSnap(ps);
        }
      } else if (this.inPillar(pts[i].x)) {
        ps.soaked = true;
        return true;
      }
    }
    return false;
  }

  private onSnap(ps: PaintState) {
    const g = this.g;
    const fit = this.toWorld(ps.tracker!.loop!, ps);
    const j = this.judge(fit);
    ps.snapT = g.realT;
    ps.fail = j.fail;
    const h = Math.max(0, Math.min(1, g.mouse.y / g.H));
    g.audio.portalFx(j.fail ? 'snapBad' : 'snap', h);
    if (!j.fail) {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        g.particles.spawn('mote', fit.cx + Math.cos(a) * fit.r, fit.cy + Math.sin(a) * fit.r, Math.cos(a) * 60, Math.sin(a) * 60, 0.7, 2.2, 'rgba(229,139,255,0.95)');
      }
      // a light tap on phones that support it (iOS needs the Capacitor haptics plugin: N20)
      try {
        navigator.vibrate?.(8);
      } catch {
        /* not allowed here */
      }
    }
    this.log({ kind: 'snap', legal: !j.fail, fail: j.fail, why: j.why, px: g.px, r: fit.r, roundness: fit.roundness, cx: fit.cx, cy: fit.cy, timeScale: g.timeScale, painting: !!g.painting });
  }

  /**
   * The brush lifted. Returns true when this module consumed the stroke (a fizzle or a soak); false when
   * Game should make the stroke as usual (then call strokeAdded, which turns a legal loop into a ring).
   */
  paintEnd(pts: BP[], cost: number): boolean {
    const ps = this.paint;
    this.paint = null;
    if (!ps) return false;
    if (!ps.tracker) {
      if (ps.soaked || pts.some((p) => this.inPillar(p.x))) {
        this.soak(pts, ps.ink, cost);
        return true;
      }
      return false;
    }
    const tr = ps.tracker;
    this.screenTrue(pts, ps);
    // lifted short of closing: most of a circle still makes a ring
    if (!tr.loop && tr.closeOnLift()) {
      ps.snapCam = { x: this.g.camCX, y: this.g.camCY };
      this.onSnap(ps);
    }
    if (!tr.loop) {
      this.fizzle('open', this.toWorld(tr.fitAll(), ps), pts, cost, null);
      return true;
    }
    const loop = this.toWorld(tr.loop, ps);
    const j = this.judge(loop);
    if (j.fail) {
      this.fizzle(j.fail, loop, pts, cost, j.blocker, j.why);
      return true;
    }
    this.pending = { fit: { ...loop, cx: j.cx, cy: j.cy }, spout: tr.spout(), fire: j.fire };
    return false;
  }

  /** Re-place a Purple stroke's points as drawn on the glass, with the snap camera (or today's). */
  private screenTrue(pts: BP[], ps: PaintState) {
    const c = ps.snapCam ?? { x: this.g.camCX, y: this.g.camCY };
    for (let i = 0; i < pts.length; i++) {
      const cx = ps.camX[i] ?? c.x;
      const cy = ps.camY[i] ?? c.y;
      pts[i].x += c.x - cx;
      pts[i].y += c.y - cy;
    }
  }

  paintCancel() {
    this.paint = null;
    this.pending = null;
  }

  /** Game made a stroke from the brush; a legal Purple loop becomes a ring here. */
  strokeAdded(st: Stroke) {
    const pr = this.pending;
    this.pending = null;
    if (!pr || st.kind !== 'murasaki') return;
    const { fit, spout } = pr;
    const ring = this.makeRing(fit.cx, fit.cy, fit.r, { x: spout.x, y: spout.y }, false, st, st.cost, fit.dir, spout.tailed);
    st.glowK = 0;
    ring.heldFire = pr.fire;
    const { partner, victims } = this.partnerFor(ring.cx, ring.cy);
    for (const v of victims) this.closeRing(v);
    this.rings.push(ring);
    this.log({ kind: 'ring', id: ring.id, cx: ring.cx, cy: ring.cy, r: ring.r, spout: ring.spout, tailed: ring.tailed, cost: st.cost, partner: partner?.id ?? null, closed: victims.map((v) => v.id), fire: !!ring.heldFire });
    if (partner) this.link(partner, ring);
  }

  /** Game removed a stroke (undo): a ring made from it goes with it. */
  strokeRemoved(st: Stroke) {
    const ring = this.rings.find((r) => r.stroke === st && r.state !== 'closing');
    if (!ring) return;
    this.log({ kind: 'undo', id: ring.id, refund: st.cost * 0.5 });
    this.closeRing(ring);
  }

  private link(old: Ring, neu: Ring) {
    const g = this.g;
    old.partner = neu;
    neu.partner = old;
    old.state = neu.state = 'linked';
    old.linkT = neu.linkT = g.realT;
    old.role = 'entry';
    neu.role = 'exit';
    // rule 4: the completing ring never grabs what is already inside its disc, until it has left
    // (not for a stopped traveler: a ring painted around yourself at a wall carries you whichever ring came first)
    const stopped = (g.grounded && !g.ride && Math.abs(g.vx) < 20) || g.stuckT > 0.3;
    if (!stopped && boxHitsDisc(g.px - PLAYER_HW, g.py - PLAYER_H, g.px + PLAYER_HW, g.py, neu.cx, neu.cy, neu.r)) neu.ignore.set(TRAVELER, 'full');
    for (const y of g.level.yokai) if (y.alive && Math.hypot(y.cx - neu.cx, y.cy - neu.cy) < neu.r + y.r) neu.ignore.set(y, 'full');
    for (const p of this.projectiles) if (Math.hypot(p.x - neu.cx, p.y - neu.cy) < neu.r) neu.ignore.set(p, 'full');
    this.log({ kind: 'link', a: old.id, b: neu.id, span: Math.hypot(old.cx - neu.cx, old.cy - neu.cy) });
    g.audio.portalFx('link', 0);
    if (neu.heldFire) this.liftFire(neu);
    else if (old.heldFire) this.liftFire(old);
  }

  /** Close a player ring: it fades over 0.4 s and its partner goes back to waiting. */
  closeRing(r: Ring, now = false) {
    if (r.fixed || r.state === 'closing') return;
    r.state = 'closing';
    r.closeT = now ? CLOSE_TIME : 0;
    r.heldFire = null;
    const p = r.partner;
    r.partner = null;
    if (p) {
      p.partner = null;
      if (p.state === 'linked') p.state = 'waiting';
    }
    if (this.travelerExit === r) this.travelerExit = null;
    if (r.stroke) {
      const st = r.stroke;
      this.g.strokes = this.g.strokes.filter((s) => s !== st);
    }
    this.log({ kind: 'close', id: r.id });
  }

  private fizzle(fail: RingFail, fit: LoopFit, pts: BP[], cost: number, blocker: object | null, why = '') {
    const g = this.g;
    const refund = cost * 0.5;
    const before = g.inkAmt;
    g.inkAmt = Math.min(g.inkMax, g.inkAmt + refund);
    let st: Stroke | null = null;
    if (pts.length >= 3) {
      st = new Stroke('murasaki', pts, cost);
      st.bornT = g.t;
      st.age = 99;
      st.bake(g.scale);
    }
    const label = FAIL_LABEL[fail];
    this.fx.push({ kind: 'fizzle', stroke: st, fit, label, t0: g.realT });
    if (blocker) {
      const b = blocker as Partial<Bramble & Yokai & Ring & Fire>;
      if ('cx' in blocker && 'cy' in blocker) this.fx.push({ kind: 'flicker', x: b.cx!, y: b.cy!, r: (b.r ?? 40) + 10, t0: g.realT });
      else if ('h' in blocker) this.fx.push({ kind: 'flicker', x: b.x! + b.w! / 2, y: b.y! - b.h! / 2, r: Math.max(b.w!, b.h!) * 0.6, t0: g.realT });
    }
    const zone = blocker && this.noRing.includes(blocker as NoRingZone) ? (blocker as NoRingZone) : null;
    if (zone?.onFizzle) zone.onFizzle(fit.cx, fit.cy, fit.r);
    else g.audio.portalFx('fizzle', 0);
    g.recorder.mark('paintEnd', 0);
    this.log({ kind: 'fizzle', fail, label, why, cost, refund, inkBefore: before, inkAfter: g.inkAmt, cx: fit.cx, cy: fit.cy, r: fit.r });
  }

  private soak(pts: BP[], ink: InkKind, cost: number) {
    const g = this.g;
    const refund = cost * 0.5;
    const before = g.inkAmt;
    g.inkAmt = Math.min(g.inkMax, g.inkAmt + refund);
    if (pts.length >= 3) {
      const st = new Stroke(ink, pts, cost);
      st.bornT = g.t;
      st.age = 99;
      st.bake(g.scale);
      this.fx.push({ kind: 'soak', stroke: st, t0: g.realT });
      for (let i = 0; i < 18; i++) {
        const q = pts[Math.floor(Math.random() * pts.length)];
        g.particles.spawn('ink', q.x, q.y, (Math.random() - 0.5) * 40, 20 + Math.random() * 60, 0.6, 2.2);
      }
    }
    g.sfx('hiss');
    g.recorder.mark('paintEnd', 0);
    this.log({ kind: 'soak', ink, cost, refund, inkBefore: before, inkAfter: g.inkAmt });
  }

  // ───────────────────────────────────────────── going through

  /** Can `r` take `obj` now? Clears the ignore entry once `obj` has left the disc. */
  private open(r: Ring, obj: object, outFull: () => boolean, outCentre: () => boolean): boolean {
    if (r.state !== 'linked' || !r.partner) return false;
    const ig = r.ignore.get(obj);
    if (ig) {
      if (ig === 'full' ? outFull() : outCentre()) {
        r.ignore.delete(obj);
        if (obj === TRAVELER && r === this.travelerExit) this.travelerLeft(r);
      }
      return false;
    }
    if (this.tuning.oneWay && r.role !== 'entry') return false;
    return (this.cooldown.get(obj) ?? -1) <= this.g.t;
  }

  /** Once per physics substep, after the traveler moved. */
  stepTraveler() {
    const g = this.g;
    if (g.state !== 'play' || !this.rings.length) return;
    const x0 = g.px - PLAYER_HW;
    const x1 = g.px + PLAYER_HW;
    const y0 = g.py - PLAYER_H;
    const y1 = g.py;
    const cx = g.px;
    const cy = g.py - PLAYER_H / 2;
    // the stopped rule: a traveler standing still is caught by the full disc
    const stopped = g.grounded && !g.ride && Math.abs(g.vx) < 20;
    // a traveler pinned at a wall is never held out of a linked ring (except the one they just came out of)
    if (g.stuckT > 0.3) for (const r of this.rings) if (r !== this.travelerExit && r.state === 'linked') r.ignore.delete(TRAVELER);
    for (const r of this.rings) {
      const ok = this.open(
        r,
        TRAVELER,
        () => !boxHitsDisc(x0, y0, x1, y1, r.cx, r.cy, r.r),
        () => Math.hypot(cx - r.cx, cy - r.cy) > r.r,
      );
      if (ok && boxHitsDisc(x0, y0, x1, y1, r.cx, r.cy, stopped ? r.r : r.r * 0.8)) {
        this.passTraveler(r, stopped);
        return;
      }
    }
  }

  private travelerLeft(exit: Ring) {
    const entry = this.travelerEntry;
    this.travelerExit = null;
    this.travelerEntry = null;
    entry?.ignore.delete(TRAVELER);
    // rule 2: the door you walked through closes behind you (the pair you used, even if a ring painted while you
    // were still inside the exit has since relinked to it)
    if (this.tuning.doorsClose && !exit.fixed && entry && !entry.fixed) {
      this.log({ kind: 'doors', a: entry.id, b: exit.id });
      this.closeRing(exit);
      this.closeRing(entry);
    }
  }

  private passTraveler(entry: Ring, stopped: boolean) {
    const g = this.g;
    const exit = entry.partner!;
    if (g.ride) {
      g.ride.st.rideCooldown = 0.6;
      g.ride = null;
    }
    const vin = { x: g.vx, y: g.vy };
    const speedIn = Math.hypot(vin.x, vin.y);
    const speed = this.tuning.exitFloor ? Math.max(speedIn, g.rules.runSpeed) : speedIn;
    const d = this.exitDir(exit);
    const from = { x: g.px, y: g.py };
    g.px = exit.cx + d.x * exit.r * 0.25;
    g.py = exit.cy + d.y * exit.r * 0.25 + PLAYER_H / 2;
    g.vx = d.x * speed;
    g.vy = d.y * speed;
    g.grounded = false;
    g.coyote = 0;
    g.stuckT = 0;
    // feet inside the ground: lifted to stand on it
    for (const isl of g.level.islands) {
      if (g.px < isl.x0 || g.px > isl.x1) continue;
      const gy = groundAt(isl, g.px);
      if (gy < g.py && g.py - gy < PLAYER_H + exit.r) {
        g.py = gy;
        if (g.vy > 0) g.vy = 0;
        g.grounded = g.vy >= 0;
      }
    }
    g.launched = this.tuning.launch && !g.grounded;
    if (this.tuning.launch && g.charId === 'kohaku') g.airJumps = 1;
    entry.lastIn = g.t;
    entry.pulse = 1;
    exit.flash = 1;
    // the traveler is caught by their body box, so they have left a disc once the box is clear of it
    // (a centre test would let the box touch the 0.8·R capture disc again and bounce them straight back)
    entry.ignore.set(TRAVELER, 'full');
    exit.ignore.set(TRAVELER, 'full');
    this.travelerExit = exit;
    this.travelerEntry = entry;
    this.cooldown.set(TRAVELER, g.t + 0.05);
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2;
      g.particles.spawn('mote', from.x + Math.cos(a) * entry.r * 0.6, from.y - 29 + Math.sin(a) * entry.r * 0.6, -Math.cos(a) * 80, -Math.sin(a) * 80, 0.5, 2, 'rgba(229,139,255,0.9)');
      g.particles.spawn('paint', exit.cx, exit.cy, d.x * 200 + (Math.random() - 0.5) * 160, d.y * 200 + (Math.random() - 0.5) * 160, 0.6, 2.2, i % 3 ? INKS.murasaki.color : INKS.murasaki.light);
    }
    g.audio.portalFx('portal', 1);
    g.recorder.mark('effect', 2);
    this.log({
      kind: 'pass',
      what: 'traveler',
      stopped,
      entry: entry.id,
      exit: exit.id,
      vin,
      speedIn,
      vout: { x: g.vx, y: g.vy },
      speedOut: Math.hypot(g.vx, g.vy),
      dir: d,
      at: { x: g.px, y: g.py },
      lifted: g.grounded,
    });
  }

  private passYokai(y: Yokai, entry: Ring) {
    const g = this.g;
    const exit = entry.partner!;
    const d = this.exitDir(exit);
    const ex = exit.cx + d.x * exit.r * 0.25;
    const ey = exit.cy + d.y * exit.r * 0.25;
    const from = { x: y.cx, y: y.cy };
    // the hover anchor moves to the exit; it keeps hovering there
    y.x += ex - y.cx;
    y.y += ey - y.cy;
    y.cx = ex;
    y.cy = ey;
    entry.lastIn = g.t;
    entry.pulse = 1;
    exit.flash = 1;
    entry.ignore.set(y, 'centre');
    exit.ignore.set(y, 'centre');
    const used = this.yokaiUsed.get(y) ?? new Set<Ring>();
    used.add(entry).add(exit);
    this.yokaiUsed.set(y, used);
    this.cooldown.set(y, g.t + 0.6);
    g.audio.portalFx('portal', 0.6);
    this.log({ kind: 'pass', what: 'yokai', entry: entry.id, exit: exit.id, from, at: { x: ex, y: ey } });
  }

  private liftFire(ring: Ring) {
    const g = this.g;
    const f = ring.heldFire;
    ring.heldFire = null;
    const exit = ring.partner;
    if (!f || !f.alive || !exit) return;
    f.alive = false;
    f.deadT = 0;
    ring.lastIn = g.t;
    ring.pulse = 1;
    for (let i = 0; i < 24; i++) g.particles.spawn('ember', f.x + Math.random() * f.w, f.y - Math.random() * f.h * 0.7, (ring.cx - f.x - f.w / 2) * 0.8, -60 - Math.random() * 80, 0.8, 3);
    const speed = this.tuning.exitFloor ? KIND_DEFAULTS.ember.exitSpeed : 0;
    const p = this.spawn({ kind: 'ember', x: ring.cx, y: ring.cy, vx: 0, vy: 0 });
    p.fire = f;
    this.log({ kind: 'lift', ring: ring.id, exit: exit.id, fireX: f.x });
    this.emit(p, ring, exit, speed);
  }

  /** Something leaves `exit` (having entered `entry`) at `speed` along the exit's direction. */
  private emit(p: Projectile, entry: Ring, exit: Ring, speed: number) {
    const g = this.g;
    const d = this.exitDir(exit);
    const vin = { x: p.vx, y: p.vy };
    p.x = exit.cx + d.x * exit.r * 0.25;
    p.y = exit.cy + d.y * exit.r * 0.25;
    p.vx = d.x * speed;
    p.vy = d.y * speed;
    p.gravity = 0;
    p.dropping = false;
    p.life = p.exitLife;
    p.fromRing = true;
    p.mine = !exit.fixed;
    p.through++;
    p.trail = [{ x: p.x, y: p.y }];
    entry.lastIn = g.t;
    entry.pulse = 1;
    exit.flash = 1;
    entry.ignore.set(p, 'centre');
    exit.ignore.set(p, 'centre');
    if (p.safeAfterRing) p.harms = false;
    p.onPass?.(p, entry, exit);
    // gentle aim assist: bend up to 20° toward the nearest target in front of the spout
    p.bend = 0;
    const reach = speed * p.exitLife + 80;
    let best = Infinity;
    for (const t of this.targetPoints()) {
      const dx = t.x - p.x;
      const dy = t.y - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist > reach || dist < 1 || dist >= best) continue;
      const cross = d.x * dy - d.y * dx;
      const ang = Math.acos(Math.max(-1, Math.min(1, (d.x * dx + d.y * dy) / dist)));
      if (ang > (45 * Math.PI) / 180) continue;
      best = dist;
      p.bend = Math.min(ang, (20 * Math.PI) / 180);
      p.bendSign = cross >= 0 ? 1 : -1;
    }
    g.audio.portalFx('portal', 0.5);
    this.log({ kind: 'pass', what: p.kind, entry: entry.id, exit: exit.id, vin, speedIn: Math.hypot(vin.x, vin.y), vout: { x: p.vx, y: p.vy }, speedOut: speed, dir: d, at: { x: p.x, y: p.y }, bend: p.bend * p.bendSign });
  }

  private targetPoints(): { x: number; y: number }[] {
    const L = this.g.level;
    const out: { x: number; y: number }[] = [];
    for (const b of L.brambles) if (b.alive) out.push({ x: b.x + b.w / 2, y: b.y - b.h / 2 });
    for (const y of L.yokai) if (y.alive) out.push({ x: y.cx, y: y.cy });
    for (const t of this.targets) if (t.alive()) out.push({ x: t.x, y: t.y });
    return out;
  }

  /** Launch a projectile (spark, bolt, ember or a new kind). It flies, passes rings, and hits things. */
  spawn(spec: ProjectileSpec): Projectile {
    const k = KIND_DEFAULTS[spec.kind] ?? KIND_DEFAULTS.spark;
    const p: Projectile = {
      kind: spec.kind,
      x: spec.x,
      y: spec.y,
      vx: spec.vx,
      vy: spec.vy,
      life: spec.life ?? k.life,
      r: spec.r ?? k.r,
      harms: spec.harms ?? true,
      gravity: spec.gravity ?? 0,
      exitSpeed: spec.exitSpeed ?? k.exitSpeed,
      exitLife: spec.exitLife ?? k.exitLife,
      tip: spec.tip ?? k.tip,
      armed: spec.armed ?? false,
      fromRing: false,
      mine: false,
      through: 0,
      trail: [{ x: spec.x, y: spec.y }],
      dead: false,
      age: 0,
      bend: 0,
      bendSign: 1,
      fire: null,
      dropping: false,
      data: spec.data,
      onEnd: spec.onEnd,
      safeAfterRing: spec.safeAfterRing ?? false,
      onPass: spec.onPass,
      hitStop: spec.hitStop ?? 0,
      draw: spec.draw,
      cause: spec.cause,
    };
    this.projectiles.push(p);
    return p;
  }

  private end(p: Projectile, why: string, stroke?: Stroke) {
    if (p.dead) return;
    p.dead = true;
    for (const r of this.rings) r.ignore.delete(p);
    p.onEnd?.(p, why, stroke);
  }

  /** Remove a live projectile quietly (its onEnd hears 'cancel'). */
  cancel(p: Projectile) {
    this.end(p, 'cancel');
    this.projectiles = this.projectiles.filter((q) => q !== p);
  }

  /**
   * The Raijin arena wrap (summer-design 4.5): move everything this module owns by dx along x. Ring strokes
   * are moved here only if Game no longer lists them (closing rings); Game's strokes are moved by the caller.
   */
  shiftWorld(dx: number, inGame: Set<Stroke>, shiftStroke: (st: Stroke, dx: number) => void) {
    for (const r of this.rings) {
      if (r.fixed) continue;
      r.cx += dx;
      if (r.stroke && !inGame.has(r.stroke)) shiftStroke(r.stroke, dx);
    }
    for (const p of this.projectiles) {
      p.x += dx;
      for (const q of p.trail) q.x += dx;
    }
    for (const f of this.fx) {
      if (f.kind === 'flicker') f.x += dx;
      else if (f.kind === 'fizzle') {
        f.fit = { ...f.fit, cx: f.fit.cx + dx };
        if (f.stroke) shiftStroke(f.stroke, dx);
      } else shiftStroke(f.stroke, dx);
    }
  }

  private echo(p: Projectile, x: number, y: number) {
    const g = this.g;
    if (!p.mine) return;
    g.inkAmt = Math.min(g.inkMax, g.inkAmt + ECHO_REFUND);
    g.stats.ink -= ECHO_REFUND;
    // purple motes fly back to the ink meter
    const hs = g.H / VIEW_H;
    const to = g.screenToWorld(150 * hs, 46 * hs);
    for (let i = 0; i < 14; i++) {
      const tt = 0.8 + Math.random() * 0.3;
      g.particles.spawn('mote', x + (Math.random() - 0.5) * 30, y + (Math.random() - 0.5) * 30, (to.x - x) / tt, (to.y - y) / tt, tt, 2.6, 'rgba(229,139,255,0.95)');
    }
    this.log({ kind: 'echo', what: p.kind, refund: ECHO_REFUND, ink: g.inkAmt });
  }

  /** One small move of a projectile; returns true when it stops moving for this frame. */
  private projectileStep(p: Projectile): boolean {
    const g = this.g;
    const L = g.level;
    const sp = Math.hypot(p.vx, p.vy) || 1;
    const tx = p.x + (p.vx / sp) * p.tip;
    const ty = p.y + (p.vy / sp) * p.tip;
    for (const r of this.rings) {
      const ok = this.open(
        r,
        p,
        () => Math.hypot(p.x - r.cx, p.y - r.cy) > r.r,
        () => Math.hypot(p.x - r.cx, p.y - r.cy) > r.r,
      );
      if (ok && Math.hypot(tx - r.cx, ty - r.cy) < r.r * 0.8) {
        // a projectile caught between two spouts that face each other would loop for ever: it burns out instead
        if (p.through >= MAX_PASSES) {
          for (let i = 0; i < 8; i++) g.particles.spawn('steam', p.x, p.y, (Math.random() - 0.5) * 40, -20, 0.8, 4);
          this.end(p, 'expire');
          return true;
        }
        const speed = this.tuning.exitFloor ? Math.max(sp, p.exitSpeed) : sp;
        this.emit(p, r, r.partner!, speed);
        return true;
      }
    }
    if (p.harms && g.state === 'play' && g.invuln <= 0 && boxHitsDisc(g.px - PLAYER_HW, g.py - PLAYER_H, g.px + PLAYER_HW, g.py, p.x, p.y, p.r)) {
      this.log({ kind: 'hit', what: p.kind, target: 'traveler' });
      // N10: the projectile is the cause (a system that draws its projectiles itself also outlines its own cause)
      const cause = p.cause ? p.cause(p) : p.draw ? undefined : { kind: p.kind, x: p.x - p.r, y: p.y - p.r, w: p.r * 2, h: p.r * 2 };
      if (cause) g.cause = cause;
      if (p.hitStop > 0) g.freeze(p.hitStop, () => g.die(false, cause));
      else g.die(false, cause);
      this.end(p, 'traveler');
      return true;
    }
    if (p.armed || p.fromRing) {
      for (const b of L.brambles) {
        if (b.alive && boxHitsDisc(b.x, b.y - b.h, b.x + b.w, b.y, p.x, p.y, p.r)) {
          b.alive = false;
          b.deadT = 0;
          g.sfx('hiss');
          g.recorder.mark('effect', 2);
          g.particles.burst('ink', b.x + b.w / 2, b.y - b.h / 2, 30, 260, 0.8, 2.6);
          for (let i = 0; i < 20; i++) g.particles.spawn('ember', b.x + Math.random() * b.w, b.y - Math.random() * b.h, (Math.random() - 0.5) * 60, -80 - Math.random() * 80, 1.2, 3);
          this.log({ kind: 'hit', what: p.kind, target: 'thicket', x: b.x });
          this.echo(p, b.x + b.w / 2, b.y - b.h / 2);
          this.end(p, 'hit');
          return true;
        }
      }
      for (const y of L.yokai) {
        if (y.alive && Math.hypot(y.cx - p.x, y.cy - p.y) < y.r + p.r) {
          y.alive = false;
          y.deadT = 0;
          g.sfx('shimmer');
          g.recorder.mark('effect', 2);
          for (let i = 0; i < 30; i++) {
            const a = Math.random() * Math.PI * 2;
            const s = 40 + Math.random() * 140;
            g.particles.spawn('mote', y.cx, y.cy, Math.cos(a) * s, Math.sin(a) * s - 30, 1.2 + Math.random(), 2.4, 'rgba(229,139,255,0.9)');
          }
          this.log({ kind: 'hit', what: p.kind, target: 'yokai', x: y.cx });
          this.echo(p, y.cx, y.cy);
          this.end(p, 'hit');
          return true;
        }
      }
      for (const t of this.targets) {
        if (t.alive() && Math.hypot(t.x - p.x, t.y - p.y) < t.r + p.r) {
          t.hit(p);
          this.log({ kind: 'hit', what: p.kind, target: 'target', x: t.x });
          this.echo(p, t.x, t.y);
          this.end(p, 'hit');
          return true;
        }
      }
    }
    // indigo puts fire out (sparks, embers); vermilion stops sparks and bolts (an ember passes it: 1.6 lists only
    // indigo or a gap). Only vermilion stops a bolt, and the bolt shatters it (N6, design 4.2).
    for (const st of g.strokes) {
      if (p.kind === 'bolt' ? st.kind !== 'shu' : st.kind !== 'ai' && (st.kind !== 'shu' || p.kind === 'ember')) continue;
      const b = st.bbox;
      if (p.x < b.x0 - p.r || p.x > b.x1 + p.r || p.y < b.y0 - p.r || p.y > b.y1 + p.r) continue;
      if (polylineDist(st.pts, p) < INKS[st.kind].width * 0.5 + p.r * 0.6) {
        for (let i = 0; i < 14; i++) g.particles.spawn('steam', p.x, p.y, (Math.random() - 0.5) * 50, -30 - Math.random() * 40, 1.1, 5);
        if (st.kind === 'ai') g.sfx('hiss');
        this.end(p, 'ink', st);
        return true;
      }
    }
    for (const isl of L.islands) {
      if (p.x < isl.x0 || p.x > isl.x1) continue;
      const gy = groundAt(isl, p.x);
      if (p.y > gy) {
        this.land(p, gy);
        return true;
      }
    }
    if (p.y > KILL_Y + 200) {
      this.end(p, 'gap');
      return true;
    }
    return false;
  }

  /** It hit the ground: sparks and bolts splash; an ember re-forms as a fire where it lands. */
  private land(p: Projectile, gy: number) {
    const g = this.g;
    if (p.kind === 'ember' && p.fire) {
      const f = p.fire;
      const onPillar = this.g.level.pillars.some((q) => p.x >= q.x && p.x <= q.x + q.w);
      if (!onPillar) {
        f.x = p.x - 60;
        f.w = 120;
        f.h = 110;
        f.y = gy + 4;
        f.alive = true;
        f.deadT = 0;
        g.particles.burst('ink', p.x, gy, 16, 200, 0.5, 2.2, undefined, 120);
        this.log({ kind: 'reform', x: p.x, y: gy });
      }
      this.end(p, 'ground');
      return;
    }
    g.particles.burst('ink', p.x, Math.min(p.y, gy), 14, 220, 0.5, 2, undefined, 140);
    this.end(p, 'ground');
  }

  private expire(p: Projectile) {
    if (p.kind === 'ember' && !p.dropping) {
      // its straight flight is spent: it drops, and re-forms as a fire where it lands
      p.dropping = true;
      p.gravity = 2000;
      p.vx *= 0.3;
      p.vy = Math.max(0, p.vy * 0.3);
      p.life = 5;
      return;
    }
    for (let i = 0; i < 8; i++) this.g.particles.spawn('steam', p.x, p.y, (Math.random() - 0.5) * 40, -20, 0.8, 4);
    this.end(p, 'expire');
  }

  private updateProjectiles(dt: number) {
    if (!this.projectiles.length) return;
    const bendRate = ((20 * Math.PI) / 180) / 0.15;
    for (const p of this.projectiles) {
      if (p.dead) continue;
      p.age += dt;
      p.life -= dt;
      const move = Math.hypot(p.vx, p.vy) * dt + p.gravity * dt * dt;
      const n = Math.min(80, Math.max(1, Math.ceil(move / 6)));
      const h = dt / n;
      for (let k = 0; k < n && !p.dead; k++) {
        if (p.bend > 0) {
          const a = Math.min(p.bend, bendRate * h);
          const v = rotate(p.vx, p.vy, a * p.bendSign);
          p.vx = v.x;
          p.vy = v.y;
          p.bend -= a;
        }
        p.vy += p.gravity * h;
        p.x += p.vx * h;
        p.y += p.vy * h;
        if (this.projectileStep(p)) break;
      }
      const last = p.trail[p.trail.length - 1];
      if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 8) {
        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > (p.kind === 'bolt' ? 12 : 16)) p.trail.shift();
      }
      if (!p.dead && p.life <= 0) this.expire(p);
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  /** Once per frame (game time), after the hazards moved. */
  update(dt: number) {
    const g = this.g;
    if (g.state === 'menu') return;
    const loop = this.paintLoop();
    if (loop && this.paint) this.paint.fail = this.judge(loop).fail;
    const viewW = g.W / g.S;
    // 1.7: a waiting ring is dull (its stroke has no glow); linking is the moment the glow appears, then it
    // breathes on the same clock as drawRing's dashes
    const breath = 0.5 + 0.5 * Math.sin(g.realT * 3.4);
    for (const r of this.rings) {
      if (r.stroke) r.stroke.glowK = r.state === 'linked' ? 1.3 + 0.9 * breath + 2.3 * Math.max(0, 1 - (g.realT - r.linkT) / 0.6) : 0;
      r.flash = Math.max(0, r.flash - dt * 2.5);
      r.pulse = Math.max(0, r.pulse - dt * 3);
      if (r.state === 'closing') r.closeT += dt;
      // cleanup: a player ring left 1.5 view widths behind the camera closes, and its partner with it.
      // The partner is off screen behind the traveler too (it sits within the reach), and a lone ring left
      // behind would otherwise make the next door fizzle "too far".
      else if (!r.fixed && r.cx + r.r < g.camCX - viewW * 1.5) {
        const p = r.partner;
        this.closeRing(r, true);
        if (p && !p.fixed) this.closeRing(p, true);
      }
    }
    this.rings = this.rings.filter((r) => r.state !== 'closing' || r.closeT < CLOSE_TIME);
    // yokai drift (or lean toward the traveler) into rings
    for (const y of g.level.yokai) {
      if (!y.alive) continue;
      for (const r of this.rings) {
        const d = Math.hypot(y.cx - r.cx, y.cy - r.cy);
        const ok = this.open(
          r,
          y,
          () => d > r.r + y.r,
          () => d > r.r,
        );
        if (ok && d < r.r * 0.8 && !this.yokaiUsed.get(y)?.has(r)) {
          this.passYokai(y, r);
          break;
        }
      }
    }
    this.updateProjectiles(dt);
    const rt = g.realT;
    this.fx = this.fx.filter((f) => rt - f.t0 < (f.kind === 'soak' ? SOAK_TIME + 0.1 : f.kind === 'flicker' ? 0.6 : GHOST_TIME));
  }

  // ───────────────────────────────────────────── drawing

  /** Behind the hazards, after the terrain: the blot pillars. */
  drawPillars(ctx: CanvasRenderingContext2D, vx0: number, vx1: number, vy0: number, vy1: number) {
    const L = this.g.level;
    for (const p of L.pillars) {
      if (p.x + p.w < vx0 - 60 || p.x > vx1 + 60) continue;
      const left = L.islands.find((i) => i.x1 >= p.x - 1 && i.x0 < p.x - 1);
      drawPillar(ctx, p, left ? groundAt(left, p.x - 1) : p.yTop + 900, this.g.realT, vy0, vy1);
    }
  }

  private look(r: Ring): RingLook {
    const linked = r.state === 'linked';
    const lineAim = this.tuning.aim === 'line' && !r.fixed;
    const spout = r.partner || r.fixed ? this.exitDir(r) : r.spout;
    return {
      linked,
      speed: linked ? 1 : 0.3,
      alpha: 1,
      autoSpout: lineAim || !r.tailed || (this.tuning.oneWay && r.role === 'entry' && linked),
      spout,
      hers: r.fixed,
    };
  }

  /** Over the strokes: rings, fizzles, soaks and projectiles. */
  draw(ctx: CanvasRenderingContext2D, vx0: number, vx1: number) {
    // replays and highlight clips don't record rings yet (N17): never draw today's rings over old frames
    if (this.g.recorder.replaying) return;
    const rt = this.g.realT;
    for (const f of this.fx) {
      const age = rt - f.t0;
      if (f.kind === 'soak') {
        const sp = f.stroke.sprite;
        if (!sp) continue;
        const k = Math.min(1, age / SOAK_TIME);
        // drunk into the black: darkens, sinks and fades
        ctx.globalAlpha = (1 - k) * 0.9;
        ctx.drawImage(sp.canvas, sp.x, sp.y + k * 14, sp.canvas.width / sp.s, sp.canvas.height / sp.s);
        ctx.globalAlpha = 1;
      } else if (f.kind === 'fizzle') {
        const sp = f.stroke?.sprite;
        if (sp && age < FIZZLE_FADE) {
          ctx.globalAlpha = (1 - age / FIZZLE_FADE) * 0.8;
          ctx.drawImage(sp.canvas, sp.x, sp.y, sp.canvas.width / sp.s, sp.canvas.height / sp.s);
          ctx.globalAlpha = 1;
        }
        drawGhost(ctx, f.fit, f.label, age);
      } else {
        const k = 1 - age / 0.6;
        if (k <= 0 || Math.floor(age * 14) % 2) continue;
        ctx.save();
        ctx.strokeStyle = `rgba(150,40,20,${0.8 * k})`;
        ctx.lineWidth = 4;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
    for (const r of this.rings) {
      if (r.cx + r.r * 2 < vx0 || r.cx - r.r * 2 > vx1) continue;
      if (r.state === 'closing' && r.stroke?.sprite) {
        // its stroke has left the stroke list: fade it out here
        const sp = r.stroke.sprite;
        ctx.globalAlpha = Math.max(0, 1 - r.closeT / CLOSE_TIME);
        ctx.drawImage(sp.canvas, sp.x, sp.y, sp.canvas.width / sp.s, sp.canvas.height / sp.s);
        ctx.globalAlpha = 1;
      }
      drawRing(ctx, r, this.look(r), rt);
    }
    for (const p of this.projectiles) {
      if (p.x < vx0 - 100 || p.x > vx1 + 100) continue;
      if (p.draw) p.draw(ctx, p, rt);
      else drawProjectile(ctx, p, rt);
    }
  }

  /** Over the wet stroke while the brush is down: the snap, and the reach circle for the partner. */
  drawPaint(ctx: CanvasRenderingContext2D) {
    const ps = this.paint;
    const g = this.g;
    if (!ps?.tracker) return;
    const t = ps.tracker.tip;
    const tip = t && { x: t.x + g.camCX, y: t.y + g.camCY };
    const { partner } = tip ? this.partnerFor(tip.x, tip.y) : this.partnerFor();
    if (partner) drawReach(ctx, { x: partner.cx, y: partner.cy }, g.rules.portalSpan, tip, g.realT);
    const fit = this.paintLoop();
    if (fit) drawSnap(ctx, fit, !ps.fail, g.realT - ps.snapT, g.realT);
  }

  /** The wall nudge text (N9): a door when the wall is a blot pillar or Purple is the scroll's only ink. */
  nudge(): string | null {
    const g = this.g;
    const inks = g.rules.inks;
    if (inks.length === 1 && inks[0] === 'murasaki') return 'Paint a door';
    for (const p of g.level.pillars) if (p.x - g.px > -20 && p.x - g.px < 60) return 'Paint a door';
    return null;
  }
}
