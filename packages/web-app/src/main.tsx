import React from 'react';
import ReactDOM from 'react-dom/client';
import { acquireSingleTabLock, checkRuntimeCapabilities } from '@iidx/db';

import { App, AppFallbackUnsupported } from './App';
import { createAppServices } from './services/app-services';
import { AppServicesProvider } from './services/context';
import './styles.css';

async function bootstrap(): Promise<void> {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error('root element is missing');
  }

  const root = ReactDOM.createRoot(rootElement);

  const capability = checkRuntimeCapabilities();
  const reasons: string[] = [];
  if (!capability.webLocks) {
    reasons.push('Web Locks API');
  }
  if (!capability.opfs) {
    reasons.push('OPFS');
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

  const services = await createAppServices();

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
}

void bootstrap();
