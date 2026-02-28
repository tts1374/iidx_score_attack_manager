# AGENTS.md

## 0. Governance

This project is governed by the following documents:

- AGENTS.md (execution constraints)
- WORKFLOW.md (planning and PR rules)
- QUALITY.md (acceptance criteria)

All three documents must be followed. If any conflict occurs, AGENTS.md
takes precedence for execution rules.

------------------------------------------------------------------------

## 1. WORKFLOW Enforcement (MANDATORY)

WORKFLOW.md is not optional guidance.  
If the following Plan-mode gate conditions are met, implementation MUST NOT begin
until the planning procedure defined below is completed.

### 1.1 Plan-mode gate（該当したら実装開始禁止）

If any of the following conditions apply, Plan-mode is mandatory:

- 作業が複数ステップにまたがる変更
- アーキテクチャ変更 / 責務再分割 / データモデル変更
- 永続化形式 / 互換性 / データ移行に影響する変更
- Service Worker / COOP-COEP / crossOriginIsolated 関連変更
- Web Locks / Single-tab invariant に関わる変更
- import/export / 共有 / 保存 / 起動導線の挙動変更
- CI/CD（.github/workflows）変更
- リリース運用 / デプロイ方式変更
- 依存関係更新（lockfile含む）
- セキュリティ・再現性・整合性に影響する可能性がある変更

該当する場合、直接コード変更してはならない。

### 1.2 Plan Procedure（必須）

Plan-mode発動時は必ず以下を実行する。

1. WORKFLOW.md に従い Plan → 実装 → 検証 → PR の順で進める。
2. `tasks/<branch-or-topic>.md` を作成し、以下を明記する。

   - 目的
   - 非目的
   - 変更点（明確な箇条書き）
   - 影響範囲（ユーザー / データ / 互換性）
   - 実装方針（対象ファイル単位）
   - テスト観点
   - ロールバック方針
   - Commit Plan（コミット分割計画）

3. tasksに定義されていない変更を加えてはならない。
   変更が必要になった場合は tasks を更新してから実装する。

### 1.3 非Plan許可範囲

以下はPlan不要。

- タイポ修正
- コメント追加
- 文言調整
- 挙動不変の軽微リファクタ
- 影響範囲が明確に局所的な修正

------------------------------------------------------------------------

## 2. 基本原則

- すべての変更は再現可能であること。
- 宣言してから実行する（define → use）。
- 変更対象外のファイルには一切触れない。
- 不必要な整形・並び替え・リネームを行わない。
- 生成物は直接編集しない。

------------------------------------------------------------------------

## 3. 作業環境の分離

### 3.1 worktree強制（MANDATORY）

- すべての作業は git worktree で物理分離する。
- 既存作業ディレクトリを流用しない。
- 1 worktree = 1 branch = 1 purpose（1PR1目的と一致させる）。
- 作業開始時に worktree パスと BASE_SHA を宣言する。

### 3.2 worktree再利用ポリシー

- 同一PR内のレビュー指摘対応のみ、既存worktreeを再利用してよい。
- 目的が変わる場合は必ず新規worktreeを作成する。
- PRがmergeされた後は、worktreeを再利用しない。
- 別タスクを同一branchに積み増さない。

------------------------------------------------------------------------

## 4. 基点SHA固定

### 4.1 作業開始時

- 必ず基点SHAを明示する。
- ブランチ名ではなくコミットSHAを使用する。
- SHAはPR完了まで固定する。

例:

BASE_SHA=`<commit_hash>` git worktree add ../repo-task $BASE_SHA

### 4.2 禁止事項

- 作業途中の rebase
- 作業途中の merge
- 不明確な upstream 追従

------------------------------------------------------------------------

## 5. 変更スコープ固定

- 変更対象ディレクトリ/ファイルを事前宣言する。
- 宣言外の変更は禁止。
- globによる広範囲編集は禁止。

------------------------------------------------------------------------

## 6. Git運用制約

- main 直push禁止。
- 1ブランチ＝1目的。
- dist/build/node_modules 等を直接編集しない。
- CI生成物はCI経由のみ更新する。

------------------------------------------------------------------------

## 7. ファイルI/O規約

- UTF-8 (no BOM) 固定。
- atomic replace を使用。
- 書き込み前後で差分確認。
- 改行コードは既存に合わせる。

------------------------------------------------------------------------

## 8. 差分制御

- 変更は最小diff。
- 無関係なimport順修正禁止。
- フォーマット変更は別PR。

------------------------------------------------------------------------

## 9. ローカル依存禁止

- 絶対パス禁止。
- 環境依存値の埋め込み禁止。
- .env を直接編集しない。

------------------------------------------------------------------------

## 10. Single-tab operation (frozen)

Current product invariant: single-tab operation via Web Locks.

- Lock name `iidx-score-attack-web-lock` を変更しない。
- Lock取得フローを混在PRで変更しない。
- BroadcastChannel / storage event 委譲経路を変更しない。
- マルチタブ対応は専用設計PRでのみ実施する。

------------------------------------------------------------------------

## 11. READ / WRITE Protocol (Windows: UTF-8 strict)

目的: Windows起因の文字化け（UTF-16/CP932混入、BOM、改行コード揺れ）を作業プロセスで封じる。

### 10.1 Canonical Encoding Rules（このリポジトリの正解）

- テキストは **UTF-8（BOMなし）** が唯一の許容形式。
- 改行は **LF** が正。CRLFは例外扱い（許可する場合は対象ファイルを明記）。
- **UTF-16（LE/BE）禁止**。PowerShell既定動作で混入しやすいので特に警戒する。
- **CP932/Shift_JIS禁止**。ローカルIMEや古いツール由来の混入を想定する。

### 10.2 READ（読む時の原則）

- 読み取りは「UTF-8（BOMなし）」を前提に扱う。  
  表示が崩れる場合は、まず **BOM/UTF-16/CP932** の混入を疑い、エンコーディングを確定してから処理する。
- “BOMがあったら除去して読めばよい” を標準運用にしない。  
  **BOM/UTF-16の存在自体を不具合**とみなし、原因側（生成元）を潰す。

確認観点（手順ではなく判定基準）:
- 先頭に不可視文字が入る / 先頭行だけ崩れる → BOM疑い
- 全文が「□」や記号になる → UTF-16/CP932疑い
- diffで全行変更になる → CRLF/LF揺れ疑い

### 10.3 WRITE（書く時の原則）

- 書き込みは常に **UTF-8（BOMなし）** を明示する（既定値に依存しない）。
- 変更は「部分追記」より「全体再生成」を優先する（混在エンコーディングを避ける）。
- 保存は原子的（テンポラリ→置換）で行い、生成途中の破損を残さない。
- 書き込み後は必ず `git diff` で確認し、意図しない **改行/エンコーディング** の全体変化がないことを保証する。

### 10.4 Windows / PowerShell の注意（最小知識）

- PowerShellはコマンドやバージョンによって **既定エンコーディングがUTF-16寄り**になり得る。  
  したがって「エンコーディング指定なしの書き込み」を禁止する。
- 文字列→ファイル生成は、言語/ツール側で **encoding指定可能なAPI** を使うこと。

（例示は最小限。手順書ではない）
- PowerShell: `Set-Content` / `Out-File` は **必ず UTF-8 指定**
- Node/Python: `writeFile(..., "utf8")` / `open(..., encoding="utf-8")` のように明示

### 10.5 禁止事項（Violation = 修正してからコミット）

- UTF-16保存（LE/BE問わず）
- BOM付きUTF-8保存
- エンコーディング/改行を暗黙に変える保存（エディタの自動判定任せ）
- CRLF/LFの無断変更（必要なら対象と理由をPRに明記）