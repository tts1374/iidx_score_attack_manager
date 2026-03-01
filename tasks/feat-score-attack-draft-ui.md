# Task Plan: feat-score-attack-draft-ui

## 目的
- スコアタ作成フローに Draft 復元を導入し、誤操作や中断時の再開を可能にする。
- 作成フローのステップUIと進捗表示をスマホで省スペース化する。
- 入力ラベル・確認画面表示・最終確定導線を整理して可読性を上げる。
- スコアタ詳細画面で大会ID表示を明確化し、デバッグ情報の露出条件を整理する。
- 既存スコアタのコピー導線を詳細画面3点メニューに追加する。

## 非目的
- Web Locks / Single-tab invariant の変更。
- Service Worker / COOP-COEP / crossOriginIsolated の変更。
- DB schema / payload 仕様 / def_hash 算出ロジックの変更。
- 確認画面以外での SP/DP・難易度表記の統一。
- 依存関係更新・CI/CD変更。

## 変更点
- Draft 保存キー `draft:score_attack:create` を利用した作成Draft保存/復元/削除を実装。
- 作成画面起動時の Draft 復元ダイアログを追加。
- 詳細画面からの「このスコアタをコピー」導線を追加し、Draft 衝突時ダイアログを追加。
- 作成画面のステップUIを圧縮し、ステップ直下に1行状態表示を追加。
- 作成画面の入力ラベルをチップ風から通常ラベルに変更。
- 確認画面の譜面カード表示を `譜面N / 曲名 / SP ANOTHER 10` 形式に変更。
- 最終確認で不可逆操作注意文を表示し、確定ボタン文言を固定。
- 詳細画面で大会ID（短縮表示 + コピー）を期間下に表示。
- 詳細画面でデバッグモード時のみ「詳細情報」折りたたみ表示を追加（`def_hash`, `source_tournament_uuid`）。

## 影響範囲
- ユーザー:
  - 作成フローの起動時/コピー時に Draft 選択ダイアログが表示される。
  - 作成画面の見た目（ステップ・ラベル・確認表示・確定導線）が変わる。
  - 詳細画面に大会ID表示とコピー導線が追加される。
- データ:
  - localStorage に `draft:score_attack:create` を新規使用（永続大会一覧データとは分離）。
  - DB保存形式や既存大会データには変更なし。
- 互換性:
  - アプリの既存大会作成/詳細閲覧機能は維持。
  - Draft が壊れている場合は無視して新規作成にフォールバックする。

## 実装方針（対象ファイル単位）
- `packages/web-app/src/pages/create-tournament-draft.ts`
  - Draft 直列化/復元のバリデーション補助を追加。
  - 譜面カード未完了件数の算出ロジックを追加。
- `packages/web-app/src/App.tsx`
  - Draft 保存/復元/削除ロジックを追加。
  - 作成画面起動時ダイアログとコピー時衝突ダイアログの状態管理を追加。
  - 詳細メニューに「このスコアタをコピー」を追加。
  - 作成確定成功時の Draft 削除を追加。
- `packages/web-app/src/pages/CreateTournamentPage.tsx`
  - ステップUI、状態表示、ラベル表示、確認画面表示、最終注意文・確定ボタン文言を変更。
- `packages/web-app/src/pages/TournamentDetailPage.tsx`
  - 期間下の大会ID表示（短縮 + コピー）と、デバッグモード時の折りたたみ詳細表示を追加。
- `packages/web-app/src/styles.css`
  - 作成画面/詳細画面の新UIに必要な最小スタイル差分のみ追加・調整。
- `packages/web-app/src/i18n/locales/ja.json`
- `packages/web-app/src/i18n/locales/en.json`
- `packages/web-app/src/i18n/locales/ko.json`
  - 文言キーを追加・更新。
- `packages/web-app/src/pages/create-tournament-draft.test.ts`
- `packages/web-app/src/pages/TournamentDetailPage.test.tsx`
  - 変更に応じたテスト更新/追加。

## テスト観点
- Draft 未存在時: 作成開始で新規フォームが開く。
- Draft 存在時（作成開始）:
  - 「続きから再開」で復元される。
  - 「破棄して新規作成」で Draft 削除後に新規フォームとなる。
- Draft 存在時（詳細からコピー）:
  - 「続きから再開」で既存Draft優先。
  - 「コピーで上書き」でコピー内容に置換。
  - 「キャンセル」で遷移しない。
- 作成確定成功時に Draft が削除される。
- 作成画面:
  - 進捗ボックスが消え、ステップ直下1行状態表示になる。
  - ラベルが通常テキスト表示になる。
  - 確認画面譜面表示が `SP ANOTHER 10` 形式（Lvなし、スラッシュなし）になる。
  - 注意文「確定後は内容を編集できません。」が表示される。
- 詳細画面:
  - 大会IDが短縮表示 + コピー可能。
  - デバッグモードOFFでは `def_hash` 非表示。
  - デバッグモードONで「詳細情報」折りたたみに `def_hash` と `source_tournament_uuid` が表示される。

## ロールバック方針
- 本タスク差分を丸ごと revert し、`draft:score_attack:create` の参照を削除して旧UI/旧導線に戻す。
- ローカルストレージキーはアプリ起動時に参照されないため、revert 後の残存キーは無害。

## Commit Plan
1. `plan`: tasks ファイル追加（本ファイル）。
2. `create-draft-core`: Draft 保存/復元・衝突解決ロジック（`App.tsx` と draft helper）。
3. `create-ui`: 作成画面UI再設計（`CreateTournamentPage.tsx`, `styles.css`, i18n）。
4. `detail-ui-copy`: 詳細画面大会ID表示・詳細情報折りたたみ・コピー導線（`TournamentDetailPage.tsx`, `App.tsx`, i18n）。
5. `tests`: テスト更新/追加。

