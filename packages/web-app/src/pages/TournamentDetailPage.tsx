import React from 'react';
import { PAYLOAD_VERSION, encodeTournamentPayload, formatHashtagForDisplay, normalizeHashtag } from '@iidx/shared';
import type { TournamentDetailChart, TournamentDetailItem } from '@iidx/db';
import QRCode from 'qrcode';
import { useTranslation } from 'react-i18next';
import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useTheme } from '@mui/material/styles';
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
import useMediaQuery from '@mui/material/useMediaQuery';

import { useAppServices } from '../services/context';
import { ChartCard } from '../components/ChartCard';
import { toSafeArrayBuffer } from '../utils/image';
import { buildImportUrl } from '../utils/payload-url';
import { difficultyColorHex } from '../utils/iidx';
import { resolveTournamentCardStatus } from '../utils/tournament-status';
import { TournamentSummaryCard } from '../components/TournamentSummaryCard';

export type TournamentDetailReturnReason = 'back' | 'saved' | 'replaced' | 'shared';

export interface TournamentDetailReturnSignal {
  token: string;
  tournamentUuid: string;
  returnReason: TournamentDetailReturnReason;
  changedChartId?: string;
  changedCount?: number;
  progressChanged?: boolean;
}

interface TournamentDetailPageProps {
  detail: TournamentDetailItem;
  todayDate: string;
  onOpenSubmit: (chartId: number) => void;
  onUpdated: () => Promise<void> | void;
  onOpenSettings: () => void;
  debugModeEnabled: boolean;
  debugLastError: string | null;
  onReportDebugError: (errorMessage: string | null) => void;
  returnSignal?: TournamentDetailReturnSignal | null;
  onConsumeReturnSignal?: (token: string) => void;
  prefersReducedMotion?: boolean;
}

const SHARE_IMAGE_WIDTH = 1200;
const SHARE_IMAGE_HEIGHT = 1600;
const SHARE_BACKGROUND_MARGIN_X = 100;
const SHARE_BACKGROUND_MARGIN_Y = 50;
const SHARE_LAYOUT_MARGIN = 30;
const SHARE_LAYOUT_WIDTH = SHARE_IMAGE_WIDTH - SHARE_BACKGROUND_MARGIN_X * 2 - SHARE_LAYOUT_MARGIN * 2;
const SHARE_LAYOUT_HEIGHT = SHARE_IMAGE_HEIGHT - SHARE_BACKGROUND_MARGIN_Y * 2 - SHARE_LAYOUT_MARGIN * 2;
const SHARE_BLOCK_TITLE_HEIGHT = 200;
const SHARE_BLOCK_PERIOD_HEIGHT = 80;
const SHARE_BLOCK_CHART_HEIGHT = 640;
const SHARE_BLOCK_QR_HEIGHT = 480;
const SHARE_BLOCK_HASHTAG_HEIGHT = 40;
const SHARE_CHART_MAX_ROWS = 4;
const SHARE_CHART_ROW_HEIGHT = 160;
const SHARE_CHART_LEFT_COLUMN_WIDTH = 190;
const SHARE_QR_SIZE = 440;
const SHARE_QR_CARD_PADDING = 8;
const SHARE_FONT_FAMILY = '"Segoe UI", "Noto Sans JP", sans-serif';
const SHARE_DIFFICULTY_SHORT_MAP: Record<string, string> = {
  BEGINNER: 'B',
  NORMAL: 'N',
  HYPER: 'H',
  ANOTHER: 'A',
  LEGGENDARIA: 'L',
};

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
type ChartStateCounts = { shared: number; unshared: number; unregistered: number };
type TranslationFn = (...args: any[]) => any;

function hasChartStateCountChanged(previous: ChartStateCounts, next: ChartStateCounts): boolean {
  return (
    previous.shared !== next.shared ||
    previous.unshared !== next.unshared ||
    previous.unregistered !== next.unregistered
  );
}

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

function resolveChartShortCode(chart: TournamentDetailChart): string {
  const playStyle = chart.playStyle === 'DP' ? 'DP' : 'SP';
  const difficultyKey = String(chart.difficulty ?? '')
    .trim()
    .toUpperCase();
  const difficultyShort = SHARE_DIFFICULTY_SHORT_MAP[difficultyKey];
  if (difficultyShort) {
    return `${playStyle}${difficultyShort}`;
  }
  const fallback = difficultyKey.length > 0 ? difficultyKey[0] : '?';
  return `${playStyle}${fallback}`;
}

function parseHexColor(color: string): { r: number; g: number; b: number } | null {
  const hex = color.trim().replace('#', '');
  const normalized = hex.length === 3 ? hex.split('').map((char) => `${char}${char}`).join('') : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return null;
  }
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function resolveReadableOutlineColor(textColor: string): string | null {
  const rgb = parseHexColor(textColor);
  if (!rgb) {
    return 'rgba(15, 23, 42, 0.55)';
  }
  const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  if (luminance >= 0.72) {
    return 'rgba(15, 23, 42, 0.55)';
  }
  if (luminance <= 0.28) {
    return 'rgba(255, 255, 255, 0.75)';
  }
  return null;
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
  for (let fontSize = 68; fontSize >= 44; fontSize -= 4) {
    ctx.font = `800 ${fontSize}px ${SHARE_FONT_FAMILY}`;
    const lines = wrapText(ctx, title, maxWidth, 2);
    const hasEllipsis = lines.some((line) => line.endsWith('…'));
    if (!hasEllipsis) {
      return {
        lines,
        fontSize,
        lineHeight: fontSize + 8,
      };
    }
  }
  const fallbackFontSize = 44;
  ctx.font = `800 ${fallbackFontSize}px ${SHARE_FONT_FAMILY}`;
  return {
    lines: wrapText(ctx, title, maxWidth, 2),
    fontSize: fallbackFontSize,
    lineHeight: fallbackFontSize + 8,
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

  return rows;
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
  const posterCharts = resolveSharePosterCharts(detail, t).slice(0, SHARE_CHART_MAX_ROWS);

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
  background.addColorStop(0.42, '#1E3A8A');
  background.addColorStop(1, '#111827');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, SHARE_IMAGE_WIDTH, SHARE_IMAGE_HEIGHT);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.beginPath();
  ctx.arc(190, 220, 190, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(1020, 380, 280, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(1010, 1400, 260, 0, Math.PI * 2);
  ctx.fill();

  const panelX = SHARE_BACKGROUND_MARGIN_X;
  const panelY = SHARE_BACKGROUND_MARGIN_Y;
  const panelWidth = SHARE_IMAGE_WIDTH - SHARE_BACKGROUND_MARGIN_X * 2;
  const panelHeight = SHARE_IMAGE_HEIGHT - SHARE_BACKGROUND_MARGIN_Y * 2;
  fillRoundedRect(ctx, panelX, panelY, panelWidth, panelHeight, 40, 'rgba(248, 250, 252, 0.9)');

  const layoutX = panelX + SHARE_LAYOUT_MARGIN;
  const layoutY = panelY + SHARE_LAYOUT_MARGIN;
  const layoutBottom = layoutY + SHARE_LAYOUT_HEIGHT;
  const hashtagBlockTop = layoutBottom - SHARE_BLOCK_HASHTAG_HEIGHT;
  const qrBlockTop = hashtagBlockTop - SHARE_BLOCK_QR_HEIGHT;
  const chartBlockTop = qrBlockTop - SHARE_BLOCK_CHART_HEIGHT;
  const periodBlockTop = chartBlockTop - SHARE_BLOCK_PERIOD_HEIGHT;
  const titleBlockTop = periodBlockTop - SHARE_BLOCK_TITLE_HEIGHT;

  const titleLayout = resolveTitleLayout(ctx, detail.tournamentName, SHARE_LAYOUT_WIDTH);
  const titleAreaTop = titleBlockTop + 26;
  const titleAreaBottom = titleBlockTop + SHARE_BLOCK_TITLE_HEIGHT - 12;
  const titleAreaHeight = titleAreaBottom - titleAreaTop;
  const titleTextHeight = titleLayout.lines.length * titleLayout.lineHeight;
  const titleStartY = titleAreaTop + Math.max(0, Math.floor((titleAreaHeight - titleTextHeight) / 2));

  ctx.fillStyle = '#0f172a';
  ctx.font = `800 ${titleLayout.fontSize}px ${SHARE_FONT_FAMILY}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  titleLayout.lines.forEach((line, lineIndex) => {
    ctx.fillText(line, layoutX, titleStartY + lineIndex * titleLayout.lineHeight);
  });

  ctx.fillStyle = '#1e293b';
  ctx.font = `700 34px ${SHARE_FONT_FAMILY}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(
    trimTextToWidth(
      ctx,
      t('tournament_detail.summary.period_with_space', { start: detail.startDate, end: detail.endDate }),
      SHARE_LAYOUT_WIDTH,
    ),
    layoutX,
    periodBlockTop + SHARE_BLOCK_PERIOD_HEIGHT / 2,
  );

  const renderedRowCount = posterCharts.length;
  const chartRowsHeight = renderedRowCount * SHARE_CHART_ROW_HEIGHT;
  const chartRowsTop = chartBlockTop + Math.floor((SHARE_BLOCK_CHART_HEIGHT - chartRowsHeight) / 2);

  posterCharts.forEach((chartRow, rowIndex) => {
    const rowTop = chartRowsTop + rowIndex * SHARE_CHART_ROW_HEIGHT;

    ctx.fillStyle = rowIndex % 2 === 0 ? 'rgba(255, 255, 255, 0.64)' : 'rgba(255, 255, 255, 0.56)';
    ctx.fillRect(layoutX, rowTop, SHARE_LAYOUT_WIDTH, SHARE_CHART_ROW_HEIGHT);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.06)';
    ctx.fillRect(layoutX, rowTop, SHARE_CHART_LEFT_COLUMN_WIDTH, SHARE_CHART_ROW_HEIGHT);
    ctx.fillStyle = 'rgba(100, 116, 139, 0.24)';
    ctx.fillRect(layoutX + SHARE_CHART_LEFT_COLUMN_WIDTH, rowTop + 10, 1, SHARE_CHART_ROW_HEIGHT - 20);

    const shortCode = resolveChartShortCode(chartRow.chart);
    const levelColor = difficultyColorHex(chartRow.chart.difficulty);
    const leftCenterX = layoutX + SHARE_CHART_LEFT_COLUMN_WIDTH / 2;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#334155';
    ctx.font = `800 36px ${SHARE_FONT_FAMILY}`;
    ctx.fillText(shortCode, leftCenterX, rowTop + SHARE_CHART_ROW_HEIGHT * 0.3);

    ctx.font = `900 62px ${SHARE_FONT_FAMILY}`;
    const levelOutlineColor = resolveReadableOutlineColor(levelColor);
    if (levelOutlineColor) {
      ctx.strokeStyle = levelOutlineColor;
      ctx.lineWidth = 2;
      ctx.strokeText(chartRow.levelLabel, leftCenterX, rowTop + SHARE_CHART_ROW_HEIGHT * 0.73);
    }
    ctx.fillStyle = levelColor;
    ctx.fillText(chartRow.levelLabel, leftCenterX, rowTop + SHARE_CHART_ROW_HEIGHT * 0.73);

    const titleX = layoutX + SHARE_CHART_LEFT_COLUMN_WIDTH + 18;
    const titleWidth = SHARE_LAYOUT_WIDTH - SHARE_CHART_LEFT_COLUMN_WIDTH - 26;

    ctx.fillStyle = '#0f172a';
    const oneLineFontSize = 42;
    const twoLineFontSize = 34;
    ctx.font = `700 ${oneLineFontSize}px ${SHARE_FONT_FAMILY}`;
    let titleFontSize = oneLineFontSize;
    let titleLines = wrapText(ctx, chartRow.chart.title, titleWidth, 2);

    if (titleLines.length === 1) {
      const boostedFontSize = 46;
      ctx.font = `700 ${boostedFontSize}px ${SHARE_FONT_FAMILY}`;
      const boostedTitleLines = wrapText(ctx, chartRow.chart.title, titleWidth, 2);
      if (boostedTitleLines.length === 1) {
        titleFontSize = boostedFontSize;
        titleLines = boostedTitleLines;
      }
    } else {
      ctx.font = `700 ${twoLineFontSize}px ${SHARE_FONT_FAMILY}`;
      titleFontSize = twoLineFontSize;
      titleLines = wrapText(ctx, chartRow.chart.title, titleWidth, 2);
    }

    ctx.font = `700 ${titleFontSize}px ${SHARE_FONT_FAMILY}`;
    const titleLineHeight = titleLines.length === 1 ? Math.round(titleFontSize * 1.02) : Math.round(titleFontSize * 0.82);
    const titleTextHeight = titleLines.length * titleLineHeight;
    const titleY = rowTop + Math.max(0, Math.floor((SHARE_CHART_ROW_HEIGHT - titleTextHeight) / 2));
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    titleLines.forEach((line, lineIndex) => {
      ctx.fillText(line, titleX, titleY + lineIndex * titleLineHeight);
    });
  });

  const qrCardSize = SHARE_QR_SIZE + SHARE_QR_CARD_PADDING * 2;
  const qrCardX = layoutX + Math.round((SHARE_LAYOUT_WIDTH - qrCardSize) / 2);
  const qrCardY = qrBlockTop + Math.floor((SHARE_BLOCK_QR_HEIGHT - qrCardSize) / 2);
  fillRoundedRect(ctx, qrCardX, qrCardY, qrCardSize, qrCardSize, 18, '#ffffff');

  const qrDataUrl = await QRCode.toDataURL(shareUrl, {
    errorCorrectionLevel: 'H',
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

  const hashtagLine = optionalHashtag(detail.hashtag);
  if (hashtagLine) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(51, 65, 85, 0.72)';
    ctx.font = `600 24px ${SHARE_FONT_FAMILY}`;
    ctx.fillText(trimTextToWidth(ctx, hashtagLine, SHARE_LAYOUT_WIDTH), SHARE_IMAGE_WIDTH / 2, hashtagBlockTop + SHARE_BLOCK_HASHTAG_HEIGHT / 2);
  }
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  return toPngBlob(canvas, t);
}

export function TournamentDetailPage(props: TournamentDetailPageProps): JSX.Element {
  const { appDb, opfs } = useAppServices();
  const { t } = useTranslation();
  const theme = useTheme();
  const prefersReducedMotion = props.prefersReducedMotion ?? useMediaQuery('(prefers-reduced-motion: reduce)');
  const prefersDarkColorScheme = useMediaQuery('(prefers-color-scheme: dark)');
  const incomingReturnSignal =
    props.returnSignal && props.returnSignal.tournamentUuid === props.detail.tournamentUuid ? props.returnSignal : null;
  const initialReturnSignal = incomingReturnSignal;
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
  const [chartSubmitLocked, setChartSubmitLocked] = React.useState(false);
  const [footerSubmitLocked, setFooterSubmitLocked] = React.useState(false);
  const [highlightedChartId, setHighlightedChartId] = React.useState<number | null>(null);
  const [statusFadeTokens, setStatusFadeTokens] = React.useState<Record<number, number>>({});
  const [activeReturnSignal, setActiveReturnSignal] = React.useState<TournamentDetailReturnSignal | null>(initialReturnSignal);
  const [summaryProgressAnimationEnabled, setSummaryProgressAnimationEnabled] = React.useState(() => {
    if (prefersReducedMotion) {
      return false;
    }
    if (!initialReturnSignal) {
      return true;
    }
    if (initialReturnSignal.returnReason === 'back') {
      return false;
    }
    if (typeof initialReturnSignal.progressChanged === 'boolean') {
      return initialReturnSignal.progressChanged;
    }
    return initialReturnSignal.returnReason !== 'shared' || (initialReturnSignal.changedCount ?? 0) > 0;
  });
  const chartSubmitLockTimerRef = React.useRef<number | null>(null);
  const footerSubmitLockTimerRef = React.useRef<number | null>(null);
  const chartListItemRefs = React.useRef<Record<number, HTMLLIElement | null>>({});
  const previousChartStateRef = React.useRef<Record<number, ChartShareState> | null>(null);
  const previousChartStateCountsRef = React.useRef<ChartStateCounts | null>(null);

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
  const shareText = React.useMemo(
    () =>
      t('tournament_detail.share_dialog.post_text_template', {
        hashtag: shareHashtag,
        url: shareUrl,
      }),
    [shareHashtag, shareUrl, t],
  );
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
  const chartShareStateById = React.useMemo(() => {
    const stateMap: Record<number, ChartShareState> = {};
    props.detail.charts.forEach((chart) => {
      const chartNeedsSend = resolveNeedsSend(chart);
      const localSaved = resolveChartLocalSaved(chart);
      const submitted = resolveChartSubmitted(localSaved, chartNeedsSend);
      stateMap[chart.chartId] = resolveChartShareState(localSaved, submitted);
    });
    return stateMap;
  }, [props.detail.charts, resolveNeedsSend]);
  const chartStateCounts = React.useMemo<ChartStateCounts>(() => {
    let shared = 0;
    let unshared = 0;
    let unregistered = 0;
    Object.values(chartShareStateById).forEach((state) => {
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
    return { shared, unshared, unregistered };
  }, [chartShareStateById]);
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
  const shareDialogIsDark = theme.palette.mode === 'dark' || prefersDarkColorScheme;
  const shareDialogFilter = shareDialogIsDark ? 'blur(12px) saturate(1.18)' : 'blur(12px)';
  const shareDialogPaperSx = {
    backdropFilter: shareDialogFilter,
    WebkitBackdropFilter: shareDialogFilter,
    border: '1px solid',
    borderColor: shareDialogIsDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(0, 0, 0, 0.08)',
    backgroundColor: shareDialogIsDark ? 'rgba(17, 24, 39, 0.1)' : 'rgba(255, 255, 255, 0.70)',
    backgroundImage: shareDialogIsDark
      ? 'linear-gradient(140deg, rgba(110, 168, 255, 0.18), rgba(17, 24, 39, 0.74) 52%, rgba(37, 99, 235, 0.22))'
      : 'none',
    boxShadow: shareDialogIsDark ? '0 14px 40px rgba(0, 0, 0, 0.42)' : '0 14px 40px rgba(15, 23, 42, 0.18)',
    borderRadius: 'var(--mui-shape-borderRadius)',
  };
  const shareDialogBackdropSx = {
    backgroundColor: shareDialogIsDark ? 'rgba(0, 0, 0, 0.45)' : 'rgba(0, 0, 0, 0.25)',
  };

  React.useEffect(() => {
    setNeedsSendOverrides({});
  }, [props.detail]);

  React.useEffect(() => {
    if (!incomingReturnSignal) {
      return;
    }
    setActiveReturnSignal(incomingReturnSignal);
    props.onConsumeReturnSignal?.(incomingReturnSignal.token);
  }, [incomingReturnSignal, props.onConsumeReturnSignal]);

  React.useEffect(() => {
    if (prefersReducedMotion) {
      setSummaryProgressAnimationEnabled(false);
      return;
    }
    if (!activeReturnSignal) {
      return;
    }
    if (activeReturnSignal.returnReason === 'back') {
      setSummaryProgressAnimationEnabled(false);
      return;
    }
    if (typeof activeReturnSignal.progressChanged === 'boolean') {
      setSummaryProgressAnimationEnabled(activeReturnSignal.progressChanged);
      return;
    }
    if (activeReturnSignal.returnReason === 'shared') {
      setSummaryProgressAnimationEnabled((activeReturnSignal.changedCount ?? 0) > 0);
      return;
    }
    setSummaryProgressAnimationEnabled(true);
  }, [activeReturnSignal, prefersReducedMotion]);

  React.useEffect(() => {
    const previous = previousChartStateCountsRef.current;
    if (previous && hasChartStateCountChanged(previous, chartStateCounts) && !prefersReducedMotion) {
      setSummaryProgressAnimationEnabled(true);
    }
    previousChartStateCountsRef.current = chartStateCounts;
  }, [chartStateCounts, prefersReducedMotion]);

  React.useEffect(() => {
    const previous = previousChartStateRef.current;
    if (!previous) {
      previousChartStateRef.current = chartShareStateById;
      return;
    }

    const changedChartIds: number[] = [];
    Object.entries(chartShareStateById).forEach(([chartIdRaw, nextState]) => {
      const chartId = Number(chartIdRaw);
      const prevState = previous[chartId];
      if (prevState && prevState !== nextState) {
        changedChartIds.push(chartId);
      }
    });
    previousChartStateRef.current = chartShareStateById;

    if (changedChartIds.length === 0 || prefersReducedMotion) {
      return;
    }
    setStatusFadeTokens((current) => {
      const next = { ...current };
      changedChartIds.forEach((chartId) => {
        next[chartId] = (next[chartId] ?? 0) + 1;
      });
      return next;
    });
  }, [chartShareStateById, prefersReducedMotion]);

  React.useEffect(() => {
    if (!activeReturnSignal || (activeReturnSignal.returnReason !== 'saved' && activeReturnSignal.returnReason !== 'replaced')) {
      return;
    }
    if (!activeReturnSignal.changedChartId) {
      return;
    }
    const changedChartId = Number.parseInt(activeReturnSignal.changedChartId, 10);
    if (!Number.isFinite(changedChartId)) {
      return;
    }
    const target = chartListItemRefs.current[changedChartId];
    if (!target) {
      return;
    }

    const rect = target.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const isOutsideViewport = rect.bottom < 0 || rect.top > viewportHeight;
    if (isOutsideViewport) {
      target.scrollIntoView({
        block: 'center',
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
      });
    }

    setHighlightedChartId(changedChartId);
    const timeoutId = window.setTimeout(() => {
      setHighlightedChartId((current) => (current === changedChartId ? null : current));
    }, prefersReducedMotion ? 80 : 600);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeReturnSignal, prefersReducedMotion]);

  React.useEffect(
    () => () => {
      if (chartSubmitLockTimerRef.current !== null) {
        window.clearTimeout(chartSubmitLockTimerRef.current);
      }
      if (footerSubmitLockTimerRef.current !== null) {
        window.clearTimeout(footerSubmitLockTimerRef.current);
      }
    },
    [],
  );

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

  const openSubmitPageWithLock = React.useCallback(
    (chartId: number) => {
      if (chartSubmitLocked) {
        return;
      }
      setChartSubmitLocked(true);
      if (chartSubmitLockTimerRef.current !== null) {
        window.clearTimeout(chartSubmitLockTimerRef.current);
      }
      chartSubmitLockTimerRef.current = window.setTimeout(() => {
        setChartSubmitLocked(false);
        chartSubmitLockTimerRef.current = null;
      }, 200);
      props.onOpenSubmit(chartId);
    },
    [chartSubmitLocked, props],
  );

  const openSubmitDialogWithLock = React.useCallback(() => {
    if (!canOpenSubmitDialog || footerSubmitLocked) {
      return;
    }
    setFooterSubmitLocked(true);
    if (footerSubmitLockTimerRef.current !== null) {
      window.clearTimeout(footerSubmitLockTimerRef.current);
    }
    footerSubmitLockTimerRef.current = window.setTimeout(() => {
      setFooterSubmitLocked(false);
      footerSubmitLockTimerRef.current = null;
    }, 200);
    setSubmitDialogOpen(true);
  }, [canOpenSubmitDialog, footerSubmitLocked]);

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
    async (chartIds: number[], options?: { allowUndo?: boolean; changedCount?: number }) => {
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
      const changedCount = Math.max(0, options?.changedCount ?? chartIds.length);
      setActiveReturnSignal({
        token: crypto.randomUUID(),
        tournamentUuid: props.detail.tournamentUuid,
        returnReason: 'shared',
        changedCount,
        progressChanged: changedCount > 0,
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
    const changedCount = targetCharts.reduce((count, chart) => (resolveNeedsSend(chart) ? count + 1 : count), 0);
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
          await markChartsAsShared(targetChartIds, { allowUndo, changedCount });
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
      await markChartsAsShared(targetChartIds, { allowUndo, changedCount });
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
    resolveNeedsSend,
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
        prefersReducedMotion={prefersReducedMotion}
        animateProgress={summaryProgressAnimationEnabled}
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
            const isReturnHighlighted = highlightedChartId === chart.chartId;
            return (
              <li
                key={chart.chartId}
                data-chart-id={String(chart.chartId)}
                className={isReturnHighlighted ? 'detailChartListRow detailChartListRow-highlighted' : 'detailChartListRow'}
                style={
                  isReturnHighlighted
                    ? ({
                        '--detail-return-highlight': theme.palette.action.selected,
                      } as React.CSSProperties)
                    : undefined
                }
                ref={(node) => {
                  chartListItemRefs.current[chart.chartId] = node;
                }}
              >
                <ChartCard
                  title={chart.title}
                  playStyle={chart.playStyle}
                  difficulty={chart.difficulty}
                  level={levelText}
                  status={chartShareState}
                  statusAnimationToken={statusFadeTokens[chart.chartId]}
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
                        onClick={() => openSubmitPageWithLock(chart.chartId)}
                        disabled={chartSubmitLocked}
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

      <Dialog
        open={shareDialogOpen}
        onClose={closeShareDialog}
        fullWidth
        maxWidth="sm"
        data-testid="tournament-detail-share-dialog"
        PaperProps={{ sx: shareDialogPaperSx }}
        slotProps={{ backdrop: { sx: shareDialogBackdropSx } }}
      >
        <DialogTitle sx={{ pr: 6 }}>
          {t('tournament_detail.action.share_tournament')}
          <IconButton
            aria-label={t('tournament_detail.share_dialog.close_aria_label')}
            onClick={closeShareDialog}
            sx={{ position: 'absolute', right: 8, top: 8, color: 'var(--text-subtle)' }}
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
                borderColor: 'var(--border)',
                borderRadius: 2,
                p: 1.5,
                maxHeight: { xs: 420, sm: 520 },
                overflowY: 'auto',
                backgroundColor: theme.palette.background.paper,
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
                    border: '1px solid var(--border-strong)',
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
              sx={{ border: '1px solid var(--border)', borderRadius: 2 }}
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

      <Dialog
        open={previewZoomOpen}
        onClose={() => setPreviewZoomOpen(false)}
        fullScreen
        PaperProps={{
          sx: {
            backgroundColor: theme.palette.background.default,
            backgroundImage: 'none',
            backdropFilter: 'none',
            WebkitBackdropFilter: 'none',
          },
        }}
      >
        <IconButton
          aria-label={t('tournament_detail.share_dialog.close_aria_label')}
          onClick={() => setPreviewZoomOpen(false)}
          sx={{
            position: 'fixed',
            top: { xs: 12, sm: 16 },
            right: { xs: 12, sm: 16 },
            width: 44,
            height: 44,
            zIndex: (muiTheme) => muiTheme.zIndex.modal + 1,
            backgroundColor: shareDialogIsDark ? 'rgba(15, 23, 42, 0.62)' : 'rgba(15, 23, 42, 0.46)',
            color: '#ffffff',
            '&:hover': {
              backgroundColor: shareDialogIsDark ? 'rgba(15, 23, 42, 0.76)' : 'rgba(15, 23, 42, 0.62)',
            },
          }}
        >
          <CloseIcon />
        </IconButton>
        <DialogContent
          sx={{
            p: 2,
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {shareImagePreviewUrl ? (
            <Box
              component="img"
              src={shareImagePreviewUrl}
              alt={t('tournament_detail.share_dialog.preview_zoom_alt')}
              sx={{
                maxWidth: '100%',
                maxHeight: '100%',
                width: 'auto',
                height: 'auto',
                objectFit: 'contain',
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={submitDialogOpen}
        onClose={() => setSubmitDialogOpen(false)}
        fullWidth
        maxWidth="sm"
        data-testid="tournament-detail-submit-dialog"
      >
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
              onClick={openSubmitDialogWithLock}
              disabled={!canOpenSubmitDialog || footerSubmitLocked}
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
