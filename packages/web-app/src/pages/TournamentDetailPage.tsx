import React from 'react';
import { PAYLOAD_VERSION, encodeTournamentPayload } from '@iidx/shared';
import type { TournamentDetailItem } from '@iidx/db';
import QRCode from 'qrcode';

import { buildImportUrl } from '../utils/payload-url';
import { difficultyColor } from '../utils/iidx';

interface TournamentDetailPageProps {
  detail: TournamentDetailItem;
  onBack: () => void;
  onOpenSubmit: (chartId: number) => void;
  onDelete: () => Promise<void>;
}

export function TournamentDetailPage(props: TournamentDetailPageProps): JSX.Element {
  const [showQr, setShowQr] = React.useState(false);
  const [qrDataUrl, setQrDataUrl] = React.useState<string | null>(null);

  const payload = React.useMemo(() => {
    const charts = props.detail.charts.map((chart) => chart.chartId);
    return encodeTournamentPayload({
      v: PAYLOAD_VERSION,
      uuid: props.detail.sourceTournamentUuid ?? props.detail.tournamentUuid,
      name: props.detail.tournamentName,
      owner: props.detail.owner,
      hashtag: props.detail.hashtag,
      start: props.detail.startDate,
      end: props.detail.endDate,
      charts,
    });
  }, [props.detail]);

  const shareUrl = React.useMemo(() => buildImportUrl(payload), [payload]);

  React.useEffect(() => {
    if (!showQr) {
      return;
    }
    let cancelled = false;
    void QRCode.toDataURL(shareUrl, {
      margin: 1,
      width: 240,
      errorCorrectionLevel: 'M',
    }).then((dataUrl: string) => {
      if (!cancelled) {
        setQrDataUrl(dataUrl);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [shareUrl, showQr]);

  const exportFile = () => {
    const blob = new Blob([payload], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${props.detail.tournamentName}.tournament.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page">
      <header className="pageHeader">
        <h1>大会詳細</h1>
      </header>

      <section className="detailCard">
        <h2>{props.detail.tournamentName}</h2>
        <p>{props.detail.owner}</p>
        <p>
          {props.detail.startDate}〜{props.detail.endDate}
        </p>
        <p>#{props.detail.hashtag}</p>

        <div className="rowActions">
          <button onClick={() => setShowQr((prev) => !prev)}>{showQr ? 'QRを閉じる' : 'QR表示'}</button>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(shareUrl);
                alert('URLをコピーしました。');
              } catch {
                alert('クリップボードにコピーできませんでした。');
              }
            }}
          >
            URLコピー
          </button>
          <button onClick={exportFile}>ファイル書き出し</button>
          <button
            onClick={async () => {
              if (!window.confirm('大会を削除しますか？')) {
                return;
              }
              await props.onDelete();
            }}
          >
            削除
          </button>
        </div>

        {showQr && qrDataUrl ? <img className="qrPreview" src={qrDataUrl} alt="QRコード" /> : null}
      </section>

      <section>
        <h2>譜面一覧</h2>
        <ul className="chartList">
          {props.detail.charts.map((chart) => (
            <li key={chart.chartId}>
              <button className="chartListItem" onClick={() => props.onOpenSubmit(chart.chartId)}>
                <span className={`statusCircle ${chart.submitted ? 'done' : 'pending'}`} />
                <div className="chartText">
                  <strong>{chart.title}</strong>
                  <span style={{ color: difficultyColor(chart.difficulty) }}>
                    {chart.playStyle} {chart.difficulty} Lv{chart.level}
                  </span>
                </div>
                <span>{chart.submitted ? '登録済' : '未登録'}</span>
                <span className="arrow">›</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <div className="rowActions">
        <button onClick={props.onBack}>戻る</button>
      </div>
    </div>
  );
}

