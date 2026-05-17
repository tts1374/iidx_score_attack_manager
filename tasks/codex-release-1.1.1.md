# codex/release-1.1.1 plan

BASE_SHA: 6a5c79ad0b0033ab7689b5c3273d6053531973dd

## Purpose

Prepare the repository metadata for the 1.1.1 release.

## Non-goals

- Do not change application behavior.
- Do not change dependencies or lockfile contents unless version synchronization requires it.
- Do not change CI, deployment, PWA, startup, storage, or Web Locks behavior.

## Changes

- [x] Synchronize root and package versions to 1.1.1.
- [x] Add a 1.1.1 entry to CHANGELOG.md.
- [x] Update in-app whats_new release notes for 1.1.1.
- [x] Validate version synchronization and repository diff.

## Impact

- User: release notes become available for 1.1.1.
- Data: no data format, schema, import/export, or persistence changes.
- Compatibility: no runtime contract changes.
- PWA: no Service Worker, COOP/COEP, or startup changes.
- Storage: no SQLite/OPFS changes.

## Target Files / Packages

- package.json
- packages/*/package.json
- CHANGELOG.md
- packages/web-app/src/i18n/locales/{ja,en,ko}.json
- tasks/codex-release-1.1.1.md

## Test Focus

- pnpm sync:versions:check
- pnpm lint
- pnpm test
- pnpm build
- git diff review for scope, encoding, and line-ending drift

## Rollback

Revert this release-preparation commit before tagging if the release scope or version changes.

## Commit Plan

1. Release metadata update for 1.1.1.
