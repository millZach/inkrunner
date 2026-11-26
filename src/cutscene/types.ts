import type { CharId } from '../config';
import type { Audio } from '../audio';

/**
 * Cutscene space is the game's: 720 units tall, a 1280 x 720 design frame with (0, 0) at its top left.
 * Everything essential (figures, text) stays inside the central 1000 x 620 (x 140..1140, y 50..670) and text never
 * goes below y = 640 (docs/story.md, section 7). Wider screens see more paper and scenery on both sides.
 */
export const FRAME_W = 1280;
export const FRAME_H = 720;
/** The width the player always fits on screen (the central 1000 plus a margin). */
export const SAFE_W = 1040;

/** A panel's brush text: an optional large kanji over one English line, centred on (x, y). */
export interface PanelText {
  kanji?: string;
  line: string;
  x: number;
  y: number;
  /** seconds into the panel when the brush starts writing (default 0.3) */
  at?: number;
  /** seconds into the panel when the text fades out (default: it stays and leaves with the pan) */
  fadeAt?: number;
}

/** What a panel can do with sound. Every cue goes through the game's public Audio API. */
export interface CueAudio {
  audio: Audio | null;
  /** one note of the master's four-note koto motif (1..4) */
  motif: (n: 1 | 2 | 3 | 4) => void;
}

export interface Cue {
  t: number;
  run: (a: CueAudio) => void;
}

/** The view a panel is drawn into. The context is already in design units with the frame at (0, 0). */
export interface View {
  /** device pixels per design unit */
  k: number;
  /** visible design-space rect around the frame (wider and taller than 1280 x 720 on most screens) */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /**
   * the panel's own sheet of the strip (frame units). Unlike x0 and x1, which follow the camera while it pans
   * between panels, these stay put, so anything tied to the sheet's edges does not slide during a pan.
   */
  sheetX0: number;
  sheetX1: number;
  /** real seconds since the last frame, for figure physics */
  dt: number;
}

/** One painted panel's live state. Created when the panel is first needed and released after it scrolls away. */
export interface PanelScene {
  /**
   * Bake jobs that paint the panel's still parts into offscreen canvases at device scale `k`. The player runs
   * them a few per frame ahead of time, so no single frame pays for a whole panel.
   */
  bake(k: number, view: View): (() => void)[];
  /** advance stateful parts (rope physics, particles) to panel time t */
  update(t: number, dt: number): void;
  /** draw the panel at panel time t (seconds since it started arriving) */
  draw(ctx: CanvasRenderingContext2D, t: number, view: View): void;
  /** optional whole-panel camera at time t: scale about (cx, cy) and an offset, in design units */
  camera?(t: number): { z: number; cx: number; cy: number; dx: number; dy: number };
  release(): void;
}

export interface PanelDef {
  id: string;
  title: string;
  /** seconds on screen; the 0.6 s pan into the next panel overlaps the next panel's start */
  dur: number;
  /** 'final' = finished art; 'board' = storyboard-quality sketch with final text and timing */
  quality: 'final' | 'board';
  text: PanelText;
  cues: Cue[];
  create(lead: CharId): PanelScene;
}

export interface CutsceneDef {
  id: string;
  title: string;
  panels: PanelDef[];
  /** how the last panel leaves: 'map' pulls back into the map handscroll */
  outro: 'map' | 'paper';
  /** heavy shared work (e.g. building the game's backdrop) done before the first frame, at device scale k */
  prepare?(k: number): void;
}
