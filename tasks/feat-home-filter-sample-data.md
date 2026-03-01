# Plan: feat/home-filter-sample-data

## 目的

- スコアタ一覧フィルタ確認用に、手作業なしでサンプル大会データを投入できるスクリプトを追加する。
- `state(active/upcoming/ended)` / `category(pending/completed)` / `attr(imported/created/send-waiting)` を横断確認できる最小構成を提供する。
- サンプル投入後、スコアタ詳細画面/提出画面に遷移できるデータ整合性（曲解決可能な chart_id）を担保する。

## 非目的

- 本番導線（通常ユーザーUI）に新ボタンを追加しない。
- DB schema変更・マイグレーションは行わない。
- Web Locks / Service Worker / import仕様の本体ロジックは変更しない。

## 変更点

- デバッグ用のサンプルデータ投入モジュールを追加。
  - 既存サンプルの削除（対象はハッシュタグ一致のみ）
  - created/imported を混在した大会データ投入
  - evidence登録（shared/unshared）により send-waiting 状態を再現
  - 曲マスタから有効な chart_id を収集して割り当て（固定ダミーIDを廃止）
  - seed中のみ AppDatabase の「今日」判定を一時的に巻き戻し、ended サンプル投入後に復元
  - 生成後に detail データを検証し、resolve issue が残る場合はエラーにする
- `App.tsx` からデバッグモード時のみ `window.__IIDX_DEBUG__` API を公開。
  - `seedHomeFilterSamples()`
  - `clearHomeFilterSamples()`
- README に実行手順を追記。

## 影響範囲（ユーザー / データ / 互換性）

- ユーザー:
  - 通常UIへの影響なし（デバッグモード + DevTools console 限定）。
- データ:
  - ローカルDBにサンプル大会/evidenceを追加・削除する。
  - 削除対象はサンプル識別用ハッシュタグに限定。
- 互換性:
  - 永続化フォーマット・既存大会データ構造は変更しない。

## 実装方針（対象ファイル単位）

- `packages/web-app/src/debug/home-filter-sample-seed.ts`（新規）
  - サンプル定義生成、投入、削除、debug API 登録処理を実装。
- `packages/web-app/src/App.tsx`
  - デバッグモード時の API 登録/解除 effect を追加。
- `README.md`
  - デバッグコンソール実行手順を追加。
- `packages/web-app/src/debug/home-filter-sample-seed.test.ts`（新規）
  - サンプル定義（状態・属性の網羅）と日付範囲の基本検証を追加。
  - `seedHomeFilterSamples()` が detail/submit フロー前提を満たすこと（resolveIssueなし、shared/unshared/no-evidenceの混在）を検証。
  - 保証条件不成立時の fail-fast（曲マスタ不足、detail未解決）を検証。

### 変更スコープ固定

- 上記4ファイル + 本 tasks ファイルのみ変更。

## テスト観点

- `seedHomeFilterSamples()` 実行後に以下が成立すること。
  - active/upcoming/ended すべて存在
  - imported/created すべて存在
  - pending/completed すべて存在
  - send-waiting > 0 の大会が存在
- サンプル大会の detail 取得時に `resolveIssue` が発生しないこと（提出画面遷移可能条件）。
- `clearHomeFilterSamples()` でサンプル識別ハッシュタグの大会のみ削除されること。
- 型チェック・既存テストが通ること。

## ロールバック方針

- 追加した debug module と App 側 effect をコミット単位で revert する。
- README 追記は別コミットで revert 可能に分離する。

## Commit Plan（コミット分割計画）

1. サンプルデータ投入モジュール + 単体テスト追加。
2. App への debug API 連携。
3. README への手順追記。

## 実行チェックリスト

- [x] 変更が宣言スコープ内に限定されていることを確認
- [x] `pnpm --filter @iidx/web-app lint`
- [x] `pnpm --filter @iidx/web-app test -- --run src/debug/home-filter-sample-seed.test.ts`
- [x] `pnpm lint`
- [x] `pnpm test`
- [x] `git diff` で無関係差分がないことを確認

Validation note:
- `pnpm --filter @iidx/web-app test -- --run ...` は既存 package script の都合で全テスト実行になったが、全件pass。
- 追加後の最新実行でも `pnpm lint` / `pnpm test`（workspace全体）ともに pass。
