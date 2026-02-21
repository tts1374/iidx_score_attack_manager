import React from 'react';
import { getTournamentStatus, type TournamentPayload } from '@iidx/shared';
import type { ImportTargetTournament, SongMasterChartDetail } from '@iidx/db';

import { useAppServices } from '../services/context';
import { IMPORT_CONFIRM_PATH } from '../utils/payload-url';
import {
  resolveImportPayloadFromLocation,
  type ImportConfirmError,
  type ImportLocationPayloadResult,
} from '../utils/import-confirm';
import { difficultyColor } from '../utils/iidx';

interface ImportConfirmPageProps {
  todayDate: string;
  busy: boolean;
  onBack: () => void;
  onOpenSettings: () => void;
  onConfirmImport: (payload: TournamentPayload) => Promise<void>;
}

interface PreviewChart {
  chartId: number;
  title: string;
  playStyle: string;
  difficulty: string;
  level: string;
  missing: boolean;
}

interface ImportPreview {
  payload: TournamentPayload;
  statusLabel: '未開催' | '開催中' | '終了';
  statusClassName: 'statusBadge-upcoming' | 'statusBadge-active-normal' | 'statusBadge-ended';
  charts: PreviewChart[];
  existing: ImportTargetTournament | null;
  addedCharts: number;
  sameCharts: number;
}

type ImportConfirmState =
  | { status: 'loading' }
  | { status: 'ready'; preview: ImportPreview }
  | { status: 'error'; error: ImportConfirmError; preview?: ImportPreview };

function resolveStatus(start: string, end: string, todayDate: string): {
  isEnded: boolean;
  label: ImportPreview['statusLabel'];
  className: ImportPreview['statusClassName'];
} {
  const status = getTournamentStatus(start, end, todayDate);
  if (status === 'upcoming') {
    return {
      isEnded: false,
      label: '未開催',
      className: 'statusBadge-upcoming',
    };
  }
  if (status === 'ended') {
    return {
      isEnded: true,
      label: '終了',
      className: 'statusBadge-ended',
    };
  }
  return {
    isEnded: false,
    label: '開催中',
    className: 'statusBadge-active-normal',
  };
}

function buildPreviewCharts(chartIds: number[], detailMap: Map<number, SongMasterChartDetail>): PreviewChart[] {
  return chartIds.map((chartId) => {
    const found = detailMap.get(chartId);
    if (!found) {
      return {
        chartId,
        title: `chart:${chartId}`,
        playStyle: '-',
        difficulty: '-',
        level: '-',
        missing: true,
      };
    }
    return {
      chartId,
      title: found.title,
      playStyle: found.playStyle,
      difficulty: found.difficulty,
      level: found.level,
      missing: false,
    };
  });
}

function summarizeMerge(existing: ImportTargetTournament | null, chartIds: number[]): { addedCharts: number; sameCharts: number } {
  if (!existing) {
    return {
      addedCharts: chartIds.length,
      sameCharts: 0,
    };
  }
  const existingSet = new Set(existing.chartIds);
  let sameCharts = 0;
  let addedCharts = 0;
  for (const chartId of chartIds) {
    if (existingSet.has(chartId)) {
      sameCharts += 1;
    } else {
      addedCharts += 1;
    }
  }
  return { addedCharts, sameCharts };
}

export function ImportConfirmPage(props: ImportConfirmPageProps): JSX.Element {
  const { appDb } = useAppServices();
  const [validationState, setValidationState] = React.useState<ImportConfirmState>({ status: 'loading' });
  const [applying, setApplying] = React.useState(false);

  const [locationPayload] = React.useState<ImportLocationPayloadResult>(() =>
    resolveImportPayloadFromLocation({
      pathname: window.location.pathname,
      search: window.location.search,
    }),
  );

  React.useEffect(() => {
    window.history.replaceState(window.history.state, '', IMPORT_CONFIRM_PATH);
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    const fail = (error: ImportConfirmError, preview?: ImportPreview): void => {
      if (cancelled) {
        return;
      }
      if (preview) {
        setValidationState({ status: 'error', error, preview });
        return;
      }
      setValidationState({
        status: 'error',
        error,
      });
    };

    const validate = async () => {
      if (locationPayload.status === 'none') {
        fail({
          code: 'INVALID_PARAM',
          message: 'URLインポートリンクを認識できませんでした。',
        });
        return;
      }
      if (locationPayload.status === 'invalid') {
        fail(locationPayload.error);
        return;
      }
      const payload: TournamentPayload = locationPayload.payload;

      const statusInfo = resolveStatus(payload.start, payload.end, props.todayDate);
      const emptyPreview: ImportPreview = {
        payload,
        statusLabel: statusInfo.label,
        statusClassName: statusInfo.className,
        charts: buildPreviewCharts(payload.charts, new Map()),
        existing: null,
        addedCharts: payload.charts.length,
        sameCharts: 0,
      };

      if (statusInfo.isEnded) {
        fail(
          {
            code: 'EXPIRED',
            message: '終了済みの大会は取り込みできません。',
          },
          emptyPreview,
        );
        return;
      }

      const hasSongMaster = await appDb.hasSongMaster();
      if (!hasSongMaster) {
        fail(
          {
            code: 'MASTER_MISSING',
            message: '曲マスタが未取得のため検証できません。',
          },
          emptyPreview,
        );
        return;
      }

      const chartDetails = await appDb.listSongMasterChartsByIds(payload.charts);
      const chartDetailMap = new Map<number, SongMasterChartDetail>(
        chartDetails.map((detail) => [detail.chartId, detail]),
      );
      const previewWithMaster: ImportPreview = {
        ...emptyPreview,
        charts: buildPreviewCharts(payload.charts, chartDetailMap),
      };
      const missingChartIds = payload.charts.filter((chartId) => !chartDetailMap.has(chartId));
      if (missingChartIds.length > 0) {
        fail(
          {
            code: 'CHART_NOT_FOUND',
            message: `曲マスタに存在しない譜面があります: ${missingChartIds.join(', ')}`,
          },
          previewWithMaster,
        );
        return;
      }

      const existing = await appDb.findImportTargetTournament(payload.uuid);
      const mergedSummary = summarizeMerge(existing, payload.charts);
      const completedPreview: ImportPreview = {
        ...previewWithMaster,
        existing,
        addedCharts: mergedSummary.addedCharts,
        sameCharts: mergedSummary.sameCharts,
      };

      if (existing && (existing.startDate !== payload.start || existing.endDate !== payload.end)) {
        fail(
          {
            code: 'SCHEMA_ERROR',
            message: 'UUID一致の既存大会と開催期間が矛盾するため取り込みできません。',
          },
          completedPreview,
        );
        return;
      }

      if (cancelled) {
        return;
      }
      setValidationState({
        status: 'ready',
        preview: completedPreview,
      });
    };

    setValidationState({ status: 'loading' });
    void validate().catch((error) => {
      fail({
        code: 'SCHEMA_ERROR',
        message: error instanceof Error ? error.message : String(error),
      });
    });

    return () => {
      cancelled = true;
    };
  }, [appDb, locationPayload, props.todayDate]);

  const showOpenSettingsAction =
    validationState.status === 'error' &&
    (validationState.error.code === 'MASTER_MISSING' || validationState.error.code === 'CHART_NOT_FOUND');

  const importEnabled = validationState.status === 'ready' && !props.busy && !applying;

  const confirmImport = React.useCallback(async () => {
    if (validationState.status !== 'ready' || applying || props.busy) {
      return;
    }
    setApplying(true);
    try {
      await props.onConfirmImport(validationState.preview.payload);
    } finally {
      setApplying(false);
    }
  }, [applying, props, validationState]);

  const preview =
    validationState.status === 'ready'
      ? validationState.preview
      : validationState.status === 'error'
        ? validationState.preview
        : undefined;

  return (
    <div className="page importConfirmPage">
      {validationState.status === 'loading' ? (
        <section className="detailCard">
          <h2>取り込みデータを検証しています...</h2>
        </section>
      ) : null}

      {validationState.status === 'error' ? (
        <section className="warningBox importConfirmErrorCard">
          <p className="importConfirmErrorCode">{validationState.error.code}</p>
          <p>{validationState.error.message}</p>
          {showOpenSettingsAction ? (
            <button onClick={props.onOpenSettings} disabled={props.busy}>
              設定を開く
            </button>
          ) : null}
        </section>
      ) : null}

      {preview ? (
        <>
          <section className="detailCard importConfirmSummaryCard">
            <div className="tournamentCardHeader">
              <h2>{preview.payload.name}</h2>
              <span className={`statusBadge ${preview.statusClassName}`}>{preview.statusLabel}</span>
            </div>
            <div className="tournamentMeta">
              <p>{preview.payload.owner}</p>
              <p>
                {preview.payload.start} 〜 {preview.payload.end}
              </p>
              <p>#{preview.payload.hashtag}</p>
            </div>
          </section>

          <section className="detailCard importConfirmChartsCard">
            <h3>対象譜面</h3>
            <ul className="chartList">
              {preview.charts.slice(0, 4).map((chart) => (
                <li key={chart.chartId}>
                  <div className="importConfirmChartItem">
                    <div className="chartText">
                      <strong className={chart.missing ? 'errorText importChartTitle' : 'importChartTitle'}>
                        {chart.title}
                      </strong>
                      <span
                        className={chart.missing ? 'errorText' : ''}
                        style={chart.missing ? undefined : { color: difficultyColor(chart.difficulty) }}
                      >
                        {chart.playStyle} {chart.difficulty} Lv{chart.level}
                      </span>
                      {chart.missing ? <span className="errorText">曲マスタ不一致 (chart:{chart.chartId})</span> : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {preview.existing ? (
            <section className="detailCard importConfirmMergeCard">
              <h3>既存大会が見つかりました（UUID一致）</h3>
              <p>適用方式: マージ（譜面のみ）</p>
              <p>追加される譜面数: {preview.addedCharts}</p>
              <p>既存と同一の譜面数: {preview.sameCharts}</p>
              <p className="hintText">大会名/開催者/期間/ハッシュタグは更新されません。</p>
            </section>
          ) : null}

          <section className="detailCard">
            <h3>注意</h3>
            <p className="hintText">取り込みデータは自己責任で利用してください。</p>
            <p className="hintText">UUID衝突時は大会情報を更新せず、譜面差分のみを適用します。</p>
          </section>
        </>
      ) : null}

      <div className="importConfirmFooter">
        <button onClick={props.onBack} disabled={props.busy || applying}>
          キャンセル
        </button>
        <button
          className="primaryActionButton"
          disabled={!importEnabled}
          onClick={() => {
            void confirmImport();
          }}
        >
          {applying ? '取り込み中...' : '取り込む'}
        </button>
      </div>
    </div>
  );
}
