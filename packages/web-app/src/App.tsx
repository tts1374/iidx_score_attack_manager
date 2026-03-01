import React from 'react';
import type { SongSummary, TournamentDetailItem, TournamentListItem, TournamentTab } from '@iidx/db';
import { PAYLOAD_VERSION, encodeTournamentPayload, normalizeHashtag, type TournamentPayload } from '@iidx/shared';
import { applyPwaUpdate, registerPwa } from '@iidx/pwa';
import {
  AppBar,
  Badge,
  Box,
  Button,
  Checkbox,
  Chip,
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
import { useTranslation } from 'react-i18next';

import { APP_LANGUAGE_SETTING_KEY, ensureI18n, normalizeLanguage, type AppLanguage } from './i18n';
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
  CREATE_TOURNAMENT_DRAFT_STORAGE_KEY,
  MAX_CHART_ROWS,
  createEmptyChartDraft,
  createInitialTournamentDraft,
  resolveCreateTournamentValidation,
  restoreCreateTournamentDraft,
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
import { resolveErrorMessage } from './utils/error-i18n';
import { consumeWhatsNewVisibility } from './utils/whats-new';
import { CURRENT_VERSION } from './version';
import { registerHomeFilterSampleDebugApi } from './debug/home-filter-sample-seed';

function todayJst(): string {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

function formatByteSize(rawBytes: number | null, unknownLabel: string): string {
  if (rawBytes === null || !Number.isFinite(rawBytes) || rawBytes < 0) {
    return unknownLabel;
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

type CreateDraftDialogState =
  | { kind: 'none' }
  | { kind: 'resume' }
  | {
      kind: 'copy-conflict';
      persistedDraft: CreateTournamentDraft;
      copyDraft: CreateTournamentDraft;
    };

function readStoredCreateDraft(): CreateTournamentDraft | null {
  try {
    const raw = window.localStorage.getItem(CREATE_TOURNAMENT_DRAFT_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as unknown;
    const restored = restoreCreateTournamentDraft(parsed);
    if (!restored) {
      window.localStorage.removeItem(CREATE_TOURNAMENT_DRAFT_STORAGE_KEY);
      return null;
    }
    return restored;
  } catch {
    return null;
  }
}

function writeStoredCreateDraft(draft: CreateTournamentDraft): void {
  try {
    window.localStorage.setItem(CREATE_TOURNAMENT_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // ignore storage failures
  }
}

function clearStoredCreateDraft(): void {
  try {
    window.localStorage.removeItem(CREATE_TOURNAMENT_DRAFT_STORAGE_KEY);
  } catch {
    // ignore storage failures
  }
}

function resolveCreatePlayStyle(value: string): 'SP' | 'DP' {
  return value === 'DP' ? 'DP' : 'SP';
}

function buildCreateDraftFromDetail(detail: TournamentDetailItem): CreateTournamentDraft {
  const rows = detail.charts.slice(0, MAX_CHART_ROWS).map((chart) => {
    const playStyle = resolveCreatePlayStyle(chart.playStyle);
    const selectedSong: SongSummary = {
      musicId: chart.chartId,
      title: chart.title,
      version: '',
    };
    return {
      key: crypto.randomUUID(),
      query: chart.title,
      options: [selectedSong],
      selectedSong,
      playStyle,
      chartOptions: [
        {
          chartId: chart.chartId,
          musicId: chart.chartId,
          playStyle,
          difficulty: chart.difficulty,
          level: chart.level,
          isActive: 1,
        },
      ],
      selectedChartId: chart.chartId,
      loading: false,
    };
  });

  return {
    tournamentUuid: crypto.randomUUID(),
    name: detail.tournamentName,
    owner: detail.owner,
    hashtag: normalizeHashtag(detail.hashtag),
    startDate: detail.startDate,
    endDate: detail.endDate,
    rows: rows.length > 0 ? rows : [createEmptyChartDraft()],
  };
}

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
const HOME_STATE_SETTING_KEY = 'home.state';
const HOME_SEARCH_TEXT_SETTING_KEY = 'home.searchText';
const HOME_FILTER_CATEGORY_SETTING_KEY = 'home.filter.category';
const HOME_FILTER_ATTRS_SETTING_KEY = 'home.filter.attrs';
const HOME_SORT_SETTING_KEY = 'home.sort';

type HomeFilterCategory = 'none' | 'pending' | 'completed';
type HomeFilterAttr = 'send-waiting' | 'imported' | 'created';
type HomeSort = 'default' | 'deadline' | 'progress-low' | 'send-waiting-high' | 'name';
type HomeFilterSheetFocusSection = 'state' | 'category' | 'type' | 'attrs' | null;
type HomeAppliedChipCategory = 'status' | 'condition' | 'type';
type HomeAppliedChipVariant = 'filled' | 'tonal' | 'outlined';
type HomeAppliedChipClickTarget = Exclude<HomeFilterSheetFocusSection, null> | 'search';
type HomeAppliedChipRemoveTarget = 'category' | 'type' | 'send-waiting' | 'search';

interface HomeAppliedChipDescriptor {
  id: string;
  category: HomeAppliedChipCategory;
  priority: number;
  variant: HomeAppliedChipVariant;
  label: string;
  clickTarget: HomeAppliedChipClickTarget;
  removeTarget?: HomeAppliedChipRemoveTarget;
}

interface HomeAppliedChipViewModel extends HomeAppliedChipDescriptor {
  onClick: () => void;
  onRemove?: () => void;
}

interface HomeSortOption {
  value: HomeSort;
  labelKey:
    | 'common.home_filter.sort.default'
    | 'common.home_filter.sort.deadline'
    | 'common.home_filter.sort.progress_low'
    | 'common.home_filter.sort.send_waiting_high'
    | 'common.home_filter.sort.name';
}

const HOME_SORT_OPTIONS: readonly HomeSortOption[] = [
  { value: 'default', labelKey: 'common.home_filter.sort.default' },
  { value: 'deadline', labelKey: 'common.home_filter.sort.deadline' },
  { value: 'progress-low', labelKey: 'common.home_filter.sort.progress_low' },
  { value: 'send-waiting-high', labelKey: 'common.home_filter.sort.send_waiting_high' },
  { value: 'name', labelKey: 'common.home_filter.sort.name' },
];
const HOME_FALLBACK_SORT_LABEL_KEY: HomeSortOption['labelKey'] = 'common.home_filter.sort.default';

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

function createDefaultHomeFilterState(sort: HomeSort): HomeQueryState {
  return {
    state: HOME_DEFAULT_QUERY_STATE.state,
    searchText: HOME_DEFAULT_QUERY_STATE.searchText,
    category: HOME_DEFAULT_QUERY_STATE.category,
    attrs: [],
    sort,
  };
}

function createDefaultHomeQueryState(): HomeQueryState {
  return createDefaultHomeFilterState(HOME_DEFAULT_QUERY_STATE.sort);
}

const EMPTY_HOME_TOURNAMENT_BUCKETS: HomeTournamentBuckets = {
  active: [],
  upcoming: [],
  ended: [],
};

const HOME_FILTER_ATTR_VALUES: readonly HomeFilterAttr[] = ['send-waiting', 'imported', 'created'];
const HOME_APPLIED_CHIP_MAX_VISIBLE = 3;

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
  return HOME_SORT_OPTIONS.some((option) => option.value === value);
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

function homeStateLabel(state: TournamentTab, t: (key: string) => string): string {
  if (state === 'upcoming') {
    return t('common.home_filter.state.upcoming');
  }
  if (state === 'ended') {
    return t('common.home_filter.state.ended');
  }
  return t('common.home_filter.state.active');
}

function homeCategoryLabel(category: HomeFilterCategory, t: (key: string) => string): string {
  if (category === 'pending') {
    return t('common.home_filter.category.pending');
  }
  return t('common.home_filter.category.completed');
}

function homeAttrLabel(attr: HomeFilterAttr, t: (key: string) => string): string {
  if (attr === 'send-waiting') {
    return t('common.home_filter.attr.send_waiting');
  }
  if (attr === 'imported') {
    return t('common.home_filter.type.imported');
  }
  return t('common.home_filter.type.created');
}

function resolveHomeTypeAttr(attrs: readonly HomeFilterAttr[]): 'imported' | 'created' | null {
  if (attrs.includes('imported')) {
    return 'imported';
  }
  if (attrs.includes('created')) {
    return 'created';
  }
  return null;
}

function resolveHomeChipCategoryPriority(category: HomeAppliedChipCategory): number {
  switch (category) {
    case 'status':
      return 0;
    case 'condition':
      return 1;
    default:
      return 2;
  }
}

function compareHomeAppliedChip(a: HomeAppliedChipDescriptor, b: HomeAppliedChipDescriptor): number {
  const categoryComparison = resolveHomeChipCategoryPriority(a.category) - resolveHomeChipCategoryPriority(b.category);
  if (categoryComparison !== 0) {
    return categoryComparison;
  }
  const priorityComparison = a.priority - b.priority;
  if (priorityComparison !== 0) {
    return priorityComparison;
  }
  return a.id.localeCompare(b.id);
}

function resolveHomeConditionPriorityForCategory(category: HomeFilterCategory): number {
  if (category === 'pending') {
    return 10;
  }
  return 30;
}

function resolveHomeTypeChipPriority(attr: 'imported' | 'created'): number {
  return attr === 'imported' ? 10 : 20;
}

interface HomeVisibleChipState {
  visibleChips: HomeAppliedChipDescriptor[];
  hiddenCount: number;
}

function selectHomeVisibleChips(chips: readonly HomeAppliedChipDescriptor[]): HomeVisibleChipState {
  const sorted = [...chips].sort(compareHomeAppliedChip);
  const statusChips = sorted.filter((chip) => chip.category === 'status').slice(0, 1);
  const conditionChips = sorted.filter((chip) => chip.category === 'condition').slice(0, 2);
  const typeChip = sorted.find((chip) => chip.category === 'type') ?? null;
  const visibleChips = [...statusChips, ...conditionChips];
  if (typeChip && visibleChips.length < HOME_APPLIED_CHIP_MAX_VISIBLE) {
    visibleChips.push(typeChip);
  }
  const normalizedVisible = visibleChips.sort(compareHomeAppliedChip);
  return {
    visibleChips: normalizedVisible,
    hiddenCount: Math.max(0, sorted.length - normalizedVisible.length),
  };
}

function homeSortLabel(sort: HomeSort, t: (key: string) => string): string {
  const option = HOME_SORT_OPTIONS.find((entry) => entry.value === sort);
  if (option) {
    return t(option.labelKey);
  }
  return t(HOME_FALLBACK_SORT_LABEL_KEY);
}

function truncateSearchChipText(searchText: string): string {
  const max = 12;
  if (searchText.length <= max) {
    return searchText;
  }
  return `${searchText.slice(0, max)}…`;
}

function isHomeFilterDefault(query: HomeQueryState): boolean {
  return (
    query.state === HOME_DEFAULT_QUERY_STATE.state &&
    normalizeHomeSearchForFilter(query.searchText) === HOME_DEFAULT_QUERY_STATE.searchText &&
    query.category === HOME_DEFAULT_QUERY_STATE.category &&
    query.attrs.length === 0
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

function resolveWebLocksReason(status: AppInfoCardData['webLocksStatus'], t: (key: string) => string): string | null {
  switch (status) {
    case 'acquired':
      return null;
    case 'unsupported':
      return t('settings.technical.web_locks_reason.unsupported');
    case 'not_acquired':
    default:
      return t('settings.technical.web_locks_reason.not_acquired');
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
  const { appDb, opfs, songMasterService } = useAppServices();
  const { t } = useTranslation();

  const [routeStack, setRouteStack] = React.useState<RouteState[]>(() => createInitialRouteStack());
  const [homeQuery, setHomeQuery] = React.useState<HomeQueryState>(() => createDefaultHomeQueryState());
  const [homeTournamentBuckets, setHomeTournamentBuckets] = React.useState<HomeTournamentBuckets>(EMPTY_HOME_TOURNAMENT_BUCKETS);
  const [homeSearchMode, setHomeSearchMode] = React.useState(false);
  const [homeFilterSheetOpen, setHomeFilterSheetOpen] = React.useState(false);
  const [homeFilterFocusSection, setHomeFilterFocusSection] = React.useState<HomeFilterSheetFocusSection>(null);
  const [homeQueryReady, setHomeQueryReady] = React.useState(false);
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
    webLocksReason: resolveWebLocksReason(resolveWebLocksStatus(webLockAcquired), t),
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
  const [homeSortMenuAnchorEl, setHomeSortMenuAnchorEl] = React.useState<HTMLElement | null>(null);
  const [detailMenuAnchorEl, setDetailMenuAnchorEl] = React.useState<HTMLElement | null>(null);
  const [deleteTournamentDialogOpen, setDeleteTournamentDialogOpen] = React.useState(false);
  const [deleteTournamentBusy, setDeleteTournamentBusy] = React.useState(false);
  const [speedDialOpen, setSpeedDialOpen] = React.useState(false);
  const [showCreateFabTooltip, setShowCreateFabTooltip] = React.useState(false);
  const [qrImportDialogOpen, setQrImportDialogOpen] = React.useState(false);
  const [createDraft, setCreateDraft] = React.useState<CreateTournamentDraft | null>(null);
  const [createDraftDirty, setCreateDraftDirty] = React.useState(false);
  const [createSaving, setCreateSaving] = React.useState(false);
  const [createSaveError, setCreateSaveError] = React.useState<string | null>(null);
  const [createDraftDialogState, setCreateDraftDialogState] = React.useState<CreateDraftDialogState>({ kind: 'none' });
  const [debugModeEnabled, setDebugModeEnabled] = React.useState(() => readDebugMode());
  const [language, setLanguage] = React.useState<AppLanguage>('ja');
  const [detailTechnicalDialogOpen, setDetailTechnicalDialogOpen] = React.useState(false);
  const [detailDebugLastError, setDetailDebugLastError] = React.useState<string | null>(null);
  const [whatsNewDialogOpen, setWhatsNewDialogOpen] = React.useState(false);
  const appTabIdRef = React.useRef<string>(crypto.randomUUID());
  const handledDelegationRequestIdsRef = React.useRef<Set<string>>(new Set());
  const homeSearchInputRef = React.useRef<HTMLInputElement | null>(null);
  const homeStateSectionRef = React.useRef<HTMLDivElement | null>(null);
  const homeCategorySectionRef = React.useRef<HTMLDivElement | null>(null);
  const homeTypeSectionRef = React.useRef<HTMLDivElement | null>(null);
  const homeAttrsSectionRef = React.useRef<HTMLDivElement | null>(null);
  const createDraftSaveTimerRef = React.useRef<number | null>(null);

  const route = routeStack[routeStack.length - 1] ?? { name: 'home' };
  const isHomeRoute = route.name === 'home';
  const isDetailRoute = route.name === 'detail';
  const isSettingsRoute = route.name === 'settings';
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
  const homeResultCount = homeVisibleItems.length;
  const homeHasNonDefaultFilter = !isHomeFilterDefault(homeQuery);
  const homeNormalizedSearch = normalizeHomeSearchForFilter(homeQuery.searchText);
  const homeHasSearchQuery = homeNormalizedSearch.length > 0;
  const homeSearchChip = homeHasSearchQuery ? truncateSearchChipText(homeNormalizedSearch) : '';
  const homeTypeAttr = resolveHomeTypeAttr(homeQuery.attrs);
  const homeSortLabelText = homeSortLabel(homeQuery.sort, t);
  const rawWhatsNewItems = t('whats_new.items', { returnObjects: true }) as unknown;
  const whatsNewItems =
    Array.isArray(rawWhatsNewItems) ? rawWhatsNewItems.filter((value): value is string => typeof value === 'string') : [];

  const openHomeFilterSheet = React.useCallback(
    (focusSection: HomeFilterSheetFocusSection = null) => {
      setHomeFilterFocusSection(focusSection);
      setHomeFilterSheetOpen(true);
      setHomeSearchMode(false);
      setHomeSortMenuAnchorEl(null);
    },
    [],
  );

  const closeHomeFilterSheet = React.useCallback(() => {
    setHomeFilterSheetOpen(false);
    setHomeFilterFocusSection(null);
  }, []);

  const resetHomeFilterSheet = React.useCallback(() => {
    setHomeQuery((previous) => createDefaultHomeFilterState(previous.sort));
  }, []);

  const openHomeSortMenu = React.useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    setHomeSortMenuAnchorEl(event.currentTarget);
    setHomeSearchMode(false);
  }, []);

  const closeHomeSortMenu = React.useCallback(() => {
    setHomeSortMenuAnchorEl(null);
  }, []);

  const setHomeSort = React.useCallback((sort: HomeSort) => {
    setHomeQuery((previous) => {
      if (previous.sort === sort) {
        return previous;
      }
      return {
        ...previous,
        sort,
      };
    });
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

  const closeHomeSearchModeViaBack = React.useCallback(() => {
    clearHomeSearchText();
    setHomeSearchMode(false);
  }, [clearHomeSearchText]);

  const clearHomeCategory = React.useCallback(() => {
    setHomeQuery((previous) => ({
      ...previous,
      category: 'none',
    }));
  }, []);

  const clearHomeTypeAttr = React.useCallback(() => {
    setHomeQuery((previous) => ({
      ...previous,
      attrs: previous.attrs.filter((value) => value !== 'imported' && value !== 'created'),
    }));
  }, []);

  const clearHomeSort = React.useCallback(() => {
    setHomeQuery((previous) => ({
      ...previous,
      sort: 'default',
    }));
  }, []);

  const clearHomeAttr = React.useCallback((attr: HomeFilterAttr) => {
    setHomeQuery((previous) => ({
      ...previous,
      attrs: previous.attrs.filter((value) => value !== attr),
    }));
  }, []);

  const clearHomeSendWaitingAttr = React.useCallback(() => {
    clearHomeAttr('send-waiting');
  }, [clearHomeAttr]);

  const homeAppliedChipDescriptors = React.useMemo<HomeAppliedChipDescriptor[]>(() => {
    const descriptors: HomeAppliedChipDescriptor[] = [
      {
        id: `status-${homeQuery.state}`,
        category: 'status',
        priority: 0,
        variant: 'filled',
        label: homeStateLabel(homeQuery.state, t),
        clickTarget: 'state',
      },
    ];

    if (homeQuery.category !== 'none') {
      descriptors.push({
        id: `condition-category-${homeQuery.category}`,
        category: 'condition',
        priority: resolveHomeConditionPriorityForCategory(homeQuery.category),
        variant: 'tonal',
        label: homeCategoryLabel(homeQuery.category, t),
        clickTarget: 'category',
        removeTarget: 'category',
      });
    }

    if (homeQuery.attrs.includes('send-waiting')) {
      descriptors.push({
        id: 'condition-send-waiting',
        category: 'condition',
        priority: 20,
        variant: 'tonal',
        label: homeAttrLabel('send-waiting', t),
        clickTarget: 'attrs',
        removeTarget: 'send-waiting',
      });
    }

    if (homeHasSearchQuery) {
      descriptors.push({
        id: 'condition-search',
        category: 'condition',
        priority: 40,
        variant: 'tonal',
        label: t('common.home.search_chip', { value: homeSearchChip }),
        clickTarget: 'search',
        removeTarget: 'search',
      });
    }

    if (homeTypeAttr) {
      descriptors.push({
        id: `type-${homeTypeAttr}`,
        category: 'type',
        priority: resolveHomeTypeChipPriority(homeTypeAttr),
        variant: 'outlined',
        label: homeAttrLabel(homeTypeAttr, t),
        clickTarget: 'type',
        removeTarget: 'type',
      });
    }

    return descriptors.sort(compareHomeAppliedChip);
  }, [homeHasSearchQuery, homeQuery.attrs, homeQuery.category, homeQuery.state, homeSearchChip, homeTypeAttr, t]);

  const { visibleChips: homeVisibleAppliedChipDescriptors, hiddenCount: homeHiddenAppliedChipCount } = React.useMemo(
    () => selectHomeVisibleChips(homeAppliedChipDescriptors),
    [homeAppliedChipDescriptors],
  );

  const homeVisibleAppliedChips = React.useMemo<HomeAppliedChipViewModel[]>(
    () =>
      homeVisibleAppliedChipDescriptors.map((chip) => {
        let onClick: () => void;
        if (chip.clickTarget === 'search') {
          onClick = () => setHomeSearchMode(true);
        } else {
          const focusSection: Exclude<HomeAppliedChipClickTarget, 'search'> = chip.clickTarget;
          onClick = () => openHomeFilterSheet(focusSection);
        }
        let onRemove: (() => void) | undefined;
        if (chip.removeTarget === 'category') {
          onRemove = clearHomeCategory;
        } else if (chip.removeTarget === 'type') {
          onRemove = clearHomeTypeAttr;
        } else if (chip.removeTarget === 'send-waiting') {
          onRemove = clearHomeSendWaitingAttr;
        } else if (chip.removeTarget === 'search') {
          onRemove = clearHomeSearchText;
        }
        const baseChip: HomeAppliedChipViewModel = {
          ...chip,
          onClick,
        };
        if (onRemove) {
          return {
            ...baseChip,
            onRemove,
          };
        }
        return baseChip;
      }),
    [
      clearHomeCategory,
      clearHomeSearchText,
      clearHomeSendWaitingAttr,
      clearHomeTypeAttr,
      homeVisibleAppliedChipDescriptors,
      openHomeFilterSheet,
    ],
  );

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
    setHomeSortMenuAnchorEl(null);
  }, [homeSearchMode]);

  React.useEffect(() => {
    if (isHomeRoute) {
      return;
    }
    setHomeSearchMode(false);
    setHomeFilterSheetOpen(false);
    setHomeFilterFocusSection(null);
    setHomeSortMenuAnchorEl(null);
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
        : homeFilterFocusSection === 'type'
          ? homeTypeSectionRef
          : homeAttrsSectionRef;
    sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [homeFilterFocusSection, homeFilterSheetOpen]);

  React.useEffect(() => {
    if (!homeQueryReady) {
      return;
    }
    void Promise.all([
      appDb.setSetting(HOME_STATE_SETTING_KEY, homeQuery.state),
      appDb.setSetting(HOME_SEARCH_TEXT_SETTING_KEY, homeQuery.searchText),
      appDb.setSetting(HOME_FILTER_CATEGORY_SETTING_KEY, homeQuery.category),
      appDb.setSetting(HOME_FILTER_ATTRS_SETTING_KEY, JSON.stringify(normalizeHomeAttrs(homeQuery.attrs))),
      appDb.setSetting(HOME_SORT_SETTING_KEY, homeQuery.sort),
    ]).catch(() => undefined);
  }, [appDb, homeQuery, homeQueryReady]);

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
      pushToast(next ? t('common.debug_mode.enabled') : t('common.debug_mode.disabled'));
      return next;
    });
  }, [pushToast, t]);
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

  const loadHomeQueryState = React.useCallback(async (): Promise<HomeQueryState> => {
    const [stateValue, searchValue, categoryValue, attrsValue, sortValue] = await Promise.all([
      appDb.getSetting(HOME_STATE_SETTING_KEY),
      appDb.getSetting(HOME_SEARCH_TEXT_SETTING_KEY),
      appDb.getSetting(HOME_FILTER_CATEGORY_SETTING_KEY),
      appDb.getSetting(HOME_FILTER_ATTRS_SETTING_KEY),
      appDb.getSetting(HOME_SORT_SETTING_KEY),
    ]);

    const state = stateValue && isTournamentTab(stateValue) ? stateValue : HOME_DEFAULT_QUERY_STATE.state;
    const searchText = searchValue ? normalizeHomeSearchText(searchValue) : HOME_DEFAULT_QUERY_STATE.searchText;
    const category = categoryValue && isHomeFilterCategory(categoryValue) ? categoryValue : HOME_DEFAULT_QUERY_STATE.category;
    const attrs = normalizeHomeAttrs(parseHomeFilterAttrs(attrsValue));
    const sort = sortValue && isHomeSort(sortValue) ? sortValue : HOME_DEFAULT_QUERY_STATE.sort;
    return { state, searchText, category, attrs, sort };
  }, [appDb]);

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
      webLocksReason: resolveWebLocksReason(webLocksStatus, t),
      opfsStatus,
      storageUsageBytes: storageEstimate.usageBytes,
      storageQuotaBytes: storageEstimate.quotaBytes,
    };
  }, [appDb, hasSwController, t, webLockAcquired]);

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
          const message = result.message ?? t('common.song_master.update_failed');
          if (result.source !== 'local_cache') {
            setFatalError(message);
          }
          pushToast(message);
          appendRuntimeLog({
            level: result.source === 'local_cache' ? 'warn' : 'error',
            category: 'song-master',
            message: force ? t('common.song_master.refetch_failed') : t('common.song_master.update_check_failed'),
            detail: message,
            timestamp: checkedAt,
          });
          return actionResult;
        }

        if (result.source === 'github_download' || result.source === 'initial_download') {
          if (snapshot.songReady && snapshot.songMeta.song_master_file_name) {
            pushToast(t('common.song_master.updated'));
          } else {
            pushToast(t('common.song_master.post_update_check_failed'));
          }
        }
        if (result.source === 'up_to_date') {
          pushToast(t('common.song_master.up_to_date'));
        }
        if (result.message) {
          pushToast(result.message);
        }
        appendRuntimeLog({
          level: result.source === 'local_cache' ? 'warn' : 'info',
          category: 'song-master',
          message:
            result.source === 'up_to_date'
              ? t('common.song_data.up_to_date')
              : force
                ? t('common.song_data.refetched')
                : t('common.song_data.update_check_executed'),
          ...(result.message ? { detail: result.message } : {}),
          timestamp: checkedAt,
        });
        return actionResult;
      } catch (error) {
        const message = resolveErrorMessage(t, error, 'error.description.generic');
        if (!(await appDb.hasSongMaster())) {
          setFatalError(message);
        }
        pushToast(message);
        appendRuntimeLog({
          level: 'error',
          category: 'song-master',
          message: force ? t('common.song_master.refetch_exception') : t('common.song_master.update_check_exception'),
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
    [appDb, appendRuntimeLog, pushToast, refreshSettingsSnapshot, songMasterService, t],
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
    let mounted = true;
    void appDb
      .getSetting(APP_LANGUAGE_SETTING_KEY)
      .then((value) => {
        const normalized = normalizeLanguage(value);
        void ensureI18n(normalized);
        if (mounted) {
          setLanguage(normalized);
        }
      })
      .catch(() => {
        // ignore language load errors
      });
    return () => {
      mounted = false;
    };
  }, [appDb]);

  React.useEffect(() => {
    const onError = (event: ErrorEvent) => {
      appendRuntimeLog({
        level: 'error',
        category: 'runtime',
        message: t('common.runtime.unhandled_exception'),
        detail: event.error instanceof Error ? event.error.message : event.message,
      });
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      appendRuntimeLog({
        level: 'error',
        category: 'runtime',
        message: t('common.runtime.unhandled_promise_rejection'),
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
  }, [appendRuntimeLog, t]);

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
            message: t('common.storage.startup_auto_purge_log', { count: purged }),
          });
        }
        await refreshSettingsSnapshot();
        const restoredHomeQuery = await loadHomeQueryState();
        await refreshTournamentList();
        if (mounted) {
          setHomeQuery(restoredHomeQuery);
          setHomeQueryReady(true);
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
          const message = resolveErrorMessage(t, error, 'error.description.generic');
          const detail = error instanceof Error ? error.message : String(error);
          pushToast(message);
          appendRuntimeLog({
            level: 'error',
            category: 'bootstrap',
            message: t('common.bootstrap.error_log'),
            detail,
          });
        }
      }
    };

    void bootstrap();

    return () => {
      mounted = false;
    };
  }, [appDb, appendRuntimeLog, loadHomeQueryState, pushToast, refreshSettingsSnapshot, refreshTournamentList, t]);

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
    setCreateDraftDirty(false);
  }, [createDraft, route.name, todayDate]);

  React.useEffect(() => {
    if (createDraftSaveTimerRef.current !== null) {
      window.clearTimeout(createDraftSaveTimerRef.current);
      createDraftSaveTimerRef.current = null;
    }
    if (!createDraft || !createDraftDirty) {
      return;
    }
    createDraftSaveTimerRef.current = window.setTimeout(() => {
      writeStoredCreateDraft(createDraft);
      createDraftSaveTimerRef.current = null;
    }, 250);
    return () => {
      if (createDraftSaveTimerRef.current !== null) {
        window.clearTimeout(createDraftSaveTimerRef.current);
        createDraftSaveTimerRef.current = null;
      }
    };
  }, [createDraft, createDraftDirty]);

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
        pushToast(t('common.import.require_song_master'));
        return;
      }

      const rawPayloadParam = resolveRawImportPayloadParam(raw, true);
      if (rawPayloadParam === null && raw.trim().length === 0) {
        pushToast(t('common.import.unrecognized_data'));
        return;
      }
      openImportConfirm(rawPayloadParam);
    },
    [openImportConfirm, pushToast, songMasterReady, t],
  );

  const importFromFile = React.useCallback(
    async (file: File) => {
      try {
        if (file.type.startsWith('image/')) {
          const qrText = await extractQrTextFromImage(file);
          if (!qrText) {
            pushToast(t('common.import.qr_not_found'));
            return;
          }
          await importFromPayload(qrText);
          return;
        }

        const text = await file.text();
        await importFromPayload(text);
      } catch (error) {
        pushToast(resolveErrorMessage(t, error, 'error.import.payload_invalid'));
      }
    },
    [importFromPayload, pushToast, t],
  );

  const importFromQrScan = React.useCallback(
    async (qrText: string) => {
      if (!songMasterReady) {
        pushToast(t('common.import.require_song_master'));
        return;
      }

      const rawPayloadParam = resolveRawImportPayloadParam(qrText, false);
      openImportConfirm(rawPayloadParam);
    },
    [openImportConfirm, pushToast, songMasterReady, t],
  );

  const closeQrImportDialog = React.useCallback(() => {
    setQrImportDialogOpen(false);
  }, []);

  const handleImportUrlFromQrDialog = React.useCallback(
    (importUrl: string) => {
      setQrImportDialogOpen(false);
      void importFromQrScan(importUrl);
    },
    [importFromQrScan],
  );

  const confirmImport = React.useCallback(
    async (payload: TournamentPayload) => {
      const result = await appDb.importTournament(payload);
      if (result.status === 'incompatible') {
        pushToast(t('common.import.incompatible_period'));
        return;
      }

      await refreshTournamentList();
      if (result.status === 'unchanged') {
        pushToast(t('common.import.no_change'));
      } else {
        pushToast(t('common.import.completed'));
      }

      const loaded = await reloadDetail(result.tournamentUuid);
      if (!loaded) {
        resetRoute({ name: 'home' });
        return;
      }
      replaceRoute({ name: 'detail', tournamentUuid: result.tournamentUuid });
    },
    [appDb, pushToast, refreshTournamentList, reloadDetail, replaceRoute, resetRoute, t],
  );

  const processDelegatedImport = React.useCallback(
    async (requestId: string, rawPayloadParam: string, via: 'broadcast' | 'storage') => {
      openImportConfirm(rawPayloadParam);
      pushToast(t('common.import.delegation.received_and_opened'));
      appendRuntimeLog({
        level: 'info',
        category: 'import-delegation',
        message: t('common.import.delegation.delegated_to_confirm'),
        detail: `requestId=${requestId}, via=${via}`,
      });
    },
    [appendRuntimeLog, openImportConfirm, pushToast, t],
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
      setCreateDraftDirty(true);
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
      setCreateSaveError(t('common.validation.check_input'));
      return;
    }

    setCreateSaving(true);
    setCreateSaveError(null);
    try {
      const input = buildCreateTournamentInput(createDraft, validation.selectedChartIds);
      await appDb.createTournament(input);
      pushToast(t('notify.saved'));
      await refreshTournamentList();
      clearStoredCreateDraft();
      setCreateDraftDirty(false);
      setCreateDraft(null);
      resetRoute({ name: 'home' });
    } catch (error) {
      setCreateSaveError(resolveErrorMessage(t, error, 'error.description.generic'));
    } finally {
      setCreateSaving(false);
    }
  }, [appDb, createDraft, createSaving, pushToast, refreshTournamentList, resetRoute, t, todayDate]);

  const saveAutoDelete = React.useCallback(
    async (enabled: boolean, days: number) => {
      await appDb.setAutoDeleteConfig(enabled, days);
      await refreshSettingsSnapshot();
      appendRuntimeLog({
        level: 'info',
        category: 'storage',
        message: t('common.storage.auto_delete_config_updated', {
          status: enabled ? t('common.enabled') : t('common.disabled'),
          days,
        }),
      });
    },
    [appDb, appendRuntimeLog, refreshSettingsSnapshot, t],
  );

  const changeLanguage = React.useCallback(
    async (nextLanguage: AppLanguage) => {
      const normalized = normalizeLanguage(nextLanguage);
      if (normalized === language) {
        return;
      }
      await ensureI18n(normalized);
      await appDb.setSetting(APP_LANGUAGE_SETTING_KEY, normalized);
      setLanguage(normalized);
      pushToast(t('settings.language.toast.changed', { language: t(`settings.language.option.${normalized}`) }));
    },
    [appDb, language, pushToast, t],
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
      const releasedText = formatByteSize(result.releasedBytes, t('common.unknown'));
      pushToast(t('common.storage.cleanup_toast', { count: result.deletedImageCount, released: releasedText }));
      appendRuntimeLog({
        level: 'info',
        category: 'storage',
        message: t('common.storage.cleanup_log', { count: result.deletedImageCount, released: releasedText }),
      });
      return result;
    },
    [appDb, appendRuntimeLog, pushToast, refreshSettingsSnapshot, refreshTournamentList, t],
  );

  const submitChart =
    route.name === 'submit' && detail
      ? detail.charts.find((chart) => chart.chartId === route.chartId) ?? null
      : null;

  const pageTitle = React.useMemo(() => {
    switch (route.name) {
      case 'home':
        return t('common.page_title.home');
      case 'import':
        return t('common.page_title.import');
      case 'import-confirm':
        return t('common.page_title.import_confirm');
      case 'create':
        return t('common.page_title.create');
      case 'detail':
        return t('common.page_title.detail');
      case 'submit':
        return t('common.page_title.submit');
      case 'settings':
        return t('settings.title');
      default:
        return '';
    }
  }, [route.name, t]);

  const openCreatePage = React.useCallback(() => {
    if (!songMasterReady) {
      pushToast(t('common.create.require_song_master'));
      return;
    }
    const storedDraft = readStoredCreateDraft();
    if (storedDraft) {
      setCreateDraft(storedDraft);
      setCreateDraftDirty(false);
      setCreateDraftDialogState({ kind: 'resume' });
    } else {
      setCreateDraft(createInitialTournamentDraft(todayDate));
      setCreateDraftDirty(false);
      setCreateDraftDialogState({ kind: 'none' });
    }
    setCreateSaving(false);
    setCreateSaveError(null);
    pushRoute({ name: 'create' });
  }, [pushRoute, pushToast, songMasterReady, t, todayDate]);

  const openImportPage = React.useCallback(() => {
    if (!songMasterReady) {
      pushToast(t('common.import.page_require_song_master'));
      return;
    }
    setQrImportDialogOpen(true);
  }, [pushToast, songMasterReady, t]);

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
      message: t('common.pwa.apply_update_log'),
    });
    applyPwaUpdate(pwaUpdate);
  }, [appendRuntimeLog, pwaUpdate, t]);

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

  const openCopyCreateFromDetail = React.useCallback(() => {
    closeDetailMenu();
    if (!detail) {
      return;
    }
    if (!songMasterReady) {
      pushToast(t('common.create.require_song_master'));
      return;
    }
    const copyDraft = buildCreateDraftFromDetail(detail);
    const storedDraft = readStoredCreateDraft();
    if (storedDraft) {
      setCreateDraftDialogState({
        kind: 'copy-conflict',
        persistedDraft: storedDraft,
        copyDraft,
      });
      return;
    }
    setCreateDraft(copyDraft);
    setCreateDraftDirty(true);
    setCreateSaving(false);
    setCreateSaveError(null);
    pushRoute({ name: 'create' });
  }, [closeDetailMenu, detail, pushRoute, pushToast, songMasterReady, t]);

  const resumeCreateDraftFromDialog = React.useCallback(() => {
    if (createDraftDialogState.kind === 'none') {
      return;
    }
    if (createDraftDialogState.kind === 'copy-conflict') {
      setCreateDraft(createDraftDialogState.persistedDraft);
      setCreateDraftDirty(false);
      setCreateSaving(false);
      setCreateSaveError(null);
      setCreateDraftDialogState({ kind: 'none' });
      pushRoute({ name: 'create' });
      return;
    }
    const storedDraft = readStoredCreateDraft();
    if (storedDraft) {
      setCreateDraft(storedDraft);
      setCreateDraftDirty(false);
    }
    setCreateDraftDialogState({ kind: 'none' });
  }, [createDraftDialogState, pushRoute]);

  const discardStoredCreateDraftAndStartFresh = React.useCallback(() => {
    clearStoredCreateDraft();
    setCreateDraft(createInitialTournamentDraft(todayDate));
    setCreateDraftDirty(false);
    setCreateSaving(false);
    setCreateSaveError(null);
    setCreateDraftDialogState({ kind: 'none' });
  }, [todayDate]);

  const overwriteCreateDraftWithCopy = React.useCallback(() => {
    if (createDraftDialogState.kind !== 'copy-conflict') {
      return;
    }
    setCreateDraft(createDraftDialogState.copyDraft);
    setCreateDraftDirty(true);
    setCreateSaving(false);
    setCreateSaveError(null);
    setCreateDraftDialogState({ kind: 'none' });
    pushRoute({ name: 'create' });
  }, [createDraftDialogState, pushRoute]);

  const cancelCreateDraftCopyConflict = React.useCallback(() => {
    if (createDraftDialogState.kind !== 'copy-conflict') {
      return;
    }
    setCreateDraftDialogState({ kind: 'none' });
  }, [createDraftDialogState.kind]);

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
      pushToast(t('notify.copied'));
    } catch {
      pushToast(t('common.technical_log.copy_failed'));
    }
  }, [detailTechnicalLogText, pushToast, t]);

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
      pushToast(t('notify.deleted'));
      setDetail(null);
      setDeleteTournamentDialogOpen(false);
      closeDetailMenu();
      resetRoute({ name: 'home' });
      await refreshTournamentList();
    } catch (error) {
      pushToast(resolveErrorMessage(t, error, 'error.description.generic'));
    } finally {
      setDeleteTournamentBusy(false);
    }
  }, [appDb, closeDetailMenu, deleteTournamentBusy, detail, pushToast, refreshTournamentList, resetRoute, t]);

  const resetLocalData = React.useCallback(async () => {
    if (busy) {
      return;
    }

    setBusy(true);
    try {
      await appDb.resetLocalData();
      clearStoredCreateDraft();
      setDetail(null);
      setCreateDraft(null);
      setCreateDraftDirty(false);
      setCreateSaving(false);
      setCreateSaveError(null);
      setCreateDraftDialogState({ kind: 'none' });
      setHomeQuery(createDefaultHomeQueryState());
      setHomeSearchMode(false);
      setHomeFilterSheetOpen(false);
      setHomeFilterFocusSection(null);
      resetRoute({ name: 'home' });
      await refreshTournamentList();
      await refreshSettingsSnapshot();
      pushToast(t('common.local_reset.executed'));
    } catch (error) {
      pushToast(resolveErrorMessage(t, error, 'error.description.generic'));
    } finally {
      setBusy(false);
    }
  }, [appDb, busy, pushToast, refreshSettingsSnapshot, refreshTournamentList, resetRoute, t]);

  const homeMenuOpen = homeMenuAnchorEl !== null;
  const homeSortMenuOpen = homeSortMenuAnchorEl !== null;
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
    if (route.name === 'create') {
      return;
    }
    if (createDraftDialogState.kind !== 'resume') {
      return;
    }
    setCreateDraftDialogState({ kind: 'none' });
  }, [createDraftDialogState.kind, route.name]);

  React.useEffect(() => {
    if (route.name === 'detail') {
      return;
    }
    if (createDraftDialogState.kind !== 'copy-conflict') {
      return;
    }
    setCreateDraftDialogState({ kind: 'none' });
  }, [createDraftDialogState.kind, route.name]);

  React.useEffect(() => {
    if (debugModeEnabled) {
      return;
    }
    setDetailTechnicalDialogOpen(false);
  }, [debugModeEnabled]);

  React.useEffect(() => {
    return registerHomeFilterSampleDebugApi({
      enabled: debugModeEnabled,
      appDb,
      opfs,
      todayDate,
      onDataChanged: async () => {
        await refreshTournamentList();
      },
    });
  }, [appDb, debugModeEnabled, opfs, refreshTournamentList, todayDate]);

  if (fatalError) {
    return <UnsupportedScreen title={t('common.song_master.startup_error_title')} reasons={[fatalError]} />;
  }

  return (
    <>
      <AppBar position="sticky" color="inherit" elevation={1} sx={{ backgroundColor: 'var(--header-bg)', color: 'var(--text)' }}>
        <Toolbar sx={{ maxWidth: 980, width: '100%', margin: '0 auto' }}>
          {isHomeRoute ? (
            homeSearchMode ? (
              <Box sx={{ width: '100%', display: 'grid', gridTemplateColumns: 'auto 1fr', alignItems: 'center', gap: 1 }}>
                <IconButton edge="start" color="inherit" aria-label="search-close" onClick={closeHomeSearchModeViaBack}>
                  <ArrowBackIcon />
                </IconButton>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    border: '1px solid var(--border)',
                    borderRadius: 99,
                    pl: 1.5,
                    pr: 0.5,
                    py: 0.25,
                    minHeight: 40,
                    backgroundColor: 'var(--surface)',
                  }}
                >
                  <InputBase
                    inputRef={homeSearchInputRef}
                    value={homeQuery.searchText}
                    placeholder={t('common.home.search_placeholder')}
                    onChange={(event) => setHomeSearchText(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        setHomeSearchMode(false);
                      }
                    }}
                    sx={{
                      flex: 1,
                      fontSize: 15,
                      color: 'var(--text)',
                      '& .MuiInputBase-input::placeholder': {
                        color: 'var(--home-search-placeholder)',
                        opacity: 1,
                      },
                    }}
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
                <IconButton
                  edge="end"
                  color={homeHasNonDefaultFilter ? 'primary' : 'inherit'}
                  aria-label="home-filter"
                  onClick={() => openHomeFilterSheet()}
                  sx={{ mr: 1 }}
                >
                  <Badge color="primary" variant="dot" invisible={!homeHasNonDefaultFilter}>
                    <FilterListIcon />
                  </Badge>
                </IconButton>
                <IconButton edge="end" color="inherit" aria-label="global-settings-menu" onClick={openHomeMenu}>
                  <MoreVertIcon />
                </IconButton>
                <Menu
                  anchorEl={homeMenuAnchorEl}
                  open={homeMenuOpen}
                  onClose={closeHomeMenu}
                  PaperProps={{ className: 'appMenuPaper' }}
                >
                  <MenuItem
                    className="appMenuItem"
                    onClick={() => {
                      closeHomeMenu();
                      openSettingsPage();
                    }}
                  >
                    {t('settings.title')}
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
                      <Menu
                        anchorEl={detailMenuAnchorEl}
                        open={detailMenuOpen}
                        onClose={closeDetailMenu}
                        PaperProps={{ className: 'appMenuPaper' }}
                      >
                        <MenuItem className="appMenuItem" onClick={openCopyCreateFromDetail}>
                          {t('common.copy_this_tournament')}
                        </MenuItem>
                        {debugModeEnabled ? (
                          <MenuItem className="appMenuItem" onClick={openDetailTechnicalDialog}>
                            {t('common.technical_info')}
                          </MenuItem>
                        ) : null}
                        <MenuItem
                          className="appMenuItem"
                          disabled={deleteTournamentBusy}
                          onClick={openDeleteTournamentDialog}
                        >
                          {t('common.delete')}
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
            <span>{t('common.update_available')}</span>
            <button onClick={applyPendingAppUpdate}>{t('common.apply_update')}</button>
          </div>
        ) : null}

        {route.name === 'home' && (
          <>
            <section className="homeAppliedChipsRow" aria-label="home-applied-filters">
              <IconButton
                size="small"
                color="inherit"
                aria-label="home-search-entry"
                className="homeAppliedChipsSearchButton"
                onClick={() => setHomeSearchMode(true)}
              >
                <SearchIcon fontSize="small" />
              </IconButton>
              <div className="homeAppliedChipsViewport">
                <div className="homeAppliedChipsScroll">
                  {homeVisibleAppliedChips.map((chip) => (
                    <Chip
                      key={chip.id}
                      size="small"
                      clickable
                      color={chip.category === 'status' ? 'primary' : 'default'}
                      variant={chip.variant === 'outlined' ? 'outlined' : 'filled'}
                      className={[
                        'homeAppliedChip',
                        `homeAppliedChip-${chip.category}`,
                        chip.variant === 'tonal' ? 'homeAppliedChip-tonal' : '',
                      ]
                        .filter((className) => className.length > 0)
                        .join(' ')}
                      label={chip.label}
                      onClick={chip.onClick}
                      {...(chip.onRemove ? { onDelete: chip.onRemove } : {})}
                    />
                  ))}
                  {homeHiddenAppliedChipCount > 0 ? (
                    <Chip
                      size="small"
                      clickable
                      variant="outlined"
                      className="homeAppliedChip homeAppliedChip-overflow"
                      label={`+${homeHiddenAppliedChipCount}`}
                      onClick={() => openHomeFilterSheet()}
                    />
                  ) : null}
                </div>
              </div>
            </section>
            <section className="homeSubheaderRow" aria-label="home-list-subheader">
              <Typography variant="body2" className="homeSubheaderCount">
                {homeQueryReady
                  ? t('common.home.list_count', { count: homeVisibleItems.length })
                  : t('common.home.list_count_loading')}
              </Typography>
              <button
                type="button"
                className="homeSubheaderSortButton"
                aria-label={t('common.home.sort_change_aria')}
                aria-haspopup="menu"
                aria-expanded={homeSortMenuOpen ? 'true' : undefined}
                onClick={openHomeSortMenu}
              >
                <span className="homeSubheaderSortButtonLabel">{homeSortLabelText}</span>
                <span className="homeSubheaderSortButtonArrow" aria-hidden>
                  ▾
                </span>
              </button>
              <Menu
                anchorEl={homeSortMenuAnchorEl}
                open={homeSortMenuOpen}
                onClose={closeHomeSortMenu}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                PaperProps={{ className: 'appMenuPaper' }}
              >
                {HOME_SORT_OPTIONS.map((option) => (
                  <MenuItem
                    key={option.value}
                    className="appMenuItem"
                    selected={homeQuery.sort === option.value}
                    onClick={() => {
                      setHomeSort(option.value);
                      closeHomeSortMenu();
                    }}
                  >
                    {t(option.labelKey)}
                  </MenuItem>
                ))}
              </Menu>
            </section>
            <HomePage
              todayDate={todayDate}
              state={homeQuery.state}
              items={homeVisibleItems}
              onOpenFilterInEmpty={() => openHomeFilterSheet()}
              onOpenDetail={async (tournamentUuid) => {
                const loaded = await reloadDetail(tournamentUuid);
                if (!loaded) {
                  return;
                }
                pushRoute({ name: 'detail', tournamentUuid });
              }}
            />
          </>
        )}

        {route.name === 'import' && (
          <ImportTournamentPage
            songMasterReady={songMasterReady}
            songMasterMessage={songMasterMeta.song_master_downloaded_at ? null : t('common.song_master.unavailable')}
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
            debugModeEnabled={debugModeEnabled}
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
            language={language}
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
            onLanguageChange={changeLanguage}
            onToggleDebugMode={toggleDebugMode}
            onApplyAppUpdate={applyPendingAppUpdate}
            onResetLocalData={resetLocalData}
          />
        )}

        <Drawer
          anchor="bottom"
          open={isHomeRoute && homeFilterSheetOpen}
          onClose={closeHomeFilterSheet}
          ModalProps={{
            keepMounted: true,
            BackdropProps: {
              sx: { backgroundColor: 'var(--home-filter-backdrop)' },
            },
          }}
          PaperProps={{
            sx: {
              width: '100%',
              maxWidth: 980,
              margin: '0 auto',
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              maxHeight: '70dvh',
              backgroundColor: 'var(--home-filter-sheet-bg)',
              color: 'var(--home-filter-sheet-text)',
            },
          }}
        >
          <Box className="homeFilterSheet">
            <span className="homeFilterSheetHandle" aria-hidden />
            <div className="homeFilterSheetFixed">
              <div className="homeFilterSheetTopRow">
                <Typography variant="body2" className="homeFilterResultCount">
                  {t('common.home_filter.result_count', { count: homeResultCount })}
                </Typography>
                <button
                  type="button"
                  className="homeFilterResetLink"
                  onClick={resetHomeFilterSheet}
                  disabled={!homeHasNonDefaultFilter}
                >
                  {t('common.reset')}
                </button>
              </div>
              <div className="homeFilterSection" ref={homeStateSectionRef}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  {t('common.home_filter.section.state')}
                </Typography>
                <ToggleButtonGroup
                  value={homeQuery.state}
                  exclusive
                  size="small"
                  fullWidth
                  onChange={(_event, value: TournamentTab | null) => {
                    if (!value) {
                      return;
                    }
                    setHomeQuery((previous) => ({
                      ...previous,
                      state: value,
                    }));
                  }}
                >
                  <ToggleButton value="active">{t('common.home_filter.state.active')}</ToggleButton>
                  <ToggleButton value="upcoming">{t('common.home_filter.state.upcoming')}</ToggleButton>
                  <ToggleButton value="ended">{t('common.home_filter.state.ended')}</ToggleButton>
                </ToggleButtonGroup>
              </div>
              <Divider />
            </div>
            <Box className="homeFilterSheetBody">
              <div className="homeFilterSection" ref={homeCategorySectionRef}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  {t('common.home_filter.section.category')}
                </Typography>
                <ToggleButtonGroup
                  value={homeQuery.category === 'none' ? null : homeQuery.category}
                  exclusive
                  size="small"
                  fullWidth
                  onChange={(_event, value: HomeFilterCategory | null) => {
                    setHomeQuery((previous) => ({
                      ...previous,
                      category: value ?? 'none',
                    }));
                  }}
                >
                  <ToggleButton value="pending">{t('common.home_filter.category.pending')}</ToggleButton>
                  <ToggleButton value="completed">{t('common.home_filter.category.completed')}</ToggleButton>
                </ToggleButtonGroup>
              </div>
              <Divider />
              <div className="homeFilterSection" ref={homeTypeSectionRef}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  {t('common.home_filter.section.type')}
                </Typography>
                <ToggleButtonGroup
                  value={homeQuery.attrs.includes('imported') ? 'imported' : homeQuery.attrs.includes('created') ? 'created' : null}
                  exclusive
                  size="small"
                  fullWidth
                  onChange={(_event, value: 'imported' | 'created' | null) => {
                    setHomeQuery((previous) => {
                      const attrsWithoutType = previous.attrs.filter((entry) => entry !== 'imported' && entry !== 'created');
                      return {
                        ...previous,
                        attrs: value ? normalizeHomeAttrs([...attrsWithoutType, value]) : attrsWithoutType,
                      };
                    });
                  }}
                >
                  <ToggleButton value="imported">{t('common.home_filter.type.imported')}</ToggleButton>
                  <ToggleButton value="created">{t('common.home_filter.type.created')}</ToggleButton>
                </ToggleButtonGroup>
              </div>
              <Divider />
              <div className="homeFilterSection" ref={homeAttrsSectionRef}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  {t('common.home_filter.section.attr')}
                </Typography>
                <FormGroup>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={homeQuery.attrs.includes('send-waiting')}
                        onChange={(event) => {
                          setHomeQuery((previous) => ({
                            ...previous,
                            attrs: event.target.checked
                              ? normalizeHomeAttrs([...previous.attrs, 'send-waiting'])
                              : previous.attrs.filter((value) => value !== 'send-waiting'),
                          }));
                        }}
                      />
                    }
                    label={t('common.home_filter.attr.send_waiting')}
                  />
                </FormGroup>
              </div>
            </Box>
          </Box>
        </Drawer>

        {isHomeRoute ? (
          <Tooltip
            title={t('common.tournament.create')}
            placement="left"
            arrow
            open={showCreateFabTooltip && !speedDialOpen}
            disableFocusListener
            disableHoverListener
            disableTouchListener
          >
            <Box sx={{ position: 'fixed', right: 24, bottom: 24, zIndex: 30 }} onClick={closeCreateFabTooltip}>
              <SpeedDial
                ariaLabel={t('common.tournament.actions')}
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
                  tooltipTitle={t('common.tournament.create')}
                  FabProps={{ disabled: !songMasterReady || busy }}
                  onClick={() => {
                    closeCreateFabTooltip();
                    setSpeedDialOpen(false);
                    openCreatePage();
                  }}
                />
                <SpeedDialAction
                  icon={<FileDownloadIcon />}
                  tooltipTitle={t('common.page_title.import')}
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
          onImportUrl={handleImportUrlFromQrDialog}
        />

        <Dialog open={whatsNewDialogOpen} onClose={closeWhatsNewDialog} fullWidth maxWidth="sm">
          <DialogTitle>{t('whats_new.modal.title')}</DialogTitle>
          <DialogContent>
            <Typography variant="body2" sx={{ mb: 1.5 }}>
              {t('whats_new.modal.description')}
            </Typography>
            <Box component="ul" sx={{ margin: 0, paddingLeft: 3, display: 'grid', gap: 1 }}>
              {whatsNewItems.map((text, index) => (
                <Typography key={index} component="li" variant="body2">
                  {text}
                </Typography>
              ))}
            </Box>
          </DialogContent>
          <DialogActions>
            <Button variant="contained" onClick={closeWhatsNewDialog}>
              {t('common.close')}
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog
          open={Boolean(debugModeEnabled && detailTechnicalDialogOpen && detailTechnicalInfo)}
          onClose={closeDetailTechnicalDialog}
          fullWidth
          maxWidth="sm"
        >
          <DialogTitle>{t('common.technical_info')}</DialogTitle>
          <DialogContent sx={{ display: 'grid', gap: 1.25 }}>
            {detailTechnicalInfo ? (
              <>
                <Typography variant="body2">
                  {t('common.technical_info_tournament_uuid', { value: detailTechnicalInfo.tournament_uuid })}
                </Typography>
                <Typography variant="body2">
                  {t('common.technical_info_source_tournament_uuid', {
                    value: detailTechnicalInfo.source_tournament_uuid ?? t('common.not_available'),
                  })}
                </Typography>
                <Typography variant="body2">{t('common.technical_info_def_hash', { value: detailTechnicalInfo.def_hash })}</Typography>
                <Typography variant="body2">
                  {t('common.technical_info_payload_size', { size: detailTechnicalInfo.payload_size_bytes })}
                </Typography>
                <Typography variant="body2">
                  {t('common.technical_info_recent_error', { error: detailTechnicalInfo.last_error ?? '-' })}
                </Typography>
                <Button variant="outlined" size="small" onClick={() => void copyDetailTechnicalLog()}>
                  {t('common.copy_logs')}
                </Button>
              </>
            ) : null}
          </DialogContent>
          <DialogActions>
            <Button onClick={closeDetailTechnicalDialog}>{t('common.close')}</Button>
          </DialogActions>
        </Dialog>

        <Dialog open={createDraftDialogState.kind === 'resume'} onClose={() => undefined} fullWidth maxWidth="xs">
          <DialogTitle>{t('create_tournament.draft.dialog.title')}</DialogTitle>
          <DialogContent>
            <Typography variant="body2">{t('create_tournament.draft.dialog.description')}</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={discardStoredCreateDraftAndStartFresh}>
              {t('create_tournament.draft.dialog.action.discard_and_new')}
            </Button>
            <Button variant="contained" onClick={resumeCreateDraftFromDialog}>
              {t('create_tournament.draft.dialog.action.resume')}
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog
          open={createDraftDialogState.kind === 'copy-conflict'}
          onClose={cancelCreateDraftCopyConflict}
          fullWidth
          maxWidth="xs"
        >
          <DialogTitle>{t('create_tournament.draft.dialog.title')}</DialogTitle>
          <DialogContent>
            <Typography variant="body2">{t('create_tournament.draft.dialog.description')}</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={cancelCreateDraftCopyConflict}>{t('common.cancel')}</Button>
            <Button onClick={resumeCreateDraftFromDialog}>
              {t('create_tournament.draft.dialog.action.resume')}
            </Button>
            <Button variant="contained" onClick={overwriteCreateDraftWithCopy}>
              {t('create_tournament.draft.dialog.action.copy_overwrite')}
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog open={deleteTournamentDialogOpen} onClose={closeDeleteTournamentDialog} fullWidth maxWidth="xs">
          <DialogTitle>{t('common.delete_tournament_confirm.title')}</DialogTitle>
          <DialogContent>
            <Typography variant="body2">{t('common.delete_tournament_confirm.description')}</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={closeDeleteTournamentDialog} disabled={deleteTournamentBusy}>
              {t('common.cancel')}
            </Button>
            <Button
              color="error"
              variant="contained"
              onClick={() => void deleteCurrentTournament()}
              disabled={deleteTournamentBusy}
            >
              {t('common.delete')}
            </Button>
          </DialogActions>
        </Dialog>

        {toast ? <div className="toast">{toast}</div> : null}
      </div>
    </>
  );
}

export function AppFallbackUnsupported({ reasons }: { reasons: string[] }): JSX.Element {
  const { t } = useTranslation();
  return <UnsupportedScreen title={t('common.unsupported_browser_title')} reasons={reasons} />;
}
