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

## 曲マスタ配布のローカルモック
```bash
node scripts/mock-song-master-server.mjs --sqlite ./song_master.sqlite --schema 33 --port 8787
```

`packages/web-app/.env.example` を `packages/web-app/.env.local` にコピーし、`VITE_SONG_MASTER_SOURCE` を `web` または `mock` に設定してください。  
デフォルト想定は `web`（GitHub Releases latest）です。
開発時の `web` モードは Vite プロキシ経由で取得します。

詳細は `docs/web-app-spec.md` を参照してください。
