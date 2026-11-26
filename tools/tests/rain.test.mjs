// The rain clock (N8, docs/summer-design.md 2.2) and the Course.rain(on) zone beat: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import './ts-register.mjs';

const { LevelBuilder, mergeRules, defaultRules, MIN_RAIN_WARN } = await import('../../src/level.ts');
const { Course } = await import('../../src/levels.ts');
const { washAt, overlapsRain } = await import('../../src/mechanics/rain.ts');
const { mulberry32 } = await import('../../src/rng.ts');

test('one wash clock: wet for hold, running (still solid) for warn, then gone', () => {
  const c = { hold: 0.7, warn: 1.1 };
  assert.equal(washAt(0, c).stage, 'wet');
  assert.equal(washAt(0.69, c).stage, 'wet');
  assert.equal(washAt(0.7, c).stage, 'running');
  assert.ok(Math.abs(washAt(1.25, c).k - 0.5) < 1e-9);
  assert.equal(washAt(1.79, c).stage, 'running');
  assert.equal(washAt(1.8, c).stage, 'gone');
});

test('the warning is never shorter than 1 s', () => {
  assert.equal(MIN_RAIN_WARN, 1);
  assert.equal(mergeRules(defaultRules(), { rain: { hold: 0.2, warn: 0.3 } }).rain.warn, 1);
  assert.equal(mergeRules(defaultRules(), { rain: true }).rain.warn, 1.1);
  assert.equal(mergeRules(defaultRules(), { rain: false }).rain, false);
});

test('a rain bridge carries you (hold + warn) x run speed: 540 / 660 / 672 u', () => {
  for (const [hold, warn, speed, want] of [[0.7, 1.1, 300, 540], [0.9, 1.1, 330, 660], [1.0, 1.1, 320, 672]]) {
    const r = mergeRules(defaultRules(), { runSpeed: speed, rain: { hold, warn } });
    assert.ok(Math.abs((r.rain.hold + r.rain.warn) * r.runSpeed - want) < 1e-9);
  }
});

test('Course.rain(on) records zones from the cursor; an open zone closes at the end', () => {
  const b = new LevelBuilder('t', 'T', '試', 'summer', 1).rules({ rain: { hold: 0.7, warn: 1.1 } });
  const c = new Course(b, 520, mulberry32(1));
  c.run(1000).rain(true).run(800).rain(false).run(500).rain(true).run(400);
  const L = c.end('summer');
  assert.deepEqual(L.rainZones[0], [1000, 1800]);
  assert.equal(L.rainZones[1][0], 2300);
  assert.equal(L.rainZones[1][1], L.length);
  assert.equal(overlapsRain(L, L.rules, 1700, 1900), true);
  assert.equal(overlapsRain(L, L.rules, 1900, 2200), false);
  // a dry scroll never rains, whatever zones say
  const d = new LevelBuilder('d', 'D', '試', 'summer', 1);
  const dc = new Course(d, 520, mulberry32(1));
  dc.run(500).rain(true).run(500);
  const DL = dc.end('summer');
  assert.equal(overlapsRain(DL, DL.rules, 600, 700), false);
});
