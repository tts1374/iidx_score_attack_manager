# iidx_score_attack_manager (Web)

大会・エビデンス管理システムのWeb版実装です。

## 要件
- React + TypeScript
- SQLite WASM + OPFS 永続化
- PWA (Service Worker)
- Web Locks API による単一タブ排他

## ワークスペース
- `packages/web-app`
- `packages/shared`
- `packages/db`
- `packages/pwa`

## コマンド
```bash
pnpm install
pnpm dev
pnpm build
pnpm test
```

## i18n 運用ルール
- 新規の表示文言は必ず i18n キーを追加し、UI 直書きを禁止する
- i18n キーは不変とし、文言修正時は辞書 (`ja/en/ko`) のみ更新する
- 文字列連結で文を組み立てず、辞書で完結させる
- プレースホルダは named 形式 (`{{days}}`) を必須とする
- `ja` を SSOT とし、`en/ko` は初回 AI 翻訳後に辞書で調整する
- 用語揺れ防止は `packages/web-app/src/i18n/glossary.ts` を使い、AI 翻訳後に手動で照合する

## 曲マスタ配布のローカルモック
```bash
node scripts/mock-song-master-server.mjs --sqlite ./song_master.sqlite --schema 33 --port 8787
```

`packages/web-app/.env.example` を `packages/web-app/.env.local` にコピーし、`VITE_SONG_MASTER_SOURCE` を `web` または `mock` に設定してください。  
デフォルト想定は `web`（GitHub Releases latest）です。
開発時の `web` モードは Vite プロキシ経由で取得します。

詳細は `docs/web-app-spec.md` を参照してください。

## GitHub Pages デプロイ
- 公開先は Project Pages を想定: `https://<user>.github.io/iidx_score_attack_manager/`
- Vite の `base` は `packages/web-app/vite.config.ts` で `'/iidx_score_attack_manager/'` に設定済み
- デプロイ運用:
  - `build-song-master.yml`: 毎日 `19:00 UTC`（`04:00 JST`）に起動。最新タグのコードを checkout して曲マスタ資産のみ更新し、PROD に反映
  - `deploy-stg.yml`: `main` への push（マージ）時に STG へ反映
  - `deploy-prod.yml`: tag push 時に PROD へ反映
  - `VITE_BASE_PATH` で配布先の base path を切り替え（prod: `/iidx_score_attack_manager/`, stg: `/iidx_score_attack_manager-stg/`）
- GitHub 側設定:
  - `Settings -> Pages -> Source` を `GitHub Actions` に設定

## SPA 直リンク対策
- 方式 A（404 フォールバック）を採用しています。`BrowserRouter` 相当の URL を維持したいためです。
- `packages/web-app/package.json` の `postbuild` で `dist/index.html` を `dist/404.html` にコピーします。
- これにより `/<repo>/some/path` への直リンクでも `index.html` が返り、クライアント側ルーティングで画面表示できます。
