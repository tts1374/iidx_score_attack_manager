# Plan: feat/i18n-common-components

## Scope Declaration

- web-app/src/components/**
- web-app/src/App.tsx (only if shared UI hardcoded strings are present)
- web-app/src/main.tsx (only if shared UI hardcoded strings are present)
- web-app/src/services/context.tsx (shared UI / notification strings only)
- web-app/src/i18n/locales/ja/**, web-app/src/i18n/locales/en/**, web-app/src/i18n/locales/ko/** (only common.* updates required for replacements)

Out of scope:
- web-app/src/pages/**
- shared/**, db/**, pwa/**
- props, layout, logic changes

## Commit Plan

1. Extract and replace shared hardcoded UI strings with t(common.*) in allowed files.
2. Add or update common.* keys in ja and sync equivalent keys to en and ko.
3. Run validation and verify diff scope (pages/** unchanged, behavior-preserving string-only edits).

## Execution Checklist

- [x] Enumerate all hardcoded strings in target files
- [x] Replace hardcoded strings with t() using common.*
- [x] Ensure placeholders are named when interpolation is needed
- [x] Update locale files (ja SSOT, then en and ko)
- [x] Validate no out-of-scope diffs and run checks

Validation note:
- `pnpm --filter @iidx/web-app lint` / `test` could not run because `node_modules` is not installed in this worktree (`tsc` / `vitest` command not found).
