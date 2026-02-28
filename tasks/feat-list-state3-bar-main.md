# Plan: feat/list-state3-bar-main

## 作業コンテキスト

- Worktree: `C:\work\score_attack_manager\iidx_score_attack_manager-feat-list-state3-bar-main`
- BASE_SHA: `f3316ce76c7b1768ce10512558ea241baec807f4`

## 目的

- スコアタ一覧カードの状態語彙を詳細画面基準へ統一する。
- 一覧カードの進捗表示を「登録率」から「状態3分割バー」へ置換する。
- 既存カードレイアウトを維持し、最小差分で整合させる。

## 非目的

- スコアタ詳細画面のUI/ロジック変更
- フィルター仕様・並び順ロジックの再設計
- DBスキーマ/永続化形式/API仕様変更
- Service Worker / Web Locks / import/export / 起動導線の変更

## 変更点

- 一覧カードの `登録 x/y (z%)` 表示を削除し、`未共有 n` 表示へ置換する（`n = sendWaitingCount`）。
- 一覧カードの青単色進捗バーを廃止し、`共有済 / 未共有 / 未登録` の3分割バーへ置換する。
- 一覧カード右側の状態バッジを1つのみ表示し、文言を `未共有 / 未登録 / 共有済` に統一する。
- バッジ優先順位を `未共有 > 未登録 > 共有済` とする。
- ホーム一覧カードで使用する翻訳キー（ja/en/ko）を更新する。
- Homeページの表示テストを新仕様に更新する。

## 影響範囲

- ユーザー影響:
  - 一覧カードの進捗表示が登録率ベースから状態分布ベースへ変更される。
  - 一覧カード上の状態語彙が `未登録 / 未共有 / 共有済` に揃う。
- データ影響:
  - なし（既存 `chartCount/submittedCount/sendWaitingCount/pendingCount` の再利用のみ）。
- 互換性影響:
  - なし（DB・共有payload・import/export互換性は不変）。

## 実装方針（対象ファイル単位）

- `packages/web-app/src/pages/HomePage.tsx`
  - 3状態件数（done / sendWaiting / unregistered）と割合を算出。
  - 表示を `未共有 n` と1バッジに調整。
  - 3分割バーDOMへ置換（バー内テキストなし）。
- `packages/web-app/src/styles.css`
  - 3分割バー用スタイル追加。
  - 一覧カード用バッジ配色を `未共有=黄, 未登録=灰, 共有済=緑` に調整。
- `packages/web-app/src/i18n/locales/ja.json`
  - Homeカード関連の文言を統一語彙へ更新。
- `packages/web-app/src/i18n/locales/en.json`
  - 同上（英語）。
- `packages/web-app/src/i18n/locales/ko.json`
  - 同上（韓国語）。
- `packages/web-app/src/pages/HomePage.test.tsx`
  - 進捗表示/バッジ表示の期待値を新仕様へ更新。

## テスト観点

- 青単色の登録率バーが存在しないこと。
- 3分割バーが正しい割合で表示されること（合計100%）。
- `登録 x/y (z%)` 表記が消えていること。
- 状態バッジが1つのみで、優先順位どおりになること。
- `未共有 n` が即時判別できること（`n=0` では非表示または薄表示）。

## ロールバック方針

- 本タスクコミットを `git revert` で巻き戻せる粒度で分割する。
- 巻き戻し時は Home一覧カード表示のみ旧仕様へ復帰し、他機能は変更しない。

## Commit Plan

1. Home一覧カードロジック/UIを状態3分割バー仕様へ変更（`HomePage.tsx`）。
2. Home一覧カードのスタイル更新と表示テスト更新を同一コミットで反映（`styles.css` + `HomePage.test.tsx`）。
3. Home一覧カード文言を更新（`ja/en/ko` locales）。

実績メモ:
- 当初はスタイルとテストを分離予定だったが、3分割バーのDOM/CSS変更とテスト期待値が密結合のため、差分追跡性を優先して同一コミットに統合した。
