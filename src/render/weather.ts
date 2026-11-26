import { INK, VIEW_H } from '../config';
import type { ThemeId } from '../level';
import { SNOW } from './backdrop';
import { rgba } from './brush';
import { mulberry32 } from '../rng';

interface Mote {
  x: number;
  y: number;
  z: number; // depth: parallax + size
  ph: number;
}

/** Screen-space weather: falling snow, drifting ink leaves, sea spray. */
export class Weather {
  private motes: Mote[] = [];
  private lastCamX: number | null = null;

  /** The camera jumped by dx without really moving (Raijin's arena wrap): keep the particles where they are on screen. */
  shift(dx: number) {
    if (this.lastCamX !== null) this.lastCamX += dx;
  }
  private lastCamY = 0;

  constructor(private theme: ThemeId) {
    const n = theme === 'snow' ? 170 : theme === 'spring' ? 22 : 0;
    for (let i = 0; i < n; i++) {
      this.motes.push({ x: Math.random() * 2400, y: Math.random() * VIEW_H, z: 0.3 + Math.random() * 0.9, ph: Math.random() * 6.28 });
    }
  }

  update(dt: number, camX: number, camY: number, viewW: number) {
    if (this.lastCamX === null) this.lastCamX = camX;
    const dx = camX - this.lastCamX;
    const dy = camY - this.lastCamY;
    this.lastCamX = camX;
    this.lastCamY = camY;
    const snow = this.theme === 'snow';
    for (const m of this.motes) {
      m.ph += dt * (snow ? 1.5 : 2.2);
      m.x -= dx * m.z;
      m.y -= dy * m.z;
      m.y += dt * (snow ? 34 + 40 * m.z : 22 + 18 * m.z);
      m.x += dt * (Math.sin(m.ph) * (snow ? 14 : 40) - (snow ? 10 : 30));
      if (m.y > VIEW_H + 10) {
        m.y -= VIEW_H + 20;
        m.x = Math.random() * viewW;
      }
      if (m.y < -10) m.y += VIEW_H + 20;
      if (m.x < -20) m.x += viewW + 40;
      if (m.x > viewW + 20) m.x -= viewW + 40;
    }
  }

  draw(ctx: CanvasRenderingContext2D, hs: number) {
    if (!this.motes.length) return;
    ctx.save();
    ctx.setTransform(hs, 0, 0, hs, 0, 0);
    if (this.theme === 'snow') {
      for (const m of this.motes) {
        const r = 1 + m.z * 2.4;
        ctx.fillStyle = rgba(INK, 0.18);
        ctx.beginPath();
        ctx.arc(m.x + 0.6, m.y + 0.8, r + 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = SNOW;
        ctx.beginPath();
        ctx.arc(m.x, m.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = INK;
      for (const m of this.motes) {
        ctx.save();
        ctx.translate(m.x, m.y);
        ctx.rotate(m.ph);
        ctx.scale(1, 0.35 + 0.65 * Math.abs(Math.sin(m.ph * 1.7)));
        ctx.globalAlpha = 0.18 + m.z * 0.22;
        ctx.beginPath();
        ctx.ellipse(0, 0, 3 + m.z * 3, 1.6 + m.z * 1.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();
  }
}

// ─────────────────────────────────────────────────────────────── rain (docs/summer-design.md 2.4)

/** Where the camera is, in the terms the rain layers need. `camX/camY` are the view's top-left in world units. */
export interface RainView {
  camX: number;
  camY: number;
  /** world → canvas pixel scale */
  S: number;
  W: number;
  H: number;
  /** canvas pixels per view unit (H / VIEW_H) */
  hs: number;
  /** real seconds (keeps moving in replays) */
  t: number;
}

interface Ripple {
  x: number;
  y: number;
  age: number;
  life: number;
  r: number;
  color: string;
}

/** A surface rain can land on: world points along the top of ground (color '') or a vermilion stroke. */
export interface RippleSurface {
  pts: { x: number; y: number }[];
  color: string;
}

// the storm palette, multiplied over the paper: sage-teal sky down to slate-blue ground (Alto's rain, in ink wash)
const STORM_TOP = '#55a397';
const STORM_MID = '#86c0b6';
const STORM_LOW = '#5482a8';
const STREAK_ANGLE = 0.2; // radians from vertical; streaks fall down and to the left
export const MAX_RIPPLES = 40;
const EDGE_RAMP = 260; // world units over which the storm wash fades in at a zone edge
const GROUND_RIPPLE = 'rgba(28,44,46,0.9)';

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return { c, g: c.getContext('2d')! };
}

function inSpans(spans: readonly [number, number][], x: number) {
  for (const [a, b] of spans) if (x >= a && x <= b) return true;
  return false;
}

/** A tall, seamlessly repeating tile of slanted streaks, in canvas pixels. */
function streakTile(w: number, h: number, n: number, seed: number, hs: number, len: [number, number], width: [number, number], alpha: [number, number]) {
  const s = makeCanvas(w, h);
  const r = mulberry32(seed);
  const dx = Math.sin(STREAK_ANGLE);
  const dy = Math.cos(STREAK_ANGLE);
  s.g.lineCap = 'round';
  const lerp = (p: [number, number]) => p[0] + r() * (p[1] - p[0]);
  for (let i = 0; i < n; i++) {
    const x = r() * w;
    const y = r() * h;
    const l = lerp(len) * hs;
    const pale = r() < 0.32;
    const a = lerp(alpha);
    s.g.strokeStyle = pale ? rgba('#f2faf6', a * 1.1) : rgba('#1d2e2d', a);
    s.g.lineWidth = lerp(width) * hs;
    // wrapped copies so the tile repeats without seams
    for (const ox of [-w, 0, w]) {
      for (const oy of [-h, 0, h]) {
        s.g.beginPath();
        s.g.moveTo(x + ox, y + oy);
        s.g.lineTo(x + ox - dx * l, y + oy + dy * l);
        s.g.stroke();
      }
    }
  }
  return s.c;
}

/**
 * Everything rain paints around the strokes: the storm wash that shifts the whole palette, ink clouds, two
 * parallax layers of slanted streaks (pre-rendered tiles, one pattern fill each), ripples on ground and on
 * vermilion (at most 40), a pale wet line along the terrain tops, lantern light smeared into puddles, and drops
 * on the 朱 ink stone. No canvas filters and nothing per pixel: tiles are baked once per screen size.
 */
export class RainLook {
  ripples: Ripple[] = [];
  private bakedFor = -1;
  private tint!: HTMLCanvasElement; // vertical storm gradient, opaque
  private edge!: HTMLCanvasElement; // the same with a 0 → 1 alpha ramp, left to right
  private clouds!: HTMLCanvasElement; // a band of ink cloud along the top
  private near!: CanvasPattern;
  private far!: CanvasPattern;
  private nearW = 1;
  private farW = 1;
  private lastT = -1;
  private spawnAcc = 0;

  private bake(ctx: CanvasRenderingContext2D, hs: number) {
    if (Math.abs(this.bakedFor - hs) < 1e-3) return;
    this.bakedFor = hs;
    const t = makeCanvas(8, 256);
    const grad = t.g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, STORM_TOP);
    grad.addColorStop(0.45, STORM_MID);
    grad.addColorStop(1, STORM_LOW);
    t.g.fillStyle = grad;
    t.g.fillRect(0, 0, 8, 256);
    this.tint = t.c;
    const e = makeCanvas(64, 256);
    e.g.drawImage(t.c, 0, 0, 64, 256);
    e.g.globalCompositeOperation = 'destination-in';
    const ramp = e.g.createLinearGradient(0, 0, 64, 0);
    ramp.addColorStop(0, 'rgba(0,0,0,0)');
    ramp.addColorStop(1, 'rgba(0,0,0,1)');
    e.g.fillStyle = ramp;
    e.g.fillRect(0, 0, 64, 256);
    this.edge = e.c;

    // ink clouds: soft overlapping blots in a strip that wraps, heavier near the top
    const cw = 1024;
    const ch = 200;
    const cl = makeCanvas(cw, ch);
    const r = mulberry32(907);
    for (let i = 0; i < 46; i++) {
      const x = r() * cw;
      const y = 10 + Math.pow(r(), 1.6) * 120;
      const rad = 40 + r() * 110;
      const a = 0.16 + r() * 0.12;
      for (const dx of [-cw, 0, cw]) {
        const gr = cl.g.createRadialGradient(x + dx, y, 4, x + dx, y, rad * 1.8);
        gr.addColorStop(0, rgba('#2c3d3b', a));
        gr.addColorStop(1, rgba('#2c3d3b', 0));
        cl.g.fillStyle = gr;
        cl.g.beginPath();
        cl.g.ellipse(x + dx, y, rad * 1.8, rad * 0.55, 0, 0, Math.PI * 2);
        cl.g.fill();
      }
    }
    this.clouds = cl.c;

    const H = Math.ceil(VIEW_H * hs);
    const nearTile = streakTile(Math.round(300 * hs), Math.round(H * 0.75), 26, 31, hs, [60, 150], [1.1, 2.1], [0.16, 0.34]);
    const farTile = streakTile(Math.round(200 * hs), Math.round(H * 0.5), 34, 37, hs, [30, 80], [0.6, 1.1], [0.12, 0.26]);
    this.nearW = nearTile.width;
    this.farW = farTile.width;
    this.near = ctx.createPattern(nearTile, 'repeat')!;
    this.far = ctx.createPattern(farTile, 'repeat')!;
  }

  /** Rain spans in world x: the zones clipped to [x0, x1], or all of it when there are no zones. */
  static spans(zones: readonly [number, number][], x0: number, x1: number): [number, number][] {
    if (!zones.length) return [[x0, x1]];
    const out: [number, number][] = [];
    for (const [a, b] of zones) if (b > x0 && a < x1) out.push([Math.max(a, x0), Math.min(b, x1)]);
    return out;
  }

  /**
   * Behind the strokes (call right after the terrain, with the world transform set; it is left set): the storm
   * wash multiplied over paper, backdrop and terrain, ink clouds, the wet line, puddle smears and ripples.
   * `strength` 0..1 fades the whole look (the proof page's toggle; 1 in play).
   */
  drawBack(
    ctx: CanvasRenderingContext2D,
    v: RainView,
    zones: readonly [number, number][],
    density: number,
    strength: number,
    surfaces: RippleSurface[],
    lanterns: readonly { x: number; y: number; lit: boolean }[],
  ) {
    if (strength <= 0.001) {
      this.lastT = v.t;
      return;
    }
    this.bake(ctx, v.hs);
    const vx0 = v.camX;
    const vx1 = v.camX + v.W / v.S;
    const sx = (wx: number) => (wx - v.camX) * v.S;
    const k = strength * Math.min(1, 0.6 + 0.3 * density);

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = k;
    if (!zones.length) ctx.drawImage(this.tint, 0, 0, v.W, v.H);
    const ramp = EDGE_RAMP * v.S;
    for (const [z0, z1] of zones) {
      if (z1 + EDGE_RAMP < vx0 || z0 - EDGE_RAMP > vx1) continue;
      const a = sx(z0);
      const b = sx(z1);
      if (a > 0 && a - ramp < v.W) ctx.drawImage(this.edge, a - ramp, 0, ramp, v.H);
      const l = Math.max(0, a);
      const r = Math.min(v.W, b);
      if (r > l) ctx.drawImage(this.tint, l, 0, r - l, v.H);
      if (b < v.W && b + ramp > 0) {
        ctx.save();
        ctx.translate(b + ramp, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(this.edge, 0, 0, ramp, v.H);
        ctx.restore();
      }
    }
    // ink clouds roll along the top, slower than the ground
    const cw = 1024 * v.hs;
    const chh = 200 * v.hs;
    const off = -((((v.camX * v.S * 0.12 + v.t * 6 * v.hs) % cw) + cw) % cw);
    const cloudBand = (l: number, r: number, a: number) => {
      if (r <= Math.max(0, l) || l >= v.W || a <= 0) return;
      ctx.save();
      ctx.beginPath();
      ctx.rect(l, 0, r - l, chh);
      ctx.clip();
      ctx.globalAlpha = k * a;
      for (let x = off; x < v.W; x += cw) if (x + cw > l && x < r) ctx.drawImage(this.clouds, x, 0, cw, chh);
      ctx.restore();
    };
    if (!zones.length) cloudBand(0, v.W, 1);
    for (const [z0, z1] of zones) {
      if (z1 + EDGE_RAMP < vx0 || z0 - EDGE_RAMP > vx1) continue;
      // the cloud band fades in over the same ramp as the wash, in thin slices (steps too small to see)
      const n = 18;
      const step = ramp / n;
      for (let i = 0; i < n; i++) {
        const a = ((i + 0.5) / n) ** 1.5;
        cloudBand(sx(z0) - ramp + i * step, sx(z0) - ramp + (i + 1) * step, a);
        cloudBand(sx(z1) + ramp - (i + 1) * step, sx(z1) + ramp - i * step, a);
      }
      cloudBand(sx(z0), sx(z1), 1);
    }
    ctx.restore();

    const spans = RainLook.spans(zones, vx0 - 40, vx1 + 40);
    const dt = this.lastT < 0 ? 0 : Math.min(0.1, Math.max(0, v.t - this.lastT));
    this.lastT = v.t;
    if (!spans.length) {
      this.ripples.length = 0;
      return;
    }
    ctx.save();
    ctx.globalAlpha = strength;
    // the wet line: a pale sheen just under each ground top
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(236,246,242,0.6)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    for (const s of surfaces) {
      if (s.color) continue;
      let pen = false;
      for (const p of s.pts) {
        if (p.x < vx0 - 40 || p.x > vx1 + 40 || !inSpans(spans, p.x)) {
          pen = false;
          continue;
        }
        if (pen) ctx.lineTo(p.x, p.y + 3.5);
        else ctx.moveTo(p.x, p.y + 3.5);
        pen = true;
      }
    }
    ctx.stroke();
    // lantern light smeared into puddles
    for (const l of lanterns) {
      if (l.x < vx0 - 40 || l.x > vx1 + 40 || !inSpans(spans, l.x)) continue;
      const a = l.lit ? 0.5 : 0.2;
      const g = ctx.createLinearGradient(0, l.y + 2, 0, l.y + 80);
      g.addColorStop(0, `rgba(255,190,90,${a})`);
      g.addColorStop(1, 'rgba(255,190,90,0)');
      ctx.fillStyle = g;
      const wob = Math.sin(v.t * 3 + l.x) * 1.5;
      ctx.fillRect(l.x - 8 + wob, l.y + 2, 16, 60);
      ctx.fillRect(l.x - 2 - wob, l.y + 2, 4, 80);
    }
    // ripples, simulated here in real time so they also move in replays
    this.stepRipples(dt, spans, surfaces, density, vx0, vx1);
    ctx.lineWidth = 1.5;
    for (const rp of this.ripples) {
      const u = rp.age / rp.life;
      ctx.globalAlpha = strength * (1 - u) * 0.8;
      ctx.strokeStyle = rp.color;
      ctx.beginPath();
      ctx.ellipse(rp.x, rp.y, 2 + rp.r * u, 0.8 + rp.r * u * 0.3, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** A ripple (also used when a washed stroke lets go of its pigment). The oldest makes way past the cap. */
  addRipple(x: number, y: number, color = GROUND_RIPPLE, r = 14) {
    if (this.ripples.length >= MAX_RIPPLES) this.ripples.shift();
    this.ripples.push({ x, y, age: 0, life: 0.5 + Math.random() * 0.35, r: r * (0.7 + Math.random() * 0.6), color });
  }

  private stepRipples(dt: number, spans: [number, number][], surfaces: RippleSurface[], density: number, vx0: number, vx1: number) {
    for (const rp of this.ripples) rp.age += dt;
    this.ripples = this.ripples.filter((rp) => rp.age < rp.life);
    if (!surfaces.length) return;
    const width = spans.reduce((a, [x0, x1]) => a + (x1 - x0), 0);
    this.spawnAcc = Math.min(4, this.spawnAcc + dt * width * 0.03 * density);
    let tries = 0;
    while (this.spawnAcc >= 1 && tries++ < 16) {
      const s = surfaces[Math.floor(Math.random() * surfaces.length)];
      const p = s.pts[Math.floor(Math.random() * s.pts.length)];
      if (!p || p.x < vx0 || p.x > vx1 || !inSpans(spans, p.x)) continue;
      this.spawnAcc -= 1;
      this.addRipple(p.x + (Math.random() - 0.5) * 16, p.y + 1, s.color || GROUND_RIPPLE, s.color ? 9 : 15);
    }
  }

  /** In front of the world: two layers of slanted streaks; each zone's edge is a curtain leaning with the rain. */
  drawFront(ctx: CanvasRenderingContext2D, v: RainView, zones: readonly [number, number][], density: number, strength: number) {
    if (strength <= 0.001 || density <= 0) return;
    this.bake(ctx, v.hs);
    const vx0 = v.camX;
    const vx1 = v.camX + v.W / v.S;
    const spans = RainLook.spans(zones, vx0 - 300, vx1 + 300);
    if (!spans.length) return;
    const tan = Math.tan(STREAK_ANGLE);
    const slant = tan * v.H;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.beginPath();
    for (const [a, b] of spans) {
      const l = (a - v.camX) * v.S;
      const r = (b - v.camX) * v.S;
      ctx.moveTo(l + slant * 0.5, 0);
      ctx.lineTo(r + slant * 0.5, 0);
      ctx.lineTo(r - slant * 0.5, v.H);
      ctx.lineTo(l - slant * 0.5, v.H);
      ctx.closePath();
    }
    ctx.clip();
    const d = Math.min(1.6, density);
    const layer = (pat: CanvasPattern, w: number, speed: number, par: number, alpha: number) => {
      const fall = v.t * speed * v.hs;
      const ox = -(v.camX * v.S * par) - fall * tan;
      const oy = fall - v.camY * v.S * par * 0.3;
      pat.setTransform(new DOMMatrix([1, 0, 0, 1, ((ox % w) + w) % w, oy]));
      ctx.globalAlpha = Math.min(1, alpha * strength);
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, v.W, v.H);
    };
    layer(this.far, this.farW, 1100, 0.55, 0.75 * d);
    layer(this.near, this.nearW, 1700, 1, 0.85 * d);
    ctx.restore();
  }

  /** Drops running down an ink stone (canvas pixels): while the traveler is in rain, on the 朱 stone. */
  drawStoneDrops(ctx: CanvasRenderingContext2D, s: { x: number; y: number; r: number }, t: number, hs: number) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (let i = 0; i < 3; i++) {
      const u = (t / 1.3 + i * 0.37) % 1;
      const x = s.x + (i - 1) * s.r * 0.42 + Math.sin(i * 2.3) * s.r * 0.1;
      const y = s.y - s.r * 0.75 + u * s.r * 1.6;
      ctx.globalAlpha = 0.9 * Math.sin(u * Math.PI);
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1.2 * hs;
      ctx.beginPath();
      ctx.moveTo(x, y - 10 * hs * u);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillStyle = 'rgba(240,250,255,0.95)';
      ctx.beginPath();
      ctx.ellipse(x, y, 2.6 * hs, 3.4 * hs, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(23,22,27,0.35)';
      ctx.beginPath();
      ctx.ellipse(x + 0.6 * hs, y + 1.3 * hs, 1.1 * hs, 1.3 * hs, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
