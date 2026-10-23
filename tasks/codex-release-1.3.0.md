# codex/release-1.3.0 plan

BASE_SHA: ce5ee509c24856f8c595b092792cd99d7ae52192

## Purpose

Release the changes merged since v1.2.1 as v1.3.0, including automatic song-data updates, toast interaction fixes, and the Node.js security update.

## Scope and non-goals

- Update release metadata only; reuse the merged implementation and existing deployment workflow.
- Keep dependencies, lockfile, CI, Web Locks, Service Worker, startup, persistence, database schema, and import/export contracts unchanged.
- The user has authorized release delivery, including the release PR merge and production tag. Issue closure and worktree/branch cleanup are outside this task.

## Changes and affected files

- Synchronize `package.json` and `packages/*/package.json` to 1.3.0.
- Add the 1.3.0 entry to `CHANGELOG.md`.
- Update `whats_new` in `packages/web-app/src/i18n/locales/{ja,en,ko}.json`.
- Include this execution plan in the release preparation PR.

## Impact

- Users: automatic song-data acquisition and updates; toast notifications allow access to the create button and app-update controls.
- Layers: release version metadata in web-app, shared, db, pwa, and public-catalog-api; notice text in web-app.
- Data and compatibility: no new schema, payload, import/export, or OPFS changes in this PR.
- PWA and startup: no additional runtime changes; the previously merged automatic-update implementation is included in the release.
- Deployment: push the version tag only after the release PR is merged and read back; use the existing production workflow.

## Validation and delivery

- [x] Check synchronized versions and metadata-only diff, UTF-8 without BOM / LF.
- [x] Run `pnpm lint`, `pnpm test`, and `pnpm build`: all 237 tests passed; existing bundle-size warning only.
- [x] Inspect the rendered update notice and version: Chrome at 1280x900 and 390x844; all three items and the close button fit, closing returns to home, and `seen_version` is 1.3.0. No app console errors. Browser plugin not available; used bundled Playwright with installed Chrome. Local preview has no distributed song-master assets, so its expected download-failure state is separate from production validation.
- [ ] Create the release PR as `tts1374` and verify the latest-head Codex review, review threads, required checks, and merge state.
- [ ] Merge and read back the resulting commit; verify staging deployment.
- [ ] Push `v1.3.0` at the merged commit and verify production deployment and the served version.

## Rollback

- Before tagging, revert the release metadata commit through a PR if needed.
- If production validation fails, redeploy the immutable previous tag `v1.2.1` using the existing production workflow. Do not move published tags or change production data.

## Commit plan

1. Prepare 1.3.0 versions, release notes, and the execution/validation record in one release metadata commit. The version synchronization output is intentional release metadata, with no generated runtime artifacts.
