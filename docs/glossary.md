# INKRUNNER glossary: Japanese terms and kanji

Status: studio phase 1, 2026-10-07. Required by `BRIEF.md` section 5 (Sensitivity): every kanji and Japanese term is
checked against a dictionary source and listed here. Critics spot-check five entries (`BRIEF.md` section 8).

## How this was checked

- **Scope.** Every Japanese term and kanji in `BRIEF.md`, `CAMPAIGN-IDEAS.md`, `DESIGN.md`, `docs/story.md`, and the
  game's visible text: `src/levels.ts` (hints and scroll glyphs), `src/config.ts` (ink kanji), `index.html`
  (menu, cards, jump button, rotate screen, favicon), `src/main.ts` (font preload), `src/game.ts` (ranks),
  `src/share.ts` and `src/replay.ts` (seal glyphs). Found with
  `grep -nP '[\x{3040}-\x{30ff}\x{3400}-\x{9fff}]' src/*.ts src/render/*.ts index.html` plus a romaji word list.
- **Sources, fetched on 2026-10-07.** Words: the Jisho.org API (`/api/v1/search/words`, which serves JMdict).
  Single kanji: Jisho kanji pages (KANJIDIC) and en.wiktionary. Customs, artworks and folklore: English and
  Japanese Wikipedia via their APIs. Every link below was fetched; none is from memory.
- **"Verified"** means: **yes** = a fetched source confirms the kanji, the reading and the meaning in the sense we
  use. **partial** = the source confirms part of it (say which). **no** = not confirmed.
- **Fonts.** Every kanji in this file that appears, or is proposed to appear, on screen is present in both bundled
  fonts (Yuji Syuku and Shippori Mincho, `japanese` subsets), checked with `fc-query`.
- **Romaji.** Hepburn with macrons (Ōkami, tōrō, Sōtatsu). On-screen English already uses "Obon" and "Raijin"
  without macrons, which is the normal English spelling of both. The story's text rule (story section 4) allows only
  proper names (Usuzumi, Raijin) and Obon as Japanese words in on-screen English.

## Flags: wrong or questionable usage

Ordered by how much they matter. None is a hard error; the brief's kanji are all real words used in a defensible
sense. The ones worth a decision are 1 to 4 and 11.

1. **墨染 *sumizome* as the name of "the blot" (BRIEF, CAMPAIGN-IDEAS, story) — questionable, keep with care.**
   The word does **not** mean "blot" or "stain". JMdict: "dyeing black; dyed black; dark | priest robes; priesthood |
   mourning dress". The ordinary words for a stain or blot are 染み *shimi* (JMdict: "stain; spot; smudge; blot")
   or 汚点 *oten*. As a *poetic* name it works very well, and better than a literal one: it is the classical word
   for mourning black, and a Kokin Wakashū poem by Kamitsuke no Mineo (on the death of Fujiwara no Mototsune, 891)
   asks the cherry trees of Fukakusa to bloom ink-black "this year alone"; a Kyoto district is still named Sumizome
   after it. A world going into mourning-black after the master's death is exactly our blot.
   **Recommendation:** keep 墨染; on screen, gloss it in English as "the blot" and never as "stain". A Japanese
   speaker will read it as "the ink-dyed (mourning) black", which is the intent. Dictionaries write 墨染め with the
   okurigana; 墨染 without it is the standard form in names and set phrases (the place name, 墨染桜), so either is
   correct; the brief's 墨染 is fine.
2. **御朱印帳 *goshuinchō* for the stamp book (BRIEF, CAMPAIGN-IDEAS) — sensitivity flag, medium.** A real goshuin
   is a seal and hand-written calligraphy given by a shrine or temple to a worshipper, historically a receipt for a
   dedicated sutra copy. Since the mid-2010s goshuin collecting has boomed in Japan; Japanese Wikipedia records
   resale at auction and shrines and temples that raised fees, stopped issuing them, or **stopped because they
   dislike the collecting boom**; some Jōdo Shinshū temples never issue them, to discourage visiting only to
   collect. A game "stamp book" is close to the thing those temples object to.
   **Recommendation:** keep the homage, but (a) never put a real shrine, temple or deity name on our seals (our seals
   are Plum, Bamboo and Pine marks from our own fictional torii); (b) label the screen in English as **"Seal book"**
   with 御朱印帳 as the decorative kanji, not "goshuin collection"; (c) avoid words like "collect them all".
   The brief's note that 朱 in 朱印 is the same 朱 as our vermilion ink is correct.
3. **跳 on the touch jump button (`index.html`, the First Scroll hint "Tap 跳 to jump") — questionable, low.**
   Correct meaning in Japanese (KANJIDIC: "hop, leap up, spring"; kun はねる, とぶ). But a lone 跳 as a button label
   reads more like Chinese UI (跳 *tiào* is the everyday Chinese word for "jump"). A Japanese player would expect
   ジャンプ or 跳ぶ. **Recommendation:** fine to keep as a one-glyph brush emblem; if the button ever needs to read
   naturally to Japanese players, use 跳ぶ.
4. **今 for Today's Scroll (`src/levels.ts`, menu) — questionable, low.** 今 means "now, the present" (JMdict,
   KANJIDIC); "today" is 今日 *kyō*. As a one-glyph emblem "now" is a fair stand-in for the daily scroll.
   **Recommendation:** keep, or use 日 ("day") if a closer meaning is wanted. No change needed.
5. **翠 for "Jade" ink (CAMPAIGN-IDEAS, Autumn) — loose, low.** 翠 means green, emerald green, and the kingfisher
   (KANJIDIC: "green, kingfisher"; kun みどり, かわせみ). The stone jade is 翡翠 *hisui* (two characters). 翠 as a color
   name for a green ink is natural; the English name "Jade" is a loose translation, which is fine.
6. **Handscroll reading direction (DESIGN, BRIEF: the map "unrolls") — deliberate liberty, low.** Japanese
   handscrolls (絵巻物 *emakimono*) are unrolled and read **right to left**. Our scrolls, map and cutscenes run left
   to right because the traveler runs right. Recommend keeping it; mention it only if a critic raises it.
7. **"Obon, the thin night" — English phrase, not a translation.** "Thin" (the boundary between the living and the
   dead grows thin) is an English poetic idea, not a Japanese term. That is fine as English copy; just do not present
   it as a translation of a Japanese name.
8. **Raijin and "no real religious figures" — judgment call, flagged for Zach.** Raijin is a deity in Shinto and in
   Buddhist art (an attendant of the thousand-armed Kannon), and is still venerated (Japanese Wikipedia lists shrines
   whose enshrined kami are thunder gods; the Kamakura-period statues at Sanjūsangen-dō). The brief asks for him by
   name and he is also one of the most-drawn figures in Japanese popular art. `docs/story.md` section 3 treats him
   as a freed, laughing figure, never killed, humiliated or worshipped on screen. He is also **not** the invented
   master's creation (she painted the world, not the gods or the weather), so a venerated kami is never "made" by a
   fictional character.
9. **連鼓 *renko* (Raijin's ring of drums, story) — reading not dictionary-confirmed.** The word and meaning are from
   Japanese Wikipedia (風神雷神図: "almost every Japanese thunder god is drawn as an *oni* holding a 連鼓"); JMdict has
   no entry, so the reading *renko* is inferred from the standard on-readings (連 レン, 鼓 コ). Japanese Wikipedia's
   雷神 article calls the drums 雷鼓 *raiko* instead. Neither appears on screen; if one ever does, use 雷鼓 or just 太鼓.
10. **Usuzumi's condolence-ink resonance — NOT VERIFIED.** The name 薄墨 itself is verified ("thin India ink; diluted
    ink"). The custom of writing condolence envelopes in thin ink is widely known, but I could not fetch a dictionary
    or encyclopedia page that states it, so it is marked unverified and must not appear in game text.
11. **Obon props: where we put them (story section 4) — one artistic liberty, two accuracy fixes, medium.** Checked
    against ja Wikipedia お盆, fetched 2026-10-07. (a) **精霊馬 (cucumber horse, eggplant cow):** the source sets
    them "仏壇まわりや精霊棚に" (around the family altar or on the spirit shelf). We do not show altars, so we put
    them on a doorstep beside the welcoming fire in `summer-1`. That is our liberty, not the custom. (b) **The
    white first-Obon lantern** (白一色の盆提灯) is set "門口や仏壇、お墓に" (at the gate, the altar or the grave).
    It is not a floating lantern, so we hang it at the gate and **never float it**; in the ending Ren floats a
    separate plain *tōrō* lit from its flame. (c) **Floating lanterns** (灯籠流し) are introduced in the source with
    "川へ送る風習もあり" (there is *also* a custom of sending them to the river): a regional custom, not
    universal. We show one riverside town that keeps it and never present it as what all of Japan does.
    **Recommendation:** keep (a) as a stated liberty, or drop the props if Zach prefers strict accuracy; (b) and (c)
    are now accurate as written.

No outright errors were found in the game's visible text. 朱, 藍, 金, 蓮, 琥珀, 松, 竹, 梅, 一, 雪, 波 and 墨 are all
correct, and the 松 > 竹 > 梅 rank order matches the traditional three-tier ranking (JMdict gives 松 "highest", 竹
"middle", 梅 "lowest" of a three-tier ranking system).

---

## A. Shown in the game today (visible text and glyphs)

| Term | Kanji | Reading | Meaning (source wording) | How we use it | Source | Verified |
|---|---|---|---|---|---|---|
| sumi | 墨 | sumi (on: boku) | "sumi; India ink; Chinese ink; ink stick" | Title glyph (`index.html`), favicon, rotate screen, the seal on share cards and clips (`src/share.ts`, `src/replay.ts`), the First Scroll's first hint "The world is ink." | https://jisho.org/word/墨 | yes |
| shu | 朱 | shu (kun: ake) | "vermilion, cinnabar, scarlet, red" | Vermilion ink (`INKS.shu` in `src/config.ts`), its ink stone, the 朱 hint glyph | https://jisho.org/search/朱%20%23kanji | yes |
| ai | 藍 | ai | "indigo (dye) \| indigo (colour) \| dyer's knotweed" | Indigo ink (`INKS.ai`), hint "Tap 藍 for Indigo…" | https://jisho.org/word/藍 | yes |
| kin | 金 | kin | "gold (metal) \| gold (color)" | Gold ink (`INKS.kin`), hint "Tap 金 for Gold…" | https://jisho.org/word/金-1 | yes |
| Ren | 蓮 | ren (on); as a common noun read *hasu* | "lotus" (KANJIDIC; on レン, kun はす, はちす) | Ren's name on the traveler card | https://jisho.org/search/蓮%20%23kanji | yes |
| Kohaku | 琥珀 | kohaku | "amber" | Kohaku's name on the traveler card; its amber color in cutscenes | https://jisho.org/word/琥珀 | yes |
| matsu | 松 | matsu | "pine tree \| highest (of a three-tier ranking system)" | Top rank, the Pine seal (`Grade` in `src/game.ts`, finish stamp) | https://jisho.org/word/松 | yes |
| take | 竹 | take | "bamboo \| middle (of a three-tier ranking system)" | Middle rank, the Bamboo seal | https://jisho.org/word/竹 | yes |
| ume | 梅 | ume | "Japanese apricot; Japanese plum; ume \| lowest (of a three-tier ranking system)" | Third rank, the Plum seal. "Plum" is the usual English name for *ume* | https://jisho.org/word/梅 | yes |
| shōchikubai | 松竹梅 | shōchikubai | "pine, bamboo and plum (an auspicious grouping) \| high, middle and low (ranking)" | The rank system as a whole; our order 松 > 竹 > 梅 is the traditional one | https://jisho.org/word/松竹梅 | yes |
| ichi | 一 | ichi | "one \| best \| first; foremost" | The First Scroll's glyph | https://jisho.org/word/一 | yes |
| yuki | 雪 | yuki | "snow; snowfall" | The Snow Pass glyph and title hint | https://jisho.org/word/雪 | yes |
| nami | 波 | nami | "wave; billow; ripple; breaker" | The Wave Road glyph and title hint | https://jisho.org/word/波 | yes |
| ima | 今 | ima (on: kon, kin) | "now; the present time" | Today's Scroll glyph (menu and title hint). See flag 4: "today" is 今日 | https://jisho.org/word/今 ; https://jisho.org/word/今日 | yes (flag 4) |
| (jump) | 跳 | kun: haneru, tobu; on: chō | "hop, leap up, spring, jerk, prance" | Touch jump button (`#jump` in `index.html`) and the hint "Tap 跳 to jump". See flag 3 | https://jisho.org/search/跳%20%23kanji | yes (flag 3) |
| tōrō | 灯籠 | tōrō | "garden lantern; hanging lantern" | The stone checkpoint lantern (`drawLanternStone`, "Stone tōrō lantern"); "lantern" in hints and the pause menu | https://jisho.org/word/灯篭 | yes |
| torii | 鳥居 | torii | "torii (Shinto shrine archway)" | The gate at the end of each scroll ("The last gate waits."), flooded vermilion on finish | https://jisho.org/word/鳥居 | yes |
| yōkai (written "yokai" in our text) | 妖怪 | yōkai | "ghost; apparition; phantom; spectre" | The shadow yokai obstacle that gold ink dispels | https://jisho.org/word/妖怪 | yes |
| kasa | 笠 | kasa | "conical hat (East-Asian style)" | Ren's straw hat (menu card says "straw hat") | https://jisho.org/word/笠 | yes |
| hanko | 判子 | hanko | "seal (used in lieu of a signature); stamp; chop" | DESIGN's "rank hanko": the red seal with 松/竹/梅 on the finish screen and share card | https://jisho.org/word/判子 | yes |

**In code comments only (not visible), for completeness.** The parts of the torii in `drawTorii`
(`src/render/decor.ts`): *kasagi* 笠木 (top lintel), *shimaki* 島木 (second lintel under it), *nuki* 貫 (tie-beam),
*gakuzuka* 額束 (central strut). All four are used correctly; source https://en.wikipedia.org/wiki/Torii (verified
yes). The faint brush circle in the backdrop (`makeEnso`) is an *ensō* 円相, "circle painted with a single stroke in
Zen calligraphy", https://jisho.org/word/円相 (verified yes).

---

## B. Used in BRIEF.md, CAMPAIGN-IDEAS.md and DESIGN.md

| Term | Kanji | Reading | Meaning (source wording) | How we use it | Source | Verified |
|---|---|---|---|---|---|---|
| murasaki | 紫 | murasaki (on: shi) | "purple; violet" | The new Purple portal ink (Summer), `INKS.murasaki` in `src/config.ts` (kanji 紫, correct) | https://jisho.org/word/紫 | yes |
| sumizome | 墨染 (dictionary form 墨染め) | sumizome | "dyeing black; dyed black; dark \| priest robes; priesthood \| mourning dress" | The name of the blot. See flag 1 | https://jisho.org/word/墨染め ; https://ja.wikipedia.org/wiki/墨染 ; https://ja.wikipedia.org/wiki/上野岑雄 | yes (sense is poetic, flag 1) |
| shimi | 染み | shimi | "stain; spot; smudge; blot" | Not used; listed as the literal word for "blot" (flag 1) | https://jisho.org/word/染み | yes |
| goshuinchō | 御朱印帳 | goshuinchō | "goshuin booklet; book for receiving seal stamps at shrines and temples" | The stamp book screen. See flag 2 | https://jisho.org/word/御朱印帳 ; https://ja.wikipedia.org/wiki/朱印_%28神社仏閣%29 | yes (sensitivity flag 2) |
| goshuin / shuin | 御朱印 / 朱印 | goshuin, shuin | "seal stamp given to worshippers and visitors to shrines and temples" | The seal pressed by each scroll's torii | https://jisho.org/word/御朱印 ; https://en.wikipedia.org/wiki/Shuin | yes |
| kishōtenketsu | 起承転結 | kishōtenketsu | "introduction, development, turn and conclusion (quadripartite structure of certain Chinese poetry)" | The chapter shape: 4 scrolls plus a gate. The brief's claim that Nintendo designers use it is supported by en Wikipedia (Hayashida and Miyamoto, *Super Mario Galaxy*, *3D World*) | https://jisho.org/word/起承転結 ; https://en.wikipedia.org/wiki/Kish%C5%8Dtenketsu | yes |
| ki | 起 | ki | "to rise; to start; to begin" | Beat 1: introduce | https://en.wiktionary.org/wiki/起 | yes |
| shō | 承 | shō | "second line of a four-line Chinese poem" | Beat 2: develop | https://jisho.org/word/承 | yes |
| ten | 転 | ten | "third line of a Chinese quatrain" (as 転句); "to turn, to roll" | Beat 3: twist (rain in Summer) | https://en.wiktionary.org/wiki/転 | yes |
| ketsu | 結 | ketsu | "to tie; to join; to end, to conclude" | Beat 4: conclude | https://en.wiktionary.org/wiki/結 | yes |
| mon | 門 | mon | "gate" (KANJIDIC) | The boss gate after the four scrolls | https://jisho.org/search/門%20%23kanji | yes |
| haru / natsu / aki / fuyu | 春 / 夏 / 秋 / 冬 | haru, natsu, aki, fuyu | "spring", "summer", "autumn; fall", "winter" | Chapter names on the map | https://jisho.org/word/春 ; https://jisho.org/word/夏 ; https://jisho.org/word/秋 ; https://jisho.org/word/冬 | yes |
| sui / midori | 翠 | sui (on); midori, kawasemi (kun) | "green, kingfisher" | Jade ink (Autumn, later). See flag 5 | https://jisho.org/search/翠%20%23kanji | yes (flag 5) |
| shiro | 白 | shiro | "white" | White ink (Winter, later) | https://jisho.org/word/白 | yes |
| gofun | 胡粉 | gofun | "artists' chalk; white pigment; powdered calcium carbonate" | The White ink's pigment name; accurate (gofun is the shell-white of Japanese painting) | https://jisho.org/word/胡粉 | yes |
| hi | 秘 | hi | "secret; mystery" | The hidden 秘 scroll unlocked by Pine seals on a whole chapter | https://jisho.org/word/秘 | yes |
| Obon / Bon | お盆 / 盆 (formal 盂蘭盆 *urabon*) | obon, bon | "Obon; Bon Festival; Buddhist festival for honouring the spirits of one's ancestors, held in mid-August or in some regions, mid-July" | The Summer chapter's setting: "Obon, the thin night" (flag 7) | https://jisho.org/word/お盆 ; https://jisho.org/word/于蘭盆 ; https://en.wikipedia.org/wiki/Bon_Festival | yes |
| tōrō nagashi | 灯籠流し | tōrō nagashi | "ceremony in which paper lanterns are floated down a river"; traditionally on the last evening of Bon, to see the spirits off. ja Wikipedia (お盆, 送り火): "川へ送る風習もあり灯籠流しが行われる。山や川に故人がいるとされるためである" (there is **also** a custom of sending them to the river; the dead are held to be in the mountains and rivers), so it is **regional**, not universal | The Summer ending E2: "the lanterns see the spirits off". We show one riverside town that keeps the custom (flag 11) | https://jisho.org/word/灯籠流し ; https://en.wikipedia.org/wiki/T%C5%8Dr%C5%8D_nagashi ; https://ja.wikipedia.org/wiki/お盆 | yes (regional, flag 11) |
| shōryō nagashi | 精霊流し | shōryō nagashi | "floating lanterns or offerings for the spirits of the deceased"; ja Wikipedia lists it as regional (Nagasaki, parts of Saga and Kumamoto) | Not used; listed because it is the custom closest to floating offerings, and it is regional | https://jisho.org/word/精霊流し ; https://ja.wikipedia.org/wiki/お盆 | yes |
| Raijin | 雷神 | raijin | "god of thunder" | The Summer gate boss | https://jisho.org/word/雷神 ; https://en.wikipedia.org/wiki/Raijin ; https://ja.wikipedia.org/wiki/雷神 | yes (flag 8) |
| Fūjin | 風神 | fūjin | "god of the wind" | Raijin's pair in Sōtatsu's screens; not in the game | https://jisho.org/word/風神 | yes |
| semi | 蝉 | semi | "cicada" | Summer ambience sound | https://jisho.org/word/蝉 | yes |
| fūrin | 風鈴 | fūrin | "wind chime; wind bell" | Summer ambience sound | https://jisho.org/word/風鈴 | yes |
| taiko | 太鼓 | taiko | "drum" | Festival drums and Raijin's drums (sound) | https://jisho.org/word/太鼓 | yes |
| koto | 琴 (formally 箏) | koto | "koto (13-stringed Japanese zither)" | The procedural music and the brush notes | https://jisho.org/word/琴 | yes (no kanji shown in game) |
| sumi-e | 墨絵 | sumie | "ink painting" | DESIGN: the world's style | https://jisho.org/word/墨絵 | yes |
| washi | 和紙 | washi | "washi; Japanese paper" | DESIGN: the paper the world is painted on | https://jisho.org/word/和紙 | yes |
| emakimono | 絵巻物 | emakimono | "picture scroll" | DESIGN: the game's frame, a handscroll. See flag 6 on reading direction | https://jisho.org/word/絵巻物 | yes |
| obi | 帯 | obi | "obi (kimono sash)" | Ren's sash, which takes the ink's color | https://jisho.org/word/帯 | yes |
| tengu | 天狗 | tengu | "tengu; red-faced and long-nosed goblin said to reside deep in the mountains" | Autumn gate boss (later) | https://jisho.org/word/天狗 | yes |
| yuki-onna | 雪女 | yuki-onna | "yuki-onna (spirit in Japanese folklore); snow woman" | Winter gate boss (later) | https://jisho.org/word/雪女 | yes |
| tsuru | 鶴 | tsuru | "crane" | Tsuru, a third traveler who glides (later) | https://jisho.org/word/鶴 | yes |
| kami | 神 | kami | "god; deity; divinity; spirit" | How sources describe Raijin and Fūjin | https://jisho.org/word/神 | yes |
| Ōkami | 大神 (title is a pun on 狼 "wolf") | ōkami | the 2006 game; "great god" or "wolf" | **What we avoid** (brief, Originality): wolf, sun goddess Amaterasu, Orochi, the "Celestial Brush" | https://en.wikipedia.org/wiki/%C5%8Ckami | yes |
| Orochi | 八岐大蛇 (大蛇 = "big snake") | Yamata no Orochi | "a legendary eight-headed and eight-tailed serpent" | **Avoided**; the finale is the blot instead | https://en.wikipedia.org/wiki/Yamata_no_Orochi ; https://jisho.org/word/大蛇 | yes |
| Fuji | 富士山 | Fujisan | Mount Fuji, "the highest mountain in Japan" | The Wave Road's horizon (DESIGN) | https://en.wikipedia.org/wiki/Mount_Fuji | yes |
| Hokusai | 葛飾北斎 | Katsushika Hokusai | Edo-period ukiyo-e artist (*The Great Wave off Kanagawa*) | DESIGN: "Hokusai-style waves" on the Wave Road (a style reference; a real person, not depicted) | https://en.wikipedia.org/wiki/Hokusai | yes |

---

## C. Introduced in docs/story.md

Glyphs marked **(on screen)** are proposed for hints or cutscenes; the rest only appear in our documents.

| Term | Kanji | Reading | Meaning (source wording) | How we use it | Source | Verified |
|---|---|---|---|---|---|---|
| Usuzumi | 薄墨 | usuzumi | "thin India ink; diluted ink" | The master's painter's name (invented character). Condolence-ink resonance NOT VERIFIED (flag 10) | https://jisho.org/word/薄墨 | yes (name); no (custom) |
| gō, gagō | 号, 雅号 | gō, gagō | "sobriquet; pen-name"; "alias; pseudonym; pen name" | Why a painter is called "Usuzumi": an art-name | https://jisho.org/word/号 ; https://jisho.org/word/雅号 | yes |
| Kasumi | 霞 | kasumi | "haze (esp. in spring); mist" | Alternative name for the master (open question) | https://jisho.org/word/霞 | yes |
| Shiori | 栞 | shiori | "bookmark" | Alternative name for the master (open question) | https://jisho.org/word/栞 | yes |
| emaki **(on screen)** | 絵巻 | emaki | "picture scroll" | Prologue P1 glyph | https://jisho.org/word/絵巻 | yes |
| makimono | 巻物 | makimono | "makimono; handscroll" | Background: the general word for a handscroll | https://jisho.org/word/巻き物 | yes |
| mukaebi | 迎え火 | mukaebi | "welcoming fire for returning spirits (on the first night of the Bon festival)". ja Wikipedia (お盆) gives a regional example lit **at the gate** (門口: Nagano's *kanba-yaki*, birch bark burned at the gate as welcoming and sending-off fire) | `summer-1` scene ("The Welcoming Fire"): small fires at the doors | https://jisho.org/word/迎え火 ; https://ja.wikipedia.org/wiki/お盆 | yes |
| (welcome) **(on screen)** | 迎 | mukaeru (verb 迎える) | "to go out to meet; to receive; to welcome" | Proposed `summer-1` glyph | https://jisho.org/word/迎える | yes |
| okuribi | 送り火 | okuribi | "ceremonial bonfire (seeing off the spirits on the final night of Obon)" | `summer-4` and the ending (sending the spirits off) | https://jisho.org/word/送り火 | yes |
| (send off) **(on screen)** | 送 | okuru (verb 送る) | "to send \| to see (someone) off \| to bid farewell to (the departed)" | Proposed `summer-4` glyph and ending E2 glyph | https://jisho.org/word/送る | yes |
| hatsubon, niibon | 初盆, 新盆 | hatsubon, niibon | "first Bon Festival following the death of a family member" | The master's first Obon (`summer-1` line) | https://jisho.org/word/初盆 ; https://jisho.org/word/新盆 | yes |
| (white lantern of a first Obon) | 白一色の盆提灯 ("an all-white bon lantern"); 白提灯 is our shorthand | not sourced (*shiro-jōchin* is our guess; no dictionary entry found) | ja Wikipedia (お盆, 初盆・新盆): "初盆の家の人は門口や仏壇、お墓に白一色の盆提灯を立てたり": at a first Obon (custom varies by region) the family sets an all-white bon lantern **at the gate**, the altar or the grave. It is a standing or hanging lantern; the source does not describe floating it | The white lantern Ren hangs **at the gate** in `summer-1`; the in-play guide lantern; on its pole on the bank in E2. **Never floated:** in E2 Ren lights a separate floating *tōrō* from its flame. No Japanese term for it appears on screen (English "white lantern" only). JMdict does have 白張り提灯 *shirahari-jōchin*, "white paper lantern used at funerals", but that is the funeral lantern and the source does not tie it to a first Obon, so we do not use that word | https://ja.wikipedia.org/wiki/お盆 (section 初盆・新盆) ; https://jisho.org/word/白張り提灯 | partial (custom and placement confirmed; reading not sourced) |
| chōchin | 提灯 | chōchin | "paper lantern; Chinese lantern; Japanese lantern" | Festival lanterns, the guide lantern | https://jisho.org/word/提灯 | yes |
| hitodama | 人魂 | hitodama | "floating ball of fire (said to be the soul of a dead person)" | What the guide lantern must **not** look like: it always hangs on a visible cord or rides the current, with no colored rim or trail (story section 6) | https://jisho.org/word/人魂 | yes |
| chōchin-obake | 提灯お化け | chōchin obake | "lantern ghost; demonic lantern" | Also avoided: the guide lantern never has eyes, a face or a mouth | https://jisho.org/word/提灯お化け | yes |
| bon-jōchin | 盆提灯 | bon-jōchin (JMdict kana ぼんぢょうちん) | "Bon Festival lantern" | Background for the white lantern | https://jisho.org/word/盆提灯 | yes |
| shōryō uma | 精霊馬 | shōryō uma | Cucumber horse and eggplant cow: the spirit comes home fast on the horse and goes back slowly on the cow. ja Wikipedia (お盆): set "仏壇まわりや精霊棚に供物とともに" (around the family altar or on the spirit shelf, with the offerings); widespread in eastern Japan including Tokyo | `summer-1` scenery: on a doorstep **beside the welcoming fire**. That placement is an **artistic liberty** (flag 11): the real place is the altar or spirit shelf, which we do not show. The eggplant cow is a quiet purple foreshadow, drawn matte and dark so it never reads as portal ink | https://en.wikipedia.org/wiki/Bon_Festival (Shōryō Uma section) ; https://ja.wikipedia.org/wiki/お盆 ; 精霊 "spirit of the deceased": https://jisho.org/word/精霊-1 | yes (custom); placement is our liberty (flag 11); no JMdict entry for the compound |
| kyūri, nasu | 胡瓜, 茄子 | kyūri, nasu | "cucumber"; "eggplant; aubergine" | The two shōryō uma vegetables | https://jisho.org/word/胡瓜 ; https://jisho.org/word/茄子 | yes |
| bon odori | 盆踊り | bon odori | "Bon Festival dance" | `summer-2` scene | https://jisho.org/word/盆踊り | yes |
| (dance) **(on screen)** | 踊 | odori (noun 踊り) | "dancing; dance \| Bon Festival dance" | Proposed `summer-2` glyph | https://jisho.org/word/踊り | yes |
| yagura | 櫓 | yagura | "turret; watchtower \| high wooden stage" | The festival drum tower in `summer-2`'s backdrop. Note: 櫓 read *ro* is a boat's scull, a different word | https://jisho.org/word/櫓 | yes |
| yūdachi | 夕立 | yūdachi | "(sudden, heavy) shower (on a summer afternoon or evening)" | `summer-3` scene (the storm) | https://jisho.org/word/夕立 | yes |
| ame **(on screen)** | 雨 | ame | "rain" | Proposed `summer-3` glyph | https://jisho.org/word/雨 | yes |
| kaminari **(on screen)** | 雷 | kaminari | "lightning; thunder \| god of thunder" | Proposed `summer-gate` glyph; ending E1 glyph | https://jisho.org/word/雷 | yes |
| Kaminari-sama | 雷様 | kaminari-sama | "thunder; god of thunder" | Raijin's affectionate folk name (story only) | https://jisho.org/word/雷様 | yes |
| (belly-button folklore) | (へそ) | heso | Children are told to hide their navels in a thunderstorm or Raijin will take them | Kohaku covers its belly in E1 | https://en.wikipedia.org/wiki/Raijin ; https://ja.wikipedia.org/wiki/雷神 | yes |
| Ōtsu-e | 大津絵 | Ōtsu-e | "Edo-period folk art genre of painting originating in Ōtsu"; ja Wikipedia: Ōtsu-e show Raijin humorously fishing up a drum he dropped from his cloud | Raijin fishing for his drum in E1 | https://jisho.org/word/大津絵 ; https://ja.wikipedia.org/wiki/雷神 | yes |
| oni | 鬼 | oni | "ogre; demon; oni" | How Raijin is traditionally drawn (horns, tiger skin) | https://jisho.org/word/鬼 | yes |
| bachi | 撥 | bachi | "drumstick (for taiko)" | Raijin's two drumsticks | https://jisho.org/word/撥 | yes |
| renko | 連鼓 | renko (inferred) | Raijin's ring of linked drums | Story text for the drum ring. See flag 9 | https://ja.wikipedia.org/wiki/風神雷神図 | partial (reading not in a dictionary) |
| raiko | 雷鼓 | raiko (per ja Wikipedia usage) | Thunder drum(s) | Alternative to 連鼓 | https://ja.wikipedia.org/wiki/雷神 | partial |
| yūrei | 幽霊 | yūrei | "ghost; specter; apparition" | What the master must **not** look like | https://jisho.org/word/幽霊 | yes |
| Kannon | 観音 | Kannon | "Avalokiteshvara (Bodhisattva)" | Context only: Fūjin and Raijin as Kannon's attendants. Never shown | https://jisho.org/word/観音 ; https://en.wikipedia.org/wiki/Sanj%C5%ABsangen-d%C5%8D | yes |
| andon | 行灯 | andon | "paper-enclosed standing lantern" | The master's lamp in prologue P1 and P2 | https://jisho.org/word/行灯 | yes |
| suzuri | 硯 | suzuri | "inkstone" | The in-game "ink stones" (English only on screen); the inkstone Ren grinds ink on in prologue P1. The master's purple ink stick (E3) is a 墨 *sumi* in the "ink stick" sense (section A); no Japanese word for it appears on screen | https://jisho.org/word/硯 | yes |
| (purple, on screen) | 紫 | murasaki | "purple; violet" | Ending E3 glyph; teaching hint "Tap 紫 for Purple" | https://jisho.org/word/紫 | yes |
| (autumn, on screen) | 秋 | aki | "autumn; fall" | Ending E4 glyph | https://jisho.org/word/秋 | yes |
| (the blot, on screen) | 墨染 | sumizome | see section B | Prologue P3 glyph | see section B | yes (flag 1) |

## D. Proper names (people, works, places) cited in the story and references

| Name | Kanji | Reading | What it is | Where we cite it | Source | Verified |
|---|---|---|---|---|---|---|
| Tawaraya Sōtatsu | 俵屋宗達 | Tawaraya Sōtatsu | Rinpa painter, early 17th century | Raijin's model (story section 3, `shots/ref/sotatsu/`) | https://jisho.org/word/51868e80d5dda7b2c600af9e ; https://en.wikipedia.org/wiki/Tawaraya_S%C5%8Dtatsu | yes |
| *Fūjin Raijin-zu* | 風神雷神図 | Fūjin Raijin-zu | Sōtatsu's pair of two-fold screens, ink and color on gold leaf, each 169.8 x 154.5 cm, National Treasure, owned by Kennin-ji, shown at the Kyoto National Museum | Story section 3; `shots/ref/` | https://ja.wikipedia.org/wiki/風神雷神図 ; https://en.wikipedia.org/wiki/Tawaraya_S%C5%8Dtatsu | yes |
| Rinpa | 琳派 | Rinpa (also Rimpa) | "Rimpa school (of painting, 17th–early 20th century)" | Context for Sōtatsu | https://jisho.org/word/琳派 | yes |
| Kennin-ji | 建仁寺 | Kennin-ji | Zen temple in Kyoto that owns the screens | Story section 3 | https://jisho.org/word/5186468dd5dda7bda8078665 | yes |
| Kyoto National Museum | 京都国立博物館 | Kyōto Kokuritsu Hakubutsukan | Where the screens are exhibited | `shots/ref/README.md` | https://en.wikipedia.org/wiki/Kyoto_National_Museum | yes |
| Kaminarimon | 雷門 | Kaminarimon | Sensō-ji's outer gate, with statues of Fūjin and Raijin | Story section 4 (sensitivity flag) | https://en.wikipedia.org/wiki/Kaminarimon | yes |
| Sanjūsangen-dō | 三十三間堂 | Sanjūsangen-dō | Kyoto temple with statues of Fūjin and Raijin among Kannon's attendants | Story section 4 | https://en.wikipedia.org/wiki/Sanj%C5%ABsangen-d%C5%8D | yes |
| Kamigamo Shrine | 上賀茂神社 (賀茂別雷神社) | Kamigamo Jinja | Kyoto shrine whose formal name contains 雷 (thunder) | Story section 4 | https://en.wikipedia.org/wiki/Kamigamo_Shrine | yes |
| Kokin Wakashū | 古今和歌集 | Kokin Wakashū | "Heian-period collection of poetry" | The *sumizome* cherry poem (flag 1) | https://jisho.org/word/古今和歌集-1 | yes |
| Kamitsuke no Mineo | 上野岑雄 | Kamitsuke no Mineo | Early Heian poet who wrote the *sumizome* cherry poem on Fujiwara no Mototsune's death (891) | Flag 1 | https://ja.wikipedia.org/wiki/上野岑雄 | yes |
| Sumizome (place) | 墨染 | Sumizome | District of Fushimi, Kyoto, named after the poem's legend | Flag 1 | https://ja.wikipedia.org/wiki/墨染 | yes |

---

## Spot-check list for critics

Five entries that are quick to check and cover the riskiest calls: 墨染 (flag 1), 御朱印帳 (flag 2), 跳 (flag 3),
精霊馬 and the white first-Obon lantern (flag 11, the Obon props), and 松竹梅 (the rank order).
