import React from 'react';
import type { TournamentPayload } from '@iidx/shared';
import type { ImportTargetTournament, SongMasterChartDetail } from '@iidx/db';
import { useTranslation } from 'react-i18next';

import { ChartCard } from '../components/ChartCard';
import { TournamentSummaryCard } from '../components/TournamentSummaryCard';
import { useAppServices } from '../services/context';
import { IMPORT_CONFIRM_PATH } from '../utils/payload-url';
import {
  resolveImportPayloadFromLocation,
  type ImportConfirmError,
  type ImportLocationPayloadResult,
} from '../utils/import-confirm';
import { resolveTournamentCardStatus } from '../utils/tournament-status';

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
  charts: PreviewChart[];
  existing: ImportTargetTournament | null;
}

type ImportConfirmState =
  | { status: 'loading' }
  | { status: 'ready'; preview: ImportPreview }
  | { status: 'error'; error: ImportConfirmError; preview?: ImportPreview };

function buildPreviewCharts(
  chartIds: number[],
  detailMap: Map<number, SongMasterChartDetail>,
  options: {
    fallbackTitle: () => string;
    notAvailableLabel: string;
  },
): PreviewChart[] {
  return chartIds.map((chartId) => {
    const found = detailMap.get(chartId);
    if (!found) {
      return {
        chartId,
        title: options.fallbackTitle(),
        playStyle: options.notAvailableLabel,
        difficulty: options.notAvailableLabel,
        level: options.notAvailableLabel,
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

export function ImportConfirmPage(props: ImportConfirmPageProps): JSX.Element {
  const { appDb } = useAppServices();
  const { t } = useTranslation();
  const [validationState, setValidationState] = React.useState<ImportConfirmState>({ status: 'loading' });
  const [applying, setApplying] = React.useState(false);
  const [diagnosticMessage, setDiagnosticMessage] = React.useState<string | null>(null);

  const [locationPayload] = React.useState<ImportLocationPayloadResult>(() =>
    resolveImportPayloadFromLocation({
      pathname: window.location.pathname,
      search: window.location.search,
    }),
  );

  React.useEffect(() => {
    window.history.replaceState(window.history.state, '', IMPORT_CONFIRM_PATH);
  }, []);

  const resolveLocationImportErrorMessage = React.useCallback(
    (error: ImportConfirmError): string => {
      if (error.code === 'INVALID_PARAM') {
        return t('import.error.invalid_param');
      }
      if (error.code === 'DECODE_ERROR') {
        return t('import.error.decode_error');
      }
      if (error.code === 'DECOMPRESS_ERROR') {
        return t('import.error.decompress_error');
      }
      if (error.code === 'JSON_ERROR') {
        return t('import.error.json_error');
      }
      if (error.code === 'SCHEMA_ERROR') {
        return t('import.error.schema_error');
      }
      if (error.code === 'TOO_LARGE') {
        return t('import.error.too_large');
      }
      if (error.code === 'UNSUPPORTED_VERSION') {
        return t('import.error.unsupported_version');
      }
      return error.message ?? t('error.description.generic');
    },
    [t],
  );

  React.useEffect(() => {
    if (props.busy) {
      setValidationState({ status: 'loading' });
      return;
    }
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
          message: t('import.error.none'),
        });
        return;
      }
      if (locationPayload.status === 'invalid') {
        fail({
          code: locationPayload.error.code,
          message: resolveLocationImportErrorMessage(locationPayload.error),
        });
        return;
      }
      const payload: TournamentPayload = locationPayload.payload;

      const statusInfo = resolveTournamentCardStatus(payload.start, payload.end, props.todayDate);
      const notAvailableLabel = t('common.not_available');
      const emptyPreview: ImportPreview = {
        payload,
        charts: buildPreviewCharts(payload.charts, new Map(), {
          fallbackTitle: () => t('import.confirm.chart_unknown'),
          notAvailableLabel,
        }),
        existing: null,
      };

      if (statusInfo.status === 'ended') {
        fail(
          {
            code: 'EXPIRED',
            message: t('import.error.expired'),
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
            message: t('import.error.master_missing'),
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
        charts: buildPreviewCharts(payload.charts, chartDetailMap, {
          fallbackTitle: () => t('import.confirm.chart_unknown'),
          notAvailableLabel,
        }),
      };
      const missingChartIds = payload.charts.filter((chartId) => !chartDetailMap.has(chartId));
      if (missingChartIds.length > 0) {
        fail(
          {
            code: 'CHART_NOT_FOUND',
            message: t('import.error.chart_not_found'),
          },
          previewWithMaster,
        );
        return;
      }

      const existing = await appDb.findImportTargetTournament(payload.uuid);
      const completedPreview: ImportPreview = {
        ...previewWithMaster,
        existing,
      };

      if (existing && (existing.startDate !== payload.start || existing.endDate !== payload.end)) {
        fail(
          {
            code: 'SCHEMA_ERROR',
            message: t('import.error.period_conflict'),
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
    setDiagnosticMessage(null);
    void validate().catch((error) => {
      if (cancelled) {
        return;
      }
      setDiagnosticMessage(error instanceof Error ? error.message : String(error));
      fail({
        code: 'SCHEMA_ERROR',
        message: t('import.error.unexpected'),
      });
    });

    return () => {
      cancelled = true;
    };
  }, [appDb, locationPayload, props.busy, props.todayDate, resolveLocationImportErrorMessage, t]);

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
  const existingChartIds = new Set(preview?.existing?.chartIds ?? []);
  const addedChartCount = preview?.payload.charts.filter((chartId) => !existingChartIds.has(chartId)).length ?? 0;
  const importDiffSummaryText = preview?.existing
    ? addedChartCount > 0
      ? t('import.confirm.summary.update_existing', { count: addedChartCount })
      : t('import.confirm.summary.unchanged')
    : t('import.confirm.summary.create_new');

  return (
    <div className="page importConfirmPage">
      {validationState.status === 'loading' ? (
        <section className="detailCard" role="status">
          <h2>{t('import.state.loading')}</h2>
          <p className="hintText">{t('import.state.wait')}</p>
        </section>
      ) : null}

      {validationState.status === 'error' ? (
        <section className="warningBox importConfirmErrorCard">
          <div role="alert">
            <p>{validationState.error.message}</p>
            <p>{t(showOpenSettingsAction ? 'import.remedy.song_data' : 'import.remedy.open_link')}</p>
          </div>
          {showOpenSettingsAction ? (
            <button onClick={props.onOpenSettings} disabled={props.busy}>
              {t('import.action.open_settings')}
            </button>
          ) : null}
          <details>
            <summary>{t('import.confirm.technical_details')}</summary>
            <p className="importConfirmErrorCode">{validationState.error.code}</p>
            {diagnosticMessage ? <p>{diagnosticMessage}</p> : null}
            {preview?.charts.some((chart) => chart.missing) && validationState.error.code === 'CHART_NOT_FOUND' ? (
              <p>{preview.charts.filter((chart) => chart.missing).map((chart) => `chart:${chart.chartId}`).join(', ')}</p>
            ) : null}
          </details>
        </section>
      ) : null}

      {preview ? (
        <>
          <TournamentSummaryCard
            variant="preview"
            title={preview.payload.name}
            startDate={preview.payload.start}
            endDate={preview.payload.end}
            todayDate={props.todayDate}
            periodText={t('import.confirm.value.period', { from: preview.payload.start, to: preview.payload.end })}
            cardClassName="importConfirmSummaryCard"
          />
          {validationState.status === 'ready' ? (
            <section className="detailCard">
              <h3>{importDiffSummaryText}</h3>
              {preview.existing ? (
                <>
                  <p>{t('import.confirm.summary.target', { name: preview.existing.tournamentName })}</p>
                  <p>{t('import.confirm.merge.note')}</p>
                </>
              ) : null}
            </section>
          ) : null}

          <section className="detailCard importConfirmChartsCard">
            <h3>{t('import.confirm.section.charts_with_count', { count: preview.charts.length })}</h3>
            <ul className="chartList">
              {preview.charts.map((chart) => (
                <li key={chart.chartId}>
                  <ChartCard
                    title={chart.title}
                    playStyle={chart.playStyle}
                    difficulty={chart.difficulty}
                    level={chart.level}
                    titleClassName={chart.missing ? 'errorText importChartTitle' : 'importChartTitle'}
                    playStyleClassName={chart.missing ? 'errorText' : undefined}
                    difficultyLevelClassName={chart.missing ? 'errorText' : undefined}
                    note={chart.missing ? t('import.confirm.chart_missing') : null}
                    noteClassName="errorText"
                    variant="preview"
                  />
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}

      <div className="importConfirmFooter">
        <button onClick={props.onBack} disabled={props.busy || applying}>
          {t('common.cancel')}
        </button>
        <button
          className="primaryActionButton"
          disabled={!importEnabled}
          onClick={() => {
            void confirmImport();
          }}
        >
          {applying ? t('import.action.importing') : t('import.action.import')}
        </button>
      </div>
    </div>
  );
}
