import React from 'react';
import type { ChartSummary, SongSummary } from '@iidx/db';
import { normalizeSearchText } from '@iidx/shared';
import { Autocomplete, Box, CircularProgress, TextField, Typography } from '@mui/material';

import { useAppServices } from '../services/context';
import { versionLabel } from '../utils/iidx';

interface CreateTournamentPageProps {
  todayDate: string;
  onCancel: () => void;
  onSaved: (tournamentUuid: string) => void;
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
const SONG_AUTOCOMPLETE_SX = {
  width: {
    xs: '100%',
    sm: 680,
    md: 760,
  },
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

export function CreateTournamentPage(props: CreateTournamentPageProps): JSX.Element {
  const { appDb } = useAppServices();
  const [name, setName] = React.useState('');
  const [owner, setOwner] = React.useState('');
  const [hashtag, setHashtag] = React.useState('');
  const [startDate, setStartDate] = React.useState(props.todayDate);
  const [endDate, setEndDate] = React.useState(props.todayDate);
  const [rows, setRows] = React.useState<ChartDraft[]>([emptyDraft()]);
  const [saving, setSaving] = React.useState(false);

  const selectedChartIds = rows
    .map((row) => row.selectedChartId)
    .filter((value): value is number => value !== null);

  const canAddRow = rows.length < 4;

  const updateRow = React.useCallback((key: string, updater: (draft: ChartDraft) => ChartDraft) => {
    setRows((prev) => prev.map((row) => (row.key === key ? updater(row) : row)));
  }, []);

  const loadCharts = React.useCallback(
    async (key: string, musicId: number, playStyle: 'SP' | 'DP') => {
      const chartOptions = await appDb.getChartsByMusicAndStyle(musicId, playStyle);
      updateRow(key, (row) => {
        const active = chartOptions.find((item) => item.isActive === 1);
        return {
          ...row,
          chartOptions,
          selectedChartId: active ? active.chartId : null,
        };
      });
    },
    [appDb, updateRow],
  );

  const handleSearch = React.useCallback(
    async (key: string, value: string) => {
      updateRow(key, (row) => ({ ...row, query: value, loading: true }));
      const options = await appDb.searchSongsByPrefix(normalizeSearchText(value.trim()), 30);
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
    setSaving(true);
    try {
      const tournamentUuid = await appDb.createTournament({
        tournamentName: name,
        owner,
        hashtag,
        startDate,
        endDate,
        chartIds: selectedChartIds,
      });
      props.onSaved(tournamentUuid);
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">      <div className="formGrid">
        <label>
          大会名
          <input maxLength={50} value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          開催者
          <input maxLength={50} value={owner} onChange={(event) => setOwner(event.target.value)} />
        </label>
        <label>
          ハッシュタグ
          <input maxLength={50} value={hashtag} onChange={(event) => setHashtag(event.target.value)} />
        </label>
        <label>
          開始日
          <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
        </label>
        <label>
          終了日
          <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        </label>
      </div>

      <section className="chartSelectionSection">
        <div className="rowActions">
          <h2>曲/譜面選択</h2>
          <button
            type="button"
            disabled={!canAddRow}
            onClick={() => {
              if (!canAddRow) {
                return;
              }
              setRows((prev) => [...prev, emptyDraft()]);
            }}
          >
            追加
          </button>
        </div>

        <div className="chartRows">
          {rows.map((row, index) => (
            <article key={row.key} className="chartRowCard">
              <div className="chartRowHeader">
                <strong>選曲 {index + 1}</strong>
                <button
                  type="button"
                  onClick={() => setRows((prev) => prev.filter((item) => item.key !== row.key))}
                  disabled={rows.length === 1}
                >
                  削除
                </button>
              </div>

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
                    if (row.options.length === 0) {
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
                      query: selectedSong?.title ?? current.query,
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
                      label="曲名"
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
                      <Box component="li" key={option.musicId > 0 ? `music-${option.musicId}` : String(optionKey ?? option.title)} {...liProps}>
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

              <div className="radioGroup">
                <span>プレイスタイル</span>
                <label>
                  <input
                    type="radio"
                    checked={row.playStyle === 'SP'}
                    onChange={async () => {
                      updateRow(row.key, (current) => ({ ...current, playStyle: 'SP' }));
                      if (row.selectedSong) {
                        await loadCharts(row.key, row.selectedSong.musicId, 'SP');
                      }
                    }}
                  />
                  SP
                </label>
                <label>
                  <input
                    type="radio"
                    checked={row.playStyle === 'DP'}
                    onChange={async () => {
                      updateRow(row.key, (current) => ({ ...current, playStyle: 'DP' }));
                      if (row.selectedSong) {
                        await loadCharts(row.key, row.selectedSong.musicId, 'DP');
                      }
                    }}
                  />
                  DP
                </label>
              </div>

              <div className="difficultyButtons">
                {row.chartOptions.length === 0 && <span className="hintText">曲とスタイルを選択してください。</span>}
                {row.chartOptions.map((chart) => {
                  const disabled = chart.isActive !== 1;
                  return (
                    <button
                      key={chart.chartId}
                      type="button"
                      disabled={disabled}
                      className={row.selectedChartId === chart.chartId ? 'active' : ''}
                      onClick={() => {
                        updateRow(row.key, (current) => ({ ...current, selectedChartId: chart.chartId }));
                      }}
                    >
                      {chart.difficulty} Lv{chart.level}
                    </button>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="rowActions">`r`n        <button onClick={saveTournament} disabled={saving}>
          保存
        </button>
      </div>
    </div>
  );
}
