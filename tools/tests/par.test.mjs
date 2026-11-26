// Par time and par ink follow each scroll's rules and counts (N1), and the rules additions (N2): npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import './ts-register.mjs';

const { LevelBuilder, defaultRules, mergeRules } = await import('../../src/level.ts');
const { Course, levelList, parOf, PAR_STRIKE, PAR_TERRAIN, JUMP_AIR } = await import('../../src/levels.ts');
const { mulberry32 } = await import('../../src/rng.ts');
const { INK_COST } = await import('../../src/config.ts');

const course = (rules = {}) => {
  const b = new LevelBuilder('t', 'T', '試', 'summer', 1);
  b.rules(rules);
  return new Course(b, 520, mulberry32(1));
};

test('existing scrolls keep their par exactly', () => {
  const want = { first: [62, 250], snow: [59.058, 354], sea: [68.742, 458] };
  for (const info of levelList()) {
    const w = want[info.id];
    if (!w) continue;
    const L = info.build();
    assert.equal(Number(L.parTime.toFixed(3)), w[0], `${info.id} par time`);
    assert.equal(L.parInk, w[1], `${info.id} par ink`);
  }
});

test('par formula: length / runSpeed + 1.2 per terrain obstacle + 0.3 per strike + 4; ink 1.1 x net + 20', () => {
  assert.equal(PAR_TERRAIN, 1.2);
  assert.equal(PAR_STRIKE, 0.3);
  const p = parOf(9040, 290, 7, 0, 205.5, 0);
  assert.ok(Math.abs(p.parTime - (9040 / 290 + 8.4 + 4)) < 1e-9);
  assert.equal(p.parInk, Math.round(205.5 * 1.1 + 20));
  assert.equal(parOf(1000, 310, 0, 4, 100, 30).parInk, Math.round(70 * 1.1 + 20), 'echo refunds come off par ink');
  assert.ok(Math.abs(parOf(1000, 310, 0, 4, 0, 0).parTime - (1000 / 310 + 1.2 + 4)) < 1e-9);
});

test('par time divides by the scroll run speed', () => {
  const c = course({ runSpeed: 250 });
  c.run(2000);
  const L = c.end('summer');
  assert.ok(Math.abs(L.parTime - (L.length / 250 + 4)) < 1e-9);
});

test('a gap counts when wider than a flat jump (0.78 x run speed)', () => {
  assert.equal(JUMP_AIR, 0.78);
  const slow = course({ runSpeed: 290 }); // 226 u
  slow.run(500).gap(230).run(500);
  assert.equal(slow.end('summer').course.terrain, 1);
  const fast = course({ runSpeed: 330 }); // 257 u
  fast.run(500).gap(230).run(500);
  assert.equal(fast.end('summer').course.terrain, 0);
});

test('strikes count 0.3 s each; demos and loops do not count; the shortest telegraph is kept', () => {
  const c = course({ runSpeed: 300 });
  c.run(1000).spark(200).spark(500, { landsEarly: 1 }).spark(800, { loop: 2 }).bolt(900).run(1500);
  const L = c.end('summer');
  assert.equal(L.course.strikes, 2);
  assert.equal(L.course.minTele, 1.2);
  assert.ok(Math.abs(L.parTime - (L.length / 300 + 2 * 0.3 + 4)) < 1e-9);
  assert.equal(L.strikes.length, 4);
});

test('beat() records each beat; its ink overrides the primitives; refunds come off par ink', () => {
  const c = course({ runSpeed: 300 });
  c.run(600).beat('K1', { ink: 41 }).pillar(140).run(400).beat('S2', { ink: 61, refund: 15 }).gap(500).run(600);
  const L = c.end('summer');
  const k1 = L.course.beats.find((b) => b.label === 'K1');
  const s2 = L.course.beats.find((b) => b.label === 'S2');
  assert.equal(k1.label, 'K1');
  assert.equal(k1.ink, 41);
  assert.equal(s2.ink, 61);
  assert.equal(s2.refund, 15);
  assert.equal(L.parInk, Math.round((41 + 61 - 15) * 1.1 + 20));
  // without beat() the primitives' estimate is used (a 500 gap: 500 x 1.15 x INK_COST)
  const d = course({ runSpeed: 300 });
  d.run(600).gap(500).run(600);
  assert.equal(d.end('summer').parInk, Math.round(500 * 1.15 * INK_COST * 1.1 + 20));
});

test('rules: camLead defaults to the old 0.18; startInk must be offered', () => {
  const r = defaultRules();
  assert.equal(r.camLead, 0.18);
  assert.equal(r.startInk, undefined);
  assert.equal(mergeRules(r, { camLead: 0.22 }).camLead, 0.22);
  assert.equal(mergeRules(r, { camLead: 3 }).camLead, 0.45, 'clamped');
  const p = mergeRules(r, { inks: ['shu', 'ai', 'kin', 'murasaki'], startInk: 'murasaki' });
  assert.equal(p.startInk, 'murasaki');
  assert.equal(mergeRules(r, { inks: ['shu'], startInk: 'murasaki' }).startInk, undefined, 'an ink not offered falls back');
});
