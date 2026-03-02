# Plan: feat/mui-theme-phase2

## 目的

- Phase1 後に `styles.css` に残っているホーム画面フィルタ周辺の MUI クラス依存配色を削減する。
- `App.tsx` 側の MUI `sx` に寄せ、MUI配色責務をコンポーネント側へ集約する。
- Create大会画面に残っている DatePicker / Autocomplete Popper の MUI クラス依存配色を `sx` へ移管する。
- Create大会画面で局所定義している `Autocomplete` 配色 `sx` を MUIテーマ（`mui-theme.ts`）へ移管し、画面側の配色責務をさらに削減する。
- Create大会画面で局所定義している DatePicker の `slotProps.textField.sx` を MUIテーマ（`mui-theme.ts`）へ移管し、画面側の配色責務をさらに削減する。
- 全画面確認のうえ `styles.css` に残存する MUIクラス依存セレクタ（`button` グローバルの `.MuiButtonBase-root` 除外）を削減する。
- 見た目・挙動を変えず、テーマ移管の後続作業（Phase2）として差分を最小化する。

## 非目的

- 非MUI要素（素の `button` / `div` など）の全面リデザイン。
- ルーティング、状態管理、フィルタロジック、ソートロジックの変更。
- Service Worker / Web Locks / import-export / データ永続化仕様の変更。
- 依存関係更新。

## 変更点

- ホーム適用チップ (`Chip`) の MUI サブ要素配色（label/deleteIcon/hover）を `App.tsx` の `sx` に移管。
- ホームフィルタBottomSheet内の MUI要素配色（`ToggleButtonGroup` / `Divider` / `Checkbox`）を `sx` に移管。
- 上記移管により不要になった `styles.css` の `.homeAppliedChip* .Mui*` / `.homeFilterSheet .Mui*` ルールを削除。
- Create大会画面の DatePicker 入力配色（背景/文字/placeholder/アイコン）を `DatePicker` の `slotProps.textField.sx` に移管。
- Create大会画面の曲名 `Autocomplete` 候補ポップアップ配色を `slotProps.popper.sx` に移管。
- 上記移管により不要になった `styles.css` の `.periodDateField .Mui*` / `.createSongAutocompletePopper .Mui*` ルールを削除。
- Create大会画面に残る `SONG_AUTOCOMPLETE_SX` / `SONG_AUTOCOMPLETE_POPPER_SX` を削除し、同等配色を `mui-theme.ts` の `MuiAutocomplete` overrideに統合する。
- Create大会画面に残る `DATE_PICKER_TEXT_FIELD_SX` を削除し、同等配色を `mui-theme.ts` の `MuiPickersTextField` overrideへ統合する。
- `styles.css` の `button` グローバル配色を低特異性 `:where(...)` へ置換し、`.MuiButtonBase-root` 依存を除去する。

## 影響範囲

- ユーザー影響:
  - ホーム画面のフィルタUI（適用チップ・BottomSheet）の見た目は維持される。
  - 配色責務が `sx` に寄るため、MUIテーマ追従性が向上する。
- データ影響:
  - なし。
- 互換性:
  - フィルタ条件・ソート・検索・遷移の挙動は不変。

## 実装方針（対象ファイル単位）

- `packages/web-app/src/App.tsx`
  - ホーム適用チップの `sx` を追加し、トーナル/アウトライン系の配色・hover・deleteIcon色を定義する。
  - BottomSheet 内 `ToggleButtonGroup` / `Divider` / `Checkbox` へ `sx` を追加する。
- `packages/web-app/src/styles.css`
  - `homeAppliedChip` と `homeFilterSheet` 配下の `.Mui*` 依存ルールを削除し、レイアウト系クラスのみ残す。
- `packages/web-app/src/pages/CreateTournamentPage.tsx`
  - DatePicker の `slotProps.textField.sx` を共通化し、既存CSSのMUI配色ルールを移管する。
  - `Autocomplete` の `slotProps.popper.sx` を追加し、候補ポップアップの配色を移管する。
- `packages/web-app/src/theme/mui-theme.ts`
  - `MuiAutocomplete` の `styleOverrides` を追加し、Create画面で使用している入力/アイコン/候補ポップアップ配色をテーマへ移管する。
- `packages/web-app/src/pages/CreateTournamentPage.tsx`
  - テーマ移管した `Autocomplete` 配色ローカル `sx` 定義/適用を削除する。
- `packages/web-app/src/theme/mui-theme.ts`
  - `MuiPickersTextField` の `styleOverrides` を追加し、Create画面DatePicker入力の配色をテーマへ移管する。
- `packages/web-app/src/pages/CreateTournamentPage.tsx`
  - テーマ移管した `DATE_PICKER_TEXT_FIELD_SX` 定義と `slotProps.textField.sx` 適用を削除し、`className` でテーマ適用対象を指定する。
- `packages/web-app/src/styles.css`
  - `button` グローバルルールの `.MuiButtonBase-root` 除外依存を撤去し、低特異性セレクタへ置換する。
- `packages/web-app/src/styles.css`
  - `periodDateField` と `createSongAutocompletePopper` 配下の `.Mui*` 依存ルールを削除する。

## テスト観点

- 見た目:
  - ホーム適用チップ（status/condition/type/overflow）の背景・文字・削除アイコン色が従来と一致する。
  - BottomSheet のセグメント（selected/hover）、divider、checkbox 未選択色が従来と一致する。
  - Create大会画面の期間DatePicker入力（背景/文字/placeholder/アイコン）配色が従来と一致する。
  - Create大会画面の曲候補ポップアップ（paper/listbox/option hover/selected）配色が従来と一致する。
  - Create大会画面の曲名入力（背景/placeholder/右側アイコン色）が従来と一致する。
  - 全画面で `styles.css` に `.Mui*` セレクタが残存しないこと。
  - Light時に主要ボタン（赤/青/FAB含む）のhover白飛びが再発しないこと。
- 回帰:
  - フィルタ選択・解除、検索チップ削除、ソート変更の挙動が不変。
  - Create大会画面の期間入力、曲検索候補表示、曲選択の挙動が不変。
  - `pnpm lint` / `pnpm test` / `pnpm build` が通過する。

## ロールバック方針

- 配色崩れが出た場合:
  - `App.tsx` の `sx` 追加差分を revert し、`styles.css` の削除差分を戻して復旧する。

## Commit Plan

1. `App.tsx` にホームフィルタ周辺の MUI `sx` を追加。
2. `styles.css` の不要 `.Mui*` 依存ルールを削除。
3. `lint/test/build` 実行と差分確認。
4. `CreateTournamentPage.tsx` に DatePicker / Autocomplete Popper の MUI `sx` を追加。
5. `styles.css` の Create画面向け不要 `.Mui*` 依存ルールを削除。
6. `lint/test/build` 実行と差分確認。
7. `mui-theme.ts` に `MuiAutocomplete` override を追加し、Create画面のローカルAutocomplete配色 `sx` を削除。
8. `lint/test/build` 実行と差分確認。
9. `mui-theme.ts` に `MuiPickersTextField` override を追加し、Create画面のローカルDatePicker配色 `sx` を削除。
10. `lint/test/build` 実行と差分確認。
11. `styles.css` の残存MUIクラス依存セレクタを低特異性 `:where(...)` へ置換。
12. `lint/test/build` 実行と差分確認。

## Scope Declaration

- 変更対象を以下に固定する。
  - `tasks/feat-mui-theme-phase2.md`
  - `packages/web-app/src/App.tsx`
  - `packages/web-app/src/pages/CreateTournamentPage.tsx`
  - `packages/web-app/src/theme/mui-theme.ts`
  - `packages/web-app/src/styles.css`
- 上記以外の変更は禁止。必要が出た場合は本tasksを更新してから実施する。
