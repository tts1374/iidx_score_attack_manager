# AGENTS.md

## 0. Governance

This project is governed by the following documents:

-   AGENTS.md (execution constraints)
-   WORKFLOW.md (planning and PR rules)
-   QUALITY.md (acceptance criteria)

All three documents must be followed. If any conflict occurs, AGENTS.md
takes precedence for execution rules.

------------------------------------------------------------------------

## 1. 基本原則

-   すべての変更は再現可能であること。
-   宣言してから実行する（define → use）。
-   変更対象外のファイルには一切触れない。
-   不必要な整形・並び替え・リネームを行わない。
-   生成物は直接編集しない。

------------------------------------------------------------------------

## 2. 作業環境の分離

### 2.1 worktree強制（MANDATORY）

- すべての作業は git worktree で物理分離する。
- 既存作業ディレクトリを流用しない。
- 1 worktree = 1 branch = 1 purpose（1PR1目的と一致させる）。
- 作業開始時に worktree パスと BASE_SHA を宣言する。

### 2.2 worktree再利用ポリシー

- 同一PR内のレビュー指摘対応のみ、既存worktreeを再利用してよい。
- 目的が変わる場合は必ず新規worktreeを作成する。
- PRがmergeされた後は、worktreeを再利用しない。
- 別タスクを同一branchに積み増さない。

------------------------------------------------------------------------

## 3. 基点SHA固定

### 3.1 作業開始時

-   必ず基点SHAを明示する。
-   ブランチ名ではなくコミットSHAを使用する。
-   SHAはPR完了まで固定する。

例:

BASE_SHA=`<commit_hash>`{=html} git worktree add ../repo-task \$BASE_SHA

### 3.2 禁止事項

-   作業途中の rebase
-   作業途中の merge
-   不明確な upstream 追従

------------------------------------------------------------------------

## 4. 変更スコープ固定

-   変更対象ディレクトリ/ファイルを事前宣言する。
-   宣言外の変更は禁止。
-   globによる広範囲編集は禁止。

------------------------------------------------------------------------

## 5. Git運用制約

-   main 直push禁止。
-   1ブランチ＝1目的。
-   dist/build/node_modules 等を直接編集しない。
-   CI生成物はCI経由のみ更新する。

------------------------------------------------------------------------

## 6. ファイルI/O規約

-   UTF-8 (no BOM) 固定。
-   atomic replace を使用。
-   書き込み前後で差分確認。
-   改行コードは既存に合わせる。

------------------------------------------------------------------------

## 7. 差分制御

-   変更は最小diff。
-   無関係なimport順修正禁止。
-   フォーマット変更は別PR。

------------------------------------------------------------------------

## 8. ローカル依存禁止

-   絶対パス禁止。
-   環境依存値の埋め込み禁止。
-   .env を直接編集しない。

------------------------------------------------------------------------

## 9. Single-tab operation (frozen)

Current product invariant: single-tab operation via Web Locks.

-   Lock name `iidx-score-attack-web-lock` を変更しない。
-   Lock取得フローを混在PRで変更しない。
-   BroadcastChannel / storage event 委譲経路を変更しない。
-   マルチタブ対応は専用設計PRでのみ実施する。

------------------------------------------------------------------------

## 10. READ / WRITE Protocol (Windows UTF-8 strict)

### 10.1 READ (UTF-8 no BOM, line-numbered)

-   必ず UTF-8 (no BOM) として読む。
-   行番号付きで確認する。
-   BOMは除去して扱う。

```bash
bash -lc 'powershell -NoLogo -Command "
$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false);
Set-Location -LiteralPath (Convert-Path .);
function Get-Lines { param([string]$Path,[int]$Skip=0,[int]$First=40)
  $enc=[Text.UTF8Encoding]::new($false)
  $text=[IO.File]::ReadAllText($Path,$enc)
  if($text.Length -gt 0 -and $text[0] -eq [char]0xFEFF){ $text=$text.Substring(1) }
  $ls=$text -split "`r?`n"
  for($i=$Skip; $i -lt [Math]::Min($Skip+$First,$ls.Length); $i++){ "{0:D4}: {1}" -f ($i+1), $ls[$i] }
}
Get-Lines -Path "path/to/file.ext" -First 120 -Skip 0
"'
```

### 10.2 WRITE (UTF-8 no BOM, atomic replace)

-   UTF-8 no BOM 固定。
-   一時ファイル経由で原子的置換。
-   追記ではなく完全内容を書き直す。
-   書き込み後は必ず diff 確認。

```bash
bash -lc 'powershell -NoLogo -Command "
$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false);
Set-Location -LiteralPath (Convert-Path .);
function Write-Utf8NoBom {
  param([string]$Path,[string]$Content)
  $dir = Split-Path -Parent $Path
  if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }
  $tmp = [IO.Path]::GetTempFileName()
  try {
    $enc = [Text.UTF8Encoding]::new($false)
    [IO.File]::WriteAllText($tmp,$Content,$enc)
    Move-Item $tmp $Path -Force
  }
  finally {
    if (Test-Path $tmp) {
      Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    }
  }
}
Write-Utf8NoBom -Path "path/to/file.ext" -Content "NEW_CONTENT_HERE"
"'
```

### 10.3 禁止事項

-   UTF-16保存
-   BOM付き保存
-   エディタ依存の自動整形保存
-   CRLF/LFを無断変更
