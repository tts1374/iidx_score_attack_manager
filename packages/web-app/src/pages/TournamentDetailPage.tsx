import React from 'react';
import { PAYLOAD_VERSION, encodeTournamentPayload, formatHashtagForDisplay, normalizeHashtag } from '@iidx/shared';
import type { TournamentDetailChart, TournamentDetailItem } from '@iidx/db';
import QRCode from 'qrcode';
import { useTranslation } from 'react-i18next';
import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
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
  Snackbar,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

import { useAppServices } from '../services/context';
import { ChartCard } from '../components/ChartCard';
import { toSafeArrayBuffer } from '../utils/image';
import { buildImportUrl } from '../utils/payload-url';
import { difficultyColor } from '../utils/iidx';
import { resolveTournamentCardStatus } from '../utils/tournament-status';
import { TournamentSummaryCard } from '../components/TournamentSummaryCard';

interface TournamentDetailPageProps {
  detail: TournamentDetailItem;
  todayDate: string;
  onOpenSubmit: (chartId: number) => void;
  onUpdated: () => Promise<void> | void;
  onOpenSettings: () => void;
  debugModeEnabled: boolean;
  debugLastError: string | null;
  onReportDebugError: (errorMessage: string | null) => void;
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

type SubmitToast = ShareNotice & {
  undoChartIds?: number[];
};

type SharePosterChart = {
  chart: TournamentDetailChart;
  levelLabel: string;
};

type ChartShareState = 'unregistered' | 'unshared' | 'shared';
type TranslationFn = (...args: any[]) => any;

function optionalHashtag(value: string): string | null {
  const formatted = formatHashtagForDisplay(value);
  return formatted.length > 0 ? formatted : null;
}

function resolveShareHashtag(value: string): string {
  const normalized = normalizeHashtag(value);
  return normalized.length > 0 ? normalized : 'IIDX';
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

function resolveChartLevelText(level: string): string {
  const levelLabel = resolveLevelLabel(level);
  if (levelLabel) {
    return levelLabel;
  }
  const trimmed = String(level ?? '').trim();
  if (trimmed.length > 0 && trimmed !== '-') {
    return trimmed;
  }
  return '?';
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

function hasEvidence(chart: TournamentDetailChart): boolean {
  return chart.updateSeq > 0 && !chart.fileDeleted;
}

function resolveChartLocalSaved(chart: TournamentDetailChart): boolean {
  return hasEvidence(chart);
}

function resolveChartSubmitted(localSaved: boolean, needsSend: boolean): boolean {
  return localSaved && !needsSend;
}

function resolveChartShareState(localSaved: boolean, submitted: boolean): ChartShareState {
  if (!localSaved) {
    return 'unregistered';
  }
  return submitted ? 'shared' : 'unshared';
}

function resolveChartTaskStatus(
  chart: TournamentDetailChart,
  localSaved: boolean,
  t: TranslationFn,
): {
  actionLabel: string;
  actionTone: 'primary' | 'secondary';
  errorText: string | null;
} {
  const registerAction = localSaved ? t('tournament_detail.action.replace') : t('tournament_detail.action.register');
  const actionTone: 'primary' | 'secondary' = localSaved ? 'secondary' : 'primary';
  if (chart.resolveIssue === 'MASTER_MISSING') {
    return {
      actionLabel: registerAction,
      actionTone,
      errorText: t('tournament_detail.chart.resolve_issue.master_missing'),
    };
  }
  if (chart.resolveIssue === 'CHART_NOT_FOUND') {
    return {
      actionLabel: registerAction,
      actionTone,
      errorText: t('tournament_detail.chart.resolve_issue.chart_not_found'),
    };
  }
  return {
    actionLabel: registerAction,
    actionTone,
    errorText: null,
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

function loadImage(src: string, t: TranslationFn): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(t('tournament_detail.share_dialog.error.qr_image_load_failed')));
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

function resolveSharePosterCharts(detail: TournamentDetailItem, t: TranslationFn): SharePosterChart[] {
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
    throw new Error(t('tournament_detail.share_dialog.error.unresolved_level'));
  }

  if (rows.length === 0) {
    throw new Error(t('tournament_detail.share_dialog.error.no_visible_charts'));
  }

  return rows.slice(0, 4);
}

function toPngBlob(canvas: HTMLCanvasElement, t: TranslationFn): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error(t('tournament_detail.share_dialog.error.png_generation_failed')));
          return;
        }
        resolve(blob);
      },
      'image/png',
      1,
    );
  });
}

async function buildShareImage(detail: TournamentDetailItem, shareUrl: string, t: TranslationFn): Promise<Blob> {
  const posterCharts = resolveSharePosterCharts(detail, t);

  const canvas = document.createElement('canvas');
  canvas.width = SHARE_IMAGE_WIDTH;
  canvas.height = SHARE_IMAGE_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error(t('tournament_detail.share_dialog.error.canvas_context_unavailable'));
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
  ctx.fillText(
    trimTextToWidth(ctx, t('tournament_detail.share_image.owner', { owner: detail.owner }), innerWidth),
    innerX,
    headerCursorY + 12,
  );
  headerCursorY += 68;

  ctx.fillStyle = '#1e293b';
  ctx.font = `700 40px ${SHARE_FONT_FAMILY}`;
  ctx.fillText(
    t('tournament_detail.summary.period_with_space', { start: detail.startDate, end: detail.endDate }),
    innerX,
    headerCursorY + 8,
  );

  ctx.fillStyle = '#0f172a';
  ctx.font = `800 48px ${SHARE_FONT_FAMILY}`;
  ctx.fillText(t('tournament_detail.share_image.chart_heading'), innerX, chartTop + 52);

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

    const levelText = t('tournament_detail.chart.level', { level: entry.levelLabel });
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
  const qrImage = await loadImage(qrDataUrl, t);
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
  ctx.fillText(t('tournament_detail.share_image.import_hint'), SHARE_IMAGE_WIDTH / 2, qrCardY + qrCardSize + 56);
  ctx.textAlign = 'left';

  return toPngBlob(canvas, t);
}

export function TournamentDetailPage(props: TournamentDetailPageProps): JSX.Element {
  const { appDb, opfs } = useAppServices();
  const { t } = useTranslation();
  const [shareDialogOpen, setShareDialogOpen] = React.useState(false);
  const [shareImageStatus, setShareImageStatus] = React.useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [shareImageBlob, setShareImageBlob] = React.useState<Blob | null>(null);
  const [shareImagePreviewUrl, setShareImagePreviewUrl] = React.useState<string | null>(null);
  const [shareNotice, setShareNotice] = React.useState<ShareNotice | null>(null);
  const [manualCopyVisible, setManualCopyVisible] = React.useState(false);
  const [previewZoomOpen, setPreviewZoomOpen] = React.useState(false);
  const [submitDialogOpen, setSubmitDialogOpen] = React.useState(false);
  const [submitBusy, setSubmitBusy] = React.useState(false);
  const [submitUndoBusy, setSubmitUndoBusy] = React.useState(false);
  const [submitToast, setSubmitToast] = React.useState<SubmitToast | null>(null);
  const [submitToastOpen, setSubmitToastOpen] = React.useState(false);
  const [needsSendOverrides, setNeedsSendOverrides] = React.useState<Record<number, boolean>>({});

  const payload = React.useMemo(() => {
    const normalizedPayloadHashtag = normalizeHashtag(props.detail.hashtag) || 'IIDX';
    const charts = props.detail.charts.map((chart) => chart.chartId);
    return encodeTournamentPayload({
      v: PAYLOAD_VERSION,
      uuid: props.detail.sourceTournamentUuid ?? props.detail.tournamentUuid,
      name: props.detail.tournamentName,
      owner: props.detail.owner,
      hashtag: normalizedPayloadHashtag,
      start: props.detail.startDate,
      end: props.detail.endDate,
      charts,
    });
  }, [props.detail]);

  const shareUrl = React.useMemo(() => buildImportUrl(payload), [payload]);
  const payloadSizeBytes = React.useMemo(() => new TextEncoder().encode(payload).length, [payload]);
  const shareHashtag = React.useMemo(() => resolveShareHashtag(props.detail.hashtag), [props.detail.hashtag]);
  const shareText = React.useMemo(() => `#${shareHashtag} ${shareUrl} `, [shareHashtag, shareUrl]);
  const submitMessageText = React.useMemo(() => `#${shareHashtag} `, [shareHashtag]);
  const statusInfo = React.useMemo(
    () => resolveTournamentCardStatus(props.detail.startDate, props.detail.endDate, props.todayDate),
    [props.detail.endDate, props.detail.startDate, props.todayDate],
  );
  const hasMasterMissing = React.useMemo(
    () => props.detail.charts.some((chart) => chart.resolveIssue === 'MASTER_MISSING'),
    [props.detail.charts],
  );
  const hasChartNotFound = React.useMemo(
    () => props.detail.charts.some((chart) => chart.resolveIssue === 'CHART_NOT_FOUND'),
    [props.detail.charts],
  );
  const showChartResolveAlert = hasMasterMissing || hasChartNotFound;
  const resolveNeedsSend = React.useCallback(
    (chart: TournamentDetailChart): boolean => {
      if (Object.prototype.hasOwnProperty.call(needsSendOverrides, chart.chartId)) {
        return needsSendOverrides[chart.chartId] === true;
      }
      return chart.needsSend;
    },
    [needsSendOverrides],
  );
  const showSubmitToast = React.useCallback((next: SubmitToast) => {
    setSubmitToast(next);
    setSubmitToastOpen(true);
  }, []);
  const closeSubmitToast = React.useCallback((_: Event | React.SyntheticEvent, reason?: string) => {
    if (reason === 'clickaway') {
      return;
    }
    setSubmitToastOpen(false);
  }, []);
  const chartStateCounts = React.useMemo(() => {
    let shared = 0;
    let unshared = 0;
    let unregistered = 0;
    props.detail.charts.forEach((chart) => {
      const chartNeedsSend = resolveNeedsSend(chart);
      const localSaved = resolveChartLocalSaved(chart);
      const submitted = resolveChartSubmitted(localSaved, chartNeedsSend);
      const state = resolveChartShareState(localSaved, submitted);
      if (state === 'shared') {
        shared += 1;
        return;
      }
      if (state === 'unshared') {
        unshared += 1;
        return;
      }
      unregistered += 1;
    });
    return {
      shared,
      unshared,
      unregistered,
    };
  }, [props.detail.charts, resolveNeedsSend]);
  const localSavedCharts = React.useMemo(
    () => props.detail.charts.filter((chart) => resolveChartLocalSaved(chart)),
    [props.detail.charts],
  );
  const unsubmittedLocalCharts = React.useMemo(
    () => localSavedCharts.filter((chart) => resolveNeedsSend(chart)),
    [localSavedCharts, resolveNeedsSend],
  );
  const submitMode = React.useMemo<'none' | 'submit' | 'resubmit'>(() => {
    if (localSavedCharts.length === 0) {
      return 'none';
    }
    if (unsubmittedLocalCharts.length > 0) {
      return 'submit';
    }
    return 'resubmit';
  }, [localSavedCharts.length, unsubmittedLocalCharts.length]);
  const submitTargetCharts = React.useMemo(
    () => (submitMode === 'submit' ? unsubmittedLocalCharts : submitMode === 'resubmit' ? localSavedCharts : []),
    [localSavedCharts, submitMode, unsubmittedLocalCharts],
  );
  const submitTargetChartIds = React.useMemo(() => submitTargetCharts.map((chart) => chart.chartId), [submitTargetCharts]);
  const sendPendingCount = chartStateCounts.unshared;
  const localSavedCount = localSavedCharts.length;
  const submitSummaryText = t('tournament_detail.summary.state_counts', {
    shared: chartStateCounts.shared,
    unshared: chartStateCounts.unshared,
    unregistered: chartStateCounts.unregistered,
  });
  const submitButtonLabel = submitMode === 'resubmit' ? t('tournament_detail.action.resubmit') : t('tournament_detail.action.submit');
  const submitDialogConfirmText =
    submitMode === 'resubmit'
      ? t('tournament_detail.submit_dialog.confirm_message_resubmit', { count: submitTargetChartIds.length })
      : t('tournament_detail.submit_dialog.confirm_message_submit', { count: submitTargetChartIds.length });
  const isActivePeriod = statusInfo.status.startsWith('active');
  const canOpenSubmitDialog = submitTargetChartIds.length > 0;
  const shareUnavailable = shareImageStatus !== 'ready' || !shareImageBlob;

  React.useEffect(() => {
    setNeedsSendOverrides({});
  }, [props.detail]);

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
    setPreviewZoomOpen(false);

    void buildShareImage(props.detail, shareUrl, t)
      .then((blob) => {
        if (!active) {
          return;
        }
        const previewUrl = URL.createObjectURL(blob);
        setShareImageBlob(blob);
        setShareImagePreviewUrl(previewUrl);
        setShareImageStatus('ready');
        props.onReportDebugError(null);
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        setShareImageStatus('error');
        setShareImageBlob(null);
        const message =
          error instanceof Error ? error.message : t('tournament_detail.share_dialog.notice.image_generation_failed');
        setShareNotice({ severity: 'error', text: message });
        props.onReportDebugError(message);
      });

    return () => {
      active = false;
    };
  }, [props, shareDialogOpen, shareUrl, t]);

  React.useEffect(() => {
    return () => {
      if (shareImagePreviewUrl) {
        URL.revokeObjectURL(shareImagePreviewUrl);
      }
    };
  }, [shareImagePreviewUrl]);

  const exportImage = React.useCallback(() => {
    if (!shareImageBlob) {
      return;
    }
    const url = URL.createObjectURL(shareImageBlob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${safeFileName(props.detail.tournamentName)}-share.png`;
    anchor.click();
    URL.revokeObjectURL(url);
    setShareNotice({ severity: 'success', text: t('tournament_detail.share_dialog.notice.image_saved') });
  }, [props.detail.tournamentName, shareImageBlob, t]);

  const shareByWebShareApi = React.useCallback(async () => {
    if (!shareImageBlob) {
      return;
    }
    if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') {
      setShareNotice({
        severity: 'warning',
        text: t('tournament_detail.share_dialog.notice.share_unsupported_use_export'),
      });
      return;
    }

    const shareFile = new File([shareImageBlob], `${safeFileName(props.detail.tournamentName)}-share.png`, {
      type: 'image/png',
    });
    if (!navigator.canShare({ files: [shareFile] })) {
      setShareNotice({
        severity: 'warning',
        text: t('tournament_detail.share_dialog.notice.share_unsupported_use_export'),
      });
      return;
    }

    try {
      await navigator.share({
        title: props.detail.tournamentName,
        text: shareText,
        files: [shareFile],
      });
      setShareNotice({ severity: 'success', text: t('tournament_detail.share_dialog.notice.share_executed') });
      props.onReportDebugError(null);
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setShareNotice({ severity: 'info', text: t('tournament_detail.notice.share_canceled') });
        return;
      }
      const message = t('tournament_detail.share_dialog.notice.share_failed_use_export');
      setShareNotice({
        severity: 'error',
        text: message,
      });
      props.onReportDebugError(message);
    }
  }, [props, shareImageBlob, shareText, t]);

  const copyShareText = React.useCallback(async () => {
    try {
      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
        throw new Error('clipboard unavailable');
      }
      await navigator.clipboard.writeText(shareText);
      setManualCopyVisible(false);
      setShareNotice({ severity: 'success', text: t('tournament_detail.share_dialog.notice.text_copied') });
    } catch {
      setManualCopyVisible(true);
      setShareNotice({
        severity: 'warning',
        text: t('tournament_detail.share_dialog.notice.auto_copy_failed'),
      });
    }
  }, [shareText, t]);

  const copyShareDebugLog = React.useCallback(async () => {
    const debugInfo = JSON.stringify(
      {
        tournament_uuid: props.detail.tournamentUuid,
        source_tournament_uuid: props.detail.sourceTournamentUuid,
        def_hash: props.detail.defHash,
        payload_size_bytes: payloadSizeBytes,
        last_error: props.debugLastError,
      },
      null,
      2,
    );
    try {
      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
        throw new Error('clipboard unavailable');
      }
      await navigator.clipboard.writeText(debugInfo);
      setShareNotice({ severity: 'success', text: t('tournament_detail.share_dialog.notice.debug_log_copied') });
    } catch {
      setShareNotice({ severity: 'error', text: t('tournament_detail.share_dialog.notice.debug_log_copy_failed') });
    }
  }, [payloadSizeBytes, props.debugLastError, props.detail.defHash, props.detail.sourceTournamentUuid, props.detail.tournamentUuid, t]);

  const openShareDialog = React.useCallback(() => {
    setShareDialogOpen(true);
    setShareNotice(null);
    setManualCopyVisible(false);
    setPreviewZoomOpen(false);
  }, []);

  const closeShareDialog = React.useCallback(() => {
    setShareDialogOpen(false);
    setShareNotice(null);
    setManualCopyVisible(false);
    setShareImageStatus('idle');
    setShareImageBlob(null);
    setShareImagePreviewUrl(null);
    setPreviewZoomOpen(false);
  }, []);

  const collectSubmissionFiles = React.useCallback(async (targetCharts: TournamentDetailChart[]): Promise<File[]> => {
    const files: File[] = [];
    for (const chart of targetCharts) {
      const evidence = await appDb.getEvidenceRecord(props.detail.tournamentUuid, chart.chartId);
      if (!evidence || evidence.fileDeleted) {
        continue;
      }
      const relativePath = await appDb.getEvidenceRelativePath(props.detail.tournamentUuid, chart.chartId);
      const bytes = await opfs.readFile(relativePath);
      const fileName = `${safeFileName(chart.title)}-${chart.chartId}.jpg`;
      files.push(new File([toSafeArrayBuffer(bytes)], fileName, { type: 'image/jpeg' }));
    }
    if (files.length === 0) {
      throw new Error(t('tournament_detail.submit_dialog.error.no_sendable_images'));
    }
    return files;
  }, [appDb, opfs, props.detail.tournamentUuid, t]);

  const copyTextToClipboard = React.useCallback(async (value: string): Promise<boolean> => {
    try {
      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
        return false;
      }
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      return false;
    }
  }, []);

  const downloadFiles = React.useCallback((files: File[]) => {
    files.forEach((file) => {
      const url = URL.createObjectURL(file);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = file.name;
      anchor.click();
      URL.revokeObjectURL(url);
    });
  }, []);

  const markChartsAsShared = React.useCallback(
    async (chartIds: number[], options?: { allowUndo?: boolean }) => {
      await appDb.markEvidenceSendCompleted(props.detail.tournamentUuid, chartIds);
      setNeedsSendOverrides((current) => {
        const next = { ...current };
        chartIds.forEach((chartId) => {
          next[chartId] = false;
        });
        return next;
      });
      await Promise.resolve(props.onUpdated());
      showSubmitToast({
        severity: 'success',
        text: t('tournament_detail.submit_dialog.notice.marked_shared'),
        ...(options?.allowUndo === false ? {} : { undoChartIds: [...chartIds] }),
      });
      props.onReportDebugError(null);
    },
    [appDb, props, showSubmitToast, t],
  );

  const undoLastShare = React.useCallback(async () => {
    const chartIds = submitToast?.undoChartIds;
    if (!chartIds || chartIds.length === 0 || submitUndoBusy) {
      return;
    }
    setSubmitUndoBusy(true);
    try {
      await appDb.markEvidenceSendPending(props.detail.tournamentUuid, chartIds);
      setNeedsSendOverrides((current) => {
        const next = { ...current };
        chartIds.forEach((chartId) => {
          next[chartId] = true;
        });
        return next;
      });
      await Promise.resolve(props.onUpdated());
      showSubmitToast({ severity: 'success', text: t('tournament_detail.submit_dialog.notice.undo_applied') });
      props.onReportDebugError(null);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('tournament_detail.submit_dialog.notice.undo_failed');
      showSubmitToast({ severity: 'error', text: message });
      props.onReportDebugError(message);
    } finally {
      setSubmitUndoBusy(false);
    }
  }, [appDb, props, showSubmitToast, submitToast?.undoChartIds, submitUndoBusy, t]);

  const sharePendingEvidence = React.useCallback(async () => {
    if (submitBusy) {
      return;
    }
    if (submitTargetChartIds.length === 0) {
      showSubmitToast({ severity: 'info', text: t('tournament_detail.submit_dialog.notice.no_local_saved') });
      return;
    }

    setSubmitDialogOpen(false);
    setSubmitBusy(true);
    const targetCharts = [...submitTargetCharts];
    const targetChartIds = targetCharts.map((chart) => chart.chartId);
    const allowUndo = submitMode === 'submit';
    try {
      const files = await collectSubmissionFiles(targetCharts);
      const webShareSupported =
        typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files });

      if (webShareSupported) {
        try {
          await navigator.share({
            title: props.detail.tournamentName,
            text: submitMessageText,
            files,
          });
          await markChartsAsShared(targetChartIds, { allowUndo });
          return;
        } catch (error: unknown) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            showSubmitToast({ severity: 'info', text: t('tournament_detail.notice.share_canceled') });
            return;
          }
        }
      }

      downloadFiles(files);
      const copied = await copyTextToClipboard(submitMessageText);
      if (!copied) {
        const message = t('tournament_detail.submit_dialog.notice.fallback_copy_failed');
        showSubmitToast({ severity: 'warning', text: message });
        props.onReportDebugError(message);
        return;
      }
      await markChartsAsShared(targetChartIds, { allowUndo });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('tournament_detail.submit_dialog.notice.share_images_failed');
      showSubmitToast({ severity: 'error', text: message });
      props.onReportDebugError(message);
    } finally {
      setSubmitBusy(false);
    }
  }, [
    collectSubmissionFiles,
    copyTextToClipboard,
    downloadFiles,
    markChartsAsShared,
    props,
    showSubmitToast,
    submitMode,
    submitBusy,
    submitTargetChartIds,
    submitTargetCharts,
    submitMessageText,
    t,
  ]);

  return (
    <div className="page detailPageWithSubmitBar">
      <TournamentSummaryCard
        variant="detail"
        title={props.detail.tournamentName}
        startDate={props.detail.startDate}
        endDate={props.detail.endDate}
        todayDate={props.todayDate}
        periodText={t('tournament_detail.summary.period', { start: props.detail.startDate, end: props.detail.endDate })}
        sharedCount={chartStateCounts.shared}
        unsharedCount={chartStateCounts.unshared}
        unregisteredCount={chartStateCounts.unregistered}
        shareAction={
          !props.detail.isImported ? (
            <div className="detailShareArea">
              <button className="detailShareButton" data-testid="tournament-detail-share-button" onClick={openShareDialog}>
                {t('tournament_detail.action.share_tournament')}
              </button>
              <p className="detailShareHint">{t('tournament_detail.share_dialog.definition_only')}</p>
            </div>
          ) : null
        }
      />

      <section>
        <h2>{t('tournament_detail.chart.heading')}</h2>
        {showChartResolveAlert ? (
          <Alert
            severity="warning"
            sx={{ mb: 1.5 }}
            action={
              <Button size="small" color="inherit" onClick={props.onOpenSettings}>
                {t('tournament_detail.action.open_settings')}
              </Button>
            }
          >
            {t('tournament_detail.chart.resolve_issue.mismatch')}
          </Alert>
        ) : null}
        <ul className="chartList">
          {props.detail.charts.map((chart) => {
            const levelText = resolveChartLevelText(chart.level);
            const chartNeedsSend = resolveNeedsSend(chart);
            const localSaved = resolveChartLocalSaved(chart);
            const chartStatus = resolveChartTaskStatus(chart, localSaved, t);
            const submitted = resolveChartSubmitted(localSaved, chartNeedsSend);
            const chartShareState = resolveChartShareState(localSaved, submitted);
            const chartHasIssue = Boolean(chartStatus.errorText);
            return (
              <li key={chart.chartId}>
                <ChartCard
                  title={chart.title}
                  playStyle={chart.playStyle}
                  difficulty={chart.difficulty}
                  level={levelText}
                  status={chartShareState}
                  statusTestId="tournament-detail-chart-status-label"
                  metaTestId="tournament-detail-chart-meta-line"
                  note={chartStatus.errorText}
                  noteClassName="chartResolveIssue"
                  className={chartHasIssue ? 'chartListItemError' : undefined}
                  variant="detail"
                  actions={
                    isActivePeriod ? (
                      <button
                        type="button"
                        className={`chartSubmitButton chartSubmitButton-${chartStatus.actionTone}`}
                        data-testid="tournament-detail-chart-submit-button"
                        data-chart-action-tone={chartStatus.actionTone}
                        onClick={() => props.onOpenSubmit(chart.chartId)}
                      >
                        {chartStatus.actionLabel}
                      </button>
                    ) : null
                  }
                />
              </li>
            );
          })}
        </ul>
      </section>

      <Dialog open={shareDialogOpen} onClose={closeShareDialog} fullWidth maxWidth="sm" data-testid="tournament-detail-share-dialog">
        <DialogTitle sx={{ pr: 6 }}>
          {t('tournament_detail.action.share_tournament')}
          <IconButton
            aria-label={t('tournament_detail.share_dialog.close_aria_label')}
            onClick={closeShareDialog}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ display: 'grid', gap: 2 }}>
          <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                {t('tournament_detail.share_dialog.preview_title')}
              </Typography>
              <Button size="small" onClick={() => setPreviewZoomOpen(true)} disabled={shareImageStatus !== 'ready'}>
                {t('tournament_detail.action.zoom_preview')}
              </Button>
            </Stack>
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
                  alt={t('tournament_detail.share_dialog.preview_alt')}
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
                <Alert severity="error">{t('tournament_detail.share_dialog.preview_generation_failed')}</Alert>
              ) : null}
            </Box>
          </Box>

          <Divider />

          <Box>
            <Button variant="contained" onClick={shareByWebShareApi} disabled={shareUnavailable}>
              {t('common.share')}
            </Button>
          </Box>

          <Divider />

          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>
              {t('tournament_detail.share_dialog.export_title')}
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: manualCopyVisible ? 1.5 : 0 }}>
              <Button variant="outlined" onClick={exportImage} disabled={shareUnavailable}>
                {t('tournament_detail.action.export_image')}
              </Button>
              <Button variant="outlined" onClick={() => void copyShareText()} disabled={shareUnavailable}>
                {t('tournament_detail.action.copy_text')}
              </Button>
            </Box>
            {manualCopyVisible ? (
              <TextField
                fullWidth
                label={t('tournament_detail.share_dialog.share_text_label')}
                value={shareText}
                multiline
                minRows={2}
                InputProps={{ readOnly: true }}
              />
            ) : null}
          </Box>

          {props.debugModeEnabled ? (
            <Accordion
              disableGutters
              elevation={0}
              sx={{ border: '1px solid #e2e8f0', borderRadius: 2 }}
              data-testid="tournament-detail-share-debug-accordion"
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ borderRadius: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  {t('tournament_detail.share_dialog.debug_title')}
                </Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ display: 'grid', gap: 0.75, pt: 0 }}>
                <Typography variant="body2">{t('tournament_detail.share_dialog.debug_payload_size', { value: payloadSizeBytes })}</Typography>
                <Typography variant="body2">{t('tournament_detail.share_dialog.debug_def_hash', { value: props.detail.defHash })}</Typography>
                <Typography variant="body2">
                  {t('tournament_detail.share_dialog.debug_source_tournament_uuid', {
                    value: props.detail.sourceTournamentUuid ?? t('common.not_available'),
                  })}
                </Typography>
                <Typography variant="body2">
                  {t('tournament_detail.share_dialog.debug_last_error', {
                    value: props.debugLastError ?? t('common.not_available'),
                  })}
                </Typography>
                <Button size="small" variant="outlined" onClick={() => void copyShareDebugLog()}>
                  {t('tournament_detail.action.copy_logs')}
                </Button>
              </AccordionDetails>
            </Accordion>
          ) : null}

          {shareNotice ? <Alert severity={shareNotice.severity}>{shareNotice.text}</Alert> : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeShareDialog}>{t('common.close')}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={previewZoomOpen} onClose={() => setPreviewZoomOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>{t('tournament_detail.share_dialog.preview_zoom_title')}</DialogTitle>
        <DialogContent dividers>
          {shareImagePreviewUrl ? (
            <Box
              component="img"
              src={shareImagePreviewUrl}
              alt={t('tournament_detail.share_dialog.preview_zoom_alt')}
              sx={{ width: '100%', display: 'block' }}
            />
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviewZoomOpen(false)}>{t('common.close')}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={submitDialogOpen} onClose={() => setSubmitDialogOpen(false)} fullWidth maxWidth="sm" data-testid="tournament-detail-submit-dialog">
        <DialogTitle>{t('tournament_detail.submit_dialog.title')}</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body1" data-testid="tournament-detail-submit-confirm-text">
            {submitDialogConfirmText}
          </Typography>
          {submitMode === 'resubmit' ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }} data-testid="tournament-detail-submit-resubmit-note">
              {t('tournament_detail.submit_dialog.resubmit_overwrite')}
            </Typography>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSubmitDialogOpen(false)} disabled={submitBusy}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="contained"
            onClick={() => void sharePendingEvidence()}
            disabled={submitBusy || !canOpenSubmitDialog}
            data-testid="tournament-detail-submit-share-button"
          >
            {submitButtonLabel}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={submitToastOpen}
        autoHideDuration={4500}
        onClose={closeSubmitToast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={submitToast?.severity ?? 'info'}
          onClose={(event) => closeSubmitToast(event)}
          sx={{ width: '100%' }}
          action={
            submitToast?.undoChartIds ? (
              <Button
                size="small"
                color="inherit"
                onClick={() => void undoLastShare()}
                disabled={submitUndoBusy}
                data-testid="tournament-detail-submit-undo-button"
              >
                {t('tournament_detail.submit_dialog.undo_action')}
              </Button>
            ) : undefined
          }
        >
          {submitToast?.text ?? ''}
        </Alert>
      </Snackbar>

      <footer className="detailSubmitBar">
        <div className="detailSubmitBarInner">
          {localSavedCount > 0 ? (
            <button
              type="button"
              className={`detailSubmitPrimaryButton ${submitMode === 'submit' && canOpenSubmitDialog ? 'emphasis' : ''}`}
              data-testid="tournament-detail-submit-open-button"
              onClick={() => {
                if (!canOpenSubmitDialog) {
                  return;
                }
                setSubmitDialogOpen(true);
              }}
              disabled={!canOpenSubmitDialog}
            >
              {submitButtonLabel}
            </button>
          ) : null}
          <p className="detailSubmitSubInfo" data-testid="tournament-detail-submit-summary-text" data-send-pending-count={sendPendingCount}>
            {submitSummaryText}
          </p>
        </div>
      </footer>
    </div>
  );
}
