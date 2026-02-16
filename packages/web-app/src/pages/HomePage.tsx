import React from 'react';
import { daysUntilStart, getTournamentStatus, remainingDaysUntilEnd } from '@iidx/shared';
import type { TournamentListItem, TournamentTab } from '@iidx/db';

import { statusLabel } from '../utils/iidx';

interface HomePageProps {
  todayDate: string;
  tab: TournamentTab;
  items: TournamentListItem[];
  songMasterReady: boolean;
  songMasterMessage: string | null;
  busy: boolean;
  onTabChange: (tab: TournamentTab) => void;
  onOpenCreate: () => void;
  onOpenSettings: () => void;
  onOpenDetail: (tournamentUuid: string) => void;
  onImportPayload: (text: string) => Promise<void>;
  onImportFile: (file: File) => Promise<void>;
  onRefreshSongMaster: () => Promise<void>;
}

function remainingTone(remainingDays: number): { borderColor: string; badgeColor: string } {
  if (remainingDays <= 0) {
    return { borderColor: '#dc2626', badgeColor: '#fecaca' };
  }
  if (remainingDays <= 3) {
    return { borderColor: '#f59e0b', badgeColor: '#fde68a' };
  }
  if (remainingDays <= 7) {
    return { borderColor: '#3b82f6', badgeColor: '#bfdbfe' };
  }
  return { borderColor: '#94a3b8', badgeColor: '#e2e8f0' };
}

function statusChipStyle(status: 'active' | 'upcoming' | 'ended'): React.CSSProperties {
  if (status === 'active') {
    return { backgroundColor: '#d1fae5', color: '#065f46' };
  }
  if (status === 'upcoming') {
    return { backgroundColor: '#dbeafe', color: '#1d4ed8' };
  }
  return { backgroundColor: '#e5e7eb', color: '#4b5563' };
}

export function HomePage(props: HomePageProps): JSX.Element {
  const [importText, setImportText] = React.useState('');

  const importDisabled = !props.songMasterReady || props.busy;

  return (
    <div className="page">
      <header className="pageHeader">
        <h1>大会一覧</h1>
        <div className="actions">
          <button disabled={!props.songMasterReady} onClick={props.onOpenCreate}>
            大会作成
          </button>
          <button onClick={props.onOpenSettings}>設定</button>
        </div>
      </header>

      {!props.songMasterReady && (
        <section className="warningBox">
          <p>曲マスタが未取得のため、大会作成/取込は利用できません。</p>
          {props.songMasterMessage && <p>{props.songMasterMessage}</p>}
          <button onClick={props.onRefreshSongMaster} disabled={props.busy}>
            曲マスタ更新を実行
          </button>
        </section>
      )}

      <section className="importBox">
        <h2>大会取込（QR/URL/ファイル）</h2>
        <textarea
          placeholder="URLまたはペイロードを貼り付け"
          value={importText}
          onChange={(event) => setImportText(event.target.value)}
          rows={3}
        />
        <div className="rowActions">
          <button
            disabled={importDisabled || importText.trim().length === 0}
            onClick={async () => {
              await props.onImportPayload(importText);
              setImportText('');
            }}
          >
            テキスト取込
          </button>
          <label className={`fileButton ${importDisabled ? 'disabled' : ''}`}>
            ファイル取込
            <input
              type="file"
              accept="image/*,.txt,.json"
              disabled={importDisabled}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) {
                  return;
                }
                await props.onImportFile(file);
                event.target.value = '';
              }}
            />
          </label>
        </div>
      </section>

      <section className="tabRow" role="tablist" aria-label="tournament-tabs">
        <button className={props.tab === 'active' ? 'active' : ''} onClick={() => props.onTabChange('active')}>
          開催中
        </button>
        <button className={props.tab === 'upcoming' ? 'active' : ''} onClick={() => props.onTabChange('upcoming')}>
          開催前
        </button>
        <button className={props.tab === 'ended' ? 'active' : ''} onClick={() => props.onTabChange('ended')}>
          終了
        </button>
      </section>

      {props.items.length === 0 ? (
        <p className="emptyText">表示できる大会がありません。</p>
      ) : (
        <ul className="cardList">
          {props.items.map((item, index) => {
            const status = getTournamentStatus(item.startDate, item.endDate, props.todayDate);
            const remaining = remainingDaysUntilEnd(item.endDate, props.todayDate);
            const daysToStart = daysUntilStart(item.startDate, props.todayDate);
            const tone = remainingTone(remaining);
            const progress = item.chartCount > 0 ? Math.round((item.submittedCount / item.chartCount) * 100) : 0;
            const listKey = `${item.tournamentUuid || 'tournament'}-${index}`;

            return (
              <li key={listKey}>
                <button
                  className="tournamentCard"
                  style={status === 'active' ? { borderLeftColor: tone.borderColor } : undefined}
                  onClick={() => props.onOpenDetail(item.tournamentUuid)}
                >
                  {status === 'active' && (
                    <span className="remainingBadge" style={{ backgroundColor: tone.badgeColor }}>
                      {statusLabel(status, remaining)}
                    </span>
                  )}

                  <h3>{item.tournamentName}</h3>
                  <div className="subLine">
                    <span>{item.owner}</span>
                    <span className="statusChip" style={statusChipStyle(status)}>
                      {status === 'upcoming' ? statusLabel(status, Math.max(0, daysToStart)) : statusLabel(status)}
                    </span>
                  </div>
                  <div className="periodLine">
                    {item.startDate}〜{item.endDate}
                  </div>
                  <div className="progressLine">
                    <span>
                      提出: {item.submittedCount}/{item.chartCount}
                    </span>
                    {item.pendingCount > 0 ? <span className="pendingDot" title="未提出あり" /> : null}
                  </div>
                  <div className="progressBar" aria-hidden>
                    <span style={{ width: `${progress}%` }} />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

