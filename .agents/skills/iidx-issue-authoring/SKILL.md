---
name: iidx-issue-authoring
description: IIDX Score Attack Managerの観測した課題・確定した仕様を実装可能なIssue本文へ固定するときに使う。Issue実装や主要判断が未確定のアイデア整理は対象外。
---

# IIDX Issue Authoring

現在必要な作業を実装者が判断・検証できる契約へ固定する。ルートの[AGENTS.md](../../../AGENTS.md)、[WORKFLOW.md](../../../WORKFLOW.md)、[QUALITY.md](../../../QUALITY.md)と対象のnested規則を適用する。確認済みの同一内容は再読込しない。

## 契約を固める

- 観測した不具合、現在必要なユーザー価値、確定した判断を根拠にする。直接関連するコード・仕様だけから確認を始める。
- 親Issueは背景・依存・全体の境界を確認し、今回取り込む項目を明示する。将来要件や親の未採用項目を追加しない。
- 複数方式が受け入れ条件を満たす場合は外部挙動と制約だけを固定し、内部構造や新しい抽象化を指定しない。
- 主要判断が未確定なら、確定部分と未決定部分を分ける。人間判断が必要な場合だけAGENTS.mdの`WAITING_FOR_HUMAN_DECISION`形式を使い、独立して進められる本文は先に用意する。

## 本文を作る

[実装Issueテンプレート](../../../.github/ISSUE_TEMPLATE/implementation-task.md)を使い、不要な節・空節・重複を削除する。

- Objective: 達成する価値または観測した不具合。
- Scope / Non-scope: 成果物と、現実的な誤実装を防ぐ範囲境界。
- Acceptance criteria: 観測・検証できる完了条件。
- Required tests / Manual validation: 今回の正常系・境界/異常系・回帰と、必要な画面・実機確認。QUALITY.mdを重複列挙しない。
- Deliverable: 実装、調査、仕様確定など、今回返す成果物。

高リスク領域ではWORKFLOW.mdのPlan条件とQUALITY.mdの該当確認を反映する。Issue作成だけで実行計画ファイルや実装を開始しない。

## 検証と引き渡し

- Scope・受け入れ条件・検証が対応し、Issue外の機能やrefactorを要求していないか確認する。
- 訂正・却下のある完成文面では[iidx-pink-elephant-guard](../iidx-pink-elephant-guard/SKILL.md)で現在の契約へ整える。
- 本文作成依頼ならコピー可能な本文を返す。GitHubへの作成・更新は許可された場合だけ行い、操作後に本文・URL・状態をread-backする。
