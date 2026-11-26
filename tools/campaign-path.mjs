// Usage: flock /tmp/inkrunner-browser.lock node tools/campaign-path.mjs  (URL=http://127.0.0.1:5181/ by default) — title → campaign tab →
// prologue (plays on a fresh profile, skipped by real input) → map → seeded 'first' clear → Summer 1 → map → free play (no cutscenes) →
// a real first clear of summer-gate (seeded through Summer 4): the Summer ending plays once, hands over onto Autumn still rolled up,
// holds, then the gate's paint-in pans back → the map's markers replay both cutscenes → an unseen ending plays on entry from the title;
// with a real mouse and keyboard at 1600x900 and real touch at iPhone 13 landscape. Shots in shots/foundation/campaign/; the
// cutscene hand-overs (desktop, played to the end) in shots/rough/cutscenes/. Needs the dev server (window.__cutscene is dev-only).
import { mkdirSync } from 'node:fs';
import puppeteer, { KnownDevices } from 'puppeteer-core';

const URL = process.env.URL ?? 'http://127.0.0.1:5181/';
const OUT = 'shots/foundation/campaign';
const CS_OUT = 'shots/rough/cutscenes';
mkdirSync(OUT, { recursive: true });
mkdirSync(CS_OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  headless: 'new',
  args: ['--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});

// A plausible best run on the First Scroll (the autoplay route's strokes), for the map's faint best-stroke layer.
const line = (x0, y0, x1, y1, n = 20) => Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n + Math.sin((i / n) * Math.PI) * -18, 16]);
const SEED_STROKES = [
  ['shu', line(2860, 552, 3500, 552, 26)], ['shu', line(4180, 552, 4575, 312, 20)], ['ai', line(6640, 566, 7100, 215, 22)],
  ['ai', line(7700, 90, 7990, 140, 14)], ['kin', line(9140, 320, 9330, 470, 8)], ['shu', line(9890, 490, 10510, 510, 26)],
  ['ai', line(10790, 350, 11130, 380, 16)], ['kin', line(11470, 140, 11650, 250, 8)], ['shu', line(12400, 294, 13310, 524, 34)],
].map(([k, pts]) => ({ k, p: pts.flat().map((v) => Math.round(v)) }));

let failures = 0;

async function run(profile) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const touch = profile.input === 'touch';
  if (profile.device) await page.emulate(profile.device);
  else await page.setViewport(profile.viewport);
  // Local ghost fixture: the harness never posts runs (teleported ones included) to a live ghost server.
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (new globalThis.URL(req.url()).pathname.startsWith('/api/')) {
      void req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ best: null, others: [] }) });
    } else void req.continue();
  });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.stack ?? String(e)));
  // the dev server hot-reloads when any builder saves a file: a reload mid-run invalidates the run, so say so
  let navigating = false;
  page.on('framenavigated', (f) => {
    if (f === page.mainFrame() && !navigating) errors.push('page reloaded during the run (dev server hot reload?): rerun');
  });
  // every cutscene overlay that ever appears, in order (free play must never show one)
  await page.evaluateOnNewDocument(() => {
    window.__csLog = [];
    new MutationObserver((ms) => {
      for (const m of ms) for (const n of m.addedNodes) if (n.classList?.contains('cutscene')) window.__csLog.push(n.getAttribute('aria-label'));
    }).observe(document, { childList: true, subtree: true });
  });
  const tag = profile.name;
  const shot = (name) => page.screenshot({ path: `${OUT}/${tag}-${name}.png` });
  const step = async (name, fn) => {
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
    console.log(`${ok ? 'PASS' : 'FAIL'} [${tag}] ${name}${note ? ' · ' + note : ''}`);
    return ok;
  };
  const press = async (sel) => (touch ? page.tap(sel) : page.click(sel));
  const visible = (sel) => page.evaluate((s) => { const el = document.querySelector(s); return !!el && !el.classList.contains('hidden') && !el.hidden && getComputedStyle(el).display !== 'none'; }, sel);
  // Synthetic iPhone safe areas (notch side 44px, home indicator 21px), as in tools/ios-smoke.mjs.
  const insets = async () => {
    if (!touch) return;
    await page.evaluate(() => {
      const css = [...document.styleSheets].flatMap((s) => [...s.cssRules].map((r) => r.cssText)).join('\n');
      const style = document.createElement('style');
      style.textContent = css.replaceAll('env(safe-area-inset-left)', '44px').replaceAll('env(safe-area-inset-right)', '44px')
        .replaceAll('env(safe-area-inset-bottom)', '21px').replaceAll('env(safe-area-inset-top)', '0px');
      document.head.appendChild(style);
      window.__game.resize();
    });
  };
  const load = async (url = URL) => {
    navigating = true;
    await page.goto(url, { waitUntil: 'load' });
    navigating = false;
    await page.waitForFunction(() => window.__game && window.__map && document.fonts.status === 'loaded', { timeout: 15000 });
    await wait(1200);
    await insets();
  };
  // Real drag across the map view: mouse down/move/up, or one finger.
  const drag = async (dx) => {
    const r = await page.evaluate(() => { const b = document.querySelector('#map .map-view').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height * 0.3 }; });
    const steps = 12;
    if (touch) {
      await page.touchscreen.touchStart(r.x, r.y);
      for (let i = 1; i <= steps; i++) { await page.touchscreen.touchMove(r.x + (dx * i) / steps, r.y); await wait(16); }
      await page.touchscreen.touchEnd();
    } else {
      await page.mouse.move(r.x, r.y);
      await page.mouse.down();
      for (let i = 1; i <= steps; i++) { await page.mouse.move(r.x + (dx * i) / steps, r.y); await wait(16); }
      await page.mouse.up();
    }
  };
  // Pan with real input until a node sits comfortably inside the view.
  const bringIntoView = async (id) => {
    for (let i = 0; i < 12; i++) {
      const q = await page.evaluate((id) => {
        const v = document.querySelector('#map .map-view').getBoundingClientRect();
        const b = document.querySelector(`.map-node[data-node="${id}"]`).getBoundingClientRect();
        return { off: b.left + b.width / 2 - (v.left + v.width / 2), half: v.width / 2 };
      }, id);
      if (Math.abs(q.off) < q.half * 0.6) return;
      await drag(-Math.sign(q.off) * Math.min(Math.abs(q.off), q.half * 0.9));
      await wait(500);
    }
  };
  const camX = () => page.evaluate(() => window.__map.camX);
  const nodeState = (id) => page.evaluate((id) => document.querySelector(`.map-node[data-node="${id}"]`)?.dataset.state, id);
  const insideSafe = (sel) => page.evaluate((sel, touch) => {
    const W = innerWidth, H = innerHeight;
    const [l, r, b] = touch ? [44, 44, 21] : [0, 0, 0];
    return [...document.querySelectorAll(sel)].every((el) => { const q = el.getBoundingClientRect(); return q.left >= l - 0.5 && q.right <= W - r + 0.5 && q.bottom <= H - b + 0.5 && q.top >= -0.5; });
  }, sel, touch);

  // ── cutscenes
  const cs = () => page.evaluate(() => {
    const p = window.__cutscene;
    return p && p.root.isConnected && !p.ended ? { id: p.def.id, T: p.T, total: p.total, booted: p.booted } : null;
  });
  const waitCs = (id, T = 1.2) => page.waitForFunction((id, T) => {
    const p = window.__cutscene;
    return p && p.root.isConnected && !p.ended && p.def.id === id && p.T >= T;
  }, { timeout: 20000 }, id, T);
  const waitNoCs = () => page.waitForFunction(() => !document.querySelector('.cutscene'), { timeout: 5000 });
  const seen = () => page.evaluate(() => JSON.parse(localStorage.getItem('inkrunner:campaign') ?? '{}').seen ?? []);
  const csLog = () => page.evaluate(() => window.__csLog.slice());
  /** skip with real input: a click or a tap on the picture, a key, or the Skip button */
  const skipBy = async (how) => {
    if (how === 'button') {
      const b = await page.$('.cutscene .cs-skip');
      const box = await b.boundingBox();
      if (touch) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      else await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    } else if (how === 'picture') {
      const vp = page.viewport();
      if (touch) await page.touchscreen.tap(vp.width * 0.45, vp.height * 0.45);
      else await page.mouse.click(vp.width * 0.45, vp.height * 0.45);
    } else await page.keyboard.press(how);
  };
  /** let a cutscene play to its end, capturing its hand-over into the map */
  const watchHandover = async (name, onGone) => {
    const total = (await cs()).total;
    const at = [total - 1.3, total - 0.45];
    const notes = [];
    for (let i = 0; i < at.length; i++) {
      await page.waitForFunction((T) => !window.__cutscene.root.isConnected || window.__cutscene.ended || window.__cutscene.T >= T, { timeout: 30000, polling: 16 }, at[i]);
      const q = await page.evaluate(() => ({ T: window.__cutscene.T, map: window.__map.isOpen }));
      await page.screenshot({ path: `${CS_OUT}/handover-${name}-${tag}-${i + 1}.png` });
      notes.push(`T ${q.T.toFixed(2)} map ${q.map ? 'open' : 'closed'}`);
    }
    await page.waitForFunction(() => !!window.__cutscene.ended, { timeout: 10000, polling: 16 });
    const how = await page.evaluate(() => window.__cutscene.ended);
    await page.screenshot({ path: `${CS_OUT}/handover-${name}-${tag}-3.png` });
    await waitNoCs();
    if (onGone) await onGone();
    await wait(600);
    await page.screenshot({ path: `${CS_OUT}/handover-${name}-${tag}-4.png` });
    return { how, notes };
  };
  const bringSlotIntoView = async (id) => {
    for (let i = 0; i < 14; i++) {
      const q = await page.evaluate((id) => {
        const v = document.querySelector('#map .map-view').getBoundingClientRect();
        const b = document.querySelector(`.map-slot[data-cutscene="${id}"]`)?.getBoundingClientRect();
        return b ? { off: b.left + b.width / 2 - (v.left + v.width / 2), half: v.width / 2 } : null;
      }, id);
      if (!q) throw new Error(`no marker button for ${id}`);
      if (Math.abs(q.off) < q.half * 0.5) return;
      await drag(-Math.sign(q.off) * Math.min(Math.abs(q.off), q.half * 0.9));
      await wait(500);
    }
  };

  console.log(`\n── ${tag}: ${profile.desc}`);
  await load();

  await step('title screen shows the two tabs', async () => {
    await shot('01-title');
    const tabs = await page.evaluate(() => [...document.querySelectorAll('[role=tab]')].map((t) => t.textContent.trim()));
    return [tabs.join('|') === 'The Unfinished Scroll|Free play' && (await insideSafe('.card')), tabs.join(' | ')];
  });

  await step('campaign tab selected with real input', async () => {
    await press('#tab-free');
    await wait(150);
    const freeShown = await visible('#panel-free');
    await press('#tab-campaign');
    await wait(300);
    const st = await page.evaluate(() => ({
      sel: document.getElementById('tab-campaign').getAttribute('aria-selected'),
      chips: [...document.querySelectorAll('#journey .chap')].map((c) => c.className.replace('chap ', '') + ':' + c.querySelector('.k').textContent).join(' '),
    }));
    await shot('02-campaign-tab');
    return [freeShown && st.sel === 'true' && (await visible('#panel-campaign')) && !(await visible('#panel-free')), st.chips];
  });

  const char = touch ? 'kohaku' : 'ren';
  await step(`fresh profile: the traveler card (${char}) plays the prologue first`, async () => {
    await press(`.card[data-char="${char}"]`);
    await waitCs('prologue', 2.6);
    const q = await cs();
    const st = await page.evaluate(() => ({ map: window.__map.isOpen, skip: !!document.querySelector('.cutscene .cs-skip.on') }));
    await shot('03a-prologue');
    return [!!q && q.id === 'prologue' && !st.map && st.skip, `${q?.id} at T=${q?.T.toFixed(2)} of ${q?.total.toFixed(1)} s, map ${st.map ? 'open' : 'not open yet'}`];
  });

  await step(`prologue skipped by a real ${touch ? 'tap' : 'click'}; it hands over to the map and counts as seen`, async () => {
    await skipBy('picture');
    await wait(150);
    const mid = await page.evaluate(() => ({ map: window.__map.isOpen, ended: window.__cutscene?.ended }));
    await waitNoCs();
    await wait(400);
    const s = await seen();
    return [mid.ended === 'skip' && mid.map && s.includes('prologue'), `onDone ${mid.ended}, map open under it: ${mid.map}; seen ${JSON.stringify(s)}`];
  });

  await step(`the map is open after the prologue`, async () => {
    await wait(900);
    const st = await page.evaluate(() => ({ open: window.__map.isOpen, nodes: [...document.querySelectorAll('.map-node')].map((b) => b.dataset.node + ':' + b.dataset.state) }));
    await shot('03-map');
    const ok = st.open && (await visible('#map')) && st.nodes.length === 6 && st.nodes[0] === 'first:open' && st.nodes[1] === 'summer-1:locked';
    return [ok && (await insideSafe('#map .map-btn')), st.nodes.join(' ')];
  });

  await step(touch ? 'map pans with a one-finger swipe' : 'map pans with drag, wheel and keys', async () => {
    const a = await camX();
    await drag(-420);
    await wait(700);
    const b = await camX();
    let extra = '';
    let ok = b > a + 100;
    if (!touch) {
      await page.mouse.move(800, 450);
      await page.mouse.wheel({ deltaY: 600 });
      await wait(600);
      const c = await camX();
      await page.keyboard.press('ArrowRight');
      await wait(600);
      const d = await camX();
      ok = ok && c > b + 100 && d > c + 100;
      extra = ` wheel→${Math.round(c)} key→${Math.round(d)}`;
    }
    await shot('04-map-panned');
    // the far end: the rolled-up, blotted chapters
    if (touch) for (let i = 0; i < 6; i++) { await drag(-600); await wait(150); }
    else await page.keyboard.press('End');
    await wait(1600);
    const end = await camX();
    await shot('05-map-end');
    return [ok && end > b + 1000, `camX ${Math.round(a)}→${Math.round(b)}${extra} end ${Math.round(end)}`];
  });

  await step('locked Summer node explains itself instead of starting', async () => {
    if (touch) for (let i = 0; i < 6; i++) { await drag(600); await wait(120); }
    else await page.keyboard.press('Home');
    await wait(1400);
    await bringIntoView('summer-1');
    await wait(800);
    await press('.map-node[data-node="summer-1"]');
    await wait(300);
    const st = await page.evaluate(() => ({ state: window.__game.state, open: window.__map.isOpen, hint: document.querySelector('.map-hint').textContent }));
    return [st.state === 'menu' && st.open && /opens when/.test(st.hint), st.hint];
  });

  await step("seeded 'first' clear survives a reload and opens Summer 1", async () => {
    await page.evaluate((strokes) => {
      localStorage.setItem('inkrunner:best:first', JSON.stringify({ time: 61.4, grade: '竹' }));
      // the prologue was seen on this profile above; the seed keeps that
      localStorage.setItem('inkrunner:campaign', JSON.stringify({ v: 1, seen: ['prologue'], strokes: { first: { char: 'ren', time: 61.4, len: 15400, strokes } } }));
    }, SEED_STROKES);
    await load();
    await press('#tab-campaign');
    await wait(200);
    const chips = await page.evaluate(() => [...document.querySelectorAll('#journey .chap')].map((c) => c.className.replace('chap ', '')).join(' '));
    await press(`.card[data-char="${char}"]`);
    await wait(1500);
    const first = await nodeState('first');
    const s1 = await nodeState('summer-1');
    await shot('06-map-first-cleared');
    // look back over the cleared stretch, where the best strokes are laid faintly
    await drag(touch ? 360 : 700);
    await wait(900);
    await shot('06b-cleared-stretch');
    return [first === 'cleared' && s1 === 'open' && chips.startsWith('cleared open sealed'), `chips ${chips}; first ${first}, summer-1 ${s1}`];
  });

  await step('tapping the open Summer 1 node starts it', async () => {
    await bringIntoView('summer-1');
    await wait(800);
    await press('.map-node[data-node="summer-1"]');
    await wait(700);
    const st = await page.evaluate(() => ({ state: window.__game.state, id: window.__game.level.id, char: window.__game.charId, mapOpen: window.__map.isOpen }));
    await shot('07-summer-1-intro');
    return [st.state === 'play' && st.id === 'summer-1' && st.char === char && !st.mapOpen && !(await visible('#map')), JSON.stringify(st)];
  });

  await step('Summer 1 plays for a few seconds with real jumps', async () => {
    await wait(1700);
    const a = await page.evaluate(() => ({ t: window.__game.stats.time, x: window.__game.px }));
    // jump the first (small) gap as the traveler reaches its edge
    const edges = await page.evaluate(() => window.__game.level.islands.slice(0, 1).map((i) => i.x1));
    for (const edge of edges) {
      await page.waitForFunction((e) => window.__game.px >= e - 30, { timeout: 8000 }, edge);
      if (touch) {
        const r = await page.evaluate(() => { const b = document.getElementById('jump').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
        await page.touchscreen.touchStart(r.x, r.y); await wait(420); await page.touchscreen.touchEnd();
      } else {
        await page.keyboard.down('Space'); await wait(420); await page.keyboard.up('Space');
      }
    }
    await wait(500);
    await shot('08-summer-1-play');
    const b = await page.evaluate(() => ({ t: window.__game.stats.time, x: window.__game.px, state: window.__game.state }));
    const falls = await page.evaluate(() => window.__game.stats.falls);
    return [b.t > a.t + 1.5 && b.x > a.x + 300 && falls === 0, `falls ${falls}, time ${a.t.toFixed(1)}→${b.t.toFixed(1)}s, x ${Math.round(a.x)}→${Math.round(b.x)}`];
  });

  await step(touch ? 'pause → "Back to the map" returns to the map' : 'Esc returns to the map', async () => {
    if (touch) {
      await page.tap('#pause-button');
      await wait(300);
      const label = await page.evaluate(() => document.getElementById('btn-pause-menu').textContent);
      if (label !== 'Back to the map') throw new Error('pause label ' + label);
      await page.tap('#btn-pause-menu');
    } else await page.keyboard.press('Escape');
    await wait(1400);
    const st = await page.evaluate(() => ({ state: window.__game.state, open: window.__map.isOpen, menu: !document.getElementById('menu').classList.contains('hidden') }));
    await shot('09-back-on-map');
    return [st.state === 'menu' && st.open && !st.menu && (await visible('#map')), JSON.stringify(st)];
  });

  // Teleport (after the real run above) to check the finish screen's campaign button.
  await step('finish → "Continue the journey" reveals Summer 2 (teleport to the torii)', async () => {
    await press('.map-node[data-node="summer-1"]');
    await wait(1900);
    await page.evaluate(() => { const G = window.__game; const R = G.raijin; if (R?.def) { R.cleared = R.cleared.map(() => true); for (const d of R.drums) d.clean = true; R.cleaned = R.drums.length; } const T = G.level.torii; G.px = T.x - 200; G.py = G.surfaceBelow(T.x - 200, -1000) ?? T.y; G.vy = 0; G.camCX = T.x; for (const l of G.level.lanterns) l.lit = true; });
    await page.waitForFunction(() => !document.getElementById('finish').classList.contains('hidden'), { timeout: 15000 });
    await wait(900);
    const btns = await page.evaluate(() => [...document.querySelectorAll('#finish button')].filter((b) => !b.hidden).map((b) => b.textContent));
    await shot('10-finish');
    await press('#btn-continue');
    await wait(900);
    await shot('11-continue-walk');
    await wait(2600);
    const s1 = await nodeState('summer-1');
    const s2 = await nodeState('summer-2');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('inkrunner:campaign')).strokes['summer-1']);
    await shot('12-summer-2-revealed');
    const ok = btns.includes('Continue the journey') && s1 === 'cleared' && s2 === 'open' && !!saved && (await visible('#map'));
    return [ok, `buttons ${btns.join(' / ')}; summer-1 ${s1}, summer-2 ${s2}; saved strokes ${saved ? JSON.stringify(saved).length + ' B' : 'none'}`];
  });

  await step('Free play tab: all four scrolls start as before (records kept)', async () => {
    await load();
    await press('#tab-free');
    await wait(200);
    const mini = await page.evaluate(() => !!document.querySelector('#scrolls .scroll .mini'));
    const ids = [];
    for (let i = 1; i <= 4; i++) {
      await press(`#scrolls .scroll:nth-child(${i})`);
      await wait(150);
      await press(`.card[data-char="${char}"]`);
      await wait(900);
      const st = await page.evaluate(() => ({ id: window.__game.level.id, state: window.__game.state, map: window.__map.isOpen }));
      if (st.state !== 'play' || st.map) throw new Error('did not start ' + JSON.stringify(st));
      ids.push(st.id);
      if (i === 1) await shot('13-free-play-first');
      await (touch ? page.tap('#pause-button').then(() => wait(250)).then(() => page.tap('#btn-pause-menu')) : page.keyboard.press('Escape'));
      await wait(900);
      const back = await page.evaluate(() => ({ menu: !document.getElementById('menu').classList.contains('hidden'), map: window.__map.isOpen }));
      if (!back.menu || back.map) throw new Error('free play did not return to the title');
    }
    await shot('14-free-play-tab');
    const log = await csLog();
    return [mini && !log.length && ids[0] === 'first' && ids[1] === 'snow' && ids[2] === 'sea' && /^daily-\d{4}-\d\d-\d\d$/.test(ids[3]), `${ids.join(', ')}; best seal on card: ${mini}; cutscenes shown: ${log.length}`];
  });

  // ── the Summer ending, the real way: every scroll up to Summer 4 seeded as cleared, then summer-gate started from its
  // map node, one real stroke painted, a teleport to the torii, and a real press of "Continue the journey". The new
  // best has strokes, so a real paint-in waits under the ending's hand-over (it must not start until Autumn has shown).
  const rollAt = () => page.evaluate(() => {
    const m = window.__map;
    const L = m.L;
    const gate = L?.nodes.find((n) => n.scroll.id === 'summer-gate');
    const roll = L?.items.filter((it) => it.name === 'sealed' && gate && it.x0 > gate.x).sort((a, b) => a.x0 - b.x0)[0];
    if (!gate || !roll) return null;
    const vu = m.W / m.scale;
    const p = m.inspect().painting;
    return { roll: ((roll.x0 + roll.x1) / 2 - m.camX) / vu, gate: (gate.x - m.camX) / vu, camX: m.camX, paint: p ? `${p.id} ${p.landed}/${p.total}` : null };
  });
  const fmtRoll = (q) => (q ? `秋 at ${(q.roll * 100).toFixed(0)}% across, gate at ${(q.gate * 100).toFixed(0)}%, paint-in ${q.paint ?? 'none'}` : 'map layout not readable');
  /** the map's view the moment the ending's paper is fully gone */
  let gone = null;
  await step('summer-gate cleared for the first time (real stroke, teleport to the torii); "Continue the journey" plays the Summer ending', async () => {
    await page.evaluate((strokes) => {
      for (const id of ['first', 'summer-1', 'summer-2', 'summer-3', 'summer-4']) localStorage.setItem(`inkrunner:best:${id}`, JSON.stringify({ time: 61.4, grade: '竹' }));
      localStorage.removeItem('inkrunner:best:summer-gate');
      localStorage.setItem('inkrunner:campaign', JSON.stringify({ v: 1, seen: ['prologue'], strokes: { first: { char: 'ren', time: 61.4, len: 15400, strokes } } }));
    }, SEED_STROKES);
    await load();
    await press('#tab-campaign');
    await wait(200);
    await press(`.card[data-char="${char}"]`);
    await wait(1500);
    if (await page.evaluate(() => !!document.querySelector('.cutscene'))) throw new Error('a cutscene played before summer-gate was cleared');
    await bringIntoView('summer-gate');
    await wait(800);
    await press('.map-node[data-node="summer-gate"]');
    await page.waitForFunction(() => window.__game.state === 'play' && window.__game.level.id === 'summer-gate', { timeout: 15000 });
    // the brush is held during the intro (Game.beginPaint ignores a stroke while introT < 1.5)
    await page.waitForFunction(() => window.__game.introT >= 1.5, { timeout: 15000 });
    // one real stroke ahead of the traveler (mouse, or one finger): the gate starts on Purple, so it is a ring, a
    // 370° loop that closes on itself
    const vp = page.viewport();
    const [cx, cy, r] = [vp.width * 0.62, vp.height * 0.42, vp.height * 0.07];
    const at = (i) => { const a = ((-90 - 330 + (370 * i) / 31) * Math.PI) / 180; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; };
    if (touch) {
      await page.touchscreen.touchStart(...at(0));
      for (let i = 1; i <= 31; i++) { await page.touchscreen.touchMove(...at(i)); await wait(16); }
      await page.touchscreen.touchEnd();
    } else {
      await page.mouse.move(...at(0));
      await page.mouse.down();
      for (let i = 1; i <= 31; i++) { await page.mouse.move(...at(i)); await wait(16); }
      await page.mouse.up();
    }
    await wait(400);
    const nStrokes = await page.evaluate(() => window.__game.serializeStrokes().length);
    await page.evaluate(() => { const G = window.__game; const R = G.raijin; if (R?.def) { R.cleared = R.cleared.map(() => true); for (const d of R.drums) d.clean = true; R.cleaned = R.drums.length; } const T = G.level.torii; G.px = T.x - 200; G.py = G.surfaceBelow(T.x - 200, -1000) ?? T.y; G.vy = 0; G.camCX = T.x; for (const l of G.level.lanterns) l.lit = true; });
    await page.waitForFunction(() => !document.getElementById('finish').classList.contains('hidden'), { timeout: 15000 });
    await wait(900);
    await press('#btn-continue');
    await waitCs('summer-ending', 2.4);
    const q = await cs();
    await shot('15-summer-ending');
    return [q?.id === 'summer-ending' && nStrokes > 0, `${nStrokes} stroke(s) in the run; ${q?.id} at T=${q?.T.toFixed(2)} of ${q?.total.toFixed(1)} s; log ${JSON.stringify(await csLog())}`];
  });

  if (!touch) {
    await step('the Summer ending plays to its end and hands over into the map', async () => {
      const r = await watchHandover('ending', async () => {
        gone = await rollAt();
        await page.screenshot({ path: `${CS_OUT}/handover-ending-${tag}-autumn.png` });
      });
      const st = await page.evaluate(() => ({ open: window.__map.isOpen, gate: document.querySelector('.map-node[data-node="summer-gate"]')?.dataset.state }));
      const s = await seen();
      return [r.how === 'end' && st.open && st.gate === 'cleared' && s.includes('summer-ending') && /map open/.test(r.notes[1]), `${r.notes.join('; ')}; onDone ${r.how}; gate ${st.gate}; seen ${JSON.stringify(s)}`];
    });
  } else {
    await step('the Summer ending skipped with the Skip button; it hands over into the map', async () => {
      await skipBy('button');
      await waitNoCs();
      gone = await rollAt();
      await page.screenshot({ path: `${CS_OUT}/handover-ending-${tag}-autumn.png` });
      await wait(400);
      const st = await page.evaluate(() => ({ open: window.__map.isOpen, gate: document.querySelector('.map-node[data-node="summer-gate"]')?.dataset.state }));
      const s = await seen();
      await shot('16-after-ending');
      return [st.open && (await visible('#map')) && st.gate === 'cleared' && s.includes('summer-ending'), `map ${st.open ? 'open' : 'closed'}; gate ${st.gate}; seen ${JSON.stringify(s)}`];
    });
  }

  await step('the ending hands over onto Autumn still rolled up, holds there, and only then the paint-in pans back', async () => {
    // the paper is gone and 秋 is still framed at about four fifths across, with the gate's paint-in waiting
    const atGone = !!gone && gone.roll > 0.65 && gone.roll < 0.95 && /^summer-gate /.test(gone.paint ?? '');
    await wait(2600);
    const later = await rollAt();
    await shot('16b-ending-autumn-then-paint-in');
    const panned = !!gone && !!later && later.camX < gone.camX - 50;
    return [atGone && panned, `paper gone: ${fmtRoll(gone)}; 2.6 s later: ${fmtRoll(later)} (camX ${Math.round(gone?.camX ?? 0)} → ${Math.round(later?.camX ?? 0)})`];
  });

  await step('the Summer ending plays once: back to the title and in again goes straight to the map', async () => {
    await press('#map-back');
    await wait(500);
    const n0 = (await csLog()).length;
    await press(`.card[data-char="${char}"]`);
    await wait(1500);
    const st = await page.evaluate(() => ({ open: window.__map.isOpen, cs: !!document.querySelector('.cutscene') }));
    const n1 = (await csLog()).length;
    return [st.open && !st.cs && n1 === n0, `map ${st.open ? 'open' : 'closed'}, cutscene overlays ${n1 - n0}`];
  });

  await step('both hanging-scroll markers have a replay button with a real size', async () => {
    const q = await page.evaluate(() =>
      ['prologue', 'summer-ending'].map((id) => {
        const b = document.querySelector(`.map-slot[data-cutscene="${id}"]`);
        const r = b?.getBoundingClientRect();
        return { id, w: r ? Math.round(r.width) : 0, h: r ? Math.round(r.height) : 0, state: b?.dataset.state ?? 'missing' };
      }),
    );
    return [q.every((b) => b.w > 0 && b.h > 0), q.map((b) => `${b.id} ${b.w}x${b.h} ${b.state}`).join(', ')];
  });

  await step(`map markers replay both cutscenes (${touch ? 'tap' : 'click'}), and each can be skipped`, async () => {
    const notes = [];
    for (const [id, how] of touch ? [['prologue', 'button'], ['summer-ending', 'picture']] : [['summer-ending', 'Space'], ['prologue', 'end']]) {
      await bringSlotIntoView(id);
      await wait(700);
      const state = await page.evaluate((id) => document.querySelector(`.map-slot[data-cutscene="${id}"]`).dataset.state, id);
      await press(`.map-slot[data-cutscene="${id}"]`);
      await waitCs(id, 1.2);
      const q = await cs();
      if (how === 'end') {
        // the prologue plays to its end this time: its hand-over back onto the map
        const r = await watchHandover('prologue');
        notes.push(`${id} (${state}) replayed to ${r.how}: ${r.notes.join(', ')}`);
        if (r.how !== 'end') throw new Error('prologue replay did not end naturally');
      } else {
        await skipBy(how);
        await waitNoCs();
        notes.push(`${id} (${state}) replayed at T=${q.T.toFixed(1)}, skipped by ${how}`);
      }
      await wait(700);
      if (!(await page.evaluate(() => window.__map.isOpen)) || !(await visible('#map'))) throw new Error(`map not back after ${id}`);
    }
    await shot('17-map-after-replays');
    return [true, notes.join(' | ')];
  });

  // the other way in: a summer-gate cleared on a run whose ending was never seen (closed the app at the finish
  // screen, say) plays the ending on the next entry from the title, before the map
  await step('a cleared summer-gate with its ending unseen: entering from the title plays it first', async () => {
    await page.evaluate(() => {
      const c = JSON.parse(localStorage.getItem('inkrunner:campaign'));
      c.seen = c.seen.filter((id) => id !== 'summer-ending');
      localStorage.setItem('inkrunner:campaign', JSON.stringify(c));
    });
    await load();
    await press('#tab-campaign');
    await wait(200);
    await press(`.card[data-char="${char}"]`);
    await waitCs('summer-ending', 1.0);
    const how = touch ? 'picture' : 'Escape';
    await skipBy(how);
    await waitNoCs();
    await wait(700);
    const open = await page.evaluate(() => window.__map.isOpen);
    const s = await seen();
    return [open && (await visible('#map')) && s.includes('summer-ending'), `skipped by ${how}; map ${open ? 'open' : 'closed'}; seen ${JSON.stringify(s)}`];
  });

  if (!touch) {
    // A fresh browser context: after the long campaign run above, the first page's renderer has accumulated enough
    // intercepted module requests across its reloads that Chromium starts refusing new ones
    // (net::ERR_INSUFFICIENT_RESOURCES); this step is about ?play, not about a long session, so it gets its own page.
    await step('?play=ren&level=<id> starts every scroll id', async () => {
      const ids = ['first', 'snow', 'sea', 'daily', 'summer-1', 'summer-2', 'summer-3', 'summer-4', 'summer-gate'];
      const got = [];
      const pctx = await browser.createBrowserContext();
      try {
        const pp = await pctx.newPage();
        await pp.setViewport(profile.viewport);
        await pp.setRequestInterception(true);
        pp.on('request', (req) => {
          if (new globalThis.URL(req.url()).pathname.startsWith('/api/')) {
            void req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ best: null, others: [] }) });
          } else void req.continue();
        });
        pp.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
        pp.on('pageerror', (e) => errors.push(e.stack ?? String(e)));
        const failed = [];
        pp.on('requestfailed', (r) => failed.push(`${new globalThis.URL(r.url()).pathname} ${r.failure()?.errorText ?? ''}`));
        for (const id of ids) {
          await pp.goto(`${URL}?play=ren&level=${id}`, { waitUntil: 'load' });
          await pp.waitForFunction(() => window.__game && window.__game.state === 'play', { timeout: 15000 }).catch((e) => {
            throw new Error(`${id}: ${e.message}; failed requests: ${failed.slice(0, 4).join(', ') || 'none'}`);
          });
          await wait(300);
          got.push(await pp.evaluate(() => window.__game.level.id + ':' + Math.round(window.__game.level.length)));
        }
      } finally {
        await pctx.close();
      }
      const ok = got.every((g, i) => g.startsWith(ids[i]));
      return [ok, got.join(' ')];
    });
  }

  await step('no console errors', async () => [errors.length === 0, errors.length ? errors.slice(0, 5).join(' || ') : '']);
  await ctx.close();
}

await run({ name: 'desktop', desc: '1600x900, mouse and keyboard', viewport: { width: 1600, height: 900 }, input: 'mouse' });
await run({ name: 'iphone', desc: 'iPhone 13 landscape (844x390), touch, synthetic safe areas', device: KnownDevices['iPhone 13 landscape'], input: 'touch' });
await browser.close();
console.log(failures ? `\n${failures} step(s) FAILED` : '\nAll steps PASS');
process.exit(failures ? 1 : 0);
