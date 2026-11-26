/**
 * Telegraphed strikes (docs/summer-design.md 3.0.1, 3.2, 3.4; N6): the hanabi spark of 承 and the stray bolt of 結.
 *
 * A strike is laid by `Course.spark(dx, opts)` / `Course.bolt(dx, opts)` into `Level.strikes`. Here it lives:
 *
 * - **Position-triggered.** When the traveler passes `trigger` (or is already past it: a door or a current that
 *   carries you over the trigger still triggers it, and the strike then lands behind you) the telegraph starts.
 * - **The telegraph clock** runs in game time (slow motion slows it with the traveler, so the sync holds) and
 *   **pauses while the traveler is stopped against a wall** (`stuckT > 0`) with the mark still ahead, so stalling
 *   never makes a strike land where you can't answer it. Looping strikes (承 S2's sandbox) never pause.
 * - **Spark:** at the telegraph's start a shell bursts 600 u above the mark and one heavy ember falls straight down
 *   at 600 / tele u/s (400 at 1.5 s), landing exactly at T. It is a real projectile (Portals.spawn), so a ring
 *   catches it and sends it on along the spout (the echo refund applies to what it then destroys). The mark (an
 *   80 u ink circle) fills with orange over the telegraph; a dotted ember trail joins the burst to the mark. At
 *   impact it splashes fire 80 wide and 60 tall for 0.35 s, which kills. Vermilion overhead burns it out; indigo
 *   puts it out. The falling ember kills on contact.
 * - **Bolt:** a 1.2 s telegraph (the mark, a thread from the cloud), then in the last 0.18 s the bolt drops at
 *   2,400 u/s (a real projectile: rings catch it), and lands as a 40 u column for 0.2 s that kills at any height,
 *   after a 0.15 s hit-stop. Vermilion overhead stops it and shatters. Impacts ask the flash limiter for a sky flash
 *   (one per strike group).
 * - **Deaths:** on respawn every strike whose mark is still ahead is re-armed (a live one is called off first).
 *
 * Pure helpers (`strikeTrigger`, `teleStep`, `sparkFall`) are exported for tools/tests and for Raijin's own strikes.
 */
import { PLAYER_H, PLAYER_HW } from '../config';
import type { Game, State } from '../game';
import type { StrikeDef } from '../level';
import { drawEmberTrail, drawFire, drawSparkBurst, drawSparkMark } from '../render/hazards';
import { drawImpact, drawMark, drawScorch, drawThread } from '../render/raijin';
import type { Stroke } from '../strokes';
import { flashLimiter } from './flash';
import type { Projectile } from './portals';

/** A spark falls this far onto its mark, over the whole telegraph. */
export const SPARK_DROP = 600;
/** The splash a landed spark leaves: kills for SPLASH_T s in an 80 x 60 box on the mark. */
export const SPLASH_W = 80;
export const SPLASH_H = 60;
export const SPLASH_T = 0.35;
/** The falling spark's hit radius. */
export const SPARK_R = 16;
/** Bolt speed (and the thread's length is its last 0.18 s of fall). */
export const STRAY_BOLT_SPEED = 2400;
export const STRAY_DROP = 432;
/** The bolt's lethal column, half-width, and how long it kills. */
export const STRAY_COLUMN_HW = 20;
export const STRAY_COLUMN_T = 0.2;
/** The hit-stop before a struck traveler dies (bolts only). */
export const STRAY_HIT_STOP = 0.15;
/** A looping strike stops once the traveler is this far past its mark. */
const LOOP_RANGE = 1800;
/** Strikes landing within this many seconds of each other (at run speed) share one sky flash. */
const GROUP_WINDOW = 1.2;

// ───────────────────────────────────────────── pure helpers (tested in tools/tests/strikes.test.mjs)

/** Where the telegraph starts for a full-speed traveler to reach the mark `landsEarly` s after impact. */
export function strikeTrigger(mark: number, runSpeed: number, tele: number, landsEarly = 0): number {
  return mark - runSpeed * (Math.max(1, tele) + landsEarly);
}

/**
 * Advance a telegraph clock by `dt` game seconds. It holds while the traveler is stuck at a wall with the mark
 * still ahead (unless the strike loops).
 */
export function teleStep(el: number, dt: number, stuck: boolean, markAhead: boolean, loops = false): number {
  return stuck && markAhead && !loops ? el : el + dt;
}

/** The spark's height above its mark after `el` of a `tele` s telegraph (SPARK_DROP at 0, 0 at T, below after). */
export function sparkFall(el: number, tele: number): number {
  return SPARK_DROP * (1 - Math.max(0, el) / tele);
}

// ───────────────────────────────────────────── the system

export type StrikeState = 'armed' | 'tele' | 'drop' | 'landed' | 'caught' | 'blocked' | 'done';

export interface LiveStrike {
  id: number;
  def: StrikeDef;
  state: StrikeState;
  /** telegraph clock, game seconds (pauses while stuck) */
  el: number;
  /** game and real time the telegraph started */
  t0: number;
  r0: number;
  proj: Projectile | null;
  /** seconds since it landed, was caught or was blocked */
  age: number;
  seed: number;
  /** stage cues already played */
  cue: number;
  /** strike group (for one shared flash) */
  group: number;
  /** times it has fired (loops) */
  shots: number;
  /** scorches left on the road (x, age) */
  scorch: number;
}

export interface StrikeEvent {
  seq: number;
  t: number;
  realT: number;
  kind: 'tele' | 'drop' | 'impact' | 'caught' | 'blocked' | 'kill' | 'rearm' | 'flash';
  [k: string]: unknown;
}

const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

export class Strikes {
  list: LiveStrike[] = [];
  events: StrikeEvent[] = [];
  private seq = 1;
  private prevState: State = 'menu';

  constructor(private g: Game) {}

  /** A scroll was loaded (after portals.reset). */
  reset() {
    const defs = this.g.level.strikes ?? [];
    this.events = [];
    this.prevState = 'play';
    // groups: strikes whose triggers fall within GROUP_WINDOW s of run of each other
    const speed = this.g.level.rules.runSpeed;
    const order = defs.map((d, i) => ({ d, i })).sort((a, b) => a.d.trigger - b.d.trigger);
    const groupOf = new Map<number, number>();
    let group = 0;
    let last = -Infinity;
    for (const { d, i } of order) {
      if (d.trigger - last > speed * GROUP_WINDOW) group++;
      last = d.trigger;
      groupOf.set(i, group);
    }
    this.list = defs.map((def, i) => ({ id: i + 1, def, state: 'armed', el: 0, t0: 0, r0: 0, proj: null, age: 0, seed: (def.mark * 7.13) % 997, cue: 0, group: groupOf.get(i) ?? 0, shots: 0, scorch: -1 }));
  }

  private log(e: Omit<StrikeEvent, 'seq' | 't' | 'realT'>) {
    this.events.push({ seq: this.seq++, t: this.g.t, realT: this.g.realT, ...e } as StrikeEvent);
    if (this.events.length > 300) this.events.splice(0, this.events.length - 300);
  }

  /** Once per frame, before the portals move projectiles (so a paused spark holds still this frame). */
  update(dt: number) {
    const g = this.g;
    if (!this.list.length || g.state === 'menu') {
      this.prevState = g.state;
      return;
    }
    if (this.prevState === 'dying' && g.state === 'play') this.onRespawn();
    this.prevState = g.state;
    for (const s of this.list) this.step(s, dt);
  }

  private step(s: LiveStrike, dt: number) {
    const g = this.g;
    const d = s.def;
    if (s.scorch >= 0) s.scorch += dt;
    switch (s.state) {
      case 'armed':
        if (g.state !== 'play' || g.px < d.trigger) return;
        if (!d.loop && g.px > d.mark + 1500) {
          s.state = 'done';
          return;
        }
        this.fire(s);
        return;
      case 'tele':
      case 'drop': {
        const stuck = g.stuckT > 0 && g.state === 'play';
        const ahead = d.mark + PLAYER_HW + SPLASH_W / 2 > g.px;
        const before = s.el;
        s.el = teleStep(s.el, dt, stuck, ahead, !!d.loop);
        const held = near(before, s.el) && dt > 0;
        if (d.kind === 'spark') this.stepSpark(s, held, dt);
        else this.stepBolt(s);
        return;
      }
      case 'landed':
        s.age += dt;
        if (d.kind === 'spark' ? s.age < SPLASH_T : s.age < STRAY_COLUMN_T) this.lethal(s);
        this.maybeLoop(s);
        return;
      case 'caught':
      case 'blocked':
        s.age += dt;
        this.maybeLoop(s);
        return;
    }
  }

  /** Start the telegraph. */
  private fire(s: LiveStrike) {
    const g = this.g;
    const d = s.def;
    s.state = 'tele';
    s.el = 0;
    s.t0 = g.t;
    s.r0 = g.realT;
    s.cue = 0;
    s.age = 0;
    s.shots++;
    s.proj = null;
    if (d.kind === 'spark') {
      // the shell bursts high over the mark and its ember starts to fall at once (it is catchable all the way)
      s.proj = g.portals.spawn({
        kind: 'spark',
        x: d.mark,
        y: d.groundY - SPARK_DROP,
        vx: 0,
        vy: SPARK_DROP / d.tele,
        r: SPARK_R,
        life: d.tele + 2,
        harms: true,
        data: s,
        onPass: () => this.onCaught(s),
        onEnd: (p, why, st) => this.onSparkEnd(s, p, why, st),
      });
      g.audio.festivalFx('whistle', this.pan(d.mark));
    } else {
      g.audio.raijinFx('don', this.pan(d.mark) * 0.6);
    }
    this.log({ kind: 'tele', id: s.id, what: d.kind, mark: d.mark, tele: d.tele, px: g.px, trigger: d.trigger });
  }

  private pan(x: number) {
    const g = this.g;
    const viewW = g.W / g.S || 1280;
    return Math.max(-1, Math.min(1, ((x - g.camCX) / viewW) * 1.6));
  }

  /** The spark rides its telegraph clock until a ring catches it. */
  private stepSpark(s: LiveStrike, held: boolean, dt: number) {
    const p = s.proj;
    if (!p || p.dead || p.fromRing) return;
    const v = SPARK_DROP / s.def.tele;
    p.x = s.def.mark;
    p.life = s.def.tele + 2;
    // place it where the clock says, minus the step the portals are about to apply this frame
    p.vy = held ? 0 : v;
    p.y = s.def.groundY - sparkFall(s.el, s.def.tele) - (held ? 0 : v * dt);
    if (s.cue < 1 && s.el >= s.def.tele - 0.45) {
      s.cue = 1;
      this.g.audio.festivalFx('hiss', this.pan(s.def.mark));
    }
  }

  private stepBolt(s: LiveStrike) {
    const g = this.g;
    const d = s.def;
    if (s.cue < 1 && s.el >= 0.3) {
      s.cue = 1;
      g.audio.raijinFx('crackle', this.pan(d.mark) * 0.6);
    }
    if (s.state === 'tele' && s.el >= d.tele - STRAY_DROP / STRAY_BOLT_SPEED) {
      // placed where it would be had it left on the exact instant, so it lands at T to the frame
      const late = Math.max(0, s.el - (d.tele - STRAY_DROP / STRAY_BOLT_SPEED));
      s.state = 'drop';
      s.proj = g.portals.spawn({
        kind: 'bolt',
        x: d.mark,
        y: d.groundY - STRAY_DROP + late * STRAY_BOLT_SPEED,
        vx: 0,
        vy: STRAY_BOLT_SPEED,
        life: 1,
        r: 8,
        harms: true,
        hitStop: STRAY_HIT_STOP,
        data: s,
        // struck by the falling bolt: the cause is its whole column, as for the impact
        cause: () => ({ kind: 'bolt', x: d.mark - STRAY_COLUMN_HW, y: d.groundY - STRAY_DROP, w: STRAY_COLUMN_HW * 2, h: STRAY_DROP }),
        onPass: () => this.onCaught(s),
        onEnd: (p, why, st) => this.onBoltEnd(s, p, why, st),
      });
      g.audio.raijinFx('hiss', this.pan(d.mark) * 0.5);
      this.log({ kind: 'drop', id: s.id, el: s.el });
    }
  }

  private onCaught(s: LiveStrike) {
    if (s.state !== 'tele' && s.state !== 'drop') return;
    s.state = 'caught';
    s.age = 0;
    this.log({ kind: 'caught', id: s.id, what: s.def.kind, el: s.el });
  }

  private onSparkEnd(s: LiveStrike, p: Projectile, why: string, st?: Stroke) {
    const g = this.g;
    if (p.fromRing || why === 'cancel') return;
    if (why === 'ink') {
      s.state = 'blocked';
      s.age = 0;
      // vermilion burns it out (an umbrella); indigo puts it out
      for (let i = 0; i < 16; i++) g.particles.spawn(st?.kind === 'ai' ? 'steam' : 'ember', p.x, p.y, (Math.random() - 0.5) * 120, -40 - Math.random() * 80, 0.8, 3);
      g.sfx('hiss');
      this.log({ kind: 'blocked', id: s.id, by: st?.kind ?? null });
      return;
    }
    if (why === 'traveler') {
      // its contact killed (Portals passed the cause); it still splashes where it was
      s.state = 'landed';
      s.age = SPLASH_T;
      this.log({ kind: 'impact', id: s.id, what: 'spark', killed: true, el: s.el, dt: g.t - s.t0 });
      return;
    }
    s.state = 'landed';
    s.age = 0;
    if (why === 'ground') s.scorch = 0;
    g.audio.festivalFx('pop', this.pan(s.def.mark));
    g.recorder.mark('effect', 1);
    for (let i = 0; i < 18; i++) g.particles.spawn('ember', s.def.mark + (Math.random() - 0.5) * SPLASH_W, s.def.groundY - Math.random() * 30, (Math.random() - 0.5) * 160, -80 - Math.random() * 160, 0.9, 2.6);
    this.log({ kind: 'impact', id: s.id, what: 'spark', el: s.el, dt: g.t - s.t0, dtReal: g.realT - s.r0, tele: s.def.tele, mark: s.def.mark, px: g.px });
    this.lethal(s);
  }

  private onBoltEnd(s: LiveStrike, p: Projectile, why: string, st?: Stroke) {
    const g = this.g;
    if (p.fromRing || why === 'cancel') return;
    if (why === 'ink' && st) {
      s.state = 'blocked';
      s.age = 0;
      if (st.kind === 'shu') {
        // a vermilion umbrella saves you once and shatters
        g.strokes = g.strokes.filter((x) => x !== st);
        g.portals.strokeRemoved(st);
        for (let i = 0; i < 24; i++) {
          const q = st.pts[Math.floor(Math.random() * st.pts.length)];
          g.particles.spawn('paint', q.x, q.y, (Math.random() - 0.5) * 300, -Math.random() * 200, 0.7, 2.6, '#f5361b');
        }
      }
      g.audio.raijinFx('DON', this.pan(s.def.mark));
      this.log({ kind: 'blocked', id: s.id, by: st.kind });
      return;
    }
    s.state = 'landed';
    s.age = 0;
    const killed = why === 'traveler';
    if (why !== 'gap') s.scorch = 0;
    g.audio.raijinFx('DON', this.pan(s.def.mark));
    g.recorder.mark('effect', 2);
    g.particles.burst('ink', s.def.mark, s.def.groundY - 4, 22, 300, 0.7, 3, undefined, 240);
    // one sky flash per strike group, through the limiter; none when it struck the traveler (the death is its own swing)
    if (!killed && flashLimiter.requestGroup(g.realT, `strike-${s.group}`)) {
      g.skyFlash(0.8, { booked: true });
      this.log({ kind: 'flash', id: s.id, t0: g.realT });
    }
    this.log({ kind: 'impact', id: s.id, what: 'bolt', el: s.el, dt: g.t - s.t0, dtReal: g.realT - s.r0, tele: s.def.tele, mark: s.def.mark, killed, px: g.px });
    if (!killed) this.lethal(s);
  }

  /** Splash (spark) or column (bolt): does it catch the traveler now? */
  private lethal(s: LiveStrike) {
    const g = this.g;
    if (g.state !== 'play' || g.invuln > 0 || g.freezeT > 0) return;
    const d = s.def;
    const x0 = g.px - PLAYER_HW;
    const x1 = g.px + PLAYER_HW;
    if (d.kind === 'spark') {
      const bx0 = d.mark - SPLASH_W / 2;
      const by0 = d.groundY - SPLASH_H;
      if (x1 > bx0 && x0 < bx0 + SPLASH_W && g.py > by0 && g.py - PLAYER_H < d.groundY) {
        this.log({ kind: 'kill', id: s.id, what: 'splash', px: g.px, py: g.py });
        g.die(false, { kind: 'splash', x: bx0, y: by0, w: SPLASH_W, h: SPLASH_H });
      }
      return;
    }
    if (x1 > d.mark - STRAY_COLUMN_HW && x0 < d.mark + STRAY_COLUMN_HW) {
      this.log({ kind: 'kill', id: s.id, what: 'column', px: g.px, py: g.py });
      const cause = { kind: 'bolt', x: d.mark - STRAY_COLUMN_HW, y: d.groundY - STRAY_DROP, w: STRAY_COLUMN_HW * 2, h: STRAY_DROP };
      g.freeze(STRAY_HIT_STOP, () => g.die(false, cause));
      g.cause = cause;
    }
  }

  private maybeLoop(s: LiveStrike) {
    const g = this.g;
    const d = s.def;
    if (!d.loop || g.state !== 'play') return;
    if (g.t - s.t0 < d.loop) return;
    if (g.px > d.mark + LOOP_RANGE || g.px < d.trigger) {
      s.state = 'armed';
      return;
    }
    this.fire(s);
  }

  /** Back at a lantern: strikes whose mark is still ahead are armed again (a live one is called off). */
  private onRespawn() {
    const g = this.g;
    let n = 0;
    for (const s of this.list) {
      if (s.def.mark < g.px - 1) continue;
      if (s.proj && !s.proj.dead && !s.proj.fromRing) g.portals.cancel(s.proj);
      s.state = 'armed';
      s.el = 0;
      s.age = 0;
      s.proj = null;
      n++;
    }
    if (n) this.log({ kind: 'rearm', n, px: g.px });
  }

  // ───────────────────────────────────────────── drawing

  /** World, after the yokai and before the strokes: marks, trails, threads and scorches. */
  drawMid(ctx: CanvasRenderingContext2D, vx0: number, vx1: number) {
    const g = this.g;
    if (!this.list.length || g.recorder.replaying) return;
    const t = g.realT;
    for (const s of this.list) {
      const d = s.def;
      if (d.mark < vx0 - 200 || d.mark > vx1 + 200) continue;
      if (s.scorch >= 0) drawScorch(ctx, d.mark, d.groundY, s.scorch, s.seed);
      const live = s.state === 'tele' || s.state === 'drop';
      const k = live ? s.el / d.tele : 0;
      const gone = (s.state === 'caught' || s.state === 'blocked') && s.age < 0.3 ? 1 - s.age / 0.3 : 0;
      if (d.kind === 'spark') {
        if (live || gone > 0) {
          const appear = live ? Math.min(1, s.el / 0.25) : gone;
          drawSparkMark(ctx, d.mark, d.groundY, appear, live ? k : 0, t + s.seed);
          if (live) drawEmberTrail(ctx, d.mark, d.groundY - SPARK_DROP, d.groundY - sparkFall(s.el, d.tele), d.groundY, t);
        }
        if (s.shots > 0 && g.t - s.t0 < 0.6) drawSparkBurst(ctx, d.mark, d.groundY - SPARK_DROP, (g.t - s.t0) / 0.6, s.seed);
      } else {
        let appear = 0;
        let fill = 0;
        let grow = 0;
        let bright = 0;
        if (live) {
          appear = s.el / 0.3;
          grow = s.el / 0.3;
          fill = Math.max(0, Math.min(1, (s.el - (d.tele - 0.5)) / 0.15));
          bright = Math.max(0, Math.min(1, (s.el - (d.tele - 0.5)) / 0.1));
        } else if (gone > 0) {
          appear = gone;
          grow = gone;
        } else continue;
        drawMark(ctx, d.mark, d.groundY, appear, fill, t + s.seed);
        drawThread(ctx, d.mark, d.groundY - STRAY_DROP, d.groundY, grow, bright, t, s.id);
      }
    }
  }

  /** World, over the particles: splashes and columns. */
  drawFront(ctx: CanvasRenderingContext2D, vx0: number, vx1: number) {
    const g = this.g;
    if (!this.list.length || g.recorder.replaying) return;
    for (const s of this.list) {
      const d = s.def;
      if (s.state !== 'landed' || d.mark < vx0 - 200 || d.mark > vx1 + 200) continue;
      if (d.kind === 'spark') {
        if (s.age >= SPLASH_T + 0.15) continue;
        // it kills for SPLASH_T at full height, then sinks away in 0.15 s
        const k = s.age < SPLASH_T ? 1 : Math.max(0.05, 1 - (s.age - SPLASH_T) / 0.15);
        drawFire(ctx, { x: d.mark - SPLASH_W / 2, y: d.groundY + 4, w: SPLASH_W, h: SPLASH_H * k, alive: true, deadT: 0 }, g.t * 1.4);
      } else drawImpact(ctx, d.mark, d.groundY - STRAY_DROP, d.groundY, s.age, s.seed, 1, STRAY_COLUMN_HW);
    }
  }

  /** For tests and proof pages: live strikes in a compact form. */
  snapshot() {
    return this.list.map((s) => ({ id: s.id, kind: s.def.kind, state: s.state, mark: s.def.mark, trigger: s.def.trigger, el: s.el, tele: s.def.tele, group: s.group, shots: s.shots }));
  }
}
