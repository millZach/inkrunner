import type { Sfx } from './audio';
import { FONT_BRUSH, FONT_SERIF, INK, INKS, PAPER, VIEW_H, type InkKind } from './config';
import type { Game, State } from './game';
import type { BP } from './math';
import { rgba } from './render/brush';
import type { Pose } from './render/characters';
import { Particles, type SpawnEvent } from './render/particles';
import type { Stroke } from './strokes';

interface Frame {
  rt: number;
  t: number;
  ts: number;
  slow: number;
  camCX: number;
  camCY: number;
  zoom: number;
  pose: Pose;
  ink: InkKind;
  state: State;
  dieT: number;
  invuln: number;
  toriiPaint: number;
  introT: number;
  painting: BP[] | null;
  paintLen: number;
  strokes: Stroke[];
  haz: Float32Array;
  brush: number;
  time: number;
}

type Mark = { rt: number; type: 'paintStart' | 'paintEnd' | 'effect' | 'finish'; v: number | string };

const MAX_FRAMES = 60 * 60 * 12;
const FADE = 0.28;

interface ReplayState {
  segs: [number, number][];
  seg: number;
  clock: number;
  fi: number;
  lastRt: number;
  pi: number;
  si: number;
  saved: Frame;
  savedParticles: Particles;
  done: () => void;
}

/**
 * Records a lightweight timeline of each run (camera, pose, strokes, hazard
 * state, particle + sound events) so highlight clips and share cards can be
 * re-rendered after the fact.
 */
export class Recorder {
  frames: Frame[] = [];
  private pev: (SpawnEvent & { rt: number })[] = [];
  private sev: { rt: number; name: Sfx; arg: number | string }[] = [];
  marks: Mark[] = [];
  private rt = 0;
  private lastCap = -1;
  private rp: ReplayState | null = null;

  constructor(private g: Game) {}

  get replaying() {
    return this.rp !== null;
  }

  begin() {
    this.frames = [];
    this.pev = [];
    this.sev = [];
    this.marks = [];
    this.rt = 0;
    this.lastCap = -1;
  }

  private get finishRt() {
    const m = this.marks.find((m) => m.type === 'finish');
    return m ? m.rt : null;
  }

  capture(dtReal: number) {
    this.rt += dtReal;
    const f = this.finishRt;
    if (f !== null && this.rt > f + 7) return;
    if (this.rt - this.lastCap < 1 / 61) return;
    this.lastCap = this.rt;
    this.frames.push(this.snap());
    if (this.frames.length > MAX_FRAMES) this.frames.shift();
  }

  logParticle(e: SpawnEvent) {
    if (!this.rp) this.pev.push({ ...e, rt: this.rt });
  }

  logSfx(name: Sfx, arg: number | string) {
    if (!this.rp) this.sev.push({ rt: this.rt, name, arg });
  }

  mark(type: Mark['type'], v: number | string) {
    this.marks.push({ rt: this.rt, type, v });
  }

  snap(): Frame {
    const g = this.g;
    const L = g.level;
    const haz: number[] = [];
    for (const f of L.fires) haz.push(f.alive ? 1 : 0, f.deadT);
    for (const y of L.yokai) haz.push(y.cx, y.cy, y.alive ? 1 : 0, y.deadT, y.look, y.flinch);
    for (const b of L.brambles) haz.push(b.alive ? 1 : 0, b.deadT);
    for (const l of L.lanterns) haz.push(l.lit ? 1 : 0, l.litT);
    return {
      rt: this.rt,
      t: g.t,
      ts: g.timeScale,
      slow: g.slow,
      camCX: g.camCX,
      camCY: g.camCY,
      zoom: g.zoom,
      pose: g.pose(),
      ink: g.ink,
      state: g.state,
      dieT: g.dieT,
      invuln: g.invuln,
      toriiPaint: g.toriiPaint,
      introT: g.introT,
      painting: g.painting,
      paintLen: g.painting?.length ?? 0,
      strokes: g.strokes,
      haz: Float32Array.from(haz),
      brush: g.brushLevel,
      time: g.stats.time,
    };
  }

  apply(f: Frame) {
    const g = this.g;
    g.t = f.t;
    g.timeScale = f.ts;
    g.slow = f.slow;
    g.camCX = f.camCX;
    g.camCY = f.camCY;
    g.zoom = f.zoom;
    g.poseOverride = f.pose;
    g.px = f.pose.x;
    g.py = f.pose.y;
    g.ink = f.ink;
    g.state = f.state;
    g.dieT = f.dieT;
    g.invuln = f.invuln;
    g.toriiPaint = f.toriiPaint;
    g.introT = f.introT;
    g.painting = f.painting ? f.painting.slice(0, f.paintLen) : null;
    g.strokes = f.strokes;
    for (const s of g.strokes) s.age = f.t - s.bornT;
    g.stats.time = f.time;
    const L = g.level;
    let i = 0;
    for (const x of L.fires) {
      x.alive = f.haz[i++] > 0;
      x.deadT = f.haz[i++];
    }
    for (const y of L.yokai) {
      y.cx = f.haz[i++];
      y.cy = f.haz[i++];
      y.alive = f.haz[i++] > 0;
      y.deadT = f.haz[i++];
      y.look = f.haz[i++];
      y.flinch = f.haz[i++];
    }
    for (const b of L.brambles) {
      b.alive = f.haz[i++] > 0;
      b.deadT = f.haz[i++];
    }
    for (const l of L.lanterns) {
      l.lit = f.haz[i++] > 0;
      l.litT = f.haz[i++];
    }
  }

  private frameAt(rt: number): number {
    let lo = 0;
    let hi = this.frames.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (this.frames[m].rt <= rt) lo = m;
      else hi = m;
    }
    return lo;
  }

  /** Re-create the particles that would be alive at `rt`. */
  particlesAt(rt: number): Particles {
    const p = new Particles();
    let last = rt - 2;
    for (const e of this.pev) {
      if (e.rt < rt - 2) continue;
      if (e.rt > rt) break;
      p.update(e.rt - last);
      last = e.rt;
      p.spawn(e.kind, e.x, e.y, e.vx, e.vy, e.life, e.size, e.color);
    }
    p.update(rt - last);
    return p;
  }

  /** Paint sessions scored by length plus what they achieved. */
  private sessions(): { a: number; b: number; score: number }[] {
    const out: { a: number; b: number; score: number }[] = [];
    let open: number | null = null;
    for (const m of this.marks) {
      if (m.type === 'paintStart') open = m.rt;
      else if (m.type === 'paintEnd' && open !== null) {
        const a = open;
        const len = Number(m.v);
        const effects = this.marks.filter((e) => e.type === 'effect' && e.rt >= a && e.rt <= m.rt + 1.4);
        const score = len + effects.reduce((acc, e) => acc + Number(e.v) * 160, 0);
        if (len > 40) out.push({ a, b: m.rt, score });
        open = null;
      }
    }
    return out;
  }

  /** Pick the moments worth watching: big strokes, effects, and the gate. */
  highlights(maxSessions = 3): [number, number][] {
    if (!this.frames.length) return [];
    const end = this.frames[this.frames.length - 1].rt;
    const top = this.sessions()
      .sort((x, y) => y.score - x.score)
      .slice(0, maxSessions)
      .sort((x, y) => x.a - y.a);
    let wins: [number, number][] = top.map((s) => [Math.max(s.a, s.b - 3) - 0.6, s.b + 1.5]);
    const f = this.finishRt;
    if (f !== null) wins.push([f - 1.4, Math.min(end, f + 5.5)]);
    if (!wins.length) wins.push([Math.max(0, end - 6), end]);
    wins = wins.map(([a, b]) => [Math.max(0, a), Math.min(end, b)] as [number, number]).filter(([a, b]) => b - a > 0.5);
    // merge overlaps
    const merged: [number, number][] = [];
    for (const w of wins) {
      const last = merged[merged.length - 1];
      if (last && w[0] <= last[1] + 0.3) last[1] = Math.max(last[1], w[1]);
      else merged.push([...w]);
    }
    return merged;
  }

  /** The frame to use for the share card: just after the best stroke dries, else the gate. */
  bestMoment(): Frame | null {
    if (!this.frames.length) return null;
    const best = this.sessions().sort((x, y) => y.score - x.score)[0];
    const f = this.finishRt;
    const rt = best ? best.b + 0.6 : f !== null ? f + 1.8 : this.frames[this.frames.length - 1].rt;
    return this.frames[this.frameAt(rt)];
  }

  // ─────────────────────────────────────── playback

  startReplay(segs: [number, number][], done: () => void) {
    const g = this.g;
    this.rp = {
      segs,
      seg: 0,
      clock: 0,
      fi: 0,
      lastRt: segs[0][0],
      pi: 0,
      si: 0,
      saved: this.snap(),
      savedParticles: g.particles,
      done,
    };
    g.hideHUD = true;
    this.enterSegment();
  }

  private enterSegment() {
    const rp = this.rp!;
    const [a] = rp.segs[rp.seg];
    rp.clock = 0;
    rp.lastRt = a;
    rp.fi = this.frameAt(a);
    this.g.particles = this.particlesAt(a);
    rp.pi = this.pev.findIndex((e) => e.rt > a);
    if (rp.pi < 0) rp.pi = this.pev.length;
    rp.si = this.sev.findIndex((e) => e.rt > a);
    if (rp.si < 0) rp.si = this.sev.length;
    this.apply(this.frames[rp.fi]);
    this.g.character.reset();
  }

  stepReplay(dtReal: number) {
    const rp = this.rp;
    if (!rp) return;
    const g = this.g;
    rp.clock += dtReal;
    const [a, b] = rp.segs[rp.seg];
    const now = Math.min(b, a + rp.clock);
    while (rp.fi + 1 < this.frames.length && this.frames[rp.fi + 1].rt <= now) rp.fi++;
    const f = this.frames[rp.fi];
    this.apply(f);
    while (rp.pi < this.pev.length && this.pev[rp.pi].rt <= now) {
      const e = this.pev[rp.pi++];
      g.particles.spawn(e.kind, e.x, e.y, e.vx, e.vy, e.life, e.size, e.color);
    }
    while (rp.si < this.sev.length && this.sev[rp.si].rt <= now) {
      const e = this.sev[rp.si++];
      g.audio.fx(e.name, e.arg);
    }
    g.audio.brush(f.brush);
    const dt = (now - rp.lastRt) * f.ts;
    rp.lastRt = now;
    g.particles.update(dt);
    g.character.update(f.pose, dt);
    g.weather.update(dtReal, g.camCX, g.camCY, VIEW_H * (g.W / g.H));
    g.audio.tick(f.slow);
    if (a + rp.clock >= b) {
      rp.seg++;
      if (rp.seg >= rp.segs.length) this.stopReplay();
      else this.enterSegment();
    }
  }

  stopReplay() {
    const rp = this.rp;
    if (!rp) return;
    this.rp = null;
    const g = this.g;
    this.apply(rp.saved);
    g.poseOverride = null;
    g.particles = rp.savedParticles;
    g.hideHUD = false;
    g.audio.brush(0);
    rp.done();
  }

  /** Fades between cuts, plus a small seal so clips carry the name. */
  drawOverlay(ctx: CanvasRenderingContext2D) {
    const rp = this.rp;
    if (!rp) return;
    const g = this.g;
    const [a, b] = rp.segs[rp.seg];
    const len = b - a;
    const fade = Math.min(1, rp.clock / FADE, (len - rp.clock) / FADE);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (fade < 1) {
      ctx.fillStyle = rgba(PAPER, 1 - Math.max(0, fade));
      ctx.fillRect(0, 0, g.W, g.H);
    }
    drawSeal(ctx, g.W, g.H, g.H / VIEW_H, `${g.info.name}  ·  ${g.charId === 'ren' ? 'Ren' : 'Kohaku'}`);
  }

  /** Render the highlight reel in real time and capture it as a video. */
  async recordClip(): Promise<{ blob: Blob; ext: string } | null> {
    const segs = this.highlights();
    if (!segs.length || typeof MediaRecorder === 'undefined' || !this.g.canvas.captureStream) return null;
    const g = this.g;
    const stream = g.canvas.captureStream(60);
    const at = g.audio.streamDest?.stream.getAudioTracks()[0];
    if (at) stream.addTrack(at);
    const types = [
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4;codecs=avc1,opus',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    const mimeType = types.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
    const mr = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 12_000_000 } : undefined);
    const chunks: Blob[] = [];
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const stopped = new Promise<void>((res) => (mr.onstop = () => res()));
    mr.start(250);
    await new Promise<void>((res) => this.startReplay(segs, res));
    await new Promise((r) => setTimeout(r, 120));
    mr.stop();
    await stopped;
    stream.getVideoTracks().forEach((t) => t.stop());
    const type = mr.mimeType || mimeType || 'video/webm';
    return { blob: new Blob(chunks, { type }), ext: type.includes('mp4') ? 'mp4' : 'webm' };
  }
}

export function drawSeal(ctx: CanvasRenderingContext2D, W: number, H: number, hs: number, caption: string) {
  const s = 46 * hs;
  const x = W - s - 26 * hs;
  const y = H - s - 24 * hs;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.04);
  ctx.fillStyle = INKS.shu.color;
  ctx.globalAlpha = 0.92;
  ctx.beginPath();
  ctx.roundRect(0, 0, s, s, 5 * hs);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = PAPER;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${30 * hs}px ${FONT_BRUSH}`;
  ctx.fillText('墨', s / 2, s / 2 + 1);
  ctx.restore();
  ctx.fillStyle = rgba(INK, 0.75);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${15 * hs}px ${FONT_SERIF}`;
  ctx.fillText('I N K R U N N E R', x - 12 * hs, y + s * 0.34);
  ctx.font = `italic ${13 * hs}px ${FONT_SERIF}`;
  ctx.fillStyle = rgba(INK, 0.6);
  ctx.fillText(caption, x - 12 * hs, y + s * 0.74);
}
