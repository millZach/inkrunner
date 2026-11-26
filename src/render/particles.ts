import { INK } from '../config';
import { rgba } from './brush';

export type PKind = 'ink' | 'paint' | 'steam' | 'mote' | 'petal' | 'ember';

interface P {
  kind: PKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  rot: number;
  spin: number;
}

export interface SpawnEvent {
  kind: PKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
  color: string;
}

export class Particles {
  list: P[] = [];
  /** optional tap so replays can re-create particles */
  log: ((e: SpawnEvent) => void) | null = null;

  spawn(kind: PKind, x: number, y: number, vx: number, vy: number, life: number, size: number, color = INK) {
    this.log?.({ kind, x, y, vx, vy, life, size, color });
    if (this.list.length > 1600) this.list.shift();
    this.list.push({ kind, x, y, vx, vy, life, max: life, size, color, rot: Math.random() * 6.28, spin: (Math.random() - 0.5) * 6 });
  }

  burst(kind: PKind, x: number, y: number, n: number, speed: number, life: number, size: number, color = INK, upBias = 0) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      this.spawn(kind, x, y, Math.cos(a) * s, Math.sin(a) * s - upBias, life * (0.6 + Math.random() * 0.6), size * (0.5 + Math.random()), color);
    }
  }

  update(dt: number) {
    for (const p of this.list) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      switch (p.kind) {
        case 'ink':
        case 'paint':
          p.vy += 1400 * dt;
          p.vx *= 1 - 1.5 * dt;
          break;
        case 'steam':
          p.vy -= 30 * dt;
          p.vx *= 1 - 1.2 * dt;
          p.size += 26 * dt;
          break;
        case 'mote':
          p.vy -= 20 * dt;
          p.vx *= 1 - 0.8 * dt;
          break;
        case 'petal':
          p.vy += (60 - p.vy) * dt;
          p.vx += Math.sin(p.rot * 1.3) * 60 * dt;
          break;
        case 'ember':
          p.vy -= 40 * dt;
          p.vx += Math.sin(p.life * 9 + p.x) * 30 * dt;
          break;
      }
    }
    this.list = this.list.filter((p) => p.life > 0);
  }

  draw(ctx: CanvasRenderingContext2D) {
    for (const p of this.list) {
      const k = Math.max(0, p.life / p.max);
      switch (p.kind) {
        case 'ink':
        case 'paint':
          ctx.fillStyle = p.color;
          ctx.globalAlpha = Math.min(1, k * 1.6);
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, p.size * (0.6 + k * 0.4), p.size * (0.5 + k * 0.4), Math.atan2(p.vy, p.vx), 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'steam':
          ctx.fillStyle = rgba(INK, 0.1 * k);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'mote': {
          ctx.globalAlpha = Math.min(1, k * 2);
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3);
          g.addColorStop(0, p.color);
          g.addColorStop(1, 'rgba(255,220,120,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'petal':
          ctx.fillStyle = p.color;
          ctx.globalAlpha = Math.min(1, k * 2) * 0.9;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.scale(1, 0.4 + 0.6 * Math.abs(Math.sin(p.rot * 2)));
          ctx.beginPath();
          ctx.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          break;
        case 'ember':
          ctx.fillStyle = INK;
          ctx.globalAlpha = k * 0.8;
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
          break;
      }
    }
    ctx.globalAlpha = 1;
  }
}
