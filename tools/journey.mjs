// Usage: node tools/journey.mjs [desktop|phone|both] [all|record|encode]   (env URL=http://localhost:5173/, DESKTOP_CHAR=ren, PHONE_CHAR=kohaku, KEEP=1 keeps the raw frames) — it takes /tmp/inkrunner-browser.lock for the run and /tmp/inkrunner-encode.lock for ffmpeg ITSELF: never wrap `all` in flock (it would wait on itself). The steps alone: flock /tmp/inkrunner-browser.lock node tools/journey.mjs <device> record, then flock /tmp/inkrunner-encode.lock node tools/journey.mjs <device> encode.
//
// The checkpoint 1 JOURNEY capture: the whole milestone path, played on a FRESH profile with REAL input and no debug
// flags (the page is the plain URL; nothing in the game is changed or teleported):
//   title → "The Unfinished Scroll" tab → a traveler card → the prologue (watched to its end on desktop; skipped with
//   the Skip button on the phone run) → the map → the First Scroll → summer-1 … summer-4 → summer-gate (each entered by
//   its map node and played with its route under tools/routes/) → "Continue the journey" after each → the map paints
//   the run in and walks on → after the gate, the Summer ending → the map painting the gate in.
// desktop: 1600x900, mouse and keyboard, Ren. phone: iPhone 13 landscape, one finger, Kohaku.
//
// Recording: CDP screencast frames (the whole page, DOM overlays included) are written as JPEGs with their timestamps,
// and the game's own audio (its AudioContext's stream output) is recorded in the page with MediaRecorder. The encode
// step turns them into constant-30-fps video with the audio laid in at its real offset:
//   shots/cp1/journey-desktop.webm (VP9 + Opus) and .mp4 (H.264 + AAC), shots/cp1/journey-phone.mp4,
//   shots/cp1/contact-<device>-NN.png (one tile every 5 s, with its time), shots/cp1/journey-<device>.txt (results,
//   chapter times in the video, raw capture smoothness, console errors).
// It prints each scroll's grade, time, falls and ink and any console errors. Exit 1 if a scroll did not finish, the
// page logged an error, or a video fails its ffprobe check.
//
// The ghost API (/api/*) is answered locally with an empty ghost list, so the journey's runs are not posted to the
// lead's ghost server and no other player's ghost shows (a fresh profile with no ghosts).
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { KnownDevices } from 'puppeteer-core';
import { launch, runRoute } from './routes/lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'shots/cp1');
const WORK = join(OUT, '.work');
const URL = process.env.URL ?? 'http://localhost:5173/';
const FPS = 30;
/** diagnosis only: FROM=<scroll id> seeds the scrolls before it as cleared and starts there; REC=0 records nothing */
const FROM = process.env.FROM ?? null;
const RECORD = process.env.REC !== '0';
const BROWSER_LOCK = '/tmp/inkrunner-browser.lock';
const ENCODE_LOCK = '/tmp/inkrunner-encode.lock';
const which = process.argv[2] ?? 'both';
const mode = process.argv[3] ?? 'all';
const DEVICES = which === 'both' ? ['desktop', 'phone'] : [which];
const SCROLLS = ['first', 'summer-1', 'summer-2', 'summer-3', 'summer-4', 'summer-gate'];
const PROFILES = {
  desktop: { name: 'desktop', char: process.env.DESKTOP_CHAR ?? 'ren', viewport: { width: 1600, height: 900 }, max: [1600, 900], touch: false, watchPrologue: true },
  phone: { name: 'phone', char: process.env.PHONE_CHAR ?? 'kohaku', device: KnownDevices['iPhone 13 landscape'], max: [1266, 586], touch: true, watchPrologue: false },
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const GRADE = { 松: 'Pine', 竹: 'Bamboo', 梅: 'Plum' };
const fmtT = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

/** The routes' plans, as their scripts export them (summer-4's differs per traveler: Kohaku takes E3 with a fox leap). */
async function planFor(id, char) {
  const m = await import(`./routes/${id}.mjs`);
  if (typeof m.planFor === 'function') return m.planFor(char);
  if (!Array.isArray(m.plan)) throw new Error(`tools/routes/${id}.mjs exports no plan`);
  return m.plan;
}

/**
 * The gate's route reads the screen and reacts (tools/routes/summer-gate.mjs runGate), so it has no plan to export.
 * Use its runGate if the script exports it; otherwise load the script's own source with runGate exported (a copy
 * under shots/cp1/.work, imported once: the route's logic is used exactly as written, not re-implemented here).
 */
async function gateRunner() {
  const m = await import('./routes/summer-gate.mjs');
  if (typeof m.runGate === 'function') return m.runGate;
  const src = readFileSync(join(ROOT, 'tools/routes/summer-gate.mjs'), 'utf8');
  if (!src.includes('\nasync function runGate(')) throw new Error('tools/routes/summer-gate.mjs has no runGate() to call');
  const lib = pathToFileURL(join(ROOT, 'tools/routes/lib.mjs')).href;
  const out = src.replace('\nasync function runGate(', '\nexport async function runGate(').replace(/from '\.\/lib\.mjs'/g, `from '${lib}'`);
  mkdirSync(WORK, { recursive: true });
  const tmp = join(WORK, `summer-gate-route-${process.pid}.mjs`);
  writeFileSync(tmp, out);
  try {
    return (await import(pathToFileURL(tmp).href)).runGate;
  } finally {
    rmSync(tmp, { force: true });
  }
}

/**
 * A stand-in browser for the route runners: newPage() hands them the journey's own page, already in the scroll (it was
 * entered from its map node), so their load (goto ?play=…) and close are no-ops and their device setup is already done.
 * Every other call goes to the real page, so their input is the real mouse, keyboard and touchscreen.
 */
function routeBrowser(page) {
  const noop = new Set(['goto', 'close', 'emulate', 'setViewport']);
  const proxy = new Proxy(page, {
    get(t, k) {
      if (noop.has(k)) return async () => null;
      const v = Reflect.get(t, k);
      return typeof v === 'function' ? v.bind(t) : v;
    },
  });
  return { newPage: async () => proxy, close: async () => {} };
}

// ───────────────────────────────────────────── recording (the page's frames and the game's audio)

/** Start the CDP screencast; frames go to `dir` as JPEGs, at most one per 1/FPS slot. Returns stop() → frame log. */
async function startScreencast(page, dir, [maxWidth, maxHeight]) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const cdp = await page.createCDPSession();
  const all = []; // [frame timestamp (s, CDP), node arrival (ms)] of EVERY frame Chromium sent
  const kept = []; // [file, timestamp] of the frames written
  const pending = new Set();
  let t0 = null;
  let lastSlot = -1;
  cdp.on('Page.screencastFrame', (ev) => {
    cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => {});
    const ts = ev.metadata?.timestamp;
    if (ts === undefined) return;
    all.push([ts, Date.now()]);
    t0 ??= ts;
    const slot = Math.floor((ts - t0) * FPS);
    if (slot <= lastSlot) return;
    lastSlot = slot;
    const file = `${String(kept.length).padStart(6, '0')}.jpg`;
    kept.push([file, ts]);
    const p = writeFile(join(dir, file), Buffer.from(ev.data, 'base64')).finally(() => pending.delete(p));
    pending.add(p);
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth, maxHeight, everyNthFrame: 1 });
  return {
    /** start again after a navigation, if it stopped (frames carry on in the same log) */
    restart: () => cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth, maxHeight, everyNthFrame: 1 }).catch(() => {}),
    /** video time (s) of a node Date.now(), from the first frame's arrival */
    at: (ms = Date.now()) => (all.length ? (ms - all[0][1]) / 1000 : 0),
    stop: async () => {
      await cdp.send('Page.stopScreencast').catch(() => {});
      await Promise.all([...pending]);
      await cdp.detach().catch(() => {});
      return { all, kept };
    },
  };
}

/** Record the game's audio (its AudioContext's stream output) in the page, once the first gesture has made it. */
const AUDIO_START = async () => {
  const dest = window.__game?.audio?.streamDest;
  if (!dest || window.__jrec) return !!window.__jrec;
  const type = ['audio/webm;codecs=opus', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported(t));
  const mr = new MediaRecorder(dest.stream, { mimeType: type, audioBitsPerSecond: 160000 });
  const rec = (window.__jrec = { mr, chunks: [], t0: 0, type });
  mr.ondataavailable = (e) => e.data.size && rec.chunks.push(e.data);
  await new Promise((r) => {
    mr.onstart = () => {
      rec.t0 = Date.now();
      r();
    };
    mr.start(1000);
  });
  return true;
};
const AUDIO_STOP = async () => {
  const rec = window.__jrec;
  if (!rec) return null;
  await new Promise((r) => {
    rec.mr.onstop = r;
    rec.mr.stop();
  });
  const buf = new Uint8Array(await new Blob(rec.chunks, { type: rec.type }).arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { t0: rec.t0, b64: btoa(bin) };
};

// ───────────────────────────────────────────── the journey (one device)

async function journey(browser, P) {
  const dir = join(WORK, P.name);
  if (RECORD) mkdirSync(dir, { recursive: true });
  const ctx = await browser.createBrowserContext(); // a fresh profile: no save, no settings, no cutscene seen
  const page = await ctx.newPage();
  if (P.device) await page.emulate(P.device);
  else await page.setViewport(P.viewport);
  // iPhone Safari has no element fullscreen (Element.requestFullscreen is missing there), and in headless Chromium a
  // fullscreen request resizes the captured window to its 800x600 default: take it away, as on the real phone
  if (P.touch) await page.evaluateOnNewDocument(() => delete Element.prototype.requestFullscreen);
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (new globalThis.URL(req.url()).pathname.startsWith('/api/')) void req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ best: null, others: [] }) });
    else void req.continue();
  });
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.stack ?? e}`));
  let navigating = true;
  page.on('framenavigated', (f) => {
    if (f === page.mainFrame() && !navigating) errors.push('the page reloaded during the journey (dev server hot reload?): rerun');
  });

  const chapters = []; // [video time, label]
  const results = [];
  let rec = null;
  const mark = (label) => {
    const t = rec ? rec.at() : 0;
    chapters.push([t, label]);
    console.log(`  [${fmtT(t)}] ${label}`);
  };
  const press = async (sel) => (P.touch ? page.tap(sel) : page.click(sel));
  const G = (fn, ...a) => page.evaluate(fn, ...a);
  const shotFail = (name) => page.screenshot({ path: join(OUT, `fail-${P.name}-${name}.png`) }).catch(() => {});

  // a real drag across the map (mouse, or one finger)
  const drag = async (dx) => {
    const r = await G(() => {
      const b = document.querySelector('#map .map-view').getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height * 0.3 };
    });
    const steps = 14;
    if (P.touch) {
      await page.touchscreen.touchStart(r.x, r.y);
      for (let i = 1; i <= steps; i++) {
        await page.touchscreen.touchMove(r.x + (dx * i) / steps, r.y);
        await wait(18);
      }
      await page.touchscreen.touchEnd();
    } else {
      await page.mouse.move(r.x, r.y);
      await page.mouse.down();
      for (let i = 1; i <= steps; i++) {
        await page.mouse.move(r.x + (dx * i) / steps, r.y);
        await wait(18);
      }
      await page.mouse.up();
    }
  };
  // pan with real input until a node sits comfortably inside the view
  const bringIntoView = async (id) => {
    for (let i = 0; i < 12; i++) {
      const q = await G((id) => {
        const v = document.querySelector('#map .map-view').getBoundingClientRect();
        const b = document.querySelector(`.map-node[data-node="${id}"]`).getBoundingClientRect();
        return { off: b.left + b.width / 2 - (v.left + v.width / 2), half: v.width / 2 };
      }, id);
      if (Math.abs(q.off) < q.half * 0.6) return;
      await drag(-Math.sign(q.off) * Math.min(Math.abs(q.off), q.half * 0.9));
      await wait(700);
    }
  };
  const csNow = () => G(() => {
    const p = window.__cutscene;
    return p && p.root.isConnected && !p.ended ? { id: p.def.id, T: p.T, total: p.total } : null;
  });
  const waitCs = (id, T = 0.5) =>
    page.waitForFunction((id, T) => {
      const p = window.__cutscene;
      return p && p.root.isConnected && !p.ended && p.def.id === id && p.T >= T;
    }, { timeout: 30000 }, id, T);
  /** let a cutscene play to its end (its hand-over into the map included) */
  const watchCs = async (id) => {
    const q = await csNow();
    await page.waitForFunction(() => !!window.__cutscene?.ended, { timeout: 240000, polling: 100 });
    const how = await G(() => window.__cutscene.ended);
    await page.waitForFunction(() => !document.querySelector('.cutscene'), { timeout: 15000 });
    return `${id} ${how === 'end' ? 'played to its end' : `ended by ${how}`} (${q?.total.toFixed(1)} s)`;
  };
  const skipCs = async () => {
    await page.waitForSelector('.cutscene .cs-skip.on', { timeout: 15000 });
    const box = await (await page.$('.cutscene .cs-skip')).boundingBox();
    if (P.touch) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    else await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForFunction(() => !document.querySelector('.cutscene'), { timeout: 15000 });
  };
  /** the map is open and has finished painting in and walking on (then a beat for the eye) */
  const mapSettled = async (hold = 1800, timeout = 90000) => {
    await page.waitForFunction(() => window.__map?.isOpen && !document.getElementById('map').classList.contains('hidden'), { timeout: 30000 });
    const t = Date.now();
    let painted = null;
    let walked = false;
    let done = false;
    while (Date.now() - t < timeout) {
      const q = await G(() => {
        const q = window.__map.inspect();
        return { painting: q.painting, walking: q.walking };
      });
      if (q.painting) painted = q.painting;
      walked ||= q.walking;
      if ((!q.painting || q.painting.settled) && !q.walking) {
        done = true;
        break;
      }
      await wait(150);
    }
    const s = (Date.now() - t) / 1000;
    await wait(hold);
    return `${painted ? `painted ${painted.id} in (${painted.total} strokes)` : 'no paint-in'}${walked ? ', walked on to the next scroll' : ''}; ${done ? `settled after ${s.toFixed(1)} s` : `NOT settled after ${s.toFixed(0)} s`}`;
  };
  const audio = async () => {
    for (let i = 0; i < 40; i++) {
      if (await G(AUDIO_START).catch(() => false)) return true;
      await wait(50);
    }
    return false;
  };

  let ok = true;
  let frames = null;
  /**
   * Read-only guard for a fixed game bug (the traveler's portal cooldown carried into the next scroll, whose clock
   * restarts at 0, so every portal refused them for its first 15-31 s). Read once the scroll has started: returns the
   * stale cooldown if one survived Portals.reset(), else null.
   */
  const staleCooldown = () =>
    G(async () => {
      const g = window.__game;
      const url = performance.getEntriesByType('resource').map((e) => e.name).filter((n) => n.includes('/src/mechanics/portals.ts')).pop();
      if (!url || !g.portals.cooldown) return null;
      const { TRAVELER } = await import(url);
      const c = g.portals.cooldown.get(TRAVELER);
      return c !== undefined && c > g.t + 0.2 ? c : null;
    }).catch(() => null);
  const relaunches = [];
  /** close and reopen the app (reload the page), then title → campaign → traveler → the map, all with real input */
  const relaunch = async (why) => {
    mark(`RELAUNCH (${why})`);
    relaunches.push(why);
    await saveSound();
    navigating = true;
    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__game && window.__map && document.fonts.status === 'loaded', { timeout: 30000 });
    navigating = false;
    await rec?.restart();
    await wait(1200);
    await press('#tab-campaign');
    await wait(900);
    await press(`.card[data-char="${P.char}"]`);
    await mapSettled(1200);
  };
  const sounds = []; // one per page load: { t0, b64 }
  const saveSound = async () => {
    const q = RECORD ? await G(AUDIO_STOP).catch(() => null) : null;
    if (q?.b64) sounds.push(q);
  };
  try {
    console.log(`\n── journey ${P.name} (${P.device ? 'iPhone 13 landscape, one finger' : '1600x900, mouse and keyboard'}) as ${P.char}`);
    await page.goto(URL, { waitUntil: 'load' });
    if (FROM) {
      // diagnosis only (not a fresh profile): every scroll before FROM seeded as cleared, the prologue seen
      await G((ids) => {
        for (const id of ids) localStorage.setItem(`inkrunner:best:${id}`, JSON.stringify({ time: 60, grade: '竹' }));
        localStorage.setItem('inkrunner:campaign', JSON.stringify({ v: 1, seen: ['prologue'], strokes: {} }));
      }, SCROLLS.slice(0, SCROLLS.indexOf(FROM)));
      await page.goto(URL, { waitUntil: 'load' });
      console.log(`  (FROM=${FROM}: ${SCROLLS.slice(0, SCROLLS.indexOf(FROM)).join(', ') || 'nothing'} seeded as cleared, the prologue as seen)`);
    }
    await page.waitForFunction(() => window.__game && window.__map && document.fonts.status === 'loaded', { timeout: 30000 });
    navigating = false;
    await wait(1000);
    if (RECORD) rec = await startScreencast(page, join(dir, 'frames'), P.max);
    await wait(300);
    mark('title');
    await wait(2500);
    await press('#tab-campaign');
    mark('The Unfinished Scroll tab');
    await wait(2200);
    await press(`.card[data-char="${P.char}"]`);
    if (RECORD && !FROM && !(await audio())) console.log('  (the game audio did not start with the prologue)');
    if (!FROM) {
      await waitCs('prologue');
      mark('prologue');
      if (P.watchPrologue) console.log(`  ${await watchCs('prologue')}`);
      else {
        await wait(3500);
        await skipCs();
        console.log('  prologue skipped (Skip button)');
      }
    }
    mark('the map');
    await mapSettled(2500);

    const runGate = await gateRunner();
    for (const id of SCROLLS.slice(FROM ? SCROLLS.indexOf(FROM) : 0)) {
      const state = await G((id) => document.querySelector(`.map-node[data-node="${id}"]`)?.dataset.state, id);
      if (state !== 'open' && state !== 'cleared') throw new Error(`the ${id} node is ${state ?? 'missing'} on the map, not open`);
      await bringIntoView(id);
      await wait(600);
      await press(`.map-node[data-node="${id}"]`);
      await page.waitForFunction((id) => window.__game.state === 'play' && window.__game.level.id === id, { timeout: 20000 }, id);
      mark(id);
      const stale = await staleCooldown();
      if (stale !== null) {
        console.log(`  GAME BUG: the traveler's portal cooldown from the last scroll (${stale.toFixed(1)} s) survived into ${id}`);
        ok = false;
      }
      // the game makes its audio on the first press that needs it (a cutscene, or a scroll's start)
      if (RECORD && !(await audio())) console.log('  (the game audio has not started: this stretch is silent)');
      const wrap = routeBrowser(page);
      let r;
      if (id === 'summer-gate') {
        r = await runGate({ browser: wrap, char: P.char, device: P.name, shot: null });
        r.steps = `drums ${r.cleaned}/8, wraps ${r.wraps}`;
      } else r = await runRoute({ level: id, char: P.char, device: P.name, plan: await planFor(id, P.char), browser: wrap, timeout: 300000 });
      const line = `${id.padEnd(12)} ${r.finished ? `${(r.gradeName ?? '-').padEnd(6)} ${r.grade ?? ''}` : 'DID NOT FINISH'}  time ${r.time.toFixed(1)} s (par ${r.par[0].toFixed(1)})  falls ${r.falls}  ink ${Math.round(r.ink)} (par ${r.par[1]})  strokes ${r.strokes}  ${r.steps ?? ''}`;
      console.log(`  ${line}`);
      results.push({ id, line, ...r, log: undefined, errors: undefined });
      if (r.errors?.length) errors.push(...r.errors.map((e) => `pageerror (${id}): ${e}`));
      if (!r.finished) {
        ok = false;
        mark(`${id} DID NOT FINISH`);
        await shotFail(id);
        console.log(`  ${id} did not finish; the route's log:\n    ${r.log.slice(-25).join('\n    ')}`);
        console.log(`  capture: shots/cp1/fail-${P.name}-${id}.png`);
        break;
      }
      await wait(1200);
      mark(`${id} finish (${r.gradeName})`);
      await wait(2600);
      await press('#btn-continue');
      if (id === 'summer-gate') {
        await waitCs('summer-ending');
        mark('the Summer ending');
        console.log(`  ${await watchCs('summer-ending')}`);
        mark('the map: Autumn rolled up, then summer-gate painted in');
        console.log(`  map: ${await mapSettled(4500, 120000)}`);
      } else {
        mark('the map: paint-in and walk on');
        console.log(`  map: ${await mapSettled(1500)}`);
      }
    }
    mark('end');
  } catch (e) {
    ok = false;
    errors.push(`journey: ${String(e?.stack ?? e).split('\n').slice(0, 3).join(' | ')}`);
    console.log(`  JOURNEY STOPPED: ${String(e?.message ?? e).split('\n')[0]}`);
    await shotFail('stopped');
    console.log(`  capture: shots/cp1/fail-${P.name}-stopped.png`);
  } finally {
    await saveSound();
    if (rec) frames = await rec.stop();
    await ctx.close().catch(() => {});
  }
  sounds.forEach((q, i) => writeFileSync(join(dir, `audio-${i}.webm`), Buffer.from(q.b64, 'base64')));
  const meta = { device: P.name, char: P.char, results, chapters, errors, audio: sounds.map((q, i) => ({ file: `audio-${i}.webm`, t0: q.t0 })), relaunches, frames: frames?.kept ?? [], all: frames?.all ?? [], ok };
  if (RECORD) writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta));
  for (const r of results) console.log(`RESULT ${P.name} ${r.line}`);
  if (relaunches.length) console.log(`WORKAROUND (${P.name}): relaunched the app ${relaunches.length} time(s) for the stale portal cooldown bug: ${relaunches.join('; ')}`);
  console.log(errors.length ? `CONSOLE ERRORS (${P.name}): ${errors.length}\n  ${errors.join('\n  ')}` : `no console errors (${P.name})`);
  return ok && !errors.length && results.length === SCROLLS.length - (FROM ? SCROLLS.indexOf(FROM) : 0) && results.every((r) => r.finished);
}

// ───────────────────────────────────────────── encoding, checks and contact sheets (under the encode lock)

const ff = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'inherit', 'inherit'], maxBuffer: 1 << 26 });

/** ffprobe a video: duration, frame count and the largest gap between frame timestamps. */
function probe(file) {
  const fmt = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name,width,height,avg_frame_rate', '-of', 'json', file]).toString());
  const pts = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'packet=pts_time', '-of', 'csv=p=0', file], { maxBuffer: 1 << 28 })
    .toString()
    .split('\n')
    .map(Number)
    .filter((v) => Number.isFinite(v) && v >= 0)
    .sort((a, b) => a - b);
  let maxGap = 0;
  let at = 0;
  for (let i = 1; i < pts.length; i++) if (pts[i] - pts[i - 1] > maxGap) [maxGap, at] = [pts[i] - pts[i - 1], pts[i - 1]];
  const duration = Number(fmt.format.duration);
  const streams = fmt.streams.map((s) => `${s.codec_type} ${s.codec_name}${s.width ? ` ${s.width}x${s.height} ${s.avg_frame_rate}` : ''}`).join(', ');
  const ok = duration > 30 && pts.length > duration * FPS * 0.95 && maxGap <= (1.5 / FPS) + 1e-3;
  return { duration, frames: pts.length, maxGap, at, streams, ok };
}

function encode(device) {
  const dir = join(WORK, device);
  if (!existsSync(join(dir, 'meta.json'))) throw new Error(`nothing recorded for ${device}: run the record step first`);
  const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
  const kept = meta.frames;
  if (kept.length < FPS * 10) throw new Error(`only ${kept.length} frames recorded for ${device}`);
  // the raw capture: how evenly Chromium delivered frames (a stall in the page shows as a gap here; the encoded video is
  // constant-rate, so such a stall would be a held frame in it, not a gap)
  const all = meta.all.map((q) => q[0]);
  const t0 = all[0];
  const gaps = [];
  for (let i = 1; i < all.length; i++) gaps.push([all[i] - all[i - 1], all[i - 1] - t0]);
  const over = gaps.filter((g) => g[0] > 1.5 / FPS);
  const worst = [...gaps].sort((a, b) => b[0] - a[0]).slice(0, 8);
  const span = all[all.length - 1] - t0;
  const raw = `raw capture: ${all.length} frames over ${span.toFixed(1)} s (${(all.length / span).toFixed(1)} fps delivered); ${over.length} gaps over ${((1.5 / FPS) * 1000).toFixed(0)} ms (${((over.reduce((s, g) => s + g[0], 0) / span) * 100).toFixed(1)}% of the time); worst ${worst.map((g) => `${(g[0] * 1000).toFixed(0)} ms at ${fmtT(g[1])}`).join(', ')}`;
  // a concat list with each frame's real duration; ffmpeg then resamples to a constant 30 fps
  const list = kept.map(([f, ts], i) => `file 'frames/${f}'\nduration ${((kept[i + 1]?.[1] ?? ts + 1 / FPS) - ts).toFixed(6)}`);
  list.push(`file 'frames/${kept[kept.length - 1][0]}'`);
  writeFileSync(join(dir, 'frames.txt'), list.join('\n') + '\n');
  // the game's audio, one recording per page load, each laid in at its real offset from the first frame
  const tracks = (meta.audio ?? []).filter((a) => existsSync(join(dir, a.file)) && a.t0).map((a) => ({ ...a, delay: Math.max(0, Math.round(a.t0 - meta.all[0][1])) }));
  const hasAudio = tracks.length > 0;
  const vin = ['-f', 'concat', '-safe', '0', '-i', join(dir, 'frames.txt')];
  const ain = tracks.flatMap((a) => ['-i', join(dir, a.file)]);
  const vf = `[0:v]fps=${FPS},scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p[v]`;
  const af = hasAudio
    ? ';' + tracks.map((a, i) => `[${i + 1}:a]aresample=48000,adelay=${a.delay}|${a.delay}[a${i}]`).join(';') + `;${tracks.map((_, i) => `[a${i}]`).join('')}${tracks.length > 1 ? `amix=inputs=${tracks.length}:normalize=0:duration=longest,` : 'anull,'}apad[a]`
    : '';
  const delay = tracks.map((a) => `+${(a.delay / 1000).toFixed(2)} s`).join(', ');
  const maps = ['-filter_complex', vf + af, '-map', '[v]', ...(hasAudio ? ['-map', '[a]', '-shortest'] : [])];
  const outs = [`journey-${device}.mp4`, ...(device === 'desktop' ? [`journey-${device}.webm`] : [])];
  console.log(`\n── encode ${device}: ${kept.length} frames${hasAudio ? `, audio tracks at ${delay}` : ', no audio'}`);
  console.log(`  ${raw}`);
  const checks = [];
  for (const name of outs) {
    const out = join(OUT, name);
    const t = Date.now();
    if (name.endsWith('.mp4')) ff([...vin, ...ain, ...maps, '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-r', `${FPS}`, ...(hasAudio ? ['-c:a', 'aac', '-b:a', '160k'] : []), '-movflags', '+faststart', out]);
    else ff([...vin, ...ain, ...maps, '-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0', '-deadline', 'good', '-cpu-used', '4', '-row-mt', '1', '-threads', '8', '-r', `${FPS}`, ...(hasAudio ? ['-c:a', 'libopus', '-b:a', '128k'] : []), out]);
    const p = probe(out);
    checks.push({ name, ...p });
    console.log(`  ${p.ok ? 'PASS' : 'FAIL'} ${name}: ${fmtT(p.duration)} (${p.duration.toFixed(1)} s), ${p.frames} frames, largest gap ${(p.maxGap * 1000).toFixed(1)} ms at ${fmtT(p.at)} (limit ${((1.5 / FPS) * 1000).toFixed(0)} ms); ${p.streams} (encoded in ${((Date.now() - t) / 1000).toFixed(0)} s)`);
  }
  // contact sheets: one tile every 5 s with its time, 6 x 5 tiles a sheet
  for (const f of readdirSync(OUT)) if (f.startsWith(`contact-${device}-`)) rmSync(join(OUT, f));
  ff(['-i', join(OUT, outs[0]), '-vf', `fps=1/5,scale=384:-2,drawtext=text='%{pts\\:hms}':x=6:y=6:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=4,tile=6x5:padding=4:margin=4:color=0x202020`, '-fps_mode', 'vfr', join(OUT, `contact-${device}-%02d.png`)]);
  const sheets = readdirSync(OUT).filter((f) => f.startsWith(`contact-${device}-`)).sort();
  console.log(`  contact sheets: ${sheets.map((s) => `shots/cp1/${s}`).join(', ')}`);
  // the run's own report next to the video
  const txt = [
    `INKRUNNER checkpoint 1 journey: ${device} (${meta.char}), recorded ${new Date().toISOString()}, ${URL}`,
    '',
    'Scrolls (grade, time, falls, ink):',
    ...meta.results.map((r) => `  ${r.line}`),
    ...(meta.results.length < SCROLLS.length ? [`  (stopped after ${meta.results.length} of ${SCROLLS.length} scrolls)`] : []),
    ...((meta.relaunches ?? []).length
      ? ['', `WORKAROUND: the app was closed and reopened (page reload, then title, campaign tab, traveler card, map, all with real input) ${meta.relaunches.length} time(s), because of a game bug: Portals.reset() keeps the traveler's portal cooldown from the previous scroll, so straight through, every portal refuses the traveler until the new scroll's clock passes the old one.`, ...meta.relaunches.map((r) => `  ${r}`)]
      : []),
    '',
    'Chapters (time in the video):',
    ...meta.chapters.map(([t, l]) => `  ${fmtT(t).padStart(7)}  ${l}`),
    '',
    'Videos:',
    ...checks.map((c) => `  ${c.ok ? 'PASS' : 'FAIL'} ${c.name}: ${c.duration.toFixed(1)} s, ${c.frames} frames, largest gap ${(c.maxGap * 1000).toFixed(1)} ms; ${c.streams}`),
    `  ${raw}`,
    `  audio: ${hasAudio ? `the game's own output, ${tracks.length} track(s) laid in at ${delay}` : 'none recorded'}`,
    `  contact sheets: ${sheets.join(', ')} (one tile every 5 s)`,
    '',
    meta.errors.length ? `Console errors (${meta.errors.length}):\n  ${meta.errors.join('\n  ')}` : 'Console errors: none',
  ].join('\n');
  writeFileSync(join(OUT, `journey-${device}.txt`), txt + '\n');
  if (process.env.KEEP !== '1') rmSync(dir, { recursive: true, force: true });
  return checks.every((c) => c.ok);
}

// ───────────────────────────────────────────── main

if (mode === 'all') {
  // each step under its own lock, in a child process, so the browser lock is not held through the encode
  let ok = true;
  for (const device of DEVICES) {
    const a = spawnSync('flock', [BROWSER_LOCK, process.execPath, fileURLToPath(import.meta.url), device, 'record'], { stdio: 'inherit', cwd: ROOT });
    const b = spawnSync('flock', [ENCODE_LOCK, process.execPath, fileURLToPath(import.meta.url), device, 'encode'], { stdio: 'inherit', cwd: ROOT });
    ok = ok && a.status === 0 && b.status === 0;
  }
  console.log(ok ? '\nJOURNEY OK: every scroll finished, no console errors, the videos pass ffprobe' : '\nJOURNEY FAIL (see above)');
  process.exit(ok ? 0 : 1);
} else if (mode === 'record') {
  const browser = await launch();
  let ok = true;
  try {
    for (const device of DEVICES) ok = (await journey(browser, PROFILES[device])) && ok;
  } finally {
    await browser.close();
  }
  process.exit(ok ? 0 : 1);
} else if (mode === 'encode') {
  let ok = true;
  for (const device of DEVICES) ok = encode(device) && ok;
  process.exit(ok ? 0 : 1);
} else {
  console.log('usage: node tools/journey.mjs [desktop|phone|both] [all|record|encode]');
  process.exit(2);
}
