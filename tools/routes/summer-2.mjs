// Usage: flock /tmp/inkrunner-browser.lock node tools/routes/summer-2.mjs [desktop|phone|both] [runs=3]   (env URL, CHAR=ren|kohaku|both, VERBOSE=1)
//        flock /tmp/inkrunner-browser.lock node tools/routes/summer-2.mjs capture [desktop|phone|both]   (env CHAR=ren)
//          plays the route once per device and writes a frame of each beat, a stitched strip and the game's own
//          Full scroll export under shots/rough/summer-2/ (frames are never taken while a finger is down).
//        flock /tmp/inkrunner-browser.lock node tools/routes/summer-2.mjs perf   (env CHAR=ren, THROTTLE=4)
//          plays the whole line at 1600x900 under CPU throttling and prints update+render p50/p95/max per beat.
// summer-2 承 踊 The Dance Ground: the INTENDED line of docs/summer-design.md 3.2, played with real input (mouse and
// keyboard at 1600x900; one finger on an iPhone 13 in landscape) as Ren and as Kohaku. Passes when every run
// finishes at Bamboo or better. Prints each run's grade, time, falls and ink. Exits 1 otherwise.
//
// The line, beat by beat (world x; y grows down, the road is at y 520, the S5 ledge at y 260):
//   S1  her pair and the two demo sparks play themselves: nothing to do.
//   S2  stopped at the thicket (2290): ring A on the looping spark's line (1940, 370), ring B the window
//       (2210, 390), painted once stopped, with the default spout (straight ahead): the next spark goes A -> B and burns the thicket.
//   S3  spark 3520 + yokai 3840: A on the spark's line above your head (3520, 380), B left of the yokai at its
//       height (3700, 370), tail flicked straight at it. The spark goes A -> B and bursts the yokai.
//   S4  a vermilion bridge over the 520 gap, then A over the spark's mark above head height (4780, 380) and B
//       over the gap (4560, 250) with its tail flicked straight up: the spark goes up and away.
//   S5  a vermilion ramp up the 260 wall, then an indigo stroke through the fire on the ledge.
//   S6  The Window: A on spark 1's line (6780, 140), then B the window (7330, 140), its default spout straight
//       along both yokai; once spark 1 has gone A -> B, C on spark 2's line (7130, 140) closes A (the ring last
//       entered) and B stays: spark 2 goes C -> B.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { bambooOrBetter, launch, line, runRoute } from './lib.mjs';

const which = process.argv[2] ?? 'both';
const runs = Number(process.argv[3] ?? 3);

export const plan = [
  // S2 the thicket sandbox (the spark loops from x 2000; you stop at about 2277). Ring A goes on the spark's line
  // while running; B, the window, only once the traveler has stopped (a short wait lets the camera settle): painted
  // on the run it drifted 15-35 u right with page timing, and at cx >= 2250 it fizzles against the thicket (2290).
  { at: 2150, ring: [1940, 370, 46] },
  { at: 2270, wait: 300 },
  { at: 2270, ring: [2210, 390, 44] },
  // S3 one pair for a spark and a yokai (the spark's telegraph starts at 3055)
  { at: 3075, ring: [3520, 380, 45] },
  { at: 3075, ring: [3700, 370, 45, 0] },
  // S4 the bridge, then the catch (the spark's telegraph starts at 4315)
  // the bridge's walking surface (its top edge) must meet the far lip (x 4640, y 519) within the 22 u step-up: at
  // y 552 it met it about 20 u low, and a few u of camera drift on a phone left the traveler standing at the lip
  { at: 3900, ink: 'shu', paint: line(4050, 540, 4720, 534, 26) },
  { at: 4330, ring: [4780, 380, 45] },
  { at: 4330, ring: [4560, 250, 45, -90] },
  // S5 a vermilion ramp up the wall, then indigo through the fire. The ramp must meet the wall high enough: when
  // the traveler's front foot reaches the face (x 5460, traveler at 5447) the feet must be within the 22 u
  // step-up of the lip (y 262). This one is at y 249 there (a lower ramp leaves the traveler standing at the wall).
  { at: 4960, ink: 'shu', paint: line(5170, 548, 5480, 220, 20) },
  { at: 5520, ink: 'ai', paint: line(5790, 112, 6010, 112, 12) },
  // S6 The Window (spark 1's telegraph starts at 6315, spark 2's at 6665): A on spark 1's line, then B the window
  // (its default spout, straight ahead, already points along both yokai). The pair must link before spark 1
  // reaches A (about x 6660). C on spark 2's line once spark 1 has gone through A (about x 6663).
  { at: 6470, ring: [6780, 140, 45] },
  { at: 6470, ring: [7330, 140, 45] },
  { at: 6720, ring: [7130, 140, 45] },
];

/** Beat frames: the traveler's x when each is taken (chosen so the hazard and its answer are both on screen). */
const FRAMES = [
  ['s0-story-line', 300],
  ['s1a-demo-spark', 820],
  ['s1b-her-rings', 1120],
  ['s2-thicket-window', 2268, 1400], // once stopped 1.4 s: both rings painted, the next spark on its way
  ['s3-spark-yokai', 3330],
  ['s4-bridge-catch', 4470],
  ['s5-ramp-fire', 5330],
  ['s5b-ledge', 5700],
  ['s6-great-firework', 6560],
  ['s6-the-window', 6950],
  ['s6-second-yokai', 7300],
  ['torii', 8400],
];

async function capture(devices, char) {
  const dir = 'shots/rough/summer-2';
  mkdirSync(dir, { recursive: true });
  const browser = await launch();
  try {
    for (const device of devices) {
      let page = null;
      let finger = false;
      let done = false;
      // a screenshot in flight: a finger waits for it, so no frame is ever taken while a touch is held
      let shooting = Promise.resolve();
      const snap = (path) => {
        shooting = page.screenshot({ path }).catch(() => {});
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
        let prevX = null;
        let stillSince = 0;
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
          // nor just before or while a step paints: a screenshot stalls the page between the route placing a
          // stroke on the glass and the touch landing, and the camera drifts under it
          // (a stopped traveler's camera does not drift, so frames are fine then)
          const moving = prevX === null || Math.abs(st.x - prevX) > 0.5;
          if (moving) stillSince = Date.now();
          prevX = st.x;
          if (moving && plan.some((p) => st.x >= p.at - 40 && st.x <= p.at + 120)) continue;
          if (next < FRAMES.length && st.x >= FRAMES[next][1]) {
            const [name, at, still = 0] = FRAMES[next];
            if (still && st.x - at < 250 && Date.now() - stillSince < still) continue;
            next++;
            if (st.x - at < 250 && !finger) await snap(`${dir}/${device}-${name}.png`);
          } else if (device === 'desktop' && st.x >= stripX && !finger) {
            const path = `${tmpdir()}/summer-2-strip-${String(strip.length).padStart(2, '0')}.png`;
            await snap(path);
            strip.push(path);
            stripX += 1100;
          }
        }
      })();
      const r = await runRoute({ level: 'summer-2', char, device, plan, browser: wrap, timeout: 200000, shot: `${dir}/${device}-finish.png` });
      done = true;
      await shots;
      console.log(`capture ${device} ${char}: ${r.finished ? 'finished' : 'DID NOT FINISH'} grade ${r.gradeName ?? '-'} time ${r.time.toFixed(1)}s falls ${r.falls} ink ${r.ink.toFixed(0)}`);
      if (device === 'desktop' && strip.length > 1) {
        // a stitched strip of frames 1100 u apart, each scaled to 640 wide
        const args = strip.flatMap((p) => ['-i', p]);
        const filter = strip.map((_, i) => `[${i}:v]scale=640:-1[v${i}]`).join(';') + ';' + strip.map((_, i) => `[v${i}]`).join('') + `hstack=inputs=${strip.length}`;
        execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args, '-filter_complex', filter, `${dir}/strip-desktop.png`]);
        console.log(`strip: ${dir}/strip-desktop.png (${strip.length} frames)`);
      }
    }
  } finally {
    await browser.close();
  }
}

/**
 * The whole intended line under CPU throttling (desktop, 1600x900), timing the game's own update() + render() the
 * way tools/perf.mjs does (the wrappers only read the clock), reported for the whole scroll and per beat, so the
 * busiest beat (S6: the great firework, two sparks, three rings, two yokai) is measured, not just the opening.
 */
async function perfRoute(char, throttle = 4, budget = 8) {
  const browser = await launch();
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
    const r = await runRoute({ level: 'summer-2', char, device: 'desktop', plan, browser: wrap, timeout: 400000 });
    done = true;
    await pull;
    const q = (arr, k) => {
      const f = arr.map((a) => a[0]).sort((a, z) => a - z);
      return f.length ? f[Math.min(f.length - 1, Math.floor(k * f.length))] : NaN;
    };
    const beats = [['start-S1', 0], ['S2', 2000], ['S3', 3000], ['S4', 4000], ['S5', 5300], ['S6', 6300], ['finish', 7930]];
    console.log(`perf-route summer-2 as ${char}: ${r.finished ? 'finished' : 'DID NOT FINISH'} grade ${r.gradeName ?? '-'} falls ${r.falls}; ${frames.length} frames at 1600x900 under ${throttle}x CPU throttle`);
    for (let i = 0; i < beats.length; i++) {
      const lo = beats[i][1];
      const hi = beats[i + 1]?.[1] ?? Infinity;
      const part = frames.filter((f) => f[1] >= lo && f[1] < hi);
      console.log(`  ${beats[i][0].padEnd(9)} x ${String(lo).padStart(5)}+  frames ${String(part.length).padStart(4)}  p50 ${q(part, 0.5).toFixed(2)}  p95 ${q(part, 0.95).toFixed(2)}  max ${q(part, 1).toFixed(2)} ms`);
    }
    const p95 = q(frames, 0.95);
    console.log(`  whole scroll p50 ${q(frames, 0.5).toFixed(2)}  p95 ${p95.toFixed(2)}  max ${q(frames, 1).toFixed(2)} ms (budget p95 <= ${budget})`);
    console.log(p95 <= budget ? 'PERF-ROUTE PASS' : 'PERF-ROUTE FAIL');
    return p95 <= budget;
  } finally {
    done = true;
    await browser.close();
  }
}

/**
 * proveRoute() from lib.mjs, made robust to this machine's intermittent 'Unable to capture screenshot' (seen in
 * several runs on the dev machine since the afternoon of Oct 8, on scrolls whose code had not changed): the finish
 * frame is taken by a guarded hook that cannot fail the run, and a run whose browser itself breaks (protocol
 * timeout, detached frame) is printed as VOID and played again on a fresh browser, at most twice per run. A void
 * run is never counted as a pass: every one of the `runs` runs must finish at Bamboo or better.
 */
async function prove({ name, level, char, plan, devices, runs, verbose }) {
  let ok = true;
  let browser = await launch();
  try {
    for (const device of devices) {
      for (let k = 1; k <= runs; k++) {
        mkdirSync('shots/rough/routes', { recursive: true });
        const shot = `shots/rough/routes/${name}-${device}-${k}.png`;
        let r = null;
        for (let attempt = 0; attempt < 3 && !r; attempt++) {
          const wrap = {
            newPage: async () => {
              const page = await browser.newPage();
              const close = page.close.bind(page);
              page.close = async (...a) => {
                await new Promise((r) => setTimeout(r, 1500)); // let the finish screen settle, as lib.mjs does
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
            browser = await launch();
          }
        }
        if (!r) {
          ok = false;
          console.log(`FAIL ${name} ${device} run ${k}/${runs}: the browser broke three times`);
          continue;
        }
        const pass = bambooOrBetter(r);
        ok &&= pass;
        console.log(`${pass ? 'PASS' : 'FAIL'} ${name} ${device} run ${k}/${runs}: ${r.finished ? 'finished' : 'DID NOT FINISH'} grade ${r.gradeName ?? '-'} time ${r.time.toFixed(1)}s (par ${r.par[0].toFixed(1)}) falls ${r.falls} ink ${r.ink.toFixed(0)} (par ${r.par[1]}) steps ${r.steps}`);
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

if (import.meta.url === `file://${process.argv[1]}` && process.argv[2] === 'perf') {
  const ok = await perfRoute(process.env.CHAR ?? 'ren', Number(process.env.THROTTLE ?? 4));
  process.exit(ok ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}` && process.argv[2] === 'capture') {
  const which2 = process.argv[3] ?? 'both';
  await capture(which2 === 'both' ? ['desktop', 'phone'] : [which2], process.env.CHAR ?? 'ren');
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const devices = which === 'both' ? ['desktop', 'phone'] : [which];
  const chars = (process.env.CHAR ?? 'both') === 'both' ? ['ren', 'kohaku'] : [process.env.CHAR];
  let ok = true;
  for (const char of chars) {
    console.log(`── summer-2 as ${char}`);
    ok = (await prove({ name: `summer-2-${char}`, level: 'summer-2', char, plan, devices, runs, verbose: process.env.VERBOSE === '1' })) && ok;
  }
  console.log(ok ? `ROUTE PASS: summer-2, ${chars.join(' and ')}, ${devices.join(' and ')}, ${runs} of ${runs} at Bamboo or better` : 'ROUTE FAIL: summer-2');
  process.exit(ok ? 0 : 1);
}
