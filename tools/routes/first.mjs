// Usage: flock /tmp/inkrunner-browser.lock node tools/routes/first.mjs [desktop|phone|both] [runs=3]   (env URL, CHAR=ren, VERBOSE=1)
// The First Scroll's autoplay route (ported from `node tools/shot.mjs autoplay`), played with real input. Passes
// when every run finishes at Bamboo or better. Exits 1 otherwise.
import { line, proveRoute, zig } from './lib.mjs';

const which = process.argv[2] ?? 'both';
const runs = Number(process.argv[3] ?? 3);

export const plan = [
  { at: 1452, jump: 450 },
  { at: 2450, ink: 'shu', paint: line(2860, 552, 3500, 552, 26) },
  // (the old autoplay ramp ended 33 u under the ledge lip, more than a step up: it now ends above the lip)
  { at: 4100, ink: 'shu', paint: line(4180, 552, 4560, 290, 20) },
  { at: 6380, ink: 'ai', paint: line(6640, 566, 7100, 215, 22) },
  { at: 7330, ink: 'ai', paint: line(7700, 90, 7990, 140, 14) },
  { at: 8750, ink: 'kin', paint: zig(9140, 9330, 320, 470, 4) },
  { at: 8800, ink: 'kin', paint: line(9600, 320, 9780, 430, 10) },
  { at: 9700, ink: 'shu', paint: line(9890, 490, 10510, 510, 26) },
  { at: 9760, ink: 'kin', paint: zig(10080, 10300, 320, 460, 4) },
  { at: 10560, ink: 'ai', paint: line(10790, 350, 11130, 380, 16) },
  { at: 11000, ink: 'shu', paint: line(11060, 508, 11380, 272, 20) },
  // two strokes of gold, not four: with Zach's slower refill (2026-10-11) the trial's last bridge needs the ink
  { at: 11030, ink: 'kin', paint: zig(11470, 11650, 140, 250, 2) },
  { at: 11700, ink: 'kin', paint: line(11990, 160, 12170, 260, 10) },
  { at: 12150, ink: 'shu', paint: line(12400, 294, 13310, 524, 34) },
  { at: 12180, ink: 'kin', paint: zig(12770, 12930, 260, 440, 2) },
  { at: 13450, ink: 'ai', paint: line(13770, 380, 14070, 410, 14) },
];

if (import.meta.url === `file://${process.argv[1]}`) {
  const devices = which === 'both' ? ['desktop', 'phone'] : [which];
  const ok = await proveRoute({ name: 'first', level: 'first', char: process.env.CHAR ?? 'ren', plan, devices, runs, verbose: process.env.VERBOSE === '1' });
  process.exit(ok ? 0 : 1);
}
