import React from 'react';

import { difficultyColor } from '../utils/iidx';
import {
  CREATE_TOURNAMENT_CONFIRM_NOTICES,
  MAX_CHART_ROWS,
  normalizeHashtagForDisplay,
  resolveCreateTournamentValidation,
  resolveSelectedChartOption,
  type CreateTournamentDraft,
} from './create-tournament-draft';

interface CreateTournamentConfirmPageProps {
  draft: CreateTournamentDraft;
  saving: boolean;
  errorMessage: string | null;
  onBack: () => void;
  onConfirmCreate: () => Promise<void>;
}

function difficultyBadgeStyle(difficulty: string): React.CSSProperties {
  const color = difficultyColor(difficulty);
  return {
    borderColor: color,
    backgroundColor: color,
    color: '#ffffff',
  };
}

export function CreateTournamentConfirmPage(props: CreateTournamentConfirmPageProps): JSX.Element {
  const validation = React.useMemo(() => resolveCreateTournamentValidation(props.draft), [props.draft]);
  const displayHashtag = normalizeHashtagForDisplay(props.draft.hashtag);
  const canConfirm = !props.saving && validation.canProceed;

  return (
    <div className="page createTournamentConfirmPage">
      <section className="createSection">
        <h2 className="createSectionTitle">① 大会基本情報</h2>
        <article className="chartRowCard createConfirmInfoCard">
          <dl className="createConfirmInfoList">
            <div className="createConfirmInfoItem">
              <dt>大会名</dt>
              <dd>{props.draft.name.trim() || '-'}</dd>
            </div>
            <div className="createConfirmInfoItem">
              <dt>開催者</dt>
              <dd>{props.draft.owner.trim() || '-'}</dd>
            </div>
            <div className="createConfirmInfoItem">
              <dt>ハッシュタグ</dt>
              <dd>{displayHashtag || '-'}</dd>
            </div>
            <div className="createConfirmInfoItem">
              <dt>期間</dt>
              <dd>
                {props.draft.startDate} ～ {props.draft.endDate}
              </dd>
            </div>
          </dl>
        </article>
      </section>

      <section className="createSection">
        <h2 className="createSectionTitle">
          ② 対象譜面 ({props.draft.rows.length} / {MAX_CHART_ROWS})
        </h2>
        <div className="chartRows">
          {props.draft.rows.map((row, index) => {
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
                    <span className="createConfirmDifficulty" style={difficultyBadgeStyle(selectedChart.difficulty)}>
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

      <section className="createSection">
        <h2 className="createSectionTitle">③ 注意事項</h2>
        <article className="chartRowCard createConfirmNoteCard">
          {CREATE_TOURNAMENT_CONFIRM_NOTICES.map((notice) => (
            <p key={notice} className="hintText">
              {notice}
            </p>
          ))}
        </article>
      </section>

      <footer className="createStickyFooter createConfirmStickyFooter">
        {props.errorMessage ? <p className="errorText createInlineError">{props.errorMessage}</p> : null}
        <div className="createConfirmActions">
          <button type="button" onClick={props.onBack} disabled={props.saving}>
            戻る
          </button>
          <button
            type="button"
            className="primaryActionButton"
            disabled={!canConfirm}
            onClick={() => {
              void props.onConfirmCreate();
            }}
          >
            {props.saving ? '作成中...' : '作成確定'}
          </button>
        </div>
      </footer>
    </div>
  );
}
