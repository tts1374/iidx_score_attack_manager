import React from 'react';
import type { TournamentDetailItem, TournamentTab } from '@iidx/db';
import { decodeTournamentPayload, type TournamentPayload } from '@iidx/shared';
import { applyPwaUpdate, registerPwa } from '@iidx/pwa';
import { AppBar, Box, IconButton, Menu, MenuItem, SpeedDial, SpeedDialAction, Toolbar, Typography } from '@mui/material';
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
import { SettingsPage } from './pages/SettingsPage';
import { SubmitEvidencePage } from './pages/SubmitEvidencePage';
import { TournamentDetailPage } from './pages/TournamentDetailPage';
import { useAppServices } from './services/context';
import { extractQrTextFromImage } from './utils/image';
import { extractPayloadFromFreeText, IMPORT_CONFIRM_PATH } from './utils/payload-url';

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
  song_master_updated_at: null,
  song_master_downloaded_at: null,
};

export function App(): JSX.Element {
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
  const [fatalError, setFatalError] = React.useState<string | null>(null);
  const [homeMenuAnchorEl, setHomeMenuAnchorEl] = React.useState<HTMLElement | null>(null);
  const [speedDialOpen, setSpeedDialOpen] = React.useState(false);

  const route = routeStack[routeStack.length - 1] ?? { name: 'home' };
  const isHomeRoute = route.name === 'home';
  const isSettingsRoute = route.name === 'settings';
  const todayDate = todayJst();

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
    if (route.name === 'home' && isImportConfirmPath(window.location.pathname)) {
      window.history.replaceState(window.history.state, '', '/');
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

      const extracted = extractPayloadFromFreeText(raw);
      if (!extracted) {
        pushToast('取込データを認識できません。');
        return;
      }

      try {
        const decoded = decodeTournamentPayload(extracted, { nowDate: todayDate });
        const result = await appDb.importTournament(decoded.payload);
        if (result.status === 'unchanged') {
          pushToast('変更なし');
        } else if (result.status === 'incompatible') {
          pushToast('既存大会と開催期間が矛盾するため取り込みできません。');
        } else if (result.status === 'merged') {
          pushToast('取り込みました');
        } else {
          pushToast('取り込みました');
        }
        await refreshTournamentList();
      } catch (error) {
        pushToast(error instanceof Error ? error.message : String(error));
      }
    },
    [appDb, pushToast, refreshTournamentList, songMasterReady, todayDate],
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
  const canGoBack = route.name !== 'home' && routeStack.length > 1;

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
                  <Typography variant="h6" component="h1" sx={{ fontWeight: 700 }}>
                    {pageTitle}
                  </Typography>
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
                window.history.replaceState(window.history.state, '', '/');
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
            onBack={() => {
              popRoute();
              void refreshTournamentList();
            }}
            onOpenSubmit={(chartId) => {
              pushRoute({ name: 'submit', tournamentUuid: detail.tournamentUuid, chartId });
            }}
            onDelete={async () => {
              await appDb.deleteTournament(detail.tournamentUuid);
              pushToast('大会を削除しました。');
              resetRoute({ name: 'home' });
              await refreshTournamentList();
            }}
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

        {toast ? <div className="toast">{toast}</div> : null}
      </div>
    </>
  );
}

export function AppFallbackUnsupported({ reasons }: { reasons: string[] }): JSX.Element {
  return <UnsupportedScreen title="非対応ブラウザ" reasons={reasons} />;
}
