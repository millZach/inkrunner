// The one flash limiter (N19, docs/summer-design.md 2.4): npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import './ts-register.mjs';

const { FlashLimiter, MAX_FLASH_LUMA, MIN_FLASH_RAMP, FLASH_GAP, flashLimiter } = await import('../../src/mechanics/flash.ts');
const raijin = await import('../../src/mechanics/raijin.ts');

test('at most one flash per 4 s', () => {
  const f = new FlashLimiter();
  assert.equal(FLASH_GAP, 4);
  assert.equal(f.request(10), true);
  for (const t of [10.01, 11, 12.5, 13.99]) assert.equal(f.request(t), false, `a flash at ${t} s, ${t - 10} s after the last`);
  assert.equal(f.request(14), true);
});

test('never 3 full-screen changes in any 1 s window (noted swings count)', () => {
  const f = new FlashLimiter(0); // no gap: only the 1 s rule is left
  f.note(5);
  assert.equal(f.request(5.3), true);
  assert.equal(f.request(5.6), false, 'third change inside one second');
  assert.equal(f.request(6.31), true, 'the window has moved on');
  // brute force: whatever is asked, no granted or noted pair of events plus a third sits inside 1 s
  const g = new FlashLimiter(0);
  const granted = [];
  for (let t = 0; t < 20; t += 0.05) if (g.request(t)) granted.push(t);
  for (let i = 0; i + 2 < granted.length; i++) assert.ok(granted[i + 2] - granted[i] >= 1 - 1e-9, `three flashes in ${granted[i + 2] - granted[i]} s`);
});

test('a death or respawn (note) blocks a flash for the whole gap', () => {
  const f = new FlashLimiter();
  f.note(3);
  assert.equal(f.request(4), false);
  assert.equal(f.request(7), true);
});

test('every flash ramps in over at least 80 ms and never lifts luminance by more than 20 %', () => {
  const f = new FlashLimiter(4, 0.01); // asking for a faster ramp is not allowed
  assert.equal(MIN_FLASH_RAMP, 0.08);
  assert.ok(f.ramp >= 0.08);
  assert.ok(f.level(0.04) <= 0.5 + 1e-9, 'half way up at 40 ms');
  assert.equal(f.level(0.08), 1);
  assert.equal(f.level(-1), 0);
  assert.equal(MAX_FLASH_LUMA, 0.2);
  let peak = 0;
  for (let a = 0; a < 2; a += 0.001) for (const s of [0.2, 0.7, 1, 5]) peak = Math.max(peak, f.overlayAlpha(a, s));
  assert.ok(peak <= 0.2 + 1e-12, `overlay peak ${peak}`);
  // white at alpha a over a pixel of luminance L gives L + a(1 - L): the change is at most a
  for (const L of [0, 0.3, 0.9]) assert.ok(peak * (1 - L) <= 0.2 + 1e-12);
});

test('a strike group shares one flash', () => {
  const f = new FlashLimiter();
  assert.equal(f.requestGroup(1, 'g1'), true);
  assert.equal(f.requestGroup(1.4, 'g1'), false);
  assert.equal(f.requestGroup(1.9, 'g1'), false);
  assert.equal(f.booked().length, 1);
});

test('Raijin uses the one shared limiter (moved out of raijin.ts)', () => {
  assert.equal(raijin.flashLimiter, flashLimiter);
  assert.equal(raijin.FlashLimiter, FlashLimiter);
});

test('a group grant is the booking: asking again at once is refused (callers pass skyFlash booked: true)', () => {
  // the bug this guards: strikes.ts booked with requestGroup, then called skyFlash without { booked: true }, which
  // asked the limiter a second time, was refused, and so never drew the flash it had logged
  const f = new FlashLimiter();
  assert.equal(f.requestGroup(10, 'strike-1'), true);
  assert.equal(f.request(10), false);
});
