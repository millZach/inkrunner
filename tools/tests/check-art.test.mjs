// tools/check-art.mjs must pass clean trees and catch image files and image imports: npm test
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'check-art.mjs');
const roots = [];
after(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

function fixture(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'check-art-'));
  roots.push(root);
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), body);
  }
  return root;
}
const run = (root) => spawnSync(process.execPath, [SCRIPT], { env: { ...process.env, ART_ROOT: root }, encoding: 'utf8' });

const clean = {
  'src/main.ts': "import './style.css';\ncanvas.toBlob(cb, 'image/png');\nconst t = 'video/webm';\n",
  'src/style.css': "@font-face { src: url('font.woff2') format('woff2'); }\n",
  'public/licenses/Font-OFL.txt': 'SIL Open Font License',
  'dist/assets/index.js': 'console.log(1)',
};

test('a tree with only code, fonts and licenses passes', () => {
  const r = run(fixture(clean));
  assert.equal(r.status, 0, r.stderr);
});

test('the real repository passes', () => {
  const r = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

for (const f of ['src/render/hero.png', 'public/bg.JPG', 'dist/assets/sheet-abc.webp', 'public/intro.mp4', 'src/x/icon.svg']) {
  test(`an image or video file is caught: ${f}`, () => {
    const r = run(fixture({ ...clean, [f]: 'x' }));
    assert.equal(r.status, 1);
    assert.match(r.stderr, new RegExp(f.replace(/[.]/g, '\\.')));
  });
}

for (const [name, line] of [
  ['import default', "import hero from './hero.png';"],
  ['side-effect import', "import '../art/bg.jpeg';"],
  ['vite ?url import', "import u from './clip.webm?url';"],
  ['dynamic import', "const m = await import('./sheet.gif');"],
  ['new URL', "const u = new URL('./hero.avif', import.meta.url);"],
  ['css url', "body { background: url(\"/paper.png\") }"],
  ['data uri', "img.src = 'data:image/png;base64,iVBOR';"],
]) {
  test(`an image reference in src is caught: ${name}`, () => {
    const r = run(fixture({ ...clean, 'src/bad.ts': line + '\n' }));
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stderr, /src\/bad\.ts:1: references/);
  });
}
