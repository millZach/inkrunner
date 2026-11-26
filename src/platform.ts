import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export const IS_NATIVE = Capacitor.isNativePlatform();

/** Native app switches do not reliably dispatch browser visibility events. */
export async function onAppActiveChange(callback: (active: boolean) => void) {
  if (IS_NATIVE) await App.addListener('appStateChange', ({ isActive }) => callback(isActive));
  document.addEventListener('visibilitychange', () => callback(!document.hidden));
}

const SHARE_TEXT = 'INKRUNNER — the world is ink, your brush is the only color.';

/** Share local files through the iOS sheet, Web Share, or a desktop download. */
export async function deliver(blob: Blob, filename: string, title: string) {
  if (IS_NATIVE) {
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    const path = `inkrunner-share/${Date.now()}-${filename}`;
    const { uri } = await Filesystem.writeFile({ path, data, directory: Directory.Cache, recursive: true });
    try {
      await Share.share({ title, text: SHARE_TEXT, files: [uri], dialogTitle: title });
    } catch (error) {
      if (!/cancel/i.test(String(error))) throw error;
    } finally {
      await Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => {});
    }
    return;
  }

  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title, text: SHARE_TEXT });
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
