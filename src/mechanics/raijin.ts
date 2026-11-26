/**
 * 雷 Raijin's gate as an auto-runner boss (docs/summer-design.md section 4; N11).
 *
 * The level describes him (`Level.raijin`, built by `Course.raijin()` and `Course.arena()`); Game calls
 * `update()` once per frame and four draws (sky, back, mid, front). Everything else lives here:
 *
 * - **Raijin** rides with the camera: anchored to the screen horizontally, in world space vertically. He is a
 *   projectile target (a returned bolt within 110 u of his centre cleans the next drum, clockwise from the top,
 *   and the portals' echo refund pays +15) and a no-ring zone (a ring painted on him sputters out).
 * - **Strikes** are position-triggered: at mark - telegraph x run speed the telegraph starts (a drum hit, the
 *   tomoe mark on the road, a crackling thread down from the cloud, *don*); the thread is complete at 0.3 s; at
 *   T - 0.5 the mark fills and he hits a second drum; at T - 0.18 the bolt drops down the thread at 2,400 u/s
 *   (a real projectile, so a ring catches it); at T it lands: a 40 u column for 0.2 s that kills at any height,
 *   and a scorch. The telegraph clock runs in game time and pauses while the traveler is stuck at a wall.
 * - **The loop** (4.5): while a phase is unwon, crossing loopEnd + 300 shifts the traveler, camera, strokes,
 *   rings, projectiles, particles and live strikes back one loop. The road (ArenaGround) and the sky (StormSky)
 *   are painted so nothing visibly jumps.
 * - **Death and retry** (4.6): Raijin laughs; on respawn (the phase lantern) player rings are cleared, strikes
 *   ahead are re-armed, and drums already cleaned stay clean.
 * - **Rain belongs to a phase** (3.5: "rain only in phase 3"). A rain zone laid over a phase's loop is parked until
 *   the phase before it is won (or the wrap of that phase would show rain ahead that is gone after the wrap), then
 *   opened beyond the right edge of the view, and widened behind the traveler once its start is well off screen,
 *   so the phase's own wrap shows rain on both sides.
 * - **The finish** (4.5): when the last drum comes clean, time eases to 0.3x for 1.2 real seconds, the drum ring
 *   rings out white, the rain stops dead (its zones are parked and strokes stop washing), the storm tears, the
 *   moon comes out (the festival sky), and he grins and drums the storm away downriver (freed, not killed).
 *
 * Every step is logged in `events` for the proof page and its assertions.
 */
import { PLAYER_H, PLAYER_HW, VIEW_H } from '../config';
import type { Game, State } from '../game';
import type { RaijinDef, RaijinPhaseDef, RaijinStrikeDef } from '../level';
import { ArenaGround, drawBolt, drawCause, drawImpact, drawMark, drawScorch, drawTear, drawThread, DRUM_R, drumPos, HOOP_R, RaijinArt, StormSky, type ArmLook, type DrumLook, type Expr, type RaijinLook } from '../render/raijin';
import type { Stroke } from '../strokes';
import { flashLimiter } from './flash';
import type { NoRingZone, Projectile, ProjectileTarget, Ring } from './portals';

/** Bolt speed on the way down and on the way back (1.6, 4.2). */
export const BOLT_SPEED = 2400;
/** The bolt drops from the cloud this far above the road: 0.18 s at BOLT_SPEED. */
export const DROP = 432;
/** The lethal column's half-width: the design's 40 u column (4.2), drawn at this width (the mark is 80 wide;
 *  the body box is 26 wide), so a traveler clear of the drawn column is never killed by it. */
export const COLUMN_HW = 20;
/** The hit-stop before a struck traveler dies (4.6), real seconds. */
export const HIT_STOP = 0.15;
/** How long the column kills, game seconds. */
export const COLUMN_T = 0.2;
/** A returned bolt hits him if it passes within this of his centre (4.3). */
export const HIT_R = 110;
/**
 * A ring whose centre is inside his hoop sputters out (4.1 says "within 100 u of his body"; the hoop is used
 * instead because his bolts' threads fall just beside him, and a catching ring 150 u up must stay legal).
 */
export const SPUTTER_R = 105;
/** His drum ring's top above his centre (the hoop's vertical radius and a drum), and the least gap kept above it. */
export const RING_TOP = HOOP_R * 0.96 + DRUM_R;
export const RING_MARGIN = 20;
/** Hits knock him back this far (4.3). */
const KNOCK = 60;
/** The arena road's tile period. Each phase's road is anchored at its own seam, so any loop length wraps
 *  invisibly (the road crossfades between anchors in mid-loop, far from any wrap). */
export const GROUND_PERIOD = 900;
/** The finish beat (4.5): time eases to this scale for FINALE_SLOW real seconds. */
export const FINALE_SCALE = 0.3;
export const FINALE_SLOW = 1.2;
/** After the slow beat he drums the storm away downriver over this many real seconds; the storm tears over STORM_TEAR. */
const DEPART = 2.6;
const STORM_TEAR = 1.6;
/** Before the arena he rides at least this far above the traveler's road (the camera's notion of it). */
const APPROACH_ABOVE = 330;
/** A parked rain zone: far off the scroll (an empty zone list would mean rain everywhere). */
const PARKED: [number, number] = [-1e6, -1e6 + 1];

// The photosensitivity limiter (4.2, 2.4, N19) lives in ./flash.ts: one scheduler for every full-screen
// luminance change in the game. Re-exported here for older importers.
export { FlashLimiter, flashLimiter } from './flash';

export type StrikeState = 'armed' | 'tele' | 'drop' | 'landed' | 'caught' | 'blocked' | 'cancelled';

export interface Strike {
  id: number;
  def: RaijinStrikeDef;
  phase: RaijinPhaseDef;
  /** world x of the mark (moves with the wrap while live) */
  mark: number;
  /** the traveler passing this x starts the telegraph */
  trigger: number;
  state: StrikeState;
  /** telegraph clock (game seconds since it started; paused while the traveler is stuck) */
  el: number;
  /** game and real time the telegraph started */
  t0: number;
  r0: number;
  bolt: Projectile | null;
  /** seconds since impact (landed), or since it was caught or blocked */
  age: number;
  seed: number;
  /** stage cues already played */
  cue: number;
  /** the drum he hit for it */
  drum: number;
  /** the rings its bolt went through (they close when its group is over: "a window lasts one strike group") */
  rings: Ring[];
  /** its impact's local glow: 1 when the limiter gave it the flash, 0.45 when the group's flash was spent */
  glow: number;
}

export interface RaijinEvent {
  seq: number;
  t: number;
  realT: number;
  kind: 'enter' | 'finale' | 'tele' | 'drop' | 'impact' | 'catch' | 'blocked' | 'miss' | 'drum' | 'knock' | 'clear' | 'kill' | 'death' | 'respawn' | 'wrap' | 'reset' | 'cancel' | 'sputter' | 'flash';
  [k: string]: unknown;
}

interface Scorch {
  x: number;
  age: number;
  seed: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Move a painted stroke along x in place (its points, box, walkable top, washes and baked sprites). */
export function shiftStroke(st: Stroke, dx: number) {
  for (const p of st.pts) p.x += dx;
  for (const p of st.surface) p.x += dx;
  for (const w of st.washes) w.x += dx;
  st.bbox.x0 += dx;
  st.bbox.x1 += dx;
  for (const sp of [st.sprite, st.wet, st.glow]) if (sp) sp.x += dx;
}

/** His centre is never lower than this above the arena road, whatever the bob (his ring and his sputter zone must
 *  stay clear of the marks, the threads and the catch band above head height: 4.1). */
export const MIN_ABOVE = 260;

/**
 * His centre's height above the road at real time t: the phase's bob (3 s period) between `above - bob` and
 * `above + bob`, with its low end held at MIN_ABOVE (the bob shrinks about its top rather than flattening on the
 * floor, so he never sits still at the bottom).
 */
export function riseAbove(mo: { above: number; bob: number }, t: number) {
  const hi = mo.above + mo.bob;
  const lo = Math.min(hi, Math.max(MIN_ABOVE, mo.above - mo.bob));
  return (hi + lo) / 2 - ((hi - lo) / 2) * Math.sin((t * Math.PI * 2) / 3);
}

/** The open stretches of [x0, x1] that no island covers (at least 24 u wide), in order. */
export function roadGaps(islands: readonly { x0: number; x1: number }[], x0: number, x1: number): [number, number][] {
  const cover = islands.filter((s) => s.x1 > x0 && s.x0 < x1).sort((a, b) => a.x0 - b.x0);
  const out: [number, number][] = [];
  let x = x0;
  for (const s of cover) {
    if (s.x0 - x >= 24) out.push([x, s.x0]);
    x = Math.max(x, s.x1);
  }
  if (x1 - x >= 24) out.push([x, x1]);
  return out;
}

export class Raijin {
  def: RaijinDef | null = null;
  strikes: Strike[] = [];
  drums: (DrumLook & { clean: boolean })[] = [];
  /** drums cleaned so far (they stay clean across deaths: 4.6) */
  cleaned = 0;
  cleared: boolean[] = [];
  events: RaijinEvent[] = [];
  /** proof page: a cleared phase re-soaks its drums at the loop's end and goes round again */
  endless = false;
  /** proof page: his bolts and columns pass through the traveler (so a run can watch every strike land) */
  immortal = false;
  /** 1 faces right (story.md), -1 faces left */
  face: 1 | -1 = 1;
  /** his centre (world), updated every frame */
  x = 0;
  y = 0;
  /** screen-x fraction he sits at now */
  sx = 0.7;
  /** the eased phase motion (sweep, bob, height above the road) */
  private motion: { s0: number; s1: number; bob: number; above: number } | null = null;
  wraps = 0;

  private seq = 1;
  private nextId = 1;
  private enterT = -1;
  private prevState: State = 'menu';
  private knockX = 0;
  private knockY = 0;
  private hurtT = 0;
  private laughT = 0;
  private roarT = 0;
  // the front (lower) arm beats the drums on his right, the raised back arm those on his upper left
  private front: ArmLook = { k: 0, drum: 2 };
  private back: ArmLook = { k: 0, drum: 7 };
  private frontNext = 2;
  private backNext = 7;
  private hoopRot = 0;
  private scorches: Scorch[] = [];
  /** real time the current sky flash started (the limiter ramps it in) */
  private flashT0 = -99;
  /** storm-tears: a ring painted on him sputtering out (x, y, r, real time) */
  private tears: { x: number; y: number; r: number; t0: number }[] = [];
  /** the strike that killed the traveler (N10 cause flash), while dying */
  private cause: Strike | null = null;
  private art = new RaijinArt();
  private sky = new StormSky();
  private ground: ArenaGround[] = [];
  private target: ProjectileTarget;
  private zone: NoRingZone;
  private range: [number, number] = [0, 0];
  /** the phase whose seam the traveler has reached (its lantern is the respawn point from then on) */
  private entered = -1;
  /** rain zones that belong to a phase (index into level.rainZones), as laid, and whether they are open */
  private rainGates: { zi: number; pi: number; z0: number; z1: number; open: boolean }[] = [];
  /** real time the last drum came clean (the finish beat), or -1 */
  finT0 = -1;

  constructor(private g: Game) {
    this.target = { x: 0, y: 0, r: HIT_R - 8, alive: () => this.active() && this.cleaned < this.drums.length, hit: (p) => this.onHit(p) };
    this.zone = { x: 0, y: 0, r: SPUTTER_R, why: 'raijin', onFizzle: (cx, cy, r) => this.onSputter(cx, cy, r) };
  }

  /** A scroll was loaded (after portals.reset): set up from its definition, or switch off. */
  reset() {
    const def = this.g.level.raijin ?? null;
    this.def = def;
    this.strikes = [];
    this.events = [];
    this.cleaned = 0;
    this.enterT = -1;
    this.scorches = [];
    this.cause = null;
    this.wraps = 0;
    this.entered = -1;
    this.motion = null;
    this.tears = [];
    this.flashT0 = -99;
    this.finT0 = -1;
    this.rainGates = [];
    flashLimiter.reset();
    this.knockX = this.knockY = this.hurtT = this.laughT = this.roarT = 0;
    // a restart (even from the dying state) must not read as a respawn
    this.prevState = 'play';
    if (!def) {
      this.ground = [];
      this.drums = [];
      return;
    }
    this.drums = Array.from({ length: def.drums }, () => ({ soak: 1, flash: 0, clean: false }));
    this.cleared = def.phases.map(() => false);
    const speed = this.g.level.rules.runSpeed;
    for (const ph of def.phases) for (const s of ph.strikes) this.strikes.push(this.makeStrike(s, ph, speed));
    const first = def.phases[0];
    const last = def.phases[def.phases.length - 1];
    this.range = first ? [first.x0 - 500, last.x0 + last.length + 1900] : [0, 0];
    // the road: one stretch per seam, anchored at that seam, so the view around every wrap point (440 u behind to
    // 1,420 u ahead of a seam) is the same picture at loopEnd and at x0 whatever the loop's length; neighbouring
    // stretches crossfade in mid-loop, where no wrap can see it
    this.ground = [];
    if (first) {
      const seams = [...def.phases.map((p) => p.x0), last.x0 + last.length];
      for (let i = 0; i < seams.length; i++) {
        const a = i === 0 ? this.range[0] : (seams[i - 1] + 1420 + seams[i] - 440) / 2;
        const b = i === seams.length - 1 ? this.range[1] : (seams[i] + 1420 + seams[i + 1] - 440) / 2;
        this.ground.push(new ArenaGround(def.groundY, seams[i], GROUND_PERIOD, a, b, i > 0, i < seams.length - 1));
      }
      // the road stays open over every gap in the terrain (the phase gaps, and the gorge's far end): 4.8
      const gaps = roadGaps(this.g.level.islands, this.range[0] - 200, this.range[1] + 200);
      for (const gr of this.ground) gr.setGaps(gaps);
    }
    this.g.portals.targets.push(this.target);
    this.g.portals.noRing.push(this.zone);
    // rain that falls over a phase's loop belongs to that phase: parked now, opened when the phase can be reached
    const Z = this.g.level.rainZones;
    if (this.g.level.rules.rain) {
      Z.forEach(([z0, z1], zi) => {
        const pi = def.phases.findIndex((p) => z0 < p.x0 + p.length && z1 > p.x0 + 300);
        if (pi < 0) return;
        this.rainGates.push({ zi, pi, z0, z1, open: false });
        Z[zi] = [...PARKED];
      });
    }
    // paint his sprites, the road tile and the storm band now (at load), not on the frame he arrives
    const g = this.g;
    if (g.S > 0 && g.H > 0) {
      this.art.build(g.S);
      for (const gr of this.ground) gr.build(g.S);
      this.sky.build(g.H / VIEW_H);
    }
  }

  private makeStrike(s: RaijinStrikeDef, ph: RaijinPhaseDef, speed: number): Strike {
    return { id: this.nextId++, def: s, phase: ph, mark: s.mark, trigger: s.mark - speed * s.tele, state: 'armed', el: 0, t0: 0, r0: 0, bolt: null, age: 0, seed: (s.mark * 7.13) % 997, cue: 0, drum: 0, rings: [], glow: 1 };
  }

  private log(e: Omit<RaijinEvent, 'seq' | 't' | 'realT'>) {
    this.events.push({ seq: this.seq++, t: this.g.t, realT: this.g.realT, ...e } as RaijinEvent);
    if (this.events.length > 400) this.events.splice(0, this.events.length - 400);
  }

  /** He is on screen and fighting. */
  active() {
    return !!this.def && this.enterT >= 0;
  }

  /**
   * The phase the traveler is in, or -1 before the arena: the last one whose seam they have reached, but never
   * past an unwon phase. An unwon phase stays current until it is cleared (its seam overlaps the next phase's
   * by 300 u), so its wrap, its strikes and its lantern keep hold of the traveler (4.5).
   */
  phaseIndex(): number {
    const def = this.def;
    if (!def) return -1;
    let k = -1;
    for (let i = 0; i < def.phases.length; i++) if (this.g.px >= def.phases[i].x0 - 300 && (i === 0 || this.cleared[i - 1])) k = i;
    return k;
  }

  /** Drums a phase needs cleaned, counting the earlier phases. */
  private need(i: number) {
    let n = 0;
    for (let k = 0; k <= i; k++) n += this.def!.phases[k].hits;
    return Math.min(n, this.drums.length);
  }

  soaked() {
    return this.drums.length - this.cleaned;
  }

  private pan() {
    return Math.max(-1, Math.min(1, (this.sx - 0.5) * 1.8));
  }

  // ───────────────────────────────────────────── per frame

  update(dt: number, dtReal: number) {
    const g = this.g;
    const def = this.def;
    if (!def || g.state === 'menu') {
      this.prevState = g.state;
      return;
    }
    if (this.prevState === 'play' && g.state === 'dying') this.onDeath();
    if (this.prevState === 'dying' && g.state === 'play') this.onRespawn();
    this.prevState = g.state;

    if (this.enterT < 0 && g.state === 'play' && g.px >= def.enterX) {
      this.enterT = g.realT;
      this.log({ kind: 'enter', x: g.px });
      g.audio.raijinFx('roll', 0.4);
    }
    this.place(dtReal);
    this.animate(dt, dtReal);
    if (!this.active()) return;
    const cur = this.phaseIndex();
    if (cur > this.entered && g.state === 'play' && g.px >= def.phases[cur].x0) {
      // entering a phase makes its lantern the place you come back to, even before you pass it: a death at the
      // seam's strike (the first one you meet) returns you past it, never to the approach (4.5, 4.7)
      this.entered = cur;
      const ph = def.phases[cur];
      if (g.respawn.x < ph.lantern + 30) g.respawn = { x: ph.lantern + 30, y: def.groundY };
    }
    for (const s of this.strikes) this.stepStrike(s, dt, cur);
    for (const sc of this.scorches) sc.age += dt;
    if (this.scorches.length > 12) this.scorches.splice(0, this.scorches.length - 12);
    this.maybeWrap(cur);
    this.gateRain();
    this.finaleStep(dtReal);
  }

  /** Is phase `pi` within reach: the arena has begun and every phase before it is won? */
  private reachable(pi: number) {
    if (!this.active()) return false;
    for (let k = 0; k < pi; k++) if (!this.cleared[k]) return false;
    return true;
  }

  /**
   * Rain that belongs to a phase (see the header). Opened ahead of the view (you see the curtain coming), then
   * widened back to a loop's length behind the seam once its start is well behind the view, and forward past the
   * wrap point, so both sides of the wrap rain alike. The finish parks it again: the rain stops dead.
   */
  private gateRain() {
    if (!this.rainGates.length) return;
    const g = this.g;
    const Z = g.level.rainZones;
    const viewW = g.W / g.S;
    const left = g.camCX - viewW / 2;
    const right = g.camCX + viewW / 2;
    for (const gt of this.rainGates) {
      const ph = this.def!.phases[gt.pi];
      if (this.finT0 >= 0) {
        if (gt.open || Z[gt.zi][0] !== PARKED[0]) Z[gt.zi] = [...PARKED];
        gt.open = false;
        continue;
      }
      if (!gt.open) {
        if (!this.reachable(gt.pi)) continue;
        gt.open = true;
        // past the loop's wrap point by more than any view's reach ahead
        Z[gt.zi] = [Math.max(gt.z0, right + 400), Math.max(gt.z1, ph.x0 + ph.length + 2700)];
        continue;
      }
      const z = Z[gt.zi];
      const back = ph.x0 - 1100;
      if (z[0] > back && z[0] < left - 400) Z[gt.zi] = [back, z[1]];
    }
  }

  /**
   * His height: over the arena, `arenaY` (above the arena road). Before the arena (the approach can run on higher
   * ground, like the gate's ridge) he rides at least APPROACH_ABOVE over the traveler's road as the camera sees it,
   * so he hangs in the sky over the far side and never sits on the approach's own doors; he glides down to the
   * arena height as the camera follows the traveler down.
   */
  private rideY(arenaY: number, camCY: number) {
    if (this.phaseIndex() >= 0) return arenaY;
    return Math.min(arenaY, camCY + 80 - APPROACH_ABOVE);
  }

  /** The finish beat (4.5): the slow beat, the storm tearing, the moon. */
  private finaleStep(dtReal: number) {
    const g = this.g;
    if (this.finT0 < 0) return;
    const u = g.realT - this.finT0;
    // time eases to 0.3x (a cinematic beat, not the player's slow motion). Game sets its time scale before this
    // runs and eases it toward 1 at the start of the next frame, so it is set a little under 0.3 here to land on it.
    if (u < FINALE_SLOW && !g.painting && g.state === 'play') {
      const k = Math.min(0.95, dtReal * 5);
      g.timeScale = Math.max(0.05, (FINALE_SCALE - k) / (1 - k));
    }
    // Game derives `slow` (the paper wash, the vignette, the muffled music) from the eased time scale, through the
    // beat and the second it takes to ease back to 1; this beat is not the player's slow motion, so clear it unless
    // the player is painting (this runs after Game sets it and before the render and the audio tick read it).
    // Stand-in until the engine has Game.cinematic(scale, seconds): see the report's needs_from_others.
    if (u < FINALE_SLOW + 1.5 && !g.painting) g.slow = 0;
    // the ring rings out white: every drum flashes in turn, clockwise, over the slow beat
    if (u < FINALE_SLOW) {
      const n = this.drums.length;
      const lit = Math.floor((u / FINALE_SLOW) * n);
      for (let i = 0; i <= Math.min(lit, n - 1); i++) this.drums[i].flash = Math.max(this.drums[i].flash, 1 - (u / FINALE_SLOW) * 0.4);
    }
  }

  /** The last drum is clean (4.5): start the finish. Proof pages that loop (endless) never finish. */
  private finale() {
    const g = this.g;
    if (this.finT0 >= 0 || this.endless) return;
    this.finT0 = g.realT;
    this.roarT = 2.4;
    // the rain stops dead: its zones park this frame (gateRain), and strokes already in it stop washing
    for (const st of g.strokes) if (st.inRain && !st.washed) st.inRain = false;
    this.gateRain();
    // the cloud tears and the moon comes out (the festival's sky cross-fades over 2.2 s)
    if (g.level.sky) {
      const now = g.festival.sky;
      g.festival.sky = { from: now.k >= 0.5 ? now.to : now.from, to: 'moon', k: 0 };
    }
    if (flashLimiter.request(g.realT)) this.flashT0 = g.realT;
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * Math.PI * 2;
      g.particles.spawn('mote', this.x + Math.cos(a) * (HOOP_R + 10), this.y + Math.sin(a) * (HOOP_R + 10), Math.cos(a) * 160, Math.sin(a) * 160, 1.4, 2.6, 'rgba(255,255,255,0.95)');
    }
    g.recorder.mark('effect', 3);
    this.log({ kind: 'finale', x: g.px, cleaned: this.cleaned });
  }

  /** 0..1 how far he has drummed the storm away (after the slow beat). */
  private departK() {
    if (this.finT0 < 0) return 0;
    return clamp01((this.g.realT - this.finT0 - FINALE_SLOW * 0.6) / DEPART);
  }

  /**
   * Where he will be `ahead` u further along the road and `dtReal` real seconds from now (route scripts aim their
   * windows with it). Ignores knockback; the camera is taken to move with the traveler.
   */
  predict(ahead: number, dtReal: number) {
    const g = this.g;
    const def = this.def;
    const mo = this.motion;
    if (!def || !mo) return { x: this.x, y: this.y };
    const viewW = g.W / g.S;
    const t = g.realT + dtReal;
    const sx = lerp(mo.s0, mo.s1, 0.5 + 0.5 * Math.sin((t * Math.PI * 2) / 5));
    const camLeft = g.camCX + ahead - viewW / 2;
    const viewTop = g.camCY - g.H / g.S / 2;
    return {
      x: camLeft + viewW * sx + Math.sin(t * 0.9) * 10,
      y: Math.max(this.rideY(def.groundY - riseAbove(mo, t), g.camCY), viewTop + RING_TOP + RING_MARGIN),
    };
  }

  /**
   * Screen-anchored x, world y (4.1); his sway and bob per phase; knockback easing back. A new phase's sweep, bob
   * and height are eased in over about a second (no pop at the phase change), and his drum ring is held at least
   * RING_MARGIN below the top of the view whatever the camera does (the ring is the health bar: 4.1, 4.8).
   */
  private place(dtReal: number) {
    const g = this.g;
    const def = this.def!;
    const ph = def.phases[Math.max(0, this.phaseIndex())] ?? def.phases[0];
    const viewW = g.W / g.S;
    const t = g.realT;
    const want = ph ? { s0: ph.sweep[0], s1: ph.sweep[1], bob: ph.bob, above: ph.above } : { s0: 0.7, s1: 0.7, bob: 10, above: 290 };
    const m = this.motion;
    if (!m) this.motion = { ...want };
    else if (dtReal > 0) {
      const k = 1 - Math.exp(-dtReal * 3.5);
      m.s0 += (want.s0 - m.s0) * k;
      m.s1 += (want.s1 - m.s1) * k;
      m.bob += (want.bob - m.bob) * k;
      m.above += (want.above - m.above) * k;
    }
    const mo = this.motion!;
    this.sx = lerp(mo.s0, mo.s1, 0.5 + 0.5 * Math.sin((t * Math.PI * 2) / 5));
    const camLeft = g.camCX - viewW / 2;
    const e = this.enterT < 0 ? 0 : clamp01((g.realT - this.enterT) / 1.5);
    this.knockX *= Math.exp(-dtReal * 3.2);
    this.knockY *= Math.exp(-dtReal * 3.2);
    this.x = camLeft + viewW * this.sx + Math.sin(t * 0.9) * 10 + this.knockX;
    const viewTop = g.camCY - g.H / g.S / 2;
    const settled = Math.max(this.rideY(def.groundY - riseAbove(mo, t), g.camCY) + this.knockY, viewTop + RING_TOP + RING_MARGIN);
    // (the entrance drops him in from above the view; the clamp holds once he has arrived)
    this.y = settled - (1 - e) * (1 - e) * 240;
    // freed: he drums the storm away downriver (right) and up into the torn cloud
    const d = this.departK();
    if (d > 0) {
      this.x += viewW * 0.55 * d * d;
      this.y -= 300 * d * d;
    }
    this.target.x = this.x;
    this.target.y = this.y;
    this.zone.x = this.x;
    this.zone.y = this.y;
    // no rings on him before he arrives either (he is coming), nor once he has gone
    this.zone.r = this.enterT < 0 || this.finT0 >= 0 ? 0 : SPUTTER_R;
  }

  private animate(dt: number, dtReal: number) {
    const swing = (a: ArmLook, dur: number) => {
      if (a.k <= 0) return;
      const before = a.k;
      a.k += dtReal / dur;
      if (before < 0.5 && a.k >= 0.5) {
        const d = this.drums[a.drum];
        if (d) d.flash = 1;
      }
      if (a.k >= 1) a.k = 0;
    };
    swing(this.front, 0.22);
    swing(this.back, 0.22);
    for (const d of this.drums) {
      d.flash = Math.max(0, d.flash - dtReal * 3);
      d.soak = d.clean ? Math.max(0, d.soak - dtReal / 0.35) : Math.min(1, d.soak + dtReal / 0.35);
    }
    // the hoop sways a little (kept small, so his feet stay in the gaps between drums)
    this.hoopRot = Math.sin(this.g.realT * 0.45) * 0.07;
    this.hurtT = Math.max(0, this.hurtT - dtReal);
    this.laughT = Math.max(0, this.laughT - dtReal);
    this.roarT = Math.max(0, this.roarT - dtReal);
    if (this.tears.length && this.g.realT - this.tears[0].t0 > 0.6) this.tears.shift();
    // the laugh is a drum roll: alternate arms while it lasts
    if ((this.laughT > 0 || this.roarT > 0) && this.front.k === 0 && this.back.k === 0) {
      if (Math.floor(this.g.realT * 12) % 2) this.hit('front', (this.frontNext = this.frontNext === 2 ? 3 : 2));
      else this.hit('back', (this.backNext = this.backNext === 7 ? 6 : 7));
    }
    void dt;
  }

  private hit(arm: 'front' | 'back', drum: number) {
    const a = arm === 'front' ? this.front : this.back;
    a.drum = drum;
    a.k = 0.0001;
  }

  private stepStrike(s: Strike, dt: number, cur: number) {
    const g = this.g;
    const def = this.def!;
    const pi = def.phases.indexOf(s.phase);
    const T = s.def.tele;
    switch (s.state) {
      case 'armed': {
        if (pi !== cur || this.cleared[pi] || g.state !== 'play') return;
        if (g.px < s.trigger || g.px > s.mark + 400) return;
        s.state = 'tele';
        s.el = 0;
        s.t0 = g.t;
        s.r0 = g.realT;
        s.cue = 0;
        s.age = 0;
        // a new group: the last group's rings behind you aim nowhere now ("a window lasts one strike group", 4.3).
        // A waiting ring or a pair left behind would otherwise pair with (or be closed by) the first ring for this
        // group and fizzle it as "too far"; rings ahead of the traveler (painted for this group) are kept
        if (s.def.idx === 0) this.closeBehind();
        this.frontNext = this.frontNext === 2 ? 3 : 2;
        s.drum = this.frontNext;
        this.hit('front', s.drum);
        g.audio.raijinFx('don', this.pan());
        this.log({ kind: 'tele', id: s.id, mark: s.mark, tele: T, group: s.def.group, idx: s.def.idx, phase: s.phase.n, px: g.px, trigger: s.trigger });
        return;
      }
      case 'tele':
      case 'drop': {
        if (g.stuckT <= 0) s.el += dt;
        if (s.cue < 1 && s.el >= 0.3) {
          s.cue = 1;
          g.audio.raijinFx('crackle', this.pan() * 0.6);
        }
        if (s.cue < 2 && s.el >= T - 0.5) {
          s.cue = 2;
          this.backNext = this.backNext === 7 ? 6 : 7;
          this.hit('back', this.backNext);
          g.audio.raijinFx('don', this.pan());
        }
        if (s.state === 'tele' && s.el >= T - DROP / BOLT_SPEED) this.drop(s);
        return;
      }
      case 'landed':
      case 'caught':
      case 'blocked':
      case 'cancelled':
        s.age += dt;
        if (s.state === 'landed' && s.age < COLUMN_T) this.lethal(s);
        return;
    }
  }

  /** The bolt drops down the thread: a real projectile, so a ring on the thread catches it. */
  private drop(s: Strike) {
    const g = this.g;
    const gy = this.def!.groundY;
    // placed where it would be now if it had left on the exact instant, so it lands at T to the frame
    const late = Math.max(0, s.el - (s.def.tele - DROP / BOLT_SPEED));
    s.state = 'drop';
    s.bolt = g.portals.spawn({
      kind: 'bolt',
      x: s.mark,
      y: gy - DROP + late * BOLT_SPEED,
      vx: 0,
      vy: BOLT_SPEED,
      life: 1,
      r: 8,
      harms: !this.immortal,
      safeAfterRing: true,
      hitStop: HIT_STOP,
      data: s,
      onPass: (_p, entry, exit) => {
        for (const r of [entry, exit]) if (!s.rings.includes(r)) s.rings.push(r);
        this.onCatch(s);
      },
      onEnd: (p, why, st) => this.onBoltEnd(s, p, why, st),
      draw: (ctx, p, t) => {
        if (p.fromRing) drawBolt(ctx, p.trail[0] ?? p, p, t, true, s.seed);
        else {
          ctx.save();
          if (this.active()) this.clipHim(ctx);
          drawBolt(ctx, { x: p.x, y: gy - DROP }, p, t, false, s.seed);
          ctx.restore();
        }
      },
    });
    g.audio.raijinFx('hiss', this.pan() * 0.5);
    this.log({ kind: 'drop', id: s.id, el: s.el });
  }

  private onCatch(s: Strike) {
    if (s.state !== 'drop') return;
    s.state = 'caught';
    s.age = 0;
    this.log({ kind: 'catch', id: s.id, el: s.el, at: this.g.t - s.t0 });
  }

  private onBoltEnd(s: Strike, p: Projectile, why: string, st?: Stroke) {
    const g = this.g;
    const gy = this.def!.groundY;
    if (p.fromRing) {
      // a returned bolt: it hit him (onHit), or flew on and missed
      if (why !== 'hit' && why !== 'cancel') this.log({ kind: 'miss', id: s.id, why, x: p.x, y: p.y });
      this.groupDone(s);
      return;
    }
    if (why === 'ink' && st) {
      // a vermilion umbrella over the mark: it saves you once and shatters (4.2)
      s.state = 'blocked';
      s.age = 0;
      if (st.kind === 'shu') {
        g.strokes = g.strokes.filter((x) => x !== st);
        for (let i = 0; i < 24; i++) {
          const q = st.pts[Math.floor(Math.random() * st.pts.length)];
          g.particles.spawn('paint', q.x, q.y, (Math.random() - 0.5) * 300, -Math.random() * 200, 0.7, 2.6, '#f5361b');
        }
      }
      g.audio.raijinFx('DON', this.pan());
      this.log({ kind: 'blocked', id: s.id, by: st.kind, x: p.x, y: p.y });
      return;
    }
    if (why === 'ground' || why === 'traveler' || why === 'gap') {
      s.state = 'landed';
      s.age = 0;
      const killed = why === 'traveler';
      if (killed) this.cause = s;
      if (why !== 'gap') this.scorches.push({ x: s.mark, age: 0, seed: s.seed });
      g.audio.raijinFx('DON', this.pan());
      g.recorder.mark('effect', 2);
      g.particles.burst('ink', s.mark, gy - 4, 26, 320, 0.7, 3, undefined, 260);
      // the photosensitivity limiter (4.2): at most one lit cloud every 4 s, ramped in; a group shares one, and
      // the other impacts get only a dimmer local glow. A bolt that strikes the traveler gets no sky flash: the
      // death's ink burst follows at once and is its own luminance swing.
      if (!killed && flashLimiter.request(g.realT)) {
        this.flashT0 = g.realT;
        s.glow = 1;
        this.log({ kind: 'flash', id: s.id });
      } else s.glow = 0.45;
      this.log({ kind: 'impact', id: s.id, x: p.x, y: p.y, mark: s.mark, el: s.el, dt: g.t - s.t0, dtReal: g.realT - s.r0, tele: s.def.tele, killed, px: g.px });
      if (!killed) this.lethal(s);
    }
  }

  /**
   * "A window lasts one strike group" (4.3): once every bolt of this strike's group has landed, been blocked or
   * come back and ended, the rings its bolts went through close. Rings are painted on the world and he moves with
   * the screen, so that window would aim nowhere next time, and with the reach cap a new ring could never pair.
   */
  private groupDone(s: Strike) {
    const mates = this.strikes.filter((q) => q.phase === s.phase && q.def.group === s.def.group);
    const live = mates.some((q) => q.state === 'armed' || q.state === 'tele' || q.state === 'drop' || (q.bolt && !q.bolt.dead && q.bolt !== s.bolt));
    if (live) return;
    const P = this.g.portals;
    let n = 0;
    for (const q of mates) {
      for (const r of q.rings) {
        if (r.fixed || r.state === 'closing' || !P.rings.includes(r)) continue;
        P.closeRing(r);
        n++;
      }
      q.rings = [];
    }
    if (n) this.log({ kind: 'cancel', what: 'window', group: s.def.group, rings: n });
  }

  /** Close the player's rings that lie wholly behind the traveler (a new strike group starts: see stepStrike). */
  private closeBehind() {
    const g = this.g;
    const P = g.portals;
    let n = 0;
    for (const r of P.playerRings()) {
      if (r.state === 'closing' || r.cx + r.r >= g.px - PLAYER_HW) continue;
      P.closeRing(r);
      n++;
    }
    if (n) this.log({ kind: 'cancel', what: 'behind', rings: n });
  }

  /** The column kills at any height for COLUMN_T s: the body box against the mark's middle. */
  private lethal(s: Strike) {
    const g = this.g;
    if (g.state !== 'play' || g.invuln > 0 || this.immortal) return;
    if (g.freezeT > 0) return;
    if (g.px + PLAYER_HW > s.mark - COLUMN_HW && g.px - PLAYER_HW < s.mark + COLUMN_HW) {
      this.cause = s;
      this.log({ kind: 'kill', id: s.id, px: g.px, mark: s.mark, py: g.py, grounded: g.grounded });
      // the hit-stop: the world holds on the column for 0.15 s, then the death burst (4.6)
      g.freeze(HIT_STOP, () => g.die(false));
    }
  }

  /**
   * A returned bolt passed through his ring of drums: the next drum comes clean (clockwise from the top). A bolt
   * still in flight when its phase was won knocks him back (and the portals pay the echo) but cleans no drum, so
   * the next phase always needs its own hits (4.4).
   */
  private onHit(p: Projectile) {
    const g = this.g;
    if (this.cleaned >= this.drums.length) return;
    const sp = Math.hypot(p.vx, p.vy) || 1;
    this.knockX += (p.vx / sp) * KNOCK;
    this.knockY += (p.vy / sp) * KNOCK * 0.6;
    this.hurtT = 0.7;
    const cur0 = this.phaseIndex();
    if (cur0 < 0 || this.cleared[cur0]) {
      const s0 = (p.data as Strike | undefined) ?? null;
      this.log({ kind: 'knock', left: this.soaked(), id: s0?.id ?? null, x: p.x, y: p.y, dist: Math.hypot(p.x - this.x, p.y - this.y), ink: g.inkAmt });
      g.audio.raijinFx('DON', this.pan());
      return;
    }
    const i = this.cleaned++;
    const d = this.drums[i];
    d.clean = true;
    d.flash = 1;
    const dp = drumPos(i, this.drums.length, this.hoopRot);
    const wx = this.x + dp.x * this.face;
    const wy = this.y + dp.y;
    g.particles.burst('ink', wx, wy, 30, 260, 0.8, 3.2, undefined, 60);
    for (let k = 0; k < 14; k++) g.particles.spawn('mote', wx, wy, (Math.random() - 0.5) * 220, (Math.random() - 0.5) * 220, 0.8, 2.4, 'rgba(255,255,255,0.95)');
    g.audio.raijinFx('clean', this.pan());
    g.recorder.mark('effect', 3);
    const s = (p.data as Strike | undefined) ?? null;
    this.log({ kind: 'drum', drum: i, left: this.soaked(), id: s?.id ?? null, x: p.x, y: p.y, dist: Math.hypot(p.x - this.x, p.y - this.y), ink: g.inkAmt });
    const cur = this.phaseIndex();
    if (cur >= 0 && !this.cleared[cur] && this.cleaned >= this.need(cur)) this.clear(cur);
  }

  /** A phase is won: pending telegraphs snap back up into the cloud, he rears back with a drum roll, the wrap stops. */
  private clear(i: number) {
    const g = this.g;
    this.cleared[i] = true;
    this.roarT = 1.2;
    for (const s of this.strikes) {
      if (s.phase !== this.def!.phases[i]) continue;
      if (s.state === 'tele' || s.state === 'drop' || s.state === 'armed') {
        if (s.bolt && !s.bolt.dead && !s.bolt.fromRing) g.portals.cancel(s.bolt);
        // a live telegraph snaps back up into the cloud (drawn for 0.3 s); one that never started shows nothing
        s.age = s.state === 'armed' ? 1 : 0;
        s.state = 'cancelled';
      }
    }
    g.audio.raijinFx('roll', this.pan());
    this.log({ kind: 'clear', phase: this.def!.phases[i].n, cleaned: this.cleaned });
    if (i === this.def!.phases.length - 1 || this.cleaned >= this.drums.length) this.finale();
  }

  /** A ring painted on him: his storm tears it (a sputter, and a short tear of wind round where it was). */
  private onSputter(cx: number, cy: number, r: number) {
    const g = this.g;
    g.audio.raijinFx('sputter', this.pan());
    this.tears.push({ x: cx, y: cy, r, t0: g.realT });
    for (let k = 0; k < 12; k++) {
      const a = Math.random() * Math.PI * 2;
      g.particles.spawn('mote', cx + Math.cos(a) * r, cy + Math.sin(a) * r, -160 - Math.random() * 160, (Math.random() - 0.5) * 80, 0.5, 2, 'rgba(229,139,255,0.8)');
    }
    this.log({ kind: 'sputter', x: cx, y: cy, r });
  }

  private onDeath() {
    this.laughT = 0.8;
    flashLimiter.note(this.g.realT);
    this.log({ kind: 'death', px: this.g.px, py: this.g.py, cause: this.cause?.id ?? null });
  }

  /** Back at the phase lantern: rings cleared (he has moved), strikes ahead re-armed, cleaned drums stay clean. */
  private onRespawn() {
    const g = this.g;
    this.cause = null;
    flashLimiter.note(g.realT);
    const rings = g.portals.playerRings().length;
    g.portals.clearPlayerRings();
    const speed = g.level.rules.runSpeed;
    for (const s of this.strikes) {
      if (s.trigger < g.px - 1) continue;
      const pi = this.def!.phases.indexOf(s.phase);
      if (this.cleared[pi]) continue;
      if (s.bolt && !s.bolt.dead) g.portals.cancel(s.bolt);
      Object.assign(s, this.makeStrike(s.def, s.phase, speed), { id: s.id });
    }
    const ahead = this.strikes.filter((s) => s.state === 'armed' && s.trigger >= g.px).sort((a, b) => a.trigger - b.trigger)[0];
    this.log({ kind: 'respawn', x: g.px, ink: g.inkAmt, inkMax: g.inkMax, ringsBefore: rings, ringsAfter: g.portals.playerRings().length, cleaned: this.cleaned, nextTrigger: ahead?.trigger ?? null, nextMark: ahead?.mark ?? null, invuln: g.invuln });
  }

  /** The loop's wrap (4.5). In the proof page's endless mode a won phase re-soaks and goes round again. */
  private maybeWrap(cur: number) {
    const g = this.g;
    if (cur < 0 || g.state !== 'play' || g.painting) return;
    const ph = this.def!.phases[cur];
    if (g.px < ph.x0 + ph.length + 300) return;
    if (this.cleared[cur]) {
      if (!this.endless) return;
      // re-soak this phase's drums, newest first
      for (let k = 0; k < ph.hits && this.cleaned > 0; k++) this.drums[--this.cleaned].clean = false;
      this.cleared[cur] = false;
      this.log({ kind: 'reset', phase: ph.n, cleaned: this.cleaned });
    }
    this.shift(-ph.length, ph);
  }

  private shift(dx: number, ph: RaijinPhaseDef) {
    const g = this.g;
    const before = { px: g.px, cam: g.camCX };
    const keepFrom = g.px - 600;
    // rings and strokes more than 600 u behind are dropped; the rest move with the traveler
    for (const r of g.portals.playerRings()) if (r.cx + r.r < keepFrom) g.portals.closeRing(r, true);
    const kept = g.strokes.filter((st) => st.bbox.x1 >= keepFrom);
    for (const st of kept) shiftStroke(st, dx);
    g.strokes = kept;
    g.portals.shiftWorld(dx, new Set(kept), shiftStroke);
    for (const p of g.particles.list) p.x += dx;
    g.px += dx;
    g.camCX += dx;
    g.worldShift -= dx;
    // Weather is screen-space but follows camera deltas: tell it the camera did not really move
    g.weather.shift(dx);
    for (const sc of this.scorches) sc.x += dx;
    const speed = g.level.rules.runSpeed;
    for (const s of this.strikes) {
      if (s.phase !== ph) continue;
      if (s.state === 'tele' || s.state === 'drop' || ((s.state === 'landed' || s.state === 'caught' || s.state === 'blocked') && s.age < 1)) {
        s.mark += dx;
        s.trigger += dx;
      } else Object.assign(s, this.makeStrike(s.def, s.phase, speed), { id: s.id });
    }
    // the phase lantern relights as you pass it again
    for (const l of g.level.lanterns) if (Math.abs(l.x - ph.lantern) < 1) l.lit = false;
    this.wraps++;
    // he rides with the camera: place him again now that it moved, or this frame draws him a loop away
    this.place(0);
    this.log({ kind: 'wrap', phase: ph.n, dx, from: before.px, to: g.px, cam: [before.cam, g.camCX], strokes: kept.length });
  }

  // ───────────────────────────────────────────── drawing

  /** How much storm the sky shows (fades in on the approach, out after the arena). */
  private storm() {
    const def = this.def;
    if (!def || !def.phases.length) return 0;
    const px = this.g.px;
    const [a, b] = this.range;
    // the finish tears the storm open
    const tear = this.finT0 < 0 ? 1 : 1 - clamp01((this.g.realT - this.finT0 - 0.3) / STORM_TEAR);
    return clamp01((px - (a - 1900)) / 800) * clamp01((b + 1200 - px) / 800) * tear;
  }

  /** The sky flash now: limiter-ramped, and held to 0.85 so the frame's mean luminance lifts by under 20 % (4.2). */
  private flashLevel() {
    return 0.85 * flashLimiter.level(this.g.realT - this.flashT0);
  }

  /** Screen space, right after the backdrop: the storm sky. */
  drawSky(ctx: CanvasRenderingContext2D) {
    if (!this.def || this.g.state === 'menu') return;
    const k = this.storm();
    if (k <= 0) return;
    this.sky.build(this.g.H / VIEW_H);
    this.sky.draw(ctx, this.g.W, this.g.H, k, this.flashLevel(), this.g.realT);
  }

  /** World, after the terrain: the arena road, scorches, and Raijin himself. */
  drawBack(ctx: CanvasRenderingContext2D, vx0: number, vx1: number) {
    const g = this.g;
    const def = this.def;
    if (!def || g.state === 'menu') return;
    for (const gr of this.ground) {
      gr.build(g.S);
      gr.draw(ctx, vx0, vx1);
    }
    for (const sc of this.scorches) if (sc.x > vx0 - 80 && sc.x < vx1 + 80) drawScorch(ctx, sc.x, def.groundY, sc.age, sc.seed);
    // the storm's grade: the whole view (paper, road, hills, sky) sinks into an ink wash; he, the marks, threads,
    // strokes and the traveler are drawn after it and keep their contrast
    const k = this.storm();
    if (k > 0) this.sky.grade(ctx, g.W, g.H, k, this.flashLevel(), g.realT);
    if (!this.active() || g.recorder.replaying || this.departK() >= 1) return;
    this.art.build(g.S);
    this.art.draw(ctx, this.look());
  }

  private look(): RaijinLook {
    const g = this.g;
    const e = clamp01((g.realT - this.enterT) / 1.5);
    const expr: Expr = this.hurtT > 0 && this.finT0 < 0 ? 'scowl' : 'grin';
    const lean = (this.hurtT > 0 ? -0.14 * this.hurtT : 0) + (this.laughT > 0 ? Math.sin(g.realT * 22) * 0.05 * this.laughT : 0) + (this.roarT > 0 ? -0.12 * Math.sin(Math.min(1, this.roarT / 1.2) * Math.PI) : 0);
    return {
      x: this.x,
      y: this.y,
      face: this.face,
      t: g.realT,
      alpha: e * (1 - this.departK()),
      hoopRot: this.hoopRot,
      drums: this.drums,
      front: this.front,
      back: this.back,
      expr,
      blot: this.drums.length ? this.soaked() / this.drums.length : 0,
      lean: lean * this.face,
    };
  }

  /** World, after the pale wash and before the strokes: marks and threads stay crisp while you paint over them. */
  drawMid(ctx: CanvasRenderingContext2D) {
    const g = this.g;
    const def = this.def;
    if (!def || !this.active() || g.recorder.replaying) return;
    const gy = def.groundY;
    const yTop = gy - DROP;
    const t = g.realT;
    // the threads come from the cloud behind him, never out of his body: his hoop is cut out of them
    ctx.save();
    this.clipHim(ctx);
    for (const s of this.strikes) {
      const T = s.def.tele;
      let appear = 0;
      let fill = 0;
      let grow = 0;
      let bright = 0;
      if (s.state === 'tele' || s.state === 'drop') {
        appear = s.el / 0.3;
        grow = s.el / 0.3;
        fill = clamp01((s.el - (T - 0.5)) / 0.15);
        bright = clamp01((s.el - (T - 0.5)) / 0.1);
      } else if ((s.state === 'caught' || s.state === 'blocked' || s.state === 'cancelled') && s.age < 0.3) {
        // caught or called off: the thread snaps back up into the cloud
        const k = 1 - s.age / 0.3;
        appear = k;
        grow = k;
      } else continue;
      // (the marks lie on the road, far below the cut-out)
      drawMark(ctx, s.mark, gy, appear, fill, t + s.seed);
      drawThread(ctx, s.mark, yTop, gy, grow, bright, t, s.id);
    }
    ctx.restore();
    for (const tr of this.tears) drawTear(ctx, tr.x, tr.y, tr.r, (t - tr.t0) / 0.6);
  }

  /** Clip out his hoop (world transform set): a thread or a falling bolt is drawn behind him, from the cloud. */
  private clipHim(ctx: CanvasRenderingContext2D) {
    const R = HOOP_R + DRUM_R + 6;
    ctx.beginPath();
    ctx.rect(this.x - 4000, this.y - 4000, 8000, 8000);
    ctx.ellipse(this.x, this.y, R * 1.04, R * 0.96, 0, 0, Math.PI * 2);
    ctx.clip('evenodd');
  }

  /** World, over everything: impact columns and, while dying, the cause outlined (N10). */
  drawFront(ctx: CanvasRenderingContext2D) {
    const g = this.g;
    const def = this.def;
    if (!def || !this.active() || g.recorder.replaying) return;
    const gy = def.groundY;
    for (const s of this.strikes) if (s.state === 'landed') drawImpact(ctx, s.mark, gy - DROP, gy, s.age, s.seed, s.glow, COLUMN_HW);
    // the cause (N10) shows from the hit-stop on, before anything else changes
    const dying = g.state === 'dying' || (g.freezeT > 0 && this.cause);
    if (dying && this.cause) drawCause(ctx, this.cause.mark, gy - DROP, gy, g.state === 'dying' ? Math.sin(clamp01(g.dieT / 0.9) * Math.PI) * 0.6 + 0.4 : 1, COLUMN_HW);
  }

  /** For the proof page and its assertions: live strikes in a compact form. */
  snapshot() {
    return {
      x: this.x,
      y: this.y,
      sx: this.sx,
      active: this.active(),
      /** painted in fully (the entrance is over) */
      arrived: this.active() && this.g.realT - this.enterT >= 1.5,
      /** his drum ring's box, world units (the drums' outer edges) */
      ring: { x0: this.x - HOOP_R * 1.04 - DRUM_R, x1: this.x + HOOP_R * 1.04 + DRUM_R, y0: this.y - RING_TOP, y1: this.y + RING_TOP },
      phase: this.phaseIndex(),
      cleaned: this.cleaned,
      soaked: this.soaked(),
      cleared: [...this.cleared],
      wraps: this.wraps,
      /** seconds since the finish beat began (-1 before) */
      finale: this.finT0 < 0 ? -1 : this.g.realT - this.finT0,
      rainZones: this.g.level.rainZones.map((z) => [...z]),
      strikes: this.strikes.map((s) => ({ id: s.id, state: s.state, mark: s.mark, trigger: s.trigger, el: s.el, tele: s.def.tele, group: s.def.group })),
    };
  }
}

/** Where a traveler standing at x would be hit (for tests): the mark's lethal span. */
export function lethalSpan(mark: number): [number, number] {
  return [mark - COLUMN_HW - PLAYER_HW, mark + COLUMN_HW + PLAYER_HW];
}
export const TRAVELER_H = PLAYER_H;
