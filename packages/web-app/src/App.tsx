import React from 'react';
import type { TournamentDetailItem, TournamentTab } from '@iidx/db';
import { PAYLOAD_VERSION, encodeTournamentPayload, type TournamentPayload } from '@iidx/shared';
import { applyPwaUpdate, registerPwa } from '@iidx/pwa';
import {
  AppBar,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Menu,
  MenuItem,
  SpeedDial,
  SpeedDialAction,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PostAddIcon from '@mui/icons-material/PostAdd';

import { ImportQrScannerDialog } from './components/ImportQrScannerDialog';
import { UnsupportedScreen } from './components/UnsupportedScreen';
import { CreateTournamentPage } from './pages/CreateTournamentPage';
import { HomePage } from './pages/HomePage';
import { ImportConfirmPage } from './pages/ImportConfirmPage';
import { ImportTournamentPage } from './pages/ImportTournamentPage';
import { SettingsPage, type AppInfoCardData, type AppSwStatus } from './pages/SettingsPage';
import { SubmitEvidencePage } from './pages/SubmitEvidencePage';
import { TournamentDetailPage } from './pages/TournamentDetailPage';
import {
  buildCreateTournamentInput,
  createInitialTournamentDraft,
  resolveCreateTournamentValidation,
  type CreateTournamentDraft,
} from './pages/create-tournament-draft';
import { useAppServices } from './services/context';
import { extractQrTextFromImage } from './utils/image';
import {
  CREATE_TOURNAMENT_PATH,
  HOME_PATH,
  IMPORT_CONFIRM_PATH,
  buildImportConfirmPath,
  resolveRawImportPayloadParam,
} from './utils/payload-url';

function todayJst(): string {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

function formatByteSize(rawBytes: number | null): string {
  if (rawBytes === null || !Number.isFinite(rawBytes) || rawBytes < 0) {
    return '不明';
  }
  const bytes = rawBytes;
  const gb = 1024 ** 3;
  const mb = 1024 ** 2;
  if (bytes >= gb) {
    return `${(bytes / gb).toFixed(2)} GB`;
  }
  if (bytes >= mb) {
    return `${(bytes / mb).toFixed(2)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }
  return `${bytes} bytes`;
}

type RouteState =
  | { name: 'home' }
  | { name: 'import' }
  | { name: 'import-confirm' }
  | { name: 'create' }
  | { name: 'detail'; tournamentUuid: string }
  | { name: 'submit'; tournamentUuid: string; chartId: number }
  | { name: 'settings' };

function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function isImportConfirmPath(pathname: string): boolean {
  return normalizePathname(pathname) === IMPORT_CONFIRM_PATH;
}

function isCreatePath(pathname: string): boolean {
  return normalizePathname(pathname) === CREATE_TOURNAMENT_PATH;
}

function createInitialRouteStack(): RouteState[] {
  if (isImportConfirmPath(window.location.pathname)) {
    return [{ name: 'home' }, { name: 'import-confirm' }];
  }
  return [{ name: 'home' }];
}

const INITIAL_SONG_MASTER_META: Record<string, string | null> = {
  song_master_file_name: null,
  song_master_schema_version: null,
  song_master_sha256: null,
  song_master_byte_size: null,
  song_master_generated_at: null,
  song_master_updated_at: null,
  song_master_downloaded_at: null,
  last_song_master_file_name: null,
  last_song_master_schema_version: null,
  last_song_master_sha256: null,
  last_song_master_byte_size: null,
  last_song_master_generated_at: null,
  last_song_master_downloaded_at: null,
};

const APP_VERSION =
  typeof __APP_VERSION__ === 'string' && __APP_VERSION__.trim().length > 0 ? __APP_VERSION__ : '-';
const BUILD_TIME =
  typeof __BUILD_TIME__ === 'string' && __BUILD_TIME__.trim().length > 0 ? __BUILD_TIME__ : '-';
const SW_VERSION_REQUEST_TIMEOUT_MS = 1500;
const DEBUG_MODE_STORAGE_KEY = 'iidx:debug:mode';

function readDebugMode(): boolean {
  try {
    return window.localStorage.getItem(DEBUG_MODE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeDebugMode(enabled: boolean): void {
  try {
    window.localStorage.setItem(DEBUG_MODE_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // ignore storage failures
  }
}
const HOME_CREATE_FAB_TOOLTIP_KEY = 'iidx.home.create-fab-tooltip-seen';

interface AppProps {
  webLockAcquired?: boolean;
}

interface AppInfoDetailState {
  swVersion: string;
  swScope: string;
  swState: string;
  swClientsClaim: boolean | null;
  swSkipWaiting: boolean | null;
  appDbUserVersion: number | null;
  appDbSizeBytes: number | null;
  appDbIntegrityCheck: string | null;
  webLocksStatus: AppInfoCardData['webLocksStatus'];
  webLocksReason: string | null;
  opfsStatus: AppInfoCardData['opfsStatus'];
  storageUsageBytes: number | null;
  storageQuotaBytes: number | null;
}

interface SongMasterActionResult {
  ok: boolean;
  source: string;
  message: string | null;
  latestSha256: string | null;
  localSha256: string | null;
  checkedAt: string;
}

interface RuntimeLogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  category: string;
  message: string;
  detail?: string;
}

function resolveWebLocksReason(status: AppInfoCardData['webLocksStatus']): string | null {
  switch (status) {
    case 'acquired':
      return null;
    case 'unsupported':
      return 'ブラウザが Web Locks API に未対応です。';
    case 'not_acquired':
    default:
      return '別タブで稼働中の可能性があります。';
  }
}

function resolveServiceWorkerState(registration: ServiceWorkerRegistration | null): string {
  if (!registration) {
    return 'inactive';
  }
  return registration.active?.state ?? registration.waiting?.state ?? registration.installing?.state ?? 'inactive';
}

async function resolveStorageEstimate(): Promise<{ usageBytes: number | null; quotaBytes: number | null }> {
  if (!navigator.storage?.estimate) {
    return { usageBytes: null, quotaBytes: null };
  }
  try {
    const estimate = await navigator.storage.estimate();
    const usageBytes = Number(estimate.usage);
    const quotaBytes = Number(estimate.quota);
    return {
      usageBytes: Number.isFinite(usageBytes) && usageBytes >= 0 ? usageBytes : null,
      quotaBytes: Number.isFinite(quotaBytes) && quotaBytes > 0 ? quotaBytes : null,
    };
  } catch {
    return { usageBytes: null, quotaBytes: null };
  }
}

function resolveServiceWorkerStatus(pwaUpdate: ServiceWorkerRegistration | null, hasController: boolean): AppSwStatus {
  if (pwaUpdate) {
    return 'update_available';
  }
  return hasController ? 'enabled' : 'unregistered';
}

async function requestServiceWorkerVersion(): Promise<string | null> {
  if (!('serviceWorker' in navigator)) {
    return null;
  }
  const controller = navigator.serviceWorker.controller;
  if (!controller) {
    return null;
  }

  return new Promise<string | null>((resolve) => {
    const channel = new MessageChannel();
    let settled = false;
    const timerId = window.setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      channel.port1.close();
      resolve(null);
    }, SW_VERSION_REQUEST_TIMEOUT_MS);

    channel.port1.onmessage = (event: MessageEvent) => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timerId);
      channel.port1.close();
      const payload = event.data as { type?: string; value?: unknown } | undefined;
      if (payload?.type === 'SW_VERSION' && typeof payload.value === 'string' && payload.value.trim().length > 0) {
        resolve(payload.value);
        return;
      }
      resolve(null);
    };

    try {
      controller.postMessage({ type: 'GET_SW_VERSION' }, [channel.port2]);
    } catch {
      window.clearTimeout(timerId);
      channel.port1.close();
      resolve(null);
    }
  });
}

function resolveWebLocksStatus(webLockAcquired: boolean): AppInfoCardData['webLocksStatus'] {
  if (!navigator.locks?.request) {
    return 'unsupported';
  }
  return webLockAcquired ? 'acquired' : 'not_acquired';
}

async function resolveOpfsStatus(): Promise<AppInfoCardData['opfsStatus']> {
  const nav = navigator as Navigator & {
    storage?: { getDirectory?: () => Promise<FileSystemDirectoryHandle> };
  };
  if (typeof nav.storage?.getDirectory !== 'function') {
    return 'unsupported';
  }
  try {
    await nav.storage.getDirectory();
    return 'available';
  } catch {
    return 'error';
  }
}

export function App({ webLockAcquired = false }: AppProps = {}): JSX.Element {
  const { appDb, songMasterService } = useAppServices();

  const [routeStack, setRouteStack] = React.useState<RouteState[]>(() => createInitialRouteStack());
  const [tab, setTab] = React.useState<TournamentTab>('active');
  const [tournaments, setTournaments] = React.useState<Awaited<ReturnType<typeof appDb.listTournaments>>>([]);
  const [detail, setDetail] = React.useState<TournamentDetailItem | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [songMasterReady, setSongMasterReady] = React.useState(false);
  const [songMasterMeta, setSongMasterMeta] = React.useState<Record<string, string | null>>(INITIAL_SONG_MASTER_META);
  const [autoDeleteEnabled, setAutoDeleteEnabled] = React.useState(false);
  const [autoDeleteDays, setAutoDeleteDays] = React.useState(30);
  const [toast, setToast] = React.useState<string | null>(null);
  const [pwaUpdate, setPwaUpdate] = React.useState<ServiceWorkerRegistration | null>(null);
  const [hasSwController, setHasSwController] = React.useState(() =>
    'serviceWorker' in navigator ? Boolean(navigator.serviceWorker.controller) : false,
  );
  const [appInfoDetails, setAppInfoDetails] = React.useState<AppInfoDetailState>(() => ({
    swVersion: '-',
    swScope: '-',
    swState: 'inactive',
    swClientsClaim: null,
    swSkipWaiting: null,
    appDbUserVersion: null,
    appDbSizeBytes: null,
    appDbIntegrityCheck: null,
    webLocksStatus: resolveWebLocksStatus(webLockAcquired),
    webLocksReason: resolveWebLocksReason(resolveWebLocksStatus(webLockAcquired)),
    opfsStatus: 'unsupported',
    storageUsageBytes: null,
    storageQuotaBytes: null,
  }));
  const [runtimeLogs, setRuntimeLogs] = React.useState<RuntimeLogEntry[]>([]);
  const [lastCleanupResult, setLastCleanupResult] = React.useState<Awaited<ReturnType<typeof appDb.purgeExpiredEvidence>> | null>(
    null,
  );
  const [fatalError, setFatalError] = React.useState<string | null>(null);
  const [homeMenuAnchorEl, setHomeMenuAnchorEl] = React.useState<HTMLElement | null>(null);
  const [detailMenuAnchorEl, setDetailMenuAnchorEl] = React.useState<HTMLElement | null>(null);
  const [deleteTournamentDialogOpen, setDeleteTournamentDialogOpen] = React.useState(false);
  const [deleteTournamentBusy, setDeleteTournamentBusy] = React.useState(false);
  const [speedDialOpen, setSpeedDialOpen] = React.useState(false);
  const [showCreateFabTooltip, setShowCreateFabTooltip] = React.useState(false);
  const [qrImportDialogOpen, setQrImportDialogOpen] = React.useState(false);
  const [createDraft, setCreateDraft] = React.useState<CreateTournamentDraft | null>(null);
  const [createSaving, setCreateSaving] = React.useState(false);
  const [createSaveError, setCreateSaveError] = React.useState<string | null>(null);
  const [debugModeEnabled, setDebugModeEnabled] = React.useState(() => readDebugMode());
  const [detailTechnicalDialogOpen, setDetailTechnicalDialogOpen] = React.useState(false);
  const [detailDebugLastError, setDetailDebugLastError] = React.useState<string | null>(null);

  const route = routeStack[routeStack.length - 1] ?? { name: 'home' };
  const isHomeRoute = route.name === 'home';
  const isDetailRoute = route.name === 'detail';
  const isSettingsRoute = route.name === 'settings';
  const canUseQrImport = window.isSecureContext === true && typeof navigator.mediaDevices?.getUserMedia === 'function';
  const todayDate = todayJst();
  const swStatus = resolveServiceWorkerStatus(pwaUpdate, hasSwController);
  const appInfoSnapshot = React.useMemo<AppInfoCardData>(
    () => ({
      appVersion: APP_VERSION,
      buildTime: BUILD_TIME,
      swStatus,
      swVersion: appInfoDetails.swVersion,
      swScope: appInfoDetails.swScope,
      swState: appInfoDetails.swState,
      swClientsClaim: appInfoDetails.swClientsClaim,
      swSkipWaiting: appInfoDetails.swSkipWaiting,
      appDbUserVersion: appInfoDetails.appDbUserVersion,
      appDbSizeBytes: appInfoDetails.appDbSizeBytes,
      appDbIntegrityCheck: appInfoDetails.appDbIntegrityCheck,
      webLocksStatus: appInfoDetails.webLocksStatus,
      webLocksReason: appInfoDetails.webLocksReason,
      opfsStatus: appInfoDetails.opfsStatus,
      storageUsageBytes: appInfoDetails.storageUsageBytes,
      storageQuotaBytes: appInfoDetails.storageQuotaBytes,
    }),
    [appInfoDetails, swStatus],
  );
  const latestRuntimeError = React.useMemo(
    () => runtimeLogs.find((entry) => entry.level === 'error') ?? null,
    [runtimeLogs],
  );
  const detailPayloadSizeBytes = React.useMemo(() => {
    if (!detail) {
      return 0;
    }
    const payload = encodeTournamentPayload({
      v: PAYLOAD_VERSION,
      uuid: detail.sourceTournamentUuid ?? detail.tournamentUuid,
      name: detail.tournamentName,
      owner: detail.owner,
      hashtag: detail.hashtag,
      start: detail.startDate,
      end: detail.endDate,
      charts: detail.charts.map((chart) => chart.chartId),
    });
    return new TextEncoder().encode(payload).length;
  }, [detail]);
  const detailTechnicalInfo = React.useMemo(() => {
    if (!detail) {
      return null;
    }
    return {
      tournament_uuid: detail.tournamentUuid,
      source_tournament_uuid: detail.sourceTournamentUuid,
      def_hash: detail.defHash,
      payload_size_bytes: detailPayloadSizeBytes,
      last_error: detailDebugLastError ?? latestRuntimeError?.message ?? null,
    };
  }, [detail, detailDebugLastError, detailPayloadSizeBytes, latestRuntimeError]);
  const detailTechnicalLogText = React.useMemo(() => {
    if (!detailTechnicalInfo) {
      return '';
    }
    return JSON.stringify(
      {
        ...detailTechnicalInfo,
        runtime_logs: runtimeLogs.slice(0, 20).map((entry) => ({
          timestamp: entry.timestamp,
          level: entry.level,
          category: entry.category,
          message: entry.message,
          detail: entry.detail ?? null,
        })),
      },
      null,
      2,
    );
  }, [detailTechnicalInfo, runtimeLogs]);

  const pushRoute = React.useCallback((next: RouteState) => {
    setRouteStack((previous) => [...previous, next]);
  }, []);

  const replaceRoute = React.useCallback((next: RouteState) => {
    setRouteStack((previous) => {
      if (previous.length === 0) {
        return [next];
      }
      return [...previous.slice(0, -1), next];
    });
  }, []);

  const popRoute = React.useCallback(() => {
    setRouteStack((previous) => {
      if (previous.length <= 1) {
        return previous;
      }
      return previous.slice(0, -1);
    });
  }, []);

  const resetRoute = React.useCallback((next: RouteState) => {
    setRouteStack([next]);
  }, []);

  const openImportConfirm = React.useCallback(
    (rawPayloadParam: string | null) => {
      const targetPath = buildImportConfirmPath(rawPayloadParam);
      window.history.replaceState(window.history.state, '', targetPath);
      if (route.name === 'import-confirm') {
        replaceRoute({ name: 'import-confirm' });
        return;
      }
      pushRoute({ name: 'import-confirm' });
    },
    [pushRoute, replaceRoute, route.name],
  );

  const pushToast = React.useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => {
      setToast((current) => (current === message ? null : current));
    }, 4000);
  }, []);

  const toggleDebugMode = React.useCallback(() => {
    setDebugModeEnabled((current) => {
      const next = !current;
      writeDebugMode(next);
      pushToast(next ? 'デバッグモードを有効にしました。' : 'デバッグモードを無効にしました。');
      return next;
    });
  }, [pushToast]);
  const closeCreateFabTooltip = React.useCallback(() => {
    setShowCreateFabTooltip(false);
  }, []);

  React.useEffect(() => {
    if (!isHomeRoute) {
      setShowCreateFabTooltip(false);
      return;
    }
    let shouldShow = false;
    try {
      shouldShow = window.localStorage.getItem(HOME_CREATE_FAB_TOOLTIP_KEY) !== '1';
      if (shouldShow) {
        window.localStorage.setItem(HOME_CREATE_FAB_TOOLTIP_KEY, '1');
      }
    } catch {
      shouldShow = true;
    }
    if (shouldShow) {
      setShowCreateFabTooltip(true);
    }
  }, [isHomeRoute]);

  React.useEffect(() => {
    if (!showCreateFabTooltip) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setShowCreateFabTooltip(false);
    }, 3200);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [showCreateFabTooltip]);

  const appendRuntimeLog = React.useCallback(
    (entry: Omit<RuntimeLogEntry, 'id' | 'timestamp'> & { timestamp?: string }) => {
      const timestamp = entry.timestamp ?? new Date().toISOString();
      setRuntimeLogs((previous) => [
        {
          id: `${timestamp}:${crypto.randomUUID()}`,
          timestamp,
          level: entry.level,
          category: entry.category,
          message: entry.message,
          ...(entry.detail ? { detail: entry.detail } : {}),
        },
        ...previous,
      ].slice(0, 60));
    },
    [],
  );

  const refreshTournamentList = React.useCallback(async () => {
    const rows = await appDb.listTournaments(tab);
    setTournaments(rows);
  }, [appDb, tab]);

  const refreshSettingsSnapshot = React.useCallback(async () => {
    const songMeta = await appDb.getSongMasterMeta();
    const songReady = await appDb.hasSongMaster();
    const config = await appDb.getAutoDeleteConfig();
    setSongMasterMeta(songMeta);
    setSongMasterReady(songReady);
    setAutoDeleteEnabled(config.enabled);
    setAutoDeleteDays(config.days || 30);
    return {
      songMeta,
      songReady,
    };
  }, [appDb]);

  const collectAppInfoDetails = React.useCallback(async (): Promise<AppInfoDetailState> => {
    const [appDbUserVersion, appDbSizeBytes, appDbIntegrityCheck, opfsStatus, swVersion, swRegistration, storageEstimate] =
      await Promise.all([
      appDb.getAppDbUserVersion().catch(() => null),
      appDb.getAppDbFileSize().catch(() => null),
      appDb.getAppDbIntegrityCheck().catch(() => null),
      resolveOpfsStatus(),
      hasSwController ? requestServiceWorkerVersion().catch(() => null) : Promise.resolve<string | null>(null),
      'serviceWorker' in navigator ? navigator.serviceWorker.getRegistration().catch(() => null) : Promise.resolve(null),
      resolveStorageEstimate(),
    ]);
    const webLocksStatus = resolveWebLocksStatus(webLockAcquired);
    const normalizedSwRegistration = swRegistration ?? null;

    return {
      swVersion: swVersion ?? '-',
      swScope: normalizedSwRegistration?.scope ?? '-',
      swState: resolveServiceWorkerState(normalizedSwRegistration),
      swClientsClaim: hasSwController,
      swSkipWaiting: normalizedSwRegistration ? Boolean(normalizedSwRegistration.waiting) : null,
      appDbUserVersion,
      appDbSizeBytes,
      appDbIntegrityCheck,
      webLocksStatus,
      webLocksReason: resolveWebLocksReason(webLocksStatus),
      opfsStatus,
      storageUsageBytes: storageEstimate.usageBytes,
      storageQuotaBytes: storageEstimate.quotaBytes,
    };
  }, [appDb, hasSwController, webLockAcquired]);

  const updateSongMaster = React.useCallback(
    async (force: boolean): Promise<SongMasterActionResult> => {
      const checkedAt = new Date().toISOString();
      setBusy(true);
      try {
        const result = await songMasterService.updateIfNeeded(force);
        const snapshot = await refreshSettingsSnapshot();
        const actionResult: SongMasterActionResult = {
          ok: result.ok,
          source: result.source,
          message: result.message ?? null,
          latestSha256: result.latest?.sha256 ?? null,
          localSha256: snapshot.songMeta.song_master_sha256 ?? null,
          checkedAt,
        };
        if (!result.ok) {
          const message = result.message ?? '曲マスタ更新に失敗しました。';
          if (result.source !== 'local_cache') {
            setFatalError(message);
          }
          pushToast(message);
          appendRuntimeLog({
            level: result.source === 'local_cache' ? 'warn' : 'error',
            category: 'song-master',
            message: force ? '再取得（キャッシュ破棄）に失敗しました。' : '更新確認に失敗しました。',
            detail: message,
            timestamp: checkedAt,
          });
          return actionResult;
        }

        if (result.source === 'github_download' || result.source === 'initial_download') {
          if (snapshot.songReady && snapshot.songMeta.song_master_file_name) {
            pushToast('曲マスタを更新しました。');
          } else {
            pushToast('曲マスタ更新後の確認に失敗しました。');
          }
        }
        if (result.source === 'up_to_date') {
          pushToast('曲マスタは最新です。');
        }
        if (result.message) {
          pushToast(result.message);
        }
        appendRuntimeLog({
          level: result.source === 'local_cache' ? 'warn' : 'info',
          category: 'song-master',
          message:
            result.source === 'up_to_date'
              ? '曲データは最新です。'
              : force
                ? '曲データを再取得しました。'
                : '曲データの更新確認を実行しました。',
          ...(result.message ? { detail: result.message } : {}),
          timestamp: checkedAt,
        });
        return actionResult;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!(await appDb.hasSongMaster())) {
          setFatalError(message);
        }
        pushToast(message);
        appendRuntimeLog({
          level: 'error',
          category: 'song-master',
          message: force ? '再取得（キャッシュ破棄）で例外が発生しました。' : '更新確認で例外が発生しました。',
          detail: message,
          timestamp: checkedAt,
        });
        return {
          ok: false,
          source: 'error',
          message,
          latestSha256: null,
          localSha256: null,
          checkedAt,
        };
      } finally {
        setBusy(false);
      }
    },
    [appDb, appendRuntimeLog, pushToast, refreshSettingsSnapshot, songMasterService],
  );

  React.useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return;
    }
    const onControllerChange = () => {
      setHasSwController(Boolean(navigator.serviceWorker.controller));
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  React.useEffect(() => {
    const onError = (event: ErrorEvent) => {
      appendRuntimeLog({
        level: 'error',
        category: 'runtime',
        message: '未処理の例外が発生しました。',
        detail: event.error instanceof Error ? event.error.message : event.message,
      });
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      appendRuntimeLog({
        level: 'error',
        category: 'runtime',
        message: '未処理の Promise rejection が発生しました。',
        detail:
          event.reason instanceof Error
            ? event.reason.message
            : typeof event.reason === 'string'
              ? event.reason
              : JSON.stringify(event.reason),
      });
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, [appendRuntimeLog]);

  React.useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      try {
        await appDb.reconcileEvidenceFiles();
        const purged = await appDb.purgeExpiredEvidenceIfNeeded();
        if (purged > 0) {
          appendRuntimeLog({
            level: 'info',
            category: 'storage',
            message: `起動時の自動削除で ${purged} 件の画像を削除しました。`,
          });
        }
        await refreshSettingsSnapshot();
        setTournaments(await appDb.listTournaments('active'));

        if (import.meta.env.DEV) {
          if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations.map((registration) => registration.unregister()));
          }
          if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map((key) => caches.delete(key)));
          }
        } else {
          const registration = await registerPwa({
            swUrl: `${import.meta.env.BASE_URL}sw.js`,
            onUpdateFound: (reg) => {
              if (mounted) {
                setPwaUpdate(reg);
              }
            },
          });
          if (mounted && registration?.waiting) {
            setPwaUpdate(registration);
          }
        }
      } catch (error) {
        if (mounted) {
          const message = error instanceof Error ? error.message : String(error);
          pushToast(message);
          appendRuntimeLog({
            level: 'error',
            category: 'bootstrap',
            message: '起動処理でエラーが発生しました。',
            detail: message,
          });
        }
      }
    };

    void bootstrap();

    return () => {
      mounted = false;
    };
  }, [appDb, appendRuntimeLog, pushToast, refreshSettingsSnapshot]);

  React.useEffect(() => {
    void refreshTournamentList();
  }, [refreshTournamentList]);

  React.useEffect(() => {
    if (route.name !== 'settings') {
      return;
    }
    let mounted = true;
    void collectAppInfoDetails().then((details) => {
      if (mounted) {
        setAppInfoDetails(details);
      }
    });
    return () => {
      mounted = false;
    };
  }, [collectAppInfoDetails, route.name]);

  React.useEffect(() => {
    const pathname = window.location.pathname;
    if (route.name === 'home') {
      if (isImportConfirmPath(pathname) || isCreatePath(pathname)) {
        window.history.replaceState(window.history.state, '', HOME_PATH);
      }
      return;
    }
    if (route.name === 'create' && !isCreatePath(pathname)) {
      window.history.replaceState(window.history.state, '', CREATE_TOURNAMENT_PATH);
    }
  }, [route.name]);

  React.useEffect(() => {
    if (route.name !== 'create') {
      return;
    }
    if (createDraft !== null) {
      return;
    }
    setCreateDraft(createInitialTournamentDraft(todayDate));
  }, [createDraft, route.name, todayDate]);

  const reloadDetail = React.useCallback(
    async (tournamentUuid: string) => {
      const next = await appDb.getTournamentDetail(tournamentUuid);
      setDetail(next);
      setDetailDebugLastError(null);
      if (!next) {
        replaceRoute({ name: 'home' });
      }
      return next;
    },
    [appDb, replaceRoute],
  );

  const importFromPayload = React.useCallback(
    async (raw: string) => {
      if (!songMasterReady) {
        pushToast('曲マスタが未取得のため、大会作成/取込は利用できません。');
        return;
      }

      const rawPayloadParam = resolveRawImportPayloadParam(raw, true);
      if (rawPayloadParam === null && raw.trim().length === 0) {
        pushToast('取込データを認識できません。');
        return;
      }
      openImportConfirm(rawPayloadParam);
    },
    [openImportConfirm, pushToast, songMasterReady],
  );

  const importFromFile = React.useCallback(
    async (file: File) => {
      try {
        if (file.type.startsWith('image/')) {
          const qrText = await extractQrTextFromImage(file);
          if (!qrText) {
            pushToast('画像内にQRコードが見つかりませんでした。');
            return;
          }
          await importFromPayload(qrText);
          return;
        }

        const text = await file.text();
        await importFromPayload(text);
      } catch (error) {
        pushToast(error instanceof Error ? error.message : String(error));
      }
    },
    [importFromPayload, pushToast],
  );

  const importFromQrScan = React.useCallback(
    async (qrText: string) => {
      if (!songMasterReady) {
        pushToast('曲マスタが未取得のため、大会作成/取込は利用できません。');
        return;
      }

      const rawPayloadParam = resolveRawImportPayloadParam(qrText, false);
      openImportConfirm(rawPayloadParam);
    },
    [openImportConfirm, pushToast, songMasterReady],
  );

  const closeQrImportDialog = React.useCallback(() => {
    setQrImportDialogOpen(false);
  }, []);

  const handleDetectedImportQr = React.useCallback(
    (qrText: string) => {
      setQrImportDialogOpen(false);
      void importFromQrScan(qrText);
    },
    [importFromQrScan],
  );

  const openTextImportFromQrError = React.useCallback(() => {
    setQrImportDialogOpen(false);
    pushRoute({ name: 'import' });
  }, [pushRoute]);

  const confirmImport = React.useCallback(
    async (payload: TournamentPayload) => {
      const result = await appDb.importTournament(payload);
      if (result.status === 'incompatible') {
        pushToast('既存大会と開催期間が矛盾するため取り込みできません。');
        return;
      }

      await refreshTournamentList();
      if (result.status === 'unchanged') {
        pushToast('変更なし');
      } else {
        pushToast('取り込みました');
      }

      const loaded = await reloadDetail(result.tournamentUuid);
      if (!loaded) {
        resetRoute({ name: 'home' });
        return;
      }
      replaceRoute({ name: 'detail', tournamentUuid: result.tournamentUuid });
    },
    [appDb, pushToast, refreshTournamentList, reloadDetail, replaceRoute, resetRoute],
  );

  const updateCreateDraft = React.useCallback(
    (updater: (draft: CreateTournamentDraft) => CreateTournamentDraft) => {
      setCreateDraft((current) => updater(current ?? createInitialTournamentDraft(todayDate)));
    },
    [todayDate],
  );

  const confirmCreateTournament = React.useCallback(async () => {
    if (!createDraft || createSaving) {
      return;
    }

    const validation = resolveCreateTournamentValidation(createDraft, todayDate);
    if (!validation.canProceed) {
      setCreateSaveError('入力内容を確認してください。');
      return;
    }

    setCreateSaving(true);
    setCreateSaveError(null);
    try {
      const input = buildCreateTournamentInput(createDraft, validation.selectedChartIds);
      await appDb.createTournament(input);
      pushToast('保存しました。');
      await refreshTournamentList();
      setCreateDraft(null);
      resetRoute({ name: 'home' });
    } catch (error) {
      setCreateSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setCreateSaving(false);
    }
  }, [appDb, createDraft, createSaving, pushToast, refreshTournamentList, resetRoute, todayDate]);

  const saveAutoDelete = React.useCallback(
    async (enabled: boolean, days: number) => {
      await appDb.setAutoDeleteConfig(enabled, days);
      await refreshSettingsSnapshot();
      appendRuntimeLog({
        level: 'info',
        category: 'storage',
        message: `画像自動削除設定を更新しました。（${enabled ? '有効' : '無効'} / ${days}日）`,
      });
    },
    [appDb, appendRuntimeLog, refreshSettingsSnapshot],
  );

  const estimateStorageCleanup = React.useCallback(
    async (days: number) => appDb.estimateEvidenceCleanup(days),
    [appDb],
  );

  const runStorageCleanup = React.useCallback(
    async (days: number) => {
      const result = await appDb.purgeExpiredEvidence(days);
      await refreshTournamentList();
      await refreshSettingsSnapshot();
      setLastCleanupResult(result);
      const releasedText = formatByteSize(result.releasedBytes);
      pushToast(`${result.deletedImageCount}件の画像を削除（解放 ${releasedText}）`);
      appendRuntimeLog({
        level: 'info',
        category: 'storage',
        message: `容量整理を実行しました。（画像 ${result.deletedImageCount} 件 / 解放 ${releasedText}）`,
      });
      return result;
    },
    [appDb, appendRuntimeLog, pushToast, refreshSettingsSnapshot, refreshTournamentList],
  );

  const submitChart =
    route.name === 'submit' && detail
      ? detail.charts.find((chart) => chart.chartId === route.chartId) ?? null
      : null;

  const pageTitle = React.useMemo(() => {
    switch (route.name) {
      case 'home':
        return '大会一覧';
      case 'import':
        return '大会取込';
      case 'import-confirm':
        return '取り込み確認';
      case 'create':
        return '大会作成';
      case 'detail':
        return '大会詳細';
      case 'submit':
        return 'スコア提出';
      case 'settings':
        return '設定';
      default:
        return '';
    }
  }, [route.name]);

  const openCreatePage = React.useCallback(() => {
    if (!songMasterReady) {
      pushToast('曲マスタが未取得のため大会作成は利用できません。');
      return;
    }
    setCreateDraft(createInitialTournamentDraft(todayDate));
    setCreateSaving(false);
    setCreateSaveError(null);
    pushRoute({ name: 'create' });
  }, [pushRoute, pushToast, songMasterReady, todayDate]);

  const openImportPage = React.useCallback(() => {
    if (!songMasterReady) {
      pushToast('曲マスタが未取得のため大会取込は利用できません。');
      return;
    }
    if (canUseQrImport) {
      setQrImportDialogOpen(true);
      return;
    }
    pushRoute({ name: 'import' });
  }, [canUseQrImport, pushRoute, pushToast, songMasterReady]);

  const openSettingsPage = React.useCallback(() => {
    if (route.name === 'settings') {
      return;
    }
    pushRoute({ name: 'settings' });
  }, [pushRoute, route.name]);

  const applyPendingAppUpdate = React.useCallback(() => {
    if (!pwaUpdate) {
      return;
    }
    appendRuntimeLog({
      level: 'info',
      category: 'pwa',
      message: 'アプリ更新を適用します。',
    });
    applyPwaUpdate(pwaUpdate);
  }, [appendRuntimeLog, pwaUpdate]);

  const openHomeMenu = React.useCallback((event: React.MouseEvent<HTMLElement>) => {
    setHomeMenuAnchorEl(event.currentTarget);
  }, []);

  const closeHomeMenu = React.useCallback(() => {
    setHomeMenuAnchorEl(null);
  }, []);

  const openDetailMenu = React.useCallback((event: React.MouseEvent<HTMLElement>) => {
    setDetailMenuAnchorEl(event.currentTarget);
  }, []);

  const closeDetailMenu = React.useCallback(() => {
    setDetailMenuAnchorEl(null);
  }, []);

  const openDetailTechnicalDialog = React.useCallback(() => {
    closeDetailMenu();
    setDetailTechnicalDialogOpen(true);
  }, [closeDetailMenu]);

  const closeDetailTechnicalDialog = React.useCallback(() => {
    setDetailTechnicalDialogOpen(false);
  }, []);

  const copyDetailTechnicalLog = React.useCallback(async () => {
    if (!detailTechnicalLogText) {
      return;
    }
    try {
      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
        throw new Error('clipboard unavailable');
      }
      await navigator.clipboard.writeText(detailTechnicalLogText);
      pushToast('技術ログをコピーしました。');
    } catch {
      pushToast('技術ログのコピーに失敗しました。');
    }
  }, [detailTechnicalLogText, pushToast]);

  const openDeleteTournamentDialog = React.useCallback(() => {
    closeDetailMenu();
    setDeleteTournamentDialogOpen(true);
  }, [closeDetailMenu]);

  const closeDeleteTournamentDialog = React.useCallback(() => {
    if (deleteTournamentBusy) {
      return;
    }
    setDeleteTournamentDialogOpen(false);
  }, [deleteTournamentBusy]);

  const deleteCurrentTournament = React.useCallback(async () => {
    if (!detail || deleteTournamentBusy) {
      return;
    }
    setDeleteTournamentBusy(true);
    try {
      await appDb.deleteTournament(detail.tournamentUuid);
      pushToast('大会を削除しました。');
      setDetail(null);
      setDeleteTournamentDialogOpen(false);
      closeDetailMenu();
      resetRoute({ name: 'home' });
      await refreshTournamentList();
    } catch (error) {
      pushToast(error instanceof Error ? error.message : String(error));
    } finally {
      setDeleteTournamentBusy(false);
    }
  }, [appDb, closeDetailMenu, deleteTournamentBusy, detail, pushToast, refreshTournamentList, resetRoute]);

  const resetLocalData = React.useCallback(async () => {
    if (busy) {
      return;
    }

    setBusy(true);
    try {
      await appDb.resetLocalData();
      setDetail(null);
      setCreateDraft(null);
      setCreateSaving(false);
      setCreateSaveError(null);
      setTab('active');
      resetRoute({ name: 'home' });
      setTournaments(await appDb.listTournaments('active'));
      await refreshSettingsSnapshot();
      pushToast('ローカル初期化を実行しました。');
    } catch (error) {
      pushToast(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [appDb, busy, pushToast, refreshSettingsSnapshot, resetRoute]);

  const homeMenuOpen = homeMenuAnchorEl !== null;
  const detailMenuOpen = detailMenuAnchorEl !== null;
  const canGoBack = route.name !== 'home' && routeStack.length > 1;

  React.useEffect(() => {
    if (route.name === 'detail') {
      return;
    }
    setDetailMenuAnchorEl(null);
    setDeleteTournamentDialogOpen(false);
    setDetailTechnicalDialogOpen(false);
    setDetailDebugLastError(null);
  }, [route.name]);

  React.useEffect(() => {
    if (debugModeEnabled) {
      return;
    }
    setDetailTechnicalDialogOpen(false);
  }, [debugModeEnabled]);

  if (fatalError) {
    return <UnsupportedScreen title="曲マスタ起動エラー" reasons={[fatalError]} />;
  }

  return (
    <>
      <AppBar position="sticky" color="inherit" elevation={1}>
        <Toolbar sx={{ maxWidth: 980, width: '100%', margin: '0 auto' }}>
          {isHomeRoute ? (
            <>
              <Typography variant="h6" component="h1" sx={{ flexGrow: 1, fontWeight: 700 }}>
                {pageTitle}
              </Typography>
              <IconButton edge="end" color="inherit" aria-label="global-settings-menu" onClick={openHomeMenu}>
                <MoreVertIcon />
              </IconButton>
              <Menu anchorEl={homeMenuAnchorEl} open={homeMenuOpen} onClose={closeHomeMenu}>
                <MenuItem
                  onClick={() => {
                    closeHomeMenu();
                    openSettingsPage();
                  }}
                >
                  設定
                </MenuItem>
              </Menu>
            </>
          ) : (
            <>
              {isSettingsRoute ? (
                <Box
                  sx={{
                    width: '100%',
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr auto',
                    alignItems: 'center',
                    gap: 1,
                  }}
                >
                  <Box sx={{ minWidth: 40, display: 'flex', justifyContent: 'flex-start' }}>
                    {canGoBack ? (
                      <IconButton edge="start" color="inherit" aria-label="back" onClick={popRoute}>
                        <ArrowBackIcon />
                      </IconButton>
                    ) : null}
                  </Box>
                  <Typography variant="h6" component="h1" sx={{ fontWeight: 700, textAlign: 'center' }}>
                    {pageTitle}
                  </Typography>
                  <Box sx={{ minWidth: 40 }} />
                </Box>
              ) : (
                <>
                  {canGoBack ? (
                    <IconButton edge="start" color="inherit" aria-label="back" onClick={popRoute} sx={{ mr: 1 }}>
                      <ArrowBackIcon />
                    </IconButton>
                  ) : null}
                  <Typography variant="h6" component="h1" sx={{ fontWeight: 700, flexGrow: 1 }}>
                    {pageTitle}
                  </Typography>
                  {isDetailRoute ? (
                    <>
                      <IconButton edge="end" color="inherit" aria-label="detail-actions-menu" onClick={openDetailMenu}>
                        <MoreVertIcon />
                      </IconButton>
                      <Menu anchorEl={detailMenuAnchorEl} open={detailMenuOpen} onClose={closeDetailMenu}>
                        {debugModeEnabled ? (
                          <MenuItem onClick={openDetailTechnicalDialog}>
                            技術情報
                          </MenuItem>
                        ) : null}
                        <MenuItem disabled={deleteTournamentBusy} onClick={openDeleteTournamentDialog}>
                          削除
                        </MenuItem>
                      </Menu>
                    </>
                  ) : null}
                </>
              )}
            </>
          )}
        </Toolbar>
      </AppBar>

      <div className="appRoot">
        {pwaUpdate && route.name !== 'settings' ? (
          <div className="updateBanner">
            <span>更新があります。</span>
            <button onClick={applyPendingAppUpdate}>更新適用</button>
          </div>
        ) : null}

        {route.name === 'home' && (
          <HomePage
            todayDate={todayDate}
            tab={tab}
            items={tournaments}
            onTabChange={setTab}
            onOpenDetail={async (tournamentUuid) => {
              const loaded = await reloadDetail(tournamentUuid);
              if (!loaded) {
                return;
              }
              pushRoute({ name: 'detail', tournamentUuid });
            }}
          />
        )}

        {route.name === 'import' && (
          <ImportTournamentPage
            songMasterReady={songMasterReady}
            songMasterMessage={songMasterMeta.song_master_downloaded_at ? null : '曲マスタ未取得'}
            busy={busy}
            onImportPayload={importFromPayload}
            onImportFile={importFromFile}
          />
        )}

        {route.name === 'import-confirm' && (
          <ImportConfirmPage
            todayDate={todayDate}
            busy={busy}
            onBack={() => {
              popRoute();
              if (isImportConfirmPath(window.location.pathname)) {
                window.history.replaceState(window.history.state, '', HOME_PATH);
              }
            }}
            onOpenSettings={openSettingsPage}
            onConfirmImport={confirmImport}
          />
        )}

        {route.name === 'create' && createDraft && (
          <CreateTournamentPage
            draft={createDraft}
            todayDate={todayDate}
            saving={createSaving}
            errorMessage={createSaveError}
            onDraftChange={updateCreateDraft}
            onConfirmCreate={confirmCreateTournament}
          />
        )}

        {route.name === 'detail' && detail && (
          <TournamentDetailPage
            detail={detail}
            todayDate={todayDate}
            onOpenSubmit={(chartId) => {
              pushRoute({ name: 'submit', tournamentUuid: detail.tournamentUuid, chartId });
            }}
            onOpenSettings={openSettingsPage}
            debugModeEnabled={debugModeEnabled}
            debugLastError={detailTechnicalInfo?.last_error ?? null}
            onReportDebugError={setDetailDebugLastError}
          />
        )}

        {route.name === 'submit' && detail && submitChart && (
          <SubmitEvidencePage
            detail={detail}
            chart={submitChart}
            onSaved={async () => {
              await reloadDetail(detail.tournamentUuid);
              await refreshTournamentList();
            }}
          />
        )}

        {route.name === 'settings' && (
          <SettingsPage
            appInfo={appInfoSnapshot}
            songMasterMeta={songMasterMeta}
            autoDeleteEnabled={autoDeleteEnabled}
            autoDeleteDays={autoDeleteDays}
            debugModeEnabled={debugModeEnabled}
            busy={busy}
            onCheckUpdate={updateSongMaster}
            logs={runtimeLogs}
            lastCleanupResult={lastCleanupResult}
            onAutoDeleteConfigChange={saveAutoDelete}
            onEstimateStorageCleanup={estimateStorageCleanup}
            onRunStorageCleanup={runStorageCleanup}
            onToggleDebugMode={toggleDebugMode}
            onApplyAppUpdate={applyPendingAppUpdate}
            onResetLocalData={resetLocalData}
          />
        )}

        {isHomeRoute ? (
          <Tooltip
            title="大会を作成"
            placement="left"
            arrow
            open={showCreateFabTooltip && !speedDialOpen}
            disableFocusListener
            disableHoverListener
            disableTouchListener
          >
            <Box sx={{ position: 'fixed', right: 24, bottom: 24, zIndex: 30 }} onClick={closeCreateFabTooltip}>
              <SpeedDial
                ariaLabel="大会アクション"
                icon={<AddIcon />}
                direction="up"
                open={speedDialOpen}
                onOpen={() => {
                  closeCreateFabTooltip();
                  setSpeedDialOpen(true);
                }}
                onClose={() => setSpeedDialOpen(false)}
                sx={{ position: 'static' }}
              >
                <SpeedDialAction
                  icon={<PostAddIcon />}
                  tooltipTitle="大会作成"
                  FabProps={{ disabled: !songMasterReady || busy }}
                  onClick={() => {
                    closeCreateFabTooltip();
                    setSpeedDialOpen(false);
                    openCreatePage();
                  }}
                />
                <SpeedDialAction
                  icon={<FileDownloadIcon />}
                  tooltipTitle="大会取込"
                  FabProps={{ disabled: !songMasterReady || busy }}
                  onClick={() => {
                    closeCreateFabTooltip();
                    setSpeedDialOpen(false);
                    openImportPage();
                  }}
                />
              </SpeedDial>
            </Box>
          </Tooltip>
        ) : null}

        <ImportQrScannerDialog
          open={qrImportDialogOpen}
          onClose={closeQrImportDialog}
          onDetected={handleDetectedImportQr}
          onOpenTextImport={openTextImportFromQrError}
        />

        <Dialog
          open={Boolean(debugModeEnabled && detailTechnicalDialogOpen && detailTechnicalInfo)}
          onClose={closeDetailTechnicalDialog}
          fullWidth
          maxWidth="sm"
        >
          <DialogTitle>技術情報</DialogTitle>
          <DialogContent sx={{ display: 'grid', gap: 1.25 }}>
            {detailTechnicalInfo ? (
              <>
                <Typography variant="body2">tournament_uuid: {detailTechnicalInfo.tournament_uuid}</Typography>
                <Typography variant="body2">
                  source_tournament_uuid: {detailTechnicalInfo.source_tournament_uuid ?? '-'}
                </Typography>
                <Typography variant="body2">def_hash: {detailTechnicalInfo.def_hash}</Typography>
                <Typography variant="body2">共有ペイロードサイズ: {detailTechnicalInfo.payload_size_bytes} bytes</Typography>
                <Typography variant="body2">直近エラー: {detailTechnicalInfo.last_error ?? '-'}</Typography>
                <Button variant="outlined" size="small" onClick={() => void copyDetailTechnicalLog()}>
                  ログコピー
                </Button>
              </>
            ) : null}
          </DialogContent>
          <DialogActions>
            <Button onClick={closeDetailTechnicalDialog}>閉じる</Button>
          </DialogActions>
        </Dialog>

        <Dialog open={deleteTournamentDialogOpen} onClose={closeDeleteTournamentDialog} fullWidth maxWidth="xs">
          <DialogTitle>大会を削除しますか？</DialogTitle>
          <DialogContent>
            <Typography variant="body2">大会データと画像は削除され、復元できません</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={closeDeleteTournamentDialog} disabled={deleteTournamentBusy}>
              キャンセル
            </Button>
            <Button
              color="error"
              variant="contained"
              onClick={() => void deleteCurrentTournament()}
              disabled={deleteTournamentBusy}
            >
              削除
            </Button>
          </DialogActions>
        </Dialog>

        {toast ? <div className="toast">{toast}</div> : null}
      </div>
    </>
  );
}

export function AppFallbackUnsupported({ reasons }: { reasons: string[] }): JSX.Element {
  return <UnsupportedScreen title="非対応ブラウザ" reasons={reasons} />;
}
