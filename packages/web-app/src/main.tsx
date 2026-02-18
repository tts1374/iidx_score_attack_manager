import React from 'react';
import ReactDOM from 'react-dom/client';
import { acquireSingleTabLock, checkRuntimeCapabilities } from '@iidx/db';

import { App, AppFallbackUnsupported } from './App';
import { createAppServices } from './services/app-services';
import { AppServicesProvider } from './services/context';
import './styles.css';

const COI_RELOAD_FLAG = 'iidx-coi-sw-reload';

async function ensureCrossOriginIsolationByServiceWorker(): Promise<void> {
  if (import.meta.env.DEV || globalThis.crossOriginIsolated) {
    sessionStorage.removeItem(COI_RELOAD_FLAG);
    return;
  }

  if (!('serviceWorker' in navigator)) {
    return;
  }

  const swUrl = `${import.meta.env.BASE_URL}sw.js`;
  try {
    await navigator.serviceWorker.register(swUrl);
  } catch {
    return;
  }

  if (globalThis.crossOriginIsolated || navigator.serviceWorker.controller) {
    sessionStorage.removeItem(COI_RELOAD_FLAG);
    return;
  }

  if (sessionStorage.getItem(COI_RELOAD_FLAG) === '1') {
    return;
  }

  sessionStorage.setItem(COI_RELOAD_FLAG, '1');
  window.location.reload();
  await new Promise<never>(() => {
    /* stop boot sequence until reload */
  });
}

async function bootstrap(): Promise<void> {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error('root element is missing');
  }

  const root = ReactDOM.createRoot(rootElement);

  root.render(
    <React.StrictMode>
      <main className="page">
        <h1>起動中...</h1>
      </main>
    </React.StrictMode>,
  );

  await ensureCrossOriginIsolationByServiceWorker();

  const capability = checkRuntimeCapabilities();
  const reasons: string[] = [];
  if (!capability.webLocks) {
    reasons.push('Web Locks API');
  }
  if (!capability.opfs) {
    reasons.push('OPFS');
  }
  if (!capability.crossOriginIsolated) {
    reasons.push('Cross-Origin-Isolation (COOP/COEP)');
  }
  if (!capability.wasm) {
    reasons.push('WebAssembly');
  }
  if (!capability.serviceWorker) {
    reasons.push('Service Worker');
  }

  if (reasons.length > 0) {
    root.render(
      <React.StrictMode>
        <AppFallbackUnsupported reasons={reasons} />
      </React.StrictMode>,
    );
    return;
  }

  let releaseLock: (() => void) | null = null;
  try {
    releaseLock = await acquireSingleTabLock('iidx-score-attack-web-lock');
  } catch {
    root.render(
      <React.StrictMode>
        <AppFallbackUnsupported reasons={['別タブで既に起動中です。']} />
      </React.StrictMode>,
    );
    return;
  }

  try {
    const services = await Promise.race([
      createAppServices(),
      new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error('初期化がタイムアウトしました。')), 20000);
      }),
    ]);

    window.addEventListener('beforeunload', () => {
      if (releaseLock) {
        releaseLock();
        releaseLock = null;
      }
      void services.appDb.dispose();
    });

    root.render(
      <React.StrictMode>
        <AppServicesProvider services={services}>
          <App />
        </AppServicesProvider>
      </React.StrictMode>,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const reason = message.includes('no such vfs: opfs')
      ? 'OPFS VFS(opfs)が初期化できません。COOP/COEPヘッダーを確認してください。'
      : `初期化エラー: ${message}`;

    root.render(
      <React.StrictMode>
        <AppFallbackUnsupported reasons={[reason]} />
      </React.StrictMode>,
    );
  }
}

void bootstrap();
