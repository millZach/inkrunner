/**
 * 転 summer-3 雨 "The Evening Storm": final-draft greybox of docs/summer-design.md section 3.3.
 *
 * Teaches one thing: in rain, vermilion washes away and rings don't. A rain bridge carries you
 * (hold 0.7 + warn 1.1) x 300 = 540 u, so every rain beat is built on three facts: a bridge always clears a
 * 380 gap, clears a 420 only if painted within about 120 u of its edge, and never clears a 640 or a 700.
 *
 * Beats (x from the design's scratch cursor; the comments are the cursor after each line):
 *   R1 dry gap 500 @1300 (the "before" picture: the bridge you know)
 *   L1 2340 · RAIN ON 2420 · the hint @2620 · R2 gap 700 @2920 (the twist lands: a ring pair, 780 apart)
 *   L2 4160 · R3 wall 300 @4540 (a ramp painted just before the wall still works)
 *   R4 gap 640 @5040 dropping 60, a yokai on the landing (Gold, then a pair)
 *   L3 6220 · RAIN OFF 6500: the dry stall arcade 6500-7820 · R5 dry gap 500 @6800 (the old rules) · L4 7740
 *   RAIN ON 7820 · one flash @8020 shows Raijin's drums · R6 three 380 gaps 8120-9580 (Bridges in the Rain)
 *   L5 10020 · R7 gap 640 @10300 + a 420 gap @11200 (the exam) · RAIN OFF 12020 · torii 13180, length 13940
 *
 * Par 63.7 s (13,940 u at 300 u/s, 11 obstacles); par ink 403 (1.1 x 348 + 20). Each beat's ink is the
 * intended line's gross ink from the design, so tools/ramp.mjs reads the design's numbers (peak beat 72, R7).
 * One file per scroll so each scroll has one owner; src/campaign/summer/index.ts lists it.
 */
import { LevelBuilder, type Level } from '../../level';
import { Course } from '../../levels';
import { mulberry32 } from '../../rng';
import type { CampaignScroll } from '../data';

export const SEED = 803;

/** The story line in the opening spot (docs/story.md, per-scroll story). Never teaches. */
export const STORY_3 = 'Thunder upriver. The blot is in the clouds.';
/** The scroll's one hint (the only new idea), 300 u before R2, inside the first rain zone. */
export const HINT_RAIN = 'Rain washes vermilion away. Rings hold.';
/** The scroll's glyph: 雨 (rain). The map and stamp book keep the chapter beat 転 from data.ts. */
export const GLYPH_3 = '雨';
/**
 * Hints sit above the festival lantern line (its posts are 250 u tall): the glyph's top is 136 u over the hint's y
 * and the text 18 u under it, so 296 u over the road keeps both between the rope and the top of the view (440 u up).
 * At the design's 230-250 the text ran through the lanterns and did not read at phone size.
 */
const HINT_ABOVE = 296;

export default function build(s: CampaignScroll): Level {
  const b = new LevelBuilder(s.id, s.name, GLYPH_3, 'summer', SEED).rules({
    runSpeed: 300,
    inkMax: 100,
    inkRegen: 26, // 32 before Zach's 2026-10-11 retune (0.8x)
    slowScale: 0.12,
    slowmoDrain: 4,
    inks: ['shu', 'ai', 'kin', 'murasaki'],
    startInk: 'shu',
    camLead: 0.22,
    rain: { hold: 0.7, warn: 1.1 },
    portalSpan: 800,
  });
  const c = new Course(b, 520, mulberry32(SEED));

  // ~23:00. The scroll opens dry under the festival-night sky; the storm sky rolls in before the first rain.
  c.sky('night');
  c.sky('storm', 1500);
  // The festival lantern line runs 300-6400 (design), split at the R3 wall: a rope strung from the low road up to
  // the ledge dives through the traveler's head height and reads like a hazard at phone size.
  c.hint(420, HINT_ABOVE, STORY_3, GLYPH_3).festoon(300, 4440).festoon(4600, 6400).run(1300); //           0 → 1300  dry, clouds gathering

  // R1, the "before" picture: a dry 500 gap. Kohaku's best at 300 is 457 < 500, so everyone paints.
  c.beat('R1 dry gap (bridge)', { ink: 37 });
  c.gap(500).run(500); //                                                   gap 1300-1800 → 2300
  c.lantern(); //                                                           L1 @2340       → 2420

  // R2, the twist lands: in rain, a 700 gap. A single edge bridge washes 160 u short; a ring pair (780 apart) holds.
  c.rain(true).run(500); //                                                 RAIN ON @2420  → 2920
  c.hint(-300, HINT_ABOVE, HINT_RAIN, GLYPH_3); //                                 hint @2620
  c.beat('R2 rain gap 700 (ring pair)', { ink: 41 });
  c.gap(700).run(500); //                                                   gap 2920-3620  → 4120
  c.lantern().run(300); //                                                  L2 @4160       → 4540

  // R3, rain shortens vermilion, it doesn't ban it: a 300 wall (out of Kohaku's 276 reach). A ramp painted
  // just before the wall climbs in about 1.4 s, under the 1.8 s a rain stroke holds.
  c.beat('R3 rain wall 300 (late ramp)', { ink: 31 });
  c.up(300).run(500); //                                                    wall @4540, ledge y 220 → 5040

  // R4, rings plus an old ink: a 640 gap dropping 60, a yokai guarding the landing 70 u up. Gold it, then a pair.
  c.beat('R4 gap 640 + yokai (gold, pair)', { ink: 46 });
  c.gap(640, 60).yokai(120, 70, 30, 30).run(500); //                        gap 5040-5680 (far y 280); yokai 5800 → 6180
  c.lantern().run(200); //                                                  L3 @6220       → 6500

  // R5, under the eaves, the old rules: the dry stall arcade (decor only, no ceiling) and a dry 500 gap.
  // STAND-IN: the design's one arcade(1320) over 6500-7820 spans the R5 gap, and drawArcade (src/render/decor.ts)
  // drops a bay's roof to the gap floor (gy = BOTTOM), drawing giant black slabs. Until the renderer bridges gaps,
  // the eaves are laid on the two dry banks only (6500-6760 and 7320-7820); the rain zone is still off 6500-7820.
  c.rain(false).arcade(260).arcade(500, 820); //                             RAIN OFF @6500: eaves 6500-6760, 7320-7820
  c.beat('R5 dry gap under the eaves (bridge)', { ink: 37 });
  c.run(300).gap(500).run(400); //                                          gap 6800-7300  → 7700
  c.lantern(); //                                                           L4 @7740, under the last eave → 7820

  // R6, the set piece "Bridges in the Rain": out of the arcade, one flash shows Raijin's drums in the cloud,
  // then three 380 gaps on 160 islands. Each bridge painted at its own edge holds (540 >= 380); painting all
  // three from the first island fails (bridge 3 washes before you reach it). Each bridge is its own breath.
  c.rain(true).flash(200, { raijin: true }).run(300); //                    RAIN ON @7820; flash @8020 → 8120
  c.beat('R6a rain gap 380 (edge bridge)', { ink: 28 });
  c.gap(380).run(160); //                                                   gap 8120-8500  → 8660
  c.beat('R6b rain gap 380 (edge bridge)', { ink: 28 });
  c.gap(380).run(160); //                                                   gap 8660-9040  → 9200
  c.beat('R6c rain gap 380 (edge bridge)', { ink: 28 });
  c.gap(380).run(400); //                                                   gap 9200-9580  → 9980
  c.lantern().run(200); //                                                  L5 @10020      → 10300

  // R7, the exam: a pair over the 640 (doors close behind you), then a LATE bridge over the 420.
  c.beat('R7 gap 640 (pair) + gap 420 (late bridge)', { ink: 72 });
  c.gap(640).run(260).gap(420).run(400); //                                 gaps 10300-10940, 11200-11620 → 12020

  // The shower passes upriver; the clouds stay heavy over the ridge ahead (the moon is saved for the gate).
  c.rain(false).run(600); //                                                RAIN OFF @12020 → 12620
  return c.end('summer'); //                                                torii @13180, length 13940
}
