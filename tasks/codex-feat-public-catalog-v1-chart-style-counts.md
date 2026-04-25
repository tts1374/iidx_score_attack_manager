# Plan: codex/feat-public-catalog-v1-chart-style-counts

## 実行コンテキスト

- branch: `codex/feat-public-catalog-v1-ui`
- BASE_SHA: `731ebbcf5337dec0d1ccb36dff002c06a6f26e6f`
- current request ceiling: implementation-authorized

## 目的

- 公開カタログ一覧カードで、総譜面数に加えて `SP` / `DP` それぞれの譜面数を表示する。
- 既存の総譜面数表示は維持し、ユーザーが内訳を一目で確認できるようにする。

## 非目的

- DB schema / migration の変更。
- payload 形式、`def_hash`、import/export 形式の変更。
- Service Worker、起動導線、Web Locks、PWA 挙動の変更。
- 公開カタログの検索条件や pagination 仕様の変更。

## 変更点

- `packages/shared`
  - `PublicTournamentListItem` に `spChartCount` / `dpChartCount` を追加する。
- `packages/public-catalog-api`
  - 既存保存済み `payload_json` の `charts` から SP/DP 内訳を算出して list response に含める。
  - `chart_count` は既存どおり総数として維持する。
- `packages/web-app`
  - public catalog client の response validation を追加項目へ追随する。
  - `PublicCatalogPage` のカード metadata に SP/DP 内訳表示を追加する。
  - 関連テストを更新する。

## 影響範囲

- ユーザー: 公開カタログ一覧で総譜面数と SP/DP 内訳が見える。
- データ: 保存済み `payload_json` から算出するだけで永続データの追加・変更はない。
- 互換性: list response contract は加算変更。Web App は旧 API response では総譜面数表示に fallback する。payload/import/export/def_hash は変更しない。
- PWA / 起動: 変更しない。
- 保存: DB schema と `user_version` は変更しない。

## 対象ファイル / 対象パッケージ

- `packages/shared/src/public-catalog.ts`
- `packages/public-catalog-api/src/repository/public-tournaments.ts`
- `packages/public-catalog-api/test/index.test.ts`
- `packages/web-app/src/services/public-catalog-client.ts`
- `packages/web-app/src/services/public-catalog-client.test.ts`
- `packages/web-app/src/pages/PublicCatalogPage.tsx`
- `packages/web-app/src/pages/PublicCatalogPage.test.tsx`
- `packages/web-app/src/i18n/locales/ja.json`
- `packages/web-app/src/i18n/locales/en.json`
- `packages/web-app/src/i18n/locales/ko.json`

## テスト観点

- 正常系: list API が SP/DP 内訳を含む response を返し、Web App のカードに表示される。
- 境界値: SP のみ / DP のみ、または不正・未知 chart id が混じる場合でも総数表示と validation が破綻しない。
- Contract: client validation は `spChartCount` / `dpChartCount` がある場合の型を検証し、旧 API response も読める。
- 回帰: payload endpoint、publish/import 導線、既存総譜面数表示を壊さない。

## ロールバック方針

- 本コミットを revert すれば list response の加算項目と UI 表示のみ戻る。
- DB schema、payload、import/export に触れないため、ロールバック時のデータ移行は不要。

## コミット分割計画

1. `public-catalog-chart-style-counts`: shared/API/client/UI/test を一体で更新する。
