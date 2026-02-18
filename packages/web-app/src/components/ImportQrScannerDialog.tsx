import React from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { extractQrTextFromImageData } from '../utils/image';

interface ImportQrScannerDialogProps {
  open: boolean;
  onClose: () => void;
  onDetected: (qrText: string) => void;
}

export function ImportQrScannerDialog(props: ImportQrScannerDialogProps): JSX.Element {
  const [starting, setStarting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const frameRequestRef = React.useRef<number | null>(null);
  const detectedRef = React.useRef(false);

  const stopScanner = React.useCallback(() => {
    detectedRef.current = true;
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

  React.useEffect(() => {
    if (!props.open) {
      stopScanner();
      setStarting(false);
      return;
    }

    setErrorMessage(null);
    detectedRef.current = false;

    if (window.isSecureContext !== true || typeof navigator.mediaDevices?.getUserMedia !== 'function') {
      setErrorMessage('この端末ではQR読み取りを利用できません。');
      return;
    }

    let disposed = false;
    setStarting(true);

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
          throw new Error('カメラプレビューの初期化に失敗しました。');
        }
        video.srcObject = stream;
        await video.play();

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
                  props.onDetected(qrText);
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
        const reason = error instanceof Error ? error.message : String(error);
        setErrorMessage(`カメラを起動できませんでした。${reason}`);
      } finally {
        if (!disposed) {
          setStarting(false);
        }
      }
    };

    void startScanner();

    return () => {
      disposed = true;
      stopScanner();
    };
  }, [props.onDetected, props.open, stopScanner]);

  return (
    <Dialog open={props.open} onClose={props.onClose} fullWidth maxWidth="xs">
      <DialogTitle>QR読み取り</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" className="hintText">
          QRコードをカメラにかざしてください。
        </Typography>
        <div className="importQrScannerViewport">
          <video ref={videoRef} className="importQrScannerVideo" autoPlay muted playsInline />
        </div>
        {starting ? (
          <Typography variant="body2" className="hintText">
            カメラ起動中...
          </Typography>
        ) : null}
        {errorMessage ? (
          <Typography variant="body2" className="errorText">
            {errorMessage}
          </Typography>
        ) : null}
        <canvas ref={canvasRef} className="importQrScannerCanvas" />
      </DialogContent>
      <DialogActions>
        <Button onClick={props.onClose}>閉じる</Button>
      </DialogActions>
    </Dialog>
  );
}
