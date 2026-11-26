// Usage: flock /tmp/inkrunner-browser.lock node tools/routes/summer-3.mjs [desktop|phone|both] [runs=3] [ren|kohaku|both]
//        (env URL, VERBOSE=1)
// 転 summer-3 "The Evening Storm": the INTENDED line of docs/summer-design.md 3.3, played with real input (mouse and
// keyboard at 1600x900, one-finger touch on an iPhone 13 in landscape), as Ren and as Kohaku. Passes when every
// run finishes at Bamboo or better. Exits 1 otherwise.
//
// Ground: y 520 until the R3 wall (4540), the ledge y 220 until 5040, then y 280 to the torii (13180).
// Rain zones 2420-6500 and 7820-12020: a vermilion stroke there holds 0.7 + 1.1 s from brush lift (540 u of run).
//
// Two things the numbers below are built on (measured in the game, not the design's estimate):
//  - the camera trails its target, so at full run the view ends about 850 u ahead of the traveler on desktop
//    (about 1,050 on the phone). Every far ring is painted only once its rim is on screen at 1600x900.
//  - a moving traveler is caught when their body box (26 x 58) meets 0.8 x R of a ring: for R 50 that is
//    13 + 40 = 53 u before its centre. The ring that COMPLETES a pair never grabs someone already inside it,
//    so each entry ring is painted first, as the waiting ring, and the exit second, well before the catch.
import { line, proveRoute } from './lib.mjs';

const which = process.argv[2] ?? 'both';
const runs = Number(process.argv[3] ?? 3);
const who = process.argv[4] ?? 'both';

// a vermilion bridge at ground y `gy` from x0 to x1 (10 u under the lip, so the traveler steps down onto it)
const bridge = (x0, x1, gy) => line(x0, gy + 10, x1, gy + 10, Math.max(8, Math.round((x1 - x0) / 25)));

// Inks are picked a beat before each stroke (a key, or a tap on the stone on the phone): a phone tap and the touch
// stroke after it cost about 75 u of run, so nothing below depends on a stroke landing faster than that.
export const plan = [
  // R1, the "before" picture (dry gap 1300-1800): the bridge you know, painted as early as the far lip shows.
  { at: 1080, ink: 'shu', paint: bridge(1240, 1860, 520) },

  // R2, the twist (rain gap 2920-3620): A just past the near lip first (it waits), then B on the far ground once its
  // rim is on screen. 660 apart, inside the 800 reach. A bridge from the lip would wash 160 u short.
  { at: 2500, ink: 'murasaki' },
  { at: 2600, ring: [2990, 478, 50] },
  { at: 2850, ring: [3650, 470, 50] },

  // R3, a 300 wall at 4540 in rain: a ramp painted just before it. The climb (about 1.3 s) beats the 1.8 s wash.
  // It must be above the lip (y 220) before the traveler's front (x + 13) meets the wall: a step-up is only 22 u.
  // It meets the ground about 150 u ahead of the brush-down, so a slow phone stroke still lands in front of the feet.
  { at: 4000, ink: 'shu' },
  { at: 4100, ink: 'shu', paint: line(4230, 540, 4520, 190, 18) },

  // R4, gap 5040-5680 dropping to y 280, a yokai on the landing (5800, 210 +-30): A just off the ledge lip (waits),
  // then B on the far ground short of the yokai (its disc must not touch it, or it fizzles), then once the yokai is
  // on screen a gold slash through it, all before the traveler reaches A. 600 apart.
  { at: 4600, ink: 'murasaki' },
  { at: 4700, ring: [5100, 212, 50] },
  { at: 4905, ring: [5700, 232, 50] },
  { at: 4915, ink: 'kin' },
  { at: 4968, ink: 'kin', paint: line(5795, 150, 5805, 270, 6) },

  // R5, under the eaves (dry gap 6800-7300, ground y 280): a bridge painted early. It is dry, so it holds.
  { at: 6400, ink: 'shu' },
  { at: 6560, ink: 'shu', paint: bridge(6730, 7370, 280) },

  // R6, Bridges in the Rain: three 380 gaps (8120-8500, 8660-9040, 9200-9580), each bridged at its own edge.
  { at: 8065, ink: 'shu', paint: bridge(8095, 8530, 280) },
  { at: 8600, ink: 'shu', paint: bridge(8635, 9070, 280) },
  { at: 9140, ink: 'shu', paint: bridge(9175, 9610, 280) },

  // R7, the exam: a pair over the 640 (10300-10940; doors close behind you), then a LATE bridge over the 420
  // (11200-11620), painted within about 70 u of its edge so it is still solid at the far lip.
  { at: 9900, ink: 'murasaki' },
  { at: 10000, ring: [10360, 232, 50] },
  { at: 10175, ring: [10970, 232, 50] },
  { at: 10990, ink: 'shu' },
  { at: 11135, ink: 'shu', paint: bridge(11170, 11650, 280) },
];

if (import.meta.url === `file://${process.argv[1]}`) {
  const devices = which === 'both' ? ['desktop', 'phone'] : [which];
  const chars = who === 'both' ? ['ren', 'kohaku'] : [who];
  let ok = true;
  for (const char of chars) {
    console.log(`── summer-3 as ${char}`);
    ok = (await proveRoute({ name: `summer-3-${char}`, level: 'summer-3', char, plan, devices, runs, verbose: process.env.VERBOSE === '1' })) && ok;
  }
  console.log(ok ? `ALL PASS: summer-3 as ${chars.join(' and ')} on ${devices.join(' and ')}` : 'FAIL: summer-3');
  process.exit(ok ? 0 : 1);
}
