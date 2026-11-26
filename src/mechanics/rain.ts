import { INKS, VIEW_H } from '../config';
import type { Game } from '../game';
import { groundY, islandAt, type Level, type RainRules, type ScrollRules } from '../level';
import { clamp } from '../math';
import { rgba } from '../render/brush';
import { RainLook, type RainView, type RippleSurface } from '../render/weather';
import { mulberry32 } from '../rng';
import type { Stroke } from '../strokes';

/**
 * Rain, the 転 twist (docs/summer-design.md section 2).
 *
 * - Only 朱 vermilion washes. Purple rings, indigo and gold are never touched.
 * - A vermilion stroke is "in rain" when its bounding box overlaps a rain zone at brush lift (Level.rainZones;
 *   a rainy scroll with no zones rains everywhere). A stroke painted outside stays dry forever.
 * - One clock per scroll, in game time from brush lift: `hold` wet (solid), then `warn` running (still fully
 *   solid: drips, colour drift to pale coral, bleed streaks, a shiver at the end), then gone (not solid; a 0.25 s
 *   dissolve and a 3 s pink stain, both cosmetic). Game time never outruns real time and `warn` >= 1.0, so every
 *   stroke shows at least one second of warning, including one under the traveler.
 * - The stage is derived from the stroke's age, so replays need no extra data. Live play also keeps a record per
 *   stroke (`log`) with wall-clock stage times, frames drawn in warning, and whether the traveler stood on it:
 *   the proof assertions read those (tools/proofs/rain.mjs).
 *
 * Game hooks (kept to single lines in game.ts): onStroke at brush lift, update each frame, drawBack after the
 * terrain, drawStroke in place of Stroke.draw, drawFront after particles, drawHUD after the ink stones;
 * surfaceBelow skips `stroke.washed`.
 */

export type WashStage = 'dry' | 'wet' | 'running' | 'gone';

/** cosmetic: the pigment letting go after the warning */
export const DISSOLVE = 0.25;
/** cosmetic: the faint pink stain left on the paper */
export const STAIN = 3;
/** drip particles alive at once, across all strokes */
export const MAX_DRIPS = 60;

export interface WashRecord {
  id: number;
  kind: Stroke['kind'];
  inRain: boolean;
  x0: number;
  x1: number;
  cost: number;
  /** game time at brush lift */
  bornT: number;
  bornWall: number;
  /** game time / wall-clock seconds (performance.now) when the warning began */
  runT?: number;
  runWall?: number;
  /** when the stroke stopped being solid */
  goneT?: number;
  goneWall?: number;
  /** the traveler stood on it when the warning began / when it went */
  underAtRun?: boolean;
  underAtGone?: boolean;
  /** real seconds the traveler spent standing on it while it was running */
  underWarn: number;
  /** frames drawn in the warning state, and the wall-clock span they cover */
  warnFrames: number;
  firstWarnWall?: number;
  lastWarnWall?: number;
  /** removed by something other than the rain (undo, a restart): the stage it was in */
  removed?: { stage: WashStage; wall: number; t: number };
}

/** The scroll's wash clock, or null when it is dry. */
export function rainOf(rules: ScrollRules): RainRules | null {
  return rules.rain ? rules.rain : null;
}

/** Does [x0, x1] overlap rain on this scroll? (No zones listed on a rainy scroll means rain everywhere.) */
export function overlapsRain(level: Level, rules: ScrollRules, x0: number, x1: number): boolean {
  if (!rules.rain) return false;
  const zones = level.rainZones ?? [];
  if (!zones.length) return true;
  return zones.some(([a, b]) => x1 >= a && x0 <= b);
}

export function rainAt(level: Level, rules: ScrollRules, x: number): boolean {
  return overlapsRain(level, rules, x, x);
}

/** Stage from age alone (how replays see it). */
export function washAt(age: number, c: RainRules): { stage: WashStage; k: number } {
  if (age < c.hold) return { stage: 'wet', k: c.hold > 0 ? age / c.hold : 1 };
  if (age < c.hold + c.warn) return { stage: 'running', k: (age - c.hold) / c.warn };
  return { stage: 'gone', k: age - c.hold - c.warn };
}

type Sprite = NonNullable<Stroke['sprite']>;

interface Underside {
  x: number;
  y: number;
  len: number; // bleed streak length, 20..80
  delay: number; // when in the warning this streak starts (0..0.4)
  bead: number; // bead size factor; 0 = no bead here
  wob: number;
}

const nowWall = () => performance.now() / 1000;
const smooth = (x: number) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

function drawSprite(ctx: CanvasRenderingContext2D, sp: Sprite, canvas: HTMLCanvasElement = sp.canvas, dy = 0, sy = 1) {
  const w = sp.canvas.width / sp.s;
  const h = sp.canvas.height / sp.s;
  ctx.drawImage(canvas, sp.x, sp.y + dy, w, h * sy);
}

export class RainSystem {
  readonly look = new RainLook();
  readonly log: WashRecord[] = [];
  /** 0..1, eases toward 1 while the scroll rains (so the proof page's toggle fades rather than pops) */
  lookK: number;
  private recs = new WeakMap<Stroke, WashRecord>();
  private seen = new Set<Stroke>();
  private pale = new WeakMap<Sprite, HTMLCanvasElement>();
  private under = new WeakMap<Stroke, Underside[]>();
  private fading: { st: Stroke; t: number }[] = [];
  private drips: number[] = []; // game-time expiry of each live drip
  private landings: { x: number; y: number; t: number }[] = [];
  private audio = SOUND;
  private nextId = 1;
  private lastDensity = 1;
  private thunderT = 6;

  constructor(private game: Game) {
    this.lookK = rainOf(game.rules) ? 1 : 0;
  }

  get clock(): RainRules | null {
    return rainOf(this.game.rules);
  }

  get zones(): [number, number][] {
    return this.game.level.rainZones ?? [];
  }

  /** The traveler is standing in rain right now. */
  get travelerInRain(): boolean {
    return !!this.clock && rainAt(this.game.level, this.game.rules, this.game.px);
  }

  recordOf(st: Stroke): WashRecord | undefined {
    return this.recs.get(st);
  }

  /** At brush lift: decide once whether this stroke is in rain, and start its record. */
  onStroke(st: Stroke) {
    const g = this.game;
    st.inRain = st.kind === 'shu' && overlapsRain(g.level, g.rules, st.bbox.x0, st.bbox.x1);
    const rec: WashRecord = {
      id: this.nextId++,
      kind: st.kind,
      inRain: st.inRain,
      x0: Math.round(st.bbox.x0),
      x1: Math.round(st.bbox.x1),
      cost: st.cost,
      bornT: st.bornT,
      bornWall: nowWall(),
      underWarn: 0,
      warnFrames: 0,
    };
    this.recs.set(st, rec);
    this.log.push(rec);
    if (this.log.length > 400) this.log.shift();
  }

  /** The current stage of a stroke and its progress through it. */
  stageOf(st: Stroke): { stage: WashStage; k: number } {
    const c = this.clock;
    if (!st.inRain || !c) return { stage: 'dry', k: 0 };
    if (this.game.recorder.replaying) return washAt(st.age, c);
    if (st.washed) return { stage: 'gone', k: 0 };
    const rec = this.recs.get(st);
    if (!rec) return washAt(st.age, c);
    if (rec.runT === undefined) return { stage: 'wet', k: c.hold > 0 ? clamp(st.age / c.hold, 0, 1) : 1 };
    return { stage: 'running', k: clamp((this.game.t - rec.runT) / c.warn, 0, 1) };
  }

  /** Is the traveler standing on this stroke? */
  private supports(st: Stroke): boolean {
    const g = this.game;
    if (!g.grounded || g.ride || g.state !== 'play') return false;
    const x = g.px;
    if (x < st.bbox.x0 || x > st.bbox.x1) return false;
    const s = st.surface;
    for (let i = 0; i < s.length - 1; i++) {
      const a = s[i];
      const b = s[i + 1];
      const lo = Math.min(a.x, b.x);
      const hi = Math.max(a.x, b.x);
      if (x < lo || x > hi || hi - lo < 0.01) continue;
      const y = a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
      if (Math.abs(y - g.py) < 2.5) return true;
    }
    return false;
  }

  private undersideOf(st: Stroke): Underside[] {
    let u = this.under.get(st);
    if (u) return u;
    u = [];
    const r = mulberry32(st.seed + 77);
    const step = Math.max(4, Math.round(st.pts.length / 36));
    for (let i = 2; i < st.pts.length - 2; i += step) {
      const p = st.pts[i];
      u.push({
        x: p.x + (r() - 0.5) * 6,
        y: p.y + p.w * 0.38,
        len: 20 + r() * 60,
        delay: r() * 0.4,
        bead: r() < 0.6 ? 0.6 + r() * 0.6 : 0,
        wob: (r() - 0.5) * 6,
      });
    }
    this.under.set(st, u);
    return u;
  }

  // ───────────────────────────────────────────── simulation

  /** Each frame, after strokes have aged. `dt` is game time, `dtReal` real time. */
  update(dt: number, dtReal: number) {
    const g = this.game;
    const c = this.clock;
    if (c) this.lastDensity = c.density ?? 1;
    this.lookK += ((c ? 1 : 0) - this.lookK) * Math.min(1, dtReal * 2.5);
    const wall = nowWall();
    let washed = false;
    let tickK = -1;
    for (const st of g.strokes) {
      if (!st.inRain) continue;
      const rec = this.recs.get(st);
      if (!c) {
        // rain switched off (proof page): nothing runs, and a stroke that was running starts its warning over
        if (rec && rec.runT !== undefined && rec.goneT === undefined) {
          rec.runT = rec.runWall = undefined;
          rec.firstWarnWall = rec.lastWarnWall = undefined;
          rec.warnFrames = 0;
        }
        continue;
      }
      if (!rec) continue;
      if (rec.runT === undefined) {
        if (st.age < c.hold) continue;
        rec.runT = g.t;
        rec.runWall = wall;
        rec.underAtRun = this.supports(st);
      }
      const k = (g.t - rec.runT) / c.warn;
      if (k >= 1) {
        rec.goneT = g.t;
        rec.goneWall = wall;
        rec.underAtGone = this.supports(st);
        st.washed = true;
        washed = true;
        this.letGo(st);
        continue;
      }
      if (this.supports(st)) rec.underWarn += dtReal;
      this.drip(st, k, dt);
      if (st.bbox.x1 > g.camCX - 900 && st.bbox.x0 < g.camCX + 900) tickK = Math.max(tickK, k);
    }
    if (washed) g.strokes = g.strokes.filter((s) => !s.washed);

    // strokes that left for another reason (undo, a restart) keep the stage they were in, for the record
    const now = new Set(g.strokes);
    for (const st of this.seen) {
      if (now.has(st) || st.washed) continue;
      const rec = this.recs.get(st);
      if (rec && !rec.removed) rec.removed = { stage: this.stageOf(st).stage, wall, t: g.t };
    }
    this.seen = now;

    // drips that reach the ground make ripples; fading strokes run out
    this.drips = this.drips.filter((t) => t > g.t);
    for (const l of this.landings) if (l.t <= g.t) this.look.addRipple(l.x, l.y, rgba(INKS.shu.light, 0.85), 8);
    this.landings = this.landings.filter((l) => l.t > g.t);
    this.fading = this.fading.filter((f) => g.t - f.t < STAIN);

    // rain does not put out the blot's fire: it hisses on it as steam
    if (c && dt > 0) {
      for (const f of g.level.fires) {
        if (!f.alive || Math.abs(f.x - g.camCX) > 1100 || !rainAt(g.level, g.rules, f.x + f.w / 2)) continue;
        if (Math.random() < dt * 5) g.particles.spawn('steam', f.x + Math.random() * f.w, f.y - f.h * (0.5 + Math.random() * 0.4), (Math.random() - 0.5) * 20, -30, 1.1, 5);
      }
    }

    // sound: the hiss swells as you near a zone; drips tick faster and higher through the warning
    const playing = g.state === 'play' || g.state === 'dying';
    let wet = 0;
    if (c && playing) {
      const zones = this.zones;
      if (!zones.length) wet = 1;
      else {
        let d = Infinity;
        for (const [a, b] of zones) d = Math.min(d, g.px < a ? a - g.px : g.px > b ? g.px - b : 0);
        wet = clamp(1 - d / 600, 0, 1);
      }
    }
    if ((c || this.audio.attached) && this.audio.attach(g.audio)) {
      this.audio.bed(wet * Math.min(1.4, 0.6 + 0.4 * this.lastDensity));
      if (tickK >= 0 && playing) this.audio.tick(tickK);
      if (wet >= 1 && playing) {
        this.thunderT -= dt;
        if (this.thunderT <= 0) {
          this.thunderT = 10 + Math.random() * 8;
          // far lightning lights the cloud first, through the one flash limiter (N19); skipped when it says no
          g.skyFlash(0.4);
          this.audio.thunder(0.5);
        }
      }
    }
  }

  /** Drips bead on the underside and fall, faster as the warning runs out. */
  private drip(st: Stroke, k: number, dt: number) {
    const g = this.game;
    if (this.drips.length >= MAX_DRIPS || dt <= 0) return;
    if (Math.abs((st.bbox.x0 + st.bbox.x1) / 2 - g.camCX) > 1400) return;
    const rate = (2 + 12 * k) * Math.max(0.6, st.length / 200);
    if (Math.random() >= rate * dt) return;
    const u = this.undersideOf(st);
    if (!u.length) return;
    const p = u[Math.floor(Math.random() * u.length)];
    const life = 0.9;
    g.particles.spawn('paint', p.x, p.y + 2, (Math.random() - 0.5) * 12, 20 + Math.random() * 40, life, 1.5 + Math.random() * 1.3, k < 0.5 ? INKS.shu.color : INKS.shu.light);
    this.drips.push(g.t + life);
    const gy = groundY(g.level, p.x);
    if (islandAt(g.level, p.x) && gy > p.y) this.landings.push({ x: p.x, y: gy, t: g.t + Math.sqrt((2 * (gy - p.y)) / 1400) });
  }

  /** The warning has run out: the pigment lets go as a sheet of pale drops, with a soft "shhh". */
  private letGo(st: Stroke) {
    const g = this.game;
    this.fading.push({ st, t: g.t });
    const n = clamp(Math.round(st.length / 12), 10, 36);
    for (let i = 0; i < n; i++) {
      const q = st.pts[Math.floor(Math.random() * st.pts.length)];
      g.particles.spawn('paint', q.x, q.y, (Math.random() - 0.5) * 50, 10 + Math.random() * 120, 0.9, 1.8 + Math.random() * 1.6, i % 3 ? INKS.shu.light : '#f6b8a8');
    }
    for (let i = 0; i < 6; i++) {
      const q = st.pts[Math.floor(Math.random() * st.pts.length)];
      if (!islandAt(g.level, q.x)) continue;
      const gy = groundY(g.level, q.x);
      if (gy > q.y) this.landings.push({ x: q.x, y: gy, t: g.t + Math.sqrt((2 * (gy - q.y)) / 1400) + Math.random() * 0.1 });
    }
    if (this.audio.attach(g.audio)) this.audio.wash();
  }

  // ───────────────────────────────────────────── rendering

  private view(): RainView {
    const g = this.game;
    const S = g.S;
    return { camX: g.camCX - g.W / (2 * S), camY: g.camCY - g.H / (2 * S), S, W: g.W, H: g.H, hs: g.H / VIEW_H, t: g.realT };
  }

  /** Right after the terrain (world transform set): storm wash, clouds, wet line, puddles, ripples, stains. */
  drawBack(ctx: CanvasRenderingContext2D) {
    if (this.lookK <= 0.001) return;
    const g = this.game;
    const v = this.view();
    const vx0 = v.camX - 60;
    const vx1 = v.camX + v.W / v.S + 60;
    const surfaces: RippleSurface[] = [];
    for (const isl of g.level.islands) if (isl.x1 > vx0 && isl.x0 < vx1) surfaces.push({ pts: isl.pts, color: '' });
    const shu = rgba(INKS.shu.color, 0.9);
    for (const st of g.strokes) {
      if (st.inRain && !st.washed && st.bbox.x1 > vx0 && st.bbox.x0 < vx1) surfaces.push({ pts: st.surface, color: shu });
    }
    this.look.drawBack(ctx, v, this.zones, this.lastDensity, this.lookK, surfaces, g.level.lanterns);
    // a faint pink stain where a bridge washed away
    if (this.fading.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      for (const f of this.fading) {
        const sp = f.st.sprite;
        if (!sp) continue;
        const u = (g.t - f.t) / STAIN;
        ctx.globalAlpha = 0.22 * (1 - u) * (1 - u);
        drawSprite(ctx, sp, this.paleOf(sp), 6, 1.04);
      }
      ctx.restore();
    }
  }

  /** In place of Stroke.draw: dry and wet strokes draw as usual; running ones show the warning. */
  drawStroke(ctx: CanvasRenderingContext2D, st: Stroke, pulse: number) {
    const w = this.stageOf(st);
    if (w.stage === 'gone') return;
    const live = !this.game.recorder.replaying;
    if (w.stage !== 'running') {
      st.draw(ctx, pulse);
      if (w.stage === 'wet' && st.wet) {
        // still glossy: the bleed never quite dries in the rain
        ctx.globalAlpha = 0.2;
        drawSprite(ctx, st.wet);
        ctx.globalAlpha = 1;
      }
      return;
    }
    if (live) {
      const rec = this.recs.get(st);
      if (rec) {
        const t = nowWall();
        rec.warnFrames++;
        rec.firstWarnWall ??= t;
        rec.lastWarnWall = t;
      }
    }
    this.drawRunning(ctx, st, w.k);
  }

  private paleOf(sp: Sprite): HTMLCanvasElement {
    let c = this.pale.get(sp);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = sp.canvas.width;
    c.height = sp.canvas.height;
    const p = c.getContext('2d')!;
    p.drawImage(sp.canvas, 0, 0);
    p.globalCompositeOperation = 'source-atop';
    p.fillStyle = rgba(INKS.shu.light, 0.78);
    p.fillRect(0, 0, c.width, c.height);
    p.fillStyle = 'rgba(255,214,200,0.38)';
    p.fillRect(0, 0, c.width, c.height);
    this.pale.set(sp, c);
    return c;
  }

  /** The warning: colour drifts to pale coral, the stroke thins, bleed streaks run down, beads swell and drop. */
  private drawRunning(ctx: CanvasRenderingContext2D, st: Stroke, k: number) {
    const sp = st.sprite;
    if (!sp) return;
    const t = this.game.realT;
    const fade = 1 - 0.42 * k;
    const shiver = k > 0.65 ? Math.sin(t * 47 + st.seed) * 1.6 * ((k - 0.65) / 0.35) : 0;
    ctx.save();
    ctx.translate(shiver, 0);
    if (st.glow) {
      ctx.globalAlpha = 0.3 * fade;
      drawSprite(ctx, st.glow);
    }
    ctx.globalAlpha = (1 - k) * fade;
    drawSprite(ctx, sp);
    ctx.globalAlpha = Math.min(1, k * 1.15) * fade;
    drawSprite(ctx, sp, this.paleOf(sp));

    // bleed streaks run down from the underside, 20 to 80 units
    const u = this.undersideOf(st);
    ctx.lineCap = 'round';
    for (const pass of [0, 1]) {
      ctx.globalAlpha = (pass ? 0.55 : 0.22) * fade;
      ctx.strokeStyle = pass ? INKS.shu.color : INKS.shu.light;
      ctx.lineWidth = pass ? 1.6 : 4.2;
      ctx.beginPath();
      for (const p of u) {
        const len = p.len * smooth((k - p.delay) / 0.6);
        if (len < 1) continue;
        ctx.moveTo(p.x, p.y);
        ctx.quadraticCurveTo(p.x + p.wob * 0.5, p.y + len * 0.5, p.x + p.wob, p.y + len * (pass ? 1 : 0.8));
      }
      ctx.stroke();
    }
    // beads swell on the underside, each dropping and re-forming on its own beat
    ctx.globalAlpha = fade;
    ctx.fillStyle = k < 0.5 ? INKS.shu.color : INKS.shu.light;
    ctx.beginPath();
    for (const p of u) {
      if (!p.bead) continue;
      const cyc = (t * (0.9 + 1.6 * k) + p.delay * 7) % 1;
      const r = (1.2 + 2.6 * k) * p.bead * (0.5 + 0.5 * cyc);
      const y = p.y + 1 + r * 0.8 + cyc * cyc * 3;
      ctx.moveTo(p.x + r, y);
      ctx.ellipse(p.x, y, r * 0.85, r * 1.1, 0, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** After the particles: the dissolving pigment, then the streaks of rain in front of everything. */
  drawFront(ctx: CanvasRenderingContext2D) {
    const g = this.game;
    if (this.fading.length && !g.recorder.replaying) {
      for (const f of this.fading) {
        const u = (g.t - f.t) / DISSOLVE;
        if (u >= 1 || !f.st.sprite) continue;
        ctx.globalAlpha = 0.55 * (1 - u);
        drawSprite(ctx, f.st.sprite, this.paleOf(f.st.sprite), u * 14, 1 + u * 0.15);
      }
      ctx.globalAlpha = 1;
    }
    if (this.lookK <= 0.001) return;
    this.look.drawFront(ctx, this.view(), this.zones, this.lastDensity, this.lookK);
  }

  /** After the ink stones: drops run down the 朱 stone while the traveler is in rain. */
  drawHUD(ctx: CanvasRenderingContext2D, stones: { k: string; x: number; y: number; r: number }[]) {
    if (!this.travelerInRain || this.lookK < 0.5) return;
    const s = stones.find((q) => q.k === 'shu');
    if (s) this.look.drawStoneDrops(ctx, s, this.game.realT, this.game.H / VIEW_H);
  }
}

// ─────────────────────────────────────────────────────────────── sound

/**
 * Procedural rain sound on the game's own Web Audio graph: a hiss bed with patter (rain on paper umbrellas),
 * drip ticks that climb through a stroke's warning, a soft "shhh" when one washes away, and far thunder.
 */
class RainAudio {
  private ctx: AudioContext | null = null;
  private fx!: AudioNode;
  private bedGain!: GainNode;
  private noise!: AudioBuffer;
  private nextTick = 0;
  private level = -1;

  get attached() {
    return this.ctx !== null;
  }

  /** Connect to the game's audio once it exists; false until then. */
  attach(audio: Game['audio']): boolean {
    const buses = audio.buses();
    if (!buses || !audio.ctx) return false;
    if (this.ctx === audio.ctx) return true;
    const ctx = audio.ctx;
    this.ctx = ctx;
    this.fx = buses.fx;
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * 2);
    this.noise = ctx.createBuffer(1, len, sr);
    const n = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) n[i] = Math.random() * 2 - 1;
    // patter: sparse little decaying taps, like drops on paper and wood
    const pat = ctx.createBuffer(1, len, sr);
    const d = pat.getChannelData(0);
    for (let j = 0; j < 260; j++) {
      const at = Math.floor(Math.random() * (len - 600));
      const amp = 0.2 + Math.random() * 0.8;
      const dec = 60 + Math.random() * 260;
      for (let i = 0; i < 500; i++) d[at + i] += (Math.random() * 2 - 1) * amp * Math.exp(-i / dec);
    }
    this.bedGain = ctx.createGain();
    this.bedGain.gain.value = 0;
    this.bedGain.connect(buses.ambient);
    const hiss = ctx.createBufferSource();
    hiss.buffer = this.noise;
    hiss.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 700;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 6000;
    const hg = ctx.createGain();
    hg.gain.value = 0.55;
    hiss.connect(hp);
    hp.connect(lp);
    lp.connect(hg);
    hg.connect(this.bedGain);
    const patter = ctx.createBufferSource();
    patter.buffer = pat;
    patter.loop = true;
    patter.playbackRate.value = 0.93;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2400;
    bp.Q.value = 0.9;
    const pg = ctx.createGain();
    pg.gain.value = 0.9;
    patter.connect(bp);
    bp.connect(pg);
    pg.connect(this.bedGain);
    hiss.start();
    patter.start();
    return true;
  }

  bed(level: number) {
    if (!this.ctx || Math.abs(level - this.level) < 0.01) return;
    this.level = level;
    this.bedGain.gain.setTargetAtTime(0.11 * level, this.ctx.currentTime, 0.25);
  }

  /** One drip tick on the beat grid; called every frame while a stroke on screen is running. */
  tick(k: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const grid = 0.16; // an eighth note at the music's walking pace
    const every = k < 0.45 ? 2 : 1;
    const now = ctx.currentTime;
    if (this.nextTick > now + 0.1) return;
    const step = grid * every;
    const at = Math.max(this.nextTick, Math.ceil(now / step) * step);
    this.nextTick = at + step;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(1250 * (1 + 0.9 * k), at);
    o.frequency.exponentialRampToValueAtTime(820 * (1 + 0.9 * k), at + 0.05);
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(0.0001, at);
    gn.gain.exponentialRampToValueAtTime(0.05 + 0.04 * k, at + 0.005);
    gn.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);
    o.connect(gn);
    gn.connect(this.fx);
    o.start(at);
    o.stop(at + 0.08);
  }

  /** The stroke lets go. */
  wash() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(3200, t);
    f.frequency.exponentialRampToValueAtTime(1300, t + 0.6);
    f.Q.value = 0.7;
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(0.22, t + 0.05);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    s.connect(f);
    f.connect(gn);
    gn.connect(this.fx);
    s.start(t, Math.random());
    s.stop(t + 0.75);
  }

  /** A roll of thunder; `near` 0 (far) .. 1. */
  thunder(near: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 110 + 120 * near;
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(0.18 + 0.3 * near, t + 0.35);
    gn.gain.exponentialRampToValueAtTime(0.06, t + 1.2);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
    s.connect(f);
    f.connect(gn);
    gn.connect(this.fx);
    s.start(t);
    s.stop(t + 3.3);
  }
}

/** One rain voice per page, shared by every scroll's RainSystem, so leaving a rainy scroll silences it. */
const SOUND = new RainAudio();
