import { INK_COST, IS_TOUCH } from './config';
import { inkKey, keyLabel } from './keys';
import { LevelBuilder, type BeatStat, type DecorKind, type HanabiDef, type Level, type RaijinDef, type SkyId, type ThemeId } from './level';
import { mulberry32, pick, range, type RNG } from './rng';

export interface LevelInfo {
  id: string;
  name: string;
  kanji: string;
  theme: ThemeId;
  blurb: string;
  build: () => Level;
}

// ─────────────────────────────────────────────────────────────── I. The First Scroll

function buildFirst(): Level {
  const b = new LevelBuilder('first', 'The First Scroll', '一', 'spring', 11);

  // Awakening
  b.island(0, 1500, 540);
  b.hint(330, 300, 'The world is ink.', '墨');
  b.hint(820, 340, 'Your brush is the only color.');
  b.hint(1260, 390, IS_TOUCH ? 'Tap 跳 to jump' : 'SPACE  ·  jump');
  b.island(1690, 2900, 540);
  b.lantern(1840);
  b.hint(2160, 300, IS_TOUCH ? 'Paint with your finger. Time slows while you do.' : 'Hold the mouse to paint. Time slows while you do.', '朱');
  b.hint(2600, 410, 'Vermilion becomes solid ground.');

  // The cliff
  b.island(3450, 4520, 540, 548);
  b.lantern(3600);
  b.hint(3980, 330, 'Too high to jump? Paint a ramp.');
  b.island(4520, 5900, 318, 330, 5);

  // Indigo
  b.island(5900, 6800, 560);
  b.lantern(6080);
  b.hint(6330, 330, IS_TOUCH ? 'Tap 藍 for Indigo. Paint a current, then ride it.' : `Press ${keyLabel(inkKey('ai'))} for Indigo. Paint a current, then ride it.`, '藍');
  b.island(7050, 8450, 238, 250, 5);
  b.lantern(7200);
  b.hint(7420, 70, 'Indigo quenches fire.');
  b.fire(7760, 170, 150);

  // Gold
  b.island(8450, 9950, 480);
  b.lantern(8620);
  b.hint(8880, 250, IS_TOUCH ? 'Tap 金 for Gold. Its light dispels shadow.' : `Press ${keyLabel(inkKey('kin'))} for Gold. Its light dispels shadow.`, '金');
  b.yokai(9260, 400, 34, 50);
  b.bramble(9660, 84, 270);
  b.yokai(10200, 380, 30, 70, 30);

  // The trial
  b.island(10450, 11350, 500);
  b.lantern(10520);
  b.fire(10850, 230, 160);
  b.island(11350, 12450, 280, 288, 5);
  b.yokai(11560, 190, 30, 30);
  b.bramble(12060, 84, 260);
  b.yokai(12850, 350, 36, 90, 20, 1.1);
  b.island(13250, 15400, 520, 430, 6);
  b.lantern(13360);
  b.fire(13820, 200, 150);
  b.hint(14260, 210, 'The last gate waits.');
  b.torii(14700);

  const D: [DecorKind, number, number, boolean?][] = [
    ['pine', 160, 1.15], ['rock', 520, 0.9], ['reeds', 1420, 1], ['pine', 1080, 0.75, true], ['reeds', 1760, 0.8],
    ['maple', 2050, 0.9, true], ['bamboo', 2780, 1], ['rock', 3520, 1.2], ['pine', 3800, 0.9], ['bamboo', 4420, 0.8],
    ['pine', 5080, 1.25, true], ['rock', 5500, 0.8], ['reeds', 5830, 0.9], ['maple', 5980, 0.8], ['bamboo', 6680, 1.1],
    ['pine', 7120, 0.85], ['rock', 8250, 1], ['pine', 8350, 1.05, true], ['reeds', 8540, 0.9], ['maple', 9000, 1],
    ['bamboo', 9880, 0.9], ['pine', 10600, 0.9, true], ['rock', 11200, 0.9], ['pine', 11420, 0.8],
    ['maple', 11800, 1.1, true], ['bamboo', 12380, 1], ['reeds', 13300, 1], ['pine', 13560, 1.1], ['rock', 14150, 1.1],
    ['maple', 14420, 0.9, true], ['pine', 15050, 1.3, true],
  ];
  for (const [k, x, s, f] of D) b.decor(k, x, s, !!f);
  return b.finish(15400, 62, 250);
}

// ─────────────────────────────────────────────────────────────── course builder

interface Span {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** laid with no bump (the Raijin arena: the wrap needs the same ground height everywhere) */
  flat?: boolean;
}

const DECOR_WEIGHTS: Record<ThemeId, [DecorKind, number][]> = {
  spring: [['pine', 3], ['maple', 3], ['bamboo', 2], ['rock', 2], ['reeds', 2]],
  snow: [['pine', 6], ['bamboo', 2], ['rock', 2], ['reeds', 1]],
  sea: [['pine', 4], ['rock', 5], ['reeds', 1]],
  summer: [['pine', 2], ['bamboo', 3], ['reeds', 3], ['rock', 2], ['maple', 1]],
};

/** Options for Course.spark() and Course.bolt() (N6). */
export interface StrikeOpts {
  /** a demonstration: it lands this many seconds before a full-speed traveler reaches the mark (not counted) */
  landsEarly?: number;
  /** repeat every `loop` game seconds while the traveler is past the trigger (not counted) */
  loop?: number;
  /** put the trigger at cursor + `after` instead of mark - runSpeed x (tele + landsEarly) */
  after?: number;
  /** telegraph seconds (spark 1.5, bolt 1.2; never under 1.0) */
  tele?: number;
  /** counts as an obstacle (default: true unless landsEarly or loop is set) */
  count?: boolean;
}

/** Spark and bolt telegraphs (summer-design 3.2, 3.4). */
export const SPARK_TELE = 1.5;
export const BOLT_TELE = 1.2;
/** Par time per obstacle (N1): a terrain obstacle stops you; a strike does not. */
export const PAR_TERRAIN = 1.2;
export const PAR_STRIKE = 0.3;
/** A gap counts as an obstacle when it is wider than a flat full jump: 0.78 s of air x run speed. */
export const JUMP_AIR = 0.78;

/** Par time and par ink from a course's counts (N1): pure, so tools/tests can check it. */
export function parOf(length: number, runSpeed: number, terrain: number, strikes: number, ink: number, refund: number) {
  return {
    parTime: length / runSpeed + terrain * PAR_TERRAIN + strikes * PAR_STRIKE + 4,
    parInk: Math.round(Math.max(0, ink - refund) * 1.1 + 20),
  };
}

interface Beat {
  label: string;
  x: number;
  /** ink the primitives estimated, and the beat's own override (the intended line's gross ink) */
  auto: number;
  over: number | null;
  refund: number;
  terrain: number;
  strikes: number;
}

/**
 * A cursor-driven course: beats extend the ground to the right, and hazards
 * are resolved once all islands exist. Call `b.rules({...})` before laying beats: gaps, strikes and par read
 * the scroll's run speed.
 */
export class Course {
  b: LevelBuilder;
  x = 0;
  y: number;
  private segX = 0;
  private segY: number;
  private spans: Span[] = [];
  private pending: (() => void)[] = [];
  private keepClear: [number, number][] = [];
  /** the open segment is laid dead flat (set by arena(), cleared when the next segment opens) */
  private segFlat = false;
  private raijinDef: RaijinDef | null = null;
  /** terrain obstacles + strikes (kept for older callers) */
  obstacles = 0;
  private terrainN = 0;
  private strikeN = 0;
  private minTele = Infinity;
  private beats: Beat[] = [];
  private rainFrom: number | null = null;
  private festoonDips: { x: number; depth: number }[] = [];

  constructor(
    b: LevelBuilder,
    y0: number,
    public r: RNG,
  ) {
    this.b = b;
    this.y = this.segY = y0;
  }

  /** gross ink of every beat's intended line so far */
  get ink() {
    return this.beats.reduce((a, bt) => a + (bt.over ?? bt.auto), 0);
  }

  private get speed() {
    return this.b.L.rules.runSpeed;
  }

  private beatNow(): Beat {
    if (!this.beats.length) this.beats.push({ label: 'start', x: 0, auto: 0, over: null, refund: 0, terrain: 0, strikes: 0 });
    return this.beats[this.beats.length - 1];
  }

  /** Count an obstacle and the ink its plain answer costs (N1). */
  private count(kind: 'terrain' | 'strike', ink: number, refund = 0) {
    const bt = this.beatNow();
    if (kind === 'terrain') {
      this.terrainN++;
      bt.terrain++;
    } else {
      this.strikeN++;
      bt.strikes++;
    }
    this.obstacles++;
    bt.auto += ink;
    bt.refund += refund;
  }

  /**
   * Start a named beat (N14): the obstacles laid after it, until the next beat(), belong to it. `ink` overrides
   * the primitives' estimate with the intended line's gross ink; `refund` is what its echo refunds return (+15
   * each). Par ink = 1.1 x (sum of ink - sum of refund) + 20. The ramp report prints every beat.
   */
  beat(label: string, opts: { ink?: number; refund?: number } = {}) {
    this.beats.push({ label, x: this.x, auto: 0, over: opts.ink ?? null, refund: opts.refund ?? 0, terrain: 0, strikes: 0 });
    return this;
  }

  private close(y1 = this.y) {
    if (this.x - this.segX > 20) this.spans.push({ x0: this.segX, x1: this.x, y0: this.segY, y1, flat: this.segFlat });
  }

  private open() {
    this.segX = this.x;
    this.segY = this.y;
    this.segFlat = false;
  }

  run(len: number) {
    this.x += len;
    return this;
  }

  /** gentle incline within the ground itself */
  slope(len: number, dy: number) {
    this.close();
    this.open();
    this.x += len;
    this.y += dy;
    this.close(this.y);
    this.open();
    return this;
  }

  gap(w: number, dy = 0) {
    this.close();
    this.keepClear.push([this.x - 80, this.x + w + 80]);
    this.x += w;
    this.y += dy;
    this.open();
    if (w > JUMP_AIR * this.speed) this.count('terrain', Math.hypot(w, dy) * 1.15 * INK_COST);
    return this;
  }

  up(rise: number) {
    this.close();
    this.keepClear.push([this.x - 300, this.x + 60]);
    this.y -= rise;
    this.open();
    this.count('terrain', rise * 1.6 * INK_COST);
    return this;
  }

  down(drop: number) {
    this.close();
    this.y += drop;
    this.open();
    return this;
  }

  fire(w = 180, h = 150) {
    const fx = this.x + 80;
    this.pending.push(() => this.b.fire(fx, w, h));
    this.keepClear.push([fx - 80, fx + w + 80]);
    this.x += w + 320;
    this.count('terrain', 9);
    return this;
  }

  bramble(h = 260) {
    const bx = this.x + 90;
    this.pending.push(() => this.b.bramble(bx, 84, h));
    this.keepClear.push([bx - 90, bx + 170]);
    this.x += 340;
    this.count('terrain', 6);
    return this;
  }

  /** a yokai hovering `above` units over the current ground, `dx` ahead of the cursor (`count: false` for decor-like demos) */
  yokai(dx: number, above = 150, r = 32, ampY = 50, ampX = 0, opts: { count?: boolean } = {}) {
    const yx = this.x + dx;
    const yy = this.y - above;
    this.pending.push(() => this.b.yokai(yx, yy, r, ampY, ampX, range(this.r, 1.0, 1.6)));
    if (opts.count ?? true) this.count('terrain', 5);
    return this;
  }

  /**
   * A blot pillar (N5): a 墨 column `h` tall that nothing but a portal gets past. It closes the ground
   * span, keeps decor 120 u clear each side and (unless `count` is false) counts one obstacle priced
   * like a ring pair (41 ink).
   */
  pillar(w = 140, opts: { h?: number; count?: boolean } = {}) {
    const h = opts.h ?? 900;
    this.close();
    const px = this.x;
    const top = this.y - h;
    this.pending.push(() => this.b.pillar(px, w, top));
    this.keepClear.push([px - 120, px + w + 120]);
    this.x += w;
    this.open();
    if (opts.count ?? true) this.count('terrain', 41);
    return this;
  }

  /**
   * Her pre-painted rings (N18): a fixed linked pair. `a` and `b` are offsets from the cursor
   * (`dx` ahead, `above` the current ground); aims are spout angles in degrees (0 right, -90 up).
   */
  herRings(
    a: { dx: number; above: number },
    b: { dx: number; above: number },
    opts: { r?: number; aimA?: number; aimB?: number; aimAt?: { dx: number; above: number } } = {},
  ) {
    const pa = { x: this.x + a.dx, y: this.y - a.above };
    const pb = { x: this.x + b.dx, y: this.y - b.above };
    // aimAt: B's spout points at that spot (cursor-relative), e.g. a yokai her pair should send a spark into
    const at = opts.aimAt ? { x: this.x + opts.aimAt.dx, y: this.y - opts.aimAt.above } : null;
    const aimB = at ? (Math.atan2(at.y - pb.y, at.x - pb.x) * 180) / Math.PI : (opts.aimB ?? 0);
    this.pending.push(() => this.b.herRings(pa, pb, opts.r ?? 55, opts.aimA ?? 0, aimB));
    return this;
  }

  lantern() {
    const lx = this.x + 40;
    this.pending.push(() => this.b.lantern(lx));
    this.keepClear.push([lx - 50, lx + 50]);
    this.x += 120;
    return this;
  }

  /** Raijin's entrance (N11): he paints himself into the storm when the traveler passes `dx` ahead of the cursor. */
  raijin(dx = 0) {
    const enterX = this.x + dx;
    if (this.raijinDef) this.raijinDef.enterX = enterX;
    else this.raijinDef = { groundY: this.y, enterX, drums: 8, phases: [] };
    return this;
  }

  /**
   * One Raijin phase as a loop on flat road (N11, docs/summer-design.md 4.4 and 4.5). The loop starts at the
   * cursor: a flat seam with the phase lantern at +1500, strike groups at `marks` (loop-relative), `gaps`
   * ([dx, width], loop-relative, never under a strike), and a flat tail. The segment the cursor is on is laid
   * dead flat, and so is the road after the loop (the next phase's seam) until the next beat closes it, so
   * the wrap (the traveler shifted back one loop) lands on the same ground. Bolts in a group are `spacing` u
   * apart (default run speed x `within` s), each telegraphed `tele` s: position-triggered at mark - speed x tele.
   */
  arena(
    n: number,
    o: {
      length: number;
      tele: number;
      hits: number;
      marks: number[];
      pattern?: 'single' | 'pair' | 'triplet';
      within?: number;
      spacing?: number;
      gaps?: [number, number][];
      sweep?: [number, number];
      bob?: number;
      low?: boolean;
    },
  ) {
    if (!this.raijinDef) this.raijin(0);
    const def = this.raijinDef!;
    const x0 = this.x;
    const y = this.y;
    const pattern = o.pattern ?? 'single';
    const count = pattern === 'triplet' ? 3 : pattern === 'pair' ? 2 : 1;
    const speed = this.b.L.rules.runSpeed;
    const spacing = o.spacing ?? speed * (o.within ?? 0);
    this.segFlat = true;
    for (const [gx, gw] of [...(o.gaps ?? [])].sort((a, b) => a[0] - b[0])) {
      // an arena gap is terrain to answer like any other (N1): it counts toward par and the ramp
      if (gw > JUMP_AIR * speed) this.count('terrain', gw * 1.15 * INK_COST);
      this.x = x0 + gx;
      this.close();
      this.x += gw;
      this.open();
      this.segFlat = true;
    }
    this.x = x0 + o.length;
    this.segFlat = true;
    const lantern = x0 + 1500;
    this.pending.push(() => this.b.lantern(lantern));
    this.keepClear.push([x0 - 700, x0 + o.length + 1800]);
    def.phases.push({
      n,
      x0,
      length: o.length,
      hits: o.hits,
      lantern,
      pattern,
      sweep: o.sweep ?? [0.7, 0.7],
      bob: o.bob ?? 10,
      // his ring (radius 104 + a 16 u drum) must stay on screen at the top of his bob: the view shows 440 u above
      // the road (4.1), so the top of the bob is held to 300 u up (280 when he sits low), 24 u clear of the edge
      above: (o.low ? 280 : 300) - (o.bob ?? 10),
      strikes: o.marks.flatMap((m, group) => Array.from({ length: count }, (_, idx) => ({ mark: x0 + m + idx * spacing, tele: Math.max(1, o.tele), group, idx }))),
    });
    def.groundY = y;
    // each bolt of a first pass is a strike to answer (N1, 5.1); the gate's beats set their ink with beat()
    for (let i = 0; i < o.marks.length * count; i++) this.count('strike', 0);
    if (o.marks.length) this.minTele = Math.min(this.minTele, Math.max(1, o.tele));
    return this;
  }

  // ───────────────────────────────────────────── Summer beats (N6, N8, N13)

  /**
   * A hanabi spark (N6): from 600 u above a mark `dx` ahead of the cursor it falls at 600/tele u/s (400 at the
   * default 1.5 s) onto an ink circle that fills with orange, splashes fire 80 x 60 for 0.35 s, and can be caught
   * by a ring. Triggered by position at mark - runSpeed x (tele + landsEarly). Doesn't move the cursor.
   */
  spark(dx: number, opts: StrikeOpts = {}) {
    return this.strike('spark', dx, opts);
  }

  /**
   * A stray bolt (N6): a 1.2 s telegraph (mark, a thread from the cloud), then a 40 u column for 0.2 s that kills
   * at any height. A vermilion stroke overhead stops it (and shatters); a ring catches it. Doesn't move the cursor.
   */
  bolt(dx: number, opts: StrikeOpts = {}) {
    return this.strike('bolt', dx, opts);
  }

  private strike(kind: 'spark' | 'bolt', dx: number, o: StrikeOpts) {
    const mark = this.x + dx;
    const tele = Math.max(1, o.tele ?? (kind === 'spark' ? SPARK_TELE : BOLT_TELE));
    const trigger = o.after !== undefined ? this.x + o.after : mark - this.speed * (tele + (o.landsEarly ?? 0));
    const loop = o.loop;
    this.pending.push(() => this.b.strike(kind, mark, tele, trigger, loop));
    this.keepClear.push([mark - 70, mark + 70]);
    if (o.count ?? (o.landsEarly === undefined && o.loop === undefined)) {
      this.count('strike', 0);
      this.minTele = Math.min(this.minTele, tele);
    }
    return this;
  }

  /** Rain on or off from the cursor (N8): records a rain zone [on x, off x]. The clock is `rules({ rain })`. */
  rain(on = true) {
    if (on && this.rainFrom === null) this.rainFrom = this.x;
    else if (!on && this.rainFrom !== null) {
      if (this.x > this.rainFrom) this.b.rain(this.rainFrom, this.x);
      this.rainFrom = null;
    }
    return this;
  }

  /** The sky (N13): before any ground is laid it is the scroll's sky; later it changes as the traveler passes cursor + dx. */
  sky(sky: SkyId, dx = 0) {
    if (this.x === 0 && dx === 0) this.b.sky(sky);
    else this.b.sky(sky, this.x + dx);
    return this;
  }

  /** A festival lantern line from cursor + dx0 to cursor + dx1 (N13), with an optional dip of `dip` u in its middle. */
  festoon(dx0: number, dx1: number, opts: { dip?: number } = {}) {
    const x0 = this.x + dx0;
    const x1 = this.x + dx1;
    const dips = opts.dip ? [{ x: (x0 + x1) / 2, depth: opts.dip }] : [];
    this.pending.push(() => this.b.festoon(x0, x1, dips));
    return this;
  }

  /** The lantern line sags `depth` u at cursor + dx (a wordless "catch here" signpost). Needs a festoon over that x. */
  dip(dx: number, depth = 120) {
    this.festoonDips.push({ x: this.x + dx, depth });
    return this;
  }

  /** A firework (N13) triggered when the traveler reaches cursor + dx. Doesn't move the cursor. */
  hanabi(dx = 0, size: HanabiDef['size'] = 'small') {
    const x = this.x + dx;
    this.pending.push(() => this.b.hanabi(x, size));
    return this;
  }

  /** A background lightning flash at cursor + dx (N13, through the flash limiter N19); `raijin` shows his drums. */
  flash(dx = 0, opts: { raijin?: boolean } = {}) {
    this.b.flash(this.x + dx, !!opts.raijin);
    return this;
  }

  /** A faint traced ring (the master's sketch) at cursor + dx, `above` the current ground. Decor only. */
  sketch(dx: number, above: number, r = 50) {
    this.b.sketch(this.x + dx, this.y - above, r);
    return this;
  }

  /** Stall-arcade eaves over [cursor + dx, cursor + dx + len] (decor only, no collision). Doesn't move the cursor. */
  arcade(len: number, dx = 0) {
    this.b.arcade(this.x + dx, this.x + dx + len);
    return this;
  }

  hint(dx: number, above: number, text: string, kanji?: string) {
    const hx = this.x + dx;
    const hy = this.y - above;
    this.pending.push(() => this.b.hint(hx, hy, text, kanji));
    return this;
  }

  end(theme: ThemeId): Level {
    this.run(560);
    const tx = this.x;
    this.keepClear.push([tx - 160, tx + 160]);
    this.run(760);
    this.close();
    this.rain(false);
    for (const s of this.spans) this.b.island(s.x0, s.x1, s.y0, s.y1, s.flat ? 0 : s.y0 === s.y1 ? 7 : 4);
    for (const p of this.pending) p();
    this.b.torii(tx);
    if (this.raijinDef) this.b.L.raijin = this.raijinDef;
    // dips hang from whichever lantern line runs over them
    for (const d of this.festoonDips) this.b.L.festoons.find((f) => d.x >= f.x0 && d.x <= f.x1)?.dips.push(d);
    // scatter decor on open ground
    const weights = DECOR_WEIGHTS[theme];
    const total = weights.reduce((a, w) => a + w[1], 0);
    for (const s of this.spans) {
      let x = s.x0 + range(this.r, 40, 200);
      while (x < s.x1 - 40) {
        const clear = !this.keepClear.some(([a, b]) => x > a && x < b) && x > 260;
        if (clear) {
          let roll = this.r() * total;
          let kind: DecorKind = weights[0][0];
          for (const [k, w] of weights) {
            if ((roll -= w) <= 0) {
              kind = k;
              break;
            }
          }
          this.b.decor(kind, x, range(this.r, 0.75, 1.2), this.r() < 0.5);
        }
        x += range(this.r, 280, 620);
      }
    }
    const length = this.x;
    const ink = this.ink;
    const refund = this.beats.reduce((a, bt) => a + bt.refund, 0);
    const par = parOf(length, this.speed, this.terrainN, this.strikeN, ink, refund);
    const beats: BeatStat[] = this.beats.map((bt) => ({ label: bt.label, x: bt.x, ink: bt.over ?? bt.auto, refund: bt.refund, terrain: bt.terrain, strikes: bt.strikes }));
    this.b.L.course = { terrain: this.terrainN, strikes: this.strikeN, ink, refund, minTele: this.minTele, beats };
    return this.b.finish(length, par.parTime, par.parInk);
  }
}

// ─────────────────────────────────────────────────────────────── II. The Snow Pass

function buildSnow(): Level {
  const b = new LevelBuilder('snow', 'The Snow Pass', '雪', 'snow', 501);
  const c = new Course(b, 520, mulberry32(501));
  c.hint(420, 230, 'The Snow Pass', '雪').run(1300);
  c.gap(190).run(500).lantern();
  c.gap(560).run(360);
  c.up(230).run(300).yokai(260, 120, 30, 40).run(600);
  c.down(190).run(260).lantern();
  c.gap(600).yokai(-300, 120, 32, 70, 20).run(420);
  c.bramble().run(200).lantern();
  c.up(300).run(400).fire(170, 140).run(200);
  c.gap(760, 200).lantern();
  c.run(200).up(220).run(200).bramble(240).run(200);
  c.gap(520).yokai(-380, 160, 28, 60).yokai(-140, 90, 28, 60).run(300).lantern();
  c.slope(500, -60).run(200);
  return c.end('snow');
}

// ─────────────────────────────────────────────────────────────── III. The Wave Road

function buildSea(): Level {
  const b = new LevelBuilder('sea', 'The Wave Road', '波', 'sea', 777);
  const c = new Course(b, 540, mulberry32(777));
  c.hint(420, 240, 'The Wave Road', '波').run(1200);
  c.gap(200).run(420).gap(220).run(500).lantern();
  c.gap(620, -40).run(500);
  c.gap(480, -120).run(300).fire(190, 150).run(100).lantern();
  c.gap(700, 160).run(260).yokai(160, 130, 30, 50).run(400);
  c.up(260).run(420).gap(560).run(200).lantern();
  c.gap(820, 80).yokai(-420, 140, 34, 80, 30).run(320).bramble().run(100);
  c.gap(240).run(300).up(180).run(260).fire(200, 150).lantern();
  c.gap(900, 120).yokai(-600, 120, 30, 60).yokai(-260, 200, 30, 50, 30).run(500);
  c.slope(600, -70).run(200);
  return c.end('sea');
}

// ─────────────────────────────────────────────────────────────── IV. Today's Scroll

export function dateKey(d = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function buildDaily(key: string): Level {
  const seed = hashStr('inkrunner:' + key);
  const r = mulberry32(seed);
  const theme = pick<ThemeId>(r, ['spring', 'snow', 'sea']);
  const [yy, mm, dd] = key.split('-').map(Number);
  const b = new LevelBuilder('daily-' + key, "Today's Scroll", '今', theme, seed % 100000);
  const c = new Course(b, theme === 'sea' ? 540 : 520, r);
  c.hint(420, 230, `The scroll of ${MONTHS[mm - 1]} ${dd}, ${yy}`, '今').run(1300);

  type BeatFn = () => void;
  const lo = 280;
  const hi = 600;
  const beats: [BeatFn, number][] = [
    [() => c.gap(range(r, 150, 210)).run(range(r, 300, 500)), 2],
    [() => c.gap(range(r, 420, 680)).run(range(r, 300, 500)), 4],
    [() => (c.y - 230 > lo ? c.up(range(r, 200, 280)).run(range(r, 400, 700)) : c.down(180).run(300)), 3],
    [() => (c.y + 220 < hi ? c.down(range(r, 150, 220)).run(range(r, 300, 500)) : c.run(300)), 1],
    [() => c.fire(range(r, 160, 230), range(r, 130, 165)).run(200), 3],
    [() => c.run(200).yokai(range(r, 80, 200), range(r, 70, 150), range(r, 28, 36), range(r, 30, 80)).run(500), 3],
    [() => c.bramble(range(r, 230, 280)).run(200), 2],
    [() => c.gap(range(r, 480, 640)).yokai(-range(r, 200, 380), range(r, 90, 170), 30, 60, 20).run(400), 2],
    [() => (c.y - 320 > lo - 60 ? c.up(range(r, 290, 330)).run(300).fire(170, 140) : c.gap(500)).run(200), 1],
    [() => c.gap(range(r, 720, 860), range(r, -40, 80)).run(400), 1],
  ];
  const total = beats.reduce((a, b) => a + b[1], 0);
  const n = 12 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    let roll = r() * total;
    for (const [fn, w] of beats) {
      if ((roll -= w) <= 0) {
        fn();
        break;
      }
    }
    if (i % 3 === 2) c.lantern();
  }
  return c.end(theme);
}

export function levelList(): LevelInfo[] {
  const key = dateKey();
  return [
    { id: 'first', name: 'The First Scroll', kanji: '一', theme: 'spring', blurb: 'Learn the three inks.', build: buildFirst },
    { id: 'snow', name: 'The Snow Pass', kanji: '雪', theme: 'snow', blurb: 'A cold climb through pines.', build: buildSnow },
    { id: 'sea', name: 'The Wave Road', kanji: '波', theme: 'sea', blurb: 'Islands over a hungry sea.', build: buildSea },
    {
      id: 'daily-' + key,
      name: "Today's Scroll",
      kanji: '今',
      theme: buildDaily(key).theme,
      blurb: 'A new scroll every day.',
      build: () => buildDaily(key),
    },
  ];
}
