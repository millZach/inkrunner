// Usage: flock /tmp/inkrunner-browser.lock node tools/tests/rules.shot.mjs [outdir]
// Browser check that the game reads per-scroll rules (not run by npm test). Builds a small scroll with
// LevelBuilder.rules() in the page, starts it, and measures run speed, inkwell, refill, slow motion, drain,
// ink stones and the finish walk with real mouse and keyboard input.
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const URL = process.env.URL ?? 'http://localhost:5173/';
const out = process.argv[2] ?? 'shots/foundation/engine';
mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (ok, what) => {
  results.push(ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  headless: 'new',
  args: ['--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist'],
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.stack ?? String(e)));
  await page.setViewport({ width: 1600, height: 900 });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__game, { timeout: 20000 });
  const G = (fn, ...a) => page.evaluate(fn, ...a);

  const startTest = (char) =>
    G(async (char) => {
      const { LevelBuilder } = await import('/src/level.ts');
      const info = {
        id: 'rules-test',
        name: 'Rules test',
        kanji: '試',
        theme: 'spring',
        blurb: '',
        build: () => {
          const b = new LevelBuilder('rules-test', 'Rules test', '試', 'spring', 3);
          // purple listed first on purpose: inks are re-ordered into stone order
          b.rules({ runSpeed: 200, inkMax: 50, inkRegen: 10, slowScale: 0.3, slowmoDrain: 9, inks: ['murasaki', 'shu', 'nope'], rain: true });
          b.island(0, 3000, 540);
          b.torii(1400);
          return b.finish(3000, 20, 100);
        },
      };
      document.getElementById('menu').classList.add('hidden');
      window.__game.start(char, info);
      return window.__game.rules;
    }, char);

  // ── Kohaku: base inkwell
  const rules = await startTest('kohaku');
  console.log('rules', JSON.stringify(rules));
  check(rules.inks.join(',') === 'shu,murasaki', `inks normalised to stone order: ${rules.inks.join(',')}`);
  check(rules.rain === true, 'rain flag carried');
  check((await G(() => window.__game.inkMax)) === 50, 'Kohaku inkwell = rules.inkMax (50)');
  check((await G(() => window.__game.ink)) === 'shu', 'starts on the first available ink');
  check((await G(() => window.__game.stoneLayout().length)) === 2, 'two ink stones');
  await page.keyboard.press('Digit2');
  check((await G(() => window.__game.ink)) === 'shu', 'Digit2 (indigo, not offered) does nothing');
  await page.keyboard.press('Digit4');
  check((await G(() => window.__game.ink)) === 'murasaki', 'Digit4 selects purple');
  await page.keyboard.press('KeyE');
  check((await G(() => window.__game.ink)) === 'shu', 'E cycles only offered inks');

  await page.waitForFunction(() => window.__game.introT >= 1.5);
  await wait(900);
  const vx = await G(() => window.__game.vx);
  check(near(vx, 200, 2), `run speed ${vx.toFixed(1)} = rules.runSpeed 200`);

  // hold the brush still: slow motion settles at rules.slowScale and drains rules.slowmoDrain per real second
  await page.mouse.move(1100, 250);
  await page.mouse.down();
  await wait(400);
  const a = await G(() => ({ ink: window.__game.inkAmt, ts: window.__game.timeScale, rt: window.__game.realT }));
  await wait(2500);
  const b = await G(() => ({ ink: window.__game.inkAmt, ts: window.__game.timeScale, rt: window.__game.realT }));
  await page.mouse.up();
  const drain = (a.ink - b.ink) / (b.rt - a.rt);
  check(near(b.ts, 0.3, 0.01), `slow-motion time scale ${b.ts.toFixed(3)} = rules.slowScale 0.3`);
  check(near(drain, 9, 0.6), `drain ${drain.toFixed(2)}/s = rules.slowmoDrain 9`);

  await wait(400);
  const c = await G(() => ({ ink: window.__game.inkAmt, t: window.__game.t }));
  await wait(1000);
  const d = await G(() => ({ ink: window.__game.inkAmt, t: window.__game.t }));
  const regen = (d.ink - c.ink) / (d.t - c.t);
  check(d.ink < 49.9 && near(regen, 10, 0.6), `refill ${regen.toFixed(2)}/s of game time = rules.inkRegen 10 (ink ${c.ink.toFixed(1)} -> ${d.ink.toFixed(1)})`);
  await page.screenshot({ path: `${out}/rules-two-stones.png` });

  // finish walk at half the scroll's run speed
  await page.waitForFunction(() => window.__game.state === 'finish', { timeout: 15000 });
  await wait(300);
  const fw = await G(() => window.__game.vx);
  check(near(fw, 100, 0.5), `finish walk ${fw} = runSpeed / 2`);

  // ── Ren: deep inkwell on top of the scroll's inkwell; HUD bar follows it
  await startTest('ren');
  check(near(await G(() => window.__game.inkMax), 70, 1e-9), 'Ren inkwell = rules.inkMax x 1.4 (70)');
  check(!errors.length, 'no page errors');
  if (errors.length) console.log(errors.join('\n'));
} finally {
  await browser.close();
}
const ok = results.every(Boolean);
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
