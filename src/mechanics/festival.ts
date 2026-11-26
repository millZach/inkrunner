/**
 * The Summer festival and sky beats (docs/summer-design.md 3.0 and N13): the lantern lines (`Course.festoon`,
 * `dip`) that light in a cascade as you pass, fireworks (`Course.hanabi`) triggered by position so clips always
 * match, background flashes (`Course.flash`, through the flash limiter), the master's sketched rings
 * (`Course.sketch`), stall-arcade eaves (`Course.arcade`), and the sky changes (`Course.sky`).
 *
 * Game calls reset() on load, update() each frame, drawBack() after the terrain, drawSky() via skyNow().
 * Everything here is decor or light: nothing collides.
 */
import { VIEW_H } from '../config';
import type { Game } from '../game';
import { groundY, islandAt, type Festoon, type HanabiDef, type SkyId } from '../level';
import type { Vec } from '../math';
import { drawArcade, drawChochin, drawFestoonLine, drawHanabi, drawSketchRing, hanabiLive, type ChochinLook } from '../render/decor';

const POST_STEP = 420;
const POST_H = 250;
const LANTERN_STEP = 64;
/** a lantern lights when the traveler is this far from it (the cascade runs ahead of you) */
const LIGHT_AHEAD = 520;
/** how long a sky change takes to cross-fade, seconds */
const SKY_FADE = 2.2;

interface FestoonRun {
  def: Festoon;
  posts: Vec[];
  rope: Vec[];
  lanterns: { x: number; y: number; litT: number }[];
}

interface HanabiRun {
  def: HanabiDef;
  /** real time it was launched (-1 = not yet) */
  t0: number;
  /** where it blooms, as a fraction of the view, and the camera when it launched (it drifts like the far hills) */
  sx: number;
  sy: number;
  cam: number;
  seed: number;
}

export class Festival {
  private festoons: FestoonRun[] = [];
  private hanabi: HanabiRun[] = [];
  private flashes: { x: number; raijin: boolean; done: boolean; wait: number }[] = [];
  private shifts: { x: number; sky: SkyId; done: boolean }[] = [];
  /** the sky now: from → to, k 0..1 of the cross-fade */
  sky: { from: SkyId | null; to: SkyId | null; k: number } = { from: null, to: null, k: 1 };
  private prevState = '';

  constructor(private g: Game) {}

  reset() {
    const L = this.g.level;
    this.festoons = (L.festoons ?? []).map((f) => this.layFestoon(f));
    this.hanabi = (L.hanabi ?? []).map((h, i) => ({ def: h, t0: -1, sx: h.size === 'great' ? 0.56 : 0.66, sy: h.size === 'great' ? 0.26 : 0.22, cam: 0, seed: 7000 + i * 131 }));
    this.flashes = (L.flashes ?? []).map((f) => ({ ...f, done: false, wait: 0 }));
    this.shifts = [...(L.skyShifts ?? [])].sort((a, b) => a.x - b.x).map((s) => ({ ...s, done: false }));
    this.sky = { from: L.sky ?? null, to: L.sky ?? null, k: 1 };
    this.prevState = '';
  }

  /**
   * Back at a lantern after a death: the set pieces ahead of it play again, and the sky returns to the one in force
   * there, so a death just past a trigger never uses up a firework or a sky change.
   */
  private onRespawn() {
    const g = this.g;
    const px = g.px;
    for (const h of this.hanabi) if (h.def.x > px) h.t0 = -1;
    for (const f of this.flashes) if (f.x > px) { f.done = false; f.wait = 0; }
    let want: SkyId | null = g.level.sky ?? null;
    for (const s of this.shifts) {
      if (s.x > px) s.done = false;
      else want = s.sky;
    }
    if (want !== this.sky.to) this.sky = { from: this.sky.k >= 0.5 ? this.sky.to : this.sky.from, to: want, k: 0 };
  }

  /** Posts on ground every ~420 u (none over a gap), a sagging rope between them, lanterns hung along it. */
  private layFestoon(f: Festoon): FestoonRun {
    const L = this.g.level;
    const posts: Vec[] = [];
    for (let x = f.x0; x <= f.x1 + 1; x += POST_STEP) {
      if (!islandAt(L, x) || L.pillars.some((p) => x > p.x - 60 && x < p.x + p.w + 60)) continue;
      posts.push({ x, y: groundY(L, x) });
    }
    const rope: Vec[] = [];
    const lanterns: FestoonRun['lanterns'] = [];
    for (let i = 0; i + 1 < posts.length; i++) {
      const a = posts[i];
      const b = posts[i + 1];
      const span = b.x - a.x;
      const sag = Math.min(90, 22 + span * 0.06);
      const n = Math.max(2, Math.round(span / 24));
      for (let k = i ? 1 : 0; k <= n; k++) {
        const u = k / n;
        const x = a.x + span * u;
        let y = a.y - POST_H + (b.y - a.y) * u + sag * 4 * u * (1 - u);
        for (const d of f.dips) y += d.depth * Math.exp(-(((x - d.x) / 130) ** 2));
        rope.push({ x, y });
      }
    }
    for (let x = f.x0 + LANTERN_STEP / 2; x < f.x1; x += LANTERN_STEP) {
      const p = this.ropeAt(rope, x);
      if (p) lanterns.push({ x, y: p, litT: -1 });
    }
    return { def: f, posts, rope, lanterns };
  }

  private ropeAt(rope: Vec[], x: number): number | null {
    for (let i = 0; i + 1 < rope.length; i++) {
      const a = rope[i];
      const b = rope[i + 1];
      if (x >= a.x && x <= b.x) return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x || 1);
    }
    return null;
  }

  update(dt: number, dtReal: number) {
    const g = this.g;
    if (g.state === 'menu') return;
    if (this.prevState === 'dying' && g.state === 'play') this.onRespawn();
    this.prevState = g.state;
    const px = g.px;
    const play = g.state === 'play' || g.state === 'finish';
    for (const f of this.festoons) {
      if (f.def.x0 > px + LIGHT_AHEAD + 40 || f.def.x1 < px - 2000) continue;
      for (const l of f.lanterns) {
        if (l.litT < 0) {
          if (play && px + LIGHT_AHEAD >= l.x) l.litT = 0;
        } else l.litT += dt;
      }
    }
    for (const h of this.hanabi) {
      if (h.t0 < 0 && play && px >= h.def.x) {
        h.t0 = g.realT;
        h.cam = g.camCX;
        g.audio.festivalFx('whistle', 0.3);
      } else if (h.t0 >= 0) {
        const age = g.realT - h.t0;
        const before = age - dtReal;
        if (before < 0.9 && age >= 0.9) g.audio.festivalFx('bloom', h.def.size === 'great' ? 1 : h.def.size === 'first' ? 0.7 : 0.45);
      }
    }
    for (const f of this.flashes) {
      if (f.done || !play || px < f.x) continue;
      // the beat waits up to 3 s for the limiter, then gives up (a missed flash is safer than a stacked one)
      if (g.skyFlash(f.raijin ? 1 : 0.7, { raijin: f.raijin })) {
        f.done = true;
        g.audio.festivalFx('thunder', f.raijin ? 0.6 : 0.3);
      } else if ((f.wait += dtReal) > 3) f.done = true;
    }
    for (const s of this.shifts) {
      if (s.done || px < s.x) continue;
      s.done = true;
      // a change that comes mid-fade starts from whichever sky is nearer done
      this.sky = { from: this.sky.k >= 0.5 ? this.sky.to : this.sky.from, to: s.sky, k: 0 };
    }
    if (this.sky.k < 1) this.sky.k = Math.min(1, this.sky.k + dtReal / SKY_FADE);
  }

  /** The sky to paint: `id` the incoming sky, `prev` the one it fades in over, `k` 0..1 of the cross-fade. */
  skyNow(): { id: SkyId | null; prev: SkyId | null; k: number } {
    return { id: this.sky.to, prev: this.sky.from, k: this.sky.k };
  }

  /** World, after the terrain: arcades, lantern lines, sketches. */
  drawBack(ctx: CanvasRenderingContext2D, vx0: number, vx1: number) {
    const g = this.g;
    const L = g.level;
    const t = g.realT;
    for (const a of L.arcades ?? []) {
      if (a.x1 < vx0 - 100 || a.x0 > vx1 + 100) continue;
      drawArcade(ctx, a.x0, a.x1, (x) => groundY(L, x), vx0, vx1, t);
    }
    for (const f of this.festoons) {
      if (f.def.x1 < vx0 - 100 || f.def.x0 > vx1 + 100) continue;
      const rope = f.rope.filter((p) => p.x > vx0 - 80 && p.x < vx1 + 80);
      const posts = f.posts.filter((p) => p.x > vx0 - 40 && p.x < vx1 + 40);
      drawFestoonLine(ctx, rope, posts, POST_H);
      const ls: ChochinLook[] = [];
      for (const l of f.lanterns) {
        if (l.x < vx0 - 40 || l.x > vx1 + 40) continue;
        ls.push({ x: l.x, y: l.y, lit: l.litT < 0 ? 0 : Math.min(1, l.litT / 0.35), sway: Math.sin(t * 1.4 + l.x * 0.05) * 0.08 });
      }
      drawChochin(ctx, ls, t);
    }
    for (const s of L.sketches ?? []) if (s.x > vx0 - 100 && s.x < vx1 + 100) drawSketchRing(ctx, s.x, s.y, s.r, t);
  }

  /** Screen space, right after the backdrop's hills: fireworks over the far hills. */
  drawFireworks(ctx: CanvasRenderingContext2D) {
    const g = this.g;
    if (!this.hanabi.length || g.state === 'menu') return;
    const S = g.S;
    const viewW = g.W / S;
    for (const h of this.hanabi) {
      if (h.t0 < 0) continue;
      const age = g.realT - h.t0;
      if (!hanabiLive(age)) continue;
      // far away: it drifts left at a fifth of the ground's speed
      const x = h.sx * viewW - (g.camCX - h.cam) * 0.2;
      const y = h.sy * VIEW_H;
      ctx.setTransform(S, 0, 0, S, 0, 0);
      drawHanabi(ctx, { x, y, age, size: h.def.size, seed: h.seed, y0: VIEW_H * 0.75 });
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** For proofs and tests. */
  snapshot() {
    return {
      sky: this.sky,
      hanabi: this.hanabi.map((h) => ({ x: h.def.x, size: h.def.size, fired: h.t0 >= 0 })),
      flashes: this.flashes.map((f) => ({ x: f.x, raijin: f.raijin, done: f.done })),
      festoons: this.festoons.map((f) => ({ x0: f.def.x0, x1: f.def.x1, lit: f.lanterns.filter((l) => l.litT >= 0).length, n: f.lanterns.length })),
    };
  }
}
