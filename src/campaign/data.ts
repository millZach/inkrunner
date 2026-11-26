/**
 * The Unfinished Scroll: the single source of truth for the campaign's shape.
 *
 * Chapters, their scrolls, each scroll's kishōtenketsu beat, the cutscene slots
 * and the unlock rule all live here. The map, the menu and (later) the stamp
 * book read this module; none of them hard-code the structure.
 *
 * Pure data plus pure helpers: no DOM, no storage, no level builders.
 */

/** Kishōtenketsu beats plus the gate. */
export type Beat = '起' | '承' | '転' | '結' | '門';

export const BEATS: Record<Beat, { reading: string; role: string }> = {
  起: { reading: 'Ki', role: 'introduce' },
  承: { reading: 'Shō', role: 'develop' },
  転: { reading: 'Ten', role: 'twist' },
  結: { reading: 'Ketsu', role: 'conclude' },
  門: { reading: 'Gate', role: 'the gate' },
};

export type ChapterId = 'spring' | 'summer' | 'autumn' | 'winter' | 'inksea';

export interface CampaignScroll {
  /** level id; matches LEVEL_RE ^[a-z0-9-]{1,40}$ so ghost ink works */
  id: string;
  beat: Beat;
  /** working title shown on the map */
  name: string;
  /** one line for the map label / menu */
  blurb: string;
  /** true while the scroll is a greybox stand-in for its real design */
  placeholder?: boolean;
}

export interface Chapter {
  id: ChapterId;
  kanji: string;
  name: string;
  subtitle: string;
  /** Playable scrolls, in order. Empty means the chapter is still rolled up. */
  scrolls: CampaignScroll[];
}

export type CutsceneId = 'prologue' | 'summer-ending';

export interface CutsceneSlot {
  id: CutsceneId;
  title: string;
  /** what the map's replay marker calls it ("Replay the prologue") */
  name: string;
  /** why its marker cannot replay it yet ("clear the gate first") */
  lockHint: string;
  /**
   * Where the map opens under its hand-over: 'start' (the default) centres it as usual; 'next-chapter' opens it
   * looking past the chapter just finished to the next one, still rolled up (the Summer ending's last shot shows
   * Autumn waiting), and the paint-in then pans back.
   */
  mapView?: 'start' | 'next-chapter';
  /**
   * When it plays. `before` = the scroll id it precedes (the prologue plays
   * before the journey's first scroll); `after` = the scroll whose first clear
   * triggers it (the Summer ending follows the gate).
   */
  before?: string;
  after?: string;
}

export interface Campaign {
  id: string;
  title: string;
  chapters: Chapter[];
  cutscenes: CutsceneSlot[];
}

export const CAMPAIGN: Campaign = {
  id: 'unfinished-scroll',
  title: 'The Unfinished Scroll',
  chapters: [
    {
      id: 'spring',
      kanji: '春',
      name: 'Spring',
      subtitle: 'the village',
      // The existing First Scroll, unchanged. Whether Spring is split into
      // shorter lessons is an open question for checkpoint 1.
      scrolls: [{ id: 'first', beat: '起', name: 'The First Scroll', blurb: 'Learn the three inks.' }],
    },
    {
      id: 'summer',
      kanji: '夏',
      name: 'Summer',
      subtitle: 'Obon, the thin night',
      // Working titles; the design phase may rename them here and nowhere else.
      scrolls: [
        { id: 'summer-1', beat: '起', name: 'The Welcoming Fire', blurb: 'A door painted in the air.' },
        { id: 'summer-2', beat: '承', name: 'The Dance Ground', blurb: 'Doors among the old inks.' },
        { id: 'summer-3', beat: '転', name: 'The Evening Storm', blurb: 'Rain washes the bridges away.' },
        { id: 'summer-4', beat: '結', name: 'The Last Night', blurb: 'Everything, with fewer lanterns.' },
        { id: 'summer-gate', beat: '門', name: "Raijin's Gate", blurb: 'Send the thunder home.' },
      ],
    },
    { id: 'autumn', kanji: '秋', name: 'Autumn', subtitle: 'mountain temples', scrolls: [] },
    { id: 'winter', kanji: '冬', name: 'Winter', subtitle: 'the long night', scrolls: [] },
    { id: 'inksea', kanji: '墨', name: 'The Ink Sea', subtitle: 'the finale', scrolls: [] },
  ],
  cutscenes: [
    { id: 'prologue', title: 'The Unfinished Scroll', name: 'the prologue', lockHint: 'not yet', before: 'first' },
    {
      id: 'summer-ending',
      title: 'The lanterns float away',
      name: 'the Summer ending',
      lockHint: "clear Raijin's Gate first",
      after: 'summer-gate',
      mapView: 'next-chapter',
    },
  ],
};

// ─────────────────────────────────────────────────────────────── helpers

/** Every playable campaign scroll in unlock order. */
export function scrollOrder(c: Campaign = CAMPAIGN): CampaignScroll[] {
  return c.chapters.flatMap((ch) => ch.scrolls);
}

export function isCampaignScroll(id: string, c: Campaign = CAMPAIGN): boolean {
  return scrollOrder(c).some((s) => s.id === id);
}

export function findScroll(id: string, c: Campaign = CAMPAIGN): { chapter: Chapter; scroll: CampaignScroll; index: number } | null {
  for (const chapter of c.chapters) {
    const index = chapter.scrolls.findIndex((s) => s.id === id);
    if (index >= 0) return { chapter, scroll: chapter.scrolls[index], index };
  }
  return null;
}

export type NodeState = 'locked' | 'open' | 'cleared';

/**
 * Linear unlocking: the first scroll is always open; every other scroll opens
 * once the scroll before it (across chapter boundaries) is cleared.
 */
export function scrollState(id: string, isCleared: (id: string) => boolean, c: Campaign = CAMPAIGN): NodeState {
  const order = scrollOrder(c);
  const i = order.findIndex((s) => s.id === id);
  if (i < 0) return 'locked';
  if (isCleared(id)) return 'cleared';
  if (i === 0 || isCleared(order[i - 1].id)) return 'open';
  return 'locked';
}

/** The scroll that opens after `id`, or null at the end of the playable campaign. */
export function nextScroll(id: string, c: Campaign = CAMPAIGN): CampaignScroll | null {
  const order = scrollOrder(c);
  const i = order.findIndex((s) => s.id === id);
  return i >= 0 && i + 1 < order.length ? order[i + 1] : null;
}

/** The furthest open-but-uncleared scroll (where the traveler stands on the map). */
export function frontier(isCleared: (id: string) => boolean, c: Campaign = CAMPAIGN): CampaignScroll | null {
  return scrollOrder(c).find((s) => scrollState(s.id, isCleared, c) === 'open') ?? null;
}

export type ChapterState = 'sealed' | 'locked' | 'open' | 'cleared';

/** `sealed` chapters have no playable scrolls yet: drawn rolled up and blotted. */
export function chapterState(ch: Chapter, isCleared: (id: string) => boolean, c: Campaign = CAMPAIGN): ChapterState {
  if (!ch.scrolls.length) return 'sealed';
  const states = ch.scrolls.map((s) => scrollState(s.id, isCleared, c));
  if (states.every((s) => s === 'cleared')) return 'cleared';
  if (states.some((s) => s !== 'locked')) return 'open';
  return 'locked';
}

/**
 * The cutscene that should play now, if any: `before` slots play when their
 * scroll is about to start; `after` slots once their scroll is cleared.
 */
export function cutsceneDue(
  moment: { starting?: string; cleared?: string },
  seen: (id: CutsceneId) => boolean,
  c: Campaign = CAMPAIGN,
): CutsceneSlot | null {
  for (const slot of c.cutscenes) {
    if (seen(slot.id)) continue;
    if (moment.starting && slot.before === moment.starting) return slot;
    if (moment.cleared && slot.after === moment.cleared) return slot;
  }
  return null;
}

/** A slot's own condition holds: its `before` scroll is open (or cleared), or its `after` scroll is cleared. */
export function cutsceneEarned(slot: CutsceneSlot, isCleared: (id: string) => boolean, c: Campaign = CAMPAIGN): boolean {
  if (slot.before) return scrollState(slot.before, isCleared, c) !== 'locked';
  if (slot.after) return isCleared(slot.after);
  return false;
}

/**
 * The cutscenes to play, in campaign order, the next time the map opens (from the title, or on the way back
 * from a scroll): every earned slot not yet seen. On a fresh profile that is the prologue (its scroll, the
 * First Scroll, is always open); after the first clear of summer-gate, the Summer ending. Free play never
 * asks. Each plays once; skipping counts as seen.
 */
export function dueCutscenes(isCleared: (id: string) => boolean, seen: (id: CutsceneId) => boolean, c: Campaign = CAMPAIGN): CutsceneSlot[] {
  return c.cutscenes.filter((slot) => !seen(slot.id) && cutsceneEarned(slot, isCleared, c));
}

/** A slot's map marker replays it once it has been seen or earned; before that the marker is locked. */
export function cutsceneReplayable(id: CutsceneId, isCleared: (id: string) => boolean, seen: (id: CutsceneId) => boolean, c: Campaign = CAMPAIGN): boolean {
  const slot = c.cutscenes.find((s) => s.id === id);
  return !!slot && (seen(id) || cutsceneEarned(slot, isCleared, c));
}
