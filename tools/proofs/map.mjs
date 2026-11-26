// Usage: flock /tmp/inkrunner-browser.lock node tools/proofs/map.mjs [assert|look|record]   (URL env, default http://localhost:5173/)
//   assert (default): the map painting itself, with real input on desktop (1600x900, mouse) and iPhone 13 landscape (touch):
//     a new best triggers the paint-in on return, and finishing again slower does not; the painted stretch matches the saved strokes' colors; saves stay
//     <= 20 KB per scroll; opening and panning the map stay <= 8 ms p95 (the map's own frame time) under 4x CPU throttle;
//     the walked path inks toward the newly opened node as the traveler walks; one moon per chapter, hung inside the stretch that earned it (other rings float
//     on the river); no console errors. Prints PASS/FAIL per line.
//   look: captures for judging the look: the map with one, three and all Summer scrolls painted, a frame strip of the
//     paint-in, and phone-size views. Saved in shots/proofs/map/.
//   record: plays the First Scroll's autoplay route with the real mouse and writes the best-run strokes the game saves
//     to shots/proofs/map/first-run.json (the source of FIRST_RUN in src/proofs/map.ts).
import { mkdirSync, writeFileSync } from 'node:fs';
import puppeteer, { KnownDevices } from 'puppeteer-core';

const URL = process.env.URL ?? 'http://localhost:5173/';
const MODE = process.argv[2] ?? 'assert';
const OUT = 'shots/proofs/map';
mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  headless: 'new',
  protocolTimeout: 60000,
  args: ['--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});

const DESKTOP = { name: 'desktop', desc: '1600x900, mouse and keyboard', viewport: { width: 1600, height: 900 }, input: 'mouse' };
const PHONE = { name: 'iphone', desc: 'iPhone 13 landscape (844x390), touch', device: KnownDevices['iPhone 13 landscape'], input: 'touch' };

/**
 * A fresh page for a profile, with the ghost API stubbed so no run is ever posted. A page that never plays a run can
 * skip the stub (`intercept: false`): on the dev machine, request interception sometimes leaves a dev-server module request
 * hanging, and the app never boots.
 */
async function newPage(profile, { intercept = true } = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  if (profile.device) await page.emulate(profile.device);
  else await page.setViewport(profile.viewport);
  if (intercept) {
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (new globalThis.URL(req.url()).pathname.startsWith('/api/')) {
        void req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ best: null, others: [] }) });
      } else void req.continue();
    });
  }
  const errors = [];
  // the dev server reloads the page when another builder saves a file: note it so a run can tell that from a bug
  page.on('console', (m) => { if (/\[vite\] (page reload|hot updated)/.test(m.text())) console.log(`  (dev server: ${m.text().slice(0, 90)})`); });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  if (process.env.DEBUG_NAV) page.on('framenavigated', (f) => f === page.mainFrame() && console.log(`  (navigated to ${f.url()} at ${new Date().toISOString().slice(11, 19)})`));
  page.on('pageerror', (e) => errors.push(e.stack ?? String(e)));
  return { ctx, page, errors };
}

/** Wait until the map has finished baking what is on screen and any paint-in is over. */
async function settle(page, timeout = 20000) {
  await page.waitForFunction(() => {
    const q = window.__map?.inspect?.();
    return q && !q.painting && !q.walking && (q.zoom ?? 1) === 1 && q.chunks.baking === 0 && q.chunks.stale === 0 && q.chunks.ready > 0;
  }, { timeout, polling: 100 });
  await wait(300);
}

/** Wait until the map's camera has stopped easing (so a tap lands on the node it aims at). */
async function camStill(page) {
  let last = NaN;
  for (let i = 0; i < 40; i++) {
    const x = await page.evaluate(() => window.__map.camX);
    if (Math.abs(x - last) < 0.5) return;
    last = x;
    await wait(120);
  }
}

// ─────────────────────────────────────────────────────────────── look

/** Retry a capture when the dev server reloads the page under it (other builders save files while this runs). */
async function retry(fn, tries = 4) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= tries || !/context was destroyed|navigation|Target closed|detached|timed out/i.test(String(e?.message))) throw e;
      console.log('  (page reloaded by the dev server; retrying)');
      await wait(3000);
    }
  }
}

async function look() {
  for (const profile of [DESKTOP, PHONE]) {
    const { ctx, page, errors } = await newPage(profile);
    const tag = profile.name;
    for (const [n, label] of [[2, 'summer-1'], [4, 'summer-3'], [6, 'all']]) await retry(async () => {
      await page.goto(`${URL}?proof=map&cleared=${n}&panel=0`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__map?.isOpen && window.__mapProof, { timeout: 20000 });
      await settle(page);
      // the cleared journey, one view at a time, from the title to the frontier
      const w = await page.evaluate(() => window.__map.inspect().width);
      const vu = await page.evaluate(() => { const q = window.__map.inspect(); return (innerWidth * q.pr) / q.scale; });
      const stops = [];
      for (let x = 0; x < w; x += vu * 0.9) stops.push(x);
      let k = 0;
      for (const x of stops) {
        await page.evaluate((x) => window.__map.jumpTo(x), x);
        await settle(page);
        await page.screenshot({ path: `${OUT}/${tag}-${label}-${String(k++).padStart(2, '0')}.png` });
      }
      console.log(tag, label, stops.length, 'views');
    });
    // frame strips of the paint-in: add the next clear the way "Continue the journey" does
    // (Summer 1, whose first ring rises as the chapter's moon, and Summer 3)
    for (const [n, label, frames] of [[1, 'paintin-moon', 20], [3, 'paintin', 14]]) await retry(async () => {
      await page.goto(`${URL}?proof=map&cleared=${n}&panel=0`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__map?.isOpen && window.__mapProof, { timeout: 20000 });
      await settle(page);
      await page.evaluate(() => window.__mapProof.addClear());
      const t0 = Date.now();
      for (let i = 0; i < frames; i++) {
        await page.screenshot({ path: `${OUT}/${tag}-${label}-${String(i).padStart(2, '0')}.png` });
        await wait(Math.max(0, 380 * (i + 1) - (Date.now() - t0)));
      }
      await settle(page);
      await page.screenshot({ path: `${OUT}/${tag}-${label}-done.png` });
    });
    // what a person opening ?proof=map sees: the dev panel's tab (open on a desktop, folded on a phone)
    await retry(async () => {
      await page.goto(`${URL}?proof=map&cleared=4`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__map?.isOpen && window.__mapProof, { timeout: 20000 });
      await settle(page);
      await page.screenshot({ path: `${OUT}/${tag}-panel.png` });
    });
    if (errors.length) console.log('ERRORS', tag, errors.slice(0, 5).join(' || '));
    await ctx.close();
  }
}

// ─────────────────────────────────────────────────────────────── assert

let failures = 0;
const results = [];
async function step(tag, name, fn) {
  let ok = false;
  let note = '';
  try {
    const r = await fn();
    ok = r === true || (Array.isArray(r) && r[0] === true);
    note = Array.isArray(r) ? r[1] : '';
  } catch (e) {
    note = String(e?.message ?? e).split('\n')[0];
  }
  if (!ok) failures++;
  const line = `${ok ? 'PASS' : 'FAIL'} [${tag}] ${name}${note ? ' · ' + note : ''}`;
  results.push(line);
  console.log(line);
  return ok;
}

/** Real input helpers for one page. */
function inputs(page, touch) {
  const press = (sel) => (touch ? page.tap(sel) : page.click(sel));
  const viewCenter = () => page.evaluate(() => { const b = document.querySelector('#map .map-view').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height * 0.3, w: b.width }; });
  const drag = async (dx, steps = 12, dtMs = 16) => {
    const r = await viewCenter();
    const x0 = r.x - dx / 2;
    if (touch) {
      await page.touchscreen.touchStart(x0, r.y);
      for (let i = 1; i <= steps; i++) { await page.touchscreen.touchMove(x0 + (dx * i) / steps, r.y); await wait(dtMs); }
      await page.touchscreen.touchEnd();
    } else {
      await page.mouse.move(x0, r.y);
      await page.mouse.down();
      for (let i = 1; i <= steps; i++) { await page.mouse.move(x0 + (dx * i) / steps, r.y); await wait(dtMs); }
      await page.mouse.up();
    }
  };
  /** paint one stroke across the game view, in screen fractions */
  const paint = async (fx0, fy0, fx1, fy1) => {
    const vw = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
    const n = 14;
    const pt = (i) => [vw.w * (fx0 + ((fx1 - fx0) * i) / n), vw.h * (fy0 + ((fy1 - fy0) * i) / n) - Math.sin((i / n) * Math.PI) * vw.h * 0.03];
    const [ax, ay] = pt(0);
    if (touch) {
      await page.touchscreen.touchStart(ax, ay);
      for (let i = 1; i <= n; i++) { const [x, y] = pt(i); await page.touchscreen.touchMove(x, y); await wait(16); }
      await page.touchscreen.touchEnd();
    } else {
      await page.mouse.move(ax, ay);
      await page.mouse.down();
      for (let i = 1; i <= n; i++) { const [x, y] = pt(i); await page.mouse.move(x, y, { steps: 2 }); }
      await page.mouse.up();
    }
  };
  /** paint one purple ring (a 370° loop, so it closes) centred `dx` ahead of the traveler and `above` up, radius `r` (world u) */
  const ring = async (dx, above, r) => {
    const pts = await page.evaluate((dx, above, r) => {
      const g = window.__game;
      const c = g.canvas.getBoundingClientRect();
      const cx = g.px + dx;
      const cy = g.py - above;
      const out = [];
      for (let i = 0; i <= 31; i++) {
        const a = ((-90 - 330 + (370 * i) / 31) * Math.PI) / 180;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        out.push([c.left + (((x - g.camCX) * g.S + g.W / 2) * c.width) / g.W, c.top + (((y - g.camCY) * g.S + g.H / 2) * c.height) / g.H]);
      }
      return out;
    }, dx, above, r);
    if (touch) {
      await page.touchscreen.touchStart(...pts[0]);
      for (const q of pts.slice(1)) { await page.touchscreen.touchMove(...q); await wait(16); }
      await page.touchscreen.touchEnd();
    } else {
      await page.mouse.move(...pts[0]);
      await page.mouse.down();
      for (const q of pts.slice(1)) await page.mouse.move(...q, { steps: 2 });
      await page.mouse.up();
    }
  };
  return { press, drag, paint, ring };
}

/**
 * Sample the map canvas under each painted stroke of `id` that is on screen and classify the pixels by hue
 * against the four inks. Returns per-kind counts of marks whose pixels read as their own ink.
 */
const sampleMarks = (page, id) => page.evaluate((id) => {
  const map = window.__map;
  const q = map.inspect();
  const cv = document.querySelector('#map canvas');
  const k = cv.width / cv.clientWidth;
  const g = cv.getContext('2d');
  const HUES = { shu: 8, kin: 40, ai: 222, murasaki: 283 };
  const hueOf = (r, gg, b) => {
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
    const d = mx - mn;
    if (!mx || d / mx < 0.3 || d < 40) return null; // paper, ink and greys carry no hue
    let h = mx === r ? ((gg - b) / d) % 6 : mx === gg ? (b - r) / d + 2 : (r - gg) / d + 4;
    h *= 60;
    return h < 0 ? h + 360 : h;
  };
  const classify = (h) => {
    let best = null, bd = 1e9;
    for (const [kind, hh] of Object.entries(HUES)) { const dd = Math.min(Math.abs(h - hh), 360 - Math.abs(h - hh)); if (dd < bd) { bd = dd; best = kind; } }
    return best;
  };
  const out = { checked: 0, matched: 0, byKind: {}, misses: [] };
  for (const m of q.marks.filter((m) => m.scroll === id)) {
    const on = m.pts.filter(([x, y]) => x > 4 && x < cv.clientWidth - 4 && y > 4 && y < cv.clientHeight - 4);
    if (on.length < m.pts.length * 0.8) continue;
    const votes = {};
    let n = 0;
    for (const [x, y] of on) {
      const px = g.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data;
      const h = hueOf(px[0], px[1], px[2]);
      if (h === null) continue;
      const c = classify(h);
      votes[c] = (votes[c] ?? 0) + 1;
      n++;
    }
    const top = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
    const ok = n >= 3 && top && top[0] === m.kind && top[1] >= n * 0.5;
    out.checked++;
    if (ok) out.matched++;
    else out.misses.push(`${m.kind}/${m.role}:${JSON.stringify(votes)}`);
    out.byKind[m.kind] = (out.byKind[m.kind] ?? 0) + (ok ? 1 : 0);
  }
  return out;
}, id);

/** Count saturated pixels of each ink hue across the whole map canvas (coarse grid). */
const inkPixels = (page) => page.evaluate(() => {
  const cv = document.querySelector('#map canvas');
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4 * 7) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx - mn > 70 && (mx - mn) / mx > 0.4) n++;
  }
  return n;
});

async function flow(profile) {
  const touch = profile.input === 'touch';
  const tag = profile.name;
  const { ctx, page, errors } = await newPage(profile);
  const { press, drag, paint, ring } = inputs(page, touch);
  const char = touch ? 'kohaku' : 'ren';
  console.log(`\n── ${tag}: ${profile.desc}`);

  // A save with the First Scroll cleared (its real recorded run), then the map opened from the title with real input.
  await page.goto(`${URL}?proof=map&cleared=1&panel=0&keep=1&play=${char}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__map?.isOpen && window.__mapProof, { timeout: 20000 });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__map && document.fonts.status === 'loaded', { timeout: 20000 });
  await wait(800);
  await press('#tab-campaign');
  await wait(200);
  await press(`.card[data-char="${char}"]`);
  await wait(400);
  await settle(page);

  await step(tag, 'opening the map with no new best does not paint in', async () => {
    const q = await page.evaluate(() => window.__map.inspect());
    return [!q.painting && q.marks.some((m) => m.scroll === 'first'), `marks on the map ${q.marks.length}, painting ${JSON.stringify(q.painting)}`];
  });

  // Play Summer 1 for real: start it from its node, paint real strokes, then teleport to the torii. Summer 1 is
  // Purple only, so the strokes are a linked pair of rings: the first rises as Summer's moon, the second floats.
  await page.evaluate(() => window.__map.showStretch('summer-1'));
  await camStill(page);
  await press('.map-node[data-node="summer-1"]');
  await page.waitForFunction(() => window.__game.state === 'play' && window.__game.introT >= 1.5, { timeout: 15000 });
  await ring(380, 200, 46);
  await wait(250);
  await ring(620, 200, 46);
  await wait(600);
  const painted = await page.evaluate(() => window.__game.strokes.map((s) => s.kind));
  await page.evaluate(() => { const G = window.__game; const R = G.raijin; if (R?.def) { R.cleared = R.cleared.map(() => true); for (const d of R.drums) d.clean = true; R.cleaned = R.drums.length; } const T = G.level.torii; G.px = T.x - 200; G.py = G.surfaceBelow(T.x - 200, -1000) ?? T.y; G.vy = 0; G.camCX = T.x; for (const l of G.level.lanterns) l.lit = true; });
  await page.waitForFunction(() => !document.getElementById('finish').classList.contains('hidden'), { timeout: 15000 });
  await wait(900);
  const rank = await page.evaluate(() => document.getElementById('rank').textContent);
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('inkrunner:campaign')).strokes['summer-1']);
  await press('#btn-continue');

  // The paint-in, sampled as it happens.
  const seen = [];
  const t0 = Date.now();
  let pix0 = -1;
  while (Date.now() - t0 < 9000) {
    const q = await page.evaluate(() => window.__map.isOpen && window.__map.inspect());
    if (q) {
      if (pix0 < 0 && q.painting) pix0 = await inkPixels(page);
      seen.push({ t: Date.now() - t0, p: q.painting, walking: q.walking, trail: Math.round(q.trail) });
      if (!q.painting && !q.walking && seen.length > 5) break;
    }
    await wait(120);
  }
  await settle(page);
  await step(tag, 'a new best paints its stretch in on return (stroke by stroke)', async () => {
    const ps = seen.filter((s) => s.p && s.p.id === 'summer-1');
    const landed = [...new Set(ps.map((s) => s.p.landed))];
    const total = ps[0]?.p.total ?? 0;
    const ok = /New best/.test(rank) && !!before && total === before.strokes.length && total === painted.length && landed.length >= Math.min(3, total + 1) && landed.includes(total);
    return [ok, `rank "${rank}"; painted ${painted.join(',')}; saved ${before?.strokes.length}; live strokes ${total}; landed went ${landed.join('→')}`];
  });
  await step(tag, 'the path inks toward the new node as the traveler walks', async () => {
    const walk = seen.filter((s) => s.walking);
    const trails = walk.map((s) => s.trail);
    const rising = trails.every((v, i) => !i || v >= trails[i - 1]);
    const after = seen.filter((s) => !s.walking && s.trail > 0).map((s) => s.trail);
    const startedShort = trails.length > 2 && trails[0] < 40;
    const ok = rising && startedShort && trails[trails.length - 1] > trails[0] + 100 && after.length > 0 && Math.max(...after) > trails[trails.length - 1];
    const state = await page.evaluate(() => document.querySelector('.map-node[data-node="summer-2"]').dataset.state);
    return [ok && state === 'open', `trail during the walk ${trails.join(',')} → after ${after.slice(-1)}; summer-2 ${state}`];
  });

  // Colors: every cleared stretch's strokes read as their own inks.
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('inkrunner:campaign')).strokes);
  for (const id of Object.keys(saved)) {
    await step(tag, `the ${id} stretch shows the saved strokes' colors`, async () => {
      await page.evaluate((id) => window.__map.showStretch(id), id);
      await wait(1200);
      await settle(page);
      const s = await sampleMarks(page, id);
      const kinds = [...new Set(saved[id].strokes.map((x) => x.k))].sort();
      const shown = Object.keys(s.byKind).filter((k) => s.byKind[k] > 0).sort();
      const ok = s.checked >= Math.min(3, saved[id].strokes.length) && s.matched >= s.checked * 0.85 && kinds.join() === shown.join();
      return [ok, `saved inks ${kinds.join(',')}; shown ${shown.join(',')}; ${s.matched}/${s.checked} strokes on screen read as their ink${s.misses.length ? '; misses ' + s.misses.slice(0, 3).join(' ') : ''}`];
    });
  }
  await page.screenshot({ path: `${OUT}/assert-${tag}-after.png` });

  await step(tag, 'saves stay <= 20 KB per scroll (real runs and a worst case)', async () => {
    const sizes = Object.fromEntries(Object.entries(saved).map(([id, r]) => [id, JSON.stringify(r).length]));
    const worst = await page.evaluate(async () => {
      const save = await import('/src/campaign/save.ts');
      const strokes = Array.from({ length: 400 }, (_, i) => ({ k: ['shu', 'ai', 'kin', 'murasaki'][i % 4], p: Array.from({ length: 300 }, (_, j) => [i * 40 + j * 8, 300 + Math.sin(j) * 90, 17.3]).flat() }));
      localStorage.setItem('inkrunner:best:summer-4', JSON.stringify({ time: 99.9, grade: '梅' }));
      save.saveBestStrokes('summer-4', { char: 'ren', time: 99.9, len: 16000, strokes });
      const rec = save.loadCampaign().strokes['summer-4'];
      localStorage.removeItem('inkrunner:best:summer-4');
      const c = JSON.parse(localStorage.getItem('inkrunner:campaign'));
      delete c.strokes['summer-4'];
      localStorage.setItem('inkrunner:campaign', JSON.stringify(c));
      return { bytes: JSON.stringify(rec).length, kept: rec.strokes.length };
    });
    const ok = Object.values(sizes).every((n) => n <= 20480) && worst.bytes <= 20480 && worst.kept > 0;
    return [ok, `${Object.entries(sizes).map(([k, v]) => `${k} ${(v / 1024).toFixed(1)} KB`).join(', ')}; worst case (400 strokes x 300 points) ${(worst.bytes / 1024).toFixed(1)} KB, ${worst.kept} strokes kept`];
  });

  await step(tag, 'finishing again slower than the best (no new best) does not paint again', async () => {
    // Summer 1 a second time, for real: start it from its node, let the clock run past the best, then finish it
    const best = await page.evaluate(() => JSON.parse(localStorage.getItem('inkrunner:best:summer-1')));
    const strokesBefore = await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('inkrunner:campaign')).strokes['summer-1']));
    await page.evaluate(() => window.__map.showStretch('summer-1'));
    await camStill(page);
    await press('.map-node[data-node="summer-1"]');
    await page.waitForFunction(() => window.__game.state === 'play' && window.__game.introT >= 1.5, { timeout: 15000 });
    await page.waitForFunction((t) => window.__game.stats.time > t + 1.5, { timeout: 90000, polling: 100 }, best.time);
    await page.evaluate(() => { const G = window.__game; const R = G.raijin; if (R?.def) { R.cleared = R.cleared.map(() => true); for (const d of R.drums) d.clean = true; R.cleaned = R.drums.length; } const T = G.level.torii; G.px = T.x - 200; G.py = G.surfaceBelow(T.x - 200, -1000) ?? T.y; G.vy = 0; G.camCX = T.x; for (const l of G.level.lanterns) l.lit = true; });
    await page.waitForFunction(() => !document.getElementById('finish').classList.contains('hidden'), { timeout: 15000 });
    await wait(900);
    const rank2 = await page.evaluate(() => document.getElementById('rank').textContent);
    const time2 = await page.evaluate(() => window.__game.stats.time);
    await press('#btn-continue');
    let painted2 = false;
    let opened = false;
    const t1 = Date.now();
    while (Date.now() - t1 < 3500) {
      const q = await page.evaluate(() => ({ open: window.__map.isOpen, painting: window.__map.inspect().painting }));
      opened ||= q.open;
      painted2 ||= !!q.painting;
      await wait(100);
    }
    const strokesAfter = await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('inkrunner:campaign')).strokes['summer-1']));
    const ok = opened && !painted2 && !/New best/.test(rank2) && strokesAfter === strokesBefore && time2 > best.time;
    return [ok, `best ${best.time.toFixed(2)}s, this run ${time2.toFixed(2)}s; rank "${rank2}"; map opened ${opened}; painted ${painted2}; saved strokes unchanged ${strokesAfter === strokesBefore}`];
  });

  await step(tag, 'one moon per chapter, every other ring floats on the river', async () => {
    // its own browser context: the previous step's proof page restores the real save on pagehide, which raced this load
    const fresh = await newPage(profile, { intercept: false });
    const page = fresh.page;
    // the step's own page goes to the front: a page behind the run's first page gets no animation frames, and the
    // map opens on one
    await page.bringToFront();
    try {
      // the whole journey seeded (several Summer scrolls with rings): count the moons
      await page.goto(`${URL}?proof=map&cleared=6&panel=0&keep=1&play=${char}`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__map?.isOpen && window.__mapProof, { timeout: 20000 }).catch(async (e) => {
        const st = await page.evaluate(() => ({ url: location.href, map: !!window.__map, open: window.__map?.isOpen, proof: !!window.__mapProof, game: window.__game?.state, cs: document.querySelector('.cutscene')?.className ?? null, visible: document.visibilityState, seen: JSON.parse(localStorage.getItem('inkrunner:campaign') ?? 'null')?.seen })).catch((x) => String(x));
        throw new Error(`${e.message}; page ${JSON.stringify(st)}; errors ${fresh.errors.slice(0, 2).join(' | ')}`);
      });
      const marks = await page.evaluate(() => window.__map.inspect().marks);
      const rings = marks.filter((m) => m.kind === 'murasaki');
      const moons = rings.filter((m) => m.role === 'moon');
      const summerMoons = moons.filter((m) => m.scroll.startsWith('summer')).length;
      const others = rings.filter((m) => m.role !== 'moon');
      // the moon hangs in the sky of the stretch that earned it: between the node before it and its own node
      const moon = moons[0];
      await page.evaluate((id) => window.__map.showStretch(id), moon?.scroll ?? 'summer-1');
      await wait(1200);
      await settle(page);
      const where = await page.evaluate((id) => {
        const q = window.__map.inspect();
        const m = q.marks.find((x) => x.role === 'moon');
        const ids = [...document.querySelectorAll('.map-node')].map((b) => b.dataset.node);
        const prev = ids[ids.indexOf(id) - 1];
        const cx = (sel) => { const r = document.querySelector(`.map-node[data-node="${sel}"]`).getBoundingClientRect(); return r.left + r.width / 2; };
        const xs = m.pts.map((p) => p[0]);
        return { x0: Math.min(...xs), x1: Math.max(...xs), a: cx(prev), b: cx(id), prev };
      }, moon?.scroll ?? 'summer-1');
      const inside = where.x0 > where.a && where.x1 < where.b;
      const ok = summerMoons === 1 && moons.length === 1 && others.length > 0 && others.every((m) => m.role === 'float') && inside;
      return [ok, `${rings.length} purple rings: ${moons.length} moon (${summerMoons} in Summer, ${moon?.scroll}), ${others.length} floating lanterns; moon x ${Math.round(where.x0)}-${Math.round(where.x1)} px inside its stretch (${where.prev} node ${Math.round(where.a)} to ${moon?.scroll} node ${Math.round(where.b)}): ${inside}`];
  
    } finally {
      await fresh.ctx.close().catch(() => {});
    }
  });

  await step(tag, 'no console errors', async () => [errors.length === 0, errors.slice(0, 4).join(' || ')]);
  await ctx.close();
}

/** The map's own frame time (CampaignMap.frame) under CPU throttling, while opening, panning and painting in. */
async function perf(profile) {
  const touch = profile.input === 'touch';
  const tag = profile.name;
  const { ctx, page, errors } = await newPage(profile);
  try {
    await perfRun(profile, page, errors);
  } finally {
    await ctx.close().catch(() => {});
  }
}

async function perfRun(profile, page, errors) {
  const touch = profile.input === 'touch';
  const tag = profile.name;
  const { press, drag, paint, ring } = inputs(page, touch);
  const char = touch ? 'kohaku' : 'ren';
  const THROTTLE = Number(process.env.THROTTLE ?? 4);
  const BUDGET = Number(process.env.BUDGET ?? 8);
  // seed the whole journey (every scroll painted), then load the game the normal way
  await page.goto(`${URL}?proof=map&cleared=6&panel=0&keep=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__map?.isOpen && window.__mapProof, { timeout: 20000 });
  // ...except the last scroll, which the paint phase clears for real
  await page.evaluate(() => {
    localStorage.removeItem('inkrunner:best:summer-gate');
    const c = JSON.parse(localStorage.getItem('inkrunner:campaign'));
    delete c.strokes['summer-gate'];
    localStorage.setItem('inkrunner:campaign', JSON.stringify(c));
  });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__map && document.fonts.status === 'loaded', { timeout: 20000 });
  await wait(1000);
  await page.evaluate(() => {
    const map = window.__map;
    const fr = map.frame.bind(map);
    const st = (window.__mperf = { on: false, phase: 'open', frames: {} });
    map.frame = (dt) => {
      const t0 = performance.now();
      fr(dt);
      if (st.on && map.isOpen) (st.frames[st.phase] ??= []).push(performance.now() - t0);
    };
  });
  const cdp = await page.createCDPSession();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  await press('#tab-campaign');
  await wait(150);
  await page.evaluate(() => (window.__mperf.on = true));
  await press(`.card[data-char="${char}"]`);
  await wait(2500);
  await page.evaluate(() => (window.__mperf.phase = 'pan'));
  for (let i = 0; i < 5; i++) { await drag(-(await page.evaluate(() => innerWidth)) * 0.7, 10, 16); await wait(250); }
  if (!touch) {
    await page.mouse.move(800, 300);
    for (let i = 0; i < 6; i++) { await page.mouse.wheel({ deltaY: 500 }); await wait(120); }
    await page.keyboard.press('End');
    await wait(1200);
    await page.keyboard.press('Home');
    await wait(1500);
  } else {
    for (let i = 0; i < 5; i++) { await drag((await page.evaluate(() => innerWidth)) * 0.8, 6, 16); await wait(200); }
  }
  // the paint-in under throttle, the real way: play the last scroll (its best taken out of the seeded save),
  // finish it with a new best, then "Continue the journey" (the game itself runs unthrottled; the throttle
  // goes back on for the return to the map)
  await page.evaluate(() => (window.__mperf.on = false));
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await page.evaluate(() => window.__map.showStretch('summer-gate'));
  await camStill(page);
  await press('.map-node[data-node="summer-gate"]');
  await page.waitForFunction(() => window.__game.state === 'play' && window.__game.introT >= 1.5, { timeout: 15000 });
  // the gate starts on Purple: a vermilion line on desktop (key 1), a ring with one finger
  if (!touch) {
    await page.keyboard.press('Digit1');
    await paint(0.5, 0.3, 0.82, 0.34);
  } else await ring(380, 200, 46);
  await wait(500);
  await page.evaluate(() => { const G = window.__game; const R = G.raijin; if (R?.def) { R.cleared = R.cleared.map(() => true); for (const d of R.drums) d.clean = true; R.cleaned = R.drums.length; } const T = G.level.torii; G.px = T.x - 200; G.py = G.surfaceBelow(T.x - 200, -1000) ?? T.y; G.vy = 0; G.camCX = T.x; for (const l of G.level.lanterns) l.lit = true; });
  await page.waitForFunction(() => !document.getElementById('finish').classList.contains('hidden'), { timeout: 15000 });
  await wait(900);
  const rankP = await page.evaluate(() => document.getElementById('rank').textContent);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  await page.evaluate(() => { window.__mperf.phase = 'paint'; window.__mperf.on = true; window.__mperf.seen = null; });
  await press('#btn-continue');
  const tP = Date.now();
  while (Date.now() - tP < 6500) {
    await page.evaluate(() => { const q = window.__map.isOpen && window.__map.inspect().painting; if (q) window.__mperf.seen = q; });
    await wait(200);
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const frames = await page.evaluate(() => { window.__mperf.on = false; return window.__mperf.frames; });
  const seenP = await page.evaluate(() => window.__mperf.seen);
  const stat = (f) => {
    const s = [...f].sort((a, b) => a - b);
    const q = (k) => s[Math.min(s.length - 1, Math.floor(k * s.length))];
    return { n: s.length, p50: q(0.5), p95: q(0.95), max: s[s.length - 1] };
  };
  for (const phase of ['open', 'pan', 'paint']) {
    await step(tag, `map frame time while ${phase === 'open' ? 'opening' : phase === 'pan' ? 'panning' : 'painting in'} <= ${BUDGET} ms p95 at ${THROTTLE}x throttle`, async () => {
      const f = frames[phase] ?? [];
      if (f.length < 20) return [false, `only ${f.length} frames`];
      const s = stat(f);
      const real = phase !== 'paint' || (/New best/.test(rankP) && seenP?.id === 'summer-gate');
      const how = phase === 'paint' ? `; after a real finish ("${rankP}") and Continue, painted ${seenP ? `${seenP.id} ${seenP.landed}/${seenP.total}` : 'nothing'}` : '';
      return [s.p95 <= BUDGET && real, `${s.n} frames, p50 ${s.p50.toFixed(2)} p95 ${s.p95.toFixed(2)} max ${s.max.toFixed(2)} ms${how}`];
    });
  }
  await step(tag, 'no console errors (perf run)', async () => [errors.length === 0, errors.slice(0, 4).join(' || ')]);
}


// ─────────────────────────────────────────────────────────────── record

/** The First Scroll's autoplay route (tools/shot.mjs autoplay), played with the real mouse; dumps the strokes the game saves. */
async function record() {
  const { ctx, page } = await newPage(DESKTOP);
  await page.goto(`${URL}?play=ren&level=first`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game?.state === 'play', { timeout: 20000 });
  const g = (fn, ...a) => page.evaluate(fn, ...a);
  const line = (x0, y0, x1, y1, n = 20) => Array.from({ length: n + 1 }, (_, i) => ({ x: x0 + ((x1 - x0) * i) / n, y: y0 + ((y1 - y0) * i) / n + Math.sin((i / n) * Math.PI) * -18 }));
  const zig = (x0, x1, y0, y1, n = 4) => Array.from({ length: n + 1 }, (_, i) => ({ x: i % 2 ? x1 : x0, y: y0 + ((y1 - y0) * i) / n }));
  const toScreen = (p) => g(([x, y]) => { const G = window.__game; const r = G.canvas.getBoundingClientRect(); return [((G.W / 2 + (x - G.camCX) * G.S) * r.width) / G.W, ((G.H / 2 + (y - G.camCY) * G.S) * r.height) / G.H]; }, [p.x, p.y]);
  const paint = async (pts, ink) => {
    await page.keyboard.press(`Digit${ink}`);
    const f = await toScreen(pts[0]);
    await page.mouse.move(f[0], f[1]);
    await page.mouse.down();
    for (const p of pts.slice(1)) { const q = await toScreen(p); await page.mouse.move(q[0], q[1], { steps: 3 }); }
    await page.mouse.up();
  };
  const plan = [
    [1452, 'jump'], [2450, 1, line(2860, 552, 3500, 552, 26)], [4100, 1, line(4180, 552, 4575, 312, 20)], [6380, 2, line(6640, 566, 7100, 215, 22)],
    [7330, 2, line(7700, 90, 7990, 140, 14)], [8750, 3, zig(9140, 9330, 320, 470, 4)], [8800, 3, line(9600, 320, 9780, 430, 10)], [9700, 1, line(9890, 490, 10510, 510, 26)],
    [9760, 3, zig(10080, 10300, 320, 460, 4)], [10560, 2, line(10790, 350, 11130, 380, 16)], [11000, 1, line(11060, 508, 11380, 272, 20)], [11030, 3, zig(11470, 11650, 140, 250, 4)],
    [11700, 3, line(11990, 160, 12170, 260, 10)], [12150, 1, line(12400, 294, 13310, 524, 34)], [12180, 3, zig(12770, 12930, 260, 440, 2)], [13450, 2, line(13770, 380, 14070, 410, 14)],
  ];
  const t0 = Date.now();
  let i = 0;
  while (Date.now() - t0 < 150000) {
    const st = await g(() => ({ x: window.__game.px, state: window.__game.state }));
    if (st.state === 'finish') break;
    if (i < plan.length && st.x >= plan[i][0]) {
      const [, kind, pts] = plan[i];
      if (kind === 'jump') { await page.keyboard.down('Space'); await wait(450); await page.keyboard.up('Space'); }
      else await paint(pts, kind);
      i++;
    }
    await wait(40);
  }
  await wait(3500);
  const out = await g(() => ({ stats: { ...window.__game.stats, grade: window.__game.grade() }, len: window.__game.level.length, strokes: window.__game.serializeStrokes() }));
  writeFileSync(`${OUT}/first-run.json`, JSON.stringify(out));
  console.log('recorded', JSON.stringify(out.stats), out.strokes.length, 'strokes →', `${OUT}/first-run.json`);
  await ctx.close();
}

if (MODE === 'look') await look();
else if (MODE === 'record') await record();
else if (MODE === 'assert') {
  const only = process.env.ONLY;
  for (const profile of [DESKTOP, PHONE].filter((p) => !process.env.PROFILE || p.name === process.env.PROFILE)) {
    if (!only || only === 'flow') await flow(profile);
    if (!only || only === 'perf') {
      // a dev-server reload under the run (other builders save files) is retried, not counted as a failure
      for (let attempt = 1; ; attempt++) {
        try {
          await perf(profile);
          break;
        } catch (e) {
          const msg = String(e?.message ?? e).split('\n')[0];
          if (attempt >= 3) {
            failures++;
            console.log(`FAIL [${profile.name}] perf run · ${msg}`);
            break;
          }
          console.log(`  (perf run interrupted: ${msg}; retrying)`);
          await wait(5000);
        }
      }
    }
  }
  console.log(failures ? `\n${failures} assertion(s) FAILED` : '\nAll assertions PASS');
}
await browser.close();
process.exit(failures ? 1 : 0);
