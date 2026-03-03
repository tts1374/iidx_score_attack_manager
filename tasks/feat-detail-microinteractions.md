# Plan: feat/detail-microinteractions

## 作業宣言

- worktree path: `C:\work\score_attack_manager\iidx_score_attack_manager-home-microinteractions`
- BASE_SHA: `9609338e44cef485dd3f185ae991803805bf5b12`

## 目的

- スコアタ詳細画面で「登録する/差し替え」「提出する」押下時の手応えを最小演出で追加する。
- 提出画面から詳細へ戻った際に、変更対象と変更有無を短時間で認知できるようにする。
- 演出は 200ms 基調・`ease-out`・reduced-motion 対応で統一し、過剰なモーションを避ける。

## 非目的

- DB スキーマ、永続化形式、import/export、Service Worker、Web Locks の変更。
- 共有フローのロジック全面変更や新規依存導入。
- 詳細画面以外の大規模 UI リデザイン。

## 変更点

- ルート戻りシグナルを追加し、詳細復帰時の理由を判定できるようにする。
  - `returnReason: 'back' | 'saved' | 'replaced' | 'shared'`
  - `changedChartId` / `changedCount` を必要時に付与
- 譜面カードの「登録する/差し替え」ボタンに press scale と 200ms 連打抑止を追加。
- 下部固定「提出する」ボタンに press scale と 200ms 連打抑止を追加。
- `saved/replaced` 復帰時のみ、該当カード 1 件に 600ms の背景ハイライトを追加。
- 状態ラベルの内容変化時のみ 200ms フェードで置換し、ラベル領域の幅ブレを抑制。
- 上部進捗バーは「初回表示」または「変化あり時」のみ 200ms で遷移し、変化なし復帰ではアニメしない。
- 提出確認ダイアログは MUI 標準遷移のみ維持（内部追加アニメ無し）。

## 影響範囲（ユーザー / データ / 互換性）

- ユーザー:
  - 押下フィードバックが明確になり、復帰時の差分把握が容易になる。
- データ:
  - 変更なし（UI 状態・ルーティング状態のみ）。
- 互換性:
  - API / payload / DB schema 変更なし。
  - reduced-motion 環境ではアニメ無効化または短縮。

## 実装方針（対象ファイル単位）

- `packages/web-app/src/App.tsx`
  - submit/detail 間の戻りシグナル状態を追加。
  - submit 遷移時に進捗スナップショットを保持し、戻り時に変化有無を判定。
  - submit 画面からの戻り（back/saved/replaced）でシグナルを設定。
- `packages/web-app/src/pages/SubmitEvidencePage.tsx`
  - 保存完了コールバックで `saved/replaced` を返せるように変更。
- `packages/web-app/src/pages/TournamentDetailPage.tsx`
  - 戻りシグナル受信・消費処理を実装。
  - 譜面ボタン/下部提出ボタンの press + 連打抑止を実装。
  - カードハイライト・条件付き `scrollIntoView` を実装。
  - 状態ラベル置換フェード制御を実装。
  - 進捗アニメの発火条件を制御し、`shared` の同画面更新シグナルも扱う。
- `packages/web-app/src/components/TournamentSummaryCard.tsx`
  - 進捗バーアニメの有効/無効を外部指定できる最小拡張を追加（200ms 基準）。
- `packages/web-app/src/components/ChartCard.tsx`
  - 状態ラベル置換フェード用の最小 props/class 拡張を追加。
- `packages/web-app/src/styles.css`
  - 詳細画面向け press scale / highlight / fade のスタイルを追加。
  - reduced-motion 向けに対象アニメの無効化または短縮を追加。
- `packages/web-app/src/pages/TournamentDetailPage.test.tsx`
  - 連打抑止・戻りシグナル・ラベル差分演出の回帰確認を追加/更新。

### 変更スコープ固定

- 上記 7 ファイル + 本 `tasks/feat-detail-microinteractions.md` のみ変更する。

## テスト観点

- 「登録する/差し替え」押下時にボタンが短時間 disabled になり二重押下を抑止できる。
- 提出画面保存完了で戻ると、理由（saved/replaced）に応じて対象カードのみハイライトされる。
- `returnReason='back'` の戻りでは不要演出が発火しない。
- 状態ラベル変化時のみフェードし、レイアウトが崩れない。
- 上部進捗バーが初回表示・変化あり時のみアニメし、変化なしでは静止表示になる。
- 提出確認ダイアログに追加アニメがない（既存 MUI 標準遷移のみ）。

## ロールバック方針

- ルーティングシグナル追加と UI 演出追加を分離し、問題箇所をコミット単位で `git revert` できるようにする。
- 演出が問題の場合はスタイル/props 拡張コミットのみを切り戻し、既存フローを保持する。

## Commit Plan（コミット分割計画）

1. `App.tsx` / `SubmitEvidencePage.tsx` の戻りシグナル実装（back/saved/replaced 判定）。
2. `TournamentDetailPage.tsx` / `ChartCard.tsx` / `TournamentSummaryCard.tsx` の演出制御実装。
3. `styles.css` と `TournamentDetailPage.test.tsx` の調整、検証コマンド実行。
