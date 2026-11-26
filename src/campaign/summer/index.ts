/**
 * 夏 Summer: one module per scroll (one owner each). Each default-exports build(scroll) => Level.
 * Order and names come from ../data.ts.
 */
import type { Level } from '../../level';
import type { LevelInfo } from '../../levels';
import { CAMPAIGN, type CampaignScroll } from '../data';
import summer1 from './summer-1';
import summer2 from './summer-2';
import summer3 from './summer-3';
import summer4 from './summer-4';
import summerGate from './summer-gate';

const BUILDERS: Record<string, (s: CampaignScroll) => Level> = {
  'summer-1': summer1,
  'summer-2': summer2,
  'summer-3': summer3,
  'summer-4': summer4,
  'summer-gate': summerGate,
};

/** LevelInfo for every Summer scroll, in campaign order. Every Summer scroll builds with theme 'summer'. */
export function summerLevels(): LevelInfo[] {
  const summer = CAMPAIGN.chapters.find((ch) => ch.id === 'summer')!;
  return summer.scrolls.map((s) => {
    const build = BUILDERS[s.id];
    if (!build) throw new Error(`No Summer builder for ${s.id}`);
    return { id: s.id, name: s.name, kanji: s.beat, theme: 'summer', blurb: s.blurb, build: () => build(s) };
  });
}
