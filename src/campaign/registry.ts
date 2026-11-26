/** Every playable scroll by id: the four free-play scrolls plus the campaign's own. */
import { levelList, type LevelInfo } from '../levels';
import { summerLevels } from './summer/index';

export function campaignLevels(): LevelInfo[] {
  return summerLevels();
}

/**
 * Look a scroll up by id for the campaign and the ?level= debug path.
 * Exact ids win; a unique-enough prefix (e.g. `daily`) still works as before.
 */
export function findLevel(id: string, free: LevelInfo[] = levelList()): LevelInfo | null {
  const all = [...free, ...campaignLevels()];
  return all.find((l) => l.id === id) ?? all.find((l) => l.id.startsWith(id)) ?? null;
}
