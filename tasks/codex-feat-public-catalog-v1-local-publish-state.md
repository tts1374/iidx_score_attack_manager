# Plan: codex/feat-public-catalog-v1-local-publish-state

## 実行コンテキスト（予定）

- worktree: `C:/work/score_attack_manager/iidx_score_attack_manager-codex-public-catalog-v1-local-publish-state`
- branch: `codex/feat-public-catalog-v1-local-publish-state`
- BASE_SHA: `0e2d7d0c26b65966b518fcaacdcf56d8bb977ae1`
- 実装開始条件: #48 で定義する `POST /api/public-tournaments` の request/response contract と公開 API の base URL 方針が main に取り込まれているか、同等差分を base に含むこと。本ブランチで server API や CORS を再実装しない。

## 目的

- ローカル大会作成後に公開登録 API を別処理で試行し、公開失敗時も大会自体は保存成功のまま維持する。
- ローカル保存に `publicId`、公開状態、最終公開試行時刻を追加し、`created / duplicate / retryable failure` を UI へ反映できるようにする。
- 既存画面の範囲で公開状態表示と再試行導線を追加し、手動再試行で状態を更新できるようにする。

## 非目的

- 公開登録 API / D1 / CORS / abuse 対策の実装や拡張（#48）。
- 公開一覧・検索・取込用 read API（#49）。
- 匿名公開カタログ一覧 UI や import 導線の追加（#51）。
- startup sequence、Service Worker、Web Locks、BroadcastChannel 委譲経路の変更。
- `def_hash`、既存 import/export payload、既存 import-confirm フローの変更。
- 自動バックグラウンド再送キューや起動時の再試行処理追加。

## 変更点

- `packages/db`
  - `tournaments` に公開連携用の加算列を追加する。
    - `public_id`（nullable）
    - `public_status`（`unpublished | publishing | published | retryable` を想定した文字列、default は `unpublished`）
    - `last_publish_attempt_at`（nullable）
  - `user_version` を更新し、既存 DB からの migration で追加列が安全に生えるようにする。
  - `TournamentListItem` / `TournamentDetailItem` に公開状態の read model を追加する。
  - `createTournament` でローカル作成直後の初期状態を `publishing` として保存できるようにし、公開 API 実行結果を反映する更新メソッドを追加する。
  - `duplicate` 応答は `published + publicId` として保存し、新規行を増やさず既存大会に紐づける。
  - 失敗時は `retryable` と最終試行時刻だけを保持し、詳細なエラー payload 永続化は持ち込まない。
- `packages/web-app`
  - 公開 API の base URL を解決する runtime config / client module を追加し、既存の song master 設定と同程度の最小構成で扱う。
  - 大会作成成功後のフローを「ローカル保存完了 → 公開登録試行 → 成功/失敗に応じて状態更新」に分離し、公開 API 失敗で create を失敗扱いにしない。
  - 作成完了後は従来どおり home に戻しつつ、公開登録の結果に応じて list/detail の再読込と toast 更新を行う。
  - 公開状態表示は既存画面の最小差分として以下に追加する。
    - Home の大会カード: `公開済み / 公開中 / 未公開(再試行可)` を判別できる補助表示
    - Detail 画面: 状態表示、最終公開試行時刻、再試行ボタン
  - 再試行導線は detail 画面からのみ提供し、home では表示中心にとどめて導線を増やしすぎない。
  - imported tournament や server contract 未解決状態では公開操作を出さず、既存共有導線と混線させない。
  - 文言は既存 i18n locale に追加し、公開状態・再試行中・重複解決時の通知を翻訳キーで管理する。
- 実装境界
  - `packages/shared` は #48 が公開 client contract を export している場合の import 利用にとどめ、#50 のために新たな shared 契約は増やさない。
  - `packages/pwa` は変更しない。

## 影響範囲（ユーザー / データ / 互換性 / PWA / 保存 / 起動）

- ユーザー:
  - ローカル作成直後に自動で公開登録が試行される。
  - 公開失敗でも大会は作成済みのまま残り、detail から再試行できる。
  - home/detail で公開状態が識別できる。
- データ:
  - ローカル SQLite の `tournaments` に公開状態列が増える。
  - エビデンス、提出状態、公開カタログ本体データの保存方式は変えない。
- 互換性:
  - `def_hash`、import payload、既存 tournament UUID 契約は維持する。
  - 追加するのはローカル公開状態列と web-app 内の API client 接続のみ。
- PWA:
  - Service Worker、COOP/COEP、single-tab 制御には触れない。
- 保存:
  - OPFS/SQLite の既存保存基盤は維持しつつ、`tournaments` テーブルへ加算変更のみ行う。
  - 新規列は nullable/default 付きに寄せ、既存データの読込を壊さない。
- 起動:
  - startup sequence や起動時再試行は追加しない。create 操作時と手動 retry 時だけ API を呼ぶ。

## 対象ファイル / 対象パッケージ

- 対象パッケージ:
  - `packages/db`
  - `packages/web-app`
- 想定対象ファイル:
  - `packages/db/src/schema.ts`
  - `packages/db/src/models.ts`
  - `packages/db/src/app-db.ts`
  - `packages/db/test/schema.test.ts`
  - `packages/db/test/app-db-publication.test.ts`（新規、必要なら）
  - `packages/web-app/src/App.tsx`
  - `packages/web-app/src/components/TournamentSummaryCard.tsx`
  - `packages/web-app/src/pages/HomePage.tsx`
  - `packages/web-app/src/pages/HomePage.test.tsx`
  - `packages/web-app/src/pages/TournamentDetailPage.tsx`
  - `packages/web-app/src/pages/TournamentDetailPage.test.tsx`
  - `packages/web-app/src/services/public-catalog-config.ts`（新規）
  - `packages/web-app/src/services/public-catalog-client.ts`（新規）
  - `packages/web-app/src/vite-env.d.ts`
  - `packages/web-app/.env.example`
  - `packages/web-app/src/i18n/locales/ja.json`
  - `packages/web-app/src/i18n/locales/en.json`
  - `packages/web-app/src/i18n/locales/ko.json`

### 変更スコープ固定

- `packages/shared` は #48 の client contract import 調整が必要な場合を除き変更しない。
- `packages/pwa`、`public/sw.js`、import routing、Web Locks 取得フローには触れない。
- 公開一覧 UI や read API 依存の新ルートはこのブランチに含めない。

## テスト観点

- DB migration:
  - 既存 DB に migration を適用しても追加列が作成され、`user_version` が想定値へ更新される。
  - 既存大会は `public_status = unpublished`、`public_id = null`、`last_publish_attempt_at = null` で読める。
- DB read/write:
  - `createTournament` 直後に `publishing` を保持できる。
  - `markTournamentPublished(publicId)` 相当の更新で `published` と `publicId` が保存される。
  - `markTournamentPublishRetryable()` 相当の更新で `retryable` と最終試行時刻が保存される。
  - list/detail 取得で公開状態が UI 層へ渡る。
- Create flow:
  - 公開 API が 5xx / network failure でも大会作成自体は成功し、home へ戻る。
  - `duplicate` 応答時は `published` 扱いとなり、重複ローカル行は発生しない。
  - 公開登録の成功/失敗後に list/detail が再読込され、表示が更新される。
- UI:
  - home card で公開状態が判別できる。
  - detail 画面で公開状態と再試行ボタンが表示される。
  - retry 実行中は二重送信を防ぎ、成功後は `publicId` / 状態が更新される。
  - imported tournament では不要な公開 action が出ない。
- Runtime config:
  - `VITE_PUBLIC_CATALOG_API_BASE_URL` が未設定/不正な場合の扱いを明確にし、少なくとも dev/test で暴発しない。
- 回帰:
  - 既存の共有（QR）導線、detail 画面の提出フロー、home 一覧ソート/フィルタを壊さない。
  - `def_hash` や import/export 契約に差分がない。

## ロールバック方針

- コードは commit 単位で `git revert` し、db の公開状態列対応と web-app の公開 UI / client 接続をまとめて戻す。
- DB 変更は加算列 + default/null 設計に寄せ、ロールバック時に列が残っても旧コードが読める形を維持する。
- startup/PWA/import routing に触れないため、ロールバック影響は公開状態表示と再試行機能に限定される。

## コミット分割計画

1. `plan`: `tasks/codex-feat-public-catalog-v1-local-publish-state.md` を追加。
2. `db-publication-state`: `packages/db` の schema / migration / models / app-db に公開状態保持を追加し、関連テストを整える。
3. `web-publish-client`: `packages/web-app` に runtime config / API client と create 後 publish 試行の接続を追加する。
4. `web-publish-ui`: home/detail の公開状態表示、detail の retry 導線、i18n、関連テストを追加する。
