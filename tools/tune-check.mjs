// Usage: tools/browser-slot.sh node tools/tune-check.mjs   (env URL = a dev server; shots in shots/tuning/)
// Zach's 2026-10-11 tuning, driven with a real mouse and keyboard at 1600x900 in a fresh profile:
//   1. Ink keys: the title's "change" opens the sheet; Indigo moves to F; Space is refused (it jumps); the choice
//      survives a reload; in the First Scroll F picks Indigo, 2 no longer does, and the HUD stone reads F.
//   2. Rings: in Summer 1 a hand-drawn arc of about 290° lifted short of its start makes a ring; a 200° C does not.
//   3. Refill: after a stroke ink refills at the scroll's rate (0.8x the first numbers).
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const URL = process.env.URL ?? 'http://localhost:5173/';
const OUT = 'shots/tuning';
mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`);
  if (!ok) fails++;
};

const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.createBrowserContext();
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.setViewport({ width: 1600, height: 900 });
const G = (fn, ...a) => page.evaluate(fn, ...a);
const text = (sel) => page.$eval(sel, (e) => e.textContent.trim());

// 1. Ink keys on the title
await page.goto(URL, { waitUntil: 'load' });
await page.waitForSelector('#btn-keys', { visible: true });
check((await text('#ink-keys-label')) === '1 2 3 4', `title shows the default keys (${await text('#ink-keys-label')})`);
await page.click('#btn-keys');
await page.waitForSelector('#keys:not(.hidden)');
await page.click('.key-row[data-ink="ai"]');
await page.keyboard.press('KeyF');
check((await text('#key-note')) === 'Indigo is now F.', `binding Indigo to F (${await text('#key-note')})`);
await page.click('.key-row[data-ink="kin"]');
await page.keyboard.press('Space');
check((await text('#key-note')).startsWith('Space is for jump'), `Space refused (${await text('#key-note')})`);
await page.screenshot({ path: `${OUT}/keys-sheet.png` });
await page.click('#btn-keys-done');
check(await page.$eval('#keys', (e) => e.classList.contains('hidden')), 'Done closes the sheet');
check((await text('#ink-keys-label')) === '1 F 3 4', `title shows the new keys (${await text('#ink-keys-label')})`);
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ink-keys-label');
check((await text('#ink-keys-label')) === '1 F 3 4', 'the keys survive a reload');

// ... and in a scroll
const play = async (char, level) => {
  await page.goto(`${URL}?play=${char}&level=${level}`, { waitUntil: 'load' });
  await page.waitForFunction((id) => window.__game?.state === 'play' && window.__game.level.id === id, { timeout: 30000 }, level);
  await page.waitForFunction(() => window.__game.introT >= 1.5, { timeout: 20000 });
};
await play('ren', 'first');
await page.keyboard.press('KeyF');
check((await G(() => window.__game.ink)) === 'ai', 'F picks Indigo in the First Scroll');
await page.keyboard.press('Digit1');
await page.keyboard.press('Digit2');
check((await G(() => window.__game.ink)) === 'shu', '2 no longer picks Indigo');
await page.keyboard.press('KeyF');
await page.screenshot({ path: `${OUT}/hud-keys.png` });

// 2. Rings in Summer 1, drawn with the mouse in open sky ahead of the traveler
await play('kohaku', 'summer-1');
const arc = async (cx, cy, r, sweep) => {
  const n = Math.ceil(sweep / 6);
  const at = (i) => {
    const a = -Math.PI / 2 + ((i / n) * sweep * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  await page.mouse.move(...at(0));
  await page.mouse.down();
  for (let i = 1; i <= n; i++) {
    await page.mouse.move(...at(i));
    await wait(8);
  }
  await page.mouse.up();
  await wait(150);
};
const rings = () => G(() => window.__game.portals.rings.filter((r) => r.state !== 'closing').length);
const before = await rings();
await arc(1000, 330, 75, 200);
check((await rings()) === before, 'a 200° C stays open (no ring)');
await wait(1500);
await arc(1000, 330, 75, 290);
const made = await rings();
check(made === before + 1, `a 290° arc lifted short of its start makes a ring (${before} → ${made})`);
await page.screenshot({ path: `${OUT}/ring-290.png` });

// 3. Refill after that stroke: a pause, then the scroll's rate
const samples = [];
for (let i = 0; i < 14; i++) {
  samples.push(await G(() => ({ t: window.__game.t, ink: window.__game.inkAmt, regen: window.__game.rules.inkRegen, max: window.__game.inkMax, painting: !!window.__game.painting })));
  await wait(120);
}
const flowing = samples.filter((s) => !s.painting && s.ink < s.max - 0.5);
if (flowing.length >= 2) {
  const a = flowing[0];
  const b = flowing.at(-1);
  const rate = (b.ink - a.ink) / (b.t - a.t);
  check(Math.abs(rate - a.regen) < 1.5, `refill ${rate.toFixed(1)}/s against the scroll's ${a.regen}/s`);
} else check(false, 'refill samples');

check(!errors.length, `no page errors${errors.length ? `: ${errors.slice(0, 2).join(' | ')}` : ''}`);
await browser.close();
console.log(fails ? `${fails} check(s) FAILED` : 'All checks PASS');
process.exit(fails ? 1 : 0);
