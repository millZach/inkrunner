// Records a ≤30 s gameplay trailer: node tools/trailer.mjs
// Plays scripted scenes in real time on the GPU, records canvas + game audio in-page,
// then cuts the shots together with ffmpeg (shots/trailer/).
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const URL = process.env.URL ?? 'http://localhost:5173/';
const OUT = process.env.PROFILE === '1' ? 'shots/trailer-profile' : 'shots/trailer';
const W = 1920;
const H = 1080;
const PROFILE = process.env.PROFILE === '1'; // play the scenes without recording and report slow frames
const MODE = process.argv[2] ?? 'all'; // 'edit' re-cuts existing footage, 'card' also redraws the end card
const EDIT_ONLY = MODE !== 'all';
if (!EDIT_ONLY) {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
}

const browser = MODE === 'edit' ? null : await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  headless: 'new',
  args: ['--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** One page load = one continuous recording. Returns the per-shot [in, out] marks. */
async function session(name, level, char, script) {
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H });
  // never post trailer runs to the ghost server
  await page.setRequestInterception(true);
  page.on('request', (r) => (r.url().includes('/api/') ? r.abort() : r.continue()));
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  const file = `${OUT}/${name}.raw`;
  writeFileSync(file, '');
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('inkrunner:ghosts', '0');
    localStorage.setItem('inkrunner:muted', '0');
  });
  await page.goto(`${URL}?level=${level}`, { waitUntil: 'load' });
  await wait(2500);
  const g = (fn, ...a) => page.evaluate(fn, ...a);

  await g(async ([char, profile]) => {
    const G = window.__game;
    G.audio.init();
    if (profile) {
      // no recording: just log every frame that took too long
      const rec = (window.__rec = { mr: null, t0: performance.now(), marks: {}, mimeType: 'none', pending: 0, gaps: [] });
      let last = performance.now();
      const tick = (now) => {
        if (now - last > 30) rec.gaps.push([+((last - rec.t0) / 1000).toFixed(2), Math.round(now - last)]);
        last = now;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      document.querySelector('#tab-free')?.click();
      document.querySelector(`.card[data-char="${char}"]`).click();
      G.mouse.inside = false;
      return;
    }
    const stream = G.canvas.captureStream(60);
    const at = G.audio.streamDest?.stream.getAudioTracks()[0];
    if (at) stream.addTrack(at);
    const types = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,opus', 'video/webm;codecs=vp9,opus'];
    const mimeType = types.find((t) => MediaRecorder.isTypeSupported(t));
    const mr = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 24_000_000 });
    // keep chunks in memory: encoding/transferring them mid-shot stalls the game's frames
    const rec = (window.__rec = { mr, t0: 0, marks: {}, mimeType, chunks: [] });
    mr.ondataavailable = (e) => e.data.size && rec.chunks.push(e.data);
    await new Promise((res) => {
      mr.onstart = () => {
        rec.t0 = performance.now();
        res();
      };
      mr.start(1000);
    });
    document.querySelector('#tab-free')?.click();
      document.querySelector(`.card[data-char="${char}"]`).click();
    G.mouse.inside = false;
  }, [char, PROFILE]);

  const api = {
    g,
    page,
    wait,
    mark: (k) => g((k) => (window.__rec.marks[k] = (performance.now() - window.__rec.t0) / 1000), k),
    teleport: (x, extra = {}) =>
      g(
        ([x, extra]) => {
          const G = window.__game;
          G.px = x;
          G.py = G.surfaceBelow(x, -2000) ?? 500;
          G.vx = 310;
          G.vy = 0;
          G.grounded = true;
          G.ride = null;
          G.invuln = 0; // >0 makes the traveler blink
          G.camCX = x + (G.W / G.S) * 0.18;
          G.camCY = G.py - 80;
          G.character.reset();
          if (extra.litBefore) for (const l of G.level.lanterns) if (l.x < x) l.lit = true;
        },
        [x, extra],
      ),
    waitX: async (x) => {
      for (let i = 0; i < 400; i++) {
        if ((await g(() => window.__game.px)) >= x) return;
        await wait(10);
      }
    },
    /** Paint like a hand: glide the brush in, press, trace, lift, drift away. */
    paint: async (pts, ink) => {
      await page.keyboard.press(`Digit${ink}`);
      const toScreen = (p) =>
        g(
          ([x, y]) => {
            const G = window.__game;
            return [G.W / 2 + (x - G.camCX) * G.S, G.H / 2 + (y - G.camCY) * G.S];
          },
          [p.x, p.y],
        );
      const s0 = await toScreen(pts[0]);
      await page.mouse.move(s0[0] - 160, s0[1] - 140);
      await page.mouse.move(s0[0], s0[1], { steps: 10 });
      await page.mouse.down();
      for (const p of pts.slice(1)) {
        const s = await toScreen(p);
        await page.mouse.move(s[0], s[1], { steps: 2 });
      }
      await page.mouse.up();
      const s1 = await toScreen(pts[pts.length - 1]);
      await page.mouse.move(s1[0] + 120, s1[1] - 160, { steps: 8 });
      await g(() => (window.__game.mouse.inside = false));
    },
    key: async (code, ms = 200) => {
      await page.keyboard.down(code);
      await wait(ms);
      await page.keyboard.up(code);
    },
  };
  await script(api);

  const { marks, mimeType, gaps, parts } = await g(async () => {
    const rec = window.__rec;
    if (!rec.mr) return { marks: rec.marks, mimeType: rec.mimeType, gaps: rec.gaps, parts: 0 };
    await new Promise((res) => {
      rec.mr.onstop = res;
      rec.mr.stop();
    });
    rec.blob = new Blob(rec.chunks, { type: rec.mimeType });
    return { marks: rec.marks, mimeType: rec.mimeType, parts: Math.ceil(rec.blob.size / 3_000_000) };
  });
  // now that the shot is over, copy the video out in slices
  for (let i = 0; i < parts; i++) {
    const b64 = await g(async (i) => {
      const buf = new Uint8Array(await window.__rec.blob.slice(i * 3_000_000, (i + 1) * 3_000_000).arrayBuffer());
      let s = '';
      for (let k = 0; k < buf.length; k += 0x8000) s += String.fromCharCode(...buf.subarray(k, k + 0x8000));
      return btoa(s);
    }, i);
    appendFileSync(file, Buffer.from(b64, 'base64'));
  }
  await wait(300);
  await page.close();
  console.log(name, mimeType, JSON.stringify(marks));
  if (gaps) console.log('  slow frames [t, ms]:', JSON.stringify(gaps));
  return marks;
}

/** A gently arched brush path between two points. */
const arc = (x0, y0, x1, y1, n = 28, bow = -26) =>
  Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    return { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * bow };
  });
const zig = (x0, x1, y0, y1, n = 4) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = { x: i % 2 ? x1 : x0, y: y0 + ((y1 - y0) * i) / n };
    const b = { x: i % 2 ? x0 : x1, y: y0 + ((y1 - y0) * (i + 1)) / n };
    for (let k = 0; k < 6; k++) out.push({ x: a.x + ((b.x - a.x) * k) / 6, y: a.y + ((b.y - a.y) * k) / 6 });
  }
  return out;
};

// ─── the shoot
const shots = EDIT_ONLY ? JSON.parse(readFileSync(`${OUT}/marks.json`, 'utf8')) : {};
if (!EDIT_ONLY) {

shots.first = await session('first', 'first', 'ren', async (s) => {
  await s.mark('intro_in');
  await s.wait(3600);
  await s.mark('intro_out');
  // the first chasm: a vermilion bridge
  await s.teleport(2380, { litBefore: true });
  await s.wait(700);
  await s.mark('bridge_in');
  await s.waitX(2700);
  await s.paint(arc(2850, 552, 3510, 550, 30, -30), 1);
  await s.wait(2300);
  await s.mark('bridge_out');
  // the gate
  await s.teleport(14350, { litBefore: true });
  await s.wait(700);
  await s.mark('gate_in');
  await s.wait(5600);
  await s.mark('gate_out');
});

shots.kohaku = await session('kohaku', 'first', 'kohaku', async (s) => {
  await s.wait(2000);
  // indigo current up the cliff
  await s.teleport(6150, { litBefore: true });
  await s.wait(600);
  await s.mark('ride_in');
  await s.waitX(6360);
  await s.paint(arc(6640, 566, 7100, 215, 24, -20), 2);
  await s.wait(2600);
  await s.mark('ride_out');
  // gold against the shadows
  await s.teleport(8640, { litBefore: true });
  await s.wait(600);
  await s.mark('gold_in');
  await s.waitX(8760);
  await s.paint(zig(9130, 9340, 310, 480, 4), 3);
  await s.paint(arc(9590, 330, 9790, 440, 10, -10), 3);
  await s.wait(2200);
  await s.mark('gold_out');
});

shots.snow = await session('snow', 'snow', 'kohaku', async (s) => {
  await s.wait(2000);
  await s.teleport(1560, { litBefore: true });
  await s.wait(600);
  await s.mark('snow_in');
  await s.waitX(1800);
  await s.paint(arc(2080, 528, 2700, 526, 30, -36), 1);
  await s.waitX(2560);
  await s.key('Space', 220);
  await s.wait(300);
  await s.key('Space', 260);
  await s.wait(1500);
  await s.mark('snow_out');
});

shots.sea = await session('sea', 'sea', 'ren', async (s) => {
  await s.wait(2000);
  await s.teleport(2110, { litBefore: true });
  await s.wait(600);
  await s.mark('sea_in');
  await s.waitX(2330);
  await s.paint(arc(2630, 548, 3310, 508, 32, -60), 1);
  await s.wait(2800);
  await s.mark('sea_out');
});

}
if (PROFILE) {
  await browser.close();
  process.exit(0);
}
// ─── end card, painted with the game's own watercolor
if (MODE !== 'edit') {
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H });
  await page.goto(URL, { waitUntil: 'load' });
  await wait(2500);
  const b64 = await page.evaluate(
    async ([W, H]) => {
      const { paintWatercolor } = await import('/src/strokes.ts');
      const { makeGrain, makeVignette } = await import('/src/render/paper.ts');
      const { INK, PAPER, INKS, FONT_BRUSH, FONT_SERIF } = await import('/src/config.ts');
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const ctx = c.getContext('2d');
      ctx.fillStyle = PAPER;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = ctx.createPattern(makeGrain(), 'repeat');
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
      const k = W / 1600;
      ctx.setTransform(k, 0, 0, k, 0, 0);
      // three swashes, one per ink
      const sw = (x0, y0, x1, y1, w, bow) =>
        Array.from({ length: 61 }, (_, i) => {
          const t = i / 60;
          return { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * bow, w: w * (0.75 + 0.5 * Math.sin(t * Math.PI)) };
        });
      paintWatercolor(ctx, sw(470, 598, 1130, 590, 26, -16), 'shu', 11, true);
      paintWatercolor(ctx, sw(560, 640, 1040, 636, 18, -10), 'ai', 12, true);
      paintWatercolor(ctx, sw(650, 674, 950, 672, 13, -6), 'kin', 13, true);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = INK;
      ctx.font = `230px ${FONT_BRUSH}`;
      ctx.fillText('墨', 800, 290);
      ctx.font = `600 54px ${FONT_SERIF}`;
      ctx.letterSpacing = '26px';
      ctx.fillText('INKRUNNER', 813, 490);
      ctx.letterSpacing = '0px';
      ctx.font = `italic 30px ${FONT_SERIF}`;
      ctx.globalAlpha = 0.8;
      ctx.fillText('The world is ink. Your brush is the only color.', 800, 770);
      ctx.globalAlpha = 1;
      // hanko
      ctx.save();
      ctx.translate(1000, 180);
      ctx.rotate(-0.06);
      ctx.fillStyle = INKS.shu.color;
      ctx.beginPath();
      ctx.roundRect(-40, -40, 80, 80, 8);
      ctx.fill();
      ctx.fillStyle = PAPER;
      ctx.font = `50px ${FONT_BRUSH}`;
      ctx.fillText('朱', 0, 3);
      ctx.restore();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(makeVignette(W, H), 0, 0);
      return c.toDataURL('image/png').split(',')[1];
    },
    [W, H],
  );
  writeFileSync(`${OUT}/endcard.png`, Buffer.from(b64, 'base64'));
  await page.close();
}
await browser?.close();
if (!EDIT_ONLY) writeFileSync(`${OUT}/marks.json`, JSON.stringify(shots));

// ─── edit
const m = Object.assign({}, ...Object.values(shots));
const src = { intro: 'first', bridge: 'first', gate: 'first', ride: 'kohaku', gold: 'kohaku', snow: 'snow', sea: 'sea' };
const order = ['intro', 'bridge', 'ride', 'gold', 'snow', 'sea', 'gate'];
// [skip at the head, max length] per shot — keeps the cut under 30 s
const trim = { intro: [0.25, 3.2], bridge: [0.5, 3.8], ride: [0.3, 3.8], gold: [0.3, 3.9], snow: [1.0, 5.0], sea: [0.5, 4.2], gate: [0.3, 4.2] };
const XF = 0.35;
const CARD = 3.0;
const ff = (args) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });

const durs = [];
order.forEach((k, i) => {
  const a = m[`${k}_in`] + trim[k][0];
  const b = Math.min(m[`${k}_out`], a + trim[k][1]);
  const last = i === order.length - 1;
  const dur = b - a;
  durs.push(dur);
  // the last game shot keeps its audio ringing under the end card
  const adur = last ? dur + CARD - XF : dur;
  ff([
    '-ss', a.toFixed(3), '-t', adur.toFixed(3), '-i', `${OUT}/${src[k]}.raw`,
    '-vf', `fps=60,scale=${W}:${H},trim=duration=${dur.toFixed(3)},setpts=PTS-STARTPTS`,
    '-af', `aresample=48000,apad,atrim=duration=${adur.toFixed(3)},asetpts=PTS-STARTPTS`,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-c:a', 'pcm_s16le', '-ac', '2',
    `${OUT}/s${i}.mkv`,
  ]);
});
ff(['-loop', '1', '-t', String(CARD), '-i', `${OUT}/endcard.png`, '-vf', `fps=60,format=yuv420p`, '-c:v', 'libx264', '-crf', '14', `${OUT}/card.mkv`]);

// video: crossfades between every shot, then into the card
const vin = [...order.map((_, i) => ['-i', `${OUT}/s${i}.mkv`]).flat(), '-i', `${OUT}/card.mkv`];
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
fc += `[vx]fade=t=in:st=0:d=0.4,fade=t=out:st=${(total - 0.5).toFixed(3)}:d=0.5[v];`;
// audio: short crossfades between the game shots; the last one runs under the card
prev = '[0:a]';
for (let i = 1; i < order.length; i++) {
  const out = i === order.length - 1 ? '[ax]' : `[a${i}]`;
  fc += `${prev}[${i}:a]acrossfade=d=${XF}:c1=tri:c2=tri${out};`;
  prev = out;
}
fc += `[ax]afade=t=in:st=0:d=0.3,afade=t=out:st=${(total - 1.2).toFixed(3)}:d=1.2,atrim=duration=${total.toFixed(3)}[a]`;
ff([
  ...vin, '-filter_complex', fc, '-map', '[v]', '-map', '[a]',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
  '-c:a', 'aac', '-b:a', '192k', '-t', total.toFixed(3), 'shots/inkrunner-trailer.mp4',
]);
console.log('trailer', total.toFixed(2), 's → shots/inkrunner-trailer.mp4');
