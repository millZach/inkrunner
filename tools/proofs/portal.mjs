// Usage: flock /tmp/inkrunner-browser.lock node tools/proofs/portal.mjs [all|desktop|phone] [outdir]  (env URL, default http://localhost:5173/; STRIPS=0 skips the frame strips)
// Purple portal assertions on ?proof=portal with REAL input: mouse at 1600x900 (Ren) and touch at iPhone 13 landscape (Kohaku).
// Prints PASS/FAIL per assertion and per device; exits 1 on any FAIL. Frame strips are read from the game canvas
// (never a screenshot while a finger is down), saved under shots/proofs/portal/.
import { mkdirSync, writeFileSync } from 'node:fs';
import puppeteer, { KnownDevices } from 'puppeteer-core';

const URL = process.env.URL ?? 'http://localhost:5173/';
const which = process.argv[2] ?? 'all';
const out = process.argv[3] ?? 'shots/proofs/portal';
const STRIPS = process.env.STRIPS !== '0';
// ONLY=wall,glass,moving,fling,ride,fire,yokai,spark,illegal,reach,ab,first runs just those scenarios (for debugging)
// TRIES=n: attempts per scenario when the dev server reloads the page or the harness throws (default 4)
const TRIES = Math.max(1, Number(process.env.TRIES ?? 4));
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const run = (k) => !ONLY || ONLY.includes(k);
mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const allResults = [];

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  headless: 'new',
  args: ['--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});

async function device(phone) {
  const tag = phone ? 'phone' : 'desktop';
  const char = phone ? 'kohaku' : 'ren';
  const results = [];
  let markSeq = 0;
  /** lines of the scenario attempt in progress: printed only once the attempt is final */
  let buffer = null;
  const say = (line) => (buffer ? buffer.push(line) : console.log(line));
  const check = async (ok, what, detail = '') => {
    results.push({ ok, what });
    allResults.push(ok);
    say(`${ok ? 'PASS' : 'FAIL'} [${tag}] ${what}${detail ? '  ' + detail : ''}`);
    if (!ok) await trace(markSeq).catch(() => {});
  };
  const page = await browser.newPage();
  const errors = [];
  // puppeteer's own waitFor bodies can throw inside the page across a navigation: those are not game errors
  page.on('pageerror', (e) => !String(e.stack).includes('pptr:') && errors.push(e.stack ?? String(e)));
  let reloads = 0;
  if (phone) await page.emulate(KnownDevices['iPhone 13 landscape']);
  else await page.setViewport({ width: 1600, height: 900 });
  const G = (fn, ...a) => page.evaluate(fn, ...a);

  // ── helpers ───────────────────────────────────────────────────────────
  const load = async () => {
    await page.goto(`${URL}?proof=portal&play=${char}&panel=${phone ? 0 : 1}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__game?.state === 'play' && window.__proof, { timeout: 20000 });
    await page.waitForFunction(() => window.__game.introT >= 1.5, { timeout: 10000 });
    await G(() => (window.__ppMark = 1));
  };
  /** the dev server hot-reloads when other builders save files: notice it and start over */
  const ensure = async () => {
    if (await G(() => window.__ppMark === 1 && !!window.__game).catch(() => false)) return;
    reloads++;
    say(`      (page was reloaded by the dev server; loading the proof again)`);
    await load();
  };
  const trace = async (seq) => {
    if (!process.env.DEBUG) return;
    const ev = await events(seq);
    say('      events: ' + ev.map((e) => `${e.kind}${e.label ? ':' + e.label : ''}${e.what ? ':' + e.what : ''}${e.fail ? ':' + e.fail : ''}${e.why ? ':' + e.why : ''}${e.cx !== undefined ? `@${Math.round(e.cx)},${Math.round(e.cy)}` : ''}${e.px !== undefined ? ' px ' + Math.round(e.px) : ''}`).join(' '));
  };
  /** world point → client CSS pixels, using the live camera */
  const toClient = (pts) =>
    G((pts) => {
      const g = window.__game;
      const r = g.canvas.getBoundingClientRect();
      return pts.map((p) => ({ x: r.left + (((p.x - g.camCX) * g.S + g.W / 2) * r.width) / g.W, y: r.top + (((p.y - g.camCY) * g.S + g.H / 2) * r.height) / g.H }));
    }, pts);
  const tap = async (sel) => {
    const el = await page.$(sel);
    await el.evaluate((e) => e.scrollIntoView({ block: 'center' }));
    const box = await el.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    if (phone) await page.touchscreen.tap(x, y);
    else await page.mouse.click(x, y);
    await wait(60);
  };
  /** jump to a station with the panel's own button (real click or tap) */
  const station = async (id) => {
    await ensure();
    const collapsed = await G(() => document.getElementById('pp').classList.contains('collapsed'));
    if (collapsed) await tap('#pp .pp-toggle');
    await tap(`#pp button[data-st="${id}"]`);
    // (picking a station collapses the panel by itself)
    if (!(await G(() => document.getElementById('pp').classList.contains('collapsed')))) await tap('#pp .pp-toggle');
    await page.waitForFunction((id) => window.__proof.S.station?.id === id, { timeout: 4000 }, id);
    await wait(150);
    return G((id) => {
      const st = window.__proof.stations.find((s) => s.id === id);
      const L = window.__game.level;
      const inSt = (x) => x >= st.x - 100 && x < st.end;
      return {
        x: st.x,
        end: st.end,
        pillars: L.pillars.filter((p) => inSt(p.x)),
        fires: L.fires.filter((f) => inSt(f.x)).map((f) => ({ x: f.x, w: f.w, y: f.y, h: f.h })),
        brambles: L.brambles.filter((b) => inSt(b.x)).map((b) => ({ x: b.x, w: b.w, y: b.y, h: b.h })),
        yokai: L.yokai.filter((y) => inSt(y.x)).map((y) => ({ x: y.x, y: y.y, r: y.r })),
        ground: L.islands.filter((i) => i.x1 > st.x && i.x0 < st.end).map((i) => [i.x0, i.x1, i.pts[0].y]),
      };
    }, id);
  };
  const setKnob = async (row, label) => {
    const collapsed = await G(() => document.getElementById('pp').classList.contains('collapsed'));
    if (collapsed) await tap('#pp .pp-toggle');
    const sel = await G(
      (row, label) => {
        const r = [...document.querySelectorAll('#pp .row')].find((e) => e.querySelector('span')?.textContent === row);
        const b = [...(r?.querySelectorAll('button') ?? [])].find((x) => x.textContent === label);
        return b ? `#pp button[data-r="${b.dataset.r}"][data-o="${b.dataset.o}"]` : null;
      },
      row,
      label,
    );
    if (!sel) throw new Error(`no knob ${row}/${label}`);
    await tap(sel);
    await tap('#pp .pp-toggle');
  };
  const ground = (info, x) => {
    for (const [x0, x1, y] of info.ground) if (x >= x0 && x <= x1) return y;
    return 520;
  };
  const events = (since = 0) => G((since) => window.__game.portals.events.filter((e) => e.seq > since), since);
  const lastSeq = async () => (markSeq = await G(() => window.__game.portals.events.at(-1)?.seq ?? 0));
  const waitFor = async (fn, ms, arg) => {
    try {
      await page.waitForFunction(fn, { timeout: ms, polling: 50 }, arg);
      return true;
    } catch {
      return false;
    }
  };
  /** points of a ring: start angle a0 (deg), sweep (deg), and an optional tail flicked toward `tail` degrees */
  const ringPts = (cx, cy, r, { a0 = -100, sweep = 372, tail = null, tailLen = 70, n = 30 } = {}) => {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const a = ((a0 + (sweep * i) / n) * Math.PI) / 180;
      pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
    if (tail !== null) {
      const last = pts[pts.length - 1];
      const t = (tail * Math.PI) / 180;
      const tip = { x: cx + Math.cos(t) * (r + tailLen), y: cy + Math.sin(t) * (r + tailLen) };
      for (let i = 1; i <= 6; i++) pts.push({ x: last.x + ((tip.x - last.x) * i) / 6, y: last.y + ((tip.y - last.y) * i) / 6 });
    }
    return pts;
  };
  /**
   * Paint world points with real input. `midway(i)` runs after point i while the brush is still down
   * (only evaluate calls: no screenshots while a finger is held).
   */
  const paint = async (world, midway, opts) => {
    // the whole stroke is placed on the glass where its world spots are when the brush goes down, and the
    // hand then follows the glass, as a player's does (the game holds the camera still under the brush)
    await paintScreen(await toClient(world), midway, opts);
  };
  /** Paint client (CSS pixel) points with real input. `dur` (ms) paces the whole stroke like a hand. */
  const paintScreen = async (client, midway, { dur = 0 } = {}) => {
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
      if (midway) await midway(i);
      const due = t0 + (dur * i) / (client.length - 1) - Date.now();
      if (due > 0) await wait(due);
    }
    if (phone) await page.touchscreen.touchEnd();
    else await page.mouse.up();
    await wait(60);
  };
  const playerRings = () => G(() => window.__game.portals.playerRings().map((r) => ({ id: r.id, cx: r.cx, cy: r.cy, r: r.r, state: r.state, spout: r.spout, cost: r.cost })));
  const traveler = () => G(() => ({ x: window.__game.px, y: window.__game.py, vx: window.__game.vx, vy: window.__game.vy, state: window.__game.state, stuck: window.__game.stuckT, falls: window.__game.stats.falls, ink: window.__game.inkAmt }));
  const deg = (v) => (Math.atan2(v.y, v.x) * 180) / Math.PI;
  const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

  // a frame strip of the game canvas (read from the canvas itself, so a held finger is never disturbed)
  const strip = {
    begin: () =>
      G(() => {
        window.__strip = [];
      }),
    /** focus: { x, y, w } in world units crops around that spot (w wide, 2:3 tall); otherwise the whole view */
    grab: (focus = null) =>
      G((focus) => {
        const g = window.__game;
        const c = document.createElement('canvas');
        const w = 640;
        if (focus) {
          const sx = (focus.x - focus.w / 2 - g.camCX) * g.S + g.W / 2;
          const sy = (focus.y - focus.w / 3 - g.camCY) * g.S + g.H / 2;
          c.width = w;
          c.height = Math.round((w * 2) / 3);
          c.getContext('2d').drawImage(g.canvas, sx, sy, focus.w * g.S, ((focus.w * 2) / 3) * g.S, 0, 0, c.width, c.height);
        } else {
          c.width = w;
          c.height = Math.round((w * g.H) / g.W);
          c.getContext('2d').drawImage(g.canvas, 0, 0, c.width, c.height);
        }
        window.__strip.push(c);
      }, focus),
    save: async (name, cols = 3) => {
      const data = await G((cols) => {
        const fr = window.__strip;
        if (!fr.length) return null;
        const w = fr[0].width;
        const h = fr[0].height;
        const rows = Math.ceil(fr.length / cols);
        const c = document.createElement('canvas');
        c.width = w * cols + (cols - 1) * 6;
        c.height = h * rows + (rows - 1) * 6;
        const x = c.getContext('2d');
        x.fillStyle = '#222';
        x.fillRect(0, 0, c.width, c.height);
        fr.forEach((f, i) => {
          x.drawImage(f, (i % cols) * (w + 6), Math.floor(i / cols) * (h + 6));
          x.fillStyle = '#fff';
          x.font = '16px sans-serif';
          x.fillText(String(i + 1), (i % cols) * (w + 6) + 8, Math.floor(i / cols) * (h + 6) + 20);
        });
        return c.toDataURL('image/png').split(',')[1];
      }, cols);
      if (!data) return;
      const path = `${out}/${tag}-${name}.png`;
      writeFileSync(path, Buffer.from(data, 'base64'));
      say(`strip ${path}`);
    },
  };

  /**
   * Run one scenario. If the dev server reloaded the page meanwhile, or the harness threw (a navigation
   * mid-evaluate: "Execution context was destroyed"), forget that attempt's results and run it again, up to
   * TRIES times. Only the final attempt's lines are printed, so a FAIL is never followed by a PASS.
   */
  const scenario = async (k, fn) => {
    if (!run(k)) return;
    for (let attempt = 1; attempt <= TRIES; attempt++) {
      const n0 = results.length;
      const a0 = allResults.length;
      buffer = [];
      let err = null;
      try {
        if (k !== 'first') await ensure();
        await fn();
      } catch (e) {
        err = e;
      }
      const reloaded = k !== 'first' && !(await G(() => window.__ppMark === 1).catch(() => false));
      const lines = buffer;
      buffer = null;
      if ((reloaded || err) && attempt < TRIES) {
        results.splice(n0);
        allResults.splice(a0);
        console.log(`      (${k}: ${err ? 'harness error "' + String(err.message).split('\n')[0] + '"' : 'the page was reloaded during the scenario'}; attempt ${attempt + 1} of ${TRIES})`);
        if (phone) await page.touchscreen.touchEnd().catch(() => {});
        else await page.mouse.up().catch(() => {});
        await wait(1500);
        await load().catch(() => {});
        continue;
      }
      for (const l of lines) console.log(l);
      if (err) {
        await check(false, `harness error in ${k}: ${err.message}`);
        console.log(err.stack);
      }
      return;
    }
  };

  try {
    await load();
    console.log(`[${tag}] ${char}, coarse pointer ${await G(() => matchMedia('(pointer: coarse)').matches)}, inks ${await G(() => window.__game.rules.inks.join(','))}`);

    // ── 1. a ring drawn while time is slowed closes and snaps; 2. the stopped-at-a-wall case goes through
    await scenario('wall', async () => {
      const info = await station('wall');
      await waitFor(() => window.__game.stuckT > 0.25, 8000);
      const t0 = await traveler();
      const seq0 = await lastSeq();
      let snapSeen = null;
      if (STRIPS) await strip.begin();
      const ring = ringPts(t0.x, t0.y - 40, 56, { a0: 180, sweep: 380, n: 34 });
      await paint(ring, async (i) => {
        if (!snapSeen) {
          const s = await G((seq0) => {
            const g = window.__game;
            const e = g.portals.events.find((e) => e.seq > seq0 && e.kind === 'snap');
            return e ? { legal: e.legal, ts: e.timeScale, painting: !!g.painting, nowTs: g.timeScale, i: 0 } : null;
          }, seq0);
          if (s) snapSeen = { ...s, i };
        }
        if (STRIPS && i >= 18 && i % 2 === 0) await strip.grab({ x: t0.x, y: t0.y - 40, w: 420 });
      });
      if (STRIPS) for (let k = 0; k < 6; k++) {
        await wait(110);
        await strip.grab({ x: t0.x, y: t0.y - 40, w: 420 });
      }
      if (STRIPS) await strip.save('ring-snap-strip', 4);
      const rings = await playerRings();
      await check(
        !!snapSeen && snapSeen.legal && snapSeen.painting && snapSeen.nowTs < 0.5 && rings.length === 1 && rings[0].state === 'waiting',
        'a ring drawn while time is slowed closes and snaps (brush still down)',
        snapSeen ? `snap at point ${snapSeen.i}/${ring.length - 1}, legal ${snapSeen.legal}, timeScale ${snapSeen.nowTs.toFixed(2)}, R ${rings[0]?.r.toFixed(0)}` : 'no snap event',
      );
      // exit hung over the gap near its far edge: only the speed floor carries a stopped traveler across
      const gapEnd = info.ground.map((g) => g[0]).filter((x) => x > info.pillars[0].x + info.pillars[0].w + 10).sort((a, b) => a - b)[0];
      const gy = ground(info, gapEnd + 10);
      const seq1 = await lastSeq();
      if (STRIPS) await strip.begin();
      await paint(ringPts(gapEnd - 30, gy - 55, 52, { a0: -90, sweep: 380, n: 30 }));
      const passed = await waitFor((seq) => window.__game.portals.events.some((e) => e.seq > seq && e.kind === 'pass' && e.what === 'traveler'), 3000, seq1);
      if (STRIPS) for (let k = 0; k < 8; k++) {
        await strip.grab({ x: gapEnd - 30, y: gy - 60, w: 520 });
        await wait(70);
      }
      if (STRIPS) await strip.save('wall-exit-strip', 4);
      await wait(1500);
      const ev = (await events(seq1)).find((e) => e.kind === 'pass' && e.what === 'traveler');
      const t1 = await traveler();
      await check(
        passed && ev?.stopped && ev.speedIn < 20 && Math.abs(ev.speedOut - 310) < 5 && t1.state === 'play' && t1.falls === t0.falls && t1.x > gapEnd,
        'the stopped-at-a-wall case goes through (full-radius capture, exit at run speed)',
        ev ? `stopped ${ev.stopped}, in ${ev.speedIn.toFixed(0)} → out ${ev.speedOut.toFixed(0)}, now x ${t1.x.toFixed(0)} (far side ${gapEnd}), falls ${t1.falls}` : 'no pass',
      );
    });


    // ── 1b. rings drawn on the glass while the traveler runs: 315-345°, clockwise and anticlockwise, started at
    // the top and at the bottom, paced like a hand (0.65 s). Points are fixed client pixels, never re-aimed at
    // the moving world, so whatever the camera does under the brush counts against the gesture.
    await scenario('glass', async () => {
      const cases = [];
      for (const [R, sweeps] of [
        [48, [315, 330, 345]],
        [60, [330]],
      ])
        for (const sweep of sweeps) for (const dir of [1, -1]) for (const from of ['top', 'bottom']) cases.push({ R, sweep, dir, from, tail: false });
      for (const dir of [1, -1]) cases.push({ R: 50, sweep: 345, dir, from: 'top', tail: true });
      // the camera jolted mid-stroke (as by a portal jump or a fall): the ring is still judged on the glass
      for (const dir of [1, -1]) cases.push({ R: 55, sweep: 330, dir, from: 'bottom', tail: false, jolt: true });
      const bad = [];
      let drift = 0;
      let slowest = Infinity;
      for (let i = 0; i < cases.length; i++) {
        const c = cases[i];
        if (i % 6 === 0) {
          await station('runway');
          await waitFor(() => window.__game.vx > 250 && window.__game.grounded, 5000);
          await wait(250);
        }
        await G(() => {
          const g = window.__game;
          g.portals.clearPlayerRings();
          g.inkAmt = g.inkMax;
        });
        await wait(120);
        const t = await traveler();
        slowest = Math.min(slowest, t.vx);
        const centre = { x: t.x + 300, y: t.y - 230 };
        const [cc, edge] = await toClient([centre, { x: centre.x + c.R, y: centre.y }]);
        const rpx = edge.x - cc.x;
        const a0 = c.from === 'top' ? -90 : 90;
        const n = 32;
        const pts = [];
        for (let k = 0; k <= n; k++) {
          const a = ((a0 + (c.dir * c.sweep * k) / n) * Math.PI) / 180;
          pts.push({ x: cc.x + Math.cos(a) * rpx, y: cc.y + Math.sin(a) * rpx });
        }
        if (c.tail) {
          // flick out to the right, past the rim
          const last = pts[pts.length - 1];
          const tip = { x: cc.x + rpx * 2.4, y: cc.y };
          for (let k = 1; k <= 6; k++) pts.push({ x: last.x + ((tip.x - last.x) * k) / 6, y: last.y + ((tip.y - last.y) * k) / 6 });
        }
        const seq0 = await lastSeq();
        // the camera from the first brush point to the last, and where the snapped loop sits on the glass
        let cam0 = null;
        let glass = null;
        const look = () =>
          G((seq0) => {
            const g = window.__game;
            const r = g.canvas.getBoundingClientRect();
            const e = g.portals.events.find((e) => e.seq > seq0 && e.kind === 'snap');
            const at = e && { x: r.left + (((e.cx - g.camCX) * g.S + g.W / 2) * r.width) / g.W, y: r.top + (((e.cy - g.camCY) * g.S + g.H / 2) * r.height) / g.H };
            return { cam: [g.camCX, g.camCY], at, painting: !!g.painting };
          }, seq0);
        await paintScreen(pts, async (k) => {
          if (k === 1) cam0 = (await look()).cam;
          if (c.jolt && k === 14)
            await G(() => {
              window.__game.camCX += 60;
              window.__game.camCY -= 30;
            });
          if (k === pts.length - 1) {
            // touch moves reach the page on the next frame: let the last one land first
            await wait(50);
            const l = await look();
            if (!c.jolt) drift = Math.max(drift, Math.hypot(l.cam[0] - cam0[0], l.cam[1] - cam0[1]));
            glass = l.at;
          }
        }, { dur: 650 });
        const ev = await events(seq0);
        const snap = ev.find((e) => e.kind === 'snap');
        const ring = ev.find((e) => e.kind === 'ring');
        const fz = ev.find((e) => e.kind === 'fizzle');
        const name = `R${c.R} ${c.sweep}° ${c.dir > 0 ? 'cw' : 'acw'} from ${c.from}${c.tail ? ' +tail' : ''}${c.jolt ? ' (camera jolted 67 u)' : ''}`;
        // on the glass: the snapped loop's centre is where the circle was drawn (within 6 % of its radius + 3 px)
        const off = glass ? Math.hypot(glass.x - cc.x, glass.y - cc.y) : Infinity;
        const ok = !!snap?.legal && !!ring && !fz && Math.abs(ring.r - c.R) < c.R * 0.15 && off < rpx * 0.06 + 3 && (!c.tail || ring.tailed);
        if (!ok) bad.push(`${name}: ${fz ? 'fizzled "' + fz.label + '" R ' + fz.r.toFixed(0) : ring ? `ring R ${ring.r.toFixed(0)}, ${off.toFixed(1)} px off on the glass, tailed ${ring.tailed}` : 'no ring'}`);
      }
      await G(() => window.__game.portals.clearPlayerRings());
      await check(
        bad.length === 0 && slowest > 250,
        `rings drawn on the glass while running close on both turns and both starts (${cases.length} rings, 315-345°, two with the camera jolted mid-stroke)`,
        bad.length ? bad.join('; ') : `all snapped legal where drawn on the glass; camera moved at most ${drift.toFixed(1)} u under a brush; traveler at ${slowest.toFixed(0)} u/s or more`,
      );
    });

    // ── 1c. the traveler, moving: a door on the ground ahead and an exit across the gap, painted by hand
    await scenario('moving', async () => {
      const info = await station('moving');
      const isl = info.ground.slice().sort((a, b) => a[0] - b[0]);
      const ledge = isl.find((g) => g[1] > info.x)[1];
      const far = isl.find((g) => g[0] > ledge)[0];
      const gy = ground(info, ledge - 10);
      const exitC = { x: far + 80, y: gy - 62 };
      // you can only paint what you can see: wait until the exit's rim is on screen
      const seen = await waitFor((p) => {
        const g = window.__game;
        return (p.x + 70 - g.camCX) * g.S + g.W / 2 < g.W - 8;
      }, 8000, exitC);
      const t0 = await traveler();
      const seq0 = await lastSeq();
      await paint(ringPts(exitC.x, exitC.y, 52, { a0: 90, sweep: 360, n: 30 }), null, { dur: 600 });
      const t1 = await traveler();
      const doorX = Math.min(t1.x + 200, ledge - 70);
      await paint(ringPts(doorX, gy - 62, 55, { a0: -90, sweep: 360, n: 30 }), null, { dur: 600 });
      const passed = await waitFor((seq) => window.__game.portals.events.some((e) => e.seq > seq && e.kind === 'pass' && e.what === 'traveler'), 4000, seq0);
      await wait(1200);
      const ev = (await events(seq0)).find((e) => e.kind === 'pass' && e.what === 'traveler');
      const t2 = await traveler();
      await check(
        seen && passed && !ev.stopped && ev.speedIn > 250 && Math.abs(ev.speedOut - Math.max(ev.speedIn, 310)) < 5 && t2.state === 'play' && t2.falls === t0.falls && t2.x > far,
        'a running traveler goes through a door on the ground and out across the gap (moving)',
        ev ? `exit spot seen at px ${t0.x.toFixed(0)} (ledge ${ledge}), door at ${doorX.toFixed(0)}; in ${ev.speedIn.toFixed(0)} → out ${ev.speedOut.toFixed(0)}, now x ${t2.x.toFixed(0)} (far side ${far}), falls ${t2.falls - t0.falls}` : `no pass (exit seen ${seen} at px ${t0.x.toFixed(0)}, ledge ${ledge})`,
      );
    });

    // ── 3. traveler speed and direction rotate through a pair (fall into a ring, out of one flicked 30° up)
    await scenario('fling', async () => {
      const info = await station('fling');
      const isl = info.ground.slice().sort((a, b) => a[0] - b[0]);
      const ledge = isl.find((g) => g[1] > info.x)[1];
      const far = isl.find((g) => g[0] > ledge)[0];
      const gy = ground(info, ledge - 10);
      const seq0 = await lastSeq();
      // you can only paint where you can see: wait until the far side is in view
      await waitFor((x) => window.__game.px > x, 6000, ledge - 250);
      await paint(ringPts(ledge + 150, gy + 190, 70, { a0: -90, sweep: 380, n: 32 }));
      await paint(ringPts(far + 60, gy - 95, 55, { a0: 90, sweep: 375, n: 30, tail: -30, tailLen: 75 }));
      const rings = await playerRings();
      if (STRIPS) await strip.begin();
      let passed = false;
      for (let k = 0; k < 90 && !passed; k++) {
        passed = (await events(seq0)).some((e) => e.kind === 'pass' && e.what === 'traveler');
        if (STRIPS) await strip.grab({ x: (ledge + far) / 2 + 40, y: gy + 40, w: 900 });
        if (STRIPS) await G(() => window.__strip.length > 6 && window.__strip.shift());
        await wait(40);
      }
      if (STRIPS) for (let k = 0; k < 6; k++) {
        await wait(50);
        await strip.grab({ x: (ledge + far) / 2 + 40, y: gy + 40, w: 900 });
      }
      if (STRIPS) await strip.save('traveler-through-strip', 4);
      const ev = (await events(seq0)).find((e) => e.kind === 'pass' && e.what === 'traveler');
      const exitRing = rings.find((r) => r.id === ev?.exit);
      const ok =
        !!ev &&
        !!exitRing &&
        Math.abs(ev.speedOut - Math.max(ev.speedIn, 310)) / ev.speedOut < 0.03 &&
        angDiff(deg(ev.vout), deg(exitRing.spout)) < 2 &&
        angDiff(deg(exitRing.spout), -30) < 12 &&
        ev.speedIn > 500;
      await check(
        ok,
        'traveler speed and direction rotate through a pair within tolerance',
        ev ? `in ${ev.speedIn.toFixed(0)} @${deg(ev.vin).toFixed(0)}° → out ${ev.speedOut.toFixed(0)} @${deg(ev.vout).toFixed(0)}° (spout ${exitRing ? deg(exitRing.spout).toFixed(1) : '?'}°, flicked -30°)` : `no pass; rings ${JSON.stringify(rings.map((r) => [Math.round(r.cx), Math.round(r.cy)]))}`,
      );
      await wait(1600);
      const carry = await G(() => window.__proof.S.carry);
      say(`      fling carry ${carry?.to != null ? (carry.to - carry.from).toFixed(0) : '?'} u with the launch state on; state ${(await traveler()).state}`);
    });

    // ── riding an indigo current into a ring: the ride ends and the traveler goes through
    await scenario('ride', async () => {
      const info = await station('ride');
      const p = info.pillars[0];
      const gy = ground(info, p.x - 50);
      const seq0 = await lastSeq();
      await waitFor((x) => window.__game.px > x, 4000, info.x + 200);
      const curStart = { x: (await traveler()).x + 110, y: gy - 14 };
      const ringA = { x: p.x - 170, y: gy - 250 };
      const cur = [];
      for (let i = 0; i <= 14; i++) {
        const u = i / 14;
        cur.push({ x: curStart.x + (ringA.x - curStart.x) * u, y: curStart.y + (ringA.y - curStart.y) * u - Math.sin(u * Math.PI) * 40 });
      }
      // indigo by key / stone, then purple again
      const pick = async (k) => {
        if (phone) {
          const s = await G((k) => {
            const g = window.__game;
            const r = g.canvas.getBoundingClientRect();
            const st = g.stoneLayout().find((s) => s.k === k);
            return { x: r.left + (st.x * r.width) / g.W, y: r.top + (st.y * r.height) / g.H };
          }, k);
          await page.touchscreen.tap(s.x, s.y);
        } else await page.keyboard.press(`Digit${['shu', 'ai', 'kin', 'murasaki'].indexOf(k) + 1}`);
        await wait(40);
      };
      await pick('ai');
      await paint(cur);
      await pick('murasaki');
      await paint(ringPts(ringA.x, ringA.y, 62, { a0: 0, sweep: 380, n: 30 }));
      await paint(ringPts(p.x + p.w + 90, gy - 90, 55, { a0: 90, sweep: 380, n: 30 }));
      if (STRIPS) {
        // the ink language in greyscale: an indigo current and purple rings side by side
        await G(() => {
          const g = window.__game;
          const c = document.createElement('canvas');
          c.width = 960;
          c.height = Math.round((960 * g.H) / g.W);
          const x = c.getContext('2d');
          x.drawImage(g.canvas, 0, 0, c.width, c.height);
          const d = document.createElement('canvas');
          d.width = c.width;
          d.height = c.height * 2 + 6;
          const y = d.getContext('2d');
          y.drawImage(c, 0, 0);
          y.filter = 'grayscale(1)';
          y.drawImage(c, 0, c.height + 6);
          window.__strip = [d];
        });
        await strip.save('ink-language-greyscale', 1);
      }
      const passed = await waitFor((seq) => window.__game.portals.events.some((e) => e.seq > seq && e.kind === 'pass' && e.what === 'traveler'), 6000, seq0);
      const ev = (await events(seq0)).find((e) => e.kind === 'pass' && e.what === 'traveler');
      const riding = await G(() => !!window.__game.ride);
      await check(passed && !riding && Math.abs((ev?.speedIn ?? 0) - 560) < 30, 'a traveler riding an indigo current goes through; the ride ends', ev ? `in ${ev.speedIn.toFixed(0)} (ride speed 560), riding now ${riding}` : 'no pass');
    });

    // ── 4. a ground fire comes out of the exit as an ember
    await scenario('fire', async () => {
      const info = await station('fire');
      await waitFor(() => window.__game.stuckT > 0.2, 8000);
      const f = info.fires[0];
      const b = info.brambles[0];
      const gy = ground(info, f.x + f.w / 2);
      const fcx = f.x + f.w / 2;
      const B = { x: fcx + 40, y: gy - 300 };
      const aim = (Math.atan2(b.y - b.h / 2 - B.y, b.x + b.w / 2 - B.x) * 180) / Math.PI;
      const seq0 = await lastSeq();
      const ink0 = (await traveler()).ink;
      await paint(ringPts(B.x, B.y, 50, { a0: 180, sweep: 378, n: 30, tail: aim, tailLen: 70 }));
      await paint(ringPts(fcx, gy - 58, 62, { a0: -90, sweep: 378, n: 32 }));
      const rings = await playerRings();
      const ok1 = await waitFor((seq) => window.__game.portals.events.some((e) => e.seq > seq && e.kind === 'pass' && e.what === 'ember'), 2000, seq0);
      await wait(1400);
      const ev = await events(seq0);
      const pass = ev.find((e) => e.kind === 'pass' && e.what === 'ember');
      const exitRing = rings.find((r) => r.id === pass?.exit);
      const expect = exitRing && { x: exitRing.cx + exitRing.spout.x * exitRing.r * 0.25, y: exitRing.cy + exitRing.spout.y * exitRing.r * 0.25 };
      const fireDead = await G((fx) => !window.__game.level.fires.find((q) => Math.abs(q.x - fx) < 1)?.alive, f.x);
      await check(
        ok1 && !!exitRing && Math.hypot(pass.at.x - expect.x, pass.at.y - expect.y) < 2 && Math.abs(pass.speedOut - 400) < 1 && fireDead && Math.abs(exitRing.cx - B.x) < 30,
        'a ground fire comes out of the exit as an ember',
        pass ? `ember left ring #${pass.exit} at (${pass.at.x.toFixed(0)}, ${pass.at.y.toFixed(0)}) at ${pass.speedOut.toFixed(0)} u/s @${deg(pass.vout).toFixed(0)}°, fire lifted ${fireDead}` : 'no ember',
      );
      const hit = ev.find((e) => e.kind === 'hit' && e.target === 'thicket');
      const echo = ev.find((e) => e.kind === 'echo');
      say(`      ember ${hit ? 'burned the thicket' : 'missed the thicket'}${echo ? `, echo refund +${echo.refund}` : ''}; ${ev.some((e) => e.kind === 'reform') ? 're-formed as a fire' : ''} (ink ${ink0.toFixed(0)} before)`);
    });

    // ── 5. a yokai comes out of the exit
    await scenario('yokai', async () => {
      const info = await station('yokai');
      await waitFor(() => window.__game.stuckT > 0.2, 8000);
      const Y = info.yokai[0];
      const gy = ground(info, Y.x);
      const seq0 = await lastSeq();
      const B = { x: Y.x + 300, y: gy - 290 };
      await paint(ringPts(B.x, B.y, 55, { a0: 90, sweep: 378, n: 30 }));
      // paint the entry where it will swing, while it is away on the other side
      await waitFor((X) => window.__game.level.yokai.find((y) => Math.abs(y.x - X) < 1).cx > X + 70, 8000, Y.x);
      await paint(ringPts(Y.x - 150, Y.y, 60, { a0: 0, sweep: 378, n: 30 }));
      const rings = await playerRings();
      const ok = await waitFor((seq) => window.__game.portals.events.some((e) => e.seq > seq && e.kind === 'pass' && e.what === 'yokai'), 10000, seq0);
      const pass = (await events(seq0)).find((e) => e.kind === 'pass' && e.what === 'yokai');
      await wait(500);
      const after = await G((X) => {
        const y = window.__game.level.yokai.find((y) => Math.abs(y.cy - y.y) < 400 && y.alive && Math.abs(y.x - X) > 50);
        return y ? { cx: y.cx, cy: y.cy } : null;
      }, Y.x);
      const exitRing = rings.find((r) => r.id === pass?.exit);
      await check(
        ok && !!exitRing && Math.abs(exitRing.cx - B.x) < 30 && !!after && Math.hypot(after.cx - exitRing.cx, after.cy - exitRing.cy) < 200,
        'a yokai comes out of the exit',
        pass ? `from (${pass.from.x.toFixed(0)}, ${pass.from.y.toFixed(0)}) to (${pass.at.x.toFixed(0)}, ${pass.at.y.toFixed(0)}); hovering at (${after?.cx.toFixed(0)}, ${after?.cy.toFixed(0)}) 0.5 s later` : 'no yokai pass',
      );
    });

    // ── 6. a projectile comes out (festival sparks through the generic projectile path)
    await scenario('spark', async () => {
      const info = await station('spark');
      await waitFor(() => window.__game.stuckT > 0.2, 8000);
      const drops = await G(() => window.__proof.S.station.droppers.map((d) => d.x));
      const b = info.brambles[0];
      const gy = ground(info, drops[0]);
      const B = { x: drops[1] + 150, y: gy - 330 };
      const aim = (Math.atan2(b.y - b.h / 2 - B.y, b.x + b.w / 2 - B.x) * 180) / Math.PI;
      const seq0 = await lastSeq();
      await paint(ringPts(drops[0], gy - 150, 55, { a0: 0, sweep: 378, n: 30 }));
      await paint(ringPts(B.x, B.y, 50, { a0: 180, sweep: 378, n: 30, tail: aim, tailLen: 70 }));
      const rings = await playerRings();
      const ok = await waitFor((seq) => window.__game.portals.events.some((e) => e.seq > seq && e.kind === 'pass' && e.what === 'spark'), 9000, seq0);
      await wait(1500);
      const ev = await events(seq0);
      const pass = ev.find((e) => e.kind === 'pass' && e.what === 'spark');
      const exitRing = rings.find((r) => r.id === pass?.exit);
      await check(
        ok && !!exitRing && Math.abs(exitRing.cx - B.x) < 30 && Math.abs(pass.speedOut - 400) < 1 && angDiff(deg(pass.vout), deg(exitRing.spout)) < 1,
        'a projectile (spark) comes out of the exit along the spout',
        pass ? `in ${pass.speedIn.toFixed(0)} @${deg(pass.vin).toFixed(0)}° → out ${pass.speedOut.toFixed(0)} @${deg(pass.vout).toFixed(0)}°, aim assist ${((pass.bend * 180) / Math.PI).toFixed(1)}°` : 'no spark pass',
      );
      const hit = ev.find((e) => e.kind === 'hit' && e.target === 'thicket');
      const echo = ev.find((e) => e.kind === 'echo');
      await check(!!hit && !!echo && echo.refund === 15, 'the spark burns the thicket it was aimed at, echo refund +15', echo ? `ink after echo ${echo.ink.toFixed(1)}` : hit ? 'hit but no echo' : 'missed');
    });

    // ── 7. illegal rings fizzle with the right label and a half refund
    const fizzleCheck = async (what, want, pts) => {
      const seq0 = await lastSeq();
      await paint(pts);
      await wait(80);
      const e = (await events(seq0)).find((e) => e.kind === 'fizzle');
      const ok = !!e && e.label === want && Math.abs(e.refund - e.cost / 2) < 1e-6 && Math.abs(e.inkAfter - e.inkBefore - e.refund) < 0.01 && e.cost > 1;
      await check(ok, `an illegal ring (${what}) fizzles as "${want}" with half its ink back`, e ? `label "${e.label}", cost ${e.cost.toFixed(1)}, refund ${e.refund.toFixed(1)}, ink ${e.inkBefore.toFixed(1)} → ${e.inkAfter.toFixed(1)}` : 'no fizzle');
    };
    await scenario('illegal', async () => {
      const info = await station('blocked');
      await waitFor(() => window.__game.stuckT > 0.2, 8000);
      const p = info.pillars[0];
      const b = info.brambles[0];
      const gy = ground(info, p.x - 100);
      await fizzleCheck('over a thicket', 'blocked', ringPts(b.x + b.w / 2, b.y - b.h / 2, 60, { a0: 0, sweep: 378, n: 30 }));
      await fizzleCheck('tiny', 'too small', ringPts(p.x - 70, gy - 300, 24, { a0: 0, sweep: 380, n: 22 }));
      await fizzleCheck('unclosed hook', 'open', ringPts(p.x - 90, gy - 280, 60, { a0: 0, sweep: 210, n: 18 }));

      // ── 8. undo removes a ring with a half refund
      const seq0 = await lastSeq();
      await paint(ringPts(p.x - 110, gy - 300, 55, { a0: 0, sweep: 378, n: 30 }));
      const made = (await playerRings()).at(-1);
      const before = (await traveler()).ink;
      const tUndo = Date.now();
      if (phone) {
        await tap('#pause-button');
        await page.waitForSelector('#btn-undo:not([disabled])', { timeout: 2000 });
        await tap('#btn-undo');
      } else await page.mouse.click(800, 160, { button: 'right' });
      await wait(120);
      const after = (await traveler()).ink;
      // ink also refills (28 per second of game time) while the taps happen: allow for that, never less than the refund
      const regen = (28 * (Date.now() - tUndo)) / 1000;
      const u = (await events(seq0)).find((e) => e.kind === 'undo');
      const left = await playerRings();
      await check(
        !!made && !!u && u.id === made.id && Math.abs(u.refund - made.cost / 2) < 1e-6 && !left.some((r) => r.id === made.id) && after - before >= u.refund - 0.3 && after - before <= u.refund + regen + 0.5,
        `undo (${phone ? 'pause sheet' : 'right click'}) removes a ring with half refund`,
        u ? `ring #${u.id} cost ${made.cost.toFixed(1)}, refund ${u.refund.toFixed(1)}, ink ${before.toFixed(1)} → ${after.toFixed(1)}` : 'no undo event',
      );
    });
    await scenario('reach', async () => {
      // ── too far: the span cap (650) measured from the waiting ring; a door that fits still links
      const info = await station('reach');
      await setKnob('Span cap', '650');
      await waitFor(() => window.__game.stuckT > 0.2, 8000);
      const t = await traveler();
      const [p1, p2] = info.pillars;
      const gy = ground(info, p1.x - 50);
      await paint(ringPts(t.x, t.y - 40, 56, { a0: 180, sweep: 380, n: 32 }));
      await fizzleCheck('beyond the reach cap', 'too far', ringPts(p2.x + p2.w + 260, gy - 70, 52, { a0: 90, sweep: 380, n: 30 }));
      const seq0 = await lastSeq();
      await paint(ringPts(p2.x + p2.w + 40, gy - 70, 50, { a0: 90, sweep: 380, n: 30 }));
      const link = (await events(seq0)).find((e) => e.kind === 'link');
      const passed = await waitFor((seq) => window.__game.portals.events.some((e) => e.seq > seq && e.kind === 'pass' && e.what === 'traveler'), 3000, seq0);
      await check(!!link && link.span <= 650 && passed, 'a door inside the reach links and takes the stopped traveler past two pillars (E1)', link ? `span ${link.span.toFixed(0)} of 650` : 'no link');
      await setKnob('Span cap', 'none');
    });
    // ── the A/B switches: strict pairs vs "the used entry closes", and line aim
    await scenario('ab', async () => {
      await station('reach');
      await waitFor(() => window.__game.stuckT > 0.2, 8000);
      const t = await traveler();
      const gy = t.y;
      const spots = [
        { x: t.x - 120, y: gy - 300 },
        { x: t.x - 20, y: gy - 200 },
        { x: t.x - 130, y: gy - 170 },
      ];
      await setKnob('Pairing', 'strict pairs');
      for (const q of spots) await paint(ringPts(q.x, q.y, 45, { a0: 0, sweep: 380, n: 26 }));
      const strict = await playerRings();
      await setKnob('Pairing', 'used entry closes');
      // five rings outrun Kohaku's inkwell (100): let it refill (28/s) between them, as a player would
      await waitFor(() => window.__game.inkAmt > 60, 4000);
      await paint(ringPts(t.x - 60, gy - 390, 50, { a0: 0, sweep: 380, n: 26 }));
      const four = await playerRings();
      await waitFor(() => window.__game.inkAmt > 60, 4000);
      await lastSeq();
      await paint(ringPts(spots[1].x, spots[1].y, 45, { a0: 0, sweep: 380, n: 26 }));
      const five = await playerRings();
      await check(
        strict.length === 1 && strict[0].state === 'waiting' && four.length === 2 && four.every((r) => r.state === 'linked') && five.length === 2 && five.every((r) => r.state === 'linked') && five.some((r) => r.id === four.at(-1).id) && five.some((r) => !four.some((q) => q.id === r.id)),
        'pairing A/B: strict pairs leave a third ring alone; "used entry closes" keeps the newer ring (nothing went in: the older closes)',
        `strict → ${strict.map((r) => '#' + r.id + ' ' + r.state).join(', ')}; then ${four.map((r) => '#' + r.id).join('+')}; then ${five.map((r) => '#' + r.id).join('+')}`,
      );
      await setKnob('Aim', 'line aim');
      const dirs = await G(() => {
        const P = window.__game.portals;
        const [a, b] = P.playerRings();
        const d = P.exitDir(b);
        const want = Math.atan2(b.cy - a.cy, b.cx - a.cx);
        return { got: Math.atan2(d.y, d.x), want };
      });
      await setKnob('Aim', 'tail flick');
      await check(Math.abs(dirs.got - dirs.want) < 1e-6, 'aim A/B: line aim sends things out along entry centre → exit centre', `${((dirs.got * 180) / Math.PI).toFixed(1)}°`);
    });
    if (errors.length) console.log('PAGE ERRORS:\n' + errors.join('\n'));
    await check(!errors.length, 'no page errors on the proof page');

    // ── 9. purple is not offered on the First Scroll
    await scenario('first', async () => {
      await page.goto(`${URL}?play=${char}&level=first`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__game?.state === 'play', { timeout: 20000 });
      await page.waitForFunction(() => window.__game.introT >= 1.5, { timeout: 10000 });
      const s0 = await G(() => ({ inks: [...window.__game.rules.inks], stones: window.__game.stoneLayout().map((s) => s.k), ink: window.__game.ink }));
      if (!phone) await page.keyboard.press('Digit4');
      else {
        // tap where a fourth stone would sit: right of the last one
        const pos = await G(() => {
          const g = window.__game;
          const r = g.canvas.getBoundingClientRect();
          const st = g.stoneLayout();
          const a = st[st.length - 1];
          const gap = st.length > 1 ? a.x - st[st.length - 2].x : 90;
          return { x: r.left + ((a.x + gap) * r.width) / g.W, y: r.top + (a.y * r.height) / g.H };
        });
        await page.touchscreen.tap(pos.x, pos.y);
      }
      await wait(100);
      const ink = await G(() => window.__game.ink);
      await check(
        !s0.inks.includes('murasaki') && !s0.stones.includes('murasaki') && s0.stones.length === 3 && ink !== 'murasaki',
        'purple is not offered on the First Scroll',
        `inks ${s0.inks.join(',')}, stones ${s0.stones.join(',')}, after ${phone ? 'a tap past the stones' : 'key 4'} ink ${ink}`,
      );
    });
  } catch (e) {
    await check(false, `harness error: ${e.message}`);
    console.log(e.stack);
  } finally {
    await page.close();
  }
  const ok = results.every((r) => r.ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${tag}: ${results.filter((r) => r.ok).length}/${results.length}`);
}

try {
  if (which === 'all' || which === 'desktop') await device(false);
  if (which === 'all' || which === 'phone') await device(true);
} finally {
  await browser.close();
}
const ok = allResults.length > 0 && allResults.every(Boolean);
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
