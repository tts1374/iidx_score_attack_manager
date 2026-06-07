# codex/release-1.2.0 plan

BASE_SHA: 7befe02e2494fd93da466175fb0a126fc84c0244

## Purpose

Prepare the repository metadata for the 1.2.0 release.

## Non-goals

- Do not change application behavior.
- Do not change dependencies or lockfile contents unless version synchronization requires it.
- Do not change CI, deployment, PWA, startup, storage, or Web Locks behavior.

## Changes

- [x] Confirm the release scope since v1.1.1 and select version 1.2.0.
- [x] Synchronize root and package versions to 1.2.0.
- [x] Add a 1.2.0 entry to CHANGELOG.md.
- [x] Update in-app whats_new release notes for 1.2.0.
- [x] Validate version synchronization and repository diff.
- [x] Create the release preparation PR.

## Impact

- User: release notes become available for 1.2.0.
- Data: no data format, schema, import/export, or persistence changes.
- Compatibility: the release includes previously merged public catalog contract changes; this preparation PR adds no further runtime contract changes.
- PWA: no Service Worker, COOP/COEP, or startup changes.
- Storage: no SQLite/OPFS changes.

## Target Files / Packages

- package.json
- packages/*/package.json
- CHANGELOG.md
- packages/web-app/src/i18n/locales/{ja,en,ko}.json
- tasks/codex-release-1.2.0.md

## Test Focus

- pnpm sync:versions:check 1.2.0
- pnpm lint
- pnpm test
- pnpm build
- git diff review for scope, encoding, and line-ending drift

## Rollback

Revert this release-preparation commit before tagging if the release scope or version changes.

## Commit Plan

1. Release metadata update for 1.2.0.
