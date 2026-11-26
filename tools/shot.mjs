// Usage: node tools/shot.mjs <scenario>  — renders screenshots into ./shots
import puppeteer from 'puppeteer-core';

const URL = process.env.URL ?? 'http://localhost:5173/';
const scenario = process.argv[2] ?? 'menu';
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  headless: 'new',
  args: ['--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.stack ?? String(e)));
await page.goto(URL + (process.env.Q ?? ''), { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 2500));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// The title opens on the campaign tab; these scenarios play free-play scrolls, so pick that tab with a real click.
if (await page.$('#tab-free') && !(process.env.Q ?? '').includes('play=')) { await page.click('#tab-free'); await wait(150); }
const shot = async (name) => { await page.screenshot({ path: `shots/${name}.png` }); console.log('shot', name); };

const g = (fn, ...args) => page.evaluate(fn, ...args);

// paint a stroke given world-space points by driving the real mouse
async function paint(worldPts, ink = 1) {
  await page.keyboard.press(`Digit${ink}`);
  const toScreen = (p) => g(([x, y]) => {
    const G = window.__game; const S = G.S; const r = G.canvas.getBoundingClientRect();
    return [ (G.W / 2 + (x - G.camCX) * S) * r.width / G.W, (G.H / 2 + (y - G.camCY) * S) * r.height / G.H ];
  }, [p.x, p.y]);
  const first = await toScreen(worldPts[0]);
  await page.mouse.move(first[0], first[1]);
  await page.mouse.down();
  for (const p of worldPts.slice(1)) {
    const s = await toScreen(p);
    await page.mouse.move(s[0], s[1], { steps: 3 });
  }
  await page.mouse.up();
}
const line = (x0, y0, x1, y1, n = 20) => Array.from({ length: n + 1 }, (_, i) => ({ x: x0 + (x1 - x0) * i / n, y: y0 + (y1 - y0) * i / n + Math.sin(i / n * Math.PI) * -18 }));

if (scenario === 'regress') {
  // Space after clicking a card must jump, not restart the scroll
  await page.click('.card[data-char="kohaku"]');
  await wait(2600);
  const before = await g(() => ({ t: window.__game.stats.time, x: window.__game.px }));
  for (let i = 0; i < 3; i++) {
    await page.keyboard.down('Space'); await wait(200); await page.keyboard.up('Space'); await wait(700);
  }
  const after = await g(() => ({ t: window.__game.stats.time, x: window.__game.px, intro: window.__game.introT, active: document.activeElement?.tagName }));
  console.log('before', JSON.stringify(before), 'after', JSON.stringify(after));
  console.log(after.t > before.t + 1.5 ? 'PASS no restart' : 'FAIL restarted');
  for (let i = 0; i < 6; i++) { await wait(55); await shot(`legs-${i}`); }
} else if (scenario === 'menu') {
  await shot('menu');
} else if (scenario === 'start') {
  await page.click('.card[data-char="ren"]');
  await wait(1500);
  await shot('start-ren');
} else if (scenario === 'bridge') {
  await page.click(`.card[data-char="${process.argv[3] ?? 'kohaku'}"]`);
  await g(() => { const G = window.__game; G.px = 2600; G.py = 540; G.camCX = 2900; });
  await wait(1800);
  await paint(line(2860, 548, 3500, 548, 30), 1);
  await wait(250);
  await shot('bridge-a');
  await wait(1600);
  await shot('bridge-b');
} else if (scenario === 'painting') {
  await page.click('.card[data-char="ren"]');
  await g(() => { const G = window.__game; G.px = 2650; G.py = 540; G.camCX = 2950; });
  await wait(300);
  await page.keyboard.press('Digit1');
  const pts = line(2860, 548, 3300, 548, 16);
  const toScreen = (p) => g(([x, y]) => { const G = window.__game; const S = G.S; const r = G.canvas.getBoundingClientRect(); return [(G.W/2 + (x - G.camCX)*S)*r.width/G.W, (G.H/2 + (y - G.camCY)*S)*r.height/G.H]; }, [p.x, p.y]);
  const f = await toScreen(pts[0]);
  await page.mouse.move(f[0], f[1]); await page.mouse.down();
  for (const p of pts.slice(1)) { const s = await toScreen(p); await page.mouse.move(s[0], s[1], { steps: 2 }); }
  await wait(400);
  await shot('painting');
  await page.mouse.up();
} else if (scenario === 'tour') {
  await page.click(`.card[data-char="${process.argv[3] ?? 'ren'}"]`);
  for (const x of (process.argv[4] ?? '4300,7500,9300,12000,14500').split(',').map(Number)) {
    await g((x) => { const G = window.__game; G.state = 'play'; G.px = x; G.py = 0; G.vy = 0; G.grounded = false; G.invuln = 99; G.camCX = x + 300; }, x);
    await wait(900);
    await shot('tour-' + x);
  }
} else if (scenario === 'effects') {
  await page.click('.card[data-char="kohaku"]');
  await g(() => { const G = window.__game; G.px = 7400; G.py = 240; G.camCX = 7700; G.camCY = 160; G.invuln = 99; });
  await wait(1800);
  await paint([{x:7700,y:120},{x:7760,y:110},{x:7840,y:105},{x:7920,y:118},{x:7980,y:150}], 2);
  await wait(500);
  await shot('effects-water');
  await g(() => { const G = window.__game; G.px = 9000; G.py = 480; G.camCX = 9300; G.camCY = 400; G.invuln = 99; });
  await wait(1800);
  await paint([{x:9180,y:300},{x:9260,y:360},{x:9320,y:470}, {x:9480,y:470}, {x:9660, y: 330}, {x:9760,y:420}], 3);
  await wait(300);
  await shot('effects-gold');
} else if (scenario === 'finish') {
  await page.click('.card[data-char="ren"]');
  await g(() => { const G = window.__game; G.px = 14500; G.py = 450; G.camCX = 14700; G.invuln = 99; for (const l of G.level.lanterns) l.lit = true; });
  await wait(1800);
  await shot('finish-a');
  await wait(5000);
  await shot('finish-b');
  const b64 = await g(async () => { const b = await window.__game.exportScroll(); const buf = await b.arrayBuffer(); let s=''; const u = new Uint8Array(buf); for (let i=0;i<u.length;i++) s += String.fromCharCode(u[i]); return btoa(s); });
  (await import('fs')).writeFileSync('shots/scroll.png', Buffer.from(b64, 'base64'));
  console.log('scroll exported');
}
else if (scenario === 'ramp' || scenario === 'ride') {
  await page.click('.card[data-char="ren"]');
  const ramp = scenario === 'ramp';
  await g((x) => { const G = window.__game; G.px = x; G.py = 540; G.camCX = x + 400; }, ramp ? 4000 : 6250);
  await wait(200);
  if (ramp) await paint(line(4200, 548, 4560, 300, 24).map((p, i) => ({ x: p.x, y: p.y + 18 * Math.sin(i / 24 * Math.PI) })), 1);
  else await paint(line(6640, 548, 7100, 205, 24).map((p, i) => ({ x: p.x, y: p.y + 30 * Math.sin(i / 24 * Math.PI) })), 2);
  for (let i = 0; i < 8; i++) {
    await wait(400);
    const st = await g(() => { const G = window.__game; return [G.state, Math.round(G.px), Math.round(G.py), G.grounded, !!G.ride, G.stuckT.toFixed(2)]; });
    console.log(JSON.stringify(st));
    if (i === 2) await shot(scenario + '-mid');
  }
  await shot(scenario + '-end');
}
else if (scenario === 'level') {
  // Q='?level=snow' node tools/shot.mjs level ren 2000,5000
  await page.click(`.card[data-char="${process.argv[3] ?? 'ren'}"]`);
  await wait(500);
  await shot('level-intro');
  await wait(1500);
  for (const x of (process.argv[4] ?? '1500,4000,7000').split(',').map(Number)) {
    await g((x) => { const G = window.__game; G.state = 'play'; G.px = x; G.py = G.surfaceBelow(x, -1000) ?? 500; G.vy = 0; G.grounded = true; G.invuln = 99; G.camCX = x + 300; G.camCY = G.py - 80; G.character.reset(); }, x);
    await wait(1200);
    await shot('level-' + x);
  }
} else if (scenario === 'share') {
  await page.click('.card[data-char="kohaku"]');
  await wait(1800);
  await g(() => { const G = window.__game; G.px = 2600; G.py = 540; G.camCX = 2900; });
  await wait(1800);
  await paint(line(2860, 548, 3500, 548, 30), 1);
  await wait(1500);
  await g(() => { const G = window.__game; G.px = 14500; G.py = 450; G.camCX = 14700; G.invuln = 99; for (const l of G.level.lanterns) l.lit = true; });
  await wait(6000);
  await shot('share-finish');
  const save = async (expr, file) => {
    const b64 = await g(async (expr) => { const G = window.__game; const st = { time: G.stats.time, strokes: G.stats.strokes, ink: G.stats.ink, falls: 0, grade: G.grade(), newBest: false, best: null };
      const mod = await import('/src/share.ts'); const b = expr === 'card' ? await mod.renderCard(G, st) : await mod.exportScroll(G, st);
      const buf = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]); return btoa(s); }, expr);
    (await import('fs')).writeFileSync('shots/' + file, Buffer.from(b64, 'base64'));
    console.log('saved', file);
  };
  await save('card', 'card.png');
  await save('scroll', 'scroll.png');
  const hl = await g(() => window.__game.recorder.highlights());
  console.log('highlights', JSON.stringify(hl));
  const clip = await g(async () => { const out = await window.__game.recorder.recordClip(); return out ? [out.ext, out.blob.size] : null; });
  console.log('clip', JSON.stringify(clip));
}
else if (scenario === 'autoplay') {
  await page.click('.card[data-char="ren"]');
  const zig = (x0, x1, y0, y1, n = 4) => Array.from({ length: n + 1 }, (_, i) => ({ x: i % 2 ? x1 : x0, y: y0 + ((y1 - y0) * i) / n }));
  const plan = [
    [1452, 'jump'],
    [2450, 1, line(2860, 552, 3500, 552, 26)],
    [4100, 1, line(4180, 552, 4575, 312, 20)],
    [6380, 2, line(6640, 566, 7100, 215, 22)],
    [7330, 2, line(7700, 90, 7990, 140, 14)],
    [8750, 3, zig(9140, 9330, 320, 470, 4)],
    [8800, 3, line(9600, 320, 9780, 430, 10)],
    [9700, 1, line(9890, 490, 10510, 510, 26)],
    [9760, 3, zig(10080, 10300, 320, 460, 4)],
    [10560, 2, line(10790, 350, 11130, 380, 16)],
    [11000, 1, line(11060, 508, 11380, 272, 20)],
    [11030, 3, zig(11470, 11650, 140, 250, 4)],
    [11700, 3, line(11990, 160, 12170, 260, 10)],
    [12150, 1, line(12400, 294, 13310, 524, 34)],
    [12180, 3, zig(12770, 12930, 260, 440, 2)],
    [13450, 2, line(13770, 380, 14070, 410, 14)],
  ];
  const t0 = Date.now();
  let i = 0;
  let n = 0;
  while (Date.now() - t0 < 150000) {
    const st = await g(() => { const G = window.__game; return { x: G.px, state: G.state, falls: G.stats.falls }; });
    if (n++ % 100 === 0) console.log('poll', Math.round(st.x), st.state, 'falls', st.falls);
    if (st.state === 'finish') break;
    if (i < plan.length && st.x >= plan[i][0]) {
      const [, kind, pts] = plan[i];
      if (kind === 'jump') { await page.keyboard.down('Space'); await wait(450); await page.keyboard.up('Space'); }
      else await paint(pts, kind);
      console.log('did', plan[i][0], 'at', Math.round(st.x), 'falls', st.falls);
      i++;
    }
    await wait(40);
  }
  await wait(4000);
  const stats = await g(() => ({ ...window.__game.stats, grade: window.__game.grade() }));
  console.log('stats', JSON.stringify(stats));
  await shot('autoplay-finish');
  const hl = await g(() => window.__game.recorder.highlights());
  console.log('highlights', JSON.stringify(hl));
  const b64 = await g(async () => { const out = await window.__game.recorder.recordClip(); const buf = new Uint8Array(await out.blob.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]); return btoa(s); });
  (await import('fs')).writeFileSync('shots/clip.mp4', Buffer.from(b64, 'base64'));
  const card = await g(async () => { const G = window.__game; const st = { time: G.stats.time, strokes: G.stats.strokes, ink: G.stats.ink, falls: G.stats.falls, grade: G.grade(), newBest: false, best: null };
    const mod = await import('/src/share.ts'); const b = await mod.renderCard(G, st); const buf = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]); return btoa(s); });
  (await import('fs')).writeFileSync('shots/card.png', Buffer.from(card, 'base64'));
  console.log('saved clip + card');
}
else if (scenario === 'misc') {
  await page.click('.card[data-char="kohaku"]');
  await wait(1700);
  // double jump: jump, then jump again near the apex
  const y0 = await g(() => window.__game.py);
  await page.keyboard.down('Space'); await wait(330); await page.keyboard.up('Space');
  await page.keyboard.down('Space'); await wait(300); await page.keyboard.up('Space');
  await wait(120);
  const peak = await g(() => ({ py: window.__game.py, air: window.__game.airJumps }));
  console.log('double jump: start y', Math.round(y0), 'now y', Math.round(peak.py), 'airJumps left', peak.air);
  await shot('double-jump');
  // drying stroke frames
  await g(() => { const G = window.__game; G.px = 2600; G.py = 540; G.camCX = 2900; });
  await wait(1800);
  await paint(line(2860, 552, 3500, 552, 26), 1);
  await wait(60);
  await shot('dry-0');
  await wait(450);
  await shot('dry-1');
}
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
await browser.close();
