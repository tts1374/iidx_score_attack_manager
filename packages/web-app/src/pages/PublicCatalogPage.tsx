import React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import InputAdornment from '@mui/material/InputAdornment';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import LibraryMusicIcon from '@mui/icons-material/LibraryMusic';
import PersonIcon from '@mui/icons-material/Person';
import SearchIcon from '@mui/icons-material/Search';
import SearchOffIcon from '@mui/icons-material/SearchOff';
import TravelExploreIcon from '@mui/icons-material/TravelExplore';
import type { PublicTournamentListItem } from '@iidx/shared';
import { useTranslation } from 'react-i18next';

import type { PublicCatalogClient } from '../services/public-catalog-client';
import { PublicCatalogClientError } from '../services/public-catalog-client';

interface PublicCatalogPageProps {
  client: PublicCatalogClient;
  songMasterReady: boolean;
  onOpenImportConfirm: (rawPayloadParam: string) => void;
}

interface BannerMessage {
  text: string;
}

type LoadPhase = 'idle' | 'loading' | 'ready' | 'error';

const SKELETON_CARD_COUNT = 3;

function formatHashtag(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return '#IIDX';
  }
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
}

function resolveActionErrorMessage(
  t: ReturnType<typeof useTranslation>['t'],
  error: unknown,
  fallbackKey: string,
): string {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return t('error.network.offline');
  }
  if (error instanceof PublicCatalogClientError && error.code === 'NOT_FOUND') {
    return t('public_catalog.error.not_found');
  }
  return t(fallbackKey);
}

function CatalogMetaRow(props: {
  icon: React.ReactNode;
  text: string;
}): JSX.Element {
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        minWidth: 0,
        color: 'text.secondary',
      }}
    >
      <Box
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          color: 'primary.main',
        }}
      >
        {props.icon}
      </Box>
      <Typography variant="body2" sx={{ minWidth: 0 }}>
        {props.text}
      </Typography>
    </Box>
  );
}

function CatalogSkeletonCard(): JSX.Element {
  return (
    <Paper
      data-testid="public-catalog-skeleton-card"
      elevation={0}
      sx={{
        p: { xs: 2, sm: 2.5 },
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Stack spacing={1.5}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          justifyContent="space-between"
          alignItems={{ xs: 'flex-start', sm: 'center' }}
          spacing={1}
        >
          <Skeleton variant="text" width="60%" height={34} />
          <Skeleton variant="rounded" width={108} height={28} />
        </Stack>
        <Skeleton variant="text" width="48%" />
        <Skeleton variant="text" width="56%" />
        <Skeleton variant="text" width="40%" />
        <Stack direction="row" justifyContent="flex-end">
          <Skeleton variant="rounded" width={128} height={40} />
        </Stack>
      </Stack>
    </Paper>
  );
}

function EmptyCatalogState(props: {
  title: string;
  description?: string | undefined;
  action?: React.ReactNode | undefined;
  searchMode: boolean;
}): JSX.Element {
  const Icon = props.searchMode ? SearchOffIcon : TravelExploreIcon;

  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 3, sm: 4 },
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'divider',
        textAlign: 'center',
      }}
    >
      <Stack spacing={1.5} alignItems="center">
        <Box
          sx={{
            width: 68,
            height: 68,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            color: 'primary.main',
            background:
              'linear-gradient(135deg, rgba(25, 118, 210, 0.16), rgba(25, 118, 210, 0.06))',
          }}
        >
          <Icon fontSize="large" />
        </Box>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          {props.title}
        </Typography>
        {props.description ? (
          <Typography variant="body2" color="text.secondary">
            {props.description}
          </Typography>
        ) : null}
        {props.action}
      </Stack>
    </Paper>
  );
}

export function PublicCatalogPage(props: PublicCatalogPageProps): JSX.Element {
  const { t } = useTranslation();
  const clientAvailable = props.client.isAvailable();
  const [searchText, setSearchText] = React.useState('');
  const [currentQuery, setCurrentQuery] = React.useState('');
  const [items, setItems] = React.useState<PublicTournamentListItem[]>([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [loadPhase, setLoadPhase] = React.useState<LoadPhase>(() =>
    clientAvailable ? 'loading' : 'idle',
  );
  const [loadErrorMessage, setLoadErrorMessage] = React.useState<string | null>(
    null,
  );
  const [bannerMessage, setBannerMessage] = React.useState<BannerMessage | null>(
    null,
  );
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [importingPublicId, setImportingPublicId] = React.useState<string | null>(
    null,
  );
  const mountedRef = React.useRef(true);
  const requestTokenRef = React.useRef(0);

  React.useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadFirstPage = React.useCallback(
    async (query: string) => {
      if (!props.client.isAvailable()) {
        setLoadPhase('idle');
        return;
      }

      const requestToken = ++requestTokenRef.current;
      setCurrentQuery(query);
      setLoadPhase('loading');
      setLoadErrorMessage(null);
      setBannerMessage(null);
      setItems([]);
      setNextCursor(null);
      setIsLoadingMore(false);

      try {
        const response = await props.client.listPublicTournaments({ query });
        if (!mountedRef.current || requestToken !== requestTokenRef.current) {
          return;
        }
        setItems(response.items);
        setNextCursor(response.nextCursor);
        setLoadPhase('ready');
      } catch (error) {
        if (!mountedRef.current || requestToken !== requestTokenRef.current) {
          return;
        }
        setLoadErrorMessage(
          resolveActionErrorMessage(t, error, 'public_catalog.error.list_failed'),
        );
        setLoadPhase('error');
      }
    },
    [props.client, t],
  );

  React.useEffect(() => {
    if (!props.client.isAvailable()) {
      setLoadPhase('idle');
      setLoadErrorMessage(null);
      setBannerMessage(null);
      setItems([]);
      setNextCursor(null);
      return;
    }

    void loadFirstPage(currentQuery);
  }, [loadFirstPage, props.client]);

  const loadMore = React.useCallback(async () => {
    if (!props.client.isAvailable() || !nextCursor || isLoadingMore) {
      return;
    }

    const requestToken = ++requestTokenRef.current;
    setIsLoadingMore(true);
    setBannerMessage(null);

    try {
      const response = await props.client.listPublicTournaments({
        query: currentQuery,
        cursor: nextCursor,
      });
      if (!mountedRef.current || requestToken !== requestTokenRef.current) {
        return;
      }
      setItems((previous) => [...previous, ...response.items]);
      setNextCursor(response.nextCursor);
    } catch (error) {
      if (!mountedRef.current || requestToken !== requestTokenRef.current) {
        return;
      }
      setBannerMessage({
        text: resolveActionErrorMessage(
          t,
          error,
          'public_catalog.error.list_failed',
        ),
      });
    } finally {
      if (mountedRef.current && requestToken === requestTokenRef.current) {
        setIsLoadingMore(false);
      }
    }
  }, [currentQuery, isLoadingMore, nextCursor, props.client, t]);

  const handleSearchSubmit = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      await loadFirstPage(searchText.trim());
    },
    [loadFirstPage, searchText],
  );

  const handleClearSearch = React.useCallback(async () => {
    setSearchText('');
    await loadFirstPage('');
  }, [loadFirstPage]);

  const handleImport = React.useCallback(
    async (publicId: string) => {
      if (importingPublicId) {
        return;
      }
      if (!props.client.isAvailable()) {
        setBannerMessage({
          text: t('public_catalog.error.unavailable'),
        });
        return;
      }
      if (!props.songMasterReady) {
        setBannerMessage({
          text: t('public_catalog.song_master_required'),
        });
        return;
      }

      setBannerMessage(null);
      setImportingPublicId(publicId);

      try {
        const response = await props.client.getPublicTournamentPayload(publicId);
        if (!mountedRef.current) {
          return;
        }
        props.onOpenImportConfirm(response.payloadParam);
      } catch (error) {
        if (!mountedRef.current) {
          return;
        }
        setBannerMessage({
          text: resolveActionErrorMessage(
            t,
            error,
            'public_catalog.error.import_failed',
          ),
        });
      } finally {
        if (mountedRef.current) {
          setImportingPublicId((current) =>
            current === publicId ? null : current,
          );
        }
      }
    },
    [
      importingPublicId,
      props.client,
      props.onOpenImportConfirm,
      props.songMasterReady,
      t,
    ],
  );

  const hasSearchQuery = searchText.length > 0 || currentQuery.length > 0;
  const initialLoading = clientAvailable && loadPhase === 'loading' && items.length === 0;
  const initialError =
    clientAvailable &&
    loadPhase === 'error' &&
    items.length === 0 &&
    Boolean(loadErrorMessage);
  const emptyState =
    clientAvailable &&
    loadPhase === 'ready' &&
    items.length === 0 &&
    !loadErrorMessage;

  return (
    <Box className="page" sx={{ gap: 2.5 }}>
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2.25, sm: 3 },
          borderRadius: 4,
          border: '1px solid',
          borderColor: 'divider',
          backgroundColor: 'background.paper',
          backgroundImage:
            'linear-gradient(135deg, rgba(25, 118, 210, 0.12), rgba(25, 118, 210, 0.04))',
        }}
      >
        <Stack spacing={2}>
          <Stack spacing={1}>
            <Chip
              icon={<TravelExploreIcon />}
              label={t('public_catalog.title')}
              color="primary"
              variant="outlined"
              sx={{ alignSelf: 'flex-start' }}
            />
            <Typography variant="h5" sx={{ fontWeight: 800 }}>
              {t('public_catalog.search_title')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('public_catalog.description')}
            </Typography>
          </Stack>

          {!props.songMasterReady ? (
            <Alert severity="info">{t('public_catalog.song_master_required')}</Alert>
          ) : null}

          <Box component="form" onSubmit={handleSearchSubmit}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
              <TextField
                fullWidth
                value={searchText}
                disabled={!clientAvailable || loadPhase === 'loading'}
                placeholder={t('public_catalog.search_placeholder')}
                onChange={(event) => setSearchText(event.target.value)}
                inputProps={{
                  'aria-label': t('public_catalog.search_placeholder'),
                }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon color="action" />
                    </InputAdornment>
                  ),
                  sx: {
                    borderRadius: 999,
                    backgroundColor: 'background.paper',
                  },
                }}
              />
              <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
                <Button
                  type="submit"
                  variant="contained"
                  disableElevation
                  disabled={!clientAvailable || loadPhase === 'loading'}
                  startIcon={
                    loadPhase === 'loading' ? (
                      <CircularProgress color="inherit" size={18} />
                    ) : (
                      <SearchIcon />
                    )
                  }
                  sx={{ minWidth: 120 }}
                >
                  {t('public_catalog.action.search')}
                </Button>
                {hasSearchQuery ? (
                  <Button
                    type="button"
                    variant="text"
                    onClick={() => void handleClearSearch()}
                  >
                    {t('common.clear_all')}
                  </Button>
                ) : null}
              </Stack>
            </Stack>
          </Box>
        </Stack>
      </Paper>

      {!clientAvailable ? (
        <Alert severity="warning">{t('public_catalog.error.unavailable')}</Alert>
      ) : null}

      {bannerMessage ? (
        <Alert severity="warning">{bannerMessage.text}</Alert>
      ) : null}

      {initialLoading ? (
        <Stack spacing={2}>
          {Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => (
            <CatalogSkeletonCard key={index} />
          ))}
        </Stack>
      ) : null}

      {initialError && loadErrorMessage ? (
        <Alert
          severity="error"
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => void loadFirstPage(currentQuery)}
            >
              {t('common.reload')}
            </Button>
          }
        >
          {loadErrorMessage}
        </Alert>
      ) : null}

      {emptyState ? (
        <EmptyCatalogState
          title={
            currentQuery.length > 0
              ? t('public_catalog.empty_search')
              : t('public_catalog.empty')
          }
          description={
            currentQuery.length > 0 ? t('public_catalog.description') : undefined
          }
          searchMode={currentQuery.length > 0}
          action={
            currentQuery.length > 0 ? (
              <Button variant="outlined" onClick={() => void handleClearSearch()}>
                {t('common.clear_all')}
              </Button>
            ) : undefined
          }
        />
      ) : null}

      {items.length > 0 ? (
        <>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 1,
              flexWrap: 'wrap',
            }}
          >
            <Typography variant="body2" color="text.secondary">
              {t('public_catalog.result_count', { count: items.length })}
            </Typography>
          </Box>

          <Stack spacing={2}>
            {items.map((item) => {
              const isImporting = importingPublicId === item.publicId;
              const chartCountText =
                typeof item.spChartCount === 'number' &&
                typeof item.dpChartCount === 'number'
                  ? t('public_catalog.card.chart_count_with_styles', {
                      count: item.chartCount,
                      spCount: item.spChartCount,
                      dpCount: item.dpChartCount,
                    })
                  : t('public_catalog.card.chart_count', {
                      count: item.chartCount,
                    });
              return (
                <Paper
                  key={item.publicId}
                  elevation={0}
                  sx={{
                    p: { xs: 2, sm: 2.5 },
                    borderRadius: 3,
                    border: '1px solid',
                    borderColor: 'divider',
                    backgroundColor: 'background.paper',
                    backgroundImage:
                      'linear-gradient(180deg, rgba(25, 118, 210, 0.06), rgba(25, 118, 210, 0.015))',
                    boxShadow: '0 14px 36px rgba(15, 23, 42, 0.08)',
                  }}
                >
                  <Stack spacing={2}>
                    <Stack spacing={1.25}>
                      <Stack
                        direction={{ xs: 'column', sm: 'row' }}
                        justifyContent="space-between"
                        alignItems={{ xs: 'flex-start', sm: 'center' }}
                        spacing={1}
                      >
                        <Typography variant="h6" sx={{ fontWeight: 800 }}>
                          {item.name}
                        </Typography>
                        <Chip
                          label={formatHashtag(item.hashtag)}
                          color="primary"
                          variant="outlined"
                          sx={{ fontWeight: 700 }}
                        />
                      </Stack>

                      <Stack
                        direction={{ xs: 'column', sm: 'row' }}
                        spacing={1.25}
                        useFlexGap
                        flexWrap="wrap"
                      >
                        <CatalogMetaRow
                          icon={<PersonIcon fontSize="small" />}
                          text={t('public_catalog.card.owner', {
                            value: item.owner,
                          })}
                        />
                        <CatalogMetaRow
                          icon={<CalendarTodayIcon fontSize="small" />}
                          text={t('public_catalog.card.period', {
                            start: item.start,
                            end: item.end,
                          })}
                        />
                        <CatalogMetaRow
                          icon={<LibraryMusicIcon fontSize="small" />}
                          text={chartCountText}
                        />
                      </Stack>
                    </Stack>

                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                      }}
                    >
                      <Button
                        type="button"
                        variant="contained"
                        disableElevation
                        disabled={
                          importingPublicId !== null || !props.songMasterReady
                        }
                        startIcon={
                          isImporting ? (
                            <CircularProgress color="inherit" size={18} />
                          ) : (
                            <CloudDownloadIcon />
                          )
                        }
                        onClick={() => void handleImport(item.publicId)}
                      >
                        {isImporting
                          ? t('common.loading')
                          : t('public_catalog.action.import')}
                      </Button>
                    </Box>
                  </Stack>
                </Paper>
              );
            })}
          </Stack>

          {nextCursor ? (
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
              <Button
                type="button"
                variant="outlined"
                disabled={isLoadingMore}
                startIcon={
                  isLoadingMore ? (
                    <CircularProgress color="inherit" size={18} />
                  ) : undefined
                }
                onClick={() => void loadMore()}
              >
                {isLoadingMore
                  ? t('public_catalog.loading_more')
                  : t('public_catalog.load_more')}
              </Button>
            </Box>
          ) : null}
        </>
      ) : null}
    </Box>
  );
}
