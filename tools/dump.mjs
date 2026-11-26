import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--use-gl=angle','--use-angle=gl-egl','--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.goto('http://localhost:5173/', { waitUntil: 'load' });
await new Promise(r => setTimeout(r, 1500));
const out = await page.evaluate(async () => {
  const { levelList } = await import('/src/levels.ts');
  const { groundAt } = await import('/src/level.ts');
  const r = {};
  for (const info of levelList().filter(l => l.id === 'snow' || l.id === 'sea')) {
    const L = info.build();
    r[info.id] = {
      islands: L.islands.map(i => [Math.round(i.x0), Math.round(i.x1), Math.round(groundAt(i, i.x0 + 1)), Math.round(groundAt(i, i.x1 - 1))]),
      fires: L.fires.map(f => [f.x, f.y, f.w, f.h]),
      yokai: L.yokai.map(y => [y.x, y.y, y.r]),
      brambles: L.brambles.map(b => [b.x, b.y, b.w, b.h]),
      seaY: L.seaY, torii: L.torii, length: L.length,
    };
  }
  return r;
});
console.log(JSON.stringify(out, null, 0));
await browser.close();
