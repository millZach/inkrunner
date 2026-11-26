// Phone-sized landscape run with touch emulation: node tools/mobile.mjs
import puppeteer, { KnownDevices } from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist'] });
const p = await b.newPage();
await p.emulate(KnownDevices['iPhone 13 landscape']);
p.on('pageerror', (e) => console.log('ERR', e.stack));
await p.goto(process.env.URL ?? 'http://localhost:5173/', { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 2500));
console.log('coarse:', await p.evaluate(() => matchMedia('(pointer: coarse)').matches));
await p.screenshot({ path: 'shots/mobile-menu.png' });
if (await p.$('#tab-free')) await p.tap('#tab-free'); // the title opens on the campaign
await p.tap('.card[data-char="kohaku"]');
await new Promise((r) => setTimeout(r, 4200));
await p.screenshot({ path: 'shots/mobile-play.png' });
await b.close();
