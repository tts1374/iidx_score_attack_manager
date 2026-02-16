export interface RegisterPwaOptions {
  swUrl?: string;
  onUpdateFound?: (registration: ServiceWorkerRegistration) => void;
}

export async function registerPwa(options: RegisterPwaOptions = {}): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    return null;
  }

  const registration = await navigator.serviceWorker.register(options.swUrl ?? '/sw.js');

  const reportWaiting = () => {
    if (registration.waiting && options.onUpdateFound) {
      options.onUpdateFound(registration);
    }
  };

  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    if (!worker) {
      return;
    }
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed') {
        reportWaiting();
      }
    });
  });

  reportWaiting();
  return registration;
}

export function applyPwaUpdate(registration: ServiceWorkerRegistration): void {
  if (!registration.waiting) {
    return;
  }
  registration.waiting.postMessage({ type: 'SKIP_WAITING' });

  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) {
      return;
    }
    reloaded = true;
    window.location.reload();
  });
}
