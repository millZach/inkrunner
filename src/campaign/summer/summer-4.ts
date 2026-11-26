/**
 * summer-4 結 送 The Last Night: the final-draft greybox of docs/summer-design.md section 3.4.
 *
 * Tests everything Summer has taught so far (doors, exits in the air, the reach, catching and aiming, rain, the old
 * inks), faster, with fewer lanterns. Nothing new is taught, so there is no hint line: only the story line from
 * docs/story.md in the opening spot. About 00:30 on Obon's last night, on the ridge path above the river: drizzle in
 * bands while the storm circles back, and its strays now reach the road.
 *
 * Every dial turns a little at once (3.4 "Rules"): run 330, inkwell 90 (Ren 126), refill 26/s, slow motion 0.14 at
 * 4.5/s, the 650 reach, and a rain clock of 0.9 + 1.1 s (a rain bridge carries 660 u). Three lanterns at x 3840,
 * 6440 and 9780 (the MUST fix: the longest stretch is 11.3 s).
 *
 * Beats (x from the Course cursor, y grows down, ground starts at 520):
 *   E0  the stray, shown safely: a bolt lands 1 s ahead of you (mark 880, not counted)
 *   E1  two blot pillars 1000-1140 and 1340-1480 under the reach, then a dry 420 gap 1740-2160
 *   E2  a 540 gap in rain 2860-3400; a bolt at 3560 timed for your landing
 *   E3  a 240 wall at 4120 in rain; a bolt at 4240 just past the lip; a thicket 4630-4714
 *   E4  a pillar 5380-5520 straight into a 480 gap that drops 200 (5520-6000): the exit in the air
 *   E5  the drum run (dry): bolts at 7020, 7320, 7620 (0.91 s apart), yokai 250 up at 7920, 8120, 8320
 *   E6a a 300 wall at 8920 in rain; fire on the ledge 9300-9500
 *   E6b a 420 gap dropping 120 (10060-10480); a bolt at 10640 as you land; a yokai 120 up at 11020
 *   E6c a pillar 11680-11820, then a 340 gap 11820-12160
 *   torii at 13320; length 14080
 *
 * Deviations from the 3.4 listing, each on purpose:
 *   - E0's mark is 880, not 700. The traveler starts at x 120 and stands still for the 1.5 s title, so a mark at 700
 *     with landsEarly 1.0 puts its trigger at -26: it fired during the title, before anyone was looking. At 880 the
 *     trigger is 154, just ahead of the start, and it lands about 1 s before you reach it, as designed.
 *   - Each beat calls Course.beat() with the intended line's gross ink and echo refunds from 3.4, so par ink and the
 *     ramp report use the design's figures, not the primitives' estimates.
 *   - E5's yokai hover 250 u up (bob 20), not 120 (bob 30), so the listed catch line (A, C, D at y 300, the window
 *     B at (7470, 250)) works. See E5 below.
 *   - E6c sits 400 u later (run 1200 after E6b, not 800; the run after E6c is 300 shorter, so length and par stay).
 *     A spent catch pair stays open until the traveler goes through it (rule 2), so after E6b's catch its window
 *     at (10900, 180) is still open. With E6c's door at 11220 (329 u away, inside the 650 reach) a door painted a
 *     moment late, with the traveler already inside its disc, paired with that window and never took him (he stood
 *     at the pillar for good). At 11620 the door is about 720 u from the window, outside the reach, so painting it
 *     closes both old rings and starts a fresh pair (Portals.partnerFor). E4's door at 5320 is 760 u from E3's
 *     window (4560), so it starts a fresh pair the same way.
 *
 * Festival decor: 結's festival is over and its lanterns are going out (3.4, story), but the engine's lantern line
 * only ever lights as you pass. So the line is kept to one short span over each catch-and-aim spot (E3 4160-4580,
 * E6b 10500-10920) as the wordless signpost (3.0), and there is none over the drum run. No dips: a festival dip is
 * a 130 u-wide sag, and any dip near a catch ring hangs lanterns inside the ring, where the thread and the ring must
 * read on a phone. Each span's own sag keeps its lowest lantern just above the ring. The guide lantern (story
 * device 1), lanterns that stay dark or go OUT, and the far-bank tōrō procession have no engine API yet, and
 * nothing stands in for them (see needs: a festoon option for dark lanterns).
 *
 * The scattered decor is kept out from under the story line (a bamboo stalk crossed it on a phone), as summer-2 does.
 */
import { LevelBuilder, type Level } from '../../level';
import { Course } from '../../levels';
import { mulberry32 } from '../../rng';
import type { CampaignScroll } from '../data';

export const SEED = 804;

/** The story line for this scroll's opening spot (docs/story.md, per-scroll story). */
export const STORY_4 = "Obon's last night. The lanterns are going out.";

export default function build(s: CampaignScroll): Level {
  const b = new LevelBuilder(s.id, s.name, '送', 'summer', SEED).rules({
    runSpeed: 330,
    inkMax: 90,
    inkRegen: 21, // 26 before Zach's 2026-10-11 retune (0.8x)
    slowScale: 0.14,
    slowmoDrain: 4.5,
    inks: ['shu', 'ai', 'kin', 'murasaki'],
    startInk: 'murasaki',
    camLead: 0.22,
    rain: { hold: 0.9, warn: 1.1 },
    portalSpan: 650,
  });
  const c = new Course(b, 520, mulberry32(SEED));

  // the lull: slate storm cloud, drizzle in bands
  c.sky('storm');
  c.hint(420, 230, STORY_4, '送');

  // E0 the stray, shown safely (not counted): thread, column and all, 1 s before you get there
  c.bolt(880, { landsEarly: 1.0 }).run(1000);

  // E1 a 起 remix under the reach: one pair spanning both pillars (A ~(940, 475), B ~(1540, 475), 600 apart), then
  // a dry bridge over 420 (31). 72 ink. Kohaku: the same pair, then a fox leap.
  c.beat('E1 pillars', { ink: 72 });
  c.pillar(140).run(200).pillar(140).run(260).gap(420); // pillars 1000-1140, 1340-1480; dry gap 1740-2160
  c.run(400).rain(true).run(300); // RAIN ON @2560 → 2860

  // E2 the door that dodges: one pair across the gap (A ~(2830, 475), B ~(3460, 475), 630 apart) carries you past
  // the bolt's trigger (3164), so it lands behind you. 41 ink.
  c.beat('E2 door', { ink: 41 });
  c.gap(540).bolt(160); // gap 2860-3400; mark 3560
  c.run(400).lantern().run(200); // L1 @3840 → 4120

  // E3 catch and aim, in rain: a ramp (25), A on the bolt's thread above head (~(4240, 150)), B the window left of
  // the thicket (~(4560, 160)), spout at it: lightning burns the thicket. 66 gross, 51 net.
  c.beat('E3 catch', { ink: 66, refund: 15 });
  c.up(240).bolt(120).run(420).bramble(260); // wall @4120 (y 280); mark 4240; thicket 4630-4714 → 4880
  // one span of lanterns over the catch spot, posts 4160 and 4580 (y 30): the rope hangs at about y 60 over the mark,
  // just above A's top (105), and lowest at about 77 between A and the window
  c.festoon(-720, -300);
  c.run(500); // → 5380

  // E4 the exit in the air, forced by the reach: A before the pillar (~(5320, 235)), B in the air over the gap's
  // last 100 u (~(5900, 220)), 580 apart. The far bank (~6050) would be 757 away: outside the reach. 41 ink.
  c.beat('E4 air exit', { ink: 41 });
  c.pillar(140).gap(480, 200); // pillar 5380-5520; gap 5520-6000 (far y 480)
  // the thunder circles back: one far flash with his drums in the cloud, once you have landed (no decision is open
  // between the landing and E5's first rings at about 6760)
  c.flash(200, { raijin: true });
  c.run(400).lantern(); // L2 @6440 → 6520
  c.rain(false).run(200); // RAIN OFF → 6720

  // E5 the set piece, the Drum Run (dry): the window B (~(7470, 250), between threads 2 and 3) aimed at the yokai row;
  // A, C, D on bolt threads 1, 2, 3 at about y 300. The used entry closes each time, B stays. 4 rings at R 45: 74
  // gross, three echo refunds, 29 net.
  // Deviation: the yokai hover 250 up (y 230, bob 20), not 3.4's 120 (y 360, bob 30). A ring catches a bolt whose
  // tip comes within 0.8 r (36 u) of its centre, and only bolt 3 flies while D is open. With the row at y 360 the
  // line from B to yokai 3 passes 30 u from D's centre (13 u for yokai 1), so bolt 3 went back into D and looped
  // D → B → D for ever (the engine lets it: see needs). With the row at y 210-250 every line from B to any yokai
  // passes 50-63 u from D (a plain B with no tail fires level, the aim assist bends it up a little). The cost: the
  // yokai no longer dip into the road (they lean to about 180 up), so here they are targets, not a threat.
  c.beat('E5 drum run', { ink: 74, refund: 45 });
  c.bolt(300).bolt(600).bolt(900); // marks 7020, 7320, 7620 (0.91 s apart)
  c.yokai(1200, 250, 30, 20).yokai(1400, 250, 30, 20).yokai(1600, 250, 30, 20); // yokai 7920, 8120, 8320
  c.run(1900).rain(true).run(300); // RAIN ON @8620 → 8920
  // the storm comes back for the final run (and hands over to the gate's storm-peak)
  c.sky('storm-peak', -300);

  // E6a a late ramp up the 300 wall (31; about 1.3 s of climb, under the 2.0 s clock) and indigo on the fire (9). 40.
  c.beat('E6a wall+fire', { ink: 40 });
  c.up(300).run(300).fire(200, 150); // wall @8920 (y 180); fire 9300-9500 → 9740
  c.lantern().run(200); // L3 @9780 → 10060

  // E6b a late bridge (33) and the catch: A above head on the bolt's thread (~(10640, 170)), B left of the yokai
  // (~(10900, 180)), spout at it. 74 gross, 59 net.
  c.beat('E6b bridge+catch', { ink: 74, refund: 15 });
  c.gap(420, 120).bolt(160).yokai(540, 120, 30, 30); // gap 10060-10480 (y 300); mark 10640; yokai 11020
  // the last span of lanterns, over the catch spot (posts 10500 and 10920, y 50): the rope hangs at about y 92 over
  // the mark, just above A's top (125)
  c.festoon(20, 440);
  c.run(1200); // → 11680 (3.4 lists 800: see the deviations above)

  // E6c one pair over a pillar and a gap: A ~(11620, 255), B on the far ground ~(12220, 255), 600 apart. 41 ink.
  c.beat('E6c pillar+gap', { ink: 41 });
  c.pillar(140).gap(340); // pillar 11680-11820; gap 11820-12160
  c.run(300).rain(false).run(300); // RAIN OFF @12460 → 12760

  const level = c.end('summer'); // torii @13320, length 14080
  // level-local: keep the scattered decor (a tall bamboo stalk crossed the text on a phone) out from under the story line
  level.decor = level.decor.filter((d) => d.x < 150 || d.x > 750);
  return level;
}
