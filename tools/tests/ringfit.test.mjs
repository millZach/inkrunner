// The 紫 ring gesture's tolerance (docs/summer-design.md 1.1): hand-drawn rings close, arcs and hooks do not. npm test
// Zach (2026-10-11) found rings too hard to draw; these shapes are the ones the first tolerance refused.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import './ts-register.mjs';

const { RingTracker, shapeFail } = await import('../../src/mechanics/ringfit.ts');
const { DEFAULT_TUNING } = await import('../../src/mechanics/portals.ts');

let seed = 1;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

/** A hand-like stroke: radius by angle (oval, egg, wobble), `sweep` degrees from the top, clockwise, with jitter. */
function stroke({ R = 60, sweep = 360, rx = 1, ry = 1, wob = 0, egg = 0, jit = 1.5 }) {
  const pts = [];
  const ph = rnd() * 6;
  const n = Math.ceil((2 * Math.PI * R * sweep) / 360 / 4);
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + ((i / n) * sweep * Math.PI) / 180;
    const r = R * (1 + wob * Math.sin(3 * a + ph) + egg * Math.cos(a));
    pts.push({ x: r * rx * Math.cos(a) + (rnd() - 0.5) * 2 * jit, y: r * ry * Math.sin(a) + (rnd() - 0.5) * 2 * jit });
  }
  return pts;
}

/** What the game decides at brush lift: 'ring', or why not. */
function verdict(pts) {
  const { closeDist, closeAngle, closeScale } = DEFAULT_TUNING;
  const tr = new RingTracker({ closeDist, closeAngle, closeScale });
  for (const p of pts) tr.feed(p);
  if (!tr.loop && !tr.closeOnLift()) return 'open';
  return shapeFail(tr.loop) ?? 'ring';
}

const RINGS = {
  'circle stopped at 290°': { sweep: 290 },
  'big circle stopped at 320°': { R: 100, sweep: 320 },
  'oval 2.5 to 1': { rx: 1.55, ry: 0.62 },
  'wobbly circle stopped at 315°': { wob: 0.15, sweep: 315 },
  'lopsided egg stopped at 320°': { egg: 0.25, wob: 0.1, sweep: 320 },
  'full circle': {},
};
const NOT_RINGS = { 'half circle': { sweep: 180 }, 'a C': { sweep: 240 } };

for (const [name, shape] of Object.entries(RINGS)) {
  test(`${name} makes a ring`, () => {
    for (let i = 0; i < 10; i++) {
      seed = 100 + i * 77;
      assert.equal(verdict(stroke(shape)), 'ring', `try ${i}`);
    }
  });
}

for (const [name, shape] of Object.entries(NOT_RINGS)) {
  test(`${name} stays open`, () => {
    for (let i = 0; i < 10; i++) {
      seed = 100 + i * 77;
      assert.equal(verdict(stroke(shape)), 'open', `try ${i}`);
    }
  });
}

test('a ring closed at lift is centred where it was drawn', () => {
  seed = 5;
  const tr = new RingTracker({ closeDist: 60, closeAngle: 280, closeScale: 0.6 });
  for (const p of stroke({ R: 80, sweep: 285, jit: 0 })) tr.feed(p);
  assert.equal(tr.loop, null);
  assert.equal(tr.closeOnLift(), true);
  assert.ok(Math.hypot(tr.loop.cx, tr.loop.cy) < 4, `centre ${tr.loop.cx.toFixed(1)}, ${tr.loop.cy.toFixed(1)}`);
  assert.ok(Math.abs(tr.loop.r - 80) < 3, `r ${tr.loop.r.toFixed(1)}`);
});
