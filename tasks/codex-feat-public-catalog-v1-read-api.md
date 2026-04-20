# Plan: codex/feat-public-catalog-v1-read-api

## 実行コンテキスト（予定）

- worktree: `C:/work/score_attack_manager/iidx_score_attack_manager-codex-public-catalog-v1-read-api`
- branch: `codex/feat-public-catalog-v1-read-api`
- BASE_SHA: `cf7c4ebbc7ac7cfc6504de9840b3e9a5e7fe0e05`
- 実装開始条件: #48 で追加される `packages/public-catalog-api` と公開大会 schema / contract が main に取り込まれているか、同等差分を base に含むこと。本ブランチで #48 の bootstrap を再実装しない。

## 目的

- 公開カタログの read API として `GET /api/public-tournaments`、`GET /api/public-tournaments/:publicId/payload` を追加し、公開一覧・検索・既存 `import/confirm` 導線の server 側橋渡しを提供する。
- 公開登録側で保存された大会定義を、`name / owner / hashtag` 検索と新着順ページングで取得できるようにする。
- 既存の import payload 契約と `def_hash` を変えず、shared の payload encode ロジックを使って `payloadParam` を返せるようにする。

## 非目的

- 公開登録 `POST /api/public-tournaments` と `registry_hash` 重複判定基盤の再実装や拡張（#48）。
- クライアント側の公開状態保持、再試行導線、一覧 UI、import 導線接続（#50 / #51）。
- `import/confirm` 以降の検証、期限切れ判定、曲マスタ確認、既存大会マージ処理の変更。
- `def_hash`、既存 import payload、Web Locks、PWA 起動導線、OPFS/SQLite ローカル保存の仕様変更。
- 高度な検索条件、ランキング、人気順、編集/削除 API の追加。
- read API のためだけの D1 schema 再設計や Worker framework 導入。

## 変更点

- `packages/shared`
  - 公開カタログ read API の response 型と cursor 型を `public-catalog` 系の shared module に追加または拡張する。
  - 保存済み大会 payload から `payloadParam` を作るため、既存 `encodeTournamentPayload` を read API から安全に再利用できる export を整理する。
- `packages/public-catalog-api`
  - `GET /api/public-tournaments?q=&cursor=` を追加し、active な公開大会だけを新着順で返す。
  - `q` は trim 後に `name / owner / hashtag` の部分一致検索として扱い、空文字は無検索と同義にする。
  - ページングは `createdAt` と `publicId` を使う安定順序の opaque cursor 方式とし、同時刻データでも取りこぼし・重複を避ける。
  - `GET /api/public-tournaments/:publicId/payload` を追加し、対象大会が active の場合だけ `{ payloadParam }` を返す。
  - `payloadParam` は保存済み payload から shared の既存 encode ロジックで生成し、full URL ではなく import-confirm 用 query 値だけを返す。
  - #48 で導入される CORS / エラーレスポンス方針を流用し、新たな write endpoint や認証処理は増やさない。
- D1 access
  - 公開大会 repository に read 用メソッドを追加し、soft-delete / tombstone 済みデータを一覧・payload 両方から除外する。
  - 一覧レスポンスは `publicId, name, owner, hashtag, start, end, chartCount, createdAt` の最小項目だけを返し、payload 本体は含めない。
  - `publicId` 未存在または inactive な大会に対する payload 取得は 404 系で扱い、クライアントが存在しない公開大会を判別できるようにする。

## 影響範囲（ユーザー / データ / 互換性 / PWA / 保存 / 起動）

- ユーザー:
  - このブランチ単体では UI は変わらない。
  - 後続の #51 から使う公開一覧・検索・取込 API が利用可能になる。
- データ:
  - 既存 D1 の公開大会データを read するのみで、新規のローカル保存変更はない。
  - 一覧用メタと保存済み payload を読み出すが、payload 本体を一覧レスポンスへ展開しない。
- 互換性:
  - 既存 `def_hash` と import payload 契約は維持する。
  - 追加される契約は read API response と opaque cursor に閉じる。
- PWA:
  - Service Worker、COOP/COEP、single-tab 制御には触れない。
- 保存:
  - OPFS/SQLite のローカル保存方式に変更なし。
  - D1 schema は #48 由来を前提とし、本ブランチでは read API に不要な migration を増やさない。
- 起動:
  - web-app の startup/import routing には変更なし。
- 運用:
  - Worker route の追加と、公開一覧 API の CORS/Origin 設定確認が必要になる。

## 対象ファイル / 対象パッケージ

- 対象パッケージ:
  - `packages/shared`
  - `packages/public-catalog-api`
- 想定対象ファイル:
  - `packages/shared/src/index.ts`
  - `packages/shared/src/public-catalog.ts`
  - `packages/shared/src/public-catalog.test.ts`
  - `packages/public-catalog-api/src/index.ts`
  - `packages/public-catalog-api/src/repository/public-tournaments.ts`
  - `packages/public-catalog-api/src/pagination.ts`（新規、cursor helper が必要な場合）
  - `packages/public-catalog-api/src/*.test.ts`

### 変更スコープ固定

- `packages/web-app`、`packages/db`、`packages/pwa` は本ブランチでは変更しない。
- #48 の bootstrap や D1 schema 基盤が不足していても、本ブランチで write API まで巻き取らない。
- 親 Issue #47 で固定された `def_hash` 非変更、既存 import-confirm 導線流用、単一タブ凍結は前提として維持する。

## テスト観点

- list API:
  - `q` 未指定で新着順一覧が返り、`createdAt` 同値でも cursor 境界で順序が安定する。
  - `name / owner / hashtag` の部分一致検索で対象だけが返る。
  - 空文字や空白だけの `q` は無検索として扱われる。
  - tombstone / inactive データは一覧に出ない。
- payload API:
  - 既存公開大会に対して `{ payloadParam }` が返り、shared の `encodeTournamentPayload` と同じ値になる。
  - 存在しない `publicId`、削除済み `publicId` では 404 系になる。
  - `payloadParam` から組んだ `/import/confirm?p=...` が既存 import-confirm で decode 可能な契約を維持する。
- shared contract:
  - 追加する response 型 / cursor 型が API 実装と一致する。
  - 既存 `def_hash` helper や payload encode/decode の挙動は変わらない。
- 回帰:
  - #48 の write API 契約や CORS 方針を壊さない。
  - `packages/web-app` / `packages/db` / `packages/pwa` に不要な変更が混ざらない。

## ロールバック方針

- コードは commit 単位で `git revert` し、read API ルート、repository read helper、shared の response 型追加をまとめて戻す。
- 本ブランチでは D1 schema の新規 migration を持ち込まない前提のため、ロールバックは基本的にアプリコード差分の撤回だけで完結させる。
- 既存 write API やローカル import 処理には触れないため、ロールバック時の影響は公開 read API の停止に限定される。

## コミット分割計画

1. `plan`: `tasks/codex-feat-public-catalog-v1-read-api.md` を追加。
2. `shared-read-contract`: 公開一覧 / payload endpoint の response 型と必要な shared export を追加。
3. `list-api`: `GET /api/public-tournaments`、検索、cursor paging、repository read 処理を実装。
4. `payload-api-and-tests`: `GET /api/public-tournaments/:publicId/payload` と関連テストを追加し、最小検証を行う。
