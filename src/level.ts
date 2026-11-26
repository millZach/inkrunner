import { DEFAULT_INKS, INK_MAX, INK_ORDER, INK_REGEN, RUN_SPEED, SLOW_SCALE, SLOWMO_DRAIN, type InkKind } from './config';
import { clamp, smoothstep, type Vec } from './math';
import { fbm1 } from './rng';

export const BOTTOM = 1100;

export type ThemeId = 'spring' | 'snow' | 'sea' | 'summer';

/**
 * The sky a scroll is painted under (N13). Null keeps the theme's plain paper sky (every pre-Summer scroll).
 * dusk: 起 (ochre, low sun); night: 承 (festival night, indigo wash, warm horizon); storm: 転 and 結 (slate clouds);
 * storm-peak: the gate (Raijin's storm, darkest); moon: after the storm (clear, a full moon).
 */
export type SkyId = 'dusk' | 'night' | 'storm' | 'storm-peak' | 'moon';
export const SKY_IDS: readonly SkyId[] = ['dusk', 'night', 'storm', 'storm-peak', 'moon'];

export interface Island {
  x0: number;
  x1: number;
  pts: Vec[];
  seed: number;
}

export interface Fire {
  x: number;
  y: number; // ground line (bottom of flames)
  w: number;
  h: number;
  alive: boolean;
  deadT: number;
}

export interface Yokai {
  x: number;
  y: number;
  r: number;
  ampX: number;
  ampY: number;
  speed: number;
  phase: number;
  cx: number;
  cy: number;
  ox: number; // reactive offset (drift toward the traveler / recoil from gold)
  oy: number;
  look: number; // eye direction
  flinch: number;
  alive: boolean;
  deadT: number;
}

export interface Bramble {
  x: number;
  y: number; // ground line
  w: number;
  h: number;
  seed: number;
  alive: boolean;
  deadT: number;
}

export interface Lantern {
  x: number;
  y: number;
  lit: boolean;
  litT: number;
}

export interface Hint {
  x: number;
  y: number;
  kanji?: string;
  text: string;
}

/** A blot pillar (墨 column, N5): a wall too tall to climb that soaks any non-purple stroke in its column. */
export interface Pillar {
  x: number;
  w: number;
  /** top of the column (y grows downward) */
  yTop: number;
}

/**
 * Her pre-painted rings (story device 2, N18): a linked pair that never closes, does not count toward
 * the player's limit and survives deaths. Spouts are angles in degrees (0 = right, -90 = up).
 */
export interface FixedRingDef {
  a: Vec;
  b: Vec;
  r: number;
  aimA: number;
  aimB: number;
}

/** One strike group of a Raijin phase: bolts on marks `spacing` apart, each telegraphed `tele` s (N11). */
export interface RaijinStrikeDef {
  /** world x of the mark (where the bolt lands) */
  mark: number;
  /** telegraph length, game seconds (>= 1.0, every time) */
  tele: number;
  /** strike group within the pass, and the bolt's index inside the group */
  group: number;
  idx: number;
}

/** One phase of the Raijin arena: a loop of `length` u starting at x0 (docs/summer-design.md 4.4, 4.5). */
export interface RaijinPhaseDef {
  n: number;
  x0: number;
  length: number;
  /** drums this phase must clean */
  hits: number;
  /** the phase lantern (seam + 1500) */
  lantern: number;
  strikes: RaijinStrikeDef[];
  pattern: 'single' | 'pair' | 'triplet';
  /** Raijin's screen x (fraction of the view width), from..to of his sweep; and his vertical bob (u) */
  sweep: [number, number];
  bob: number;
  /** how far above the road he rides */
  above: number;
}

/** Raijin's gate (N11): where he appears, the road height he fights over, and his phases. */
export interface RaijinDef {
  groundY: number;
  /** the traveler passing this x makes him paint himself in */
  enterX: number;
  drums: number;
  phases: RaijinPhaseDef[];
}

/**
 * A telegraphed strike (N6): a hanabi spark or a stray bolt that lands on a ground mark. Position-triggered: the
 * telegraph starts when the traveler passes `trigger` (or is already past it), and lands `tele` game seconds later.
 */
export interface StrikeDef {
  kind: 'spark' | 'bolt';
  /** world x of the mark (where it lands) */
  mark: number;
  /** the ground under the mark */
  groundY: number;
  /** telegraph length, game seconds (spark 1.5, bolt 1.2; never under 1.0) */
  tele: number;
  /** the traveler passing this x starts the telegraph */
  trigger: number;
  /** repeat every `loop` game seconds while the traveler is past the trigger (and not far beyond the mark) */
  loop?: number;
}

/** A festival lantern line on posts (N13): lights in a cascade as the traveler passes. Decor only. */
export interface Festoon {
  x0: number;
  x1: number;
  /** sags over catch spots: a wordless signpost (x, extra depth in u) */
  dips: { x: number; depth: number }[];
}

/** A firework (N13): it rises and blooms when the traveler reaches `x`, so clips always match. */
export interface HanabiDef {
  x: number;
  size: 'first' | 'small' | 'great';
  /** where it blooms (world): ahead of the trigger, high over the hills */
  bx: number;
  by: number;
}

/** A background lightning flash (N13, through the flash limiter N19), triggered by position. */
export interface FlashDef {
  x: number;
  /** the flash shows Raijin's ring of drums in the cloud */
  raijin: boolean;
}

/** One beat as Course recorded it, for the ramp report (N14). */
export interface BeatStat {
  label: string;
  x: number;
  /** gross ink of the beat's intended line, and what echo refunds give back */
  ink: number;
  refund: number;
  terrain: number;
  strikes: number;
}

/** What Course measured while laying a scroll (N1, N14). */
export interface CourseStats {
  terrain: number;
  strikes: number;
  ink: number;
  refund: number;
  /** the shortest strike telegraph (Infinity when the scroll has none) */
  minTele: number;
  beats: BeatStat[];
}

export type DecorKind = 'pine' | 'bamboo' | 'rock' | 'reeds' | 'maple';

export interface Decor {
  kind: DecorKind;
  x: number;
  y: number;
  s: number;
  seed: number;
  flip: boolean;
}

/**
 * Per-scroll difficulty and ink rules. Defaults equal the global constants in config.ts,
 * so a scroll that never calls `LevelBuilder.rules()` plays exactly as before.
 */
export interface ScrollRules {
  /** traveler run speed, world units per second (also the finish walk) */
  runSpeed: number;
  /** base inkwell size; Ren's deep inkwell multiplies it by 1.4 */
  inkMax: number;
  /** ink refilled per second of game time while not painting */
  inkRegen: number;
  /** time scale while the brush is down (lower = stronger slow motion) */
  slowScale: number;
  /** ink drained per real second while the brush is down */
  slowmoDrain: number;
  /** inks offered on this scroll, always in ink-stone order (INK_ORDER) */
  inks: InkKind[];
  /** portal reach: the most a pair's centres may be apart (Infinity = only the view limits it) */
  portalSpan: number;
  /**
   * Rain (docs/summer-design.md 2): false keeps the scroll dry. Otherwise vermilion strokes in a rain zone
   * (Level.rainZones; none listed = the whole scroll) wash away on one clock: `hold` s wet, then `warn` s running
   * (still solid, the visible warning, never under 1.0 s), then gone. Both are game time.
   */
  rain: false | RainRules;
  /** the ink in hand when the scroll starts (undefined = the first of `inks`); must be one of `inks` */
  startInk?: InkKind;
  /** camera lead: how far ahead of the traveler the view is centred, as a fraction of the view width
   *  (0.18 = the old fixed lead, about 870 u visible ahead at 16:9; Summer uses 0.22, about 920 u) */
  camLead: number;
}

/** One wash clock per scroll. `density` only changes how heavy the rain looks (1 = the 転 storm). */
export interface RainRules {
  hold: number;
  warn: number;
  density?: number;
}

/** The 転 clock, used when a scroll just says `rain: true`. */
export const DEFAULT_RAIN: RainRules = { hold: 0.7, warn: 1.1, density: 1 };
/** The warning is never shorter than this (the brief: at least one second of visible warning). */
export const MIN_RAIN_WARN = 1.0;

function mergeRain(v: unknown): false | RainRules {
  if (!v) return false;
  const o: Partial<RainRules> = v === true ? DEFAULT_RAIN : (v as Partial<RainRules>);
  const fin = (x: number | undefined, d: number) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
  return {
    hold: clamp(fin(o.hold, DEFAULT_RAIN.hold), 0, 60),
    warn: clamp(fin(o.warn, DEFAULT_RAIN.warn), MIN_RAIN_WARN, 60),
    density: clamp(fin(o.density, 1), 0, 3),
  };
}

export function defaultRules(): ScrollRules {
  return {
    runSpeed: RUN_SPEED,
    inkMax: INK_MAX,
    inkRegen: INK_REGEN,
    slowScale: SLOW_SCALE,
    slowmoDrain: SLOWMO_DRAIN,
    inks: [...DEFAULT_INKS],
    rain: false,
    portalSpan: Infinity,
    camLead: 0.18,
  };
}

/** Keep only known inks, de-duplicated and in stone order; never empty. */
export function normalizeInks(inks: readonly string[]): InkKind[] {
  const out = INK_ORDER.filter((k) => inks.includes(k));
  return out.length ? out : [...DEFAULT_INKS];
}

/** Merge overrides onto rules, clamping values into ranges the simulation can handle. */
export function mergeRules(base: ScrollRules, over: Partial<ScrollRules>): ScrollRules {
  const defined = Object.fromEntries(Object.entries(over).filter(([, v]) => v !== undefined)) as Partial<ScrollRules>;
  const r = { ...base, ...defined };
  const num = (v: number, lo: number, hi: number, d: number) => (Number.isFinite(v) ? clamp(v, lo, hi) : d);
  const inks = normalizeInks(r.inks);
  const out: ScrollRules = {
    runSpeed: num(r.runSpeed, 1, 2000, base.runSpeed),
    inkMax: num(r.inkMax, 1, 10000, base.inkMax),
    inkRegen: num(r.inkRegen, 0, 10000, base.inkRegen),
    slowScale: num(r.slowScale, 0.01, 0.95, base.slowScale),
    slowmoDrain: num(r.slowmoDrain, 0, 10000, base.slowmoDrain),
    inks,
    rain: mergeRain(r.rain),
    portalSpan: r.portalSpan === Infinity ? Infinity : num(r.portalSpan, 50, 100000, base.portalSpan),
    camLead: num(r.camLead, 0, 0.45, base.camLead ?? 0.18),
  };
  // the start ink must be on offer; anything else falls back to the first stone
  if (r.startInk && inks.includes(r.startInk)) out.startInk = r.startInk;
  return out;
}

export interface Level {
  id: string;
  name: string;
  kanji: string;
  theme: ThemeId;
  length: number;
  islands: Island[];
  fires: Fire[];
  yokai: Yokai[];
  brambles: Bramble[];
  lanterns: Lantern[];
  hints: Hint[];
  decor: Decor[];
  torii: Vec;
  start: Vec;
  /** y of the sea surface, for wave scrolls */
  seaY: number | null;
  parTime: number;
  parInk: number;
  rules: ScrollRules;
  /** blot pillars (N5); each is also an island, so it stops the traveler like a wall */
  pillars: Pillar[];
  /** her pre-painted ring pairs (N18) */
  fixedRings: FixedRingDef[];
  /** Raijin's gate, when this scroll has one (N11) */
  raijin?: RaijinDef;
  /** rain zones as world x spans [x0, x1]; only used when rules.rain is on (empty = rain everywhere) */
  rainZones: [number, number][];
  /** the sky (N13); null = the theme's plain paper. `skyShifts` change it as the traveler passes x. */
  sky: SkyId | null;
  skyShifts: { x: number; sky: SkyId }[];
  /** telegraphed sparks and stray bolts (N6) */
  strikes: StrikeDef[];
  /** festival decor and beats (N13) */
  festoons: Festoon[];
  hanabi: HanabiDef[];
  flashes: FlashDef[];
  /** faint traced rings (the master's sketch): decor only */
  sketches: { x: number; y: number; r: number }[];
  /** stall-arcade eaves over a dry stretch: decor only, no collision */
  arcades: { x0: number; x1: number }[];
  /** set by Course.end() (N1, N14) */
  course?: CourseStats;
}

export function groundAt(isl: Island, x: number): number {
  const p = isl.pts;
  let lo = 0;
  let hi = p.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (p[m].x <= x) lo = m;
    else hi = m;
  }
  const a = p[lo];
  const b = p[hi];
  const t = clamp((x - a.x) / (b.x - a.x || 1), 0, 1);
  return a.y + (b.y - a.y) * t;
}

export function islandAt(level: Level, x: number): Island | null {
  for (const isl of level.islands) if (x >= isl.x0 && x <= isl.x1) return isl;
  return null;
}

export function groundY(level: Level, x: number): number {
  const isl = islandAt(level, x);
  return isl ? groundAt(isl, x) : BOTTOM;
}

/** Low-level placement helpers shared by handcrafted and generated scrolls. */
export class LevelBuilder {
  L: Level;
  private seed: number;

  constructor(id: string, name: string, kanji: string, theme: ThemeId, seed: number) {
    this.seed = seed;
    this.L = {
      id,
      name,
      kanji,
      theme,
      length: 0,
      islands: [],
      fires: [],
      yokai: [],
      brambles: [],
      lanterns: [],
      hints: [],
      decor: [],
      torii: { x: 0, y: 0 },
      start: { x: 120, y: 0 },
      seaY: theme === 'sea' ? 760 : null,
      parTime: 0,
      parInk: 0,
      rules: defaultRules(),
      pillars: [],
      fixedRings: [],
      rainZones: [],
      sky: theme === 'summer' ? 'dusk' : null,
      skyShifts: [],
      strikes: [],
      festoons: [],
      hanabi: [],
      flashes: [],
      sketches: [],
      arcades: [],
    };
  }

  /** Override this scroll's rules, e.g. `b.rules({ inkMax: 70, inks: ['shu', 'murasaki'] })`. */
  rules(over: Partial<ScrollRules>) {
    this.L.rules = mergeRules(this.L.rules, over);
    return this;
  }

  nextSeed() {
    return this.seed++ * 97 + 13;
  }

  island(x0: number, x1: number, y0: number, y1 = y0, bump = 7) {
    const sd = this.nextSeed();
    const n = Math.max(2, Math.round((x1 - x0) / 32));
    const pts: Vec[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = x0 + (x1 - x0) * t;
      const edge = Math.min(1, (x - x0) / 60, (x1 - x) / 60);
      const y = y0 + (y1 - y0) * smoothstep(t) + (fbm1(x * 0.004, sd) - 0.5) * 2 * bump * (0.4 + 0.6 * edge);
      pts.push({ x, y });
    }
    this.L.islands.push({ x0, x1, pts, seed: sd });
  }

  gy(x: number) {
    return groundY(this.L, x);
  }

  hint(x: number, y: number, text: string, kanji?: string) {
    this.L.hints.push({ x, y, text, kanji });
  }

  lantern(x: number) {
    this.L.lanterns.push({ x, y: this.gy(x), lit: false, litT: 0 });
  }

  fire(x: number, w: number, h: number) {
    this.L.fires.push({ x, y: this.gy(x + w / 2) + 4, w, h, alive: true, deadT: 0 });
  }

  yokai(x: number, y: number, r: number, ampY: number, ampX = 0, speed = 1.4) {
    this.L.yokai.push({
      x,
      y,
      r,
      ampX,
      ampY,
      speed,
      phase: x * 0.01,
      cx: x,
      cy: y,
      ox: 0,
      oy: 0,
      look: 0,
      flinch: 0,
      alive: true,
      deadT: 0,
    });
  }

  bramble(x: number, w: number, h: number) {
    this.L.brambles.push({ x, y: this.gy(x + w / 2) + 6, w, h, seed: this.nextSeed(), alive: true, deadT: 0 });
  }

  /** Mark [x0, x1] as a rain zone (`rules({ rain })` sets the clock). */
  rain(x0: number, x1: number) {
    this.L.rainZones.push([Math.min(x0, x1), Math.max(x0, x1)]);
    return this;
  }

  decor(kind: DecorKind, x: number, s = 1, flip = false) {
    this.L.decor.push({ kind, x, y: this.gy(x), s, seed: this.nextSeed() * 7919, flip });
  }

  /** A blot pillar from the ground at x up to yTop: an island (so it is a wall) plus the soak column. */
  pillar(x: number, w: number, yTop: number) {
    this.L.islands.push({ x0: x, x1: x + w, pts: [{ x, y: yTop }, { x: x + w, y: yTop }], seed: this.nextSeed() });
    this.L.pillars.push({ x, w, yTop });
  }

  /** Her rings: a fixed, linked pair. Positions are world points; aims are spout angles in degrees. */
  herRings(a: Vec, b: Vec, r = 55, aimA = 0, aimB = 0) {
    this.L.fixedRings.push({ a: { ...a }, b: { ...b }, r, aimA, aimB });
  }

  torii(x: number) {
    this.L.torii = { x, y: this.gy(x) };
  }

  /** The scroll's sky (N13). With `fromX`, the sky changes to `sky` when the traveler passes that x. */
  sky(sky: SkyId, fromX?: number) {
    if (fromX === undefined) this.L.sky = sky;
    else this.L.skyShifts.push({ x: fromX, sky });
    return this;
  }

  /** A telegraphed strike (N6); ground under the mark is read now, so call it once the islands exist. */
  strike(kind: StrikeDef['kind'], mark: number, tele: number, trigger: number, loop?: number) {
    this.L.strikes.push({ kind, mark, groundY: this.gy(mark), tele: Math.max(1, tele), trigger, loop });
    return this;
  }

  festoon(x0: number, x1: number, dips: { x: number; depth: number }[] = []) {
    this.L.festoons.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), dips });
    return this;
  }

  hanabi(x: number, size: HanabiDef['size'] = 'small') {
    const bx = x + (size === 'great' ? 520 : 420);
    // blooms high over the far hills: the great one fills the upper sky
    const by = this.gy(x) - (size === 'great' ? 560 : 470);
    this.L.hanabi.push({ x, size, bx, by: Math.min(by, 60) });
    return this;
  }

  flash(x: number, raijin = false) {
    this.L.flashes.push({ x, raijin });
    return this;
  }

  sketch(x: number, y: number, r = 50) {
    this.L.sketches.push({ x, y, r });
    return this;
  }

  arcade(x0: number, x1: number) {
    this.L.arcades.push({ x0, x1 });
    return this;
  }

  finish(length: number, parTime: number, parInk: number): Level {
    this.L.length = length;
    this.L.start = { x: 120, y: this.gy(120) };
    this.L.parTime = parTime;
    this.L.parInk = parInk;
    return this.L;
  }
}
