// Usage: flock /tmp/inkrunner-browser.lock node tools/tests/inks.shot.mjs <four|phone|default|default-phone> [outdir]
// Evidence captures for the ink stones (not run by npm test). Real keyboard, mouse, wheel and touch input only.
//   four          1600x900, ?inks=shu,ai,kin,murasaki: four stones, keys 1-4, Q/E, wheel, a stone click, four strokes
//   phone         iPhone 13 landscape + touch, same override: stones tapped, strokes painted with a finger
//   default       1600x900, First Scroll with default rules: three stones, key 4 does nothing
//   default-phone iPhone 13 landscape, default rules
import { mkdirSync, writeFileSync } from 'node:fs';
import puppeteer, { KnownDevices } from 'puppeteer-core';

const URL = process.env.URL ?? 'http://localhost:5173/';
const mode = process.argv[2] ?? 'four';
const out = process.argv[3] ?? 'shots/foundation/engine';
const phone = mode.includes('phone');
const four = mode === 'four' || mode === 'phone';
const char = process.env.CHAR ?? (phone ? 'kohaku' : 'ren');
mkdirSync(out, { recursive: true });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (ok, what) => {
  results.push(ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
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
  if (phone) await page.emulate(KnownDevices['iPhone 13 landscape']);
  else await page.setViewport({ width: 1600, height: 900 });
  const q = `?play=${char}&level=first${four ? '&inks=shu,ai,kin,murasaki' : ''}`;
  await page.goto(URL + q, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game?.state === 'play', { timeout: 20000 });
  const G = (fn, ...a) => page.evaluate(fn, ...a);
  // Shots taken while a finger is held use a raw CDP capture: puppeteer's screenshot helper re-applies the
  // device metrics, and with a touch down Chromium then fires a stray pointermove at 1/DPR coordinates
  // (seen 2026-10-07). The raw capture is at CSS-pixel size. Other shots use the normal full-DPR helper.
  const cdp = await page.createCDPSession();
  const snap = async (name, held = false) => {
    const path = `${out}/${name}.png`;
    if (held) writeFileSync(path, Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    else await page.screenshot({ path });
    console.log('shot', path, 'dpr after', await G(() => devicePixelRatio));
  };

  const ink = () => G(() => window.__game.ink);
  const stones = () =>
    G(() => {
      const g = window.__game;
      const r = g.canvas.getBoundingClientRect();
      return g.stoneLayout().map((s) => ({ k: s.k, x: r.left + (s.x * r.width) / g.W, y: r.top + (s.y * r.height) / g.H }));
    });

  const st = await stones();
  console.log(`${mode}: ${char}, coarse pointer ${await G(() => matchMedia('(pointer: coarse)').matches)}, stones ${st.map((s) => s.k).join(',')}`);
  console.log('rules', JSON.stringify(await G(() => window.__game.rules)));
  check(st.length === (four ? 4 : 3), `${four ? 4 : 3} ink stones`);
  const xs = st.map((s) => s.x);
  const vw = await G(() => window.innerWidth);
  check(Math.abs((xs[0] + xs[xs.length - 1]) / 2 - vw / 2) < 2, 'stones centred');

  if (!phone) {
    // keyboard: number keys, Q/E cycling, wheel
    for (const [key, want] of [['Digit2', 'ai'], ['Digit3', 'kin'], ['Digit4', four ? 'murasaki' : 'kin'], ['Digit1', 'shu']]) {
      await page.keyboard.press(key);
      check((await ink()) === want, `${key} -> ${want}`);
    }
    const cyc = [];
    for (let i = 0; i < (four ? 4 : 3); i++) {
      await page.keyboard.press('KeyE');
      cyc.push(await ink());
    }
    check(cyc.join(',') === (four ? 'ai,kin,murasaki,shu' : 'ai,kin,shu'), `E cycles ${cyc.join(',')}`);
    await page.keyboard.press('KeyQ');
    check((await ink()) === (four ? 'murasaki' : 'kin'), `Q wraps back to ${await ink()}`);
    await page.mouse.move(800, 300);
    await page.mouse.wheel({ deltaY: 100 });
    await wait(50);
    check((await ink()) === 'shu', `wheel down -> ${await ink()}`);
  }

  await page.waitForFunction(() => window.__game.introT >= 1.5, { timeout: 10000 });

  // select an ink the way a player would: tap/click its stone on touch, number key on desktop
  const choose = async (k) => {
    const s = (await stones()).find((s) => s.k === k);
    if (phone) await page.touchscreen.tap(s.x, s.y);
    else if (k === 'murasaki') await page.mouse.click(s.x, s.y);
    else await page.keyboard.press(`Digit${['shu', 'ai', 'kin', 'murasaki'].indexOf(k) + 1}`);
    await wait(30);
    check((await ink()) === k, `${phone ? 'tap' : k === 'murasaki' ? 'click' : 'key'} on ${k} stone selects it`);
  };
  const paintAt = async (pts, holdShot) => {
    const [a, ...rest] = pts;
    if (phone) {
      await page.touchscreen.touchStart(a.x, a.y);
      for (const p of rest) await page.touchscreen.touchMove(p.x, p.y);
      if (holdShot) await snap(holdShot, true);
      await page.touchscreen.touchEnd();
    } else {
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      for (const p of rest) await page.mouse.move(p.x, p.y, { steps: 2 });
      if (holdShot) await snap(holdShot);
      await page.mouse.up();
    }
  };

  const vh = await G(() => window.innerHeight);
  if (four) {
    // four rows of the same arc, purple between indigo and gold so it can be judged against both
    const rows = { shu: 0.2, ai: 0.32, murasaki: 0.44, kin: 0.56 };
    // the phone's world scale is smaller, so the same screen width costs more ink: keep all four within one inkwell
    const span = phone ? 0.2 : 0.3;
    // purple a little longer: the share card shows the run's longest stroke, so purple must be in it
    const arc = (row, k) =>
      Array.from({ length: 19 }, (_, i) => ({ x: vw * (0.52 + ((k === 'murasaki' ? span * 1.15 : span) * i) / 18), y: vh * row - Math.sin((i / 18) * Math.PI) * vh * 0.05 }));
    for (const k of ['shu', 'ai', 'kin', 'murasaki']) {
      await choose(k);
      await paintAt(arc(rows[k], k), k === 'murasaki' ? `${mode}-painting-purple` : null);
    }
    const kinds = await G(() => window.__game.strokes.map((s) => s.kind));
    check(kinds.join(',') === 'shu,ai,kin,murasaki', `strokes painted: ${kinds.join(',')}`);
    // every stroke is the gentle left-to-right arc we painted (no stray pointer jumps)
    const shapes = await G(() =>
      window.__game.strokes.map((s) => ({ dx: s.pts[s.pts.length - 1].x - s.pts[0].x, dy: s.bbox.y1 - s.bbox.y0, len: s.length })),
    );
    check(shapes.every((q) => q.dx > 100 && q.dy < q.dx * 0.35), `stroke shapes ${JSON.stringify(shapes.map((q) => [Math.round(q.dx), Math.round(q.dy)]))}`);
    await wait(250);
    await snap(`${mode}-wet`);
    await wait(1100);
    await snap(`${mode}-dry`);
    // purple is inert: no surface, no current, no ward
    const inert = await G(() => {
      const g = window.__game;
      const s = g.strokes.find((x) => x.kind === 'murasaki');
      return { surface: s.surface.length, riding: g.ride?.st === s };
    });
    check(inert.surface === 0 && !inert.riding, 'purple stroke has no ground surface and is not ridden');
    if (mode === 'four') {
      // share card and highlight clip are re-rendered from the recorded timeline: purple must be in both
      const b64 = (blobExpr) =>
        G(async (blobExpr) => {
          const g = window.__game;
          const st = { time: g.stats.time, strokes: g.stats.strokes, ink: g.stats.ink, falls: 0, grade: g.grade(), newBest: false, best: null };
          let blob;
          if (blobExpr === 'card') blob = await (await import('/src/share.ts')).renderCard(g, st);
          else blob = (await g.recorder.recordClip())?.blob;
          if (!blob) return null;
          const u = new Uint8Array(await blob.arrayBuffer());
          let s = '';
          for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
          return [btoa(s), blob.type];
        }, blobExpr);
      const card = await b64('card');
      check(!!card, 'share card rendered');
      if (card) writeFileSync(`${out}/four-card.png`, Buffer.from(card[0], 'base64'));
      const segs = await G(() => window.__game.recorder.highlights());
      console.log('highlights', JSON.stringify(segs));
      const clip = await b64('clip');
      check(!!clip, `highlight clip recorded (${clip?.[1]})`);
      if (clip) writeFileSync(`${out}/four-clip.${clip[1].includes('mp4') ? 'mp4' : 'webm'}`, Buffer.from(clip[0], 'base64'));
    }
  } else {
    // default rules: key 4 / an off-scroll ink never selects purple
    if (!phone) {
      await page.keyboard.press('Digit4');
      check((await ink()) === 'shu', 'Digit4 does nothing on a three-ink scroll');
    }
    await G(() => window.__game.selectInk('murasaki'));
    check((await ink()) === 'shu', 'selectInk(murasaki) is ignored on a three-ink scroll');
    await wait(400);
    await snap(`${mode}-three-stones`);
  }
  if (errors.length) console.log('PAGE ERRORS:\n' + errors.join('\n'));
  check(!errors.length, 'no page errors');
} finally {
  await browser.close();
}
const ok = results.every(Boolean);
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
