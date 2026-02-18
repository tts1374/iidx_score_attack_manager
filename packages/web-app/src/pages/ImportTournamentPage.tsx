import React from 'react';
import { extractQrTextFromImageData } from '../utils/image';

interface ImportTournamentPageProps {
  songMasterReady: boolean;
  songMasterMessage: string | null;
  busy: boolean;
  onImportPayload: (text: string) => Promise<void>;
  onImportFile: (file: File) => Promise<void>;
  onImportQrScan: (text: string) => Promise<void>;
  onRefreshSongMaster: () => Promise<void>;
}

export function ImportTournamentPage(props: ImportTournamentPageProps): JSX.Element {
  const [importText, setImportText] = React.useState('');
  const [scannerOpen, setScannerOpen] = React.useState(false);
  const [scannerStarting, setScannerStarting] = React.useState(false);
  const [scannerError, setScannerError] = React.useState<string | null>(null);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const scanCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const frameRequestRef = React.useRef<number | null>(null);
  const detectedRef = React.useRef(false);
  const importDisabled = !props.songMasterReady || props.busy;
  const canUseQrScanner =
    window.isSecureContext === true && typeof navigator.mediaDevices?.getUserMedia === 'function';

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
    if (!scannerOpen) {
      stopScanner();
      setScannerStarting(false);
      return;
    }

    if (!canUseQrScanner) {
      setScannerOpen(false);
      return;
    }

    let disposed = false;
    detectedRef.current = false;
    setScannerStarting(true);
    setScannerError(null);

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
          const canvas = scanCanvasRef.current;
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
                  setScannerOpen(false);
                  void props.onImportQrScan(qrText);
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
        setScannerError(`カメラを起動できませんでした。${reason}`);
        setScannerOpen(false);
      } finally {
        if (!disposed) {
          setScannerStarting(false);
        }
      }
    };

    void startScanner();

    return () => {
      disposed = true;
      stopScanner();
    };
  }, [canUseQrScanner, props.onImportQrScan, scannerOpen, stopScanner]);

  const openScanner = React.useCallback(() => {
    setScannerError(null);
    setScannerOpen(true);
  }, []);

  const closeScanner = React.useCallback(() => {
    setScannerOpen(false);
  }, []);

  return (
    <div className="page">
      {!props.songMasterReady && (
        <section className="warningBox">
          <p>曲マスタが未取得のため、大会取込は利用できません。</p>
          {props.songMasterMessage && <p>{props.songMasterMessage}</p>}
          <button onClick={props.onRefreshSongMaster} disabled={props.busy}>
            曲データ更新
          </button>
        </section>
      )}

      <section className="detailCard importSection">
        <h2>大会取込</h2>
        <p className="hintText">URL またはペイロード文字列、もしくは画像/テキストファイルを取り込めます。</p>
        <textarea
          placeholder="URLまたはペイロードを貼り付け"
          value={importText}
          onChange={(event) => setImportText(event.target.value)}
          rows={4}
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
          {canUseQrScanner ? (
            <button type="button" disabled={importDisabled || scannerOpen || scannerStarting} onClick={openScanner}>
              {scannerStarting ? 'カメラ起動中...' : scannerOpen ? 'QR読み取り中...' : 'QR読み取り'}
            </button>
          ) : null}
        </div>
      </section>

      {scannerOpen ? (
        <section className="detailCard importQrScanner">
          <h3>QR読み取り</h3>
          <p className="hintText">QRコードをカメラにかざしてください。</p>
          <div className="importQrScannerViewport">
            <video ref={videoRef} className="importQrScannerVideo" autoPlay muted playsInline />
          </div>
          <div className="rowActions">
            <button type="button" onClick={closeScanner}>
              閉じる
            </button>
          </div>
          <canvas ref={scanCanvasRef} className="importQrScannerCanvas" />
        </section>
      ) : null}

      {scannerError ? (
        <section className="warningBox">
          <p>{scannerError}</p>
        </section>
      ) : null}
    </div>
  );
}
