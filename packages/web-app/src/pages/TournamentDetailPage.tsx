import React from 'react';
import { PAYLOAD_VERSION, encodeTournamentPayload } from '@iidx/shared';
import type { TournamentDetailChart, TournamentDetailItem } from '@iidx/db';
import CloseIcon from '@mui/icons-material/Close';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Skeleton,
  TextField,
  Typography,
} from '@mui/material';

import { buildImportUrl } from '../utils/payload-url';
import { difficultyColor } from '../utils/iidx';
import { resolveTournamentCardStatus } from '../utils/tournament-status';

interface TournamentDetailPageProps {
  detail: TournamentDetailItem;
  todayDate: string;
  onBack: () => void;
  onOpenSubmit: (chartId: number) => void;
  onDelete: () => Promise<void>;
}

const SHARE_IMAGE_WIDTH = 1080;
const SHARE_IMAGE_HEIGHT = 1920;

type ShareNotice = {
  severity: 'info' | 'success' | 'warning' | 'error';
  text: string;
};

function normalizeHashtag(value: string): string {
  const trimmed = value.trim().replace(/^#+/, '');
  return trimmed.length > 0 ? trimmed : 'IIDX';
}

function safeFileName(value: string): string {
  const normalized = value.trim().replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_');
  return normalized.length > 0 ? normalized : 'tournament';
}

function resolveLevelLabel(level: string): string | null {
  const trimmed = String(level ?? '').trim();
  if (trimmed.length === 0 || trimmed === '-') {
    return null;
  }
  if (/^\d+$/.test(trimmed)) {
    return trimmed;
  }
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric) && numeric > 0) {
    return String(Math.floor(numeric));
  }
  return null;
}

function toAlphaColor(color: string, alpha: number): string {
  const hex = color.trim().replace('#', '');
  const normalized = hex.length === 3 ? hex.split('').map((char) => `${char}${char}`).join('') : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return 'rgba(148, 163, 184, 0.16)';
  }
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function trimTextToWidth(ctx: CanvasRenderingContext2D, value: string, width: number): string {
  if (ctx.measureText(value).width <= width) {
    return value;
  }
  let end = value.length;
  while (end > 0) {
    const next = `${value.slice(0, end)}…`;
    if (ctx.measureText(next).width <= width) {
      return next;
    }
    end -= 1;
  }
  return '…';
}

function wrapText(ctx: CanvasRenderingContext2D, value: string, width: number, maxLines: number): string[] {
  const source = value.trim().length > 0 ? value.trim() : '-';
  const lines: string[] = [];
  let cursor = 0;
  while (cursor < source.length && lines.length < maxLines) {
    let end = cursor + 1;
    let lastFit = cursor;
    while (end <= source.length) {
      const candidate = source.slice(cursor, end);
      if (ctx.measureText(candidate).width <= width) {
        lastFit = end;
        end += 1;
        continue;
      }
      break;
    }
    if (lastFit === cursor) {
      lastFit = Math.min(cursor + 1, source.length);
    }
    lines.push(source.slice(cursor, lastFit));
    cursor = lastFit;
  }
  if (cursor < source.length && lines.length > 0) {
    const lastIndex = lines.length - 1;
    const lastLine = lines[lastIndex];
    if (lastLine) {
      lines[lastIndex] = trimTextToWidth(ctx, `${lastLine}…`, width);
    }
  }
  return lines;
}

function fillRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  color: string,
): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function toPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('共有画像の生成に失敗しました。'));
          return;
        }
        resolve(blob);
      },
      'image/png',
      1,
    );
  });
}

async function buildShareImage(detail: TournamentDetailItem, statusLabel: string, shareText: string): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = SHARE_IMAGE_WIDTH;
  canvas.height = SHARE_IMAGE_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('共有画像の描画環境を取得できませんでした。');
  }

  const bg = ctx.createLinearGradient(0, 0, SHARE_IMAGE_WIDTH, SHARE_IMAGE_HEIGHT);
  bg.addColorStop(0, '#0f172a');
  bg.addColorStop(0.52, '#1d4ed8');
  bg.addColorStop(1, '#1e293b');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, SHARE_IMAGE_WIDTH, SHARE_IMAGE_HEIGHT);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
  for (let lineY = 52; lineY < SHARE_IMAGE_HEIGHT; lineY += 136) {
    ctx.fillRect(0, lineY, SHARE_IMAGE_WIDTH, 1);
  }

  const cardX = 60;
  const cardY = 72;
  const cardWidth = SHARE_IMAGE_WIDTH - 120;
  const cardHeight = SHARE_IMAGE_HEIGHT - 144;
  fillRoundedRect(ctx, cardX, cardY, cardWidth, cardHeight, 44, '#f8fafc');

  let y = cardY + 96;
  ctx.textBaseline = 'alphabetic';

  ctx.font = '700 34px "Segoe UI", "Noto Sans JP", sans-serif';
  const statusWidth = ctx.measureText(statusLabel).width + 56;
  fillRoundedRect(ctx, cardX + 56, y - 50, statusWidth, 66, 33, '#1d4ed8');
  ctx.fillStyle = '#ffffff';
  ctx.fillText(statusLabel, cardX + 84, y - 8);

  y += 54;
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 68px "Segoe UI", "Noto Sans JP", sans-serif';
  const titleLines = wrapText(ctx, detail.tournamentName, cardWidth - 112, 2);
  for (const line of titleLines) {
    ctx.fillText(line, cardX + 56, y);
    y += 80;
  }

  ctx.fillStyle = '#334155';
  ctx.font = '500 34px "Segoe UI", "Noto Sans JP", sans-serif';
  ctx.fillText(trimTextToWidth(ctx, `開催者: ${detail.owner}`, cardWidth - 112), cardX + 56, y + 18);
  y += 72;
  ctx.fillStyle = '#475569';
  ctx.fillText(`${detail.startDate} 〜 ${detail.endDate}`, cardX + 56, y + 6);
  y += 58;
  ctx.fillStyle = '#1d4ed8';
  ctx.font = '700 34px "Segoe UI", "Noto Sans JP", sans-serif';
  ctx.fillText(`#${normalizeHashtag(detail.hashtag)}`, cardX + 56, y);
  y += 56;

  const progressX = cardX + 56;
  const progressY = y;
  const progressWidth = cardWidth - 112;
  fillRoundedRect(ctx, progressX, progressY, progressWidth, 144, 28, '#e2e8f0');
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 38px "Segoe UI", "Noto Sans JP", sans-serif';
  ctx.fillText(`提出 ${detail.submittedCount} / ${detail.chartCount}`, progressX + 28, progressY + 56);
  fillRoundedRect(ctx, progressX + 28, progressY + 82, progressWidth - 56, 22, 11, '#cbd5e1');
  if (detail.chartCount > 0) {
    const progress = Math.min(1, Math.max(0, detail.submittedCount / detail.chartCount));
    const progressFillWidth = Math.max(20, (progressWidth - 56) * progress);
    fillRoundedRect(ctx, progressX + 28, progressY + 82, progressFillWidth, 22, 11, '#2563eb');
  }
  y += 194;

  ctx.fillStyle = '#0f172a';
  ctx.font = '700 42px "Segoe UI", "Noto Sans JP", sans-serif';
  ctx.fillText('譜面一覧', cardX + 56, y);
  y += 26;

  const chartRowHeight = 100;
  const chartRowGap = 14;
  const maxChartRows = 8;
  const visibleCharts = detail.charts.slice(0, maxChartRows);

  visibleCharts.forEach((chart, index) => {
    const rowTop = y + index * (chartRowHeight + chartRowGap);
    const rowLeft = cardX + 56;
    const rowWidth = cardWidth - 112;
    const color = difficultyColor(chart.difficulty);
    fillRoundedRect(ctx, rowLeft, rowTop, rowWidth, chartRowHeight, 20, '#ffffff');
    fillRoundedRect(ctx, rowLeft + 18, rowTop + 22, 178, 52, 26, toAlphaColor(color, 0.16));
    ctx.fillStyle = color;
    ctx.font = '700 26px "Segoe UI", "Noto Sans JP", sans-serif';
    ctx.fillText(`${chart.playStyle} ${chart.difficulty}`, rowLeft + 30, rowTop + 56);

    ctx.fillStyle = '#0f172a';
    ctx.font = '700 30px "Segoe UI", "Noto Sans JP", sans-serif';
    ctx.fillText(trimTextToWidth(ctx, chart.title, rowWidth - 426), rowLeft + 214, rowTop + 44);

    const levelLabel = resolveLevelLabel(chart.level);
    ctx.font = '600 23px "Segoe UI", "Noto Sans JP", sans-serif';
    ctx.fillStyle = levelLabel ? '#334155' : '#b45309';
    ctx.fillText(levelLabel ? `Lv${levelLabel}` : '曲データ更新が必要', rowLeft + 214, rowTop + 78);

    const submitLabel = chart.submitted ? '登録済' : '未登録';
    const submitTextColor = chart.submitted ? '#334155' : '#b91c1c';
    const submitBgColor = chart.submitted ? '#e2e8f0' : '#fee2e2';
    ctx.font = '700 20px "Segoe UI", "Noto Sans JP", sans-serif';
    const submitWidth = ctx.measureText(submitLabel).width + 28;
    fillRoundedRect(ctx, rowLeft + rowWidth - submitWidth - 18, rowTop + 58, submitWidth, 30, 15, submitBgColor);
    ctx.fillStyle = submitTextColor;
    ctx.fillText(submitLabel, rowLeft + rowWidth - submitWidth + 2 - 18, rowTop + 80);
  });

  if (detail.charts.length > visibleCharts.length) {
    const restCount = detail.charts.length - visibleCharts.length;
    const restY = y + visibleCharts.length * (chartRowHeight + chartRowGap) + 28;
    ctx.fillStyle = '#475569';
    ctx.font = '600 28px "Segoe UI", "Noto Sans JP", sans-serif';
    ctx.fillText(`ほか ${restCount} 譜面`, cardX + 62, restY);
  }

  const footerLabelY = cardY + cardHeight - 98;
  ctx.fillStyle = '#475569';
  ctx.font = '600 24px "Segoe UI", "Noto Sans JP", sans-serif';
  ctx.fillText('共有テキスト', cardX + 56, footerLabelY);
  ctx.fillStyle = '#0f172a';
  ctx.font = '500 22px "Segoe UI", "Noto Sans JP", sans-serif';
  ctx.fillText(trimTextToWidth(ctx, shareText, cardWidth - 112), cardX + 56, footerLabelY + 36);

  return toPngBlob(canvas);
}

function difficultyTag(chart: TournamentDetailChart): JSX.Element {
  const color = difficultyColor(chart.difficulty);
  return (
    <span
      className="chartDifficultyTag"
      style={{
        color,
        borderColor: color,
        backgroundColor: toAlphaColor(color, 0.12),
      }}
    >
      {chart.difficulty}
    </span>
  );
}

export function TournamentDetailPage(props: TournamentDetailPageProps): JSX.Element {
  const [shareDialogOpen, setShareDialogOpen] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [shareImageStatus, setShareImageStatus] = React.useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [shareImageBlob, setShareImageBlob] = React.useState<Blob | null>(null);
  const [shareImagePreviewUrl, setShareImagePreviewUrl] = React.useState<string | null>(null);
  const [shareNotice, setShareNotice] = React.useState<ShareNotice | null>(null);
  const [manualCopyVisible, setManualCopyVisible] = React.useState(false);

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
  const normalizedHashtag = React.useMemo(() => normalizeHashtag(props.detail.hashtag), [props.detail.hashtag]);
  const shareText = React.useMemo(() => `#${normalizedHashtag} ${shareUrl}`, [normalizedHashtag, shareUrl]);
  const statusInfo = React.useMemo(
    () => resolveTournamentCardStatus(props.detail.startDate, props.detail.endDate, props.todayDate),
    [props.detail.endDate, props.detail.startDate, props.todayDate],
  );
  const progress = props.detail.chartCount > 0 ? Math.round((props.detail.submittedCount / props.detail.chartCount) * 100) : 0;

  React.useEffect(() => {
    if (!shareDialogOpen) {
      return;
    }
    let active = true;
    setShareImageStatus('loading');
    setShareImageBlob(null);
    setShareImagePreviewUrl(null);
    setShareNotice(null);
    setManualCopyVisible(false);

    void buildShareImage(props.detail, statusInfo.label, shareText)
      .then((blob) => {
        if (!active) {
          return;
        }
        const previewUrl = URL.createObjectURL(blob);
        setShareImageBlob(blob);
        setShareImagePreviewUrl(previewUrl);
        setShareImageStatus('ready');
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        setShareImageStatus('error');
        setShareImageBlob(null);
        const message = error instanceof Error ? error.message : '共有画像の生成に失敗しました。';
        setShareNotice({ severity: 'error', text: message });
      });

    return () => {
      active = false;
    };
  }, [props.detail, shareDialogOpen, shareText, statusInfo.label]);

  React.useEffect(() => {
    return () => {
      if (shareImagePreviewUrl) {
        URL.revokeObjectURL(shareImagePreviewUrl);
      }
    };
  }, [shareImagePreviewUrl]);

  const shareUnavailable = shareImageStatus !== 'ready' || !shareImageBlob;

  const exportImage = () => {
    if (!shareImageBlob) {
      return;
    }
    const url = URL.createObjectURL(shareImageBlob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${safeFileName(props.detail.tournamentName)}-share.png`;
    anchor.click();
    URL.revokeObjectURL(url);
    setShareNotice({ severity: 'success', text: '画像を保存しました。' });
  };

  const shareByWebShareApi = async () => {
    if (!shareImageBlob) {
      return;
    }
    if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') {
      setShareNotice({
        severity: 'warning',
        text: 'この環境では共有できません。下のエクスポートをご利用ください。',
      });
      return;
    }

    const shareFile = new File([shareImageBlob], `${safeFileName(props.detail.tournamentName)}-share.png`, {
      type: 'image/png',
    });
    if (!navigator.canShare({ files: [shareFile] })) {
      setShareNotice({
        severity: 'warning',
        text: 'この環境では共有できません。下のエクスポートをご利用ください。',
      });
      return;
    }

    try {
      await navigator.share({
        title: props.detail.tournamentName,
        text: shareText,
        files: [shareFile],
      });
      setShareNotice({ severity: 'success', text: '共有を実行しました。' });
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setShareNotice({ severity: 'info', text: '共有をキャンセルしました。' });
        return;
      }
      setShareNotice({
        severity: 'error',
        text: '共有に失敗しました。下のエクスポートをご利用ください。',
      });
    }
  };

  const copyShareText = async () => {
    try {
      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
        throw new Error('Clipboard API unavailable');
      }
      await navigator.clipboard.writeText(shareText);
      setManualCopyVisible(false);
      setShareNotice({ severity: 'success', text: '共有テキストをコピーしました。' });
    } catch {
      setManualCopyVisible(true);
      setShareNotice({
        severity: 'warning',
        text: '自動コピーできませんでした。表示されたテキストを手動でコピーしてください。',
      });
    }
  };

  const requestDelete = () => {
    setDeleteDialogOpen(true);
  };

  const runDelete = async () => {
    if (deleting) {
      return;
    }
    setDeleting(true);
    try {
      await props.onDelete();
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  const openShareDialog = () => {
    setShareDialogOpen(true);
    setShareNotice(null);
    setManualCopyVisible(false);
  };

  const closeShareDialog = () => {
    setShareDialogOpen(false);
    setShareNotice(null);
    setManualCopyVisible(false);
    setShareImageStatus('idle');
    setShareImageBlob(null);
    setShareImagePreviewUrl(null);
  };

  return (
    <div className="page">
      <section className="detailCard">
        <div className="tournamentDetailHeader">
          <div className="tournamentDetailMeta">
            <h2>{props.detail.tournamentName}</h2>
            <p className="ownerLine">{props.detail.owner}</p>
            <p className="periodLine">
              {props.detail.startDate}〜{props.detail.endDate}
            </p>
            <p className="hashtagLine">#{normalizedHashtag}</p>
          </div>
          <span className={`statusBadge statusBadge-${statusInfo.status}`}>{statusInfo.label}</span>
        </div>
        <div className="progressLine">
          提出 {props.detail.submittedCount} / {props.detail.chartCount}
        </div>
        <div className="progressBar" aria-hidden>
          <span style={{ width: `${progress}%` }} />
        </div>
        <div className="rowActions detailPrimaryActions">
          <button className="detailShareButton" onClick={openShareDialog}>
            共有
          </button>
        </div>
      </section>

      <section>
        <h2>譜面一覧</h2>
        <ul className="chartList">
          {props.detail.charts.map((chart) => {
            const levelLabel = resolveLevelLabel(chart.level);
            return (
              <li key={chart.chartId}>
                <button className="chartListItem" onClick={() => props.onOpenSubmit(chart.chartId)}>
                  <span className={`statusCircle ${chart.submitted ? 'done' : 'pending'}`} />
                  <div className="chartText">
                    <strong>{chart.title}</strong>
                    <div className="chartMetaLine">
                      <span className="chartStyleTag">{chart.playStyle}</span>
                      {difficultyTag(chart)}
                      {levelLabel ? (
                        <span className="chartLevelTag">Lv{levelLabel}</span>
                      ) : (
                        <span className="chartMetaFallback">曲データ更新が必要</span>
                      )}
                    </div>
                  </div>
                  <span className={`chartSubmitLabel ${chart.submitted ? 'done' : 'pending'}`}>
                    {chart.submitted ? '登録済' : '未登録'}
                  </span>
                  <span className="arrow">›</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="detailCard dangerZoneCard">
        <h3>危険操作</h3>
        <p>大会データと画像は削除され、復元できません。</p>
        <div className="rowActions">
          <button className="dangerActionButton" onClick={requestDelete}>
            削除
          </button>
        </div>
      </section>

      <Dialog open={shareDialogOpen} onClose={closeShareDialog} fullWidth maxWidth="sm">
        <DialogTitle sx={{ pr: 6 }}>
          共有
          <IconButton
            aria-label="共有ダイアログを閉じる"
            onClick={closeShareDialog}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ display: 'grid', gap: 2 }}>
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>
              プレビュー
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              生成画像（1080x1920）
            </Typography>
            <Box
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 2,
                p: 1.5,
                maxHeight: { xs: 420, sm: 520 },
                overflowY: 'auto',
                backgroundColor: '#f8fafc',
              }}
            >
              {shareImageStatus === 'loading' ? (
                <Skeleton
                  variant="rounded"
                  sx={{
                    width: '100%',
                    maxWidth: 330,
                    aspectRatio: `${SHARE_IMAGE_WIDTH} / ${SHARE_IMAGE_HEIGHT}`,
                    mx: 'auto',
                  }}
                />
              ) : null}
              {shareImageStatus === 'ready' && shareImagePreviewUrl ? (
                <Box
                  component="img"
                  src={shareImagePreviewUrl}
                  alt="共有画像プレビュー"
                  sx={{
                    width: '100%',
                    maxWidth: 330,
                    display: 'block',
                    mx: 'auto',
                    borderRadius: 1.5,
                    border: '1px solid #cbd5e1',
                  }}
                />
              ) : null}
              {shareImageStatus === 'error' ? (
                <Alert severity="error">共有画像の生成に失敗しました。共有とエクスポートは利用できません。</Alert>
              ) : null}
            </Box>
          </Box>

          <Divider />

          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>
              共有
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              対応環境では、画像とテキストをまとめて共有します。
            </Typography>
            <Button variant="contained" onClick={shareByWebShareApi} disabled={shareUnavailable}>
              共有
            </Button>
          </Box>

          <Divider />

          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>
              エクスポート
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: manualCopyVisible ? 1.5 : 0 }}>
              <Button variant="outlined" onClick={exportImage} disabled={shareUnavailable}>
                画像を保存
              </Button>
              <Button variant="outlined" onClick={() => void copyShareText()} disabled={shareUnavailable}>
                テキストをコピー
              </Button>
            </Box>
            {manualCopyVisible ? (
              <TextField
                fullWidth
                label="共有テキスト"
                value={shareText}
                multiline
                minRows={2}
                InputProps={{ readOnly: true }}
              />
            ) : null}
          </Box>

          {shareNotice ? <Alert severity={shareNotice.severity}>{shareNotice.text}</Alert> : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeShareDialog}>閉じる</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>大会を削除しますか？</DialogTitle>
        <DialogContent>
          <Typography variant="body2">大会データと画像は削除され、復元できません。</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
            キャンセル
          </Button>
          <Button color="error" variant="contained" onClick={() => void runDelete()} disabled={deleting}>
            削除
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}

