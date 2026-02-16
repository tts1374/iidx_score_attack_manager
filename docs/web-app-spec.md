# 大会・エビデンス管理システム（Web版）実装メモ

## 構成
- `packages/web-app`: Vite + React + TypeScript UI
- `packages/shared`: ペイロード正規化/def_hash/エンコード
- `packages/db`: SQLite WASM + OPFS、スキーマ、リポジトリ
- `packages/pwa`: Service Worker登録、更新適用ヘルパー
- `scripts`: ローカル曲マスタ配布モック

## 起動前提
- `pnpm` ワークスペース
- OPFS対応ブラウザ（Chromium系推奨）
- Web Locks API / WASM / Service Worker

## 実装済み要点
1. 起動時に Web Locks/OPFS/WASM/SW をチェックし、非対応時は停止画面を表示。
2. Web Locks API で `iidx-score-attack-web-lock` を取得し、単一タブ動作を強制。
3. `app_data.sqlite` を `file:/app_data.sqlite?vfs=opfs` で生成し、`user_version=1` を適用。
4. `latest.json` から曲マスタを検証取得（schema_version/sha256/byte_size）。
5. 取り込みは方式2（`source_tournament_uuid + def_hash`）で分岐。
6. エビデンス画像は JPEG 再エンコード + sha256 + OPFS原子的保存（tmp→検証→置換）。
7. 起動時整合性チェック（DBにありファイル欠損なら `file_deleted=1`）。
8. 自動削除設定（終了後N日、実行/保存）。
9. PWA更新導線（更新バナー→`skipWaiting`→`clientsClaim`→再読込）。

## 画面
- Home: 開催中/開催前/終了タブ、並び替え、進捗、残り日数、取込
- 大会作成: 入力 + 曲検索 + 譜面最大4
- 大会詳細: 大会情報、譜面一覧、QR/URL/ファイル共有
- スコア提出: 画像選択→保存
- 設定: 曲マスタ情報、更新確認/強制更新、自動削除

## ローカル曲マスタ配布モック
```bash
node scripts/mock-song-master-server.mjs --sqlite ./song_master.sqlite --schema 1 --port 8787
```

`.env.local` 例:
```bash
VITE_SONG_MASTER_LATEST_URL=http://localhost:8787/song-master/latest.json
VITE_SONG_MASTER_BASE_URL=http://localhost:8787/song-master
VITE_SONG_MASTER_SCHEMA_VERSION=1
```
