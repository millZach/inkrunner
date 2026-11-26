// Usage: flock /tmp/inkrunner-browser.lock node tools/routes/summer-4.mjs [desktop|phone|both] [runs=3] [ren|kohaku|both]
//          (env URL, CHAR, VERBOSE=1) the done-check: every run must finish at Bamboo or better.
//        flock /tmp/inkrunner-browser.lock node tools/routes/summer-4.mjs capture [desktop|phone|both]   (env CHAR=ren)
//          plays the route once per device and writes a frame of each beat, a stitched strip and the game's own
//          Full scroll export under shots/rough/summer-4/ (frames are never taken while a finger is down).
//        flock /tmp/inkrunner-browser.lock node tools/routes/summer-4.mjs perf   (env CHAR=ren, THROTTLE=4)
//          plays the whole line at 1600x900 under CPU throttling and prints update+render p50/p95/max per beat.
// summer-4 結 送 The Last Night: the autoplay route along the INTENDED lines of docs/summer-design.md section 3.4,
// played with real input (mouse and keyboard at 1600x900, one-finger touch on an iPhone 13 in landscape), as Ren
// and as Kohaku. Prints each run's grade, time, falls and ink. Exits 1 unless every run passes.
//
// The lines, beat by beat (world x of the traveler when each step fires; y grows down):
//   E1  one pair spanning both pillars, A (940, 475) and B (1540, 475); then a dry bridge over 1740-2160
//   E2  one pair across the rain gap, A (2830, 475) and B (3460, 475): the exit passes the bolt's trigger
//   E3  a ramp up the 240 wall (in rain, painted late; Kohaku: a fox leap); A on the bolt's thread above head
//       (4240, 150), B the window left of the thicket (4560, 160): the bolt goes A → B and burns the thicket
//   E4  A before the pillar (5320, 235), then B in the air over the gap's last 100 u (5900, 220). A is about 760 u
//       from E3's window, so it closes E3's spent pair and starts a fresh one (no hop needed).
//   E5  the drum run, as 3.4 lists it: A (7020, 300) and the window B (7470, 250) aimed level at the yokai row
//       (250 up); C (7320, 300) after bolt 1, D (7620, 300) after bolt 2 (each new ring closes the entry the last
//       bolt used; the window stays). The run checks that all three yokai burst (E5_CHECK below).
//   E6a a late ramp up the 300 wall and an indigo stroke through the fire
//   E6b a late bridge over the dropping gap; A on the bolt's thread (10640, 170), B (10900, 180) aimed at the yokai
//   E6c A before the pillar (11620, 255), B on the far ground (12220, 255). A is about 720 u from E6b's window, so
//       it closes E6b's spent pair and starts a fresh one (the scroll moved E6c 400 u later for this).
//
// No step hops into a spent window: nothing in the game teaches that, so the route does not use it.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import puppeteer from 'puppeteer-core';
import { bambooOrBetter, line, ring, runRoute } from './lib.mjs';

const mode = ['capture', 'perf'].includes(process.argv[2]) ? process.argv[2] : 'prove';
const which = (mode === 'prove' ? process.argv[2] : process.argv[3]) ?? 'both';
const runs = Number(process.argv[3] ?? 3);
const charArg = (mode === 'prove' ? process.argv[4] : null) ?? process.env.CHAR ?? (mode === 'prove' ? 'both' : 'ren');
const chars = charArg === 'both' ? ['ren', 'kohaku'] : [charArg];

/**
 * A ring step. Drawn with 18° steps (about 21 points and a short tail) so a ring takes the route about as long as
 * a quick hand: slow motion drains the inkwell per REAL second while the brush is down (4.5/s here), and a slow
 * 37-point ring cost Kohaku the ink for E3's second ring.
 */
const R = (at, cx, cy, r, aim = null) => ({ at, ink: 'murasaki', paint: ring(cx, cy, r, aim, { step: 18 }) });

/**
 * A ramp that starts flat on the ground at (x0, gy) and climbs to just above a wall's lip (x1, y1): the foot is
 * laid along the ground for 40 u so the traveler steps onto it rather than meeting its lower end below the surface.
 */
const ramp = (x0, gy, x1, y1) => [{ x: x0, y: gy + 4 }, { x: x0 + 40, y: gy + 2 }, ...line(x0 + 60, gy, x1, y1, 16).slice(1)];

/** The intended lines (3.4). Kohaku takes E3's wall with his fox leap, which 3.4 names in the intended line. */
export function planFor(char) {
  const fox = char === 'kohaku';
  return [
    // E1: the pair over both pillars, then the dry bridge
    R(760, 940, 475, 48),
    R(765, 1540, 475, 48),
    { at: 1600, ink: 'shu', paint: line(1700, 545, 2200, 545, 24) },
    // E2: the door that dodges
    R(2640, 2830, 475, 48),
    R(2645, 3460, 475, 48),
    // E3: up the 240 wall (Ren: a late ramp, in rain; Kohaku: a fox leap), with the catch pair painted once the
    // window is in view (the camera holds still under the brush, so it lags a little after a stroke); the
    // window's default spout points straight at the thicket
    ...(fox
      ? [R(3790, 4560, 160, 45), R(3795, 4240, 150, 45), { at: 3900, jump: 390 }, { at: 4030, jump: 300 }]
      : [{ at: 3700, ink: 'shu', paint: ramp(3780, 520, 4136, 266) }, R(3900, 4560, 160, 45), R(3905, 4240, 150, 45)]),
    // E4: the door before the pillar first, then the exit in the air. Door first matters (design 1.3 rule 4): the
    // ring that completes a pair never grabs what is already inside it. With the exit painted first, a slow page
    // (1.2 s per ring) finished the door with the traveler already at the pillar inside its disc, and he stood
    // there for good (Kohaku phone, 1 run in 6). Painted first, the door captures him even if he is inside it.
    R(5140, 5320, 235, 45),
    R(5145, 5900, 220, 45),
    // E5: the drum run (the window first, its spout a touch up the yokai row at y 230), then the catch rings at the
    // design's y 300 on each bolt's thread
    R(6765, 7470, 250, 45, -3),
    R(6770, 7020, 300, 45),
    R(7045, 7320, 300, 45),
    R(7345, 7620, 300, 45),
    // E6a: a late ramp (rain) and indigo through the fire. The ramp's top must clear the lip by a wide margin. When
    // the traveler's front foot reaches the face (x 8920, traveler at 8907) the old ramp (to (8938, 166)) left his
    // feet about 10 u inside the 22 u step-up as planned, but on a phone the painted stroke came out about 13 u
    // lower (traveler at y 218 on it at x 8893, planned surface about 205): he stood on the ramp against the face
    // until it washed, dropped to the foot and stood there (Kohaku phone, caught with stroke logging; the older
    // Ren phone stalls looked the same). This ramp is about 30 u above the lip at 8907 and drops him onto the ledge.
    { at: 8480, ink: 'shu', paint: ramp(8560, 480, 8940, 120) },
    { at: 8960, ink: 'ai', paint: line(9320, 78, 9480, 78, 8) },
    // E6b: a late bridge (rain), then the catch pair aimed at the yokai
    { at: 9960, ink: 'shu', paint: line(10030, 200, 10510, 320, 24) },
    R(10140, 10900, 180, 45),
    R(10145, 10640, 170, 45),
    // E6c: one pair over the pillar and the gap
    R(11470, 11620, 255, 45),
    R(11490, 12220, 255, 45),
  ];
}
export const plan = planFor('ren');

/**
 * The one headless browser (callers hold the flock). Like lib.mjs launch(), but Chromium's shared memory stays in
 * /dev/shm: puppeteer's default --disable-dev-shm-usage puts it in /tmp, and with /tmp (a tmpfs) at 80% on the dev machine
 * on Oct 8 every page crashed on load (GPU CommandBufferHelper::AllocateRingBuffer() failed), on every scroll.
 */
function launchShm() {
  return puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: 'new',
    ignoreDefaultArgs: ['--disable-dev-shm-usage'],
    args: ['--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  });
}

/**
 * E5_CHECK: the drum run must play as 3.4 lists it. Watched in the page: the most rings any one projectile has
 * passed through (a bolt that loops D → B → D runs this up into the hundreds), and at the finish which of the
 * three drum-run yokai (x 7920, 8120, 8320) are still alive. A run passes E5 when all three burst and no
 * projectile passed more than 2 rings.
 */
const E5_WATCH = () => {
  window.__e5 = { maxThrough: 0 };
  setInterval(() => {
    const g = window.__game;
    if (!g?.portals) return;
    for (const p of g.portals.projectiles) window.__e5.maxThrough = Math.max(window.__e5.maxThrough, p.through ?? 0);
  }, 30);
};
const E5_READ = () => {
  const g = window.__game;
  const row = g.level.yokai.filter((y) => y.x >= 7900 && y.x <= 8340);
  return { alive: row.filter((y) => y.alive).length, n: row.length, maxThrough: window.__e5?.maxThrough ?? -1 };
};

/**
 * proveRoute() from lib.mjs, made robust to this machine's browser faults (the same approach as summer-2's route):
 * the finish frame is taken by a guarded hook that cannot fail the run ('Unable to capture screenshot' is common on
 * the dev machine with iPhone emulation), and a run whose browser itself breaks (page crash, protocol timeout, detached frame)
 * is printed as VOID and played again on a fresh browser, at most twice per run. A void run never counts as a pass:
 * each of the `runs` runs must finish at Bamboo or better.
 */
async function prove({ name, level, char, plan, devices, runs, verbose }) {
  let ok = true;
  let browser = await launchShm();
  try {
    for (const device of devices) {
      for (let k = 1; k <= runs; k++) {
        mkdirSync('shots/rough/routes', { recursive: true });
        const shot = `shots/rough/routes/${name}-${device}-${k}.png`;
        let r = null;
        let e5 = null;
        for (let attempt = 0; attempt < 3 && !r; attempt++) {
          e5 = null;
          const wrap = {
            newPage: async () => {
              const page = await browser.newPage();
              await page.evaluateOnNewDocument(E5_WATCH);
              const close = page.close.bind(page);
              page.close = async (...a) => {
                e5 = await page.evaluate(E5_READ).catch(() => null);
                await new Promise((res) => setTimeout(res, 1500)); // let the finish screen settle, as lib.mjs does
                await Promise.race([page.screenshot({ path: shot }), new Promise((_, no) => setTimeout(() => no(new Error('timed out')), 10000))]).catch((e) => console.log(`  (finish frame not saved: ${e.message})`));
                return close(...a);
              };
              return page;
            },
          };
          try {
            r = await runRoute({ level, char, device, plan, browser: wrap, verbose });
          } catch (e) {
            console.log(`VOID ${name} ${device} run ${k}/${runs}: the browser broke (${e.message.split('\n')[0]}); playing it again`);
            await browser.close().catch(() => {});
            browser = await launchShm();
          }
        }
        if (!r) {
          ok = false;
          console.log(`FAIL ${name} ${device} run ${k}/${runs}: the browser broke three times`);
          continue;
        }
        const e5ok = !!e5 && e5.n === 3 && e5.alive === 0 && e5.maxThrough <= 2;
        const pass = bambooOrBetter(r) && e5ok;
        ok &&= pass;
        const e5txt = e5 ? `E5 yokai burst ${e5.n - e5.alive}/${e5.n}, most rings per projectile ${e5.maxThrough}` : 'E5 not read';
        console.log(`${pass ? 'PASS' : 'FAIL'} ${name} ${device} run ${k}/${runs}: ${r.finished ? 'finished' : 'DID NOT FINISH'} grade ${r.gradeName ?? '-'} time ${r.time.toFixed(1)}s (par ${r.par[0].toFixed(1)}) falls ${r.falls} ink ${r.ink.toFixed(0)} (par ${r.par[1]}) steps ${r.steps}; ${e5txt}`);
        if (r.errors.length) console.log('  page errors:\n  ' + r.errors.join('\n  '));
        if (!pass && !verbose) console.log('  ' + r.log.join('\n  '));
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }
  console.log(ok ? `ALL PASS: ${name} finished ${runs} of ${runs} at Bamboo or better on ${devices.join(' and ')}` : `FAIL: ${name}`);
  return ok;
}

/** Beat frames: the traveler's x when each is taken (the hazard and its answer both on screen). */
const FRAMES = [
  ['e0-story-bolt', 700],
  ['e1-pillars', 900],
  ['e1-bridge', 1800],
  ['e2-door', 2700],
  ['e2-out', 3480],
  ['e3-wall-catch', 4000],
  ['e3-burn', 4480],
  ['e4-air-exit', 5280],
  ['e4-landed', 6080],
  ['e4-flash', 6220],
  ['e5-drum-run', 6900],
  ['e5-drum2', 7300],
  ['e5-yokai', 7700],
  ['e6a-wall', 8700],
  ['e6a-fire', 9200],
  ['e6b-bridge', 10000],
  ['e6b-catch', 10560],
  ['e6c-door', 11500],
  ['e6c-out', 12260],
  ['torii', 13200],
];

/**
 * One run per device with a frame of each beat, a stitched strip (desktop: frames 1100 u apart) and the game's own
 * Full scroll export, under shots/rough/summer-4/. No frame is taken while a finger is down, nor while a step paints.
 */
async function capture(devices, char) {
  const dir = 'shots/rough/summer-4';
  mkdirSync(dir, { recursive: true });
  const browser = await launchShm();
  const plan = planFor(char);
  try {
    for (const device of devices) {
      let page = null;
      let finger = false;
      let done = false;
      let shooting = Promise.resolve();
      const snap = (path) => {
        shooting = page.screenshot({ path }).catch((e) => console.log(`  (frame not saved: ${e.message})`));
        return shooting;
      };
      const strip = [];
      const wrap = {
        newPage: async () => {
          page = await browser.newPage();
          // never screenshot while a touch is held (Chromium paints a stray stroke)
          const ts = page.touchscreen;
          for (const k of ['touchStart', 'touchEnd']) {
            const f = ts[k].bind(ts);
            ts[k] = async (...a) => {
              if (k === 'touchStart') await shooting;
              finger = k === 'touchStart';
              return f(...a);
            };
          }
          return page;
        },
      };
      const shots = (async () => {
        let next = 0;
        let stripX = 200;
        let exported = false;
        while (!done) {
          await new Promise((r) => setTimeout(r, 40));
          if (!page || finger) continue;
          const st = await page.evaluate(() => (window.__route && window.__game ? { x: window.__game.px, state: window.__game.state } : null)).catch(() => null);
          if (st?.state === 'finish' && device === 'desktop' && !exported) {
            // the game's own Full scroll export (the finish screen's button runs the same function)
            exported = true;
            const b64 = await page
              .evaluate(async () => {
                const { exportScroll } = await import('/src/share.ts');
                const g = window.__game;
                const blob = await exportScroll(g, { ...g.stats, grade: g.grade() });
                const buf = new Uint8Array(await blob.arrayBuffer());
                let s = '';
                for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
                return btoa(s);
              })
              .catch((e) => (console.log('full scroll export failed:', e.message), null));
            if (b64) {
              writeFileSync(`${dir}/full-scroll.png`, Buffer.from(b64, 'base64'));
              console.log(`full scroll: ${dir}/full-scroll.png`);
            }
          }
          if (!st || st.state !== 'play') continue;
          // not just before or while a step paints (a screenshot stalls the page between placing a stroke on the
          // glass and the touch landing, and the camera drifts under it)
          if (plan.some((p) => st.x >= p.at - 40 && st.x <= p.at + 120)) continue;
          if (next < FRAMES.length && st.x >= FRAMES[next][1]) {
            const [name, at] = FRAMES[next];
            next++;
            if (st.x - at < 250 && !finger) await snap(`${dir}/${device === 'desktop' ? 'f' : 'ph'}-${name}.png`);
          } else if (device === 'desktop' && st.x >= stripX && !finger) {
            const path = `${tmpdir()}/summer-4-strip-${String(strip.length).padStart(2, '0')}.png`;
            await snap(path);
            strip.push(path);
            stripX += 1100;
          }
        }
      })();
      const r = await runRoute({ level: 'summer-4', char, device, plan, browser: wrap, timeout: 200000, shot: `${dir}/${device}-${char}-finish.png` });
      done = true;
      await shots;
      console.log(`capture ${device} ${char}: ${r.finished ? 'finished' : 'DID NOT FINISH'} grade ${r.gradeName ?? '-'} time ${r.time.toFixed(1)}s falls ${r.falls} ink ${r.ink.toFixed(0)}`);
      if (device === 'desktop' && strip.length > 1) {
        const args = strip.flatMap((p) => ['-i', p]);
        const filter = strip.map((_, i) => `[${i}:v]scale=640:-1[v${i}]`).join(';') + ';' + strip.map((_, i) => `[v${i}]`).join('') + `hstack=inputs=${strip.length}`;
        execFileSync('flock', ['/tmp/inkrunner-encode.lock', 'ffmpeg', '-y', '-loglevel', 'error', ...args, '-filter_complex', filter, `${dir}/strip-desktop.png`]);
        console.log(`strip: ${dir}/strip-desktop.png (${strip.length} frames)`);
      }
    }
  } finally {
    await browser.close();
  }
}

/**
 * The whole intended line under CPU throttling (desktop, 1600x900), timing the game's own update() + render() the
 * way tools/perf.mjs does (the wrappers only read the clock), for the whole scroll and per beat, so the busiest
 * beats (E5: three bolts, four rings, three yokai; E6b: a bolt, two rings and a yokai in rain) are measured.
 */
async function perfRoute(char, throttle = 4, budget = 8) {
  const browser = await launchShm();
  const frames = [];
  let page = null;
  let done = false;
  try {
    const wrap = {
      newPage: async () => {
        page = await browser.newPage();
        await page.evaluateOnNewDocument(() => {
          const iv = setInterval(() => {
            const G = window.__game;
            if (!G || typeof G.update !== 'function') return;
            clearInterval(iv);
            const upd = G.update.bind(G);
            const ren = G.render.bind(G);
            const st = (window.__perf = { u: 0, frames: [] });
            G.update = (dt) => {
              const t0 = performance.now();
              upd(dt);
              st.u = performance.now() - t0;
            };
            G.render = () => {
              const t0 = performance.now();
              ren();
              if (G.state === 'play' && G.introT >= 1.5) st.frames.push([st.u + performance.now() - t0, G.px]);
            };
          }, 20);
        });
        const cdp = await page.createCDPSession();
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
        return page;
      },
    };
    const pull = (async () => {
      while (!done) {
        await new Promise((r) => setTimeout(r, 500));
        const f = await page?.evaluate(() => (window.__perf ? window.__perf.frames.splice(0) : [])).catch(() => []);
        if (f) frames.push(...f);
      }
    })();
    const r = await runRoute({ level: 'summer-4', char, device: 'desktop', plan: planFor(char), browser: wrap, timeout: 400000 });
    done = true;
    await pull;
    const q = (arr, k) => {
      const f = arr.map((a) => a[0]).sort((a, z) => a - z);
      return f.length ? f[Math.min(f.length - 1, Math.floor(k * f.length))] : NaN;
    };
    const beats = [['E0-E1', 0], ['E2', 2500], ['E3', 3840], ['E4', 5000], ['L2', 6100], ['E5', 6700], ['E6a', 8400], ['E6b', 10000], ['E6c', 11300], ['finish', 12400]];
    console.log(`perf-route summer-4 as ${char}: ${r.finished ? 'finished' : 'DID NOT FINISH'} grade ${r.gradeName ?? '-'} falls ${r.falls}; ${frames.length} frames at 1600x900 under ${throttle}x CPU throttle`);
    for (let i = 0; i < beats.length; i++) {
      const lo = beats[i][1];
      const hi = beats[i + 1]?.[1] ?? Infinity;
      const part = frames.filter((f) => f[1] >= lo && f[1] < hi);
      console.log(`  ${beats[i][0].padEnd(7)} x ${String(lo).padStart(5)}+  frames ${String(part.length).padStart(4)}  p50 ${q(part, 0.5).toFixed(2)}  p95 ${q(part, 0.95).toFixed(2)}  max ${q(part, 1).toFixed(2)} ms`);
    }
    const p95 = q(frames, 0.95);
    console.log(`  whole scroll p50 ${q(frames, 0.5).toFixed(2)}  p95 ${p95.toFixed(2)}  max ${q(frames, 1).toFixed(2)} ms (budget p95 <= ${budget})`);
    const ok = r.finished && p95 <= budget;
    console.log(ok ? 'PERF-ROUTE PASS' : 'PERF-ROUTE FAIL');
    return ok;
  } finally {
    done = true;
    await browser.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const devices = which === 'both' ? ['desktop', 'phone'] : [which];
  let ok = true;
  if (mode === 'capture') {
    for (const char of chars) await capture(devices, char);
  } else if (mode === 'perf') {
    for (const char of chars) ok = (await perfRoute(char, Number(process.env.THROTTLE ?? 4))) && ok;
  } else {
    for (const char of chars) {
      console.log(`── ${char}`);
      ok = (await prove({ name: `summer-4-${char}`, level: 'summer-4', char, plan: planFor(char), devices, runs, verbose: process.env.VERBOSE === '1' })) && ok;
    }
    console.log(ok ? `ALL PASS: summer-4 as ${chars.join(' and ')}` : 'FAIL: summer-4');
  }
  process.exit(ok ? 0 : 1);
}
