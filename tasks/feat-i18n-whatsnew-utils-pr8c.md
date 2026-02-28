- [x] Scope declaration
- [x] Audit hardcoded UI strings in whats-new-content.ts and utils/*
- [x] Implement i18n replacements (no logic/DOM/style changes)
- [x] Update ja/en/ko locale dictionaries
- [x] Re-run extraction and validate no remaining targeted hardcoded UI strings
- [x] Run quality checks (web-app lint/test)
- [x] Prepare PR notes (BASE_SHA, commands, changed files, exclusions)

Worktree:
- path: C:\work\score_attack_manager\iidx_score_attack_manager-pr8c-whatsnew-utils
- branch: feat/i18n-whatsnew-utils-pr8c
- BASE_SHA: 87fbb6ed9bfe4163a5cb1a6c9ee4527300523e7b

Commit plan:
1. i18n migration for whats-new-content.ts and relevant utils consumers
2. locale key additions for ja/en/ko
3. verification and task note updates

Extraction commands:
1. `rg -n --no-heading "whats-new-content|WHATS_NEW_" packages/web-app/src`
2. `rg -n --no-heading --glob '!*.test.*' "[ぁ-んァ-ヶ一-龠]" packages/web-app/src/App.tsx packages/web-app/src/utils/iidx.ts packages/web-app/src/utils/tournament-status.ts`
3. `rg -n --no-heading "title=|placeholder=|aria-label=" packages/web-app/src/App.tsx packages/web-app/src/utils/iidx.ts packages/web-app/src/utils/tournament-status.ts`

Result summary:
- `whats-new-content.ts` is removed and source-of-truth moved to locale JSON (`whats_new.modal`, `whats_new.items`).
- Modal now reads `t("whats_new.items", { returnObjects: true })` as `string[]` and falls back to `[]` when invalid.
- Targeted hardcoded UI strings in target `utils/*` remain migrated to i18n.
- Remaining literal `aria-label` values in `App.tsx` are fixed IDs for selector/stability (`search-close`, `search-clear`, `home-filter`, `global-settings-menu`, `back`, `detail-actions-menu`, `home-applied-filters`, `home-search-entry`).
- Existing behavior for visibility timing / seen-version storage is unchanged.

Verification:
- `pnpm --filter @iidx/web-app lint` : passed
- `pnpm --filter @iidx/web-app test` : passed
