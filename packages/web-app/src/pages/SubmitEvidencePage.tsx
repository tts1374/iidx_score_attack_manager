import React from 'react';
import { sha256Hex } from '@iidx/shared';
import type { TournamentDetailChart, TournamentDetailItem } from '@iidx/db';
import { useTranslation } from 'react-i18next';

import { ChartCard } from '../components/ChartCard';
import { useAppServices } from '../services/context';
import { reencodeImageToJpeg, toSafeArrayBuffer } from '../utils/image';

interface SubmitEvidencePageProps {
  detail: TournamentDetailItem;
  chart: TournamentDetailChart;
  onSaved: (reason: 'submit' | 'delete') => Promise<void> | void;
}

enum SubmitState {
  IDLE = 'IDLE',
  PROCESSING = 'PROCESSING',
  ERROR = 'ERROR',
}

interface PreviewImageState {
  url: string;
  blob: Blob;
}

type SubmitEvidenceErrorKey =
  | 'submit_evidence.error.quota_exceeded'
  | 'submit_evidence.error.save_failed'
  | 'submit_evidence.error.camera_unavailable';

type SubmitChartShareState = 'unregistered' | 'unshared' | 'shared';

function resolveSubmissionFlags(updateSeq: number, fileDeleted: boolean, needsSend: boolean): { localSaved: boolean; submitted: boolean } {
  const localSaved = updateSeq > 0 && !fileDeleted;
  return {
    localSaved,
    submitted: localSaved && !needsSend,
  };
}

function resolveSubmitChartShareState(localSaved: boolean, submitted: boolean): SubmitChartShareState {
  if (!localSaved) {
    return 'unregistered';
  }
  return submitted ? 'shared' : 'unshared';
}

function resolveFailureReasonKey(error: unknown): SubmitEvidenceErrorKey {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return 'submit_evidence.error.quota_exceeded';
  }
  return 'submit_evidence.error.save_failed';
}

export function SubmitEvidencePage(props: SubmitEvidencePageProps): JSX.Element {
  const { t } = useTranslation();
  const { appDb, opfs } = useAppServices();
  const initialFlags = React.useMemo(
    () => resolveSubmissionFlags(props.chart.updateSeq, props.chart.fileDeleted, props.chart.needsSend),
    [props.chart.fileDeleted, props.chart.needsSend, props.chart.updateSeq],
  );
  const [submitState, setSubmitState] = React.useState<SubmitState>(SubmitState.IDLE);
  const [previewImage, setPreviewImage] = React.useState<PreviewImageState | null>(null);
  const [localSaved, setLocalSaved] = React.useState(initialFlags.localSaved);
  const [submitted, setSubmitted] = React.useState(initialFlags.submitted);
  const [errorReasonKey, setErrorReasonKey] = React.useState<SubmitEvidenceErrorKey | null>(null);
  const [showCameraAction, setShowCameraAction] = React.useState(false);
  const cameraInputRef = React.useRef<HTMLInputElement | null>(null);
  const pickerInputRef = React.useRef<HTMLInputElement | null>(null);
  const previewUrlRef = React.useRef<string | null>(null);
  const manualSelectionRef = React.useRef(false);

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
    (blob: Blob) => {
      revokePreviewUrl();
      const url = URL.createObjectURL(blob);
      previewUrlRef.current = url;
      setPreviewImage({ url, blob });
    },
    [revokePreviewUrl],
  );

  React.useEffect(() => {
    clearPreview();
    setErrorReasonKey(null);
    setSubmitState(SubmitState.IDLE);
    setLocalSaved(initialFlags.localSaved);
    setSubmitted(initialFlags.submitted);
    manualSelectionRef.current = false;

    let cancelled = false;

    const loadExisting = async () => {
      const evidence = await appDb.getEvidenceRecord(props.detail.tournamentUuid, props.chart.chartId);
      if (cancelled || !evidence || evidence.fileDeleted) {
        return;
      }

      const flags = resolveSubmissionFlags(evidence.updateSeq, evidence.fileDeleted, evidence.needsSend);
      setLocalSaved(flags.localSaved);
      setSubmitted(flags.submitted);

      const relativePath = await appDb.getEvidenceRelativePath(props.detail.tournamentUuid, props.chart.chartId);
      const bytes = await opfs.readFile(relativePath);
      if (cancelled || manualSelectionRef.current) {
        return;
      }
      const blob = new Blob([toSafeArrayBuffer(bytes)], { type: 'image/jpeg' });
      setPreviewFromBlob(blob);
    };

    void loadExisting().catch(() => {
      if (cancelled) {
        return;
      }
    });

    return () => {
      cancelled = true;
    };
  }, [appDb, clearPreview, initialFlags.localSaved, initialFlags.submitted, opfs, props.chart.chartId, props.detail.tournamentUuid, setPreviewFromBlob]);

  React.useEffect(
    () => () => {
      revokePreviewUrl();
    },
    [revokePreviewUrl],
  );

  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      setShowCameraAction(false);
      return;
    }
    const mediaQuery = window.matchMedia('(pointer: coarse)');
    const apply = () => {
      setShowCameraAction(mediaQuery.matches);
    };
    apply();
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', apply);
      return () => {
        mediaQuery.removeEventListener('change', apply);
      };
    }
    mediaQuery.addListener(apply);
    return () => {
      mediaQuery.removeListener(apply);
    };
  }, []);

  const savePickedFile = React.useCallback(
    async (file: File) => {
      if (submitState === SubmitState.PROCESSING) {
        return;
      }
      manualSelectionRef.current = true;
      setSubmitState(SubmitState.PROCESSING);
      setErrorReasonKey(null);

      try {
        const encoded = await reencodeImageToJpeg(file);
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
        const flags = savedRecord
          ? resolveSubmissionFlags(savedRecord.updateSeq, savedRecord.fileDeleted, savedRecord.needsSend)
          : { localSaved: true, submitted: false };

        setLocalSaved(flags.localSaved);
        setSubmitted(flags.submitted);
        setPreviewFromBlob(encoded.blob);
        setSubmitState(SubmitState.IDLE);

        await Promise.resolve(props.onSaved('submit'));
      } catch (error) {
        setSubmitState(SubmitState.ERROR);
        setErrorReasonKey(resolveFailureReasonKey(error));
      }
    },
    [appDb, opfs, props, setPreviewFromBlob, submitState],
  );

  const onSelectFile = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = '';
      if (!file) {
        return;
      }
      void savePickedFile(file);
    },
    [savePickedFile],
  );

  const openFilePicker = React.useCallback(() => {
    if (submitState === SubmitState.PROCESSING) {
      return;
    }
    pickerInputRef.current?.click();
  }, [submitState]);

  const openCameraPicker = React.useCallback(() => {
    if (submitState === SubmitState.PROCESSING) {
      return;
    }
    if (!showCameraAction || !cameraInputRef.current) {
      setSubmitState(SubmitState.ERROR);
      setErrorReasonKey('submit_evidence.error.camera_unavailable');
      return;
    }
    cameraInputRef.current.click();
  }, [showCameraAction, submitState]);

  const isProcessing = submitState === SubmitState.PROCESSING;
  const submitChartShareState = React.useMemo(
    () => resolveSubmitChartShareState(localSaved, submitted),
    [localSaved, submitted],
  );

  return (
    <div className="page submitEvidencePage">
      <section className="submitOverviewCard">
        <ChartCard
          title={props.chart.title}
          playStyle={props.chart.playStyle}
          difficulty={props.chart.difficulty}
          level={props.chart.level}
          status={submitChartShareState}
          statusTestId="submit-evidence-header-state-badge"
          variant="submit"
        />
      </section>

      <section className="detailCard submitPickerCard">
        <div className="submitPickerButtonStack">
          {showCameraAction ? (
            <button
              type="button"
              className="submitPickerActionButton submitPickerActionButton-capture"
              onClick={openCameraPicker}
              disabled={isProcessing}
            >
              <span className="submitPickerActionLabel">
                <span aria-hidden className="submitPickerCameraIcon">
                  📷
                </span>
                <span>{isProcessing ? t('submit_evidence.action.saving') : t('submit_evidence.action.take_photo')}</span>
              </span>
            </button>
          ) : null}
          <button
            type="button"
            className="submitPickerActionButton"
            onClick={openFilePicker}
            disabled={isProcessing}
          >
            {isProcessing ? t('submit_evidence.action.saving') : t('submit_evidence.action.select_image')}
          </button>
        </div>
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onSelectFile}
          className="submitHiddenInput"
          disabled={isProcessing}
        />
        <input
          ref={pickerInputRef}
          type="file"
          accept="image/*"
          onChange={onSelectFile}
          className="submitHiddenInput"
          disabled={isProcessing}
        />
      </section>

      {previewImage ? (
        <section className="detailCard submitPreviewCard">
          <div className="submitPreviewFrame">
            <img src={previewImage.url} alt={t('submit_evidence.images.preview_alt')} className="submitPreviewImage" />
          </div>
        </section>
      ) : null}

      <p className="submitLocalStorageNote">{t('submit_evidence.note.local_only_inline')}</p>

      {submitState === SubmitState.ERROR && errorReasonKey ? (
        <p className="submitActionError submitActionErrorStandalone">
          {t('submit_evidence.error.save_failed')}
          <span>{t(errorReasonKey)}</span>
        </p>
      ) : null}

      {isProcessing ? (
        <div className="submitScreenLock" role="status" aria-live="polite">
          {t('submit_evidence.status.saving')}
        </div>
      ) : null}
    </div>
  );
}
