// Usage: flock /tmp/inkrunner-browser.lock node tools/tests/summer-perf.shot.mjs — update+render ms of a busy Summer test scroll (sky, lantern line, great firework, sparks and bolts, rain) per sky, 1600x900 at 4x CPU throttle (traveler made invulnerable by the harness: a measurement only, never a capture).
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist'] });
const p = await b.newPage();
await p.setViewport({ width: 1600, height: 900 });
await p.goto('http://localhost:5173/', { waitUntil: 'load' });
await p.waitForFunction(() => !!window.__game, { timeout: 30000 });
for (const sky of ['night', 'storm-peak', 'moon']) {
  await p.evaluate(async (sky) => {
    const { LevelBuilder } = await import('/src/level.ts');
    const { Course } = await import('/src/levels.ts');
    const { mulberry32 } = await import('/src/rng.ts');
    const build = () => {
      const b = new LevelBuilder('perf-sky', 'P', '試', 'summer', 41);
      b.rules({ runSpeed: 300, camLead: 0.22, rain: sky === 'storm-peak' ? { hold: 0.7, warn: 1.1 } : false });
      const c = new Course(b, 520, mulberry32(41));
      c.sky(sky).festoon(200, 6000).hanabi(400, 'great').rain(true);
      for (let i = 0; i < 6; i++) c.run(500).spark(300).bolt(500).run(400);
      return c.end('summer');
    };
    document.getElementById('menu')?.classList.add('hidden');
    const G = window.__game;
    G.start('ren', { id: 'perf-sky', name: 'P', kanji: '試', theme: 'spring', blurb: '', build });
    G.invuln = 999;
    const upd = G.update.bind(G), ren = G.render.bind(G);
    const st = (window.__perf = { on: false, u: 0, frames: [] });
    G.update = (dt) => { const t0 = performance.now(); upd(dt); G.invuln = 999; st.u = performance.now() - t0; };
    G.render = () => { const t0 = performance.now(); ren(); if (st.on) st.frames.push(st.u + performance.now() - t0); };
  }, sky);
  await p.waitForFunction(() => window.__game.introT >= 1.5);
  const cdp = await p.createCDPSession();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await p.evaluate(() => (window.__perf.on = true));
  await new Promise((r) => setTimeout(r, 7000));
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const f = await p.evaluate(() => window.__perf.frames.sort((a, b) => a - b));
  console.log(sky, 'frames', f.length, 'p50', f[f.length >> 1].toFixed(2), 'p95', f[Math.floor(f.length * 0.95)].toFixed(2), 'max', f[f.length - 1].toFixed(2));
}
await b.close();
