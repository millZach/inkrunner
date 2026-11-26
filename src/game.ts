import { Audio, type Sfx } from './audio';
import {
  FONT_BRUSH,
  FONT_SERIF,
  GRAVITY,
  INK,
  INK_COST,
  INK_MAX,
  INKS,
  IS_TOUCH,
  JUMP_V,
  KILL_Y,
  MAX_FALL,
  MAX_RENDER_H,
  PAPER,
  PLAYER_H,
  PLAYER_HW,
  RIDE_SPEED,
  RUN_ACCEL,
  STEP_DOWN,
  STEP_UP,
  VIEW_H,
  type InkKind,
} from './config';
import { fetchGhosts, type GhostRun } from './ghosts';
import { RainSystem } from './mechanics/rain';
import { groundAt, groundY, islandAt, mergeRules, type Level, type ScrollRules } from './level';
import type { LevelInfo } from './levels';
import { clamp, closestOnPolyline, cumLengths, easeInOut, pointAt, polylineDist, polylineHitsRect, resample, smoothstep, type BP, type Vec } from './math';
import { Recorder } from './replay';
import { mulberry32 } from './rng';
import { Backdrop, SkyPainter } from './render/backdrop';
import { brushLine, rgba } from './render/brush';
import { Character, type CharId, type Pose } from './render/characters';
import { drawTorii, lanternGlow } from './render/decor';
import { drawBramble, drawFire, drawYokai } from './render/hazards';
import { makeGrain, makeVignette } from './render/paper';
import { Particles } from './render/particles';
import { TerrainCache } from './render/terrain';
import { drawSea } from './render/waves';
import { Weather } from './render/weather';
import { LAUNCH_ACCEL, Portals } from './mechanics/portals';
import { Raijin } from './mechanics/raijin';
import { Festival } from './mechanics/festival';
import { flashLimiter } from './mechanics/flash';
import { Strikes } from './mechanics/strikes';
import { drawWetStroke, Stroke } from './strokes';
import { inkForKey, inkKey, keyLabel } from './keys';
import { saveSetting } from './storage';

export type State = 'menu' | 'play' | 'dying' | 'finish';
export type Grade = '松' | '竹' | '梅';

export interface FinishStats {
  time: number;
  strokes: number;
  ink: number;
  falls: number;
  grade: Grade;
  newBest: boolean;
  best: { time: number; grade: Grade } | null;
}

export const CHAR_NAMES: Record<CharId, string> = { ren: 'Ren', kohaku: 'Kohaku' };

/** What killed the traveler (N10): a world box, outlined in red-brown ink while they die. */
export interface Cause {
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
export const GRADE_NAMES: Record<Grade, string> = { 松: 'Pine', 竹: 'Bamboo', 梅: 'Plum' };
const GRADE_ORDER: Grade[] = ['梅', '竹', '松'];

export { IS_TOUCH };
export const INTRO_DUR = 1.5;

/**
 * Debug only: `?inks=shu,ai,kin,murasaki` replaces the inks every scroll offers, so new inks can be
 * tried on existing scrolls. Never set by the game itself.
 */
function inksOverride(): string[] | null {
  if (!import.meta.env.DEV || typeof location === 'undefined') return null;
  const v = new URLSearchParams(location.search).get('inks');
  return v ? v.split(',').map((x) => x.trim()) : null;
}
const INKS_OVERRIDE = inksOverride();
/** Runs played under a debug override never save records, map strokes or ghosts. */
export const DEBUG_RUN = INKS_OVERRIDE !== null;

export function loadBest(levelId: string): { time: number; grade: Grade } | null {
  try {
    return JSON.parse(localStorage.getItem('inkrunner:best:' + levelId) ?? 'null');
  } catch {
    return null;
  }
}

export class Game {
  ctx: CanvasRenderingContext2D;
  info!: LevelInfo;
  level!: Level;
  /** the current scroll's rules (run speed, inkwell, refill, slow motion, inks) */
  rules!: ScrollRules;
  terrain!: TerrainCache;
  backdrop!: Backdrop;
  weather!: Weather;
  /** rain: wash clock, warning, look and sound (src/mechanics/rain.ts) */
  rain!: RainSystem;
  audio = new Audio();
  particles = new Particles();
  /** 紫 portals, blot pillars and the projectiles that pass through rings */
  portals: Portals = new Portals(this);
  /** 雷 Raijin's gate, on scrolls that have one (N11) */
  raijin: Raijin = new Raijin(this);
  /** telegraphed sparks and stray bolts (N6) */
  strikes: Strikes = new Strikes(this);
  /** lantern lines, fireworks, background flashes, sketches, arcades and sky changes (N13) */
  festival: Festival = new Festival(this);
  /** the Summer skies (N13) */
  skyPainter = new SkyPainter();
  /** the cause of the current death (N10), shown from the hit-stop until the respawn */
  cause: Cause | null = null;
  /** the full-screen flash now (N19): started at real time flashT0, strength flashK, Raijin's drums shown or not */
  private flashT0 = -99;
  private flashK = 0;
  private flashRaijin = false;
  /** how far the Raijin arena's loop has wrapped the world back (keeps the paper grain still across a wrap) */
  worldShift = 0;
  /** a hit-stop: the simulation holds for this many real seconds, then `freezeThen` runs (summer-design 4.6) */
  freezeT = 0;
  freezeThen: (() => void) | null = null;
  grain: HTMLCanvasElement;
  grainPattern: CanvasPattern | null = null;
  vignette: HTMLCanvasElement | null = null;
  recorder = new Recorder(this);

  state: State = 'menu';
  paused = false;
  charId: CharId = 'ren';
  character = new Character('ren');

  W = 0;
  H = 0;
  scale = 1;
  zoom = 1;
  camCX = 600;
  camCY = 420;

  px = 0;
  py = 0;
  vx = 0;
  vy = 0;
  grounded = true;
  coyote = 0;
  jumpBuf = 0;
  jumpHeld = false;
  airJumps = 0;
  /** launch state after a portal exit (cleared on landing, riding or jumping) */
  launched = false;
  phase = 0;
  ride: { st: Stroke; s: number; dir: number } | null = null;
  stuckT = 0;
  invuln = 0;
  respawn: Vec = { x: 0, y: 0 };
  introT = 0;

  ink: InkKind = 'shu';
  inkMax = INK_MAX;
  inkAmt = INK_MAX;
  painting: BP[] | null = null;
  paintPointer = -1;
  paintCost = 0;
  noteDist = 0;
  lastNoteT = 0;
  lastMoveT = 0;
  brushLevel = 0;
  mouse = { x: -100, y: -100, inside: false };
  /** immutable: replaced (never mutated) whenever strokes change, so replays can reference it */
  strokes: Stroke[] = [];
  /**
   * Every stroke painted this run and not undone, packed as it was painted. Rings that closed behind the traveler,
   * bridges the rain washed away and strokes Raijin's arena dropped all stay here: the map paints the run you made,
   * not only what was still standing at the torii.
   */
  private painted: { st: Stroke; k: InkKind; p: number[] }[] = [];

  ghosts: { best: GhostRun | null; strokes: Stroke[] } = { best: null, strokes: [] };
  ghostChar = new Character('ren');
  private ghostLayer = document.createElement('canvas');
  showGhosts = localStorage.getItem('inkrunner:ghosts') !== '0';
  path: number[] = [];
  private pathT = 0;

  timeScale = 1;
  slow = 0;
  t = 0;
  realT = 0;
  dieT = 0;
  finishT = 0;
  stats = { time: 0, strokes: 0, ink: 0, falls: 0 };
  toriiPaint = 0;
  hideHUD = false;
  /** set while a replay drives the renderer */
  poseOverride: Pose | null = null;

  onFinish: (s: FinishStats) => void = () => {};
  onMenu: () => void = () => {};
  private finishAnnounced = false;
  private finishCamStart = 0;

  constructor(
    public canvas: HTMLCanvasElement,
    info: LevelInfo,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.grain = makeGrain();
    this.loadLevel(info);
    this.resize();
    this.bindInput();
  }

  get S() {
    return this.scale * this.zoom;
  }

  loadLevel(info: LevelInfo) {
    this.info = info;
    this.level = info.build();
    this.rules = INKS_OVERRIDE ? mergeRules(this.level.rules, { inks: INKS_OVERRIDE as ScrollRules['inks'] }) : this.level.rules;
    this.terrain = new TerrainCache(this.level, IS_TOUCH ? 6 : 9);
    this.backdrop = new Backdrop(this.level.length, this.level.theme);
    if (this.scale) this.backdrop.build(this.scale);
    this.weather = new Weather(this.level.theme);
    this.portals.reset();
    this.raijin.reset();
    this.strikes.reset();
    this.festival.reset();
    this.backdrop.birds = SkyPainter.birds(this.level.sky);
    this.cause = null;
    this.flashT0 = -99;
    this.rain = new RainSystem(this);
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const cw = this.canvas.parentElement?.clientWidth || window.innerWidth;
    const ch = this.canvas.parentElement?.clientHeight || window.innerHeight;
    const cap = IS_TOUCH ? 1000 : MAX_RENDER_H;
    let pr = dpr;
    if (ch * pr > cap) pr = cap / ch;
    this.canvas.width = Math.round(cw * pr);
    this.canvas.height = Math.round(ch * pr);
    this.canvas.style.width = cw + 'px';
    this.canvas.style.height = ch + 'px';
    this.W = this.canvas.width;
    this.H = this.canvas.height;
    const newScale = this.H / VIEW_H;
    const changed = Math.abs(newScale - this.scale) > 1e-3 || !this.vignette;
    this.scale = newScale;
    this.vignette = makeVignette(this.W, this.H);
    this.grainPattern = this.ctx.createPattern(this.grain, 'repeat');
    if (changed) {
      this.terrain.clear();
      this.backdrop.build(this.scale);
      for (const s of this.strokes) s.bake(this.scale);
      for (const s of this.ghosts.strokes) s.sprite = null;
    }
  }

  // ───────────────────────────────────────────── lifecycle
  /** Show a level behind the menu without starting it. */
  preview(info: LevelInfo) {
    if (this.info.id === info.id) return;
    this.loadLevel(info);
    this.strokes = [];
    this.painted = [];
  }

  start(char: CharId, info: LevelInfo) {
    this.setPaused(false);
    this.charId = char;
    this.character = new Character(char);
    this.ghostChar = new Character(char === 'ren' ? 'kohaku' : 'ren');
    this.loadLevel(info);
    this.strokes = [];
    this.painted = [];
    this.particles = new Particles();
    this.particles.log = (e) => this.recorder.logParticle(e);
    this.stats = { time: 0, strokes: 0, ink: 0, falls: 0 };
    this.respawn = { ...this.level.start };
    this.inkMax = char === 'ren' ? this.rules.inkMax * 1.4 : this.rules.inkMax;
    this.inkAmt = this.inkMax;
    this.ink = this.rules.startInk ?? this.rules.inks[0];
    this.zoom = 1;
    this.toriiPaint = 0;
    this.worldShift = 0;
    this.freezeT = 0;
    this.freezeThen = null;
    this.finishAnnounced = false;
    this.path = [];
    this.pathT = 0;
    this.introT = 0;
    this.t = 0;
    this.placePlayer(this.level.start.x);
    this.camCX = this.px + (this.W / this.S) * this.rules.camLead;
    this.camCY = this.py - 80;
    this.state = 'play';
    this.audio.init();
    this.recorder.begin();
    this.ghosts = { best: null, strokes: [] };
    const id = this.level.id;
    void fetchGhosts(id).then((g) => {
      if (this.level.id !== id || !g) return;
      this.ghosts = {
        best: g.best,
        strokes: g.others.flatMap((run, i) =>
          run.strokes.filter((s) => Object.hasOwn(INKS, s.k)).map((s, j) => {
            const pts: BP[] = [];
            for (let k = 0; k + 2 < s.p.length; k += 3) pts.push({ x: s.p[k], y: s.p[k + 1], w: s.p[k + 2] });
            const st = new Stroke(s.k, pts, 0, i * 1000 + j);
            st.bornT = -100;
            return st;
          }),
        ),
      };
    });
  }

  private placePlayer(x: number) {
    this.px = x;
    this.py = groundY(this.level, x);
    this.vx = 0;
    this.vy = 0;
    this.ride = null;
    this.grounded = true;
    this.stuckT = 0;
    this.launched = false;
    this.character.reset();
  }

  /** Proof and dev pages only: stand the traveler on the ground at x, camera and lantern with them. */
  warp(x: number) {
    if (this.state !== 'play' && this.state !== 'dying') return;
    this.cancelPaint();
    this.placePlayer(x);
    this.state = 'play';
    this.respawn = { x, y: this.py };
    this.invuln = 0.4;
    this.camCX = this.px + (this.W / this.S) * this.rules.camLead;
    this.camCY = this.py - 80;
  }

  toMenu() {
    this.setPaused(false);
    this.cancelPaint();
    this.recorder.stopReplay();
    this.state = 'menu';
    this.zoom = 1;
    this.onMenu();
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    if (paused) {
      this.cancelPaint();
      this.jumpHeld = false;
      this.jumpBuf = 0;
      this.mouse.inside = false;
      void this.audio.ctx?.suspend();
    } else if (this.audio.ctx && this.audio.ctx.state !== 'running') {
      void this.audio.ctx.resume();
    }
  }

  returnToLantern() {
    if (this.state === 'play') this.die(true);
  }

  toggleGhosts() {
    this.showGhosts = !this.showGhosts;
    saveSetting('inkrunner:ghosts', this.showGhosts ? '1' : '0');
  }

  sfx(name: Sfx, arg: number | string = 0) {
    this.recorder.logSfx(name, arg);
    this.audio.fx(name, arg);
  }

  // ───────────────────────────────────────────── input
  private bindInput() {
    const c = this.canvas;
    const toCanvas = (e: PointerEvent | WheelEvent) => {
      const r = c.getBoundingClientRect();
      this.mouse.x = ((e.clientX - r.left) / r.width) * this.W;
      this.mouse.y = ((e.clientY - r.top) / r.height) * this.H;
    };
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => {
      if (this.paused) return;
      toCanvas(e);
      this.audio.init();
      if (this.state !== 'play' || this.recorder.replaying) return;
      if (e.button === 2) {
        this.undo();
        return;
      }
      if (e.button !== 0) return;
      const stone = this.stoneAt(this.mouse.x, this.mouse.y);
      if (stone) {
        this.selectInk(stone);
        return;
      }
      if (this.painting) return;
      c.setPointerCapture(e.pointerId);
      this.paintPointer = e.pointerId;
      this.beginPaint();
    });
    c.addEventListener('pointermove', (e) => {
      if (this.paused) return;
      if (e.pointerType === 'mouse') this.mouse.inside = true;
      if (this.painting && e.pointerId !== this.paintPointer) return;
      toCanvas(e);
      if (this.painting) {
        const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
        for (const ev of events.length ? events : [e]) {
          toCanvas(ev);
          this.extendPaint();
        }
      }
    });
    c.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') this.mouse.inside = false;
    });
    const up = (e: PointerEvent) => {
      if (e.pointerId === this.paintPointer) this.endPaint();
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.cycleInk(e.deltaY > 0 ? 1 : -1);
      },
      { passive: false },
    );
    window.addEventListener('keydown', (e) => {
      if (this.paused) return;
      if (e.repeat) return;
      // On the title, map and finish screens a focused button keeps Space and Enter for itself.
      if ((this.state === 'menu' || this.state === 'finish') && e.target instanceof Element && e.target.closest('button, a, input, [role="tab"]')) return;
      const k = e.code;
      if (k === 'Space' || k === 'ArrowUp' || k === 'KeyW') {
        e.preventDefault();
        this.jumpPress();
      } else if (inkForKey(k)) {
        // the player's ink keys (1 vermilion … 4 purple unless changed on the title), whatever subset the scroll offers
        this.selectInk(inkForKey(k)!);
      } else if (k === 'KeyQ') this.cycleInk(-1);
      else if (k === 'KeyE') this.cycleInk(1);
      else if (k === 'KeyR') this.returnToLantern();
      else if (k === 'KeyG') this.toggleGhosts();
      else if (k === 'Escape' && (this.state === 'play' || this.state === 'dying')) this.toMenu();
      else if (k === 'KeyM') this.audio.muted = !this.audio.muted;
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        if (this.state !== 'menu' && this.state !== 'finish') e.preventDefault();
        this.jumpRelease();
      }
    });
    window.addEventListener('resize', () => this.resize());
  }

  jumpPress() {
    if (this.paused) return;
    this.audio.init();
    this.jumpBuf = 0.13;
    this.jumpHeld = true;
  }

  jumpRelease() {
    this.jumpHeld = false;
  }

  /** Switch ink. Inks this scroll does not offer are ignored. */
  selectInk(k: InkKind) {
    if (this.ink === k || !this.rules.inks.includes(k)) return;
    if (this.painting) this.endPaint();
    this.ink = k;
  }

  private cycleInk(d: number) {
    const inks = this.rules.inks;
    const i = Math.max(0, inks.indexOf(this.ink));
    this.selectInk(inks[(i + d + inks.length) % inks.length]);
  }

  /** HUD layout for the ink stones (one per ink the scroll offers, centred), in canvas pixels. */
  stoneLayout(): { k: InkKind; x: number; y: number; r: number }[] {
    const hs = this.H / VIEW_H;
    const cx = (VIEW_H * (this.W / this.H) * 0.5) * hs;
    const cy = (IS_TOUCH ? 660 : 668) * hs;
    const pixelRatio = this.W / this.canvas.getBoundingClientRect().width;
    const gap = IS_TOUCH ? Math.max(92 * hs, 50 * pixelRatio) : 74 * hs;
    const inks = this.rules.inks;
    const mid = (inks.length - 1) / 2;
    return inks.map((k, i) => ({ k, x: cx + (i - mid) * gap, y: cy, r: (IS_TOUCH ? 34 : 26) * hs }));
  }

  private stoneAt(x: number, y: number): InkKind | null {
    const minRadius = IS_TOUCH ? 22 * this.W / this.canvas.getBoundingClientRect().width : 0;
    for (const s of this.stoneLayout()) if (Math.hypot(x - s.x, y - s.y) < Math.max(s.r + 6, minRadius)) return s.k;
    return null;
  }

  screenToWorld(x: number, y: number): Vec {
    const S = this.S;
    return { x: this.camCX + (x - this.W / 2) / S, y: this.camCY + (y - this.H / 2) / S };
  }

  private beginPaint() {
    if (this.inkAmt < 3 || this.introT < INTRO_DUR) return;
    const p = this.screenToWorld(this.mouse.x, this.mouse.y);
    this.painting = [{ ...p, w: INKS[this.ink].width }];
    this.portals.paintBegin(this.ink, p);
    this.paintCost = 0;
    this.noteDist = 40;
    this.lastMoveT = performance.now();
    this.recorder.mark('paintStart', this.ink);
  }

  private extendPaint() {
    const pts = this.painting;
    if (!pts) return;
    const p = this.screenToWorld(this.mouse.x, this.mouse.y);
    const last = pts[pts.length - 1];
    const d = Math.hypot(p.x - last.x, p.y - last.y);
    if (d < 4) return;
    const now = performance.now();
    const dtm = Math.max(1, now - this.lastMoveT) / 1000;
    this.lastMoveT = now;
    const speed = (d * this.S) / dtm; // screen px / s
    const base = INKS[this.ink].width;
    const w = base * clamp(1.3 - speed / 2800, 0.55, 1.3);
    const steps = Math.ceil(d / 10);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      pts.push({ x: last.x + (p.x - last.x) * t, y: last.y + (p.y - last.y) * t, w: last.w + (w - last.w) * t * 0.5 });
    }
    const cost = d * INK_COST;
    this.inkAmt -= cost;
    this.paintCost += cost;
    this.stats.ink += cost;
    this.brushLevel = speed;
    this.audio.brush(speed);
    // painting plays music: pitch follows the brush's height on screen
    this.noteDist += d;
    if (this.noteDist > 46 && this.realT - this.lastNoteT > 0.07) {
      this.noteDist = 0;
      this.lastNoteT = this.realT;
      const h = clamp(this.mouse.y / this.H, 0, 1).toFixed(2);
      this.sfx('note', `${this.ink}:${h}:${clamp(speed / 3000, 0, 1).toFixed(2)}`);
    }
    if (this.portals.paintExtend(pts, pts.length - steps)) {
      this.endPaint();
      return;
    }
    this.applyInkEffects(this.ink, pts.slice(-steps - 1));
    if (Math.random() < 0.15) {
      this.particles.spawn('paint', p.x, p.y, (Math.random() - 0.5) * 60, -20, 0.6, 2, INKS[this.ink].color);
    }
    if (this.inkAmt <= 0) {
      this.inkAmt = 0;
      this.endPaint();
    }
  }

  private endPaint() {
    const pts = this.painting;
    if (!pts) return;
    this.painting = null;
    this.paintPointer = -1;
    this.brushLevel = 0;
    this.audio.brush(0);
    const L = cumLengths(pts);
    if (pts.length < 3 || L[L.length - 1] < 14) {
      this.portals.paintCancel();
      this.inkAmt = Math.min(this.inkMax, this.inkAmt + this.paintCost);
      this.recorder.mark('paintEnd', 0);
      return;
    }
    if (this.portals.paintEnd(pts, this.paintCost)) return;
    const st = new Stroke(this.ink, pts, this.paintCost);
    st.bornT = this.t;
    st.bake(this.scale);
    this.rain.onStroke(st);
    this.strokes = [...this.strokes, st];
    this.painted.push({ st, ...this.packStroke(st) });
    this.portals.strokeAdded(st);
    this.stats.strokes++;
    this.applyInkEffects(this.ink, st.pts);
    this.sfx('stroke', this.ink);
    this.recorder.mark('paintEnd', st.length);
    const def = INKS[this.ink];
    // the stroke lands with a splash of bright pigment
    const n = clamp(Math.round(st.length / 14), 12, 40);
    for (let i = 0; i < n; i++) {
      const q = st.pts[Math.floor(Math.random() * st.pts.length)];
      const a = Math.random() * Math.PI * 2;
      const v = 60 + Math.random() * 140;
      this.particles.spawn('paint', q.x, q.y, Math.cos(a) * v, Math.sin(a) * v - 50, 0.8, 1.6 + Math.random() * 2, i % 3 ? def.color : def.light);
    }
  }

  private cancelPaint() {
    if (!this.painting) return;
    this.portals.paintCancel();
    this.inkAmt = Math.min(this.inkMax, this.inkAmt + this.paintCost);
    this.painting = null;
    this.paintPointer = -1;
    this.brushLevel = 0;
    this.audio.brush(0);
  }

  undo() {
    if (this.painting) {
      this.cancelPaint();
      return;
    }
    const st = this.strokes[this.strokes.length - 1];
    if (!st) return;
    this.strokes = this.strokes.slice(0, -1);
    this.painted = this.painted.filter((e) => e.st !== st);
    if (this.ride?.st === st) this.ride = null;
    this.portals.strokeRemoved(st);
    this.inkAmt = Math.min(this.inkMax, this.inkAmt + st.cost * 0.5);
    for (let i = 0; i < 16; i++) {
      const q = st.pts[Math.floor(Math.random() * st.pts.length)];
      this.particles.spawn('steam', q.x, q.y, 0, -20, 0.8, 4);
    }
  }

  /** Indigo douses fire; gold banishes yokai and burns thickets. */
  private applyInkEffects(kind: InkKind, pts: Vec[]) {
    if (pts.length < 2) return;
    if (kind === 'ai') {
      for (const f of this.level.fires) {
        if (f.alive && polylineHitsRect(pts, f.x - 10, f.y - f.h - 10, f.x + f.w + 10, f.y + 10)) this.douse(f);
      }
    } else if (kind === 'kin') {
      for (const y of this.level.yokai) {
        if (y.alive && polylineDist(pts, { x: y.cx, y: y.cy }) < y.r + 10) this.banish(y.cx, y.cy, () => (y.alive = false));
      }
      for (const b of this.level.brambles) {
        if (b.alive && polylineHitsRect(pts, b.x - 8, b.y - b.h, b.x + b.w + 8, b.y)) {
          this.banish(b.x + b.w / 2, b.y - b.h / 2, () => (b.alive = false));
        }
      }
    }
  }

  private douse(f: Level['fires'][number]) {
    f.alive = false;
    f.deadT = 0;
    this.sfx('hiss');
    this.recorder.mark('effect', 2);
    for (let i = 0; i < 40; i++) {
      this.particles.spawn('steam', f.x + Math.random() * f.w, f.y - Math.random() * f.h * 0.6, (Math.random() - 0.5) * 40, -40 - Math.random() * 60, 1.6, 6);
    }
    for (let i = 0; i < 20; i++) {
      this.particles.spawn('paint', f.x + Math.random() * f.w, f.y - Math.random() * f.h, (Math.random() - 0.5) * 200, -100 - Math.random() * 200, 0.8, 2.5, INKS.ai.color);
    }
  }

  private banish(x: number, y: number, kill: () => void) {
    kill();
    this.sfx('shimmer');
    this.recorder.mark('effect', 2);
    for (let i = 0; i < 36; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 40 + Math.random() * 140;
      this.particles.spawn('mote', x, y, Math.cos(a) * s, Math.sin(a) * s - 30, 1.4 + Math.random(), 2.5, 'rgba(255,214,110,0.95)');
    }
    for (let i = 0; i < 14; i++) {
      this.particles.spawn('petal', x, y, (Math.random() - 0.5) * 200, -Math.random() * 150, 2.5, 4, INKS.kin.color);
    }
  }

  // ───────────────────────────────────────────── simulation
  update(dtReal: number) {
    if (this.paused) return;
    this.realT += dtReal;
    if (this.recorder.replaying) {
      this.recorder.stepReplay(dtReal);
      return;
    }
    if (this.freezeT > 0) {
      this.freezeT -= dtReal;
      if (this.freezeT <= 0) {
        const then = this.freezeThen;
        this.freezeThen = null;
        then?.();
      }
      return;
    }
    const R = this.rules;
    const target = this.painting ? R.slowScale : 1;
    this.timeScale += (target - this.timeScale) * Math.min(1, dtReal * (this.painting ? 16 : 5));
    this.slow = clamp((1 - this.timeScale) / (1 - R.slowScale), 0, 1);
    const dt = dtReal * this.timeScale;
    this.t += dt;

    if (this.state === 'play') {
      if (this.introT < INTRO_DUR) {
        this.introT += dtReal;
      } else {
        if (this.painting) {
          this.inkAmt -= R.slowmoDrain * dtReal;
          if (this.inkAmt <= 0) {
            this.inkAmt = 0;
            this.endPaint();
          }
        } else {
          this.inkAmt = Math.min(this.inkMax, this.inkAmt + R.inkRegen * dt);
        }
        this.stats.time += dt;
        const n = Math.max(1, Math.ceil(dt / (1 / 240)));
        for (let i = 0; i < n && this.state === 'play'; i++) this.step(dt / n);
        this.invuln -= dt;
        this.pathT += dt;
        while (this.pathT >= 0.1) {
          this.pathT -= 0.1;
          this.path.push(Math.round(this.px), Math.round(this.py));
        }
      }
    } else if (this.state === 'dying') {
      this.dieT += dtReal;
      if (this.dieT > 0.9) this.doRespawn();
    } else if (this.state === 'finish') {
      this.finishT += dtReal;
      this.updateFinish(dtReal);
    } else {
      // menu: drift across the opening of the scroll
      this.camCX = 700 + Math.sin(this.realT * 0.05) * 500;
      this.camCY = 420;
    }

    this.updateHazards(dt);
    // strikes first: a spark held by a paused telegraph must not be moved by the portals this frame
    this.strikes.update(dt);
    this.portals.update(dt);
    this.raijin.update(dt, dtReal);
    this.festival.update(dt, dtReal);
    this.particles.update(dt);
    for (const s of this.strokes) {
      s.age = this.t - s.bornT;
      s.rideCooldown -= dt;
      if (s.kind === 'kin' && Math.random() < dt * s.length * 0.01) {
        const q = s.pts[Math.floor(Math.random() * s.pts.length)];
        this.particles.spawn('mote', q.x, q.y, (Math.random() - 0.5) * 10, -10, 1.2, 1.4, 'rgba(255,214,110,0.8)');
      }
    }
    this.rain.update(dt, dtReal);
    if (this.state !== 'menu') this.character.update(this.pose(), dt);
    this.updateCamera(dtReal);
    this.weather.update(dtReal, this.camCX, this.camCY, VIEW_H * (this.W / this.H));
    this.audio.tick(this.slow);
    if (this.state !== 'menu') this.recorder.capture(dtReal);
  }

  private step(h: number) {
    const L = this.level;
    this.jumpBuf -= h;

    if (this.ride) {
      this.stepRide(h);
    } else {
      if (this.grounded) this.launched = false;
      const accel = this.launched ? LAUNCH_ACCEL : RUN_ACCEL;
      this.vx += clamp(this.rules.runSpeed - this.vx, -accel * h, accel * h);
      if (this.grounded) {
        this.coyote = 0.1;
        this.airJumps = this.charId === 'kohaku' ? 1 : 0;
      } else this.coyote -= h;
      if (this.jumpBuf > 0 && this.coyote > 0) {
        this.vy = -JUMP_V;
        this.grounded = false;
        this.launched = false;
        this.coyote = 0;
        this.jumpBuf = 0;
        this.sfx('jump');
        this.particles.burst('ink', this.px, this.py, 6, 90, 0.35, 1.6, INK, 60);
      } else if (this.jumpBuf > 0 && this.airJumps > 0 && !this.grounded) {
        // Kohaku's fox leap
        this.airJumps--;
        this.jumpBuf = 0;
        this.launched = false;
        this.vy = -JUMP_V * 0.82;
        this.sfx('double');
        this.particles.burst('paint', this.px - 14, this.py - 20, 14, 140, 0.6, 2.4, INKS[this.ink].color, 0);
      }
      let g = GRAVITY;
      if (this.vy < 0 && !this.jumpHeld && !this.launched) g *= 2.4;
      this.vy = Math.min(MAX_FALL, this.vy + g * h);

      const nx = this.px + this.vx * h;
      const front = this.vx >= 0 ? nx + PLAYER_HW : nx - PLAYER_HW;
      // test walls against where our feet will be after following a slope
      let feet = this.py;
      if (this.grounded) {
        const s = this.surfaceBelow(nx, this.py - STEP_UP);
        if (s !== null && s < feet) feet = s;
      }
      if (this.wallAt(front, feet)) {
        this.vx = 0;
        this.stuckT += h;
      } else {
        this.px = nx;
        this.stuckT = Math.max(0, this.stuckT - h * 3);
      }

      const prevY = this.py;
      this.py += this.vy * h;
      if (this.vy >= 0) {
        if (this.grounded) {
          const s = this.surfaceBelow(this.px, prevY - STEP_UP);
          if (s !== null && s <= prevY + STEP_DOWN + this.vy * h) {
            this.py = s;
            this.vy = 0;
          } else this.grounded = false;
        } else {
          const s = this.surfaceBelow(this.px, prevY - 1);
          if (s !== null && this.py >= s) {
            if (this.vy > 700) this.particles.burst('ink', this.px, s, 8, 120, 0.4, 1.8, INK, 80);
            this.py = s;
            this.vy = 0;
            this.grounded = true;
          }
        }
      } else this.grounded = false;

      for (const st of this.strokes) {
        if (st.kind !== 'ai' || st.rideCooldown > 0) continue;
        const b = st.bbox;
        if (this.px < b.x0 - 30 || this.px > b.x1 + 30 || this.py < b.y0 - 10 || this.py - PLAYER_H > b.y1 + 10) continue;
        const c = closestOnPolyline(st.pts, st.cum, { x: this.px, y: this.py - 18 });
        if (c.d < 26) {
          const first = st.pts[0];
          const last = st.pts[st.pts.length - 1];
          const dir = last.x - first.x < -30 ? -1 : 1;
          this.ride = { st, s: c.s, dir };
          this.grounded = false;
          this.launched = false;
          this.airJumps = this.charId === 'kohaku' ? 1 : 0;
          this.particles.burst('paint', this.px, this.py, 12, 160, 0.5, 2.2, INKS.ai.light, 60);
          this.sfx('jump');
          this.recorder.mark('effect', 1);
          break;
        }
      }
    }

    this.portals.stepTraveler();
    if (this.state !== 'play') return;
    // hazards
    const x0 = this.px - PLAYER_HW;
    const x1 = this.px + PLAYER_HW;
    const y0 = this.py - PLAYER_H;
    const y1 = this.py;
    if (L.seaY !== null && this.py > L.seaY + 12) {
      this.sfx('splash');
      this.particles.burst('ink', this.px, L.seaY, 30, 300, 0.8, 2.6, rgba(INK, 0.6), 200);
      this.die(false, { kind: 'sea', x: this.px - 50, y: L.seaY - 40, w: 100, h: 70 });
      return;
    }
    if (this.py > KILL_Y) {
      this.die(false, this.gapCause());
      return;
    }
    if (this.invuln <= 0) {
      for (const f of L.fires) {
        if (f.alive && x1 > f.x + 10 && x0 < f.x + f.w - 10 && y1 > f.y - f.h * 0.75 && y0 < f.y) {
          this.die(false, { kind: 'fire', x: f.x, y: f.y - f.h, w: f.w, h: f.h });
          return;
        }
      }
      for (const y of L.yokai) {
        if (!y.alive) continue;
        const cx = clamp(y.cx, x0, x1);
        const cy = clamp(y.cy, y0, y1);
        if (Math.hypot(cx - y.cx, cy - y.cy) < y.r * 0.8) {
          this.die(false, { kind: 'yokai', x: y.cx - y.r, y: y.cy - y.r, w: y.r * 2, h: y.r * 2 });
          return;
        }
      }
    }
    for (const l of L.lanterns) {
      if (!l.lit && this.px >= l.x) {
        l.lit = true;
        l.litT = 0;
        this.respawn = { x: l.x + 30, y: l.y };
        this.sfx('bell');
        for (let i = 0; i < 18; i++) {
          this.particles.spawn('mote', l.x, l.y - 60, (Math.random() - 0.5) * 80, -Math.random() * 80, 1.6, 2, 'rgba(255,200,90,0.9)');
        }
      }
    }
    if (this.px >= L.torii.x) this.finish();
  }

  private stepRide(h: number) {
    const r = this.ride!;
    const st = r.st;
    r.s += RIDE_SPEED * h * r.dir;
    const done = r.s >= st.length || r.s <= 0;
    const p = pointAt(st.pts, st.cum, r.s);
    this.px = p.x;
    this.py = p.y - 4;
    this.vx = p.tx * RIDE_SPEED * r.dir;
    this.vy = p.ty * RIDE_SPEED * r.dir;
    if (Math.random() < h * 40) {
      this.particles.spawn('paint', this.px, this.py, -this.vx * 0.2 + (Math.random() - 0.5) * 60, -60, 0.5, 1.8, INKS.ai.light);
    }
    const isl = islandAt(this.level, this.px);
    if (isl) {
      const gy = groundAt(isl, this.px);
      if (gy < this.py - 2) {
        this.endRide();
        if (this.py - gy < 40) {
          this.py = gy;
          this.vy = 0;
          this.grounded = true;
        } else {
          this.px -= Math.sign(this.vx || 1) * (PLAYER_HW + 2);
          this.vx = 0;
        }
        return;
      }
    }
    if (this.jumpBuf > 0) {
      this.jumpBuf = 0;
      this.endRide();
      this.vy = Math.min(this.vy, 0) - JUMP_V * 0.8;
      this.sfx('jump');
      return;
    }
    if (done) {
      this.endRide();
      // a little lift so currents feel like launches
      this.vy = Math.min(this.vy, -120) - 80;
    }
  }

  private endRide() {
    if (!this.ride) return;
    this.ride.st.rideCooldown = 0.6;
    this.ride = null;
    this.grounded = false;
  }

  /** Highest walkable surface at x that is at or below yMin. */
  surfaceBelow(x: number, yMin: number): number | null {
    let best: number | null = null;
    for (const isl of this.level.islands) {
      if (x < isl.x0 || x > isl.x1) continue;
      const y = groundAt(isl, x);
      if (y >= yMin && (best === null || y < best)) best = y;
    }
    for (const st of this.strokes) {
      if (st.kind !== 'shu' || st.washed || x < st.bbox.x0 || x > st.bbox.x1) continue;
      const s = st.surface;
      for (let i = 0; i < s.length - 1; i++) {
        const a = s[i];
        const b = s[i + 1];
        const lo = Math.min(a.x, b.x);
        const hi = Math.max(a.x, b.x);
        if (x < lo || x > hi || hi - lo < 0.01) continue;
        const y = a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
        if (y >= yMin && (best === null || y < best)) best = y;
      }
    }
    return best;
  }

  private wallAt(fx: number, feetY: number): boolean {
    for (const isl of this.level.islands) {
      if (fx < isl.x0 || fx > isl.x1) continue;
      if (groundAt(isl, fx) < feetY - STEP_UP) return true;
    }
    for (const b of this.level.brambles) {
      if (b.alive && fx > b.x && fx < b.x + b.w && feetY > b.y - b.h) return true;
    }
    return false;
  }

  /** Hold the simulation for `sec` real seconds (a hit-stop), then run `then` (once; a restart drops it). */
  freeze(sec: number, then: () => void) {
    if (this.freezeT > 0) return;
    this.freezeT = sec;
    this.freezeThen = then;
  }

  /** The gap the traveler fell through (N10): from the last ground edge behind to the next ground ahead. */
  private gapCause(): Cause {
    let left: { x: number; y: number } | null = null;
    let right = Infinity;
    for (const isl of this.level.islands) {
      if (isl.x1 <= this.px + PLAYER_HW && (!left || isl.x1 > left.x)) left = { x: isl.x1, y: groundAt(isl, isl.x1) };
      if (isl.x0 >= this.px - PLAYER_HW && isl.x0 < right) right = isl.x0;
    }
    const x0 = left ? left.x : this.px - 120;
    const x1 = Number.isFinite(right) ? Math.max(right, x0 + 40) : this.px + 120;
    const y = left ? left.y : this.respawn.y;
    return { kind: 'gap', x: x0, y: y - 10, w: Math.min(x1 - x0, 1600), h: 90 };
  }

  /**
   * The white full-screen flash overlay (N19), only through the flash limiter: `booked` means the caller already
   * holds the limiter's grant (strikes.ts books a strike group's shared flash with requestGroup, then passes
   * booked: true). Returns whether it flashed. The overlay never lifts the frame's luminance by more than 20 % and
   * ramps in over 80 ms (FlashLimiter.overlayAlpha). Used by stray bolts, the rain's far lightning and Course.flash.
   * Raijin is the exception: he books the same limiter himself and draws his own lit cloud band (raijin.ts
   * StormSky), checked on the real canvas by tools/tests/raijin-flash.shot.mjs.
   */
  skyFlash(strength = 1, opts: { raijin?: boolean; booked?: boolean } = {}): boolean {
    if (!opts.booked && !flashLimiter.request(this.realT)) return false;
    this.flashT0 = this.realT;
    this.flashK = clamp(strength, 0, 1);
    this.flashRaijin = !!opts.raijin;
    return true;
  }

  die(manual: boolean, cause?: Cause) {
    if (this.state !== 'play') return;
    this.cancelPaint();
    this.endRide();
    this.state = 'dying';
    this.dieT = 0;
    this.cause = manual ? null : (cause ?? null);
    // the death's ink burst is a full-screen swing too: no flash may follow it at once
    flashLimiter.note(this.realT);
    if (!manual) this.stats.falls++;
    this.sfx('taiko');
    this.particles.burst('ink', this.px, this.py - 20, 40, 380, 0.9, 3.5, INK, 120);
    this.particles.burst('paint', this.px, this.py - 20, 12, 260, 0.9, 2.5, INKS[this.ink].color, 80);
  }

  private doRespawn() {
    this.cause = null;
    this.placePlayer(this.respawn.x);
    this.state = 'play';
    this.invuln = 0.8;
    this.inkAmt = this.inkMax;
    this.particles.burst('paint', this.px, this.py - 20, 20, 160, 0.7, 2.4, INKS[this.ink].color, 60);
  }

  private updateHazards(dt: number) {
    const t = this.t;
    for (const f of this.level.fires) {
      if (!f.alive) f.deadT += dt;
      else if (Math.random() < dt * 8) {
        this.particles.spawn('ember', f.x + Math.random() * f.w, f.y - f.h * Math.random() * 0.8, (Math.random() - 0.5) * 30, -60 - Math.random() * 60, 1.4, 2.2);
      }
    }
    const tip = this.painting?.[this.painting.length - 1];
    const playing = this.state === 'play';
    for (const y of this.level.yokai) {
      if (!y.alive) {
        y.deadT += dt;
        continue;
      }
      const bx = y.x + Math.sin(t * y.speed + y.phase) * y.ampX;
      const by = y.y + Math.sin(t * y.speed * 1.3 + y.phase) * y.ampY;
      // they notice the traveler, lean toward them, and shy from a gold brush
      const dx = this.px - bx;
      const dy = this.py - 34 - by;
      const d = Math.hypot(dx, dy);
      let tx = 0;
      let ty = 0;
      if (playing && d < 460) {
        tx = clamp(dx * 0.22, -70, 70);
        ty = clamp(dy * 0.22, -50, 50);
      }
      if (tip && this.ink === 'kin') {
        const gd = Math.hypot(tip.x - y.cx, tip.y - y.cy);
        if (gd < 190) {
          y.flinch = Math.min(1, y.flinch + dt * 6);
          tx -= ((tip.x - y.cx) / (gd || 1)) * 40;
          ty -= ((tip.y - y.cy) / (gd || 1)) * 40;
        }
      }
      y.flinch = Math.max(0, y.flinch - dt * 1.5);
      const k = Math.min(1, dt * 1.6);
      y.ox += (tx - y.ox) * k;
      y.oy += (ty - y.oy) * k;
      y.cx = bx + y.ox;
      y.cy = by + y.oy;
      const lookTarget = d < 700 ? Math.atan2(dy, dx) : Math.PI;
      let dl = lookTarget - y.look;
      while (dl > Math.PI) dl -= Math.PI * 2;
      while (dl < -Math.PI) dl += Math.PI * 2;
      y.look += dl * Math.min(1, dt * 5);

      for (const st of this.strokes) {
        if (st.kind !== 'kin') continue;
        const b = st.bbox;
        if (y.cx < b.x0 - y.r - 10 || y.cx > b.x1 + y.r + 10 || y.cy < b.y0 - y.r - 10 || y.cy > b.y1 + y.r + 10) continue;
        if (polylineDist(st.pts, { x: y.cx, y: y.cy }) < y.r + 8) {
          this.banish(y.cx, y.cy, () => (y.alive = false));
          break;
        }
      }
    }
    for (const b of this.level.brambles) if (!b.alive) b.deadT += dt;
    for (const l of this.level.lanterns) if (l.lit) l.litT += dt;
  }

  private finish() {
    if (this.state !== 'play') return;
    this.cancelPaint();
    this.state = 'finish';
    this.finishT = 0;
    this.sfx('finale');
    this.recorder.mark('finish', 0);
    const T = this.level.torii;
    for (let i = 0; i < 90; i++) {
      this.particles.spawn('petal', T.x + (Math.random() - 0.5) * 300, T.y - 260 - Math.random() * 120, (Math.random() - 0.5) * 120, Math.random() * 40, 4 + Math.random() * 3, 4 + Math.random() * 2, Math.random() < 0.7 ? INKS.shu.color : '#f2a7a0');
    }
  }

  grade(): Grade {
    const L = this.level;
    const s = this.stats;
    if (s.time <= L.parTime * 1.15 && s.falls === 0 && s.ink <= L.parInk * 1.6) return '松';
    if (s.time <= L.parTime * 1.5 && s.falls <= 2) return '竹';
    return '梅';
  }

  private updateFinish(dtReal: number) {
    this.toriiPaint = clamp(this.finishT / 1.4, 0, 1);
    // walk on a few steps, then rest
    const stopX = this.level.torii.x + 170;
    const walk = this.rules.runSpeed * 0.5;
    if (this.px < stopX) {
      this.px = Math.min(stopX, this.px + walk * dtReal);
      this.py = groundY(this.level, this.px);
      this.vx = walk;
    } else this.vx = 0;
    this.vy = 0;
    this.grounded = true;
    if (this.finishT > 2.6 && !this.finishAnnounced) {
      this.finishAnnounced = true;
      this.finishCamStart = this.camCX;
      const grade = this.grade();
      const best = loadBest(this.level.id);
      const better =
        !DEBUG_RUN &&
        (!best || GRADE_ORDER.indexOf(grade) > GRADE_ORDER.indexOf(best.grade) || (grade === best.grade && this.stats.time < best.time));
      if (better) saveSetting('inkrunner:best:' + this.level.id, JSON.stringify({ time: this.stats.time, grade }));
      this.onFinish({ ...this.stats, grade, newBest: better, best });
    }
  }

  /** Strokes compressed for the ghost server. */
  /** This run's strokes as the map and ghost ink save them (see `painted`). */
  serializeStrokes() {
    return this.painted.map(({ k, p }) => ({ k, p }));
  }

  private packStroke(s: Stroke) {
    return { k: s.kind, p: resample(s.pts, 8).flatMap((q) => [Math.round(q.x), Math.round(q.y), Math.round(q.w * 10) / 10]) };
  }

  pose(): Pose {
    if (this.poseOverride) return this.poseOverride;
    const def = INKS[this.ink];
    let state: Pose['state'] = 'run';
    if (this.ride) state = 'ride';
    else if (!this.grounded) state = 'air';
    else if (Math.abs(this.vx) < 5 && this.stuckT <= 0) state = 'idle';
    if (this.introT < INTRO_DUR && this.state === 'play') state = 'idle';
    let aim: number | null = null;
    if (this.painting) {
      const m = this.screenToWorld(this.mouse.x, this.mouse.y);
      aim = Math.atan2(m.y - (this.py - 46), m.x - this.px);
    }
    return { x: this.px, y: this.py, phase: this.phase, state, vy: this.vy, accent: def.color, accentLight: def.light, aim, t: this.t };
  }

  private updateCamera(dtReal: number) {
    if (this.state === 'menu') return;
    const S = this.S;
    const viewW = this.W / S;
    if (this.state === 'finish' && this.finishT > 2.6) {
      const k = this.finishT - 2.6;
      this.zoom += (0.42 - this.zoom) * Math.min(1, dtReal * 1.2);
      const vw = this.W / this.S;
      const startX = this.finishCamStart;
      const endX = vw / 2;
      const period = 26;
      const u = (k % period) / period;
      const tri = u < 0.5 ? u * 2 : 2 - u * 2;
      this.camCX = startX + (endX - startX) * easeInOut(tri);
      this.camCX = clamp(this.camCX, vw / 2, this.level.length - vw / 2);
      this.camCY += (430 - this.camCY) * Math.min(1, dtReal * 1.5);
      return;
    }
    // advance run animation
    this.phase += (Math.abs(this.vx) * dtReal * this.timeScale) / 10.5 + (this.stuckT > 0 ? dtReal * this.timeScale * 14 : 0);
    // The x follow below eases at 4/s, so a runner settles vx/4 behind its target (about 77 u at 310 u/s).
    // Scrolls that ask for a wider lead than the original 0.18 (Summer) cancel that lag, so the view really
    // reaches the distance the level was designed around; older scrolls keep their original framing.
    const lag = this.rules.camLead > 0.18 && !this.painting ? clamp(this.vx, 0, this.rules.runSpeed) / 4 : 0;
    const tx = this.px + viewW * this.rules.camLead + lag;
    const ty = this.py - 80;
    // while the brush is down the camera holds its x and follows y in game time, so the glass under the
    // brush stays put: a stroke lands where it was drawn, and a ring is judged as drawn (summer-design 1.1).
    // A traveler about to leave the view (a portal jump) is still followed.
    const holdX = this.painting && Math.abs(tx - this.camCX) < viewW * 0.3;
    const holdY = this.painting && Math.abs(ty - this.camCY) < VIEW_H * 0.3;
    if (!holdX) this.camCX += (tx - this.camCX) * Math.min(1, dtReal * 4);
    const yDt = holdY ? dtReal * this.timeScale : dtReal;
    this.camCY += (ty - this.camCY) * Math.min(1, yDt * (ty > this.camCY ? 5 : 2.5));
    this.camCX = Math.max(viewW / 2, this.camCX);
    this.camCY = clamp(this.camCY, -200, 600);
  }

  // ───────────────────────────────────────────── rendering
  render() {
    const ctx = this.ctx;
    const S = this.S;
    const W = this.W;
    const H = this.H;
    const camX = this.camCX - W / (2 * S);
    const camY = this.camCY - H / (2 * S);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);

    const sky = this.festival.skyNow();
    this.skyPainter.draw(ctx, W, H, sky.id, sky.prev, sky.k, camX * S, this.realT);
    this.backdrop.draw(ctx, camX, camY, S, this.realT);
    this.festival.drawFireworks(ctx);
    this.raijin.drawSky(ctx);

    const world = () => ctx.setTransform(S, 0, 0, S, -camX * S, -camY * S);
    world();
    const vx0 = camX;
    const vx1 = camX + W / S;
    this.terrain.draw(ctx, vx0, vx1, this.scale);
    if (sky.id || sky.prev) {
      this.skyPainter.grade(ctx, W, H, sky.id, sky.prev, sky.k);
      world();
    }
    this.raijin.drawBack(ctx, vx0, vx1);
    this.portals.drawPillars(ctx, vx0, vx1, camY, camY + H / S);
    if (this.level.seaY !== null) drawSea(ctx, this.level.seaY, vx0, vx1, this.t);
    this.rain.drawBack(ctx);
    this.festival.drawBack(ctx, vx0, vx1);

    // pigment that has bled into the paper around strokes
    ctx.globalCompositeOperation = 'multiply';
    for (const st of this.strokes) if (st.bbox.x1 > vx0 - 150 && st.bbox.x0 < vx1 + 150) st.drawWash(ctx);
    ctx.globalCompositeOperation = 'source-over';

    for (const l of this.level.lanterns) if (l.x > vx0 - 100 && l.x < vx1 + 100) lanternGlow(ctx, l, this.realT);
    const T = this.level.torii;
    if (T.x > vx0 - 200 && T.x < vx1 + 200) drawTorii(ctx, T.x, T.y, this.toriiPaint);

    if (this.showGhosts && this.state !== 'menu') this.drawGhosts(ctx, vx0, vx1);

    for (const b of this.level.brambles) if (b.x > vx0 - 200 && b.x < vx1 + 200) drawBramble(ctx, b, this.t);
    for (const f of this.level.fires) if (f.x > vx0 - 300 && f.x < vx1 + 100) drawFire(ctx, f, this.t);

    // while painting, the ink world pales so color can sing
    if (this.slow > 0.01) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = rgba(PAPER, 0.42 * this.slow);
      ctx.fillRect(0, 0, W, H);
      world();
    }

    for (const y of this.level.yokai) if (y.cx > vx0 - 100 && y.cx < vx1 + 100) drawYokai(ctx, y, this.t);
    this.raijin.drawMid(ctx);
    this.strikes.drawMid(ctx, vx0, vx1);

    const pulse = 0.7 + 0.25 * Math.sin(this.realT * 3);
    for (const st of this.strokes) {
      if (st.bbox.x1 < vx0 || st.bbox.x0 > vx1) continue;
      this.rain.drawStroke(ctx, st, pulse);
      if (st.kind === 'ai') this.drawFlow(ctx, st);
    }
    this.portals.draw(ctx, vx0, vx1);

    if (this.state !== 'dying' && this.state !== 'menu') {
      const blink = this.invuln > 0 && Math.floor(this.realT * 20) % 2 === 0;
      if (!blink) this.character.draw(ctx, this.pose());
    }

    if (this.painting) drawWetStroke(ctx, this.painting, this.ink, this.realT);
    if (this.painting) this.portals.drawPaint(ctx);
    this.particles.draw(ctx);
    this.raijin.drawFront(ctx);
    this.strikes.drawFront(ctx, vx0, vx1);
    if (this.cause && (this.state === 'dying' || this.freezeT > 0)) this.drawCause(ctx, this.cause);
    this.rain.drawFront(ctx);

    // weather in front of the world
    this.weather.draw(ctx, this.H / VIEW_H);
    this.drawFlash(ctx);

    // paper grain + aged edges over everything
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'multiply';
    if (this.grainPattern) {
      const ox = -(((camX + this.worldShift) * S) % 512);
      const oy = -((camY * S) % 512);
      this.grainPattern.setTransform(new DOMMatrix([1, 0, 0, 1, ox, oy]));
      ctx.fillStyle = this.grainPattern;
      ctx.fillRect(0, 0, W, H);
    }
    if (this.vignette) ctx.drawImage(this.vignette, 0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';

    if (this.slow > 0.01) {
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.55);
      g.addColorStop(0, 'rgba(23,22,27,0)');
      g.addColorStop(1, `rgba(23,22,27,${0.32 * this.slow})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    if (this.state === 'dying') {
      const k = Math.sin(clamp(this.dieT / 0.9, 0, 1) * Math.PI);
      // softer at Raijin's gate, where deaths come often and his lightning lights the same screen (4.2, N19)
      ctx.fillStyle = rgba(INK, (this.level.raijin ? 0.18 : 0.35) * k);
      ctx.fillRect(0, 0, W, H);
    }

    if (this.state === 'play' && this.introT < INTRO_DUR) this.drawIntro(ctx);
    if ((this.state === 'play' || this.state === 'dying') && !this.hideHUD) this.drawHUD(ctx);
    if (this.recorder.replaying) this.recorder.drawOverlay(ctx);
  }

  /** N10: the cause outlined in red-brown ink, from the hit-stop until the respawn (world transform set). */
  private drawCause(ctx: CanvasRenderingContext2D, c: Cause) {
    const k = this.state === 'dying' ? Math.sin(clamp(this.dieT / 0.9, 0, 1) * Math.PI) * 0.6 + 0.4 : 1;
    const cx = c.x + c.w / 2;
    const cy = c.y + c.h / 2;
    const rx = c.w / 2 + 18;
    const ry = c.h / 2 + 18;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = `rgba(150,40,20,${0.85 * k})`;
    ctx.lineWidth = 5;
    ctx.setLineDash([12, 9]);
    ctx.lineDashOffset = -this.realT * 30;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = `rgba(150,40,20,${0.45 * k})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx + 7, ry + 7, 0, -0.4, Math.PI * 1.7);
    ctx.stroke();
    ctx.restore();
  }

  /** N19: the one full-screen flash, capped by the limiter (≤ 20 % luminance, ≥ 80 ms ramp). */
  private drawFlash(ctx: CanvasRenderingContext2D) {
    const age = this.realT - this.flashT0;
    const a = flashLimiter.overlayAlpha(age, this.flashK);
    if (a <= 0.002) return;
    const W = this.W;
    const H = this.H;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.flashRaijin) {
      // his ring of drums, shown for an instant in the cloud (greybox: eight dark drums on a hoop)
      const lv = flashLimiter.level(age);
      const hs = H / VIEW_H;
      const cx = W * 0.74;
      const cy = 120 * hs;
      ctx.globalAlpha = 0.5 * lv;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 6 * hs;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 92 * hs, 82 * hs, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = INK;
      for (let i = 0; i < 8; i++) {
        const an = (i / 8) * Math.PI * 2 - Math.PI / 2;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(an) * 92 * hs, cy + Math.sin(an) * 82 * hs, 16 * hs, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = `rgba(236,240,255,${a})`;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  /** The scroll unrolls from left to right, inking the world in. */
  private drawIntro(ctx: CanvasRenderingContext2D) {
    const W = this.W;
    const H = this.H;
    const k = easeInOut(clamp(this.introT / (INTRO_DUR * 0.85), 0, 1));
    const rx = -40 + (W + 80) * k;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PAPER;
    ctx.fillRect(rx, 0, W - rx + 2, H);
    // soft shadow cast by the roll
    const sh = ctx.createLinearGradient(rx - 50, 0, rx, 0);
    sh.addColorStop(0, 'rgba(23,22,27,0)');
    sh.addColorStop(1, 'rgba(23,22,27,0.25)');
    ctx.fillStyle = sh;
    ctx.fillRect(rx - 50, 0, 50, H);
    // the rolled paper
    const rw = 34 * (H / VIEW_H);
    const g = ctx.createLinearGradient(rx, 0, rx + rw, 0);
    g.addColorStop(0, '#d9ccb2');
    g.addColorStop(0.35, '#f6efe0');
    g.addColorStop(0.7, '#e2d5bb');
    g.addColorStop(1, '#b9a988');
    ctx.fillStyle = g;
    ctx.fillRect(rx, 0, rw, H);
    ctx.strokeStyle = rgba(INK, 0.25);
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(rx + (rw * i) / 4, 0);
      ctx.lineTo(rx + (rw * i) / 4, H);
      ctx.stroke();
    }
    // title brushed in the middle while it unrolls
    const a = Math.sin(clamp(this.introT / INTRO_DUR, 0, 1) * Math.PI);
    ctx.globalAlpha = a;
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const hs = H / VIEW_H;
    ctx.font = `${110 * hs}px ${FONT_BRUSH}`;
    ctx.fillText(this.info.kanji, W / 2, H * 0.42);
    ctx.font = `italic ${26 * hs}px ${FONT_SERIF}`;
    ctx.fillText(this.info.name, W / 2, H * 0.42 + 84 * hs);
    ctx.globalAlpha = 1;
  }

  private drawGhosts(ctx: CanvasRenderingContext2D, vx0: number, vx1: number) {
    ctx.save();
    for (const st of this.ghosts.strokes) {
      if (st.bbox.x1 < vx0 || st.bbox.x0 > vx1) continue;
      if (!st.sprite) st.bake(this.scale);
      st.age = 99;
      ctx.globalAlpha = 0.22;
      const sp = st.sprite!;
      ctx.drawImage(sp.canvas, sp.x, sp.y, sp.canvas.width / sp.s, sp.canvas.height / sp.s);
    }
    ctx.restore();
    const best = this.ghosts.best;
    if (best && best.path.length >= 4 && this.state === 'play') {
      const i = Math.floor(this.stats.time / 0.1);
      const n = best.path.length / 2;
      if (i < n - 1) {
        const f = this.stats.time / 0.1 - i;
        const x = best.path[i * 2] + (best.path[i * 2 + 2] - best.path[i * 2]) * f;
        const y = best.path[i * 2 + 1] + (best.path[i * 2 + 3] - best.path[i * 2 + 1]) * f;
        if (x > vx0 - 100 && x < vx1 + 100) {
          const dy = best.path[i * 2 + 3] - best.path[i * 2 + 1];
          const pose: Pose = {
            x,
            y,
            phase: x / 10.5,
            state: Math.abs(dy) > 3 ? 'air' : 'run',
            vy: dy * 10,
            accent: '#8a8790',
            accentLight: '#c9c6cc',
            aim: null,
            t: this.t,
          };
          if (this.ghostChar.id !== best.char) this.ghostChar = new Character(best.char);
          this.ghostChar.update(pose, 1 / 60);
          this.drawGhostRunner(ctx, pose);
        }
      }
    }
  }

  /** The best run's traveler as one flat, pale wash, so it can never be mistaken for you. */
  private drawGhostRunner(ctx: CanvasRenderingContext2D, pose: Pose) {
    const S = ctx.getTransform().a;
    const box = 170;
    const size = Math.ceil(box * S);
    const layer = this.ghostLayer;
    if (layer.width !== size) layer.width = layer.height = size;
    const g = layer.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, size, size);
    g.setTransform(S, 0, 0, S, (box * 0.5 - pose.x) * S, (box * 0.72 - pose.y) * S);
    this.ghostChar.draw(g, pose);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#7d8296';
    g.fillRect(0, 0, size, size);
    ctx.save();
    // fade almost out while overlapping the player so it never reads as a second you
    const near = Math.hypot(pose.x - this.px, (pose.y - this.py) * 0.6);
    ctx.globalAlpha = 0.06 + 0.24 * smoothstep(clamp((near - 40) / 120, 0, 1));
    ctx.drawImage(layer, pose.x - box * 0.5, pose.y - box * 0.72, box, box);
    ctx.restore();
  }

  private drawFlow(ctx: CanvasRenderingContext2D, st: Stroke) {
    const first = st.pts[0];
    const last = st.pts[st.pts.length - 1];
    const dir = last.x - first.x < -30 ? -1 : 1;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = st.dryness;
    ctx.beginPath();
    st.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.strokeStyle = 'rgba(225,238,255,0.55)';
    ctx.lineWidth = 2.2;
    ctx.setLineDash([16, 34]);
    ctx.lineDashOffset = -this.t * 160 * dir;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(190,215,255,0.35)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([6, 22]);
    ctx.lineDashOffset = -this.t * 230 * dir + 7;
    ctx.stroke();
    ctx.restore();
  }

  private drawHUD(ctx: CanvasRenderingContext2D) {
    const hs = this.H / VIEW_H;
    const def = INKS[this.ink];
    ctx.save();
    ctx.setTransform(hs, 0, 0, hs, 0, 0);

    // ink meter: a brushed bar
    const bx = 70;
    const by = 46;
    // bar length follows this run's inkwell (scroll rules x Ren's deep inkwell) against the default well
    const bw = 230 * clamp(this.inkMax / INK_MAX, 0.25, 3) ** 0.5;
    ctx.font = `40px ${FONT_BRUSH}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = def.color;
    ctx.fillText(def.kanji, 40, by + 2);
    brushLine(ctx, [{ x: bx, y: by }, { x: bx + bw, y: by + 1 }], mulberry32(5), { w: 14, alpha: 0.13, taperIn: 4, taperOut: 10, bristles: 4, dry: 0.4 });
    const frac = this.inkAmt / this.inkMax;
    if (frac > 0.01) {
      brushLine(ctx, [{ x: bx, y: by }, { x: bx + bw * frac, y: by + 1 }], mulberry32(6), {
        w: 12,
        color: def.color,
        alpha: 0.95,
        taperIn: 4,
        taperOut: Math.min(14, bw * frac * 0.4),
        bristles: 3,
      });
    }
    ctx.restore();

    // ink stones
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const s of this.stoneLayout()) {
      const d = INKS[s.k];
      const sel = s.k === this.ink;
      const r = s.r * (sel ? 1 : 0.76);
      ctx.fillStyle = rgba(INK, 0.15);
      ctx.beginPath();
      ctx.arc(s.x + 2 * hs, s.y + 3 * hs, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = d.color;
      ctx.globalAlpha = sel ? 1 : 0.55;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (sel) {
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2 * hs;
        ctx.beginPath();
        ctx.arc(s.x, s.y, r + 6 * hs, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = PAPER;
      ctx.font = `${r * 1.04}px ${FONT_BRUSH}`;
      ctx.fillText(d.kanji, s.x, s.y + 1);
      if (!IS_TOUCH) {
        ctx.fillStyle = rgba(INK, 0.6);
        ctx.font = `${13 * hs}px ${FONT_SERIF}`;
        ctx.fillText(keyLabel(inkKey(s.k)), s.x, s.y - r - (sel ? 18 : 12) * hs);
      }
    }
    ctx.restore();
    this.rain.drawHUD(ctx, this.stoneLayout());

    ctx.save();
    ctx.setTransform(hs, 0, 0, hs, 0, 0);
    // time + par
    const right = VIEW_H * (this.W / this.H) - 30;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    // a paper halo under HUD text keeps it readable on the dark Summer skies (invisible on plain paper)
    ctx.lineJoin = 'round';
    ctx.strokeStyle = rgba(PAPER, 0.75);
    ctx.lineWidth = 5;
    ctx.fillStyle = rgba(INK, 0.65);
    ctx.font = `italic 20px ${FONT_SERIF}`;
    ctx.strokeText(this.stats.time.toFixed(1) + 's', right, 44);
    ctx.fillText(this.stats.time.toFixed(1) + 's', right, 44);
    ctx.fillStyle = rgba(INK, 0.4);
    ctx.font = `italic 13px ${FONT_SERIF}`;
    ctx.lineWidth = 4;
    ctx.strokeText(`par ${this.level.parTime.toFixed(0)}s`, right, 66);
    ctx.fillText(`par ${this.level.parTime.toFixed(0)}s`, right, 66);

    // stuck nudge
    if (this.stuckT > 0.9 && this.state === 'play') {
      const S = this.S;
      const sx = ((this.px - (this.camCX - this.W / (2 * S))) * S) / hs;
      const sy = ((this.py - 90 - (this.camCY - this.H / (2 * S))) * S) / hs;
      ctx.textAlign = 'center';
      ctx.globalAlpha = clamp((this.stuckT - 0.9) * 2, 0, 1);
      ctx.fillStyle = INK;
      ctx.font = `italic 20px ${FONT_SERIF}`;
      const nudge = this.portals.nudge() ?? 'Paint a way up';
      ctx.strokeStyle = rgba(PAPER, 0.8);
      ctx.lineWidth = 5;
      ctx.strokeText(nudge, sx, sy);
      ctx.fillText(nudge, sx, sy);
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // brush cursor
    if (this.mouse.inside) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const r = (def.width / 2) * this.S;
      ctx.strokeStyle = def.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.mouse.x, this.mouse.y, r + 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = def.color;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(this.mouse.x, this.mouse.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}
