// GET /api/ghosts?level=ID → fastest run (with its path) + a few recent runs' strokes
import { LEVEL_RE } from '../server/validate.mjs';
import { hasStore, json, pipeline } from './_redis.js';

const toRun = (r) => r && { char: r.char, time: r.time, grade: r.grade, strokes: r.strokes, path: r.path };

export async function GET(request) {
  const level = new URL(request.url).searchParams.get('level') ?? '';
  if (!LEVEL_RE.test(level)) return json(400, { error: 'level' });
  if (!hasStore) return json(503, { error: 'no store' });
  const [bestRaw, recentRaw] = await pipeline(['GET', `best:${level}`], ['LRANGE', `recent:${level}`, 0, 6]);
  const best = bestRaw ? JSON.parse(bestRaw) : null;
  const others = recentRaw
    .map((s) => JSON.parse(s))
    .filter((r) => r.id !== best?.id)
    .slice(0, 6);
  return json(200, { best: toRun(best), others: others.map(toRun) });
}
