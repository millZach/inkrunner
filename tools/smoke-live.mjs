// Usage: tools/browser-slot.sh node tools/smoke-live.mjs <url> [outdir=shots/smoke-live]
// The deployed game's Summer scrolls, opened by link (?play=<char>&level=<id>) in a fresh profile, desktop with keys and
// iPhone 13 landscape with touch: each must start, run for a few seconds with jumps, and log no page errors.
// Failed /api requests are listed apart (ghost ink is optional; the game plays without it).
import { mkdirSync } from 'node:fs';
import puppeteer, { KnownDevices } from 'puppeteer-core';

const URL = process.argv[2];
const OUT = process.argv[3] ?? 'shots/smoke-live';
if (!URL) throw new Error('usage: node tools/smoke-live.mjs <url> [outdir]');
mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const LEVELS = ['summer-1', 'summer-2', 'summer-3', 'summer-4', 'summer-gate'];
const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
let fails = 0;
const api = new Set();

for (const p of [{ name: 'desktop', viewport: { width: 1600, height: 900 }, char: 'ren' }, { name: 'iphone', device: KnownDevices['iPhone 13 landscape'], char: 'kohaku' }]) {
  for (const lv of LEVELS) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && !/status of 5\d\d|Failed to load resource/.test(m.text()) && errors.push(m.text()));
    page.on('response', (r) => r.url().includes('/api/') && r.status() >= 400 && api.add(`${r.status()} ${new globalThis.URL(r.url()).pathname}`));
    if (p.device) await page.emulate(p.device);
    else await page.setViewport(p.viewport);
    try {
      await page.goto(`${URL}?play=${p.char}&level=${lv}`, { waitUntil: 'load' });
      await wait(3500);
      for (let i = 0; i < 3; i++) {
        if (p.device) {
          const b = await (await page.waitForSelector('#jump', { visible: true, timeout: 5000 })).boundingBox();
          await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
        } else await page.keyboard.press('Space');
        await wait(800);
      }
      const menuUp = await page.$eval('#menu', (m) => !m.classList.contains('hidden')).catch(() => false);
      if (menuUp) throw new Error('the menu is showing instead of the scroll');
      if (errors.length) throw new Error(errors.slice(0, 2).join(' || '));
      console.log(`PASS [${p.name}] ${lv}`);
    } catch (e) {
      fails++;
      console.log(`FAIL [${p.name}] ${lv} · ${e.message.split('\n')[0]}`);
    }
    await page.screenshot({ path: `${OUT}/${p.name}-${lv}.png` });
    await ctx.close();
  }
}
await browser.close();
if (api.size) console.log(`api requests that failed (ghost ink): ${[...api].join(', ')}`);
console.log(fails ? `${fails} check(s) FAILED` : 'All checks PASS');
process.exit(fails ? 1 : 0);
