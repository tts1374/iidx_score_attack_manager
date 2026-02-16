import React from 'react';
import type { ChartSummary, SongSummary } from '@iidx/db';
import { normalizeSearchText } from '@iidx/shared';

import { useAppServices } from '../services/context';

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
      if (!value.trim()) {
        updateRow(key, (row) => ({
          ...row,
          options: [],
          selectedSong: null,
          chartOptions: [],
          selectedChartId: null,
          loading: false,
        }));
        return;
      }

      const options = await appDb.searchSongsByPrefix(normalizeSearchText(value.trim()), 30);
      updateRow(key, (row) => ({
        ...row,
        options,
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
    <div className="page">
      <header className="pageHeader">
        <h1>大会作成</h1>
      </header>

      <div className="formGrid">
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

              <label>
                曲名検索
                <input
                  placeholder="曲名を入力"
                  value={row.query}
                  onChange={(event) => {
                    void handleSearch(row.key, event.target.value);
                  }}
                />
              </label>
              {row.loading ? <p className="hintText">検索中...</p> : null}
              <label>
                曲選択
                <select
                  value={row.selectedSong?.musicId ?? ''}
                  onChange={async (event) => {
                    const musicId = Number(event.target.value);
                    const selectedSong = row.options.find((option) => option.musicId === musicId) ?? null;
                    updateRow(row.key, (current) => ({
                      ...current,
                      selectedSong,
                      chartOptions: [],
                      selectedChartId: null,
                    }));
                    if (selectedSong) {
                      await loadCharts(row.key, selectedSong.musicId, row.playStyle);
                    }
                  }}
                >
                  <option value="">選択してください</option>
                  {row.options.map((option) => (
                    <option key={option.musicId} value={option.musicId}>
                      [{String(option.version)}] {option.title}
                    </option>
                  ))}
                </select>
              </label>

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

      <div className="rowActions">
        <button onClick={props.onCancel}>戻る</button>
        <button onClick={saveTournament} disabled={saving}>
          保存
        </button>
      </div>
    </div>
  );
}
