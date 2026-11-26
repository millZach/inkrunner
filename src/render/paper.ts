import { mulberry32, noise2 } from '../rng';

/** A tileable-ish grain texture meant to be multiplied over the whole frame. */
export function makeGrain(size = 512): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // periodic noise so the tile wraps without seams
      const u = x / size;
      const v = y / size;
      const n1 = tiled(u, v, 8, 1);
      const n2 = tiled(u, v, 64, 2);
      const fine = Math.random();
      const g = 255 - (n1 * 10 + n2 * 10 + fine * 14);
      const i = (y * size + x) * 4;
      d[i] = g;
      d[i + 1] = g - 1;
      d[i + 2] = g - 4;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // washi fibers
  const r = mulberry32(7);
  ctx.lineCap = 'round';
  for (let k = 0; k < 420; k++) {
    const x = r() * size;
    const y = r() * size;
    const len = 6 + r() * 34;
    const a = r() * Math.PI * 2;
    const bend = (r() - 0.5) * 12;
    ctx.strokeStyle = r() < 0.75 ? `rgba(120,100,70,${0.05 + r() * 0.07})` : `rgba(255,255,250,${0.3 + r() * 0.3})`;
    ctx.lineWidth = 0.5 + r() * 0.8;
    for (const ox of [0, -size, size]) {
      for (const oy of [0, -size, size]) {
        ctx.beginPath();
        ctx.moveTo(x + ox, y + oy);
        ctx.quadraticCurveTo(
          x + ox + Math.cos(a) * len * 0.5 - Math.sin(a) * bend,
          y + oy + Math.sin(a) * len * 0.5 + Math.cos(a) * bend,
          x + ox + Math.cos(a) * len,
          y + oy + Math.sin(a) * len,
        );
        ctx.stroke();
      }
    }
  }
  return c;
}

function tiled(u: number, v: number, freq: number, seed: number): number {
  // blend four samples so the noise wraps around
  const a = noise2(u * freq, v * freq, seed);
  const b = noise2((u - 1) * freq, v * freq, seed);
  const c = noise2(u * freq, (v - 1) * freq, seed);
  const e = noise2((u - 1) * freq, (v - 1) * freq, seed);
  const x1 = a * (1 - u) + b * u;
  const x2 = c * (1 - u) + e * u;
  return x1 * (1 - v) + x2 * v;
}

/** Warm aged-paper edges, sized to the screen. */
export function makeVignette(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.62);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.6, 'rgba(236,224,200,1)');
  g.addColorStop(1, 'rgba(176,148,110,1)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  return c;
}
