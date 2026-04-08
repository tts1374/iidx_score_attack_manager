# Plan: chore-song-master-weekly-cron

## 実行コンテキスト

- worktree: `C:/work/score_attack_manager/iidx_score_attack_manager`
- branch: `main`
- BASE_SHA: `997b4180e62f7ce189165a341e30dcf4bb21a958`

## 目的

- 曲マスタ更新ワークフローの `cron` 実行頻度を、毎日から週1回へ下げる。
- 作業ツリー内のローカル一時ファイル系ディレクトリを精査し、追跡不要なものを `.gitignore` に追加する。

## 非目的

- 曲マスタの取得・検証ロジック（`packages/db` / `packages/web-app`）の仕様変更。
- deploy系ワークフロー（`deploy-stg.yml` / `deploy-prod.yml`）の挙動変更。
- 既存 `.gitignore` の全面整理。

## 変更点

- `.github/workflows/build-song-master.yml`
  - `schedule.cron` を日次から週次に変更する（時刻は現行維持）。
- `.gitignore`
  - ローカル生成物と判断した `.tmp_py/`, `.vendor_py/`, `.tmp_pytest/`, `.tmp_pytest_base/` を追加する。

## 影響範囲（ユーザー / データ / 互換性 / PWA / 保存 / 起動）

- ユーザー: 曲マスタ定期更新の自動実行頻度のみ変化（手動更新導線は変更なし）。
- データ: データ形式・保存内容への変更なし。
- 互換性: payload / schema / `def_hash` 変更なし。
- PWA / 保存 / 起動: 変更なし。
- CI運用: GitHub Actions の実行頻度が低下する。

## 対象ファイル / 対象パッケージ

- `.github/workflows/build-song-master.yml`
- `.gitignore`
- `tasks/chore-song-master-weekly-cron.md`（本計画ファイル）

## テスト観点

- ワークフロー: `cron` が週1回の式へ変更されていること。
- 差分: 目的外変更が混入していないこと。
- 文字コード/改行: UTF-8 (no BOM) / LF のまま意図しない全行差分がないこと。
- 作業ツリー: `git status` で追加した ignore が機能し、追跡不要ファイルが残らないこと。

## ロールバック方針

- `build-song-master.yml` の `cron` を元の式へ戻す。
- `.gitignore` 追加行を削除する。

## コミット分割計画

1. plan: `tasks/chore-song-master-weekly-cron.md` 追加。
2. ci: `build-song-master.yml` の `cron` を週1へ変更。
3. hygiene: `.gitignore` に追跡不要ディレクトリを追加。
