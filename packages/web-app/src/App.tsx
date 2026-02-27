import React from 'react';
import type { TournamentDetailItem, TournamentListItem, TournamentTab } from '@iidx/db';
import { PAYLOAD_VERSION, encodeTournamentPayload, normalizeHashtag, type TournamentPayload } from '@iidx/shared';
import { applyPwaUpdate, registerPwa } from '@iidx/pwa';
import {
  AppBar,
  Badge,
  Box,
  Button,
  Checkbox,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  FormControlLabel,
  FormGroup,
  IconButton,
  InputBase,
  Menu,
  MenuItem,
  SpeedDial,
  SpeedDialAction,
  Toolbar,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloseIcon from '@mui/icons-material/Close';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import FilterListIcon from '@mui/icons-material/FilterList';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PostAddIcon from '@mui/icons-material/PostAdd';
import SearchIcon from '@mui/icons-material/Search';

import { ImportQrScannerDialog } from './components/ImportQrScannerDialog';
import { UnsupportedScreen } from './components/UnsupportedScreen';
import { CreateTournamentPage } from './pages/CreateTournamentPage';
import { HomePage, sortForActiveTab } from './pages/HomePage';
import { ImportConfirmPage } from './pages/ImportConfirmPage';
import { ImportTournamentPage } from './pages/ImportTournamentPage';
import { SettingsPage, type AppInfoCardData, type AppSwStatus } from './pages/SettingsPage';
import { SubmitEvidencePage } from './pages/SubmitEvidencePage';
import { TournamentDetailPage } from './pages/TournamentDetailPage';
import {
  buildCreateTournamentInput,
  createInitialTournamentDraft,
  resolveCreateTournamentValidation,
  type CreateTournamentDraft,
} from './pages/create-tournament-draft';
import { useAppServices } from './services/context';
import { extractQrTextFromImage } from './utils/image';
import {
  IMPORT_DELEGATION_CHANNEL,
  IMPORT_DELEGATION_STORAGE_ACK_KEY,
  IMPORT_DELEGATION_STORAGE_REQUEST_KEY,
  buildImportAckMessage,
  isImportRequestMessage,
  parseImportRequestStorageValue,
} from './utils/import-delegation';
import {
  CREATE_TOURNAMENT_PATH,
  HOME_PATH,
  IMPORT_CONFIRM_PATH,
  buildImportConfirmPath,
  resolveRawImportPayloadParam,
} from './utils/payload-url';
import { consumeWhatsNewVisibility } from './utils/whats-new';
import { CURRENT_VERSION } from './version';
import { WHATS_NEW_LINES, WHATS_NEW_MODAL_DESCRIPTION, WHATS_NEW_MODAL_TITLE } from './whats-new-content';

function todayJst(): string {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

function formatByteSize(rawBytes: number | null): string {
  if (rawBytes === null || !Number.isFinite(rawBytes) || rawBytes < 0) {
    return '不明';
  }
  const bytes = rawBytes;
  const gb = 1024 ** 3;
  const mb = 1024 ** 2;
  if (bytes >= gb) {
    return `${(bytes / gb).toFixed(2)} GB`;
  }
  if (bytes >= mb) {
    return `${(bytes / mb).toFixed(2)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }
  return `${bytes} bytes`;
}

type RouteState =
  | { name: 'home' }
  | { name: 'import' }
  | { name: 'import-confirm' }
  | { name: 'create' }
  | { name: 'detail'; tournamentUuid: string }
  | { name: 'submit'; tournamentUuid: string; chartId: number }
  | { name: 'settings' };

function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function isImportConfirmPath(pathname: string): boolean {
  return normalizePathname(pathname) === IMPORT_CONFIRM_PATH;
}

function isCreatePath(pathname: string): boolean {
  return normalizePathname(pathname) === CREATE_TOURNAMENT_PATH;
}

function createInitialRouteStack(): RouteState[] {
  if (isImportConfirmPath(window.location.pathname)) {
    return [{ name: 'home' }, { name: 'import-confirm' }];
  }
  return [{ name: 'home' }];
}

const INITIAL_SONG_MASTER_META: Record<string, string | null> = {
  song_master_file_name: null,
  song_master_schema_version: null,
  song_master_sha256: null,
  song_master_byte_size: null,
  song_master_generated_at: null,
  song_master_updated_at: null,
  song_master_downloaded_at: null,
  last_song_master_file_name: null,
  last_song_master_schema_version: null,
  last_song_master_sha256: null,
  last_song_master_byte_size: null,
  last_song_master_generated_at: null,
  last_song_master_downloaded_at: null,
};

const BUILD_TIME =
  typeof __BUILD_TIME__ === 'string' && __BUILD_TIME__.trim().length > 0 ? __BUILD_TIME__ : '-';
const SW_VERSION_REQUEST_TIMEOUT_MS = 1500;
const DEBUG_MODE_STORAGE_KEY = 'iidx:debug:mode';

function readDebugMode(): boolean {
  try {
    return window.localStorage.getItem(DEBUG_MODE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeDebugMode(enabled: boolean): void {
  try {
    window.localStorage.setItem(DEBUG_MODE_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // ignore storage failures
  }
}
const HOME_CREATE_FAB_TOOLTIP_KEY = 'iidx.home.create-fab-tooltip-seen';

type HomeFilterCategory = 'none' | 'pending' | 'completed';
type HomeFilterAttr = 'send-waiting' | 'imported' | 'created';
type HomeSort = 'default' | 'deadline' | 'progress-low' | 'send-waiting-high' | 'name';
type HomeFilterSheetFocusSection = 'state' | 'category' | 'attrs' | 'sort' | null;

interface HomeQueryState {
  state: TournamentTab;
  searchText: string;
  category: HomeFilterCategory;
  attrs: HomeFilterAttr[];
  sort: HomeSort;
}

interface HomeTournamentBuckets {
  active: TournamentListItem[];
  upcoming: TournamentListItem[];
  ended: TournamentListItem[];
}

const HOME_DEFAULT_QUERY_STATE: HomeQueryState = {
  state: 'active',
  searchText: '',
  category: 'none',
  attrs: [],
  sort: 'default',
};

function createDefaultHomeQueryState(): HomeQueryState {
  return {
    state: HOME_DEFAULT_QUERY_STATE.state,
    searchText: HOME_DEFAULT_QUERY_STATE.searchText,
    category: HOME_DEFAULT_QUERY_STATE.category,
    attrs: [],
    sort: HOME_DEFAULT_QUERY_STATE.sort,
  };
}

const EMPTY_HOME_TOURNAMENT_BUCKETS: HomeTournamentBuckets = {
  active: [],
  upcoming: [],
  ended: [],
};

const HOME_FILTER_ATTR_VALUES: readonly HomeFilterAttr[] = ['send-waiting', 'imported', 'created'];

function normalizeAsciiLowercase(value: string): string {
  return value.replace(/[A-Z]/g, (char) => char.toLowerCase());
}

function normalizeHomeSearchText(value: string): string {
  const withoutHash = value.replace(/#/g, '');
  const normalizedCase = normalizeAsciiLowercase(withoutHash);
  return normalizedCase.replace(/\s+/g, ' ');
}

function normalizeHomeSearchForFilter(value: string): string {
  return normalizeHomeSearchText(value).trim();
}

function homeSearchTokens(searchText: string): string[] {
  const normalized = normalizeHomeSearchForFilter(searchText);
  if (normalized.length === 0) {
    return [];
  }
  return normalized.split(' ');
}

function normalizeHomeSearchField(value: string): string {
  return normalizeAsciiLowercase(value.replace(/#/g, ''));
}

function hasAllSearchTokens(item: TournamentListItem, tokens: readonly string[]): boolean {
  if (tokens.length === 0) {
    return true;
  }
  const fields = [
    normalizeHomeSearchField(item.tournamentName),
    normalizeHomeSearchField(item.owner),
    normalizeHomeSearchField(item.hashtag),
  ];
  return tokens.every((token) => fields.some((field) => field.includes(token)));
}

function hasCategory(item: TournamentListItem, category: HomeFilterCategory): boolean {
  if (category === 'pending') {
    return item.submittedCount < item.chartCount;
  }
  if (category === 'completed') {
    return item.submittedCount === item.chartCount;
  }
  return true;
}

function hasAttr(item: TournamentListItem, attr: HomeFilterAttr): boolean {
  if (attr === 'send-waiting') {
    return item.sendWaitingCount > 0;
  }
  if (attr === 'imported') {
    return item.isImported;
  }
  return !item.isImported;
}

function compareNameAndIdentity(a: TournamentListItem, b: TournamentListItem): number {
  const nameComparison = a.tournamentName.localeCompare(b.tournamentName, 'ja');
  if (nameComparison !== 0) {
    return nameComparison;
  }
  return a.tournamentUuid.localeCompare(b.tournamentUuid);
}

function compareEndThenStartAscending(a: TournamentListItem, b: TournamentListItem): number {
  const endDateComparison = a.endDate.localeCompare(b.endDate);
  if (endDateComparison !== 0) {
    return endDateComparison;
  }
  const startDateComparison = a.startDate.localeCompare(b.startDate);
  if (startDateComparison !== 0) {
    return startDateComparison;
  }
  return compareNameAndIdentity(a, b);
}

function compareStartThenEndAscending(a: TournamentListItem, b: TournamentListItem): number {
  const startDateComparison = a.startDate.localeCompare(b.startDate);
  if (startDateComparison !== 0) {
    return startDateComparison;
  }
  const endDateComparison = a.endDate.localeCompare(b.endDate);
  if (endDateComparison !== 0) {
    return endDateComparison;
  }
  return compareNameAndIdentity(a, b);
}

function compareEndThenStartDescending(a: TournamentListItem, b: TournamentListItem): number {
  const endDateComparison = b.endDate.localeCompare(a.endDate);
  if (endDateComparison !== 0) {
    return endDateComparison;
  }
  const startDateComparison = b.startDate.localeCompare(a.startDate);
  if (startDateComparison !== 0) {
    return startDateComparison;
  }
  return compareNameAndIdentity(a, b);
}

function progressRatio(item: TournamentListItem): number {
  if (item.chartCount <= 0) {
    return 1;
  }
  return item.submittedCount / item.chartCount;
}

function sortHomeItems(items: TournamentListItem[], query: HomeQueryState): TournamentListItem[] {
  if (items.length <= 1) {
    return items;
  }

  if (query.sort === 'default' && query.state !== 'active') {
    return items;
  }

  const sorted = [...items];
  switch (query.sort) {
    case 'default':
      sorted.sort(sortForActiveTab);
      return sorted;
    case 'deadline':
      if (query.state === 'upcoming') {
        sorted.sort(compareStartThenEndAscending);
        return sorted;
      }
      if (query.state === 'ended') {
        sorted.sort(compareEndThenStartDescending);
        return sorted;
      }
      sorted.sort(compareEndThenStartAscending);
      return sorted;
    case 'progress-low':
      sorted.sort((a, b) => {
        const progressComparison = progressRatio(a) - progressRatio(b);
        if (progressComparison !== 0) {
          return progressComparison;
        }
        return compareEndThenStartAscending(a, b);
      });
      return sorted;
    case 'send-waiting-high':
      sorted.sort((a, b) => {
        const waitingComparison = b.sendWaitingCount - a.sendWaitingCount;
        if (waitingComparison !== 0) {
          return waitingComparison;
        }
        return compareEndThenStartAscending(a, b);
      });
      return sorted;
    case 'name':
      sorted.sort((a, b) => {
        const nameComparison = compareNameAndIdentity(a, b);
        if (nameComparison !== 0) {
          return nameComparison;
        }
        return compareEndThenStartAscending(a, b);
      });
      return sorted;
    default:
      return sorted;
  }
}

function applyHomeQueryState(
  buckets: HomeTournamentBuckets,
  query: HomeQueryState,
): TournamentListItem[] {
  const baseItems = buckets[query.state];
  const tokens = homeSearchTokens(query.searchText);
  const filtered = baseItems.filter((item) => {
    if (!hasAllSearchTokens(item, tokens)) {
      return false;
    }
    if (!hasCategory(item, query.category)) {
      return false;
    }
    for (const attr of query.attrs) {
      if (!hasAttr(item, attr)) {
        return false;
      }
    }
    return true;
  });
  return sortHomeItems(filtered, query);
}

function isTournamentTab(value: string): value is TournamentTab {
  return value === 'active' || value === 'upcoming' || value === 'ended';
}

function isHomeSort(value: string): value is HomeSort {
  return value === 'default' || value === 'deadline' || value === 'progress-low' || value === 'send-waiting-high' || value === 'name';
}

function isHomeFilterCategory(value: string): value is HomeFilterCategory {
  return value === 'none' || value === 'pending' || value === 'completed';
}

function parseHomeFilterAttrs(raw: string | null): HomeFilterAttr[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    const deduped = new Set<HomeFilterAttr>();
    for (const value of parsed) {
      if (typeof value !== 'string') {
        continue;
      }
      if (HOME_FILTER_ATTR_VALUES.includes(value as HomeFilterAttr)) {
        deduped.add(value as HomeFilterAttr);
      }
    }
    return [...deduped];
  } catch {
    return [];
  }
}

function normalizeHomeAttrs(attrs: readonly HomeFilterAttr[]): HomeFilterAttr[] {
  const deduped = new Set<HomeFilterAttr>();
  for (const attr of attrs) {
    deduped.add(attr);
  }
  return [...HOME_FILTER_ATTR_VALUES.filter((value) => deduped.has(value))];
}

function homeStateLabel(state: TournamentTab): string {
  if (state === 'upcoming') {
    return '開催前';
  }
  if (state === 'ended') {
    return '終了';
  }
  return '開催中';
}

function homeCategoryLabel(category: HomeFilterCategory): string {
  if (category === 'pending') {
    return '未登録あり';
  }
  return '全登録済み';
}

function homeAttrLabel(attr: HomeFilterAttr): string {
  if (attr === 'send-waiting') {
    return '送信待ちあり';
  }
  if (attr === 'imported') {
    return 'インポート大会';
  }
  return '自作大会';
}

function homeSortLabel(sort: HomeSort): string {
  if (sort === 'deadline') {
    return '期日が近い順';
  }
  if (sort === 'progress-low') {
    return '進捗が低い順';
  }
  if (sort === 'send-waiting-high') {
    return '送信待ちが多い順';
  }
  if (sort === 'name') {
    return '名前順';
  }
  return 'デフォルト';
}

function isHomeQueryDefault(query: HomeQueryState): boolean {
  return (
    query.state === HOME_DEFAULT_QUERY_STATE.state &&
    normalizeHomeSearchForFilter(query.searchText) === HOME_DEFAULT_QUERY_STATE.searchText &&
    query.category === HOME_DEFAULT_QUERY_STATE.category &&
    query.attrs.length === 0 &&
    query.sort === HOME_DEFAULT_QUERY_STATE.sort
  );
}

interface AppProps {
  webLockAcquired?: boolean;
}

interface AppInfoDetailState {
  swVersion: string;
  swScope: string;
  swState: string;
  swClientsClaim: boolean | null;
  swSkipWaiting: boolean | null;
  appDbUserVersion: number | null;
  appDbSizeBytes: number | null;
  appDbIntegrityCheck: string | null;
  webLocksStatus: AppInfoCardData['webLocksStatus'];
  webLocksReason: string | null;
  opfsStatus: AppInfoCardData['opfsStatus'];
  storageUsageBytes: number | null;
  storageQuotaBytes: number | null;
}

interface SongMasterActionResult {
  ok: boolean;
  source: string;
  message: string | null;
  latestSha256: string | null;
  localSha256: string | null;
  checkedAt: string;
}

interface RuntimeLogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  category: string;
  message: string;
  detail?: string;
}

function resolveWebLocksReason(status: AppInfoCardData['webLocksStatus']): string | null {
  switch (status) {
    case 'acquired':
      return null;
    case 'unsupported':
      return 'ブラウザが Web Locks API に未対応です。';
    case 'not_acquired':
    default:
      return '別タブで稼働中の可能性があります。';
  }
}

function resolveServiceWorkerState(registration: ServiceWorkerRegistration | null): string {
  if (!registration) {
    return 'inactive';
  }
  return registration.active?.state ?? registration.waiting?.state ?? registration.installing?.state ?? 'inactive';
}

async function resolveStorageEstimate(): Promise<{ usageBytes: number | null; quotaBytes: number | null }> {
  if (!navigator.storage?.estimate) {
    return { usageBytes: null, quotaBytes: null };
  }
  try {
    const estimate = await navigator.storage.estimate();
    const usageBytes = Number(estimate.usage);
    const quotaBytes = Number(estimate.quota);
    return {
      usageBytes: Number.isFinite(usageBytes) && usageBytes >= 0 ? usageBytes : null,
      quotaBytes: Number.isFinite(quotaBytes) && quotaBytes > 0 ? quotaBytes : null,
    };
  } catch {
    return { usageBytes: null, quotaBytes: null };
  }
}

function resolveServiceWorkerStatus(pwaUpdate: ServiceWorkerRegistration | null, hasController: boolean): AppSwStatus {
  if (pwaUpdate) {
    return 'update_available';
  }
  return hasController ? 'enabled' : 'unregistered';
}

async function requestServiceWorkerVersion(): Promise<string | null> {
  if (!('serviceWorker' in navigator)) {
    return null;
  }
  const controller = navigator.serviceWorker.controller;
  if (!controller) {
    return null;
  }

  return new Promise<string | null>((resolve) => {
    const channel = new MessageChannel();
    let settled = false;
    const timerId = window.setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      channel.port1.close();
      resolve(null);
    }, SW_VERSION_REQUEST_TIMEOUT_MS);

    channel.port1.onmessage = (event: MessageEvent) => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timerId);
      channel.port1.close();
      const payload = event.data as { type?: string; value?: unknown } | undefined;
      if (payload?.type === 'SW_VERSION' && typeof payload.value === 'string' && payload.value.trim().length > 0) {
        resolve(payload.value);
        return;
      }
      resolve(null);
    };

    try {
      controller.postMessage({ type: 'GET_SW_VERSION' }, [channel.port2]);
    } catch {
      window.clearTimeout(timerId);
      channel.port1.close();
      resolve(null);
    }
  });
}

function resolveWebLocksStatus(webLockAcquired: boolean): AppInfoCardData['webLocksStatus'] {
  if (!navigator.locks?.request) {
    return 'unsupported';
  }
  return webLockAcquired ? 'acquired' : 'not_acquired';
}

async function resolveOpfsStatus(): Promise<AppInfoCardData['opfsStatus']> {
  const nav = navigator as Navigator & {
    storage?: { getDirectory?: () => Promise<FileSystemDirectoryHandle> };
  };
  if (typeof nav.storage?.getDirectory !== 'function') {
    return 'unsupported';
  }
  try {
    await nav.storage.getDirectory();
    return 'available';
  } catch {
    return 'error';
  }
}

export function App({ webLockAcquired = false }: AppProps = {}): JSX.Element {
  const { appDb, songMasterService } = useAppServices();

  const [routeStack, setRouteStack] = React.useState<RouteState[]>(() => createInitialRouteStack());
  const [homeQuery, setHomeQuery] = React.useState<HomeQueryState>(() => createDefaultHomeQueryState());
  const [homeFilterDraft, setHomeFilterDraft] = React.useState<HomeQueryState>(() => createDefaultHomeQueryState());
  const [homeTournamentBuckets, setHomeTournamentBuckets] = React.useState<HomeTournamentBuckets>(EMPTY_HOME_TOURNAMENT_BUCKETS);
  const [homeSearchMode, setHomeSearchMode] = React.useState(false);
  const [homeFilterSheetOpen, setHomeFilterSheetOpen] = React.useState(false);
  const [homeFilterFocusSection, setHomeFilterFocusSection] = React.useState<HomeFilterSheetFocusSection>(null);
  const [detail, setDetail] = React.useState<TournamentDetailItem | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [songMasterReady, setSongMasterReady] = React.useState(false);
  const [songMasterMeta, setSongMasterMeta] = React.useState<Record<string, string | null>>(INITIAL_SONG_MASTER_META);
  const [autoDeleteEnabled, setAutoDeleteEnabled] = React.useState(false);
  const [autoDeleteDays, setAutoDeleteDays] = React.useState(30);
  const [toast, setToast] = React.useState<string | null>(null);
  const [pwaUpdate, setPwaUpdate] = React.useState<ServiceWorkerRegistration | null>(null);
  const [hasSwController, setHasSwController] = React.useState(() =>
    'serviceWorker' in navigator ? Boolean(navigator.serviceWorker.controller) : false,
  );
  const [appInfoDetails, setAppInfoDetails] = React.useState<AppInfoDetailState>(() => ({
    swVersion: '-',
    swScope: '-',
    swState: 'inactive',
    swClientsClaim: null,
    swSkipWaiting: null,
    appDbUserVersion: null,
    appDbSizeBytes: null,
    appDbIntegrityCheck: null,
    webLocksStatus: resolveWebLocksStatus(webLockAcquired),
    webLocksReason: resolveWebLocksReason(resolveWebLocksStatus(webLockAcquired)),
    opfsStatus: 'unsupported',
    storageUsageBytes: null,
    storageQuotaBytes: null,
  }));
  const [runtimeLogs, setRuntimeLogs] = React.useState<RuntimeLogEntry[]>([]);
  const [lastCleanupResult, setLastCleanupResult] = React.useState<Awaited<ReturnType<typeof appDb.purgeExpiredEvidence>> | null>(
    null,
  );
  const [fatalError, setFatalError] = React.useState<string | null>(null);
  const [homeMenuAnchorEl, setHomeMenuAnchorEl] = React.useState<HTMLElement | null>(null);
  const [detailMenuAnchorEl, setDetailMenuAnchorEl] = React.useState<HTMLElement | null>(null);
  const [deleteTournamentDialogOpen, setDeleteTournamentDialogOpen] = React.useState(false);
  const [deleteTournamentBusy, setDeleteTournamentBusy] = React.useState(false);
  const [speedDialOpen, setSpeedDialOpen] = React.useState(false);
  const [showCreateFabTooltip, setShowCreateFabTooltip] = React.useState(false);
  const [qrImportDialogOpen, setQrImportDialogOpen] = React.useState(false);
  const [createDraft, setCreateDraft] = React.useState<CreateTournamentDraft | null>(null);
  const [createSaving, setCreateSaving] = React.useState(false);
  const [createSaveError, setCreateSaveError] = React.useState<string | null>(null);
  const [debugModeEnabled, setDebugModeEnabled] = React.useState(() => readDebugMode());
  const [detailTechnicalDialogOpen, setDetailTechnicalDialogOpen] = React.useState(false);
  const [detailDebugLastError, setDetailDebugLastError] = React.useState<string | null>(null);
  const [whatsNewDialogOpen, setWhatsNewDialogOpen] = React.useState(false);
  const appTabIdRef = React.useRef<string>(crypto.randomUUID());
  const handledDelegationRequestIdsRef = React.useRef<Set<string>>(new Set());
  const homeSearchInputRef = React.useRef<HTMLInputElement | null>(null);
  const homeStateSectionRef = React.useRef<HTMLDivElement | null>(null);
  const homeCategorySectionRef = React.useRef<HTMLDivElement | null>(null);
  const homeAttrsSectionRef = React.useRef<HTMLDivElement | null>(null);
  const homeSortSectionRef = React.useRef<HTMLDivElement | null>(null);

  const route = routeStack[routeStack.length - 1] ?? { name: 'home' };
  const isHomeRoute = route.name === 'home';
  const isDetailRoute = route.name === 'detail';
  const isSettingsRoute = route.name === 'settings';
  const canUseQrImport = window.isSecureContext === true && typeof navigator.mediaDevices?.getUserMedia === 'function';
  const todayDate = todayJst();
  const swStatus = resolveServiceWorkerStatus(pwaUpdate, hasSwController);
  const appInfoSnapshot = React.useMemo<AppInfoCardData>(
    () => ({
      appVersion: CURRENT_VERSION,
      buildTime: BUILD_TIME,
      swStatus,
      swVersion: appInfoDetails.swVersion,
      swScope: appInfoDetails.swScope,
      swState: appInfoDetails.swState,
      swClientsClaim: appInfoDetails.swClientsClaim,
      swSkipWaiting: appInfoDetails.swSkipWaiting,
      appDbUserVersion: appInfoDetails.appDbUserVersion,
      appDbSizeBytes: appInfoDetails.appDbSizeBytes,
      appDbIntegrityCheck: appInfoDetails.appDbIntegrityCheck,
      webLocksStatus: appInfoDetails.webLocksStatus,
      webLocksReason: appInfoDetails.webLocksReason,
      opfsStatus: appInfoDetails.opfsStatus,
      storageUsageBytes: appInfoDetails.storageUsageBytes,
      storageQuotaBytes: appInfoDetails.storageQuotaBytes,
    }),
    [appInfoDetails, swStatus],
  );
  const latestRuntimeError = React.useMemo(
    () => runtimeLogs.find((entry) => entry.level === 'error') ?? null,
    [runtimeLogs],
  );
  const detailPayloadSizeBytes = React.useMemo(() => {
    if (!detail) {
      return 0;
    }
    try {
      const payload = encodeTournamentPayload({
        v: PAYLOAD_VERSION,
        uuid: detail.sourceTournamentUuid ?? detail.tournamentUuid,
        name: detail.tournamentName,
        owner: detail.owner,
        hashtag: normalizeHashtag(detail.hashtag) || 'IIDX',
        start: detail.startDate,
        end: detail.endDate,
        charts: detail.charts.map((chart) => chart.chartId),
      });
      return new TextEncoder().encode(payload).length;
    } catch {
      return 0;
    }
  }, [detail]);
  const detailTechnicalInfo = React.useMemo(() => {
    if (!detail) {
      return null;
    }
    return {
      tournament_uuid: detail.tournamentUuid,
      source_tournament_uuid: detail.sourceTournamentUuid,
      def_hash: detail.defHash,
      payload_size_bytes: detailPayloadSizeBytes,
      last_error: detailDebugLastError ?? latestRuntimeError?.message ?? null,
    };
  }, [detail, detailDebugLastError, detailPayloadSizeBytes, latestRuntimeError]);
  const detailTechnicalLogText = React.useMemo(() => {
    if (!detailTechnicalInfo) {
      return '';
    }
    return JSON.stringify(
      {
        ...detailTechnicalInfo,
        runtime_logs: runtimeLogs.slice(0, 20).map((entry) => ({
          timestamp: entry.timestamp,
          level: entry.level,
          category: entry.category,
          message: entry.message,
          detail: entry.detail ?? null,
        })),
      },
      null,
      2,
    );
  }, [detailTechnicalInfo, runtimeLogs]);
  const homeVisibleItems = React.useMemo(
    () => applyHomeQueryState(homeTournamentBuckets, homeQuery),
    [homeQuery, homeTournamentBuckets],
  );
  const homeDraftResultCount = React.useMemo(
    () => applyHomeQueryState(homeTournamentBuckets, homeFilterDraft).length,
    [homeFilterDraft, homeTournamentBuckets],
  );
  const homeHasNonDefaultQuery = !isHomeQueryDefault(homeQuery);
  const homeNormalizedSearch = normalizeHomeSearchForFilter(homeQuery.searchText);
  const homeHasSearchQuery = homeNormalizedSearch.length > 0;

  const openHomeFilterSheet = React.useCallback(
    (focusSection: HomeFilterSheetFocusSection = null) => {
      setHomeFilterDraft({
        ...homeQuery,
        attrs: [...homeQuery.attrs],
      });
      setHomeFilterFocusSection(focusSection);
      setHomeFilterSheetOpen(true);
      setHomeSearchMode(false);
    },
    [homeQuery],
  );

  const closeHomeFilterSheet = React.useCallback(() => {
    setHomeFilterSheetOpen(false);
    setHomeFilterFocusSection(null);
  }, []);

  const applyHomeFilterSheet = React.useCallback(() => {
    setHomeQuery({
      ...homeFilterDraft,
      attrs: normalizeHomeAttrs(homeFilterDraft.attrs),
    });
    setHomeFilterSheetOpen(false);
    setHomeFilterFocusSection(null);
  }, [homeFilterDraft]);

  const resetHomeFilterSheet = React.useCallback(() => {
    setHomeFilterDraft(createDefaultHomeQueryState());
  }, []);

  const setHomeSearchText = React.useCallback((value: string) => {
    const normalized = normalizeHomeSearchText(value);
    setHomeQuery((previous) => ({
      ...previous,
      searchText: normalized,
    }));
  }, []);

  const clearHomeSearchText = React.useCallback(() => {
    setHomeQuery((previous) => ({
      ...previous,
      searchText: '',
    }));
  }, []);

  React.useEffect(() => {
    if (!homeSearchMode) {
      return;
    }
    const timerId = window.setTimeout(() => {
      homeSearchInputRef.current?.focus();
      homeSearchInputRef.current?.select();
    }, 0);
    return () => {
      window.clearTimeout(timerId);
    };
  }, [homeSearchMode]);

  React.useEffect(() => {
    if (!homeSearchMode) {
      return;
    }
    setHomeMenuAnchorEl(null);
  }, [homeSearchMode]);

  React.useEffect(() => {
    if (isHomeRoute) {
      return;
    }
    setHomeSearchMode(false);
    setHomeFilterSheetOpen(false);
    setHomeFilterFocusSection(null);
  }, [isHomeRoute]);

  React.useEffect(() => {
    if (!homeFilterSheetOpen || !homeFilterFocusSection) {
      return;
    }
    const sectionRef =
      homeFilterFocusSection === 'state'
        ? homeStateSectionRef
        : homeFilterFocusSection === 'category'
          ? homeCategorySectionRef
          : homeFilterFocusSection === 'attrs'
            ? homeAttrsSectionRef
            : homeSortSectionRef;
    sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [homeFilterFocusSection, homeFilterSheetOpen]);

  const pushRoute = React.useCallback((next: RouteState) => {
    setRouteStack((previous) => [...previous, next]);
  }, []);

  const replaceRoute = React.useCallback((next: RouteState) => {
    setRouteStack((previous) => {
      if (previous.length === 0) {
        return [next];
      }
      return [...previous.slice(0, -1), next];
    });
  }, []);

  const popRoute = React.useCallback(() => {
    setRouteStack((previous) => {
      if (previous.length <= 1) {
        return previous;
      }
      return previous.slice(0, -1);
    });
  }, []);

  const resetRoute = React.useCallback((next: RouteState) => {
    setRouteStack([next]);
  }, []);

  const openImportConfirm = React.useCallback(
    (rawPayloadParam: string | null) => {
      const targetPath = buildImportConfirmPath(rawPayloadParam);
      window.history.replaceState(window.history.state, '', targetPath);
      if (route.name === 'import-confirm') {
        replaceRoute({ name: 'import-confirm' });
        return;
      }
      pushRoute({ name: 'import-confirm' });
    },
    [pushRoute, replaceRoute, route.name],
  );

  const pushToast = React.useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => {
      setToast((current) => (current === message ? null : current));
    }, 4000);
  }, []);

  const toggleDebugMode = React.useCallback(() => {
    setDebugModeEnabled((current) => {
      const next = !current;
      writeDebugMode(next);
      pushToast(next ? 'デバッグモードを有効にしました。' : 'デバッグモードを無効にしました。');
      return next;
    });
  }, [pushToast]);
  const closeCreateFabTooltip = React.useCallback(() => {
    setShowCreateFabTooltip(false);
  }, []);
  const closeWhatsNewDialog = React.useCallback(() => {
    setWhatsNewDialogOpen(false);
  }, []);

  React.useEffect(() => {
    if (!isHomeRoute) {
      return;
    }
    if (!consumeWhatsNewVisibility(CURRENT_VERSION)) {
      return;
    }
    setWhatsNewDialogOpen(true);
  }, [isHomeRoute]);

  React.useEffect(() => {
    if (!isHomeRoute) {
      setShowCreateFabTooltip(false);
      return;
    }
    let shouldShow = false;
    try {
      shouldShow = window.localStorage.getItem(HOME_CREATE_FAB_TOOLTIP_KEY) !== '1';
      if (shouldShow) {
        window.localStorage.setItem(HOME_CREATE_FAB_TOOLTIP_KEY, '1');
      }
    } catch {
      shouldShow = true;
    }
    if (shouldShow) {
      setShowCreateFabTooltip(true);
    }
  }, [isHomeRoute]);

  React.useEffect(() => {
    if (!showCreateFabTooltip) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setShowCreateFabTooltip(false);
    }, 3200);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [showCreateFabTooltip]);

  const appendRuntimeLog = React.useCallback(
    (entry: Omit<RuntimeLogEntry, 'id' | 'timestamp'> & { timestamp?: string }) => {
      const timestamp = entry.timestamp ?? new Date().toISOString();
      setRuntimeLogs((previous) => [
        {
          id: `${timestamp}:${crypto.randomUUID()}`,
          timestamp,
          level: entry.level,
          category: entry.category,
          message: entry.message,
          ...(entry.detail ? { detail: entry.detail } : {}),
        },
        ...previous,
      ].slice(0, 60));
    },
    [],
  );

  const refreshTournamentList = React.useCallback(async () => {
    const [active, upcoming, ended] = await Promise.all([
      appDb.listTournaments('active'),
      appDb.listTournaments('upcoming'),
      appDb.listTournaments('ended'),
    ]);
    setHomeTournamentBuckets({ active, upcoming, ended });
  }, [appDb]);

  const refreshSettingsSnapshot = React.useCallback(async () => {
    const songMeta = await appDb.getSongMasterMeta();
    const songReady = await appDb.hasSongMaster();
    const config = await appDb.getAutoDeleteConfig();
    setSongMasterMeta(songMeta);
    setSongMasterReady(songReady);
    setAutoDeleteEnabled(config.enabled);
    setAutoDeleteDays(config.days || 30);
    return {
      songMeta,
      songReady,
    };
  }, [appDb]);

  const collectAppInfoDetails = React.useCallback(async (): Promise<AppInfoDetailState> => {
    const [appDbUserVersion, appDbSizeBytes, appDbIntegrityCheck, opfsStatus, swVersion, swRegistration, storageEstimate] =
      await Promise.all([
      appDb.getAppDbUserVersion().catch(() => null),
      appDb.getAppDbFileSize().catch(() => null),
      appDb.getAppDbIntegrityCheck().catch(() => null),
      resolveOpfsStatus(),
      hasSwController ? requestServiceWorkerVersion().catch(() => null) : Promise.resolve<string | null>(null),
      'serviceWorker' in navigator ? navigator.serviceWorker.getRegistration().catch(() => null) : Promise.resolve(null),
      resolveStorageEstimate(),
    ]);
    const webLocksStatus = resolveWebLocksStatus(webLockAcquired);
    const normalizedSwRegistration = swRegistration ?? null;

    return {
      swVersion: swVersion ?? '-',
      swScope: normalizedSwRegistration?.scope ?? '-',
      swState: resolveServiceWorkerState(normalizedSwRegistration),
      swClientsClaim: hasSwController,
      swSkipWaiting: normalizedSwRegistration ? Boolean(normalizedSwRegistration.waiting) : null,
      appDbUserVersion,
      appDbSizeBytes,
      appDbIntegrityCheck,
      webLocksStatus,
      webLocksReason: resolveWebLocksReason(webLocksStatus),
      opfsStatus,
      storageUsageBytes: storageEstimate.usageBytes,
      storageQuotaBytes: storageEstimate.quotaBytes,
    };
  }, [appDb, hasSwController, webLockAcquired]);

  const updateSongMaster = React.useCallback(
    async (force: boolean): Promise<SongMasterActionResult> => {
      const checkedAt = new Date().toISOString();
      setBusy(true);
      try {
        const result = await songMasterService.updateIfNeeded(force);
        const snapshot = await refreshSettingsSnapshot();
        const actionResult: SongMasterActionResult = {
          ok: result.ok,
          source: result.source,
          message: result.message ?? null,
          latestSha256: result.latest?.sha256 ?? null,
          localSha256: snapshot.songMeta.song_master_sha256 ?? null,
          checkedAt,
        };
        if (!result.ok) {
          const message = result.message ?? '曲マスタ更新に失敗しました。';
          if (result.source !== 'local_cache') {
            setFatalError(message);
          }
          pushToast(message);
          appendRuntimeLog({
            level: result.source === 'local_cache' ? 'warn' : 'error',
            category: 'song-master',
            message: force ? '再取得（キャッシュ破棄）に失敗しました。' : '更新確認に失敗しました。',
            detail: message,
            timestamp: checkedAt,
          });
          return actionResult;
        }

        if (result.source === 'github_download' || result.source === 'initial_download') {
          if (snapshot.songReady && snapshot.songMeta.song_master_file_name) {
            pushToast('曲マスタを更新しました。');
          } else {
            pushToast('曲マスタ更新後の確認に失敗しました。');
          }
        }
        if (result.source === 'up_to_date') {
          pushToast('曲マスタは最新です。');
        }
        if (result.message) {
          pushToast(result.message);
        }
        appendRuntimeLog({
          level: result.source === 'local_cache' ? 'warn' : 'info',
          category: 'song-master',
          message:
            result.source === 'up_to_date'
              ? '曲データは最新です。'
              : force
                ? '曲データを再取得しました。'
                : '曲データの更新確認を実行しました。',
          ...(result.message ? { detail: result.message } : {}),
          timestamp: checkedAt,
        });
        return actionResult;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!(await appDb.hasSongMaster())) {
          setFatalError(message);
        }
        pushToast(message);
        appendRuntimeLog({
          level: 'error',
          category: 'song-master',
          message: force ? '再取得（キャッシュ破棄）で例外が発生しました。' : '更新確認で例外が発生しました。',
          detail: message,
          timestamp: checkedAt,
        });
        return {
          ok: false,
          source: 'error',
          message,
          latestSha256: null,
          localSha256: null,
          checkedAt,
        };
      } finally {
        setBusy(false);
      }
    },
    [appDb, appendRuntimeLog, pushToast, refreshSettingsSnapshot, songMasterService],
  );

  React.useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return;
    }
    const onControllerChange = () => {
      setHasSwController(Boolean(navigator.serviceWorker.controller));
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  React.useEffect(() => {
    const onError = (event: ErrorEvent) => {
      appendRuntimeLog({
        level: 'error',
        category: 'runtime',
        message: '未処理の例外が発生しました。',
        detail: event.error instanceof Error ? event.error.message : event.message,
      });
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      appendRuntimeLog({
        level: 'error',
        category: 'runtime',
        message: '未処理の Promise rejection が発生しました。',
        detail:
          event.reason instanceof Error
            ? event.reason.message
            : typeof event.reason === 'string'
              ? event.reason
              : JSON.stringify(event.reason),
      });
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, [appendRuntimeLog]);

  React.useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      try {
        await appDb.reconcileEvidenceFiles();
        const purged = await appDb.purgeExpiredEvidenceIfNeeded();
        if (purged > 0) {
          appendRuntimeLog({
            level: 'info',
            category: 'storage',
            message: `起動時の自動削除で ${purged} 件の画像を削除しました。`,
          });
        }
        await refreshSettingsSnapshot();
        await refreshTournamentList();
        if (mounted) {
          const initialHomeQuery = createDefaultHomeQueryState();
          setHomeQuery(initialHomeQuery);
          setHomeFilterDraft(initialHomeQuery);
        }

        if (import.meta.env.DEV) {
          if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations.map((registration) => registration.unregister()));
          }
          if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map((key) => caches.delete(key)));
          }
        } else {
          const registration = await registerPwa({
            swUrl: `${import.meta.env.BASE_URL}sw.js`,
            onUpdateFound: (reg) => {
              if (mounted) {
                setPwaUpdate(reg);
              }
            },
          });
          if (mounted && registration?.waiting) {
            setPwaUpdate(registration);
          }
        }
      } catch (error) {
        if (mounted) {
          const message = error instanceof Error ? error.message : String(error);
          pushToast(message);
          appendRuntimeLog({
            level: 'error',
            category: 'bootstrap',
            message: '起動処理でエラーが発生しました。',
            detail: message,
          });
        }
      }
    };

    void bootstrap();

    return () => {
      mounted = false;
    };
  }, [appDb, appendRuntimeLog, pushToast, refreshSettingsSnapshot, refreshTournamentList]);

  React.useEffect(() => {
    if (route.name !== 'settings') {
      return;
    }
    let mounted = true;
    void collectAppInfoDetails().then((details) => {
      if (mounted) {
        setAppInfoDetails(details);
      }
    });
    return () => {
      mounted = false;
    };
  }, [collectAppInfoDetails, route.name]);

  React.useEffect(() => {
    const pathname = window.location.pathname;
    if (route.name === 'home') {
      if (isImportConfirmPath(pathname) || isCreatePath(pathname)) {
        window.history.replaceState(window.history.state, '', HOME_PATH);
      }
      return;
    }
    if (route.name === 'create' && !isCreatePath(pathname)) {
      window.history.replaceState(window.history.state, '', CREATE_TOURNAMENT_PATH);
    }
  }, [route.name]);

  React.useEffect(() => {
    if (route.name !== 'create') {
      return;
    }
    if (createDraft !== null) {
      return;
    }
    setCreateDraft(createInitialTournamentDraft(todayDate));
  }, [createDraft, route.name, todayDate]);

  const reloadDetail = React.useCallback(
    async (tournamentUuid: string) => {
      const next = await appDb.getTournamentDetail(tournamentUuid);
      setDetail(next);
      setDetailDebugLastError(null);
      if (!next) {
        replaceRoute({ name: 'home' });
      }
      return next;
    },
    [appDb, replaceRoute],
  );

  const importFromPayload = React.useCallback(
    async (raw: string) => {
      if (!songMasterReady) {
        pushToast('曲マスタが未取得のため、大会作成/取込は利用できません。');
        return;
      }

      const rawPayloadParam = resolveRawImportPayloadParam(raw, true);
      if (rawPayloadParam === null && raw.trim().length === 0) {
        pushToast('取込データを認識できません。');
        return;
      }
      openImportConfirm(rawPayloadParam);
    },
    [openImportConfirm, pushToast, songMasterReady],
  );

  const importFromFile = React.useCallback(
    async (file: File) => {
      try {
        if (file.type.startsWith('image/')) {
          const qrText = await extractQrTextFromImage(file);
          if (!qrText) {
            pushToast('画像内にQRコードが見つかりませんでした。');
            return;
          }
          await importFromPayload(qrText);
          return;
        }

        const text = await file.text();
        await importFromPayload(text);
      } catch (error) {
        pushToast(error instanceof Error ? error.message : String(error));
      }
    },
    [importFromPayload, pushToast],
  );

  const importFromQrScan = React.useCallback(
    async (qrText: string) => {
      if (!songMasterReady) {
        pushToast('曲マスタが未取得のため、大会作成/取込は利用できません。');
        return;
      }

      const rawPayloadParam = resolveRawImportPayloadParam(qrText, false);
      openImportConfirm(rawPayloadParam);
    },
    [openImportConfirm, pushToast, songMasterReady],
  );

  const closeQrImportDialog = React.useCallback(() => {
    setQrImportDialogOpen(false);
  }, []);

  const handleDetectedImportQr = React.useCallback(
    (qrText: string) => {
      setQrImportDialogOpen(false);
      void importFromQrScan(qrText);
    },
    [importFromQrScan],
  );

  const openTextImportFromQrError = React.useCallback(() => {
    setQrImportDialogOpen(false);
    pushRoute({ name: 'import' });
  }, [pushRoute]);

  const confirmImport = React.useCallback(
    async (payload: TournamentPayload) => {
      const result = await appDb.importTournament(payload);
      if (result.status === 'incompatible') {
        pushToast('既存大会と開催期間が矛盾するため取り込みできません。');
        return;
      }

      await refreshTournamentList();
      if (result.status === 'unchanged') {
        pushToast('変更なし');
      } else {
        pushToast('取り込みました');
      }

      const loaded = await reloadDetail(result.tournamentUuid);
      if (!loaded) {
        resetRoute({ name: 'home' });
        return;
      }
      replaceRoute({ name: 'detail', tournamentUuid: result.tournamentUuid });
    },
    [appDb, pushToast, refreshTournamentList, reloadDetail, replaceRoute, resetRoute],
  );

  const processDelegatedImport = React.useCallback(
    async (requestId: string, rawPayloadParam: string, via: 'broadcast' | 'storage') => {
      openImportConfirm(rawPayloadParam);
      pushToast('別タブから取り込み要求を受信しました。確認画面を開きました。');
      appendRuntimeLog({
        level: 'info',
        category: 'import-delegation',
        message: '別タブからの取り込み要求を確認画面へ委譲しました。',
        detail: `requestId=${requestId}, via=${via}`,
      });
    },
    [appendRuntimeLog, openImportConfirm, pushToast],
  );

  React.useEffect(() => {
    if (!webLockAcquired) {
      return;
    }

    const tabId = appTabIdRef.current;
    const handledRequestIds = handledDelegationRequestIdsRef.current;
    const localStorageRef = (() => {
      try {
        return window.localStorage;
      } catch {
        return null;
      }
    })();

    const sendStorageAck = (requestId: string): void => {
      if (!localStorageRef) {
        return;
      }
      try {
        const ack = buildImportAckMessage({
          requestId,
          receiverTabId: tabId,
          via: 'storage',
        });
        localStorageRef.setItem(IMPORT_DELEGATION_STORAGE_ACK_KEY, JSON.stringify(ack));
      } catch {
        // ignore storage failures
      }
    };

    const processRequest = (requestId: string, rawPayloadParam: string, via: 'broadcast' | 'storage'): void => {
      if (handledRequestIds.has(requestId)) {
        return;
      }
      handledRequestIds.add(requestId);
      void processDelegatedImport(requestId, rawPayloadParam, via);
    };

    const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(IMPORT_DELEGATION_CHANNEL) : null;
    const onChannelMessage = (event: MessageEvent<unknown>) => {
      if (!isImportRequestMessage(event.data)) {
        return;
      }
      if (event.data.senderTabId === tabId) {
        return;
      }

      const requestId = event.data.requestId;
      try {
        channel?.postMessage(
          buildImportAckMessage({
            requestId,
            receiverTabId: tabId,
            via: 'broadcast',
          }),
        );
      } catch {
        // ignore broadcast failures
      }

      processRequest(requestId, event.data.rawPayloadParam, 'broadcast');
    };

    channel?.addEventListener('message', onChannelMessage);

    const onStorage = (event: StorageEvent) => {
      if (
        event.storageArea !== localStorageRef ||
        event.key !== IMPORT_DELEGATION_STORAGE_REQUEST_KEY ||
        !event.newValue
      ) {
        return;
      }
      const request = parseImportRequestStorageValue(event.newValue);
      if (!request || request.senderTabId === tabId) {
        return;
      }

      sendStorageAck(request.requestId);
      processRequest(request.requestId, request.rawPayloadParam, 'storage');
    };

    window.addEventListener('storage', onStorage);

    return () => {
      channel?.removeEventListener('message', onChannelMessage);
      channel?.close();
      window.removeEventListener('storage', onStorage);
    };
  }, [processDelegatedImport, webLockAcquired]);

  const updateCreateDraft = React.useCallback(
    (updater: (draft: CreateTournamentDraft) => CreateTournamentDraft) => {
      setCreateDraft((current) => updater(current ?? createInitialTournamentDraft(todayDate)));
    },
    [todayDate],
  );

  const confirmCreateTournament = React.useCallback(async () => {
    if (!createDraft || createSaving) {
      return;
    }

    const validation = resolveCreateTournamentValidation(createDraft, todayDate);
    if (!validation.canProceed) {
      setCreateSaveError('入力内容を確認してください。');
      return;
    }

    setCreateSaving(true);
    setCreateSaveError(null);
    try {
      const input = buildCreateTournamentInput(createDraft, validation.selectedChartIds);
      await appDb.createTournament(input);
      pushToast('保存しました。');
      await refreshTournamentList();
      setCreateDraft(null);
      resetRoute({ name: 'home' });
    } catch (error) {
      setCreateSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setCreateSaving(false);
    }
  }, [appDb, createDraft, createSaving, pushToast, refreshTournamentList, resetRoute, todayDate]);

  const saveAutoDelete = React.useCallback(
    async (enabled: boolean, days: number) => {
      await appDb.setAutoDeleteConfig(enabled, days);
      await refreshSettingsSnapshot();
      appendRuntimeLog({
        level: 'info',
        category: 'storage',
        message: `画像自動削除設定を更新しました。（${enabled ? '有効' : '無効'} / ${days}日）`,
      });
    },
    [appDb, appendRuntimeLog, refreshSettingsSnapshot],
  );

  const estimateStorageCleanup = React.useCallback(
    async (days: number) => appDb.estimateEvidenceCleanup(days),
    [appDb],
  );

  const runStorageCleanup = React.useCallback(
    async (days: number) => {
      const result = await appDb.purgeExpiredEvidence(days);
      await refreshTournamentList();
      await refreshSettingsSnapshot();
      setLastCleanupResult(result);
      const releasedText = formatByteSize(result.releasedBytes);
      pushToast(`${result.deletedImageCount}件の画像を削除（解放 ${releasedText}）`);
      appendRuntimeLog({
        level: 'info',
        category: 'storage',
        message: `容量整理を実行しました。（画像 ${result.deletedImageCount} 件 / 解放 ${releasedText}）`,
      });
      return result;
    },
    [appDb, appendRuntimeLog, pushToast, refreshSettingsSnapshot, refreshTournamentList],
  );

  const submitChart =
    route.name === 'submit' && detail
      ? detail.charts.find((chart) => chart.chartId === route.chartId) ?? null
      : null;

  const pageTitle = React.useMemo(() => {
    switch (route.name) {
      case 'home':
        return '大会一覧';
      case 'import':
        return '大会取込';
      case 'import-confirm':
        return '取り込み確認';
      case 'create':
        return '大会作成';
      case 'detail':
        return '大会詳細';
      case 'submit':
        return 'スコア提出';
      case 'settings':
        return '設定';
      default:
        return '';
    }
  }, [route.name]);

  const openCreatePage = React.useCallback(() => {
    if (!songMasterReady) {
      pushToast('曲マスタが未取得のため大会作成は利用できません。');
      return;
    }
    setCreateDraft(createInitialTournamentDraft(todayDate));
    setCreateSaving(false);
    setCreateSaveError(null);
    pushRoute({ name: 'create' });
  }, [pushRoute, pushToast, songMasterReady, todayDate]);

  const openImportPage = React.useCallback(() => {
    if (!songMasterReady) {
      pushToast('曲マスタが未取得のため大会取込は利用できません。');
      return;
    }
    if (canUseQrImport) {
      setQrImportDialogOpen(true);
      return;
    }
    pushRoute({ name: 'import' });
  }, [canUseQrImport, pushRoute, pushToast, songMasterReady]);

  const openSettingsPage = React.useCallback(() => {
    if (route.name === 'settings') {
      return;
    }
    pushRoute({ name: 'settings' });
  }, [pushRoute, route.name]);

  const applyPendingAppUpdate = React.useCallback(() => {
    if (!pwaUpdate) {
      return;
    }
    appendRuntimeLog({
      level: 'info',
      category: 'pwa',
      message: 'アプリ更新を適用します。',
    });
    applyPwaUpdate(pwaUpdate);
  }, [appendRuntimeLog, pwaUpdate]);

  const openHomeMenu = React.useCallback((event: React.MouseEvent<HTMLElement>) => {
    setHomeMenuAnchorEl(event.currentTarget);
  }, []);

  const closeHomeMenu = React.useCallback(() => {
    setHomeMenuAnchorEl(null);
  }, []);

  const openDetailMenu = React.useCallback((event: React.MouseEvent<HTMLElement>) => {
    setDetailMenuAnchorEl(event.currentTarget);
  }, []);

  const closeDetailMenu = React.useCallback(() => {
    setDetailMenuAnchorEl(null);
  }, []);

  const openDetailTechnicalDialog = React.useCallback(() => {
    closeDetailMenu();
    setDetailTechnicalDialogOpen(true);
  }, [closeDetailMenu]);

  const closeDetailTechnicalDialog = React.useCallback(() => {
    setDetailTechnicalDialogOpen(false);
  }, []);

  const copyDetailTechnicalLog = React.useCallback(async () => {
    if (!detailTechnicalLogText) {
      return;
    }
    try {
      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
        throw new Error('clipboard unavailable');
      }
      await navigator.clipboard.writeText(detailTechnicalLogText);
      pushToast('技術ログをコピーしました。');
    } catch {
      pushToast('技術ログのコピーに失敗しました。');
    }
  }, [detailTechnicalLogText, pushToast]);

  const openDeleteTournamentDialog = React.useCallback(() => {
    closeDetailMenu();
    setDeleteTournamentDialogOpen(true);
  }, [closeDetailMenu]);

  const closeDeleteTournamentDialog = React.useCallback(() => {
    if (deleteTournamentBusy) {
      return;
    }
    setDeleteTournamentDialogOpen(false);
  }, [deleteTournamentBusy]);

  const deleteCurrentTournament = React.useCallback(async () => {
    if (!detail || deleteTournamentBusy) {
      return;
    }
    setDeleteTournamentBusy(true);
    try {
      await appDb.deleteTournament(detail.tournamentUuid);
      pushToast('大会を削除しました。');
      setDetail(null);
      setDeleteTournamentDialogOpen(false);
      closeDetailMenu();
      resetRoute({ name: 'home' });
      await refreshTournamentList();
    } catch (error) {
      pushToast(error instanceof Error ? error.message : String(error));
    } finally {
      setDeleteTournamentBusy(false);
    }
  }, [appDb, closeDetailMenu, deleteTournamentBusy, detail, pushToast, refreshTournamentList, resetRoute]);

  const resetLocalData = React.useCallback(async () => {
    if (busy) {
      return;
    }

    setBusy(true);
    try {
      await appDb.resetLocalData();
      setDetail(null);
      setCreateDraft(null);
      setCreateSaving(false);
      setCreateSaveError(null);
      setHomeQuery(createDefaultHomeQueryState());
      setHomeFilterDraft(createDefaultHomeQueryState());
      setHomeSearchMode(false);
      setHomeFilterSheetOpen(false);
      setHomeFilterFocusSection(null);
      resetRoute({ name: 'home' });
      await refreshTournamentList();
      await refreshSettingsSnapshot();
      pushToast('ローカル初期化を実行しました。');
    } catch (error) {
      pushToast(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [appDb, busy, pushToast, refreshSettingsSnapshot, refreshTournamentList, resetRoute]);

  const homeMenuOpen = homeMenuAnchorEl !== null;
  const detailMenuOpen = detailMenuAnchorEl !== null;
  const canGoBack = route.name !== 'home' && routeStack.length > 1;

  React.useEffect(() => {
    if (route.name === 'detail') {
      return;
    }
    setDetailMenuAnchorEl(null);
    setDeleteTournamentDialogOpen(false);
    setDetailTechnicalDialogOpen(false);
    setDetailDebugLastError(null);
  }, [route.name]);

  React.useEffect(() => {
    if (debugModeEnabled) {
      return;
    }
    setDetailTechnicalDialogOpen(false);
  }, [debugModeEnabled]);

  if (fatalError) {
    return <UnsupportedScreen title="曲マスタ起動エラー" reasons={[fatalError]} />;
  }

  return (
    <>
      <AppBar position="sticky" color="inherit" elevation={1}>
        <Toolbar sx={{ maxWidth: 980, width: '100%', margin: '0 auto' }}>
          {isHomeRoute ? (
            homeSearchMode ? (
              <Box sx={{ width: '100%', display: 'grid', gridTemplateColumns: 'auto 1fr', alignItems: 'center', gap: 1 }}>
                <IconButton edge="start" color="inherit" aria-label="search-close" onClick={() => setHomeSearchMode(false)}>
                  <ArrowBackIcon />
                </IconButton>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    border: '1px solid #d0d8e8',
                    borderRadius: 99,
                    pl: 1.5,
                    pr: 0.5,
                    py: 0.25,
                    minHeight: 40,
                    backgroundColor: '#ffffff',
                  }}
                >
                  <InputBase
                    inputRef={homeSearchInputRef}
                    value={homeQuery.searchText}
                    placeholder="大会名 / 開催者 / ハッシュタグ"
                    onChange={(event) => setHomeSearchText(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        setHomeSearchMode(false);
                      }
                    }}
                    sx={{ flex: 1, fontSize: 15 }}
                  />
                  {homeQuery.searchText.length > 0 ? (
                    <IconButton
                      size="small"
                      aria-label="search-clear"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={clearHomeSearchText}
                    >
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  ) : null}
                </Box>
              </Box>
            ) : (
              <>
                <Typography variant="h6" component="h1" sx={{ flexGrow: 1, fontWeight: 700 }}>
                  {pageTitle}
                </Typography>
                <IconButton edge="end" color="inherit" aria-label="home-search" onClick={() => setHomeSearchMode(true)}>
                  <SearchIcon />
                </IconButton>
                <IconButton
                  edge="end"
                  color={homeHasNonDefaultQuery ? 'primary' : 'inherit'}
                  aria-label="home-filter"
                  onClick={() => openHomeFilterSheet()}
                >
                  <Badge color="primary" variant="dot" invisible={!homeHasNonDefaultQuery}>
                    <FilterListIcon />
                  </Badge>
                </IconButton>
                <IconButton edge="end" color="inherit" aria-label="global-settings-menu" onClick={openHomeMenu}>
                  <MoreVertIcon />
                </IconButton>
                <Menu anchorEl={homeMenuAnchorEl} open={homeMenuOpen} onClose={closeHomeMenu}>
                  <MenuItem
                    onClick={() => {
                      closeHomeMenu();
                      openSettingsPage();
                    }}
                  >
                    設定
                  </MenuItem>
                </Menu>
              </>
            )
          ) : (
            <>
              {isSettingsRoute ? (
                <Box
                  sx={{
                    width: '100%',
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr auto',
                    alignItems: 'center',
                    gap: 1,
                  }}
                >
                  <Box sx={{ minWidth: 40, display: 'flex', justifyContent: 'flex-start' }}>
                    {canGoBack ? (
                      <IconButton edge="start" color="inherit" aria-label="back" onClick={popRoute}>
                        <ArrowBackIcon />
                      </IconButton>
                    ) : null}
                  </Box>
                  <Typography variant="h6" component="h1" sx={{ fontWeight: 700, textAlign: 'center' }}>
                    {pageTitle}
                  </Typography>
                  <Box sx={{ minWidth: 40 }} />
                </Box>
              ) : (
                <>
                  {canGoBack ? (
                    <IconButton edge="start" color="inherit" aria-label="back" onClick={popRoute} sx={{ mr: 1 }}>
                      <ArrowBackIcon />
                    </IconButton>
                  ) : null}
                  <Typography variant="h6" component="h1" sx={{ fontWeight: 700, flexGrow: 1 }}>
                    {pageTitle}
                  </Typography>
                  {isDetailRoute ? (
                    <>
                      <IconButton edge="end" color="inherit" aria-label="detail-actions-menu" onClick={openDetailMenu}>
                        <MoreVertIcon />
                      </IconButton>
                      <Menu anchorEl={detailMenuAnchorEl} open={detailMenuOpen} onClose={closeDetailMenu}>
                        {debugModeEnabled ? (
                          <MenuItem onClick={openDetailTechnicalDialog}>
                            技術情報
                          </MenuItem>
                        ) : null}
                        <MenuItem disabled={deleteTournamentBusy} onClick={openDeleteTournamentDialog}>
                          削除
                        </MenuItem>
                      </Menu>
                    </>
                  ) : null}
                </>
              )}
            </>
          )}
        </Toolbar>
      </AppBar>

      <div className="appRoot">
        {pwaUpdate && route.name !== 'settings' ? (
          <div className="updateBanner">
            <span>更新があります。</span>
            <button onClick={applyPendingAppUpdate}>更新適用</button>
          </div>
        ) : null}

        {route.name === 'home' && (
          <HomePage
            todayDate={todayDate}
            state={homeQuery.state}
            items={homeVisibleItems}
            onOpenDetail={async (tournamentUuid) => {
              const loaded = await reloadDetail(tournamentUuid);
              if (!loaded) {
                return;
              }
              pushRoute({ name: 'detail', tournamentUuid });
            }}
          />
        )}

        {route.name === 'import' && (
          <ImportTournamentPage
            songMasterReady={songMasterReady}
            songMasterMessage={songMasterMeta.song_master_downloaded_at ? null : '曲マスタ未取得'}
            busy={busy}
            onImportPayload={importFromPayload}
            onImportFile={importFromFile}
          />
        )}

        {route.name === 'import-confirm' && (
          <ImportConfirmPage
            todayDate={todayDate}
            busy={busy}
            onBack={() => {
              popRoute();
              if (isImportConfirmPath(window.location.pathname)) {
                window.history.replaceState(window.history.state, '', HOME_PATH);
              }
            }}
            onOpenSettings={openSettingsPage}
            onConfirmImport={confirmImport}
          />
        )}

        {route.name === 'create' && createDraft && (
          <CreateTournamentPage
            draft={createDraft}
            todayDate={todayDate}
            saving={createSaving}
            errorMessage={createSaveError}
            onDraftChange={updateCreateDraft}
            onConfirmCreate={confirmCreateTournament}
          />
        )}

        {route.name === 'detail' && detail && (
          <TournamentDetailPage
            detail={detail}
            todayDate={todayDate}
            onOpenSubmit={(chartId) => {
              pushRoute({ name: 'submit', tournamentUuid: detail.tournamentUuid, chartId });
            }}
            onUpdated={async () => {
              await reloadDetail(detail.tournamentUuid);
              await refreshTournamentList();
            }}
            onOpenSettings={openSettingsPage}
            debugModeEnabled={debugModeEnabled}
            debugLastError={detailTechnicalInfo?.last_error ?? null}
            onReportDebugError={setDetailDebugLastError}
          />
        )}

        {route.name === 'submit' && detail && submitChart && (
          <SubmitEvidencePage
            detail={detail}
            chart={submitChart}
            onSaved={async (reason) => {
              await reloadDetail(detail.tournamentUuid);
              await refreshTournamentList();
              if (reason === 'submit') {
                popRoute();
              }
            }}
          />
        )}

        {route.name === 'settings' && (
          <SettingsPage
            appInfo={appInfoSnapshot}
            songMasterMeta={songMasterMeta}
            autoDeleteEnabled={autoDeleteEnabled}
            autoDeleteDays={autoDeleteDays}
            debugModeEnabled={debugModeEnabled}
            busy={busy}
            onCheckUpdate={updateSongMaster}
            logs={runtimeLogs}
            lastCleanupResult={lastCleanupResult}
            onAutoDeleteConfigChange={saveAutoDelete}
            onEstimateStorageCleanup={estimateStorageCleanup}
            onRunStorageCleanup={runStorageCleanup}
            onToggleDebugMode={toggleDebugMode}
            onApplyAppUpdate={applyPendingAppUpdate}
            onResetLocalData={resetLocalData}
          />
        )}

        <Drawer
          anchor="bottom"
          open={isHomeRoute && homeFilterSheetOpen}
          onClose={closeHomeFilterSheet}
          ModalProps={{ keepMounted: true }}
          PaperProps={{
            sx: {
              width: '100%',
              maxWidth: 980,
              margin: '0 auto',
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              maxHeight: '70dvh',
            },
          }}
        >
          <Box className="homeFilterSheet">
            <span className="homeFilterSheetHandle" aria-hidden />
            <Box className="homeFilterSheetBody">
              <div className="homeFilterSection" ref={homeStateSectionRef}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  状態
                </Typography>
                <ToggleButtonGroup
                  value={homeFilterDraft.state}
                  exclusive
                  size="small"
                  fullWidth
                  onChange={(_event, value: TournamentTab | null) => {
                    if (!value) {
                      return;
                    }
                    setHomeFilterDraft((previous) => ({
                      ...previous,
                      state: value,
                    }));
                  }}
                >
                  <ToggleButton value="active">開催中</ToggleButton>
                  <ToggleButton value="upcoming">開催前</ToggleButton>
                  <ToggleButton value="ended">終了</ToggleButton>
                </ToggleButtonGroup>
              </div>
              <Divider />
              <div className="homeFilterSection" ref={homeCategorySectionRef}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  カテゴリ
                </Typography>
                <ToggleButtonGroup
                  value={homeFilterDraft.category}
                  exclusive
                  size="small"
                  fullWidth
                  onChange={(_event, value: HomeFilterCategory | null) => {
                    setHomeFilterDraft((previous) => ({
                      ...previous,
                      category: value ?? 'none',
                    }));
                  }}
                >
                  <ToggleButton value="none">未指定</ToggleButton>
                  <ToggleButton value="pending">未登録あり</ToggleButton>
                  <ToggleButton value="completed">全登録済み</ToggleButton>
                </ToggleButtonGroup>
              </div>
              <Divider />
              <div className="homeFilterSection" ref={homeAttrsSectionRef}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  属性
                </Typography>
                <FormGroup>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={homeFilterDraft.attrs.includes('send-waiting')}
                        onChange={(event) => {
                          setHomeFilterDraft((previous) => ({
                            ...previous,
                            attrs: event.target.checked
                              ? normalizeHomeAttrs([...previous.attrs, 'send-waiting'])
                              : previous.attrs.filter((value) => value !== 'send-waiting'),
                          }));
                        }}
                      />
                    }
                    label="送信待ちあり"
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={homeFilterDraft.attrs.includes('imported')}
                        onChange={(event) => {
                          setHomeFilterDraft((previous) => ({
                            ...previous,
                            attrs: event.target.checked
                              ? normalizeHomeAttrs([...previous.attrs, 'imported'])
                              : previous.attrs.filter((value) => value !== 'imported'),
                          }));
                        }}
                      />
                    }
                    label="インポート大会"
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={homeFilterDraft.attrs.includes('created')}
                        onChange={(event) => {
                          setHomeFilterDraft((previous) => ({
                            ...previous,
                            attrs: event.target.checked
                              ? normalizeHomeAttrs([...previous.attrs, 'created'])
                              : previous.attrs.filter((value) => value !== 'created'),
                          }));
                        }}
                      />
                    }
                    label="自作大会"
                  />
                </FormGroup>
              </div>
              <Divider />
              <div className="homeFilterSection" ref={homeSortSectionRef}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  ソート
                </Typography>
                <ToggleButtonGroup
                  value={homeFilterDraft.sort}
                  exclusive
                  size="small"
                  orientation="vertical"
                  fullWidth
                  onChange={(_event, value: HomeSort | null) => {
                    if (!value) {
                      return;
                    }
                    setHomeFilterDraft((previous) => ({
                      ...previous,
                      sort: value,
                    }));
                  }}
                >
                  <ToggleButton value="default">デフォルト</ToggleButton>
                  <ToggleButton value="deadline">期日が近い順</ToggleButton>
                  <ToggleButton value="progress-low">進捗が低い順</ToggleButton>
                  <ToggleButton value="send-waiting-high">送信待ちが多い順</ToggleButton>
                  <ToggleButton value="name">名前順</ToggleButton>
                </ToggleButtonGroup>
              </div>
              <Divider />
              <Typography variant="body2" className="homeFilterResultCount">
                現在の結果: {homeDraftResultCount}件
              </Typography>
            </Box>
            <Box className="homeFilterSheetActions">
              <Button variant="text" onClick={resetHomeFilterSheet}>
                リセット
              </Button>
              <Button variant="contained" onClick={applyHomeFilterSheet}>
                適用
              </Button>
            </Box>
          </Box>
        </Drawer>

        {isHomeRoute ? (
          <Tooltip
            title="大会を作成"
            placement="left"
            arrow
            open={showCreateFabTooltip && !speedDialOpen}
            disableFocusListener
            disableHoverListener
            disableTouchListener
          >
            <Box sx={{ position: 'fixed', right: 24, bottom: 24, zIndex: 30 }} onClick={closeCreateFabTooltip}>
              <SpeedDial
                ariaLabel="大会アクション"
                icon={<AddIcon />}
                direction="up"
                open={speedDialOpen}
                onOpen={() => {
                  closeCreateFabTooltip();
                  setSpeedDialOpen(true);
                }}
                onClose={() => setSpeedDialOpen(false)}
                sx={{ position: 'static' }}
              >
                <SpeedDialAction
                  icon={<PostAddIcon />}
                  tooltipTitle="大会作成"
                  FabProps={{ disabled: !songMasterReady || busy }}
                  onClick={() => {
                    closeCreateFabTooltip();
                    setSpeedDialOpen(false);
                    openCreatePage();
                  }}
                />
                <SpeedDialAction
                  icon={<FileDownloadIcon />}
                  tooltipTitle="大会取込"
                  FabProps={{ disabled: !songMasterReady || busy }}
                  onClick={() => {
                    closeCreateFabTooltip();
                    setSpeedDialOpen(false);
                    openImportPage();
                  }}
                />
              </SpeedDial>
            </Box>
          </Tooltip>
        ) : null}

        <ImportQrScannerDialog
          open={qrImportDialogOpen}
          onClose={closeQrImportDialog}
          onDetected={handleDetectedImportQr}
          onOpenTextImport={openTextImportFromQrError}
        />

        <Dialog open={whatsNewDialogOpen} onClose={closeWhatsNewDialog} fullWidth maxWidth="sm">
          <DialogTitle>{WHATS_NEW_MODAL_TITLE}</DialogTitle>
          <DialogContent>
            <Typography variant="body2" sx={{ mb: 1.5 }}>
              {WHATS_NEW_MODAL_DESCRIPTION}
            </Typography>
            <Box component="ul" sx={{ margin: 0, paddingLeft: 3, display: 'grid', gap: 1 }}>
              {WHATS_NEW_LINES.map((line) => (
                <Typography key={line} component="li" variant="body2">
                  {line}
                </Typography>
              ))}
            </Box>
          </DialogContent>
          <DialogActions>
            <Button variant="contained" onClick={closeWhatsNewDialog}>
              閉じる
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog
          open={Boolean(debugModeEnabled && detailTechnicalDialogOpen && detailTechnicalInfo)}
          onClose={closeDetailTechnicalDialog}
          fullWidth
          maxWidth="sm"
        >
          <DialogTitle>技術情報</DialogTitle>
          <DialogContent sx={{ display: 'grid', gap: 1.25 }}>
            {detailTechnicalInfo ? (
              <>
                <Typography variant="body2">tournament_uuid: {detailTechnicalInfo.tournament_uuid}</Typography>
                <Typography variant="body2">
                  source_tournament_uuid: {detailTechnicalInfo.source_tournament_uuid ?? '-'}
                </Typography>
                <Typography variant="body2">def_hash: {detailTechnicalInfo.def_hash}</Typography>
                <Typography variant="body2">共有ペイロードサイズ: {detailTechnicalInfo.payload_size_bytes} bytes</Typography>
                <Typography variant="body2">直近エラー: {detailTechnicalInfo.last_error ?? '-'}</Typography>
                <Button variant="outlined" size="small" onClick={() => void copyDetailTechnicalLog()}>
                  ログコピー
                </Button>
              </>
            ) : null}
          </DialogContent>
          <DialogActions>
            <Button onClick={closeDetailTechnicalDialog}>閉じる</Button>
          </DialogActions>
        </Dialog>

        <Dialog open={deleteTournamentDialogOpen} onClose={closeDeleteTournamentDialog} fullWidth maxWidth="xs">
          <DialogTitle>大会を削除しますか？</DialogTitle>
          <DialogContent>
            <Typography variant="body2">大会データと画像は削除され、復元できません</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={closeDeleteTournamentDialog} disabled={deleteTournamentBusy}>
              キャンセル
            </Button>
            <Button
              color="error"
              variant="contained"
              onClick={() => void deleteCurrentTournament()}
              disabled={deleteTournamentBusy}
            >
              削除
            </Button>
          </DialogActions>
        </Dialog>

        {toast ? <div className="toast">{toast}</div> : null}
      </div>
    </>
  );
}

export function AppFallbackUnsupported({ reasons }: { reasons: string[] }): JSX.Element {
  return <UnsupportedScreen title="非対応ブラウザ" reasons={reasons} />;
}
