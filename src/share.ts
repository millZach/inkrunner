import { FONT_BRUSH, FONT_SERIF, INK, INKS, PAPER, VIEW_H } from './config';
import { CHAR_NAMES, GRADE_NAMES, type FinishStats, type Game } from './game';
import { rgba } from './render/brush';
import { drawTorii, lanternGlow } from './render/decor';
import { drawBramble, drawFire, drawYokai } from './render/hazards';
import { makeVignette } from './render/paper';
import { drawTerrain } from './render/terrain';
import { IS_NATIVE } from './platform';

const CARD_W = 1600;
const CARD_H = 900;

function hanko(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, top: string, bottom?: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.05);
  ctx.fillStyle = INKS.shu.color;
  ctx.globalAlpha = 0.93;
  ctx.beginPath();
  ctx.roundRect(0, 0, s, s, s * 0.1);
  ctx.fill();
  // worn stamp edges
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 40; i++) {
    ctx.globalAlpha = 0.3 + Math.random() * 0.5;
    ctx.beginPath();
    const side = Math.floor(Math.random() * 4);
    const u = Math.random() * s;
    const px = side === 0 ? u : side === 1 ? s : side === 2 ? u : 0;
    const py = side === 0 ? 0 : side === 1 ? u : side === 2 ? s : u;
    ctx.arc(px, py, Math.random() * s * 0.03, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = PAPER;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (bottom) {
    ctx.font = `${s * 0.5}px ${FONT_BRUSH}`;
    ctx.fillText(top, s / 2, s * 0.33);
    ctx.font = `${s * 0.3}px ${FONT_BRUSH}`;
    ctx.fillText(bottom, s / 2, s * 0.76);
  } else {
    ctx.font = `${s * 0.72}px ${FONT_BRUSH}`;
    ctx.fillText(top, s / 2, s / 2 + s * 0.02);
  }
  ctx.restore();
}

/** A 16:9 share card built from the best moment of the run. */
export async function renderCard(g: Game, stats: FinishStats): Promise<Blob | null> {
  const frame = g.recorder.bestMoment();
  const c = document.createElement('canvas');
  c.width = CARD_W;
  c.height = CARD_H;
  const ctx = c.getContext('2d')!;

  // borrow the game renderer for one frame
  const saved = {
    canvas: g.canvas,
    ctx: g.ctx,
    W: g.W,
    H: g.H,
    scale: g.scale,
    vignette: g.vignette,
    grainPattern: g.grainPattern,
    particles: g.particles,
    live: g.recorder.snap(),
  };
  try {
    g.canvas = c;
    g.ctx = ctx;
    g.W = CARD_W;
    g.H = CARD_H;
    g.scale = CARD_H / VIEW_H;
    g.vignette = makeVignette(CARD_W, CARD_H);
    g.grainPattern = ctx.createPattern(g.grain, 'repeat');
    g.hideHUD = true;
    if (frame) {
      g.recorder.apply(frame);
      g.particles = g.recorder.particlesAt(frame.rt);
      if (frame.zoom < 0.98) g.zoom = 1;
    }
    for (let i = 0; i < 8; i++) g.character.update(g.pose(), 1 / 60);
    g.render();
  } finally {
    g.canvas = saved.canvas;
    g.ctx = saved.ctx;
    g.W = saved.W;
    g.H = saved.H;
    g.scale = saved.scale;
    g.vignette = saved.vignette;
    g.grainPattern = saved.grainPattern;
    g.recorder.apply(saved.live);
    g.particles = saved.particles;
    g.poseOverride = null;
    g.hideHUD = false;
  }

  // frame + title band
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const band = ctx.createLinearGradient(0, CARD_H * 0.62, 0, CARD_H);
  band.addColorStop(0, rgba(PAPER, 0));
  band.addColorStop(0.55, rgba(PAPER, 0.88));
  band.addColorStop(1, rgba(PAPER, 0.96));
  ctx.fillStyle = band;
  ctx.fillRect(0, CARD_H * 0.62, CARD_W, CARD_H * 0.38);
  ctx.strokeStyle = rgba(INK, 0.6);
  ctx.lineWidth = 3;
  ctx.strokeRect(22, 22, CARD_W - 44, CARD_H - 44);
  ctx.lineWidth = 1;
  ctx.strokeRect(32, 32, CARD_W - 64, CARD_H - 64);

  ctx.fillStyle = INK;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.font = `120px ${FONT_BRUSH}`;
  ctx.fillText('墨', 70, CARD_H - 70);
  ctx.font = `600 34px ${FONT_SERIF}`;
  ctx.fillText('I N K R U N N E R', 210, CARD_H - 128);
  ctx.font = `italic 26px ${FONT_SERIF}`;
  ctx.fillStyle = rgba(INK, 0.75);
  ctx.fillText(`${g.info.name}  ·  ${CHAR_NAMES[g.charId]}  ·  ${stats.time.toFixed(1)}s  ·  ${stats.strokes} stroke${stats.strokes === 1 ? '' : 's'}`, 212, CARD_H - 84);
  ctx.font = `20px ${FONT_SERIF}`;
  ctx.fillStyle = rgba(INK, 0.55);
  ctx.fillText('The world is ink. Your brush is the only color.', 212, CARD_H - 52);

  hanko(ctx, CARD_W - 230, CARD_H - 250, 150, stats.grade);
  ctx.textAlign = 'center';
  ctx.font = `italic 22px ${FONT_SERIF}`;
  ctx.fillStyle = rgba(INK, 0.7);
  ctx.fillText(`${GRADE_NAMES[stats.grade]} rank`, CARD_W - 155, CARD_H - 70);
  ctx.font = `16px ${FONT_SERIF}`;
  ctx.fillStyle = rgba(INK, 0.5);
  ctx.fillText(IS_NATIVE ? 'INKRUNNER 墨' : location.host, CARD_W - 155, CARD_H - 46);

  return new Promise((res) => c.toBlob(res, 'image/png'));
}

/** The whole scroll as one long handscroll image. */
export function exportScroll(g: Game, stats: FinishStats): Promise<Blob | null> {
  const s = 0.42;
  const L = g.level;
  const y0 = -140;
  const y1 = 800;
  const mx = 70;
  const my = 70;
  const c = document.createElement('canvas');
  c.width = Math.round(L.length * s + mx * 2);
  c.height = Math.round((y1 - y0) * s + my * 2 + 50);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, c.width, c.height);

  ctx.save();
  ctx.beginPath();
  ctx.rect(mx, my, L.length * s, (y1 - y0) * s);
  ctx.clip();
  ctx.setTransform(s, 0, 0, s, mx, my - y0 * s);
  g.backdrop.drawStretched(ctx, L.torii.x - 520);
  drawTerrain(ctx, L, 0, L.length);
  for (const l of L.lanterns) lanternGlow(ctx, l, 0);
  drawTorii(ctx, L.torii.x, L.torii.y, g.toriiPaint);
  for (const b of L.brambles) drawBramble(ctx, b, 0);
  for (const f of L.fires) drawFire(ctx, f, 1);
  for (const y of L.yokai) drawYokai(ctx, y, 0);
  for (const st of g.strokes) st.draw(ctx, 0.6);
  g.character.draw(ctx, { ...g.pose(), state: 'idle', aim: null });
  ctx.restore();

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  const pat = ctx.createPattern(g.grain, 'repeat');
  if (pat) {
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, c.width, c.height);
  }
  ctx.globalCompositeOperation = 'source-over';

  ctx.strokeStyle = rgba(INK, 0.55);
  ctx.lineWidth = 2;
  ctx.strokeRect(mx - 10, my - 10, L.length * s + 20, (y1 - y0) * s + 20);
  ctx.lineWidth = 0.8;
  ctx.strokeRect(mx - 18, my - 18, L.length * s + 36, (y1 - y0) * s + 36);

  ctx.fillStyle = rgba(INK, 0.8);
  ctx.font = `italic 22px ${FONT_SERIF}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(
    `INKRUNNER  ·  ${g.info.name}  ·  ${CHAR_NAMES[g.charId]}  ·  ${stats.time.toFixed(1)}s  ·  ${stats.strokes} stroke${stats.strokes === 1 ? '' : 's'}  ·  ${GRADE_NAMES[stats.grade]} rank`,
    mx,
    c.height - 30,
  );
  hanko(ctx, c.width - mx - 64, c.height - 74, 58, '墨', stats.grade);
  return new Promise((res) => c.toBlob(res, 'image/png'));
}
