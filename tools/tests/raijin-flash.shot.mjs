// Usage: flock /tmp/inkrunner-browser.lock node tools/tests/raijin-flash.shot.mjs   (env URL, default the lead's dev server; SECS, default 30)
// N19 luminance check for Raijin's own sky flash (not run by npm test). Raijin books his flash through the one
// FlashLimiter (src/mechanics/flash.ts) but draws it himself (the lit band in his StormSky, raijin.ts), so this
// samples the real canvas's mean luminance (sRGB Rec.709 on a 64 x 36 copy) every frame on ?proof=raijin
// (&arena=1&immortal=1: bolts pass through the traveler, so whole loops play) and checks, per flash start:
// it shows, it lifts the frame by at most 20 %, it ramps in (90 % of its lift no sooner than 60 ms, an 80 ms ramp at
// frame grain), no two flashes start under 4 s apart, and no frame-to-frame jump anywhere is over 20 %.
// Prints PASS/FAIL lines and exits 1 on any FAIL.
import puppeteer from 'puppeteer-core';

const URL = process.env.URL ?? 'http://localhost:5173/';
const SECS = Number(process.env.SECS ?? 30);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (ok, what) => {
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`);
};

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  headless: 'new',
  args: ['--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.stack ?? String(e)));
  await page.setViewport({ width: 1600, height: 900 });
  await page.goto(`${URL}?proof=raijin&play=ren&panel=0&arena=1&immortal=1&endless=0`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game?.state === 'play' && window.__proof, { timeout: 20000 });
  await page.waitForFunction(() => window.__game.introT >= 1.5, { timeout: 10000 });
  await page.evaluate(() => {
    const g = window.__game;
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 36;
    const x = c.getContext('2d', { willReadFrequently: true });
    window.__lum = [];
    const tick = () => {
      if (!window.__lum) return;
      x.drawImage(g.canvas, 0, 0, 64, 36);
      const d = x.getImageData(0, 0, 64, 36).data;
      let s = 0;
      for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      window.__lum.push({ rt: g.realT, L: s / (255 * 64 * 36), rj: g.raijin.flashT0, f0: g.flashT0, state: g.state });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await wait(SECS * 1000);
  const lum = await page.evaluate(() => {
    const l = window.__lum;
    window.__lum = null;
    return l;
  });
  console.log('frames', lum.length, 'over', (lum[lum.length - 1].rt - lum[0].rt).toFixed(1), 's');
  let jump = 0;
  for (let i = 1; i < lum.length; i++) if (lum[i].state === 'play' && lum[i - 1].state === 'play') jump = Math.max(jump, Math.abs(lum[i].L - lum[i - 1].L));
  check(jump <= 0.2, `no frame-to-frame luminance jump over 20 %: largest ${(jump * 100).toFixed(1)} %`);
  const starts = [...new Set([...lum.map((f) => f.rj), ...lum.map((f) => f.f0)].filter((t) => t > 0))].sort((a, b) => a - b);
  check(starts.length >= 2, `flashes seen: ${starts.length} (${starts.map((t) => t.toFixed(2)).join(', ')})`);
  for (let i = 1; i < starts.length; i++) check(starts[i] - starts[i - 1] >= 4 - 1e-6, `flashes ${starts[i - 1].toFixed(2)} and ${starts[i].toFixed(2)} at least 4 s apart`);
  for (const t0 of starts) {
    const before = lum.filter((f) => f.rt < t0).slice(-1)[0];
    const after = lum.filter((f) => f.rt >= t0 && f.rt < t0 + 0.6);
    if (!before || !after.length) continue;
    const lift = after.map((f) => ({ age: f.rt - t0, d: f.L - before.L }));
    const peak = Math.max(...lift.map((f) => f.d));
    const at90 = lift.find((f) => f.d >= peak * 0.9);
    console.log(`flash ${t0.toFixed(2)}: base ${(before.L * 100).toFixed(1)} %`, lift.slice(0, 8).map((f) => `${(f.age * 1000).toFixed(0)}ms:+${(f.d * 100).toFixed(1)}`).join(' '));
    check(peak > 0.005 && peak <= 0.2, `flash at ${t0.toFixed(2)} s shows and lifts the frame by ${(peak * 100).toFixed(1)} % (<= 20 %)`);
    check(at90 && at90.age >= 0.06, `flash at ${t0.toFixed(2)} s ramps in: 90 % of its lift at ${((at90?.age ?? 0) * 1000).toFixed(0)} ms`);
  }
  if (errors.length) {
    console.log('PAGE ERRORS:\n' + errors.join('\n'));
    fails++;
  }
} finally {
  await browser.close();
}
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
