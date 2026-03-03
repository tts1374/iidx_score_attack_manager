# Plan: feat/home-microinteractions

## 目的

- スコアタ一覧の状態変化（フィルタ差分・カード操作・FAB展開）を短時間で理解できるようにし、操作の説明性を上げる。
- 演出過多を避け、既存UI/意味体系を維持したまま最小差分でマイクロインタラクションを追加する。
- `prefers-reduced-motion` 利用時に動きを無効化または短縮し、アクセシビリティを担保する。

## 非目的

- データモデル・DB・永続化形式の変更。
- Service Worker / Web Locks / import-export 経路の変更。
- 依存追加（新規ライブラリ導入）やテーマ全面刷新。

## 変更点

- 一覧カードに hover/press フィードバックを追加。
  - press時 `scale(0.98)`（短時間）を適用。
  - 「詳細を見る」の hover underline と矢印の右移動を追加。
- 既存アニメーションの安定性改善として、可能な箇所は MUI `theme.transitions` ベースへ寄せる。
  - duration / easing を MUI transitions 由来の値で統一
  - FAB回転・一覧差分・進捗/件数の遷移指定を MUI transitions と同期
- フィルタ/検索/ソート反映時の一覧差分アニメを追加。
  - フィルタ/検索時:
    - FLIPなし
    - 追加/削除は opacity のみ（200ms）
    - collapse（高さアニメ）は行わない
  - 並び替え時:
    - FLIPあり
    - transform は FLIP のみ（追加 translate は行わない）
    - duration 200ms / easing ease-out
- 進捗バー表示時の短時間アニメを追加。
  - バー描画の視認性向上（短時間収束）
  - 数値表示の遅延フェードイン
- 「現在の結果: N件」の N のみを短時間で更新するアニメーションを追加。
- FAB展開状態に同期した `+` アイコンの 45 度回転（`×` 見え）を追加。

## 影響範囲（ユーザー / データ / 互換性）

- ユーザー:
  - ホーム一覧の操作時フィードバックが増える。
  - フィルタ結果変化・FAB展開状態が視覚的に追いやすくなる。
- データ:
  - 影響なし（読み取り/UI表示のみ）。
- 互換性:
  - API / payload / DB schema 変更なし。
  - `prefers-reduced-motion` に対応し、動きが苦手な環境でも破綻しない。

## 実装方針（対象ファイル単位）

- `packages/web-app/src/pages/HomePage.tsx`
  - 一覧差分アニメ管理（enter/exit/FLIP）を実装。
  - `animationMode`（filter/search or sort）で挙動分岐し、要件どおりに motion を切り替える。
- `packages/web-app/src/components/TournamentSummaryCard.tsx`
  - カード内導線と進捗表示のマイクロインタラクション用DOM/classを追加。
  - 進捗バー・数値フェードの transition 指定を MUI transitions 化。
- `packages/web-app/src/App.tsx`
  - 結果件数の数値アニメーション、およびFABアイコン回転を実装。
  - FABアイコン回転の transition 指定を MUI transitions 化。
- `packages/web-app/src/styles.css`
  - カード hover/press、リンク矢印遷移、一覧差分、進捗バー、件数、FAB回転のスタイルを追加。
  - reduced-motion向けの短縮/無効化を追加。
- `packages/web-app/src/pages/HomePage.test.tsx`
  - DOM構造変更に伴う既存テスト調整と、追加要素の回帰確認を補強。

### 変更スコープ固定

- 上記5ファイル + 本 tasks ファイルのみ変更。

## テスト観点

- Home 一覧:
  - カード押下で `onOpenDetail` が従来通り呼ばれる。
  - フィルタ変更で追加/削除/並び替え時に要素が消失せず描画される（回帰なし）。
- 進捗:
  - 既存の進捗セグメント比率（width値）が維持される。
- 件数表示:
  - 表示文言は維持しつつ数値のみ更新される。
- FAB:
  - 開閉状態とアイコン回転クラスが同期する。
- 全体:
  - `pnpm --filter @iidx/web-app test -- --run src/pages/HomePage.test.tsx`
  - `pnpm --filter @iidx/web-app lint`
  - 必要最小限で web-app テスト実行

## ロールバック方針

- UIアニメ関連の変更をコミット単位で revert する。
- FLIP/件数/FAB回転は別コミット化し、問題箇所のみ戻せるように分離する。

## Commit Plan（コミット分割計画）

1. 一覧差分（FLIP + enter/exit）実装と HomePage テスト調整。
2. カード hover/press・進捗・詳細リンクのマイクロインタラクション追加。
3. 件数アニメーションと FAB 回転、reduced-motion 調整。

Commit execution note:
- 実装後の検証で「フィルタ/検索時のガタつき抑制」「MUI transitions への統一」「FLIP適用条件の分離」が同一箇所にまたがり、差分が強く結合したため、最終的に単一コミットへ集約する。
