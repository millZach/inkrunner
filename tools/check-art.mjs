// F1 check (all art is drawn in code): node tools/check-art.mjs  — exits 1 and lists offenders.
// Fails if src/, public/ or dist/ contain image, video or sprite files, or if a source file in src/
// imports or references an image or video URL (import, new URL, CSS url(), data: URI).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ART_ROOT lets tools/tests/check-art.test.mjs point the check at a fixture tree.
const ROOT = process.env.ART_ROOT ? path.resolve(process.env.ART_ROOT) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIRS = ['src', 'public', 'dist'];
const MEDIA = [
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'bmp', 'ico', 'mp4', 'webm', 'mov',
  'apng', 'jxl', 'heic', 'heif', 'tif', 'tiff', 'tga', 'psd', 'm4v', 'ogv', 'avi', 'mkv',
];
// Exceptions allowed by the brief (app icon, splash, font licenses) live outside these folders
// today. If one ever has to live here, list its repo-relative path in ALLOW.
const ALLOW = new Set([]);

const extRe = new RegExp(`\\.(${MEDIA.join('|')})$`, 'i');
const ref = `[^'"\`)\\s]+\\.(?:${MEDIA.join('|')})(?:\\?[^'"\`)\\s]*)?`;
const REF_PATTERNS = [
  new RegExp(`\\bimport\\s*(?:[^'"\`]*?\\bfrom\\s*)?['"\`](${ref})['"\`]`, 'gi'), // import x from 'a.png' / import 'a.png'
  new RegExp(`\\bimport\\s*\\(\\s*['"\`](${ref})['"\`]`, 'gi'), // import('a.png')
  new RegExp(`\\brequire\\s*\\(\\s*['"\`](${ref})['"\`]`, 'gi'),
  new RegExp(`new\\s+URL\\s*\\(\\s*['"\`](${ref})['"\`]`, 'gi'), // new URL('a.png', import.meta.url)
  new RegExp(`url\\(\\s*['"]?(${ref})['"]?\\s*\\)`, 'gi'), // CSS url(a.png)
  new RegExp(`\\b(?:src|href|srcset)\\s*=\\s*['"\`](${ref})['"\`]`, 'gi'), // markup in template strings
  /(data:(?:image|video)\/[a-z0-9.+-]+[;,])/gi, // inline image or video data
];
const CODE = /\.(ts|tsx|js|mjs|cjs|jsx|css|html|vue|svelte)$/i;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const offenders = [];
for (const d of DIRS) {
  const abs = path.join(ROOT, d);
  if (!existsSync(abs)) continue;
  for (const file of walk(abs)) {
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    if (ALLOW.has(rel)) continue;
    if (extRe.test(file)) offenders.push(`${rel}: image/video file`);
    if (d === 'src' && CODE.test(file)) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        for (const re of REF_PATTERNS) {
          re.lastIndex = 0;
          const m = re.exec(line);
          if (m) offenders.push(`${rel}:${i + 1}: references ${m[1]}`);
        }
      });
    }
  }
}

if (offenders.length) {
  console.error(`check-art: FAIL (F1: all art is drawn in code). ${offenders.length} offender(s):`);
  for (const o of offenders) console.error('  ' + o);
  process.exit(1);
}
console.log(`check-art: PASS (no image, video or sprite files in ${DIRS.join(', ')}; no image/video URLs referenced in src)`);
