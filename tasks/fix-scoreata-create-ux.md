# fix-scoreata-create-ux

## 目的
- スコアタ作成フローの入力負荷を下げるため、基本情報ステップから開催者入力を除去する。
- 譜面ステップで入力状態が変化するたびに発生する不要な自動スクロールを止め、操作中断を防ぐ。
- 確認ステップの大会IDコピーに即時フィードバック（Snackbar）を追加する。
- 作成保存時の `owner` を空文字で一貫保存し、`undefined` 混入を防ぐ。

## 非目的
- Multi-tab/Web Locks/Service Worker/COOP-COEP の挙動変更。
- DB schema 変更、マイグレーション追加。
- 作成フロー以外のUI改修（ホーム/詳細/提出/設定のデザイン変更）。
- 依存関係更新、フォーマットのみの一括変更。

## 変更点
- 基本情報ステップの開催者入力UI（ラベル/入力/エラー表示）を削除。
- 確認ステップの開催者表示行を削除。
- 未入力項目カウント・必須判定から開催者を除外。
- 作成時の保存入力 `owner` を常に `""` で構築。
- 譜面ステップのステータス変化連動スクロールを停止（無効譜面への明示スクロールは維持）。
- 大会IDコピー時にSnackbar成功/失敗通知を表示（2秒、自動クローズ、連打時再表示）。
- 譜面ステップの難易度ボタンをタップしやすいサイズへ調整（`min-height: 44px`, `min-width: 48px`、横gap拡大）。
- 確認画面に編集ショートカットを追加（基本情報カード右上アイコン→Step1、譜面一覧ヘッダ右上アイコン→Step2）。
- `owner=""` を許容するため shared バリデーション/正規化を調整。
- 関連ユニットテストを更新。

## 影響範囲
- ユーザー:
  - 作成ステップ1で開催者入力が不要になる。
  - 譜面入力中の意図しない自動スクロールが発生しなくなる。
  - 大会IDコピー時に成功/失敗が視覚的に分かる。
- データ:
  - 新規作成大会の `owner` は空文字で保存される。
  - 既存データは変更しない。
- 互換性:
  - ペイロード正規化/入力バリデーションで `owner=""` を受容する。
  - `owner` フィールド自体は維持し、型破壊はしない。

## 実装方針（対象ファイル単位）
- `packages/web-app/src/pages/CreateTournamentPage.tsx`
  - 開催者入力UIと確認表示の削除。
  - ステータス変化起因スクロールを抑止（依存関係調整）。
  - 大会IDコピーSnackbar状態と表示を追加。
  - def hash算出時の `owner` を空文字固定。
- `packages/web-app/src/styles.css`
  - 難易度ボタンの最小サイズと間隔を調整。
  - 確認画面の編集アイコン配置用スタイルを追加。
- `packages/web-app/src/pages/create-tournament-draft.ts`
  - 開催者必須バリデーション除外。
  - 未入力項目ラベル/完了カウントから開催者除外。
  - DB入力ビルダーで `owner: ""` を設定。
- `packages/web-app/src/pages/create-tournament-draft.test.ts`
  - 上記仕様変更に合わせて期待値を更新。
- `packages/shared/src/validation.ts`
  - `owner` 必須エラーを発生させないように調整（長さ上限は維持）。
- `packages/shared/src/normalize.ts`
  - `owner` 正規化で空文字を許容。
- `packages/shared/test/payload.test.ts`
  - `owner=""` 許容ケースの追加。
- `packages/shared/test/utils.test.ts`
  - `validateTournamentInput` の `owner` 任意化を確認するテスト追加。
- `packages/web-app/src/i18n/locales/ja.json`
- `packages/web-app/src/i18n/locales/en.json`
- `packages/web-app/src/i18n/locales/ko.json`
  - 大会IDコピーSnackbar文言と確認画面編集アイコンの文言追加（`create_tournament.confirm.*`）。

## テスト観点
- 基本情報:
  - 開催者入力が表示されない。
  - 未入力件数に開催者が含まれない。
  - 開催者未入力でエラーが出ず次ステップへ進める。
- 保存:
  - `buildCreateTournamentInput` が `owner: ""` を返す。
  - `owner=""` でも shared バリデーション/正規化でエラーにならない。
- 譜面:
  - 入力完了/未入力ステータス変化時にトップスクロールが走らない。
  - 「未入力の譜面へスクロール」(Next時) は維持される。
- 確認:
  - 大会IDコピー成功時にSnackbar表示（2秒）。
  - 失敗時に失敗Snackbar表示。
  - 連打で表示が破綻しない（再表示/タイマー更新）。
  - 基本情報カード右上の編集アイコン押下で基本情報ステップへ遷移する。
  - 譜面一覧セクション右上の編集アイコン押下で譜面ステップへ遷移する。
- 譜面:
  - 難易度ボタンが `44px` 以上の高さ・`48px` 以上の幅で表示される。
  - ボタンの横間隔が拡張され、誤タップしにくいこと。

## ロールバック方針
- 本タスクのコミットを順に revert し、以下を復元する。
  - 開催者入力UIと必須バリデーション。
  - 既存スクロール挙動。
  - 既存コピー処理（Snackbarなし）。
  - shared の owner 必須バリデーション/正規化。
- revert 後に shared/web-app の関連テストを再実行して整合を確認する。

## Commit Plan（コミット分割計画）
1. `docs(tasks): add plan for create flow ux adjustments`
2. `feat(web-app): remove owner field from create flow and add copy snackbar`
3. `feat(shared): allow empty owner for tournament validation/normalization`
4. `test: update create draft/shared tests for owner-empty behavior and copy feedback paths`
5. `fix(web-app): add confirm-step edit shortcuts to basic info and chart list sections`
