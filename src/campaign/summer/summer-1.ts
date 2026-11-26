/**
 * summer-1 起 迎 The Welcoming Fire: the final-draft greybox of docs/summer-design.md section 3.1.
 *
 * Teaches one thing: paint a closed ring, then a second one; run into one and you come out of the other.
 * Dusk on the first evening of Obon in a riverside village. Purple is the only ink. Her pre-painted pair (K0)
 * shows the move once before any text; the one hint comes after it; the traced rings at K1 are shapes, not text.
 *
 *   K0  her door: a blot pillar at 900, her rings carry you through (not counted)
 *   L1  lantern 1540
 *   K1  the first wall: blot pillar 1920-2080, traced rings at 1880 and 2170; hint 2380 (design: 1620, see below)
 *   K2  two walls and a courtyard: pillars 2680-2820 and 3120-3260 (one pair across both)
 *   L2  lantern 3800
 *   K3  the first chasm: gap 4120-4680 (the first beat that can kill)
 *   K4  the ledge: a 320 wall at 5280, ledge at y 200 (exits can float)
 *   L3  lantern 6020
 *   K5  the exam, The Moon Door: pillar 6300-6440 straight into a 480 gap down to the low bank at y 360
 *       torii 8280, length 9040; par 43.6 s, par ink 246, 7 obstacles
 *
 * Every x above is checked by the cursor trace in the comments below (Course: lantern() advances 120 with the
 * lantern at +40; pillar(w) advances w; end() puts the torii 560 on and runs 760 past it).
 *
 * Moved against the design's x (critic round 1):
 *  - The ring hint sits over the courtyard between the K1 and K2 walls (centre 2380, 240 u up), not at 1620. At 1620
 *    it was already on screen during K0 (before the player went through her rings), half of it had scrolled off by
 *    the time a traveler stood stopped at the K1 wall, and its glyph sat under the HUD ink bar. At 2380 it is fully
 *    in view (desktop and phone) for a traveler stopped at 1907; on desktop its glyph and first words already peek in
 *    at the right edge just after her exit ring (x 1080 on), so it still comes after her rings; its 520 u of text fits between the walls (2080 and 2680). 240 u up keeps the glyph below the ink
 *    bar; the lantern-line run that hung over that courtyard (posts 2140-2560, rope 250 u up) is left out so the
 *    rope never crosses the text.
 *
 * Engine stand-ins (each listed for the engine / render owners, see the scroll builder's report):
 *  - The guide lantern (story device 1) is not in the engine yet: the festival line runs the whole road, but
 *    nothing slides along it.
 *  - The welcoming-fire dishes (迎え火), the white first-Obon lantern at the gate and the cucumber horse and
 *    eggplant cow have no DecorKind yet: the village is the summer theme's ordinary scatter.
 *  - "The lantern line lights toward the torii in one cascade" (K5): festoons light as the traveler nears them,
 *    so the line past the gorge is its own festoon segment and lights progressively, not in one sweep.
 *  - "The moon clears the hills" (K5): a sky change from dusk to the moon sky (2.2 s cross-fade), not a moonrise.
 */
import { LevelBuilder, type Level } from '../../level';
import { Course } from '../../levels';
import { mulberry32 } from '../../rng';
import type { CampaignScroll } from '../data';

export const SEED = 801;

/** The story line in the opening spot (docs/story.md section 6): it never teaches. */
export const STORY_1 = 'Her first Obon. Ren hung a white lantern for her.';
/** The one teaching hint (docs/summer-design.md 3.1), after the player has gone through her rings at K0. */
export const HINT_RING = 'Paint two rings. Run into one, out of the other.';

/** Text spots sit above the festival rope (posts 250 u tall) and below the top of the view (440 u above the feet). */
const TEXT_UP = 280;
/** The ring hint has no rope under it, so it sits lower: its glyph's top (about 376 u up) clears the HUD ink bar. */
const HINT_UP = 240;
/** One pair of R 50 rings: 2 x 314 u of stroke at 0.065 ink per u (design 0.4). */
const PAIR_INK = 41;

export default function build(s: CampaignScroll): Level {
  const b = new LevelBuilder(s.id, s.name, '迎', 'summer', SEED).rules({
    runSpeed: 290,
    inkMax: 100,
    inkRegen: 26, // 32 before Zach's 2026-10-11 retune (0.8x)
    slowScale: 0.1,
    slowmoDrain: 3,
    inks: ['murasaki'],
    camLead: 0.22,
    rain: false,
    portalSpan: Infinity,
  });
  const c = new Course(b, 520, mulberry32(SEED));
  c.sky('dusk');

  // ── the village at dusk: the story line, then the festival line leaves the gate where Ren hung her lantern.
  // The line is broken into runs between the walls and gaps (posts every 420 u; a rope never crosses a blot
  // pillar): the blot has eaten the line wherever it stands.
  // (the text sits 280 u up, not the usual 230: the lantern-line rope hangs 250 u up and would cross a lower line;
  // and at x 560, not 420, so the glyph clears the ink bar while the view rests on the scroll's start)
  c.hint(560, TEXT_UP, STORY_1, '迎');
  festoons(c, [
    [340, 1],
    [1060, 1],
    // (no run over the K1-K2 courtyard, 2080-2680: the ring hint hangs there)
    [3320, 1],
    [4700, 1],
    [5320, 2],
  ]);
  c.run(900); //                                                         0 → 900

  // ── K0 her door (not counted): her pre-painted pair carries the traveler through a blot pillar, the move shown
  // once, safely, before any text. A (840, 475) and B (1080, 475), both 45 u above the road.
  c.beat('K0 her door', { ink: 0 });
  c.herRings({ dx: -60, above: 45 }, { dx: 180, above: 45 });
  c.pillar(100, { count: false }); //                                    pillar 900-1000
  c.run(500).lantern().run(300); //                                      L1 @1540 → 1920

  // ── K1 the first wall: a pillar far taller than the view. No way to die. Traced rings show where a pair goes.
  c.beat('K1 the first wall', { ink: PAIR_INK });
  c.sketch(-40, 45, 50).sketch(250, 45, 50); //                          traced rings at 1880 and 2170
  c.pillar(160); //                                                      pillar 1920-2080
  // the one hint, read after her rings: over the courtyard past the wall, in full view of a traveler stopped at it
  c.hint(300, HINT_UP, HINT_RING, '紫'); //                              hint @2380
  c.run(600); //                                                         → 2680

  // ── K2 two walls and a courtyard: the first lesson in reach. One pair across both (A ~2600, B ~3330).
  c.beat('K2 two walls', { ink: PAIR_INK });
  c.pillar(140).run(300).pillar(140); //                                 pillars 2680-2820, 3120-3260
  c.run(500).lantern().run(240); //                                      L2 @3800 → 4120

  // ── K3 the first chasm, 320 u after a lantern: A ~4060 on the near ground, B ~4760 on the far ground.
  c.beat('K3 the first chasm', { ink: PAIR_INK });
  c.gap(560); //                                                         gap 4120-4680
  c.run(600); //                                                         → 5280

  // ── K4 the ledge: exits can float. A at the wall's foot (~5220), B just above the ledge (~(5340, 155)).
  c.beat('K4 the ledge', { ink: PAIR_INK });
  c.up(320).run(700); //                                                 wall @5280, ledge y 200 → 5980
  c.lantern().run(200); //                                               L3 @6020 → 6300

  // ── K5 the exam and the set piece, The Moon Door: a pillar straight into a 480 gap down to the low far bank.
  // One door chosen with intent: A before the pillar (~(6240, 155)), B on the low bank (~(7000, 315)).
  // Leaving B: the first firework of the night blooms over the far bank, the moon comes up, and the lantern
  // line toward the torii lights.
  c.beat('K5 the Moon Door', { ink: PAIR_INK });
  c.pillar(140).gap(480, 160); //                                        pillar 6300-6440; gap 6440-6920, far y 360
  // the set piece fires 70 u onto the bank (x 6990; the intended exit puts the traveler out at about 6991), not
  // at its edge: a traveler who hits the bank's face dies below x 6920 and keeps the firework and the moonrise for
  // the retry (festival triggers fire once by x and are not re-armed on respawn)
  c.hanabi(70, 'first').sky('moon', 70); //                              @6990
  c.festoon(20, 20 + 420 * 3); //                                        the line to the torii, 6940-8200
  c.run(800); //                                                         → 7720

  return c.end('summer'); //                                             torii @8280, length 9040
}

/** Lantern-line runs on posts 420 u apart: each entry is [world x of the first post, number of spans]. */
function festoons(c: Course, runs: [number, number][]) {
  for (const [x0, spans] of runs) c.festoon(x0 - c.x, x0 - c.x + 420 * spans);
}
