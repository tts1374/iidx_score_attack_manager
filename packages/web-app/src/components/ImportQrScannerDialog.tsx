import React from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';

import { extractQrTextFromImageData } from '../utils/image';
import { extractRawQueryParam } from '../utils/payload-url';

interface ImportQrScannerDialogProps {
  open: boolean;
  onClose: () => void;
  onImportUrl: (url: string) => void;
}

export function ImportQrScannerDialog(props: ImportQrScannerDialogProps): JSX.Element {
  const { t } = useTranslation();
  const [cameraState, setCameraState] = React.useState<'initializing' | 'ready' | 'failed'>('initializing');
  const [cameraError, setCameraError] = React.useState<string | null>(null);
  const [importUrlInput, setImportUrlInput] = React.useState('');
  const [importUrlError, setImportUrlError] = React.useState<string | null>(null);
  const [helpExpanded, setHelpExpanded] = React.useState(false);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const frameRequestRef = React.useRef<number | null>(null);
  const detectedRef = React.useRef(false);
  const helpPanelId = React.useId();

  const stopScanner = React.useCallback(() => {
    if (frameRequestRef.current !== null) {
      window.cancelAnimationFrame(frameRequestRef.current);
      frameRequestRef.current = null;
    }

    const stream = streamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
    }
    streamRef.current = null;

    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
    }
  }, []);

  const resolveFallbackValidationMessage = React.useCallback(
    (value: string): string | null => {
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        return t('common.import_qr_dialog.fallback.error.empty');
      }

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(trimmed);
      } catch {
        return t('common.import_qr_dialog.fallback.error.absolute_url');
      }

      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return t('common.import_qr_dialog.fallback.error.absolute_url');
      }

      const rawPayloadParam = extractRawQueryParam(parsedUrl.search, 'p');
      if (!parsedUrl.pathname.includes('/import/confirm') || rawPayloadParam === null || rawPayloadParam.length === 0) {
        return t('common.import_qr_dialog.fallback.error.import_link');
      }

      return null;
    },
    [t],
  );

  React.useEffect(() => {
    if (!props.open) {
      stopScanner();
      setCameraState('initializing');
      setCameraError(null);
      setImportUrlInput('');
      setImportUrlError(null);
      setHelpExpanded(false);
      return;
    }

    setCameraState('initializing');
    setCameraError(null);
    setImportUrlError(null);
    setHelpExpanded(false);
    detectedRef.current = false;

    if (window.isSecureContext !== true || typeof navigator.mediaDevices?.getUserMedia !== 'function') {
      setCameraState('failed');
      const unavailableReason = window.isSecureContext !== true ? 'NotAllowedError: insecure context' : 'NotFoundError: no camera api';
      setCameraError(unavailableReason);
      stopScanner();
      return;
    }

    let disposed = false;

    const startScanner = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: {
              ideal: 'environment',
            },
          },
          audio: false,
        });
        if (disposed) {
          for (const track of stream.getTracks()) {
            track.stop();
          }
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) {
          throw new DOMException('Camera preview element is missing.', 'NotReadableError');
        }
        video.srcObject = stream;
        await video.play();
        setCameraState('ready');

        const scanFrame = () => {
          if (disposed || detectedRef.current) {
            return;
          }

          const currentVideo = videoRef.current;
          const canvas = canvasRef.current;
          if (currentVideo && canvas && currentVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            const width = currentVideo.videoWidth;
            const height = currentVideo.videoHeight;
            if (width > 0 && height > 0) {
              if (canvas.width !== width) {
                canvas.width = width;
              }
              if (canvas.height !== height) {
                canvas.height = height;
              }

              const context = canvas.getContext('2d', { willReadFrequently: true });
              if (context) {
                context.drawImage(currentVideo, 0, 0, width, height);
                const imageData = context.getImageData(0, 0, width, height);
                const qrText = extractQrTextFromImageData(imageData);
                if (qrText) {
                  detectedRef.current = true;
                  stopScanner();
                  props.onImportUrl(qrText);
                  return;
                }
              }
            }
          }

          frameRequestRef.current = window.requestAnimationFrame(scanFrame);
        };

        frameRequestRef.current = window.requestAnimationFrame(scanFrame);
      } catch (error) {
        if (disposed) {
          return;
        }
        stopScanner();
        const reason =
          typeof error === 'object' && error !== null && 'name' in error && 'message' in error
            ? `${String(error.name)}: ${String(error.message)}`
            : String(error);
        setCameraError(reason);
        setCameraState('failed');
      }
    };

    void startScanner();

    return () => {
      disposed = true;
      stopScanner();
    };
  }, [props.onImportUrl, props.open, stopScanner]);

  const submitDisabled = importUrlInput.trim().length === 0;
  const showFallback = cameraState === 'failed';

  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      fullWidth
      maxWidth="xs"
      PaperProps={{
        sx: {
          backgroundColor: 'var(--surface)',
          color: 'var(--text)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow)',
          '& .MuiTypography-root': {
            color: 'var(--text)',
          },
          '& .hintText': {
            color: 'var(--text-subtle)',
          },
        },
      }}
    >
      <DialogTitle>{t('common.import_qr_dialog.title')}</DialogTitle>
      <DialogContent
        dividers
        sx={{
          borderColor: 'var(--border)',
        }}
      >
        {!showFallback ? (
          <>
            <Typography variant="body2" className="hintText">
              {t('common.import_qr_dialog.description')}
            </Typography>
            <div className="importQrScannerViewport">
              <video ref={videoRef} className="importQrScannerVideo" autoPlay muted playsInline />
            </div>
          </>
        ) : (
          <div className="importQrScannerFallback">
            <Typography component="h3" variant="subtitle1">
              {t('common.import_qr_dialog.fallback.title')}
            </Typography>
            <Typography variant="body2" className="hintText">
              {t('common.import_qr_dialog.fallback.description')}
            </Typography>
            <form
              className="importQrScannerFallbackForm"
              onSubmit={(event) => {
                event.preventDefault();
                const validationMessage = resolveFallbackValidationMessage(importUrlInput);
                if (validationMessage) {
                  setImportUrlError(validationMessage);
                  return;
                }
                setImportUrlError(null);
                props.onImportUrl(importUrlInput.trim());
              }}
            >
              <input
                value={importUrlInput}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setImportUrlInput(nextValue);
                  if (importUrlError) {
                    setImportUrlError(resolveFallbackValidationMessage(nextValue));
                  }
                }}
                placeholder={t('common.import_qr_dialog.fallback.input_placeholder')}
                aria-label={t('common.import_qr_dialog.fallback.input_placeholder')}
              />
              <Button type="submit" variant="contained" disabled={submitDisabled}>
                {t('common.import_qr_dialog.fallback.action.import')}
              </Button>
            </form>
            {importUrlError ? (
              <Typography variant="body2" className="errorText">
                {importUrlError}
              </Typography>
            ) : null}
            <Button
              size="small"
              className="importQrScannerFallbackHelpLink"
              onClick={() => setHelpExpanded((prev) => !prev)}
              aria-expanded={helpExpanded}
              aria-controls={helpPanelId}
            >
              {t('common.import_qr_dialog.fallback.help_link')}
            </Button>
            {helpExpanded ? (
              <div id={helpPanelId} className="importQrScannerFallbackHelpPanel">
                <Typography variant="body2">{t('common.import_qr_dialog.fallback.help.permission')}</Typography>
                <Typography variant="body2">{t('common.import_qr_dialog.fallback.help.https')}</Typography>
                <Typography variant="body2">{t('common.import_qr_dialog.fallback.help.in_app_browser')}</Typography>
              </div>
            ) : null}
          </div>
        )}
        {cameraState === 'initializing' ? (
          <Typography variant="body2" className="hintText">
            {t('common.import_qr_dialog.starting')}
          </Typography>
        ) : null}
        <canvas ref={canvasRef} className="importQrScannerCanvas" />
      </DialogContent>
      <DialogActions sx={{ borderTop: '1px solid var(--border)' }}>
        <Button onClick={props.onClose}>{t('common.close')}</Button>
      </DialogActions>
    </Dialog>
  );
}
