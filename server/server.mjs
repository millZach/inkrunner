// INKRUNNER ghost-ink server.
//   GET  /api/ghosts?level=ID  → fastest run (with its path) + a few recent scrolls' strokes
//   POST /api/runs             → store a finished run
// Also serves the production build from ./dist when it exists.
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { LEVEL_RE, MAX_BODY, validate } from './validate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '127.0.0.1';
const DB_PATH = process.env.DB ?? path.join(ROOT, 'server', 'data', 'ghosts.db');
const DIST = path.join(ROOT, 'dist');
const KEEP_PER_LEVEL = 300;

mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY,
    level TEXT NOT NULL,
    char TEXT NOT NULL,
    time REAL NOT NULL,
    grade TEXT NOT NULL,
    data TEXT NOT NULL,
    created INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS runs_level_time ON runs (level, time);
  CREATE INDEX IF NOT EXISTS runs_level_created ON runs (level, created);
`);
const qBest = db.prepare('SELECT * FROM runs WHERE level = ? ORDER BY time ASC LIMIT 1');
const qRecent = db.prepare('SELECT * FROM runs WHERE level = ? AND id != ? ORDER BY created DESC LIMIT 6');
const qInsert = db.prepare('INSERT INTO runs (level, char, time, grade, data, created) VALUES (?, ?, ?, ?, ?, ?)');
const qCount = db.prepare('SELECT COUNT(*) AS n FROM runs WHERE level = ?');
const qPrune = db.prepare(
  `DELETE FROM runs WHERE id IN (
     SELECT id FROM runs WHERE level = ? AND id != (SELECT id FROM runs WHERE level = ? ORDER BY time ASC LIMIT 1)
     ORDER BY created ASC LIMIT ?
   )`,
);

// tiny per-IP rate limit for writes
const hits = new Map();
function allowed(ip) {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
  if (list.length >= 15) return false;
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return true;
}

function toRun(row) {
  if (!row) return null;
  const d = JSON.parse(row.data);
  return { char: row.char, time: row.time, grade: row.grade, strokes: d.strokes, path: d.path };
}

function send(res, code, body, headers = {}) {
  const data = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(data);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

function serveStatic(req, res) {
  if (!existsSync(DIST)) return send(res, 404, { error: 'not found' });
  const url = new URL(req.url, 'http://x');
  let file = path.normalize(path.join(DIST, decodeURIComponent(url.pathname)));
  if (file !== DIST && !file.startsWith(DIST + path.sep)) return send(res, 403, { error: 'forbidden' });
  if (!existsSync(file) || statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  const ext = path.extname(file);
  res.writeHead(200, {
    'content-type': MIME[ext] ?? 'application/octet-stream',
    'cache-control': file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/ghosts' && req.method === 'GET') {
    const level = url.searchParams.get('level') ?? '';
    if (!LEVEL_RE.test(level)) return send(res, 400, { error: 'level' });
    const best = qBest.get(level);
    const recent = qRecent.all(level, best?.id ?? -1);
    return send(res, 200, { best: toRun(best), others: recent.map(toRun) });
  }
  if (url.pathname === '/api/runs' && req.method === 'POST') {
    const ip = req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.socket.remoteAddress || '?';
    if (!allowed(ip)) return send(res, 429, { error: 'slow down' });
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        send(res, 413, { error: 'too large' });
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      if (res.writableEnded) return;
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        return send(res, 400, { error: 'json' });
      }
      const bad = validate(body);
      if (bad) return send(res, 400, { error: bad });
      const data = JSON.stringify({ strokes: body.strokes, path: body.path });
      qInsert.run(body.level, body.char, body.time, body.grade, data, Date.now());
      const { n } = qCount.get(body.level);
      if (n > KEEP_PER_LEVEL) qPrune.run(body.level, body.level, n - KEEP_PER_LEVEL);
      return send(res, 201, { ok: true });
    });
    return;
  }
  if (url.pathname.startsWith('/api/')) return send(res, 404, { error: 'not found' });
  return serveStatic(req, res);
});

server.listen(PORT, HOST, () => console.log(`inkrunner server on http://${HOST}:${PORT}`));
