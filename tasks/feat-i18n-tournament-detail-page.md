# feat/i18n-tournament-detail-page plan

- [x] TournamentDetailPage の直書き表示文字列を全抽出し、`tournament_detail.*` のキー設計を確定する。
- [x] `TournamentDetailPage.tsx` の表示文字列を `t()` / `common.*` へ置換し、named placeholder に統一する。
- [x] `ja` を SSOT として `en` / `ko` に `tournament_detail` 辞書を追加する。
- [x] 文言依存テストがある場合のみ最小修正し、言語切替で壊れない形へ調整する。
- [x] 対象テスト実行と差分監査を行い、宣言スコープ外変更がないことを確認する。
