// Usage: flock /tmp/inkrunner-browser.lock node tools/smoke-build.mjs <url> [outdir=shots/smoke-build]
// A production build the way Zach meets it, with DOM-only checks (no dev hooks): fresh profile, title, the campaign tab,
// a traveler card, the prologue skipped, the map, the First Scroll started from its node and played a few seconds.
// Desktop 1600x900 with the mouse, iPhone 13 landscape with touch. Screenshots per step; exits 1 on any failure.
import { mkdirSync } from 'node:fs';
import puppeteer, { KnownDevices } from 'puppeteer-core';

const URL = process.argv[2];
const OUT = process.argv[3] ?? 'shots/smoke-build';
if (!URL) throw new Error('usage: node tools/smoke-build.mjs <url> [outdir]');
mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
let fails = 0;

for (const p of [{ name: 'desktop', viewport: { width: 1600, height: 900 }, char: 'ren' }, { name: 'iphone', device: KnownDevices['iPhone 13 landscape'], char: 'kohaku' }]) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  if (p.device) await page.emulate(p.device);
  else await page.setViewport(p.viewport);
  const tap = async (sel) => {
    const el = await page.waitForSelector(sel, { visible: true, timeout: 15000 });
    const b = await el.boundingBox();
    if (p.device) await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
    else await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  };
  const step = async (name, fn) => {
    try {
      const note = await fn();
      console.log(`PASS [${p.name}] ${name}${note ? ` · ${note}` : ''}`);
    } catch (e) {
      fails++;
      console.log(`FAIL [${p.name}] ${name} · ${e.message.split('\n')[0]}`);
    }
    await page.screenshot({ path: `${OUT}/${p.name}-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png` });
  };
  await step('title loads', async () => {
    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForSelector('#tab-campaign', { visible: true, timeout: 20000 });
    return await page.title();
  });
  await step('campaign tab and traveler card start the prologue', async () => {
    await tap('#tab-campaign');
    await wait(300);
    await tap(`.card[data-char="${p.char}"]`);
    await page.waitForSelector('.cutscene', { timeout: 10000 });
    await wait(2500);
  });
  await step('prologue skipped hands over to the map', async () => {
    if (p.device) await tap('.cutscene');
    else await page.keyboard.press('Escape');
    await page.waitForSelector('.map-node[data-node="first"]', { visible: true, timeout: 15000 });
    await wait(1500);
    return await page.$$eval('.map-node', (ns) => ns.map((n) => `${n.dataset.node}:${n.dataset.state}`).join(' '));
  });
  await step('the First Scroll starts from its node and plays', async () => {
    await tap('.map-node[data-node="first"]');
    await wait(4000);
    for (let i = 0; i < 3; i++) {
      if (p.device) await tap('#jump');
      else await page.keyboard.press('Space');
      await wait(700);
    }
    const hidden = await page.$eval('#menu', (m) => m.classList.contains('hidden')).catch(() => null);
    if (hidden === false) throw new Error('the menu is still showing');
  });
  await step('no console errors', async () => {
    if (errors.length) throw new Error(errors.slice(0, 3).join(' || '));
  });
  await ctx.close();
}
await browser.close();
console.log(fails ? `${fails} step(s) FAILED` : 'All steps PASS');
process.exit(fails ? 1 : 0);
