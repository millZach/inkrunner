// Usage:
//   flock /tmp/inkrunner-browser.lock node tools/proofs/cutscene.mjs            assertions, both cutscenes, desktop and phone
//   flock /tmp/inkrunner-browser.lock node tools/proofs/cutscene.mjs shots      captures for review (STRIPS=1: motion strips only)
//   flock /tmp/inkrunner-browser.lock node tools/proofs/cutscene.mjs frame 3.3[,7.1,...] [phone] [notext] [kohaku]
//                                                                              paused frames at cutscene times T
// env: URL (default http://localhost:5173/), OUT (default shots/proofs/cutscene), THROTTLE=4, BUDGET=8,
//      ONLY=desktop|phone, CS=prologue|summer-ending (assertions: default both; shots and frames: default prologue)
//
// Assertions on ?proof=cutscene&cs=<id>, for the prologue and the Summer ending, on desktop (1600x900, mouse and
// keyboard) and on an iPhone 13 held sideways (844x390, touch, iPhone safe-area insets 47/47/21 forced through CDP),
// each PASS/FAIL:
//   duration    the cutscene plays start to finish in 15 to 25 s of wall time and calls onDone('end')
//   skip:<how>  each skip input (click or tap, Esc, Space, the Skip button) ends it: onDone('skip') within 1 s and
//               the overlay is gone within 1.5 s
//   safe-text   every brush text rect stays inside the safe area at every sample (and on screen)
//   errors      no page errors and no console errors
//   handover    onHandover fires once, about 1.6 s before the end, and before onDone
//   perf        the player's update+render per frame, p95 <= 8 ms under 4x CPU throttling, for the whole cutscene
// The wrappers used for perf only read the clock; nothing the cutscene draws changes.
import puppeteer, { KnownDevices } from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const URL = process.env.URL ?? 'http://localhost:5173/';
const OUT = process.env.OUT ?? join(ROOT, 'shots/proofs/cutscene');
const THROTTLE = Number(process.env.THROTTLE ?? 4);
const BUDGET = Number(process.env.BUDGET ?? 8);
const PHONE_SAFE = { top: 0, left: 47, right: 47, bottom: 21 };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const mode = process.argv[2] ?? 'assert';
/** the cutscene for shots and frames */
const CS1 = process.env.CS ?? 'prologue';
const TAG = { prologue: 'prologue', 'summer-ending': 'ending' };
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  headless: 'new',
  args: ['--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});

/** a page on the proof, desktop or phone; returns { page, cdp, errors } */
async function open(device, query = '', cs = CS1) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.stack ?? e}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  const cdp = await page.createCDPSession();
  if (device === 'phone') {
    await page.emulate(KnownDevices['iPhone 13 landscape']);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: PHONE_SAFE });
  } else {
    await page.setViewport({ width: 1600, height: 900 });
  }
  await page.goto(`${URL}?proof=cutscene&auto=1&ui=0&cs=${cs}${query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__cutscene && window.__cutscene.root.isConnected && window.__cutscene.T > 0, { timeout: 30000 });
  // the dev server hot-reloads when any builder saves a file; a reload mid-run invalidates the run, so say so
  page.on('framenavigated', (f) => {
    if (f === page.mainFrame()) errors.push('page reloaded during the run (dev server hot reload?): rerun');
  });
  return { page, cdp, errors };
}

/** pause the cutscene at prologue time T (figures re-simulated from the panel start) */
async function freeze(page, T, textOn = true) {
  await page.evaluate(
    (T, textOn) => {
      const p = window.__cutscene;
      p.paused = true;
      p.textOn = textOn;
      p.seek(T);
    },
    T,
    textOn,
  );
  await wait(250);
}

async function shot(page, path, clip) {
  await page.screenshot({ path, ...(clip ? { clip } : {}) });
  console.log('saved', path);
}

// ───────────────────────────────────────────── assertions

const results = [];
let curCs = CS1;
function check(device, name, pass, detail) {
  results.push({ cs: curCs, device, name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${TAG[curCs].padEnd(8)} ${device.padEnd(7)} ${name.padEnd(12)} ${detail}`);
}

async function assertDevice(device, cs) {
  curCs = cs;
  const touch = device === 'phone';
  // 1. a full natural play: duration, onDone('end'), the hand-over, text inside the safe area
  {
    const { page, errors } = await open(device, '', cs);
    const t0 = Date.now();
    const safeBad = [];
    let samples = 0;
    let rects = 0;
    let info = null;
    while (Date.now() - t0 < 32000) {
      const s = await page.evaluate(() => {
        const p = window.__cutscene;
        if (!p) throw new Error('window.__cutscene is gone: the page reloaded (dev server hot reload?); rerun');
        const i = p.info();
        const vw = innerWidth;
        const vh = innerHeight;
        return { i, rects: p.textRects(), vw, vh, done: window.__csDone.slice() };
      });
      info = s;
      samples++;
      const sa = s.i.safe;
      for (const { panel, rect: r } of s.rects) {
        rects++;
        const inside = r.x >= sa.left - 0.5 && r.y >= sa.top - 0.5 && r.x + r.w <= s.vw - sa.right + 0.5 && r.y + r.h <= s.vh - sa.bottom + 0.5;
        // a panel sliding in or out during a pan is allowed to be partly off screen; whatever is on screen must be safe
        const panning = s.i.local < 0.6 && panel !== s.i.panel;
        const entering = panel === s.i.panel && s.i.local < 0.6 && s.i.panel > 0;
        if (!inside && !panning && !entering)
          safeBad.push(`P${panel + 1} at T=${s.i.T.toFixed(2)}: [${r.x.toFixed(0)},${r.y.toFixed(0)} ${r.w.toFixed(0)}x${r.h.toFixed(0)}] safe ${JSON.stringify(sa)} view ${s.vw}x${s.vh}`);
      }
      if (s.done.length) break;
      await wait(150);
    }
    const wall = (Date.now() - t0) / 1000;
    const done = info?.done ?? [];
    const end = done[0];
    check(device, 'duration', !!end && end.how === 'end' && wall >= 15 && wall <= 25, `onDone(${end?.how ?? 'never'}) after ${wall.toFixed(1)} s wall, timeline ${info?.i.total.toFixed(1)} s`);
    const hand = await page.evaluate(() => window.__csHandover.slice());
    const lead = hand.length && end ? (end.at - hand[0].at) / 1000 : -1;
    check(device, 'handover', hand.length === 1 && hand[0].T > 0 && lead > 1.2 && lead < 2.2, `onHandover ${hand.length}x, at T=${hand[0]?.T.toFixed(2) ?? '-'}, ${lead.toFixed(2)} s before onDone`);
    if (touch) {
      const sa = info?.i.safe;
      check(device, 'safe-insets', !!sa && sa.left === PHONE_SAFE.left && sa.right === PHONE_SAFE.right && sa.bottom === PHONE_SAFE.bottom, `the player read env(safe-area-inset-*) as ${JSON.stringify(sa)}`);
    }
    check(device, 'safe-text', rects > 0 && safeBad.length === 0, `${rects} text rects in ${samples} samples${safeBad.length ? `; outside: ${safeBad.slice(0, 3).join(' | ')}` : ''}`);
    await wait(800);
    const gone = await page.evaluate(() => !document.querySelector('.cutscene'));
    check(device, 'cleanup', gone, gone ? 'overlay removed after the end' : 'overlay still in the DOM');
    check(device, 'errors', errors.length === 0, errors.length ? errors.slice(0, 4).join(' | ') : 'none');
    await page.close();
  }

  // 2. every skip input ends it and calls onDone
  {
    const { page, errors } = await open(device, '', cs);
    const inputs = touch ? ['tap', 'Escape', 'Space', 'Enter', 'button'] : ['click', 'Escape', 'Space', 'Enter', 'button'];
    for (const how of inputs) {
      await page.evaluate(() => window.__csPlay());
      await page.waitForFunction(() => window.__cutscene?.T > 1.2 && !window.__cutscene.ended, { timeout: 15000 });
      const n0 = await page.evaluate(() => window.__csDone.length);
      const tIn = await page.evaluate(() => window.__cutscene.T);
      const s0 = Date.now();
      if (how === 'click') await page.mouse.click(800, 500);
      else if (how === 'tap') await page.touchscreen.tap(420, 220);
      else if (how === 'button') {
        const b = await page.$('.cutscene .cs-skip');
        const box = await b.boundingBox();
        if (touch) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
        else await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      } else await page.keyboard.press(how);
      let rec = null;
      while (Date.now() - s0 < 1000) {
        rec = await page.evaluate((n0) => window.__csDone[n0] ?? null, n0);
        if (rec) break;
        await wait(30);
      }
      const ms = Date.now() - s0;
      await wait(700);
      const gone = await page.evaluate(() => !document.querySelector('.cutscene'));
      check(device, `skip:${how}`, !!rec && rec.how === 'skip' && gone, `${rec ? `onDone(${rec.how}) ${ms} ms after the input at T=${tIn.toFixed(2)}` : 'onDone never called'}${gone ? ', overlay gone' : ', overlay still there'}`);
    }
    check(device, 'errors', errors.length === 0, errors.length ? errors.slice(0, 4).join(' | ') : 'none (skip run)');
    await page.close();
  }

  // 3. frame time under CPU throttling, whole prologue
  {
    const { page, cdp, errors } = await open(device, '', cs);
    await page.evaluate(() => window.__cutscene.destroy());
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
    await page.evaluate(() => {
      window.__csPlay();
      const P = window.__cutscene;
      const st = (window.__csPerf = { frames: [], u: 0 });
      const upd = P.update.bind(P);
      const ren = P.render.bind(P);
      P.update = (dt) => {
        const t0 = performance.now();
        upd(dt);
        st.u = performance.now() - t0;
      };
      P.render = () => {
        const t0 = performance.now();
        ren();
        st.frames.push(st.u + performance.now() - t0);
      };
    });
    await page.waitForFunction(() => window.__csDone.length > 0, { timeout: 90000, polling: 500 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const frames = await page.evaluate(() => window.__csPerf.frames);
    const f = [...frames].sort((a, b) => a - b);
    const q = (k) => f[Math.min(f.length - 1, Math.floor(k * f.length))];
    const p95 = q(0.95);
    writeFileSync(join(OUT, `perf-${TAG[cs]}-${device}.json`), JSON.stringify({ throttle: THROTTLE, n: f.length, p50: q(0.5), p95, max: f[f.length - 1], frames }, null, 0));
    check(device, 'perf', f.length > 100 && p95 <= BUDGET, `${f.length} frames at ${THROTTLE}x throttle: p50 ${q(0.5).toFixed(2)} p95 ${p95.toFixed(2)} max ${f[f.length - 1].toFixed(1)} ms (budget p95 <= ${BUDGET})`);
    check(device, 'errors', errors.length === 0, errors.length ? errors.slice(0, 4).join(' | ') : 'none (perf run)');
    await page.close();
  }
}

// ───────────────────────────────────────────── captures

async function captures() {
  // the whole cutscene as a contact sheet (desktop, every 0.7 s)
  const ending = CS1 === 'summer-ending';
  const { page, errors } = await open('desktop');
  await page.setViewport({ width: 1600, height: 900 });
  const total = await page.evaluate(() => window.__cutscene.total);
  const sheetDir = join(OUT, ending ? 'sheet-ending' : 'sheet');
  mkdirSync(sheetDir, { recursive: true });
  let n = 0;
  for (let T = 0.35; T < total && !process.env.STRIPS; T += 0.7) {
    await freeze(page, T);
    await page.screenshot({ path: join(sheetDir, `f${String(n).padStart(2, '0')}.png`) });
    n++;
  }
  if (process.env.STRIPS) n = 0;
  const cols = 6;
  const rows = Math.ceil(n / cols);
  if (n) {
    const sheet = join(OUT, `${TAG[CS1]}-contact-sheet.png`);
    execFileSync('flock', ['/tmp/inkrunner-encode.lock', 'ffmpeg', '-y', '-loglevel', 'error', '-i', join(sheetDir, 'f%02d.png'), '-vf', `scale=480:-1,tile=${cols}x${rows}:padding=4:color=white`, '-frames:v', '1', sheet]);
    console.log('saved', sheet, `(${n} frames, 0.7 s apart)`);
  }

  // the final-quality panel, full size, with and without text
  for (const [T, tag] of process.env.STRIPS ? [] : ending ? [
    [2.6, 'e1'],
    [7.2, 'e2'],
    [11.0, 'e3-turn'],
    [13.0, 'e3-fade'],
    [14.9, 'e3-stone'],
    [17.0, 'e4'],
  ] : [
    [3.4, 'p1'],
    [1.25, 'p1-early'],
  ]) {
    await freeze(page, T, true);
    await shot(page, join(OUT, `${tag}-text.png`));
    await freeze(page, T, false);
    await shot(page, join(OUT, `${tag}-notext.png`));
  }
  // motion strips (lesson 2): 8 consecutive frames, 1/15 s apart, cropped around the figure
  const strips = ending ? [
    { name: 'e1-drum-rise', T0: 0.4, step: 0.2, box: [140, 60, 620, 560] },
    // after the 0.6 s pan into E2 (a crop taken mid-pan misses Ren)
    { name: 'e2-taper', T0: 4.5 + 0.7, step: 0.3, box: [300, 400, 400, 230] },
    { name: 'e3-her-turn', T0: 9.5 + 0.5, step: 0.12, box: [600, 380, 220, 230] },
    { name: 'e3-set-down', T0: 9.5 + 1.5, step: 0.1, box: [600, 380, 220, 230] },
    { name: 'e3-ren-pickup', T0: 9.5 + 3.4, step: 0.2, box: [380, 420, 340, 260] },
    { name: 'e4-run', T0: 15.0 + 1.0, step: 0.05, box: [420, 470, 260, 130] },
  ] : [
    { name: 'master-paint', T0: 2.0, step: 0.1, box: [300, 380, 400, 210] },
    { name: 'ren-grind', T0: 2.0, step: 0.15, box: [180, 420, 200, 160] },
    { name: 'fox-flick', T0: 3.4, step: 0.08, box: [560, 520, 140, 100] },
    { name: 'p3-ren-step', T0: 9.0 + 1.0, step: 0.1, box: [200, 380, 400, 220] },
    { name: 'p4-kohaku-leap', T0: 13.5 + 2.3, step: 0.1, box: [280, 380, 460, 260] },
    { name: 'p5-run', T0: 17.5 + 1.0, step: 0.05, box: [420, 440, 260, 140] },
  ];
  for (const s of strips) {
    // one crop for the whole strip, so the frames line up and share a size: taken at its first frame, or at
    // `clipAt` (a time when the panel's camera has settled)
    let clip = null;
    if (s.clipAt != null) await freeze(page, s.clipAt, false);
    for (let i = 0; i < 8; i++) {
      if (s.clipAt == null) await freeze(page, s.T0 + i * s.step, false);
      if (!clip) {
        const a = await page.evaluate((x, y) => window.__cutscene.frameToCss(x, y), s.box[0], s.box[1]);
        const b = await page.evaluate((x, y) => window.__cutscene.frameToCss(x, y), s.box[0] + s.box[2], s.box[1] + s.box[3]);
        clip = { x: Math.round(a.x), y: Math.round(a.y), width: Math.round(b.x - a.x), height: Math.round(b.y - a.y) };
      }
      if (s.clipAt != null) await freeze(page, s.T0 + i * s.step, false);
      await page.screenshot({ path: join(sheetDir, `${s.name}-${i}.png`), clip });
    }
    execFileSync('flock', ['/tmp/inkrunner-encode.lock', 'ffmpeg', '-y', '-loglevel', 'error', '-i', join(sheetDir, `${s.name}-%d.png`), '-vf', 'tile=8x1:padding=3:color=white', '-frames:v', '1', join(OUT, `strip-${s.name}.png`)]);
    console.log('saved', join(OUT, `strip-${s.name}.png`));
  }
  if (errors.length) console.log('ERRORS', errors);
  await page.close();

  if (process.env.STRIPS) return;
  // phone size: one frame of each panel
  const ph = await open('phone');
  for (const [T, tag] of ending ? [
    [2.6, 'phone-e1-text'],
    [7.2, 'phone-e2-text'],
    [11.0, 'phone-e3-text'],
    [14.9, 'phone-e3-stone'],
    [17.0, 'phone-e4-text'],
  ] : [
    [3.4, 'phone-p1-text'],
    [7.6, 'phone-p2-text'],
    [12.0, 'phone-p3-text'],
    [16.2, 'phone-p4-text'],
    [19.4, 'phone-p5-text'],
  ]) {
    await freeze(ph.page, T, true);
    await shot(ph.page, join(OUT, `${tag}.png`));
  }
  if (!ending) {
    await freeze(ph.page, 3.4, false);
    await shot(ph.page, join(OUT, 'phone-p1-notext.png'));
  }
  if (ph.errors.length) console.log('ERRORS', ph.errors);
}

let code = 0;
try {
  if (mode === 'shots') await captures();
  else if (mode === 'frame') {
    const Ts = String(process.argv[3] ?? '3.3').split(',').map(Number);
    const flags = process.argv.slice(4);
    const { page, errors } = await open(flags.includes('phone') ? 'phone' : 'desktop', flags.includes('kohaku') ? '&play=kohaku' : '');
    for (const T of Ts) {
      await freeze(page, T, !flags.includes('notext'));
      await shot(page, join(OUT, `frame-${T}${flags.length ? '-' + flags.join('-') : ''}.png`));
    }
    if (errors.length) console.log('ERRORS\n' + errors.join('\n'));
  } else {
    for (const cs of process.env.CS ? [process.env.CS] : ['prologue', 'summer-ending'])
      for (const d of ['desktop', 'phone']) if (!process.env.ONLY || process.env.ONLY === d) await assertDevice(d, cs);
    const failed = results.filter((r) => !r.pass);
    console.log(failed.length ? `FAIL (${failed.length} of ${results.length})` : `PASS (all ${results.length})`);
    writeFileSync(join(OUT, 'assertions.json'), JSON.stringify(results, null, 1));
    code = failed.length ? 1 : 0;
  }
} catch (e) {
  console.log('FAIL', e.stack ?? e.message);
  code = 1;
} finally {
  await browser.close();
}
process.exit(code);
