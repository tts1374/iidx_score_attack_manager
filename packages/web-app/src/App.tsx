import React from 'react';
import type { TournamentDetailItem, TournamentTab } from '@iidx/db';
import { type TournamentPayload } from '@iidx/shared';
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
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PostAddIcon from '@mui/icons-material/PostAdd';

import { UnsupportedScreen } from './components/UnsupportedScreen';
import { CreateTournamentPage } from './pages/CreateTournamentPage';
import { HomePage } from './pages/HomePage';
import { ImportConfirmPage } from './pages/ImportConfirmPage';
import { ImportTournamentPage } from './pages/ImportTournamentPage';
import { SettingsPage, type AppInfoCardData, type AppSwStatus } from './pages/SettingsPage';
import { SubmitEvidencePage } from './pages/SubmitEvidencePage';
import { TournamentDetailPage } from './pages/TournamentDetailPage';
import { useAppServices } from './services/context';
import { extractQrTextFromImage } from './utils/image';
import { buildImportConfirmPath, HOME_PATH, IMPORT_CONFIRM_PATH, resolveRawImportPayloadParam } from './utils/payload-url';

function todayJst(): string {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
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

interface AppProps {
  webLockAcquired?: boolean;
}

interface AppInfoDetailState {
  swVersion: string;
  appDbUserVersion: number | null;
  appDbSizeBytes: number | null;
  webLocksStatus: AppInfoCardData['webLocksStatus'];
  opfsStatus: AppInfoCardData['opfsStatus'];
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
    appDbUserVersion: null,
    appDbSizeBytes: null,
    webLocksStatus: resolveWebLocksStatus(webLockAcquired),
    opfsStatus: 'unsupported',
  }));
  const [fatalError, setFatalError] = React.useState<string | null>(null);
  const [homeMenuAnchorEl, setHomeMenuAnchorEl] = React.useState<HTMLElement | null>(null);
  const [detailMenuAnchorEl, setDetailMenuAnchorEl] = React.useState<HTMLElement | null>(null);
  const [deleteTournamentDialogOpen, setDeleteTournamentDialogOpen] = React.useState(false);
  const [deleteTournamentBusy, setDeleteTournamentBusy] = React.useState(false);
  const [speedDialOpen, setSpeedDialOpen] = React.useState(false);

  const route = routeStack[routeStack.length - 1] ?? { name: 'home' };
  const isHomeRoute = route.name === 'home';
  const isDetailRoute = route.name === 'detail';
  const isSettingsRoute = route.name === 'settings';
  const todayDate = todayJst();
  const swStatus = resolveServiceWorkerStatus(pwaUpdate, hasSwController);
  const appInfoSnapshot = React.useMemo<AppInfoCardData>(
    () => ({
      appVersion: APP_VERSION,
      buildTime: BUILD_TIME,
      swStatus,
      swVersion: appInfoDetails.swVersion,
      appDbUserVersion: appInfoDetails.appDbUserVersion,
      appDbSizeBytes: appInfoDetails.appDbSizeBytes,
      webLocksStatus: appInfoDetails.webLocksStatus,
      opfsStatus: appInfoDetails.opfsStatus,
    }),
    [appInfoDetails, swStatus],
  );

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
    const [appDbUserVersion, appDbSizeBytes, opfsStatus, swVersion] = await Promise.all([
      appDb.getAppDbUserVersion().catch(() => null),
      appDb.getAppDbFileSize().catch(() => null),
      resolveOpfsStatus(),
      hasSwController ? requestServiceWorkerVersion().catch(() => null) : Promise.resolve<string | null>(null),
    ]);

    return {
      swVersion: swVersion ?? '-',
      appDbUserVersion,
      appDbSizeBytes,
      webLocksStatus: resolveWebLocksStatus(webLockAcquired),
      opfsStatus,
    };
  }, [appDb, hasSwController, webLockAcquired]);

  const updateSongMaster = React.useCallback(
    async (force: boolean) => {
      setBusy(true);
      try {
        const result = await songMasterService.updateIfNeeded(force);
        const snapshot = await refreshSettingsSnapshot();
        if (!result.ok) {
          const message = result.message ?? '曲マスタ更新に失敗しました。';
          if (result.source !== 'local_cache') {
            setFatalError(message);
          }
          pushToast(message);
          return;
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
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!(await appDb.hasSongMaster())) {
          setFatalError(message);
        }
        pushToast(message);
      } finally {
        setBusy(false);
      }
    },
    [appDb, pushToast, refreshSettingsSnapshot, songMasterService],
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
    let mounted = true;

    const bootstrap = async () => {
      try {
        await appDb.reconcileEvidenceFiles();
        await appDb.purgeExpiredEvidenceIfNeeded();
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
          pushToast(error instanceof Error ? error.message : String(error));
        }
      }
    };

    void bootstrap();

    return () => {
      mounted = false;
    };
  }, [appDb, pushToast, refreshSettingsSnapshot]);

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
    if (route.name === 'home' && isImportConfirmPath(window.location.pathname)) {
      window.history.replaceState(window.history.state, '', HOME_PATH);
    }
  }, [route.name]);

  const reloadDetail = React.useCallback(
    async (tournamentUuid: string) => {
      const next = await appDb.getTournamentDetail(tournamentUuid);
      setDetail(next);
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

  const saveAutoDelete = React.useCallback(
    async (enabled: boolean, days: number) => {
      await appDb.setAutoDeleteConfig(enabled, days);
      await refreshSettingsSnapshot();
      pushToast('自動削除設定を保存しました。');
    },
    [appDb, pushToast, refreshSettingsSnapshot],
  );

  const runAutoDelete = React.useCallback(async () => {
    const deleted = await appDb.purgeExpiredEvidenceIfNeeded();
    await refreshTournamentList();
    pushToast(`${deleted}件の画像を削除しました。`);
  }, [appDb, pushToast, refreshTournamentList]);

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
    pushRoute({ name: 'create' });
  }, [pushRoute, pushToast, songMasterReady]);

  const openImportPage = React.useCallback(() => {
    if (!songMasterReady) {
      pushToast('曲マスタが未取得のため大会取込は利用できません。');
      return;
    }
    pushRoute({ name: 'import' });
  }, [pushRoute, pushToast, songMasterReady]);

  const openSettingsPage = React.useCallback(() => {
    if (route.name === 'settings') {
      return;
    }
    pushRoute({ name: 'settings' });
  }, [pushRoute, route.name]);

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
    closeHomeMenu();
    if (!window.confirm('ローカル初期化を実行します。大会/提出画像/設定を削除します。続行しますか？')) {
      return;
    }

    setBusy(true);
    try {
      await appDb.resetLocalData();
      setDetail(null);
      setTab('active');
      setTournaments(await appDb.listTournaments('active'));
      await refreshSettingsSnapshot();
      pushToast('ローカル初期化を実行しました。');
    } catch (error) {
      pushToast(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [appDb, closeHomeMenu, pushToast, refreshSettingsSnapshot]);

  const homeMenuOpen = homeMenuAnchorEl !== null;
  const detailMenuOpen = detailMenuAnchorEl !== null;
  const canGoBack = route.name !== 'home' && routeStack.length > 1;

  React.useEffect(() => {
    if (route.name === 'detail') {
      return;
    }
    setDetailMenuAnchorEl(null);
    setDeleteTournamentDialogOpen(false);
  }, [route.name]);

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
                  disabled={busy}
                  onClick={() => {
                    closeHomeMenu();
                    void updateSongMaster(true);
                  }}
                >
                  曲データ更新
                </MenuItem>
                <MenuItem disabled={busy} onClick={() => void resetLocalData()}>
                  ローカル初期化
                </MenuItem>
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
        {pwaUpdate ? (
          <div className="updateBanner">
            <span>更新があります。</span>
            <button
              onClick={() => {
                applyPwaUpdate(pwaUpdate);
              }}
            >
              更新適用
            </button>
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
            onImportQrScan={importFromQrScan}
            onRefreshSongMaster={() => updateSongMaster(false)}
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
            onRefreshSongMaster={() => updateSongMaster(true)}
            onConfirmImport={confirmImport}
          />
        )}

        {route.name === 'create' && (
          <CreateTournamentPage
            todayDate={todayDate}
            onSaved={async () => {
              pushToast('保存しました。');
              await refreshTournamentList();
              resetRoute({ name: 'home' });
            }}
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
          />
        )}

        {route.name === 'submit' && detail && submitChart && (
          <SubmitEvidencePage
            detail={detail}
            chart={submitChart}
            todayDate={todayDate}
            onBack={popRoute}
            onSaved={async () => {
              pushToast('スコア画像を登録しました。');
              await reloadDetail(detail.tournamentUuid);
              await refreshTournamentList();
              popRoute();
            }}
          />
        )}

        {route.name === 'settings' && (
          <SettingsPage
            appInfo={appInfoSnapshot}
            songMasterMeta={songMasterMeta}
            autoDeleteEnabled={autoDeleteEnabled}
            autoDeleteDays={autoDeleteDays}
            busy={busy}
            onCheckUpdate={updateSongMaster}
            onSaveAutoDelete={saveAutoDelete}
            onRunAutoDelete={runAutoDelete}
          />
        )}

        {isHomeRoute ? (
          <SpeedDial
            ariaLabel="大会アクション"
            icon={<AddIcon />}
            direction="up"
            open={speedDialOpen}
            onOpen={() => setSpeedDialOpen(true)}
            onClose={() => setSpeedDialOpen(false)}
            sx={{ position: 'fixed', right: 24, bottom: 24, zIndex: 30 }}
          >
            <SpeedDialAction
              icon={<PostAddIcon />}
              tooltipTitle="大会作成"
              FabProps={{ disabled: !songMasterReady || busy }}
              onClick={() => {
                setSpeedDialOpen(false);
                openCreatePage();
              }}
            />
            <SpeedDialAction
              icon={<FileDownloadIcon />}
              tooltipTitle="大会取込"
              FabProps={{ disabled: !songMasterReady || busy }}
              onClick={() => {
                setSpeedDialOpen(false);
                openImportPage();
              }}
            />
          </SpeedDial>
        ) : null}

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
