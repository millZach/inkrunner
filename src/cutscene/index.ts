import type { CutsceneId } from '../campaign/data';
import { CutscenePlayer, type EndReason, type PlayOptions } from './player';
import { PROLOGUE } from './prologue';
import { SUMMER_ENDING } from './summer-ending';
import type { CutsceneDef } from './types';

export type { EndReason, PlayOptions } from './player';
export { CutscenePlayer, HANDOVER_LEAD } from './player';

/** Every cutscene the campaign can play, by the ids in src/campaign/data.ts. */
export const CUTSCENES: Partial<Record<CutsceneId, CutsceneDef>> = {
  prologue: PROLOGUE,
  'summer-ending': SUMMER_ENDING,
};

export interface CutsceneHandle {
  player: CutscenePlayer | null;
  /** end it now, as the Skip button does */
  skip(): void;
  /** resolves when it ends or is skipped */
  done: Promise<EndReason>;
}

/**
 * Play a cutscene over everything else. `onDone` fires once, the moment it ends or is skipped; open the next
 * screen then, and the cutscene's overlay washes away over it by itself (0.4 s).
 *
 *   playCutscene('prologue', { char: traveler, audio: game.audio, grain: game.grain, onDone: () => openMap() });
 *
 * While it plays it owns Space, Enter and Escape. The host can skip its own frame work while `covers()` is true.
 */
export function playCutscene(id: CutsceneId, opts: PlayOptions = {}): CutsceneHandle {
  const def = CUTSCENES[id];
  let resolve!: (r: EndReason) => void;
  const done = new Promise<EndReason>((r) => (resolve = r));
  if (!def) {
    console.warn(`cutscene "${id}" is not built yet; skipping it`);
    queueMicrotask(() => {
      opts.onHandover?.();
      opts.onDone?.('skip');
      resolve('skip');
    });
    return { player: null, skip() {}, done };
  }
  const player = new CutscenePlayer(def, {
    ...opts,
    onDone: (how) => {
      active = null;
      opts.onDone?.(how);
      resolve(how);
    },
  });
  active = player;
  if (import.meta.env.DEV) (window as unknown as { __cutscene: CutscenePlayer }).__cutscene = player;
  player.start();
  return { player, skip: () => player.skip(), done };
}

let active: CutscenePlayer | null = null;

/** True while a cutscene's opaque paper covers the screen (after its opening unroll), so the game need not draw. */
export function covers(): boolean {
  return !!active && active.covering;
}

/** True from the moment a cutscene starts until it ends or is skipped (its overlay may still be washing away). */
export function playing(): boolean {
  return !!active && !active.ended;
}
