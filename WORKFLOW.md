# WORKFLOW.md

## 0. 基本原則

- 1PR1目的。
- 目的外変更は分離する。
- 変更は最小差分を優先する。
- 局所修正は、長い計画より直接修正を優先する。
- 単一タブ排他、PWA起動導線、保存互換性を壊す変更は単独PRで扱う。
- worktree / branch / PR は 1目的に固定する。

---

## 1. 実行モード

作業は以下のどちらかで進める。

### A. Local Execution Mode
対象が局所的で、既存仕様や責務分割を変えない変更。

例:
- UI文言修正
- i18n修正
- 局所バリデーション修正
- 小さな表示崩れ修正
- 既存責務内のバグ修正
- 既存テストの補強
- ローカルなロジック修正（影響範囲が限定的なもの）

この場合:
- `tasks/*.md` は不要
- 長い事前計画は不要
- 直接関連するファイルから着手する
- 実装後に必要な最小検証だけ行う
- 実装前の詳細コミット計画宣言は不要

### B. Plan Mode
高リスク、複数層、互換性影響、運用影響がある変更。

この場合のみ、実装前に `tasks/<branch-or-pr-name>.md` を作成する。

### 1.1 Current request ceiling
着手前に、今回の依頼がどこまでを許可しているかを明示的に判定する。

- planning-only
- artifact-update-only
- implementation-authorized
- review-fix-only
- merge / close / cleanup authorized

ルール:
- user が明示的に許可していない後段フェーズへ同一ターンで進まない
- `tasks/*.md` 作成、Issue コメント記載、計画整理の依頼は artifact 作成と write-back 確認で止める
- review 指摘対応の依頼は、merge や cleanup が明示されていない限りその範囲で止める

---

## 2. Plan Mode の必須条件

以下のいずれかに該当する場合は Plan Mode 必須。

- アーキテクチャ変更
- Web Locks / 単一タブ排他の変更
- Service Worker / COOP-COEP / 起動導線変更
- import/export / 共有 / 保存形式変更
- `def_hash` 算出ロジック変更
- DB schema / `user_version` / migration 変更
- SQLite WASM / OPFS 永続化方式変更
- song master 検証 / 更新フロー変更
- payload / contract / shared型の互換性影響を伴う変更
- CI / デプロイ変更
- 依存関係更新（lockfile含む）
- `packages/web-app` / `packages/shared` / `packages/db` / `packages/pwa` をまたぐクロスレイヤ変更
- セキュリティ・再現性・整合性に影響する変更

以下は原則として Plan Mode 不要。

- 単一ファイル中心の局所修正
- 既存責務内の小さなバグ修正
- UI表示だけの修正
- 文言、翻訳、軽微なバリデーション変更
- テスト追加のみ（仕様変更を伴わないもの）

### 2.1 途中再判定
Local Execution Mode で開始しても、以下のいずれかが出た時点で mode / scope を再判定する。

- 4ファイル目以降の確認や追加探索が必要になった
- package 境界や互換性影響が見えた
- PWA / 起動 / Web Locks / 保存互換性へ波及する疑いが出た
- current request ceiling を越えて PR / merge / cleanup まで進めたくなった

再判定結果:
- 局所のまま進められるなら、拡張理由を明示して最小追加範囲のみ進める
- Plan Mode 条件に入るなら、以後の実装前に plan を作成する

---

## 3. Plan Mode の記載内容

`tasks/<branch-or-pr-name>.md` には最低限以下を記載する。

- 目的
- 非目的
- 変更点
- 影響範囲（ユーザー / データ / 互換性 / PWA / 保存 / 起動）
- 対象ファイル / 対象パッケージ
- テスト観点
- ロールバック方針
- コミット分割計画

### 記載形式（例）

- [ ] 設計確認
- [ ] 影響範囲特定
- [ ] 実装
- [ ] テスト
- [ ] 回帰確認
- [ ] ドキュメント更新

### 3.1 task artifact の扱い
- `tasks/*.md` を作成した場合は、それが planning deliverable なのか、実装ブランチに同梱する artifact なのかを明示する
- task artifact を push / PR に含めるタイミングを曖昧にしない

---

## 4. 初手探索の制限

初手では広く調査しない。

ルール:
- まず直接関連するファイルから確認する
- 初回探索は最大3ファイルまたは3検索を目安とする
- 根拠が不足する場合のみ探索範囲を広げる
- repo全体の広域探索をデフォルトにしない
- 「まず全部読む」は禁止

---

## 5. コミット方針

### 5.1 Local Execution Mode
- 実装前に詳細なコミット計画を必須としない
- 変更が局所的なら、実装 → 検証 → 要約で進める
- 必要に応じて1〜2論理コミットにまとめる
- 作業途中の未整理コミットを量産しない

### 5.2 Plan Mode
- 実装前にコミット粒度を明示する
- 計画内の1項目 = 1論理コミットを原則とする
- 作業単位が完了したら逐次コミットする
- `git status` は各コミット前にクリーンであること
- 機械生成差分と手動修正を混在させない
- 整形のみの変更は別PR

例:
1. shared型/定数追加
2. ロジック変更
3. UI調整
4. テスト修正
5. ドキュメント更新

---

## 6. worktree / ブランチ運用

- 実装タスクやPR作業は `git worktree` による物理分離を推奨する
- 1 worktree = 1 branch = 1 purpose
- 高リスク変更やPR作業では BASE_SHA を固定する
- 軽量なレビュー、調査、文面作成では worktree 運用を必須にしない

### 6.1 PR作成アカウント

- user が明示的に別指示しない限り、PR は GitHub アカウント `tts1374-bot` で作成する
- `gh pr create` 前に active account を確認し、`tts1374-bot` でなければ切り替える
- 既存PRの作成者が approval フローを妨げる場合は、title/body/scope を維持したまま `tts1374-bot` で開き直してから approval / merge に進む

---

## 7. 差分規律

- 変更対象に必要な差分だけを含める
- 目的外変更を混ぜない
- 無関係な整形・並び替え・リネームを行わない
- 宣言したスコープを越える場合は、なぜ必要かを明示する
- 生成物を直接編集しない
- 依存更新の意図がない限り lockfile を触らない

---

## 8. 互換性レビュー必須領域

以下を変更する場合は専用レビュー観点を設ける。

- payloadフォーマット
- `def_hash` 算出ロジック
- DB schema / `user_version`
- Service Worker fetch戦略
- song master検証ロジック
- import/export 形式
- 単一タブ排他ロジック

---

## 9. Multi-tab initiative gate

単一タブ凍結を解除する場合は専用PRシリーズで実施する。

1. 設計ドキュメント作成
2. 実装
3. 回帰・耐障害性確認
4. QUALITY.md 更新

機能追加と同時に実施しない。

---

## 10. バグ対応方針

- まず局所原因を確認する
- 局所修正で解決可能なら広域再設計を行わない
- 対症療法しか取れない場合は、その理由を明示する
- 再発防止が必要な場合のみ設計へ反映する
- lessons.md への記録は、高リスク変更または恒久対策を伴う場合に限る

---

## 11. PR本文テンプレート

PRには以下を含める。

- 目的
- 変更点
- 非変更点
- 影響範囲
- テスト内容
- 回帰確認項目

高リスク変更では追加で以下を含める。

- ロールバック方針
- 互換性影響の有無
- 保存/PWA/起動導線への影響
- docs更新有無

### 11.1 merge / close / cleanup の順序
merge / close / cleanup を同時に扱う場合、順序は以下に固定する。

1. merge 実行
2. merged state の read-back 確認
3. close evidence の確認
4. Issue close
5. branch / worktree cleanup

ルール:
- merged state の read-back 前に close や cleanup へ進まない
- command success だけで完了扱いにしない

---

## 12. 完了条件（ワークフロー観点）

- Plan Mode では、計画に沿った差分のみ存在する
- Local Execution Mode では、要求に必要な最小差分のみ存在する
- 目的外変更がない
- QUALITY基準を満たす
- `git status` がクリーンである
