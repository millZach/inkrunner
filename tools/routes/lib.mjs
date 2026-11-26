// Usage: import { runRoute, line, ring, zig } from './lib.mjs'; const r = await runRoute({ level: 'summer-1', char: 'ren', device: 'desktop' | 'phone', plan }) → { finished, grade, time, falls, ink, strokes, log }. Wrap the calling script in: flock /tmp/inkrunner-browser.lock node tools/routes/<route>.mjs
//
// Autoplay routes with REAL input (N16, brief section 8 "Every scroll can be beaten"). The page is loaded with
// ?play=<char>&level=<id> (the debug start; no other debug flag, nothing in the game is changed or teleported),
// then a plan of steps keyed by the traveler's x is played with the real mouse and keyboard at 1600x900
// (device 'desktop') or real touch on an iPhone 13 in landscape (device 'phone': the 跳 button and the ink stones
// are tapped, strokes are one finger). Screenshots are never taken while a finger is down.
//
// A plan is an array of steps, run in order; each waits until the traveler's x >= `at`:
//   { at, jump: 450 }                         hold jump this many ms (Space, or the 跳 button on a phone)
//   { at, ink: 'shu' }                        select an ink (key 1-4, or tap its stone)
//   { at, ink: 'shu', paint: pts, dur: 0 }    paint world points [{ x, y }] (select `ink` first if given);
//                                             `dur` (ms) paces the stroke like a hand (default: as fast as input goes)
//   { at, ring: [cx, cy, r, aimDeg?], ink }   paint a ring (ink defaults to 'murasaki'): see ring() below
//   { at, wait: 300 }                         just wait (ms)
// Points are world coordinates; they are placed on the glass with the camera at brush-down, and the hand then
// follows the glass (the game holds the camera still under the brush), exactly as a player's hand does.
//
// Helpers: line(x0, y0, x1, y1, n) a gently arched line; zig(x0, x1, y0, y1, n) a zigzag (gold scribbles);
// ring(cx, cy, r, aimDeg?, opts?) a 330° arc plus a 40° closing overlap (it crosses itself, so the game's ring
// tracker closes it), with an optional tail flicked toward aimDeg (0 = right, -90 = up) that aims the spout.
import { mkdirSync } from 'node:fs';
import puppeteer, { KnownDevices } from 'puppeteer-core';

export const URL_DEFAULT = process.env.URL ?? 'http://localhost:5173/';
const INK_ORDER = ['shu', 'ai', 'kin', 'murasaki'];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** A gently arched line from (x0, y0) to (x1, y1) in n segments (the arch lifts the middle 18 u). */
export const line = (x0, y0, x1, y1, n = 20) =>
  Array.from({ length: n + 1 }, (_, i) => ({ x: x0 + ((x1 - x0) * i) / n, y: y0 + ((y1 - y0) * i) / n + Math.sin((i / n) * Math.PI) * -18 }));

/** A zigzag between x0 and x1 going from y0 to y1 (n strokes). */
export const zig = (x0, x1, y0, y1, n = 4) => Array.from({ length: n + 1 }, (_, i) => ({ x: i % 2 ? x1 : x0, y: y0 + ((y1 - y0) * i) / n }));

/**
 * A ring for the portal gesture: a 330° arc and a 40° closing overlap (370° in all, so it crosses its own start),
 * then, if `aimDeg` is given, a tail flicked out toward it (its tip `tail` u beyond the rim, so the spout points
 * there). Without aimDeg the loop starts and ends at the top and the spout is the default (straight ahead).
 */
export function ring(cx, cy, r, aimDeg = null, { tail = 70, step = 12, overlap = 40 } = {}) {
  const sweep = 330 + overlap;
  const end = aimDeg === null ? 270 + overlap : aimDeg;
  const a0 = end - sweep;
  const n = Math.ceil(sweep / step);
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + (sweep * i) / n) * Math.PI) / 180;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  if (aimDeg !== null) {
    const last = pts[pts.length - 1];
    const t = (aimDeg * Math.PI) / 180;
    const tip = { x: cx + Math.cos(t) * (r + tail), y: cy + Math.sin(t) * (r + tail) };
    for (let i = 1; i <= 6; i++) pts.push({ x: last.x + ((tip.x - last.x) * i) / 6, y: last.y + ((tip.y - last.y) * i) / 6 });
  }
  return pts;
}

/** Launch the one headless browser this machine allows (callers hold the flock). */
export function launch() {
  return puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: 'new',
    args: ['--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  });
}

/**
 * Play one route. Returns { finished, grade ('松' | '竹' | '梅' | null), gradeName, time, falls, ink, strokes,
 * steps (done / total), log, errors }. `browser` may be shared across runs; otherwise one is launched and closed.
 */
export async function runRoute({ level, char = 'ren', device = 'desktop', plan, url = URL_DEFAULT, timeout = 200000, browser = null, verbose = false, shot = null }) {
  const own = !browser;
  browser ??= await launch();
  const page = await browser.newPage();
  const phone = device === 'phone';
  const log = [];
  const say = (m) => {
    log.push(m);
    if (verbose) console.log(m);
  };
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.stack ?? String(e)));
  try {
    if (phone) await page.emulate(KnownDevices['iPhone 13 landscape']);
    else await page.setViewport({ width: 1600, height: 900 });
    const G = (fn, ...a) => page.evaluate(fn, ...a);
    /** load the scroll; a marker on window tells us later if the dev server reloaded the page under us */
    const load = async () => {
      await page.goto(`${url}?play=${encodeURIComponent(char)}&level=${encodeURIComponent(level)}`, { waitUntil: 'load' });
      await page.waitForFunction((id) => window.__game?.state === 'play' && window.__game.level.id === id, { timeout: 30000 }, level);
      await page.waitForFunction(() => window.__game.introT >= 1.5, { timeout: 20000 });
      await G(() => (window.__route = true));
    };
    await load();
    let reloads = 0;

    /** world points → client CSS pixels with the live camera */
    const toClient = (pts) =>
      G((pts) => {
        const g = window.__game;
        const r = g.canvas.getBoundingClientRect();
        return pts.map((p) => ({ x: r.left + (((p.x - g.camCX) * g.S + g.W / 2) * r.width) / g.W, y: r.top + (((p.y - g.camCY) * g.S + g.H / 2) * r.height) / g.H }));
      }, pts);

    const selectInk = async (ink) => {
      const now = await G(() => window.__game.ink);
      if (now === ink) return;
      if (!phone) {
        await page.keyboard.press(`Digit${INK_ORDER.indexOf(ink) + 1}`);
        return;
      }
      const pos = await G((ink) => {
        const g = window.__game;
        const s = g.stoneLayout().find((q) => q.k === ink);
        if (!s) return null;
        const r = g.canvas.getBoundingClientRect();
        return { x: r.left + (s.x * r.width) / g.W, y: r.top + (s.y * r.height) / g.H };
      }, ink);
      if (!pos) throw new Error(`ink ${ink} is not offered on ${level}`);
      await page.touchscreen.tap(pos.x, pos.y);
      await wait(40);
    };

    const jump = async (ms) => {
      if (!phone) {
        await page.keyboard.down('Space');
        await wait(ms);
        await page.keyboard.up('Space');
        return;
      }
      const box = await (await page.$('#jump')).boundingBox();
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.touchscreen.touchStart(x, y);
      await wait(ms);
      await page.touchscreen.touchEnd();
    };

    const paint = async (world, dur = 0) => {
      const client = await toClient(world);
      const t0 = Date.now();
      const a = client[0];
      if (phone) await page.touchscreen.touchStart(a.x, a.y);
      else {
        await page.mouse.move(a.x, a.y);
        await page.mouse.down();
      }
      for (let i = 1; i < client.length; i++) {
        const q = client[i];
        if (phone) await page.touchscreen.touchMove(q.x, q.y);
        else await page.mouse.move(q.x, q.y, { steps: 2 });
        const due = t0 + (dur * i) / (client.length - 1) - Date.now();
        if (due > 0) await wait(due);
      }
      if (phone) await page.touchscreen.touchEnd();
      else await page.mouse.up();
    };

    let t0 = Date.now();
    let i = 0;
    let st = null;
    while (Date.now() - t0 < timeout) {
      st = await G(() => (window.__route && window.__game ? { x: window.__game.px, state: window.__game.state, falls: window.__game.stats.falls } : null)).catch(() => null);
      if (!st) {
        // the dev server reloaded the page (another agent saved a file): this run is void, start it again
        if (++reloads > 4) throw new Error('the page kept reloading');
        say(`(page reloaded by the dev server: run restarted)`);
        await wait(1500);
        await load();
        i = 0;
        t0 = Date.now();
        continue;
      }
      if (st.state === 'finish') break;
      const step = plan[i];
      if (step && st.state === 'play' && st.x >= step.at) {
        if (step.jump) await jump(step.jump === true ? 450 : step.jump);
        else if (step.ring) {
          await selectInk(step.ink ?? 'murasaki');
          const [cx, cy, r, aim] = step.ring;
          await paint(ring(cx, cy, r, aim ?? null), step.dur ?? 0);
        } else if (step.paint) {
          if (step.ink) await selectInk(step.ink);
          await paint(step.paint, step.dur ?? 0);
        } else if (step.ink) await selectInk(step.ink);
        else if (step.wait) await wait(step.wait);
        // the ink left and the last ring verdict show whether a stalled line ran dry or drew a ring that did not take
        const after = verbose ? await G(() => ({ ink: window.__game.inkAmt, ev: window.__game.portals.events.filter((e) => e.kind === 'snap' || e.kind === 'fizzle' || e.kind === 'ring').at(-1) })) : null;
        say(`step ${i} @${step.at}: at x ${Math.round(st.x)} falls ${st.falls}${after ? ` ink ${Math.round(after.ink)}${after.ev ? ` last ${after.ev.kind}${after.ev.fail ? ' ' + after.ev.fail : ''}` : ''}` : ''}`);
        i++;
        continue;
      }
      await wait(25);
    }
    const res = await G(() => {
      const g = window.__game;
      return { state: g.state, grade: g.state === 'finish' ? g.grade() : null, time: g.stats.time, falls: g.stats.falls, ink: g.stats.ink, strokes: g.stats.strokes, par: [g.level.parTime, g.level.parInk] };
    });
    if (shot) {
      await wait(1500);
      await page.screenshot({ path: shot });
    }
    const names = { 松: 'Pine', 竹: 'Bamboo', 梅: 'Plum' };
    return { finished: res.state === 'finish', grade: res.grade, gradeName: res.grade ? names[res.grade] : null, time: res.time, falls: res.falls, ink: res.ink, strokes: res.strokes, par: res.par, steps: `${i}/${plan.length}`, reloads, log, errors };
  } finally {
    await page.close().catch(() => {});
    if (own) await browser.close();
  }
}

/** Bamboo or better. */
export const bambooOrBetter = (r) => r.finished && (r.grade === '竹' || r.grade === '松');

/**
 * Run a route `runs` times on each device and print one line per run; returns true when every run finished at
 * Bamboo or better. Used by the per-scroll route scripts.
 */
export async function proveRoute({ name, level, char = 'ren', plan, devices = ['desktop', 'phone'], runs = 3, verbose = false }) {
  const browser = await launch();
  let ok = true;
  try {
    for (const device of devices) {
      for (let k = 1; k <= runs; k++) {
        mkdirSync('shots/rough/routes', { recursive: true });
        const r = await runRoute({ level, char, device, plan, browser, verbose, shot: `shots/rough/routes/${name}-${device}-${k}.png` });
        const pass = bambooOrBetter(r);
        ok &&= pass;
        console.log(`${pass ? 'PASS' : 'FAIL'} ${name} ${device} run ${k}/${runs}: ${r.finished ? 'finished' : 'DID NOT FINISH'} grade ${r.gradeName ?? '-'} time ${r.time.toFixed(1)}s (par ${r.par[0].toFixed(1)}) falls ${r.falls} ink ${r.ink.toFixed(0)} (par ${r.par[1]}) steps ${r.steps}`);
        if (r.errors.length) console.log('  page errors:\n  ' + r.errors.join('\n  '));
        if (!pass && !verbose) console.log('  ' + r.log.join('\n  '));
      }
    }
  } finally {
    await browser.close();
  }
  console.log(ok ? `ALL PASS: ${name} finished ${runs} of ${runs} at Bamboo or better on ${devices.join(' and ')}` : `FAIL: ${name}`);
  return ok;
}
