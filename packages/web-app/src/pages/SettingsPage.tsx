import React from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Card,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  List,
  ListItem,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import { useTranslation } from 'react-i18next';

import type { AppLanguage } from '../i18n';
import { resolveSongMasterRuntimeConfig } from '../services/song-master-config';

export type AppSwStatus = 'update_available' | 'enabled' | 'unregistered';

export interface AppInfoCardData {
  appVersion: string;
  buildTime: string;
  swStatus: AppSwStatus;
  swVersion: string;
  swScope: string;
  swState: string;
  swClientsClaim: boolean | null;
  swSkipWaiting: boolean | null;
  appDbUserVersion: number | null;
  appDbSizeBytes: number | null;
  appDbIntegrityCheck: string | null;
  webLocksStatus: 'acquired' | 'unsupported' | 'not_acquired';
  webLocksReason: string | null;
  opfsStatus: 'available' | 'unsupported' | 'error';
  storageUsageBytes: number | null;
  storageQuotaBytes: number | null;
}

export interface SettingsRuntimeLog {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  category: string;
  message: string;
  detail?: string;
}

export interface SongMasterActionResult {
  ok: boolean;
  source: string;
  message: string | null;
  latestSha256: string | null;
  localSha256: string | null;
  checkedAt: string;
}

export interface StorageCleanupEstimate {
  thresholdDate: string;
  targetTournamentCount: number;
  targetImageCount: number;
  estimatedReleaseBytes: number | null;
  unknownSizeCount: number;
}

export interface StorageCleanupResult {
  thresholdDate: string;
  deletedTournamentCount: number;
  deletedImageCount: number;
  releasedBytes: number | null;
  unknownSizeCount: number;
  executedAt: string;
}

interface SettingsPageProps {
  appInfo: AppInfoCardData;
  songMasterMeta: Record<string, string | null>;
  language: AppLanguage;
  autoDeleteEnabled: boolean;
  autoDeleteDays: number;
  debugModeEnabled: boolean;
  busy: boolean;
  logs: SettingsRuntimeLog[];
  lastCleanupResult: StorageCleanupResult | null;
  onCheckUpdate: (force: boolean) => Promise<SongMasterActionResult>;
  onAutoDeleteConfigChange: (enabled: boolean, days: number) => Promise<void>;
  onEstimateStorageCleanup: (days: number) => Promise<StorageCleanupEstimate>;
  onRunStorageCleanup: (days: number) => Promise<StorageCleanupResult>;
  onLanguageChange: (language: AppLanguage) => Promise<void>;
  onToggleDebugMode: () => void;
  onApplyAppUpdate: () => void;
  onResetLocalData: () => Promise<void>;
}

interface SongMasterLatestPayload {
  file_name: string;
  schema_version: string | number;
  sha256: string;
  byte_size: number;
  generated_at: string | null;
}

type SongCheck = 'latest' | 'update_available' | 'check_failed';
type SongStatus = 'available' | 'unavailable' | 'update_failed_cache' | 'check_not_run';
type CapacityRisk = 'safe' | 'warning' | 'critical';
type HealthLevel = 'normal' | 'caution' | 'abnormal';
type HealthAction = 'restart' | 'fetch_song' | 'cleanup';
type RefetchPhase = 'idle' | 'download' | 'verify' | 'save' | 'complete' | 'failed';

interface HealthReason {
  p: number;
  s: 'abnormal' | 'caution';
  t: string;
  a: HealthAction;
}

const runtimeConfig = resolveSongMasterRuntimeConfig(import.meta.env);
const AUTO_DELETE_DAYS_MIN = 1;
const AUTO_DELETE_DAYS_MAX = 3650;
const LOG_COPY_LIMIT = 40;
const DEBUG_TAP_TARGET_COUNT = 7;
const DEBUG_TAP_RESET_MS = 1400;
const cardSx = {
  p: { xs: 2, sm: 2.5 },
  borderColor: '#dde4f1',
  boxShadow: '0 2px 10px rgba(15, 23, 42, 0.05)',
  display: 'grid',
  gap: 2,
} as const;
const accordionSx = { border: '1px solid #e2e8f0', borderRadius: 2 } as const;

function clampDays(v: number): number {
  if (!Number.isFinite(v)) return AUTO_DELETE_DAYS_MIN;
  return Math.min(AUTO_DELETE_DAYS_MAX, Math.max(AUTO_DELETE_DAYS_MIN, Math.trunc(v)));
}

function pickText(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const n = v.trim();
  return n.length > 0 ? n : null;
}

function pickNumber(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pickSchema(v: unknown): string | number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const n = v.trim();
    return n.length > 0 ? n : null;
  }
  return null;
}

function parseLatestPayload(input: unknown): SongMasterLatestPayload {
  if (!input || typeof input !== 'object') throw new Error('latest.json が不正です。');
  const b = input as Record<string, unknown>;
  const file = pickText(b.file_name);
  const schema = pickSchema(b.schema_version);
  const sha = pickText(b.sha256);
  const size = pickNumber(b.byte_size);
  const generatedAt = pickText(b.generated_at);
  if (!file || schema === null || !sha || size === null || !generatedAt) {
    throw new Error('latest.json の必須項目が不足しています。');
  }
  return { file_name: file, schema_version: schema, sha256: sha, byte_size: size, generated_at: generatedAt };
}

function fmtBytes(raw: string | number | null): string {
  const b = Number(raw);
  if (!Number.isFinite(b) || b < 0) return '不明';
  const gb = 1024 ** 3;
  const mb = 1024 ** 2;
  if (b >= gb) return `${(b / gb).toFixed(2)} GB`;
  if (b >= mb) return `${(b / mb).toFixed(2)} MB`;
  if (b >= 1024) return `${(b / 1024).toFixed(2)} KB`;
  return `${Math.trunc(b)} bytes`;
}

function fmtDate(v: string | null): string {
  if (!v) return '-';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString('ja-JP');
}

function fmtSongStatus(s: SongStatus): string {
  if (s === 'available') return '利用可';
  if (s === 'unavailable') return '利用不可';
  if (s === 'update_failed_cache') return '更新失敗（キャッシュ使用）';
  return '最新確認未実施';
}

function songStatusColor(s: SongStatus): 'success' | 'error' | 'warning' | 'default' {
  if (s === 'available') return 'success';
  if (s === 'unavailable') return 'error';
  if (s === 'update_failed_cache') return 'warning';
  return 'default';
}

function resolveSongStatus(hasLocal: boolean, check: SongCheck | null): SongStatus {
  if (!hasLocal) return 'unavailable';
  if (check === 'check_failed') return 'update_failed_cache';
  if (check === null) return 'check_not_run';
  return 'available';
}

function resolveCapacityRisk(usage: number | null, quota: number | null): CapacityRisk {
  if (usage === null || quota === null || quota <= 0) return 'warning';
  const r = usage / quota;
  if (r >= 0.9) return 'critical';
  if (r >= 0.75) return 'warning';
  return 'safe';
}

function fmtRisk(r: CapacityRisk): string {
  if (r === 'safe') return '余裕';
  if (r === 'critical') return '不足';
  return '注意';
}

function swLabel(s: AppSwStatus): string {
  return s === 'unregistered' ? '無効' : '有効';
}

function updateLabel(s: AppSwStatus): string {
  return s === 'update_available' ? 'あり' : 'なし';
}

function locksText(s: AppInfoCardData['webLocksStatus']): string {
  if (s === 'acquired') return '取得済';
  if (s === 'unsupported') return '失敗（未対応）';
  return '失敗';
}

function opfsText(s: AppInfoCardData['opfsStatus']): string {
  if (s === 'available') return '利用可';
  if (s === 'unsupported') return '未対応';
  return 'エラー';
}

function healthSummary(args: {
  locks: AppInfoCardData['webLocksStatus'];
  song: SongStatus;
  opfsStatus: AppInfoCardData['opfsStatus'];
  appDbIntegrityCheck: AppInfoCardData['appDbIntegrityCheck'];
  cap: CapacityRisk;
}): { level: HealthLevel; reasons: HealthReason[]; action: HealthAction } {
  const r: HealthReason[] = [];
  if (args.locks !== 'acquired') {
    r.push({ p: 10, s: 'abnormal', t: 'Web Locks：取得失敗', a: 'restart' });
  }
  if (args.song === 'unavailable') {
    r.push({ p: 20, s: 'abnormal', t: '曲データ：利用不可', a: 'fetch_song' });
  }
  if (args.opfsStatus === 'error') {
    r.push({ p: 30, s: 'abnormal', t: 'OPFS：アクセス失敗', a: 'restart' });
  }
  if (args.appDbIntegrityCheck && args.appDbIntegrityCheck.trim().toLowerCase() !== 'ok') {
    r.push({ p: 40, s: 'abnormal', t: 'DB整合性：エラー', a: 'restart' });
  }
  if (args.cap === 'critical') {
    r.push({ p: 50, s: 'caution', t: '容量：不足リスク', a: 'cleanup' });
  }
  r.sort((a, b) => a.p - b.p);
  const level: HealthLevel = r.some((v) => v.s === 'abnormal') ? 'abnormal' : r.length > 0 ? 'caution' : 'normal';
  return { level, reasons: r.slice(0, 2), action: r[0]?.a ?? 'fetch_song' };
}

function healthLabel(l: HealthLevel): string {
  if (l === 'normal') return '正常';
  if (l === 'caution') return '注意';
  return '異常';
}

function healthActionLabel(a: HealthAction): string {
  if (a === 'restart') return '別タブを閉じて再起動';
  if (a === 'fetch_song') return '曲データを取得';
  if (a === 'cleanup') return '容量を整理';
  return '対応を実行';
}

function healthStyle(l: HealthLevel): { icon: JSX.Element; color: 'success' | 'warning' | 'error'; border: string; bg: string } {
  if (l === 'normal') return { icon: <CheckCircleOutlineIcon color="success" />, color: 'success', border: '#9ed7ba', bg: '#f5fcf8' };
  if (l === 'caution') return { icon: <WarningAmberOutlinedIcon color="warning" />, color: 'warning', border: '#f3d48a', bg: '#fffaf1' };
  return { icon: <ErrorOutlineIcon color="error" />, color: 'error', border: '#efb2b2', bg: '#fff7f7' };
}

function fmtSongResult(r: SongMasterActionResult | null): string {
  if (!r) return '-';
  if (!r.ok) return `失敗: ${r.message ?? '不明なエラー'}`;
  if (r.source === 'up_to_date') return '成功: 最新です';
  if (r.source === 'github_download' || r.source === 'initial_download') return '成功: 更新を適用しました';
  if (r.source === 'local_cache') return `失敗（キャッシュ使用）: ${r.message ?? '詳細不明'}`;
  return r.message ?? '成功';
}

function refetchStepState(phase: RefetchPhase, step: 'download' | 'verify' | 'save' | 'complete'): { m: string; c: string } {
  const p: Record<RefetchPhase, number> = { idle: 0, download: 1, verify: 2, save: 3, complete: 4, failed: 3 };
  const s: Record<'download' | 'verify' | 'save' | 'complete', number> = { download: 1, verify: 2, save: 3, complete: 4 };
  if (phase === 'failed' && step === 'save') return { m: '×', c: 'error.main' };
  if (s[step] < p[phase]) return { m: '✓', c: 'success.main' };
  if (s[step] === p[phase] && phase !== 'complete') return { m: '…', c: 'warning.main' };
  if (s[step] === p[phase] && phase === 'complete') return { m: '✓', c: 'success.main' };
  return { m: '○', c: 'text.disabled' };
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const t = document.createElement('textarea');
  t.value = text;
  t.style.position = 'fixed';
  t.style.left = '-9999px';
  document.body.appendChild(t);
  t.focus();
  t.select();
  document.execCommand('copy');
  document.body.removeChild(t);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function row(label: string, value: string, mono = false, onValueTap?: () => void): JSX.Element {
  return (
    <ListItem key={label} disableGutters sx={{ px: 0, py: 0.75 }}>
      <Box
        sx={{
          width: '100%',
          display: 'grid',
          gridTemplateColumns: { xs: '130px minmax(0, 1fr)', sm: '180px minmax(0, 1fr)' },
          alignItems: 'start',
          columnGap: 2,
        }}
      >
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
        <Typography
          variant="body2"
          sx={{
            wordBreak: 'break-all',
            ...(mono
              ? {
                  fontFamily:
                    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                }
              : {}),
          }}
        >
          {onValueTap ? (
            <Box
              component="button"
              type="button"
              aria-label={label}
              onClick={onValueTap}
              sx={{
                all: 'unset',
                font: 'inherit',
                color: 'inherit',
                display: 'inline',
                cursor: 'default',
                WebkitTapHighlightColor: 'transparent',
                touchAction: 'manipulation',
              }}
            >
              {value}
            </Box>
          ) : (
            value
          )}
        </Typography>
      </Box>
    </ListItem>
  );
}

export function SettingsPage(props: SettingsPageProps): JSX.Element {
  const { t } = useTranslation();

  const [enabled, setEnabled] = React.useState(props.autoDeleteEnabled);
  const [days, setDays] = React.useState(clampDays(props.autoDeleteDays || 30));
  const [savingAutoDelete, setSavingAutoDelete] = React.useState(false);
  const [autoDeleteError, setAutoDeleteError] = React.useState<string | null>(null);

  const [runningCheck, setRunningCheck] = React.useState(false);
  const [checkOutcome, setCheckOutcome] = React.useState<SongCheck | null>(null);
  const [lastSongAction, setLastSongAction] = React.useState<SongMasterActionResult | null>(null);
  const [latestPayload, setLatestPayload] = React.useState<SongMasterLatestPayload | null>(null);
  const [latestCheckedAt, setLatestCheckedAt] = React.useState<string | null>(null);
  const [latestCode, setLatestCode] = React.useState<number | null>(null);
  const [latestError, setLatestError] = React.useState<string | null>(null);

  const [refetchConfirmOpen, setRefetchConfirmOpen] = React.useState(false);
  const [refetchProgressOpen, setRefetchProgressOpen] = React.useState(false);
  const [refetchPhase, setRefetchPhase] = React.useState<RefetchPhase>('idle');
  const [refetchError, setRefetchError] = React.useState<string | null>(null);

  const [cleanupDialogOpen, setCleanupDialogOpen] = React.useState(false);
  const [cleanupConfirmOpen, setCleanupConfirmOpen] = React.useState(false);
  const [cleanupEstimate, setCleanupEstimate] = React.useState<StorageCleanupEstimate | null>(null);
  const [cleanupLoading, setCleanupLoading] = React.useState(false);
  const [cleanupRunning, setCleanupRunning] = React.useState(false);
  const [cleanupError, setCleanupError] = React.useState<string | null>(null);
  const [resetGuideDialogOpen, setResetGuideDialogOpen] = React.useState(false);
  const [resetFinalDialogOpen, setResetFinalDialogOpen] = React.useState(false);
  const [resetConfirmText, setResetConfirmText] = React.useState('');
  const [resetRunning, setResetRunning] = React.useState(false);
  const [resetError, setResetError] = React.useState<string | null>(null);
  const [languageChanging, setLanguageChanging] = React.useState(false);

  const [copyResult, setCopyResult] = React.useState<string | null>(null);
  const debugTapCountRef = React.useRef(0);
  const debugTapResetTimerRef = React.useRef<number | null>(null);

  const resetDebugTapState = React.useCallback(() => {
    debugTapCountRef.current = 0;
    if (debugTapResetTimerRef.current !== null) {
      window.clearTimeout(debugTapResetTimerRef.current);
      debugTapResetTimerRef.current = null;
    }
  }, []);

  React.useEffect(
    () => () => {
      if (debugTapResetTimerRef.current !== null) {
        window.clearTimeout(debugTapResetTimerRef.current);
      }
    },
    [],
  );

  const handleVersionTap = React.useCallback(() => {
    debugTapCountRef.current += 1;
    if (debugTapCountRef.current >= DEBUG_TAP_TARGET_COUNT) {
      resetDebugTapState();
      props.onToggleDebugMode();
      return;
    }
    if (debugTapResetTimerRef.current !== null) {
      window.clearTimeout(debugTapResetTimerRef.current);
    }
    debugTapResetTimerRef.current = window.setTimeout(() => {
      debugTapCountRef.current = 0;
      debugTapResetTimerRef.current = null;
    }, DEBUG_TAP_RESET_MS);
  }, [props.onToggleDebugMode, resetDebugTapState]);

  React.useEffect(() => {
    setEnabled(props.autoDeleteEnabled);
    setDays(clampDays(props.autoDeleteDays || 30));
  }, [props.autoDeleteDays, props.autoDeleteEnabled]);

  const hasLocalSongMaster = Boolean(props.songMasterMeta.song_master_file_name && props.songMasterMeta.song_master_sha256);
  const songStatus = resolveSongStatus(hasLocalSongMaster, checkOutcome);
  const songUpdateAvailable = checkOutcome === 'update_available';
  const capacityRisk = resolveCapacityRisk(props.appInfo.storageUsageBytes, props.appInfo.storageQuotaBytes);
  const health = React.useMemo(
    () =>
      healthSummary({
        locks: props.appInfo.webLocksStatus,
        song: songStatus,
        opfsStatus: props.appInfo.opfsStatus,
        appDbIntegrityCheck: props.appInfo.appDbIntegrityCheck,
        cap: capacityRisk,
      }),
    [capacityRisk, props.appInfo.appDbIntegrityCheck, props.appInfo.opfsStatus, props.appInfo.webLocksStatus, songStatus],
  );
  const hStyle = healthStyle(health.level);

  const saveAutoDelete = React.useCallback(
    async (nextEnabled: boolean, nextDays: number) => {
      setSavingAutoDelete(true);
      setAutoDeleteError(null);
      try {
        await props.onAutoDeleteConfigChange(nextEnabled, nextDays);
      } catch (error) {
        setAutoDeleteError(error instanceof Error ? error.message : String(error));
      } finally {
        setSavingAutoDelete(false);
      }
    },
    [props],
  );

  const changeLanguage = React.useCallback(
    async (nextLanguage: AppLanguage) => {
      if (languageChanging || nextLanguage === props.language) {
        return;
      }
      setLanguageChanging(true);
      try {
        await props.onLanguageChange(nextLanguage);
      } finally {
        setLanguageChanging(false);
      }
    },
    [languageChanging, props],
  );

  const handleCheckLatest = React.useCallback(async () => {
    setRunningCheck(true);
    setLatestError(null);
    setLatestCode(null);
    try {
      const action = await props.onCheckUpdate(false);
      setLastSongAction(action);
      setLatestCheckedAt(action.checkedAt);
      const res = await fetch(runtimeConfig.latestJsonUrl, { cache: 'no-store' });
      setLatestCode(res.status);
      if (!res.ok) {
        throw new Error(`latest.json fetch failed: ${res.status}`);
      }
      const payload = parseLatestPayload(await res.json());
      setLatestPayload(payload);
      const local = action.localSha256 ?? props.songMasterMeta.song_master_sha256;
      if (!local) {
        setCheckOutcome('check_failed');
        return;
      }
      setCheckOutcome(payload.sha256 === local ? 'latest' : 'update_available');
    } catch (error) {
      setCheckOutcome('check_failed');
      setLatestError(error instanceof Error ? error.message : String(error));
    } finally {
      setRunningCheck(false);
    }
  }, [props]);

  const openCleanupDialog = React.useCallback(() => {
    setCleanupDialogOpen(true);
    setCleanupConfirmOpen(false);
    setCleanupEstimate(null);
    setCleanupError(null);
    setCleanupLoading(true);
    void props
      .onEstimateStorageCleanup(days)
      .then((v) => setCleanupEstimate(v))
      .catch((e) => setCleanupError(e instanceof Error ? e.message : String(e)))
      .finally(() => setCleanupLoading(false));
  }, [days, props]);

  const runCleanup = React.useCallback(async () => {
    setCleanupRunning(true);
    setCleanupError(null);
    try {
      await props.onRunStorageCleanup(days);
      setCleanupConfirmOpen(false);
      setCleanupDialogOpen(false);
    } catch (error) {
      setCleanupError(error instanceof Error ? error.message : String(error));
    } finally {
      setCleanupRunning(false);
    }
  }, [days, props]);

  const runRefetch = React.useCallback(async () => {
    setRefetchConfirmOpen(false);
    setRefetchProgressOpen(true);
    setRefetchPhase('download');
    setRefetchError(null);
    try {
      await sleep(120);
      const action = await props.onCheckUpdate(true);
      setLastSongAction(action);
      setLatestCheckedAt(action.checkedAt);
      setRefetchPhase('verify');
      await sleep(120);
      setRefetchPhase('save');
      await sleep(120);
      if (!action.ok) {
        throw new Error(action.message ?? '再取得（キャッシュ破棄）に失敗しました。');
      }
      if (action.localSha256 && action.latestSha256) {
        setCheckOutcome(action.localSha256 === action.latestSha256 ? 'latest' : 'update_available');
      } else {
        setCheckOutcome(null);
      }
      setRefetchPhase('complete');
    } catch (error) {
      setRefetchError(error instanceof Error ? error.message : String(error));
      setRefetchPhase('failed');
    }
  }, [props]);

  const copyLogs = React.useCallback(async () => {
    const selected = props.logs.slice(0, LOG_COPY_LIMIT);
    const text = selected
      .map((v) => `[${v.timestamp}] [${v.level}] [${v.category}] ${v.message}${v.detail ? ` :: ${v.detail}` : ''}`)
      .join('\n');
    try {
      await copyText(`${text}\n\n${JSON.stringify(selected, null, 2)}`);
      setCopyResult('ログをコピーしました。');
    } catch {
      setCopyResult('ログコピーに失敗しました。');
    }
    window.setTimeout(() => setCopyResult(null), 2500);
  }, [props.logs]);

  const openResetGuideDialog = React.useCallback(() => {
    setResetError(null);
    setResetConfirmText('');
    setResetFinalDialogOpen(false);
    setResetGuideDialogOpen(true);
  }, []);

  const proceedResetConfirmation = React.useCallback(() => {
    setResetGuideDialogOpen(false);
    setResetConfirmText('');
    setResetError(null);
    setResetFinalDialogOpen(true);
  }, []);

  const closeResetGuideDialog = React.useCallback(() => {
    if (resetRunning) {
      return;
    }
    setResetGuideDialogOpen(false);
  }, [resetRunning]);

  const closeResetFinalDialog = React.useCallback(() => {
    if (resetRunning) {
      return;
    }
    setResetFinalDialogOpen(false);
    setResetConfirmText('');
    setResetError(null);
  }, [resetRunning]);

  const runResetLocalData = React.useCallback(async () => {
    if (resetRunning || props.busy || resetConfirmText.trim() !== '削除') {
      return;
    }
    setResetRunning(true);
    setResetError(null);
    try {
      await props.onResetLocalData();
      setResetGuideDialogOpen(false);
      setResetFinalDialogOpen(false);
      setResetConfirmText('');
    } catch (error) {
      setResetError(error instanceof Error ? error.message : String(error));
    } finally {
      setResetRunning(false);
    }
  }, [props, resetConfirmText, resetRunning]);

  const runHealthAction = React.useCallback(() => {
    if (health.action === 'restart') {
      window.location.reload();
      return;
    }
    if (health.action === 'fetch_song') {
      void handleCheckLatest();
      return;
    }
    if (health.action === 'cleanup') {
      openCleanupDialog();
      return;
    }
  }, [handleCheckLatest, health.action, openCleanupDialog]);

  const baseSqliteUrl = runtimeConfig.sqliteBaseUrl.endsWith('/')
    ? runtimeConfig.sqliteBaseUrl
    : `${runtimeConfig.sqliteBaseUrl}/`;
  const sqliteDownloadUrl = latestPayload ? new URL(latestPayload.file_name, baseSqliteUrl).toString() : '-';
  const verification =
    checkOutcome === 'latest'
      ? '一致'
      : checkOutcome === 'update_available'
        ? '差分あり'
        : checkOutcome === 'check_failed'
          ? '確認失敗'
          : '-';
  const cleanupCanProceed = Boolean(cleanupEstimate && cleanupEstimate.targetImageCount > 0);
  const canRunReset = resetConfirmText.trim() === '削除';
  const shortLogs = props.logs.slice(0, 10);
  const errorLogs = props.logs.filter((v) => v.level === 'error').slice(0, 10);

  return (
    <Box sx={{ display: 'grid', gap: 2.5 }}>
      {health.reasons.length > 0 ? (
        <Card
          variant="outlined"
          sx={{ ...cardSx, position: 'sticky', top: 8, zIndex: 2, borderColor: hStyle.border, backgroundColor: hStyle.bg }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
            <Stack direction="row" spacing={1} alignItems="center">
              {hStyle.icon}
              <Typography variant="h6" component="h2" fontWeight={700}>
                ヘルスサマリ: {healthLabel(health.level)}
              </Typography>
            </Stack>
            <Button
              variant="contained"
              color={hStyle.color}
              onClick={runHealthAction}
              disabled={props.busy || runningCheck || cleanupRunning}
            >
              {healthActionLabel(health.action)}
            </Button>
          </Box>
          <Stack spacing={0.5}>
            {health.reasons.map((v) => (
              <Typography key={v.t} variant="body2" color="text.secondary">
                {v.t}
              </Typography>
            ))}
          </Stack>
        </Card>
      ) : null}

      <Card variant="outlined" sx={cardSx}>
        <Typography variant="h6" component="h2" fontWeight={700}>
          {t('settings.language.title')}
        </Typography>
        <TextField
          select
          size="small"
          label={t('settings.language.label')}
          value={props.language}
          onChange={(event) => void changeLanguage(event.target.value as AppLanguage)}
          disabled={languageChanging}
        >
          <MenuItem value="ja">{t('settings.language.option.ja')}</MenuItem>
          <MenuItem value="en">{t('settings.language.option.en')}</MenuItem>
          <MenuItem value="ko">{t('settings.language.option.ko')}</MenuItem>
        </TextField>
      </Card>

      <Card variant="outlined" sx={cardSx}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2 }}>
          <Typography variant="h6" component="h2" fontWeight={700}>
            曲データ
          </Typography>
          <Chip label={fmtSongStatus(songStatus)} color={songStatusColor(songStatus)} size="small" />
        </Box>
        <List dense disablePadding>
          {row('状態', fmtSongStatus(songStatus))}
          {row('サイズ', fmtBytes(props.songMasterMeta.song_master_byte_size ?? null))}
          {row('最終取得日', props.songMasterMeta.song_master_downloaded_at ?? '-')}
          {row('最終確認日時', fmtDate(latestCheckedAt))}
        </List>
        {songUpdateAvailable ? (
          <Alert severity="info" variant="outlined">
            更新があります。必要に応じて「更新を確認」を実行してください。
          </Alert>
        ) : null}
        {songStatus === 'check_not_run' ? (
          <Typography variant="body2" color="text.secondary">
            最新確認未実施（情報表示）: 必要に応じて「更新を確認」を実行してください。
          </Typography>
        ) : null}
        {songStatus === 'update_failed_cache' ? (
          <Alert severity="warning" variant="outlined">
            更新確認に失敗しました。既存データを継続利用しています。
          </Alert>
        ) : null}
        <Button variant="contained" disabled={props.busy || runningCheck} onClick={() => void handleCheckLatest()}>
          {runningCheck ? '確認中...' : '更新を確認'}
        </Button>
        <Accordion disableGutters elevation={0} sx={accordionSx}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="body2" fontWeight={700}>
              {t('common.detail')}
            </Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0, display: 'grid', gap: 2 }}>
            <List dense disablePadding>
              {row('取得日時', fmtDate(props.songMasterMeta.song_master_downloaded_at ?? null))}
              {row('生成日', props.songMasterMeta.song_master_generated_at ?? props.songMasterMeta.song_master_updated_at ?? '-')}
              {row('DL元', 'GitHub Releases')}
              {row('直近更新結果', fmtSongResult(lastSongAction))}
            </List>
            <Stack spacing={0.5}>
              <Typography variant="caption" color="text.secondary">
                最新判定は「更新を確認」で実施します。
              </Typography>
              <Typography variant="caption" color="text.secondary">
                失敗時は既存を使用（初回は利用不可）します。
              </Typography>
            </Stack>
            <Box>
              <Button
                variant="outlined"
                color="error"
                size="small"
                disabled={props.busy || runningCheck}
                onClick={() => setRefetchConfirmOpen(true)}
              >
                再取得（キャッシュ破棄）
              </Button>
            </Box>
          </AccordionDetails>
        </Accordion>
        {props.debugModeEnabled ? (
          <Accordion disableGutters elevation={0} sx={accordionSx}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="body2" fontWeight={700}>
                技術情報
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0, display: 'grid', gap: 2 }}>
              <List dense disablePadding>
                {row('schema_version', props.songMasterMeta.song_master_schema_version ?? '-', true)}
                {row('sha256', props.songMasterMeta.song_master_sha256 ?? '-', true)}
                {row('latest.json取得時刻', fmtDate(latestCheckedAt))}
                {row('latest.json結果コード', latestCode === null ? '-' : String(latestCode))}
                {row('DL URL', sqliteDownloadUrl, true)}
                {row('検証結果', verification)}
              </List>
              <Stack direction="row" spacing={1} alignItems="center">
                <Button variant="outlined" size="small" startIcon={<ContentCopyIcon />} onClick={() => void copyLogs()}>
                  ログコピー
                </Button>
                {copyResult ? (
                  <Typography variant="caption" color="text.secondary">
                    {copyResult}
                  </Typography>
                ) : null}
              </Stack>
              {latestError ? (
                <Typography variant="caption" color="error.main">
                  latest.json取得エラー: {latestError}
                </Typography>
              ) : null}
            </AccordionDetails>
          </Accordion>
        ) : null}
      </Card>

      <Card variant="outlined" sx={cardSx}>
        <Typography variant="h6" component="h2" fontWeight={700}>
          容量
        </Typography>
        <List dense disablePadding>
          {row(
            '使用量（概算）',
            props.appInfo.storageUsageBytes === null || props.appInfo.storageQuotaBytes === null
              ? '概算/不明'
              : `${fmtBytes(props.appInfo.storageUsageBytes)} / ${fmtBytes(props.appInfo.storageQuotaBytes)}`,
          )}
          {row('リスク', fmtRisk(capacityRisk))}
        </List>
        <Button variant="contained" onClick={openCleanupDialog} disabled={cleanupLoading || cleanupRunning}>
          容量を整理
        </Button>
        <FormControlLabel
          control={
            <Switch
              checked={enabled}
              disabled={savingAutoDelete}
              onChange={(e) => {
                const next = e.target.checked;
                setEnabled(next);
                void saveAutoDelete(next, days);
              }}
            />
          }
          label="画像自動削除を有効にする"
        />
        <TextField
          type="number"
          size="small"
          label="終了後N日で画像削除"
          inputProps={{ min: AUTO_DELETE_DAYS_MIN, max: AUTO_DELETE_DAYS_MAX }}
          value={days}
          disabled={!enabled || savingAutoDelete}
          onChange={(e) => {
            const next = clampDays(Number(e.target.value));
            setDays(next);
            void saveAutoDelete(enabled, next);
          }}
          helperText="大会データは残り、画像のみ削除（復元不可）"
        />
        {autoDeleteError ? <Alert severity="warning">{autoDeleteError}</Alert> : null}
        <Accordion disableGutters elevation={0} sx={accordionSx}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="body2" fontWeight={700}>
              {t('common.detail')}
            </Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0 }}>
            <List dense disablePadding>
              {row('直近実行日時', fmtDate(props.lastCleanupResult?.executedAt ?? null))}
              {row(
                '削除画像枚数',
                props.lastCleanupResult ? t('common.images_with_count', { count: props.lastCleanupResult.deletedImageCount }) : '-',
              )}
              {row('解放容量', props.lastCleanupResult ? fmtBytes(props.lastCleanupResult.releasedBytes) : '-')}
            </List>
          </AccordionDetails>
        </Accordion>
      </Card>

      <Card variant="outlined" sx={cardSx}>
        <Typography variant="h6" component="h2" fontWeight={700}>
          アプリ
        </Typography>
        <List dense disablePadding>
          {row('アプリ版本体', props.appInfo.appVersion || '-', false, handleVersionTap)}
          {row('ビルド日時', props.appInfo.buildTime || '-')}
          {row('オフライン機能', swLabel(props.appInfo.swStatus))}
          {row('更新', updateLabel(props.appInfo.swStatus))}
        </List>
        {props.appInfo.swStatus === 'update_available' ? (
          <Button variant="text" size="small" onClick={props.onApplyAppUpdate}>
            再読み込みして更新
          </Button>
        ) : null}
        {props.debugModeEnabled ? (
          <Accordion disableGutters elevation={0} sx={accordionSx}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="body2" fontWeight={700}>
                技術情報
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0 }}>
              <List dense disablePadding>
                {row('SW state', props.appInfo.swState)}
                {row('SW scope', props.appInfo.swScope, true)}
                {row('version/build id', props.appInfo.swVersion || '-')}
                {row('clientsClaim', props.appInfo.swClientsClaim === null ? '不明' : props.appInfo.swClientsClaim ? '有効' : '無効')}
                {row('skipWaiting', props.appInfo.swSkipWaiting === null ? '不明' : props.appInfo.swSkipWaiting ? '待機あり' : '待機なし')}
              </List>
            </AccordionDetails>
          </Accordion>
        ) : null}
      </Card>

      {props.debugModeEnabled ? (
        <Card variant="outlined" sx={cardSx}>
          <Typography variant="h6" component="h2" fontWeight={700}>
            技術情報
          </Typography>
          <Accordion disableGutters elevation={0} sx={accordionSx}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="body2" fontWeight={700}>
                共通情報
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0, display: 'grid', gap: 2 }}>
              <List dense disablePadding>
                {row('Web Locks', `${locksText(props.appInfo.webLocksStatus)}${props.appInfo.webLocksReason ? `（${props.appInfo.webLocksReason}）` : ''}`)}
                {row(
                  'OPFS',
                  `${opfsText(props.appInfo.opfsStatus)} / 使用量 ${fmtBytes(props.appInfo.storageUsageBytes)} / 空き推定 ${fmtBytes(
                    props.appInfo.storageQuotaBytes !== null && props.appInfo.storageUsageBytes !== null
                      ? props.appInfo.storageQuotaBytes - props.appInfo.storageUsageBytes
                      : null,
                  )}`,
                )}
                {row('DB integrity_check', props.appInfo.appDbIntegrityCheck ?? '不明')}
                {row('DBファイルサイズ', fmtBytes(props.appInfo.appDbSizeBytes))}
                {row('DB user_version', props.appInfo.appDbUserVersion === null ? '-' : String(props.appInfo.appDbUserVersion))}
              </List>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="subtitle2">直近エラーログ</Typography>
                <Button variant="outlined" size="small" startIcon={<ContentCopyIcon />} onClick={() => void copyLogs()}>
                  {t('common.copy')}
                </Button>
              </Stack>
              <Stack spacing={0.5}>
                {(errorLogs.length > 0 ? errorLogs : shortLogs).map((v) => (
                  <Typography key={v.id} variant="caption" color="text.secondary">
                    [{v.timestamp}] [{v.level}] {v.message}
                  </Typography>
                ))}
                {errorLogs.length === 0 && shortLogs.length === 0 ? (
                  <Typography variant="caption" color="text.secondary">
                    ログはありません。
                  </Typography>
                ) : null}
              </Stack>
            </AccordionDetails>
          </Accordion>
        </Card>
      ) : null}

      <Card
        variant="outlined"
        sx={{
          ...cardSx,
          borderColor: '#efb2b2',
          backgroundColor: '#fff8f8',
        }}
      >
        <Typography variant="h6" component="h2" fontWeight={700} color="error.main">
          危険操作
        </Typography>
        <Stack spacing={0.5}>
          <Typography variant="body2">ローカル初期化を実行すると以下を削除します。</Typography>
          <Typography variant="body2" color="text.secondary">
            ・大会データ
          </Typography>
          <Typography variant="body2" color="text.secondary">
            ・提出画像
          </Typography>
          <Typography variant="body2" color="text.secondary">
            ・曲データ
          </Typography>
          <Typography variant="body2" color="error.main">
            復元できません。
          </Typography>
        </Stack>
        <Button color="error" variant="contained" onClick={openResetGuideDialog} disabled={props.busy || resetRunning}>
          ローカル初期化
        </Button>
      </Card>

      <Dialog open={resetGuideDialogOpen} onClose={closeResetGuideDialog} maxWidth="xs" fullWidth>
        <DialogTitle>ローカル初期化を実行しますか？</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 1 }}>
          <DialogContentText>以下を削除します（復元不可）。</DialogContentText>
          <Typography variant="body2">・大会データ</Typography>
          <Typography variant="body2">・提出画像</Typography>
          <Typography variant="body2">・曲データ</Typography>
          <Typography variant="caption" color="text.secondary">
            次へ進むと確認文字列の入力が必要です。
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeResetGuideDialog} disabled={resetRunning}>
            {t('common.cancel')}
          </Button>
          <Button color="error" variant="outlined" onClick={proceedResetConfirmation} disabled={resetRunning}>
            次へ
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={resetFinalDialogOpen} onClose={closeResetFinalDialog} maxWidth="xs" fullWidth>
        <DialogTitle>最終確認</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 1.25 }}>
          <DialogContentText>
            実行するには確認文字列を入力してください。実行後は初期状態に戻ります。
          </DialogContentText>
          <TextField
            label="確認文字列"
            size="small"
            value={resetConfirmText}
            onChange={(event) => setResetConfirmText(event.target.value)}
            disabled={resetRunning}
            placeholder="削除"
            helperText="「削除」と入力すると実行できます。"
          />
          {resetError ? (
            <Typography variant="caption" color="error.main">
              {resetError}
            </Typography>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeResetFinalDialog} disabled={resetRunning}>
            {t('common.cancel')}
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => void runResetLocalData()}
            disabled={!canRunReset || resetRunning || props.busy}
          >
            初期化を実行
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={refetchConfirmOpen} onClose={() => setRefetchConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>再取得（キャッシュ破棄）を実行しますか？</DialogTitle>
        <DialogContent>
          <DialogContentText>
            キャッシュを破棄した後、再ダウンロード・検証・置換を行います。失敗時は既存データを保持します。
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRefetchConfirmOpen(false)}>{t('common.cancel')}</Button>
          <Button color="error" variant="contained" onClick={() => void runRefetch()}>
            実行
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={refetchProgressOpen} onClose={() => setRefetchProgressOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>再取得（キャッシュ破棄）進捗</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 1.2 }}>
          {(['download', 'verify', 'save', 'complete'] as const).map((k) => {
            const label = k === 'download' ? '取得' : k === 'verify' ? '検証' : k === 'save' ? '保存' : '完了';
            const st = refetchStepState(refetchPhase, k);
            return (
              <Typography key={k} variant="body2" sx={{ color: st.c }}>
                {st.m} {label}
              </Typography>
            );
          })}
          {refetchError ? (
            <Typography variant="caption" color="error.main">
              {refetchError}
            </Typography>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRefetchProgressOpen(false)}>{t('common.close')}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={cleanupDialogOpen} onClose={() => setCleanupDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>容量を整理</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 1.2 }}>
          {cleanupLoading ? (
            <Typography variant="body2">見積りを取得中...</Typography>
          ) : (
            <>
              <Typography variant="body2">削除対象大会数: {cleanupEstimate ? `${cleanupEstimate.targetTournamentCount} 件` : '-'}</Typography>
              <Typography variant="body2">削除対象画像枚数: {cleanupEstimate ? `${cleanupEstimate.targetImageCount} 枚` : '-'}</Typography>
              <Typography variant="body2">解放見込み容量（概算）: {cleanupEstimate ? fmtBytes(cleanupEstimate.estimatedReleaseBytes) : '-'}</Typography>
              <Typography variant="body2">復元不可</Typography>
            </>
          )}
          {cleanupError ? (
            <Typography variant="caption" color="error.main">
              {cleanupError}
            </Typography>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCleanupDialogOpen(false)} disabled={cleanupRunning}>
            {t('common.close')}
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={!cleanupCanProceed || cleanupLoading || cleanupRunning}
            onClick={() => setCleanupConfirmOpen(true)}
          >
            削除実行へ進む
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={cleanupConfirmOpen} onClose={() => setCleanupConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>最終確認</DialogTitle>
        <DialogContent>
          <DialogContentText>画像を削除します。復元できません。実行してよいですか？</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCleanupConfirmOpen(false)} disabled={cleanupRunning}>
            {t('common.cancel')}
          </Button>
          <Button color="error" variant="contained" onClick={() => void runCleanup()} disabled={cleanupRunning}>
            最終確認して実行
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
