# Release 1.3.1

BASE_SHA: d3b445c01c8068ebf64b2937b9cb7193722b3c82

## Purpose

Release the approved UI text, progress, accessibility, and layout improvements completed under #86 as v1.3.1.

## Non-goals

No additional UI implementation, dependency/lockfile/CI change, schema or payload change, Web Locks/Service Worker/startup/persistence redesign, or new mandatory device validation. Keep the accepted unverified items from #86 recorded as unverified.

## Changes and affected layers

- Synchronize the root and five packages' package.json versions to 1.3.1 with the existing sync script.
- Add the 1.3.1 entry to CHANGELOG.md.
- Update only the existing whats_new notice in ja/en/ko.
- Include this execution plan in the release PR.
- Metadata spans web-app/shared/db/pwa/public-catalog-api; this PR does not change their runtime behavior.

## Isolation and existing work

- Use one release/1.3.1 Git worktree based on the exact upstream BASE_SHA.
- Git direct transport and managed worktree registration are unavailable. The isolated repository contains the SHA-verified upstream signed commit, exact trees, and all 208 blobs; no synthetic base commit is used.
- The earlier local changes were compared with main. Seven files were already integrated; the specification's approval-pending wording was superseded by the recorded approval and closure.
- Preserve the original changes and validation materials in a verified archive outside the checkout. Original tracked contents are restored to HEAD; two cached status entries remain because the original Git index cannot be refreshed under the write restriction. Do not bypass this restriction.

## Validation

- [x] Version synchronization, UTF-8 without BOM/LF, metadata-only diff, unchanged lockfile.
- [x] All five packages' strict TypeScript checks and 435 tests passed against the isolated source. Existing installed third-party dependencies have an identical lockfile; temporary resolution configurations are outside the repository. The normal pnpm commands could not run because dependency retrieval is unavailable. A local Vite bundle attempt also failed on temporary dependency resolution, so do not report it as a successful production build.
- [ ] After merging the reviewed metadata PR, require the existing STG workflow's normal frozen install and production build to succeed before tagging. Verify the version and update notice in a real browser, including PC/mobile width and ja/en/ko. Do not tag if this validation fails.
- [ ] Create a normal PR as tts1374; confirm the latest-head Codex review, unresolved threads, applicable checks, and merge state.
- [ ] Merge and read back main; tag only that confirmed commit as v1.3.1.
- [ ] Confirm the existing production deployment workflow and the served production version. Record final delivery in the PR conversation without moving published tags.

## User authorization

The user has explicitly requested the release and reconciliation of remaining uncommitted work. This authorizes release metadata preparation, normal PR delivery/review/merge, the version tag/release, and production deployment through the existing workflow. Do not add unrelated cleanup or feature changes.

## Rollback

Before tagging, revert release metadata through a PR if needed. If production verification fails, redeploy the immutable previous tag v1.3.0 using the existing workflow. Never move published tags or change production data to hide a failure.

## Commit plan

One release metadata commit: synchronized version output, hand-written release notes, and this plan are intentionally grouped as one release-preparation change. Runtime build outputs are not committed.
