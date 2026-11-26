// Usage: flock /tmp/inkrunner-browser.lock node tools/proofs/rain.mjs [desktop|phone|both] [outdir]
//   env: URL (default http://127.0.0.1:5185/), CHAR (ren|kohaku, default ren), LOOK=0 skips the look captures
//
// Proof assertions for rain (docs/summer-design.md section 2, brief section 8 "Rain warning"). Real input only:
// mouse and keyboard at 1600x900, then touch on an iPhone 13 in landscape. Each scenario restarts the rain proof
// page (?proof=rain) at a named station and paints with the real pointer. Prints PASS/FAIL per assertion and
// exits 1 if any fails.
//
// The page is observed, never changed: a wrapper around Game.render() records, after each real frame, which
// strokes are present and which wash stage they are drawn in (it only reads; nothing drawn changes). Stage times
// also come from the game's own per-stroke records (game.rain.log). Captures go to shots/proofs/rain/ unless an
// outdir is given; screenshots are never taken while a finger is down.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import puppeteer, { KnownDevices } from 'puppeteer-core';

const URL = process.env.URL ?? 'http://127.0.0.1:5185/';
const CHAR = process.env.CHAR ?? 'ren';
const which = process.argv[2] ?? 'both';
const out = process.argv[3] ?? 'shots/proofs/rain';
const LOOK = process.env.LOOK !== '0';
mkdirSync(out, { recursive: true });
for (const f of readdirSync(out)) if (/^strip-\d+\.(png|jpg)$/.test(f)) rmSync(`${out}/${f}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
let mode = '';
const check = (ok, what) => {
  results.push({ ok: !!ok, what: `[${mode}] ${what}` });
  console.log(`${ok ? 'PASS' : 'FAIL'} [${mode}] ${what}`);
};

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  headless: 'new',
  args: ['--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});

/** One page per input mode. Returns helpers bound to it. */
async function open(phone) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.stack ?? String(e)));
  if (phone) await page.emulate(KnownDevices['iPhone 13 landscape']);
  else await page.setViewport({ width: 1600, height: 900 });
  const G = (fn, ...a) => page.evaluate(fn, ...a);

  /** Load a URL and install the read-only frame observer. */
  const load = async (q) => {
    await page.goto(URL + q, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__game?.state === 'play', { timeout: 20000 });
    await G(() => {
      const g = window.__game;
      if (g.__rainObs) return;
      const obs = (window.__obs = { map: new Map(), expected: new Set(), frames: 0 });
      const render = g.render.bind(g);
      g.__rainObs = true;
      g.render = () => {
        render();
        obs.frames++;
        // the frame the traveler starts to die, and the first frame back in play
        if (g.state === 'dying' && obs.lastState === 'play') obs.dying = { ink: g.inkAmt, t: g.t };
        if (g.state === 'play' && obs.lastState === 'dying') obs.respawned = { ink: g.inkAmt, max: g.inkMax, px: g.px, t: g.t };
        obs.lastState = g.state;
        const now = performance.now() / 1000;
        const present = new Set(g.strokes);
        for (const st of g.strokes) {
          if (!obs.map.has(st)) obs.map.set(st, { kind: st.kind, seenWall: now, firstRunning: undefined, absent: undefined, stage: 'dry', runFrames: 0 });
        }
        for (const [st, o] of obs.map) {
          if (o.absent !== undefined) continue;
          if (present.has(st)) {
            const s = g.rain.stageOf(st).stage;
            o.stage = s;
            if (s === 'running') {
              o.runFrames++;
              if (o.firstRunning === undefined) o.firstRunning = now;
            }
          } else {
            o.absent = now;
            o.stageAtAbsent = o.stage;
          }
        }
      };
    });
  };

  /** (Re)start the rain proof at a station, wait for the intro to finish. */
  const station = async (id, extra = '') => {
    await load(`?proof=rain&play=${CHAR}&station=${id}${extra}`);
    await G(() => {
      window.__obs.map.clear();
      window.__obs.expected.clear();
      window.__obs.dying = window.__obs.respawned = undefined;
    });
    await page.waitForFunction(() => window.__game.introT >= 1.5, { timeout: 10000 });
  };

  /** World → CSS pixel position on screen, from the live camera. */
  const toScreen = (pts) =>
    G((pts) => {
      const g = window.__game;
      const r = g.canvas.getBoundingClientRect();
      const camL = g.camCX - g.W / (2 * g.S);
      const camT = g.camCY - g.H / (2 * g.S);
      return pts.map((p) => ({ x: r.left + ((p.x - camL) * g.S * r.width) / g.W, y: r.top + ((p.y - camT) * g.S * r.height) / g.H }));
    }, pts);

  const stones = () =>
    G(() => {
      const g = window.__game;
      const r = g.canvas.getBoundingClientRect();
      return g.stoneLayout().map((s) => ({ k: s.k, x: r.left + (s.x * r.width) / g.W, y: r.top + (s.y * r.height) / g.H }));
    });

  /** Pick an ink the way a player would: tap its stone on a phone, number key on desktop. */
  const choose = async (k) => {
    if ((await G(() => window.__game.ink)) === k) return;
    if (phone) {
      const s = (await stones()).find((s) => s.k === k);
      await page.touchscreen.tap(s.x, s.y);
    } else await page.keyboard.press(`Digit${['shu', 'ai', 'kin', 'murasaki'].indexOf(k) + 1}`);
    await wait(40);
  };

  /** Paint a world-space polyline with the real pointer. Returns the new stroke's record id. */
  const paint = async (ink, world) => {
    await choose(ink);
    const before = await G(() => window.__game.rain.log.length);
    const dense = [];
    for (let i = 0; i < world.length - 1; i++) {
      const a = world[i];
      const b = world[i + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 30));
      for (let k = 0; k < n; k++) dense.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
    }
    dense.push(world[world.length - 1]);
    const pts = await toScreen(dense);
    const [a, ...rest] = pts;
    if (phone) {
      await page.touchscreen.touchStart(a.x, a.y);
      for (const p of rest) await page.touchscreen.touchMove(p.x, p.y);
      await page.touchscreen.touchEnd();
    } else {
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      for (const p of rest) await page.mouse.move(p.x, p.y, { steps: 2 });
      await page.mouse.up();
    }
    await page.waitForFunction((n) => window.__game.rain.log.length > n, { timeout: 3000 }, before).catch(() => {});
    return G(() => {
      const l = window.__game.rain.log;
      return l.length ? l[l.length - 1].id : -1;
    });
  };

  const rec = (id) => G((id) => window.__game.rain.log.find((r) => r.id === id) ?? null, id);
  const strokeIds = () => G(() => window.__game.strokes.map((s) => window.__game.rain.recordOf(s)?.id ?? -1));
  /** Observer summary per record id (wall-clock seconds). */
  const observed = () =>
    G(() => {
      const g = window.__game;
      const o = [];
      for (const [st, v] of window.__obs.map) {
        const r = g.rain.recordOf(st);
        o.push({ id: r?.id ?? -1, kind: v.kind, inRain: st.inRain, expected: window.__obs.expected.has(st), firstRunning: v.firstRunning, absent: v.absent, stageAtAbsent: v.stageAtAbsent, runFrames: v.runFrames });
      }
      return o;
    });
  /** Mark a stroke the test is about to remove itself (undo), so the warning check skips it. */
  const expectRemoval = (id) => G((id) => {
    const g = window.__game;
    const st = g.strokes.find((s) => g.rain.recordOf(s)?.id === id);
    if (st) window.__obs.expected.add(st);
  }, id);
  const waitFor = (fn, arg, timeout = 8000) => page.waitForFunction(fn, { timeout, polling: 'raf' }, arg);

  return { page, G, load, station, toScreen, paint, rec, strokeIds, observed, expectRemoval, waitFor, errors, choose, phone };
}

// ─────────────────────────────────────────────────────────────── scenarios

const allObserved = [];
const keep = async (t) => allObserved.push(...(await t.observed()));
const pxAtLeast = (t, x, timeout = 9000) => t.waitFor((x) => window.__game.px >= x || window.__game.state === 'dying', x, timeout);
const bridge = (x0, x1, y = 548) => [{ x: x0, y }, { x: (x0 + x1) / 2, y: y + 2 }, { x: x1, y }];

/** Existing scrolls stay dry: rules.rain is false everywhere, and vermilion lasts on the First Scroll. */
async function dryScrolls(t) {
  await t.load(`?play=${CHAR}&level=first`);
  const all = await t.G(async () => {
    const { levelList } = await import('/src/levels.ts');
    const { campaignLevels } = await import('/src/campaign/registry.ts');
    const row = (i, free) => {
      const L = i.build();
      return { id: L.id, free, rain: L.rules.rain, zones: (L.rainZones ?? []).length };
    };
    return [...levelList().map((i) => row(i, true)), ...campaignLevels().map((i) => row(i, false))];
  });
  const free = all.filter((r) => r.free);
  check(free.length >= 3 && free.every((r) => r.rain === false && r.zones === 0), `existing scrolls are dry: ${free.map((r) => `${r.id}=${JSON.stringify(r.rain)}`).join(', ')}`);
  console.log(`  info: campaign scrolls ${all.filter((r) => !r.free).map((r) => `${r.id}=${r.rain ? 'rain' : 'dry'}`).join(', ')}`);
  await t.page.waitForFunction(() => window.__game.introT >= 1.5, { timeout: 10000 });
  await wait(300);
  const a = await t.paint('shu', [{ x: 700, y: 330 }, { x: 900, y: 320 }, { x: 1050, y: 340 }]);
  const b = await t.paint('shu', [{ x: 760, y: 430 }, { x: 980, y: 440 }]);
  await wait(3200); // longer than any wash clock
  const ids = await t.strokeIds();
  const recs = [await t.rec(a), await t.rec(b)];
  const st = await t.G(() => ({ rain: window.__game.rules.rain, look: window.__game.rain.lookK, inRain: window.__game.rain.travelerInRain }));
  check(
    st.rain === false && st.look === 0 && !st.inRain && ids.includes(a) && ids.includes(b) && recs.every((r) => r && !r.inRain && r.runT === undefined),
    `First Scroll: rules.rain false, no rain drawn, two vermilion strokes still there after 3.2 s, never washing`,
  );
  await keep(t);
}

/** A stroke painted outside the rain stays dry forever, even after the traveler carries on into the rain. */
async function carried(t) {
  await t.station('dry');
  await pxAtLeast(t, 700);
  const id = await t.paint('shu', bridge(1070, 1430));
  await pxAtLeast(t, 1950, 12000);
  const inRainNow = await t.G(() => window.__game.rain.travelerInRain);
  const falls = await t.G(() => window.__game.stats.falls);
  await wait(2200);
  const r = await t.rec(id);
  const ids = await t.strokeIds();
  const o = (await t.observed()).find((x) => x.id === id);
  check(inRainNow && r && !r.inRain && ids.includes(id) && r.runT === undefined && o && o.firstRunning === undefined && falls === 0,
    `dry bridge (painted outside rain) carried the traveler, who ran on into rain; 2.2 s later it is still there and never ran (falls ${falls})`);
  await keep(t);
}

/** The headline: a vermilion bridge under the traveler shows its warning for >= 1.0 s, then goes; then death. */
async function under(t, strip) {
  await t.station('under');
  const id = await t.paint('shu', bridge(2290, 3010));
  // a second, longer rain stroke up in the air: its clock must run on through the death, and the ink it costs
  // leaves the inkwell short of full when the traveler falls, so the respawn refill is visible
  const extra = await t.paint('shu', [{ x: 2450, y: 260 }, { x: 2900, y: 250 }, { x: 2450, y: 200 }]);
  const extraBorn = (await t.rec(extra))?.bornT;
  await t.waitFor((id) => window.__game.rain.log.find((r) => r.id === id)?.runT !== undefined, id);
  const frames = [];
  if (strip) {
    // a frame strip of the stroke washing away (mouse is up; never mid-touch)
    // fast half-size JPEG grabs of the band around the bridge, until a few frames after it has gone
    const cdp = await t.page.createCDPSession();
    let after = 0;
    for (let i = 0; i < 40 && after < 3; i++) {
      const path = `${out}/strip-${String(i).padStart(2, '0')}.jpg`;
      const shot = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 85, clip: { x: 0, y: 300, width: 1600, height: 420, scale: 0.5 } });
      writeFileSync(path, Buffer.from(shot.data, 'base64'));
      frames.push(path);
      if (await t.G((id) => window.__game.rain.log.find((r) => r.id === id)?.goneT !== undefined, id)) after++;
      await wait(40);
    }
    await cdp.detach();
  }
  await t.waitFor((id) => window.__game.rain.log.find((r) => r.id === id)?.goneT !== undefined, id);
  const r = await t.rec(id);
  const visible = r.goneWall - r.firstWarnWall;
  check(r.inRain && r.underAtRun !== undefined, `bridge in rain: wet ${(r.runT - r.bornT).toFixed(2)} s, then running`);
  check(r.underAtGone && r.underWarn >= 0.5 && visible >= 1.0 && r.warnFrames >= 20,
    `bridge under the traveler: warning drawn for ${visible.toFixed(2)} s (${r.warnFrames} frames) before it went, traveler on it for ${r.underWarn.toFixed(2)} s of that, on it when it went: ${r.underAtGone}`);
  // death: the traveler drops with the bridge, respawns at the lantern with a full inkwell
  await t.waitFor(() => !!window.__obs.respawned, null, 8000);
  const { dying, respawned: back } = await t.G(() => window.__obs);
  back.falls = await t.G(() => window.__game.stats.falls);
  const ids = await t.strokeIds();
  check(dying && back.falls >= 1 && Math.abs(back.px - 1510) < 2 && dying.ink < back.max - 1 && back.ink >= back.max - 0.01,
    `death: fell with the bridge, respawned at the lantern (x ${back.px.toFixed(0)}) with a full inkwell (${dying.ink.toFixed(0)} → ${back.ink.toFixed(0)}/${back.max.toFixed(0)})`);
  await t.waitFor((id) => window.__game.rain.log.find((r) => r.id === id)?.goneT !== undefined, extra, 4000).catch(() => {});
  const e = await t.rec(extra);
  const clock = await t.G(() => window.__game.rules.rain);
  const lived = e?.goneT !== undefined ? e.goneT - e.bornT : NaN;
  check(!ids.includes(id) && e && e.bornT === extraBorn && Math.abs(lived - (clock.hold + clock.warn)) < 0.15 && e.goneWall - e.firstWarnWall >= 1.0,
    `after death: the washed bridge stays gone; another rain stroke kept its clock through the death (gone ${lived.toFixed(2)} s after lift, clock ${clock.hold}+${clock.warn})`);
  await keep(t);
  return frames;
}

/** Indigo, gold and purple in rain are never touched; rain doesn't put out the blot's fire. */
async function others(t) {
  await t.station('others');
  const ai = await t.paint('ai', [{ x: 3150, y: 300 }, { x: 3300, y: 285 }, { x: 3450, y: 295 }]);
  const kin = await t.paint('kin', [{ x: 3480, y: 250 }, { x: 3560, y: 330 }, { x: 3640, y: 260 }]);
  const ring = [];
  for (let i = 0; i <= 26; i++) {
    const a = (i / 24) * Math.PI * 2;
    ring.push({ x: 3760 + Math.cos(a) * 55, y: 300 + Math.sin(a) * 55 });
  }
  const mu = await t.paint('murasaki', ring);
  await wait(2700);
  const ids = await t.strokeIds();
  const recs = await Promise.all([ai, kin, mu].map((i) => t.rec(i)));
  const obs = await t.observed();
  const fire = await t.G(() => window.__game.level.fires[0].alive);
  const ok = [ai, kin, mu].every((i, k) => ids.includes(i) && recs[k] && !recs[k].inRain && recs[k].runT === undefined && obs.find((o) => o.id === i)?.firstRunning === undefined);
  check(ok && recs.map((r) => r.kind).join(',') === 'ai,kin,murasaki', `indigo, gold and purple painted in rain are all still there 2.7 s later, never washing`);
  check(fire, 'the blot fire in rain is still burning (rain hisses on it, never puts it out)');
  await keep(t);
}

/** Undo a running bridge: the usual half refund, and the record says it was running. */
async function undo(t) {
  await t.station('undo');
  // long enough (about 70 ink) that the inkwell is well short of full when it is undone
  const id = await t.paint('shu', [{ x: 4620, y: 420 }, { x: 5100, y: 390 }, { x: 4700, y: 330 }, { x: 5100, y: 300 }]);
  await t.waitFor((id) => window.__game.rain.log.find((r) => r.id === id)?.runT !== undefined, id);
  await wait(250);
  await t.expectRemoval(id);
  const before = await t.G(() => ({ ink: window.__game.inkAmt, max: window.__game.inkMax }));
  if (t.phone) {
    await t.page.tap('#pause-button');
    await t.page.waitForSelector('#btn-undo:not([disabled])', { visible: true, timeout: 3000 });
    await t.page.tap('#btn-undo');
  } else {
    await t.page.mouse.click(1500, 160, { button: 'right' });
  }
  await t.waitFor((id) => !window.__game.strokes.some((s) => window.__game.rain.recordOf(s)?.id === id), id, 3000);
  const after = await t.G(() => window.__game.inkAmt);
  await t.waitFor((id) => !!window.__game.rain.log.find((r) => r.id === id)?.removed, id, 2000).catch(() => {});
  const r = await t.rec(id);
  const want = Math.min(before.max, before.ink + r.cost * 0.5);
  check(r.removed?.stage === 'running' && r.goneT === undefined && after < before.max - 0.5 && Math.abs(after - want) < 3,
    `undo while running (${t.phone ? 'pause → Undo' : 'right click'}): stroke removed, ink ${before.ink.toFixed(1)} → ${after.toFixed(1)}, refund ${(after - before.ink).toFixed(1)} ≈ half of ${r.cost.toFixed(1)}`);
  await keep(t);
}

/** A bridge over a gap that straddles the zone edge washes as one piece; a dry gap between zones holds. */
async function edges(t) {
  await t.station('straddle');
  const id = await t.paint('shu', bridge(6185, 6515));
  await pxAtLeast(t, 6560);
  const crossed = await t.G(() => ({ px: window.__game.px, falls: window.__game.stats.falls, state: window.__game.state }));
  await t.waitFor((id) => window.__game.rain.log.find((r) => r.id === id)?.goneT !== undefined, id);
  const r = await t.rec(id);
  check(r.inRain && r.x0 < 6350 && crossed.px >= 6560 && crossed.falls === 0 && r.goneWall - r.firstWarnWall >= 1.0,
    `bridge straddling the rain edge (x ${r.x0}..${r.x1}, rain from 6350) is in rain, carried the traveler across a 300 gap, then washed whole`);
  await keep(t);

  await t.station('eaves');
  await pxAtLeast(t, 5420);
  const dry = await t.paint('shu', bridge(5585, 6015));
  await pxAtLeast(t, 6050);
  const at = await t.G(() => ({ px: window.__game.px, falls: window.__game.stats.falls }));
  await wait(2200);
  const d = await t.rec(dry);
  const ids = await t.strokeIds();
  check(d && !d.inRain && at.px >= 6050 && at.falls === 0 && ids.includes(dry) && d.runT === undefined,
    'under the eaves (a dry gap between zones): the bridge carried the traveler and still holds 2.2 s later');
  await keep(t);
}

/** Over every scenario: nothing the rain removed went without at least 1.0 s of drawn warning. */
function noSilentVanish() {
  const gone = allObserved.filter((o) => o.absent !== undefined && !o.expected);
  const bad = gone.filter((o) => o.firstRunning === undefined || o.absent - o.firstRunning < 1.0 || o.runFrames < 20);
  const spans = gone.map((o) => (o.firstRunning === undefined ? 'none' : (o.absent - o.firstRunning).toFixed(2)));
  check(gone.length >= 2 && bad.length === 0,
    `no stroke vanished without warning: ${gone.length} strokes went, drawn warning before each (s): ${spans.join(', ')}; other removals were the test's own undo`);
}

// ─────────────────────────────────────────────────────────────── look captures

/** A dry and a rainy moment at the same spot, next to Alto's rain frames, plus the phone's rainy moment. */
async function look(t) {
  const ref = process.env.REF ?? 'shots/ref/alto';
  const shots = {};
  for (const [name, q] of [['dry', '&rain=0'], ['rain', '']]) {
    await t.station('under', `${q}&panel=0`);
    await wait(250);
    const id = await t.paint('shu', bridge(2290, 3010));
    if (name === 'rain') await t.waitFor((id) => {
      const r = window.__game.rain.log.find((r) => r.id === id);
      return r?.runT !== undefined && window.__game.t - r.runT > 0.45;
    }, id);
    else await wait(1150);
    shots[name] = `${out}/${t.phone ? 'phone' : 'desktop'}-${name}.png`;
    await t.page.screenshot({ path: shots[name] });
  }
  return shots;
}

function ffmpeg(args) {
  execFileSync('flock', ['/tmp/inkrunner-encode.lock', 'ffmpeg', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
}

function compose(shots, frames) {
  const ref = process.env.REF ?? 'shots/ref/alto';
  try {
    ffmpeg([
      '-i', shots.dry, '-i', shots.rain, '-i', `${ref}/frame-0600-rain-teal.png`, '-i', `${ref}/frame-4400-storm-temple-lanterns.png`,
      '-filter_complex',
      '[0]scale=960:540,setsar=1[a];[1]scale=960:540,setsar=1[b];[2]scale=960:540,setsar=1[c];[3]scale=960:540,setsar=1[d];[a][b][c][d]xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0',
      '-frames:v', '1', `${out}/look-compare.png`,
    ]);
    console.log(`  look: ${out}/look-compare.png (top: dry | rain, bottom: Alto rain-teal | Alto storm)`);
  } catch (e) {
    console.log(`  look: compose failed (${e.message}); set REF to the folder holding the Alto frames`);
  }
  if (frames.length) {
    const n = frames.length;
    const cols = 5;
    const rows = Math.ceil(n / cols);
    try {
      ffmpeg(['-framerate', '1', '-i', `${out}/strip-%02d.jpg`, '-vf', `tile=${cols}x${rows}:padding=4:color=white`, '-frames:v', '1', `${out}/strip.png`]);
      console.log(`  strip: ${out}/strip.png (${n} frames from the start of the warning until just after the bridge went, left to right then down)`);
    } catch (e) {
      console.log(`  strip: compose failed (${e.message})`);
    }
  }
}

// ─────────────────────────────────────────────────────────────── run

try {
  for (const phone of which === 'both' ? [false, true] : [which === 'phone']) {
    mode = phone ? 'phone' : 'desktop';
    allObserved.length = 0;
    const t = await open(phone);
    console.log(`── ${mode}: ${CHAR}, ${phone ? 'iPhone 13 landscape, touch' : '1600x900, mouse + keyboard'}`);
    await dryScrolls(t);
    await carried(t);
    const frames = await under(t, !phone);
    await others(t);
    await undo(t);
    await edges(t);
    noSilentVanish();
    if (LOOK) {
      const shots = await look(t);
      if (!phone) compose(shots, frames);
      else console.log(`  look: ${shots.rain}`);
    }
    check(t.errors.length === 0, `no page errors${t.errors.length ? ':\n' + t.errors.join('\n') : ''}`);
    await t.page.close();
  }
} catch (e) {
  check(false, `run aborted: ${e.stack ?? e}`);
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} PASS${failed.length ? `, ${failed.length} FAIL` : ''}`);
process.exit(failed.length ? 1 : 0);
