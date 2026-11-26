import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

const native = Capacitor.isNativePlatform();

/** Keep the synchronous game cache, backed by UserDefaults on iOS. */
export function saveSetting(key: string, value: string) {
  localStorage.setItem(key, value);
  if (native) void Preferences.set({ key, value }).catch(error => console.error('Could not save setting', error));
}

/** Restore the cache before constructing the game or its audio engine. */
export async function initializeSettings() {
  if (!native) return;
  try {
    const { keys } = await Preferences.keys();
    await Promise.all(keys.filter(key => key.startsWith('inkrunner:')).map(async key => {
      const { value } = await Preferences.get({ key });
      if (value !== null) localStorage.setItem(key, value);
    }));
  } catch (error) {
    // Start with the WebView cache rather than blocking the game on a native bridge failure.
    console.error('Could not restore settings', error);
  }
}
