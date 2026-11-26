# 夏 Summer: Obon, the thin night. Final level design

Level design synthesizer, studio phase 1 (Foundation), 2026-10-07. **Status: final draft for the greybox, not yet
played.** This drives the greybox levels Zach plays at checkpoint 1.

It starts from the critic's winner, `docs/drafts/summer-design-a.md` (draft A, teaching first). It grafts in the
listed ideas from `docs/drafts/summer-design-b.md` (draft B, flow and spectacle first), fixes every MUST and every
infeasible obstacle the critic found, and lines up with `docs/story.md` (titles, story lines, the guide lantern, her
rings, the lent stone). Where this file and a draft disagree, this file wins. Where this file and `BRIEF.md`
disagree, the brief wins, and every place I bend its wording is marked **Deviation** and listed in 7.2 (R3) and
section 8 (D3, D4).

All numbers come from `src/config.ts`, `src/game.ts`, `src/level.ts` and `src/levels.ts` on branch
`campaign/summer`, including the uncommitted Foundation work (`ScrollRules`, ink `murasaki`). The
x positions, obstacle counts, par values, lantern spacing and pressure scores were produced by a scratch copy of
the `Course` cursor (`/tmp/summer-synth/`, not part of the repo) that replays every layout below. The fox-leap and
fling figures were integrated at 240 Hz with the same gravity rules as `Game.step()`.

## 0. How this synthesis was made

### 0.1 What changed from draft A, and why

| Critic item | Where it is fixed |
|---|---|
| MUST: existing ink fire must pass through rings | 1.6: a ring painted on a ground fire lifts it out as an **ember** that flies like a spark and re-forms where it lands (draft B's ember ball, with draft A's straight-line flight). |
| MUST: deaths cheap and quick; 結 had one lantern (21.3 s and 19.3 s stretches) | 3.4: **three lanterns** (x 3840, 6440, 9780). The longest stretch in 結 is now 11.3 s. |
| Infeasible: a stopped traveler is not caught by the documented first ring | 1.6: a traveler who is stopped is caught by the ring's **full radius** touching their body box. 起 K1's ring and her rings at K0 are placed so the stopped case works. |
| Infeasible: experts can stair-step vermilion up a pillar | 1.2 and 6 (N5): pillars are **blot pillars** that soak any non-purple stroke painted in their column. 起 is also **Purple only**. |
| Infeasible: 承 S2's window ring could grab the stuck traveler | 1.3: the ring that completes a pair **never grabs what is already inside it** until that thing has left its disc. S2 also requires the window above head height. |
| Gap: 結 and the gate break flow (one lantern, scroll-roll wipes, gust roll-back, drums healing) | 3.4 three lanterns; 4.5 the **arena loop** replaces the wipes and the roll-back; 4.6 broken drums **stay broken** (heal-on-death becomes a checkpoint choice). |
| Gap: "one door 800 u ahead" is the cheap answer; showy lines cost more | 1.3 **span cap** per scroll (none in 起, 850 in 承, 800 in 転, 650 in 結 and the gate); 1.4 **echo refund** (+15 ink when something you sent through a ring destroys a hazard or a drum). |
| Gap: few designed spectacle moments | 3.0 the **night arc** and one **5-second set piece** per scroll; the gate ends with the rain stopping dead. |
| Gap: pillars not really ring-only | as above (blot pillars, Purple-only 起). |
| Gap: fixed ground fire cannot pass through rings | as above (ember). |

### 0.2 Grafts from draft B

| Graft | Where |
|---|---|
| Night arc and set-piece column | 3.0 |
| Arena loop with the invisible wrap (fallback: finite phases) | 4.5 |
| Ember ball | 1.6 |
| Snap feedback (swirl, koto harmonic, iOS haptic) the moment the loop closes | 1.1 |
| Span cap, tuned per scroll | 1.3 |
| Photosensitivity limits | 2.4, 4.8 |
| Dry stall arcade inside the rain ("under the eaves, the old rules") | 3.3 R5, as a rain-free zone with roof decor only (no ceiling collision) |
| Purple-only 起, and faint under-drawn rings at the first wall | 3.1 (her pre-painted working rings at K0 come from `docs/story.md`; the faint traced rings at K1 come from draft B) |
| Sagging lantern string (`dip`) as a wordless catch signpost | 3.2 S2, S3, S6 and the gate's G1 |
| Kohaku's fox leap refreshed on portal exit; an optional expert fling line | 1.6 launch state; gate G1 "The Ridge Leap" (gated on the launch-state proof) |
| Raindrops on the 朱 ink stone while you are in rain | 2.4 |

### 0.3 Not grafted, on purpose

- **One-way portals** (draft B): the brief says "whatever enters one leaves the other". Kept two-way; one-way is
  only an A/B on the proof page, flagged as a deviation (1.8).
- **Ceilings and roofs with collision**, **vista zoom**, **figure-8 pairs**, **0.6x purple cost**: new engine work or
  perf risk for small gains. The arcade is decor only. Possible later.
- **Draft B's three rain intensities** (4.0 / 2.4 / 1.4 s clocks): the critic found them hard to read at speed.
  Draft A's one wash clock per scroll stays.

### 0.4 Physics this design relies on (checked in code)

| Fact | Value | Source / derivation |
|---|---|---|
| Run speed | 310 default; per scroll `rules.runSpeed`. The traveler eases back to it at 1400 u/s² on the ground and in the air. | `RUN_SPEED`, `RUN_ACCEL`, `step()` |
| Full jump | apex 152 u, 0.78 s of air, 226 / 234 / 242 / 250 / 257 u at 290 / 300 / 310 / 320 / 330 u/s | 780²/4000; 0.78 s x speed |
| Short hop | gravity x2.4 while rising unless jump is held. **This also hits any upward launch.** | `if (this.vy < 0 && !this.jumpHeld) g *= 2.4` |
| Highest ledge a jump clears | about 152 + `STEP_UP` 22 = 174 for Ren; 254 + 22 = 276 for Kohaku. Designs use "can" ≤ 140 / ≤ 250 and "can't" ≥ 200 / ≥ 300. | `wallAt()` |
| **Kohaku's fox leap, corrected** | vy 640 (0.82 x 780). Best flat reach: a held jump with the leap at t = 0.75 s, **1.42 s of air**: 413 / 427 / 441 / 456 / 470 u at 290 / 300 / 310 / 320 / 330, plus up to 0.1 s of coyote time (442 / 457 / 472 / 488 / 503). Draft B's 376 u (leap at the apex) was wrong. | `step()`; integrated |
| Fires (h 150; deadly up to 112 above ground; hitbox inset 10 per side) | Ren clears w ≤ 118. Kohaku, leaping as his feet drop through 112, stays above it for 1.04 s: **w ≤ about 315** (draft B said 270). | `step()` fire test |
| Ink | 100 (Ren x1.4 = 140); 0.065 per unit painted (100 ink ≈ 1540 u); refill `rules.inkRegen` per game second, not while painting (Zach, 2026-10-11: refill was so fast the bar never drained, so every scroll's refill is now 0.8x the numbers in this document: 28→22, 32→26, 26→21, 34→27; 0.6x, and a wait after the brush lifts, ran Kohaku dry on the intended lines); slow motion drains `rules.slowmoDrain` per real second; undo refunds 50%. `stats.ink` counts ink spent. | `INK_*`, `extendPaint()`, `undo()` |
| Bridge / ramp estimates | gap x 1.15 x 0.065 (560 ≈ 42 ink); rise x 1.6 x 0.065 (320 ≈ 33) | `Course.gap()`, `Course.up()` |
| One ring of radius 50 | 314 u of stroke = **20.4 ink**; R 45 = 18.4; a pair ≈ **41** | `INK_COST` |
| Indigo current | 560 u/s; leaving the end gives vy = min(vy, −120) − 80 | `RIDE_SPEED`, `stepRide()` |
| Vermilion | one-way platform; walkable at almost any slope (a 22 u step-up per 1.3 u of travel at 240 Hz), so it can climb any wall that has no blot | `surfaceBelow()`, substeps |
| Walls | stop the traveler safely (`stuckT`); after 0.9 s the HUD nudge appears | `wallAt()`, `drawHUD()` |
| Death and respawn | below y 980, fire, yokai, sea. Respawn after 0.9 s at the last lantern + 30 with full ink and 0.8 s of invulnerability. **Strokes stay**; doused fires and banished yokai stay gone. | `die()`, `doRespawn()` |
| Camera | 720 u tall; aims at feet − 80, so **440 u above the feet and 280 below**. Horizontal lead today is 0.18 of the view width (870 u visible ahead at 16:9). This design sets `camLead` 0.22: **about 920 u ahead at 16:9, about 1,120 on an iPhone in landscape.** | `updateCamera()` |
| Course scoring today | gap > 240 counts as an obstacle; par time = length / `RUN_SPEED` + 1.2 x obstacles + 4; par ink = 1.1 x estimate + 20; 松 Pine = time ≤ 1.15 x par, no falls, ink ≤ 1.6 x par ink | `Course.end()`, `Game.grade()` |

The hardest limit on portal design is the view: **you can only paint a ring where you can see.** Every intended
exit below is within the scroll's span cap and within 850 u of where the player stands when they paint it.

## 1. Portal rules (紫 Purple, ink id `murasaki`)

Every rule has its reason, and every way a portal can fail has a cause the player can see.

### 1.1 The gesture: a ring, with an optional tail, and it snaps while you paint

A Purple stroke becomes a **ring** when it closes on itself. Detection runs **incrementally in `extendPaint()`**
(draft B's snap feedback) and is finalised in `endPaint()`, on the smoothed points (resampled every 4 u):

1. Add up the turning angle along the stroke. The loop **closes** at the first point after at least **280°** of
   turning where either the point is within `max(60, 0.6·R̂)` u of the start (R̂ = running mean distance from the
   centroid) or the stroke crosses an earlier segment of itself. A stroke lifted before it closes still counts when it
   turned at least **260°** and ends within **1.6 R** of its start: the whole stroke is the loop, its centre from a
   least-squares circle fit. (Zach, 2026-10-11: the first tolerance, 300° within `max(40, 0.35·R̂)`, made rings
   too hard to draw.)
2. The points up to the closing point are the **loop**. Centre = their centroid; radius R = mean distance from it.
   Legal rings have **40 ≤ R ≤ 150** (80 to 300 u across) and roundness (shortest ÷ longest distance) ≥ 0.3.
3. Everything painted after the closing point is the **tail**. If it is at least 30 u long and its tip ends at least
   R + 15 from the centre, the ring's **spout** points from the centre to the tip. Otherwise the spout points
   straight ahead (+x), the way the traveler runs. The spout is always drawn, as a real tail or a short automatic one.

**Snap feedback.** The instant the loop closes, while the brush is still down: the ring starts to swirl, a soft koto
harmonic plays (pitched like today's painting notes), and on iOS a light haptic fires. So the player knows it took
before lifting, and can keep going to flick a tail. If the closed loop is illegal (too small, too far, overlapping a
hazard), it snaps **grey and still** with the same harmonic flattened, so a thumb learns that too before lifting.

Drawn in one motion, a ring with a tail is a comma: the *tomoe* (巴), the mark that sits in threes on Raijin's taiko.
The portal's own glyph foreshadows the boss.

**Reasons.** One stroke, one finger, no modifier key; it works with a mouse and in slow motion (a 100 u ring is about
0.4 s of real drawing, which at 0.12x is 0.05 s of game time, so the traveler moves about 15 u). 300° rather than
360° because people stop short, especially with a thumb. R ≥ 40 because below 80 u across the 58 u traveler could
clip the rim and miss the middle, which would look unfair.

**When it fails, you see why.** A Purple stroke that doesn't close, or closes illegally, fades over 0.5 s and refunds
half its cost. A dotted ghost of the fitted circle stays for 1.2 s with the problem in brush text: "open", "too
small", "too far", "blocked". No hint line is needed for the gesture.

### 1.2 Where a ring may be placed

- The centre must not be inside ground or a blot pillar. The rim may dip into the ground or cross a pillar face:
  most entry rings are drawn around the traveler's feet, often right at a wall.
- A ring may not overlap a **thicket, a yokai or another live ring**: it fizzles with a hiss, the obstacle flickers,
  and the refund and ghost from 1.1 apply. This keeps exits from being painted *on* targets, so aiming matters.
- **A ring painted on a ground fire captures it** (1.6, the ember): the ring's centre must be within the fire's width
  and R must be at least a quarter of the fire's width. This is the one hazard a ring may be painted over.
- **Blot pillars** (墨 columns, N5) soak any **non-purple** stroke that has a point inside the pillar's column
  (x from pillar − 24 to pillar end + 24, any height): the stroke is drunk into the black over 0.4 s with a paper
  hiss, half refunded. Rings are the only way past. This closes the vermilion stair-step and the chained-indigo
  climbs that draft A's plain pillars allowed.

### 1.3 Pairing, limits and reach

Rules, in priority order:

1. **At most two live player rings, forming one pair**, in every Summer scroll. They work **both ways**: whatever
   enters either ring leaves the other (the brief's wording).
2. **Doors close behind the traveler.** Once the traveler has come out of a ring and left its disc, both rings of
   that pair fade over 0.4 s. Sparks, bolts, embers and yokai going through do **not** close a pair.
3. **Otherwise a new ring closes the ring something last went *into*;** if nothing has gone through yet, the older
   ring closes. In short: the exit you are still using stays, the entry you used gives way.
4. **The ring that completes a pair never grabs anything already inside its disc,** until that thing has fully left
   the disc. The older ring captures normally, including something already inside it. So "paint a door around
   yourself, then an exit" sends you through, and "paint an exit next to yourself" never does.
5. **Reach (span cap).** A pair's centres may be at most `rules.portalSpan` apart: **none in 起** (the view limits
   it to about 920), **850 in 承, 800 in 転, 650 in 結 and the gate.** While you paint the second ring, a faint
   dotted **reach circle** around the waiting ring shows the cap, and a dotted thread joins the waiting ring to the
   brush tip. A ring closed outside the reach snaps grey (1.1) and fizzles on lift as "too far". It is **never
   moved**, so an exit can never land inside a blot or a wall because of the cap.

**Her rings** (story device 2: pre-painted in her pale wash with a thin purple rim) are level objects. They don't
count toward the limit, never close, and survive deaths.

**Why rule 2.** Tracing 起 K2 with rule 3 alone showed a trap: after crossing wall 1 (A to B), the player paints C as
the door for wall 2, C links to B behind them, and they loop A-B-C. "A door you walk through closes behind you" is
something everyone already understands.

**Why rule 3, not first-in-first-out.** When catching several falling things, FIFO closes the carefully aimed exit on
the third catch. Rule 3 keeps it: **move the door, keep the window.** Trace with three sparks: A on spark 1's line,
B aimed at the target; spark 1 goes A to B, so A was last entered; paint C, A closes, B–C link; paint D, C closes,
B–D link. B never closes. 承 S6, 結 E5 and every Raijin phase reward this.

**Why a span cap, and why it tightens.** Without it, one door 800 u ahead skips every obstacle in view, and the
catch-and-aim lines are never worth taking (critic gap 2). 起 has no cap because it teaches reach ("an exit can go
anywhere you can see"). The cap tightens as the chapter goes on, so by 結 the player must read the reach circle and
choose between a door that fits and an answer that uses the old inks.

### 1.4 Ink cost and the echo refund

- Purple costs the same **0.065 per unit** as every other ink, charged as you paint. R 50 = 20.4 ink; a tail adds 2
  to 8; a pair ≈ 41, about a 560 u bridge, 41% of Kohaku's inkwell and 29% of Ren's. One cost rule keeps the bar
  readable and ghost-run validation unchanged; a pair priced like a bridge means portals win where bridges can't
  work (pillars, rain, long gaps), not because they are cheap.
- **Echo refund: +15 ink** each time something that came out of your ring (a spark, an ember, a bolt) destroys a
  thicket, a yokai or one of Raijin's drums. Purple motes fly back to the ink stone. `stats.ink` counts it as negative
  spend, so Pine grading stops punishing the clip-worthy lines. Examples: 結 E5's window line costs 74 gross,
  **29 net**, against 39 for umbrellas and gold; 結 E3's catch-and-burn costs 51 net against 39 for the plain line,
  while the old door-skip is now capped away.

### 1.5 Expiry

Rings **never expire on a timer and rain never touches them.** A ring is removed only when a newer ring closes it
(1.3), the traveler leaves a used pair (rule 2), the player undoes it (right click or the pause sheet; half refund),
it falls 1.5 view widths behind the camera (cleanup), or, in the gate, on death and at the loop wrap (section 4).
**Why no timer:** the game already has run speed, slow motion and, in rain, a wash clock. Rain's whole point in 転 is
that rings are the thing that *lasts*.

Rings **stay across a death** in normal scrolls, like strokes, so the run back to where you died flows through doors
you already painted. In the gate they are cleared on death (Raijin has moved; an old window would aim nowhere).

### 1.6 What goes through, and how it comes out

| Thing | Passes? | Captured when |
|---|---|---|
| The traveler, moving | yes | their **body box** (26 x 58) overlaps a disc of **0.8·R** around the ring's centre |
| **The traveler, stopped** (grounded, \|vx\| < 20) | yes | the body box touches the ring's **full disc R**. This fixes the "stopped at the wall, painted the documented ring, nothing happened" trap: with K1's ring at x 1880 and the stopped traveler's box at 1894–1920, the gap is 14 u. |
| A traveler riding an indigo current | yes; the ride ends | as moving |
| Hanabi sparks (falling fire, 承) | yes | the spark's centre is within 0.8·R |
| **Ground ink fire** (the ember) | yes | a ring is painted on it (1.2). The fire lifts out as an **ember**: it leaves the partner ring and flies like a spark (straight, 400 u/s, up to 1.2 s / 480 u), burns the first thicket it hits, banishes the first yokai, goes out on indigo or in a gap, and otherwise drops and **re-forms as a fire (w 120, h 110) where it lands**. |
| Raijin's lightning and the stray bolts of 結 | yes | the bolt's leading tip is within 0.8·R |
| Yokai | yes; their hover anchor moves to the exit and they keep hovering there | their centre is within 0.8·R (yokai lean up to 70 u toward the traveler, so it can happen on its own) |
| Thickets | no: rooted, and a ring can't overlap one | |
| Painted strokes, terrain, lanterns, ghosts | never | |

**Exit rule.** The object comes out at the partner's centre plus 0.25·R along the spout, moving along the spout at the
**speed it went in**, and ignores both rings until its centre has left the exit disc. A traveler whose feet would end
up inside ground is lifted to stand on it.

**Two deliberate rules for the traveler (both are Deviations, shown on the proof page):**
- **Exit speed = max(|v|, `rules.runSpeed`).** A traveler stopped against a wall has |v| = 0; without the floor they
  would drop out of an exit hung over a gap and die without knowing why. The traveler is always trying to run.
  The ember gets the same treatment: a fire has no speed, so it leaves at spark speed (400).
- **The launch state.** On a portal exit the traveler is *launched* until they land, ride or jump: (a) the x2.4
  short-hop gravity is skipped, so an upward spout keeps its height; (b) the air pull back toward run speed is
  300 u/s² instead of 1400, so a fast exit keeps its speed; (c) **Kohaku's fox leap is refreshed** (as indigo does
  today). No intended line needs (a) or (b). Only the optional fling (gate G1, "fall deeper, fly farther") does:
  falling 200 u into an entry gives |v| 950, and an exit flicked 30° up then carries **426 u with the launch state and
  212 u without** (integrated at 240 Hz). Treat the fling as blocked until the portal proof shows the launch state.

**Things that fly** (sparks, embers, bolts) travel in **straight lines** after a ring: "the tail points at it, so it
goes there" reads on a phone better than an arc. A gentle **aim assist** bends the path up to **20°** toward the
nearest valid target in front of the spout (thicket, yokai, drum), and the trail shows the bend like a lightning
fork. Sparks fly 400 u/s for up to 1.2 s (480 u); bolts 2,400 u/s for up to 0.5 s (1,200 u).

### 1.7 How a ring reads (shape and motion, not only colour)

- The ring **turns**: brush dashes travel around it at about 1 turn per second (slower while it waits for a partner).
  Indigo currents are open lines whose flecks flow *along* them, so the two inks differ in greyscale and at phone size.
- The **spout** is a tapered brush lift; a shimmer runs along it toward the tip whenever something comes out.
- A linked pair breathes and glows in step; a waiting ring is dull and does not glow; her rings are pale wash with a
  purple rim (story device 2).
- An R 50 ring is about 54 pt across on an iPhone held sideways (0.54 pt per unit), bigger than a fingertip.

### 1.8 What the portal proof page (`?proof=portal`) should A/B

Two real alternatives, switchable live, each tested on a named scenario:

1. **Pairing: "the used entry closes" (proposed) vs. strict pairs.** Strict: rings link 1+2, then 3+4; a third ring
   waits alone. Simpler to explain, but every extra catch in a strike group costs a fresh pair (41 ink, not 20).
   Test: 承 S6's two sparks and the gate's P3 triplet; count how often the window survives.
2. **Aim: tail flick (proposed) vs. line aim.** Line aim has no tails: things leave B moving in the direction from
   A's centre to B's centre. One less motion for a thumb, but you can't aim back toward the entry. Test: Raijin
   phase 1 and 結 E3 on a phone.

Tuning knobs on the same page (not full A/Bs): the closing tolerance (strict 28 u / 330° to generous 44 u / 300°);
the span cap (unlimited vs 650) on 結 E1 and E4; the exit-speed floor on/off on the "stopped at a pillar" case;
the launch state on/off on the G1 fling; and, **only as a flagged Deviation for Zach**, draft B's one-way rings
(entries swallow, exits emit), which contradicts the brief's "whatever enters one leaves the other".

The brief's proof assertions map onto 1.6: traveler speed and direction rotate through the pair within tolerance;
fire (the ember), a yokai and a bolt each come out of the exit.

## 2. Rain rules (the 転 twist)

### 2.1 What rain touches

| Stroke | In rain | Why |
|---|---|---|
| 朱 Vermilion | **washes away** on the scroll's one clock (2.2) | The brief's twist: bridges become unreliable. |
| 紫 Purple rings | untouched | The twist's answer: "bridges melt, doors don't". Keeping that contrast clean is the point of 転. |
| 藍 Indigo | untouched | It is already water, and you ride a current once. |
| 金 Gold | untouched | It is light, not pigment. |

A vermilion stroke is **in rain** if its bounding box overlaps a rain zone (`Course.rain(on)` markers, recorded as
`[x0, x1]` spans). The whole stroke washes as one piece: "this bridge is going" is the only thing the player needs to
know, and a bridge with holes in it doesn't read at speed. Rain zones are static x-ranges, so ghosts, clips and
autoplay routes see the same rain. Rain does not put out ink fire (it is the blot's fire; rain hitting it hisses as
steam), so fires can still sit in rain zones.

### 2.2 Timings: one wash clock per scroll

| State | Starts | Lasts | Solid? | Looks like |
|---|---|---|---|---|
| **Wet** | at brush lift (`endPaint`) | `hold` | yes | normal stroke with a wet sheen; rain ripples on it in vermilion |
| **Running** (the warning) | end of `hold` | `warn` = **1.1 s** | **yes, fully** | drips bead on the underside and fall; colour drifts from `#f5361b` toward pale coral (`INKS.shu.light`); bleed streaks run down 20 to 80 u; drip ticks speed up and rise in pitch |
| **Gone** | end of `warn` | 0.25 s dissolve | no | the pigment lets go as a sheet of pale vermilion drops that splash into ripples; a faint pink stain stays on the paper for 3 s (cosmetic) |

Both timers run in **game time**. Game time never runs faster than real time, so the 1.1 s warning is never shorter
than 1.1 s of real time and gets longer while the player paints. That meets the brief's "at least one second of
visible warning" for every stroke, including one under the traveler, with 0.1 s to spare. `mergeRules` clamps
`warn ≥ 1.0`, and the brief's assertion test reads the stage timestamps (N8).

**What the player learns: in rain, a bridge carries you a fixed distance.** The traveler also moves in game time, so a
wet bridge holds for (`hold` + `warn`) x run speed of travel, however long you spend painting:

| Scroll | hold + warn | run speed | **A rain bridge carries you** |
|---|---|---|---|
| 転 summer-3 | 0.7 + 1.1 = 1.8 s | 300 | **540 u** |
| 結 summer-4 | 0.9 + 1.1 = 2.0 s | 330 | **660 u** |
| 門 gate, phase 3 | 1.0 + 1.1 = 2.1 s | 320 | **672 u** |

So in 転 a single bridge always clears a 380 gap, clears a 420 gap only if painted within about 120 u of the edge,
and never clears a 640 or 700 gap. Every rain beat is built on those three facts. Ramps still work: a 300 u climb
takes about 1.4 s, under 1.8 s, if painted just before the wall. **Why one clock per scroll** (not draft B's three
intensities): the player never has to read rain intensity at speed on a phone; they learn one number per scroll.
**Why so short:** with a gentle 2.5 s hold a bridge carries about 1,080 u, farther than you can see, so every
visible gap would stay bridgeable. Keeping the reach (540) well inside the view (920) makes gaps that are visible, too
wide for one bridge, and easy with a ring.

### 2.3 Fairness edge cases

- A stroke that starts running while the traveler stands on it holds them for the full `warn`. No early collapse.
- Undoing a running stroke refunds the usual half.
- After a death, strokes in rain are already washing or gone, and the respawn refills ink. No beat depends on an old
  bridge.
- A stroke painted entirely outside a zone stays dry forever, even if you carry it into rain. Zone edges are drawn
  (2.4), so this is visible.
- **Dry zones inside rain** (the 転 stall arcade) are simply gaps between rain zones, dressed with roof decor. There is
  no ceiling collision, so nothing about jumping changes under the eaves.

### 2.4 How rain looks and sounds, and what it costs to run

- **Zone edges are visible before you reach them:** a curtain of slanted ink streaks starts at the zone's first x
  under a darker sky wash. With 920 u of view, a zone shows about 3 s before you enter it.
- **On screen:** diagonal streaks in two parallax layers (a pre-rendered tile, two `drawImage` calls a frame);
  ripples on flat ground (≤ 40 alive); a wet sheen on the paper (a darker paper tone plus a pale line along terrain
  tops, baked into a "wet" variant of the terrain chunk cache, not drawn per frame); lantern glow reflected as vertical
  smears in puddles.
- **HUD cue (from draft B):** while the traveler is inside a rain zone, small drops run down the **朱 ink stone**, so
  you know before you paint. The stone is otherwise unchanged in size, tap target and key.
- **On strokes:** the table in 2.2. The running state reads by **motion and shape** (drips fall, streaks lengthen, a
  sub-2 px shiver near the end), not only by colour.
- **Sound:** rain hiss (procedural noise); a drip tick timed to the music's eighth notes that rises over `warn`; a
  soft "shhh" when a stroke goes. Thunder is far in 転, nearer in 結, and becomes Raijin's drums in the gate.
- **Photosensitivity (from draft B, applies to the whole chapter):** background lightning flashes are **at most one
  every 4 s and never 3 in any 1 s window**; each changes full-screen luminance by **≤ 20%**; brightness ramps take
  **≥ 80 ms**. One scheduler (N19) owns every full-screen flash; strike impacts in the same group share one flash, and
  everything else is local light (a column glow covering ≤ 10% of the screen). Checked on the recorded clip with a
  frame-luminance script, not just in code.
- **Cost:** streak tiles, ≤ 40 ripples and ≤ 60 drip particles, no per-pixel effects and no canvas `filter`. Measure
  with `tools/perf.mjs` on 転 R6 (rain plus three washing bridges) and gate phase 3 (rain, two rings, three bolts,
  Raijin).

### 2.5 Rules for each scroll

`rules.rain: false | { hold: number; warn: number }` replaces Foundation's `rain: boolean` (N2), plus Course zone
markers `c.rain(true | false)`. Only 転, 結 and the gate's phase 3 use rain. 承 has none: a drizzle there would show
the rule with no stakes, and 転's dry "before" gap (R1) does that job better.

## 3. The five Summer scrolls

### 3.0 One festival night, one clip per scroll

Summer plays as **one Obon night that turns** (draft B's arc, aligned with `docs/story.md` section 6). Titles,
glyphs and story lines are the story bible's (all in the bundled fonts and in `docs/glossary.md`); the story line
sits in the opening title spot and never teaches. Each scroll has **one idea** (Celeste) and **one designed
5-second set piece** (Alto): the moment the highlight clip and the trailer should catch.

| | Scroll | Time | Weather and light | Sound bed | The one idea | Set piece (5-second clip) |
|---|---|---|---|---|---|---|
| 起 | `summer-1` 迎 *The Welcoming Fire* | dusk, ~19:00 | clear and still; warm ochre wash low in the sky; welcoming fires (迎え火) at the doors; the festival lantern line lights as you pass | higurashi cicadas, koto | a ring is a door | **The Moon Door** (K5): through a blot pillar at the cliff edge, out over the gorge as the first firework blooms, the moon rises and the lantern line lights toward the torii in one cascade |
| 承 | `summer-2` 踊 *The Dance Ground* | festival night, ~21:00 | clear and humid; stall lanterns, the yagura, bon odori silhouettes; fireworks; heat lightning far off, no thunder | taiko, bon-dance rhythm, fūrin | fire goes through rings, and a flicked tail aims it | **The Window** (S6): under the great firework, two falling sparks go through one door into one window and burst two yokai |
| 転 | `summer-3` 雨 *The Evening Storm* | ~23:00 | a yūdachi breaks: wet dark paper, streaks, ripples; a dry stall arcade glows warm mid-scroll; the shower passes upriver at the end (no moon yet) | rain on paper umbrellas, wild fūrin, far thunder | in rain vermilion washes away, rings hold | **Bridges in the Rain** (R6): out of the dry arcade, one flash shows Raijin's drums in the cloud, and three late bridges drip away behind you on the thunder beat |
| 結 | `summer-4` 送 *The Last Night* | ~00:30 | the lull on the ridge: drizzle bands, the storm circling back; strays reach the road; the checkpoint lanterns are fewer because they are going out | close thunder, Raijin's drums between claps | nothing new: everything, with fewer lanterns | **The Drum Run** (E5): three stray bolts, one window, three yokai, in rhythm |
| 門 | `summer-gate` 雷 *Raijin's Gate* | ~02:00 → after the storm | the storm's heart; downpour in phase 3; Raijin lit by his own bolts; when the last drum breaks **the rain stops dead**, the cloud tears and the moon comes out | Raijin's drums pitched to the music | his lightning goes through rings like anything else | **The Last Drum**: a triplet caught in one big ring, sent into the last drum, the rain stops mid-fall. (Optional expert clip: **The Ridge Leap**, the G1 fling.) |

**Story devices placed in play** (required by `docs/story.md` 6): the white **guide lantern** slides along the
festival lantern line (`c.festoon`) in 起 and 承 (and 転 and 結 where the line runs), waits above each new idea, and
never touches a hazard; **her rings** are pre-painted at 起 K0 and 承 S1b; the **lent purple stone** is the HUD
owner's. The lantern line **dips** (`festoon(..., { dip })`) over catch spots, a wordless signpost (draft B).

**Raijin's place on screen.** The story bible suggests top-left (Sōtatsu's placement) as a suggestion to the gate
designer. This design keeps him **right of centre** (4.1): top-left collides with the ink bar and stones, and puts
every returned bolt behind the traveler's line of sight. Flagged for checkpoint 1 (section 8).

### 3.0.1 Conventions used below

- Pseudo-code is `Course` (`src/levels.ts`) plus the beats in section 6, which are proposals, not code yet.
- x positions in comments come from the scratch cursor and follow `Course` exactly: `lantern()` advances 120 and
  places the lantern at +40; `fire(w)` advances w + 320 (fire at +80); `bramble()` advances 340 (thicket at +90);
  `end()` puts the torii 560 on and adds 760 after it. y grows downward; ground starts at 520.
- **Obstacle count and par** follow `Course` with three changes (N1): par uses `rules.runSpeed`; a gap counts if it
  is wider than 0.78 x runSpeed (a flat jump); strikes (sparks and bolts) add **0.3 s** to par instead of 1.2, because
  they don't stop the traveler. Par ink = 1.1 x the intended line's net ink (after echo refunds) + 20.
- **Strikes are triggered by position,** not by a clock: the trigger sits at mark − runSpeed x telegraph, so a traveler
  running at full speed reaches the mark at impact. Strike and traveler both run in game time, so slow motion doesn't
  change the sync. **The telegraph clock pauses while the traveler is stopped against a wall,** so stalling never
  makes a strike land where you can't answer it (it only lengthens the warning). A traveler who passes the trigger by
  teleport or current arrives early, and the strike lands behind them: "outrunning the drum" is a legal answer.
- "Above head height" means the ring's bottom edge is more than 70 u above the ground: the traveler (58 u) runs under.
- Every obstacle lists **Intended**, at least one **Alt**, the **Check** (physics and ink), and **Fail shows**
  (what the player sees when it goes wrong).

---

### 3.1 起 `summer-1` 迎 *The Welcoming Fire*

**Teaches:** paint a closed ring, then a second one; run into one and you come out of the other.

**Mood, time, weather.** Dusk on the first evening of Obon, a riverside village. Ochre wash, no clouds, higurashi
cicadas. Small welcoming fires burn in clay dishes at the doors (decor, never hazards). At one gate hangs the white
lantern Ren hung for her first Obon; beside its fire, the cucumber horse and eggplant cow (story flag 11's stated
liberty). The guide lantern slides off along the festival line and leads. Blot pillars stand in the road like wet
black columns with fibrous bleed edges and no faces. Story line: *Her first Obon. Ren hung a white lantern for her.*

**Target length:** par **43.6 s** (9,040 u at 290 u/s, 7 obstacles).

**Rules:** `{ runSpeed: 290, inkMax: 100, inkRegen: 32, slowScale: 0.10, slowmoDrain: 3, inks: ['murasaki'],
camLead: 0.22, rain: false, portalSpan: Infinity }`
- **Purple only** (draft B): this scroll teaches one thing. With vermilion in hand every wall gets a ramp, and it was
  vermilion that let experts stair-step draft A's pillars. One ink stone keeps the HUD quiet.
- A slower run (290), deeper slow motion (0.10), cheaper slow motion (3) and faster refill (32): the first rings are
  drawn with time to spare. A pair (41) refills in 1.3 s.

**Lanterns:** x 1540, 3800, 6020. Longest stretch 7.8 s, mean 7.0 s.

**Hint (the only one):** `HINT_RING = 'Paint two rings. Run into one, out of the other.'` (48 characters, glyph 紫),
at x 1620, after the player has already gone through her rings at K0. The traced rings at K1 are shapes, not text.

```ts
const b = new LevelBuilder('summer-1', 'The Welcoming Fire', '迎', 'summer', 801)
  .rules({ runSpeed: 290, inkMax: 100, inkRegen: 32, slowScale: 0.10, slowmoDrain: 3,
           inks: ['murasaki'], camLead: 0.22, rain: false, portalSpan: Infinity });
const c = new Course(b, 520, mulberry32(801));
c.hint(420, 230, STORY_1, '迎').festoon(300, 8900).run(900);     // 0→900  village at dusk, welcoming fires, white lantern
c.herRings([840, 475], [1080, 475]).pillar(100, { count: false }); // K0 her pair across a blot pillar 900–1000
c.run(500).lantern().run(300);                                  // L1 @1540                  → 1920
c.hint(-300, 250, HINT_RING, '紫');                             // hint @1620
c.sketch(-40, 45, 50).sketch(250, 45, 50);                       // faint traced rings at x 1880 and 2170
c.pillar(160);                                                  // K1 pillar 1920–2080
c.run(600);                                                     //                           → 2680
c.pillar(140).run(300).pillar(140);                             // K2 pillars 2680–2820, 3120–3260
c.run(500).lantern().run(240);                                  // L2 @3800                  → 4120
c.gap(560);                                                     // K3 gap 4120–4680
c.run(600);                                                     //                           → 5280
c.up(320).run(700);                                             // K4 wall @5280, ledge y 200 → 5980
c.lantern().run(200);                                           // L3 @6020                  → 6300
c.pillar(140).gap(480, 160).hanabi(0, 'first');                 // K5 pillar 6300–6440; gap 6440–6920, far y 360
c.run(800);                                                     //                           → 7720
return c.end('summer');                                         // torii @8280, length 9040
```

**K0, her door (x 900, not counted).** A short blot pillar with her pre-painted pair, A at (840, 475) and B at
(1080, 475). The traveler runs into A and out of B without doing anything: the move shown once, safely, before any
text (story device 2; Celeste's "show it first"). Her rings stay forever and don't count toward the pair limit.

**K1, the first wall (x 1920).** A blot pillar 900 u tall, its top far above the view: the traveler simply stops
against it. **No way to die here.** Faint under-drawn rings (draft B's "master's sketch") sit at x 1880 and 2170.
- *Intended:* trace them: A on the sketch before the wall (centre 1880, 45 u up), B on the sketch past it (2170).
  Run into A, out of B at 290, still running.
- *Alt 1:* stop first, then paint A around yourself; the stopped traveler's box (x 1894–1920) is 14 u from A's centre,
  inside the full-radius capture (1.6), and A grabs you when B completes the pair (rule 4 applies only to B).
- *Alt 2:* B in the air past the wall; you drop up to about 200 u onto flat ground, which is safe.
- *Alt 3:* B anywhere farther along the road; 起 has no span cap.
- *Check:* pillar top at y −380, view top about 80 when standing at y 520: out of sight. A pair is 41 of 100 ink.
- *Fail shows:* only a failed gesture is possible, and the ghost circle names the problem (1.1). After 0.9 s against
  the wall the nudge reads **"Paint a door"**, not "Paint a way up" (N9).

**K2, two walls and a courtyard (x 2680 and 3120).** The first lesson in reach.
- *Intended:* **one pair across both:** A before wall 1 (about 2600), B past wall 2 (about 3330), 730 apart.
  Stopped at 2667 the player sees to about 3590.
- *Alt:* two pairs, one per wall. Rule 2 closes the first pair behind the traveler, so the second starts clean.
- *Check:* one pair 41 ink; two pairs 82, which fits Kohaku's 100 with the courtyard's refill (1 s, about 32).
- *Fail shows:* nothing can kill you. "An exit can go anywhere you can see" comes from noticing the second pair was
  unnecessary.

**K3, the first chasm (x 4120, gap 560).** The first beat that can kill, 320 u after a lantern.
- *Intended:* A on the ground before the edge (about 4060), B on the far ground (about 4760), 700 apart; from 4060 the
  view reaches 4980.
- *Alt 1:* B in the air over the far bank (any height); you drop onto it.
- *Alt 2:* run off the edge into an A hung just below the lip (about (4150, 560)); the falling body passes through it.
- *Alt 3 (Kohaku):* B in the air over the last third of the gap (x ≥ 4480), then the refreshed fox leap carries about
  210 u from mid-air to the bank.
- *Alt 4 (Ren):* B over the middle, then a second pair painted while falling (82 of 140 ink).
- *Check:* no jump works: 226 u, and Kohaku's best is 413 + 29 coyote = 442 < 560.
- *Fail shows:* B over the void means you come out and fall, watching the misplaced ring for about 0.7 s; respawn at
  L2 0.9 s later, back at the edge 1.1 s after that.

**K4, the ledge (x 5280, a 320 wall).** Exits can float.
- *Intended:* A on the ground at the wall's foot (about 5220); B just above the ledge (centre about (5340, 155),
  45 u above the top at y 200). Come out moving forward and land.
- *Alt 1:* B farther along the ledge, anywhere up to the view edge.
- *Alt 2:* stop at the wall, then paint A around yourself (full-radius capture).
- *Check:* no jump: Ren about 174, Kohaku about 276 < 320. Standing at y 520 the view top is about 80, so B at 155 is
  fully visible.
- *Fail shows:* B too high: you come out and drop onto the ledge anyway. B below the ledge top: you come out against
  the face, fall back and stop, which is safe and plain to see.

**K5, the exam and the set piece (x 6300: a pillar straight into a 480 gap down to lower ground at y 360).**
- *Intended:* **one door, chosen with intent:** A before the pillar (about (6240, 155)), B on the low far bank
  (about (7000, 315)), 760 apart. From 6240 the view reaches 7160 ahead and 280 below the feet (to y 480).
- *Alt 1:* B in the air above the last 120 u of the gap, about 60 u above the near ground: you come out at 290 and
  fall 191 u to the bank in 0.44 s, carrying 127 u forward. Further back and you fall short, visibly.
- *Alt 2 (Kohaku):* B over the gap at about x 6720, then the refreshed fox leap: from the exit it carries about 250 u
  while dropping 176, landing past 6920.
- *Alt 3 (Ren):* B just past the pillar, then a second pair painted while falling (82 of 140).
- *Check:* there is no ground between pillar and gap, so the exit must be across the gap or above it.
- *Set piece, The Moon Door:* `hanabi(0, 'first')` fires when the traveler leaves B: the first firework of the night
  blooms over the far bank, the moon clears the hills, and the lantern line from 6920 to the torii lights in one
  cascade. About 5 s from entering A to landing.

**Ren and Kohaku in 起.** Nearly identical, on purpose: one gesture, taught the same way. Ren's 140 ink pays for failed
rings and the two-pair fallbacks (K3 alt 4, K5 alt 3). Kohaku can jump nothing here; his only extras are the
mid-air leaps at K3 and K5.

---

### 3.2 承 `summer-2` 踊 *The Dance Ground*

**Teaches:** fire goes through rings too, and comes out the way the ring points; a flicked tail aims it.

**Mood, time, weather.** Full festival night, clear and humid. Food stalls (屋台) with cloth awnings, strings of paper
lanterns (提灯) across the road, the yagura (櫓) with its taiko in the backdrop, bon odori (盆踊り) dancers as small
ink silhouettes on a 4-frame cycle, a fūrin chiming. Fireworks (花火) open over the hills; the new hazard is the
falling spark from them. Heat lightning far to the east, no thunder yet. Story line: *Someone ahead is painting doors
in purple.* (Her pre-painted pair at S1b makes that literally true.)

**Target length:** par **43.4 s** (9,250 u at 310 u/s, 11 obstacles). Draft A's 49 s was over the brief's 45 s for
early scrolls; this layout tightens the runs instead of cutting a beat.

**Rules:** `{ runSpeed: 310, inkMax: 100, inkRegen: 28, slowScale: 0.12, slowmoDrain: 4,
inks: ['shu', 'ai', 'kin', 'murasaki'], startInk: 'murasaki', camLead: 0.22, rain: false, portalSpan: 850 }`.
The default dials: 承 adds two moving parts per beat, not tighter knobs. `startInk` makes the first stroke Purple
(today `rules.inks[0]` would pick vermilion, N2).

**The new hazard, the hanabi spark (`c.spark`).** A shell rises behind the hills with a whistle and bursts. One heavy
ember falls straight down at **400 u/s** from 600 u above its **mark**, an ink circle on the ground 80 u wide that
fills with orange over the **1.5 s telegraph**. A dotted ember trail joins the burst to the mark for the whole fall,
so the spark's line is on screen before you would paint on it. At impact it splashes fire 80 wide and 60 tall for
0.35 s, which kills; the falling spark (radius 16) kills on contact. It burns out on vermilion (a stroke overhead is an
umbrella) and goes out on indigo. Through a ring it keeps 400 u/s and flies straight (1.6).

**Jumping a spark is fair.** A full jump keeps the feet above 60 u from 0.08 to 0.70 s, a 0.61 s window; the traveler
crosses the 106 u splash in 0.34 s. A jump started 0.1 to 0.35 s before the mark clears it.

**Lanterns:** x 1740, 2880, 5140. Stretches 5.2 / 3.7 / 7.3 / 10.8 s; the last stretch is the scroll's own exam.

**Hint (the only one):** `HINT_AIM = 'Fire goes through rings too. Flick a tail to aim.'` (49 characters, glyph 紫),
at x 1840. The S1 demonstrations show the spark and the answer before the line is read.

```ts
const b = new LevelBuilder('summer-2', 'The Dance Ground', '踊', 'summer', 802)
  .rules({ runSpeed: 310, inkMax: 100, inkRegen: 28, slowScale: 0.12, slowmoDrain: 4,
           inks: ['shu', 'ai', 'kin', 'murasaki'], startInk: 'murasaki', camLead: 0.22, rain: false, portalSpan: 850 });
const c = new Course(b, 520, mulberry32(802));
c.hint(420, 230, STORY_2, '踊').festoon(300, 9000).run(1000);      // 0→1000  stalls, lantern strings, yagura
c.spark(250, { landsEarly: 1.0 });                                  // S1a demo: mark 1250, lands 1 s before you
c.spark(550, { landsEarly: 1.0 })                                   // S1b demo: mark 1550 ...
 .herRings([1550, 370], [1730, 330], { aimAt: [1900, 290] })        //   ... caught by her pair ...
 .yokai(900, 230, 30, 20, { count: false });                        //   ... and sent into a high yokai at 1900
c.run(700).lantern().run(380);                                      // L1 @1740                    → 2200
c.hint(-360, 250, HINT_AIM, '紫');                                   // hint @1840
c.spark(-260, { loop: 2.2, after: -200 }).dip(-260, 120);           // S2 mark 1940; repeats every 2.2 s past x 2000
c.bramble(260);                                                     // S2 thicket 2290–2374         → 2540
c.run(300).lantern().run(260);                                      // L2 @2880                    → 3220
c.spark(300).dip(300, 120).yokai(620, 150, 32, 30);                 // S3 mark 3520 (timed); yokai 3840, 150 up
c.run(900);                                                         //                             → 4120
c.gap(520).spark(140);                                              // S4 gap 4120–4640; mark 4780 (timed, as you land)
c.run(460).lantern().run(240);                                      // L3 @5140                    → 5460
c.up(260).run(260).fire(190, 150).run(100);                         // S5 wall @5460 (ledge y 260); fire 5800–5990 → 6330
c.run(200).hanabi(0, 'great');                                      // the great firework opens    → 6530
c.spark(250).spark(600).dip(250, 120).dip(600, 120)                 // S6 marks 6780, 7130 (timed)
 .yokai(900, 110, 30, 40).yokai(1150, 130, 30, 40);                 //    yokai 7430 (110 up), 7680 (130 up)
c.run(1400);                                                        //                             → 7930
return c.end('summer');                                             // torii @8490, length 9250
```

**S1, two demonstrations (marks 1250 and 1550, not counted).** S1a: a spark lands on the road 1 s before you get
there: burst, trail, mark, impact, a scorch that fades. S1b: a second spark falls into her pre-painted ring at
(1550, 370), comes out of her other ring at (1730, 330) along its tail, and bursts a yokai hovering harmlessly high at
(1900, 290). The hazard and the answer, both shown in safety before the hint, as Celeste shows a new thing first.
- *Fail shows:* neither can hurt you (both land early, by position).

**S2, the thicket sandbox (mark 1940 behind you, thicket 2290).** The traveler stops against a 260 u thicket (at
x 2277). Once they have passed x 2000, a spark falls on the mark 337 u *behind* them every 2.2 s; the lantern string
dips over its line. It can't reach them. The hint sits just behind.
- *Intended:* ring A on the spark's line (about (1940, 370), 150 up). Ring B, the **window**, to the left of the
  thicket **and above head height**: about (2220, 390), so its bottom is 80 u up, its right edge (2270) clears the
  thicket (2290), and it is 84 u from the stuck traveler's box. The default straight-ahead spout already points at the
  thicket. The spark comes out at 400 u/s, crosses 70 u, the thicket burns, +15 ink back. Retries are unlimited.
- *Alt 1:* Gold on the thicket, 6 ink (cheaper; accepted, risk R1).
- *Alt 2:* a pair that carries the traveler past the thicket (the 起 skill; A around yourself, B beyond it), 41.
- *Check:* even a careless B painted around the stuck traveler can't grab them: rule 4 (1.3) says the completing ring
  ignores what is already inside it. A pair is 41 of 100 ink (26 net).
- *Fail shows:* a badly placed A: the spark lands on its mark again, harmlessly, and the loop repeats. A badly aimed B:
  the spark visibly flies off and fizzles after 480 u.

**S3, a spark on your head and a yokai behind it (mark 3520 timed, yokai 3840 at 150 up).**
- *Intended:* A on the spark's line above head height (about (3520, 380)); B to the left of the yokai at its height
  (about (3700, 370)), spout at it. The spark is caught about 1.15 s into the telegraph, flies 140 u in 0.35 s, and
  the yokai is gone about 1.5 s in; the traveler reaches its x at 2.5 s. One pair removes both threats (41, 26 net).
- *Alt 1:* jump the splash (timing above) and Gold the yokai (5).
- *Alt 2:* a vermilion umbrella over the mark (about 120 u of stroke, 8 ink), then Gold.
- *Check:* the yokai's lowest point is 150 − 30 (bob) − 25.6 (0.8·r) = 94 u up, but yokai lean up to 50 u toward the
  traveler, down to 44 u, so it is a real threat.
- *Fail shows:* the cause flash (N10) outlines the splash or the leaning yokai.

**S4, bridge or door, and a spark as you land (gap 4120–4640, mark 4780 timed).** Mixing in an old ink.
- *Intended:* a vermilion bridge (520 x 1.15 x 0.065 ≈ 39) and, while crossing, catch the spark in A (above head over
  the mark) with B pointed anywhere safe, e.g. straight up. 80 ink, inside Kohaku's 100.
- *Alt 1 (cheapest):* one pair across the gap (A about 4090, B just past the far edge, 610 apart, inside the 850 reach).
  The teleport carries you past the spark's trigger (x 4315), so it lands 1.5 s later, behind you: the door that
  dodges. 41.
- *Alt 2:* bridge, then jump the splash as you land. *Alt 3:* bridge and an umbrella (47).
- *Check:* Kohaku's best leap at 310 is 441 + 31 coyote = 472 < 520, so he paints too.
- *Fail shows:* landing in the splash shows the mark and the cause flash; a short bridge is the usual fall.

**S5, a breather with old inks (a 260 wall at 5460, fire on the ledge at 5800).**
- *Intended:* a vermilion ramp (260 x 1.6 x 0.065 ≈ 27) and an indigo stroke through the fire (9). 36 ink.
- *Alt 1, the ember (the scroll's idea applied to fire that doesn't fall):* climb, then paint A on the fire (R ≥ 48)
  and B with its tail flicked up into the sky. The fire lifts out as an ember and flies off. 41.
- *Alt 2:* one pair from the wall's foot to the ledge past the fire (A about (5400, 475), B about (6040, 215); about 690 apart, inside the 850 reach). 41.
- *Alt 3 (Kohaku):* jump and fox-leap the wall (276 ≥ 260, tight), then jump and leap the fire (w 190 ≤ about 315).
- *Alt 4:* one indigo current up the face and through the flames (it douses as it is painted), then ride it.
- *Fail shows:* the existing fire death; the wall only stops you.

**S6, the exam and the set piece: two sparks, one window (marks 6780 and 7130, yokai 7430 and 7680).** The great
firework opens at x 6530; the two sparks are its heaviest embers, and the lantern string dips over both lines.
- *Intended:* A (R 45) on spark 1's line at about (6780, 140). B, the window, at about (7330, 140) (R 45, bottom 75 u
  up), spout straight ahead along both yokai; A to B is 550. Spark 1 goes A to B and bursts yokai 1. Paint C on
  spark 2's line (about (7130, 140)): rule 3 closes A and **B stays**. Spark 2 goes C to B and bursts yokai 2. Three
  rings, about 57 ink gross, 27 net after two echo refunds. The 20° aim assist covers the 20 u height difference.
- *Alt 1:* jump both splashes (1.13 s apart) and Gold both yokai (10).
- *Alt 2:* one vermilion umbrella about 400 u long over both marks (30), then Gold.
- *Alt 3:* two separate pairs (82); Kohaku needs the 1.1 s of refill between sparks (about 31) to afford it.
- *Fail shows:* as S3. A window aimed wrong sends the spark past the yokai, and the trail shows the miss.
- *Set piece, The Window:* about 5 s from the great firework's bloom to the second yokai bursting, with the dancers
  and the yagura behind. This beat rehearses Raijin, which is why it closes the scroll.

**Ren and Kohaku in 承.** Ren's 140 ink makes the stylish two-step answers comfortable (S4 bridge plus catch, S6 with two
pairs). Kohaku must be thriftier, or leap at S5. Neither can jump the S4 gap.

---

### 3.3 転 `summer-3` 雨 *The Evening Storm*

**Teaches:** in rain, vermilion washes away and rings don't.

**Mood, time, weather.** About 23:00. A yūdachi (夕立, a sudden summer evening downpour) rolls in over the river below
the festival. The scroll opens dry under a darkening sky. At the first rain zone the paper goes wet and dark, streaks
cross the wash, lantern light smears in puddles; festival-goers wait it out under stall awnings in the backdrop.
Mid-scroll the road runs through a **dry stall arcade** (draft B): lantern-lit eaves, rain loud on the roofs, the old
rules back for a moment. Out of it, one flash shows Raijin's drum ring in the cloud. Thunder stays far off. At the end
the shower passes upriver; the clouds stay heavy over the ridge ahead (the moon is saved for the gate). Story line:
*Thunder upriver. The blot is in the clouds.*

**Target length:** par **63.7 s** (13,940 u at 300 u/s, 11 obstacles).

**Rules:** `{ runSpeed: 300, inkMax: 100, inkRegen: 32, slowScale: 0.12, slowmoDrain: 4,
inks: ['shu', 'ai', 'kin', 'murasaki'], startInk: 'shu', camLead: 0.22, rain: { hold: 0.7, warn: 1.1 }, portalSpan: 800 }`
- `startInk: 'shu'` on purpose: the scroll opens with the old answer in your hand, and the dry first gap rewards it,
  so the reversal is felt, not told.
- Refill 32 ("the rain keeps the inkstone wet") pays for the extra rings the twist asks for; run speed 300 because the
  road is wet. A rain bridge carries **540 u** (2.2); every rain beat relies on that number.

**Lanterns:** x 2340, 4160, 6220, 7740, 10020. Stretches 7.4 / 6.1 / 6.9 / 5.1 / 7.6 / 10.5 s. 転 relearns a habit,
so its lanterns are as generous as 起's; the extra one sits under the last eave of the arcade.

**Hint (the only one):** `HINT_RAIN = 'Rain washes vermilion away. Rings hold.'` (39 characters, glyph 雨), at x 2620,
inside the first rain zone, 300 u before R2.

```ts
const b = new LevelBuilder('summer-3', 'The Evening Storm', '雨', 'summer', 803)
  .rules({ runSpeed: 300, inkMax: 100, inkRegen: 32, slowScale: 0.12, slowmoDrain: 4,
           inks: ['shu', 'ai', 'kin', 'murasaki'], startInk: 'shu', camLead: 0.22,
           rain: { hold: 0.7, warn: 1.1 }, portalSpan: 800 });
const c = new Course(b, 520, mulberry32(803));
c.hint(420, 230, STORY_3, '雨').festoon(300, 6400).run(1300);   // 0→1300   dry, clouds gathering
c.gap(500).run(500);                                            // R1 dry gap 1300–1800          → 2300
c.lantern();                                                    // L1 @2340                      → 2420
c.rain(true).run(500);                                          // RAIN ON @2420                 → 2920
c.hint(-300, 250, HINT_RAIN, '雨');                             // hint @2620
c.gap(700).run(500);                                            // R2 gap 2920–3620              → 4120
c.lantern().run(300);                                           // L2 @4160                      → 4540
c.up(300).run(500);                                             // R3 wall @4540, ledge y 220    → 5040
c.gap(640, 60).yokai(120, 70, 30, 30).run(500);                 // R4 gap 5040–5680 (far y 280); yokai 5800, 70 up → 6180
c.lantern().run(200);                                           // L3 @6220                      → 6500
c.rain(false).arcade(1320);                                     // RAIN OFF: stall arcade 6500–7820 (roof decor only)
c.run(300).gap(500).run(400);                                   // R5 "under the eaves" gap 6800–7300 (dry) → 7700
c.lantern();                                                    // L4 @7740, under the last eave → 7820
c.rain(true).flash(200, { raijin: true }).run(300);             // RAIN ON @7820; one flash @8020 → 8120
c.gap(380).run(160).gap(380).run(160).gap(380).run(400);        // R6 gaps 8120–8500, 8660–9040, 9200–9580 → 9980
c.lantern().run(200);                                           // L5 @10020                     → 10300
c.gap(640).run(260).gap(420).run(400);                          // R7 gaps 10300–10940, 11200–11620 → 12020
c.rain(false).run(600);                                         // RAIN OFF @12020; shower passes upriver → 12620
return c.end('summer');                                         // torii @13180, length 13940
```

**R1, the "before" picture (dry gap of 500 at 1300).**
- *Intended:* the bridge you know (500 x 1.15 x 0.065 ≈ 37 ink).
- *Alt:* a ring pair (41).
- *Check:* Kohaku's best at 300 is 427 + 30 coyote = 457 < 500, so everyone paints. (500, not draft A's 480, so the
  margin is 43 u, not 23.)
- *Fail shows:* the usual. This beat exists so the player crosses a gap the old way one last time.

**R2, the twist lands (gap of 700 at 2920, in rain), 580 u after a lantern.**
- *Intended:* a ring pair: A at the near edge (about 2890), B on the far ground (about 3670), 780 apart, inside the
  800 reach and inside the view (from 2830 you see to about 3750). 41 ink.
- *Alt 1:* **two bridges in a row:** one from the edge about 400 u out, then a second painted while walking the first,
  from its end to the far side. Each carries 540. About 30 + 23 = 53.
- *Alt 2 (Kohaku):* a 300 u bridge (22), then a fox leap from its end (427 ≥ 400).
- *Check:* a single bridge painted at the edge starts running about 210 u in, drips for 1.1 s, and is gone at 540 u:
  **160 u short.** A clear miss, not a near-miss. No jump works (234; Kohaku 457).
- *Fail shows:* the drips start under your feet 210 u in; you watch the bridge run, then fall. The cause is the rain,
  on screen, 2 s from a lantern. This is the scroll's central failure.

**R3, rain doesn't ban vermilion, it shortens it (a 300 wall at 4540).**
- *Intended:* a ramp painted **just before** the wall (300 x 1.6 x 0.065 ≈ 31); the climb takes about 1.4 s, under 1.8.
- *Alt:* a ring pair to the top (A at the foot, B about (4600, 175)). 41.
- *Check:* 300, not 280, so it is clearly out of reach for Kohaku (276); a 4 u miss would feel unfair.
- *Fail shows:* a ramp painted too early drips while you climb and goes under your feet; you slide back against the
  wall, which is safe, and the drips told you why.

**R4, rings plus an old ink (gap of 640 at 5040, dropping 60; a yokai guarding the landing at 5800, 70 u up).**
- *Intended:* Gold the yokai (5), then a pair across: A about (4990, 175), B anywhere on the far ground now that the
  yokai is gone, e.g. (5740, 235), 750 apart. 46 ink.
- *Alt 1:* Gold, then two bridges in a row (about 55).
- *Alt 2 (Kohaku):* Gold, a 300 bridge, then a fox leap (427 plus the extra air of the 60 u drop).
- *Check:* B painted over the living yokai fizzles (1.2) and the yokai flickers. B past the yokai (x ≥ 5870) is
  880 u from A, outside the reach.
- *Fail shows:* a fizzled ring and a flickering yokai, or the cause flash on the yokai.

**R5, under the eaves, the old rules (dry gap of 500 at 6800, inside the stall arcade).** The contrast beat.
- *Intended:* a vermilion bridge (37), painted as early as you like: it holds, because it is dry. Lantern light, rain
  drumming on the roofs, the paper dry and warm.
- *Alt:* a pair (41).
- *Check:* Kohaku's 457 < 500. The arcade is a gap between rain zones dressed with roof decor; there is no ceiling, so
  jumps are unchanged. The zone edge (a curtain of streaks at 7820) is visible 3 s ahead.
- *Fail shows:* the usual fall; nothing here washes.

**R6, the set piece: late vermilion still works (three 380 gaps with 160 islands, 8120 to 9580).** Out of the arcade
into rain; one flash (2.4 limits) outlines Raijin's drums in the cloud for half a second.
- *Intended:* three bridges, **each painted at its own edge** (28 each), on the thunder beat. Each carries 540 ≥ 380
  with 160 u of slack, and each starts dripping behind you as you leave it. Refill between bridges (1.8 s) is about 58.
- *Alt 1 (Kohaku):* three fox leaps (427 ≥ 380), no ink.
- *Alt 2:* three ring pairs (123 with refill between).
- *Check:* painting all three from the first island (the dry habit) fails: bridge 3 is 1,540 u of travel away and
  washes long before you reach it. One pair can't span two gaps (920 u plus margins > 800).
- *Fail shows:* you see bridge 3 drip and vanish **ahead of you** while you are still on bridge 1, and there is time to
  fix it: repaint it, or ring it. The best kind of failure is the one you can still save.
- *Set piece, Bridges in the Rain:* three red bridges dissolving one after another behind the traveler, in rhythm,
  under the flash. About 5 s.

**R7, the exam (gap of 640 at 10300, a 260 island, then a 420 gap).**
- *Intended:* a pair over the 640 (A about (10270, 235), B about (10990, 235), 720 apart). Rule 2 closes it behind you.
  Then a **late** bridge over the 420, painted within about 120 u of its edge (31). 72 ink; the island's refill
  (0.87 s, about 28) makes it comfortable for Kohaku.
- *Alt 1:* two ring pairs (82).
- *Alt 2 (Kohaku):* the pair, then a fox leap over the 420 (427, plus up to 30 of coyote time).
- *Alt 3 (Ren):* two bridges in a row over the 640 and a late one over the 420 (about 85 of 140).
- *Fail shows:* as R2 and R6. The 420 bridge painted too early is the classic death: it washes just before the far
  edge, and you watched it drip.

**Ren and Kohaku in 転.** They differ most here, deliberately for a twist. Kohaku's leap turns every 380 to 420 gap into
a jump, so his best line is short bridges plus leaps. Ren's 140 makes double bridges and spare rings cheap. Neither can
jump R2's 700 or R4's 640, so **both meet the core idea** at least twice.

**Why 転's pressure sits below 承's (section 5).** 転's difficulty is in the idea (unlearning the bridge), not the
hands: no falling hazards, generous lanterns, a little extra refill, and a dry breather. In Celeste the chapter after
a reversal gives you room. The pressure score measures execution, so 転 sits below 承 by design.

---

### 3.4 結 `summer-4` 送 *The Last Night*

**Tests:** everything so far (doors, exits in the air, reach, catching and aiming, rain, embers, the old inks), faster,
with fewer lanterns. Nothing new is taught, so there is no hint.

**Mood, time, weather.** About 00:30, Obon's last night, on the ridge path above the river. A lull: drizzle comes and
goes in bands while the storm circles back, and strays from it now reach the road. The festival is over; most lanterns
have gone out, and the checkpoint lanterns are fewer because they are going out (story). On the far bank, people carry
lanterns down to the water. Blue-black wash and wet paper make the four inks glow brightest here. Story line: *Obon's
last night. The lanterns are going out.*

**Target length:** par **68.9 s** (14,080 u at 330 u/s, 23 obstacles).

**Rules:** `{ runSpeed: 330, inkMax: 90, inkRegen: 26, slowScale: 0.14, slowmoDrain: 4.5,
inks: ['shu', 'ai', 'kin', 'murasaki'], startInk: 'murasaki', camLead: 0.22, rain: { hold: 0.9, warn: 1.1 }, portalSpan: 650 }`
- Every dial turns a little at once, so you feel it without naming it: faster run, smaller inkwell (Ren 126), slower
  refill, weaker and costlier slow motion, and the **650 reach**. A rain bridge carries **660 u** (2.2).

**The bolt, as a stray (`c.bolt`).** It costumes the spark: the same mark and position trigger, with a **1.2 s
telegraph**. The mark is an ink circle that crackles; a thin white-violet thread hangs from the cloud to the mark for
the whole telegraph and brightens toward impact; in the last 0.18 s the bolt drops at 2,400 u/s. **One rule differs:
the bolt is a column from sky to ground, 40 u wide, for 0.2 s, so it can't be jumped** (shown safely at E0). Answers:
catch it in a ring; hold a vermilion stroke over yourself (the bolt stops on it and shatters it); or arrive early
(an indigo current or a door past the trigger). A bolt out of a ring stops at the first thing it hits, burning a
thicket or bursting a yokai.

**Lanterns (the MUST fix): three,** at x 3840 (after E2), 6440 (after E4) and 9780 (after E6a). Stretches
11.3 / 7.9 / 10.1 / 10.7 s, so a death costs at most 11.3 s (draft A: 21.3 and 19.3). Still the scroll with the
longest mean stretch before the gate (10.0 s against 6.8 to 7.3 elsewhere), which is the brief's "fewer lanterns".

```ts
const b = new LevelBuilder('summer-4', 'The Last Night', '送', 'summer', 804)
  .rules({ runSpeed: 330, inkMax: 90, inkRegen: 26, slowScale: 0.14, slowmoDrain: 4.5,
           inks: ['shu', 'ai', 'kin', 'murasaki'], startInk: 'murasaki', camLead: 0.22,
           rain: { hold: 0.9, warn: 1.1 }, portalSpan: 650 });
const c = new Course(b, 520, mulberry32(804));
c.hint(420, 230, STORY_4, '送');
c.bolt(700, { landsEarly: 1.0 }).run(1000);                       // E0 demo bolt @700         → 1000
c.pillar(140).run(200).pillar(140).run(260).gap(420);             // E1 pillars 1000–1140, 1340–1480; dry gap 1740–2160
c.run(400).rain(true).run(300);                                   // RAIN ON @2560             → 2860
c.gap(540).bolt(160);                                             // E2 gap 2860–3400; mark 3560
c.run(400).lantern().run(200);                                    // L1 @3840                  → 4120
c.up(240).bolt(120).run(420).bramble(260);                        // E3 wall @4120 (y 280); mark 4240; thicket 4630–4714 → 4880
c.run(500);                                                       //                           → 5380
c.pillar(140).gap(480, 200);                                      // E4 pillar 5380–5520; gap 5520–6000 (far y 480)
c.run(400).lantern();                                             // L2 @6440                  → 6520
c.rain(false).run(200);                                           // RAIN OFF                  → 6720
c.bolt(300).bolt(600).bolt(900)                                   // E5 marks 7020, 7320, 7620 (0.91 s apart)
 .yokai(1200, 120, 30, 30).yokai(1400, 120, 30, 30).yokai(1600, 120, 30, 30); //   yokai 7920, 8120, 8320
c.run(1900).rain(true).run(300);                                  // RAIN ON @8620             → 8920
c.up(300).run(300).fire(200, 150);                                // E6a wall @8920 (y 180); fire 9300–9500 → 9740
c.lantern().run(200);                                             // L3 @9780                  → 10060
c.gap(420, 120).bolt(160).yokai(540, 120, 30, 30);                // E6b gap 10060–10480 (y 300); mark 10640; yokai 11020
c.run(800);                                                       //                           → 11280
c.pillar(140).gap(340);                                           // E6c pillar 11280–11420; gap 11420–11760
c.run(300).rain(false).run(700);                                  // RAIN OFF @12060           → 12760
return c.end('summer');                                           // torii @13320, length 14080
```

**E0, the stray, shown safely (mark 700, not counted).** The bolt hits the road 1 s before you get there, thread,
column and all: the costume and its one new rule before it can kill anyone.

**E1, a 起 remix under the reach (two pillars 200 apart, then a dry 420 gap).**
- *Intended:* **one pair spanning both pillars**: A about (940, 475), B about (1540, 475), 600 apart, inside the 650
  reach circle; then a bridge (420 x 1.15 x 0.065 ≈ 31). 72 ink.
- *Alt 1 (Kohaku):* the same pair, then a fox leap (470 + 33 coyote ≥ 420).
- *Alt 2:* two pairs, one per pillar (rule 2 closes each behind you), then the bridge.
- *Check:* stopped at pillar 1 (x 987) the view reaches 1910. A placed farther back than about 880 puts B outside the
  reach: the reach circle shows it while you paint.
- *Fail shows:* a "too far" ghost, or the K3-style fall. The cost of failing here (11 s back to the start) is 結's pressure.

**E2, the door that dodges (gap of 540 in rain, a bolt timed for your landing at 3560).**
- *Intended:* **one pair across the gap:** A about (2830, 475), B about (3460, 475), 630 apart. The teleport carries
  you past the bolt's trigger (x 3164), so its telegraph starts as you come out and it lands 1.2 s later, behind you.
  41 ink.
- *Alt 1:* a bridge painted within about 120 u of the edge (40 ink; carries 660 ≥ 540), then an umbrella over the mark,
  painted during the telegraph so it can't wash first (8), or a catching pair aimed anywhere safe (41).
- *Alt 2 (Kohaku):* a 100 u bridge (7), a fox leap from its end (503 ≥ 440), then an umbrella (8).
- *Alt 3:* an indigo current across (rain-proof, about 35 + drain) arrives early; the bolt lands behind.
- *Check:* Kohaku can't leap 540 (503). B on the far ground past the mark (about 3650) would be about 820 from A: outside the reach,
  which is why the dodge comes from the trigger, not from the exit position.
- *Fail shows:* a bridge painted early washes (drips); a bolt kill shows the column and the mark (cause flash).

**E3, catch and aim, in rain (a 240 wall at 4120, a bolt at 4240 just past the lip, a thicket at 4630).**
- *Intended:* a ramp (240 x 1.6 x 0.065 ≈ 25; or Kohaku's fox leap, 276 ≥ 240). Catch the bolt in A on its thread
  above head height (about (4240, 150)); B, the window, left of the thicket (about (4560, 160)), spout at it.
  **Lightning burns the thicket**, +15 back. 66 gross, 51 net.
- *Alt 1:* ramp, umbrella and Gold (25 + 8 + 6 = 39): three separate actions.
- *Alt 2:* ramp, then a door from the ledge past both the mark and the thicket (A about (4160, 235), B about
  (4764, 235), 604 apart). 66 ink.
- *Alt 3:* an indigo current up the face and along the ledge through the mark (arrives early), then Gold.
- *Check:* the old one-door skip from the wall's foot to past the thicket is 744 u: **outside the 650 reach.** If
  the traveler stalls at the wall, the bolt's clock pauses (3.0.1), so it never lands while they can't answer.
- *Fail shows:* an umbrella painted too early in rain drips away, and the bolt goes through where it was.

**E4, the exit in the air, forced by the reach (pillar at 5380 straight into a 480 gap that drops 200).**
- *Intended:* **one pair**: A before the pillar (about (5320, 235)); B in the air above the gap's last 100 u (about
  (5900, 220)), 580 apart. Come out at 330 and fall 231 u to the bank at y 480: 0.48 s, 159 u forward, landing about
  6070, past the edge at 6000.
- *Alt 1 (Ren):* B just past the pillar, then a bridge painted under yourself in slow motion while falling (about
  45). 86 of 126.
- *Alt 2 (Kohaku):* B over the middle of the gap (about 5760), then a fox leap: about 0.9 s of air while dropping 231,
  296 u forward, landing about 6070.
- *Alt 3:* two pairs, the second painted while falling (82): Ren only, really.
- *Check:* B on the far bank (about (6050, 435)) is 757 from A: outside the reach. So the air exit is the answer,
  not a trick, and the player who reads the reach circle sees why. The exit-speed floor (1.6) means it works even
  from a stall against the pillar.
- *Fail shows:* B too far back: you come out, fall short and watch the bank go by. The most instructive death in the scroll.

**E5, the set piece: the drum run (three bolts 0.91 s apart at 7020, 7320, 7620; three yokai 120 up at 7920, 8120,
8320). Dry.**
- *Intended:* the window. B (R 45) about (7470, 250), between bolt threads 2 and 3 and touching neither, spout at the
  yokai row (the aim assist covers the 10° slope). A on bolt 1's thread about (7020, 300); A to B 452. Bolt 1 bursts
  yokai 1. C on bolt 2's thread about (7320, 300): A closes, **B stays**; bolt 2 bursts yokai 2. D about (7620, 300):
  bolt 3 bursts yokai 3. Four rings at R 45 = 74 gross, **29 net** after three echo refunds. Refill over 0.91 s is
  about 24 per bolt, so Kohaku's 90 holds.
- *Alt 1:* three vermilion umbrellas (about 24; each shatters as it saves you), then Gold the yokai (15). 39 ink.
- *Alt 2:* an indigo current along the road through all three marks: at 560 u/s you pass each mark before its bolt
  (timed for 330). Then Gold.
- *Check:* the rings' bottoms are at least 135 u up, so you run under them. The yokai dip to about 40 u when they bob
  and lean (120 − 30 − 50): a real threat.
- *Fail shows:* a bolt kill shows the column; a yokai kill shows the yokai (cause flash).
- *Set piece, The Drum Run:* three thunderclaps, three bursts, in rhythm with Raijin's drums in the cloud. About 5 s.
  It rehearses the gate.

**E6, the final run in rain (L3 at 9780 sits between E6a and E6b).**
- **E6a (a 300 wall, fire on the ledge at 9300).** *Intended:* a late ramp (31; about 1.3 s of climb, under 2.0) and
  Indigo (9). *Alt 1:* a pair from the foot onto the ledge before the fire (about 384 apart), then Indigo. *Alt 2, the
  ember:* the ramp, then a ring on the fire with its partner's tail flicked off the ledge; the fire flies away. *Alt 3:*
  an indigo current up the face and through the flames. *Check:* the door from the foot to past the fire would be about
  752: outside the reach. Kohaku can't leap 300.
- **E6b (a 420 gap dropping 120, a bolt at 10640 as you land, a yokai 120 up at 11020).** *Intended:* a late bridge
  (33) and the catch: A above head on the bolt's thread (about (10640, 170)), B left of the yokai (about (10900, 180)),
  spout at it. 74 gross, 59 net. *Alt 1:* a door across the gap (about 524 apart) that passes the trigger, so the bolt
  lands behind you; then Gold the yokai (46). *Alt 2 (Kohaku):* a fox leap over the gap (470 + coyote, plus the drop),
  then the catch (26 net). *Alt 3:* bridge, umbrella and Gold (46).
- **E6c (a pillar at 11280, then a 340 gap).** *Intended:* one pair, A about (11220, 255), B on the far ground about
  (11820, 255), 600 apart. *Alt 1 (Kohaku):* B just past the pillar, then a fox leap. *Alt 2 (Ren):* B just past the
  pillar, then a late bridge (340 < 660).
- *Fail shows:* every death here has a cause the player has already seen. That is the promise a 結 has to keep.

**Ren and Kohaku in 結.** Kohaku's 90 ink makes the two-step lines tight (E2 alt 1 with a catch is 81 of 90), but his leap
gives him clean answers at E1, E2, E4, E6b and E6c. Ren's 126 makes the two-step answers comfortable and the falling
bridges (E4 alt 1) possible. Both can take every intended line.

---

### 3.5 門 `summer-gate` 雷 *Raijin's Gate*

**Tests:** his lightning is just another thing that goes through rings. Catch it and send it back until all eight
drums are clean. The boss is designed in section 4; this part gives the scroll's settings, layout and approach.

**Mood, time, weather.** About 02:00, the storm's heart over the river mouth. The town's last lanterns are tiny lights
in the valley behind. Black cloud fills the top of the scroll; Raijin rides it inside his ring of eight taiko, drawn
after Tawaraya Sōtatsu's *Fūjin and Raijin* screens in our ink style, with the blot soaked into his drums (story 3).
The approach and phases 1 and 2 are wind and thunder; phase 3 brings the downpour. When the eighth drum is clean
**the rain stops dead**, the cloud tears, the moon comes out, and the road runs on to a torii under it, into the Summer
ending. Story line: *Raijin's drums have drunk the blot.*

**Target length:** par **77.6 s** for a run that clears each phase on its first pass (19,320 u at 320 u/s). Each extra
pass of a phase adds one loop (14 to 16 s). A first clear with a few deaths will typically take 2 to 3 minutes.

**Rules:** `{ runSpeed: 320, inkMax: 100, inkRegen: 34, slowScale: 0.13, slowmoDrain: 4, inks: ['shu', 'murasaki'],
startInk: 'murasaki', camLead: 0.22, rain: { hold: 1.0, warn: 1.1 }, portalSpan: 650 }`, rain only in phase 3.
- Two inks, so the stones on a phone are two big targets. Gold has nothing to hit; Indigo would let you outrun the
  position-timed strikes, which skips the fight instead of winning it.
- Refill 34 is the chapter's highest: the fight asks for about one pair every 2.5 to 3 s (41) and refill covers 85
  to 105 in that time, plus 15 back per drum. **Ink is never what beats you here; aim and timing are.**
- A rain bridge in phase 3 carries **672 u**.

**Lanterns:** one inside each phase's loop seam: x 4300, 8800, 13700. Start to the first lantern 13.1 s; each phase
loop is 14.1 / 15.3 / 16.3 s, and you pass its lantern once per pass (section 4.5).

**Hint (the only one; the bolt was already shown in 結):** `HINT_GATE = 'Catch his lightning in a ring. Send it
back.'` (44 characters, glyph 雷), during the approach at x 1000.

```ts
const b = new LevelBuilder('summer-gate', "Raijin's Gate", '雷', 'summer', 805)
  .rules({ runSpeed: 320, inkMax: 100, inkRegen: 34, slowScale: 0.13, slowmoDrain: 4, inks: ['shu', 'murasaki'],
           startInk: 'murasaki', camLead: 0.22, rain: { hold: 1.0, warn: 1.1 }, portalSpan: 650 });
const c = new Course(b, 260, mulberry32(805));
c.hint(420, 230, STORY_GATE, '雷').hint(1000, 250, HINT_GATE).raijin('descend', 300).run(1400); // Raijin paints himself in
c.festoon(1200, 1700, { dip: 200 }).gap(1000, 240);                // G1 the ridge gorge 1400–2400, far bank y 500
c.run(400);                                                        //                         → 2800
c.arena(1, { length: 4500, pattern: 'single', tele: 1.6, hits: 2,  // P1 loop 2800–7300, lantern 4300
             marks: [900, 2300, 3100, 3900] });                    //   marks 3700, 5100, 5900, 6700
c.arena(2, { length: 4900, pattern: 'pair', within: 0.6, tele: 1.3, hits: 3, bob: 70,    // P2 loop 7300–12200, lantern 8800
             marks: [900, 2300, 3200, 4100], gaps: [[2620, 420], [3520, 420]] });       //   marks 8200, 9600, 10500, 11400; gaps 9920–10340, 10820–11240
c.rain(true);
c.arena(3, { length: 5200, pattern: 'triplet', within: 0.45, tele: 1.1, hits: 3, sweep: [0.55, 0.76], low: true,  // P3 loop 12200–17400, lantern 13700
             marks: [900, 2300, 3300, 4300], gaps: [[2720, 440], [3720, 440]] });       //   marks 13100, 14500, 15500, 16500; gaps 14920–15360, 15920–16360
c.rain(false).run(600);                                            // the rain stops dead; moonlight → 18000
return c.end('summer');                                            // torii @18560, length 19320
```

`arena(n, opts)` lays one phase loop: a flat **seam** 0–1600 at the arena height (y 500) with the phase lantern at
1500, then the loop's features, then a flat tail of at least 600; marks and gaps are relative to the loop start. A
strike group never starts within 120 u of a gap's far edge, so the traveler lands with time to look up.

**G1, the ridge gorge (x 1400, 1,000 wide, dropping 240), the approach set piece.** Raijin forms out of cloud ink
over the far side while you cross. A torn lantern string sags into the gorge.
- *Intended:* a door, then a bridge: A at the lip (about (1370, 215)); B in the air at the reach (about (1990, 230),
  620 apart); and a vermilion bridge from under B's exit down to the bank (about 430 u of stroke, 32 ink; dry, so it
  holds), painted in the same slow-motion breath. 73 ink.
- *Alt 1:* two pairs, the second painted while you fall from B (C under you, D on the bank), 82 ink.
- *Alt 2 (Ren):* two bridges in a row (1,000 x 1.15 x 0.065 ≈ 75 of 140).
- *Alt 3 (expert, The Ridge Leap; needs the launch state):* run off the lip into an entry hung 200 u down where the
  string sags (about (1540, 460)); you hit it at |v| ≈ 950. The exit about (2100, 440), 560 away, with its tail
  flicked 30° up, throws you about 426 u: you land near 2525, past the bank at 2400, one pair, 41 ink. **Fall
  deeper, fly farther.** Without the launch state the same line carries only 212 u and falls short, so this line
  ships only if the portal proof keeps the launch state (1.6).
- *Check:* no jump crosses 1,000; Kohaku's leap from B's exit carries about 290 u and lands short (about 2300), so he
  uses the bridge too. The entry at y 460 is inside the 280 u you see below your feet at the lip.
- *Fail shows:* a short bridge or a B too far back is the usual fall; you restart 4.4 s back, before Raijin.

**Strikes and gaps in the arena** (section 4 has the rules):
- **A single strike (P1).** *Intended:* A on the bolt's thread above head, B with its spout toward Raijin: the only
  way to break a drum. *Alt (survive without scoring):* a vermilion umbrella over the mark (8, shattered by the bolt),
  or a door past the mark (it passes the trigger, so the bolt lands behind you).
- **A pair 0.6 s apart, marks 192 u apart (P2).** *Intended:* one big ring centred between the two threads (each 96 u
  from the centre, so 0.8·R ≥ 96, R ≥ 120, about 49 ink) plus one window (20): two hits from one catch, 69 ink.
  *Alt:* the window rule, A for bolt 1 then C for bolt 2 with B kept (61). Or catch one and umbrella the other.
- **A triplet 0.45 s apart, marks 144 u apart (P3, in rain).** *Intended:* A with R ≥ 90 (0.8·R ≥ 72, about 37 ink)
  centred between threads 1 and 2 catches both; B is the window (20); C (20) catches bolt 3 while B stays. Three
  hits from one triplet, 77 ink gross, 32 net. *Alt:* catch one and umbrella the others (painted late, since rain washes
  umbrellas too), or a door past all three marks (41, no score).
- **Gaps (P2 420; P3 440 in rain).** *Intended:* a vermilion bridge (31 to 33); in rain it carries 672, so painting it
  at the edge is enough. *Alt:* a pair (41); Kohaku's leap reaches 456 + 32 coyote, clearing both.

**Ren and Kohaku at the gate.** Ren's 140 ink catches a whole triplet and still bridges the next gap without waiting
for refill, so Ren clears phases in fewer groups. Kohaku catches one or two bolts per group and leaps every arena gap.
Both see the same telegraphs.

## 4. The Raijin gate as an auto-runner boss

### 4.1 The arena and the stage

- **The road:** the storm ridge, flat at y 500 everywhere the strikes fall. One fixed vertical layout for the whole
  fight, so the eye learns one screen: road below, Raijin above. Phase 1 is flat; phases 2 and 3 add gaps **between**
  strike groups, never under one.
- **Raijin rides with the camera.** Horizontally he is anchored to the **screen**, so he never scrolls away;
  vertically he sits in world space above the road. He keeps pace while the world moves under him. He has no
  collision: the traveler can't touch him and he can't touch the traveler; only his lightning is dangerous. A ring
  painted within 100 u of his body sputters out (his storm tears it), so the drums can't be "ringed" directly.
- **Composition (16:9, `camLead` 0.22):** the traveler at 28% of the width; strike marks appear 352 to 512 u ahead
  (57% to 79%); Raijin's centre at 55% to 76% of the width, 280 to 320 u above the road. The view shows 440 u above
  the feet, so his whole drum ring (radius 110) is always on screen. Telegraph, catch, window and target all fit in
  the right two-thirds of one screen. (The story bible's top-left placement is discussed in 3.0 and section 8.)
- **The ring of eight taiko is the health bar.** Each drum is soaked in blot (story 3); a returned bolt knocks the blot
  out of one drum (splash of black, then the clean white drumhead). Phases need 2 / 3 / 3 hits. No HUD bar.

### 4.2 Anatomy of a strike (telegraph ≥ 1.0 s, every time)

For a strike with telegraph T (P1 1.6 s, P2 1.3 s, P3 1.1 s), in game time:

| t | What you see | What you hear |
|---|---|---|
| 0 | Raijin lifts a drumstick and hits a drum. A **mark** (an ink circle 80 wide) appears on the road and a crackling white **thread** (paper-white edged in ink-black, never a player ink colour) starts to grow down from the cloud toward it. | *don* |
| 0.3 | The thread reaches the mark. Its line is complete: **this is where to paint the catching ring.** | crackle |
| T − 0.5 | The mark fills in; the thread brightens. (No full-screen flash here: local light only.) | *don* |
| T − 0.18 | The bolt drops down the thread at 2,400 u/s. | rising hiss |
| T | Impact: a 40 u column for 0.2 s plus a ±40 u splash for 0.25 s, leaving a flat black scorch. It kills at **any height**, so jumping doesn't help (the rule shown in 結 E0). | **DON**, pitched to the music's key |

Strikes are position-triggered (3.0.1): a traveler at full speed reaches the mark at T. Slow motion doesn't change
the sync. The brief's test asserts impact − telegraph start ≥ 1.0 s for every strike type; the smallest is 1.1 s.

**Answers to a strike:** (1) catch it: a ring on the thread above head height; (2) a vermilion umbrella over the
mark, which saves you once and shatters; (3) a door past the mark. Only (1) cleans drums.

**Photosensitivity:** each strike group gets at most one full-screen flash, scheduled by the global limiter
(≤ 1 per 4 s, never 3 in 1 s, ≤ 20% luminance change, ≥ 80 ms ramps). A P3 triplet lands three bolts in 0.9 s, so
its three impacts share one flash and are otherwise lit locally.

### 4.3 Sending it back

- A caught bolt leaves the partner ring at 2,400 u/s along the spout, straight, for up to 0.5 s (1,200 u), tinted
  purple. A returned bolt can't hurt the traveler.
- **It hits** if it passes within **110 u** of Raijin's centre, through his ring of drums. Aim assist bends it up to
  20° toward him. From a window 300 to 600 u away, that is a cone of roughly ±31° to ±40°: generous on a phone, not
  automatic.
- **Each hit cleans the next drum** (clockwise from the top), knocks Raijin back 60 u, and earns the 15-ink echo
  refund. He scowls, then grins.
- **A window lasts one strike group.** Rings are painted on the world, Raijin moves with the camera, so a window
  drifts about 800 to 1,000 u back per group. Within a pair or triplet it survives (rule 3); for the next group you
  paint a fresh pair (about 41 ink against 85 to 105 of refill).

### 4.4 Three phases that get harder (no new controls)

| | Phase 1: *Drums* | Phase 2: *The storm builds* | Phase 3: *Raijin descends* |
|---|---|---|---|
| Drums to clean | 2 | 3 | 3 |
| Strike groups per pass of the loop | 4 single bolts | 4 pairs, 0.6 s apart, marks 192 u apart | 4 triplets, 0.45 s apart, marks 144 u apart |
| Telegraph | 1.6 s | 1.3 s | 1.1 s |
| Spacing between groups | 800 u (2.5 s) | 900 u (2.8 s) | 1,000 u (3.1 s) |
| Raijin moves | hovers (±10 u sway) | bobs ±70 u (3 s period), screen x 0.66 to 0.74 | sweeps 0.55 to 0.76 of the width (5 s period), sits lower (280 u up), bobs ±40 |
| Road | flat | two 420 gaps per loop | **rain** (bridges carry 672) and two 440 gaps per loop |
| What it asks | read a telegraph; one door, one window | catch two with one big ring, or move the door and keep the window; bridge between groups | aim at a moving target, catch three, paint bridges and umbrellas late in rain |
| Loop length | 4,500 u, 14.1 s | 4,900 u, 15.3 s | 5,200 u, 16.3 s |

Each phase adds **one** pressure on top of the last (two bolts, then a moving target, then rain), so each step up is
easy to name: the boss version of the chapter's ladder. In story terms the drums go from half-soaked and slow to the
whole ring beating at once (story 3).

### 4.5 The arena loop (from draft B; replaces scroll-roll wipes and the gust roll-back)

The phases are **position-triggered patterns on a loop**, the same on every pass, so they can be learned, and the run
never cuts away.

- **The wrap.** While a phase is unwon, crossing `loopEnd + 300` silently shifts the traveler, camera, strokes, rings,
  live strikes and particles back by the loop length. It is invisible because everything the camera can see around
  the wrap point (about 440 u behind to 1,120 u ahead on an iPhone) is flat seam at the same height in both places:
  the loop's last 600 u are flat, and the next phase's seam is flat for 1,600. The phase lantern sits at seam + 1500,
  just out of view at the wrap, and the arena backdrop is screen-anchored storm cloud. Strokes and rings more than
  600 u behind the traveler are dropped at the wrap.
- **One strike group sits in the seam** (at seam + 900, before the lantern), so a pass has no long dead stretch. It
  fires when you enter the phase and on every wrap; after a death you respawn past it.
- **Running out of groups** just means another pass: the loop comes round, the lantern relights as you pass it, and
  Raijin laughs. No teleport, no wipe, no penalty, no fall counted.
- **Clearing a phase:** the moment the last needed drum is clean, pending telegraphs snap back up into the cloud,
  Raijin rears back with a drum roll, the wrap turns off, and the rest of the loop runs strike-free (a breath; its
  gaps still need bridges) into the next phase's seam, whose lantern lights as you pass. **There is a lantern between
  every pair of phases.**
- **Clearing phase 3 (the finish, the clip):** the eighth drum comes clean. Time eases to 0.3x for 1.2 real seconds
  (a cinematic beat, not player slow motion); the drum ring rings out white; **the rain stops dead mid-fall**; the cloud
  tears and the moon comes out. Raijin's body is Sōtatsu-white again; he grins and drums the storm away downriver
  (story 3: freed, not killed). 600 u of moonlit road to the torii.
- **Fallback if the wrap costs too much** (decide at the Raijin proof): finite phases, each two passes long and laid
  out flat, where reaching the end unwon fires one huge telegraphed "great strike" (2.0 s) that kills, so the failure
  is clear. Lanterns and drum rules stay the same.

### 4.6 What failure and retry feel like

- **Struck:** a 0.15 s hit-stop. The cause flash (N10) outlines the bolt column and the mark you didn't catch, so the
  cause is on screen before anything changes. Then the existing death: an ink burst, the taiko, and Raijin's quick
  drum-roll laugh. **The music never stops:** his drums keep the beat through the respawn.
- **Respawn** after 0.9 s at the current phase's lantern (seam + 1530) with full ink and the usual 0.8 s of
  invulnerability. Rings are cleared (he has moved; an old window aims nowhere). **Drums already cleaned stay clean**,
  in this phase and earlier ones (Alto-style forgiveness; draft A's heal-on-death is a checkpoint choice, section 8).
- **Falling into a gap** is the same as being struck.
- **Time to retry:** the first mark after the lantern is 770 u on, so its telegraph starts 0.8 s (P1) to 1.3 s (P3)
  after you respawn, and the next strike lands **3.3 s after you die, in every phase**. One breath.
- **Optional assist (open question):** after three deaths in one phase, add 0.3 s to that phase's telegraphs,
  silently, and say so in the final report as an accessibility choice.

### 4.7 Lanterns between phases

A lantern sits in each phase's seam (x 4300, 8800, 13700), so every phase starts from its own lantern and every
death returns you at most one loop (≤ 16.3 s). The approach (including G1) runs 13.1 s from the start to the first.

### 4.8 Why it reads on an iPhone held sideways

- **One fixed layout:** road at the bottom, traveler on the left, marks on the right of the road, Raijin above them.
  The road is flat where strikes fall, so the camera never climbs during the fight.
- **Shape and motion, not colour:** a vertical thread and a filling ground circle telegraph the strike, plus Raijin's
  drumstick pose. His bolts are paper-white edged in black (negative space); returned bolts are purple (yours).
  Rings turn; nothing depends on hue alone.
- **Sound telegraph too:** *don … don … DON*, so a player looking at the wrong part of the screen still hears it.
- **Clear of the HUD:** the ink bar and stones are top left, the timer and pause button top right. On an 844 x 390 pt
  iPhone the scale is about 0.54 pt per unit, so his drum ring is about 60 pt in radius; the sweep is capped at 0.76
  of the width, putting the ring's right edge at about 701 pt, left of the pause button (708 to 752 pt).
- **Finger-sized rings:** the smallest legal ring (80 u across) is about 43 pt; the P2 big ring (R 120) is about
  130 pt. Two ink stones only, so both are large.
- **Health you can read across a room:** the drums turning from black to white on his ring.
- **Enough real time:** at 0.13x slow motion, P3's 1.1 s telegraph is about 8.5 s of real time if you start painting
  at once, plenty for two thumb-drawn rings (about 0.5 s each).
- **Light that doesn't hurt:** the photosensitivity limits in 4.2 and 2.4, checked on the recorded clip.

### 4.9 Tone

Raijin is a mischievous storm spirit with the blot soaked into his drums, drumming blind; he is in it as much as Ren
is (story 3). He laughs, scowls, grins; he is freed, never killed, humiliated or worshipped on screen. Nothing in the
fight touches Obon's remembrance: lanterns stay friendly checkpoints and no spirits of the dead appear as enemies.
The "no real religious figures" tension is the glossary's flag 8 and stays open for Zach (section 7).

## 5. Difficulty ramp

### 5.1 The pressure score

    P = D × (1 + K) × (1 + G / 20) × S × A

| Term | Meaning | Why it is in the score |
|---|---|---|
| **D** | hazards to answer per 10 s of par time. Each spark or bolt counts once (a P3 triplet is three). | how often you must decide something |
| **K** | the most ink one beat's intended line spends in one breath (gross, before refunds) ÷ **Kohaku's** inkwell, the smaller one | how close a beat runs to an empty inkwell |
| **G** | the longest stretch between respawn points, in seconds (start, lanterns, torii; in the gate, one pass of the longest phase loop) | what one mistake costs |
| **S** | (run speed ÷ 310) x (slow-motion scale ÷ 0.12) | a faster run and weaker slow motion leave less time to paint |
| **A** | 3.0 s ÷ the shortest reaction window (still obstacles: 920 u of view ÷ run speed; strikes: their telegraph) | falling hazards force you to act inside a deadline |

Every term comes from numbers a script can read from the level definition and its rules (N14); none is a judgement
call. Par time is the `Course` formula with the N1 changes (per-scroll run speed, gaps counted above a flat jump,
0.3 s per strike instead of 1.2). Par ink is 1.1 x the intended line's **net** ink (after echo refunds) + 20.

### 5.2 The table

| Scroll | Length (u) | Obstacles | Par time | Par ink | Lanterns | Lantern spacing, mean / max (s) | Ink budget, Kohaku / Ren (refill /s) | Peak beat ink | D | K | G | S | A | **Pressure** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 起 summer-1 | 9,040 | 7 | 43.6 s | 246 | 3 | 7.0 / 7.8 | 100 / 140 (32) | 41 | 1.61 | 0.41 | 7.8 | 0.78 | 0.95 | **2.3** |
| 承 summer-2 | 9,250 | 11 (4 sparks) | 43.4 s | 239 | 3 | 6.8 / 10.8 | 100 / 140 (28) | 61 | 2.53 | 0.61 | 10.8 | 1.00 | 2.00 | **12.6** |
| 転 summer-3 | 13,940 | 11 | 63.7 s | 403 | 5 | 7.3 / 10.5 | 100 / 140 (32) | 72 | 1.73 | 0.72 | 10.5 | 0.97 | 0.98 | **4.3** |
| 結 summer-4 | 14,080 | 23 (6 bolts) | 68.9 s | 429 | 3 | 10.0 / 11.3 | 90 / 126 (26) | 74 | 3.34 | 0.82 | 11.3 | 1.24 | 2.50 | **29.5** |
| 門 summer-gate | 19,320 * | 29 per first pass (5 terrain + 24 bolts) | 77.6 s † | 405 | 3 + one per loop pass | approach 13.1; loops 14.1 / 15.3 / 16.3 | 100 / 140 (34) | 77 | 3.74 | 0.77 | 16.3 | 1.12 | 2.73 | **36.6** |

\* The road for a run that clears every phase on its first pass. Each extra pass of a phase adds its loop.
† Par assumes first-pass clears (2 of 4 singles, 3 hits from 4 pairs, 3 hits from 4 triplets). Clearing earlier in a
pass doesn't shorten the run: the rest of the loop runs strike-free.

**Order: 起 2.3 < 承 12.6 < 結 29.5 < 門 36.6.** The gate is the hardest, as the brief requires.

**転 (4.3) sits below 承 on purpose.** The twist is hard in the head, not the hands: it asks the player to unlearn "paint
a bridge", with generous lanterns (max 10.5 s), a little extra refill, a dry breather and no falling hazards. A table
that showed 転 above 承 would mean the twist is being taught under pressure, the opposite of the Celeste ladder. The
jump from 転 to 結 is where the chapter turns: every dial at once, the 650 reach, lightning, fewer lanterns.

**Changes from draft A's table, and why.** 結 drops from 36.8 to 29.5 because its longest stretch falls from 21.3 s to
11.3 s (the MUST). The gate drops from 43.6 to 36.6 because the arena loop caps a death's cost at one loop (16.3 s,
not 25.6), and it stays above 結 because each bolt in a pair or triplet counts as a hazard. Counted one per group
instead, the gate would score about 22.5, below 結. So the gate's lead rests on the pairs, triplets and short
telegraphs, which is the honest reading of the fight; the ramp script prints both counts.

**Things the score does not capture, kept honest here.** Par times run 43.6 → 43.4 → 63.7 → 68.9 → 77.6 s: 起 and 承
inside the brief's 30 to 45 s for early scrolls, the rest inside 60 to 90. A first clear of the gate with deaths
will run 2 to 3 minutes. 承's pressure leans on A (sparks halve the reaction window); if playtesters find 承 harder
than 転 *and* 結 feels like a wall, the softest knobs are 結's run speed (330 → 320 gives 28.4) and its inkwell
(90 → 95 gives 28.8; both together 27.7). The ink figures leave out slow-motion drain and wobble; real players will spend 20 to 40% more, which
Pine's 1.6 x par-ink allowance absorbs.

## 6. Engine needs

New `Course` / `LevelBuilder` beats and level features this design requires, each with a proposed API. **P0** = the
checkpoint-1 greybox can't be played without it. **P1** = needed for the finished chapter; the greybox can stand in.
Names are proposals; the Foundation and engine owners pick the final ones. Nothing here adds ceilings or overhang
collision: the view limit, blot pillars and the span cap make every "you can't go over it" situation this chapter
needs, and every new collision rule is one more thing to read on a phone.

| ID | Need | Pri | Proposed API / change |
|---|---|---|---|
| N1 | Par and counts follow each scroll's rules | P0 | `Course.end()` divides by `this.b.L.rules.runSpeed`; `gap()` counts a gap wider than `0.78 * runSpeed` (today a hard-coded 240); a private `count(kind: 'terrain' \| 'strike', ink, refund = 0)` used by every beat; par time adds 1.2 s per terrain obstacle and 0.3 s per strike; par ink = 1.1 x (ink − refund) + 20. Call `b.rules()` before `new Course()`. |
| N2 | Rules additions | P0 | Extend `ScrollRules` (Foundation's `src/level.ts`): `startInk?: InkKind` (default `inks[0]`); `camLead: number` (default 0.18, so old scrolls are unchanged); `rain: false \| { hold: number; warn: number }` replacing `rain: boolean`, with `mergeRules` clamping `warn ≥ 1.0`; `portalSpan: number` (default `Infinity`). `Game.start()` uses `startInk`. |
| N3 | Camera lead per scroll | P0 | `updateCamera()`: `tx = px + viewW * rules.camLead`. Summer uses 0.22 (about 920 u ahead at 16:9). |
| N4 | **Portals** | P0 | `interface Ring { cx; cy; r; spout: Vec; stroke: Stroke; born: number; lastIn: number; state: 'waiting' \| 'linked' \| 'closing'; fixed?: boolean; ignore: Set<object> }`; `Game.rings: Ring[]` (≤ 2 player rings plus fixed ones). `fitRing(pts): RingFit \| { fail: 'open' \| 'small' \| 'large' \| 'flat' \| 'blocked' \| 'far'; ghost }` run incrementally in `extendPaint()` (snap feedback) and finalised in `endPaint()`. Pairing rules 1 to 5 (1.3) including the reach circle and the completing ring's ignore set. Capture (1.6): body box vs 0.8·R moving, vs R when stopped (grounded, \|vx\| < 20). Exit at `max(\|v\|, runSpeed)` along the spout; lift onto ground if the feet would be inside it. Undo removes the newest player ring. Render: turning dashes, tomoe spout, waiting vs linked look, reach circle, ghost circle. |
| N5 | **Blot pillar** | P0 | `Course.pillar(w = 140, opts?: { h?: number = 900; count?: boolean = true })` → `LevelBuilder.pillar(x, w, h)`: closes the span, adds an island `[x, x + w]` at `y − h`, records `Level.pillars: { x, w, yTop }[]`, counts 1 obstacle with 41 ink, keeps decor clear 120 u each side. In `Game`, any non-purple stroke (`extendPaint` and `endPaint`) with a point in `[x − 24, x + w + 24]` is soaked: removed over 0.4 s with a paper hiss, half refunded. Drawn as a wet black column with a fibrous bleed edge and drips, no face (story's blot rules). |
| N6 | **Telegraphed strikes** (sparks, stray bolts) | P0 | `interface Strike { kind: 'spark' \| 'bolt'; x; tele; trigger; loop?; after?; early?; count; state; t }`, `Level.strikes`. `Course.spark(dx, opts?)` and `Course.bolt(dx, opts?)`, `opts = { landsEarly?: s; loop?: period; after?: dx; tele?: s; count?: boolean }`. Trigger at `mark − runSpeed * tele` (passing it by teleport or current also triggers). **The telegraph clock pauses while `stuckT > 0`.** Sparks: 600 u above, 400 u/s, tele 1.5, splash 80 x 60 for 0.35 s. Bolts: tele 1.2, last 0.18 s at 2,400 u/s, a 40 u column for 0.2 s that kills at any height. Vermilion overhead stops either (a bolt also shatters that stroke); indigo puts sparks out. |
| N7 | Projectiles, embers, hits and the echo refund | P0 | A projectile after a ring is `{ kind: 'spark' \| 'bolt' \| 'ember'; x; y; vx; vy; life }`, flying straight. Aim assist ≤ 20° toward the nearest thicket, yokai or drum in front of the spout. Hits: thicket → `alive = false` + burn effect; yokai → `banish()`; drum → N11; terrain or end of life → spark/bolt fizzle, **ember drops and re-forms as `Fire { w: 120, h: 110 }` where it lands** (none over a gap or on indigo). Painting a ring on a fire (centre within its width, R ≥ w/4) removes that `Fire` and sends an ember from the partner. Each hazard or drum destroyed by a projectile adds 15 to `inkAmt` and subtracts 15 from `stats.ink`. |
| N8 | **Rain zones and washing** | P0 | `Course.rain(on)` records `[x0, x1]` into `Level.rainZones`. `Stroke.inRain: boolean`, set when a `shu` stroke is made (bbox overlaps a zone). The wash state is **derived from age** (`t − bornT` against `hold` and `warn`), so replays need no extra data. `surfaceBelow()` skips washed strokes. Render: drips, colour drift, bleed streaks, dissolve. HUD: drops on the 朱 stone while the traveler is in a zone. Test hook: emit stage timestamps so the brief's "≥ 1 s warning" assertion can read them. |
| N9 | Wall nudge text by obstacle | P0 | `drawHUD()` reads **"Paint a door"** when the wall in front belongs to a pillar (or when Purple is the scroll's only ink), "Paint a way up" otherwise. |
| N10 | **Cause flash** on death | P0 | `die(manual, cause?: { kind; x; y; w; h })`. During the 0.9 s of dying the cause is outlined in a red-brown ink ring; bolts add a 0.15 s hit-stop. Every kill path passes its own box. |
| N11 | **Raijin and the arena loop** | P0 (rough art) | `Course.raijin('descend', dx)` (the entrance) and `Course.arena(n, { length, pattern: 'single' \| 'pair' \| 'triplet', within?, tele, hits, marks, gaps?, bob?, sweep?, low? })`, which lays the seam (flat 1,600, lantern at 1,500), the gaps and a flat tail ≥ 600, and records `Level.raijin = { phases: { x0, length, ... }[], drums: 8 }`. In `Game`: screen-anchored position; the 110 u hit test; drum state (cleaned drums stay clean); **the wrap** (shift traveler, camera, strokes, rings, live strikes and particles by −length at `loopEnd + 300` while the phase is unwon; drop strokes and rings more than 600 u behind); phase clear (cancel telegraphs, wrap off); the finish beat (0.3x for 1.2 real seconds, rain stops); rings within 100 u of him sputter; rings cleared on death. Art in a new `src/render/raijin.ts`, drawn by code once at load into offscreen canvases (F1 holds: painted at runtime), with a 6+ frame strip (lesson 2). Fallback: finite phases with a closing "great strike" (4.5). |
| N12 | **Launch state** and fox-leap refresh | P0 for the proof, P1 for levels | `Game.launched: boolean`, set on a portal exit, cleared on landing, riding or jumping. While set: skip the x2.4 short-hop gravity, and pull `vx` toward `runSpeed` at 300 u/s² instead of `RUN_ACCEL`. Kohaku's `airJumps` refills on every exit. Only the optional G1 fling needs (a) and (b); the refill is used throughout. |
| N13 | Summer theme, sky and festival decor | P1 (greybox: `spring` theme) | `ThemeId` gains `'summer'`; `Level.sky: 'dusk' \| 'night' \| 'storm' \| 'storm-peak' \| 'moon'` (per scroll, and the gate switches to `'moon'` at the finish). `DecorKind` gains `'yatai'`, `'mukaebi'` (fire dish, decor only), `'toro'`, `'eave'`. Course beats: `festoon(x0, x1, opts?: { dip?: number })` and `dip(dx, depth)` (a lantern line on posts that lights in a cascade as you pass; dips signpost catch spots; the guide lantern of story device 1 slides along it and waits at hints and dips); `arcade(len)` (eave decor over a dry stretch, no collision); `hanabi(dx, size: 'first' \| 'small' \| 'great')` (a firework triggered when the traveler reaches it, so clips match); `flash(dx, opts?: { raijin?: boolean })` (a background flash through N19); `sketch(dx, above, r)` (a faint traced ring, decor only). |
| N14 | Ramp report | P0 for checkpoint 1 | `tools/ramp.mjs` builds each Summer level and prints length, obstacles (terrain and strikes), par time, par ink, lantern positions and spacing, ink budget, and D, K, G, S, A, P (section 5), with the gate also scored one-per-group. Fails unless 起 < 承 < 結 < 門. Needs `Course` to record each beat's ink (gross and refund) and the shortest telegraph. |
| N15 | Rings across deaths | P0 | Normal scrolls: player rings stay across a death, like strokes. Gate: cleared on death (N11). Fixed rings always stay. |
| N16 | Autoplay routes | P0 for "every scroll can be beaten" | One route per scroll following the **Intended** lines in section 3, with real input; a `ring(cx, cy, r, aimDeg?)` helper in `tools/shot.mjs` that emits points for the existing `paint()` driver (a 330° arc, a closing overlap, an optional tail). Each route doubles as a layout check and trailer footage. |
| N17 | Recording for clips | P1 | `Frame` in `src/replay.ts` gains `rings`, `strikes`, projectiles and Raijin's state (drums, pose, position); washing is derived from age (N8). New recorder marks `'portal'`, `'return'` (a drum hit) and `'echo'`, which the clip picker ranks highest, so Purple and Raijin show up in clips (brief section 6). The arena wrap is recorded as a shift event. |
| N18 | Her pre-painted rings | P0 | `Course.herRings(a: Vec, b: Vec, opts?: { aimAt?: Vec })` → `Level.fixedRings`: a linked pair drawn in her pale wash with a thin purple rim; never closes, doesn't count toward the limit, survives deaths (story device 2). |
| N19 | Flash limiter (photosensitivity) | P0 for 結 and the gate | One scheduler owns every full-screen luminance change: ≤ 1 per 4 s, never 3 in any 1 s, ≤ 20% change, ≥ 80 ms ramps; groups share a flash; everything else is local light. A test script reads frame luminance from a recorded clip and fails on a breach. |
| N20 | iOS haptic on ring snap | P1 | Add `@capacitor/haptics` (a new dependency: the package.json and iOS sync owners), call `Haptics.impact({ style: 'light' })` on a snap; no-op on the web. |
| N21 | Narrow windows keep the reach visible | P1 | Zoom out so at least 920 u is visible ahead: `zoom = min(1, viewW / 1280)` when `camLead` is 0.22. iPhones are wider than 16:9 and never zoom. |

**Order to build in:** N2, N3, N1 → N5, N4, N18, N9 (enough to play 起) → N6, N7, N13's `festoon`/`dip`/`hanabi`
(承) → N8 (転) → N10, N15, N19 (the fairness pass, before anyone judges 結) → N11, N12 (門) → N14, N16 → N13
(the rest), N17, N20, N21.

## 7. Risks and open questions

### 7.1 Not verified (said plainly)

**Nothing in this design has been played.** Portals, rain, pillars, strikes and Raijin don't exist in code yet. Every
number comes from the constants and step code, run through a scratch copy of the `Course` cursor and a 240 Hz
integration of the jump, fox-leap and fling arcs. The engine has run acceleration, coyote time and step-ups, so real
distances will differ by a few percent. The proof pages (phase 2) and the greybox autoplay routes must measure, in
the running game, first the tightest lines:

1. how often thumb-drawn and mouse-drawn rings close at the proposed tolerance, and how often hooks falsely snap (1.1);
2. traveler exit speed and direction, including the stopped-at-a-pillar case and the full-radius capture (1.6);
3. that spark and bolt marks line up with a traveler at full speed and in slow motion, and that the stuck-pause
   rule holds at 結 E3 (3.0.1);
4. rain bridge reach: 540 / 660 / 672 u (2.2);
5. the reach margins: 結 E2 (630 of 650), E6c and E1 (600), 転 R2 (780 of 800);
6. the air exits: 起 K5 alt 1, 結 E4 (lands about 70 u past the edge), and Kohaku's mid-air leaps at 起 K3/K5 and 結 E4;
7. the G1 fling with and without the launch state (426 vs 212 u);
8. the arena wrap: that nothing visibly jumps on an iPhone (the widest view) and in a recorded clip.

### 7.2 Risks

| # | Risk | Effect | Mitigation |
|---|---|---|---|
| R1 | Gold makes 承 S2's sandbox cheaper (6 ink) than its lesson (26 net) | some players skip "fire goes through" | the stop, the hint and the repeating spark push toward the ring; S3 and S6 teach it again. If playtests show skipping, add a per-section inks beat (`c.inks([...])`) that withholds Gold until L2. |
| R2 | **View width.** Intended exits assume about 920 u visible ahead (16:9, `camLead` 0.22). A 4:3 window shows about 690. | K2, K5, E4 and R2 become impossible on narrow windows | N21 zoom-out. iPhones are wider and safe. |
| R3 | **Deviations in the portal rules:** exit speed floor (`max(\|v\|, runSpeed)`), the ember leaving at 400, and the launch state | they bend the brief's "keeping its speed" | deliberate (1.6); each is a switch on the proof page for Zach. |
| R4 | Rules 2 and 4 (doors close behind you; the completing ring ignores what is inside it) add rules | the system is less simple to explain | never explained in game; they only remove traps. A/B rule 2 against plain rule 3 on 起 K2. |
| R5 | Sparks can be jumped, bolts can't | two costumes, two rules | 結 E0 shows the bolt's full column safely first; a falling ember and a sky-high column look different. |
| R6 | **"Outrunning the drum"** (a door or current past a strike's trigger) dodges most strikes cheaply | the catch-and-aim lines get skipped in 承 and 結 | it's a real portal trick and the reach cap shortens it; the echo refund makes catching cheaper net; in the gate dodging never scores. Watch at checkpoint 1. |
| R7 | The reach tightens to 650 in 結 without a hint | a "too far" fizzle feels like a new rule | the reach circle shows from 承 on whenever you paint a partner ring, and E1 (two pillars, 600) is the first place it binds, with a safe stop in front. |
| R8 | The arena wrap is new engine work | a visible pop or a bug in strokes or rings | test on the widest view and in clips (7.1 item 8); fallback: finite phases with a closing great strike (4.5). |
| R9 | **Performance** (F2): rain, two rings, three bolts, Raijin and the wash on screen at once | frames over 8 ms p95 | rings are two arcs and a dash pattern; ≤ 3 bolts and 1 spark live; rain is tiled streaks plus ≤ 100 particles; Raijin is pre-drawn to offscreen canvases at load. Measure gate phase 3 and 転 R6 with `tools/perf.mjs` under 4x throttle. |
| R10 | The ember re-forms as a fire where it lands | a player can set their own road on fire | that's visible and fair (the spout shows where it goes); the default spout points ahead, so the proof page should check whether ember exits default to "up" instead. |
| R11 | Kohaku's 90 ink makes 結's two-step lines tight (E2 alt 1 with a catch is 81 of 90) | Kohaku can't take every showy line | cheaper lines exist, and the echo refund returns 15 per hit; raise the inkwell to 95 if the director wants them open to both. |
| R12 | Haptics need a new Capacitor plugin | no haptic on iOS without it | N20, owned by the package and iOS owners; the visual and audio snap carry it meanwhile. |
| R13 | Story placement suggestions (Raijin top-left; guide lantern waits at each new idea) differ in detail from this layout | art and level disagree | Raijin stays right of centre here for gameplay (3.0); the guide lantern waits at hints and dips. Both listed for checkpoint 1. |

### 7.3 Open questions (not checkpoint decisions)

- **Raijin and "no real religious figures"** (glossary flag 8): the story treats him as freed, never killed or
  worshipped; whether to name him on screen or use an unnamed thunder spirit in his look is Zach's call (section 8).
- **Glossary.** On screen this design adds only the glyphs 紫, 迎, 踊, 雨, 送, 雷 (all already in `docs/glossary.md`)
  and the English hint lines. Terms used only in this document or in decor that would need entries **if they ever
  appear on screen**: 花火 *hanabi*, 屋台 *yatai*, 巴 *tomoe*, 三つ巴 *mitsudomoe*, 蜩 *higurashi* (none are in the
  glossary today); 櫓, 夕立, 風鈴, 迎え火, 灯籠流し, 太鼓 are already there.
- **Should lanterns refill ink?** They don't today (only a respawn does). Recommend no: 結's ink pressure relies on it.
- **Should rain put out exposed ink fire?** Recommend no for Summer (the blot's fire burns on; rain hisses on it).

## 8. Decisions for checkpoint 1

Choices for Zach after playing the greybox and the portal and rain proof pages, each with my recommendation.

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | **Portal pairing** | (a) "the used entry closes", with doors closing behind the traveler; (b) strict pairs 1+2, 3+4 | **(a).** It keeps the aimed window through every catch (承 S6, 結 E5, the gate) and never traps you in a loop. Pick (b) only if (a) feels confusing with a finger. |
| D2 | **Portal aim** | (a) tail flick; (b) line aim (A's centre to B's centre) | **(a).** It is visible before use, it is the tomoe on his drums, and it lets you aim back. Pick (b) if thumbs struggle with the flick on Raijin phase 1. |
| D3 | **Direction** | (a) two-way (the brief); (b) one-way entries and exits (draft B) | **(a).** It matches the brief. (b) is a Deviation that would need your sign-off. |
| D4 | **Exit speed and the launch state** (Deviations from "keeping its speed") | floor at run speed on/off (also covers an ember leaving a stationary fire at spark speed); launch state on/off | **Both on.** The floor makes the stopped-at-a-pillar case work; the launch state makes upward exits keep their height and enables the optional G1 fling. If the launch state feels floaty, drop it and cut the fling line. |
| D5 | **Gesture tolerance and reach** | closing tolerance strict to generous; reach none / 850 / 800 / 650 vs unlimited | **Generous tolerance (44 u / 300°) on touch, and the tightening reach as proposed.** Tune on your iPhone with a thumb. |
| D6 | **Difficulty feel across the chapter** | 起 2.3 < 承 12.6 < 結 29.5 < 門 36.6, with 転 at 4.3 | **Keep the shape.** If 結 feels like a wall, lower its run speed to 320 and raise its inkwell to 95 (27.7) before touching geometry. If 承 feels harder than 転 in a bad way, slow the sparks' telegraph from 1.5 to 1.7 s. |
| D7 | **Gate deaths** | (a) cleaned drums stay clean (this design); (b) the current phase's drums re-soak on death (draft A, Celeste room reset) | **(a)** for Summer: deaths cost at most one loop and progress stays, which suits a phone. Choose (b) if the gate feels too easy at checkpoint 1. |
| D8 | **Arena loop vs finite phases** | (a) invisible loop; (b) finite phases with a closing great strike | **(a)** if the Raijin proof shows no visible pop; otherwise (b). |
| D9 | **Silent assist** after three deaths in one gate phase (+0.3 s telegraph) | on / off | **On**, reported as an accessibility choice. |
| D10 | **Raijin on screen** | right of centre (this design) or top-left (the story's Sōtatsu placement); named Raijin or an unnamed thunder spirit | **Right of centre and named Raijin**, freed not defeated, per the story bible. Revisit the name if the sensitivity review says so. |
| D11 | **Lanterns in 結** | three (this design); two; one | **Three.** One lantern was the MUST the critic raised; two would put the longest stretch near 17 s. |
| D12 | **Purple-only 起** | Purple only; Purple plus Vermilion | **Purple only.** One idea, and no vermilion shortcut around the pillars. |
