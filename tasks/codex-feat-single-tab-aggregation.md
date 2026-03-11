# Plan: codex/feat-single-tab-aggregation

## 実行コンテキスト

- worktree: `C:/work/score_attack_manager/iidx_score_attack_manager-codex-single-tab-aggregation`
- branch: `codex/feat-single-tab-aggregation`
- BASE_SHA: `20943369062657cd332f384424f64a4d12cfe242`

## 目的

- 取込確認画面の既存委譲仕様を維持したまま、通常導線にも単一タブ集約を拡張する。
- 既存主タブが生存している場合は通常導線を既存主タブへ集約し、タブ乱立を抑制する。
- 既存主タブが応答不能な場合は現在タブを正規タブとして起動継続できるようにする。

## 非目的

- Web Locks 以外の単一タブ制御方式追加。
- 通常導線での payload 受け渡しや、既存主タブの画面遷移要求追加。
- import payload 形式、DB schema、PWA戦略、依存関係の変更。

## 変更点

- `packages/web-app/src/utils/import-delegation.ts`
  - 既存 import 委譲メッセージ規約に合わせて、通常導線の「生存確認 + フォーカス誘導」用の最小メッセージ型を追加する。
  - 既存 timeout 定数はそのまま流用し、新規 timeout 定数は追加しない。
- `packages/web-app/src/main.tsx`
  - 既存の import 委譲送信処理を再利用しつつ、通常導線向けの集約送信処理を追加する。
  - ロック取得失敗時:
    - import-confirm 到達時は従来どおり URL 委譲画面を表示。
    - 通常導線はフォーカス誘導のみを行う集約画面へ遷移。
    - 応答なし時は現在タブを正規タブとして再試行起動する。
- `packages/web-app/src/App.tsx`
  - 既存主タブ（`webLockAcquired === true`）で、通常導線向け通知を受信して ACK 返却 + `window.focus()` 誘導を行う。
  - 通常導線受信でアプリ状態変更・画面遷移を行わないことを保証する。
- `packages/web-app/src/utils/import-delegation.test.ts`
  - 通常導線メッセージ型・storage パースのテストを追加する。

## 影響範囲（ユーザー / データ / 互換性 / 起動）

- ユーザー:
  - 通常導線で二重起動した場合、既存主タブへの集約案内画面が表示される。
  - import-confirm 画面の既存 UX は維持される。
- データ:
  - DB・payload 互換性への影響なし。
- 起動:
  - `main.tsx` のロック失敗時分岐を拡張するため、起動導線に影響あり（高リスク扱い）。
- 互換性:
  - `BroadcastChannel` 非対応時は既存 storage フォールバックを維持。

## 対象ファイル / 対象パッケージ

- 対象パッケージ: `packages/web-app`
- 対象ファイル:
  - `packages/web-app/src/utils/import-delegation.ts`
  - `packages/web-app/src/utils/import-delegation.test.ts`
  - `packages/web-app/src/main.tsx`
  - `packages/web-app/src/App.tsx`

## テスト観点

- Web Locks 排他:
  - 既存タブありでロック失敗時、通常導線は委譲画面へ進む。
- 通常導線集約:
  - ACK 受信時に成功扱いとなり、現在タブは閉じる導線を提示する。
  - 受信側は状態変更・画面遷移せず、フォーカス誘導のみ行う。
- 失敗時昇格:
  - ACK 未受信時は現在タブを正規タブとして起動可能である。
- import-confirm 回帰:
  - 既存 import URL 委譲（broadcast/storage）が継続動作する。
- utility:
  - 追加メッセージ型のバリデーション/パースが通る。

## ロールバック方針

- 本タスクのコミットを順に `git revert` し、起動導線を従来状態へ戻す。
- 追加メッセージ型は revert で同時に除去され、データ互換性影響は残らない。

## コミット分割計画

1. plan: `tasks/codex-feat-single-tab-aggregation.md` を追加。
2. delegation-util: 通常導線用メッセージ型とテストを追加。
3. runtime-flow: `main.tsx` / `App.tsx` を最小差分で更新。
4. verify: 必要最小の検証実施と差分確認。
