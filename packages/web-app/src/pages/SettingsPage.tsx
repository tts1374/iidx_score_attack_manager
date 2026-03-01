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
import { resolveErrorMessage } from '../utils/error-i18n';

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
  reasonKey: string;
  a: HealthAction;
}

type TranslationFn = (...args: any[]) => string;

const runtimeConfig = resolveSongMasterRuntimeConfig(import.meta.env);
const AUTO_DELETE_DAYS_MIN = 1;
const AUTO_DELETE_DAYS_MAX = 3650;
const LOG_COPY_LIMIT = 40;
const DEBUG_TAP_TARGET_COUNT = 7;
const DEBUG_TAP_RESET_MS = 1400;
const cardSx = {
  p: { xs: 2, sm: 2.5 },
  borderColor: 'var(--border)',
  boxShadow: 'var(--shadow)',
  backgroundColor: 'var(--surface)',
  color: 'var(--text)',
  display: 'grid',
  gap: 2,
  '& .MuiTypography-root.MuiTypography-colorTextSecondary': {
    color: 'var(--text-subtle) !important',
  },
  '& .MuiDivider-root': {
    borderColor: 'var(--border)',
  },
  '& .MuiInputBase-root': {
    color: 'var(--text)',
    backgroundColor: 'var(--surface-2)',
  },
  '& .MuiInputLabel-root': {
    color: 'var(--text-subtle)',
  },
  '& .MuiSelect-icon': {
    color: 'var(--text-subtle)',
  },
  '& .MuiFormHelperText-root': {
    color: 'var(--text-subtle) !important',
  },
  '& .MuiChip-root.MuiChip-colorDefault': {
    backgroundColor: 'var(--surface-3)',
    color: 'var(--text-muted)',
    border: '1px solid var(--border)',
  },
  '& .MuiChip-root.MuiChip-colorDefault .MuiChip-icon, & .MuiChip-root.MuiChip-colorDefault .MuiChip-deleteIcon': {
    color: 'var(--text-subtle)',
  },
  '& .MuiOutlinedInput-notchedOutline': {
    borderColor: 'var(--border)',
  },
  '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': {
    borderColor: 'var(--border-strong)',
  },
  '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': {
    borderColor: 'var(--focus)',
  },
  '& .MuiFormControlLabel-label': {
    color: 'var(--text)',
  },
  '& .MuiInputLabel-root.Mui-disabled': {
    color: 'var(--text-faint) !important',
  },
  '& .MuiInputBase-input.Mui-disabled': {
    color: 'var(--text-muted) !important',
    WebkitTextFillColor: 'var(--text-muted) !important',
  },
  '& .MuiInputBase-root.Mui-disabled': {
    backgroundColor: 'var(--surface-3)',
  },
  '& .MuiSwitch-track': {
    backgroundColor: 'var(--surface-muted)',
    opacity: '1 !important',
  },
  '& .MuiSwitch-thumb': {
    backgroundColor: 'var(--surface)',
  },
  '& .MuiSwitch-switchBase.Mui-checked': {
    color: 'var(--surface)',
  },
  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
    backgroundColor: 'var(--accent-strong)',
    opacity: '1 !important',
  },
} as const;
const accordionSx = {
  border: '1px solid var(--border)',
  borderRadius: 2,
  backgroundColor: 'transparent',
  color: 'var(--text)',
  '& .MuiAccordionSummary-expandIconWrapper': {
    color: 'var(--text-subtle)',
  },
} as const;

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
  if (!input || typeof input !== 'object') throw new Error('invalid');
  const b = input as Record<string, unknown>;
  const file = pickText(b.file_name);
  const schema = pickSchema(b.schema_version);
  const sha = pickText(b.sha256);
  const size = pickNumber(b.byte_size);
  const generatedAt = pickText(b.generated_at);
  if (!file || schema === null || !sha || size === null || !generatedAt) {
    throw new Error('missing_required');
  }
  return { file_name: file, schema_version: schema, sha256: sha, byte_size: size, generated_at: generatedAt };
}

function fmtBytes(raw: string | number | null, unknownLabel: string): string {
  const b = Number(raw);
  if (!Number.isFinite(b) || b < 0) return unknownLabel;
  const gb = 1024 ** 3;
  const mb = 1024 ** 2;
  if (b >= gb) return `${(b / gb).toFixed(2)} GB`;
  if (b >= mb) return `${(b / mb).toFixed(2)} MB`;
  if (b >= 1024) return `${(b / 1024).toFixed(2)} KB`;
  return `${Math.trunc(b)} bytes`;
}

function resolveDateLocale(language: AppLanguage): string {
  if (language === 'en') return 'en-US';
  if (language === 'ko') return 'ko-KR';
  return 'ja-JP';
}

function fmtDate(v: string | null, locale: string, emptyLabel: string): string {
  if (!v) return emptyLabel;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString(locale);
}

function songStatusKey(s: SongStatus): string {
  if (s === 'available') return 'settings.song_data.status.available';
  if (s === 'unavailable') return 'settings.song_data.status.unavailable';
  if (s === 'update_failed_cache') return 'settings.song_data.status.update_failed_cache';
  return 'settings.song_data.status.check_not_run';
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

function riskKey(r: CapacityRisk): string {
  if (r === 'safe') return 'settings.storage.risk_value.safe';
  if (r === 'critical') return 'settings.storage.risk_value.critical';
  return 'settings.storage.risk_value.warning';
}

function swLabelKey(s: AppSwStatus): string {
  return s === 'unregistered' ? 'settings.app.sw.unregistered' : 'settings.app.sw.enabled';
}

function updateLabelKey(s: AppSwStatus): string {
  return s === 'update_available' ? 'settings.app.update_status.available' : 'settings.app.update_status.none';
}

function locksStatusKey(s: AppInfoCardData['webLocksStatus']): string {
  if (s === 'acquired') return 'settings.technical.locks_status.acquired';
  if (s === 'unsupported') return 'settings.technical.locks_status.unsupported';
  return 'settings.technical.locks_status.not_acquired';
}

function opfsStatusKey(s: AppInfoCardData['opfsStatus']): string {
  if (s === 'available') return 'settings.technical.opfs_status.available';
  if (s === 'unsupported') return 'settings.technical.opfs_status.unsupported';
  return 'settings.technical.opfs_status.error';
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
    r.push({ p: 10, s: 'abnormal', reasonKey: 'settings.health.reason.web_locks_failed', a: 'restart' });
  }
  if (args.song === 'unavailable') {
    r.push({ p: 20, s: 'abnormal', reasonKey: 'settings.health.reason.song_unavailable', a: 'fetch_song' });
  }
  if (args.opfsStatus === 'error') {
    r.push({ p: 30, s: 'abnormal', reasonKey: 'settings.health.reason.opfs_error', a: 'restart' });
  }
  if (args.appDbIntegrityCheck && args.appDbIntegrityCheck.trim().toLowerCase() !== 'ok') {
    r.push({ p: 40, s: 'abnormal', reasonKey: 'settings.health.reason.db_integrity_error', a: 'restart' });
  }
  if (args.cap === 'critical') {
    r.push({ p: 50, s: 'caution', reasonKey: 'settings.health.reason.capacity_critical', a: 'cleanup' });
  }
  r.sort((a, b) => a.p - b.p);
  const level: HealthLevel = r.some((v) => v.s === 'abnormal') ? 'abnormal' : r.length > 0 ? 'caution' : 'normal';
  return { level, reasons: r.slice(0, 2), action: r[0]?.a ?? 'fetch_song' };
}

function healthLabelKey(l: HealthLevel): string {
  if (l === 'normal') return 'settings.health.level.normal';
  if (l === 'caution') return 'settings.health.level.caution';
  return 'settings.health.level.abnormal';
}

function healthActionLabelKey(a: HealthAction): string {
  if (a === 'restart') return 'settings.health.action.restart';
  if (a === 'fetch_song') return 'settings.health.action.fetch_song';
  if (a === 'cleanup') return 'settings.health.action.cleanup';
  return 'settings.health.action.default';
}

function healthStyle(l: HealthLevel): { icon: JSX.Element; color: 'success' | 'warning' | 'error'; border: string; bg: string } {
  if (l === 'normal') {
    return {
      icon: <CheckCircleOutlineIcon color="success" />,
      color: 'success',
      border: 'var(--success-border)',
      bg: 'var(--status-shared-bg)',
    };
  }
  if (l === 'caution') {
    return {
      icon: <WarningAmberOutlinedIcon color="warning" />,
      color: 'warning',
      border: 'var(--status-unshared-border)',
      bg: 'var(--status-warning-bg)',
    };
  }
  return { icon: <ErrorOutlineIcon color="error" />, color: 'error', border: 'var(--danger-border)', bg: 'var(--danger-bg)' };
}

function fmtSongResult(r: SongMasterActionResult | null, t: TranslationFn): string {
  if (!r) return t('settings.song_data.result.none');
  if (!r.ok) return t('settings.song_data.result.failed', { message: r.message ?? t('common.unknown') });
  if (r.source === 'up_to_date') return t('settings.song_data.result.up_to_date');
  if (r.source === 'github_download' || r.source === 'initial_download') return t('settings.song_data.result.updated_success');
  if (r.source === 'local_cache') {
    return t('settings.song_data.result.local_cache_failed', { message: r.message ?? t('common.unknown') });
  }
  return r.message ?? t('settings.song_data.result.success');
}

function refetchStepState(phase: RefetchPhase, step: 'download' | 'verify' | 'save' | 'complete'): { m: string; c: string } {
  const p: Record<RefetchPhase, number> = { idle: 0, download: 1, verify: 2, save: 3, complete: 4, failed: 3 };
  const s: Record<'download' | 'verify' | 'save' | 'complete', number> = { download: 1, verify: 2, save: 3, complete: 4 };
  if (phase === 'failed' && step === 'save') return { m: '×', c: 'error.main' };
  if (s[step] < p[phase]) return { m: '✓', c: 'success.main' };
  if (s[step] === p[phase] && phase !== 'complete') return { m: '…', c: 'warning.main' };
  if (s[step] === p[phase] && phase === 'complete') return { m: '✓', c: 'success.main' };
  return { m: '○', c: 'var(--text-subtle)' };
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

function row(label: string, value: string, mono = false, onValueTap?: () => void, valueButtonTestId?: string): JSX.Element {
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
        <Typography variant="body2" sx={{ color: 'var(--text-subtle)' }}>
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
              tabIndex={-1}
              aria-label={label}
              data-testid={valueButtonTestId}
              onClick={onValueTap}
              sx={{
                all: 'unset',
                font: 'inherit',
                color: 'inherit',
                display: 'inline',
                cursor: 'default',
                border: 0,
                margin: 0,
                padding: 0,
                lineHeight: 'inherit',
                letterSpacing: 'inherit',
                WebkitTapHighlightColor: 'transparent',
                touchAction: 'manipulation',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                '&:focus, &:focus-visible': {
                  outline: 'none',
                  boxShadow: 'none',
                  background: 'transparent',
                },
                '&:active': {
                  background: 'transparent',
                },
                '&::-moz-focus-inner': {
                  border: 0,
                },
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
  const [copyResult, setCopyResult] = React.useState<'copied' | 'failed' | null>(null);
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
        setAutoDeleteError(resolveErrorMessage(t, error, 'error.description.generic'));
      } finally {
        setSavingAutoDelete(false);
      }
    },
    [props, t],
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
        setCheckOutcome('check_failed');
        setLatestError(t('settings.song_data.error.latest_fetch_failed', { status: res.status }));
        return;
      }
      let payload: SongMasterLatestPayload;
      try {
        payload = parseLatestPayload(await res.json());
      } catch (error) {
        const parseReason = error instanceof Error ? error.message : '';
        setCheckOutcome('check_failed');
        if (parseReason === 'missing_required') {
          setLatestError(t('settings.song_data.error.latest_missing'));
        } else {
          setLatestError(t('settings.song_data.error.latest_invalid'));
        }
        return;
      }
      setLatestPayload(payload);
      const local = action.localSha256 ?? props.songMasterMeta.song_master_sha256;
      if (!local) {
        setCheckOutcome('check_failed');
        return;
      }
      setCheckOutcome(payload.sha256 === local ? 'latest' : 'update_available');
    } catch (error) {
      setCheckOutcome('check_failed');
      const message = error instanceof Error ? error.message : String(error);
      setLatestError(t('settings.song_data.error.unexpected', { message }));
    } finally {
      setRunningCheck(false);
    }
  }, [props, t]);

  const openCleanupDialog = React.useCallback(() => {
    setCleanupDialogOpen(true);
    setCleanupConfirmOpen(false);
    setCleanupEstimate(null);
    setCleanupError(null);
    setCleanupLoading(true);
    void props
      .onEstimateStorageCleanup(days)
      .then((v) => setCleanupEstimate(v))
      .catch((e) => setCleanupError(resolveErrorMessage(t, e, 'error.description.generic')))
      .finally(() => setCleanupLoading(false));
  }, [days, props, t]);

  const runCleanup = React.useCallback(async () => {
    setCleanupRunning(true);
    setCleanupError(null);
    try {
      await props.onRunStorageCleanup(days);
      setCleanupConfirmOpen(false);
      setCleanupDialogOpen(false);
    } catch (error) {
      setCleanupError(resolveErrorMessage(t, error, 'error.description.generic'));
    } finally {
      setCleanupRunning(false);
    }
  }, [days, props, t]);

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
        throw new Error(action.message ?? t('settings.song_data.error.refetch_default'));
      }
      if (action.localSha256 && action.latestSha256) {
        setCheckOutcome(action.localSha256 === action.latestSha256 ? 'latest' : 'update_available');
      } else {
        setCheckOutcome(null);
      }
      setRefetchPhase('complete');
    } catch (error) {
      setRefetchError(resolveErrorMessage(t, error, 'error.description.generic'));
      setRefetchPhase('failed');
    }
  }, [props, t]);

  const copyLogs = React.useCallback(async () => {
    const selected = props.logs.slice(0, LOG_COPY_LIMIT);
    const text = selected
      .map((v) => `[${v.timestamp}] [${v.level}] [${v.category}] ${v.message}${v.detail ? ` :: ${v.detail}` : ''}`)
      .join('\n');
    try {
      await copyText(`${text}\n\n${JSON.stringify(selected, null, 2)}`);
      setCopyResult('copied');
    } catch {
      setCopyResult('failed');
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
    const requiredToken = t('settings.danger.reset_confirm_token');
    if (resetRunning || props.busy || resetConfirmText.trim() !== requiredToken) {
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
      setResetError(resolveErrorMessage(t, error, 'error.description.generic'));
    } finally {
      setResetRunning(false);
    }
  }, [props, resetConfirmText, resetRunning, t]);

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
  const sqliteDownloadUrl = latestPayload ? new URL(latestPayload.file_name, baseSqliteUrl).toString() : t('common.not_available');
  const dateLocale = resolveDateLocale(props.language);
  const noneText = t('common.not_available');
  const unknownText = t('common.unknown');
  const resetConfirmToken = t('settings.danger.reset_confirm_token');
  const verification =
    checkOutcome === 'latest'
      ? t('settings.song_data.verification.match')
      : checkOutcome === 'update_available'
        ? t('settings.song_data.verification.diff')
        : checkOutcome === 'check_failed'
          ? t('settings.song_data.verification.failed')
          : t('settings.song_data.verification.none');
  const cleanupCanProceed = Boolean(cleanupEstimate && cleanupEstimate.targetImageCount > 0);
  const canRunReset = resetConfirmText.trim() === resetConfirmToken;
  const shortLogs = props.logs.slice(0, 10);
  const errorLogs = props.logs.filter((v) => v.level === 'error').slice(0, 10);

  return (
    <Box sx={{ display: 'grid', gap: 2.5 }}>
      {health.reasons.length > 0 ? (
        <Card
          variant="outlined"
          data-testid="settings-health-summary-card"
          sx={{ ...cardSx, position: 'sticky', top: 8, zIndex: 2, borderColor: hStyle.border, backgroundColor: hStyle.bg }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
            <Stack direction="row" spacing={1} alignItems="center">
              {hStyle.icon}
              <Typography variant="h6" component="h2" fontWeight={700}>
                {t('settings.health.summary', { level: t(healthLabelKey(health.level)) })}
              </Typography>
            </Stack>
            <Button
              variant="contained"
              color={hStyle.color}
              onClick={runHealthAction}
              disabled={props.busy || runningCheck || cleanupRunning}
            >
              {t(healthActionLabelKey(health.action))}
            </Button>
          </Box>
          <Stack spacing={0.5}>
            {health.reasons.map((v) => (
              <Typography key={v.reasonKey} variant="body2" sx={{ color: 'var(--text-subtle)' }}>
                {t(v.reasonKey)}
              </Typography>
            ))}
          </Stack>
        </Card>
      ) : null}

      <Card variant="outlined" sx={cardSx}>
        <Typography variant="h6" component="h2" fontWeight={700}>
          {t('settings.language.title')}
        </Typography>
        <Typography variant="body2" sx={{ color: 'var(--text-subtle)' }}>
          {t('settings.language.description')}
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
            {t('settings.song_data.title')}
          </Typography>
          <Chip
            label={t(songStatusKey(songStatus))}
            color={songStatusColor(songStatus)}
            size="small"
            data-testid="settings-song-status-chip"
            data-song-status={songStatus}
          />
        </Box>
        <List dense disablePadding>
          {row(t('settings.song_data.status.label'), t(songStatusKey(songStatus)))}
          {row(t('settings.song_data.size'), fmtBytes(props.songMasterMeta.song_master_byte_size ?? null, unknownText))}
          {row(t('settings.song_data.last_fetched_at'), props.songMasterMeta.song_master_downloaded_at ?? noneText)}
          {row(t('settings.song_data.last_checked_at'), fmtDate(latestCheckedAt, dateLocale, noneText))}
        </List>
        {songUpdateAvailable ? (
          <Alert severity="info" variant="outlined">
            {t('settings.song_data.update_available')}
          </Alert>
        ) : null}
        {songStatus === 'check_not_run' ? (
          <Typography variant="body2" sx={{ color: 'var(--text-subtle)' }}>
            {t('settings.song_data.check_not_run_info')}
          </Typography>
        ) : null}
        {songStatus === 'update_failed_cache' ? (
          <Alert severity="warning" variant="outlined">
            {t('settings.song_data.update_failed_cache_info')}
          </Alert>
        ) : null}
        <Button variant="contained" disabled={props.busy || runningCheck} onClick={() => void handleCheckLatest()}>
          {runningCheck ? t('settings.song_data.action.checking') : t('settings.song_data.action.check_updates')}
        </Button>
        <Accordion disableGutters elevation={0} sx={accordionSx}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="body2" fontWeight={700}>
              {t('common.detail')}
            </Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0, display: 'grid', gap: 2 }}>
            <List dense disablePadding>
              {row(
                t('settings.song_data.detail.fetched_at'),
                fmtDate(props.songMasterMeta.song_master_downloaded_at ?? null, dateLocale, noneText),
              )}
              {row(
                t('settings.song_data.detail.generated_at'),
                props.songMasterMeta.song_master_generated_at ?? props.songMasterMeta.song_master_updated_at ?? noneText,
              )}
              {row(t('settings.song_data.detail.download_source'), t('settings.song_data.detail.download_source_value'))}
              {row(
                t('settings.song_data.detail.latest_result'),
                fmtSongResult(lastSongAction, (key, options) => String(t(key, options as never))),
              )}
            </List>
            <Stack spacing={0.5}>
              <Typography variant="caption" sx={{ color: 'var(--text-subtle)' }}>
                {t('settings.song_data.detail.latest_judgement_note')}
              </Typography>
              <Typography variant="caption" sx={{ color: 'var(--text-subtle)' }}>
                {t('settings.song_data.detail.failed_cache_note')}
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
                {t('settings.song_data.action.refetch')}
              </Button>
            </Box>
          </AccordionDetails>
        </Accordion>
        {props.debugModeEnabled ? (
          <Accordion disableGutters elevation={0} sx={accordionSx}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="body2" fontWeight={700}>
                {t('settings.song_data.technical.title')}
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0, display: 'grid', gap: 2 }}>
              <List dense disablePadding>
                {row(t('settings.song_data.technical.schema_version'), props.songMasterMeta.song_master_schema_version ?? noneText, true)}
                {row(t('settings.song_data.technical.sha256'), props.songMasterMeta.song_master_sha256 ?? noneText, true)}
                {row(t('settings.song_data.technical.latest_checked_at'), fmtDate(latestCheckedAt, dateLocale, noneText))}
                {row(t('settings.song_data.technical.latest_status_code'), latestCode === null ? noneText : String(latestCode))}
                {row(t('settings.song_data.technical.download_url'), sqliteDownloadUrl, true)}
                {row(t('settings.song_data.technical.verification'), verification)}
              </List>
              <Stack direction="row" spacing={1} alignItems="center">
                <Button variant="outlined" size="small" startIcon={<ContentCopyIcon />} onClick={() => void copyLogs()}>
                  {t('settings.song_data.technical.action.copy_logs')}
                </Button>
                {copyResult ? (
                  <Typography variant="caption" sx={{ color: 'var(--text-subtle)' }}>
                    {copyResult === 'copied' ? t('settings.logs.copied') : t('settings.logs.copy_failed')}
                  </Typography>
                ) : null}
              </Stack>
              {latestError ? (
                <Typography variant="caption" color="error.main">
                  {t('settings.song_data.technical.latest_error', { message: latestError })}
                </Typography>
              ) : null}
            </AccordionDetails>
          </Accordion>
        ) : null}
      </Card>

      <Card variant="outlined" sx={cardSx}>
        <Typography variant="h6" component="h2" fontWeight={700}>
          {t('settings.storage.title')}
        </Typography>
        <List dense disablePadding>
          {row(
            t('settings.storage.usage'),
            props.appInfo.storageUsageBytes === null || props.appInfo.storageQuotaBytes === null
              ? t('settings.storage.usage_unknown')
              : t('settings.storage.usage_value', {
                  used: fmtBytes(props.appInfo.storageUsageBytes, unknownText),
                  quota: fmtBytes(props.appInfo.storageQuotaBytes, unknownText),
                }),
          )}
          {row(t('settings.storage.risk'), t(riskKey(capacityRisk)))}
        </List>
        <Button variant="contained" onClick={openCleanupDialog} disabled={cleanupLoading || cleanupRunning}>
          {t('settings.storage.action.cleanup')}
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
          label={t('settings.storage.auto_delete.enable')}
        />
        <TextField
          type="number"
          size="small"
          label={t('settings.storage.auto_delete.days_label')}
          inputProps={{ min: AUTO_DELETE_DAYS_MIN, max: AUTO_DELETE_DAYS_MAX }}
          value={days}
          disabled={!enabled || savingAutoDelete}
          onChange={(e) => {
            const next = clampDays(Number(e.target.value));
            setDays(next);
            void saveAutoDelete(enabled, next);
          }}
          helperText={t('settings.storage.auto_delete.helper')}
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
              {row(t('settings.storage.detail.last_run_at'), fmtDate(props.lastCleanupResult?.executedAt ?? null, dateLocale, noneText))}
              {row(
                t('settings.storage.detail.deleted_image_count'),
                props.lastCleanupResult
                  ? t('settings.storage.detail.deleted_image_count_value', { value: props.lastCleanupResult.deletedImageCount })
                  : noneText,
              )}
              {row(
                t('settings.storage.detail.released'),
                props.lastCleanupResult ? fmtBytes(props.lastCleanupResult.releasedBytes, unknownText) : noneText,
              )}
            </List>
          </AccordionDetails>
        </Accordion>
      </Card>

      <Card variant="outlined" sx={cardSx}>
        <Typography variant="h6" component="h2" fontWeight={700}>
          {t('settings.app.title')}
        </Typography>
        <List dense disablePadding>
          {row(t('settings.app.version'), props.appInfo.appVersion || noneText, false, handleVersionTap, 'settings-app-version-trigger-button')}
          {row(t('settings.app.build_time'), props.appInfo.buildTime || noneText)}
          {row(t('settings.app.offline'), t(swLabelKey(props.appInfo.swStatus)))}
          {row(t('settings.app.update'), t(updateLabelKey(props.appInfo.swStatus)))}
        </List>
        {props.appInfo.swStatus === 'update_available' ? (
          <Button variant="text" size="small" onClick={props.onApplyAppUpdate}>
            {t('settings.app.action.apply_update')}
          </Button>
        ) : null}
        {props.debugModeEnabled ? (
          <Accordion disableGutters elevation={0} sx={accordionSx}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="body2" fontWeight={700}>
                {t('settings.app.technical.title')}
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0 }}>
              <List dense disablePadding>
                {row(t('settings.app.technical.sw_state'), props.appInfo.swState)}
                {row(t('settings.app.technical.sw_scope'), props.appInfo.swScope, true)}
                {row(t('settings.app.technical.version_build'), props.appInfo.swVersion || noneText)}
                {row(
                  t('settings.app.technical.clients_claim'),
                  props.appInfo.swClientsClaim === null
                    ? t('settings.app.technical.clients_claim_status.unknown')
                    : props.appInfo.swClientsClaim
                      ? t('settings.app.technical.clients_claim_status.enabled')
                      : t('settings.app.technical.clients_claim_status.disabled'),
                )}
                {row(
                  t('settings.app.technical.skip_waiting'),
                  props.appInfo.swSkipWaiting === null
                    ? t('settings.app.technical.skip_waiting_status.unknown')
                    : props.appInfo.swSkipWaiting
                      ? t('settings.app.technical.skip_waiting_status.waiting')
                      : t('settings.app.technical.skip_waiting_status.none'),
                )}
              </List>
            </AccordionDetails>
          </Accordion>
        ) : null}
      </Card>

      {props.debugModeEnabled ? (
        <Card variant="outlined" sx={cardSx} data-testid="settings-technical-card">
          <Typography variant="h6" component="h2" fontWeight={700}>
            {t('settings.technical.title')}
          </Typography>
          <Accordion disableGutters elevation={0} sx={accordionSx}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="body2" fontWeight={700}>
                {t('settings.technical.common_info')}
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0, display: 'grid', gap: 2 }}>
              <List dense disablePadding>
                {row(
                  t('settings.technical.web_locks'),
                  props.appInfo.webLocksStatus === 'acquired'
                    ? t('settings.technical.web_locks_value', { status: t(locksStatusKey(props.appInfo.webLocksStatus)) })
                    : t('settings.technical.web_locks_with_reason', {
                        status: t(locksStatusKey(props.appInfo.webLocksStatus)),
                        reason:
                          props.appInfo.webLocksStatus === 'unsupported'
                            ? t('settings.technical.web_locks_reason.unsupported')
                            : t('settings.technical.web_locks_reason.not_acquired'),
                      }),
                )}
                {row(
                  t('settings.technical.opfs'),
                  t('settings.technical.opfs_value', {
                    status: t(opfsStatusKey(props.appInfo.opfsStatus)),
                    usage: fmtBytes(props.appInfo.storageUsageBytes, unknownText),
                    free: fmtBytes(
                      props.appInfo.storageQuotaBytes !== null && props.appInfo.storageUsageBytes !== null
                        ? props.appInfo.storageQuotaBytes - props.appInfo.storageUsageBytes
                        : null,
                      unknownText,
                    ),
                  }),
                )}
                {row(t('settings.technical.db_integrity'), props.appInfo.appDbIntegrityCheck ?? unknownText)}
                {row(t('settings.technical.db_file_size'), fmtBytes(props.appInfo.appDbSizeBytes, unknownText))}
                {row(t('settings.technical.db_user_version'), props.appInfo.appDbUserVersion === null ? noneText : String(props.appInfo.appDbUserVersion))}
              </List>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="subtitle2">{t('settings.technical.latest_error_logs')}</Typography>
                <Button variant="outlined" size="small" startIcon={<ContentCopyIcon />} onClick={() => void copyLogs()}>
                  {t('common.copy')}
                </Button>
              </Stack>
              <Stack spacing={0.5}>
                {(errorLogs.length > 0 ? errorLogs : shortLogs).map((v) => (
                  <Typography key={v.id} variant="caption" sx={{ color: 'var(--text-subtle)' }}>
                    {t('settings.technical.log_line', { timestamp: v.timestamp, level: v.level, message: v.message })}
                  </Typography>
                ))}
                {errorLogs.length === 0 && shortLogs.length === 0 ? (
                  <Typography variant="caption" sx={{ color: 'var(--text-subtle)' }}>
                    {t('settings.technical.no_logs')}
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
          borderColor: 'var(--danger-border)',
          backgroundColor: 'var(--danger-bg)',
        }}
      >
        <Typography variant="h6" component="h2" fontWeight={700} color="error.main">
          {t('settings.danger.title')}
        </Typography>
        <Stack spacing={0.5}>
          <Typography variant="body2">{t('settings.danger.description')}</Typography>
          <Typography variant="body2" sx={{ color: 'var(--text-subtle)' }}>
            {t('settings.danger.items.tournament')}
          </Typography>
          <Typography variant="body2" sx={{ color: 'var(--text-subtle)' }}>
            {t('settings.danger.items.images')}
          </Typography>
          <Typography variant="body2" sx={{ color: 'var(--text-subtle)' }}>
            {t('settings.danger.items.song_data')}
          </Typography>
          <Typography variant="body2" color="error.main">
            {t('settings.danger.not_restorable')}
          </Typography>
        </Stack>
        <Button
          color="error"
          variant="contained"
          onClick={openResetGuideDialog}
          disabled={props.busy || resetRunning}
          data-testid="settings-reset-open-button"
        >
          {t('settings.danger.action.reset_local')}
        </Button>
      </Card>

      <Dialog open={resetGuideDialogOpen} onClose={closeResetGuideDialog} maxWidth="xs" fullWidth data-testid="settings-reset-guide-dialog">
        <DialogTitle>{t('settings.danger.guide.title')}</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 1 }}>
          <DialogContentText>{t('settings.danger.guide.description')}</DialogContentText>
          <Typography variant="body2">{t('settings.danger.items.tournament')}</Typography>
          <Typography variant="body2">{t('settings.danger.items.images')}</Typography>
          <Typography variant="body2">{t('settings.danger.items.song_data')}</Typography>
          <Typography variant="caption" sx={{ color: 'var(--text-subtle)' }}>
            {t('settings.danger.guide.next_hint')}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeResetGuideDialog} disabled={resetRunning}>
            {t('common.cancel')}
          </Button>
          <Button
            color="error"
            variant="outlined"
            onClick={proceedResetConfirmation}
            disabled={resetRunning}
            data-testid="settings-reset-guide-next-button"
          >
            {t('common.next')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={resetFinalDialogOpen} onClose={closeResetFinalDialog} maxWidth="xs" fullWidth data-testid="settings-reset-final-dialog">
        <DialogTitle>{t('settings.danger.final.title')}</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 1.25 }}>
          <DialogContentText>{t('settings.danger.final.description')}</DialogContentText>
          <TextField
            label={t('settings.danger.confirm_label')}
            size="small"
            value={resetConfirmText}
            onChange={(event) => setResetConfirmText(event.target.value)}
            disabled={resetRunning}
            placeholder={t('settings.danger.confirm_placeholder')}
            helperText={t('settings.danger.confirm_helper', { token: resetConfirmToken })}
            inputProps={{ 'data-testid': 'settings-reset-confirm-input' }}
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
            data-testid="settings-reset-execute-button"
          >
            {t('settings.danger.action.execute_reset')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={refetchConfirmOpen} onClose={() => setRefetchConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('settings.song_data.refetch_confirm.title')}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t('settings.song_data.refetch_confirm.description')}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRefetchConfirmOpen(false)}>{t('common.cancel')}</Button>
          <Button color="error" variant="contained" onClick={() => void runRefetch()}>
            {t('common.execute')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={refetchProgressOpen} onClose={() => setRefetchProgressOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('settings.song_data.refetch_progress.title')}</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 1.2 }}>
          {(['download', 'verify', 'save', 'complete'] as const).map((k) => {
            const st = refetchStepState(refetchPhase, k);
            return (
              <Typography key={k} variant="body2" sx={{ color: st.c }}>
                {st.m} {t(`settings.song_data.refetch_progress.step.${k}`)}
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
        <DialogTitle>{t('settings.storage.cleanup_dialog.title')}</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 1.2 }}>
          {cleanupLoading ? (
            <Typography variant="body2">{t('settings.storage.cleanup_dialog.loading')}</Typography>
          ) : (
            <>
              <Typography variant="body2">
                {t('settings.storage.cleanup_dialog.target_tournament_count', {
                  value: cleanupEstimate ? cleanupEstimate.targetTournamentCount : noneText,
                })}
              </Typography>
              <Typography variant="body2">
                {t('settings.storage.cleanup_dialog.target_image_count', {
                  value: cleanupEstimate ? cleanupEstimate.targetImageCount : noneText,
                })}
              </Typography>
              <Typography variant="body2">
                {t('settings.storage.cleanup_dialog.estimated_release', {
                  size: cleanupEstimate ? fmtBytes(cleanupEstimate.estimatedReleaseBytes, unknownText) : noneText,
                })}
              </Typography>
              <Typography variant="body2">{t('settings.storage.cleanup_dialog.not_restorable')}</Typography>
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
            {t('settings.storage.cleanup_dialog.action.proceed')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={cleanupConfirmOpen} onClose={() => setCleanupConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('settings.storage.cleanup_confirm.title')}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t('settings.storage.cleanup_confirm.description')}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCleanupConfirmOpen(false)} disabled={cleanupRunning}>
            {t('common.cancel')}
          </Button>
          <Button color="error" variant="contained" onClick={() => void runCleanup()} disabled={cleanupRunning}>
            {t('settings.storage.cleanup_confirm.action.execute')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
