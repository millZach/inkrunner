export const VIEW_H = 720;
export const MAX_RENDER_H = 1440;

export const GRAVITY = 2000;
export const RUN_SPEED = 310;
export const RUN_ACCEL = 1400;
export const JUMP_V = 780;
export const MAX_FALL = 1500;
export const STEP_UP = 22;
export const STEP_DOWN = 24;
export const RIDE_SPEED = 560;
export const KILL_Y = 980;

export const PLAYER_HW = 13;
export const PLAYER_H = 58;

export const INK_MAX = 100;
export const INK_COST = 0.065; // per world unit painted
// Zach (2026-10-11): refill was so fast the bar never drained; every scroll's refill is 0.8x what it was (28 here)
export const INK_REGEN = 22; // per second (game time)
export const SLOWMO_DRAIN = 4; // per real second while the brush is down
export const SLOW_SCALE = 0.12;

export const PAPER = '#efe6d3';
export const INK = '#17161b';

// Single sources of truth for ink and traveler ids. server/validate.mjs mirrors these sets and
// tools/tests/validate.test.mjs fails when they disagree.
/** Every ink in the game, in ink-stone order (key 1, 2, 3, 4). */
export const INK_ORDER = ['shu', 'ai', 'kin', 'murasaki'] as const;
export type InkKind = (typeof INK_ORDER)[number];
/** The inks a scroll offers unless its rules say otherwise. */
export const DEFAULT_INKS: readonly InkKind[] = ['shu', 'ai', 'kin'];

export const CHAR_IDS = ['ren', 'kohaku'] as const;
export type CharId = (typeof CHAR_IDS)[number];

export interface InkDef {
  name: string;
  kanji: string;
  color: string;
  dark: string;
  light: string;
  width: number;
}

export const INKS: Record<InkKind, InkDef> = {
  shu: { name: 'Vermilion', kanji: '朱', color: '#f5361b', dark: '#a8180a', light: '#ff8a50', width: 17 },
  ai: { name: 'Indigo', kanji: '藍', color: '#1c56e0', dark: '#0d2a80', light: '#4fb2ff', width: 15 },
  kin: { name: 'Gold', kanji: '金', color: '#ffb01a', dark: '#b06a00', light: '#ffe46a', width: 13 },
  // a violet-magenta, kept well away from indigo's blue so the two never read as one
  murasaki: { name: 'Purple', kanji: '紫', color: '#a51ee6', dark: '#56097e', light: '#e58bff', width: 15 },
};

export const FONT_BRUSH = '"Yuji Syuku", "Noto Serif JP", serif';
export const FONT_SERIF = '"Shippori Mincho", "Noto Serif JP", Georgia, serif';

export const IS_TOUCH = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
