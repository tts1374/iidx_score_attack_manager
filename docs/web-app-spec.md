# スコアタログ 仕様書（現行コードベース）

最終更新: 2026-02-23  
対象リポジトリ: `iidx_score_attack_manager`

## 1. システム概要
- アプリ名: スコアタログ
- 目的: beatmania IIDX の大会定義共有、および譜面ごとの提出画像（エビデンス）管理
- 保存方式: サーバー同期なし。大会データ・画像・曲マスタは端末ブラウザ内（OPFS + SQLite）に保存
- 実装方式: PWA（Service Workerあり）、単一タブ運用（Web Locks）

## 2. リポジトリ構成
- `packages/web-app`: フロントエンド（Vite + React + TypeScript + MUI）
- `packages/db`: DBアクセス層（SQLite WASM + OPFS）
- `packages/shared`: 共有ロジック（payload正規化/検証/ハッシュ/日付）
- `packages/pwa`: Service Worker登録・更新適用ヘルパー
- `scripts`: 曲マスタ同期スクリプト、ローカルモック配布サーバー

## 3. 実行前提・対応条件
### 3.1 必須
- Web Locks API
- OPFS (`navigator.storage.getDirectory`)
- `crossOriginIsolated = true`（COOP/COEP）
- WebAssembly
- Service Worker

### 3.2 推奨
- Chromium系ブラウザ（OPFS挙動が安定）

### 3.3 非対応時
- 起動停止画面（`UnsupportedScreen`）を表示し、理由を列挙
- Service Worker導入失敗時は専用エラー画面を表示し、再読み込み・キャッシュ削除案内を提供

## 4. 起動シーケンス
1. 初回同意画面（`tutorial_done` 未設定時のみ）を表示
2. 本番時のみ Service Worker の controller 獲得を待機（タイムアウト 9秒）
3. 本番時 `crossOriginIsolated` が false ならタブ内1回だけ再読込を試行
4. ランタイム機能チェック（Web Locks/OPFS/WASM/SW/COI）
5. Web Locks名 `iidx-score-attack-web-lock` で排他取得
6. DB初期化 (`file:app_data.sqlite?vfs=opfs`, `user_version=2`)
7. サービス初期化（`AppDatabase`, `SongMasterService` 生成）
8. 画面描画開始

補足:
- 別タブ起動中に取り込みURLを開いた場合、既存タブへの「取り込み委譲」を試行
- 委譲経路: `BroadcastChannel` → `localStorage(storage event)` フォールバック

## 5. ルーティング仕様（手動スタック管理）
SPAルーターは使用せず、`routeStack` で画面遷移を管理。

- Home: `/{base}/`
- 大会作成: `/{base}/tournaments/new`
- 取込確認: `/{base}/import/confirm?p=<payload>`

`base` は `VITE_BASE_PATH` から解決（未指定時 `/iidx_score_attack_manager/`）。

## 6. 画面仕様

<a id="ui-text-design"></a>
### UIテキスト・情報表示の改善方針（#86 / #87）

2026-11-08時点の初期設計。共通原則は `AGENTS.md` の「UI Text And Information」を正本とする。以下は設計時のソースと翻訳の確認結果と改善順序であり、改修後の画面仕様ではない。同日の人間確認で取込確認の先行と後続Issue 1件の作成が承認され、[#89](https://github.com/tts1374/iidx_score_attack_manager/issues/89)を作成した。#89の代替プレビューによる変更前後レビューと指摘反映後の人間承認は同日に完了した（6.4参照）。

#### 確認範囲と代表的な観測

`packages/web-app/src/` の画面コンポーネント、表示に使われる翻訳キー、`i18n/glossary.ts`、本仕様書の画面記述を確認した。独立したワイヤーフレームは `docs/` に見つからなかった。実画面スクリーンショットは未取得であり、以下はソースに基づく調査結果である。画面別Issueでは実画面または再現可能な代替プレビューで配置・説明量を確認する。

| 対象 | 現在の表示・条件（ソースの根拠） | 改善観点・維持する情報 |
| --- | --- | --- |
| Home | `HomePage.tsx` は空一覧で「表示できるスコアタがありません。」と探索/フィルタ操作を表示。`components/TournamentSummaryCard.tsx` は未登録・未共有件数を表示 | 説明の追加・削除を急がず、空一覧と絞り込みの理解を画面で判断。期間・進捗を残す |
| 取込確認 | `ImportConfirmPage.tsx` は新規/既存を要約する一方、プレビューがあれば常に「登録済みの画像は保持されます」「同一大会は更新されます」を表示。翻訳にある「譜面のみ」「名前/期間等は更新されない」の説明はこの画面から参照されない | 新規には不要な更新注意を出さず、既存には追加される内容と保持される内容を判断できるようにする。取込処理は変更しない |
| 取込エラー | 同画面はエラーコードとメッセージを通常表示し、翻訳に「ペイロード」「gzip」「UUID一致」が含まれる。譜面解決失敗時は `chart:…` を表示。曲データ不足等では設定への操作を表示 | 利用者向けの原因と可能な次の操作を主表示にする。診断用コード/IDは必要に応じ詳細へ。拒否理由・実行不可・曲データへの対処を残す |
| 大会作成 | `CreateTournamentPage.tsx` の未選曲行に「曲を選択するまで変更できません。」「曲を選択すると選べます。」が並ぶ。確認画面には「大会ID」とコピー操作 | 補助文の重複とIDの通常表示の必要性を画面で確認。必須入力・選択不可の理由・重複譜面エラー・「確定後は内容を編集できません。」を残す。IDコピーの用途を確認せず削除しない |
| 画像登録 | `SubmitEvidencePage.tsx` は選択操作、プレビュー、保存状態と「画像はこの端末内にのみ保存されます」を表示 | 保存と提出の用語・次の操作を大会詳細とそろえる。端末内保存の注意は公開範囲の判断に必要であり、単なる重複説明として削除しない |
| 大会詳細・共有/提出 | `TournamentDetailPage.tsx` は共有済/未共有/未登録を集計し、大会共有に「大会の情報のみ共有します」、提出に保存済み画像の対象件数を表示。再提出時は上書き注意を表示 | 大会定義の共有と画像の提出で、対象・端末外への共有・完了状態の意味が分かるか確認。辞書内の文言だけから表示済みの注意を推定しない |
| 設定・初期化 | `SettingsPage.tsx` は異常理由がある場合に「ヘルスサマリ」と「OPFS: アクセス失敗」「DB整合性: エラー」等を表示。技術カードはデバッグ時のみ。初期化には削除対象・復元不可・二段階確認がある | 通常の異常表示を利用者向けにする。既存の技術情報の分離を活用し、削除対象、画像のみ削除する容量整理/自動削除との違い、復元不可を残す |
| 起動エラー | `main.tsx` は特定の初期化失敗時に `common.bootstrap.opfs_vfs_init_failed`（OPFS VFS・COOP/COEP）を表示 | 発生状況で原因と対処を理解できる表現にする。起動処理は高リスクのため、設定の画面修正へ混在させず別途判断する |

本仕様書6.5の「手動で送信完了」と、現在の大会詳細の提出操作・完了表示には差がある。後続Issueでは現在の実装と再現結果を基準に表示を判断し、仕様書の古い記述や未参照の翻訳を根拠に機能を復活させない。

#### 優先順位とIssue分割案

| 順位 | 改善単位 | 理由・確認する状態 | 依存関係 |
| --- | --- | --- | --- |
| 1（初回作成候補） | 大会取込・取込確認の情報整理 | 新規/既存の効果を誤認しやすく、実装用語も表示される。新規、既存へ譜面追加、追加なし、検証中、期間不一致、曲データ不足/不明譜面、不正リンクを確認 | 本設計の人間確認後。取込入口は確認画面と用語をそろえる最小範囲 |
| 2（候補） | 大会詳細の提出・共有と画像登録 | 保存/提出/共有の対象と進捗を同じ操作の流れで判断する。未登録、保存中/失敗、未共有、共有済、再提出、共有キャンセル/失敗、端末保存への代替を確認 | 初回の人間レビューで得た知見を反映してから契約を確定 |
| 3（候補） | 設定の異常表示と初期化・容量整理 | 原因・対処を利用者の言葉へそろえつつ削除範囲の誤認を防ぐ。正常/異常、容量不足、削除対象なし、二段階確認、実行不可、失敗を確認 | 先行画面の知見を反映。削除・永続化処理は既存のまま |

Home・大会作成・起動エラーは候補として保留する。Homeはソース確認だけでは優先改修の根拠が弱い。大会作成は補助文とIDの用途を画面で確認して必要分を切り出す。起動エラーは表示修正で完結するかと専用の検証範囲を先に確認する。最初に作成するのは順位1の1件を推奨し、残りは先行レビュー後に必要性を判断する。

#### 初回の画面別Issue（対象確認済み・#89作成済み）

実装契約の正本は [#89](https://github.com/tts1374/iidx_score_attack_manager/issues/89)。以下は設計時の範囲と受け入れ方法の要約であり、以後の契約変更はIssueで確認する。

**Objective:** 取り込むと何が追加され何が残るか、失敗時に何をすればよいかを、利用者が確認画面で判断できるようにする。親は #86、設計は #87。

**Scope:** `ImportConfirmPage.tsx` を中心とした表示条件と文言、取込入口の関連ラベル、ja/en/koの対応文言。新規/既存の要約と注意の重複を整理し、既存の場合は不足譜面のみ追加し、名前・開催者・期間・ハッシュタグと登録画像を保持することを伝える。異常時は利用者向けの理由と利用可能な対処を表示し、診断用コード/IDを必要に応じ詳細へ分ける。

**Non-scope:** 取込受理条件、マージ処理、payload、DB、起動/排他の変更。翻訳辞書全体の整理。

**Acceptance criteria:**
- 新規取込では新規作成の効果が分かり、既存更新の注意を表示しない。
- 既存取込では譜面の追加と保持される内容が分かり、名前や期間が上書きされると誤認させない。追加なしの場合も事実に沿って表示する。
- 検証中/失敗時は取込を実行できず、理由と可能な次の操作が分かる。通常の説明を内部用語だけで済ませない。
- ja/en/koで意味・変数・操作可能条件がそろい、読み上げ用ラベルを維持する。
- 下記の変更前後の提示と人間レビューを経て、説明量・操作性・重要情報の維持が承認されている。

**Required tests:** 新規/既存への譜面追加/追加なしで表示と既存の取込結果を確認する。期間不一致、曲データ不足、不明譜面、不正リンクで実行不可と対処表示を確認し、画像保持とメタ情報非更新を回帰確認する。変更範囲の型検査またはビルド・lint・関連テストを行う。

**Manual validation / Deliverable:** 同じ入力・言語・画面幅で変更前後の実画面を提示する。主な正常/異常状態を含め、ja/en/koの折返し・操作名も確認する。取得困難なら未取得と理由を明記し、同じ状態を再現できるプレビューと手順を提示する。実装・検証・比較資料を成果物とし、人間が説明量、分かりやすさ、操作性、重要情報の欠落を確認する。承認前は画面改善を完了扱いにしない。

#### 後続画面への引き継ぎ

各画面別Issueに、変更前後の提示 → 人間レビュー → 指摘修正/必要な共通原則の更新 → 過去画面への遡及判定、を受け入れ方法として記載する。一般化できる知見だけ `AGENTS.md` の原則を更新する。重大な誤認・重要情報の欠落は優先して別Issueへ切り出し、軽微な候補は #86 に集約して必要時にまとめる。既存Issueは原則再オープンしない。#86の完了前に、承認済み画面全体の整合と遡及漏れを確認する。

## 6.1 Home（大会一覧）
- タブ: 開催中 / 開催前 / 終了
- カード表示情報:
  - 大会名、開催者
  - 登録進捗（`submittedCount / chartCount`）
  - 送信待ちバッジ（`sendWaitingCount > 0` の場合）
  - 開催中タブのみ残日数表示
- 開催中タブの並び順:
  1. 送信待ちあり
  2. 未登録あり
  3. 全登録済み
  4. 締切日昇順、開始日昇順、名前順
- FAB操作:
  - 大会作成
  - 大会取込

## 6.2 大会作成（3ステップウィザード）
### Step 1: 基本情報
- 入力項目: 大会名、開催者、ハッシュタグ、期間
- 制約:
  - 大会名/開催者: 必須、50文字以内
  - ハッシュタグ: 必須（`#`除去・空白除去後で判定）
  - 期間: 終了日 >= 開始日、終了日は今日以降
- 補助: 「来月（1日〜月末）」ワンタップ設定

### Step 2: 対象譜面
- 譜面行は最大4件
- 各行:
  - 曲検索（prefix検索、最大30件）
  - プレイスタイル（SP/DP）
  - 難易度選択
- 制約:
  - 同一 `chart_id` の重複選択禁止
  - `is_active=1` かつ `level != 0` の譜面のみ選択可

### Step 3: 確認
- 基本情報・譜面一覧の最終確認
- 作成時、`createTournament` を実行

## 6.3 大会取込
- 入力方式:
  - テキスト（URL/ペイロード）
  - ファイル（画像/テキスト/JSON）
  - QRカメラ読み取り（Secure Context + `getUserMedia` 必須）
- 画像取込時は `jsQR` でQR文字列抽出
- 取込リンクは `?p=<base64-gzip payload>` を利用

## 6.4 取り込み確認
確認画面の「取込内容」には、新規ならこの端末へのスコアタ追加、既存なら不足譜面の追加件数と保存済みの取込先名を本文として示す。既存の名前・開催者・期間・ハッシュタグ・登録画像の保持は、小さく薄い補助文で示す。追加なしの場合は保存済みの内容が変わらないことを示す。検証失敗時は理由と対処をエラーダイアログに表示し、「OK」でキャンセルと同じ戻る操作を行う。曲データ不足・不明譜面には「設定を開く」も表示し、取得/更新後に元のリンクを再度開くよう案内する。それ以外は共有元の最新リンクを開くよう案内する。診断用コード・不明譜面ID・予期しないエラーの詳細は、折りたたまれた技術情報に表示する。検証中・失敗時は取込不可。

この表示改善（#89）は、2026-11-08に実際の画面部品・翻訳・スタイルを使う代替プレビューで変更前後を提示し、人間レビューを実施した。見出しの短縮、保持情報の補助文表示、エラーダイアログ化と「OK」で戻る操作を反映した修正版が承認された。実アプリの起動・OPFSを使う実画面キャプチャは未取得。今回の判断は既存の共通原則（ラベル・配置の改善、必要な状況でのエラー表示、重要情報の維持）で扱えるため、原則の追記は不要。初回の改善対象のため、遡及先となる承認済み画面はない。

検証手順:
1. URL `p` パラメータ存在チェック
2. URLデコード + URL-safe base64補正 + gzip展開 + JSONパース
3. payload正規化/検証（`v=1`、項目・型・制約）
4. 終了済み大会の拒否
5. 曲マスタ有無チェック
6. 譜面IDが曲マスタに存在するか検証
7. 既存大会（`source_tournament_uuid` or `tournament_uuid`一致）判定
8. 既存大会と期間不一致なら拒否

インポート結果:
- `imported`: 新規大会作成
- `merged`: 既存大会に不足譜面のみ追加（大会メタ情報は更新しない）
- `unchanged`: 差分なし
- `incompatible`: 期間矛盾

主なエラーコード:
- `INVALID_PARAM`
- `DECODE_ERROR`
- `DECOMPRESS_ERROR`
- `JSON_ERROR`
- `SCHEMA_ERROR`
- `TOO_LARGE`
- `EXPIRED`
- `MASTER_MISSING`
- `CHART_NOT_FOUND`
- `UNSUPPORTED_VERSION`

## 6.5 大会詳細
- 概要表示: 大会名、期間、進捗、最終更新日時
- 譜面一覧:
  - 状態: 未登録 / 登録済 / エラー
  - 送信待ち表示（`needs_send=1`）
  - 開催中のみ「登録/差し替え」ボタン表示
- 共有:
  - 非インポート大会のみ「大会を共有」表示
  - 宣伝画像（1080x1920 PNG）を生成しQR埋め込み
  - Web Share API / 画像保存 / テキストコピー対応
- 送信:
  - 送信待ち画像をまとめて共有・端末保存
  - 送信メッセージ共有/コピー
  - 手動で「送信完了にする」実行時のみ `needs_send=0` へ更新

## 6.6 スコア提出
- 画像選択: カメラ or ギャラリー
- 保存時:
  1. JPEGへ再エンコード（品質 0.92）
  2. SHA-256算出
  3. OPFSへ原子的保存（tmp→検証→置換）
  4. `evidences` を upsert（更新時 `update_seq+1`, `needs_send=1`）
- 削除時:
  - ファイル削除 + `file_deleted=1`, `needs_send=0`

## 6.7 設定
- 曲データ:
  - 更新確認（`latest.json` 取得・比較）
  - 再取得（キャッシュ破棄）フロー
- 容量:
  - 使用量表示（概算）
  - 容量整理（削除見積り→最終確認→削除実行）
  - 自動削除設定（終了後N日、1〜3650）
- アプリ:
  - バージョン、ビルド時刻、SW状態
  - 更新がある場合は即時適用可能
- デバッグ:
  - アプリ版本体を 7 回タップで切替
  - 技術情報・ログコピーを表示
- 危険操作:
  - ローカル初期化（二段階確認 + 確認文字列「削除」）

## 7. データ仕様（Payload）
### 7.1 フォーマット
```json
{
  "v": 1,
  "uuid": "uuid-v4",
  "name": "大会名",
  "owner": "開催者",
  "hashtag": "ハッシュタグ",
  "start": "YYYY-MM-DD",
  "end": "YYYY-MM-DD",
  "charts": [12345, 23456]
}
```

### 7.2 制約
- `charts` は 1〜4 件、正整数、重複不可
- `name/owner/hashtag` は正規化後 1〜50 文字
- `start <= end`
- バージョンは `v=1`

### 7.3 エンコード
- `JSON -> gzip -> base64`
- 圧縮後上限: 4096 bytes
- 展開後上限: 16384 bytes

### 7.4 `def_hash`
- payload正規化後、`charts` を昇順ソートした canonical JSON に対し SHA-256 を計算

## 8. DB仕様
## 8.1 アプリDB
- ファイル: `app_data.sqlite`
- 接続URI: `file:app_data.sqlite?vfs=opfs`
- `PRAGMA user_version = 2`

## 8.2 テーブル
### `tournaments`
- 主キー: `tournament_uuid`
- 主要列:
  - `source_tournament_uuid`（インポート元UUID、UNIQUE）
  - `def_hash`
  - `tournament_name`, `owner`, `hashtag`
  - `start_date`, `end_date`
  - `is_imported`

### `tournament_charts`
- `(tournament_uuid, chart_id)` UNIQUE

### `evidences`
- `(tournament_uuid, chart_id)` UNIQUE
- 主要列:
  - `file_name`, `sha256`, `width`, `height`
  - `update_seq`
  - `needs_send`（送信待ちフラグ）
  - `file_deleted`, `deleted_at`

### `app_settings`
- `key`, `value` のKVS

## 8.3 画像パス
- 画像実体: `evidences/{tournament_uuid}/{chart_id}.jpg`

## 8.4 整合性処理
- 起動時 `reconcileEvidenceFiles`:
  - DB上 `file_deleted=0` でも実ファイル欠損なら `file_deleted=1`, `needs_send=0`
- 自動削除:
  - `tournaments.end_date <= thresholdDate` の画像を削除対象化

## 9. 曲マスタ仕様
## 9.1 配置
- 配置先: `song_master/`
- メタファイル: `song_master/latest_meta.json`

## 9.2 更新フロー
1. `latest.json` を `cache: no-store` で取得
2. `schema_version` が `VITE_SONG_MASTER_SCHEMA_VERSION` と一致するか検証
3. SQLite本体をダウンロード
4. `byte_size`, `sha256` 検証
5. OPFSへ原子的保存
6. SQLiteヘッダおよび `SELECT 1` で妥当性確認
7. `app_settings` と `latest_meta.json` を更新

## 9.3 更新結果
- `initial_download`
- `github_download`
- `up_to_date`
- `local_cache`（更新失敗時に既存キャッシュ継続）

## 9.4 取得元
- 開発時: `http://localhost:8787/song-master/*`
- 本番時: `/{base}/song-master/*`（デプロイ成果物に同梱）

## 10. PWA / Service Worker
- キャッシュ名: `iidx-app-shell-v2`
- SWバージョン応答: `2026-02-18-1`
- `install`: App Shell キャッシュ
- `activate`: 旧キャッシュ削除 + `clients.claim()`
- `fetch`:
  - 曲マスタ `latest.json/.sqlite` は `no-store` で常にネットワーク
  - ナビゲーションはネットワーク優先、失敗時 `index.html` フォールバック
  - その他はキャッシュ優先
- SW更新:
  - `update_available` 時に UI から `SKIP_WAITING`
  - `controllerchange` 後に再読込

## 11. デプロイ・運用
## 11.1 ビルド
- `pnpm --filter @iidx/web-app build`
- `postbuild` で `dist/index.html` を `dist/404.html` にコピー（GitHub Pages SPA直リンク対策）

## 11.2 ワークフロー
- `deploy-prod.yml`
  - トリガー: tag push / manual
  - `VITE_BASE_PATH=/iidx_score_attack_manager/`
  - `sync-song-master-assets.mjs` 実行後、Pagesへデプロイ
- `deploy-stg.yml`
  - トリガー: `main` push / manual
  - `VITE_BASE_PATH=/iidx_score_attack_manager-stg/`
  - 別リポジトリ `iidx_score_attack_manager-stg` に `dist` force push
- `build-song-master.yml`
  - トリガー: 毎日 `19:00 UTC` + manual
  - 最新タグを checkout して曲マスタ資産更新後、Pages再デプロイ

## 12. 環境変数
- `VITE_BASE_PATH`: 配布ベースパス（末尾 `/` へ正規化）
- `VITE_SONG_MASTER_SCHEMA_VERSION`: 必須schema version（正整数）

`.env.example`:
```bash
VITE_SONG_MASTER_SCHEMA_VERSION=33
```

## 13. 既知の制約
- 単一タブ前提（Web Locks未対応環境は利用不可）
- データはローカル端末にのみ保存され、クラウド同期機能はない
- QRカメラ読取はSecure Context必須
- 共有/送信の成否は外部アプリ依存のため、最終的な「送信完了」はユーザー操作で確定
