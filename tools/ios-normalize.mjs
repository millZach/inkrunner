import { readFile, writeFile } from 'node:fs/promises';

// Capacitor generates Windows separators in local Swift package paths.
// Normalize them so a project synced here also opens correctly on a Mac.
const path = 'ios/App/CapApp-SPM/Package.swift';
const source = await readFile(path, 'utf8');
const normalized = source.replace(/(path:\s*")([^"]+)(")/g, (_, before, value, after) =>
  before + value.replaceAll('\\', '/') + after,
);
if (source !== normalized) await writeFile(path, normalized);
console.log('iOS Swift package paths verified.');
