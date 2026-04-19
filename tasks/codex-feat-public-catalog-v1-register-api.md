# Plan: codex/feat-public-catalog-v1-register-api

## 実行コンテキスト（予定）

- worktree: `C:/work/score_attack_manager/iidx_score_attack_manager-codex-public-catalog-v1-register-api`
- branch: `codex/feat-public-catalog-v1-register-api`
- BASE_SHA: `0e2d7d0c26b65966b518fcaacdcf56d8bb977ae1`

## 目的

- Cloudflare Workers + D1 上に匿名公開用の `POST /api/public-tournaments` を追加し、ローカル大会作成後に公開登録できるサーバー基盤を用意する。
- 既存の `def_hash` や import payload 契約を変更せず、`registry_hash` による重複判定基盤を `packages/shared` と API 層で共通化する。
- 匿名書き込み v1 の最低限運用として、IP 単位抑制・監査ログ・運営削除手段を整備する。

## 非目的

- 公開一覧・検索 API（#49）。
- `payloadParam` を返す read API（#50）。
- クライアント側の公開状態表示、再試行 UI、公開導線接続（#51）。
- 投稿者認証、一般ユーザー向けの編集/削除 UI や公開削除 API。
- `def_hash`、既存 import payload、Web Locks、PWA 起動導線、OPFS/SQLite ローカル保存の仕様変更。
- ルーター導入など、Worker 実装に不要な依存追加。

## 変更点

- `packages/shared`
  - 公開登録 API で使う request/response 型を追加する。
  - 既存 `normalizeTournamentPayload` を再利用しつつ、`uuid` を重複判定対象から外した canonical object を生成する helper を追加する。
  - `name / owner / hashtag / start / end / charts(sorted)` を入力に `registry_hash` を算出する helper を追加し、`def_hash` とは分離する。
- `packages/public-catalog-api`（新規）
  - Cloudflare Workers 用 package を新設し、monorepo の `build/test/lint` に参加できる最小構成を追加する。
  - Worker エントリ、環境変数/bindings 型、CORS ユーティリティ、D1 access layer を追加する。
  - `POST /api/public-tournaments` を実装し、payload 検証、`registry_hash` 算出、重複解決、`publicId` 発行、監査ログ記録を行う。
  - GitHub Pages からのブラウザ呼び出しだけを許可する allowlist 型 CORS を実装し、wildcard 許可は行わない。
  - 書き込み抑制は Cloudflare から得られるクライアント IP を直接永続化せず、ハッシュ化した request key と時間窓で判定する。
  - 誤登録/違反登録への運営対応は browser-facing delete API ではなく、D1 に対する運営用削除手段で実現する。
- D1 schema / access
  - 公開大会本体テーブルを追加し、`public_id`、`registry_hash`、正規化済み payload JSON、検索用メタ、監査参照列を保持する。
  - 監査ログテーブルを追加し、`accepted / duplicate / rate_limited / deleted` などの結果と request fingerprint を残す。
  - `registry_hash` は unique 制約を持たせ、同一内容の再登録では既存 `publicId` を返す。
  - 運営削除は soft-delete/tombstone 前提とし、監査履歴と重複判定キーは保持する。
- 運営削除導線
  - 運営用の削除手段は repo 内スクリプトまたは `wrangler d1 execute` ベースの運用コマンドとして整備し、一般公開エンドポイントは増やさない。
  - 削除時は対象 row の公開状態変更と監査ログ追記を同時に行う。
- 依存/設定
  - Worker 実装に必要な最小依存だけを追加し、router/framework 依存は持ち込まない。
  - lockfile 変更が必要な場合は Worker bootstrap コミットへ閉じ込める。

## 影響範囲（ユーザー / データ / 互換性 / PWA / 保存 / 起動）

- ユーザー:
  - このブランチ単体では既存 UI の見た目は変わらない。
  - 後続の #51 が接続される前提となる公開登録 API が追加される。
- データ:
  - 新規 D1 データストアに公開大会定義と監査ログを保存する。
  - 既存 OPFS/SQLite のローカル保存データには影響しない。
- 互換性:
  - 既存 `def_hash` と import payload 契約は維持する。
  - `publicId` / `registry_hash` は新規サーバー側契約として閉じる。
- PWA:
  - Service Worker、COOP/COEP、single-tab 制御には触れない。
- 保存:
  - ローカル保存方式には変更なし。追加されるのは Cloudflare D1 のみ。
- 起動:
  - web-app の startup/import routing には変更なし。
- 運用:
  - Cloudflare Worker 配備、D1 binding、許可 origin、運営削除手順が新たに必要になる。

## 対象ファイル / 対象パッケージ

- 対象パッケージ:
  - `packages/shared`
  - `packages/public-catalog-api`（新規）
- 想定対象ファイル:
  - `packages/shared/src/index.ts`
  - `packages/shared/src/public-catalog.ts`（新規）
  - `packages/shared/src/public-catalog.test.ts`（新規）
  - `packages/public-catalog-api/package.json`（新規）
  - `packages/public-catalog-api/tsconfig.json`（新規）
  - `packages/public-catalog-api/wrangler.jsonc` もしくは同等の Wrangler 設定（新規）
  - `packages/public-catalog-api/migrations/*.sql`（新規）
  - `packages/public-catalog-api/src/index.ts`（新規）
  - `packages/public-catalog-api/src/env.ts`（新規）
  - `packages/public-catalog-api/src/cors.ts`（新規）
  - `packages/public-catalog-api/src/repository/public-tournaments.ts`（新規）
  - `packages/public-catalog-api/src/rate-limit.ts`（新規）
  - `packages/public-catalog-api/src/*.test.ts`（新規）
  - `packages/public-catalog-api/scripts/*`（運営削除手段が script 化される場合）
  - `pnpm-lock.yaml`（依存追加が必要な場合のみ）

### 変更スコープ固定

- `packages/web-app`、`packages/db`、`packages/pwa` は本ブランチでは変更しない。
- 親 Issue #47 で決めた `def_hash` 非変更、既存 import-confirm 導線流用、単一タブ凍結は前提として維持する。

## テスト観点

- shared helper:
  - 同一内容で `uuid` だけ違う payload から同じ `registry_hash` が得られる。
  - `charts` 順序差分があっても canonical 化後の hash が一致する。
  - `def_hash` 既存 helper の挙動は変わらない。
- POST API:
  - 正常 payload で `created` と `publicId` が返る。
  - 同一内容の再登録では新規 row を増やさず `duplicate` と既存 `publicId` を返す。
  - 不正 payload は 4xx で拒否され、監査ログに失敗理由が残る。
- abuse 対策:
  - 閾値超過時に rate limit が発火し、登録は作成されず監査ログだけ残る。
  - request fingerprint に生 IP が平文保存されない。
- CORS:
  - 許可 origin の preflight / POST は通る。
  - 非許可 origin は拒否され、wildcard 応答しない。
- 運営削除:
  - 削除手段実行で対象 row が active 一覧から外れ、監査ログに `deleted` が記録される。
  - tombstone 後も同一 `registry_hash` の重複防止が維持される。
- 回帰:
  - 既存 web-app / shared / db の build に不要な変更が混ざらない。
  - `packages/shared` の既存 payload import/export 契約に差分がない。

## ロールバック方針

- コードは commit 単位で `git revert` し、Worker package と shared helper をまとめて無効化する。
- D1 schema は既存ローカル DB と分離された加算変更なので、ロールバック時はまず Worker 配備を止めて新規流入を止める。
- 既に作成済みの D1 テーブル/データは、運用判断に応じて保持するか、専用 SQL で後処理する。
- 既存 web-app / OPFS / import payload には変更を入れないため、ロールバック時の互換性リスクはサーバー新設分に限定される。

## コミット分割計画

1. `plan`: `tasks/codex-feat-public-catalog-v1-register-api.md` を追加。
2. `shared-contract`: `registry_hash` helper と公開登録 API 型を `packages/shared` に追加。
3. `worker-bootstrap`: `packages/public-catalog-api` の package 基盤、Wrangler 設定、D1 migration、最小依存を追加。
4. `write-api`: `POST /api/public-tournaments`、duplicate 解決、CORS、監査ログ、rate limit を実装。
5. `ops-delete-and-tests`: 運営削除手段と shared/API の関連テストを追加し、最小検証を行う。
