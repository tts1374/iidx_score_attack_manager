# codex/release-1.2.1 plan

BASE_SHA: cc14ab69c3c87993fe0f56721e491beb47e6ff70

## Purpose

Prepare the repository metadata for the 1.2.1 release from the changes merged since v1.2.0.

## Release scope

- Align song-title search normalization with the song master for Japanese dakuten and handakuten.
- Include the regression coverage added for representative song-master keys.

## Non-goals

- Do not change application behavior beyond the already merged v1.2.0-to-v1.2.1 scope.
- Do not change dependencies or lockfile contents unless version synchronization requires it.
- Do not change CI, deployment, PWA, startup, storage, Web Locks, import/export, or database schema behavior.
- Do not create the v1.2.1 tag or GitHub Release during release preparation.

## Changes

- [x] Synchronize root and package versions to 1.2.1.
- [x] Add a 1.2.1 entry to CHANGELOG.md.
- [x] Update in-app whats_new release notes for 1.2.1 in ja / en / ko.
- [x] Validate version synchronization and repository diff.
- [x] Run release validation checks.
- [x] Create the release preparation PR.

## Impact

- User: the update notice describes the improved song search behavior.
- Data: no data format, schema, import/export, or persistence changes.
- Compatibility: no payload or runtime contract changes; the release includes the already merged search normalization fix.
- PWA: no Service Worker, COOP/COEP, or startup changes.
- Storage: no SQLite/OPFS changes.

## Target files / packages

- package.json
- packages/*/package.json
- CHANGELOG.md
- packages/web-app/src/i18n/locales/{ja,en,ko}.json
- tasks/codex-release-1.2.1.md

## Test focus

- `pnpm sync:versions 1.2.1`
- `pnpm sync:versions:check 1.2.1`
- `pnpm lint`
- `pnpm test`
- `pnpm build`
- git diff review for scope, encoding, and line-ending drift

## Rollback

Revert the release-preparation commit before tagging if the release scope or version changes.

## Commit plan

1. Release metadata update for 1.2.1.
