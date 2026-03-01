import React from 'react';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import type { ChartSummary, SongSummary } from '@iidx/db';
import { PAYLOAD_VERSION, buildTournamentDefHash, normalizeHashtag, normalizeSearchText } from '@iidx/shared';
import { Autocomplete, Box, CircularProgress, TextField, Typography } from '@mui/material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { enUS, jaJP, koKR } from '@mui/x-date-pickers/locales';
import { enUS as enDateLocale } from 'date-fns/locale/en-US';
import { ja as jaDateLocale } from 'date-fns/locale/ja';
import { ko as koDateLocale } from 'date-fns/locale/ko';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import { useAppServices } from '../services/context';
import { difficultyColor, versionLabel } from '../utils/iidx';
import {
  MAX_CHART_ROWS,
  type CreateTournamentFieldLabelKey,
  createEmptyChartDraft,
  formatIsoDate,
  normalizeHashtagForDisplay,
  parseIsoDate,
  resolveCreateTournamentValidation,
  resolveNextMonthDateRange,
  resolveRangeDayCount,
  resolveSelectedChartOption,
  type CreateTournamentChartDraft,
  type CreateTournamentDraft,
} from './create-tournament-draft';

interface CreateTournamentPageProps {
  draft: CreateTournamentDraft;
  todayDate: string;
  saving: boolean;
  errorMessage: string | null;
  debugModeEnabled: boolean;
  onDraftChange: (updater: (draft: CreateTournamentDraft) => CreateTournamentDraft) => void;
  onConfirmCreate: () => Promise<void>;
}

type CreateWizardStep = 0 | 1 | 2;
type AppLanguage = 'ja' | 'en' | 'ko';

const SONG_SEARCH_DEBUG_STORAGE_KEY = 'iidx:debug:song-search';
const CREATE_WIZARD_DEBUG_STORAGE_KEY = 'iidx:debug:create-wizard';
const SONG_AUTOCOMPLETE_SX = {
  width: '100%',
  maxWidth: '100%',
} as const;
const DATE_PICKER_LOCALE_TEXT_BY_LANGUAGE = {
  ja: jaJP.components.MuiLocalizationProvider.defaultProps.localeText as any,
  en: enUS.components.MuiLocalizationProvider.defaultProps.localeText as any,
  ko: koKR.components.MuiLocalizationProvider.defaultProps.localeText as any,
} as const;
const DATE_FNS_LOCALE_BY_LANGUAGE = {
  ja: jaDateLocale,
  en: enDateLocale,
  ko: koDateLocale,
} as const;

function isSongSearchDebugEnabled(): boolean {
  const g = globalThis as { __IIDX_DEBUG_SONG_SEARCH__?: unknown; localStorage?: Storage };
  if (g.__IIDX_DEBUG_SONG_SEARCH__ === true) {
    return true;
  }
  if (!g.localStorage) {
    return false;
  }
  try {
    return g.localStorage.getItem(SONG_SEARCH_DEBUG_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function isCreateWizardDebugEnabled(): boolean {
  if (import.meta.env.DEV) {
    return true;
  }
  const g = globalThis as { __IIDX_DEBUG_CREATE_WIZARD__?: unknown; localStorage?: Storage };
  if (g.__IIDX_DEBUG_CREATE_WIZARD__ === true) {
    return true;
  }
  if (!g.localStorage) {
    return false;
  }
  try {
    return g.localStorage.getItem(CREATE_WIZARD_DEBUG_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function debugSongSearch(message: string, payload?: unknown): void {
  if (!isSongSearchDebugEnabled()) {
    return;
  }
  if (payload === undefined) {
    console.info(`[song-search-ui] ${message}`);
    return;
  }
  console.info(`[song-search-ui] ${message}`, payload);
}

function isSelectableChart(chart: ChartSummary): boolean {
  if (chart.isActive !== 1) {
    return false;
  }
  const levelNumber = Number(chart.level);
  return !(Number.isFinite(levelNumber) && levelNumber === 0);
}

function difficultyButtonStyle(difficulty: string, active: boolean): React.CSSProperties {
  const color = difficultyColor(difficulty);
  if (active) {
    return {
      borderColor: color,
      backgroundColor: color,
      color: '#ffffff',
    };
  }
  return {
    borderColor: color,
    backgroundColor: '#ffffff',
    color,
  };
}

function resolveDifficultyShortLabel(difficulty: string, level: string): string {
  const normalizedDifficulty = String(difficulty ?? '').trim().toUpperCase();
  const abbreviation =
    normalizedDifficulty === 'BEGINNER'
      ? 'B'
      : normalizedDifficulty === 'NORMAL'
        ? 'N'
        : normalizedDifficulty === 'HYPER'
          ? 'H'
          : normalizedDifficulty === 'ANOTHER'
            ? 'A'
            : normalizedDifficulty === 'LEGGENDARIA'
              ? 'L'
              : normalizedDifficulty.slice(0, 1) || '?';
  const normalizedLevel = String(level ?? '').trim() || '?';
  return `${abbreviation} ${normalizedLevel}`;
}

function shortenTournamentId(value: string, visibleLength = 30): string {
  const normalized = value.trim();
  if (normalized.length <= visibleLength) {
    return normalized;
  }
  return `${normalized.slice(0, visibleLength)}…`;
}

function isValidDate(value: Date | null): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function formatDateForDisplay(value: string): string {
  const parsed = parseIsoDate(value);
  if (!parsed) {
    return value;
  }
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}/${month}/${day}`;
}

function resolveAppLanguage(language: string): AppLanguage {
  if (language.startsWith('en')) {
    return 'en';
  }
  if (language.startsWith('ko')) {
    return 'ko';
  }
  return 'ja';
}

function resolvePeriodText(
  startDate: string,
  endDate: string,
  translate: TFunction,
): string {
  if (!startDate || !endDate) {
    return translate('create_tournament.period.empty');
  }
  const dayCount = resolveRangeDayCount(startDate, endDate);
  const start = formatDateForDisplay(startDate);
  const end = formatDateForDisplay(endDate);
  if (dayCount === null) {
    return translate('create_tournament.period.range', { start, end });
  }
  return translate('create_tournament.period.range_with_days', { start, end, count: dayCount });
}

function resolveStepButtonReason(
  messageKey: string | null,
  fallbackKey: string,
  translate: TFunction,
): string {
  return messageKey ? translate(messageKey) : translate(fallbackKey);
}

function resolveMissingFieldLabels(
  keys: readonly CreateTournamentFieldLabelKey[],
  translate: TFunction,
): string {
  const separator = translate('create_tournament.text.list_separator');
  return keys.map((key) => translate(key)).join(separator);
}

function scrollCreatePageTopIntoView(): void {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function CreateTournamentPage(props: CreateTournamentPageProps): JSX.Element {
  const { t, i18n } = useTranslation();
  const { appDb } = useAppServices();
  const draft = props.draft;
  const rows = draft.rows;
  const [currentStep, setCurrentStep] = React.useState<CreateWizardStep>(0);
  const [showChartValidationErrors, setShowChartValidationErrors] = React.useState(false);
  const chartRowRefs = React.useRef<Record<string, HTMLElement | null>>({});
  const validation = React.useMemo(() => resolveCreateTournamentValidation(draft, props.todayDate), [draft, props.todayDate]);
  const canAddRow = rows.length < MAX_CHART_ROWS;
  const startDateValue = React.useMemo(() => parseIsoDate(draft.startDate), [draft.startDate]);
  const endDateValue = React.useMemo(() => parseIsoDate(draft.endDate), [draft.endDate]);
  const todayDateValue = React.useMemo(() => parseIsoDate(props.todayDate), [props.todayDate]);
  const appLanguage = React.useMemo(() => resolveAppLanguage(i18n.resolvedLanguage ?? i18n.language ?? 'ja'), [i18n.language, i18n.resolvedLanguage]);
  const datePickerLocaleText = DATE_PICKER_LOCALE_TEXT_BY_LANGUAGE[appLanguage];
  const datePickerAdapterLocale = DATE_FNS_LOCALE_BY_LANGUAGE[appLanguage];
  const wizardSteps = React.useMemo(
    () => [
      t('create_tournament.wizard.step.basic'),
      t('create_tournament.wizard.step.charts'),
      t('create_tournament.wizard.step.confirm'),
    ],
    [t],
  );
  const periodText = React.useMemo(() => resolvePeriodText(draft.startDate, draft.endDate, t), [draft.endDate, draft.startDate, t]);
  const missingBasicFieldsText = React.useMemo(() => resolveMissingFieldLabels(validation.missingBasicFields, t), [t, validation.missingBasicFields]);
  const displayHashtag = React.useMemo(() => normalizeHashtagForDisplay(draft.hashtag), [draft.hashtag]);
  const basicMissingCount = validation.missingBasicFields.length;
  const chartMissingCount = validation.incompleteChartRowCount;
  const stepOneReady = validation.hasRequiredFields && validation.periodError === null;
  const stepTwoReady = validation.chartStepError === null;
  const maxSelectableStep: CreateWizardStep = stepOneReady ? (stepTwoReady ? 2 : 1) : 0;
  const wizardDebugEnabled = React.useMemo(
    () => props.debugModeEnabled && isCreateWizardDebugEnabled(),
    [props.debugModeEnabled],
  );

  const minEndDateValue = React.useMemo(() => {
    if (!startDateValue && !todayDateValue) {
      return undefined;
    }
    if (!startDateValue) {
      return todayDateValue ?? undefined;
    }
    if (!todayDateValue) {
      return startDateValue;
    }
    return startDateValue > todayDateValue ? startDateValue : todayDateValue;
  }, [startDateValue, todayDateValue]);
  const endDatePickerMinProps = minEndDateValue ? { minDate: minEndDateValue } : {};

  React.useEffect(() => {
    if (currentStep === 2 && !stepTwoReady) {
      setCurrentStep(stepOneReady ? 1 : 0);
      return;
    }
    if (currentStep === 1 && !stepOneReady) {
      setCurrentStep(0);
    }
  }, [currentStep, stepOneReady, stepTwoReady]);

  React.useEffect(() => {
    if (currentStep !== 1) {
      setShowChartValidationErrors(false);
    }
  }, [currentStep]);

  React.useEffect(() => {
    const canShowCurrentStep =
      currentStep === 0 || (currentStep === 1 ? stepOneReady : stepTwoReady);
    if (!canShowCurrentStep) {
      return;
    }
    scrollCreatePageTopIntoView();
  }, [currentStep, stepOneReady, stepTwoReady]);

  const tournamentDefHash = React.useMemo(() => {
    if (!validation.canProceed) {
      return null;
    }
    try {
      return buildTournamentDefHash({
        v: PAYLOAD_VERSION,
        uuid: draft.tournamentUuid,
        name: draft.name.trim(),
        owner: draft.owner.trim(),
        hashtag: normalizeHashtag(draft.hashtag),
        start: draft.startDate,
        end: draft.endDate,
        charts: validation.selectedChartIds,
      });
    } catch {
      return null;
    }
  }, [draft, validation.canProceed, validation.selectedChartIds]);
  const shortTournamentDefHash = React.useMemo(
    () => (tournamentDefHash ? shortenTournamentId(tournamentDefHash, 30) : t('common.not_available')),
    [t, tournamentDefHash],
  );

  const isChartSelectedByAnotherRow = React.useCallback(
    (rowKey: string, chartId: number): boolean =>
      rows.some((row) => row.key !== rowKey && row.selectedChartId !== null && row.selectedChartId === chartId),
    [rows],
  );

  const updateRow = React.useCallback(
    (key: string, updater: (row: CreateTournamentChartDraft) => CreateTournamentChartDraft) => {
      props.onDraftChange((current) => ({
        ...current,
        rows: current.rows.map((row) => (row.key === key ? updater(row) : row)),
      }));
    },
    [props],
  );

  const loadCharts = React.useCallback(
    async (key: string, musicId: number, playStyle: 'SP' | 'DP') => {
      const chartOptions = (await appDb.getChartsByMusicAndStyle(musicId, playStyle)).filter(isSelectableChart);
      updateRow(key, (row) => {
        const selectedChartExists =
          row.selectedChartId !== null && chartOptions.some((chart) => chart.chartId === row.selectedChartId);
        return {
          ...row,
          chartOptions,
          selectedChartId: selectedChartExists ? row.selectedChartId : null,
        };
      });
    },
    [appDb, updateRow],
  );

  const handleSearch = React.useCallback(
    async (key: string, value: string) => {
      updateRow(key, (row) => ({ ...row, query: value, loading: true }));
      const normalized = normalizeSearchText(value.trim());
      if (!normalized) {
        updateRow(key, (row) => ({
          ...row,
          options: [],
          loading: false,
        }));
        return;
      }
      const options = await appDb.searchSongsByPrefix(normalized, 30);
      const uniqueOptions = Array.from(new Map(options.map((option) => [option.musicId, option] as const)).values());
      debugSongSearch('search response', {
        query: value,
        optionCount: options.length,
        uniqueCount: uniqueOptions.length,
        sample: uniqueOptions.slice(0, 5),
      });
      updateRow(key, (row) => ({
        ...row,
        options: uniqueOptions,
        loading: false,
      }));
    },
    [appDb, updateRow],
  );

  const stepOneDisabledReason = !stepOneReady
    ? validation.missingBasicFields.length > 0
      ? t('create_tournament.validation.missing_items', { items: missingBasicFieldsText })
      : resolveStepButtonReason(validation.periodError, 'create_tournament.validation.check_input', t)
    : null;
  const createDisabledReason = !validation.canProceed
    ? resolveStepButtonReason(validation.periodError ?? validation.chartStepError, 'create_tournament.validation.check_input', t)
    : null;
  const stepStatusText =
    currentStep === 0
      ? basicMissingCount > 0
        ? t('create_tournament.status.missing_count', { count: basicMissingCount })
        : t('create_tournament.status.completed')
      : currentStep === 1
        ? chartMissingCount > 0
          ? t('create_tournament.status.missing_count', { count: chartMissingCount })
          : t('create_tournament.status.completed')
        : null;
  const copyToClipboard = React.useCallback(async (value: string) => {
    try {
      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
        return;
      }
      await navigator.clipboard.writeText(value);
    } catch {
      // ignore clipboard failure
    }
  }, []);

  const scrollFirstInvalidChartCard = React.useCallback(() => {
    const invalidRow = rows.find((row) => row.selectedSong === null || row.selectedChartId === null);
    if (!invalidRow) {
      return;
    }
    chartRowRefs.current[invalidRow.key]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [rows]);

  return (
    <div className="page createTournamentPage">
      <nav className="createWizardSteps" aria-label={t('create_tournament.wizard.aria_label')}>
        {wizardSteps.map((stepLabel, index) => {
          const stepIndex = index as CreateWizardStep;
          const stepClassName =
            stepIndex === currentStep
              ? 'createWizardStep isCurrent'
              : stepIndex < currentStep
                ? 'createWizardStep isComplete'
                : 'createWizardStep';
          return (
            <button
              key={stepLabel}
              type="button"
              className={stepClassName}
              onClick={() => setCurrentStep(stepIndex)}
              disabled={stepIndex > maxSelectableStep}
              aria-label={t('create_tournament.wizard.nav_item', { index: index + 1, label: stepLabel })}
            >
              {stepLabel}
            </button>
          );
        })}
      </nav>
      {stepStatusText ? (
        <p className="createStepStatusLine" role="status">
          {stepStatusText}
        </p>
      ) : null}

      {currentStep === 0 ? (
        <section className="createSection">
          <h2 className="createSectionTitle">
            {t('create_tournament.step.basic_title')}
          </h2>
          <div className="createFieldStack">
            <label className="createField">
              <span className="createFieldLabel">{t('create_tournament.field.name.label')}</span>
              <input
                maxLength={50}
                value={draft.name}
                placeholder={t('create_tournament.field.name.placeholder')}
                onChange={(event) => {
                  const value = event.target.value;
                  props.onDraftChange((current) => ({ ...current, name: value }));
                }}
              />
              {validation.nameError ? <p className="errorText createInlineError">{t(validation.nameError)}</p> : null}
            </label>

            <label className="createField">
              <span className="createFieldLabel">{t('create_tournament.field.owner.label')}</span>
              <input
                maxLength={50}
                value={draft.owner}
                placeholder={t('create_tournament.field.owner.placeholder')}
                onChange={(event) => {
                  const value = event.target.value;
                  props.onDraftChange((current) => ({ ...current, owner: value }));
                }}
              />
              {validation.ownerError ? <p className="errorText createInlineError">{t(validation.ownerError)}</p> : null}
            </label>

            <label className="createField">
              <span className="createFieldLabel">{t('create_tournament.field.hashtag.label')}</span>
              <div className="hashtagInputGroup">
                <span className="hashtagInputPrefix" aria-hidden="true">
                  #
                </span>
                <input
                  maxLength={50}
                  value={draft.hashtag}
                  placeholder={t('create_tournament.field.hashtag.placeholder')}
                  onChange={(event) => {
                    const value = event.target.value.replace(/^[#＃]+/u, '');
                    props.onDraftChange((current) => ({ ...current, hashtag: value }));
                  }}
                />
              </div>
              {validation.hashtagError ? <p className="errorText createInlineError">{t(validation.hashtagError)}</p> : null}
            </label>

            <div className="createField">
              <span className="createFieldLabel">{t('create_tournament.field.period.label')}</span>
              <div className="periodRangeInputs">
                <div className="periodDateField">
                  <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={datePickerAdapterLocale} localeText={datePickerLocaleText}>
                    <DatePicker
                      value={startDateValue}
                      onChange={(value) => {
                        props.onDraftChange((current) => ({
                          ...current,
                          startDate: isValidDate(value) ? formatIsoDate(value) : '',
                        }));
                      }}
                      format="yyyy/MM/dd"
                      slotProps={{ textField: { placeholder: t('create_tournament.field.period.start_placeholder'), fullWidth: true, size: 'small' } }}
                    />
                  </LocalizationProvider>
                  {validation.startDateError ? <p className="errorText createInlineError">{t(validation.startDateError)}</p> : null}
                </div>
                <span aria-hidden="true">{t('create_tournament.text.period_separator')}</span>
                <div className="periodDateField">
                  <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={datePickerAdapterLocale} localeText={datePickerLocaleText}>
                    <DatePicker
                      value={endDateValue}
                      {...endDatePickerMinProps}
                      onChange={(value) => {
                        props.onDraftChange((current) => ({
                          ...current,
                          endDate: isValidDate(value) ? formatIsoDate(value) : '',
                        }));
                      }}
                      format="yyyy/MM/dd"
                      slotProps={{ textField: { placeholder: t('create_tournament.field.period.end_placeholder'), fullWidth: true, size: 'small' } }}
                    />
                  </LocalizationProvider>
                  {validation.endDateError ? <p className="errorText createInlineError">{t(validation.endDateError)}</p> : null}
                </div>
              </div>

              <div className="periodPresetActions">
                <button
                  type="button"
                  onClick={() => {
                    const nextMonth = resolveNextMonthDateRange(props.todayDate);
                    props.onDraftChange((current) => ({
                      ...current,
                      startDate: nextMonth.startDate,
                      endDate: nextMonth.endDate,
                    }));
                  }}
                >
                  {t('create_tournament.action.set_next_month')}
                </button>
              </div>

              <p className="hintText">{periodText}</p>
            </div>
          </div>
        </section>
      ) : null}

      {currentStep === 1 ? (
        <section className="createSection">
          <div className="createSectionHeading">
            <h2 className="createSectionTitle">
              {t('create_tournament.step.charts_title', { current: rows.length, max: MAX_CHART_ROWS })}
            </h2>
            <div className="createSectionAction">
              {!canAddRow ? <p className="hintText createButtonReason">{t('create_tournament.chart.max_limit', { max: MAX_CHART_ROWS })}</p> : null}
              <button
                type="button"
                className="addRowButton"
                disabled={!canAddRow}
                onClick={() => {
                  if (!canAddRow) {
                    return;
                  }
                  props.onDraftChange((current) => ({
                    ...current,
                    rows: [...current.rows, createEmptyChartDraft()],
                  }));
                }}
              >
                {t('create_tournament.chart.add')}
              </button>
            </div>
          </div>

          <div className="chartRows">
            {rows.map((row, index) => {
              const selectableChartCount = row.chartOptions.filter(
                (chart) => !isChartSelectedByAnotherRow(row.key, chart.chartId),
              ).length;
              const rowSongMissing = showChartValidationErrors && row.selectedSong === null;
              const rowDifficultyMissing = showChartValidationErrors && row.selectedSong !== null && row.selectedChartId === null;

              return (
                <article
                  key={row.key}
                  className="chartRowCard createChartCard"
                  ref={(element) => {
                    chartRowRefs.current[row.key] = element;
                  }}
                >
                  <div className="chartRowHeader">
                    <strong>{t('create_tournament.chart.selection_label', { index: index + 1 })}</strong>
                    <button
                      type="button"
                      className="iconOnlyButton"
                      aria-label={t('create_tournament.chart.selection_delete_aria', { index: index + 1 })}
                      onClick={() =>
                        props.onDraftChange((current) => ({
                          ...current,
                          rows: current.rows.filter((item) => item.key !== row.key),
                        }))
                      }
                      disabled={rows.length === 1}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </button>
                  </div>

                  <div className="createField">
                    <span className="createFieldLabel">{t('create_tournament.field.song.label')}</span>
                    <Box sx={SONG_AUTOCOMPLETE_SX}>
                      <Autocomplete<SongSummary, false, false, false>
                        fullWidth
                        openOnFocus
                        options={row.options}
                        filterOptions={(options) => options}
                        value={row.selectedSong}
                        inputValue={row.query}
                        loading={row.loading}
                        onOpen={() => {
                          if (row.options.length === 0 && row.query.trim().length > 0) {
                            void handleSearch(row.key, row.query);
                          }
                        }}
                        noOptionsText={
                          row.query.trim().length === 0
                            ? t('create_tournament.field.song.no_options_empty_query')
                            : t('create_tournament.field.song.no_options_not_found')
                        }
                        loadingText={t('create_tournament.field.song.loading')}
                        isOptionEqualToValue={(option, value) => option.musicId === value.musicId}
                        getOptionLabel={(option) => option.title}
                        onInputChange={(_, value, reason) => {
                          if (reason === 'input' || reason === 'clear') {
                            void handleSearch(row.key, value);
                            return;
                          }
                          updateRow(row.key, (current) => ({
                            ...current,
                            query: value,
                          }));
                        }}
                        onChange={(_, selectedSong) => {
                          updateRow(row.key, (current) => ({
                            ...current,
                            selectedSong,
                            query: selectedSong?.title ?? '',
                            chartOptions: [],
                            selectedChartId: null,
                          }));
                          if (selectedSong) {
                            void loadCharts(row.key, selectedSong.musicId, row.playStyle);
                          }
                        }}
                        renderInput={(params) => (
                          <TextField
                            {...(params as any)}
                            placeholder={t('create_tournament.field.song.placeholder')}
                            InputProps={{
                              ...params.InputProps,
                              endAdornment: (
                                <>
                                  {row.loading ? <CircularProgress color="inherit" size={16} /> : null}
                                  {params.InputProps.endAdornment}
                                </>
                              ),
                            }}
                          />
                        )}
                        renderOption={(optionProps, option) => {
                          const { key: optionKey, ...liProps } = optionProps as Record<string, unknown> & { key?: React.Key };
                          return (
                            <Box
                              component="li"
                              key={option.musicId > 0 ? `music-${option.musicId}` : String(optionKey ?? option.title)}
                              {...liProps}
                            >
                              <Box sx={{ display: 'grid', gap: 0.5 }}>
                                <Typography variant="caption" color="text.secondary">
                                  [{versionLabel(option.version)}]
                                </Typography>
                                <Typography variant="body2" sx={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>
                                  {option.title}
                                </Typography>
                              </Box>
                            </Box>
                          );
                        }}
                      />
                    </Box>
                    {rowSongMissing ? (
                      <p className="errorText createInlineError createInlineErrorCompact">
                        {t('create_tournament.validation.chart_song_required')}
                      </p>
                    ) : null}
                  </div>

                  <div className="createField">
                    <span className="createFieldLabel">{t('create_tournament.field.play_style.label')}</span>
                    {!row.selectedSong ? <span className="hintText">{t('create_tournament.field.play_style.disabled_hint')}</span> : null}
                    <div className="styleRadioGroup">
                      <label className={`styleOption ${row.playStyle === 'SP' ? 'selected' : ''} ${!row.selectedSong ? 'disabled' : ''}`}>
                        <input
                          type="radio"
                          name={`style-${row.key}`}
                          checked={row.playStyle === 'SP'}
                          disabled={!row.selectedSong}
                          onChange={() => {
                            if (!row.selectedSong) {
                              return;
                            }
                            updateRow(row.key, (current) => ({ ...current, playStyle: 'SP' }));
                            void loadCharts(row.key, row.selectedSong.musicId, 'SP');
                          }}
                        />
                        {t('create_tournament.field.play_style.sp')}
                      </label>
                      <label className={`styleOption ${row.playStyle === 'DP' ? 'selected' : ''} ${!row.selectedSong ? 'disabled' : ''}`}>
                        <input
                          type="radio"
                          name={`style-${row.key}`}
                          checked={row.playStyle === 'DP'}
                          disabled={!row.selectedSong}
                          onChange={() => {
                            if (!row.selectedSong) {
                              return;
                            }
                            updateRow(row.key, (current) => ({ ...current, playStyle: 'DP' }));
                            void loadCharts(row.key, row.selectedSong.musicId, 'DP');
                          }}
                        />
                        {t('create_tournament.field.play_style.dp')}
                      </label>
                    </div>
                  </div>

                  <div className="createField">
                    <span className="createFieldLabel">{t('create_tournament.field.difficulty.label')}</span>
                    {!row.selectedSong ? <span className="hintText">{t('create_tournament.field.difficulty.select_song_hint')}</span> : null}
                    {row.selectedSong && row.chartOptions.length === 0 ? (
                      <span className="hintText">{t('create_tournament.field.difficulty.no_available')}</span>
                    ) : null}
                    {row.selectedSong && row.chartOptions.length > 0 ? (
                      <>
                        {selectableChartCount === 0 ? <span className="hintText">{t('create_tournament.field.difficulty.used_in_other')}</span> : null}
                        <div className="difficultyButtons">
                          {row.chartOptions.map((chart) => {
                            const active = row.selectedChartId === chart.chartId;
                            const disabledByDuplicate = isChartSelectedByAnotherRow(row.key, chart.chartId);
                            return (
                              <button
                                key={chart.chartId}
                                type="button"
                                className={`difficultySelectButton ${active ? 'active' : ''}`}
                                style={difficultyButtonStyle(chart.difficulty, active)}
                                disabled={disabledByDuplicate}
                                onClick={() => {
                                  if (disabledByDuplicate) {
                                    return;
                                  }
                                  updateRow(row.key, (current) => ({ ...current, selectedChartId: chart.chartId }));
                                }}
                              >
                                {resolveDifficultyShortLabel(chart.difficulty, chart.level)}
                              </button>
                            );
                          })}
                        </div>
                      </>
                    ) : null}
                    {rowDifficultyMissing ? (
                      <p className="errorText createInlineError createInlineErrorCompact">
                        {t('create_tournament.validation.chart_difficulty_required_row')}
                      </p>
                    ) : null}
                  </div>

                  {row.selectedChartId !== null && validation.duplicateChartIds.has(row.selectedChartId) ? (
                    <p className="errorText createInlineError">{t('create_tournament.validation.chart_duplicate_on_page')}</p>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {currentStep === 2 ? (
        <>
          <section className="createSection">
            <h2 className="createSectionTitle">
              {t('create_tournament.step.confirm_title')}
            </h2>
            <article className="chartRowCard createConfirmInfoCard">
              <dl className="createConfirmInfoList">
                <div className="createConfirmInfoItem">
                  <dt>{t('create_tournament.field.name.label_plain')}</dt>
                  <dd>{draft.name.trim() || t('common.not_available')}</dd>
                </div>
                <div className="createConfirmInfoItem">
                  <dt>{t('create_tournament.field.owner.label_plain')}</dt>
                  <dd>{draft.owner.trim() || t('common.not_available')}</dd>
                </div>
                <div className="createConfirmInfoItem">
                  <dt>{t('create_tournament.field.hashtag.label_plain')}</dt>
                  <dd className="createConfirmHashtagValue">{displayHashtag || t('common.not_available')}</dd>
                </div>
                <div className="createConfirmInfoItem">
                  <dt>{t('create_tournament.field.period.label_plain')}</dt>
                  <dd>{periodText}</dd>
                </div>
                <div className="createConfirmInfoItem">
                  <dt>{t('create_tournament.field.tournament_id.label_plain')}</dt>
                  <dd className="createConfirmTournamentIdRow">
                    <span className="createConfirmTournamentIdText">{shortTournamentDefHash}</span>
                    <button
                      type="button"
                      className="createInlineIconCopyButton"
                      aria-label={t('common.copy')}
                      onClick={() => void copyToClipboard(tournamentDefHash ?? '')}
                      disabled={!tournamentDefHash}
                    >
                      <ContentCopyIcon fontSize="inherit" />
                    </button>
                  </dd>
                </div>
              </dl>
            </article>
          </section>

          <section className="createSection">
            <h2 className="createSectionTitle">{t('create_tournament.confirm.chart_list_title')}</h2>
            <div className="chartRows createConfirmChartRows">
              {rows.map((row, index) => {
                const selectedChart = resolveSelectedChartOption(row);
                const difficultyTextColor = selectedChart ? difficultyColor(selectedChart.difficulty) : undefined;
                const playInfoText = selectedChart
                  ? `${row.playStyle}  ${selectedChart.difficulty} ${selectedChart.level}`
                  : t('common.not_available');
                return (
                  <article key={row.key} className="chartRowCard createChartCard createConfirmChartCard">
                    <div className="chartRowHeader">
                      <strong>{t('create_tournament.confirm.chart_title', { index: index + 1 })}</strong>
                    </div>
                    <p className="createConfirmChartSong">{row.selectedSong?.title ?? t('common.not_available')}</p>
                    <p className="createConfirmChartMeta" style={difficultyTextColor ? { color: difficultyTextColor } : undefined}>
                      {playInfoText}
                    </p>
                  </article>
                );
              })}
            </div>
          </section>

          {wizardDebugEnabled ? (
            <section className="createSection">
              <h2 className="createSectionTitle">{t('create_tournament.confirm.debug.title')}</h2>
              <article className="chartRowCard createConfirmInfoCard">
                <dl className="createConfirmInfoList">
                  <div className="createConfirmInfoItem">
                    <dt>{t('create_tournament.confirm.debug.def_hash')}</dt>
                    <dd>{tournamentDefHash ?? t('common.not_available')}</dd>
                  </div>
                  <div className="createConfirmInfoItem">
                    <dt>{t('create_tournament.confirm.debug.source_tournament_uuid')}</dt>
                    <dd>{t('create_tournament.confirm.debug.null')}</dd>
                  </div>
                </dl>
              </article>
            </section>
          ) : null}
        </>
      ) : null}

      <footer className="createStickyFooter">
        {currentStep === 0 ? (
          <>
            {!stepOneReady ? <p className="errorText createInlineError">{stepOneDisabledReason}</p> : null}
            <button
              type="button"
              className="primaryActionButton"
              onClick={() => {
                setCurrentStep(1);
              }}
              disabled={!stepOneReady}
            >
              {t('create_tournament.action.next_with_step', {
                action: t('common.next'),
                step: t('create_tournament.wizard.step.charts'),
              })}
            </button>
          </>
        ) : null}

        {currentStep === 1 ? (
          <>
            <div className="createConfirmActions">
              <button
                type="button"
                onClick={() => {
                  setCurrentStep(0);
                }}
              >
                {t('create_tournament.action.back_with_step', {
                  action: t('common.back'),
                  step: t('create_tournament.wizard.step.basic'),
                })}
              </button>
              <button
                type="button"
                className="primaryActionButton"
                onClick={() => {
                  if (!stepTwoReady) {
                    setShowChartValidationErrors(true);
                    scrollFirstInvalidChartCard();
                    return;
                  }
                  setShowChartValidationErrors(false);
                  setCurrentStep(2);
                }}
              >
                {t('create_tournament.action.next_with_step', {
                  action: t('common.next'),
                  step: t('create_tournament.wizard.step.confirm'),
                })}
              </button>
            </div>
          </>
        ) : null}

        {currentStep === 2 ? (
          <>
            {props.errorMessage ? <p className="errorText createInlineError">{props.errorMessage}</p> : null}
            {!props.saving && !validation.canProceed ? (
              <p className="errorText createInlineError">{createDisabledReason}</p>
            ) : null}
            <p className="createFinalizeWarning">{t('create_tournament.confirm.final_notice')}</p>
            <div className="createConfirmActions">
              <button
                type="button"
                onClick={() => {
                  setCurrentStep(1);
                }}
                disabled={props.saving}
              >
                {t('create_tournament.action.back_with_step', {
                  action: t('common.back'),
                  step: t('create_tournament.wizard.step.charts'),
                })}
              </button>
              <button
                type="button"
                className="primaryActionButton"
                disabled={props.saving || !validation.canProceed}
                onClick={() => {
                  void props.onConfirmCreate();
                }}
              >
                {t('create_tournament.action.finalize')}
              </button>
            </div>
          </>
        ) : null}
      </footer>
    </div>
  );
}
