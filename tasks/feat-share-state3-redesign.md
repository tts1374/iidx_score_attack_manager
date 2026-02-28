# Plan: feat/share-state3-redesign

## 目的

- スコアタ詳細の提出導線を「送信」から「共有」に統一する。
- 譜面状態を `未登録 / 未共有 / 共有済` の3状態で明確化する。
- 進捗表示を登録率ではなく状態分布（3分割バー）に再設計する。
- 共有完了後に `needs_send` を自動更新し、直前操作のみ UNDO 可能にする。

## 非目的

- DB スキーマ変更（`user_version` 変更、マイグレーション追加）は行わない。
- Single-tab（Web Locks）関連ロジックは変更しない。
- 大会定義共有（QR）画像生成ロジック自体の仕様変更は行わない。
- SubmitEvidencePage など詳細ページ外のUX刷新は行わない。

## 変更点

- 用語置換: UI文言を「送信」系から「共有」系へ更新（内部名 `needs_send` は維持）。
- 譜面カード状態の導出を3状態に再定義し、バッジ表示を単一化。
- 譜面属性表示をバッジから1行テキストに簡素化（`DP/SP ・ 難易度 レベル`、難易度側のみ文字色）。
- 進捗エリアを3分割状態バー + 横並び件数表示へ置換。
- 下部固定CTAを単一ボタン「共有する（n）」に統一（`n=未共有件数`、0件で無効）。
- 提出共有UIを確認ダイアログ化（本文 + キャンセル + 共有する）し、冗長導線を排除。
- 共有処理を Web Share files 対応有無で内部分岐し、非対応時は保存+コピーへフォールバック。
- 共有成功時のみ `needs_send=false` を永続化し、UNDOで直前操作分を `needs_send=true` に戻せるようにする。
- 共有結果通知は下部スナックバー（3〜5秒）に統一し、UNDOを同一通知上で提供する。
- 差し替え時に `needs_send=true` となる既存挙動（未共有復帰）を維持。
- ヘッダの大会定義共有ボタンを「大会を共有（QR）」文言で継続配置。

## 影響範囲

- ユーザー影響:
  - 詳細画面の状態表示、進捗表示、下部CTA、提出共有モーダルの操作が変更される。
  - 共有成功後は手動確定不要で自動的に共有済へ遷移し、短時間UNDO可能になる。
- データ影響:
  - `needs_send` 更新タイミングのみ変更（共有成功時/UNDO時）。
  - スキーマ、既存レコード形式、`update_seq` 運用は不変。
- 互換性:
  - 既存DBとの互換性維持（マイグレーションなし）。
  - Web Share API 非対応環境でも保存+コピーで操作継続可能。

## 実装方針（対象ファイル単位）

- `packages/web-app/src/pages/TournamentDetailPage.tsx`
  - 状態導出ロジック（未登録/未共有/共有済）を追加。
  - 3分割バー表示データを計算し、従来進捗バーを置換。
  - 譜面カードバッジ表示を単一化し、属性バッジ（DP/SP・難易度・Lv）を撤去してテキスト表示に置換。
  - 下部CTA文言/有効条件を変更。
  - submit dialog を確認ダイアログ（キャンセル/共有する）へ変更。
  - 共有処理を統合し、成功時の `needs_send=false` 更新 + UNDO処理を追加。
  - 共有後通知をスナックバー化し、表示秒数を3〜5秒に調整。
  - 共有（QR）ボタン文言と補助説明を調整。
- `packages/db/src/app-db.ts`
  - `needs_send=true` へ戻すための更新メソッドを追加（UNDO専用）。
  - 既存 `markEvidenceSendCompleted` と同等の安全条件（`file_deleted=0`, `update_seq>0`）を維持。
- `packages/web-app/src/styles.css`
  - 3状態バッジ、3分割バー、件数表示、下部CTAの見た目を追加/調整。
  - 彩度抑制トーンで配色調整。
- `packages/web-app/src/i18n/locales/ja.json`
  - `tournament_detail` 配下の提出共有関連文言を新仕様へ更新。
- `packages/web-app/src/i18n/locales/en.json`
  - 同キーの英語文言を同期更新。
- `packages/web-app/src/i18n/locales/ko.json`
  - 同キーの韓国語文言を同期更新。
- `packages/web-app/src/pages/TournamentDetailPage.test.tsx`
  - 新UI/新遷移（3状態、CTA、モーダル単一ボタン、自動確定+UNDO）に合わせてテスト更新。

## テスト観点

- 譜面カード:
  - 各譜面でバッジが必ず1つのみ表示される。
  - `evidenceなし or file_deleted=true` は未登録、`needs_send=true` は未共有、`needs_send=false` は共有済。
  - DP/SP と 難易度+レベルが1行テキスト（`DP ・ ANOTHER 10`）で表示され、属性背景バッジが存在しない。
- 進捗表示:
  - 3分割バー比率が `共有済/未共有/未登録` 件数に一致する。
  - 件数表示が横並びで表示される。
- CTA/モーダル:
  - 下部ボタンは1つのみ、未共有0件で無効。
  - 提出共有は確認ダイアログ（本文 + キャンセル + 共有する）で表示される。
- 共有処理:
  - Web Share files 対応時は `navigator.share({ files, text })` が呼ばれる。
  - 非対応時は画像保存 + クリップボードコピーのフォールバックが動作する。
  - 成功時のみ `needs_send=false` が反映される。
  - 通知はスナックバー表示となり、UNDOで直前共有分のみ `needs_send=true` に戻る。
- 回帰:
  - 差し替え保存後は未共有に戻る（既存 `upsertEvidenceMetadata` 挙動を維持）。
  - 大会定義共有（QR）ボタンがヘッダに残る。

## ロールバック方針

- UIのみ不具合の場合:
  - `TournamentDetailPage.tsx` / `styles.css` / i18n差分を丸ごと戻す。
- `needs_send` 更新不具合の場合:
  - `app-db.ts` の追加メソッド呼び出しを戻し、従来の手動完了フローへ復帰。
- ロールバック単位:
  - 共有モーダル再設計
  - 3状態表示/3分割バー
  - 自動確定+UNDO
  を論理単位で分離して戻せるようにコミット分割する。

## Commit Plan

1. detailページの状態導出・3分割バー・カードバッジ/CTA変更。
2. 提出共有モーダル1ボタン化と共有分岐ロジック統合（成功時自動確定含む）。
3. DBの `needs_send` 復帰メソッド追加とUNDO連携。
4. i18n（ja/en/ko）文言更新。
5. テスト更新と検証（lint/test/build、差分スコープ確認）。

## Scope Declaration

- 変更対象は以下に限定する。
  - `tasks/feat-share-state3-redesign.md`
  - `packages/web-app/src/pages/TournamentDetailPage.tsx`
  - `packages/web-app/src/pages/TournamentDetailPage.test.tsx`
  - `packages/web-app/src/styles.css`
  - `packages/web-app/src/i18n/locales/ja.json`
  - `packages/web-app/src/i18n/locales/en.json`
  - `packages/web-app/src/i18n/locales/ko.json`
  - `packages/db/src/app-db.ts`
- 上記以外のファイル変更は禁止（必要が出た場合は本tasksを更新してから実施）。
