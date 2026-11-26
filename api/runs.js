// POST /api/runs → store a finished run
import { MAX_BODY, validate } from '../server/validate.mjs';
import { hasStore, json, pipeline } from './_redis.js';

const KEEP_RECENT = 50;
const DAILY_TTL = 8 * 24 * 3600; // daily scrolls stop mattering after a week

export async function POST(request) {
  if (!hasStore) return json(503, { error: 'no store' });
  // per-IP limit: 15 runs per 10 minutes
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || '?';
  const bucket = `rl:${ip}:${Math.floor(Date.now() / 600_000)}`;
  const [hits] = await pipeline(['INCR', bucket], ['EXPIRE', bucket, 600]);
  if (hits > 15) return json(429, { error: 'slow down' });

  const text = await request.text();
  if (text.length > MAX_BODY) return json(413, { error: 'too large' });
  let b;
  try {
    b = JSON.parse(text);
  } catch {
    return json(400, { error: 'json' });
  }
  const bad = validate(b);
  if (bad) return json(400, { error: bad });

  const run = { id: crypto.randomUUID(), char: b.char, time: b.time, grade: b.grade, strokes: b.strokes, path: b.path, created: Date.now() };
  const data = JSON.stringify(run);
  const best = `best:${b.level}`;
  const recent = `recent:${b.level}`;
  const [, , bestRaw] = await pipeline(['LPUSH', recent, data], ['LTRIM', recent, 0, KEEP_RECENT - 1], ['GET', best]);
  const cmds = [];
  if (!bestRaw || run.time < JSON.parse(bestRaw).time) cmds.push(['SET', best, data]);
  if (b.level.startsWith('daily-')) cmds.push(['EXPIRE', recent, DAILY_TTL], ['EXPIRE', best, DAILY_TTL]);
  if (cmds.length) await pipeline(...cmds);
  return json(201, { ok: true });
}
