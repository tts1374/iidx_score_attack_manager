# Plan: feat/dark-theme-os-follow

## 目的

- OS設定（`prefers-color-scheme`）のみに追従するダークテーマを導入する。
- 背景をダークグレー基調にし、カード境界は明るいborderで維持する。
- shadow依存を弱め、surfaceの明度差で階層を表現する。
- difficulty色を active変数経由で切り替え、ダーク時に `--difficulty-*-dark` を適用する。
- 進捗バー（特に未登録色）がダーク背景に埋もれないようにする。

## 非目的

- 手動テーマトグルUIの追加やテーマ永続化は行わない。
- Service Worker / Web Locks / import-export / データ永続化仕様は変更しない。
- DBスキーマ・マイグレーション・依存関係（lockfile含む）は変更しない。
- 共有画像生成（canvas）の配色デザイン刷新は行わない。

## 変更点

- `styles.css` に役割ベースのトークン（背景/面/文字/枠線/影/フォーカス/状態）を追加。
- `:root` の `background-color` / `color` をトークン参照へ変更し、`color-scheme: light dark` を設定。
- `@media (prefers-color-scheme: dark)` でダークトークンを上書きし、OS追従のみでテーマ切替。
- difficulty用に `--difficulty-*-active` を追加し、コンポーネント側参照を active変数へ統一。
- 進捗バー関連（track/未登録/未共有/共有済）の色指定をトークン化し、ダーク時の明度を調整。
- 主要UIのborder/shadow/focus/muted/hover色をトークン参照に寄せる。
- TSX内のUI用直色（`App.tsx` / `SettingsPage.tsx` / `TournamentDetailPage.tsx`）をトークン参照へ置換。
- `difficultyColor` のUI利用を active変数参照へ更新し、canvas用途は別関数で既存挙動を維持。
- レビュー追補として、一覧フィルタBottomSheet（Drawer）のダーク時背景・divider・セグメント選択色・リセットリンク・backdropを最小修正する。
- レビュー追補として、一覧上部の適用チップ（特に検索チップ）のダーク時コントラストを最小修正する。
- レビュー追補として、一覧フィルタ内「送信待ちあり」チェックボックス未選択色のダーク時コントラストを最小修正する。
- レビュー追補として、設定画面（MUI Card/Accordion/TextField/Switch）のダーク時配色をトークン基準で最小修正する。
- レビュー追補として、一覧の3点リーダメニュー/優先度プルダウン（MUI Menu/MenuItem）のダーク時背景・文字・選択/hover色をトークン基準で最小修正する。
- レビュー追補として、一覧検索のプレースホルダー文字色をダーク時に埋もれない明度へ調整する。
- レビュー追補として、設定画面の補助文言（`text.secondary`）と灰系アイコン/Chip（最新確認未実施など）の色をダーク時に埋もれない明度へ調整する。
- レビュー追補として、QR取込モーダル（`ImportQrScannerDialog`）のDialog背景/文字/区切り線をダークテーマのトークン配色へ調整する。
- レビュー追補として、スコアタ作成の期間表示（日付入力値/期間文字列/カレンダーアイコン）をダーク時に埋もれない明度へ調整する。
- レビュー追補として、スコアタ作成の譜面ステップ（曲名入力/曲名プルダウン候補/難易度ボタン）をダーク時の配色に調整する。
- レビュー追補として、大会共有モーダル（QR共有Dialog）の背景/文字/区切り線/入力系コンポーネントをダークテーマ配色へ調整する。
- レビュー追補として、提出モーダル（提出確認Dialog）の背景/文字/区切り線をダークテーマ配色へ調整する。
- レビュー追補として、設定画面のデバッグ入口（アプリ版本体タップ）の視覚的ヒントを抑え、ダーク時に入口が露見しにくい表示へ調整する。

## 影響範囲

- ユーザー影響:
  - OSをダークにすると自動でダークテーマへ切り替わる。
  - カード/入力/モーダルの視認性（border、focus、muted、hover）が向上する。
  - 進捗バーの未登録色が背景から識別しやすくなる。
- データ影響:
  - なし（表示層のみ）。
- 互換性:
  - 手動テーマ切替機能は追加しないため既存操作フローを維持。
  - difficulty色は active変数導入後も既存クラス名を維持する。

## 実装方針（対象ファイル単位）

- `packages/web-app/src/styles.css`
  - 役割トークンと状態トークンを `:root` に追加。
  - `@media (prefers-color-scheme: dark)` でダーク値を定義。
  - 既存の背景/文字/border/shadow/focus/進捗バー/difficulty参照をトークンへ置換。
  - ダーク時のshadowを弱め、surface差が出るよう背景色を調整。
- `packages/web-app/src/utils/iidx.ts`
  - UI用 difficultyカラーを `var(--difficulty-*-active)` ベースで返すように変更。
  - canvas等の固定色用途向けに既存HEXを返す別関数を追加。
- `packages/web-app/src/pages/TournamentDetailPage.tsx`
  - canvas描画側で新しいHEX返却関数を使用。
  - shareダイアログ内の直色 `sx` をトークン参照へ置換。
- `packages/web-app/src/pages/SettingsPage.tsx`
  - card/accordion/danger枠の `sx` 直色をトークン参照へ置換。
  - デバッグ入口用のバージョン値タップ領域に、選択・フォーカス・背景変化を抑える `sx` を適用する。
- `packages/web-app/src/App.tsx`
  - ホーム検索ボックス `sx` の直色をトークン参照へ置換。
- `packages/web-app/src/components/ImportQrScannerDialog.tsx`
  - Dialog (`Paper`/`Content`/`Actions`) の配色をトークン参照へ最小修正する。
- `packages/web-app/src/pages/CreateTournamentPage.tsx`
  - 期間表示テキストに専用クラスを追加し、ダーク時の可読性を担保する。
  - 曲名Autocompleteのポップアップクラスと難易度ボタン配色をダーク向けトークン参照へ調整する。
- `packages/web-app/src/pages/TournamentDetailPage.tsx`
  - 共有Dialogにクラスと最小 `sx` を追加し、ダーク用スタイル適用ポイントを定義する。
  - 提出Dialogにもダーク用クラスと最小 `sx` を追加し、共有Dialogと同等の配色へ揃える。

## テスト観点

- OSダーク時:
  - `body` 背景が完全黒ではなくダークグレーで表示される。
  - カード/入力/画像/QR境界が視認できる。
  - mutedテキストとfocusリングが視認可能。
  - 一覧の3点メニューと優先度プルダウンが白背景/黒文字のまま残らず、ダーク背景と十分な文字コントラストになる。
  - 一覧検索入力のプレースホルダーがダーク時でも判読可能な明度で表示される。
  - 設定画面の補助文言、セレクト矢印、ステータスChip（最新確認未実施）がダーク時でも判読可能な明度で表示される。
  - QR取込モーダルが白背景のまま残らず、ダーク背景・補助文言・境界線が判読可能な明度で表示される。
  - スコアタ作成の期間（日付入力の値/アイコン/期間文字列）がダーク時でも判読可能な明度で表示される。
  - スコアタ作成の譜面ステップで、曲名候補のプルダウンが白背景のまま残らず、難易度ボタンの非選択背景がダーク面に馴染む。
  - 大会共有モーダルが白背景のまま残らず、モーダル内の本文・区切り線・入力系がダーク配色で視認できる。
  - 提出モーダルが白背景のまま残らず、本文・補助文言・区切り線がダーク配色で視認できる。
  - 設定画面のアプリ版本体表示で、デバッグ入口のタップ領域が通常文言と同等に見え、強い視覚的ヒントが出ない。
- difficulty色:
  - UI上のdifficulty表示が `--difficulty-*-active` 参照で切替わる。
  - canvas生成色（共有画像）が従来どおり描画される。
- 進捗バー:
  - track/未登録/未共有/共有済セグメントがダークでも識別可能。
  - 未登録（灰）が背景と同化しない。
- 回帰:
  - 既存テストが通過し、機能挙動（共有/設定/検索）に影響がない。

## ロールバック方針

- 見た目のみ不具合の場合:
  - `styles.css` のトークン導入コミットを丸ごとrevertする。
- difficulty色不具合の場合:
  - `utils/iidx.ts` と `TournamentDetailPage.tsx` の差分のみをrevertし、既存固定色実装へ戻す。
- MUI `sx` 不整合の場合:
  - `App.tsx` / `SettingsPage.tsx` / `TournamentDetailPage.tsx` の該当差分のみを分離revertする。

## Commit Plan

1. `styles.css` にトークン追加と light/dark上書き、difficulty active変数、progress配色調整を実装。
2. `utils/iidx.ts` の difficulty色APIを active変数対応 + canvas用分離に更新。
3. `App.tsx` / `SettingsPage.tsx` / `TournamentDetailPage.tsx` の直色 `sx` をトークン参照へ置換。
4. テスト・lint・build実行と差分スコープ確認。

## Scope Declaration

- 変更対象は以下に限定する。
  - `tasks/feat-dark-theme-os-follow.md`
  - `packages/web-app/src/styles.css`
  - `packages/web-app/src/utils/iidx.ts`
  - `packages/web-app/src/pages/TournamentDetailPage.tsx`
  - `packages/web-app/src/pages/SettingsPage.tsx`
  - `packages/web-app/src/pages/CreateTournamentPage.tsx`
  - `packages/web-app/src/components/ImportQrScannerDialog.tsx`
  - `packages/web-app/src/App.tsx`
- 上記以外のファイル変更は禁止。必要が出た場合は本tasksを更新してから実施する。
