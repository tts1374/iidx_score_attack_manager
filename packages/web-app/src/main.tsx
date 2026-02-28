import React from 'react';
import ReactDOM from 'react-dom/client';
import { acquireSingleTabLock, checkRuntimeCapabilities } from '@iidx/db';
import type { TournamentPayload } from '@iidx/shared';

import { App, AppFallbackUnsupported } from './App';
import { APP_LANGUAGE_SETTING_KEY, ensureI18n, normalizeLanguage } from './i18n';
import { createAppServices } from './services/app-services';
import { AppServicesProvider } from './services/context';
import { resolveImportPayloadFromLocation } from './utils/import-confirm';
import {
  IMPORT_DELEGATION_BROADCAST_ACK_TIMEOUT_MS,
  IMPORT_DELEGATION_CHANNEL,
  IMPORT_DELEGATION_STORAGE_ACK_KEY,
  IMPORT_DELEGATION_STORAGE_ACK_TIMEOUT_MS,
  IMPORT_DELEGATION_STORAGE_REQUEST_KEY,
  buildImportRequestMessage,
  isImportAckMessage,
  parseImportAckStorageValue,
} from './utils/import-delegation';
import { HOME_PATH } from './utils/payload-url';
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

type ImportDelegationState = 'sending' | 'success' | 'failed';
type ImportDelegationResult = { status: 'ack'; via: 'broadcast' | 'storage' } | { status: 'not_acknowledged' };

interface LocalConsentScreenProps {
  onStart: () => void;
}

interface ServiceWorkerFailureScreenProps {
  reason: ServiceWorkerFailureReason;
  errorMessage: string | null;
}

interface ImportDelegationScreenProps {
  rawPayloadParam: string;
  payloadPreview: TournamentPayload;
}

interface InvalidImportLinkScreenProps {
  code: string;
  message: string;
}

function safeSetLocalStorage(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function navigateToHome(): void {
  window.location.replace(HOME_PATH);
}

function tryCloseTab(): void {
  try {
    window.close();
  } catch {
    // ignore close failures
  }
}

async function sendImportRequestViaBroadcast(
  requestMessage: ReturnType<typeof buildImportRequestMessage>,
): Promise<boolean> {
  if (typeof BroadcastChannel !== 'function') {
    return false;
  }

  return await new Promise<boolean>((resolve) => {
    const channel = new BroadcastChannel(IMPORT_DELEGATION_CHANNEL);
    let settled = false;

    const finish = (acked: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timeoutId);
      channel.removeEventListener('message', onMessage);
      channel.close();
      resolve(acked);
    };

    const onMessage = (event: MessageEvent<unknown>) => {
      if (!isImportAckMessage(event.data)) {
        return;
      }
      if (event.data.requestId !== requestMessage.requestId) {
        return;
      }
      finish(true);
    };

    channel.addEventListener('message', onMessage);

    const timeoutId = window.setTimeout(() => finish(false), IMPORT_DELEGATION_BROADCAST_ACK_TIMEOUT_MS);
    try {
      channel.postMessage(requestMessage);
    } catch {
      finish(false);
    }
  });
}

async function sendImportRequestViaStorage(
  requestMessage: ReturnType<typeof buildImportRequestMessage>,
): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    let settled = false;
    const localStorageRef = (() => {
      try {
        return window.localStorage;
      } catch {
        return null;
      }
    })();
    if (!localStorageRef) {
      resolve(false);
      return;
    }

    const finish = (acked: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timeoutId);
      window.removeEventListener('storage', onStorage);
      resolve(acked);
    };

    const onStorage = (event: StorageEvent) => {
      if (event.storageArea !== localStorageRef || event.key !== IMPORT_DELEGATION_STORAGE_ACK_KEY) {
        return;
      }
      const ack = parseImportAckStorageValue(event.newValue);
      if (!ack || ack.requestId !== requestMessage.requestId) {
        return;
      }
      finish(true);
    };

    window.addEventListener('storage', onStorage);
    const timeoutId = window.setTimeout(() => finish(false), IMPORT_DELEGATION_STORAGE_ACK_TIMEOUT_MS);

    const wrote = safeSetLocalStorage(IMPORT_DELEGATION_STORAGE_REQUEST_KEY, JSON.stringify(requestMessage));
    if (!wrote) {
      finish(false);
    }
  });
}

async function delegateImportToExistingTab(rawPayloadParam: string, senderTabId: string): Promise<ImportDelegationResult> {
  const requestMessage = buildImportRequestMessage({
    requestId: crypto.randomUUID(),
    senderTabId,
    rawPayloadParam,
  });

  const broadcastAcked = await sendImportRequestViaBroadcast(requestMessage);
  if (broadcastAcked) {
    return {
      status: 'ack',
      via: 'broadcast',
    };
  }

  const storageAcked = await sendImportRequestViaStorage(requestMessage);
  if (storageAcked) {
    return {
      status: 'ack',
      via: 'storage',
    };
  }

  return { status: 'not_acknowledged' };
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

function InvalidImportLinkScreen(props: InvalidImportLinkScreenProps): JSX.Element {
  return (
    <main className="page startupShell">
      <section className="warningBox startupCard">
        <h1>取り込みリンクを処理できません</h1>
        <p className="importConfirmErrorCode">{props.code}</p>
        <p>{props.message}</p>
        <div className="actions startupActionRow">
          <button type="button" className="primaryActionButton" onClick={navigateToHome}>
            アプリを開く
          </button>
        </div>
      </section>
    </main>
  );
}

function ImportDelegationScreen(props: ImportDelegationScreenProps): JSX.Element {
  const senderTabIdRef = React.useRef<string>(crypto.randomUUID());
  const [state, setState] = React.useState<ImportDelegationState>('sending');
  const [attemptCount, setAttemptCount] = React.useState(0);
  const [statusHint, setStatusHint] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setState('sending');
    setStatusHint(null);

    void delegateImportToExistingTab(props.rawPayloadParam, senderTabIdRef.current).then((result) => {
      if (cancelled) {
        return;
      }
      if (result.status === 'ack') {
        setState('success');
        setStatusHint(
          result.via === 'broadcast'
            ? '既存タブから受領応答を確認しました。'
            : '既存タブから受領応答を確認しました（storageフォールバック）。',
        );
        window.setTimeout(() => {
          tryCloseTab();
        }, 60);
        return;
      }
      setState('failed');
    });

    return () => {
      cancelled = true;
    };
  }, [attemptCount, props.rawPayloadParam]);

  if (state === 'sending') {
    return (
      <main className="page startupShell">
        <section className="unsupported startupCard">
          <h1>既存タブに送信中...</h1>
          <p>取り込み要求を送信しています。しばらくお待ちください。</p>
          <div className="startupLoading" role="status" aria-live="polite" aria-label="送信中">
            <span className="startupLoadingSpinner" aria-hidden="true" />
          </div>
        </section>
      </main>
    );
  }

  if (state === 'success') {
    return (
      <main className="page startupShell">
        <section className="unsupported startupCard">
          <h1>既存タブに送信しました</h1>
          <p>既存タブに送信しました。そちらをご確認ください。</p>
          {statusHint ? <p className="hintText">{statusHint}</p> : null}
          <div className="actions startupActionRow">
            <button type="button" className="primaryActionButton" onClick={tryCloseTab}>
              このタブを閉じる
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="page startupShell">
      <section className="warningBox startupCard">
        <h1>既存タブが見つかりませんでした</h1>
        <p>既存タブが起動していないか、この環境ではタブ間通信が利用できませんでした。</p>
        <section className="detailCard">
          <h2>取り込み内容プレビュー</h2>
          <p>大会名: {props.payloadPreview.name}</p>
          <p>開催者: {props.payloadPreview.owner}</p>
          <p>
            期間: {props.payloadPreview.start} 〜 {props.payloadPreview.end}
          </p>
          <p>譜面数: {props.payloadPreview.charts.length}</p>
          <p className="hintText">このタブでは確定保存できません。既存タブへの送信またはアプリ本体での取り込みが必要です。</p>
        </section>
        <div className="actions startupActionRow">
          <button type="button" className="primaryActionButton" onClick={navigateToHome}>
            アプリを開く
          </button>
          <button
            type="button"
            onClick={() => {
              setAttemptCount((current) => current + 1);
            }}
          >
            もう一度送信を試す
          </button>
        </div>
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
  const importPayloadResult = resolveImportPayloadFromLocation({
    pathname: window.location.pathname,
    search: window.location.search,
  });
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
    if (importPayloadResult.status === 'invalid') {
      root.render(
        <React.StrictMode>
          <InvalidImportLinkScreen code={importPayloadResult.error.code} message={importPayloadResult.error.message} />
        </React.StrictMode>,
      );
      return;
    }
    if (importPayloadResult.status === 'ready') {
      root.render(
        <React.StrictMode>
          <ImportDelegationScreen
            rawPayloadParam={importPayloadResult.rawPayloadParam}
            payloadPreview={importPayloadResult.payload}
          />
        </React.StrictMode>,
      );
      return;
    }
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
    const persistedLanguage = await services.appDb.getSetting(APP_LANGUAGE_SETTING_KEY).catch(() => null);
    await ensureI18n(normalizeLanguage(persistedLanguage));

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
