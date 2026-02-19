import React from 'react';
import ReactDOM from 'react-dom/client';
import { acquireSingleTabLock, checkRuntimeCapabilities } from '@iidx/db';

import { App, AppFallbackUnsupported } from './App';
import { createAppServices } from './services/app-services';
import { AppServicesProvider } from './services/context';
import './styles.css';

const TUTORIAL_DONE_KEY = 'tutorial_done';
const COI_RELOAD_ATTEMPT_KEY = 'coi_reload_attempt';
const SW_CONTROLLER_TIMEOUT_MS = 9000;

type ServiceWorkerFailureReason = 'unsupported' | 'register_error' | 'controller_timeout';

interface ServiceWorkerRegisterAttempt {
  registration: ServiceWorkerRegistration | null;
  errorMessage: string | null;
}

type ServiceWorkerSetupResult =
  | { status: 'controller_ready' }
  | { status: 'failed'; reason: ServiceWorkerFailureReason; errorMessage: string | null };

interface LocalConsentScreenProps {
  onStart: () => void;
}

interface ServiceWorkerFailureScreenProps {
  reason: ServiceWorkerFailureReason;
  errorMessage: string | null;
}

function readLocalStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocalStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore storage failures (private mode / policy restrictions)
  }
}

function readSessionStorage(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSessionStorage(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // ignore storage failures (private mode / policy restrictions)
  }
}

function hasReloadAttemptedInTab(): boolean {
  return readSessionStorage(COI_RELOAD_ATTEMPT_KEY) === '1';
}

function markReloadAttemptInTab(): void {
  writeSessionStorage(COI_RELOAD_ATTEMPT_KEY, '1');
}

function createServiceWorkerRegistrationAttempt(swUrl: string): Promise<ServiceWorkerRegisterAttempt> {
  return navigator.serviceWorker
    .register(swUrl)
    .then((registration) => ({ registration, errorMessage: null }))
    .catch((error: unknown) => ({
      registration: null,
      errorMessage: error instanceof Error ? error.message : String(error),
    }));
}

async function waitForServiceWorkerController(timeoutMs: number): Promise<boolean> {
  if (!('serviceWorker' in navigator)) {
    return false;
  }
  if (navigator.serviceWorker.controller) {
    return true;
  }

  return await new Promise<boolean>((resolve) => {
    let done = false;
    let timerId: number | undefined;

    const finish = (value: boolean) => {
      if (done) {
        return;
      }
      done = true;
      if (timerId !== undefined) {
        window.clearTimeout(timerId);
      }
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      resolve(value);
    };

    const onControllerChange = () => {
      if (navigator.serviceWorker.controller) {
        finish(true);
      }
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    timerId = window.setTimeout(() => finish(false), timeoutMs);

    void navigator.serviceWorker.ready
      .then(() => {
        if (navigator.serviceWorker.controller) {
          finish(true);
        }
      })
      .catch(() => {
        // keep waiting until timeout/controllerchange
      });
  });
}

async function ensureServiceWorkerController(
  swUrl: string,
  warmupAttempt: Promise<ServiceWorkerRegisterAttempt> | null,
): Promise<ServiceWorkerSetupResult> {
  if (!('serviceWorker' in navigator)) {
    return { status: 'failed', reason: 'unsupported', errorMessage: null };
  }

  const warmupResult = warmupAttempt ? await warmupAttempt : null;
  const attemptResult =
    warmupResult && warmupResult.registration ? warmupResult : await createServiceWorkerRegistrationAttempt(swUrl);
  const { registration, errorMessage } = attemptResult;
  if (!registration) {
    return { status: 'failed', reason: 'register_error', errorMessage };
  }

  const hasController = await waitForServiceWorkerController(SW_CONTROLLER_TIMEOUT_MS);
  if (!hasController) {
    return { status: 'failed', reason: 'controller_timeout', errorMessage: null };
  }

  return { status: 'controller_ready' };
}

function LocalConsentScreen(props: LocalConsentScreenProps): JSX.Element {
  const [understood, setUnderstood] = React.useState(false);

  return (
    <main className="page startupShell">
      <section className="unsupported startupCard">
        <h1>スコアタログ</h1>
        <p>ようこそ！このアプリはbeatmania IIDXのスコアタの管理をするアプリです！</p>
        <h2>このアプリのデータについて</h2>
        <ul>
          <li>データはご利用中のブラウザ内に保存されます</li>
          <li>サーバーへの自動同期は行われません</li>
          <li>端末変更やブラウザデータ削除で消える場合があります</li>
          <li>QRコードやURLアクセスで大会をインポートすることができます</li>
          <li>必要に応じてバックアップをご検討ください</li>
        </ul>
        <label className="startupConsentCheck">
          <input
            type="checkbox"
            checked={understood}
            onChange={(event) => setUnderstood(event.currentTarget.checked)}
          />
          <span>上記を理解しました</span>
        </label>
        <div className="actions">
          <button type="button" className="primaryActionButton" disabled={!understood} onClick={props.onStart}>
            はじめる
          </button>
        </div>
      </section>
    </main>
  );
}

function SetupLoadingScreen(): JSX.Element {
  return (
    <main className="page startupShell">
      <section className="unsupported startupCard">
        <div className="startupLoading" role="status" aria-live="polite" aria-label="読み込み中">
          <span className="startupLoadingSpinner" aria-hidden="true" />
        </div>
      </section>
    </main>
  );
}

function ServiceWorkerFailureScreen(props: ServiceWorkerFailureScreenProps): JSX.Element {
  const [guideOpen, setGuideOpen] = React.useState(false);

  const failureHint =
    props.reason === 'unsupported'
      ? 'このブラウザは Service Worker に対応していません。'
      : props.reason === 'register_error'
        ? 'Service Worker の登録処理でエラーが発生しました。'
        : '一定時間待っても Service Worker がページを制御できませんでした。';

  return (
    <main className="page startupShell">
      <section className="unsupported startupCard">
        <h1>Service Worker を有効化できませんでした</h1>
        <p>初回セットアップを完了できませんでした。</p>
        <p className="errorText">{failureHint}</p>
        {props.errorMessage ? <p className="hintText">詳細: {props.errorMessage}</p> : null}
        <ul>
          <li>ブラウザがSWに非対応</li>
          <li>プライベートモード/制限</li>
          <li>キャッシュ破損</li>
        </ul>
        <div className="actions startupActionRow">
          <button type="button" onClick={() => window.location.reload()}>
            再読み込み
          </button>
          <button type="button" onClick={() => setGuideOpen((current) => !current)}>
            データ/キャッシュ削除案内
          </button>
        </div>
        {guideOpen ? (
          <ol className="startupGuide">
            <li>ブラウザ設定でこのサイトのデータ・キャッシュを削除する</li>
            <li>プライベートモードを終了し通常モードで開き直す</li>
            <li>それでも改善しない場合はブラウザを再起動して再アクセスする</li>
          </ol>
        ) : null}
      </section>
    </main>
  );
}

async function waitForLocalConsent(root: ReturnType<typeof ReactDOM.createRoot>): Promise<void> {
  if (readLocalStorage(TUTORIAL_DONE_KEY) === '1') {
    return;
  }

  await new Promise<void>((resolve) => {
    let completed = false;
    const handleStart = () => {
      if (completed) {
        return;
      }
      completed = true;
      writeLocalStorage(TUTORIAL_DONE_KEY, '1');
      resolve();
    };

    root.render(
      <React.StrictMode>
        <LocalConsentScreen onStart={handleStart} />
      </React.StrictMode>,
    );
  });
}

async function bootstrap(): Promise<void> {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error('root element is missing');
  }

  const root = ReactDOM.createRoot(rootElement);
  const swUrl = `${import.meta.env.BASE_URL}sw.js`;
  const swWarmupAttempt =
    !import.meta.env.DEV && 'serviceWorker' in navigator ? createServiceWorkerRegistrationAttempt(swUrl) : null;

  await waitForLocalConsent(root);

  root.render(
    <React.StrictMode>
      <SetupLoadingScreen />
    </React.StrictMode>,
  );

  if (!import.meta.env.DEV) {
    const swSetupResult = await ensureServiceWorkerController(swUrl, swWarmupAttempt);
    if (swSetupResult.status === 'failed') {
      root.render(
        <React.StrictMode>
          <ServiceWorkerFailureScreen reason={swSetupResult.reason} errorMessage={swSetupResult.errorMessage} />
        </React.StrictMode>,
      );
      return;
    }

    if (globalThis.crossOriginIsolated !== true) {
      if (!hasReloadAttemptedInTab()) {
        markReloadAttemptInTab();
        window.location.reload();
        await new Promise<never>(() => {
          /* stop boot sequence until reload */
        });
      }

      root.render(
        <React.StrictMode>
          <AppFallbackUnsupported
            reasons={[
              'Cross-Origin-Isolation (COOP/COEP)',
              '初回導入後も crossOriginIsolated が有効になりませんでした。',
            ]}
          />
        </React.StrictMode>,
      );
      return;
    }
  }

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
          <App webLockAcquired />
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
