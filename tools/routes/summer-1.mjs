// Usage: flock /tmp/inkrunner-browser.lock node tools/routes/summer-1.mjs [desktop|phone|both] [runs=3] [ren|kohaku|both]
//        (env URL, VERBOSE=1, ALTS=0 skips the alternative lines, ALTS=only runs just them, STRICT=1 counts every
//        alternative in the exit status)
// summer-1 起 迎 The Welcoming Fire: the INTENDED line of docs/summer-design.md 3.1, played with real input (mouse and
// keyboard at 1600x900; one finger on an iPhone 13 in landscape), as Ren and as Kohaku. Passes when every run
// finishes at Bamboo or better. Then the design's alternative lines a first-time player is likely to take, once per
// traveler and device; each should also finish at Bamboo or better.
// Exit status: 1 if the intended line fails, or an alternative fails that does not wait on a named engine change.
// An alternative that waits on one (its `needs` below) is still played and its FAIL printed plainly, with the change
// it waits on; it counts in the exit status under STRICT=1 or ALTS=only.
//
// Intended: every beat is one pair, painted A (the entry) first and B (the exit) second, while the traveler runs:
//   K0  her rings carry you (nothing to do)
//   K1  trace the master's sketches: A (1880, 475), B (2170, 475)
//   K2  one pair across both walls: A before wall 1 (2625, 475), B past wall 2 (3310, 475)
//   K3  the chasm: A at the lip (4095, 485), B on the far ground (4740, 475); A hangs over the edge, so a late hand
//       still catches a traveler who has just run off it
//   K4  the ledge: A at the wall's foot (5220, 475), B floating just above the ledge (5340, 155)
//   K5  the Moon Door: A before the pillar (6250, 155), B on the low far bank (6980, 315)
// Each trigger is where B's rim is inside a 16:9 view (camLead 0.22: the view reaches about 920 u ahead of a
// running traveler on desktop, more on the wider phone view).
//
// Alternatives (the rest of each run is the intended line):
//   K1 B first, then A around yourself: stop against the wall, paint the exit past it, then a ring around the stopped
//       traveler (design K1 Alt 1, in the order a first-time player often paints it). Needs the stopped traveler to
//       be carried by whichever ring completes the pair (src/mechanics/portals.ts link(), rule 4).
//   K2 two pairs: one pair per wall, the second painted right after leaving the first (design K2 Alt). Needs the
//       second pair to start clean (src/mechanics/portals.ts partnerFor()).
//   K3 A below the lip: run off the edge into an entry hung just below it (design K3 Alt 2), a late hand's line.
//   K4 B first, then A around yourself: the K1 trap again, at the ledge wall (the critic's phone play).
import { launch, runRoute, proveRoute, bambooOrBetter } from './lib.mjs';

const which = process.argv[2] ?? 'both';
const runs = Number(process.argv[3] ?? 3);
const chars = (process.argv[4] ?? process.env.CHAR ?? 'both') === 'both' ? ['ren', 'kohaku'] : [process.argv[4] ?? process.env.CHAR];
const ALTS = process.env.ALTS ?? '1';

/** A pair: entry ring A, then exit ring B, both painted once the traveler reaches `at`. Rings are [cx, cy, r]. */
const pair = (at, a, b) => [
  { at, ring: a },
  { at, ring: b },
];

const K1 = pair(1700, [1880, 475, 50], [2170, 475, 50]); // the first wall (pillar 1920-2080)
const K2 = pair(2540, [2625, 475, 50], [3310, 475, 45]); // two walls (pillars 2680-2820, 3120-3260): 685 apart
const K3 = pair(3965, [4095, 485, 50], [4740, 475, 45]); // the first chasm (gap 4120-4680): 645 apart
const K4 = pair(5000, [5220, 475, 50], [5340, 155, 45]); // the ledge (wall 5280, ledge y 200)
const K5 = pair(6210, [6250, 155, 50], [6980, 315, 45]); // the Moon Door (pillar 6300-6440, gap 6440-6920 to y 360)

export const plan = [...K1, ...K2, ...K3, ...K4, ...K5];

/** Engine changes some alternatives wait on (each was handed to the portal owner with an exact diff). */
const RULE4 = 'src/mechanics/portals.ts link() rule 4 must not hold out a stopped traveler';
const RULE2 = 'src/mechanics/portals.ts travelerLeft() must close the pair just used, not exit.partner';
/** Which alternatives wait on which engine change. */
export const needs = {
  'K1 B first, then A around yourself': RULE4,
  'K2 two pairs': RULE2,
  'K4 B first, then A around yourself': RULE4,
};

/** The design's alternative lines, each a whole run (only its beat differs from the intended line). */
export const alts = {
  // stopped at the wall (x 1907): B past it first, then A around yourself on the near sketch
  'K1 B first, then A around yourself': [
    { at: 1890, wait: 700 },
    { at: 1890, ring: [2170, 475, 50] },
    { at: 1890, ring: [1880, 475, 50] },
    ...K2,
    ...K3,
    ...K4,
    ...K5,
  ],
  // one pair over wall 1, then (just out of its exit at 2900) a second pair over wall 2
  'K2 two pairs': [...K1, ...pair(2540, [2630, 475, 50], [2900, 475, 50]), ...pair(2900, [3060, 475, 50], [3340, 475, 45]), ...K3, ...K4, ...K5],
  // A hung below the lip, its centre 55 u past the edge so its disc clears the rock corner (4120, 520)
  'K3 A below the lip': [...K1, ...K2, ...pair(3965, [4175, 560, 45], [4740, 475, 45]), ...K4, ...K5],
  // stopped at the ledge wall (x 5267): B above the ledge first, then A around yourself
  'K4 B first, then A around yourself': [
    ...K1,
    ...K2,
    ...K3,
    { at: 5255, wait: 700 },
    { at: 5255, ring: [5340, 155, 45] },
    { at: 5255, ring: [5245, 475, 50] },
    ...K5,
  ],
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const devices = which === 'both' ? ['desktop', 'phone'] : [which];
  let ok = true;
  if (ALTS !== 'only') {
    for (const char of chars) {
      const pass = await proveRoute({ name: `summer-1-${char}`, level: 'summer-1', char, plan, devices, runs, verbose: process.env.VERBOSE === '1' });
      ok &&= pass;
    }
    console.log(ok ? `ROUTE PASS summer-1 intended line: ${chars.join(' and ')}, ${runs} of ${runs} at Bamboo or better on ${devices.join(' and ')}` : 'ROUTE FAIL summer-1 intended line');
  }
  if (ALTS !== '0') {
    const STRICT = process.env.STRICT === '1' || ALTS === 'only';
    let altOk = true;
    let altAll = 0;
    let altPass = 0;
    const blocked = [];
    const browser = await launch();
    try {
      for (const [name, altPlan] of Object.entries(alts)) {
        for (const char of chars) {
          for (const device of devices) {
            // a stranded traveler never finishes: give up after 75 s instead of the default 200
            const r = await runRoute({ level: 'summer-1', char, device, plan: altPlan, browser, timeout: 75000, verbose: process.env.VERBOSE === '1' });
            const pass = bambooOrBetter(r);
            altAll++;
            if (pass) altPass++;
            else if (needs[name] && !STRICT) blocked.push(`${name} (${char} ${device})`);
            else altOk = false;
            const at = r.log.length ? r.log[r.log.length - 1] : '';
            const wait = !pass && needs[name] ? ` [waits on engine change: ${needs[name]}]` : '';
            console.log(`${pass ? 'PASS' : 'FAIL'} alt "${name}" ${char} ${device}: ${r.finished ? 'finished' : 'DID NOT FINISH'} grade ${r.gradeName ?? '-'} time ${r.time.toFixed(1)}s falls ${r.falls} ink ${r.ink.toFixed(0)} steps ${r.steps}${pass ? '' : ` (last: ${at})`}${wait}`);
            if (r.errors.length) console.log('  page errors:\n  ' + r.errors.join('\n  '));
          }
        }
      }
    } finally {
      await browser.close();
    }
    console.log(`ALTS summer-1: ${altPass} of ${altAll} alternative runs finished at Bamboo or better`);
    if (blocked.length) console.log(`ALTS WAITING ON ENGINE (not in the exit status; STRICT=1 counts them): ${blocked.join('; ')}`);
    console.log(altOk ? (blocked.length ? 'ALTS PASS summer-1 apart from the engine-blocked runs above' : 'ALTS PASS summer-1: every alternative line finished at Bamboo or better') : 'ALTS FAIL summer-1');
    ok &&= altOk;
  }
  process.exit(ok ? 0 : 1);
}
