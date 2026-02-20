import React from 'react';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Menu,
  MenuItem,
} from '@mui/material';
import { sha256Hex } from '@iidx/shared';
import type { TournamentDetailChart, TournamentDetailItem } from '@iidx/db';

import { useAppServices } from '../services/context';
import { difficultyColor } from '../utils/iidx';
import { reencodeImageToJpeg, toSafeArrayBuffer } from '../utils/image';

interface SubmitEvidencePageProps {
  detail: TournamentDetailItem;
  chart: TournamentDetailChart;
  onSaved: () => Promise<void> | void;
}

enum SubmitState {
  NOT_SUBMITTED = 'NOT_SUBMITTED',
  READY = 'READY',
  PROCESSING = 'PROCESSING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}

type PreviewImageSource = 'existing' | 'selected';

interface PreviewImageState {
  url: string;
  blob: Blob;
  source: PreviewImageSource;
}

function formatSubmittedAt(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function resolveFailureReason(error: unknown): string {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return '容量不足';
  }
  return '保存に失敗しました';
}

export function SubmitEvidencePage(props: SubmitEvidencePageProps): JSX.Element {
  const { appDb, opfs } = useAppServices();
  const [submitState, setSubmitState] = React.useState<SubmitState>(SubmitState.NOT_SUBMITTED);
  const [previewImage, setPreviewImage] = React.useState<PreviewImageState | null>(null);
  const [hasSubmittedEvidence, setHasSubmittedEvidence] = React.useState(false);
  const [submittedAt, setSubmittedAt] = React.useState<string | null>(null);
  const [errorReason, setErrorReason] = React.useState<string | null>(null);
  const [menuAnchorEl, setMenuAnchorEl] = React.useState<HTMLElement | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [deleteBusy, setDeleteBusy] = React.useState(false);
  const cameraInputRef = React.useRef<HTMLInputElement | null>(null);
  const galleryInputRef = React.useRef<HTMLInputElement | null>(null);
  const previewUrlRef = React.useRef<string | null>(null);
  const manualSelectionRef = React.useRef(false);

  const closeMenu = React.useCallback(() => {
    setMenuAnchorEl(null);
  }, []);

  const revokePreviewUrl = React.useCallback(() => {
    if (!previewUrlRef.current) {
      return;
    }
    URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
  }, []);

  const clearPreview = React.useCallback(() => {
    revokePreviewUrl();
    setPreviewImage(null);
  }, [revokePreviewUrl]);

  const setPreviewFromBlob = React.useCallback(
    (blob: Blob, source: PreviewImageSource) => {
      revokePreviewUrl();
      const url = URL.createObjectURL(blob);
      previewUrlRef.current = url;
      setPreviewImage({ url, blob, source });
    },
    [revokePreviewUrl],
  );

  const applyPickedFile = React.useCallback(
    (file: File) => {
      manualSelectionRef.current = true;
      setErrorReason(null);
      setSubmitState(SubmitState.READY);
      setPreviewFromBlob(file, 'selected');
    },
    [setPreviewFromBlob],
  );

  const onSelectFile = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = '';
      if (!file) {
        return;
      }
      applyPickedFile(file);
    },
    [applyPickedFile],
  );

  const openCameraPicker = React.useCallback(() => {
    cameraInputRef.current?.click();
  }, []);

  const openGalleryPicker = React.useCallback(() => {
    galleryInputRef.current?.click();
  }, []);

  React.useEffect(() => {
    clearPreview();
    closeMenu();
    setDeleteDialogOpen(false);
    setDeleteBusy(false);
    setErrorReason(null);
    setHasSubmittedEvidence(false);
    setSubmittedAt(null);
    setSubmitState(SubmitState.NOT_SUBMITTED);
    manualSelectionRef.current = false;

    let cancelled = false;

    const loadExisting = async () => {
      const evidence = await appDb.getEvidenceRecord(props.detail.tournamentUuid, props.chart.chartId);
      if (cancelled || !evidence || evidence.fileDeleted) {
        return;
      }

      setHasSubmittedEvidence(true);
      setSubmittedAt(evidence.updatedAt);

      const relativePath = await appDb.getEvidenceRelativePath(props.detail.tournamentUuid, props.chart.chartId);
      const bytes = await opfs.readFile(relativePath);
      if (cancelled || manualSelectionRef.current) {
        return;
      }
      const blob = new Blob([toSafeArrayBuffer(bytes)], { type: 'image/jpeg' });
      setPreviewFromBlob(blob, 'existing');
      setSubmitState(SubmitState.READY);
    };

    void loadExisting().catch(() => {
      if (cancelled) {
        return;
      }
      setSubmitState(SubmitState.NOT_SUBMITTED);
    });

    return () => {
      cancelled = true;
    };
  }, [appDb, clearPreview, closeMenu, opfs, props.chart.chartId, props.detail.tournamentUuid, setPreviewFromBlob]);

  React.useEffect(
    () => () => {
      revokePreviewUrl();
    },
    [revokePreviewUrl],
  );

  const submit = async () => {
    if (submitState === SubmitState.PROCESSING || deleteBusy) {
      return;
    }

    setSubmitState(SubmitState.PROCESSING);
    setErrorReason(null);
    try {
      let sourceBlob = previewImage?.blob ?? null;
      if (!sourceBlob && hasSubmittedEvidence) {
        const relativePath = await appDb.getEvidenceRelativePath(props.detail.tournamentUuid, props.chart.chartId);
        const bytes = await opfs.readFile(relativePath);
        sourceBlob = new Blob([toSafeArrayBuffer(bytes)], { type: 'image/jpeg' });
      }
      if (!sourceBlob) {
        throw new Error('evidence image not found');
      }

      const encoded = await reencodeImageToJpeg(sourceBlob);
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

      const savedRecord = await appDb.getEvidenceRecord(props.detail.tournamentUuid, props.chart.chartId);
      const savedAt = savedRecord?.updatedAt ?? new Date().toISOString();

      setHasSubmittedEvidence(true);
      setSubmittedAt(savedAt);
      setPreviewFromBlob(encoded.blob, 'existing');
      setSubmitState(SubmitState.SUCCESS);

      await Promise.resolve(props.onSaved());
    } catch (error) {
      setSubmitState(SubmitState.ERROR);
      setErrorReason(resolveFailureReason(error));
    }
  };

  const confirmDelete = async () => {
    if (deleteBusy || submitState === SubmitState.PROCESSING) {
      return;
    }

    setDeleteBusy(true);
    setErrorReason(null);
    try {
      await appDb.deleteEvidence(props.detail.tournamentUuid, props.chart.chartId);
      clearPreview();
      setHasSubmittedEvidence(false);
      setSubmittedAt(null);
      setSubmitState(SubmitState.NOT_SUBMITTED);
      setDeleteDialogOpen(false);
      closeMenu();
      await Promise.resolve(props.onSaved());
    } catch {
      setSubmitState(SubmitState.ERROR);
      setErrorReason('削除に失敗しました');
    } finally {
      setDeleteBusy(false);
    }
  };

  const formattedSubmittedAt = formatSubmittedAt(submittedAt);
  const isProcessing = submitState === SubmitState.PROCESSING;
  const hasImage = previewImage !== null;
  const primaryLabel = isProcessing ? '提出処理中' : hasSubmittedEvidence ? '更新する' : '保存する';
  const primaryDisabled = isProcessing || deleteBusy || (!hasSubmittedEvidence && !hasImage);

  const statusBadge = (() => {
    if (submitState === SubmitState.PROCESSING) {
      return { tone: 'processing', label: '提出処理中' };
    }
    if (submitState === SubmitState.ERROR) {
      return { tone: 'error', label: '提出失敗' };
    }
    if (hasSubmittedEvidence) {
      return {
        tone: 'submitted',
        label: formattedSubmittedAt ? `提出済み ${formattedSubmittedAt}` : '提出済み',
      };
    }
    return { tone: 'idle', label: '未提出' };
  })();

  return (
    <div className="page submitEvidencePage">
      <section className="detailCard submitOverviewCard">
        <div className="submitOverviewTop">
          <div className="submitOverviewMain">
            <h2>{props.detail.tournamentName}</h2>
            <p className="submitChartMeta">
              {props.chart.playStyle} {props.chart.difficulty}
            </p>
            <h3>{props.chart.title}</h3>
            <p style={{ color: difficultyColor(props.chart.difficulty) }}>Lv{props.chart.level}</p>
          </div>
          <div className="submitOverviewSide">
            <span className={`submitStateBadge submitStateBadge-${statusBadge.tone}`}>{statusBadge.label}</span>
            {hasSubmittedEvidence ? (
              <IconButton
                aria-label="提出画像の操作"
                size="small"
                onClick={(event) => {
                  setMenuAnchorEl(event.currentTarget);
                }}
                disabled={isProcessing || deleteBusy}
              >
                <MoreVertIcon fontSize="small" />
              </IconButton>
            ) : null}
          </div>
        </div>
      </section>

      <section className="detailCard submitStepCard">
        <h3 className="submitStepTitle">Step 1) 画像を選ぶ</h3>
        <div
          className={`submitPickerArea ${isProcessing || deleteBusy ? 'disabled' : ''}`}
          role="button"
          tabIndex={isProcessing || deleteBusy ? -1 : 0}
          aria-disabled={isProcessing || deleteBusy}
          onClick={() => {
            if (isProcessing || deleteBusy) {
              return;
            }
            openGalleryPicker();
          }}
          onKeyDown={(event) => {
            if (isProcessing || deleteBusy) {
              return;
            }
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              openGalleryPicker();
            }
          }}
        >
          タップして画像を選ぶ
        </div>
        <div className="submitPickerActions">
          <button
            type="button"
            onClick={openCameraPicker}
            disabled={isProcessing || deleteBusy}
            className="submitSecondaryButton"
          >
            カメラで撮る
          </button>
          <button
            type="button"
            onClick={openGalleryPicker}
            disabled={isProcessing || deleteBusy}
            className="submitSecondaryButton"
          >
            ギャラリーから選ぶ
          </button>
        </div>

        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onSelectFile}
          className="submitHiddenInput"
          disabled={isProcessing || deleteBusy}
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          onChange={onSelectFile}
          className="submitHiddenInput"
          disabled={isProcessing || deleteBusy}
        />
      </section>

      {previewImage ? (
        <section className="detailCard submitStepCard">
          <h3 className="submitStepTitle">Step 2) 画像を確認</h3>
          <div className="submitPreviewFrame">
            <img src={previewImage.url} alt="提出画像プレビュー" className="submitPreviewImage" />
          </div>
          {hasSubmittedEvidence && formattedSubmittedAt ? (
            <p className="submitUpdatedAt">最終更新: {formattedSubmittedAt}</p>
          ) : null}
          <div className="submitPreviewActions">
            <button
              type="button"
              onClick={openGalleryPicker}
              disabled={isProcessing || deleteBusy}
              className="submitSecondaryButton"
            >
              選び直す
            </button>
          </div>
        </section>
      ) : null}

      <section className="detailCard submitNoticeCard">
        <p>画像はこの端末の中だけに保存されます</p>
        <p>他の人に画像は送られません</p>
      </section>

      <footer className="submitActionBar">
        <button type="button" className="primaryActionButton submitPrimaryButton" onClick={submit} disabled={primaryDisabled}>
          <span className={`submitProcessingDot ${isProcessing ? 'active' : ''}`} aria-hidden />
          {primaryLabel}
        </button>
        {!hasSubmittedEvidence && !hasImage ? <p className="submitActionHint">画像を選ぶと提出できます</p> : null}
        {submitState === SubmitState.ERROR && errorReason ? (
          <p className="submitActionError">
            提出に失敗しました
            <span>{errorReason}</span>
          </p>
        ) : null}
      </footer>

      {isProcessing ? (
        <div className="submitScreenLock" role="status" aria-live="polite">
          提出処理中
        </div>
      ) : null}

      <Menu anchorEl={menuAnchorEl} open={menuAnchorEl !== null} onClose={closeMenu}>
        <MenuItem
          disabled={isProcessing || deleteBusy}
          onClick={() => {
            setDeleteDialogOpen(true);
            closeMenu();
          }}
        >
          削除
        </MenuItem>
      </Menu>

      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>提出画像を削除しますか？</DialogTitle>
        <DialogContent>
          <DialogContentText>削除すると元に戻せません。</DialogContentText>
        </DialogContent>
        <DialogActions>
          <button
            type="button"
            onClick={() => {
              if (deleteBusy) {
                return;
              }
              setDeleteDialogOpen(false);
            }}
            disabled={deleteBusy}
          >
            キャンセル
          </button>
          <button type="button" onClick={() => void confirmDelete()} disabled={deleteBusy}>
            削除する
          </button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
