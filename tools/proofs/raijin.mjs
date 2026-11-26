// Usage: flock /tmp/inkrunner-browser.lock node tools/proofs/raijin.mjs [all|desktop|phone] [outdir]  (env URL, default http://localhost:5173/; STRIPS=0 skips the frame strips)
// Raijin assertions on ?proof=raijin with REAL input: mouse at 1600x900 (Ren) and touch at iPhone 13 landscape (Kohaku).
// One continuous run of the phase-1 arena per device:
//   1. no input: the seam strike lands on the traveler (standing on the mark kills), and the retry is fair;
//   2. a ring on the next bolt's thread and a window aimed at him: the bolt comes back, a drum comes clean, echo +15;
//   3. a door past the third mark (painted while time is slowed): the uncaught bolt lands where it was telegraphed;
//   4. the fourth bolt caught and returned: the phase is won; the loop's end re-soaks it and wraps (no visible jump);
//   5. no input again until at least six strikes have landed: every telegraph-to-impact >= 1.0 s (game and real).
// Then two more loads, with bolts passing through the traveler (&immortal=1) so whole loops can be watched:
//   B. phases 1 and 2 chained through Course.arena() (&arena=1,2), as the gate does: unwon, phase 1 wraps and keeps
//      its lantern; phase 2 never arms before phase 1 is won; two returned bolts (real input) win phase 1; every
//      phase-1 and phase-2 strike lands >= 1.0 s after its telegraph, where telegraphed; unwon, phase 2 (a 4,900 loop,
//      not a multiple of the road tile) wraps with nothing visibly jumping.
//   C. phase 3 alone (&arena=3): all twelve triplet bolts (telegraph 1.1 s, the smallest) land >= 1.0 s after theirs.
// In every run a per-frame meter checks that his whole drum ring (the health bar, 4.1 and 4.8) stays inside the
// canvas in every phase once he has arrived (phase 2 bobs 70 u; phase 3 sweeps and sits low).
// Prints PASS/FAIL per assertion and per device; exits 1 on any FAIL. Frame strips are read from the game canvas
// (never a screenshot while a finger is down) and saved under shots/proofs/raijin/.
import { mkdirSync, writeFileSync } from 'node:fs';
import puppeteer, { KnownDevices } from 'puppeteer-core';

const URL = process.env.URL ?? 'http://localhost:5173/';
const which = process.argv[2] ?? 'all';
const out = process.argv[3] ?? 'shots/proofs/raijin';
const STRIPS = process.env.STRIPS !== '0';
const TRIES = Math.max(1, Number(process.env.TRIES ?? 3));
mkdirSync(out, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const allResults = [];

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  headless: 'new',
  args: ['--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});

async function device(phone) {
  const tag = phone ? 'phone' : 'desktop';
  const char = phone ? 'kohaku' : 'ren';
  const results = [];
  let buffer = null;
  const say = (line) => (buffer ? buffer.push(line) : console.log(line));
  const check = (ok, what, detail = '') => {
    results.push({ ok, what });
    allResults.push(ok);
    say(`${ok ? 'PASS' : 'FAIL'} [${tag}] ${what}${detail ? '  ' + detail : ''}`);
  };
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => !String(e.stack).includes('pptr:') && errors.push(e.stack ?? String(e)));
  if (phone) await page.emulate(KnownDevices['iPhone 13 landscape']);
  else await page.setViewport({ width: 1600, height: 900 });
  const G = (fn, ...a) => page.evaluate(fn, ...a);

  // ── helpers ───────────────────────────────────────────────────────────
  const load = async (extra = '') => {
    await page.goto(`${URL}?proof=raijin&play=${char}&panel=0${extra}`, {
      waitUntil: 'load',
    });
    await page.waitForFunction(() => window.__game?.state === 'play' && window.__proof, { timeout: 20000 });
    await page.waitForFunction(() => window.__game.introT >= 1.5, {
      timeout: 10000,
    });
    await G(() => (window.__rjMark = 1));
  };
  const alive = () => G(() => window.__rjMark === 1 && !!window.__game).catch(() => false);
  /** world point → client CSS pixels, using the live camera */
  const toClient = (pts) =>
    G((pts) => {
      const g = window.__game;
      const r = g.canvas.getBoundingClientRect();
      return pts.map((p) => ({
        x: r.left + (((p.x - g.camCX) * g.S + g.W / 2) * r.width) / g.W,
        y: r.top + (((p.y - g.camCY) * g.S + g.H / 2) * r.height) / g.H,
      }));
    }, pts);
  const waitFor = async (fn, ms, arg) => {
    try {
      await page.waitForFunction(fn, { timeout: ms, polling: 30 }, arg);
      return true;
    } catch {
      return false;
    }
  };
  const rEvents = (since = 0) => G((since) => window.__game.raijin.events.filter((e) => e.seq > since), since);
  const rSeq = () => G(() => window.__game.raijin.events.at(-1)?.seq ?? 0);
  const pEvents = (since = 0) => G((since) => window.__game.portals.events.filter((e) => e.seq > since), since);
  const pSeq = () => G(() => window.__game.portals.events.at(-1)?.seq ?? 0);
  /** wait for a Raijin event of `kind` after `since` (optionally matching id) */
  const nextEvent = async (kind, since, ms, id = null) => {
    const ok = await waitFor(([kind, since, id]) => window.__game.raijin.events.some((e) => e.seq > since && e.kind === kind && (id === null || e.id === id)), ms, [kind, since, id]);
    if (!ok) return null;
    return G(([kind, since, id]) => window.__game.raijin.events.find((e) => e.seq > since && e.kind === kind && (id === null || e.id === id)), [kind, since, id]);
  };
  const traveler = () =>
    G(() => ({
      x: window.__game.px,
      y: window.__game.py,
      state: window.__game.state,
      ink: window.__game.inkAmt,
      inkMax: window.__game.inkMax,
      falls: window.__game.stats.falls,
      invuln: window.__game.invuln,
    }));
  const snap = () => G(() => window.__game.raijin.snapshot());
  const geo = () =>
    G(() => {
      const g = window.__game;
      const d = g.level.raijin;
      return {
        gy: d.groundY,
        phases: d.phases.map((p) => ({
          x0: p.x0,
          length: p.length,
          lantern: p.lantern,
        })),
        lanterns: g.level.lanterns.map((l) => l.x),
      };
    });
  /** points of a ring: start angle a0 (deg), sweep (deg), and an optional tail flicked toward `tail` degrees */
  const ringPts = (cx, cy, r, { a0 = -100, sweep = 372, tail = null, tailLen = 70, n = 30 } = {}) => {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const a = ((a0 + (sweep * i) / n) * Math.PI) / 180;
      pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
    if (tail !== null) {
      const last = pts[pts.length - 1];
      const t = (tail * Math.PI) / 180;
      const tip = {
        x: cx + Math.cos(t) * (r + tailLen),
        y: cy + Math.sin(t) * (r + tailLen),
      };
      for (let i = 1; i <= 6; i++)
        pts.push({
          x: last.x + ((tip.x - last.x) * i) / 6,
          y: last.y + ((tip.y - last.y) * i) / 6,
        });
    }
    return pts;
  };
  /** Paint world points with real input: the whole stroke is placed on the glass when the brush goes down. */
  const paint = async (world, midway) => {
    const client = await toClient(world);
    const a = client[0];
    if (phone) await page.touchscreen.touchStart(a.x, a.y);
    else {
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
    }
    for (let i = 1; i < client.length; i++) {
      const q = client[i];
      if (phone) await page.touchscreen.touchMove(q.x, q.y);
      else await page.mouse.move(q.x, q.y, { steps: 2 });
      if (midway) await midway(i);
    }
    if (phone) await page.touchscreen.touchEnd();
    else await page.mouse.up();
    await wait(40);
  };
  const playerRings = () =>
    G(() =>
      window.__game.portals.playerRings().map((r) => ({
        id: r.id,
        cx: r.cx,
        cy: r.cy,
        r: r.r,
        state: r.state,
        spout: r.spout,
      })),
    );

  // a frame strip read from the game canvas (so a held finger is never disturbed)
  const strip = {
    begin: () => G(() => (window.__strip = [])),
    /** focus: { x, y, w } in world units crops around that spot (w wide, 2:3 tall); otherwise the whole view */
    grab: (focus = null) =>
      G((focus) => {
        const g = window.__game;
        const c = document.createElement('canvas');
        const w = 560;
        if (focus) {
          const sx = (focus.x - focus.w / 2 - g.camCX) * g.S + g.W / 2;
          const sy = (focus.y - focus.w / 3 - g.camCY) * g.S + g.H / 2;
          c.width = w;
          c.height = Math.round((w * 2) / 3);
          c.getContext('2d').drawImage(g.canvas, sx, sy, focus.w * g.S, ((focus.w * 2) / 3) * g.S, 0, 0, c.width, c.height);
        } else {
          c.width = w;
          c.height = Math.round((w * g.H) / g.W);
          c.getContext('2d').drawImage(g.canvas, 0, 0, c.width, c.height);
        }
        window.__strip.push(c);
        return window.__strip.length;
      }, focus),
    save: async (name, cols = 4) => {
      const data = await G((cols) => {
        const fr = window.__strip;
        if (!fr?.length) return null;
        const w = fr[0].width;
        const h = fr[0].height;
        const rows = Math.ceil(fr.length / cols);
        const c = document.createElement('canvas');
        c.width = w * cols + (cols - 1) * 6;
        c.height = h * rows + (rows - 1) * 6;
        const x = c.getContext('2d');
        x.fillStyle = '#222';
        x.fillRect(0, 0, c.width, c.height);
        fr.forEach((f, i) => {
          x.drawImage(f, (i % cols) * (w + 6), Math.floor(i / cols) * (h + 6));
          x.fillStyle = '#fff';
          x.font = '16px sans-serif';
          x.fillText(String(i + 1), (i % cols) * (w + 6) + 8, Math.floor(i / cols) * (h + 6) + 20);
        });
        return c.toDataURL('image/png').split(',')[1];
      }, cols);
      if (!data) return;
      const path = `${out}/${tag}-${name}.png`;
      writeFileSync(path, Buffer.from(data, 'base64'));
      say(`strip ${path}`);
    },
  };
  /** grab `n` frames `every` ms apart around a world spot computed fresh each time */
  const film = async (n, every, focusFn) => {
    for (let i = 0; i < n; i++) {
      await strip.grab(focusFn ? await focusFn() : null);
      await wait(every);
    }
  };
  const raijinFocus = () =>
    G(() => ({
      x: window.__game.raijin.x,
      y: window.__game.raijin.y + 10,
      w: 330,
    }));

  /**
   * A per-frame recorder installed in the page: after each render it copies a crop of the canvas (it only
   * reads pixels; nothing drawn changes). Modes: frames around a world spot or around Raijin, and a wrap
   * meter (mean pixel change between consecutive frames, tagged with the wrap count).
   */
  const installFilm = () =>
    G(() => {
      const g = window.__game;
      if (window.__film) return;
      const f = (window.__film = {
        on: false,
        every: 1,
        n: 0,
        frames: [],
        max: 40,
        focus: null,
        meter: false,
        prev: null,
        diffs: [],
        keep: [],
      });
      const small = document.createElement('canvas');
      small.width = 400;
      small.height = Math.round((400 * g.H) / g.W);
      const sctx = small.getContext('2d', { willReadFrequently: true });
      const ren = g.render.bind(g);
      g.render = () => {
        ren();
        if (!f.on) return;
        if (f.meter) {
          sctx.drawImage(g.canvas, 0, 0, small.width, small.height);
          const cur = sctx.getImageData(0, 0, small.width, small.height).data;
          if (f.prev) {
            let s = 0;
            for (let i = 0; i < cur.length; i += 4) s += Math.abs(cur[i] - f.prev[i]) + Math.abs(cur[i + 1] - f.prev[i + 1]) + Math.abs(cur[i + 2] - f.prev[i + 2]);
            f.diffs.push({
              d: s / (cur.length * 0.75),
              wraps: g.raijin.wraps,
              px: g.px,
            });
            // keep the frames either side of a wrap
            if (f.diffs.length >= 2 && f.diffs.at(-1).wraps !== f.diffs.at(-2).wraps) {
              const a = document.createElement('canvas');
              a.width = small.width;
              a.height = small.height;
              a.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(f.prev), small.width, small.height), 0, 0);
              const b = document.createElement('canvas');
              b.width = small.width;
              b.height = small.height;
              b.getContext('2d').drawImage(small, 0, 0);
              f.keep = [a, b];
            }
          }
          f.prev = cur;
          return;
        }
        if (f.n++ % f.every) return;
        const fo = f.focus === 'raijin' ? { x: g.raijin.x, y: g.raijin.y + 10, w: 330 } : f.focus;
        const c = document.createElement('canvas');
        const w = 480;
        c.width = w;
        if (fo) {
          c.height = Math.round((w * 2) / 3);
          const sx = (fo.x - fo.w / 2 - g.camCX) * g.S + g.W / 2;
          const sy = (fo.y - fo.w / 3 - g.camCY) * g.S + g.H / 2;
          c.getContext('2d').drawImage(g.canvas, sx, sy, fo.w * g.S, ((fo.w * 2) / 3) * g.S, 0, 0, c.width, c.height);
        } else {
          c.height = Math.round((w * g.H) / g.W);
          c.getContext('2d').drawImage(g.canvas, 0, 0, c.width, c.height);
        }
        f.frames.push(c);
        if (f.frames.length > f.max) f.frames.shift();
      };
    });
  /**
   * A ring meter installed in the page: after every render it records, per phase, how close his drum ring's box
   * (snapshot().ring, the drums' outer edges) comes to each edge of the canvas, once he has fully arrived.
   */
  const installRingMeter = () =>
    G(() => {
      const g = window.__game;
      if (window.__ringMeter) return;
      const m = (window.__ringMeter = {});
      const ren = g.render.bind(g);
      g.render = () => {
        ren();
        const s = g.raijin.snapshot();
        if (!s.arrived || s.phase < 0) return;
        const n = g.level.raijin.phases[s.phase].n;
        const toX = (x) => ((x - g.camCX) * g.S + g.W / 2) / g.W;
        const toY = (y) => ((y - g.camCY) * g.S + g.H / 2) / g.H;
        const e = (m[n] ??= { top: 1, bottom: 0, left: 1, right: 0, n: 0 });
        e.top = Math.min(e.top, toY(s.ring.y0));
        e.bottom = Math.max(e.bottom, toY(s.ring.y1));
        e.left = Math.min(e.left, toX(s.ring.x0));
        e.right = Math.max(e.right, toX(s.ring.x1));
        e.n++;
      };
    });
  /** every phase in `phases` was sampled and his whole ring stayed inside the canvas */
  const ringCheck = async (phases, label) => {
    const m = await G(() => window.__ringMeter ?? {});
    const ok = phases.every((n) => m[n] && m[n].n > 30 && m[n].top >= 0 && m[n].bottom <= 1 && m[n].left >= 0 && m[n].right <= 1);
    check(
      ok,
      `his whole drum ring (the health bar) stays on screen in every phase (${label})`,
      phases.map((n) => (m[n] ? `phase ${n}: top ${(m[n].top * 100).toFixed(1)}%, bottom ${(m[n].bottom * 100).toFixed(1)}%, left ${(m[n].left * 100).toFixed(1)}%, right ${(m[n].right * 100).toFixed(1)}% over ${m[n].n} frames` : `phase ${n}: not sampled`)).join('; '),
    );
  };
  const filmStart = (focus, every = 1, max = 40) =>
    G(
      ([focus, every, max]) => {
        const f = window.__film;
        Object.assign(f, {
          on: true,
          every,
          n: 0,
          frames: [],
          max,
          focus,
          meter: false,
        });
      },
      [focus, every, max],
    );
  const filmStop = () => G(() => (window.__film.on = false));
  /** save the filmed frames (or `pick` of them) as a strip */
  const filmSave = async (name, pick = null, cols = 4) => {
    if (!STRIPS) return;
    await G((pick) => {
      const fr = window.__film.frames;
      window.__strip = pick ? pick.map((i) => fr[Math.max(0, Math.min(fr.length - 1, i < 0 ? fr.length + i : i))]).filter(Boolean) : fr.slice();
    }, pick);
    await strip.save(name, cols);
  };

  /** catch strike `s`: a ring on its thread above head height, a window aimed at him (real input) */
  const catchStrike = async (s, film, gy) => {
    const pseq = await pSeq();
    const before = await snap();
    const A = { x: s.mark, y: gy - 150 };
    const B = { x: s.mark - 270, y: gy - 250 };
    const aim = (Math.atan2(before.y - B.y, before.x - B.x) * 180) / Math.PI;
    await paint(ringPts(A.x, A.y, 50, { a0: -90, sweep: 372, n: 30 }));
    if (film) await filmStart(null, 2, 26);
    await paint(
      ringPts(B.x, B.y, 46, {
        a0: 90,
        sweep: 372,
        n: 30,
        tail: aim,
        tailLen: 70,
      }),
    );
    const rings = await playerRings();
    const c = await nextEvent('catch', s.seq, 5000, s.id);
    const d = c && (await nextEvent('drum', c.seq, 2000));
    await wait(250);
    if (film) await filmStop();
    const after = await snap();
    const pev = await pEvents(pseq);
    return {
      c,
      d,
      before,
      after,
      A,
      B,
      aim,
      rings,
      echo: pev.find((e) => e.kind === 'echo'),
      pass: pev.find((e) => e.kind === 'pass' && e.what === 'bolt'),
      fizzles: pev.filter((e) => e.kind === 'fizzle').map((e) => `${e.label}${e.why ? '/' + e.why : ''}`),
    };
  };

  /** start the pixel meter; `finish(wrap)` returns the change across that wrap's frame vs. the 40 frames before */
  const meterStart = () =>
    G(() =>
      Object.assign(window.__film, {
        on: true,
        meter: true,
        diffs: [],
        prev: null,
        keep: [],
      }),
    );
  const meterFinish = async (name) => {
    const meter = await G(() => {
      const f = window.__film;
      f.on = false;
      f.meter = false;
      return f.diffs;
    });
    let wrapD = null;
    let base = [];
    const wi = meter.findIndex((m, i) => i > 0 && m.wraps !== meter[i - 1].wraps);
    if (wi > 0) {
      wrapD = meter[wi].d;
      base = meter
        .slice(Math.max(0, wi - 40), wi)
        .map((m) => m.d)
        .sort((a, b) => a - b);
    }
    const med = base.length ? base[Math.floor(base.length / 2)] : 0;
    const p90 = base.length ? base[Math.floor(base.length * 0.9)] : 0;
    if (STRIPS && name) await G(() => (window.__strip = window.__film.keep.slice())).then(() => strip.save(name, 2));
    return {
      wrapD,
      med,
      p90,
      n: base.length,
      ok: wrapD !== null && wrapD <= Math.max(p90 * 1.5, med + 1),
    };
  };

  // ── the run ───────────────────────────────────────────────────────────
  const run = async () => {
    await load();
    await installFilm();
    await installRingMeter();
    const geom = await geo();
    const gy = geom.gy;
    const ph = geom.phases[0];
    const lantern = ph.lantern;
    console.log(
      `[${tag}] ${char}, coarse pointer ${await G(() => matchMedia('(pointer: coarse)').matches)}, view ${await G(() => Math.round(window.__game.W / window.__game.S))} u wide, arena ${ph.x0}..${ph.x0 + ph.length}, road y ${gy}`,
    );
    const teles = [];
    const impacts = [];

    // ── 1. no input: the seam strike lands on a traveler standing on its mark; then a fair retry
    let seq = await rSeq();
    const s1 = await nextEvent('tele', seq, 15000);
    if (!s1) throw new Error('no telegraph from the seam strike');
    teles.push(s1);
    if (STRIPS) await filmStart({ x: s1.mark - 60, y: gy - 230, w: 760 }, 4, 40);
    const death1 = await nextEvent('death', s1.seq, 5000);
    await wait(250);
    if (STRIPS) {
      await filmStop();
      await filmSave('strike-strip');
    }
    const imp1 = (await rEvents(s1.seq)).find((e) => e.kind === 'impact' && e.id === s1.id);
    if (imp1) impacts.push(imp1);
    check(
      !!death1 && !!imp1 && Math.abs(imp1.x - s1.mark) < 1 && death1.cause === s1.id && Math.abs(death1.px - s1.mark) <= 20 + 13,
      'standing on the mark kills the traveler (the uncaught seam strike)',
      death1 && imp1
        ? `mark ${s1.mark.toFixed(0)}, bolt at x ${imp1.x.toFixed(1)}, traveler at ${death1.px.toFixed(0)} (${(death1.px - s1.mark).toFixed(0)} u off), killed by strike #${death1.cause}`
        : `death ${!!death1}, impact ${!!imp1}`,
    );
    const resp = death1 && (await nextEvent('respawn', death1.seq, 3000));
    const s2 = resp && (await nextEvent('tele', resp.seq, 6000));
    if (!s2) throw new Error('no respawn or no telegraph after it');
    teles.push(s2);

    // ── 2. a door past the mark, painted while time is slowed: the uncaught bolt lands where it was telegraphed
    const pseq2 = await pSeq();
    await waitFor((m) => window.__game.px >= m - 420, 3000, s2.mark);
    const t2 = await traveler();
    // the door goes a little ahead, so the traveler runs into it after the pair links (painting takes real time)
    const door = { x: t2.x + 170, y: gy - 44 };
    const exit = { x: s2.mark + 170, y: gy - 62 };
    await paint(ringPts(door.x, door.y, 56, { a0: -90, sweep: 372, n: 30 }));
    await paint(ringPts(exit.x, exit.y, 50, { a0: -90, sweep: 372, n: 30 }));
    const imp2 = await nextEvent('impact', s2.seq, 4000, s2.id);
    if (imp2) impacts.push(imp2);
    await wait(150);
    const t2b = await traveler();
    const pass2 = (await pEvents(pseq2)).find((e) => e.kind === 'pass' && e.what === 'traveler');
    const dead2 = (await rEvents(s2.seq)).some((e) => e.kind === 'death');
    check(
      !!imp2 && Math.abs(imp2.x - s2.mark) < 1 && !imp2.killed && !dead2 && !!pass2 && t2b.state === 'play' && t2b.x > s2.mark + 43,
      'an uncaught bolt lands where it was telegraphed (door past the mark, painted in slow motion)',
      (imp2
        ? `mark ${s2.mark.toFixed(0)}, landed at x ${imp2.x.toFixed(1)} y ${imp2.y.toFixed(0)} (road ${gy}), traveler through the door ${!!pass2}, now at ${t2b.x.toFixed(0)}, telegraph ${imp2.dt.toFixed(3)} s game / ${imp2.dtReal.toFixed(2)} s real`
        : 'no impact') +
        (pass2
          ? ''
          : `; door at ${door.x.toFixed(0)} (traveler ${t2.x.toFixed(0)}), exit at ${exit.x.toFixed(0)}; portal events: ${(await pEvents(pseq2)).map((e) => e.kind + (e.label ? ':' + e.label : '') + (e.why ? '/' + e.why : '') + (e.cx !== undefined ? '@' + Math.round(e.cx) + ',' + Math.round(e.cy) : '')).join(' ')}`),
    );
    // the retry was fair: lantern, full ink, no rings, invulnerable a moment, next telegraph only after respawn
    check(
      !!resp &&
        Math.abs(resp.x - (lantern + 30)) < 2 &&
        Math.abs(resp.ink - resp.inkMax) < 0.01 &&
        resp.ringsAfter === 0 &&
        resp.invuln >= 0.7 &&
        resp.nextTrigger > resp.x &&
        s2.realT > resp.realT &&
        s2.t + s2.tele - death1.t >= 2.5 &&
        resp.realT - death1.realT >= 0.85 &&
        !dead2,
      'standing on the mark is retried fairly (phase lantern, full ink, rings cleared, next telegraph starts after respawn)',
      `respawn at ${resp.x.toFixed(0)} (lantern ${lantern} + 30) ${(resp.realT - death1.realT).toFixed(2)} s after death, ink ${resp.ink.toFixed(0)}/${resp.inkMax.toFixed(0)}, rings ${resp.ringsBefore}→${resp.ringsAfter}, invuln ${resp.invuln.toFixed(2)}; next telegraph ${(s2.t - resp.t).toFixed(2)} s after respawn, its impact ${(s2.t + s2.tele - death1.t).toFixed(2)} s after the death`,
    );

    // ── 3. catch: a ring on the thread above head height, a window aimed at him; the bolt comes back and cleans a drum
    const s3 = await nextEvent('tele', s2.seq, 6000);
    if (!s3) throw new Error('no third telegraph');
    teles.push(s3);
    const k3 = await catchStrike(s3, STRIPS, gy);
    if (STRIPS) await filmSave('return-strip', [-16, -15, -14, -13, -12, -11, -10, -9, -8, -7, -6, -5, -4, -3, -2, -1]);
    check(
      !!k3.c && !!k3.d && k3.d.id === s3.id && k3.after.soaked === k3.before.soaked - 1 && k3.rings.length === 2 && k3.rings.every((r) => r.state === 'linked'),
      'a bolt through a painted pair comes back, hits a drum, and the drum count drops',
      k3.c
        ? `rings ${k3.rings.map((r) => `R${r.r.toFixed(0)}@${r.cx.toFixed(0)},${r.cy.toFixed(0)}`).join(' + ')}; caught ${k3.c.at.toFixed(2)} s into the telegraph, out along ${((Math.atan2(k3.pass?.vout.y ?? 0, k3.pass?.vout.x ?? 1) * 180) / Math.PI).toFixed(0)}° (tail ${k3.aim.toFixed(0)}°, assist ${(((k3.pass?.bend ?? 0) * 180) / Math.PI).toFixed(1)}°); drum ${k3.d ? k3.d.drum + 1 : '-'} hit ${k3.d ? k3.d.dist.toFixed(0) + ' u from his centre' : ''}; soaked ${k3.before.soaked} → ${k3.after.soaked}`
        : `no catch (rings ${k3.rings.length}, fizzles ${k3.fizzles.join(',') || 'none'})`,
    );
    const cap = (k3.d?.ink ?? 0) + 15 > (await traveler()).inkMax;
    check(
      !!k3.echo && k3.echo.refund === 15 && !!k3.d && (cap ? k3.echo.ink >= k3.d.ink : Math.abs(k3.echo.ink - k3.d.ink - 15) < 0.01),
      'the echo refund lands (+15 ink when the returned bolt cleans a drum)',
      k3.echo ? `ink ${k3.d?.ink.toFixed(1)} → ${k3.echo.ink.toFixed(1)}${cap ? ' (capped at the inkwell)' : ''}` : 'no echo event',
    );

    // ── 4. the fourth bolt: move the door, keep painting a window; the second drum wins the phase
    const s4 = await nextEvent('tele', s3.seq, 6000);
    if (!s4) throw new Error('no fourth telegraph');
    teles.push(s4);
    const k4 = await catchStrike(s4, false, gy);
    const clear = await nextEvent('clear', s4.seq, 1500);
    check(
      !!k4.d && !!clear && clear.phase === 1 && k4.after.soaked === 6,
      'a second returned bolt wins phase 1 (two drums clean, telegraphs called off)',
      clear ? `soaked ${k4.after.soaked}/8, cleared ${JSON.stringify(k4.after.cleared)}` : `no clear (drum ${!!k4.d}, fizzles ${k4.fizzles.join(',') || 'none'})`,
    );

    // ── 5. the loop's end: (endless) the phase re-soaks and the world wraps back one loop with nothing visibly jumping
    await meterStart();
    const reset = await nextEvent('reset', s4.seq, 8000);
    const wrap = reset && (await nextEvent('wrap', reset.seq - 1, 3000));
    await wait(400);
    const m5 = await meterFinish('wrap-before-after');
    check(
      !!wrap && wrap.dx === -ph.length && m5.ok,
      'the arena loop wraps back one loop and nothing visibly jumps (pixel change across the wrap frame vs. ordinary frames)',
      wrap
        ? `traveler ${wrap.from.toFixed(0)} → ${wrap.to.toFixed(0)} (dx ${wrap.dx}); mean change per channel across the wrap ${m5.wrapD?.toFixed(2)}, ordinary frames median ${m5.med.toFixed(2)} / p90 ${m5.p90.toFixed(2)} over ${m5.n}`
        : 'no wrap',
    );

    // ── 6. no input: strikes land until at least six have; every telegraph >= 1.0 s before its impact
    let seq6 = wrap ? wrap.seq : await rSeq();
    let filmed = false;
    for (let guard = 0; impacts.length < 6 && guard < 10; guard++) {
      const tl = await nextEvent('tele', seq6, 9000);
      if (!tl) break;
      teles.push(tl);
      if (STRIPS && !filmed) {
        filmed = true;
        await filmStart('raijin', 2, 12);
        await wait(520);
        await filmStop();
        await filmSave('raijin-anim-strip');
      }
      const im = await nextEvent('impact', tl.seq, 4000, tl.id);
      if (im) impacts.push(im);
      seq6 = im ? im.seq : tl.seq;
    }
    const bad = impacts.filter((e) => !(e.dt >= 1.0 && e.dtReal >= 1.0 && Math.abs(e.dt - e.tele) < 0.05 && Math.abs(e.x - e.mark) < 1));
    check(
      impacts.length >= 6 && bad.length === 0 && teles.every((t) => t.tele >= 1.0),
      `telegraph-to-impact >= 1.0 s for every landing in mortal play (${impacts.length} landings of ${new Set(impacts.map((e) => e.id)).size} distinct strikes, ${teles.length} telegraphs; every strike of every phase is measured in B and C)`,
      impacts.map((e) => `#${e.id} ${e.dt.toFixed(3)}/${e.dtReal.toFixed(2)}s`).join(', ') + (bad.length ? `; bad: ${bad.map((e) => '#' + e.id).join(',')}` : ''),
    );
    await ringCheck([1], 'phase 1, mortal play');
    if (errors.length) say('PAGE ERRORS:\n' + errors.join('\n'));
    check(!errors.length, 'no page errors on the proof page');
  };

  /** every strike in `ids` lands where telegraphed, >= 1.0 s after its telegraph (game and real), at its own T */
  const timing = (impacts) => impacts.filter((e) => !(e.dt >= 1.0 && e.dtReal >= 1.0 && Math.abs(e.dt - e.tele) < 0.05 && Math.abs(e.x - e.mark) < 1 && !e.killed));
  const fmt = (impacts) => impacts.map((e) => `#${e.id} ${e.dt.toFixed(3)}/${e.dtReal.toFixed(2)}s`).join(', ');
  /** collect landed impacts of `phaseN` until `want` distinct strike ids have landed (or time runs out) */
  const landAll = async (phaseN, want, since, ms) => {
    const ok = await waitFor(
      ([n, want, since]) => {
        const ev = window.__game.raijin.events;
        const ids = new Set(ev.filter((e) => e.seq > since && e.kind === 'tele' && e.phase === n).map((e) => e.id));
        return new Set(ev.filter((e) => e.seq > since && e.kind === 'impact' && ids.has(e.id)).map((e) => e.id)).size >= want;
      },
      ms,
      [phaseN, want, since],
    );
    const ev = await rEvents(since);
    const ids = new Set(ev.filter((e) => e.kind === 'tele' && e.phase === phaseN).map((e) => e.id));
    const first = new Map();
    for (const e of ev) if (e.kind === 'impact' && ids.has(e.id) && !first.has(e.id)) first.set(e.id, e);
    return {
      ok,
      impacts: [...first.values()],
      teles: ev.filter((e) => e.kind === 'tele' && e.phase === phaseN),
    };
  };

  // ── B. phases 1 and 2 chained (the gate's Course.arena() back to back), bolts passing through the traveler
  const runChained = async () => {
    errors.length = 0;
    await load('&arena=1,2&immortal=1&endless=0');
    await installFilm();
    await installRingMeter();
    const geom = await geo();
    const gy = geom.gy;
    const [p1, p2] = geom.phases;
    console.log(`[${tag}] B: phases chained, phase 1 ${p1.x0}..${p1.x0 + p1.length} (lantern ${p1.lantern}), phase 2 ${p2.x0}..${p2.x0 + p2.length} (lantern ${p2.lantern})`);
    // B0. a ring painted on him (hovering, phase 1) is torn by his storm: its own sound and tear, not the generic fizzle
    const ent = await nextEvent('enter', 0, 15000);
    await wait(1600);
    const rs = await rSeq();
    const him = await snap();
    await paint(ringPts(him.x - 10, him.y + 20, 48, { a0: -90, sweep: 372, n: 30 }));
    const sp = await nextEvent('sputter', rs, 1500);
    check(!!ent && !!sp, 'a ring painted on Raijin sputters out (his storm tears it: its own sound and tear)', sp ? `ring at ${sp.x.toFixed(0)},${sp.y.toFixed(0)} r ${sp.r.toFixed(0)}, ${Math.hypot(sp.x - him.x, sp.y - him.y).toFixed(0)} u from his centre` : 'no sputter event');
    // B1. no input: every phase-1 strike lands where telegraphed; the unwon phase wraps at its end, keeps its lantern
    const p1Land = await landAll(1, 4, 0, 40000);
    const wrap1 = await nextEvent('wrap', 0, 8000);
    await wait(300);
    const after1 = await snap();
    const resp1 = await G(() => window.__game.respawn.x);
    const ev1 = await rEvents(0);
    const p2early = ev1.filter((e) => e.kind === 'tele' && e.phase === 2);
    const maxPx = Math.max(...ev1.filter((e) => e.kind === 'tele').map((e) => e.px));
    check(
      !!wrap1 && wrap1.phase === 1 && wrap1.dx === -p1.length && after1.phase === 0 && !after1.cleared[0] && Math.abs(resp1 - (p1.lantern + 30)) < 1 && p2early.length === 0 && maxPx < p2.x0 + 300,
      'chained phases: unwon, phase 1 wraps at its end (no running on into phase 2; its lantern stays the respawn)',
      wrap1
        ? `wrap phase ${wrap1.phase}: traveler ${wrap1.from.toFixed(0)} → ${wrap1.to.toFixed(0)} (dx ${wrap1.dx}); after it phase index ${after1.phase}, cleared ${JSON.stringify(after1.cleared)}, respawn x ${resp1.toFixed(0)} (lantern ${p1.lantern} + 30); phase-2 telegraphs so far ${p2early.length}`
        : `no wrap (phase ${after1.phase}, respawn ${resp1})`,
    );
    // B2. win phase 1 with real input: two returned bolts
    const caught = [];
    let since = wrap1 ? wrap1.seq : await rSeq();
    for (let guard = 0; caught.length < 2 && guard < 6; guard++) {
      const tl = await nextEvent('tele', since, 9000);
      if (!tl) break;
      since = tl.seq;
      if (tl.phase !== 1) continue;
      const k = await catchStrike(tl, false, gy);
      if (k.d) caught.push(k);
      since = Math.max(since, await rSeq());
    }
    const clear1 = await nextEvent('clear', 0, 3000);
    // B3. phase 2: never armed before phase 1 was won; then all eight of its strikes land, >= 1.0 s after their telegraphs
    const p2Land = clear1 ? await landAll(2, 8, clear1.seq, 40000) : { ok: false, impacts: [], teles: [] };
    const ev3 = await rEvents(0);
    const p2teles = ev3.filter((e) => e.kind === 'tele' && e.phase === 2);
    const firstP2 = p2teles[0];
    const resp2 = await G(() => window.__game.respawn.x);
    check(
      !!clear1 && clear1.phase === 1 && caught.length === 2 && p2teles.length > 0 && p2teles.every((e) => e.seq > clear1.seq) && Math.abs(resp2 - (p2.lantern + 30)) < 1,
      'chained phases: phase 2 never arms before phase 1 is won (two returned bolts, real input); then its lantern takes over',
      clear1
        ? `phase 1 won by drums ${caught.map((k) => k.d.drum + 1).join(' and ')}; first phase-2 telegraph ${firstP2 ? `#${firstP2.id} at x ${firstP2.px.toFixed(0)}, event ${firstP2.seq} > clear ${clear1.seq}` : 'none'}; respawn x ${resp2.toFixed(0)} (lantern ${p2.lantern} + 30)`
        : `phase 1 not won (${caught.length} drums; fizzles ${caught.flatMap((k) => k.fizzles).join(',') || 'none'})`,
    );
    const both = [...p1Land.impacts, ...p2Land.impacts];
    const bad = timing(both);
    const p1ids = new Set(p1Land.impacts.map((e) => e.id)).size;
    const p2ids = new Set(p2Land.impacts.map((e) => e.id)).size;
    check(
      p1ids >= 4 && p2ids >= 8 && bad.length === 0,
      `telegraph-to-impact >= 1.0 s for every strike of phases 1 and 2, each landing where telegraphed (${p1ids} distinct phase-1 singles at T 1.6, ${p2ids} distinct phase-2 pair bolts at T 1.3)`,
      `P1: ${fmt(p1Land.impacts)}; P2: ${fmt(p2Land.impacts)}` + (bad.length ? `; bad: ${bad.map((e) => '#' + e.id).join(',')}` : ''),
    );
    // B4. phase 2 unwon wraps at its end (a 4,900 loop, not a multiple of the 900 road tile): nothing visibly jumps
    await meterStart();
    const wrap2 = await nextEvent('wrap', p2Land.impacts.at(-1)?.seq ?? (await rSeq()), 12000);
    await wait(400);
    const m2 = await meterFinish('wrap-phase2-before-after');
    check(
      !!wrap2 && wrap2.phase === 2 && wrap2.dx === -p2.length && m2.ok,
      'chained phases: unwon, phase 2 wraps back one 4,900 loop and nothing visibly jumps (road anchored per seam)',
      wrap2
        ? `traveler ${wrap2.from.toFixed(0)} → ${wrap2.to.toFixed(0)} (dx ${wrap2.dx}); change across the wrap ${m2.wrapD?.toFixed(2)}, ordinary median ${m2.med.toFixed(2)} / p90 ${m2.p90.toFixed(2)} over ${m2.n}`
        : 'no phase-2 wrap',
    );
    await ringCheck([1, 2], 'phases 1 and 2 chained, phase 2 bobbing 70 u');
    if (errors.length) say('PAGE ERRORS:\n' + errors.join('\n'));
    check(!errors.length, 'no page errors (chained phases)');
  };

  // ── C. phase 3 alone: twelve triplet bolts, the smallest telegraph (1.1 s)
  const runP3 = async () => {
    errors.length = 0;
    await load('&arena=3&immortal=1&endless=0');
    await installFilm();
    await installRingMeter();
    const land = await landAll(3, 12, 0, 45000);
    const bad = timing(land.impacts);
    const ids = new Set(land.impacts.map((e) => e.id)).size;
    check(
      ids >= 12 && bad.length === 0 && land.teles.every((t) => t.tele >= 1.0),
      `telegraph-to-impact >= 1.0 s for every phase-3 triplet bolt (T 1.1 s, the smallest), each landing where telegraphed (${ids} distinct strikes)`,
      fmt(land.impacts) + (bad.length ? `; bad: ${bad.map((e) => '#' + e.id).join(',')}` : ''),
    );
    await ringCheck([3], 'phase 3, sweeping and low');
    if (errors.length) say('PAGE ERRORS:\n' + errors.join('\n'));
    check(!errors.length, 'no page errors (phase 3)');
  };

  try {
    for (const fn of [run, runChained, runP3]) {
      for (let attempt = 1; attempt <= TRIES; attempt++) {
        const n0 = results.length;
        const a0 = allResults.length;
        buffer = [];
        let err = null;
        try {
          await fn();
        } catch (e) {
          err = e;
        }
        const reloaded = !(await alive());
        const lines = buffer;
        buffer = null;
        if ((reloaded || err) && attempt < TRIES) {
          results.splice(n0);
          allResults.splice(a0);
          errors.length = 0;
          console.log(`      (${err ? 'harness error "' + String(err.message).split('\n')[0] + '"' : 'the page was reloaded by the dev server'}; attempt ${attempt + 1} of ${TRIES})`);
          if (phone) await page.touchscreen.touchEnd().catch(() => {});
          else await page.mouse.up().catch(() => {});
          await wait(2000);
          continue;
        }
        for (const l of lines) console.log(l);
        if (err) {
          check(false, `harness error: ${err.message}`);
          console.log(err.stack);
        }
        break;
      }
    }
  } finally {
    await page.close();
  }
  const ok = results.length > 0 && results.every((r) => r.ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${tag}: ${results.filter((r) => r.ok).length}/${results.length}`);
}

try {
  if (which === 'all' || which === 'desktop') await device(false);
  if (which === 'all' || which === 'phone') await device(true);
} finally {
  await browser.close();
}
const ok = allResults.length > 0 && allResults.every(Boolean);
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
