---
name: iidx-issue-start-prompt
description: IIDX Score Attack Managerの指定Issueを別チャットで進めるための開始指示文を作る。その場でのIssue実装やIssue本文作成には使わない。
---

# IIDX Issue Start Prompt

別チャットへ渡せる簡潔な日本語の指示文を1つ作る。現在の[AGENTS.md](../../../AGENTS.md)と[WORKFLOW.md](../../../WORKFLOW.md)を適用する。

1. 指定Issueの本文・状態・URLを取得する。番号だけならrepository文脈から特定し、曖昧・取得不能なら推測しない。closed/置換済みIssueを通常の新規実行対象にしない。
2. 引き継ぎに必要なbranch・既存変更・前提PRのmergeは読み取りで確認する。ユーザー申告と確認済み事実を区別する。
3. 冒頭でIssue URL、本文を作業契約とすること、最新のAGENTS.mdと[iidx-implement-github-issue](../iidx-implement-github-issue/SKILL.md)に従うことを示す。調査・仕様確定・追跡のみなら、その成果物と操作制限を指定する。
4. Issue固有の誤りやすい点と、現在のユーザー制限だけを足す。Scopeや受け入れ条件の全文、一般チェックリストを再掲しない。
5. 次チャットの操作範囲はWORKFLOW.mdのIssue実行既定範囲と現在の明示制限へ委ねる。指示文作成時の読み取り限定を実行者の修正禁止へ転記せず、merge・release・cleanupの許可も創作しない。
6. コピーして使える指示文だけを返す。確認制約の説明が必要な場合だけ短く前置きする。

この依頼では指示文を作る。Issue実装、branch作成、commit、push、PR作成、外部投稿、監視開始へ進まない。未確定判断は実行者が根拠と選択肢を示すよう指示し、プロンプト作成中に仕様を決めない。
