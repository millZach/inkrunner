# INKRUNNER: The Unfinished Scroll, story bible

Status: **draft for checkpoint 1** (studio phase 1, 2026-10-07). Zach approves the story text and direction at
checkpoint 1; until then everything here can change. Written from `BRIEF.md` section 5 (Story, Sensitivity,
Originality) and `CAMPAIGN-IDEAS.md` section 8. Every Japanese term here is checked in `docs/glossary.md`.
Reference images for Raijin and for Obon mood are in `shots/ref/` (git-ignored, see its README).

Contents
1. Logline and premise
2. Characters: Ren, Kohaku, Master Usuzumi, the blot
3. Raijin
4. Tone and sensitivity rules, applied
5. The campaign arc (for the template)
6. The Summer chapter: how the story threads through five scrolls
7. Cutscene format (shared by every cutscene)
8. PROLOGUE: five panels
9. SUMMER ENDING: four panels
10. What the cutscenes need from other owners
11. Open questions for Zach

---

## 1. Logline and premise

**Logline.** *A painter's last apprentice and the amber fox she painted first run across her unfinished scroll,
season by season, to finish the world before her last, unfinished stroke soaks it all back into black.*

**Premise.** Master Usuzumi painted the whole world on one long handscroll: villages, shrines, mountains, rivers,
the sea. (The weather and its gods are not hers. Raijin lives in the sky over the scroll; she never painted him.)
She died before the last stroke. Wet ink that is never finished does what wet ink does:
it runs. Her last stroke has begun to bleed outward along the fibers of the paper, soaking every place it reaches
into plain, flat black. The game calls it **the blot** (墨染, *sumizome*, "dyed in ink-black", the old word for
mourning clothes).

Her last apprentice, **Ren**, picks up her brush and steps into the scroll, onto its first page. **Kohaku**, the
fox she painted first, sitting beside the shrine on that page, wakes, leaps down from its painted place and
follows. (This is the one cosmology every cutscene keeps: the scroll is a world you can step into; Ren comes from
the master's room, and Kohaku comes from inside the painting.) Together they run the scroll season by season.
Everywhere they paint, color comes back, and the world map (itself a handscroll) fills in with the player's own
strokes.

**What it is about, underneath.** Finishing someone's work after they are gone. The blot is grief, not evil, and
the ending is a finished painting, not a dead monster. Summer is the chapter where the master comes back for one
night, the way the dead do at Obon, and then has to be let go.

**The rule the story never breaks:** the world is ink, and the only color in it is color someone painted. The master
painted Kohaku in amber; Ren paints vermilion, indigo and gold; the master lends purple through Summer and leaves
it to Ren, as her own ink stick, at the end. Nothing else in the cutscenes is colored.

---

## 2. Characters

### Ren 蓮 (the apprentice)

- **Who.** Master Usuzumi's last apprentice. Young, quiet, stubborn, not yet sure of being good enough. Ren's
  gender is deliberately left open: no pronoun ever appears on screen, and this document avoids them.
- **Look (existing renderer).** The straw *kasa* hat, scarf and obi from `Character('ren')` in
  `src/render/characters.ts`. The scarf takes the current ink's color. In cutscenes the scarf is the **only** color on
  Ren, and it shows whichever ink the panel is about (vermilion by default). In prologue panels P1 to P3, before Ren
  takes up her colors, the scarf is plain ink.
- **Want and arc across the campaign.** Wants to finish the master's scroll *the way she would have*. Learns, by the
  finale, to finish it in Ren's own way: the last stroke the player paints is Ren's, not a copy of hers.
- **Name.** 蓮 means lotus (on-reading *ren*). The lotus that grows clean out of mud is an old image; Ren grows
  out of the blot. (We never spell the symbolism out on screen.)
- **Ability (existing):** deep inkwell, 40% more ink. Story reading: the master gave Ren her biggest inkstone.

### Kohaku 琥珀 (the fox)

- **Who.** The first thing Master Usuzumi ever painted in color: a small amber fox sitting beside the shrine on the
  scroll's first page. When Ren steps into the scroll after her death, Kohaku wakes, leaps down from its painted
  place and follows (prologue P4). Curious, brave, a little vain about its tail.
  Kohaku cannot talk; it does not need to.
- **Look (existing renderer).** `Character('kohaku')`, the fox spirit that paints with its tail tip. In cutscenes
  Kohaku's accent is **amber** (its own color and its name: 琥珀 means amber), suggested `#d9902a` / light
  `#ffc66a`, clearly warmer and browner than gold ink `#ffb01a`. In play, the tail keeps taking the current ink color
  as it does today.
- **Ability (existing):** fox leap, one double jump. Story reading: it was painted mid-leap.
- **Ren and Kohaku travel together.** Whichever one the player runs as, the other appears in every cutscene, a step
  behind, from prologue P4 on; before that Kohaku is still a painting. (Detail in section 7.)

### Master Usuzumi 薄墨 (the master) — original character

- **Name.** 薄墨 *usuzumi* means "thin ink, diluted ink": the pale grey wash a painter uses for distance and mist.
  It is her painter's name (an art-name, the way Japanese painters took one), chosen because she painted the world
  in pale washes and saved color for very few things. It is an invented character and not a real person. I searched
  English and Japanese Wikipedia for a painter of that name and found none (the only English hit was an unrelated
  cherry-blossom festival page). On screen she is "Master Usuzumi" or "the master".
  *Resonance, for us only:* in Japan condolence envelopes are customarily written in thin ink. That custom is widely
  known but I did **not** find a dictionary page I could fetch to confirm it, so it is NOT VERIFIED and must never
  appear in game text.
- **Look (new figure, drawn in code).** An old woman painter: white hair in a plain low knot, a dark plain work robe
  with the sleeves tied back by a cord, bare feet, a long-handled brush nearly as tall as Ren. Drawn like the
  travelers, with tapered `brushLine` strokes and filled ink shapes. She is always seen in profile or from behind at
  three-quarters, so her face is a few calm strokes (closed or downcast eyes, a small smile). Never a detailed face.
- **Alive (prologue):** solid ink like everyone else, warm lamp light on her.
- **Returning at Obon (Summer):** drawn only in pale wash, `INK` at about 0.18 to 0.28 alpha, softly bleeding edges,
  with a thin purple rim light. She is not transparent-and-flickering, not floating-without-feet, not white-robed,
  not long-haired-over-the-face. None of the Japanese ghost-story signals (the *yūrei* look). Her feet are always
  drawn and always on something solid (floor, bank, a stepping stone), never on open water or in the air, and
  if she ever fades, her feet are never the first part to go. She looks exactly like herself, just painted thinner.
  That is the whole effect.
- **Purple.** Purple was hers: the one color she loved and never used on the scroll because she was saving it. She
  keeps it as an ordinary purple ink stick tucked in her sleeve cord. During Summer she **lends** it: her rings
  are pre-painted in it, and Ren's purple ink stone is drawn as a lent stone, outlined in purple with her pale wash
  inside (section 6). At the end of Summer she **leaves** it: she sets the ink stick down for Ren, and the stone
  fills solid purple (E3). She never conjures anything and grants no powers; she is a painter who gives away her ink.
- **How she guides (in play, required in `summer-1` and `summer-2`, see section 6):** the plain white first-Obon
  lantern Ren hung for her slides ahead of the traveler along the festival lantern line, and her pre-painted rings
  show the first portals. No figure appears in play; she only appears in cutscenes.

### The blot 墨染 (sumizome)

- **What it is.** The master's unfinished last stroke, still wet, running outward forever. It is not a creature
  with a will until the finale, and even then it is *her stroke*, not a demon.
- **What it does.** It soaks things into flat, shapeless black: no line, no wash, no white of the paper. A blotted
  pine is a pine-shaped hole of black with feathered edges. A blotted village is silent.
- **How to draw it, so it never reads as a shadow yokai.** Shadow yokai (`drawYokai`) have **eyes** and lean and
  flinch. The blot has **no eyes, no face, no limbs**. It is heavy wet black with a wicking, fibrous bleed edge
  (the way ink spreads in washi along the fibers), small satellite drips, and a faint wet sheen. It moves the way
  ink moves in water and in paper: slowly, then a sudden reaching tendril along a line, then slowly again. It is
  quiet. Its sound is a low paper hiss and a drip.
- **Its relation to the old enemies.** The shadow yokai and thorn thickets of Spring are things the blot touched
  that are still half-alive (that is why gold light dispels them). In Summer the blot climbs into the storm clouds
  (scroll 転) and soaks into Raijin's drums (the gate).
- **Why 墨染.** The word does not mean "stain". It means *dyed in ink-black*, and it is the classical word for
  mourning clothes and for a priest's black robes. A Kokin Wakashū poem (Kamitsuke no Mineo, mourning Fujiwara no Mototsune in 891) asks the cherry trees
  of Fukakusa to bloom ink-black "this year alone"; a district of Kyoto is still called Sumizome after it. So the
  blot is literally the world going into mourning for her. That is exactly our story. See the glossary flag: it is
  a poetic name, not a literal one, and we should never translate it on screen as "stain".
- **Ending of the whole campaign (decided 2026-10-07, not in this milestone).** The blot is her last stroke. In the
  finale, the player does not destroy it: they finish it, and it becomes the last stroke of the painting.

---

## 3. Raijin 雷神 (the Summer gate)

Reference: `shots/ref/sotatsu/sotatsu-raijin-left-screen.jpg` (Tawaraya Sōtatsu, *Fūjin and Raijin*, 17th century,
public domain; National Treasure, owned by Kennin-ji, Kyoto) and the Sōtatsu-school screen
`sotatsu-raijin-cleveland-2004-86.jpg` (CC0).

### Who he is in tradition (checked, see glossary)

- The god of thunder, lightning and storms in Japanese myth, at home in both Shinto and Buddhist art; in Buddhist
  art he and Fūjin (the wind god) often appear as attendants of the thousand-armed Kannon. Nearly every Japanese Raijin is
  drawn the same way: an *oni*-like figure with horns, wild hair, a tiger-skin loincloth, standing on a cloud,
  beating a **ring of small drums** (連鼓 *renko*) with two drumsticks (撥 *bachi*). The thunder *is* the drumming.
- He is feared and liked at once. People call him *Kaminari-sama*. Children are told to cover their belly buttons
  in a summer thunderstorm or Raijin will take them. Ōtsu-e folk pictures show him **fishing for a drum he dropped**
  from his cloud, with a hook on a line. He is a trickster with a grin as much as a terror.

### How Sōtatsu draws him (what we keep)

- **Pale.** Sōtatsu's Raijin is chalk-white with grey modeling, not dark. (His Fūjin is green.)
- **Corner, cloud, emptiness.** He is high on the left of the screen, on smudges of dark cloud, with a huge empty
  gold field to his right. The empty space is the composition. Our version: our paper is the gold field.
- **Where he looks (checked against `sotatsu-raijin-left-screen.jpg`, full and cropped).** His head turns **down
  and to the viewer's left**, toward the screen's outer edge, not toward the empty gold. It is his drum ring and
  his sash that reach into the empty field, not his gaze.
- **The drum ring** is a thin hoop of small drums that sweeps around him and runs out of the frame.
- **Motion** comes from a long dark sash (white on its underside) whipping in an S **to the right**, up and across
  the empty gold, and from his flung limbs.
- **Face:** a big, delighted grin, round eyes, two small horns, a mane of hair. He looks like he is *enjoying* this.
- **What we change:** no gold leaf (we are ink on washi); the tiger-skin is kept as a few striped brush marks; the
  green cloth becomes plain ink wash, because color in our world only comes from painted ink; and **we mirror his
  facing** (next section, "Motion direction check").

### Our Raijin, and how he relates to the blot

- **He is not the master's creation.** He lives in the sky over the scroll, as the weather does; she painted the
  world under it. (This keeps her an ordinary mortal painter and keeps a venerated kami from being "made" by an
  invented character.)
- **He is not the villain and he does not serve the blot.** On the night of the storm (scroll 転) the blot climbs
  into the summer clouds and soaks into his drums. Every drum it soaks beats out **blotted lightning**: strikes that
  leave a scorch of flat black where they land. He is drumming blind and furious, and he is in it as much as Ren is.
- **Look while blotted.** Patches of heavy blot-black spread over his white body like spilled ink, thickest on his
  drums and arms; his grin is a grimace; his sash is soaked black and heavy. The more blot, the slower and heavier
  his drumming sounds.
- **How he is beaten.** Only by catching his own lightning in a purple portal and sending it back into the drum ring.
  Every returned bolt knocks the blot out of drums: splash of black, then the clean white drumhead shows. Three
  phases, roughly a third of the ring each. The player *sees* progress on his body: black, then patchy, then white.
- **He is freed, not killed.** When the last drum is clean his body is Sōtatsu-white again, the grin comes back,
  and he drums the storm away downriver. In the Summer ending he fishes his dropped drum back out of the river
  (the Ōtsu-e joke), and Kohaku covers its belly with its tail (the belly-button joke). He is never humiliated,
  never shown dying, never worshipped on screen.
- **Phases (story reading only; the gate designer owns the rules).** 1: half the drums soaked, slow beats. 2: the
  blot pushes into the clouds, faster beats, rain. 3: the whole ring beats at once; he is fighting the blot inside
  his own drums. No new controls in any phase (brief).
- **Readability notes for the gate designer (suggestions, not rules).** His strikes are telegraphed on the ground
  for at least 1 s (brief). Blotted lightning should not share a color with any player ink: draw it as a jagged
  bright paper-white bolt edged in ink-black (negative space), so it stays readable for color-blind players and on a
  phone. Keep him in the top-left third of the screen like Sōtatsu, leaving the right two-thirds for the player and
  the portals. His drums are pitched to the music key (brief, Sound).
- **Motion direction check (lesson 2).** In the screen his head turns down and outward (to the viewer's left) and
  his sash streams inward (to the right, across the empty gold). **Ours is a deliberate mirrored redraw for
  gameplay, not a copy:** he faces right, toward the player and the empty paper, and his sash streams back to the
  left in wind from the right. Critics comparing him side by side with the screen should expect the facing and the
  sash to be reversed. One consequence for the gate designer: with him in the top-left and the sash streaming left,
  the sash runs toward the frame edge, so set him far enough in from the left edge for its S to show, and let the
  drum ring (not the sash) carry his reach into the empty paper. Needs a 6+ frame strip like every animated figure.

---

## 4. Tone and sensitivity rules, applied

- **Obon is gentle remembrance, never horror.** Obon is a real Buddhist observance when families welcome the
  spirits of their ancestors home for a few days and then send them back. In this story:
  - The master is welcomed, not feared. Nothing jumps out. No ghost-story signals (no *yūrei* look, no will-o'-wisp
    fireballs, no wailing, no "the dead are coming" framing). Shadow yokai do not appear in any cutscene.
  - Everything we show is a real, warm Obon custom, drawn simply: the **welcoming fire** (迎え火) on the first night,
    the plain **white lantern** a family sets at its gate at its *first* Obon after a death (初盆), the **cucumber
    horse and eggplant cow** (精霊馬) that let a spirit come home fast and leave slowly, **bon odori** dancing, and
    **tōrō nagashi**, floating lanterns down the river on the last night to see the spirits off.
  - Where we place them, with one artistic liberty and one regional choice (glossary flag 11): the white lantern hangs at
    the house's gate (as the source describes) and is **never floated**; on the last night Ren floats a separate
    plain lantern lit from its flame. The cucumber horse and eggplant cow are set on the **doorstep beside the
    welcoming fire** in `summer-1`. In real homes they go by the family altar or on the spirit shelf, which we do not
    show, so the doorstep is an artistic liberty. Floating lanterns are a **regional** custom, not something every
    family does; we show one riverside town that does it.
  - We do not show household altars, graves, sutras, priests, or Buddhist images, and we never put religious text
    on a lantern. Lanterns are plain.
  - The master leaves *willingly and smiling*. The sad part is Ren's, and it is short.
- **No real religious figures.** The master is invented. Raijin is the one deity on screen; the brief asks for him
  by name, and he is a folk-art figure as much as a god (see section 3). We never show Kannon, Fūjin's or Raijin's
  shrines, temple interiors, or any real shrine name. **Flag for Zach:** Raijin *is* venerated (shrines such as
  Kamigamo, the Raijin statue at Sensō-ji's Kaminarimon, the Kamakura-era statues at Sanjūsangen-dō). Our treatment
  keeps him a respected, freed, laughing figure, which is how popular Japanese art treats him, but it is a judgment
  call worth his eye.
- **Torii and goshuin.** The torii at each scroll's end and the 御朱印帳 stamp book are homages. Our seals are Plum,
  Bamboo and Pine marks, never a real shrine's name or a deity's name. (Glossary flag: in Japan there is real
  friction about treating goshuin as a stamp-rally collectible; see `docs/glossary.md`.)
- **Nothing from Ōkami** (brief, Originality): no wolf, no sun goddess, no Orochi, no "Celestial Brush" naming, no
  brush gods. Our painter is a mortal woman, our brush is an ordinary brush, our boss is a weather god caught in
  someone else's ink, and our final boss is a grief, not a serpent. The master is **not** a brush-god character:
  she did not create the gods or the weather, she has no powers on screen except painting, she never conjures a
  technique or hands a power to the hero by magic. What she leaves Ren is an **object**, her own purple ink
  stick, set down on a stone and picked up. Later colors are found the same way (section 5).
- **Text style.** Short, plain English in the past or present tense, like the existing hints ("The world is ink.").
  No exclamation marks. **One narrator voice: third person** (it matches the prologue and keeps Ren's gender open):
  never "we", "us" or "I". **Japanese in the English lines:** only proper names (Usuzumi, Raijin) and the festival's
  name, Obon. No other Japanese words; kanji appear only as the large brush glyph.

---

## 5. The campaign arc (for the template)

One short cutscene opens the campaign, one plays between chapters, one ends it. Behind each chapter's gate Ren
**finds** one more color the master left in that season: one of her ink sticks, an ordinary object left among
her things, never a power granted by a spirit. Summer is the only chapter where she hands one over herself, and
even then she sets it down rather than conjuring it. Only the prologue and the Summer ending are built in this
milestone; the rest is a sketch so Summer sets up the right things.

| Part | Story beat | Color won |
|---|---|---|
| Prologue | The master, the unfinished scroll, the blot, Ren and Kohaku set out. | Ren already carries vermilion, indigo and gold. |
| 春 Spring (the First Scroll, unchanged) | The village on the scroll's first page, where Kohaku was painted. The blot's first edges. | (the three inks are learned) |
| 夏 Summer: Obon, the thin night | The master comes back for Obon, lends her purple, guides them through the storm, leaves Ren her purple ink stick, and goes with the lanterns. | 紫 Purple (portals) |
| 秋 Autumn (later) | Mountain temples. The wind still carries her voice in the bells; Ren starts painting things she never painted. | 翠 Jade |
| 冬 Winter (later) | The long night. Ren learns to erase: some of her strokes were mistakes. | 白 White (胡粉 *gofun*) |
| 墨 The Ink Sea (later) | The blot rises as her last stroke. Ren finishes it instead of destroying it. | The full-color map |

Summer's job in the arc: it is the **only** time the player sees the master after the prologue, and it is where
Ren lets her go. Every later chapter is Ren working alone, so this chapter has to land warmly.

---

## 6. The Summer chapter: how the story threads through the scrolls

### The rule for story text in play

- **One story line per scroll, at the opening title spot**, in the same brush-text style as today's scroll titles
  (`c.hint(420, 230, 'The Snow Pass', '雪')`: a large kanji glyph with one italic line under it), before the first
  obstacle. It **never** tells the player how to do anything. That keeps it clearly separate from teaching hints.
- **Title or story line: which gets the slot.** `drawHint` (`src/render/terrain.ts`) draws one glyph and **one**
  line, so the two cannot share it. **In the scroll,** the opening spot shows the glyph and the **story line**.
  **The title** ("The Welcoming Fire") lives outside the scroll: on the map label, the scroll's card when it is
  chosen, and its stamp-book page. Today's scrolls keep their titles in the opening spot; only campaign scrolls
  switch to story lines.
- **Teaching hints stay at one per new idea** (brief), placed where the idea is first needed. They belong to the
  level designer; the lines below in *Suggested teaching hint* are only suggestions in the same voice.
- **No other text.** The rest of the story in play is told by the scene: the festival props, the storm, the guide
  lantern, her rings, the lent purple stone, how many lanterns are lit.

The brief's main story beat is "the master returns with the festival lanterns and guides Ren through the thin
night". This milestone has no cutscene of her return, so **the three devices below are how the player sees it.
They are required, not optional**, and they are listed as dependencies in section 10.

### Required device 1: the guide lantern (`summer-1` and `summer-2`; recommended in `summer-3` and `summer-4`)

A small plain **white paper lantern** (a *chōchin*): the first-Obon lantern Ren hung for the master at the gate
(see 初盆 in the glossary). It hangs from the **festival lantern line**, a thin cord strung on posts along the top
of the scroll with ordinary festival lanterns on it, and it **slides along that cord** ahead of the traveler,
swinging on its hook as it moves and settling when it stops. It waits at each new idea, then goes on. Where the
course runs on the river and the line ends, it sits on the water and is carried by the current. In `summer-1` the
line starts at the gate where Ren hung it, so the player sees it leave the gate.

It must always read as an **object**, never as a light with a will of its own (that is the *hitodama* /
will-o'-wisp reading, and the paper-lantern ghost): it is always visibly on the cord or on the water; its light is
plain warm lamp light (the `lanternGlow` palette) with **no colored rim, halo or trail**; it never has eyes or a
face; it is never a hazard or a target. It is not in the gate (the storm is no place for a paper lantern). In the
Summer ending it hangs again on its pole on the near bank, still lit. **Owner:** the Summer level / render owner.

### Required device 2: her rings (`summer-1` and `summer-2`)

- **`summer-1`:** at the very first portal, a pair of rings **already painted**, in her pale wash with a thin purple
  rim (her look, section 2). They work like the player's portals: the player runs through them once in a safe place
  before painting their own. This is the master showing the move once (a Celeste-style "show it safely first").
- **`summer-2`:** at least one more pre-painted pair ahead of the player, so that the story line "Someone ahead is
  painting doors in purple" is literally true on screen.
- Whether her rings count toward the player's portal limit, and whether they fade after use, is the portal owner's
  call (settled on the portal proof page). **Owners:** level designer (placement) and portal owner (pre-painted
  rings).

### Required device 3: the lent purple stone (all of Summer)

Until the Summer ending, the purple ink stone in the HUD is drawn as a **lent stone**: a crisp purple outline ring
with its body in her pale grey wash. The strokes it paints are full purple, as saturated, glowing and wet as the
other three inks (lesson 3 is about the strokes and is unchanged). The lent stone must **not** read as "disabled"
at phone size: same size, same selection glow, same key and tap target as the others; check it with
`tools/mobile.mjs`. In ending panel E3 it fills to solid purple, and it stays solid from then on, including on
replays of Summer scrolls (a "purple given" flag in the campaign save). That makes "lent, then left" a visible
change rather than a duplicate stone. **Owners:** HUD / `src/game.ts` owner (via a shared `drawInkStone`, section 10)
and the campaign data owner (the flag).

### Per-scroll story

Scroll ids follow the brief (`summer-1` … `summer-4`, `summer-gate`). Titles and kanji are **proposals** for the
level designer and the campaign data module; every glyph is in both bundled fonts (checked with `fc-query`).
The **title** goes on the map, the scroll card and the stamp book; the **glyph and story line** go in the scroll's
opening spot (see "Title or story line" above). All lines are third person.

| Scroll | Beat | Title (map, card, stamp book) | Glyph | Story line (in the scroll's opening spot) | Scene, in one breath |
|---|---|---|---|---|---|
| `summer-1` | 起 introduce portals | The Welcoming Fire | 迎 | *Her first Obon. Ren hung a white lantern for her.* | Dusk, cicadas. Small welcoming fires (迎え火) at the doors of a riverside village. At one house: the white lantern at the gate, and on the doorstep beside its welcoming fire a cucumber horse and an eggplant cow (section 4; the cow in a deep, matte purple-black wash, small, never glowing and never ring-shaped, so it cannot be mistaken for portal ink; a quiet foreshadow). The guide lantern slides off along the festival line and leads; her rings wait at the first portal. |
| `summer-2` | 承 portals with the old inks | The Dance Ground | 踊 | *Someone ahead is painting doors in purple.* | Festival night: strings of paper lanterns (the guide lantern's line), a drum tower (*yagura*) in the backdrop, bon odori dancers as small ink silhouettes far back, a fūrin chiming. Her pre-painted rings appear ahead of the player. |
| `summer-3` | 転 rain washes bridges away | The Evening Storm | 雨 | *Thunder upriver. The blot is in the clouds.* | A sudden summer shower (*yūdachi*). The festival scatters; lanterns sway; rain streaks, ripples and wet sheen. Raijin's drums far off, pitched to the music. |
| `summer-4` | 結 everything, fewer lanterns | The Last Night | 送 | *Obon's last night. The lanterns are going out.* | **A lull: the eye of the storm.** The rain thins to a drizzle and the thunder circles back toward the river mouth, growing again by the end. The checkpoint lanterns are fewer, and that *is* the story: they are going out. On the far bank, people carry lanterns down to the water. |
| `summer-gate` | 門 Raijin | Raijin's Gate | 雷 | *Raijin's drums have drunk the blot.* | The storm comes back at full strength over the river mouth: its heart. Raijin top-left on his cloud, the blotted drum ring, wide empty paper for the player. |

Weather runs in one line: dusk (1) → festival night (2) → the storm breaks (3) → the eye of the storm, a lull
with the thunder circling back (4) → the storm's heart (gate) → after the storm (ending E1).

Lines run 35 to 50 characters, no longer than the First Scroll's longest hint today (50 characters,
*"Press 2 for Indigo. Paint a current, then ride it."*), so they fit wherever today's hints fit. The level designer
should still look at them at phone size with `tools/mobile.mjs`.

### Suggested teaching hints (level designer's call; each is one new idea)

| Scroll | New idea | Suggested line | Glyph |
|---|---|---|---|
| `summer-1` | Purple portals | *Paint two purple rings. Run into one, out of the other.* (touch: *Tap 紫 for Purple. Paint two rings…*) | 紫 |
| `summer-2` | Things ride portals too (fire, yokai) | *Whatever goes in comes out. Even fire.* (only if the designer treats this as a new idea; otherwise no hint) | none |
| `summer-3` | Rain washes vermilion | *In rain, vermilion runs. Don't stand on it long.* | none, the scroll's 雨 already shows |
| `summer-4` | none (test) | none | |
| `summer-gate` | Lightning rides portals | *Catch his lightning in a ring. Send it back.* | none |

Her rings at the first portal in `summer-1` (required device 2 above) are where story and teaching meet: the
player runs through her rings before reading the purple hint and painting their own.

### What the player should feel across the chapter

起 warm and curious (someone is with them) → 承 festive, a little chase (who is painting ahead?) → 転 the storm
turns everything (the bridges wash away, the purple is now the only way) → 結 quiet urgency (lanterns going out,
she cannot stay past dawn) → 門 the thunder (big, readable, and in the end funny and kind) → the ending (let her go).

---

## 7. Cutscene format (shared by every cutscene)

These are the rules the prologue and the Summer ending both follow, and every later cutscene should too.

**What a cutscene is.** A short painted handscroll of its own: 3 to 5 panels, about 20 s, brush text, no voices,
skippable. Each panel is an ink painting on the same washi paper as the game, and **paints itself in** when it
appears (the strokes draw on along their length, then the wash blooms), which is our signature motion and matches
how player strokes already wet-bleed and dry. All art is drawn at runtime in code (F1); there are no image files.

**Space.** Design space is the game's: `VIEW_H = 720` units tall, width set by the screen (about 1280 at 16:9,
about 1560 on an iPhone in landscape, about 960 at 4:3). Coordinates below are for a 1280 x 720 frame with
(0, 0) at the top left. **Everything essential (figures, text) stays inside the central 1000 x 620**, so it
survives 4:3; extra paper and scenery fill wider screens. The bottom 80 units on phones may sit near the home
indicator, so text is never below y = 640.

**Paper.** The game's paper grain and vignette (`makeGrain`, `makeVignette` in `src/render/paper.ts`). Ink is
`INK #17161b` at varied alpha on `PAPER #efe6d3`.

**Between panels.** The camera pans right along one continuous strip (like unrolling the scroll the way the game
runs), 0.6 s, ease-in-out. The next panel's strokes start painting in as it arrives. No hard cuts, no fades to
black, except the very last panel, which hands over to the map.

**Brush text.** Reuse the in-game hint style (`drawHint` in `src/render/terrain.ts`, which is module-private today
and needs exporting, section 10): an optional large kanji in
`FONT_BRUSH` (Yuji Syuku, 120 px, `INK` 0.82 with a 0.12 offset shadow) above one English line in `FONT_SERIF`
(Shippori Mincho, italic; 25 px in play, up to 30 px in cutscenes). The text fades in 0.3 s after the panel starts
painting, holds, and leaves with the pan. One line per panel, at most about 55 characters.

**Both travelers.** Ren and Kohaku are both in every cutscene. The traveler the player chose is the **lead**:
nearer, in front (to the right, since they face right), full size. The other is a step behind and slightly smaller
(scale about 0.92). Where a panel needs a specific character (Ren takes up the brush; Ren floats the lantern;
Ren picks up the purple ink stick), it is that character whoever leads, and the other is beside them.
**Exception: prologue P1 to P3** happen before the journey. Ren is in the master's room, and Kohaku is still a
small painted fox on the scroll's first page, so the lead rule starts at P4, when Kohaku wakes and joins Ren.

**Color budget.** Ink on paper. The only colors are: the inks (vermilion `#f5361b`, indigo `#1c56e0`, gold
`#ffb01a`, and purple `#a51ee6`, all from `INKS` in `src/config.ts`; purple is `INKS.murasaki`, added in this phase), Kohaku's amber, Ren's scarf (which takes
an ink color), and warm lamp light exactly like `lanternGlow` (already in the game). Nothing else.

**Skipping.** Suggested behaviour (the cutscene owner decides): a tap, click, Space or Enter finishes the current
panel's painting instantly, or if it is already finished, moves to the next panel. A small brush-text **Skip ›**
in the bottom-right corner, and Esc, skip the whole cutscene. Each cutscene plays automatically once (the
campaign save remembers it) and can be replayed later from the map.

**Sound.** No voices. Procedural Web Audio like the rest of the game: koto, paper, brush. One cue per panel,
listed below. A short **master's motif** (four koto notes) runs through both cutscenes: the prologue breaks it
off after the third note when she dies, and the Summer ending finally plays the fourth note when she leaves the
purple. Existing cues are named by their `Sfx` id in `src/audio.ts` (`stroke`, `bell`, `hiss`, `shimmer`, `taiko`,
`finale`, `note`, `splash`, `double`); Summer cues (cicadas, fūrin, rain, Raijin's drums) come from the audio owner.

**Performance.** Each panel's still parts are painted once into an offscreen canvas (like terrain chunks); per frame
only the moving parts are drawn (paint-in masks, figures, lanterns, particles). The same 8 ms p95 budget as play.

**Checks.** Every animated cutscene figure gets a 6+ frame strip and someone confirms its motion direction
(lesson 2). Nothing a cutscene draws may depend on debug flags (lesson 5).

---

## 8. PROLOGUE (5 panels, 21.0 s)

**When it plays:** the first time the player opens the campaign, after choosing a traveler, before the map and the
First Scroll (the checkpoint-1 path: menu → prologue → map → First Scroll). Replayable from the map.

**On-screen text, all five lines in order** (for review at checkpoint 1):

1. 絵巻 — *Master Usuzumi painted the world on one long scroll.*
2. *She died before the last stroke.*
3. 墨染 — *Her last stroke began to run, soaking the world black.*
4. *Her last apprentice took up her colors.*
5. *Together, they set out to finish it.*

**Who is where.** Ren is in the master's room from the first panel, so the picture shows the apprenticeship and
the loss has a witness. Kohaku is a small painted fox on the scroll's first page until P4, where it wakes. Ren
enters the scroll in P3; Kohaku joins Ren inside it in P4 (the cosmology in section 1).

### Panel P1 — "The painter" (5.0 s)

- **Composition.** Night, a painter's room suggested by almost nothing. A single long dry-brush floor line at
  y ≈ 560 across the whole frame. Far left, x ≈ 170: a standing paper lamp (an *andon*: a tall box of four thin
  ink lines with a paper glow). **Ren** (x ≈ 190 to 290) kneels at the master's side, a step behind her, grinding
  ink: an ink stick moving in slow circles on an inkstone on the floor. **Master Usuzumi** (x ≈ 320 to 500)
  kneels in profile, facing right, her long brush in her right hand reaching down to the paper. From x ≈ 520 to
  past the right edge: **the great scroll**, a band of slightly whiter paper about 110 units tall lying on the
  floor, its rolled-up end a cylinder at the far right. On it, a **miniature world** in ink, left to right: a small
  shrine with a torii, a village of a few roofs, a range of hills with pines, then waves and an island. On the
  scroll's first page, sitting beside the shrine, the **amber fox** (Kohaku, idle): the one colored thing.
- **Fox size (phone readability).** Kohaku at **scale about 0.6**: about 30 units tall (authored about 37 units to
  the ear tips, x `CHAR_SCALE` 1.35, x 0.6), roughly 16 pt on an iPhone in landscape (720 units over about 390 pt).
  At 0.35 it would be about 17 units, about 9 pt: an amber speck, not a fox. It is deliberately **out of scale**
  with the rest of the miniature (the one thing she painted with love is painted large); draw the shrine and torii
  big enough that the fox sits beside them, not over them. If it still reads as a speck in `tools/mobile.mjs`, push
  the camera in on the fox for the last 1.2 s of the panel.
- **Text placement.** Kanji 絵巻 and the line in the empty space above the scroll, centered at x ≈ 760, y ≈ 230
  (the 52-character line at 30 px spans about x 420 to 1100, inside the 4:3-safe area).
- **Color.** Kohaku's amber. Warm lamp light on the master and Ren (a `lanternGlow`-style radial glow, multiply).
  Ren's scarf is plain ink.
- **Reuse.** The scroll's miniature: `Backdrop` ridge shapes (`ridge()` with a spring `LayerSpec`; both are
  module-private in `src/render/backdrop.ts` today and need exporting, section 10) drawn at about 0.25 scale,
  `drawDecor` pines at about 0.3, `drawTorii`, `drawSea` clipped and scaled small for the waves,
  `Character('kohaku')` at 0.6 with an amber accent. Floor line, lamp, ink stick and inkstone: `brushLine`. The
  master is a new figure, and Ren needs a kneel with a grinding hand (section 10).
- **Motion.** Her brush arm moves along a stroke while a hill line on the scroll paints itself in under it, left to
  right (a progressive `brushLine` reveal, about 1.5 s). Ren's hand circles the inkstone, about one slow circle per
  1.2 s. The lamp flickers (`lanternGlow`'s flicker). The fox blinks once and flicks its tail (motion draws the eye
  to it). The camera drifts 30 units right over the panel.
- **Sound.** The master's motif begins on the koto (notes 1 and 2). A soft `stroke` swish with each line painted.

### Panel P2 — "The last stroke" (4.0 s)

- **Composition.** The same room, a moment later. The camera has panned a little right and pushed in slightly
  (about 1.15x) on her place. The room is suggested by almost nothing, so positions are set for this framing and do
  not need to line up exactly with P1. Left, x ≈ 160: the lamp. **Ren** (x ≈ 190 to 300) kneels where Ren knelt,
  head bowed. Next to Ren (x ≈ 320 to 480): **her cushion, empty**, a soft outline, and **her brush laid on the
  floor** along its front edge. From x ≈ 520: the scroll. The miniature world stops at x ≈ 780; from there **one
  bold diagonal stroke** runs right and down and stops halfway across the paper, ending in a wet pool of ink
  (x ≈ 1000, y ≈ 520). She is not shown.
- **Text placement.** No kanji. The line centered at x ≈ 640, y ≈ 200.
- **Color.** None. Ink only; the lamp's warm glow dims and goes out. Ren's scarf is plain ink.
- **Reuse.** `brushLine` for the stroke (a heavy `w`, low `dry`, a hard stop instead of a taper: `taperOut: 0`), the
  brush (two strokes and a tuft), the cushion and the smoke (`curve()` with low alpha). The pool: an ink blot shape
  with a wet sheen like a fresh player stroke. Ren: the kneel pose plus a reach-and-lift (section 10).
- **Motion.** Ren, head still bowed, reaches out and **picks up her brush** from the floor (about 1.0 s) and holds
  it across both hands. The lamp glow fades over about 2 s and **goes out**; a thin thread of smoke rises from it
  and thins. The ink pool trembles slightly, still wet. Nothing else moves. Stillness is the point.
- **Sound.** The master's motif plays note 3 and **stops**; the fourth note never comes. One quiet `bell`, then about
  a second of silence.
- **Sensitivity.** Her death is shown by her empty place and by Ren's grief: Ren kneeling beside the empty cushion,
  head bowed, taking up the brush she laid down, and the lamp going out. The line says it plainly and gently
  (open question 2). No tears drawn, no body, no grave, no altar.

### Panel P3 — "The blot" (4.5 s)

- **Composition, first part (0 to about 1.8 s), in the room.** The pool starts to spread. Black bleeds outward
  from it along the paper fibers, in fingered, wicking tendrils, into the miniature world: pines, roofs and hills it
  touches go flat black, losing their lines. On the first page the little painted fox's ears prick up (its first
  sign of life). **Ren**, holding her brush, stands and **steps onto the scroll**, one foot onto the first page.
- **Into the scroll (about 1.8 to 2.3 s).** As Ren's foot touches the paper, the frame goes into the scroll with a
  **0.5 s crossfade**, not a continuous zoom (the cached `Backdrop` strips cannot be scaled smoothly from 0.25 to
  full size; section 10): the miniature scales up by about 1.6x and fades out while the full-scale world fades in,
  scaling from about 0.85 to 1. Paper to paper, never through black.
- **Composition, second part, inside.** The spring landscape at full scale (the First Scroll's look: three ridge
  layers, pines). Ren stands small at the left (x ≈ 260, on the ground at y ≈ 560), brush in hand, facing right.
  The blot advances from the right edge as a wall of wet black with a feathered bleed edge and drips, crossing right
  to left, toward Ren.
- **Text placement.** Kanji 墨染 and the line in the upper left, centered at x ≈ 460, y ≈ 220, on the side the blot
  has not reached yet (above Ren).
- **Color.** None. Ink only. Ren's scarf is still plain ink.
- **Reuse.** `Backdrop` (spring layers) for the full-scale landscape; `drawDecor` pines; `Character('ren')` in
  `idle` (standing) and a single step; the blot is new (section 2: no eyes, fibrous edge, drips; `Particles` with
  kind `ink` for the drips). The crossfade is new (section 10).
- **Motion.** The bleed edge advances in uneven pulses (slow, then a reaching tendril, then slow), about 300 units
  across the full-scale part. Things it touches lose detail over about 0.4 s. Small drips fall from its edge. Ren's
  step is left to right (frame-strip it, lesson 2).
- **Sound.** A low paper `hiss` (low-passed), tiny `splash` drips, a soft low drone under it; one soft `stroke`
  swish as Ren steps onto the paper.

### Panel P4 — "The apprentice" (4.0 s)

- **Composition.** Full scale, the First Scroll's opening ground (a long island at y ≈ 560). Center (x ≈ 600):
  **Ren**, standing, **raises the master's brush** (the one Ren picked up in P2). In front of Ren, three **ink
  stones** (the same stone shapes as the in-game ink selector) light up one after another: vermilion, indigo, gold.
  Left background: the shrine and its torii from the scroll's first page, with **Kohaku** sitting beside it in its
  painted pose, the same as in P1 but now at full scale. Kohaku **wakes** (a shake, ears up), **leaps down from its
  painted place** in an arc, and lands beside Ren. Right edge: the blot, small and far, still bleeding.
- **Who.** Ren raises the brush whoever the player chose; Kohaku leaps in. If the player chose Kohaku, Kohaku lands
  slightly in front of Ren (it is the lead), otherwise just behind.
- **Text placement.** No kanji. The line centered at x ≈ 640, y ≈ 190.
- **Color.** The three inks, one at a time, glowing like the in-game stones; Ren's scarf takes vermilion as the
  first stone lights; Kohaku's amber. The torii fills with vermilion as Ren's scarf does (`drawTorii` with `paint`
  going 0 → 1), the first thing in the world Ren gives color back to.
- **Reuse.** `Character('ren')` in `idle` with `aim` set (brush raised); `Character('kohaku')` in `idle`, then
  `air`, then `idle`; `drawTorii(…, paint)`; the ink stones through a shared `drawInkStone` (today they are drawn
  inline inside `Game.render`, `src/game.ts` around line 1336; section 10); `Particles` `paint` sparks as each stone
  lights.
- **Motion.** Stones light at 0.4 s intervals. Kohaku's leap is a left-to-right arc over about 0.7 s (it moves
  right, facing right). Ren's scarf lifts in the wind.
- **Sound.** Three koto `note`s rising, one per stone, then the fox-leap cue (`double`) as Kohaku jumps.

### Panel P5 — "Setting out" (3.5 s)

- **Composition.** Wide. The ground runs away to the right into the spring hills. The lead and the other **run
  right**, side by side, small in the frame (x ≈ 420 to 560). The blot is a dark smudge on the far right horizon.
  For the last second the camera pulls back and up, the frame's edges become the top and bottom of a paper scroll,
  and it becomes the **map handscroll** (the map owner's screen takes over from here).
- **Text placement.** No kanji. The line centered at x ≈ 640, y ≈ 200.
- **Color.** Ren's vermilion scarf; Kohaku's amber; the vermilion torii behind them.
- **Reuse.** `Character` in `run` for both; `Backdrop` spring layers; the map renderer for the hand-over.
- **Motion.** Both run right; the camera tracks them, then pulls back. Check the run strip for direction (lesson 2).
- **Sound.** One soft `taiko`, and the koto music of the map begins.

**Timing check:** 5.0 + 4.0 + 4.5 + 4.0 + 3.5 = 21.0 s, plus four 0.6 s pans that overlap panel starts.

---

## 9. SUMMER ENDING (4 panels, 20.0 s)

**When it plays:** after the Raijin gate is cleared and its stamp is pressed, before the map shows Summer painted.
Replayable from the map.

**On-screen text, all four lines in order:**

1. 雷 — *The storm rolled on, laughing.*
2. 送 — *On Obon's last night, the lanterns see the spirits off.*
3. 紫 — *She left Ren her purple.*
4. 秋 — *Autumn waits, still unpainted.*

### Panel E1 — "The storm rolls on" (4.5 s)

- **Composition.** After the storm, over the river mouth. **Top left** (x 120 to 480, y 60 to 340), in Sōtatsu's
  corner: **Raijin** on his dark cloud, white again, drum ring clean, grinning, leaning down to **fish a dropped
  drum out of the river** with a hook on a long line (the Ōtsu-e joke). The line drops from his hand to the water at
  x ≈ 640, y ≈ 560; the drum dangles from the hook, dripping. **Bottom** (y 520 to 720): the river, a few long
  horizontal dry-brush lines, with ripple rings where the last drops land. **Right, on the bank** (x 820 to 1000,
  y ≈ 540): the lead and the other, standing; **Kohaku has wrapped its tail over its belly** (the old warning that
  Raijin takes children's belly buttons). **Upper right:** the clouds tear open and a few stars show.
- **Text placement.** Kanji 雷 and the line in the open paper at upper right, centered at x ≈ 900, y ≈ 200.
- **Color.** Ren's scarf (vermilion). Kohaku's amber. Raijin is ink and white paper only.
- **Reuse.** Raijin's renderer from the gate (same figure, "clean" state); `brushLine` for river lines and the
  fishing line; ripple rings and the last drops from the rain and ripple renderer (new, shared with `summer-3`,
  section 10); `Particles` `ink` for drips off the drum; `Character` idle for both travelers.
- **Motion.** The drum rises out of the water over about 1.5 s, dripping; Raijin's sash ripples; the rain thins to
  nothing; in the last second he gives the drum one happy beat and his cloud starts rolling off to the right,
  downriver. He faces right and the sash streams left (our mirrored redraw of the screen, section 3).
- **Sound.** One last drum roll from Raijin, pitched to the music key, decaying away to the right (pan); the tail
  of the rain; one `fūrin` chime as the storm clears.

### Panel E2 — "Sending the lanterns" (5.0 s)

- **Composition.** Night on the river. The lower half is dark water (a broad horizontal wash, darker toward the
  bottom). The far bank is a low ink line at y ≈ 380 with small silhouettes of people kneeling to set lanterns on
  the water and a few reeds. On the near bank (x 300 to 560, y ≈ 560): the **white first-Obon lantern** from
  `summer-1` hangs on its pole (x ≈ 320); it stays there and is **not floated**. **Ren kneels at the water's edge**
  and lights a small plain **floating lantern** (a square paper *tōrō* on a little wooden base) from the white
  lantern's flame, with a thin taper (one brush stroke), then sets it on the water; the other is beside Ren. On the
  water: **15 to 25 small paper lanterns**, warm-lit, drifting right, each with a short vertical reflection smear
  (mood: `shots/ref/obon/`). Lots of empty dark water between them.
- **Text placement.** Kanji 送 and the line in the sky area, centered at x ≈ 640, y ≈ 170.
- **Color.** The lanterns' warm light (exactly the `lanternGlow` palette). Ren's scarf. Kohaku's amber. **No
  purple anywhere in this panel**, so the purple in E3 lands.
- **Reuse.** `lanternGlow` for each lantern's light (scaled down), `drawDecor` `reeds` on both banks, `brushLine` for
  water, banks, the pole and the taper, the rain and ripple renderer's ripples under the new lantern, `Character`
  for both travelers (Ren needs a kneel, section 10).
- **Motion.** The flame passes from the white lantern to the floating lantern along the taper (about 0.8 s). The
  lanterns drift right at about 20 units/s and bob slightly; reflections shimmer. Ren's lantern leaves Ren's hands
  and joins the drift. Nothing hurries.
- **Sound.** The river (soft filtered noise), a single far festival `taiko` (the dance is over), the koto plays the
  master's motif again, notes 1 to 3, and stops where the prologue stopped.
- **Sensitivity.** Plain lanterns, no writing on them, no priests, no altar. The people on the far bank are small
  silhouettes, not faces. Floating lanterns are a regional custom (glossary); this riverside town keeps it.

### Panel E3 — "She leaves the purple" (5.5 s)

- **Composition.** Closer, at the water's edge. A flat **stepping stone** at the edge of the bank (x ≈ 640 to 780,
  y ≈ 585). **Ren's floating lantern** rests on the water just past it (x ≈ 830, y ≈ 600) with its warm glow.
  **Master Usuzumi stands on the stepping stone**, feet drawn and on the stone (never on open water), in pale wash
  only (section 2) with a thin purple rim, about 170 units tall, three-quarters from behind, facing right:
  downstream, toward the lantern. On the bank to the left (x ≈ 340 to 520) the lead and the other watch. She
  **turns her head back toward Ren and smiles**, draws her **purple ink stick** from her sleeve cord (a small plain
  stick, the only solid purple in the frame), **sets it down on the stone**, on the edge nearest Ren, and turns
  back to the lantern. She **fades evenly, as a whole**, into the lantern's glow, and the lantern drifts on,
  rightward. **Ren steps forward and picks up the ink stick.** As Ren lifts it, the row of ink stones appears in
  front of Ren as in P4, with the purple stone still drawn as the lent stone (purple outline, pale wash inside),
  and it **fills to solid purple**.
- **Text placement.** Kanji 紫 and the line above the water, centered at x ≈ 560, y ≈ 200, between her and Ren.
- **Color.** Purple (her rim light, the ink stick, the stone filling). The lantern's warm light. Ren's scarf turns
  purple when the stone fills. Kohaku's amber.
- **Reuse.** `drawInkStone` in its lent state, then filling (section 10); `lanternGlow`; `Character` for both
  travelers (Ren needs a step and a reach-and-lift, the same as P2); the master is the new figure from the
  prologue, in her pale state, plus a set-down gesture. The ink stick is a small new prop (`brushLine`).
- **Motion.** Her head turn about 0.6 s; drawing the stick and setting it down about 0.9 s; her fade about 1.0 s,
  **gentle and even over her whole figure**: not from the feet upward (a figure without feet is the *yūrei* sign),
  not a dissolve into particles, not a flicker. If the fade cannot be perfectly even, her feet are the **last**
  thing to go. The lantern then drifts right. Ren's step and pick-up about 1.0 s; the stone fills over about 0.6 s.
  Frame-strip her turn, her set-down and Ren's pick-up (lesson 2).
- **Sound.** As the stone fills, `shimmer`, and the koto finally plays the **fourth note** of the master's motif,
  resolving it; then a moment of quiet with only the river.
- **Sensitivity.** This is the emotional peak and it must be warm. She is smiling, unhurried, and leaves on her own.
  She gives an object, by hand; nothing is conjured. No tears drawn, no wind howling, no light beams.

### Panel E4 — "Onward" (5.0 s)

- **Composition.** Dawn. The upper half is pale paper with a low **vermilion sun** disc at the right (x ≈ 1020,
  y ≈ 260), a classic ink-painting accent, painted in the player's own vermilion. The river below is pale now, the
  lanterns only tiny warm dots far off to the right. The lead and the other **run right** along the bank, small in
  the frame. For the last 2 s the camera pulls back and the frame becomes the **map handscroll**: the Summer stretch,
  now painted with the player's own strokes in color, and beyond it to the right, **Autumn**, still rolled up and
  blotted, labeled 秋.
- **Text placement.** Kanji 秋 and the line at upper left, centered at x ≈ 400, y ≈ 200, so it reads before the eye
  goes right to the rolled-up Autumn.
- **Color.** The vermilion sun. Ren's scarf. Kohaku's amber. Then the map's colors (the player's own strokes).
- **Reuse.** `Character` `run`; `Backdrop` ridges in a pale summer variant; `brushLine` for the river; the map
  renderer for the hand-over.
- **Motion.** Both run right; the camera tracks, then pulls back to the map.
- **Sound.** Morning cicadas (*semi*) fade in, one soft `taiko`, and the map's music takes over.

**Timing check:** 4.5 + 5.0 + 5.5 + 5.0 = 20.0 s, plus three 0.6 s pans that overlap panel starts.

---

## 10. What the cutscenes need from other owners

I own only this document, the glossary and `shots/ref/`. These are requests, not changes I made. Rows marked
**required** are dependencies of the story as written, not options: without them a beat does not show on screen.
Several things the panels call "Reuse" are not reusable today (checked with `grep export` on 2026-10-07); those
rows say so.

| Need | Why | Likely owner |
|---|---|---|
| **Required: the guide lantern and the festival lantern line** in `summer-1` and `summer-2` (recommended in `summer-3` and `summer-4`): the white first-Obon lantern sliding along a visible cord, or carried on the river current; plain warm light, no colored rim (section 6, device 1). | The brief's main beat, "she guides Ren through the thin night", has no other on-screen form in this milestone. | Summer levels / render owner |
| **Required: her rings**, pre-painted portal pairs in her pale wash with a purple rim: at the first portal of `summer-1`, and at least one pair ahead of the player in `summer-2` (section 6, device 2). | Shows her guiding; makes the `summer-2` line true; teaches portals safely first. | Level designer (placement), portal owner (pre-painted rings, limit rules) |
| **Required: a shared `drawInkStone(ctx, kind, x, y, r, state)`**, with states at least `idle`, `selected`, `lent` (purple outline, pale wash body) and `filling` (0 to 1). Today the stones are drawn inline inside `Game.render` (`src/game.ts`, around line 1336) and nothing else can call them. Used by the HUD (the lent purple stone all Summer), prologue P4 and ending E3. Plus a "purple given" flag in the campaign save. | Makes "lent, then left" visible; lets cutscenes reuse the real stones. | `src/game.ts` / HUD owner; campaign data owner (flag) |
| **Required: export `drawHint`** from `src/render/terrain.ts` (module-private today, line 187), or a shared brush-text helper with the same look. | Every cutscene's text uses it. | `src/render/terrain.ts` owner |
| **Required: export `ridge()` and `LayerSpec`** from `src/render/backdrop.ts` (both module-private today), or a small `drawMiniLandscape(ctx, theme, x, y, w, scale)` built on them. | The miniature world on the scroll in P1 to P3. | `src/render/backdrop.ts` owner |
| **Required: a rain and ripple renderer** (streaks, ripple rings, last drops, wet sheen) shared between `summer-3`, the gate, E1 and E2. None exists today. | One rain look everywhere; the cutscenes should not fork it. | Rain / `summer-3` owner |
| **Required: the P3 crossfade** from the 0.25-scale miniature to the full-scale `Backdrop` (0.5 s; the miniature scales up about 1.6x and fades out while the full-scale strip fades in from about 0.85x). The cached strips cannot zoom continuously. | Ren stepping into the scroll. | cutscene owner |
| **New poses on `Character`**: Ren `kneel` (P1, P2, E2), a grinding hand on the kneel (P1), a reach-and-lift (P2 picks up the brush, E3 picks up the ink stick), a single step (P3, E3), a slow `walk` or slower run phase; Kohaku an idle with the tail curled forward over the belly (E1) and a "wake" shake (P4). The `Pose.accent` already lets Kohaku be amber. | Brief: characters in cutscenes come from the existing `Character` renderer. Today it has only `run`, `air`, `ride`, `idle`. Fallbacks if there is no time: kneel = `idle` lowered 8 units; grinding = the brush `aim` circling low; pick-up = the brush `aim` swinging up; E1 drops the tail joke. | `src/render/characters.ts` owner |
| **A figure renderer for Master Usuzumi**, with two states: solid ink (prologue P1) and pale wash with a purple rim (E3); poses: kneeling and painting (P1), standing, head turn, drawing and setting down the ink stick (E3); an even whole-figure fade. Feet always drawn. Plus the ink stick prop. | New character; only appears in cutscenes. | cutscene / render owner |
| **Raijin's renderer exposes a "clean" state** (white, drum ring clean) and the fishing pose for E1. He faces right (mirrored from the screen, section 3). | The ending reuses the gate's Raijin. | Raijin gate owner |
| **The blot's look** (no eyes, fibrous bleed edge, drips) shared by P3, the map's blotted stretches and later chapters. | One look everywhere. | render / map owner |
| **Font preloading**: `src/main.ts` preloads only `墨朱藍金蓮琥珀松竹梅一雪波今` before the first frame. Every new glyph shown in a hint, cutscene or the map must be added, or the first frame can fall back to a system font: at least 紫 絵巻 墨染 雷 送 秋 迎 踊 雨 夏 春 冬. All are present in both bundled fonts (checked with `fc-query`). | Offline, no flash of the wrong font. | `src/main.ts` owner |
| **Campaign data module**: cutscene order (prologue before First Scroll on first campaign entry; Summer ending after `summer-gate`), the scroll titles (for the map, card and stamp book) and the glyphs and story lines (for the scroll's opening spot) from section 6, a "seen" flag per cutscene and the "purple given" flag in the `inkrunner:campaign` save. | Brief: campaign structure lives in one data module. | campaign data owner |
| **Audio**: the four-note master's motif (koto), and the Summer cues already in the brief (cicadas, fūrin, festival taiko, rain, Raijin's drums pitched to the music). | Sections 8 and 9. | `src/audio.ts` owner |

---

## 11. Open questions for Zach (checkpoint 1)

1. **The master's name: Usuzumi (薄墨, "thin ink").** Alternatives if it does not land: Kasumi (霞, "mist"),
   Shiori (栞, "bookmark"). I recommend Usuzumi: it is a painter's word and it is what she looks like when she
   comes back. It appears on screen once, in P1 (proper names are allowed in the text, section 4).
2. **How plainly the prologue says she died.** The picture now shows it through Ren: Ren kneels by her empty
   cushion, head bowed, picks up the brush she laid down, and the lamp goes out. The line says it plainly: *She died
   before the last stroke.* The gentler alternative is *She laid down her brush before the last stroke.* I recommend
   the plain line, because Summer ("Her first Obon") only lands if the death has.
3. **Raijin as a freed, laughing god** rather than a defeated one. Recommended; it is how Japanese folk art treats
   him and it avoids "beating up a real deity". Worth your sign-off because he is venerated. He is not the master's
   creation; he lives in the sky over the scroll.
4. **Raijin mirrored.** In Sōtatsu's screen he looks down and to the left and his sash streams right. Ours faces
   right, toward the player, with the sash streaming left, a deliberate mirrored redraw for gameplay. Recommend
   keeping it.
5. **The guide lantern, her rings and the lent stone are now required** (section 6), not optional. They are how the
   player sees her guiding in play, since this milestone has no cutscene of her return. Extra work for the level,
   portal, render and HUD owners. Recommended.
6. **Purple is lent during Summer, then left for good in the ending,** shown as a lent stone (purple outline, pale
   wash inside) that fills solid in E3 when Ren picks up her ink stick. This matches the brief's direction and lets
   `summer-1` teach portals before the gate is won. The risk to check at phone size: the lent stone must not look
   disabled.
7. **Two Obon liberties** (glossary): the cucumber horse and eggplant cow sit on the doorstep by the welcoming fire
   (at home they go by the family altar, which we do not show), and we show one town that floats lanterns, which is
   a regional custom. The white first-Obon lantern itself is never floated.
8. **Ren's gender is left open** on screen. Recommended; nothing in the game needs it.
9. **Reading direction.** Real handscrolls are read right to left; our game, map and cutscenes run left to right
   (the traveler runs right). A deliberate liberty for players, noted in the glossary. Recommend keeping it.
