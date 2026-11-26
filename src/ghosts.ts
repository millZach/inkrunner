import type { InkKind } from './config';
import type { CharId } from './render/characters';
import { IS_NATIVE } from './platform';

// Native apps bundle their web content and have no same-origin API server.
const API_ORIGIN = (import.meta.env.VITE_GHOST_API_URL ?? '').replace(/\/$/, '');
const HAS_API = !IS_NATIVE || !!API_ORIGIN;

/** Another traveler's finished run, as stored by the ghost server. */
export interface GhostRun {
  char: CharId;
  time: number;
  grade: string;
  strokes: { k: InkKind; p: number[] }[];
  path: number[];
}

export interface GhostSet {
  best: GhostRun | null;
  others: GhostRun[];
}

export async function fetchGhosts(level: string): Promise<GhostSet | null> {
  if (!HAS_API) return null;
  try {
    const r = await fetch(`${API_ORIGIN}/api/ghosts?level=${encodeURIComponent(level)}`, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return null;
    return (await r.json()) as GhostSet;
  } catch {
    return null;
  }
}

export async function postRun(level: string, run: GhostRun & { ink: number; falls: number }): Promise<void> {
  if (!HAS_API) return;
  try {
    await fetch(`${API_ORIGIN}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ level, ...run }),
      signal: AbortSignal.timeout(6000),
    });
  } catch {
    // ghosts are a nicety; offline play is fine
  }
}
