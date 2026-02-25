export const VERSION_STORAGE_KEY = 'seen_version';

type VersionStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function shouldShowWhatsNew(currentVersion: string, storage: Pick<Storage, 'getItem'> | null): boolean {
  if (!storage) {
    return false;
  }
  try {
    return storage.getItem(VERSION_STORAGE_KEY) !== currentVersion;
  } catch {
    return false;
  }
}

export function markWhatsNewAsSeen(currentVersion: string, storage: Pick<Storage, 'setItem'> | null): boolean {
  if (!storage) {
    return false;
  }
  try {
    storage.setItem(VERSION_STORAGE_KEY, currentVersion);
    return true;
  } catch {
    return false;
  }
}

function resolveLocalStorage(): VersionStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function consumeWhatsNewVisibility(currentVersion: string, storage: VersionStorage | null = resolveLocalStorage()): boolean {
  if (!shouldShowWhatsNew(currentVersion, storage)) {
    return false;
  }
  return markWhatsNewAsSeen(currentVersion, storage);
}
