/**
 * Ink keys: the key that picks each ink. 1 to 4 in ink-stone order unless the player changed them on the title's
 * "Ink keys" sheet (Zach, 2026-10-11). Stored as `inkrunner:inkkeys`, a KeyboardEvent.code per ink; main.ts saves it.
 * Imports only config, so node tools that load the levels can load this too.
 */
import { INK_ORDER, type InkKind } from './config';

export const INK_KEYS_SETTING = 'inkrunner:inkkeys';
export const DEFAULT_INK_KEYS: Readonly<Record<InkKind, string>> = { shu: 'Digit1', ai: 'Digit2', kin: 'Digit3', murasaki: 'Digit4' };

/** Keys the game already uses, which an ink may not take, with what they do (for the sheet's message). */
export const RESERVED_KEYS: Readonly<Record<string, string>> = {
  Space: 'jump',
  ArrowUp: 'jump',
  KeyW: 'jump',
  KeyQ: 'the previous ink',
  KeyE: 'the next ink',
  KeyR: 'back to the lantern',
  KeyG: 'ghost ink',
  KeyM: 'sound',
  Escape: 'the menu',
  Tab: 'moving between buttons',
  Enter: 'pressing buttons',
  MetaLeft: 'the system',
  MetaRight: 'the system',
  ContextMenu: 'the system',
};

let keys: Record<InkKind, string> | null = null;

/** Read lazily: on iOS the saved settings are restored into localStorage only after the modules load. */
function current(): Record<InkKind, string> {
  if (keys) return keys;
  keys = { ...DEFAULT_INK_KEYS };
  try {
    const saved = JSON.parse(globalThis.localStorage?.getItem(INK_KEYS_SETTING) ?? '{}');
    const taken = new Set<string>();
    for (const k of INK_ORDER) {
      const code = saved[k];
      if (typeof code === 'string' && !RESERVED_KEYS[code] && !taken.has(code)) keys[k] = code;
      taken.add(keys[k]);
    }
  } catch {
    // a damaged setting falls back to the numbers
  }
  return keys;
}

/** The ink a key picks, or null. */
export function inkForKey(code: string): InkKind | null {
  const k = current();
  return INK_ORDER.find((ink) => k[ink] === code) ?? null;
}

export function inkKey(ink: InkKind): string {
  return current()[ink];
}

/** All four, for saving. */
export function inkKeys(): Record<InkKind, string> {
  return { ...current() };
}

/**
 * Give an ink a key. An ink that had the key takes this ink's old one (a swap), so every ink keeps a key.
 * Returns why not when the key already does something else, or null when it took.
 */
export function setInkKey(ink: InkKind, code: string): string | null {
  if (RESERVED_KEYS[code]) return `${keyLabel(code)} is for ${RESERVED_KEYS[code]}`;
  const k = { ...current() };
  const other = INK_ORDER.find((i) => i !== ink && k[i] === code);
  if (other) k[other] = k[ink];
  k[ink] = code;
  keys = k;
  return null;
}

export function resetInkKeys() {
  keys = { ...DEFAULT_INK_KEYS };
}

const NAMED: Record<string, string> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowDown: '↓',
  ShiftLeft: 'L Shift',
  ShiftRight: 'R Shift',
  ControlLeft: 'L Ctrl',
  ControlRight: 'R Ctrl',
  AltLeft: 'L Alt',
  AltRight: 'R Alt',
  CapsLock: 'Caps',
  Backspace: 'Bksp',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
};

/** A key's short label for the HUD and the sheet: Digit1 → 1, KeyF → F, Numpad2 → Num 2, ShiftLeft → L Shift. */
export function keyLabel(code: string): string {
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Numpad\d$/.test(code)) return `Num ${code.slice(6)}`;
  return NAMED[code] ?? code;
}
