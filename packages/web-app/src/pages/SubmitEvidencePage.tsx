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
import { useTranslation } from 'react-i18next';

import { useAppServices } from '../services/context';
import { difficultyColor } from '../utils/iidx';
import { reencodeImageToJpeg, toSafeArrayBuffer } from '../utils/image';

interface SubmitEvidencePageProps {
  detail: TournamentDetailItem;
  chart: TournamentDetailChart;
  onSaved: (reason: 'submit' | 'delete') => Promise<void> | void;
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

type SubmitEvidenceErrorKey =
  | 'submit_evidence.error.quota_exceeded'
  | 'submit_evidence.error.save_failed'
  | 'submit_evidence.error.delete_failed';

function resolveLanguageTag(language: string): string {
  if (language.startsWith('en')) {
    return 'en-US';
  }
  if (language.startsWith('ko')) {
    return 'ko-KR';
  }
  return 'ja-JP';
}

function formatSubmittedAt(value: string | null, languageTag: string): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat(languageTag, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function resolveFailureReasonKey(error: unknown): SubmitEvidenceErrorKey {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return 'submit_evidence.error.quota_exceeded';
  }
  return 'submit_evidence.error.save_failed';
}

export function SubmitEvidencePage(props: SubmitEvidencePageProps): JSX.Element {
  const { t, i18n } = useTranslation();
  const { appDb, opfs } = useAppServices();
  const [submitState, setSubmitState] = React.useState<SubmitState>(SubmitState.NOT_SUBMITTED);
  const [previewImage, setPreviewImage] = React.useState<PreviewImageState | null>(null);
  const [hasSubmittedEvidence, setHasSubmittedEvidence] = React.useState(false);
  const [submittedAt, setSubmittedAt] = React.useState<string | null>(null);
  const [errorReasonKey, setErrorReasonKey] = React.useState<SubmitEvidenceErrorKey | null>(null);
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
      setErrorReasonKey(null);
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
    setErrorReasonKey(null);
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
    setErrorReasonKey(null);
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

      await Promise.resolve(props.onSaved('submit'));
    } catch (error) {
      setSubmitState(SubmitState.ERROR);
      setErrorReasonKey(resolveFailureReasonKey(error));
    }
  };

  const confirmDelete = async () => {
    if (deleteBusy || submitState === SubmitState.PROCESSING) {
      return;
    }

    setDeleteBusy(true);
    setErrorReasonKey(null);
    try {
      await appDb.deleteEvidence(props.detail.tournamentUuid, props.chart.chartId);
      clearPreview();
      setHasSubmittedEvidence(false);
      setSubmittedAt(null);
      setSubmitState(SubmitState.NOT_SUBMITTED);
      setDeleteDialogOpen(false);
      closeMenu();
      await Promise.resolve(props.onSaved('delete'));
    } catch {
      setSubmitState(SubmitState.ERROR);
      setErrorReasonKey('submit_evidence.error.delete_failed');
    } finally {
      setDeleteBusy(false);
    }
  };

  const languageTag = React.useMemo(
    () => resolveLanguageTag(i18n.resolvedLanguage ?? i18n.language ?? 'ja'),
    [i18n.language, i18n.resolvedLanguage],
  );
  const formattedSubmittedAt = formatSubmittedAt(submittedAt, languageTag);
  const isProcessing = submitState === SubmitState.PROCESSING;
  const hasImage = previewImage !== null;
  const primaryLabel = isProcessing
    ? t('submit_evidence.action.processing')
    : hasSubmittedEvidence
      ? t('submit_evidence.action.update')
      : t('submit_evidence.action.save');
  const primaryDisabled = isProcessing || deleteBusy || (!hasSubmittedEvidence && !hasImage);

  const statusBadge = (() => {
    if (submitState === SubmitState.PROCESSING) {
      return { tone: 'processing', label: t('submit_evidence.status.processing') };
    }
    if (submitState === SubmitState.ERROR) {
      return { tone: 'error', label: t('submit_evidence.status.failed') };
    }
    if (hasSubmittedEvidence) {
      return {
        tone: 'submitted',
        label: formattedSubmittedAt
          ? t('submit_evidence.status.submitted_with_date', { date: formattedSubmittedAt })
          : t('submit_evidence.status.submitted'),
      };
    }
    return { tone: 'idle', label: t('submit_evidence.status.not_submitted') };
  })() as { tone: 'processing' | 'error' | 'submitted' | 'idle'; label: string };

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
            <p style={{ color: difficultyColor(props.chart.difficulty) }}>{t('submit_evidence.chart.level', { level: props.chart.level })}</p>
          </div>
          <div className="submitOverviewSide">
            <span className={`submitStateBadge submitStateBadge-${statusBadge.tone}`}>{statusBadge.label}</span>
            {hasSubmittedEvidence ? (
              <IconButton
                aria-label={t('submit_evidence.menu.actions_aria')}
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
        <h3 className="submitStepTitle">{t('submit_evidence.step.select_image')}</h3>
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
          {t('submit_evidence.images.action.tap_to_select')}
        </div>
        <div className="submitPickerActions">
          <button
            type="button"
            onClick={openCameraPicker}
            disabled={isProcessing || deleteBusy}
            className="submitSecondaryButton"
          >
            {t('submit_evidence.images.action.take_photo')}
          </button>
          <button
            type="button"
            onClick={openGalleryPicker}
            disabled={isProcessing || deleteBusy}
            className="submitSecondaryButton"
          >
            {t('submit_evidence.images.action.pick_from_gallery')}
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
          <h3 className="submitStepTitle">{t('submit_evidence.step.review_image')}</h3>
          <div className="submitPreviewFrame">
            <img src={previewImage.url} alt={t('submit_evidence.images.preview_alt')} className="submitPreviewImage" />
          </div>
          {hasSubmittedEvidence && formattedSubmittedAt ? (
            <p className="submitUpdatedAt">{t('submit_evidence.images.updated_at', { date: formattedSubmittedAt })}</p>
          ) : null}
          <div className="submitPreviewActions">
            <button
              type="button"
              onClick={openGalleryPicker}
              disabled={isProcessing || deleteBusy}
              className="submitSecondaryButton"
            >
              {t('submit_evidence.images.action.reselect')}
            </button>
          </div>
        </section>
      ) : null}

      <section className="detailCard submitNoticeCard">
        <p>{t('submit_evidence.note.local_only')}</p>
        <p>{t('submit_evidence.note.not_sent')}</p>
      </section>

      <footer className="submitActionBar">
        <button type="button" className="primaryActionButton submitPrimaryButton" onClick={submit} disabled={primaryDisabled}>
          <span className={`submitProcessingDot ${isProcessing ? 'active' : ''}`} aria-hidden />
          {primaryLabel}
        </button>
        {!hasSubmittedEvidence && !hasImage ? <p className="submitActionHint">{t('submit_evidence.hint.select_to_submit')}</p> : null}
        {submitState === SubmitState.ERROR && errorReasonKey ? (
          <p className="submitActionError">
            {t('submit_evidence.error.submit_failed')}
            <span>{t(errorReasonKey)}</span>
          </p>
        ) : null}
      </footer>

      {isProcessing ? (
        <div className="submitScreenLock" role="status" aria-live="polite">
          {t('submit_evidence.status.processing')}
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
          {t('common.delete')}
        </MenuItem>
      </Menu>

      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>{t('submit_evidence.delete_dialog.title')}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t('submit_evidence.delete_dialog.description')}</DialogContentText>
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
            {t('common.cancel')}
          </button>
          <button type="button" onClick={() => void confirmDelete()} disabled={deleteBusy}>
            {t('submit_evidence.delete_dialog.confirm')}
          </button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
