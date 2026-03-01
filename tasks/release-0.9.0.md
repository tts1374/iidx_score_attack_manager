# release/0.9.0 plan

## 目的

- 既存のバージョン表記を `0.9.0` に統一し、リリース準備を完了する。
- 更新前後の整合性を `sync:versions:check` で検証する。
- 変更履歴とアプリ内 `whats_new` をリリース内容に合わせて更新する。

## 非目的

- 新機能追加、設計変更、データモデル変更。
- Web Locks / Service Worker / COOP-COEP / import/export フロー変更。
- CI/CD 設定変更、依存関係更新、タグ push。

## 変更点

- `pnpm -s sync:versions:check` を更新前に実行して整合性確認。
- `pnpm -s sync:versions 0.9.0` を実行して package version を機械更新。
- `pnpm -s sync:versions:check 0.9.0` を実行して更新後整合性確認。
- `package.json version` 以外のアプリバージョン表示箇所を棚卸しし、必要最小限を `0.9.0` に統一。
- `CHANGELOG.md` に `0.9.0` セクションを追加。
- `packages/web-app/src/i18n/locales/{ja,en,ko}.json` の `whats_new` を `0.9.0` 告知内容へ更新。

## 影響範囲

- ユーザー: 設定画面等で表示されるアプリバージョン、お知らせモーダル文言。
- データ: 永続データ形式・DBスキーマ・共有ペイロードへの影響なし。
- 互換性: 破壊的変更なし（既存データ互換性維持）。

## 実装方針（対象ファイル単位）

- `package.json`: root version を `0.9.0` に更新（スクリプト経由）。
- `packages/*/package.json`: 各 workspace package version を `0.9.0` に更新（スクリプト経由）。
- `CHANGELOG.md`: `0.9.0` リリースノートを追記（新規作成の可能性あり）。
- `packages/web-app/src/i18n/locales/ja.json`: `whats_new` を日本語で更新。
- `packages/web-app/src/i18n/locales/en.json`: `whats_new` を英語で更新。
- `packages/web-app/src/i18n/locales/ko.json`: `whats_new` を韓国語で更新。

## テスト観点

- `pnpm -s sync:versions:check`（更新前）が成功すること。
- `pnpm -s sync:versions:check 0.9.0`（更新後）が成功すること。
- `pnpm lint` / `pnpm test` / `pnpm build` が成功すること。
- アプリ内バージョン表示が `0.9.0` であること（ビルド成果から確認可能な範囲で検証）。
- 単一タブ前提（Web Locks名・委譲経路）に差分がないこと。

## ロールバック方針

- 不具合時は `release/0.9.0` の該当コミットを `git revert` で取り消す。
- 版番号のみ問題がある場合は `sync:versions <previous-version>` で再同期し再検証する。

## Commit Plan（コミット分割計画）

1. `chore(release): sync versions to 0.9.0`  
   - `sync:versions` による version 更新差分のみを含める。
2. `chore(release): v0.9.0`  
   - `CHANGELOG.md` と `whats_new` 更新、および最小限の版表示調整を含める。

## 実施手順チェック

- [x] Plan（本ファイル）作成
- [x] 実装: バージョン同期とリリースノート更新
- [x] 検証: check/lint/test/build
- [x] PR準備: 差分確認、コミット、運用メモ整理
