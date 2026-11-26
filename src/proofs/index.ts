import type { CharId } from '../config';
import type { Game } from '../game';
import type { LevelInfo } from '../levels';

/**
 * Proof pages: `?proof=<name>[&play=ren|kohaku]` loads src/proofs/<name>.ts, where each risky new
 * piece (portal, rain, map painting, cutscene, Raijin) is built and judged on its own.
 * Dev builds only; production bundles never include them.
 */
export interface ProofContext {
  game: Game;
  /** start a scroll the same way the menu does */
  begin: (char: CharId, info: LevelInfo, mode?: 'free' | 'campaign') => void;
  char: CharId;
  params: URLSearchParams;
}

export type Proof = (ctx: ProofContext) => void | Promise<void>;

const modules = import.meta.glob<{ default: Proof }>('./*.ts');

export async function runProof(name: string, ctx: ProofContext): Promise<boolean> {
  if (!import.meta.env.DEV) return false;
  const load = modules[`./${name}.ts`];
  if (!load || name === 'index') {
    console.error(`No proof page named "${name}". Known: ${Object.keys(modules).map((k) => k.slice(2, -3)).filter((k) => k !== 'index').join(', ')}`);
    return false;
  }
  await (await load()).default(ctx);
  return true;
}
