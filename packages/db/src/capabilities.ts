export interface RuntimeCapabilityResult {
  webLocks: boolean;
  opfs: boolean;
  crossOriginIsolated: boolean;
  wasm: boolean;
  serviceWorker: boolean;
}

export function checkRuntimeCapabilities(): RuntimeCapabilityResult {
  const nav = globalThis.navigator as Navigator & {
    storage?: { getDirectory?: () => Promise<FileSystemDirectoryHandle> };
    locks?: LockManager;
    serviceWorker?: ServiceWorkerContainer;
  };

  return {
    webLocks: typeof nav?.locks?.request === 'function',
    opfs: typeof nav?.storage?.getDirectory === 'function',
    crossOriginIsolated: globalThis.crossOriginIsolated === true,
    wasm: typeof WebAssembly === 'object',
    serviceWorker: typeof nav?.serviceWorker?.register === 'function',
  };
}

export async function acquireSingleTabLock(lockName: string): Promise<() => void> {
  if (!navigator.locks?.request) {
    throw new Error('Web Locks API is not supported.');
  }

  let releaseResolver: (() => void) | null = null;
  let decisionResolver: (() => void) | null = null;
  let lockGranted = false;

  const completion = new Promise<void>((resolve) => {
    releaseResolver = resolve;
  });

  const decided = new Promise<void>((resolve) => {
    decisionResolver = resolve;
  });

  void navigator.locks.request(lockName, { ifAvailable: true, mode: 'exclusive' }, async (lock) => {
    if (!lock) {
      decisionResolver?.();
      return;
    }
    lockGranted = true;
    decisionResolver?.();
    await completion;
  });

  await decided;

  if (!lockGranted) {
    throw new Error('別タブで既に起動中です。');
  }

  return () => {
    releaseResolver?.();
  };
}
