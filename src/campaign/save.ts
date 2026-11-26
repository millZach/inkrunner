/**
 * Campaign progress: one versioned `inkrunner:campaign` JSON save, written
 * through saveSetting so it also reaches iOS UserDefaults.
 *
 * It holds only what has no other home. Best grade and time per scroll stay in
 * `inkrunner:best:<levelId>` (see loadBest in game.ts); "cleared" and the stamp
 * grade are derived from those records, never copied here.
 */
import { loadBest, type Grade } from '../game';
import { saveSetting } from '../storage';
import type { CutsceneId } from './data';

export const CAMPAIGN_KEY = 'inkrunner:campaign';
export const SAVE_VERSION = 1;
/** Budget for one scroll's map record (strokes plus header), as serialized JSON (ASCII, so chars = bytes). */
export const STROKE_BUDGET = 20 * 1024;

/** A stroke as kept for the map: ink kind plus flat x,y,w triplets in level space. */
export interface MapStroke {
  k: string;
  p: number[];
}

export interface ScrollStrokes {
  /** traveler who painted them */
  char: string;
  /** run time of the best run, for matching against the best record */
  time: number;
  /** level length, so the map can place strokes along the scroll's stretch */
  len: number;
  strokes: MapStroke[];
}

export interface CampaignSave {
  v: typeof SAVE_VERSION;
  /** cutscenes already watched (or skipped) */
  seen: CutsceneId[];
  /** the player's best-run strokes per scroll id, for the map */
  strokes: Record<string, ScrollStrokes>;
}

const empty = (): CampaignSave => ({ v: SAVE_VERSION, seen: [], strokes: {} });

/**
 * Migrations from version n to n + 1. A save without `v` is treated as
 * version 0 (nothing shipped with it; the slot exists so the path is real).
 */
const MIGRATIONS: Record<number, (old: Record<string, unknown>) => Record<string, unknown>> = {
  0: (old) => ({ v: 1, seen: Array.isArray(old.seen) ? old.seen : [], strokes: isObj(old.strokes) ? old.strokes : {} }),
};

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/** Bring any stored shape up to the current version, dropping anything malformed. */
export function migrate(raw: unknown): CampaignSave {
  if (!isObj(raw)) return empty();
  let s: Record<string, unknown> = raw;
  let v = typeof s.v === 'number' ? s.v : 0;
  while (v < SAVE_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) return empty();
    s = step(s);
    v = typeof s.v === 'number' ? s.v : v + 1;
  }
  const out = empty();
  if (Array.isArray(s.seen)) out.seen = s.seen.filter((x): x is CutsceneId => typeof x === 'string');
  if (isObj(s.strokes)) {
    for (const [id, rec] of Object.entries(s.strokes)) {
      if (!/^[a-z0-9-]{1,40}$/.test(id) || !isObj(rec) || !Array.isArray(rec.strokes)) continue;
      out.strokes[id] = {
        char: typeof rec.char === 'string' ? rec.char : 'ren',
        time: typeof rec.time === 'number' ? rec.time : 0,
        len: typeof rec.len === 'number' && rec.len > 0 ? rec.len : 1,
        strokes: rec.strokes.filter(
          (st): st is MapStroke => isObj(st) && typeof st.k === 'string' && Array.isArray(st.p) && st.p.every((n) => typeof n === 'number'),
        ),
      };
    }
  }
  return out;
}

/** True when the stored save comes from a newer build: read it, but never overwrite it. */
let readOnly = false;

export function loadCampaign(): CampaignSave {
  let raw: unknown = null;
  try {
    raw = JSON.parse(localStorage.getItem(CAMPAIGN_KEY) ?? 'null');
  } catch {
    raw = null;
  }
  readOnly = isObj(raw) && typeof raw.v === 'number' && raw.v > SAVE_VERSION;
  return migrate(raw);
}

function write(save: CampaignSave) {
  if (readOnly) return;
  saveSetting(CAMPAIGN_KEY, JSON.stringify(save));
}

// ─────────────────────────────────────────────────────────────── derived progress

export function isCleared(id: string): boolean {
  return loadBest(id) !== null;
}

export function stampGrade(id: string): Grade | null {
  return loadBest(id)?.grade ?? null;
}

// ─────────────────────────────────────────────────────────────── writers

/** True once the cutscene has played to its end or been skipped (either counts as seen). */
export function isSeen(id: CutsceneId): boolean {
  return loadCampaign().seen.includes(id);
}

export function markSeen(id: CutsceneId) {
  const s = loadCampaign();
  if (s.seen.includes(id)) return;
  s.seen.push(id);
  write(s);
}

/** Keep a scroll's best-run strokes for the map, downsampled to the budget. */
export function saveBestStrokes(id: string, rec: ScrollStrokes) {
  const s = loadCampaign();
  // the budget covers the whole record as stored: char, time and len take the first bytes of it
  const head = JSON.stringify({ ...rec, strokes: [] }).length;
  s.strokes[id] = { ...rec, strokes: downsample(rec.strokes, STROKE_BUDGET - head) };
  write(s);
}

// ─────────────────────────────────────────────────────────────── downsampling

/** Thin one stroke's triplets so consecutive kept points are at least `spacing` apart. */
function thin(p: number[], spacing: number): number[] {
  const n = Math.floor(p.length / 3);
  if (n <= 2) return p.slice(0, n * 3).map((v, i) => (i % 3 === 2 ? Math.round(v * 10) / 10 : Math.round(v)));
  const out: number[] = [];
  const push = (i: number) => out.push(Math.round(p[i * 3]), Math.round(p[i * 3 + 1]), Math.round(p[i * 3 + 2] * 10) / 10);
  push(0);
  let lx = p[0];
  let ly = p[1];
  for (let i = 1; i < n - 1; i++) {
    const x = p[i * 3];
    const y = p[i * 3 + 1];
    if (Math.hypot(x - lx, y - ly) >= spacing) {
      push(i);
      lx = x;
      ly = y;
    }
  }
  push(n - 1);
  return out;
}

function strokeLen(p: number[]): number {
  let L = 0;
  for (let i = 3; i + 1 < p.length; i += 3) L += Math.hypot(p[i] - p[i - 3], p[i + 1] - p[i - 2]);
  return L;
}

/**
 * Fit a run's strokes into STROKE_BUDGET: coarsen the point spacing first,
 * then drop the shortest strokes until the JSON fits.
 */
export function downsample(strokes: MapStroke[], budget = STROKE_BUDGET): MapStroke[] {
  const clean = strokes.filter((s) => /^[a-z]{1,12}$/.test(s.k) && s.p.length >= 6);
  for (const spacing of [8, 12, 18, 26, 40, 60, 90]) {
    const out = clean.map((s) => ({ k: s.k, p: thin(s.p, spacing) }));
    if (JSON.stringify(out).length <= budget) return out;
  }
  // Still too big: drop the shortest strokes first, keeping painting order.
  const coarse = clean.map((s) => ({ k: s.k, p: thin(s.p, 90) }));
  const shortest = coarse.map((s, i) => [strokeLen(s.p), i]).sort((a, b) => a[0] - b[0]);
  const drop = new Set<number>();
  const kept = () => coarse.filter((_, i) => !drop.has(i));
  for (let k = 0; k < shortest.length && JSON.stringify(kept()).length > budget; k++) drop.add(shortest[k][1]);
  return kept();
}
