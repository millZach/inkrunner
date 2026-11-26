// Telegraphed strikes (N6): triggers, the stuck pause and the spark's fall: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import './ts-register.mjs';

const { strikeTrigger, teleStep, sparkFall, SPARK_DROP } = await import('../../src/mechanics/strikes.ts');
const { LevelBuilder } = await import('../../src/level.ts');
const { Course } = await import('../../src/levels.ts');
const { mulberry32 } = await import('../../src/rng.ts');

test('a full-speed traveler reaches the mark at impact (or landsEarly s after it)', () => {
  assert.equal(strikeTrigger(2000, 310, 1.5), 2000 - 465);
  assert.equal(strikeTrigger(2000, 300, 1.2, 1), 2000 - 660);
  assert.equal(strikeTrigger(2000, 300, 0.5), 2000 - 300, 'telegraphs are never under 1 s');
});

test('the telegraph clock pauses while stuck with the mark ahead (never for loops or a mark behind)', () => {
  assert.equal(teleStep(0.5, 0.1, true, true), 0.5);
  assert.equal(teleStep(0.5, 0.1, false, true), 0.6);
  assert.ok(Math.abs(teleStep(0.5, 0.1, true, false) - 0.6) < 1e-12);
  assert.ok(Math.abs(teleStep(0.5, 0.1, true, true, true) - 0.6) < 1e-12);
  // stuck for a while: the time from telegraph to impact only grows
  let el = 0;
  let t = 0;
  while (el < 1.5) {
    el = teleStep(el, 1 / 60, t > 0.4 && t < 1.4, true);
    t += 1 / 60;
  }
  assert.ok(t >= 2.5 - 1e-6, `impact after ${t.toFixed(3)} s`);
});

test('the spark falls 600 u over its telegraph and lands at T', () => {
  assert.equal(sparkFall(0, 1.5), SPARK_DROP);
  assert.equal(sparkFall(0.75, 1.5), 300);
  assert.equal(sparkFall(1.5, 1.5), 0);
  assert.ok(sparkFall(1.6, 1.5) < 0, 'past T it is below the mark (so it lands)');
});

test('Course.spark / bolt place the mark, trigger and loop from the cursor', () => {
  const b = new LevelBuilder('t', 'T', '試', 'summer', 1).rules({ runSpeed: 310 });
  const c = new Course(b, 520, mulberry32(1));
  c.run(1000).spark(250, { landsEarly: 1.0 }).run(1200).spark(-260, { loop: 2.2, after: -200 }).bolt(300).run(1500);
  const L = c.end('summer');
  const [demo, loop, bolt] = L.strikes;
  assert.equal(demo.mark, 1250);
  assert.ok(Math.abs(demo.trigger - (1250 - 310 * 2.5)) < 1e-9);
  assert.equal(loop.mark, 1940);
  assert.equal(loop.trigger, 2000);
  assert.equal(loop.loop, 2.2);
  assert.equal(bolt.kind, 'bolt');
  assert.equal(bolt.tele, 1.2);
  assert.ok(Math.abs(bolt.trigger - (2500 - 310 * 1.2)) < 1e-9);
  assert.ok(Math.abs(bolt.groundY - 520) < 10, 'ground read under the mark');
  assert.equal(L.course.strikes, 1);
});
