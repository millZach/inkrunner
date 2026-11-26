// Shared by the Node server (server.mjs) and the Vercel functions (api/).
export const MAX_BODY = 400_000;
export const LEVEL_RE = /^[a-z0-9-]{1,40}$/;
// These mirror CHAR_IDS and INK_ORDER in src/config.ts (plain JS here so the Vercel functions need no
// TypeScript). tools/tests/validate.test.mjs fails if the two ever disagree.
export const CHARS = new Set(['ren', 'kohaku']);
export const INKS = new Set(['shu', 'ai', 'kin', 'murasaki']);
export const GRADES = new Set(['松', '竹', '梅']);

const finite = (v, lim = 1e5) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < lim;

/** Returns the name of the first bad field, or null when the run is acceptable. */
export function validate(b) {
  if (!b || typeof b !== 'object') return 'body';
  if (typeof b.level !== 'string' || !LEVEL_RE.test(b.level)) return 'level';
  if (!CHARS.has(b.char)) return 'char';
  if (!finite(b.time) || b.time < 5 || b.time > 3600) return 'time';
  if (!GRADES.has(b.grade)) return 'grade';
  if (!Array.isArray(b.strokes) || b.strokes.length > 80) return 'strokes';
  for (const s of b.strokes) {
    if (!s || !INKS.has(s.k) || !Array.isArray(s.p) || s.p.length % 3 !== 0 || s.p.length > 1200 || s.p.length < 6) return 'stroke';
    if (!s.p.every((n) => finite(n))) return 'stroke';
  }
  if (!Array.isArray(b.path) || b.path.length > 40000 || b.path.length % 2 !== 0 || !b.path.every((n) => finite(n))) return 'path';
  return null;
}
