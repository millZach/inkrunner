// Usage: flock /tmp/inkrunner-browser.lock node tools/routes/summer-gate.mjs [desktop|phone|both] [runs=3]   (env URL, CHAR=ren|kohaku|both (default both), VERBOSE=1, SHOTS=dir)
//
// 門 summer-gate's autoplay route (N16; brief section 8 "Every scroll can be beaten"): the INTENDED line of
// docs/summer-design.md 3.5 and section 4, played with REAL input (mouse and keyboard at 1600x900, or one finger
// and tapped ink stones on an iPhone 13 in landscape), as Ren and as Kohaku. Passes when every run finishes at
// Bamboo or better; prints each run's grade, time, falls and ink. Exits 1 otherwise.
//
// The page is the real debug start (?play=<char>&level=summer-gate) and nothing in the game is changed: the route
// only reads the game's state (where the traveler is, which strikes are telegraphing, where Raijin is) to decide
// where a player's hand would paint, like a player watching the screen.
//
//   G1 the ridge gorge: a door at the lip, an exit in the air at the reach, then a vermilion bridge down to the
//      bank, painted while falling out of the exit.
//   P1 singles: a catch ring on the bolt's thread above head height, then a window aimed at him.
//   P2 pairs: one big ring (R 134) centred between the two threads catches both; one window. Bridges over the gaps.
//   P3 triplets (rain): a ring (R 100) between threads 1 and 2, a window, then a third ring on thread 3 once bolt 2
//      is through (the used entry closes, the window stays). Late bridges over the gaps (a rain bridge carries 672).
// Windows are placed where the hand can reach: on screen, inside the 650 reach, off every thread, clear of his
// storm (a ring on him sputters), above head height, and with a clear line to where he will be when the bolt
// comes out. The aim is a tail flicked toward him (lib.mjs ring()).
import { mkdirSync } from 'node:fs';
import { KnownDevices } from 'puppeteer-core';
import { bambooOrBetter, launch, line, URL_DEFAULT } from './lib.mjs';

const LEVEL = 'summer-gate';
const INK_ORDER = ['shu', 'ai', 'kin', 'murasaki'];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const which = process.argv[2] ?? 'both';
const RUNS = Number(process.argv[3] ?? 3);
const VERBOSE = process.env.VERBOSE === '1';
const SHOTS = process.env.SHOTS ?? null;
/** CAPTURE=<dir>: also save a frame of each beat and the game's full-scroll export (capture runs only: the screenshots
 *  take real time, so they are never used for the pass/fail runs) */
const CAPTURE = process.env.CAPTURE ?? null;
/** PERF=1: time the game's update+render (as tools/perf.mjs does: the wrappers only read the clock) through phase 3
 *  (rain, rings, triplet bolts and Raijin on screen together: the gate's busiest stretch, summer-design 2.4 and R9)
 *  under 4x CPU throttling, and print p50 / p95 / max against the 8 ms budget. Not a pass/fail run. */
const PERF = process.env.PERF === '1';

/** Ring sizes of the intended line (summer-design 3.5). */
const CATCH_R = { single: 50, pair: 134, triplet: 100 };
const THIRD_R = 50;
const WINDOW_R = 45;
/** a gap bridge is painted this far before the gap (dry), or lifted at gapEnd - 672 + LATE_MARGIN (rain) */
const DRY_LEAD = 330;
const RAIN_CARRY = 672;
const LATE_MARGIN = 70;

/**
 * The ring gesture as this route paints it: lib.mjs ring() (a loop that overlaps its start, then a tail flicked
 * toward aimDeg), but always begun at the top of the circle, coming in level from the left, and drawn clockwise
 * until it reaches the aim. The camera runs on until the brush touches, so the first point lands a few units off
 * along x; begun where the stroke runs level, that error lies along the stroke and never kinks the loop.
 */
export function topRing(cx, cy, r, aimDeg = null, { tail = 70, step = 12, lead = 30 } = {}) {
  const a0 = -90;
  let sweep = 400;
  if (aimDeg !== null) {
    sweep = aimDeg - a0;
    while (sweep < 350) sweep += 360;
    while (sweep >= 710) sweep -= 360;
  }
  const n = Math.ceil(sweep / step);
  const pts = [{ x: cx - lead, y: cy - r }];
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

// ───────────────────────────────────────────── reading the screen (in the page; read-only)

/** Everything the hand needs to know this instant. */
function readState() {
  const g = window.__game;
  if (!window.__route || !g) return null;
  const R = g.raijin;
  const def = g.level.raijin;
  const pi = R.phaseIndex();
  const viewW = g.W / g.S;
  return {
    px: g.px,
    py: g.py,
    state: g.state,
    falls: g.stats.falls,
    ink: g.inkAmt,
    inkKind: g.ink,
    painting: g.painting,
    cam: { x: g.camCX, y: g.camCY, left: g.camCX - viewW / 2, right: g.camCX + viewW / 2, top: g.camCY - g.H / g.S / 2 },
    gy: def.groundY,
    speed: g.level.rules.runSpeed,
    pi,
    phase: pi >= 0 ? { n: def.phases[pi].n, x0: def.phases[pi].x0, length: def.phases[pi].length, pattern: def.phases[pi].pattern } : null,
    cleared: [...R.cleared],
    cleaned: R.cleaned,
    wraps: R.wraps,
    finale: R.finT0 >= 0,
    torii: g.level.torii.x,
    raijin: { x: R.x, y: R.y, active: R.active() },
    strikes: R.strikes
      .filter((s) => s.state === 'tele' || s.state === 'drop')
      .map((s) => ({ id: s.id, key: `${s.id}:${s.t0.toFixed(3)}`, state: s.state, mark: s.mark, el: s.el, tele: s.def.tele, group: s.def.group, idx: s.def.idx, n: s.phase.n })),
    rings: g.portals.playerRings().map((r) => ({ id: r.id, cx: r.cx, cy: r.cy, r: r.r, state: r.state })),
  };
}

/**
 * Choose a window: on screen, inside the reach of the catch ring(s), off every thread, clear of Raijin now and
 * while it is painted, above head height, and with a clear straight line (no other ring's capture disc on it) to
 * where he will be as each bolt comes out. Returns the centre and the aim (degrees) or null.
 */
function chooseWindow(a) {
  const g = window.__game;
  const R = g.raijin;
  const gy = g.level.raijin.groundY;
  const speed = g.level.rules.runSpeed;
  const viewW = g.W / g.S;
  const viewH = g.H / g.S;
  const left = g.camCX - viewW / 2;
  const right = g.camCX + viewW / 2;
  const top = g.camCY - viewH / 2;
  const span = g.rules.portalSpan;
  const preds = a.exits.map((t) => R.predict(speed * t.dg, t.dr));
  // where he is while the window is painted (slow motion: the camera creeps, his sway and bob run in real time)
  const soon = Array.from({ length: 9 }, (_, k) => (k / 8) * (a.paintT ?? 1.2)).map((dr) => R.predict(speed * 0.13 * dr, dr));
  const aimAt = { x: preds.reduce((s, p) => s + p.x, 0) / preds.length, y: preds.reduce((s, p) => s + p.y, 0) / preds.length };
  const segDist = (p, q, c) => {
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((c.x - p.x) * dx + (c.y - p.y) * dy) / L2));
    return Math.hypot(p.x + dx * t - c.x, p.y + dy * t - c.y);
  };
  const W = a.r;
  let best = null;
  const why = { thread: 0, ring: 0, him: 0, dist: 0, line: 0 };
  for (let cx = Math.max(left + W + 40, g.px - 150); cx <= right - W - 50; cx += 12) {
    for (let cy = top + W + 45; cy <= gy - 85 - W; cy += 12) {
      if (a.marks.some((m) => Math.abs(cx - m) < W + 34)) {
        why.thread++;
        continue;
      }
      let ok = true;
      for (const o of a.others) {
        const d = Math.hypot(cx - o.x, cy - o.y);
        if (d < o.r + W + 14 || d > span - 15) ok = false;
      }
      if (!ok) {
        why.ring++;
        continue;
      }
      if (soon.some((p) => Math.hypot(cx - p.x, cy - p.y) < 135)) {
        why.him++;
        continue;
      }
      const d = Math.hypot(aimAt.x - cx, aimAt.y - cy);
      if (d < 170 || d > 800) {
        why.dist++;
        continue;
      }
      // the whole gesture (the rim and the flicked tail) must land on the canvas, clear of the controls
      const aimR = Math.atan2(aimAt.y - cy, aimAt.x - cx);
      const rim = Array.from({ length: 10 }, (_, k) => ({ x: cx + Math.cos((k / 10) * Math.PI * 2) * (W + 10), y: cy + Math.sin((k / 10) * Math.PI * 2) * (W + 10) }));
      rim.push({ x: cx + Math.cos(aimR) * (W + 75), y: cy + Math.sin(aimR) * (W + 75) });
      if (!window.__touchable(rim)) {
        why.hud = (why.hud ?? 0) + 1;
        continue;
      }
      // the bolt leaves 0.25 R out along the spout; the line to each predicted position must miss every other disc
      for (const p of preds) for (const o of a.others) if (segDist({ x: cx, y: cy }, p, o) < 0.8 * o.r + 26) ok = false;
      if (!ok) {
        why.line++;
        continue;
      }
      const score = Math.abs(d - 380) + 0.25 * Math.abs(cy - aimAt.y) + 0.15 * Math.abs(cx - (g.px + 250));
      if (!best || score < best.score) best = { x: cx, y: cy, score, d };
    }
  }
  if (!best) return { none: true, why, aimAt: { x: Math.round(aimAt.x), y: Math.round(aimAt.y) }, him: { x: Math.round(R.x), y: Math.round(R.y) }, view: [Math.round(left), Math.round(top), Math.round(right)] };
  const aim = (Math.atan2(aimAt.y - best.y, aimAt.x - best.x) * 180) / Math.PI;
  return { x: Math.round(best.x), y: Math.round(best.y), r: W, aim: Math.round(aim), aimAt: { x: Math.round(aimAt.x), y: Math.round(aimAt.y) }, d: Math.round(best.d) };
}

/**
 * Can a hand paint here: does every point land on the game canvas (not on the 跳 button, the pause button or any
 * other control over it) and off the ink stones? A stroke that starts on a control never reaches the canvas.
 */
function touchable(pts) {
  const g = window.__game;
  const r = g.canvas.getBoundingClientRect();
  return pts.every((p) => {
    const sx = (p.x - g.camCX) * g.S + g.W / 2;
    const sy = (p.y - g.camCY) * g.S + g.H / 2;
    const cx = r.left + (sx * r.width) / g.W;
    const cy = r.top + (sy * r.height) / g.H;
    if (cx < r.left + 4 || cy < r.top + 4 || cx > r.right - 4 || cy > r.bottom - 4) return false;
    const el = document.elementFromPoint(cx, cy);
    return el === g.canvas && !g.stoneAt(sx, sy);
  });
}

/** Is a ring centre at (x, y) clear of his storm (it sputters within 105 u) now and for the next moment? */
function clearOfHim(c) {
  const R = window.__game.raijin;
  const sp = window.__game.level.rules.runSpeed;
  // over the time the ring takes to paint (slow motion: the camera creeps, he sways and bobs in real time)
  return Array.from({ length: 9 }, (_, k) => (k / 8) * (c.paintT ?? 1.2)).every((dr) => {
    const p = R.predict(sp * 0.13 * dr, dr);
    return Math.hypot(p.x - c.x, p.y - c.y) > c.margin;
  });
}

// ───────────────────────────────────────────── one run

export async function runGate({ browser, char, device, shot }) {
  const page = await browser.newPage();
  const phone = device === 'phone';
  const log = [];
  const t00 = Date.now();
  const say = (m) => {
    const line = `  [${((Date.now() - t00) / 1000).toFixed(1).padStart(5)}s] ${m}`;
    log.push(line);
    if (VERBOSE) console.log(line);
  };
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.stack ?? String(e)));
  const G = (fn, ...a) => page.evaluate(fn, ...a);
  try {
    if (phone) await page.emulate(KnownDevices['iPhone 13 landscape']);
    else await page.setViewport({ width: 1600, height: 900 });
    await page.goto(`${URL_DEFAULT}?play=${encodeURIComponent(char)}&level=${LEVEL}`, { waitUntil: 'load' });
    await page.waitForFunction((id) => window.__game?.state === 'play' && window.__game.level.id === id, { timeout: 30000 }, LEVEL);
    await page.waitForFunction(() => window.__game.introT >= 1.5, { timeout: 20000 });
    await G(() => (window.__route = true));
    if (PERF)
      await G(() => {
        const g = window.__game;
        const upd = g.update.bind(g);
        const ren = g.render.bind(g);
        const st = (window.__perf = { on: false, u: 0, frames: [] });
        g.update = (dt) => {
          const t0 = performance.now();
          upd(dt);
          st.u = performance.now() - t0;
        };
        g.render = () => {
          const t0 = performance.now();
          ren();
          if (st.on) st.frames.push(st.u + performance.now() - t0);
        };
      });
    let cdp = null;
    let perfDone = false;
    await G(`window.__touchable = ${touchable.toString()}; window.__chooseWindow = ${chooseWindow.toString()}; window.__clearOfHim = ${clearOfHim.toString()}; window.__readState = ${readState.toString()};`);
    const state = () => G(() => window.__readState()).catch(() => null);

    // ── real input (the same as lib.mjs: world points are put on the glass with the camera at brush-down)
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
      if (!pos) throw new Error(`ink ${ink} is not offered on ${LEVEL}`);
      await page.touchscreen.tap(pos.x, pos.y);
    };
    /**
     * Paint world points with the real mouse or one finger. The brush goes down first; the rest of the stroke is
     * then put on the glass with the camera as it is under the brush (the game holds it still while you paint), as
     * a hand follows what it sees. (Mapping every point before the brush is down would place the stroke a few units
     * off: the camera keeps running at full speed until the brush touches.)
     */
    let latency = phone ? 0.065 : 0.02;
    /** real seconds a ring takes this hand to paint (a finger on the phone is slower than the mouse) */
    const PAINT_T = phone ? 1.9 : 1.3;
    const paint = async (world, steps = 2) => {
      if (!(await G((pts) => window.__touchable(pts), world))) say(`    (warning: part of this stroke is under a control or off the canvas)`);
      // the camera runs on until the brush touches: put the first point where it will be when the touch lands
      // (the camera's speed now x one round trip), as a hand leads a moving target
      const t0 = Date.now();
      const cam = await G(() => {
        const g = window.__game;
        const tx = g.px + (g.W / g.S) * g.rules.camLead;
        return { v: g.rules.runSpeed * g.timeScale + 4 * (tx - g.camCX), painting: !!g.painting };
      });
      void t0;
      const lead = cam.painting ? 0 : Math.max(-60, Math.min(60, cam.v * latency));
      const [a] = await toClient([{ x: world[0].x - lead, y: world[0].y }]);
      if (phone) await page.touchscreen.touchStart(a.x, a.y);
      else {
        await page.mouse.move(a.x, a.y);
        await page.mouse.down();
      }
      const p0 = await G(() => {
        const q = window.__game.painting?.[0];
        return q ? { x: q.x, y: q.y } : null;
      });
      if (!p0) say(`    (the brush did not go down)`);
      else {
        // learn the input delay (how far the camera ran before the touch landed) for the next stroke
        if (!cam.painting && cam.v > 60) latency = Math.max(0, Math.min(0.15, latency * 0.6 + ((p0.x - world[0].x + lead) / cam.v) * 0.4));
        if (Math.hypot(p0.x - world[0].x, p0.y - world[0].y) > 12) say(`    (the brush landed ${Math.round(p0.x - world[0].x)}, ${Math.round(p0.y - world[0].y)} off; camera ${Math.round(cam.v)} u/s, lead ${Math.round(lead)}, delay now ${(latency * 1000).toFixed(0)} ms)`);
      }
      // then the rest on the glass with the camera as it is under the brush (the game holds it while you paint)
      const client = await toClient(world);
      for (let i = 1; i < client.length; i++) {
        const q = client[i];
        if (phone) await page.touchscreen.touchMove(q.x, q.y);
        else await page.mouse.move(q.x, q.y, { steps });
      }
      if (phone) await page.touchscreen.touchEnd();
      else await page.mouse.up();
    };
    const paintRing = async (c, aim = null) => {
      await selectInk('murasaki');
      const before = await G(() => window.__game.portals.playerRings().map((r) => r.id));
      await paint(topRing(c.x, c.y, c.r, aim), 1);
      const after = await G(() => window.__game.portals.playerRings().map((r) => ({ id: r.id, cx: Math.round(r.cx), cy: Math.round(r.cy), r: Math.round(r.r), state: r.state })));
      const made = after.find((r) => !before.includes(r.id));
      if (!made || Math.hypot(made.cx - c.x, made.cy - c.y) > 25) {
        const ev = await G(() =>
          window.__game.portals.events.slice(-3).map((e) => {
            const o = {};
            for (const k of ['kind', 'legal', 'fail', 'why', 'cx', 'cy', 'r', 'px', 'roundness']) if (e[k] !== undefined) o[k] = typeof e[k] === 'number' ? Math.round(e[k] * 100) / 100 : e[k];
            return JSON.stringify(o);
          }),
        );
        const cam = await G(() => ({ camCX: Math.round(window.__game.camCX), camCY: Math.round(window.__game.camCY), px: Math.round(window.__game.px), py: Math.round(window.__game.py) }));
        say(`    events ${ev.join(' ')} camera ${JSON.stringify(cam)}`);
      }
      say(`  ring (${c.x}, ${c.y}) R${c.r}${aim !== null ? ' aim ' + aim + '°' : ''} → ${made ? `#${made.id} at (${made.cx}, ${made.cy}) R${made.r} ${made.state}` : 'NOT MADE'}`);
      return made ?? null;
    };
    const bridge = async (x0, y0, x1, y1, n = 22) => {
      await selectInk('shu');
      await paint(line(x0, y0, x1, y1, n));
      const st = await G(() => {
        const g = window.__game;
        const q = g.strokes.at(-1);
        return { ink: g.ink, last: q ? { kind: q.kind, x0: Math.round(q.bbox.x0), x1: Math.round(q.bbox.x1), y0: Math.round(q.bbox.y0), y1: Math.round(q.bbox.y1) } : null, px: Math.round(g.px), py: Math.round(g.py) };
      });
      say(`  bridge (${Math.round(x0)}, ${Math.round(y0)}) → (${Math.round(x1)}, ${Math.round(y1)}): last stroke ${JSON.stringify(st.last)} ink ${st.ink} traveler (${st.px}, ${st.py})`);
    };
    /** wait (polling the page) until fn(state) is true or ms pass; returns the last state */
    const until = async (fn, ms) => {
      const t = Date.now();
      let s = await state();
      while (s && !fn(s) && Date.now() - t < ms) {
        await wait(12);
        s = await state();
      }
      return s;
    };

    const snapped = new Set();
    /** a frame of a beat (never while a finger or the mouse button is down: only called between strokes) */
    const snap = async (name) => {
      if (!CAPTURE || snapped.has(name)) return;
      snapped.add(name);
      mkdirSync(CAPTURE, { recursive: true });
      await page.screenshot({ path: `${CAPTURE}/${char}-${device}-${name}.png` });
      say(`  (frame ${name})`);
    };

    /** where a strike of this phase stands now (by its mark), read from the game */
    const strikeAt = (n, mark) =>
      G(
        ([n, mark]) => {
          const s = window.__game.raijin.strikes.find((q) => q.phase.n === n && Math.abs(q.mark - mark) < 2);
          return s ? { id: s.id, state: s.state, el: s.el, tele: s.def.tele } : null;
        },
        [n, mark],
      );
    const umbrella = async (m, gy) => {
      await bridge(m - 70, gy - 140, m + 70, gy - 140, 8);
      say(`  umbrella over ${Math.round(m)}`);
    };

    /**
     * One strike group, the intended catch for its pattern (summer-design 3.5): the catch rings on the threads
     * (`plan`: each ring and the bolts it catches) and one window aimed at him, which stays while the used entry
     * closes behind each new catch ring (portal rule 3). The window is painted first (it can go anywhere in reach);
     * the first catch ring waits until he has moved off the threads (a ring on him sputters); each later catch ring
     * is painted once the bolts before it are through.
     */
    const handleGroup = async (first, s) => {
      const pat = s.phase.pattern;
      const n = s.phase.n;
      const spacing = pat === 'pair' ? s.speed * 0.6 : pat === 'triplet' ? s.speed * 0.45 : 0;
      const count = pat === 'triplet' ? 3 : pat === 'pair' ? 2 : 1;
      const m0 = first.mark - first.idx * spacing;
      const marks = Array.from({ length: count }, (_, i) => m0 + i * spacing);
      const gy = s.gy;
      const T = first.tele;
      const small = (i) => ({ x: Math.round(marks[i]), y: gy - 150, r: THIRD_R, bolts: [i] });
      // the design's line first: one big ring for the first two bolts (pair, triplet), then (triplet) one for the third;
      // if no window can see past the big ring, the window rule: one small ring per thread, painted in turn
      const plans = [];
      if (pat === 'single') plans.push({ name: 'catch ring + window', rings: [small(0)] });
      if (pat === 'pair') plans.push({ name: 'big ring + window', rings: [{ x: Math.round(m0 + spacing / 2), y: gy - 200, r: CATCH_R.pair, bolts: [0, 1] }] });
      if (pat === 'triplet') plans.push({ name: 'ring for two + window + ring for the third', rings: [{ x: Math.round(m0 + spacing / 2), y: gy - 178, r: CATCH_R.triplet, bolts: [0, 1] }, small(2)] });
      if (pat !== 'single') plans.push({ name: 'window rule (a ring per thread)', rings: marks.map((_, i) => small(i)) });
      say(`P${n} group ${first.group} (${pat}) marks ${marks.map(Math.round).join(', ')} at x ${Math.round(s.px)} el ${first.el.toFixed(2)}`);
      const st0 = await strikeAt(n, m0);
      const el0 = st0?.el ?? first.el;
      let plan = null;
      let W = null;
      for (const pl of plans) {
        const A = pl.rings[0];
        const fall = Math.max(0, A.y - A.r * 0.8 - (gy - 432)) / 2400;
        const dg0 = Math.max(0.05, T - 0.18 - el0 + fall);
        const exits = marks.map((_, i) => ({ dg: dg0 + (i * spacing) / s.speed, dr: dg0 + (i * spacing) / s.speed + 0.8 + i * 0.4 }));
        const others = pl.rings.map((r) => ({ x: r.x, y: r.y, r: r.r }));
        W = await G((arg) => window.__chooseWindow(arg), { exits, marks, others, r: WINDOW_R, paintT: PAINT_T });
        if (W && !W.none) {
          plan = pl;
          break;
        }
        say(`  ${pl.name}: no window fits (rejected ${JSON.stringify(W?.why)}; aim (${W?.aimAt?.x}, ${W?.aimAt?.y}), he is at (${W?.him?.x}, ${W?.him?.y}))`);
      }
      const umbrellas = async (from) => {
        say('  no catch: umbrellas');
        for (let i = from; i < marks.length; i++) {
          const q = await strikeAt(n, marks[i]);
          if (q && (q.state === 'armed' || q.state === 'tele')) await umbrella(marks[i], gy);
        }
      };
      if (!plan) return umbrellas(0);
      say(`  ${plan.name}: window (${W.x}, ${W.y}) aim ${W.aim}° at (${W.aimAt.x}, ${W.aimAt.y}) ${W.d} u`);
      const w = await paintRing(W, W.aim);
      if (!w) return umbrellas(0);
      for (let k = 0; k < plan.rings.length; k++) {
        const R = plan.rings[k];
        const firstBolt = R.bolts[0];
        if (k > 0) {
          // the bolts before this ring are through (caught, or gone)
          const prev = plan.rings[k - 1].bolts.at(-1);
          const t = Date.now();
          for (;;) {
            const q = await strikeAt(n, marks[prev]);
            if (!(await G(() => window.__game.state === 'play'))) return;
            if (!q || (q.state !== 'armed' && q.state !== 'tele' && q.state !== 'drop')) break;
            if (Date.now() - t > 6000) break;
            await wait(6);
          }
        }
        const q0 = await strikeAt(n, marks[firstBolt]);
        if (q0 && (q0.state === 'cancelled' || q0.state === 'landed' || q0.state === 'caught')) continue;
        // clear of his storm while it is painted, and before this ring's bolt drops
        let ok = false;
        for (;;) {
          if (await G((c) => window.__clearOfHim(c), { ...R, margin: 116, paintT: PAINT_T })) {
            ok = true;
            break;
          }
          const q = await strikeAt(n, marks[firstBolt]);
          if (!q || q.state !== 'tele' || q.el >= T - 0.18 - 0.15) break;
          if (!(await G(() => window.__game.state === 'play'))) return;
          await wait(8);
        }
        const made = ok ? await paintRing(R) : null;
        if (!ok) say('  he never cleared the thread in time');
        if (!made || made.state !== 'linked') return umbrellas(firstBolt);
        if (k === 0) await snap(`p${n}-catch-and-window`);
      }
    };

    // ── the run: the gorge, then each strike group and gap as it comes, until the torii
    const GAPS = { 2: [[2620, 420, false], [3520, 420, false]], 3: [[2720, 440, true], [3720, 440, true]] };
    const done = new Set();
    let s = null;
    let lastPx = 0;
    let lastCleaned = 0;
    let finLogged = false;
    let snapCleaned = 0;
    let finT = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < 300000) {
      s = await state();
      if (!s) throw new Error('RELOAD');
      if (s.state === 'finish') break;
      if (s.state !== 'play') {
        await wait(20);
        continue;
      }
      if (s.px < lastPx - 1000) say(`(back at x ${Math.round(s.px)}: ${s.falls} falls, ${s.wraps} wraps)`);
      if (s.falls > 4) {
        say('more than four falls: this run cannot reach Bamboo; stopping it');
        break;
      }
      lastPx = s.px;
      if (s.cleaned > lastCleaned) {
        say(`drum ${s.cleaned}/8 clean at x ${Math.round(s.px)} (phase ${s.phase?.n})`);
        lastCleaned = s.cleaned;
      }
      if (s.finale && !finLogged) {
        finLogged = true;
        const f = await G(() => {
          const g = window.__game;
          return { ts: g.timeScale, zones: g.level.rainZones.map((z) => z.map(Math.round)), inRain: g.strokes.filter((q) => q.inRain).length, sky: g.festival.sky.to, cleaned: g.raijin.cleaned };
        });
        say(`FINALE at x ${Math.round(s.px)}: drums ${f.cleaned}/8, time scale ${f.ts.toFixed(2)}, rain zones ${JSON.stringify(f.zones)}, strokes still washing ${f.inRain}, sky → ${f.sky}`);
      }
      if (PERF && !cdp && !perfDone && s.phase?.n === 3) {
        cdp = await page.createCDPSession();
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        await G(() => (window.__perf.on = true));
        say('PERF: 4x CPU throttle on, timing frames through phase 3');
      }
      if (PERF && cdp && (s.finale || s.phase?.n !== 3)) {
        const f = (await G(() => ((window.__perf.on = false), window.__perf.frames))).sort((a, b) => a - b);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
        cdp = null;
        perfDone = true;
        if (f.length) {
          const q = (k) => f[Math.min(f.length - 1, Math.floor(k * f.length))];
          const line = `PERF summer-gate phase 3 (${char}, ${device}): ${f.length} frames, update+render ms p50 ${q(0.5).toFixed(2)} p95 ${q(0.95).toFixed(2)} max ${f[f.length - 1].toFixed(2)} (budget p95 <= 8): ${q(0.95) <= 8 ? 'PASS' : 'FAIL'}`;
          console.log(line);
          say(line);
        }
      }
      if (CAPTURE) {
        if (s.px >= 520) await snap('approach');
        if (s.cleaned > snapCleaned) {
          snapCleaned = s.cleaned;
          await snap(`drum-${s.cleaned}`);
        }
        if (s.finale && !finT) finT = Date.now();
        if (finT) {
          await snap('finale-0');
          if (Date.now() - finT > 1400) await snap('finale-1');
          if (Date.now() - finT > 4000) await snap('finale-2');
        }
        if (s.px >= s.torii - 700) await snap('torii');
      }
      const tag = `${s.falls}:${s.wraps}`;
      // G1 the ridge gorge: the exit in the air first (while it is in view), then the door at the lip
      if (s.px >= 1100 && s.px < 1300 && !done.has('g1:' + tag)) {
        done.add('g1:' + tag);
        say(`G1 at x ${Math.round(s.px)}`);
        await paintRing({ x: 1370, y: 212, r: 50 });
        // the exit at the reach (about 600 on), as soon as it is in view
        const B = { x: 1960, y: 240, r: 46 };
        await until((q) => q.state !== 'play' || q.px >= 1290 || q.cam.right - 25 >= B.x + B.r, 4000);
        await paintRing(B);
        await selectInk('shu');
        await snap('g1-door');
        continue;
      }
      // out of the exit in the air: a vermilion bridge from under your feet down to the bank, painted while falling
      if (s.px >= 1900 && s.px < 2350 && s.py < 470 && !done.has('g1b:' + tag)) {
        done.add('g1b:' + tag);
        say(`G1 out of the door at (${Math.round(s.px)}, ${Math.round(s.py)}): bridge`);
        // (the camera is still catching up after the portal jump, so the glass slides right under the brush: the
        // bridge starts a little behind the feet so that it still lands under them)
        await bridge(s.px - 90, s.py + 45, 2450, 506, 16);
        await snap('g1-bridge');
        continue;
      }
      if (s.phase) {
        // a strike group starting its telegraph
        const first = s.finale ? null : s.strikes.filter((q) => q.state === 'tele').sort((a, b) => a.mark - b.mark)[0];
        const gkey = first && `grp:${first.n}:${first.group}:${tag}`;
        if (first && !done.has(gkey) && first.n === s.phase.n) {
          done.add(gkey);
          await handleGroup(first, s);
          continue;
        }
        // the phase's gaps: a dry bridge ahead of time, or a late one in rain
        const rel = s.px - s.phase.x0;
        for (const [gi, [gx, gw, rain]] of (GAPS[s.phase.n] ?? []).entries()) {
          const key = `gap:${s.phase.n}:${gi}:${tag}`;
          const at = rain ? gx + gw - RAIN_CARRY + LATE_MARGIN : gx - DRY_LEAD;
          if (done.has(key) || rel < at || rel > gx - 20) continue;
          done.add(key);
          const x0 = s.phase.x0 + gx;
          say(`P${s.phase.n} gap ${gi + 1} (${x0}–${x0 + gw}${rain ? ', rain' : ''}) bridge at x ${Math.round(s.px)}`);
          await bridge(x0 - 50, s.gy + 4, x0 + gw + 50, s.gy + 4, 24);
          await snap(`p${s.phase.n}-gap-bridge`);
          break;
        }
      }
      await wait(12);
    }
    const res = await G(() => {
      const g = window.__game;
      return { state: g.state, grade: g.state === 'finish' ? g.grade() : null, time: g.stats.time, falls: g.stats.falls, ink: g.stats.ink, strokes: g.stats.strokes, par: [g.level.parTime, g.level.parInk], cleaned: g.raijin.cleaned, wraps: g.raijin.wraps };
    });
    if (shot) {
      await wait(1500);
      await page.screenshot({ path: shot });
    }
    if (CAPTURE && res.state === 'finish') {
      // the game's own Full scroll export (share.ts), as the finish screen offers it
      const b64 = await G(async () => {
        const { exportScroll } = await import('/src/share.ts');
        const g = window.__game;
        const blob = await exportScroll(g, { ...g.stats, grade: g.grade(), newBest: false, best: null });
        const buf = new Uint8Array(await blob.arrayBuffer());
        let bin = '';
        for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        return btoa(bin);
      });
      const { writeFileSync } = await import('node:fs');
      writeFileSync(`${CAPTURE}/${char}-${device}-full-scroll.png`, Buffer.from(b64, 'base64'));
      say('  (full-scroll export saved)');
    }
    const names = { 松: 'Pine', 竹: 'Bamboo', 梅: 'Plum' };
    return { finished: res.state === 'finish', grade: res.grade, gradeName: res.grade ? names[res.grade] : null, ...res, log, errors };
  } catch (e) {
    // the dev server reloads the page when another agent saves a file: our helpers vanish mid-run. Void the run.
    const alive = await page.evaluate(() => !!window.__route && !!window.__touchable).catch(() => false);
    if (!alive) throw new Error('RELOAD');
    throw e;
  } finally {
    await page.close().catch(() => {});
  }
}

// ───────────────────────────────────────────── main

if (import.meta.url === `file://${process.argv[1]}`) {
  const devices = which === 'both' ? ['desktop', 'phone'] : [which];
  const chars = (process.env.CHAR ?? 'both') === 'both' ? ['ren', 'kohaku'] : [process.env.CHAR];
  const outDir = SHOTS ?? 'shots/rough/summer-gate/route';
  mkdirSync(outDir, { recursive: true });
  const browser = await launch();
  let ok = true;
  try {
    for (const char of chars) {
      for (const device of devices) {
        for (let k = 1; k <= RUNS; k++) {
          let r = null;
          for (let attempt = 0; attempt < 4 && !r; attempt++) {
            try {
              r = await runGate({ browser, char, device, shot: `${outDir}/${char}-${device}-${k}.png` });
            } catch (e) {
              if (String(e.message).includes('RELOAD') || String(e.message).includes('Execution context')) {
                console.log(`  (the dev server reloaded the page: ${char} ${device} run ${k} restarted)`);
                await wait(2000);
              } else throw e;
            }
          }
          if (!r) throw new Error('the page kept reloading');
          const pass = bambooOrBetter(r);
          ok &&= pass;
          console.log(
            `${pass ? 'PASS' : 'FAIL'} summer-gate ${char} ${device} run ${k}/${RUNS}: ${r.finished ? 'finished' : 'DID NOT FINISH'} grade ${r.gradeName ?? '-'} time ${r.time.toFixed(1)}s (par ${r.par[0].toFixed(1)}) falls ${r.falls} ink ${r.ink.toFixed(0)} (par ${r.par[1]}) drums ${r.cleaned}/8 wraps ${r.wraps}`,
          );
          if (r.errors.length) console.log('  page errors:\n  ' + r.errors.join('\n  '));
          if (!pass && !VERBOSE) console.log(r.log.join('\n'));
        }
      }
    }
  } finally {
    await browser.close();
  }
  console.log(ok ? `ALL PASS: summer-gate finished ${RUNS} of ${RUNS} at Bamboo or better for ${chars.join(' and ')} on ${devices.join(' and ')}` : 'FAIL: summer-gate');
  process.exit(ok ? 0 : 1);
}
