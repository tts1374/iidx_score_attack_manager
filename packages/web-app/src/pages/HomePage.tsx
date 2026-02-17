import React from 'react';
import type { TournamentListItem, TournamentTab } from '@iidx/db';

import { resolveTournamentCardStatus } from '../utils/tournament-status';

interface HomePageProps {
  todayDate: string;
  tab: TournamentTab;
  items: TournamentListItem[];
  onTabChange: (tab: TournamentTab) => void;
  onOpenDetail: (tournamentUuid: string) => void;
}

export function HomePage(props: HomePageProps): JSX.Element {
  return (
    <div className="page tournamentListPage">
      <section className="tabRow" role="tablist" aria-label="tournament-tabs">
        <button
          className={props.tab === 'active' ? 'active' : ''}
          role="tab"
          aria-selected={props.tab === 'active'}
          onClick={() => props.onTabChange('active')}
        >
          開催中
        </button>
        <button
          className={props.tab === 'upcoming' ? 'active' : ''}
          role="tab"
          aria-selected={props.tab === 'upcoming'}
          onClick={() => props.onTabChange('upcoming')}
        >
          開催前
        </button>
        <button
          className={props.tab === 'ended' ? 'active' : ''}
          role="tab"
          aria-selected={props.tab === 'ended'}
          onClick={() => props.onTabChange('ended')}
        >
          終了
        </button>
      </section>

      {props.items.length === 0 ? (
        <p className="emptyText">表示できる大会がありません。</p>
      ) : (
        <ul className="cardList">
          {props.items.map((item, index) => {
            const statusInfo = resolveTournamentCardStatus(item.startDate, item.endDate, props.todayDate);
            const hasPendingHighlight = statusInfo.status !== 'ended' && item.pendingCount > 0;
            const progress = item.chartCount > 0 ? Math.round((item.submittedCount / item.chartCount) * 100) : 0;
            const listKey = `${item.tournamentUuid || 'tournament'}-${index}`;

            return (
              <li key={listKey}>
                <button
                  className={`tournamentCard ${hasPendingHighlight ? 'tournamentCardPending' : ''}`}
                  onClick={() => props.onOpenDetail(item.tournamentUuid)}
                >
                  <div className="tournamentCardHeader">
                    <h3>{item.tournamentName}</h3>
                    <span className={`statusBadge statusBadge-${statusInfo.status}`}>
                      {statusInfo.label}
                    </span>
                  </div>
                  <div className="tournamentMeta">
                    <div className="ownerLine">{item.owner}</div>
                    <div className="periodLine">
                      {item.startDate} 〜 {item.endDate}
                    </div>
                  </div>
                  <div className="progressLine">
                    提出 {item.submittedCount} / {item.chartCount}
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

