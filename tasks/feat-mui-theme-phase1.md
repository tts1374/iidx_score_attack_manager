# Plan: feat/mui-theme-phase1

## 目的

- MUIコンポーネント配色を、MUI公式の `colorSchemes` ベースへ先行移行する。
- OSダークモード追従をMUIテーマ側で成立させる。
- 既存機能や画面導線は変更せず、色定義の配置のみを整理する。

## 非目的

- 非MUI要素（素のHTML/CSS）配色の全面置換。
- レイアウト変更やUI構造変更。
- ダークモードON/OFFトグルUI追加。
- Service Worker / Web Locks / import-export / データ永続化仕様の変更。
- 依存関係更新。

## 変更点

- `packages/web-app/src/theme/mui-theme.ts` を新規作成し、`createTheme` + `colorSchemes`（light/dark）を定義する。
- 同ファイルでMUI主要コンポーネントの色系 `styleOverrides`（Button/Menu/MenuItem/Dialog など）を集約する。
- `packages/web-app/src/main.tsx` に `ThemeProvider` を導入し、全レンダー経路で共通テーマを適用する。
- `CssBaseline` は本フェーズでは導入せず、既存CSSとの競合を最小化する。
- MUIテーマ化により不要となったメニュー配色CSS（`appMenuPaper` / `appMenuItem` と関連トークン）を削除する。
- `App.tsx` の `Menu` / `MenuItem` から、不要になった `className` 参照を削除する。
- 高優先のTheme移管として、詳細/提出ダイアログのクラス依存配色を `mui-theme.ts` の `MuiDialog` 系overrideへ集約する。
- `SettingsPage.tsx` の `cardSx` 内に残る `.Mui*` 配色指定をテーマ側へ移管し、ローカル `sx` を最小化する。
- `ImportQrScannerDialog.tsx` の `Dialog` 色指定 `sx` をテーマ側へ移管し、重複指定を削減する。
- グローバル `button` ルールの対象を非MUI要素へ限定し、MUI Button/FAB の hover 白飛びを解消する（一覧ソート等の非MUIボタン見た目は維持）。
- MUI dark未適用箇所（3点リーダーメニュー/プルダウン/ダイアログ群）を `theme.vars` ベースへ統一し、OSダーク時にMUI配色がライト固定化しないよう是正する。

## 影響範囲

- ユーザー影響:
  - MUIコンポーネントの配色はテーマ定義を基準に切り替わる。
  - OSダークモード時のMUI配色整合性が向上する。
- データ影響:
  - なし。
- 互換性:
  - 既存挙動（機能・遷移・保存）は維持。

## 実装方針（対象ファイル単位）

- `packages/web-app/src/theme/mui-theme.ts`（新規）
  - `colorSchemes.light` / `colorSchemes.dark` の `palette` を定義。
  - `components` にMUI配色overrideを定義し、現在のトークン意図を踏襲する。
  - `theme.palette` 固定参照ではなく `theme.vars.palette`（必要に応じて CSSトークン）を使い、ダークモード時の `Menu/Select/Dialog` 配色反映を保証する。
- `packages/web-app/src/main.tsx`
  - テーマ適用ヘルパーを追加し、`root.render` の全経路で `ThemeProvider` を適用する。
- `packages/web-app/src/styles.css`
  - MUIテーマに置き換わった `appMenuPaper` / `appMenuItem` 関連スタイルと専用トークンを削除する。
  - `detailShareDialogPaper` / `detailSubmitDialogPaper` のMUI配色ブロックを削除する。
  - `button` のグローバル配色ルールを非MUIへ限定し、MUI hover競合を解消する。
- `packages/web-app/src/App.tsx`
  - 上記CSS削除に合わせて、`Menu` / `MenuItem` の `className` 依存を除去する。
- `packages/web-app/src/pages/TournamentDetailPage.tsx`
  - ダイアログ `PaperProps.className` 依存を削除し、テーマ配色へ統合する。
- `packages/web-app/src/pages/SettingsPage.tsx`
  - `cardSx` に残るMUI配色指定を削減し、テーマ定義へ寄せる。
- `packages/web-app/src/components/ImportQrScannerDialog.tsx`
  - Dialogの `PaperProps.sx` / `DialogContent.sx` の配色指定を削除し、テーマ定義へ寄せる。

## テスト観点

- Light:
  - MUI Button/Menu/Dialog の背景・文字色・hoverが破綻しない。
- Dark:
  - OSダーク時にMUIコンポーネントがライト配色のまま残らない。
- CSS整理:
  - 削除対象のMUI配色CSSが未参照になっていること。
  - 詳細/提出ダイアログ、設定画面Card内要素、QR取込ダイアログで色崩れがないこと。
- 回帰:
  - 既存テストが通過し、挙動変更がない。

## ロールバック方針

- 配色不整合が出た場合:
  - `main.tsx` の ThemeProvider 導入差分をrevertして即時復旧。
  - 必要に応じて `mui-theme.ts` を全revert。

## Commit Plan

1. `mui-theme.ts` の追加（colorSchemes + components override）。
2. `main.tsx` へ ThemeProvider 導入（全render経路適用）。
3. `styles.css` / `App.tsx` の不要MUIメニュー配色定義を削除。
4. ダイアログ/設定/QR取込のMUI配色をテーマへ移管し、重複CSS/`sx` を削減。
5. lint/test/build 実施と差分スコープ確認。

### Commit Plan 実施結果

- 上記1-5は密結合のため、途中段階で配色崩れを残さないことを優先し、単一コミットに集約して実施した。
- 変更対象ファイルは Scope Declaration 内に限定し、検証（lint/test/build）完了後にコミットした。

## Scope Declaration

- 変更対象を以下に固定する。
  - `tasks/feat-mui-theme-phase1.md`
  - `packages/web-app/src/theme/mui-theme.ts`
  - `packages/web-app/src/main.tsx`
  - `packages/web-app/src/styles.css`
  - `packages/web-app/src/App.tsx`
  - `packages/web-app/src/pages/TournamentDetailPage.tsx`
  - `packages/web-app/src/pages/SettingsPage.tsx`
  - `packages/web-app/src/components/ImportQrScannerDialog.tsx`
- 上記以外の変更は禁止。必要が生じた場合は本tasksを更新してから実施する。
