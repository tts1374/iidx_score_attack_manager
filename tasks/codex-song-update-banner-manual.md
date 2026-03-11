# Plan: codex/song-update-banner-manual

## 実行コンテキスト

- worktree: `C:/work/score_attack_manager/iidx_score_attack_manager__codex_song_update_banner`
- branch: `codex/song-update-banner-manual`
- BASE_SHA: `0eb563be173547bfa0240f64d845a806f9be69ab`

## 目的

- Home 表示時に配信元 `latest.json.generated_at` を確認し、新しい曲データがあれば更新バナーで通知する。
- バナーから手動更新を実行できるようにし、成功/失敗をトーストで通知する。
- 更新中状態をアプリ共通状態で扱い、画面遷移後も二重実行や状態不整合を防ぐ。

## 非目的

- 自動更新、バックグラウンド更新、進捗ダイアログの追加。
- 複数マスタ種別ごとの通知分離。
- DB schema / user_version / payload / import-export 互換性仕様の変更。

## 変更点

- `packages/db/src/song-master.ts`
  - 更新要否判定を `sha256/byte_size` 比較から、`latest.generated_at` とローカル適用済み `generated_at` の日時比較へ変更。
  - 内部比較は日時正規化（epoch）で行い、文字列比較に依存しない。
- `packages/web-app/src/App.tsx`
  - Home 表示時ごとに `latest.json.generated_at` を取得して更新可否を判定する処理を追加。
  - Home 上部に更新バナー（固定文言、更新ボタン、dismiss）を追加。
  - dismiss は同一 `generated_at` に対してセッション中のみ有効。
  - 更新実行は既存更新処理を再利用し、アプリ共通状態で二重実行を防止。
- `packages/web-app/src/styles.css`
  - 追加バナー用の最小スタイルを追加（既存バナーに干渉しない範囲）。
- `packages/web-app/src/i18n/locales/{ja,en,ko}.json`
  - バナー固定文言と操作文言を最小追加。
- `packages/db/test/song-master.test.ts`
  - `generated_at` 比較仕様に合わせて既存テストを更新し、回帰を防止。

## 影響範囲（ユーザー / データ / 互換性 / 起動）

- ユーザー:
  - Home 上部で更新可能を認知でき、手動更新が可能になる。
- データ:
  - 更新成功時のみ適用済み `generated_at` が進む。失敗時は旧マスタ維持。
- 互換性:
  - DB schema / 保存形式に変更なし。
- 起動:
  - 起動導線自体は変更しない。Home 表示時に更新確認を追加。

## 対象ファイル / 対象パッケージ

- 対象パッケージ: `packages/web-app`, `packages/db`
- 対象ファイル:
  - `packages/web-app/src/App.tsx`
  - `packages/web-app/src/styles.css`
  - `packages/web-app/src/i18n/locales/ja.json`
  - `packages/web-app/src/i18n/locales/en.json`
  - `packages/web-app/src/i18n/locales/ko.json`
  - `packages/db/src/song-master.ts`
  - `packages/db/test/song-master.test.ts`

## テスト観点

- Home 表示時チェック:
  - `latest.generated_at` がローカルより新しい場合にバナー表示。
  - 同一 `generated_at` で dismiss 後はセッション中再表示しない。
  - より新しい `generated_at` 検知時は再表示する。
- 手動更新:
  - 更新中は二重実行できない。
  - 成功時にバナーが消え、成功トーストが出る。
  - 失敗時にバナーが残り、失敗トーストが出る。
- DB 更新判定:
  - 同一/過去 `generated_at` はダウンロードしない。
  - より新しい `generated_at` はダウンロードする。

## ロールバック方針

- 本タスクのコミットを `git revert` して Home バナーと `generated_at` 判定変更を戻す。
- schema 変更がないため、ロールバック時の保存互換性影響はない。

## コミット分割計画

1. plan: `tasks/codex-song-update-banner-manual.md` を追加。
2. db-flow: `generated_at` 比較ロジックと関連テストを更新。
3. web-ui: Home バナー/手動更新導線/文言/最小スタイルを追加。
4. verify: 必要最小のテスト実行と差分確認。
