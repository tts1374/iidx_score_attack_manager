import React from 'react';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import type { ChartSummary, SongSummary } from '@iidx/db';
import { PAYLOAD_VERSION, buildTournamentDefHash, normalizeSearchText } from '@iidx/shared';
import { Autocomplete, Box, CircularProgress, TextField, Typography } from '@mui/material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { jaJP } from '@mui/x-date-pickers/locales';
import { ja } from 'date-fns/locale/ja';

import { useAppServices } from '../services/context';
import { difficultyColor, versionLabel } from '../utils/iidx';
import {
  MAX_CHART_ROWS,
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
  onDraftChange: (updater: (draft: CreateTournamentDraft) => CreateTournamentDraft) => void;
  onConfirmCreate: () => Promise<void>;
}

type CreateWizardStep = 0 | 1 | 2;

const SONG_SEARCH_DEBUG_STORAGE_KEY = 'iidx:debug:song-search';
const CREATE_WIZARD_DEBUG_STORAGE_KEY = 'iidx:debug:create-wizard';
const JA_PICKER_LOCALE_TEXT = jaJP.components.MuiLocalizationProvider.defaultProps.localeText as any;
const SONG_AUTOCOMPLETE_SX = {
  width: '100%',
  maxWidth: '100%',
} as const;
const WIZARD_STEPS = ['基本情報', '譜面', '確認'] as const;

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

function resolvePeriodText(startDate: string, endDate: string): string {
  if (!startDate || !endDate) {
    return '-';
  }
  const dayCount = resolveRangeDayCount(startDate, endDate);
  if (dayCount === null) {
    return `${formatDateForDisplay(startDate)} 〜 ${formatDateForDisplay(endDate)}`;
  }
  return `${formatDateForDisplay(startDate)} 〜 ${formatDateForDisplay(endDate)}（${dayCount}日間）`;
}

function resolveStepButtonReason(message: string | null, fallbackMessage: string): string {
  return message ?? fallbackMessage;
}

function scrollStepTitleIntoView(stepTitle: HTMLHeadingElement): void {
  const appBar = document.querySelector<HTMLElement>('header.MuiAppBar-root');
  const appBarHeight = appBar?.getBoundingClientRect().height ?? 0;
  const topPadding = 8;
  const targetTop = window.scrollY + stepTitle.getBoundingClientRect().top - appBarHeight - topPadding;
  window.scrollTo({ top: Math.max(targetTop, 0) });
}

export function CreateTournamentPage(props: CreateTournamentPageProps): JSX.Element {
  const { appDb } = useAppServices();
  const draft = props.draft;
  const rows = draft.rows;
  const [currentStep, setCurrentStep] = React.useState<CreateWizardStep>(0);
  const stepTitleRefs = React.useRef<Record<CreateWizardStep, HTMLHeadingElement | null>>({
    0: null,
    1: null,
    2: null,
  });
  const previousStepRef = React.useRef<CreateWizardStep>(0);
  const validation = React.useMemo(() => resolveCreateTournamentValidation(draft, props.todayDate), [draft, props.todayDate]);
  const canAddRow = rows.length < MAX_CHART_ROWS;
  const startDateValue = React.useMemo(() => parseIsoDate(draft.startDate), [draft.startDate]);
  const endDateValue = React.useMemo(() => parseIsoDate(draft.endDate), [draft.endDate]);
  const todayDateValue = React.useMemo(() => parseIsoDate(props.todayDate), [props.todayDate]);
  const periodText = React.useMemo(() => resolvePeriodText(draft.startDate, draft.endDate), [draft.endDate, draft.startDate]);
  const displayHashtag = React.useMemo(() => normalizeHashtagForDisplay(draft.hashtag), [draft.hashtag]);
  const stepOneReady = validation.hasRequiredFields && validation.periodError === null;
  const stepTwoReady = validation.chartStepError === null;
  const maxSelectableStep: CreateWizardStep = stepOneReady ? (stepTwoReady ? 2 : 1) : 0;
  const wizardDebugEnabled = React.useMemo(() => isCreateWizardDebugEnabled(), []);

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
    const canShowCurrentStep =
      currentStep === 0 || (currentStep === 1 ? stepOneReady : stepTwoReady);
    if (!canShowCurrentStep) {
      return;
    }
    if (previousStepRef.current === currentStep) {
      return;
    }
    const stepTitle = stepTitleRefs.current[currentStep];
    if (!stepTitle) {
      return;
    }
    scrollStepTitleIntoView(stepTitle);
    previousStepRef.current = currentStep;
  }, [currentStep, stepOneReady, stepTwoReady]);

  const debugDefHash = React.useMemo(() => {
    if (!wizardDebugEnabled || !validation.canProceed) {
      return null;
    }
    try {
      return buildTournamentDefHash({
        v: PAYLOAD_VERSION,
        uuid: draft.tournamentUuid,
        name: draft.name.trim(),
        owner: draft.owner.trim(),
        hashtag: draft.hashtag.trim(),
        start: draft.startDate,
        end: draft.endDate,
        charts: validation.selectedChartIds,
      });
    } catch {
      return null;
    }
  }, [draft, validation.canProceed, validation.selectedChartIds, wizardDebugEnabled]);

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
      ? `未入力項目: ${validation.missingBasicFields.join('、')}`
      : resolveStepButtonReason(validation.periodError, '入力内容を確認してください。')
    : null;
  const stepTwoDisabledReason = !stepTwoReady
    ? resolveStepButtonReason(validation.chartStepError, '譜面の入力内容を確認してください。')
    : null;
  const createDisabledReason = !validation.canProceed
    ? resolveStepButtonReason(validation.periodError ?? validation.chartStepError, '入力内容を確認してください。')
    : null;

  return (
    <div className="page createTournamentPage">
      <nav className="createWizardSteps" aria-label="大会定義ウィザード">
        {WIZARD_STEPS.map((stepLabel, index) => {
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
            >
              {index + 1}. {stepLabel}
            </button>
          );
        })}
      </nav>

      {currentStep === 0 ? (
        <section className="createSection">
          <h2
            className="createSectionTitle"
            ref={(element) => {
              stepTitleRefs.current[0] = element;
            }}
          >
            1) 大会基本情報
          </h2>
          <div className="createFieldStack">
            <label className="createField">
              <span className="fieldChipLabel">大会名 *</span>
              <input
                maxLength={50}
                value={draft.name}
                onChange={(event) => {
                  const value = event.target.value;
                  props.onDraftChange((current) => ({ ...current, name: value }));
                }}
              />
              {validation.nameError ? <p className="errorText createInlineError">{validation.nameError}</p> : null}
            </label>

            <label className="createField">
              <span className="fieldChipLabel">開催者 *</span>
              <input
                maxLength={50}
                value={draft.owner}
                onChange={(event) => {
                  const value = event.target.value;
                  props.onDraftChange((current) => ({ ...current, owner: value }));
                }}
              />
              {validation.ownerError ? <p className="errorText createInlineError">{validation.ownerError}</p> : null}
            </label>

            <label className="createField">
              <span className="fieldChipLabel">ハッシュタグ *</span>
              <input
                maxLength={50}
                value={draft.hashtag}
                onChange={(event) => {
                  const value = event.target.value;
                  props.onDraftChange((current) => ({ ...current, hashtag: value }));
                }}
              />
              {validation.hashtagError ? <p className="errorText createInlineError">{validation.hashtagError}</p> : null}
            </label>

            <div className="createField">
              <span className="fieldChipLabel">期間 *</span>
              <div className="periodRangeInputs">
                <div className="periodDateField">
                  <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={ja} localeText={JA_PICKER_LOCALE_TEXT}>
                    <DatePicker
                      value={startDateValue}
                      onChange={(value) => {
                        props.onDraftChange((current) => ({
                          ...current,
                          startDate: isValidDate(value) ? formatIsoDate(value) : '',
                        }));
                      }}
                      format="yyyy/MM/dd"
                      slotProps={{ textField: { placeholder: '開始日', fullWidth: true, size: 'small' } }}
                    />
                  </LocalizationProvider>
                  {validation.startDateError ? <p className="errorText createInlineError">{validation.startDateError}</p> : null}
                </div>
                <span aria-hidden="true">〜</span>
                <div className="periodDateField">
                  <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={ja} localeText={JA_PICKER_LOCALE_TEXT}>
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
                      slotProps={{ textField: { placeholder: '終了日', fullWidth: true, size: 'small' } }}
                    />
                  </LocalizationProvider>
                  {validation.endDateError ? <p className="errorText createInlineError">{validation.endDateError}</p> : null}
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
                  来月（1日〜月末）
                </button>
              </div>

              <p className="hintText">{periodText}</p>
            </div>
          </div>

          <article className="chartRowCard createProgressCard">
            <p className="progressLine">入力完了: {validation.basicCompletedCount}/4</p>
            <p className="hintText">
              未入力項目: {validation.missingBasicFields.length > 0 ? validation.missingBasicFields.join('、') : 'なし'}
            </p>
          </article>
        </section>
      ) : null}

      {currentStep === 1 ? (
        <section className="createSection">
          <div className="createSectionHeading">
            <h2
              className="createSectionTitle"
              ref={(element) => {
                stepTitleRefs.current[1] = element;
              }}
            >
              2) 対象譜面 ({rows.length} / {MAX_CHART_ROWS})
            </h2>
            <div className="createSectionAction">
              {!canAddRow ? <p className="hintText createButtonReason">最大4譜面までです。</p> : null}
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
                ＋追加
              </button>
            </div>
          </div>

          <div className="chartRows">
            {rows.map((row, index) => {
              const selectableChartCount = row.chartOptions.filter(
                (chart) => !isChartSelectedByAnotherRow(row.key, chart.chartId),
              ).length;

              return (
                <article key={row.key} className="chartRowCard createChartCard">
                  <div className="chartRowHeader">
                    <strong>選曲 {index + 1}</strong>
                    <button
                      type="button"
                      className="iconOnlyButton"
                      aria-label={`選曲 ${index + 1} を削除`}
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
                    <span className="fieldChipLabel">曲名</span>
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
                        noOptionsText={row.query.trim().length === 0 ? '曲名を入力してください。' : '該当する曲がありません。'}
                        loadingText="読み込み中..."
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
                            placeholder="曲名を入力"
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
                  </div>

                  <div className="createField">
                    <span className="fieldChipLabel">プレイスタイル</span>
                    {!row.selectedSong ? <span className="hintText">曲を選択するまで変更できません。</span> : null}
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
                        SP
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
                        DP
                      </label>
                    </div>
                  </div>

                  <div className="createField">
                    <span className="fieldChipLabel">難易度</span>
                    {!row.selectedSong ? <span className="hintText">曲を選択すると選べます。</span> : null}
                    {row.selectedSong && row.chartOptions.length === 0 ? (
                      <span className="hintText">選択可能な譜面がありません。</span>
                    ) : null}
                    {row.selectedSong && row.chartOptions.length > 0 ? (
                      <>
                        {selectableChartCount === 0 ? <span className="hintText">他の選曲で譜面が使用中です。</span> : null}
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
                                {chart.difficulty} Lv{chart.level}
                              </button>
                            );
                          })}
                        </div>
                      </>
                    ) : null}
                    {row.selectedSong && row.chartOptions.length > 0 && row.selectedChartId === null ? (
                      <p className="errorText createInlineError">難易度を選択してください。</p>
                    ) : null}
                  </div>

                  {row.selectedChartId !== null && validation.duplicateChartIds.has(row.selectedChartId) ? (
                    <p className="errorText createInlineError">同一譜面が重複しています。</p>
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
            <h2
              className="createSectionTitle"
              ref={(element) => {
                stepTitleRefs.current[2] = element;
              }}
            >
              3) 確認
            </h2>
            <article className="chartRowCard createConfirmInfoCard">
              <dl className="createConfirmInfoList">
                <div className="createConfirmInfoItem">
                  <dt>大会名</dt>
                  <dd>{draft.name.trim() || '-'}</dd>
                </div>
                <div className="createConfirmInfoItem">
                  <dt>開催者</dt>
                  <dd>{draft.owner.trim() || '-'}</dd>
                </div>
                <div className="createConfirmInfoItem">
                  <dt>ハッシュタグ</dt>
                  <dd>{displayHashtag || '-'}</dd>
                </div>
                <div className="createConfirmInfoItem">
                  <dt>期間</dt>
                  <dd>{periodText}</dd>
                </div>
              </dl>
            </article>
          </section>

          <section className="createSection">
            <h2 className="createSectionTitle">譜面一覧</h2>
            <div className="chartRows">
              {rows.map((row, index) => {
                const selectedChart = resolveSelectedChartOption(row);
                return (
                  <article key={row.key} className="chartRowCard createChartCard">
                    <div className="chartRowHeader">
                      <strong>譜面 {index + 1}</strong>
                    </div>

                    <div className="createField">
                      <span className="fieldChipLabel">曲名</span>
                      <p className="createConfirmValue">{row.selectedSong?.title ?? '-'}</p>
                    </div>

                    <div className="createField">
                      <span className="fieldChipLabel">プレイスタイル</span>
                      <div className="createConfirmStyleGroup">
                        <span className="styleOption selected createConfirmStyleChip">{row.playStyle}</span>
                      </div>
                    </div>

                    <div className="createField">
                      <span className="fieldChipLabel">難易度</span>
                      {selectedChart ? (
                        <span className="createConfirmDifficulty" style={difficultyButtonStyle(selectedChart.difficulty, true)}>
                          {selectedChart.difficulty} Lv{selectedChart.level}
                        </span>
                      ) : (
                        <p className="createConfirmValue">-</p>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          {wizardDebugEnabled ? (
            <section className="createSection">
              <h2 className="createSectionTitle">デバッグ情報</h2>
              <article className="chartRowCard createConfirmInfoCard">
                <dl className="createConfirmInfoList">
                  <div className="createConfirmInfoItem">
                    <dt>def_hash</dt>
                    <dd>{debugDefHash ?? '-'}</dd>
                  </div>
                  <div className="createConfirmInfoItem">
                    <dt>source_tournament_uuid</dt>
                    <dd>null</dd>
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
            <button type="button" className="primaryActionButton" onClick={() => setCurrentStep(1)} disabled={!stepOneReady}>
              次へ（譜面）
            </button>
          </>
        ) : null}

        {currentStep === 1 ? (
          <>
            {!stepTwoReady ? <p className="errorText createInlineError">{stepTwoDisabledReason}</p> : null}
            <div className="createConfirmActions">
              <button type="button" onClick={() => setCurrentStep(0)}>
                戻る（基本情報）
              </button>
              <button type="button" className="primaryActionButton" onClick={() => setCurrentStep(2)} disabled={!stepTwoReady}>
                次へ（確認）
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
            <div className="createConfirmActions">
              <button type="button" onClick={() => setCurrentStep(1)} disabled={props.saving}>
                戻る（譜面）
              </button>
              <button
                type="button"
                className="primaryActionButton"
                disabled={props.saving || !validation.canProceed}
                onClick={() => {
                  void props.onConfirmCreate();
                }}
              >
                {props.saving ? '作成中...' : '大会を作成'}
              </button>
            </div>
          </>
        ) : null}
      </footer>
    </div>
  );
}
