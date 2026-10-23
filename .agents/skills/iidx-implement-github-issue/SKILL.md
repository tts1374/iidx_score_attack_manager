---
name: iidx-implement-github-issue
description: IIDX Score Attack Managerの確定済みIssueを番号・URL指定で実装・修正・検証するときに使う。Issue作成、開始指示文作成、既存PRのレビュー修正は別スキル。
---

# IIDX Implement GitHub Issue

指定Issueの契約を、許可範囲内の実装・検証・PR・レビュー確認へつなぐ。[AGENTS.md](../../../AGENTS.md)、[WORKFLOW.md](../../../WORKFLOW.md)、[QUALITY.md](../../../QUALITY.md)と対象のnested規則を適用する。確認済みの同一内容は再読込しない。

## 契約と作業場所

1. Issue本文・状態を取得し、Scope、Non-scope、Acceptance criteria、Required testsと今回の成果物を特定する。親・依存Issueは契約や前提確認に必要な場合だけ読む。
2. 現在のbranch・HEAD・既存変更を確認する。既存変更を保護し、今回差分へ混入させない。別目的branchを流用せず、適切な既存作業場所か新しい目的別branchを選ぶ。
3. 直接関連するコード・テストから初回3ファイルまたは3検索以内で始める。追加確認の理由を示し、必要範囲だけ広げる。
4. WORKFLOW.mdのLocal/Plan分岐を適用する。高リスク変更は専用worktreeと実装前のtask planを用意し、PR作業・高リスク作業では`BASE_SHA: <sha>`を記録する。Issue作成・計画のみなら、その境界で止める。

契約の矛盾、対象がclosed/置換済み、受け入れ条件を変える未決定判断がある場合は、事実と推奨案を整理する。判断に依存する編集だけを保留し、必要ならAGENTS.mdの`WAITING_FOR_HUMAN_DECISION`形式を使う。契約内の局所方式選択を追加承認の理由にしない。

## 最小実装と互換性

- Issue本文を上限とし、親Issueやチェックリストを追加backlogにしない。既存パターンを使い、新しいファイル・状態・依存を最小限にする。
- Web Locks、PWA/起動、保存/共有、DB、song masterへ触れる場合だけ、その境界の不変条件とQUALITY.mdの追加確認を適用する。UIだけの修正からこれらを一律調査しない。
- 既存データの受理条件を狭める場合は、変更境界の生成時変換・実保存値・読込条件を対応付け、契約と照合して保存→読込の往復を検証する。新規入力条件と過去の保存値の互換性を区別し、見た目だけで拒否テストの期待値を決めない。記録は作業報告でよい。
- 公開挙動、利用手順、データ契約が変わる場合だけ関連docsを同期する。長期判断の記録も今回の確定契約に限り、局所実装へADR作成を機械的に追加しない。

## 検証と受け入れ

1. 変更責務の直接検証、IssueのRequired tests、影響する契約面の検証を行う。QUALITY.mdの正常系・境界/異常系・UI・runtime確認は該当するものを適用する。
2. コード等を変更した場合は関連build/typecheckと対象lintを行う。root scriptsは`pnpm build`、`pnpm test`、`pnpm lint`。局所変更では対象packageに絞り、docs-onlyは省略理由を記載する。
3. `git diff --check`、diff、statusを確認し、UTF-8 BOMなし/LF、生成物・秘密情報・無関係な変更の混入がないことを確認する。
4. 各Acceptance criterionを実装箇所または検証結果へ対応付ける。必須検証の失敗・未実施、未実装、仕様との差異を隠さず、既存の無関係なfailureは今回へ混ぜない。

## 許可されたGitHub delivery

WORKFLOW.md section 1.2の指定Issue実行既定範囲と、現在のユーザー制限に従う。ローカルのみならcommit・push・PRへ進まない。

- 今回差分だけをstageし、目的・staged diff・remote headを確認してcommit・通常pushする。PR作成前に認証actorが`tts1374-bot`であることを確認する。
- [PRテンプレート](../../../.github/pull_request_template.md)へ実装差分・影響・検証結果・未実施項目を記載し、Issueを参照する。closeが許可されていなければ`Refs`を使う。
- 作成したPRをchatへattachし、PR本文・head等をread-backする。結果報告・再レビュー依頼も現在の許可範囲で行い、投稿結果を再取得する。
- 最新headへのレビュー依頼がなければ許可範囲で依頼する。レビュー修正には[iidx-github-review-fix](../iidx-github-review-fix/SKILL.md)を使い、WORKFLOW.md section 11.2で最新headのレビュー・必須CIを確認する。旧headの成功や待機中を完了扱いにしない。
- 定期監視は依頼された場合だけ利用可能なautomation toolで設定し、対象PRと追跡のみ/修正可能の操作範囲を保存する。merge・release・Issue close・cleanupへ進まない。

## 報告と振り返り

結果報告前にWORKFLOW.md section 11.3で振り返る。報告は変更概要、受け入れ条件の確認根拠、検証結果・未実施理由、仕様との差異・残件、振り返りを簡潔に示す。commit・push・PR・レビュー待ちの現在状態も区別する。振り返りだけを理由に契約外のスキル編集や外部投稿を追加しない。
