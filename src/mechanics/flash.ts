/**
 * The photosensitivity limiter (docs/summer-design.md 2.4, 4.2, N19): ONE scheduler owns every full-screen
 * luminance change in the game. Raijin's sky flash, the rain's far lightning and the Course.flash() beats all ask
 * it first.
 *
 * - at most one flash per `gap` (4) seconds of real time;
 * - never three in any 1 s window (also counting `note()`d swings such as a death's ink burst);
 * - every flash ramps in over at least `ramp` (80 ms);
 * - a flash may change the frame's luminance by at most MAX_FLASH_LUMA (20 %): `overlayAlpha()` caps the white
 *   overlay a flash may draw (white at alpha a lifts a pixel's luminance L by a·(1 − L) ≤ a);
 * - strikes in one group share one flash (`requestGroup`): later members get `false` and use local light only.
 *
 * Pure (no DOM, no imports), so tools/tests/flash.test.mjs checks the limits directly.
 */

/** The most a full-screen flash may lift the frame's luminance (0..1). */
export const MAX_FLASH_LUMA = 0.2;
/** The shortest ramp into a flash, seconds. */
export const MIN_FLASH_RAMP = 0.08;
/** The least time between two flashes, seconds. */
export const FLASH_GAP = 4;

export class FlashLimiter {
  private times: number[] = [];
  private lastGroup: string | null = null;
  private lastGroupT = -Infinity;
  constructor(
    readonly gap = FLASH_GAP,
    readonly ramp = MIN_FLASH_RAMP,
  ) {
    if (!(ramp >= MIN_FLASH_RAMP)) this.ramp = MIN_FLASH_RAMP;
  }

  /** May a flash start at real time `now`? If so it is booked. */
  request(now: number): boolean {
    const last = this.times[this.times.length - 1];
    if (last !== undefined && now - last < this.gap && now >= last) return false;
    if (this.times.filter((t) => now - t < 1 && now >= t).length >= 2) return false;
    this.times.push(now);
    if (this.times.length > 8) this.times.shift();
    return true;
  }

  /**
   * A flash for one strike group: the first member asks the limiter; the rest of the same group (within `within`
   * seconds) never get their own flash. Returns true only when this call started a flash.
   */
  requestGroup(now: number, group: string, within = 2): boolean {
    if (this.lastGroup === group && now - this.lastGroupT < within && now >= this.lastGroupT) return false;
    this.lastGroup = group;
    this.lastGroupT = now;
    return this.request(now);
  }

  /**
   * Book a full-screen luminance change that is not a flash (a death's ink burst, the respawn): no flash may
   * follow it within the gap, so lightning never stacks on those swings.
   */
  note(now: number) {
    this.times.push(now);
    if (this.times.length > 8) this.times.shift();
  }

  /** A flash's level `age` real seconds after it started: an 80 ms ramp up, then a decay at `decay`/s. */
  level(age: number, decay = 3.2) {
    if (age < 0) return 0;
    if (age < this.ramp) return age / this.ramp;
    return Math.max(0, 1 - (age - this.ramp) * decay);
  }

  /** The alpha of the white overlay a flash may draw at `age` with `strength` 0..1: never above MAX_FLASH_LUMA. */
  overlayAlpha(age: number, strength = 1, decay = 3.2) {
    return MAX_FLASH_LUMA * Math.max(0, Math.min(1, strength)) * this.level(age, decay);
  }

  /** Flashes booked so far (newest last, at most 8): for tests and the proof pages. */
  booked(): readonly number[] {
    return this.times;
  }

  reset() {
    this.times = [];
    this.lastGroup = null;
    this.lastGroupT = -Infinity;
  }
}

/** The game's one limiter. */
export const flashLimiter = new FlashLimiter();
