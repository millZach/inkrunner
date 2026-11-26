import type { CutsceneSlot } from '../campaign/data';
import type { CampaignMap } from '../campaign/map';
import { PAPER } from '../config';
import { rgba } from '../render/brush';
import type { View } from './types';

/**
 * The last panel's pull-back into the map (prologue P5, Summer ending E4). As the panel's camera pulls back
 * (zoom about the frame's centre), the picture is cut down to a soft-edged painting in the middle of the paper,
 * and the player slides the map's silk bands in at the screen's edges (player.ts, drawBands). The host opens the
 * map underneath a moment before the end, and the paper washes away onto it: the bands stay put and the little
 * painting gives way to the map around the place the story leaves the travelers.
 */

/** the picture's rect at pull-back progress u (0 = full screen, 1 = the small painting), frame units */
export function pullRect(view: View, u: number) {
  const L = (a: number, b: number) => a + (b - a) * u;
  return { x0: L(view.x0 - 30, 150), x1: L(view.x1 + 30, 1130), y0: L(view.y0 - 30, 70), y1: L(view.y1 + 30, 660) };
}

/** the camera for a pull-back at progress u */
export function pullCamera(u: number, zEnd = 0.5) {
  return { z: 1 + (zEnd - 1) * u, cx: 640, cy: 360, dx: 0, dy: 0 };
}

/** clip to the picture's rect (call between save and restore) */
export function clipPull(ctx: CanvasRenderingContext2D, view: View, u: number) {
  const r = pullRect(view, u);
  ctx.beginPath();
  ctx.rect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
  ctx.clip();
}

/** feather the picture's edges into the paper (draw after the picture, inside the same clip) */
export function featherPull(ctx: CanvasRenderingContext2D, view: View, u: number) {
  if (u <= 0) return;
  const r = pullRect(view, u);
  const f = 70 * u;
  ctx.save();
  const edge = (x0: number, y0: number, x1: number, y1: number, rx: number, ry: number, rw: number, rh: number) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, rgba(PAPER, Math.min(1, u * 1.4)));
    g.addColorStop(1, rgba(PAPER, 0));
    ctx.fillStyle = g;
    ctx.fillRect(rx, ry, rw, rh);
  };
  edge(r.x0, 0, r.x0 + f, 0, r.x0, r.y0, f, r.y1 - r.y0);
  edge(r.x1, 0, r.x1 - f, 0, r.x1 - f, r.y0, f, r.y1 - r.y0);
  edge(0, r.y0, 0, r.y0 + f, r.x0, r.y0, r.x1 - r.x0, f);
  edge(0, r.y1, 0, r.y1 - f, r.x0, r.y1 - f, r.x1 - r.x0, f);
  ctx.restore();
}

/** the parts of the map lookPastChapter reads (read-only, until the map offers a public way to frame a chapter edge) */
interface MapPeek {
  L?: { nodes: { scroll: { id: string }; x: number }[]; items: { name?: string; x0: number; x1: number }[] } | null;
  W?: number;
  scale?: number;
}

/**
 * Frame the map, just opened under a hand-over, on the edge between the chapter a cutscene closes and the next one,
 * still rolled up: the slot's scroll at the left of the view and the next chapter's rolled scroll (its kanji on it)
 * at the right (docs/story.md, E4: "beyond it to the right, Autumn, still rolled up"). A paint-in then pans back
 * to its own stretch as usual. Returns false (and leaves the map alone) if the map's layout is not readable.
 */
export function lookPastChapter(map: CampaignMap, slot: CutsceneSlot): boolean {
  const m = map as unknown as MapPeek;
  const L = m.L;
  const from = L?.nodes.find((n) => n.scroll.id === (slot.after ?? slot.before));
  if (!L || !from || !m.W || !m.scale) return false;
  // the first rolled-up chapter past the slot's scroll ('sealed' items span the roll with a 120-unit margin)
  const roll = L.items.filter((it) => it.name === 'sealed' && it.x0 > from.x).sort((a, b) => a.x0 - b.x0)[0];
  if (!roll) return false;
  const rollX = (roll.x0 + roll.x1) / 2;
  const vu = m.W / m.scale;
  // the roll at about four fifths across, the end of the chapter's own stretch filling the rest
  map.jumpTo(rollX - vu * 0.8);
  return true;
}
