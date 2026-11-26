import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--use-gl=angle','--use-angle=gl-egl','--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.goto('http://localhost:5173/', { waitUntil: 'load' });
await new Promise(r => setTimeout(r, 1500));
const N = Number(process.env.N ?? 8), S = Number(process.env.S ?? 1.5);
const url = await page.evaluate(async ([N, S]) => {
  const { Character } = await import('/src/render/characters.ts');
  const c = document.createElement('canvas'); c.width = 1600; c.height = 360;
  const ctx = c.getContext('2d'); ctx.fillStyle = '#efe6d3'; ctx.fillRect(0,0,1600,360);
  ['ren','kohaku'].forEach((id, row) => {
    for (let i = 0; i < N; i++) {
      const ch = new Character(id);
      const phase = i * 2 * Math.PI / N;
      const pose = { x: 0, y: 0, phase, state: 'run', vy: 0, accent: '#f5361b', accentLight: '#ff8a50', aim: null, t: 0 };
      for (let k = 0; k < 30; k++) ch.update(pose, 1/60);
      ctx.save(); ctx.translate(100 + i * (1600/N), 150 + row * 180); ctx.scale(S,S);
      ch.draw(ctx, pose); ctx.restore();
      ctx.fillStyle = '#000'; ctx.fillRect(40 + i*(1600/N), 150 + row*180, 120, 1);
      ctx.fillStyle = '#efe6d3';
    }
  });
  return c.toDataURL();
}, [N, S]);
writeFileSync('shots/cycle.png', Buffer.from(url.split(',')[1], 'base64'));
await browser.close();
