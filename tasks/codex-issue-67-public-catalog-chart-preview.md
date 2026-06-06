# Issue #67: public catalog chart preview

BASE_SHA: a517210e75c05fa3065a0e6e85022e8dabdc5fef

## Purpose

公開スコアタ一覧で、Import に進む前に登録曲の概要を確認できるようにする。

## Non-goals

- Import / Import Confirm flow は変更しない。
- DB schema / migration / `user_version` は変更しない。
- `def_hash`、Web Locks、PWA / Service Worker / startup は変更しない。
- multi-tab 対応、公開カタログ検索仕様、song master 更新フローは変更しない。
- PR 作成、merge、Issue close、cleanup は行わない。

## Changes

- `@iidx/shared` の公開カタログ一覧 item に optional `chartPreview` を追加する。
- public catalog API は既存 `payload_json` から chart preview を派生して一覧レスポンスに含める。
- web-app は有効な chart preview（最大 4 件）をカードにすべて表示する。
- web-app は song master が利用可能な場合、preview title をローカル song master の曲名で補完する。
- 旧 API 応答や壊れた stored payload では既存の譜面数表示へフォールバックする。

## Impact

- User: 公開スコアタ一覧で登録曲の概要を確認できる。
- Data: DB schema 変更なし。既存保存データは変更しない。
- Compatibility: 一覧 API の optional field 追加のみ。既存必須 field は変更しない。
- PWA / startup / Web Locks: 変更なし。

## Target files / packages

- `packages/shared`
- `packages/public-catalog-api`
- `packages/web-app`

## Test plan

- [ ] `pnpm --filter @iidx/shared test`
- [ ] `pnpm --filter @iidx/public-catalog-api test`
- [ ] `pnpm --filter @iidx/web-app test`
- [ ] `pnpm --filter @iidx/shared build`
- [ ] `pnpm --filter @iidx/public-catalog-api build`
- [ ] `pnpm --filter @iidx/web-app build`

## Rollback

`chartPreview` の shared type/helper、API response mapping、web-app 表示/i18n/test を同一 PR 内で revert する。DB migration がないためデータ rollback は不要。

## Commit plan

1. shared/API contract and preview derivation
2. web-app chart preview display and i18n
3. tests and task artifact
