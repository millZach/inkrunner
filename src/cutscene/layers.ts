/**
 * Baked still layers for cutscene panels. A layer is a rect of design space painted once into an offscreen
 * canvas at device scale; per frame it is only blitted, faded or revealed (cropped) along a direction, which is
 * how strokes "paint themselves in" without redrawing their brushwork every frame.
 */
export class Layer {
  canvas: HTMLCanvasElement | null = null;
  private k = 1;
  constructor(
    public x: number,
    public y: number,
    public w: number,
    public h: number,
    private paint: (ctx: CanvasRenderingContext2D) => void,
  ) {}

  get ready() {
    return this.canvas !== null;
  }

  bake(k: number) {
    this.k = k;
    const c = this.canvas ?? document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(this.w * k));
    c.height = Math.max(1, Math.ceil(this.h * k));
    const ctx = c.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.setTransform(k, 0, 0, k, -this.x * k, -this.y * k);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    this.paint(ctx);
    this.canvas = c;
  }

  release() {
    if (this.canvas) {
      this.canvas.width = this.canvas.height = 0;
      this.canvas = null;
    }
  }

  draw(ctx: CanvasRenderingContext2D, alpha = 1) {
    if (!this.canvas || alpha <= 0) return;
    const a0 = ctx.globalAlpha;
    ctx.globalAlpha = a0 * Math.min(1, alpha);
    ctx.drawImage(this.canvas, this.x, this.y, this.w, this.h);
    ctx.globalAlpha = a0;
  }

  /**
   * Draw the layer revealed up to `front` (a design-space coordinate) along an axis, with a soft wet edge of
   * `soft` units. dir 'x' reveals left to right, '-x' right to left, 'y' top to bottom, '-y' bottom to top.
   */
  reveal(ctx: CanvasRenderingContext2D, dir: 'x' | '-x' | 'y' | '-y', front: number, soft = 16, alpha = 1) {
    if (!this.canvas || alpha <= 0) return;
    const horiz = dir === 'x' || dir === '-x';
    const lo = horiz ? this.x : this.y;
    const size = horiz ? this.w : this.h;
    const fwd = dir === 'x' || dir === 'y';
    // distance revealed from the starting edge, in units
    const d = fwd ? front - lo : lo + size - front;
    if (d <= 0) return;
    if (d >= size + soft) {
      this.draw(ctx, alpha);
      return;
    }
    const a0 = ctx.globalAlpha;
    const steps = 4;
    const solid = Math.max(0, Math.min(size, d - soft));
    this.slice(ctx, horiz, fwd, 0, solid, a0 * alpha);
    for (let i = 0; i < steps; i++) {
      const s0 = solid + (soft * i) / steps;
      const s1 = Math.min(size, solid + (soft * (i + 1)) / steps, d);
      if (s1 <= s0) break;
      this.slice(ctx, horiz, fwd, s0, s1, a0 * alpha * (1 - (i + 0.5) / steps));
    }
    ctx.globalAlpha = a0;
  }

  /** blit the part of the layer between s0 and s1 units from its starting edge */
  private slice(ctx: CanvasRenderingContext2D, horiz: boolean, fwd: boolean, s0: number, s1: number, alpha: number) {
    if (s1 - s0 <= 0.01 || !this.canvas) return;
    const k = this.k;
    const c = this.canvas;
    ctx.globalAlpha = alpha;
    if (horiz) {
      const u0 = fwd ? s0 : this.w - s1;
      const sx = Math.max(0, Math.floor(u0 * k));
      const sw = Math.min(c.width - sx, Math.ceil((s1 - s0) * k));
      if (sw <= 0) return;
      ctx.drawImage(c, sx, 0, sw, c.height, this.x + sx / k, this.y, sw / k, this.h);
    } else {
      const u0 = fwd ? s0 : this.h - s1;
      const sy = Math.max(0, Math.floor(u0 * k));
      const sh = Math.min(c.height - sy, Math.ceil((s1 - s0) * k));
      if (sh <= 0) return;
      ctx.drawImage(c, 0, sy, c.width, sh, this.x, this.y + sy / k, this.w, sh / k);
    }
  }
}

/** progress of a timed span: 0 before t0, 1 after t0 + dur */
export const span = (t: number, t0: number, dur: number) => (t <= t0 ? 0 : t >= t0 + dur ? 1 : (t - t0) / dur);
