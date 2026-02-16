import React from 'react';
import { getTournamentStatus, sha256Hex } from '@iidx/shared';
import type { TournamentDetailChart, TournamentDetailItem } from '@iidx/db';

import { useAppServices } from '../services/context';
import { difficultyColor } from '../utils/iidx';
import { reencodeImageToJpeg, toSafeArrayBuffer } from '../utils/image';

interface SubmitEvidencePageProps {
  detail: TournamentDetailItem;
  chart: TournamentDetailChart;
  todayDate: string;
  onBack: () => void;
  onSaved: () => void;
}

export function SubmitEvidencePage(props: SubmitEvidencePageProps): JSX.Element {
  const { appDb, opfs } = useAppServices();
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const status = getTournamentStatus(props.detail.startDate, props.detail.endDate, props.todayDate);
  const canSubmit = status === 'active';

  React.useEffect(() => {
    let revokedUrl: string | null = null;
    let cancelled = false;

    const loadExisting = async () => {
      const evidence = await appDb.getEvidenceRecord(props.detail.tournamentUuid, props.chart.chartId);
      if (!evidence || evidence.fileDeleted) {
        return;
      }
      const relativePath = await appDb.getEvidenceRelativePath(props.detail.tournamentUuid, props.chart.chartId);
      const bytes = await opfs.readFile(relativePath);
      const blob = new Blob([toSafeArrayBuffer(bytes)], { type: 'image/jpeg' });
      const url = URL.createObjectURL(blob);
      if (cancelled) {
        URL.revokeObjectURL(url);
        return;
      }
      revokedUrl = url;
      setPreviewUrl(url);
    };

    void loadExisting().catch(() => {
      // ignore preview load failures
    });

    return () => {
      cancelled = true;
      if (revokedUrl) {
        URL.revokeObjectURL(revokedUrl);
      }
    };
  }, [appDb, opfs, props.chart.chartId, props.detail.tournamentUuid]);

  const submit = async () => {
    if (!selectedFile) {
      return;
    }

    setBusy(true);
    try {
      const encoded = await reencodeImageToJpeg(selectedFile);
      const hash = sha256Hex(encoded.bytes);
      const relativePath = await appDb.getEvidenceRelativePath(props.detail.tournamentUuid, props.chart.chartId);
      await opfs.writeFileAtomic(relativePath, encoded.bytes, {
        validate: async (bytes) => {
          const blob = new Blob([toSafeArrayBuffer(bytes)], { type: 'image/jpeg' });
          const bitmap = await createImageBitmap(blob);
          bitmap.close();
        },
      });

      await appDb.upsertEvidenceMetadata({
        tournamentUuid: props.detail.tournamentUuid,
        chartId: props.chart.chartId,
        sha256: hash,
        width: encoded.width,
        height: encoded.height,
      });

      props.onSaved();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        alert('容量不足のため保存できません。設定画面から終了大会画像削除を実行してください。');
      } else {
        alert(error instanceof Error ? error.message : String(error));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">      <h2>{props.detail.tournamentName}</h2>

      <section className="detailCard">
        <span className="chip">{props.chart.playStyle} {props.chart.difficulty}</span>
        <h3>{props.chart.title}</h3>
        <p style={{ color: difficultyColor(props.chart.difficulty) }}>Lv{props.chart.level}</p>

        {canSubmit ? (
          <p className="successText">提出可能です</p>
        ) : (
          <p className="errorText">期間外のため提出できません</p>
        )}
      </section>

      <section className="detailCard">
        {previewUrl ? <img src={previewUrl} alt="選択中" className="evidencePreview" /> : <p>画像未選択</p>}
      </section>

      <section className="detailCard">
        <label className="fileButton">
          ギャラリーから選択
          <input
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) {
                return;
              }
              setSelectedFile(file);
              const url = URL.createObjectURL(file);
              setPreviewUrl((previous) => {
                if (previous) {
                  URL.revokeObjectURL(previous);
                }
                return url;
              });
            }}
          />
        </label>
      </section>    </div>
  );
}

