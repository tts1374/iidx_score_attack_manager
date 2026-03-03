# release/0.9.1 plan

## 目的

- 既存のバージョン表記を `0.9.1` に統一し、破壊的変更なしでリリース準備を完了する。
- 更新前後の整合性を `sync:versions:check` で検証する。
- `CHANGELOG.md` と `whats_new` を `v0.9.0` 以降の変更内容に合わせて更新する。

## 非目的

- 新機能追加、設計変更、データモデル変更。
- Web Locks / Service Worker / COOP-COEP / import/export フロー変更。
- CI/CD 設定変更、依存関係更新、タグ作成・push の実施。

## 変更点

- `pnpm -s sync:versions:check` を更新前に実行して整合性確認。
- `pnpm -s sync:versions 0.9.1` を実行して package version を機械更新。
- `pnpm -s sync:versions:check 0.9.1` を実行して更新後整合性確認。
- `package.json version` 以外の版情報の棚卸しを行い、必要最小限を `0.9.1` に統一。
- `CHANGELOG.md` に `0.9.1` セクションを追加（`v0.9.0` との差分要約3行）。
- `packages/web-app/src/i18n/locales/{ja,en,ko}.json` の `whats_new` を `0.9.1` 告知内容（3行）に更新。

## 影響範囲

- ユーザー: 設定画面等で表示されるアプリバージョン、お知らせモーダル文言。
- データ: 永続データ形式・DBスキーマ・共有ペイロードへの影響なし。
- 互換性: 破壊的変更なし（既存データ互換性維持）。

## 実装方針（対象ファイル単位）

- `package.json`: root version を `0.9.1` に更新（スクリプト経由）。
- `packages/*/package.json`: 各 workspace package version を `0.9.1` に更新（スクリプト経由）。
- `CHANGELOG.md`: `0.9.1` リリースノートを追記。
- `packages/web-app/src/i18n/locales/ja.json`: `whats_new` を日本語で更新。
- `packages/web-app/src/i18n/locales/en.json`: `whats_new` を英語で更新。
- `packages/web-app/src/i18n/locales/ko.json`: `whats_new` を韓国語で更新。

## テスト観点

- `pnpm -s sync:versions:check`（更新前）が成功すること。
- `pnpm -s sync:versions:check 0.9.1`（更新後）が成功すること。
- `pnpm lint` / `pnpm test` / `pnpm build` が成功すること。
- アプリ内バージョン表示が `0.9.1` であることを成果物と定義箇所で確認すること。
- URL構造と single-tab invariant（Web Locks 名・委譲経路）に差分がないこと。

## ロールバック方針

- 不具合時は `release/0.9.1` の該当コミットを `git revert` で取り消す。
- 版番号のみ問題がある場合は `sync:versions <previous-version>` で再同期し再検証する。

## Commit Plan（コミット分割計画）

1. `chore(release): v0.9.1`
   - `sync:versions` による version 更新、`CHANGELOG.md`、`whats_new`、本 plan ファイルのみを含める。

## 実施手順チェック

- [x] Plan（本ファイル）作成
- [x] 実装: バージョン同期とリリースノート更新
- [x] 検証: check/lint/test/build
- [ ] PR準備: 差分確認、コミット、タグ作成前で停止
