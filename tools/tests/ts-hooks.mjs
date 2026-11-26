// Node module hooks that let tests and tools import the game's TypeScript (src/**/*.ts) directly:
// extensionless relative imports resolve to .ts, and .ts files are compiled with rolldown's transform
// (full TypeScript, including parameter properties). Installed by ./ts-register.mjs.
import { readFileSync } from 'node:fs';
import { transformSync } from 'rolldown/experimental';

export function resolve(spec, ctx, next) {
  try {
    return next(spec, ctx);
  } catch (e) {
    if ((spec.startsWith('.') || spec.startsWith('/')) && !/\.[cm]?[jt]s$/.test(spec)) return next(spec + '.ts', ctx);
    throw e;
  }
}

export function load(url, ctx, next) {
  if (!url.startsWith('file:') || !url.endsWith('.ts')) return next(url, ctx);
  const path = new URL(url).pathname;
  const out = transformSync(path, readFileSync(path, 'utf8'), { lang: 'ts', sourcemap: false });
  if (out.errors?.length) throw new Error(`${path}: ${out.errors.map((e) => e.message ?? String(e)).join('; ')}`);
  return { format: 'module', source: out.code, shortCircuit: true };
}
