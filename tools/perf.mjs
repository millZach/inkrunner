// Usage: flock /tmp/inkrunner-browser.lock node tools/perf.mjs  [env: URL, LEVEL=first, CHAR=ren, SECONDS=8, THROTTLE=4, BUDGET=8, Q=&extra=params]
// Plays a scroll with real keyboard + mouse input at 1600x900 under CPU throttling (CDP) and reports the
// per-frame update+render time (p50/p95/max), PASS when p95 <= BUDGET ms. Exits 1 on FAIL.
import puppeteer from 'puppeteer-core';

const URL = process.env.URL ?? 'http://localhost:5173/';
const LEVEL = process.env.LEVEL ?? 'first';
const CHAR = process.env.CHAR ?? 'ren';
const SECONDS = Number(process.env.SECONDS ?? 8);
const THROTTLE = Number(process.env.THROTTLE ?? 4);
const BUDGET = Number(process.env.BUDGET ?? 8);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  headless: 'new',
  args: ['--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
let code = 1;
try {
  const p = await b.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.stack ?? String(e)));
  await p.setViewport({ width: 1600, height: 900 });
  const target = `${URL}?play=${encodeURIComponent(CHAR)}&level=${encodeURIComponent(LEVEL)}${process.env.Q ?? ''}`;
  await p.goto(target, { waitUntil: 'load' });
  await p.waitForFunction(() => window.__game?.state === 'play', { timeout: 20000 });
  const info = await p.evaluate(() => ({ id: window.__game.level.id, W: window.__game.W, H: window.__game.H }));
  if (info.id !== LEVEL && !info.id.startsWith(LEVEL)) throw new Error(`asked for level "${LEVEL}" but the game loaded "${info.id}"`);

  // Time the game's own update() and render() calls from the real rAF loop. The wrappers only read the
  // clock; they never change what is simulated or drawn.
  await p.evaluate(() => {
    const G = window.__game;
    const upd = G.update.bind(G);
    const ren = G.render.bind(G);
    const st = (window.__perf = { on: false, u: 0, frames: [] });
    G.update = (dt) => {
      const t0 = performance.now();
      upd(dt);
      st.u = performance.now() - t0;
    };
    G.render = () => {
      const t0 = performance.now();
      ren();
      if (st.on) st.frames.push(st.u + performance.now() - t0);
    };
  });
  await p.waitForFunction(() => window.__game.introT >= 1.5, { timeout: 20000 });

  const cdp = await p.createCDPSession();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  await p.evaluate(() => (window.__perf.on = true));

  // Real play: hold the run, jump over chasms and paint every available ink with the mouse.
  const inks = await p.evaluate(() => [...window.__game.rules.inks]);
  const order = ['shu', 'ai', 'kin', 'murasaki'];
  const t0 = Date.now();
  let n = 0;
  while (Date.now() - t0 < SECONDS * 1000) {
    const s = await p.evaluate(() => ({ state: window.__game.state, x: window.__game.px }));
    if (s.state === 'finish') break;
    const ink = inks[n % inks.length];
    await p.keyboard.press(`Digit${order.indexOf(ink) + 1}`);
    const y = 300 + (n % 3) * 90;
    await p.mouse.move(900, y);
    await p.mouse.down();
    for (let i = 1; i <= 12; i++) await p.mouse.move(900 + i * 38, y + Math.sin(i / 2) * 50, { steps: 2 });
    await p.mouse.up();
    await p.keyboard.down('Space');
    await wait(300);
    await p.keyboard.up('Space');
    await wait(700);
    n++;
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const r = await p.evaluate(() => {
    window.__perf.on = false;
    return { frames: window.__perf.frames, stats: { ...window.__game.stats }, state: window.__game.state };
  });
  const f = [...r.frames].sort((a, z) => a - z);
  if (f.length < 30) throw new Error(`only ${f.length} frames measured`);
  const q = (k) => f[Math.min(f.length - 1, Math.floor(k * f.length))];
  const p95 = q(0.95);
  const pass = p95 <= BUDGET;
  console.log(
    `perf ${info.id} as ${CHAR} at ${info.W}x${info.H}, ${THROTTLE}x CPU throttle, ${f.length} frames over ${SECONDS}s, ${n} strokes (${inks.join(',')}), ${r.stats.falls} falls`,
  );
  console.log(`update+render ms: p50 ${q(0.5).toFixed(2)}  p95 ${p95.toFixed(2)}  max ${f[f.length - 1].toFixed(2)}  (budget p95 <= ${BUDGET})`);
  if (errors.length) console.log('PAGE ERRORS:\n' + errors.join('\n'));
  console.log(pass && !errors.length ? 'PASS' : 'FAIL');
  code = pass && !errors.length ? 0 : 1;
} catch (e) {
  console.log('FAIL', e.message);
} finally {
  await b.close();
}
process.exit(code);
