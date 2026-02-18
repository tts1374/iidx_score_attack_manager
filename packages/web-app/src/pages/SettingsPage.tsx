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
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

import { resolveSongMasterRuntimeConfig } from '../services/song-master-config';

interface SettingsPageProps {
  appInfo: AppInfoCardData;
  songMasterMeta: Record<string, string | null>;
  autoDeleteEnabled: boolean;
  autoDeleteDays: number;
  busy: boolean;
  onCheckUpdate: (force: boolean) => Promise<void>;
  onSaveAutoDelete: (enabled: boolean, days: number) => Promise<void>;
  onRunAutoDelete: () => Promise<void>;
}

interface SongMasterLatestPayload {
  file_name: string;
  schema_version: string | number;
  sha256: string;
  byte_size: number;
  generated_at: string | null;
}

type SongMasterStatus = 'not_fetched' | 'unchecked' | 'latest' | 'update_available' | 'check_unavailable';
export type AppSwStatus = 'update_available' | 'enabled' | 'unregistered';

export interface AppInfoCardData {
  appVersion: string;
  buildTime: string;
  swStatus: AppSwStatus;
  swVersion: string;
  appDbUserVersion: number | null;
  appDbSizeBytes: number | null;
  webLocksStatus: 'acquired' | 'unsupported' | 'not_acquired';
  opfsStatus: 'available' | 'unsupported' | 'error';
}

const runtimeConfig = resolveSongMasterRuntimeConfig(import.meta.env);
const AUTO_DELETE_DAYS_MIN = 1;
const AUTO_DELETE_DAYS_MAX = 3650;
const settingsCardSx = {
  p: { xs: 2, sm: 2.5 },
  borderColor: '#dde4f1',
  boxShadow: '0 2px 10px rgba(15, 23, 42, 0.05)',
  display: 'grid',
  gap: 2,
} as const;

function pickText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function pickNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function pickSchemaVersion(value: unknown): string | number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }
  return null;
}

function parseLatestPayload(input: unknown): SongMasterLatestPayload {
  if (!input || typeof input !== 'object') {
    throw new Error('latest.json が不正です。');
  }

  const body = input as Record<string, unknown>;
  const fileName = pickText(body.file_name);
  const schemaVersion = pickSchemaVersion(body.schema_version);
  const sha256 = pickText(body.sha256);
  const byteSize = pickNumber(body.byte_size);
  const generatedAt = pickText(body.generated_at);

  if (!fileName || schemaVersion === null || !sha256 || byteSize === null || !generatedAt) {
    throw new Error('latest.json の必須項目が不足しています。');
  }

  return {
    file_name: fileName,
    schema_version: schemaVersion,
    sha256,
    byte_size: byteSize,
    generated_at: generatedAt,
  };
}

function formatSha256Short(value: string | null): string {
  if (!value) {
    return '-';
  }
  if (value.length <= 20) {
    return value;
  }
  return `${value.slice(0, 8)}…${value.slice(-8)}`;
}

function formatByteSize(rawBytes: string | number | null): string {
  const bytes = Number(rawBytes);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '-';
  }

  const gb = 1024 ** 3;
  const mb = 1024 ** 2;
  if (bytes >= gb) {
    return `${(bytes / gb).toFixed(2)} GB`;
  }
  if (bytes >= mb) {
    return `${(bytes / mb).toFixed(2)} MB`;
  }
  return `${bytes.toLocaleString()} bytes`;
}

function clampAutoDeleteDays(value: number): number {
  if (!Number.isFinite(value)) {
    return AUTO_DELETE_DAYS_MIN;
  }
  const normalized = Math.trunc(value);
  return Math.min(AUTO_DELETE_DAYS_MAX, Math.max(AUTO_DELETE_DAYS_MIN, normalized));
}

function statusChipStyle(status: SongMasterStatus): {
  label: string;
  color: 'default' | 'success' | 'warning' | 'error';
} {
  switch (status) {
    case 'not_fetched':
      return { label: '未取得', color: 'default' };
    case 'latest':
      return { label: '最新', color: 'success' };
    case 'update_available':
      return { label: '更新あり', color: 'warning' };
    case 'check_unavailable':
      return { label: '確認不可', color: 'error' };
    case 'unchecked':
    default:
      return { label: '未確認', color: 'default' };
  }
}

function appInfoStatusChipStyle(status: AppSwStatus): {
  label: string;
  color: 'default' | 'success' | 'warning';
} {
  switch (status) {
    case 'update_available':
      return { label: '更新あり', color: 'warning' };
    case 'enabled':
      return { label: '有効', color: 'success' };
    case 'unregistered':
    default:
      return { label: '未登録', color: 'default' };
  }
}

function webLocksStatusText(status: AppInfoCardData['webLocksStatus']): string {
  switch (status) {
    case 'acquired':
      return '取得済み';
    case 'unsupported':
      return '未対応';
    case 'not_acquired':
    default:
      return '未取得';
  }
}

function opfsStatusText(status: AppInfoCardData['opfsStatus']): string {
  switch (status) {
    case 'available':
      return '利用可';
    case 'unsupported':
      return '未対応';
    case 'error':
    default:
      return 'エラー';
  }
}

function keyValueRow(label: string, value: string, monospace = false): JSX.Element {
  return (
    <ListItem key={label} disableGutters sx={{ px: 0, py: 0.75 }}>
      <Box
        sx={{
          width: '100%',
          display: 'grid',
          gridTemplateColumns: { xs: '130px minmax(0, 1fr)', sm: '170px minmax(0, 1fr)' },
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
            ...(monospace
              ? {
                  fontFamily:
                    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                }
              : {}),
          }}
        >
          {value}
        </Typography>
      </Box>
    </ListItem>
  );
}

export function SettingsPage(props: SettingsPageProps): JSX.Element {
  const [enabled, setEnabled] = React.useState(props.autoDeleteEnabled);
  const [days, setDays] = React.useState(clampAutoDeleteDays(props.autoDeleteDays || 30));
  const [runningCheck, setRunningCheck] = React.useState(false);
  const [checkStatus, setCheckStatus] = React.useState<Exclude<SongMasterStatus, 'not_fetched' | 'unchecked'> | null>(null);
  const [latestPayload, setLatestPayload] = React.useState<SongMasterLatestPayload | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);

  React.useEffect(() => {
    setEnabled(props.autoDeleteEnabled);
    setDays(clampAutoDeleteDays(props.autoDeleteDays || 30));
  }, [props.autoDeleteEnabled, props.autoDeleteDays]);

  React.useEffect(() => {
    if (!latestPayload) {
      return;
    }
    const localSha = props.songMasterMeta.song_master_sha256;
    if (!localSha) {
      return;
    }
    setCheckStatus((current) => {
      if (current === 'check_unavailable') {
        return current;
      }
      return latestPayload.sha256 === localSha ? 'latest' : 'update_available';
    });
  }, [latestPayload, props.songMasterMeta.song_master_sha256]);

  const hasLocalSongMaster = Boolean(props.songMasterMeta.song_master_file_name && props.songMasterMeta.song_master_sha256);
  const status: SongMasterStatus =
    checkStatus === 'check_unavailable'
      ? 'check_unavailable'
      : !hasLocalSongMaster
        ? 'not_fetched'
        : checkStatus ?? 'unchecked';
  const chip = statusChipStyle(status);
  const appInfoChip = appInfoStatusChipStyle(props.appInfo.swStatus);
  const appSummaryRows = [
    ['アプリ版本体', props.appInfo.appVersion || '-'],
    ['ビルド日時', props.appInfo.buildTime || '-'],
    ['Service Worker', appInfoChip.label],
  ] as const;
  const appDetailRows = [
    ['SWバージョン', props.appInfo.swVersion || '-'],
    ['DBスキーマ（app_data）', props.appInfo.appDbUserVersion === null ? '-' : String(props.appInfo.appDbUserVersion)],
    ['DBファイルサイズ', formatByteSize(props.appInfo.appDbSizeBytes)],
    ['Web Locks', webLocksStatusText(props.appInfo.webLocksStatus)],
    ['OPFS', opfsStatusText(props.appInfo.opfsStatus)],
  ] as const;

  const summaryRows = [
    ['ファイル名', props.songMasterMeta.song_master_file_name ?? '-'],
    ['スキーマ', props.songMasterMeta.song_master_schema_version ?? '-'],
    ['SHA256', formatSha256Short(props.songMasterMeta.song_master_sha256 ?? null)],
    ['サイズ', formatByteSize(props.songMasterMeta.song_master_byte_size ?? null)],
    ['生成日', props.songMasterMeta.song_master_generated_at ?? props.songMasterMeta.song_master_updated_at ?? '-'],
    ['取得日', props.songMasterMeta.song_master_downloaded_at ?? '-'],
  ] as const;

  const handleCheckLatest = React.useCallback(async () => {
    setRunningCheck(true);
    try {
      setCheckStatus(null);
      await props.onCheckUpdate(false);
      const response = await fetch(runtimeConfig.latestJsonUrl, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`latest.json fetch failed: ${response.status}`);
      }
      const payload = parseLatestPayload(await response.json());
      setLatestPayload(payload);
      const localSha = props.songMasterMeta.song_master_sha256;
      if (!localSha) {
        setCheckStatus(null);
        return;
      }
      setCheckStatus(payload.sha256 === localSha ? 'latest' : 'update_available');
    } catch {
      setCheckStatus('check_unavailable');
    } finally {
      setRunningCheck(false);
    }
  }, [props]);

  return (
    <Box sx={{ display: 'grid', gap: 2.5 }}>
      <Card variant="outlined" sx={settingsCardSx}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2 }}>
          <Typography variant="h6" component="h2" fontWeight={700}>
            アプリ情報
          </Typography>
          <Chip label={appInfoChip.label} color={appInfoChip.color} size="small" />
        </Box>

        <List dense disablePadding>
          {appSummaryRows.map(([label, value]) => keyValueRow(label, value))}
        </List>

        <Accordion disableGutters elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: 2 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ borderRadius: 2 }}>
            <Typography variant="body2" fontWeight={700}>
              詳細を表示
            </Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0 }}>
            <List dense disablePadding>
              {appDetailRows.map(([label, value]) => keyValueRow(label, value))}
            </List>
          </AccordionDetails>
        </Accordion>
      </Card>

      <Card
        variant="outlined"
        sx={settingsCardSx}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2 }}>
          <Typography variant="h6" component="h2" fontWeight={700}>
            曲マスタ
          </Typography>
          <Chip label={chip.label} color={chip.color} size="small" />
        </Box>

        <List dense disablePadding>
          {summaryRows.map(([label, value]) => keyValueRow(label, value, label === 'SHA256'))}
        </List>

        {status === 'unchecked' ? (
          <Alert severity="info" variant="outlined">
            最新判定は「更新確認」実行時のみ行われます。
          </Alert>
        ) : null}
        {status === 'check_unavailable' ? (
          <Alert severity="warning" variant="outlined">
            更新確認に失敗しました。ローカルの曲マスタは保持されています。
          </Alert>
        ) : null}

        <Accordion disableGutters elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: 2 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ borderRadius: 2 }}>
            <Typography variant="body2" fontWeight={700}>
              詳細を表示
            </Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0 }}>
            <Stack spacing={2}>
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                  ローカル
                </Typography>
                <List dense disablePadding>
                  {keyValueRow('file_name', props.songMasterMeta.song_master_file_name ?? '-')}
                  {keyValueRow('schema_version', props.songMasterMeta.song_master_schema_version ?? '-')}
                  {keyValueRow('sha256', props.songMasterMeta.song_master_sha256 ?? '-', true)}
                  {keyValueRow('byte_size', props.songMasterMeta.song_master_byte_size ?? '-')}
                  {keyValueRow(
                    'generated_at',
                    props.songMasterMeta.song_master_generated_at ?? props.songMasterMeta.song_master_updated_at ?? '-',
                  )}
                  {keyValueRow('downloaded_at', props.songMasterMeta.song_master_downloaded_at ?? '-')}
                </List>
              </Box>
              {latestPayload ? (
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                    更新確認結果（remote latest.json）
                  </Typography>
                  <List dense disablePadding>
                    {keyValueRow('file_name', latestPayload.file_name)}
                    {keyValueRow('schema_version', String(latestPayload.schema_version))}
                    {keyValueRow('sha256', latestPayload.sha256, true)}
                    {keyValueRow('byte_size', String(latestPayload.byte_size))}
                    {keyValueRow('generated_at', latestPayload.generated_at ?? '-')}
                  </List>
                </Box>
              ) : null}
            </Stack>
          </AccordionDetails>
        </Accordion>

        <Stack direction="row" spacing={1} flexWrap="wrap">
          <Button variant="contained" disabled={props.busy || runningCheck} onClick={() => void handleCheckLatest()}>
            {runningCheck ? '確認中...' : '更新確認'}
          </Button>
          <Button
            variant="outlined"
            size="small"
            disabled={props.busy || runningCheck}
            onClick={() => {
              void props.onCheckUpdate(true);
            }}
          >
            強制更新
          </Button>
        </Stack>
      </Card>

      <Card
        variant="outlined"
        sx={settingsCardSx}
      >
        <Typography variant="h6" component="h2" fontWeight={700}>
          画像自動削除
        </Typography>

        <FormControlLabel
          control={
            <Switch
              checked={enabled}
              onChange={(event) => {
                setEnabled(event.target.checked);
              }}
            />
          }
          label="画像自動削除を有効にする"
        />

        <TextField
          type="number"
          label="終了後N日で画像削除"
          size="small"
          inputProps={{ min: AUTO_DELETE_DAYS_MIN, max: AUTO_DELETE_DAYS_MAX }}
          value={days}
          disabled={!enabled}
          onChange={(event) => {
            setDays(clampAutoDeleteDays(Number(event.target.value)));
          }}
          helperText="大会データは削除されません。画像のみ削除され、復元不可。"
        />

        <Stack direction="row" spacing={1} flexWrap="wrap">
          <Button
            variant="contained"
            disabled={props.busy}
            onClick={() => {
              void props.onSaveAutoDelete(enabled, days);
            }}
          >
            設定保存
          </Button>
          <Button variant="outlined" color="error" disabled={props.busy} onClick={() => setDeleteDialogOpen(true)}>
            今すぐ削除実行
          </Button>
        </Stack>
      </Card>

      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>画像削除を実行しますか？</DialogTitle>
        <DialogContent>
          <DialogContentText>終了した大会の画像を削除します。復元できません。</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>キャンセル</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              setDeleteDialogOpen(false);
              void props.onRunAutoDelete();
            }}
          >
            実行
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
