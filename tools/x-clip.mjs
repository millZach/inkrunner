// Cuts a clip for posting (X and friends) from a checkpoint's journey footage. Captions and the end card are painted in-page
// with the game's own fonts and watercolor, captions sized to read on a phone in the feed. Two cuts:
//   summer: ~1 min walking the campaign (the First Scroll's three inks, the map, each Summer scroll's door trick, Raijin, the moon)
//   raijin: ~20 s of the Raijin fight in five shots, opening on the big ring catching his lightning
//   CUT=raijin tools/browser-slot.sh node tools/x-clip.mjs     (paints captions and the end card, then cuts; CUT defaults to summer)
//   CUT=raijin node tools/x-clip.mjs edit                      (re-cuts with the paintings already made)
// SRC = the journey video, OUT = the clip, URL = a Vite dev server of the SAME commit as the footage (painting needs /src),
// LINK = the address on the end card (LINK= for none). Shot times are seconds into SRC; caption from/to are seconds into the shot.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const CUT = process.env.CUT ?? 'summer';
const SRC = process.env.SRC ?? 'shots/checkpoints/1-summer/journey-desktop.mp4';
const DIR = `shots/x-clip/${CUT}`;
const OUT = process.env.OUT ?? `shots/x-clip/inkrunner-${CUT}.mp4`;
const URL = process.env.URL ?? 'http://127.0.0.1:5175/';
const LINK = process.env.LINK ?? 'playinkrunner.vercel.app';
const W = 1920;
const H = 1080;
mkdirSync(DIR, { recursive: true });

// Both cut journey-desktop.mp4 of checkpoint 1 (Ren, 1600x900, 30 fps). XF = the crossfade between shots, CARD = the end
// card's length, FADE = a caption's fade, OPEN = the fade in from black (0 starts on the first frame, for a hook).
const CUTS = {
  // Each shot keeps its setup and its payoff, and runs long enough to read the caption (Zach found 4 s shots too quick).
  summer: {
    XF: 0.5, CARD: 4.0, FADE: 0.4, OPEN: 0.3, sub: 'The Unfinished Scroll  ·  Summer', seal: ['紫', 'murasaki'],
    shots: [
      { a: 38.6, b: 43.4, caps: [{ seal: '朱', ink: 'shu', text: 'Vermilion becomes ground' }] }, // the First Scroll: a bridge over the gap
      { a: 53.6, b: 58.8, caps: [{ seal: '藍', ink: 'ai', text: 'Indigo carries you, and puts out fire' }] }, // ride a current, then quench the flames
      { a: 61.8, b: 65.8, caps: [{ seal: '金', ink: 'kin', text: 'Gold burns away shadow' }] }, // a shadow yokai dispelled
      { a: 94.6, b: 100.6, caps: [{ seal: '夏', text: 'Clear a scroll and the next season opens' }] }, // the map: Spring sealed, the scroll unrolls to Summer
      { a: 101.8, b: 110.2, caps: [{ seal: '紫', ink: 'murasaki', text: 'Summer brings purple: paint two doors, run through', from: 1.4 }] }, // 起 The Welcoming Fire: through the black wall twice
      { a: 178.0, b: 184.6, caps: [{ seal: '紫', ink: 'murasaki', text: 'Fireworks go through doors too' }] }, // the night festival: fireworks sent through a pair at the shadows
      {
        a: 206.0, b: 215.6, // the storm: a vermilion bridge washes out, then a door holds
        caps: [{ seal: '雨', ink: 'ai', text: 'A storm: rain washes vermilion away', to: 4.6 }, { seal: '紫', ink: 'murasaki', text: 'Doors hold in the rain', from: 5.4 }],
      },
      { a: 286.0, b: 292.0, caps: [{ seal: '雷', ink: 'kin', text: 'Catch lightning in one door, send it out the other' }] }, // Summer 4: a bolt through a pair, into a shadow
      { a: 322.4, b: 327.4, caps: [{ seal: '門', text: 'The last scroll: Raijin’s Gate' }] }, // the map unrolls to the gate, then its title page
      { a: 354.2, b: 359.4, caps: [{ seal: '雷', ink: 'kin', text: 'Turn the thunder god’s lightning back on him' }] }, // the big ring returns his bolt
      { a: 377.6, b: 381.2 }, // he breaks, and the moon comes out
      { a: 396.4, b: 400.4 }, // the torii takes its color
    ],
  },
  // Five shots, each long enough to watch the whole catch land, no captions (Zach: the near-hard 2 s cuts were far too fast).
  raijin: {
    XF: 0.3, CARD: 2.8, FADE: 0.2, OPEN: 0, sub: 'Raijin’s Gate', seal: ['雷', 'kin'],
    shots: [
      { a: 354.5, b: 358.2 }, // the big ring drawn, the bolt goes in and comes back at him
      { a: 337.4, b: 341.0 }, // a pair catches a bolt and returns it
      { a: 365.8, b: 368.6 }, // vermilion bridges under him
      { a: 374.0, b: 380.8 }, // in the rain: the last catch, he breaks, the moon comes out
      { a: 397.6, b: 400.0 }, // the torii takes its color
    ],
  },
};
if (!CUTS[CUT]) throw new Error(`CUT must be one of ${Object.keys(CUTS).join(', ')}`);
const { XF, CARD, FADE, OPEN, sub: SUB, seal: [SEAL, SEAL_INK], shots: SHOTS } = CUTS[CUT];
const caps = SHOTS.flatMap((s, i) => (s.caps ?? []).map((c, j) => ({ ...c, file: `${DIR}/cap-${i}-${j}.png` })));

if (process.argv[2] !== 'edit') {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H });
  await page.goto(URL, { waitUntil: 'load' });
  const out = await page.evaluate(
    async ([W, H, LINK, SUB, SEAL, SEAL_INK, caps]) => {
      const { paintWatercolor } = await import('/src/strokes.ts');
      const { makeGrain, makeVignette } = await import('/src/render/paper.ts');
      const { INK, PAPER, INKS, FONT_BRUSH, FONT_SERIF } = await import('/src/config.ts');
      const seals = '墨' + SEAL + caps.map((c) => c.seal).join('');
      await Promise.all([document.fonts.load(`230px ${FONT_BRUSH}`, seals), document.fonts.load(`600 54px ${FONT_SERIF}`, 'INK'), document.fonts.load(`italic 30px ${FONT_SERIF}`, 'The')]);
      const grain = makeGrain();
      const canvas = () => {
        const c = document.createElement('canvas');
        c.width = W;
        c.height = H;
        return [c, c.getContext('2d')];
      };
      const seal = (ctx, x, y, s, ch, color) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(-0.06);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(-s / 2, -s / 2, s, s, s / 10);
        ctx.fill();
        ctx.fillStyle = PAPER;
        ctx.font = `${Math.round(s * 0.62)}px ${FONT_BRUSH}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(ch, 0, s * 0.04);
        ctx.restore();
      };

      // captions: a seal and one line on a paper wash, low in the frame (the ground and the HUD stay clear)
      const capPngs = caps.map((cap) => {
        const [c, ctx] = canvas();
        const S = 78;
        const gap = 24;
        const pad = 40;
        ctx.font = `600 52px ${FONT_SERIF}`;
        const tw = ctx.measureText(cap.text).width;
        const bw = pad * 2 + S + gap + tw;
        const bh = 112;
        const x0 = (W - bw) / 2;
        const cy = Math.round(H * 0.765);
        ctx.save();
        ctx.shadowColor = 'rgba(239, 230, 211, 0.9)';
        ctx.shadowBlur = 26;
        ctx.fillStyle = 'rgba(239, 230, 211, 0.88)';
        ctx.beginPath();
        ctx.roundRect(x0, cy - bh / 2, bw, bh, 20);
        ctx.fill();
        ctx.restore();
        ctx.save();
        ctx.globalCompositeOperation = 'source-atop';
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = ctx.createPattern(grain, 'repeat');
        ctx.fillRect(x0 - 40, cy - bh, bw + 80, bh * 2);
        ctx.restore();
        seal(ctx, x0 + pad + S / 2, cy, S, cap.seal, cap.ink ? INKS[cap.ink].color : INK);
        ctx.fillStyle = INK;
        ctx.font = `600 52px ${FONT_SERIF}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(cap.text, x0 + pad + S + gap, cy + 2);
        return c.toDataURL('image/png').split(',')[1];
      });

      // end card: one swash per ink, Summer's purple last, and the cut's seal
      const [c, ctx] = canvas();
      ctx.fillStyle = PAPER;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = ctx.createPattern(grain, 'repeat');
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
      const k = W / 1600;
      ctx.setTransform(k, 0, 0, k, 0, 0);
      const sw = (x0, y0, x1, y1, w, bow) =>
        Array.from({ length: 61 }, (_, i) => {
          const t = i / 60;
          return { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * bow, w: w * (0.75 + 0.5 * Math.sin(t * Math.PI)) };
        });
      paintWatercolor(ctx, sw(470, 580, 1130, 572, 24, -16), 'shu', 11, true);
      paintWatercolor(ctx, sw(545, 618, 1055, 614, 18, -10), 'ai', 12, true);
      paintWatercolor(ctx, sw(620, 650, 980, 648, 14, -7), 'kin', 13, true);
      paintWatercolor(ctx, sw(680, 680, 920, 679, 12, -5), 'murasaki', 14, true);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = INK;
      ctx.font = `230px ${FONT_BRUSH}`;
      ctx.fillText('墨', 800, 280);
      ctx.font = `600 54px ${FONT_SERIF}`;
      ctx.letterSpacing = '26px';
      ctx.fillText('INKRUNNER', 813, 478);
      ctx.letterSpacing = '0px';
      ctx.font = `italic 34px ${FONT_SERIF}`;
      ctx.globalAlpha = 0.8;
      ctx.fillText(SUB, 800, 760);
      if (LINK) {
        ctx.font = `600 38px ${FONT_SERIF}`;
        ctx.letterSpacing = '3px';
        ctx.globalAlpha = 0.9;
        ctx.fillText(LINK, 800, 830);
        ctx.letterSpacing = '0px';
      }
      ctx.globalAlpha = 1;
      seal(ctx, 1000, 180, 80, SEAL, INKS[SEAL_INK].color);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(makeVignette(W, H), 0, 0);
      return { card: c.toDataURL('image/png').split(',')[1], capPngs };
    },
    [W, H, LINK, SUB, SEAL, SEAL_INK, caps],
  );
  writeFileSync(`${DIR}/endcard.png`, Buffer.from(out.card, 'base64'));
  out.capPngs.forEach((b, i) => writeFileSync(caps[i].file, Buffer.from(b, 'base64')));
  await browser.close();
}

const ff = (args) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
const durs = SHOTS.map((s) => s.b - s.a);
SHOTS.forEach((s, i) => {
  const d = durs[i];
  const last = i === SHOTS.length - 1;
  // the last shot's sound keeps ringing under the end card
  const adur = last ? d + CARD - XF : d;
  const list = caps.filter((c) => c.file.startsWith(`${DIR}/cap-${i}-`));
  let fc = `[0:v]fps=30,scale=${W}:${H}:flags=lanczos,trim=duration=${d.toFixed(3)},setpts=PTS-STARTPTS[v0];`;
  list.forEach((c, j) => {
    const from = c.from ?? 0.5;
    const to = c.to ?? d - 0.5;
    fc += `[${j + 1}:v]format=rgba,fade=t=in:st=${from}:d=${FADE}:alpha=1,fade=t=out:st=${(to - FADE).toFixed(3)}:d=${FADE}:alpha=1[c${j}];`;
    fc += `[v${j}][c${j}]overlay=0:0:shortest=1[v${j + 1}];`;
  });
  fc += `[v${list.length}]null[v];[0:a]aresample=48000,apad,atrim=duration=${adur.toFixed(3)},asetpts=PTS-STARTPTS[a]`;
  ff([
    '-ss', s.a.toFixed(3), '-t', adur.toFixed(3), '-i', SRC,
    ...list.flatMap((c) => ['-loop', '1', '-framerate', '30', '-t', d.toFixed(3), '-i', c.file]),
    '-filter_complex', fc, '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-c:a', 'pcm_s16le', '-ac', '2',
    `${DIR}/s${i}.mkv`,
  ]);
});
ff(['-loop', '1', '-t', String(CARD), '-i', `${DIR}/endcard.png`, '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '14', `${DIR}/card.mkv`]);

// video: a crossfade between every shot, then into the card
const vin = [...SHOTS.map((_, i) => ['-i', `${DIR}/s${i}.mkv`]).flat(), '-i', `${DIR}/card.mkv`];
const vd = [...durs, CARD];
let fc = '';
let prev = '[0:v]';
let t = 0;
for (let i = 1; i < vd.length; i++) {
  t += vd[i - 1] - XF;
  const out = i === vd.length - 1 ? '[vx]' : `[v${i}]`;
  fc += `${prev}[${i}:v]xfade=transition=fade:duration=${XF}:offset=${t.toFixed(3)}${out};`;
  prev = out;
}
const total = t + CARD;
fc += `[vx]${OPEN ? `fade=t=in:st=0:d=${OPEN},` : ''}fade=t=out:st=${(total - 0.5).toFixed(3)}:d=0.5[v];`;
// audio: short crossfades between shots; the last one runs under the card
prev = '[0:a]';
for (let i = 1; i < SHOTS.length; i++) {
  const out = i === SHOTS.length - 1 ? '[ax]' : `[a${i}]`;
  fc += `${prev}[${i}:a]acrossfade=d=${XF}:c1=tri:c2=tri${out};`;
  prev = out;
}
fc += `[ax]${OPEN ? `afade=t=in:st=0:d=${OPEN},` : ''}afade=t=out:st=${(total - 1.2).toFixed(3)}:d=1.2,atrim=duration=${total.toFixed(3)}[a]`;
ff([
  ...vin, '-filter_complex', fc, '-map', '[v]', '-map', '[a]',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', '30', '-movflags', '+faststart',
  '-c:a', 'pcm_s16le', '-t', total.toFixed(3), `${DIR}/cut.mkv`,
]);
// phone feeds play loud: two-pass loudnorm to about -16 LUFS with true peaks under -1.5 dBTP
const LN = 'loudnorm=I=-16:TP=-1.5:LRA=11';
const probe = spawnSync('ffmpeg', ['-hide_banner', '-i', `${DIR}/cut.mkv`, '-af', `${LN}:print_format=json`, '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
const m = JSON.parse(probe.match(/\{[^{}]*\}/g).at(-1));
const ln2 = `${LN}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
ff(['-i', `${DIR}/cut.mkv`, '-c:v', 'copy', '-af', `${ln2},aresample=48000`, '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', OUT]);
console.log('clip', total.toFixed(2), 's →', OUT, `(audio was ${m.input_i} LUFS, peak ${m.input_tp} dBTP)`);
