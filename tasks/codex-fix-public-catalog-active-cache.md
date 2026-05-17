# Plan: codex/fix-public-catalog-active-cache

- BASE_SHA: `838b228c67de044ae819b0cec5314a420852f1cf`
- branch: `codex/fix-public-catalog-active-cache`
- request ceiling: implementation-authorized
- task artifact: implementation branch artifact included with this fix

## Purpose

Fix public catalog visibility so active tournaments that already started still appear, and prevent Service Worker cached API responses from hiding newly registered tournaments.

## Non-goals

- Do not change Web Locks, single-tab delegation, startup routing, DB schema, payload format, or public catalog request/response contract.
- Do not change deploy workflows or dependencies.
- Do not redesign public catalog pagination beyond the active-date boundary needed for this bug.

## Changes

- Change public catalog list filtering from `start_date >= today` to `end_date >= today`.
- Preserve cursor date-floor behavior with a renamed date boundary so pagination cannot use an older active cutoff.
- Make the Service Worker honor `cache: "no-store"` GET requests by bypassing Cache Storage and fetching from network.
- Bump Service Worker cache/version identifiers so stale cached catalog API responses are dropped on activation.
- Add/update focused tests for active-date filtering and no-store cache bypass.

## Impact

- User: registered public tournaments remain visible while their period is still active.
- Data: no persisted app data or D1 schema changes.
- Compatibility: API response shape remains unchanged.
- PWA: Service Worker fetch strategy changes only for explicit no-store requests; app shell caching remains intact.
- Startup: no Web Locks, COOP/COEP, or bootstrap flow changes.

## Target Files

- `packages/public-catalog-api/src/index.ts`
- `packages/public-catalog-api/src/repository/public-tournaments.ts`
- `packages/public-catalog-api/test/index.test.ts`
- `packages/pwa/sw/service-worker.ts`
- `packages/web-app/public/sw.js`
- relevant Service Worker tests if present

## Tests

- `pnpm --filter @iidx/public-catalog-api test`
- PWA/SW related test or package test if available
- Focused build/typecheck where package scripts support it
- Diff review for UTF-8/LF and minimal scope

## Rollback

Revert this branch/PR. Existing app shell cache names will roll back to the prior Service Worker behavior, and the public catalog API will return to start-date-only active filtering.

## Commit Plan

- [x] plan: add task artifact
- [x] api: fix active tournament date floor and tests
- [x] pwa: honor no-store in Service Worker and bump cache/version
- [x] validation: run focused tests and inspect diff
