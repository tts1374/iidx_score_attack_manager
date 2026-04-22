import React from 'react';
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

  React.useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

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

      try {
        const response = await props.client.listPublicTournaments({ query });
        if (
          !mountedRef.current ||
          requestToken !== requestTokenRef.current
        ) {
          return;
        }
        setItems(response.items);
        setNextCursor(response.nextCursor);
        setLoadPhase('ready');
      } catch (error) {
        if (
          !mountedRef.current ||
          requestToken !== requestTokenRef.current
        ) {
          return;
        }
        setLoadErrorMessage(
          resolveActionErrorMessage(
            t,
            error,
            'public_catalog.error.list_failed',
          ),
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
      if (
        !mountedRef.current ||
        requestToken !== requestTokenRef.current
      ) {
        return;
      }
      setItems((previous) => [...previous, ...response.items]);
      setNextCursor(response.nextCursor);
    } catch (error) {
      if (
        !mountedRef.current ||
        requestToken !== requestTokenRef.current
      ) {
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
      if (
        mountedRef.current &&
        requestToken === requestTokenRef.current
      ) {
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

  return (
    <div className="page">
      <section className="detailCard">
        <h2>{t('public_catalog.search_title')}</h2>
        <p className="hintText">{t('public_catalog.description')}</p>
        {!props.songMasterReady ? (
          <p className="hintText">{t('public_catalog.song_master_required')}</p>
        ) : null}
        <form className="page" onSubmit={handleSearchSubmit}>
          <input
            aria-label={t('public_catalog.search_placeholder')}
            placeholder={t('public_catalog.search_placeholder')}
            value={searchText}
            disabled={!clientAvailable || loadPhase === 'loading'}
            onChange={(event) => setSearchText(event.target.value)}
          />
          <div className="rowActions">
            <button
              type="submit"
              disabled={!clientAvailable || loadPhase === 'loading'}
            >
              {t('public_catalog.action.search')}
            </button>
            {(searchText.length > 0 || currentQuery.length > 0) && (
              <button type="button" onClick={() => void handleClearSearch()}>
                {t('common.clear_all')}
              </button>
            )}
          </div>
        </form>
      </section>

      {!clientAvailable ? (
        <section className="warningBox">
          <p>{t('public_catalog.error.unavailable')}</p>
        </section>
      ) : null}

      {bannerMessage ? (
        <section className="warningBox">
          <p>{bannerMessage.text}</p>
        </section>
      ) : null}

      {clientAvailable && loadPhase === 'loading' && items.length === 0 ? (
        <section className="detailCard">
          <p>{t('public_catalog.loading')}</p>
        </section>
      ) : null}

      {clientAvailable &&
      loadPhase === 'error' &&
      items.length === 0 &&
      loadErrorMessage ? (
        <section className="warningBox">
          <p>{loadErrorMessage}</p>
          <div className="rowActions">
            <button type="button" onClick={() => void loadFirstPage(currentQuery)}>
              {t('common.reload')}
            </button>
          </div>
        </section>
      ) : null}

      {clientAvailable &&
      loadPhase === 'ready' &&
      items.length === 0 &&
      !loadErrorMessage ? (
        <section className="detailCard">
          <p>
            {currentQuery.length > 0
              ? t('public_catalog.empty_search')
              : t('public_catalog.empty')}
          </p>
        </section>
      ) : null}

      {items.length > 0 ? (
        <>
          <section className="detailCard">
            <p>{t('public_catalog.result_count', { count: items.length })}</p>
          </section>

          <div
            style={{
              display: 'grid',
              gap: 12,
            }}
          >
            {items.map((item) => (
              <section
                key={item.publicId}
                className="detailCard"
                style={{
                  display: 'grid',
                  gap: 10,
                }}
              >
                <div
                  style={{
                    display: 'grid',
                    gap: 6,
                  }}
                >
                  <h2 style={{ margin: 0 }}>{item.name}</h2>
                  <p style={{ margin: 0 }}>
                    {t('public_catalog.card.owner', { value: item.owner })}
                  </p>
                  <p style={{ margin: 0 }}>
                    {t('public_catalog.card.hashtag', {
                      value: formatHashtag(item.hashtag),
                    })}
                  </p>
                  <p style={{ margin: 0 }}>
                    {t('public_catalog.card.period', {
                      start: item.start,
                      end: item.end,
                    })}
                  </p>
                  <p style={{ margin: 0 }}>
                    {t('public_catalog.card.chart_count', {
                      count: item.chartCount,
                    })}
                  </p>
                </div>
                <div className="rowActions">
                  <button
                    type="button"
                    disabled={
                      importingPublicId !== null || !props.songMasterReady
                    }
                    onClick={() => void handleImport(item.publicId)}
                  >
                    {importingPublicId === item.publicId
                      ? t('common.loading')
                      : t('public_catalog.action.import')}
                  </button>
                </div>
              </section>
            ))}
          </div>

          {nextCursor ? (
            <div className="rowActions">
              <button
                type="button"
                disabled={isLoadingMore}
                onClick={() => void loadMore()}
              >
                {isLoadingMore
                  ? t('public_catalog.loading_more')
                  : t('public_catalog.load_more')}
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
