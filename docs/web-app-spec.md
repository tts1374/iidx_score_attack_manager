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
