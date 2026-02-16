import React from 'react';
import { applyPwaUpdate, registerPwa } from '@iidx/pwa';
import type { TournamentDetailItem, TournamentTab } from '@iidx/db';
import { decodeTournamentPayload } from '@iidx/shared';

import { UnsupportedScreen } from './components/UnsupportedScreen';
import { HomePage } from './pages/HomePage';
import { CreateTournamentPage } from './pages/CreateTournamentPage';
import { SettingsPage } from './pages/SettingsPage';
import { SubmitEvidencePage } from './pages/SubmitEvidencePage';
import { TournamentDetailPage } from './pages/TournamentDetailPage';
import { useAppServices } from './services/context';
import { extractQrTextFromImage } from './utils/image';
import { extractPayloadFromFreeText } from './utils/payload-url';

function todayJst(): string {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

type RouteState =
  | { name: 'home' }
  | { name: 'create' }
  | { name: 'detail'; tournamentUuid: string }
  | { name: 'submit'; tournamentUuid: string; chartId: number }
  | { name: 'settings' };

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

  const [route, setRoute] = React.useState<RouteState>({ name: 'home' });
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

  const todayDate = todayJst();

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
    setSongMasterMeta(await appDb.getSongMasterMeta());
    const config = await appDb.getAutoDeleteConfig();
    setAutoDeleteEnabled(config.enabled);
    setAutoDeleteDays(config.days || 30);
    setSongMasterReady(await appDb.hasSongMaster());
  }, [appDb]);

  const updateSongMaster = React.useCallback(
    async (force: boolean) => {
      setBusy(true);
      try {
        const result = await songMasterService.updateIfNeeded(force);
        if (!result.ok) {
          const message = result.message ?? '曲マスタ更新に失敗しました。';
          if (result.source !== 'local_cache') {
            setFatalError(message);
          }
          pushToast(message);
        } else {
          if (result.source === 'github_download' || result.source === 'initial_download') {
            pushToast('曲マスタを更新しました。');
          }
          if (result.source === 'local_cache') {
            pushToast(result.message ?? 'ローカルキャッシュを利用します。');
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!(await appDb.hasSongMaster())) {
          setFatalError(message);
        }
        pushToast(message);
      } finally {
        await refreshSettingsSnapshot();
        setBusy(false);
      }
    },
    [pushToast, refreshSettingsSnapshot, songMasterService],
  );

  React.useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      try {
        await updateSongMaster(false);
        await appDb.reconcileEvidenceFiles();
        await appDb.purgeExpiredEvidenceIfNeeded();
        await refreshSettingsSnapshot();
        setTournaments(await appDb.listTournaments('active'));

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
  }, [appDb, pushToast, refreshSettingsSnapshot, updateSongMaster]);

  React.useEffect(() => {
    void refreshTournamentList();
  }, [refreshTournamentList]);

  const reloadDetail = React.useCallback(
    async (tournamentUuid: string) => {
      const next = await appDb.getTournamentDetail(tournamentUuid);
      setDetail(next);
      if (!next) {
        setRoute({ name: 'home' });
      }
      return next;
    },
    [appDb],
  );

  const importFromPayload = React.useCallback(
    async (raw: string) => {
      if (!songMasterReady) {
        pushToast('曲マスタ取得完了まで大会取込は利用できません。');
        return;
      }

      const extracted = extractPayloadFromFreeText(raw);
      if (!extracted) {
        pushToast('取込データが空です。');
        return;
      }

      try {
        const decoded = decodeTournamentPayload(extracted, { nowDate: todayDate });
        const result = await appDb.importTournament(decoded.payload);
        if (result.status === 'already_imported') {
          pushToast('取り込み済みです。');
        } else if (result.status === 'conflict') {
          pushToast('同一IDの別大会が存在するため取り込めません。');
        } else {
          pushToast('大会を取り込みました。');
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

  if (fatalError) {
    return <UnsupportedScreen title="曲マスタ取得エラー" reasons={[fatalError]} />;
  }

  return (
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
          songMasterReady={songMasterReady}
          songMasterMessage={songMasterMeta.song_master_downloaded_at ? null : '曲マスタ未取得'}
          busy={busy}
          onTabChange={setTab}
          onOpenCreate={() => {
            if (!songMasterReady) {
              pushToast('曲マスタ取得完了まで大会作成は利用できません。');
              return;
            }
            setRoute({ name: 'create' });
          }}
          onOpenSettings={() => setRoute({ name: 'settings' })}
          onOpenDetail={async (tournamentUuid) => {
            const loaded = await reloadDetail(tournamentUuid);
            if (!loaded) {
              return;
            }
            setRoute({ name: 'detail', tournamentUuid });
          }}
          onImportPayload={importFromPayload}
          onImportFile={importFromFile}
          onRefreshSongMaster={() => updateSongMaster(false)}
        />
      )}

      {route.name === 'create' && (
        <CreateTournamentPage
          todayDate={todayDate}
          onCancel={() => setRoute({ name: 'home' })}
          onSaved={async (tournamentUuid) => {
            pushToast('大会を作成しました。');
            await refreshTournamentList();
            await reloadDetail(tournamentUuid);
            setRoute({ name: 'detail', tournamentUuid });
          }}
        />
      )}

      {route.name === 'detail' && detail && (
        <TournamentDetailPage
          detail={detail}
          onBack={() => {
            setRoute({ name: 'home' });
            void refreshTournamentList();
          }}
          onOpenSubmit={(chartId) => {
            setRoute({ name: 'submit', tournamentUuid: detail.tournamentUuid, chartId });
          }}
          onDelete={async () => {
            await appDb.deleteTournament(detail.tournamentUuid);
            pushToast('大会を削除しました。');
            setRoute({ name: 'home' });
            await refreshTournamentList();
          }}
        />
      )}

      {route.name === 'submit' && detail && submitChart && (
        <SubmitEvidencePage
          detail={detail}
          chart={submitChart}
          todayDate={todayDate}
          onBack={() => setRoute({ name: 'detail', tournamentUuid: detail.tournamentUuid })}
          onSaved={async () => {
            pushToast('スコア画像を保存しました。');
            await reloadDetail(detail.tournamentUuid);
            await refreshTournamentList();
            setRoute({ name: 'detail', tournamentUuid: detail.tournamentUuid });
          }}
        />
      )}

      {route.name === 'settings' && (
        <SettingsPage
          songMasterMeta={songMasterMeta}
          autoDeleteEnabled={autoDeleteEnabled}
          autoDeleteDays={autoDeleteDays}
          busy={busy}
          onBack={() => setRoute({ name: 'home' })}
          onCheckUpdate={updateSongMaster}
          onSaveAutoDelete={saveAutoDelete}
          onRunAutoDelete={runAutoDelete}
        />
      )}

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}

export function AppFallbackUnsupported({ reasons }: { reasons: string[] }): JSX.Element {
  return <UnsupportedScreen title="非対応ブラウザ" reasons={reasons} />;
}
