import type { Audio } from '../audio';
import { FONT_BRUSH, FONT_SERIF, INK, IS_TOUCH, MAX_RENDER_H, PAPER, type CharId } from '../config';
import { easeInOut } from '../math';
import { brushLine, rgba } from '../render/brush';
import { makeGrain, makeVignette } from '../render/paper';
import { mulberry32 } from '../rng';
import { releaseBackdrop } from './scene';
import { BrushText, type Rect } from './text';
import { FRAME_H, FRAME_W, SAFE_W, type CueAudio, type CutsceneDef, type PanelScene, type View } from './types';

/** seconds of the camera pan between panels (it overlaps the next panel's start) */
export const PAN = 0.6;
/** the opening: the paper unrolls from the left over whatever was on screen */
const UNROLL = 0.8;
/** how long the overlay takes to wash away after a skip */
const FADE_OUT = 0.4;
/** ...and after a cutscene that hands over into the map plays to its end: a slower crossfade onto the map */
const FADE_HANDOVER = 0.7;
/** seconds before the end of a 'map' outro when the host is asked to open the map underneath (it bakes, frozen) */
export const HANDOVER_LEAD = 1.6;
/** the map's silk mounting bands slide in over the last seconds, to land exactly where the map's own are */
const BANDS = { lead: 1.25, dur: 0.85 };
/** the map's band height and colours (src/campaign/map.ts: BAND, bands()) in map units of a 720-unit-tall view */
const MAP_BAND = 20;
const MAP_SILK = '#3b3741';
/** inputs in the first moments are ignored, so the tap that started the cutscene cannot skip it */
const INPUT_GUARD = 0.25;
const TEXT_AT = 0.3;

export type EndReason = 'end' | 'skip';

export interface PlayOptions {
  /** the traveler the player chose: the lead in every panel from P4 on */
  char?: CharId;
  /** the game's audio; every cue goes through its public API. Null plays silently. */
  audio?: Audio | null;
  /** the game's paper grain tile (Game.grain); made fresh if absent */
  grain?: HTMLCanvasElement;
  /** called once, the moment the cutscene ends or is skipped; the overlay then washes away on its own */
  onDone?: (how: EndReason) => void;
  /**
   * Called exactly once, before onDone: HANDOVER_LEAD seconds before the end of a cutscene whose outro is 'map'
   * (open the map underneath now; the paper still covers it, so it can bake), or right before onDone when the
   * cutscene is skipped or has no map outro.
   */
  onHandover?: () => void;
  /** a tap or click moves to the next panel instead of ending (Esc and Skip always end) */
  tapAdvances?: boolean;
  parent?: HTMLElement;
  /** dev: start at a panel (0-based) */
  startPanel?: number;
}

let sharedGrain: HTMLCanvasElement | null = null;
let styled = false;

function injectStyle() {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = `
.cutscene{position:fixed;inset:0;z-index:8;touch-action:none;user-select:none;-webkit-user-select:none;transition:opacity ${FADE_OUT}s ease}
.cutscene canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.cutscene .cs-skip{position:absolute;right:calc(18px + env(safe-area-inset-right));bottom:calc(14px + env(safe-area-inset-bottom));
  font:italic 19px ${FONT_SERIF};color:${rgba(INK, 0.72)};background:none;border:0;padding:10px 14px;cursor:pointer;opacity:0;
  transition:opacity .5s ease;letter-spacing:.02em;border-radius:999px;background:${rgba(PAPER, 0.62)};box-shadow:0 0 14px ${rgba(PAPER, 0.5)}}
.cutscene .cs-skip.on{opacity:1}
.cutscene .cs-skip:hover,.cutscene .cs-skip:focus-visible{color:${INK};outline:none;text-decoration:underline;text-underline-offset:5px}
.cutscene .cs-probe{position:fixed;inset:0;pointer-events:none;visibility:hidden;
  padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)}
.cutscene.out{opacity:0;pointer-events:none}
.cutscene.out.slow{transition-duration:${FADE_HANDOVER}s}`;
  document.head.appendChild(s);
}

interface Live {
  scene: PanelScene;
  jobs: (() => void)[];
  /** panel time the scene's physics has been stepped to */
  simT: number;
  /** its brush text's bake job has been queued (only once the fonts are in) */
  textQueued: boolean;
}

/** per-frame budget for start-up and look-ahead bake jobs, ms (at least one job always runs) */
const JOB_BUDGET = 4;
/** the first picture washes in over the paper this fast once it is painted */
const WASH_IN = 0.3;

/**
 * Plays a painted cutscene: a short handscroll of panels in its own overlay. The paper unrolls over the screen,
 * each panel paints itself in, the camera pans right along one continuous strip between panels, brush text writes
 * itself, and the last panel hands over (to the map). Tap, click, Esc, Space, Enter or the Skip button end it.
 */
export class CutscenePlayer {
  readonly root: HTMLDivElement;
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private skipBtn: HTMLButtonElement;
  private probe: HTMLDivElement;
  private grain: HTMLCanvasElement;
  private grainPattern: CanvasPattern | null = null;
  private vignette: HTMLCanvasElement | null = null;

  /** global time in seconds (held at its start until the first panel is painted) */
  T = 0;
  /** wall seconds since start(): drives the opening unroll and the input guard */
  U = 0;
  /** the first panel (and the shared backdrop) is painted and the timeline runs */
  booted = false;
  private boot: (() => void)[] = [];
  private readyU = 0;
  /** the opening unroll and wash-in are over (or were skipped by a seek) */
  private opened = false;
  readonly total: number;
  readonly starts: number[];
  paused = false;
  /** dev: draw the brush text (off tests that the pictures read on their own) */
  textOn = true;
  ended: EndReason | null = null;
  lead: CharId;

  private live = new Map<number, Live>();
  private texts = new Map<number, BrushText>();
  private raf = 0;
  private last = 0;
  private dt = 0;
  private fontsReady = false;
  private cue: CueAudio;
  private onKey: (e: KeyboardEvent) => void;
  private handedOver = false;
  private onResize: () => void;

  // layout (device pixels)
  private W = 0;
  private H = 0;
  private pr = 1;
  /** device px per design unit */
  k = 1;
  /** device px of the frame's top-left */
  private fx = 0;
  private fy = 0;
  /** distance between panel frames on the strip, in units */
  private pitch = FRAME_W;
  /** safe area in CSS px */
  safe = { left: 0, top: 0, right: 0, bottom: 0 };

  constructor(
    readonly def: CutsceneDef,
    private opts: PlayOptions = {},
  ) {
    injectStyle();
    this.lead = opts.char ?? 'ren';
    this.starts = [];
    let t = 0;
    for (const p of def.panels) {
      this.starts.push(t);
      t += p.dur;
    }
    this.total = t;
    this.grain = opts.grain ?? (sharedGrain ??= makeGrain());
    const audio = opts.audio ?? null;
    this.cue = {
      audio,
      motif: (n) => {
        // the master's motif on the koto: D5, A4, G4 ... and the fourth note, D4, resolves it
        const deg = [15, 13, 12, 10][n - 1];
        audio?.fx('note', `shu:${1 - (deg - 9) / 6}:0.75`);
      },
    };

    this.root = document.createElement('div');
    this.root.className = 'cutscene';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', def.title);
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('aria-hidden', 'true');
    this.ctx = this.canvas.getContext('2d')!;
    this.skipBtn = document.createElement('button');
    this.skipBtn.className = 'cs-skip';
    this.skipBtn.type = 'button';
    this.skipBtn.textContent = 'Skip ›';
    this.skipBtn.setAttribute('aria-label', 'Skip the story');
    this.probe = document.createElement('div');
    this.probe.className = 'cs-probe';
    this.root.append(this.canvas, this.skipBtn, this.probe);

    this.root.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.U < INPUT_GUARD || this.ended) return;
      if (e.target === this.skipBtn) {
        this.skip();
        return;
      }
      if (this.opts.tapAdvances) this.advance();
      else this.skip();
    });
    this.skipBtn.addEventListener('click', () => this.skip());
    this.onKey = (e: KeyboardEvent) => {
      if (this.ended) return;
      // a modal: nothing behind it (the map's arrow keys, the game's keys) hears the keyboard while it plays,
      // except M, which mutes the sound as everywhere else
      if (e.code !== 'KeyM') e.stopImmediatePropagation();
      if (e.code === 'Escape' || e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') {
        // the game listens on window too; the cutscene owns these keys while it plays
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.repeat || this.U < INPUT_GUARD) return;
        if (e.code !== 'Escape' && this.opts.tapAdvances) this.advance();
        else this.skip();
      }
    };
    this.onResize = () => this.resize();
    if (opts.startPanel) this.T = this.starts[Math.min(opts.startPanel, this.starts.length - 1)];
  }

  /**
   * Show the paper at once and start the unroll on the very next frame; the shared backdrop and the first panel are
   * painted as jobs spread over the first frames of the unroll (a few ms each), and the timeline starts when they are
   * done. The fonts load in the background and are only waited for before the brush text is baked.
   */
  start() {
    (this.opts.parent ?? document.body).appendChild(this.root);
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('resize', this.onResize);
    this.resize();
    void this.loadFonts().then(() => {
      this.fontsReady = true;
    });
    this.queueBoot();
    this.cue.audio?.init();
    this.last = performance.now();
    this.render();
    this.raf = requestAnimationFrame(this.frame);
    setTimeout(() => this.skipBtn.classList.add('on'), 600);
  }

  /** the start-up jobs: the shared backdrop first (P3 to P5 need it), then the first panel's own */
  private queueBoot() {
    this.boot = [() => this.def.prepare?.(this.k)];
    this.ensure(this.panelAt(this.T), false);
  }

  /** run start-up jobs within the frame budget; true once the first panel is fully painted (text too) */
  private runBoot() {
    const L = this.live.get(this.panelAt(this.T));
    const t0 = performance.now();
    do {
      const job = this.boot.shift() ?? L?.jobs.shift();
      if (!job) break;
      job();
    } while (performance.now() - t0 < JOB_BUDGET);
    if (L && this.fontsReady && !L.textQueued) this.ensure(this.panelAt(this.T), false);
    return !this.boot.length && !!L && !L.jobs.length && L.textQueued;
  }

  /** the paper covers the whole screen (after the opening unroll) and the cutscene has not ended */
  get covering() {
    return !this.ended && (this.U >= UNROLL || this.opened);
  }

  private async loadFonts() {
    const glyphs = this.def.panels.map((p) => (p.text.kanji ?? '') + p.text.line).join('') + 'Skip ›';
    const timeout = new Promise((r) => setTimeout(r, 1500));
    try {
      await Promise.race([
        Promise.all([document.fonts.load(`120px ${FONT_BRUSH}`, glyphs), document.fonts.load(`italic 30px ${FONT_SERIF}`, glyphs)]),
        timeout,
      ]);
    } catch {
      // a missing font falls back to the system serif; never block the story on it
    }
  }

  private frame = (now: number) => {
    if (!this.root.isConnected) return;
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.update(dt);
    this.render();
    if (!this.ended || this.T < this.total + FADE_OUT) this.raf = requestAnimationFrame(this.frame);
  };

  // ───────────────────────────────────────── timeline

  panelAt(T: number) {
    let i = 0;
    while (i + 1 < this.starts.length && T >= this.starts[i + 1]) i++;
    return i;
  }

  /** panels on screen at T: the current one, and during a pan the one it is leaving */
  visible(T: number): number[] {
    const i = this.panelAt(T);
    if (i > 0 && T - this.starts[i] < PAN) return [i - 1, i];
    return [i];
  }

  update(dt: number) {
    this.U += dt;
    if (!this.booted) {
      this.dt = 0;
      if (!this.runBoot()) return;
      this.booted = true;
      this.readyU = this.U;
    }
    this.dt = this.paused ? 0 : dt;
    if (!this.paused && !this.ended) {
      const T0 = this.T;
      this.T = Math.min(this.total, this.T + dt);
      this.fireCues(T0, this.T);
      if (this.def.outro === 'map' && this.T >= this.total - HANDOVER_LEAD) this.handover();
      if (this.T >= this.total) this.finish('end');
    }
    const vis = this.visible(this.T);
    for (const i of vis) this.ensure(i, true);
    // paint the next panel's still parts ahead of time, a little per frame
    const next = vis[vis.length - 1] + 1;
    if (next < this.def.panels.length) {
      this.ensure(next, false);
      const L = this.live.get(next)!;
      const t0 = performance.now();
      while (L.jobs.length && performance.now() - t0 < JOB_BUDGET - 1) L.jobs.shift()!();
    }
    for (const [i, L] of this.live) {
      if (i < vis[0] - 0 && !vis.includes(i)) {
        L.scene.release();
        this.live.delete(i);
        this.texts.get(i)?.release();
        this.texts.delete(i);
        continue;
      }
      if (vis.includes(i)) {
        const t = this.T - this.starts[i];
        if (t > L.simT) {
          L.scene.update(t, t - L.simT);
          L.simT = t;
        }
      }
    }
  }

  private fireCues(T0: number, T1: number) {
    this.def.panels.forEach((p, i) => {
      for (const c of p.cues) {
        const at = this.starts[i] + c.t;
        if (at > T0 && at <= T1) c.run(this.cue);
      }
    });
  }

  /** make sure a panel's scene exists; `now` runs all its bake jobs immediately. Text bakes once the fonts are in. */
  private ensure(i: number, now: boolean) {
    let L = this.live.get(i);
    if (!L) {
      const scene = this.def.panels[i].create(this.lead);
      L = { scene, jobs: scene.bake(this.k, this.view()), simT: 0, textQueued: false };
      this.texts.set(i, new BrushText(this.def.panels[i].text));
      this.live.set(i, L);
    }
    if (this.fontsReady && !L.textQueued) {
      L.textQueued = true;
      const text = this.texts.get(i)!;
      L.jobs.push(() => text.bake(this.k));
    }
    if (now) while (L.jobs.length) L.jobs.shift()!();
  }

  /** move to the next panel (dev, and tapAdvances) */
  advance() {
    const i = this.panelAt(this.T);
    if (i + 1 >= this.def.panels.length) this.skip();
    else this.seek(this.starts[i + 1]);
  }

  /** Jump to time T, re-running the figures' physics from each visible panel's start so frames are repeatable. */
  seek(T: number) {
    T = Math.max(0, Math.min(this.total - 1e-3, T));
    for (const L of this.live.values()) L.scene.release();
    for (const t of this.texts.values()) t.release();
    this.live.clear();
    this.texts.clear();
    this.T = T;
    // jumping to a moment skips the opening
    this.opened = true;
    if (!this.booted) {
      // still starting up: just start over at T
      this.queueBoot();
      return;
    }
    for (const i of this.visible(T)) {
      this.ensure(i, true);
      const L = this.live.get(i)!;
      const end = T - this.starts[i];
      for (let t = 1 / 60; t <= end; t += 1 / 60) L.scene.update(t, 1 / 60);
      L.simT = end;
    }
  }

  skip() {
    this.finish('skip');
  }

  /** ask the host to open the map underneath (once) */
  private handover() {
    if (this.handedOver) return;
    this.handedOver = true;
    this.opts.onHandover?.();
  }

  private finish(how: EndReason) {
    if (this.ended) return;
    this.ended = how;
    this.cue.audio?.brush(0);
    const slow = how === 'end' && this.def.outro === 'map';
    this.root.classList.toggle('slow', slow);
    this.root.classList.add('out');
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('resize', this.onResize);
    setTimeout(() => this.destroy(), (slow ? FADE_HANDOVER : FADE_OUT) * 1000 + 50);
    this.handover();
    this.opts.onDone?.(how);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('resize', this.onResize);
    for (const L of this.live.values()) L.scene.release();
    for (const t of this.texts.values()) t.release();
    this.live.clear();
    this.texts.clear();
    this.root.remove();
    this.canvas.width = this.canvas.height = 0;
    // the shared backdrop strips are large; give the memory back (phones)
    releaseBackdrop();
  }

  // ───────────────────────────────────────── layout

  resize() {
    const cw = window.innerWidth;
    const ch = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    const cap = IS_TOUCH ? 1000 : MAX_RENDER_H;
    let pr = dpr;
    if (ch * pr > cap) pr = cap / ch;
    this.pr = pr;
    this.W = Math.round(cw * pr);
    this.H = Math.round(ch * pr);
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    const cs = getComputedStyle(this.probe);
    this.safe = {
      top: parseFloat(cs.paddingTop) || 0,
      right: parseFloat(cs.paddingRight) || 0,
      bottom: parseFloat(cs.paddingBottom) || 0,
      left: parseFloat(cs.paddingLeft) || 0,
    };
    // fit the essential area (1040 x 720 units) inside the safe area; the paper runs on to the screen's edges
    const sw = cw - this.safe.left - this.safe.right;
    const sh = ch - this.safe.top - this.safe.bottom;
    const kc = Math.min(sh / FRAME_H, sw / SAFE_W);
    this.k = kc * pr;
    const cx = this.safe.left + sw / 2;
    const cy = this.safe.top + sh / 2;
    this.fx = (cx - (FRAME_W / 2) * kc) * pr;
    this.fy = (cy - (FRAME_H / 2) * kc) * pr;
    this.pitch = Math.max(FRAME_W, this.W / this.k + 2);
    this.grainPattern = this.ctx.createPattern(this.grain, 'repeat');
    this.vignette = makeVignette(this.W, this.H);
    if (this.booted || this.live.size) {
      // repaint the live panels at the new scale (during start-up, start the painting over)
      const opened = this.opened;
      this.seek(this.T);
      this.opened = opened;
    }
  }

  /** the design-space rect visible on screen, frame coordinates */
  private view(): View {
    const half = (this.pitch - FRAME_W) / 2;
    return {
      k: this.k,
      x0: -this.fx / this.k,
      x1: (this.W - this.fx) / this.k,
      y0: -this.fy / this.k,
      y1: (this.H - this.fy) / this.k,
      sheetX0: -half,
      sheetX1: FRAME_W + half,
      dt: this.dt,
    };
  }

  /** camera position along the strip, in units (0 = panel 0's frame) */
  private camAt(T: number) {
    const i = this.panelAt(T);
    const u = T - this.starts[i];
    if (i > 0 && u < PAN) return (i - 1 + easeInOut(u / PAN)) * this.pitch;
    return i * this.pitch;
  }

  // ───────────────────────────────────────── drawing

  render() {
    const ctx = this.ctx;
    const { W, H, k } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    // opening: the paper unrolls from the left over whatever was on screen
    if (this.opts.startPanel) this.opened = true;
    const unroll = this.U < UNROLL && !this.opened ? easeInOut(this.U / UNROLL) : 1;
    const edge = unroll * (W + 60 * k);
    if (unroll < 1) {
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, edge, H);
      ctx.clip();
    }
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);
    const cam = this.camAt(this.T);
    const view = this.view();
    for (const i of this.booted ? this.visible(this.T) : []) {
      const L = this.live.get(i);
      if (!L) continue;
      const t = this.T - this.starts[i];
      const off = i * this.pitch - cam;
      const ox = this.fx + off * k;
      // the panel's sheet on the strip
      const sx0 = ox - ((this.pitch - FRAME_W) / 2) * k;
      const sx1 = sx0 + this.pitch * k;
      ctx.save();
      ctx.beginPath();
      ctx.rect(Math.max(0, sx0), 0, Math.min(W, sx1) - Math.max(0, sx0), H);
      ctx.clip();
      ctx.setTransform(k, 0, 0, k, ox, this.fy);
      const pv: View = { ...view, x0: view.x0 - off, x1: view.x1 - off };
      const cam2 = L.scene.camera?.(t);
      ctx.save();
      if (cam2) {
        ctx.translate(cam2.cx, cam2.cy);
        ctx.scale(cam2.z, cam2.z);
        ctx.translate(-cam2.cx - cam2.dx, -cam2.cy - cam2.dy);
      }
      L.scene.draw(ctx, t, pv);
      ctx.restore();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      const text = this.texts.get(i);
      const at = this.def.panels[i].text.at ?? TEXT_AT;
      const fadeAt = this.def.panels[i].text.fadeAt;
      const ta = fadeAt === undefined ? 1 : 1 - Math.min(1, Math.max(0, (t - fadeAt) / 0.4));
      if (text?.baked && this.textOn) text.draw(ctx, t - at, ta);
      ctx.restore();
      // the joint between two sheets of the scroll
      if (i > 0 && sx0 > 0 && sx0 < W) {
        ctx.fillStyle = rgba(INK, 0.06);
        ctx.fillRect(sx0 - 1, 0, 2, H);
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(sx0 + 1, 0, 1, H);
      }
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // the first picture washes in over the bare paper once it is painted
    const wash = !this.booted ? 0 : this.opened ? 1 : Math.min(1, (this.U - this.readyU) / WASH_IN);
    if (wash < 1) {
      ctx.globalAlpha = 1 - easeInOut(wash);
      ctx.fillStyle = PAPER;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    // paper grain and aged edges over everything, as in play
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'multiply';
    if (this.grainPattern) {
      const gx = -((cam * k) % 512);
      this.grainPattern.setTransform(new DOMMatrix([1, 0, 0, 1, gx, 0]));
      ctx.fillStyle = this.grainPattern;
      ctx.fillRect(0, 0, W, H);
    }
    if (this.vignette) ctx.drawImage(this.vignette, 0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    if (this.def.outro === 'map') this.drawBands();
    if (unroll < 1) {
      ctx.restore();
      this.drawRoller(edge);
    }
  }

  /**
   * The hand-over into the map: the map's silk mounting bands slide in from the top and bottom edges and settle
   * exactly where the map's own bands sit (its view is the safe area, 720 map units tall), so when the paper
   * washes away onto the map the bands stay put and only the picture between them changes.
   */
  private drawBands() {
    const u = easeInOut(Math.min(1, Math.max(0, (this.T - (this.total - BANDS.lead)) / BANDS.dur)));
    if (u <= 0) return;
    const ctx = this.ctx;
    const { W, pr } = this;
    const top = this.safe.top * pr;
    const bottom = this.H - this.safe.bottom * pr;
    const unit = (bottom - top) / 720;
    const h = MAP_BAND * unit;
    // the map's view is inset by the safe area on every side; outside it the screen is plain paper
    const x0 = this.safe.left * pr;
    const x1 = W - this.safe.right * pr;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (const [y0, dir] of [
      [top, -1],
      [bottom - h, 1],
    ] as const) {
      const y = y0 + dir * (1 - u) * (h + top + this.safe.bottom * pr + 4);
      ctx.fillStyle = MAP_SILK;
      ctx.fillRect(x0, y, x1 - x0, h);
      ctx.fillStyle = 'rgba(190,160,100,0.55)';
      ctx.fillRect(x0, dir < 0 ? y + h - 2 * unit : y, x1 - x0, 2 * unit);
    }
    ctx.restore();
  }

  /** the roller of the scroll as it unrolls across the screen */
  private drawRoller(x: number) {
    const ctx = this.ctx;
    const { H, k } = this;
    const r = 26 * k;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const g = ctx.createLinearGradient(x - r, 0, x + r, 0);
    g.addColorStop(0, '#d9ccb0');
    g.addColorStop(0.4, '#f6efdf');
    g.addColorStop(1, '#bfae8a');
    ctx.fillStyle = rgba(INK, 0.18);
    ctx.fillRect(x + r * 0.6, 0, r * 0.9, H);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, 0, r * 2, H);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    const xu = x / k;
    const hu = H / k;
    const rr = mulberry32(31);
    brushLine(ctx, [{ x: xu - 26, y: -4 }, { x: xu - 26, y: hu + 4 }], rr, { w: 2.4, alpha: 0.55, taperIn: 30, taperOut: 30 });
    brushLine(ctx, [{ x: xu + 26, y: -4 }, { x: xu + 26, y: hu + 4 }], rr, { w: 3, alpha: 0.7, taperIn: 30, taperOut: 30, bristles: 3, dry: 0.4 });
    ctx.restore();
  }

  // ───────────────────────────────────────── dev and test hooks (read-only)

  /** the brush text's on-screen rects right now, in CSS pixels */
  textRects(): { panel: number; rect: Rect }[] {
    const out: { panel: number; rect: Rect }[] = [];
    if (!this.textOn) return out;
    const cam = this.camAt(this.T);
    for (const i of this.visible(this.T)) {
      const tx = this.texts.get(i);
      if (!tx?.baked) continue;
      const at = this.def.panels[i].text.at ?? TEXT_AT;
      if (this.T - this.starts[i] < at) continue;
      const r = tx.rect();
      const ox = this.fx + (i * this.pitch - cam) * this.k;
      const x = (ox + r.x * this.k) / this.pr;
      const y = (this.fy + r.y * this.k) / this.pr;
      const w = (r.w * this.k) / this.pr;
      const h = (r.h * this.k) / this.pr;
      // only what is on screen counts
      if (x + w < 0 || x > this.W / this.pr) continue;
      out.push({ panel: i, rect: { x, y, w, h } });
    }
    return out;
  }

  /** where a point of the current panel's frame is on screen, in CSS pixels (with the panel's own camera) */
  frameToCss(x: number, y: number) {
    const i = this.panelAt(this.T);
    const cam = this.live.get(i)?.scene.camera?.(this.T - this.starts[i]);
    if (cam) {
      x = cam.cx + (x - cam.cx - cam.dx) * cam.z;
      y = cam.cy + (y - cam.cy - cam.dy) * cam.z;
    }
    const ox = this.fx + (i * this.pitch - this.camAt(this.T)) * this.k;
    return { x: (ox + x * this.k) / this.pr, y: (this.fy + y * this.k) / this.pr };
  }

  info() {
    const i = this.panelAt(this.T);
    return {
      T: this.T,
      total: this.total,
      panel: i,
      id: this.def.panels[i].id,
      local: this.T - this.starts[i],
      ended: this.ended,
      css: { w: this.W / this.pr, h: this.H / this.pr },
      safe: { ...this.safe },
      k: this.k / this.pr,
    };
  }
}
