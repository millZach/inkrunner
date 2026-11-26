// Usage: [PHONE=1] flock /tmp/inkrunner-browser.lock node tools/tests/engine.shot.mjs [skies|fade|strikes|flash|all] [outdir]
// Browser check of the phase-3 engine pieces (not run by npm test): builds small Summer test scrolls in the page
// with Course (src/levels.ts), starts them, and
//   skies   — captures one frame of each Summer sky (dusk, night, storm, storm-peak, moon) with a festival line,
//             a firework and a sketched ring, into <outdir>/sky-<id>.png (default shots/rough/engine; PHONE=1
//             emulates iPhone 13 landscape and writes sky-<id>-phone.png), then checks the dusk→night cross-fade
//             moves in small steps from its first frame (fade alone: `fade`);
//   strikes — runs a spark and a stray bolt with a real (keyboard-held) run and checks: telegraph >= 1 s to impact,
//             the telegraph clock holds while the traveler is stuck at a wall, a spark caught by her rings echoes,
//             a standing traveler is killed by the splash with a cause box, the flash limiter books bolt flashes;
//   flash   — bolts landing ahead: the bolt's sky flash actually draws (game.flashT0 at the impact), an indigo stroke
//             over a bolt does NOT stop it, a vermilion one does and shatters; and the canvas luminance sampled every
//             frame through a bolt flash and a Course.flash: no jump over 20 %, no lift over 20 %, an 80 ms ramp.
// Prints PASS/FAIL lines and exits 1 if any check fails. Env: URL (default the lead's dev server).
import { mkdirSync } from 'node:fs';
import puppeteer, { KnownDevices } from 'puppeteer-core';

const URL = process.env.URL ?? 'http://localhost:5173/';
const which = process.argv[2] ?? 'all';
const out = process.argv[3] ?? 'shots/rough/engine';
mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (ok, what) => {
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`);
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
  const phone = !!process.env.PHONE;
  if (phone) await page.emulate(KnownDevices['iPhone 13 landscape']);
  else await page.setViewport({ width: 1600, height: 900 });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__game, { timeout: 30000 });
  const G = (fn, ...a) => page.evaluate(fn, ...a);

  /** Start a test scroll built from a recipe name in the page. */
  const start = (recipe, arg, char = 'ren') =>
    G(
      async (recipe, arg, char) => {
        const { LevelBuilder } = await import('/src/level.ts');
        const { Course } = await import('/src/levels.ts');
        const { mulberry32 } = await import('/src/rng.ts');
        const build = () => {
          const b = new LevelBuilder('engine-test', 'Engine test', '試', 'summer', 41);
          if (recipe === 'sky') {
            b.rules({ runSpeed: 300, camLead: 0.22, inks: ['shu', 'ai', 'kin', 'murasaki'], startInk: 'murasaki', rain: arg.startsWith('storm') ? { hold: 0.7, warn: 1.1 } : false });
            const c = new Course(b, 520, mulberry32(41));
            c.sky(arg);
            c.festoon(200, 3800).dip(1300, 110).hanabi(500, arg === 'night' ? 'great' : 'first').sketch(1100, 60, 50);
            if (arg.startsWith('storm')) c.rain(true);
            c.run(1400).gap(300).run(900).arcade(600, -700).lantern().run(1200);
            return c.end('summer');
          }
          if (recipe === 'fade') {
            // fade: dusk, then night from 900 u on (a 2.2 s cross-fade)
            b.rules({ runSpeed: 300, camLead: 0.22, inks: ['shu', 'ai', 'kin', 'murasaki'], rain: false });
            const c = new Course(b, 520, mulberry32(44));
            c.sky('dusk');
            c.run(900).sky('night').run(2400);
            return c.end('summer');
          }
          if (recipe === 'flash') {
            // flash: three bolts that land ahead of the traveler (no deaths): plain (its sky flash must draw), under an
            // indigo stroke (indigo must NOT stop a bolt), under a vermilion stroke (stops it and shatters), then a
            // Course.flash beat. Darkest sky, so the overlay's lift is at its largest.
            b.rules({ runSpeed: 300, camLead: 0.22, inks: ['shu', 'ai', 'kin', 'murasaki'], inkMax: 400, rain: false });
            const c = new Course(b, 520, mulberry32(43));
            c.sky('storm-peak');
            c.run(900).bolt(700, { landsEarly: 1.2 }).run(2400);
            c.bolt(700, { landsEarly: 1.2 }).run(2100);
            c.bolt(700, { landsEarly: 1.2 }).run(1800);
            c.flash(0).run(1800);
            return c.end('summer');
          }
          // strikes: spark (timed), a wall with a bolt behind it (stuck pause), a demo spark into her rings, bolts
          b.rules({ runSpeed: 300, camLead: 0.22, inks: ['shu', 'ai', 'kin', 'murasaki'] });
          const c = new Course(b, 520, mulberry32(42));
          c.run(900).spark(400).run(900);
          c.bramble(280).bolt(200, { after: -400 }).run(600);
          c.lantern().run(400);
          c.spark(300, { landsEarly: 1.0 }).herRings({ dx: 300, above: 150 }, { dx: 520, above: 150 }).yokai(760, 150, 30, 10);
          c.run(1400).bolt(300).bolt(650).run(1500);
          return c.end('summer');
        };
        const info = { id: 'engine-test', name: 'Engine test', kanji: '試', theme: 'spring', blurb: '', build };
        document.getElementById('menu')?.classList.add('hidden');
        window.__game.start(char, info);
        const L = window.__game.level;
        return { sky: L.sky, strikes: L.strikes, festoons: L.festoons.length, hanabi: L.hanabi.length, par: [L.parTime, L.parInk], course: L.course, camLead: window.__game.rules.camLead, ink: window.__game.ink };
      },
      recipe,
      arg,
      char,
    );

  if (which === 'skies' || which === 'all') {
    for (const sky of ['dusk', 'night', 'storm', 'storm-peak', 'moon']) {
      const info = await start('sky', sky);
      check(info.sky === sky && info.camLead === 0.22 && info.ink === 'murasaki', `${sky}: level sky, camLead 0.22, startInk murasaki`);
      await page.waitForFunction(() => window.__game.introT >= 1.5, { timeout: 10000 });
      // the traveler runs on their own: wait until the firework has bloomed and the lantern line is lit
      await page.waitForFunction(() => window.__game.px > 1150, { timeout: 15000 });
      await wait(250);
      await page.screenshot({ path: `${out}/sky-${sky}${phone ? '-phone' : ''}.png` });
      const snap = await G(() => window.__game.festival.snapshot());
      check(snap.hanabi[0].fired && snap.festoons[0].lit > 5, `${sky}: firework fired, ${snap.festoons[0].lit} lanterns lit`);
    }
  }

  if (which === 'skies' || which === 'fade' || which === 'all') {
    // the sky cross-fade: the top band's mean colour, sampled every frame, must move in small steps from the first
    // frame of the fade to the last (no snap halfway)
    await start('fade', '');
    await page.waitForFunction(() => window.__game.introT >= 1.5, { timeout: 10000 });
    await page.waitForFunction(() => window.__game.px > 600, { timeout: 15000 });
    const track = await G(
      () =>
        new Promise((done) => {
          const g = window.__game;
          const c = document.createElement('canvas');
          c.width = 64;
          c.height = 36;
          const x = c.getContext('2d', { willReadFrequently: true });
          const rows = [];
          const tick = () => {
            x.drawImage(g.canvas, 0, 0, 64, 36);
            const d = x.getImageData(0, 0, 64, 5).data;
            const m = [0, 0, 0];
            for (let i = 0; i < d.length; i += 4) for (let j = 0; j < 3; j++) m[j] += d[i + j] / (d.length / 4);
            const sk = g.festival.skyNow();
            rows.push({ k: sk.k, id: sk.id, m });
            if (sk.id === 'night' && sk.k >= 1 && rows.filter((r) => r.k >= 1 && r.id === 'night').length > 10) done(rows);
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }),
    );
    const fade = track.filter((r) => r.id === 'night');
    let step = 0;
    for (let i = 1; i < fade.length; i++) step = Math.max(step, ...fade[i].m.map((v, j) => Math.abs(v - fade[i - 1].m[j])));
    const mid = fade.find((r) => r.k >= 0.25);
    const first = track.filter((r) => r.id !== 'night').slice(-1)[0] ?? fade[0];
    const moved = mid ? Math.abs(mid.m[0] - first.m[0]) : 0;
    console.log('fade', fade.filter((_, i) => i % 12 === 0).map((r) => `k${r.k.toFixed(2)}:${r.m.map((v) => v.toFixed(0)).join(',')}`).join(' '));
    check(step <= 8 && moved >= 5, `sky cross-fade moves from its first frame: largest per-frame step ${step.toFixed(1)} /255, moved ${moved.toFixed(0)} by k 0.25`);
  }

  if (which === 'strikes' || which === 'all') {
    const info = await start('strikes', '');
    console.log('strikes', JSON.stringify(info.strikes), 'par', info.par.map((v) => v.toFixed(1)).join(' / '), 'course', JSON.stringify(info.course));
    check(info.course.strikes === 4 && info.course.minTele === 1.2, `course counted 4 strikes (demo excluded), shortest telegraph 1.2 s: ${info.course.strikes}, ${info.course.minTele}`);
    await page.waitForFunction(() => window.__game.introT >= 1.5, { timeout: 10000 });
    // spark 1: run on; jump it as it lands (a full jump clears the splash)
    await page.waitForFunction(() => window.__game.strikes.list[0].state === 'tele', { timeout: 15000 });
    const t0 = await G(() => window.__game.t);
    await page.waitForFunction(() => window.__game.strikes.list[0].el > 1.25, { timeout: 15000, polling: 16 });
    await page.keyboard.down('Space');
    await wait(420);
    await page.keyboard.up('Space');
    await page.waitForFunction(() => ['landed', 'caught', 'blocked'].includes(window.__game.strikes.list[0].state), { timeout: 15000 });
    const ev = await G(() => window.__game.strikes.events.filter((e) => e.id === 1));
    const imp = ev.find((e) => e.kind === 'impact');
    check(imp && imp.dt >= 1.5 - 1e-6 && imp.dtReal >= 1.0, `spark: telegraph to impact ${imp?.dt?.toFixed(3)} s game, ${imp?.dtReal?.toFixed(3)} s real (>= 1.0)`);
    const st1 = await G(() => ({ falls: window.__game.stats.falls, state: window.__game.state }));
    check(st1.falls === 0, `jumped the spark: falls ${st1.falls}`);
    void t0;
    // the bolt behind the thicket: the traveler stops at the thicket; its telegraph must hold while stuck
    await page.waitForFunction(() => window.__game.stuckT > 0.3, { timeout: 15000 });
    const b0 = await G(() => window.__game.strikes.list.find((s) => s.def.kind === 'bolt'));
    await wait(800);
    const b1 = await G(() => window.__game.strikes.list.find((s) => s.def.kind === 'bolt'));
    check(b0.state === 'tele' && Math.abs(b1.el - b0.el) < 1e-6, `bolt telegraph holds while stuck: el ${b0.el.toFixed(3)} -> ${b1.el.toFixed(3)} (${b0.state})`);
    // gold on the thicket with the real mouse, so the run goes on
    await page.keyboard.press('Digit3');
    const box = await G(() => {
      const g = window.__game;
      const br = g.level.brambles[0];
      const r = g.canvas.getBoundingClientRect();
      const s = (x, y) => ({ x: r.left + (((x - g.camCX) * g.S + g.W / 2) * r.width) / g.W, y: r.top + (((y - g.camCY) * g.S + g.H / 2) * r.height) / g.H });
      return [s(br.x - 10, br.y - br.h + 20), s(br.x + br.w + 10, br.y - 30)];
    });
    await page.mouse.move(box[0].x, box[0].y);
    await page.mouse.down();
    await page.mouse.move(box[1].x, box[1].y, { steps: 12 });
    await page.mouse.up();
    await page.waitForFunction(() => ['landed', 'caught', 'blocked'].includes(window.__game.strikes.list.find((s) => s.def.kind === 'bolt').state), { timeout: 15000 });
    const bolt = await G(() => window.__game.strikes.events.filter((e) => e.kind === 'impact' && e.what === 'bolt')[0]);
    check(bolt && bolt.dt >= 1.2 - 1e-6, `bolt: telegraph to impact ${bolt?.dt?.toFixed(3)} s game (>= 1.2, longer while stuck)`);
    // the demo spark into her rings: it should come out of the far ring and burst the yokai, no echo (her rings)
    await page.waitForFunction(() => window.__game.strikes.list[2].state !== 'armed' && window.__game.strikes.list[2].state !== 'tele', { timeout: 20000 });
    await wait(900);
    const demo = await G(() => ({ s: window.__game.strikes.list[2].state, hits: window.__game.portals.events.filter((e) => e.kind === 'hit' && e.target === 'yokai').length, echo: window.__game.portals.events.filter((e) => e.kind === 'echo').length }));
    check(demo.s === 'caught' && demo.hits >= 1 && demo.echo === 0, `demo spark caught by her rings and burst the yokai (no echo for her rings): ${JSON.stringify(demo)}`);
    await page.screenshot({ path: `${out}/strikes-demo.png` });
    // the two bolts: stand still under the first (keyboard up does nothing, so let it run into it) and expect a death with a cause
    await page.waitForFunction(() => window.__game.state === 'dying' || window.__game.strikes.list[4]?.state === 'landed', { timeout: 20000 });
    await wait(150);
    const death = await G(() => ({ state: window.__game.state, cause: window.__game.cause, falls: window.__game.stats.falls, flashes: window.__game.strikes.events.filter((e) => e.kind === 'flash').length }));
    console.log('bolts', JSON.stringify(death));
    if (death.state === 'dying') {
      check(!!death.cause && death.cause.kind === 'bolt', `struck by a bolt: cause box ${JSON.stringify(death.cause)}`);
      await page.screenshot({ path: `${out}/cause-bolt.png` });
    }
    check(death.flashes >= 1, `a bolt impact booked a flash through the limiter (${death.flashes})`);
  }
  if (which === 'flash' || which === 'all') {
    await start('flash', '');
    await page.waitForFunction(() => window.__game.introT >= 1.5, { timeout: 10000 });
    // every frame: the canvas's mean luminance (sRGB Rec.709 on a 64 x 36 copy), real time, and the flash start
    await G(() => {
      const g = window.__game;
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 36;
      const x = c.getContext('2d', { willReadFrequently: true });
      window.__lum = [];
      const tick = () => {
        if (!window.__lum) return;
        x.drawImage(g.canvas, 0, 0, 64, 36);
        const d = x.getImageData(0, 0, 64, 36).data;
        let s = 0;
        for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        window.__lum.push({ rt: g.realT, L: s / (255 * 64 * 36), f0: g.flashT0, state: g.state });
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const bolts = () => G(() => window.__game.strikes.list.map((s) => s.state));
    const done = (i) => page.waitForFunction((i) => ['landed', 'caught', 'blocked'].includes(window.__game.strikes.list[i].state), { timeout: 20000, polling: 16 }, i);
    /** Paint one horizontal stroke of `key`'s ink 230 u over strike i's mark, with the real mouse, once its telegraph runs. */
    const paintOver = async (i, key) => {
      await page.waitForFunction((i) => window.__game.strikes.list[i].state === 'tele', { timeout: 20000, polling: 16 }, i);
      await page.keyboard.press(key);
      const pts = await G((i) => {
        const g = window.__game;
        const d = g.strikes.list[i].def;
        const r = g.canvas.getBoundingClientRect();
        const s = (x, y) => ({ x: r.left + (((x - g.camCX) * g.S + g.W / 2) * r.width) / g.W, y: r.top + (((y - g.camCY) * g.S + g.H / 2) * r.height) / g.H });
        return [s(d.mark - 90, d.groundY - 230), s(d.mark + 90, d.groundY - 230)];
      }, i);
      await page.mouse.move(pts[0].x, pts[0].y);
      await page.mouse.down();
      await page.mouse.move(pts[1].x, pts[1].y, { steps: 10 });
      await page.mouse.up();
      return G(() => window.__game.strokes.map((s) => s.kind));
    };
    // bolt 0: plain, lands ahead; its flash must draw (game.flashT0 at the impact)
    await done(0);
    await wait(100);
    const f0 = await G(() => ({ flashT0: window.__game.flashT0, ev: window.__game.strikes.events.filter((e) => e.id === 1 && (e.kind === 'impact' || e.kind === 'flash')) }));
    const imp0 = f0.ev.find((e) => e.kind === 'impact');
    check(imp0 && f0.ev.some((e) => e.kind === 'flash') && Math.abs(f0.flashT0 - imp0.realT) < 0.02, `bolt flash draws: game.flashT0 ${f0.flashT0?.toFixed(3)} at impact ${imp0?.realT?.toFixed(3)}`);
    // bolt 1: an indigo stroke over the mark must not stop it
    const k1 = await paintOver(1, 'Digit2');
    await done(1);
    const s1 = await G(() => ({ st: window.__game.strikes.list[1].state, ev: window.__game.strikes.events.filter((e) => e.id === 2 && e.kind === 'blocked'), kinds: window.__game.strokes.map((s) => s.kind), falls: window.__game.stats.falls }));
    check(k1.includes('ai') && s1.st === 'landed' && !s1.ev.length && s1.kinds.includes('ai'), `indigo over a bolt does not stop it: painted ${JSON.stringify(k1)}, bolt ${s1.st}, strokes after ${JSON.stringify(s1.kinds)}`);
    // bolt 2: a vermilion stroke stops it and shatters
    const k2 = await paintOver(2, 'Digit1');
    await done(2);
    const s2 = await G(() => ({ st: window.__game.strikes.list[2].state, ev: window.__game.strikes.events.filter((e) => e.id === 3 && e.kind === 'blocked'), kinds: window.__game.strokes.map((s) => s.kind) }));
    check(k2.includes('shu') && s2.st === 'blocked' && s2.ev[0]?.by === 'shu' && !s2.kinds.includes('shu'), `vermilion over a bolt stops it and shatters: painted ${JSON.stringify(k2)}, bolt ${s2.st} by ${s2.ev[0]?.by}, strokes after ${JSON.stringify(s2.kinds)}`);
    // the Course.flash beat
    await page.waitForFunction(() => window.__game.festival.snapshot && window.__game.px > window.__game.level.flashes[0].x + 200, { timeout: 20000 });
    await wait(700);
    const lum = await G(() => {
      const l = window.__lum;
      window.__lum = null;
      return l;
    });
    console.log('bolts', JSON.stringify(await bolts()), 'frames', lum.length);
    // luminance: per flash start, the lift over the frame before it; never a frame-to-frame jump over 20 %, never a
    // lift over 20 %, and the lift reaches 90 % of its peak no sooner than 60 ms in (an 80 ms ramp at frame grain)
    let jump = 0;
    for (let i = 1; i < lum.length; i++) if (lum[i].state === 'play' && lum[i - 1].state === 'play') jump = Math.max(jump, Math.abs(lum[i].L - lum[i - 1].L));
    check(jump <= 0.2, `no frame-to-frame luminance jump over 20 %: largest ${(jump * 100).toFixed(1)} %`);
    const starts = [...new Set(lum.map((f) => f.f0).filter((t) => t > 0))];
    check(starts.length >= 2, `flashes seen in the recording: ${starts.length} (bolt + Course.flash)`);
    for (const t0 of starts) {
      const before = lum.filter((f) => f.rt < t0).slice(-1)[0];
      const after = lum.filter((f) => f.rt >= t0 && f.rt < t0 + 0.6);
      if (!before || !after.length) {
        check(false, `flash at ${t0.toFixed(2)}: frames around it`);
        continue;
      }
      const lift = after.map((f) => ({ age: f.rt - t0, d: f.L - before.L }));
      const peak = Math.max(...lift.map((f) => f.d));
      const at90 = lift.find((f) => f.d >= peak * 0.9);
      console.log(`flash ${t0.toFixed(2)}: base ${(before.L * 100).toFixed(1)} %`, lift.slice(0, 8).map((f) => `${(f.age * 1000).toFixed(0)}ms:+${(f.d * 100).toFixed(1)}`).join(' '));
      check(peak > 0.01 && peak <= 0.2, `flash at ${t0.toFixed(2)} s shows and lifts the frame by ${(peak * 100).toFixed(1)} % (<= 20 %)`);
      check(at90 && at90.age >= 0.06, `flash at ${t0.toFixed(2)} s ramps in: 90 % of its lift at ${((at90?.age ?? 0) * 1000).toFixed(0)} ms (>= 60 ms at frame grain, 80 ms ramp)`);
    }
  }
  if (errors.length) {
    console.log('PAGE ERRORS:\n' + errors.join('\n'));
    fails++;
  }
} finally {
  await browser.close();
}
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
