import React from 'react';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import type { ChartSummary, SongSummary } from '@iidx/db';
import { normalizeSearchText } from '@iidx/shared';
import { Autocomplete, Box, CircularProgress, TextField, Typography } from '@mui/material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { jaJP } from '@mui/x-date-pickers/locales';
import { ja } from 'date-fns/locale/ja';

import { useAppServices } from '../services/context';
import { difficultyColor, versionLabel } from '../utils/iidx';

interface CreateTournamentPageProps {
  todayDate: string;
  onSaved: (tournamentUuid: string) => Promise<void> | void;
}

interface ChartDraft {
  key: string;
  query: string;
  options: SongSummary[];
  selectedSong: SongSummary | null;
  playStyle: 'SP' | 'DP';
  chartOptions: ChartSummary[];
  selectedChartId: number | null;
  loading: boolean;
}

const SONG_SEARCH_DEBUG_STORAGE_KEY = 'iidx:debug:song-search';
const MAX_CHART_ROWS = 4;
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const JA_PICKER_LOCALE_TEXT = jaJP.components.MuiLocalizationProvider.defaultProps.localeText as any;
const SONG_AUTOCOMPLETE_SX = {
  width: '100%',
  maxWidth: '100%',
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

function emptyDraft(): ChartDraft {
  return {
    key: crypto.randomUUID(),
    query: '',
    options: [],
    selectedSong: null,
    playStyle: 'SP',
    chartOptions: [],
    selectedChartId: null,
    loading: false,
  };
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

function parseIsoDate(value: string): Date | null {
  const match = ISO_DATE_RE.exec(value);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }
  return parsed;
}

function formatIsoDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function CreateTournamentPage(props: CreateTournamentPageProps): JSX.Element {
  const { appDb } = useAppServices();
  const [name, setName] = React.useState('');
  const [owner, setOwner] = React.useState('');
  const [hashtag, setHashtag] = React.useState('');
  const [startDate, setStartDate] = React.useState(props.todayDate);
  const [endDate, setEndDate] = React.useState(props.todayDate);
  const [rows, setRows] = React.useState<ChartDraft[]>([emptyDraft()]);
  const [saving, setSaving] = React.useState(false);
  const startDateValue = React.useMemo(() => parseIsoDate(startDate), [startDate]);
  const endDateValue = React.useMemo(() => parseIsoDate(endDate), [endDate]);

  const selectedChartIds = rows
    .map((row) => row.selectedChartId)
    .filter((value): value is number => value !== null);

  const duplicateChartIds = React.useMemo(() => {
    const counts = new Map<number, number>();
    for (const chartId of selectedChartIds) {
      counts.set(chartId, (counts.get(chartId) ?? 0) + 1);
    }
    const duplicates = new Set<number>();
    for (const [chartId, count] of counts.entries()) {
      if (count > 1) {
        duplicates.add(chartId);
      }
    }
    return duplicates;
  }, [selectedChartIds]);

  const canAddRow = rows.length < MAX_CHART_ROWS;
  const hasRequiredFields =
    name.trim().length > 0 &&
    owner.trim().length > 0 &&
    hashtag.trim().length > 0 &&
    startDate.trim().length > 0 &&
    endDate.trim().length > 0;
  const periodError = startDate && endDate && startDate > endDate ? '開始日は終了日以前を指定してください。' : null;
  const hasUnselectedChart = rows.some((row) => row.selectedChartId === null);
  const canSave =
    !saving &&
    rows.length > 0 &&
    hasRequiredFields &&
    periodError === null &&
    !hasUnselectedChart &&
    duplicateChartIds.size === 0;

  const updateRow = React.useCallback((key: string, updater: (draft: ChartDraft) => ChartDraft) => {
    setRows((prev) => prev.map((row) => (row.key === key ? updater(row) : row)));
  }, []);

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
      const uniqueOptions = Array.from(
        new Map(options.map((option) => [option.musicId, option] as const)).values(),
      );
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

  const saveTournament = async () => {
    if (!canSave) {
      return;
    }
    setSaving(true);
    try {
      const tournamentUuid = await appDb.createTournament({
        tournamentName: name.trim(),
        owner: owner.trim(),
        hashtag: hashtag.trim(),
        startDate,
        endDate,
        chartIds: selectedChartIds,
      });
      await props.onSaved(tournamentUuid);
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page createTournamentPage">
      <section className="createSection">
        <h2 className="createSectionTitle">① 大会基本情報</h2>
        <div className="createFieldStack">
          <label className="createField">
            <span className="fieldChipLabel">大会名 *</span>
            <input maxLength={50} value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="createField">
            <span className="fieldChipLabel">開催者 *</span>
            <input maxLength={50} value={owner} onChange={(event) => setOwner(event.target.value)} />
          </label>
          <label className="createField">
            <span className="fieldChipLabel">ハッシュタグ *</span>
            <input maxLength={50} value={hashtag} onChange={(event) => setHashtag(event.target.value)} />
          </label>
          <div className="createField">
            <span className="fieldChipLabel">期間 *</span>
            <div className="periodRangeInputs">
              <LocalizationProvider
                dateAdapter={AdapterDateFns}
                adapterLocale={ja}
                localeText={JA_PICKER_LOCALE_TEXT}
              >
                <DatePicker
                  value={startDateValue}
                  onChange={(value) => {
                    setStartDate(isValidDate(value) ? formatIsoDate(value) : '');
                  }}
                  format="yyyy/MM/dd"
                  slotProps={{ textField: { placeholder: '開始日', fullWidth: true, size: 'small' } }}
                />
                <span aria-hidden="true">〜</span>
                <DatePicker
                  value={endDateValue}
                  onChange={(value) => {
                    setEndDate(isValidDate(value) ? formatIsoDate(value) : '');
                  }}
                  format="yyyy/MM/dd"
                  slotProps={{ textField: { placeholder: '終了日', fullWidth: true, size: 'small' } }}
                />
              </LocalizationProvider>
            </div>
          </div>
          {periodError ? <p className="errorText createInlineError">{periodError}</p> : null}
        </div>
      </section>

      <section className="createSection">
        <div className="createSectionHeading">
          <h2 className="createSectionTitle">
            ② 対象譜面 ({rows.length} / {MAX_CHART_ROWS})
          </h2>
          <button
            type="button"
            className="addRowButton"
            disabled={!canAddRow}
            onClick={() => {
              if (!canAddRow) {
                return;
              }
              setRows((prev) => [...prev, emptyDraft()]);
            }}
          >
            ＋追加
          </button>
        </div>

        <div className="chartRows">
          {rows.map((row, index) => (
            <article key={row.key} className="chartRowCard createChartCard">
              <div className="chartRowHeader">
                <strong>選曲 {index + 1}</strong>
                <button
                  type="button"
                  className="iconOnlyButton"
                  aria-label={`選曲 ${index + 1} を削除`}
                  onClick={() => setRows((prev) => prev.filter((item) => item.key !== row.key))}
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
                <div className="styleRadioGroup">
                  <label className={`styleOption ${row.playStyle === 'SP' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name={`style-${row.key}`}
                      checked={row.playStyle === 'SP'}
                      onChange={() => {
                        updateRow(row.key, (current) => ({ ...current, playStyle: 'SP' }));
                        if (row.selectedSong) {
                          void loadCharts(row.key, row.selectedSong.musicId, 'SP');
                        }
                      }}
                    />
                    SP
                  </label>
                  <label className={`styleOption ${row.playStyle === 'DP' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name={`style-${row.key}`}
                      checked={row.playStyle === 'DP'}
                      onChange={() => {
                        updateRow(row.key, (current) => ({ ...current, playStyle: 'DP' }));
                        if (row.selectedSong) {
                          void loadCharts(row.key, row.selectedSong.musicId, 'DP');
                        }
                      }}
                    />
                    DP
                  </label>
                </div>
              </div>

              <div className="createField">
                <span className="fieldChipLabel">難易度</span>
                {!row.selectedSong ? <span className="hintText">曲を選択してください。</span> : null}
                {row.selectedSong && row.chartOptions.length === 0 ? (
                  <span className="hintText">選択可能な譜面がありません。</span>
                ) : null}
                {row.selectedSong && row.chartOptions.length > 0 ? (
                  <div className="difficultyButtons">
                    {row.chartOptions.map((chart) => {
                      const active = row.selectedChartId === chart.chartId;
                      return (
                        <button
                          key={chart.chartId}
                          type="button"
                          className={`difficultySelectButton ${active ? 'active' : ''}`}
                          style={difficultyButtonStyle(chart.difficulty, active)}
                          onClick={() => {
                            updateRow(row.key, (current) => ({ ...current, selectedChartId: chart.chartId }));
                          }}
                        >
                          {chart.difficulty} Lv{chart.level}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>

              {row.selectedChartId !== null && duplicateChartIds.has(row.selectedChartId) ? (
                <p className="errorText createInlineError">同一譜面が重複しています。</p>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <footer className="createStickyFooter">
        <p className="createActionTitle">③ アクション</p>
        <div className="createFooterErrors">
          {!hasRequiredFields ? <p className="errorText createInlineError">必須項目を入力してください。</p> : null}
          {hasUnselectedChart ? <p className="errorText createInlineError">各選曲で譜面を選択してください。</p> : null}
          {duplicateChartIds.size > 0 ? <p className="errorText createInlineError">同一譜面を重複登録できません。</p> : null}
        </div>
        <button type="button" className="primaryActionButton" onClick={() => void saveTournament()} disabled={!canSave}>
          {saving ? '保存中...' : '保存'}
        </button>
      </footer>
    </div>
  );
}
