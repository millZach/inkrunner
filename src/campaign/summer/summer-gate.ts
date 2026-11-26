/**
 * 門 summer-gate 雷 *Raijin's Gate* (docs/summer-design.md 3.5 and section 4): the final-draft greybox.
 *
 * Tests: his lightning is just another thing that goes through rings. Catch it and send it back until all eight
 * drums are clean. About 02:00, the storm's heart over the river mouth; the approach and phases 1 and 2 are wind
 * and thunder, phase 3 brings the downpour, and when the eighth drum is clean the rain stops dead, the cloud tears,
 * the moon comes out and the road runs on to a torii under it (src/mechanics/raijin.ts runs the fight, the loop,
 * the rain gate and the finish beat; this file only lays the road).
 *
 * Layout (x from the scroll's start; the road for a run that clears every phase on its first pass):
 *   0–1400      the ridge (y 260): the story line, the one hint (centred at 900, decor kept off it), Raijin paints
 *               himself in at 300 (a far flash)
 *   1400–2400   G1 the ridge gorge, 1,000 wide, dropping 240 to the arena road (y 500); a torn lantern string
 *               sags into it (its dip at (1540, 410) marks the optional Ridge Leap entry)
 *   2800–7300   P1 *Drums*: four singles (marks 3700, 5100, 5900, 6700), telegraph 1.6 s, 2 drums; lantern 4300
 *   7300–12200  P2 *The storm builds*: four pairs 192 u apart (8200, 9600, 10500, 11400), 1.3 s, 3 drums, he bobs
 *               ±70; gaps 9920–10340 and 10820–11240; lantern 8800
 *   12200–17400 P3 *Raijin descends*: four triplets 144 u apart (13100, 14500, 15500, 16500), 1.1 s, 3 drums, he
 *               sweeps 0.55–0.76 of the width and sits low; rain (a bridge carries 672 u); gaps 14920–15360 and
 *               15920–16360; lantern 13700
 *   17400–      the moonlit road to the torii (19,060)
 *
 * Deviation from the design's listing (3.5), all for the invisible wrap (4.5) and noted for the director:
 *   - The torii sits at 19,060, not 18,560: at the phase-3 wrap point (17,700) an iPhone in landscape sees about
 *     1,120 u ahead, so a torii at 18,560 would show before the wrap and vanish after it. 1,100 u of flat
 *     moonlit road instead of 600 (about 3.4 s more).
 *   - Rain is laid as the static zone 12,200–17,400 (the ramp and the wash rules read it), but Raijin gates it at
 *     run time (raijin.ts `gateRain`): parked until phase 2 is won (the phase-2 wrap would otherwise show rain
 *     ahead that is not there after the wrap), opened ahead of the view, widened behind the traveler so the
 *     phase-3 wrap shows rain on both sides, and parked again the instant the eighth drum is clean.
 *   - The arena's gaps (two per loop in P2 and P3) are laid by Course.arena(), which does not count them as
 *     terrain obstacles, so par time is 1 + 0 terrain (not the design's 5): see needs_from_others.
 *   - Open for the director: the strike groups right after each P2/P3 gap (marks 3200/4100, 3300/4300) start their
 *     telegraphs while the traveler is still over the gap (trigger = mark - 320 x tele lands inside it). The design's
 *     "never within 120 u of a gap's far edge" holds for the marks, not the triggers; holding it for the triggers
 *     needs the gaps moved (the marks cannot move far enough without landing a bolt in the next gap).
 */
import { LevelBuilder, type Level } from '../../level';
import { Course } from '../../levels';
import { mulberry32 } from '../../rng';
import type { CampaignScroll } from '../data';

export const SEED = 805;

/** The story's in-world line for this scroll (docs/story.md section 6), in the opening title spot. */
export const STORY_GATE = "Raijin's drums have drunk the blot.";
/** The only hint (the bolt was already shown in 結): docs/summer-design.md 3.5 and docs/story.md. */
export const HINT_GATE = 'Catch his lightning in a ring. Send it back.';

/** The hint's centre x, and how far either side of it the ridge is kept clear of decor (the line is about 480 u). */
const HINT_X = 900;
const HINT_CLEAR = 330;

/** The three phases (summer-design 4.4): x positions above are these offsets from each loop's start. */
type ArenaOpts = Parameters<Course['arena']>[1];
export const PHASES: Record<1 | 2 | 3, ArenaOpts> = {
  1: { length: 4500, pattern: 'single', tele: 1.6, hits: 2, marks: [900, 2300, 3100, 3900] },
  2: { length: 4900, pattern: 'pair', within: 0.6, tele: 1.3, hits: 3, bob: 70, sweep: [0.66, 0.74], marks: [900, 2300, 3200, 4100], gaps: [[2620, 420], [3520, 420]] },
  3: { length: 5200, pattern: 'triplet', within: 0.45, tele: 1.1, hits: 3, bob: 40, sweep: [0.55, 0.76], low: true, marks: [900, 2300, 3300, 4300], gaps: [[2720, 440], [3720, 440]] },
};

export default function build(s: CampaignScroll): Level {
  const b = new LevelBuilder(s.id, s.name, '雷', 'summer', SEED).rules({
    runSpeed: 320,
    inkMax: 100,
    inkRegen: 27, // 34 before Zach's 2026-10-11 retune (0.8x)
    slowScale: 0.13,
    slowmoDrain: 4,
    // two inks: two big stones on a phone. Gold has nothing to hit; Indigo would outrun the position-timed strikes
    inks: ['shu', 'murasaki'],
    startInk: 'murasaki',
    camLead: 0.22,
    // rain only in phase 3 (the zone below); a bridge there carries (1.0 + 1.1) x 320 = 672 u
    rain: { hold: 1.0, warn: 1.1, density: 1.4 },
    portalSpan: 650,
  });
  const c = new Course(b, 260, mulberry32(SEED));
  // the storm's heart: the darkest sky of the chapter; the moon comes out when the eighth drum is clean (raijin.ts)
  c.sky('storm-peak');

  // ── the approach on the ridge (y 260): the story line, the hint, and Raijin painting himself into the cloud
  c.beat('approach');
  c.hint(420, 230, STORY_GATE, '雷');
  // (low, where the storm grade is lightest, under his drum ring as he hangs over the ridge; centred at 900 so the
  //  line ends before the lantern string's post at 1240, and the ridge decor is kept off it: see the end)
  c.hint(HINT_X, 125, HINT_GATE);
  c.raijin(300).flash(300, { raijin: true });
  c.run(1400);

  // ── G1 the ridge gorge (1400–2400, 1,000 wide, dropping 240): a door at the lip, an exit in the air at the reach,
  //    a vermilion bridge from under the exit down to the bank (dry, so it holds). 41 + 32 = 73 ink.
  //    Alt: two pairs (82); Ren's two bridges (75 of 140); the expert Ridge Leap (an entry hung where the string
  //    sags, about (1540, 410), and an exit flicked 30° up: fall deeper, fly farther).
  c.beat('G1 ridge gorge (door, exit in the air, bridge down)', { ink: 73 });
  // a torn festival lantern string over the gorge: posts on both lips, sagging into it at the Ridge Leap entry
  // (the dip hangs 150 down, at (1540, 410), 50 higher than the design's 460 so the ring painted on it sits above
  //  the ink stones at the bottom of a phone's view. Checked with real input: entry (1540, 410) and an exit at
  //  (2100, 390) flicked 30° up land at 2,418-2,424, past the bank at 2,400, as Ren on desktop and Kohaku on a
  //  phone. Higher entries fall short: (1520, 395) lands in the gorge at 2,392-2,409)
  c.festoon(-160, 1160).dip(140, 150);
  c.gap(1000, 240); // → 2400, the arena road at y 500
  c.run(400); //       → 2800

  // ── P1 Drums (2800–7300): four singles, telegraph 1.6 s; catch one on its thread above head height and send it
  //    out of a window aimed at him. Two hits win it. Alt (survive, no score): a vermilion umbrella, a door past.
  c.beat('P1 single (catch ring + window)', { ink: 41, refund: 15 });
  c.beat('P1 single (catch ring + window)', { ink: 41, refund: 15 });
  c.arena(1, PHASES[1]);

  // ── P2 The storm builds (7300–12200): pairs 0.6 s apart. One big ring (R >= 120) between the two threads plus
  //    one window: two hits from one catch (69). Bridges over the two 420 gaps (31 each). Three hits win it.
  c.beat('P2 gap bridge', { ink: 31 });
  c.beat('P2 gap bridge', { ink: 31 });
  c.beat('P2 pair (move the door, keep the window)', { ink: 41, refund: 15 });
  c.beat('P2 pair (big ring + window: two hits)', { ink: 69, refund: 30 });
  c.arena(2, PHASES[2]);

  // ── P3 Raijin descends (12200–17400), in rain: triplets 0.45 s apart. A ring (R >= 90) between threads 1 and 2,
  //    a window, then a third ring on thread 3 (the used entry closes, the window stays): three hits from one
  //    triplet (77 gross, 32 net). Late bridges over the 440 gaps (a rain bridge carries 672). Three hits win it.
  c.rain(true);
  c.beat('P3 gap bridge (late, in rain)', { ink: 33 });
  c.beat('P3 gap bridge (late, in rain)', { ink: 33 });
  c.beat('P3 triplet (ring for two, window, ring for the third)', { ink: 77, refund: 45 });
  c.arena(3, PHASES[3]);
  c.rain(false);

  // ── the finish: the rain stops dead, the cloud tears, the moon comes out (raijin.ts); a moonlit road to the torii.
  //    (No positional sky change here: one at the wrap point would race the phase-3 wrap.)
  c.beat('the moonlit road');
  c.run(1100);
  const L = c.end('summer');
  // keep the ridge's scattered decor (bamboo, pines) off the hint line, so nothing runs through its words
  L.decor = L.decor.filter((d) => Math.abs(d.x - HINT_X) > HINT_CLEAR);
  return L;
}
