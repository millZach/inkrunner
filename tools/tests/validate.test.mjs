// Ghost-ink payload validation must agree with the game's own ids: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHAR_IDS, INK_ORDER, INKS as INK_DEFS } from '../../src/config.ts';
import { CHARS, INKS, validate } from '../../server/validate.mjs';

const stroke = (k, n = 4) => ({ k, p: Array.from({ length: n * 3 }, (_, i) => (i % 3 === 2 ? 15 : 100 + i * 7)) });
const run = (over = {}) => ({
  level: 'summer-1',
  char: 'ren',
  time: 42.5,
  grade: '竹',
  strokes: [stroke('shu')],
  path: [120, 540, 150, 540, 180, 538],
  ...over,
});

test('validate.mjs ink set equals INK_ORDER in config.ts', () => {
  assert.deepEqual([...INKS].sort(), [...INK_ORDER].sort());
  assert.deepEqual(Object.keys(INK_DEFS).sort(), [...INK_ORDER].sort(), 'INKS and INK_ORDER in config.ts disagree');
});

test('validate.mjs character set equals CHAR_IDS in config.ts', () => {
  assert.deepEqual([...CHARS].sort(), [...CHAR_IDS].sort());
});

test('a baseline run validates', () => {
  assert.equal(validate(run()), null);
});

test('a run with purple strokes validates', () => {
  const strokes = [stroke('shu'), stroke('murasaki', 12), stroke('ai'), stroke('murasaki'), stroke('kin')];
  assert.equal(validate(run({ strokes })), null);
});

test('every ink in config.ts is accepted by the server', () => {
  for (const k of INK_ORDER) assert.equal(validate(run({ strokes: [stroke(k)] })), null, k);
});

test('every traveler in config.ts is accepted by the server', () => {
  for (const c of CHAR_IDS) assert.equal(validate(run({ char: c })), null, c);
});

test('an unknown ink is rejected', () => {
  assert.equal(validate(run({ strokes: [stroke('shu'), stroke('midori')] })), 'stroke');
  assert.equal(validate(run({ strokes: [stroke('Murasaki')] })), 'stroke');
});

test('an unknown traveler is rejected', () => {
  assert.equal(validate(run({ char: 'tsuru' })), 'char');
});
