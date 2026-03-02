# Plan: feat/mui-theme-phase2

## 目的

- Phase1 後に `styles.css` に残っているホーム画面フィルタ周辺の MUI クラス依存配色を削減する。
- `App.tsx` 側の MUI `sx` に寄せ、MUI配色責務をコンポーネント側へ集約する。
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

## テスト観点

- 見た目:
  - ホーム適用チップ（status/condition/type/overflow）の背景・文字・削除アイコン色が従来と一致する。
  - BottomSheet のセグメント（selected/hover）、divider、checkbox 未選択色が従来と一致する。
- 回帰:
  - フィルタ選択・解除、検索チップ削除、ソート変更の挙動が不変。
  - `pnpm lint` / `pnpm test` / `pnpm build` が通過する。

## ロールバック方針

- 配色崩れが出た場合:
  - `App.tsx` の `sx` 追加差分を revert し、`styles.css` の削除差分を戻して復旧する。

## Commit Plan

1. `App.tsx` にホームフィルタ周辺の MUI `sx` を追加。
2. `styles.css` の不要 `.Mui*` 依存ルールを削除。
3. `lint/test/build` 実行と差分確認。

## Scope Declaration

- 変更対象を以下に固定する。
  - `tasks/feat-mui-theme-phase2.md`
  - `packages/web-app/src/App.tsx`
  - `packages/web-app/src/styles.css`
- 上記以外の変更は禁止。必要が出た場合は本tasksを更新してから実施する。
