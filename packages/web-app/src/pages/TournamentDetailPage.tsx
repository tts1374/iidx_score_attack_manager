import React from 'react';
import { PAYLOAD_VERSION, encodeTournamentPayload } from '@iidx/shared';
import type { TournamentDetailChart, TournamentDetailItem } from '@iidx/db';
import QRCode from 'qrcode';
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
  onOpenSubmit: (chartId: number) => void;
  onOpenSettings: () => void;
}

const SHARE_IMAGE_WIDTH = 1080;
const SHARE_IMAGE_HEIGHT = 1920;
const SHARE_SAFE_MARGIN = 64;
const SHARE_QR_SIZE = 420;
const SHARE_QR_CARD_PADDING = 16;
const SHARE_FONT_FAMILY = '"Segoe UI", "Noto Sans JP", sans-serif';

type ShareNotice = {
  severity: 'info' | 'success' | 'warning' | 'error';
  text: string;
};

type SharePosterChart = {
  chart: TournamentDetailChart;
  levelLabel: string;
};

type ChartTaskStatus = 'pending' | 'done' | 'updated';

function normalizeHashtag(value: string): string {
  const trimmed = value.trim().replace(/^#+/, '');
  return trimmed.length > 0 ? trimmed : 'IIDX';
}

function optionalHashtag(value: string): string | null {
  const trimmed = value.trim().replace(/^#+/, '');
  return trimmed.length > 0 ? `#${trimmed}` : null;
}

function safeFileName(value: string): string {
  const normalized = value.trim().replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_');
  return normalized.length > 0 ? normalized : 'tournament';
}

type ChartLevelResolution = { kind: 'valid'; label: string } | { kind: 'zero' } | { kind: 'invalid' };

function resolveChartLevel(level: string): ChartLevelResolution {
  const trimmed = String(level ?? '').trim();
  if (trimmed.length === 0 || trimmed === '-') {
    return { kind: 'invalid' };
  }
  if (/^\d+$/.test(trimmed)) {
    const parsed = Number.parseInt(trimmed, 10);
    if (parsed === 0) {
      return { kind: 'zero' };
    }
    if (parsed > 0) {
      return { kind: 'valid', label: String(parsed) };
    }
    return { kind: 'invalid' };
  }
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric) || !Number.isInteger(numeric)) {
    return { kind: 'invalid' };
  }
  if (numeric === 0) {
    return { kind: 'zero' };
  }
  if (numeric > 0) {
    return { kind: 'valid', label: String(numeric) };
  }
  return { kind: 'invalid' };
}

function resolveLevelLabel(level: string): string | null {
  const resolved = resolveChartLevel(level);
  return resolved.kind === 'valid' ? resolved.label : null;
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

function resolveChartTaskStatus(chart: TournamentDetailChart): { status: ChartTaskStatus; label: string } {
  if (!chart.submitted) {
    return {
      status: 'pending',
      label: '未登録',
    };
  }
  if (chart.updateSeq > 1) {
    return {
      status: 'updated',
      label: '更新あり',
    };
  }
  return {
    status: 'done',
    label: '登録済',
  };
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

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('QR画像の読み込みに失敗しました。'));
    image.src = src;
  });
}

function resolveTitleLayout(
  ctx: CanvasRenderingContext2D,
  title: string,
  maxWidth: number,
): { lines: string[]; fontSize: number; lineHeight: number } {
  for (let fontSize = 90; fontSize >= 62; fontSize -= 4) {
    ctx.font = `800 ${fontSize}px ${SHARE_FONT_FAMILY}`;
    const lines = wrapText(ctx, title, maxWidth, 2);
    const hasEllipsis = lines.some((line) => line.endsWith('…'));
    if (!hasEllipsis) {
      return {
        lines,
        fontSize,
        lineHeight: fontSize + 18,
      };
    }
  }
  const fallbackFontSize = 62;
  ctx.font = `800 ${fallbackFontSize}px ${SHARE_FONT_FAMILY}`;
  return {
    lines: wrapText(ctx, title, maxWidth, 2),
    fontSize: fallbackFontSize,
    lineHeight: fallbackFontSize + 16,
  };
}

function resolveSharePosterCharts(detail: TournamentDetailItem): SharePosterChart[] {
  const rows: SharePosterChart[] = [];
  let hasUnresolvedLevel = false;

  detail.charts.forEach((chart) => {
    const level = resolveChartLevel(chart.level);
    if (level.kind === 'zero') {
      return;
    }
    if (level.kind === 'invalid') {
      hasUnresolvedLevel = true;
      return;
    }
    rows.push({
      chart,
      levelLabel: level.label,
    });
  });

  if (hasUnresolvedLevel) {
    throw new Error('対象譜面のLvを解決できないため宣伝画像を生成できません。曲データ更新後に再試行してください。');
  }

  if (rows.length === 0) {
    throw new Error('表示可能な対象譜面がないため宣伝画像を生成できません。');
  }

  return rows.slice(0, 4);
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

async function buildShareImage(detail: TournamentDetailItem, shareUrl: string): Promise<Blob> {
  const posterCharts = resolveSharePosterCharts(detail);

  const canvas = document.createElement('canvas');
  canvas.width = SHARE_IMAGE_WIDTH;
  canvas.height = SHARE_IMAGE_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('共有画像の描画環境を取得できませんでした。');
  }

  ctx.textBaseline = 'alphabetic';

  const background = ctx.createLinearGradient(0, 0, SHARE_IMAGE_WIDTH, SHARE_IMAGE_HEIGHT);
  background.addColorStop(0, '#0B132B');
  background.addColorStop(0.48, '#1D4ED8');
  background.addColorStop(1, '#0F172A');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, SHARE_IMAGE_WIDTH, SHARE_IMAGE_HEIGHT);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.beginPath();
  ctx.arc(190, 250, 220, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(980, 420, 300, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(870, 1710, 260, 0, Math.PI * 2);
  ctx.fill();

  const panelX = SHARE_SAFE_MARGIN + 20;
  const panelY = SHARE_SAFE_MARGIN + 20;
  const panelWidth = SHARE_IMAGE_WIDTH - (SHARE_SAFE_MARGIN + 20) * 2;
  const panelHeight = SHARE_IMAGE_HEIGHT - (SHARE_SAFE_MARGIN + 20) * 2;
  fillRoundedRect(ctx, panelX, panelY, panelWidth, panelHeight, 46, 'rgba(248, 250, 252, 0.88)');

  const panelPadding = 56;
  const innerX = panelX + panelPadding;
  const innerY = panelY + panelPadding;
  const innerWidth = panelWidth - panelPadding * 2;
  const innerHeight = panelHeight - panelPadding * 2;
  const sectionGap = 40;
  const headerHeight = Math.floor(innerHeight * 0.25);
  const chartBlockHeight = Math.floor(innerHeight * 0.35);
  const qrBlockHeight = innerHeight - headerHeight - chartBlockHeight - sectionGap * 2;

  const headerTop = innerY;
  const chartTop = headerTop + headerHeight + sectionGap;
  const qrTop = chartTop + chartBlockHeight + sectionGap;

  let headerCursorY = headerTop + 88;
  const titleLayout = resolveTitleLayout(ctx, detail.tournamentName, innerWidth);
  ctx.fillStyle = '#0f172a';
  ctx.font = `800 ${titleLayout.fontSize}px ${SHARE_FONT_FAMILY}`;
  titleLayout.lines.forEach((line) => {
    ctx.fillText(line, innerX, headerCursorY);
    headerCursorY += titleLayout.lineHeight;
  });

  const hashtagLine = optionalHashtag(detail.hashtag);
  if (hashtagLine) {
    ctx.fillStyle = '#1d4ed8';
    ctx.font = `700 34px ${SHARE_FONT_FAMILY}`;
    ctx.fillText(trimTextToWidth(ctx, hashtagLine, innerWidth), innerX, headerCursorY + 4);
    headerCursorY += 56;
  }

  ctx.fillStyle = '#334155';
  ctx.font = `600 32px ${SHARE_FONT_FAMILY}`;
  ctx.fillText(trimTextToWidth(ctx, `開催者: ${detail.owner}`, innerWidth), innerX, headerCursorY + 12);
  headerCursorY += 68;

  ctx.fillStyle = '#1e293b';
  ctx.font = `700 40px ${SHARE_FONT_FAMILY}`;
  ctx.fillText(`${detail.startDate} 〜 ${detail.endDate}`, innerX, headerCursorY + 8);

  ctx.fillStyle = '#0f172a';
  ctx.font = `800 48px ${SHARE_FONT_FAMILY}`;
  ctx.fillText('対象譜面', innerX, chartTop + 52);

  const rowHeight = 122;
  const rowGap = 4;
  const rowTopStart = chartTop + 74;
  const rowLeft = innerX;
  const rowWidth = innerWidth;

  posterCharts.forEach((entry, index) => {
    const rowTop = rowTopStart + index * (rowHeight + rowGap);
    const tagText = `${entry.chart.playStyle} ${entry.chart.difficulty}`;
    const color = difficultyColor(entry.chart.difficulty);
    const tagHeight = 34;
    const metaY = rowTop + 12;

    fillRoundedRect(ctx, rowLeft, rowTop, rowWidth, rowHeight, 22, 'rgba(255, 255, 255, 0.78)');

    ctx.font = `700 21px ${SHARE_FONT_FAMILY}`;
    const tagWidth = Math.min(320, Math.max(170, ctx.measureText(tagText).width + 32));
    const tagX = rowLeft + 24;
    fillRoundedRect(ctx, tagX, metaY, tagWidth, tagHeight, 18, toAlphaColor(color, 0.2));

    ctx.fillStyle = color;
    ctx.fillText(trimTextToWidth(ctx, tagText, tagWidth - 24), tagX + 12, metaY + 25);

    const levelText = `Lv${entry.levelLabel}`;
    const levelWidth = 112;
    const levelX = rowLeft + rowWidth - levelWidth - 24;
    fillRoundedRect(ctx, levelX, metaY, levelWidth, tagHeight, 18, '#e2e8f0');
    ctx.fillStyle = '#0f172a';
    ctx.font = `800 23px ${SHARE_FONT_FAMILY}`;
    const levelTextWidth = ctx.measureText(levelText).width;
    ctx.fillText(levelText, levelX + (levelWidth - levelTextWidth) / 2, metaY + 25);

    const titleX = rowLeft + 24;
    const titleWidth = rowWidth - 48;
    ctx.fillStyle = '#0f172a';
    const baseTitleFontSize = 26;
    const boostedTitleFontSize = Math.round(baseTitleFontSize * 1.18);
    const fallbackBoostedTitleFontSize = Math.round(baseTitleFontSize * 1.15);
    ctx.font = `700 ${baseTitleFontSize}px ${SHARE_FONT_FAMILY}`;
    const baseTitleLines = wrapText(ctx, entry.chart.title, titleWidth, 2);
    let titleFontSize = baseTitleFontSize;
    let titleLines = baseTitleLines;
    if (baseTitleLines.length === 1) {
      ctx.font = `700 ${boostedTitleFontSize}px ${SHARE_FONT_FAMILY}`;
      const boostedTitleLines = wrapText(ctx, entry.chart.title, titleWidth, 2);
      if (boostedTitleLines.length === 1) {
        titleFontSize = boostedTitleFontSize;
        titleLines = boostedTitleLines;
      } else if (fallbackBoostedTitleFontSize !== boostedTitleFontSize) {
        ctx.font = `700 ${fallbackBoostedTitleFontSize}px ${SHARE_FONT_FAMILY}`;
        const fallbackBoostedTitleLines = wrapText(ctx, entry.chart.title, titleWidth, 2);
        if (fallbackBoostedTitleLines.length === 1) {
          titleFontSize = fallbackBoostedTitleFontSize;
          titleLines = fallbackBoostedTitleLines;
        }
      }
    }
    ctx.font = `700 ${titleFontSize}px ${SHARE_FONT_FAMILY}`;
    const titleLineHeight = Math.round(titleFontSize * 1.08);
    const titleAreaTop = rowTop + 54;
    const titleAreaBottom = rowTop + rowHeight - 10;
    const titleAreaHeight = titleAreaBottom - titleAreaTop;
    const titleBlockHeight = titleLines.length * titleLineHeight;
    const titleStartY = titleAreaTop + Math.max(0, (titleAreaHeight - titleBlockHeight) / 2);
    ctx.textBaseline = 'top';
    titleLines.forEach((line, lineIndex) => {
      ctx.fillText(line, titleX, titleStartY + lineIndex * titleLineHeight);
    });
    ctx.textBaseline = 'alphabetic';
  });

  const qrCardSize = SHARE_QR_SIZE + SHARE_QR_CARD_PADDING * 2;
  const qrCardX = Math.round((SHARE_IMAGE_WIDTH - qrCardSize) / 2);
  const qrCardY = qrTop + Math.max(0, Math.floor((qrBlockHeight - qrCardSize - 44) / 2));
  fillRoundedRect(ctx, qrCardX, qrCardY, qrCardSize, qrCardSize, 28, '#ffffff');

  const qrDataUrl = await QRCode.toDataURL(shareUrl, {
    errorCorrectionLevel: 'M',
    margin: 4,
    width: SHARE_QR_SIZE,
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  });
  const qrImage = await loadImage(qrDataUrl);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    qrImage,
    qrCardX + SHARE_QR_CARD_PADDING,
    qrCardY + SHARE_QR_CARD_PADDING,
    SHARE_QR_SIZE,
    SHARE_QR_SIZE,
  );
  ctx.imageSmoothingEnabled = true;

  ctx.textAlign = 'center';
  ctx.fillStyle = '#1e293b';
  ctx.font = `700 34px ${SHARE_FONT_FAMILY}`;
  ctx.fillText('読み取って取り込む', SHARE_IMAGE_WIDTH / 2, qrCardY + qrCardSize + 56);
  ctx.textAlign = 'left';

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
  const hasMasterMissing = React.useMemo(
    () => props.detail.charts.some((chart) => chart.resolveIssue === 'MASTER_MISSING'),
    [props.detail.charts],
  );
  const hasChartNotFound = React.useMemo(
    () => props.detail.charts.some((chart) => chart.resolveIssue === 'CHART_NOT_FOUND'),
    [props.detail.charts],
  );
  const showChartResolveAlert = hasMasterMissing || hasChartNotFound;

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

    void buildShareImage(props.detail, shareUrl)
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
  }, [props.detail, shareDialogOpen, shareUrl]);

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
        {showChartResolveAlert ? (
          <Alert
            severity="warning"
            sx={{ mb: 1.5 }}
            action={
              <Button size="small" color="inherit" onClick={props.onOpenSettings}>
                曲データ更新
              </Button>
            }
          >
            ⚠ 一部譜面が曲データと一致しません。
          </Alert>
        ) : null}
        <ul className="chartList">
          {props.detail.charts.map((chart) => {
            const levelLabel = resolveLevelLabel(chart.level);
            const chartStatus = resolveChartTaskStatus(chart);
            return (
              <li key={chart.chartId}>
                <button
                  className={`chartListItem ${chartStatus.status === 'pending' ? 'chartListItemPending' : ''}`}
                  onClick={() => props.onOpenSubmit(chart.chartId)}
                >
                  <div className="chartText">
                    <strong className="chartTitle">{chart.title}</strong>
                    <div className="chartMetaLine">
                      <span className="chartPlayStyleText">{chart.playStyle}</span>
                      {difficultyTag(chart)}
                      <span className="chartLevelTag">Lv{levelLabel ?? '?'}</span>
                    </div>
                  </div>
                  <span className={`chartSubmitLabel ${chartStatus.status}`}>{chartStatus.label}</span>
                  <span className="arrow" aria-hidden>
                    ›
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
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

    </div>
  );
}

