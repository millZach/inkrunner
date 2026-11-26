// Import this first (before any src/*.ts import) to load the game's TypeScript in Node: see ts-hooks.mjs.
// Then use dynamic imports, e.g. `const { Course } = await import('../../src/levels.ts')`.
import { registerHooks } from 'node:module';
import { load, resolve } from './ts-hooks.mjs';

registerHooks({ resolve, load });
