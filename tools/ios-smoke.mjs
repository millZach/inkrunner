// Browser touch emulation of the actual iOS web bundle; NOT Apple's iOS Simulator.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import puppeteer, { KnownDevices } from 'puppeteer-core';

const executablePath = process.env.BROWSER_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/chromium', '/usr/bin/google-chrome',
].find(existsSync);
if (!executablePath) throw new Error('Set BROWSER_PATH to Chrome or Chromium.');
const root = path.resolve('ios/App/App/public');
if (!existsSync(path.join(root, 'index.html'))) throw new Error('Run npm run ios:sync first.');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      // Deterministic, local-only ghost fixture: no runs are sent to a live server.
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ best: null, others: [] })); return;
    }
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' }); res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
await mkdir('shots', { recursive: true });
// Offline by construction: every non-loopback request is routed to a dead proxy and fails, so the
// bundle must boot from its own files. (Chromium never proxies loopback, so the local server works.)
// Request interception is avoided on purpose: under it, intercepted woff2 font requests never fire
// requestfinished on Linux Chromium, which stalls network-idle waits.
const browser = await puppeteer.launch({
  executablePath, headless: true,
  args: ['--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=127.0.0.1'],
});
const isLocal = url => url.startsWith(origin) || url.startsWith('blob:') || url.startsWith('data:');
const fontLoads = new Set();
// Chromium's own networkidle0 lifecycle signal never fires once the game's requestAnimationFrame loop is
// running (verified on the dev machine: with rAF stubbed it fires in ~0.6 s), so wait for load, then use puppeteer's
// request-level idle tracking (every request finished or failed, 500 ms quiet) instead.
const settle = async (page, navigate) => {
  await navigate({ waitUntil: 'load' });
  await page.waitForNetworkIdle({ idleTime: 500, timeout: 30000 });
};
const watchNetwork = page => {
  page.on('request', req => { if (!isLocal(req.url())) errors.push(`Unexpected external request: ${req.url()}`); });
  page.on('response', res => {
    if (res.url().startsWith(origin) && res.url().endsWith('.woff2') && res.ok()) fontLoads.add(path.basename(new URL(res.url()).pathname));
  });
};
const report = [];
const pass = (name, details = '') => { report.push({ name, details }); console.log(`PASS ${name}${details ? ': ' + details : ''}`); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const errors = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push(e.stack));
  await page.emulate(KnownDevices['iPhone 13 landscape']);
  watchNetwork(page);
  await page.evaluateOnNewDocument(() => {
    window.__downloads = [];
    Object.defineProperty(navigator, 'canShare', { value: () => false });
    HTMLAnchorElement.prototype.click = async function () {
      const blob = await (await fetch(this.href)).blob();
      const result = { name: this.download, type: blob.type, bytes: blob.size };
      if (blob.type === 'image/png') {
        const img = new Image(); img.src = this.href; await img.decode();
        result.width = img.width; result.height = img.height;
      }
      window.__downloads.push(result);
    };
  });
  await settle(page, o => page.goto(origin, o));
  await page.waitForFunction(() => window.__game);
  assert.equal(await page.evaluate(() => document.body.classList.contains('touch')), true);
  const fonts = await page.evaluate(() => [document.fonts.check('25px "Shippori Mincho"', '墨Ren'), document.fonts.check('120px "Yuji Syuku"', '墨')]);
  assert.ok(fonts.every(Boolean));
  const faces = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].map(f => `${f.family.replaceAll('"', '')} ${f.weight} ${f.status}`);
  });
  for (const family of ['Shippori Mincho', 'Yuji Syuku'])
    assert.ok(faces.some(f => f.startsWith(family) && f.endsWith('loaded')), `${family} not loaded: ${faces.join('; ')}`);
  assert.ok(fontLoads.size >= 2, `bundled woff2 served locally: ${[...fontLoads].join(', ')}`);
  assert.deepEqual(errors, []);
  pass('Packaged game boots with locally bundled fonts and no external network', `${fontLoads.size} woff2 from the bundle; non-loopback traffic blocked`);

  // Synthetic insets test layout arithmetic; actual iOS insets still need a Mac/device.
  await page.evaluate(() => {
    const css = [...document.styleSheets].flatMap(s => [...s.cssRules].map(r => r.cssText)).join('\n');
    const style = document.createElement('style');
    style.textContent = css.replaceAll('env(safe-area-inset-left)', '44px').replaceAll('env(safe-area-inset-right)', '44px')
      .replaceAll('env(safe-area-inset-bottom)', '21px').replaceAll('env(safe-area-inset-top)', '0px');
    document.head.appendChild(style); window.__game.resize();
  });
  for (const [width, height] of [[844, 390], [667, 375], [568, 320]]) {
    await page.setViewport({ width, height, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: true });
    await wait(100);
    const bounds = await page.evaluate(() => {
      const menu = document.getElementById('menu');
      const cards = [...document.querySelectorAll('.card')].map(c => { const r = c.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; });
      const c = document.getElementById('game').getBoundingClientRect();
      return { cards, scrollHeight: menu.scrollHeight, height: menu.clientHeight, canvas: { left: c.left, right: c.right, bottom: c.bottom } };
    });
    await page.screenshot({ path: `shots/ios-menu-${width}.png` });
    assert.ok(bounds.cards.every(c => c.left >= 44 && c.right <= width - 44 && c.top >= 0 && c.bottom <= height - 21), JSON.stringify(bounds));
    assert.equal(bounds.canvas.left, 44); assert.equal(bounds.canvas.right, width - 44); assert.equal(bounds.canvas.bottom, height - 21);
    pass('Landscape menu and canvas fit synthetic safe areas', `${width}×${height}`);
  }
  await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: true });
  // The title opens on the campaign; these checks cover the four free-play scrolls (the tab choice is remembered).
  await page.tap('#tab-free');
  const levelIds = [];
  for (let i = 0; i < 4; i++) {
    await page.tap(`#scrolls .scroll:nth-child(${i + 1})`);
    levelIds.push(await page.evaluate(() => window.__game.info.id));
  }
  assert.equal(new Set(levelIds).size, 4);
  pass('All four scrolls selectable', levelIds.join(', '));
  await page.tap('#scrolls .scroll:first-child');
  await page.tap('.card[data-char="kohaku"]');
  await wait(1900);
  assert.equal(await page.evaluate(() => window.__game.charId), 'kohaku');
  await page.waitForFunction(() => window.__game.stats.time > 0.1);
  pass('Touch character selection starts the original runner');

  const client = await page.createCDPSession();
  const jump = await page.$eval('#jump', el => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, id: 2 }; });
  const brush = { x: 390, y: 180, id: 1 };
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [brush] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [brush, jump] });
  await wait(120);
  const twoFingers = await page.evaluate(() => ({ painting: !!window.__game.painting, jumping: window.__game.jumpHeld, grounded: window.__game.grounded }));
  assert.ok(twoFingers.painting && twoFingers.jumping && !twoFingers.grounded);
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [brush] });
  for (let i = 1; i <= 7; i++) {
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...brush, x: brush.x + i * 20, y: brush.y + Math.sin(i) * 8 }] });
    await wait(25);
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.equal(await page.evaluate(() => window.__game.strokes.length), 1);
  assert.equal(await page.evaluate(() => window.__game.jumpHeld), false);
  pass('Two-finger painting and jumping work independently; stroke commits');
  await page.screenshot({ path: 'shots/ios-play.png' });

  for (const [index, ink] of [[1, 'ai'], [2, 'kin'], [0, 'shu']]) {
    const stone = await page.evaluate(index => {
      const g = window.__game, s = g.stoneLayout()[index], r = g.canvas.getBoundingClientRect();
      return { x: r.left + s.x / g.W * r.width, y: r.top + s.y / g.H * r.height };
    }, index);
    await page.touchscreen.tap(stone.x, stone.y);
    assert.equal(await page.evaluate(() => window.__game.ink), ink);
  }
  pass('All three original ink stones respond to touch');
  await page.tap('#pause-button');
  const frozen = await page.evaluate(() => ({ x: window.__game.px, time: window.__game.stats.time, ink: window.__game.inkAmt }));
  await wait(500);
  assert.deepEqual(await page.evaluate(() => ({ x: window.__game.px, time: window.__game.stats.time, ink: window.__game.inkAmt })), frozen);
  await page.screenshot({ path: 'shots/ios-pause.png' });
  await page.tap('#btn-ghosts');
  assert.equal(await page.evaluate(() => window.__game.showGhosts), false);
  await page.tap('#btn-undo');
  assert.equal(await page.evaluate(() => window.__game.strokes.length), 0);
  assert.equal(await page.evaluate(() => window.__game.paused), false);
  pass('Pause freezes the run; ghost toggle and undo work; continue resumes');

  const background = await browser.newPage();
  await background.bringToFront();
  await page.waitForFunction(() => window.__game.paused);
  assert.equal(await page.evaluate(() => window.__game.audio.ctx.state), 'suspended');
  await page.bringToFront(); await page.tap('#btn-resume');
  await page.waitForFunction(() => window.__game.audio.ctx.state === 'running');
  await background.close();
  pass('Browser background/foreground pauses gameplay and audio until Continue');

  await page.tap('#pause-button'); await page.tap('#btn-lantern');
  await page.waitForFunction(() => window.__game.state === 'play');
  assert.equal(await page.evaluate(() => window.__game.stats.falls), 0);
  pass('Return to lantern preserves manual-respawn behavior');

  // Seed the gate scenario, then let the original game execute its finish flow.
  await page.evaluate(() => {
    const g = window.__game; g.px = g.level.torii.x + 1; g.py = g.level.torii.y;
    g.invuln = 99; g.vy = 0; g.grounded = true; g.introT = 3;
  });
  await page.waitForFunction(() => !document.getElementById('finish').classList.contains('hidden'), { timeout: 15000 });
  assert.equal(await page.evaluate(() => window.__game.state), 'finish');
  assert.ok(await page.evaluate(() => localStorage.getItem('inkrunner:best:first')));
  await wait(900); // Let the existing result-screen transition settle for visual QA.
  await page.screenshot({ path: 'shots/ios-finish.png' });
  pass('Seeded gate scenario completes, shows rank, and saves the best record');

  await page.tap('#btn-card');
  await page.waitForFunction(() => window.__downloads.length >= 1);
  const card = await page.evaluate(() => window.__downloads[0]);
  assert.equal(card.width, 1600); assert.equal(card.height, 900); assert.ok(card.bytes > 10000);
  await page.waitForFunction(() => !document.getElementById('btn-scroll').disabled);
  await page.tap('#btn-scroll');
  await page.waitForFunction(() => window.__downloads.length >= 2);
  const scroll = await page.evaluate(() => window.__downloads[1]);
  assert.ok(scroll.width > 6000 && scroll.bytes > 10000);
  pass('Share card and full-scroll PNG render from the completed run', `${card.width}×${card.height}; ${scroll.width}×${scroll.height}`);
  await page.waitForFunction(() => !document.getElementById('btn-clip').disabled);
  await page.tap('#btn-clip');
  await page.waitForFunction(() => window.__downloads.length >= 3, { timeout: 30000 });
  const clip = await page.evaluate(() => window.__downloads[2]);
  assert.ok(clip.type.startsWith('video/') && clip.bytes > 1000);
  pass('Highlight video encodes in the browser', `${clip.type}, ${clip.bytes} bytes`);
  await page.waitForFunction(() => !document.getElementById('btn-clip').disabled);
  await page.evaluate(() => { window.__MediaRecorder = window.MediaRecorder; window.MediaRecorder = undefined; });
  await page.tap('#btn-clip');
  await page.waitForFunction(() => document.getElementById('export-status').textContent.includes('unavailable'));
  assert.equal(await page.evaluate(() => document.getElementById('finish').classList.contains('hidden')), false);
  pass('Unsupported video recorder reports a useful message and restores results');
  await page.evaluate(() => { window.MediaRecorder = window.__MediaRecorder; });

  await page.tap('#btn-again');
  assert.equal(await page.evaluate(() => window.__game.stats.time), 0);
  await page.tap('#pause-button'); await page.tap('#btn-pause-menu');
  assert.equal(await page.evaluate(() => window.__game.state), 'menu');
  await page.tap('.card[data-char="ren"]');
  const renInk = await page.evaluate(() => window.__game.inkMax);
  assert.equal(renInk, 140);
  await page.tap('#pause-button'); await page.tap('#btn-pause-menu');
  await page.tap('#mute');
  await settle(page, o => page.reload(o));
  await page.waitForFunction(() => window.__game);
  assert.equal(await page.evaluate(() => window.__game.audio.muted), true);
  assert.equal(await page.evaluate(() => window.__game.showGhosts), false);
  assert.ok(await page.$('#scrolls .mini'));
  pass('Run again, menu return, Ren ability, and saved preferences/records survive reload');

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: false });
  assert.equal(await page.$eval('#rotate', el => getComputedStyle(el).display), 'flex');
  await page.screenshot({ path: 'shots/ios-portrait.png' });
  pass('Browser portrait fallback prompts landscape rotation');

  const desktop = await browser.newPage(); desktop.on('pageerror', e => errors.push(e.stack)); watchNetwork(desktop);
  await desktop.setViewport({ width: 1280, height: 800 });
  await settle(desktop, o => desktop.goto(origin, o));
  await desktop.waitForFunction(() => window.__game);
  await desktop.screenshot({ path: 'shots/ios-desktop-menu.png' });
  await desktop.click('.card[data-char="ren"]'); await wait(1900);
  const before = await desktop.evaluate(() => window.__game.stats.time);
  await desktop.keyboard.down('Space'); await wait(150); await desktop.keyboard.up('Space'); await wait(300);
  assert.ok(await desktop.evaluate(t => window.__game.stats.time > t, before));
  await desktop.keyboard.press('Escape');
  assert.equal(await desktop.evaluate(() => window.__game.state), 'menu');
  pass('Desktop keyboard jump and menu controls remain working');
  assert.deepEqual(errors, []);
  pass('No page runtime errors');
  await writeFile('shots/ios-test-report.json', JSON.stringify({ kind: 'Chromium touch emulation; not iOS Simulator', checks: report }, null, 2));
  console.log(`${report.length} checks passed. Native Xcode build/device tests remain required.`);
} finally {
  await browser.close(); await new Promise(r => server.close(r));
}
