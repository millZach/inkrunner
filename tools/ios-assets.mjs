import puppeteer from 'puppeteer-core';
import { writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const executablePath = process.env.BROWSER_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/chromium',
].find(existsSync);
if (!executablePath) throw new Error('Set BROWSER_PATH to Chrome or Chromium.');
const browser = await puppeteer.launch({ executablePath, headless: true });
try {
  const page = await browser.newPage();
  await page.goto(process.env.URL || 'http://127.0.0.1:5173/', { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.load('700px "Yuji Syuku"', '墨'));
  const png = async (size, splash = false) => {
    const data = await page.evaluate(({ size, splash }) => {
      const c = document.createElement('canvas'); c.width = c.height = size;
      const ctx = c.getContext('2d', { alpha: false });
      ctx.fillStyle = splash ? '#efe6d3' : '#e2412a'; ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = splash ? '#17161b' : '#efe6d3';
      ctx.font = `${size * (splash ? 0.10 : 0.72)}px "Yuji Syuku"`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('墨', size / 2, size * (splash ? 0.46 : 0.51));
      if (splash) {
        ctx.font = `600 ${size * 0.017}px "Shippori Mincho"`;
        ctx.fillText('I N K R U N N E R', size / 2, size * 0.55);
        ctx.fillStyle = '#e2412a'; ctx.fillRect(size * 0.485, size * 0.577, size * 0.03, size * 0.002);
      }
      return c.toDataURL('image/png').split(',')[1];
    }, { size, splash });
    return Buffer.from(data, 'base64');
  };
  await writeFile('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', await png(1024));
  const splash = await png(2732, true);
  for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
    await writeFile(`ios/App/App/Assets.xcassets/Splash.imageset/${name}`, splash);
  }
  console.log('Generated native assets from the existing INKRUNNER seal and typefaces.');
} finally {
  await browser.close();
}
