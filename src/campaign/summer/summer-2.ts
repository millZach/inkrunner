/**
 * summer-2 承 踊 *The Dance Ground*: final-draft greybox of docs/summer-design.md section 3.2.
 *
 * Teaches: fire goes through rings too, and comes out the way the ring points; a flicked tail aims it.
 * Festival night, clear and humid (sky 'night'): stall eaves, the festival lantern line (dipping over every catch
 * spot), fireworks. The new hazard is the hanabi spark (Course.spark): a 1.5 s telegraph on an 80 u ground mark,
 * a straight 400 u/s fall, an 80 x 60 splash. Her pre-painted pair at S1b makes the story line literally true.
 *
 * x positions (the design's scratch cursor, reproduced exactly by Course):
 *   0-1000 festival road, story line @450 | S1a demo spark mark 1250 | S1b demo spark mark 1550 into her rings
 *   (1550, 370) -> (1730, 330), aimed at a high yokai (1900, 290) | L1 @1740 | hint @2230 | S2 looping spark
 *   mark 1940 (past x 2000, every 2.2 s), thicket 2290-2374 | L2 @2880 | S3 spark mark 3520, yokai 3840 (150 up)
 *   | S4 gap 4120-4640, spark mark 4780 | L3 @5140 | S5 wall @5460 (ledge y 260), fire 5800-5990 | the great
 *   firework @6530 | S6 spark marks 6780, 7130, yokai 7430 (110 up), 7680 (130 up) | torii @8490, length 9250.
 *
 * Stand-ins (engine work listed by the scroll builder, not done here):
 * - Yatai stalls: Course.arcade() eaves stand in for the food stalls (DecorKind has no 'yatai' yet, N13).
 * - The yagura with its taiko, the bon odori dancers and the fūrin are backdrop/audio work (N13) that no API
 *   offers yet; this scroll only lays what Course can express.
 * - The white guide lantern (story device 1) has no engine object yet; the festival line it would ride is here.
 */
import { LevelBuilder, type Level } from '../../level';
import { Course } from '../../levels';
import { mulberry32 } from '../../rng';
import type { CampaignScroll } from '../data';

export const SEED = 802;

/** The story line for this scroll (docs/story.md, per-scroll story), in the opening title spot. */
export const STORY_2 = 'Someone ahead is painting doors in purple.';
/** The scroll's only hint (one new idea), 49 characters, glyph 紫. Read after S1 has shown it twice. */
export const HINT_AIM = 'Fire goes through rings too. Flick a tail to aim.';

export default function build(s: CampaignScroll): Level {
  const b = new LevelBuilder(s.id, s.name, s.beat, 'summer', SEED).rules({
    runSpeed: 310,
    inkMax: 100,
    inkRegen: 22, // 28 before Zach's 2026-10-11 retune (0.8x)
    slowScale: 0.12,
    slowmoDrain: 4,
    inks: ['shu', 'ai', 'kin', 'murasaki'],
    startInk: 'murasaki',
    camLead: 0.22,
    rain: false,
    portalSpan: 850,
  });
  const c = new Course(b, 520, mulberry32(SEED));
  c.sky('night');

  // ── 0 → 1000: the festival road. Stalls (eaves) on both sides of the story line, never under it; the lantern
  //    line starts just past it and runs the scroll. The line spans about x 180-720 (italic 25 px, about 540 u).
  c.hint(450, 230, STORY_2, '踊').festoon(760, 9000);
  c.arcade(130, 0).arcade(280, 760);
  c.run(1000);

  // ── S1: two demonstrations, not counted. S1a lands on the road 1 s before you get there; S1b falls into her
  //    ring, comes out of her other ring along its tail and bursts a yokai hovering harmlessly high.
  c.beat('S1 demos', { ink: 0 });
  c.spark(250, { landsEarly: 1.0 }); // mark 1250
  c.spark(550, { landsEarly: 1.0 }) // mark 1550 ...
    .herRings({ dx: 550, above: 150 }, { dx: 730, above: 190 }, { aimAt: { dx: 900, above: 230 } }) // ... her pair ...
    .yokai(900, 230, 30, 20, 0, { count: false }); // ... into a high yokai at 1900
  c.run(700).lantern().run(380); // L1 @1740 → 2200
  // hint @2230, 300 up, over the thicket: the line is about 540 u wide, and while you stand at the thicket (x 2277)
  // the view's left edge is at about x 1925 on desktop and 1850 on phone, so this is the leftmost spot where all of it
  // stays on screen (at 2050 the first words were cut off). It sits above the thicket's twigs and the window ring
  // (y 346-434), and well clear of her exit ring (1730, 330) and the S1b yokai.
  c.hint(30, 300, HINT_AIM, '紫');

  // ── S2: the thicket sandbox. You stop at the thicket (x 2277); a spark falls on the mark 337 u behind you every
  //    2.2 s. Intended: ring A on its line (1940, 370), ring B, the window, left of the thicket above head height
  //    (2220, 390); the default spout already points at the thicket. 41 gross, +15 back when it burns.
  c.beat('S2 thicket sandbox', { ink: 41, refund: 15 });
  c.spark(-260, { loop: 2.2, after: -200 }).dip(-260, 120); // mark 1940; repeats every 2.2 s past x 2000
  c.bramble(260); // thicket 2290-2374 → 2540
  c.run(300).lantern().run(260); // L2 @2880 → 3220

  // ── S3: a spark on your head and a yokai behind it. Intended: A on the spark's line above head height
  //    (3520, 380), B left of the yokai at its height (3700, 370), spout at it. One pair, both threats.
  c.beat('S3 spark and yokai', { ink: 41, refund: 15 });
  c.spark(300).dip(300, 120).yokai(620, 150, 32, 30); // mark 3520 (timed); yokai 3840, 150 up
  c.run(900); // → 4120

  // ── S4: bridge or door, and a spark as you land. Intended: a vermilion bridge (about 39) and, while crossing,
  //    a pair that catches the spark over the mark with its exit pointed somewhere safe (41). 80 gross.
  c.beat('S4 bridge and catch', { ink: 80 });
  c.gap(520).spark(140).dip(140, 120); // gap 4120-4640; mark 4780 (timed, as you land)
  c.run(460).lantern().run(240); // L3 @5140 → 5460

  // ── S5: a breather with old inks. Intended: a vermilion ramp up the 260 wall (27) and indigo through the fire (9).
  c.beat('S5 ramp and douse', { ink: 36 });
  c.up(260).run(260).fire(190, 150).run(100); // wall @5460 (ledge y 260); fire 5800-5990 → 6330
  c.run(200).hanabi(0, 'great'); // the great firework opens @6530

  // ── S6: the exam and the set piece, The Window. Two sparks, one window: A on spark 1's line (6780, 140), B the
  //    window (7330, 140) spouting along both yokai; then C on spark 2's line (7130, 140) closes A and B stays.
  //    Three rings and a tail, about 61 gross, two echo refunds (30).
  c.beat('S6 the window', { ink: 61, refund: 30 });
  c.spark(250).spark(600).dip(250, 120).dip(600, 120) // marks 6780, 7130 (timed)
    .yokai(900, 110, 30, 40)
    .yokai(1150, 130, 30, 40); // yokai 7430 (110 up), 7680 (130 up)
  c.run(1400); // → 7930
  const level = c.end('summer'); // torii @8490, length 9250
  // level-local: keep the scattered decor (a tall bamboo stalk crossed the text) out from under the story line
  level.decor = level.decor.filter((d) => d.x < 150 || d.x > 750);
  return level;
}
