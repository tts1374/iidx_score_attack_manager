# Issue #73: 取込済みスコアタを公開一覧から除外

## 目的

Issue #73「既に取込済みのスコアタは公開スコアタ一覧に表示しない」を正本とし、端末内に取込済みのスコアタを公開スコアタ一覧から除外する。

## Execution mode

- Current request boundary: `implementation-authorized`
- Plan Mode: 必須
- 判定理由: 公開一覧の shared contract、公開カタログ API、web-app をまたぐクロスレイヤ変更になるため
- このファイルは実装ブランチおよび PR に含める

## In scope

- 公開一覧項目に、取込元を識別できるスコアタ UUID を含める
- ローカル大会一覧から取込済みスコアタの `sourceTournamentUuid` を収集する
- 公開一覧の UUID がローカルの取込済み UUID と一致する項目を表示対象から除外する
- 初回表示、検索結果、追加読込のすべてに同じ除外条件を適用する
- 除外後の項目数を表示件数に反映する
- 取得ページが全件除外された場合も、後続ページがあれば表示可能項目または終端まで取得を継続する
- shared、API、web-app の関連テストを更新する

## Out of scope

- DB schema、`user_version`、migration の変更
- import/export 形式、`def_hash` 算出、保存方式の変更
- 公開カタログ API 側で端末別・利用者別の取込状態を保持すること
- 既存データの補正または再取込
- 公開スコアタの登録、削除、検索条件そのものの変更
- Web Locks、Service Worker、COOP/COEP、起動導線の変更

## Non-goals

- ローカルで作成・公開しただけのスコアタを非表示にしない
- 名前、期間、ハッシュタグなど UUID 以外の類似条件では取込済み判定を行わない
- 一覧から除外したスコアタの公開データを削除しない
- multi-tab 対応や単一タブ排他の変更を同時に行わない

## 変更点

### Shared contract / public catalog API

- `PublicTournamentListItem` に元 payload の UUID を表す必須フィールド `tournamentUuid` を追加する
- 公開カタログ repository が保存済み `payload_json` の `uuid` を一覧項目へ設定する
- 一覧 API のレスポンスと web-app クライアントのレスポンス検証を新フィールドへ追随させる
- UUID が欠落または不正な一覧レスポンスは、既存方針どおり不正レスポンスとして扱う

### Web app

- active / upcoming / ended のローカル大会から、`isImported === true` かつ `sourceTournamentUuid` が存在する UUID の `Set` を生成する
- この Set を `PublicCatalogPage` に渡し、API 取得結果を state へ追加する前に除外する
- 初回取得、検索、追加読込で共通のフィルタ処理を使用する
- 全件除外されたページに `nextCursor` がある場合は後続ページを取得し、表示可能項目が得られるか終端へ達するまで継続する
- ローカル作成大会の `tournamentUuid` や公開用 `publicId` は、取込済み判定には使用しない

## 影響範囲

- ユーザー: 取込済みスコアタが公開一覧に再表示されず、重複取込の導線が減る
- データ: 読み取りと画面上のフィルタのみ。ローカル DB、公開データとも更新しない
- 互換性: 公開一覧レスポンスに必須フィールドを追加するため、shared contract と API/client を同時に更新する
- PWA / 保存 / 起動: 変更なし
- ページング: 除外によって空ページが生じても後続の未取込項目へ到達できるようにする

## 対象ファイル / パッケージ

- `packages/shared/src/public-catalog.ts`
- `packages/public-catalog-api/src/repository/public-tournaments.ts` と関連テスト
- `packages/web-app/src/services/public-catalog-client.ts` と関連テスト
- `packages/web-app/src/App.tsx`
- `packages/web-app/src/pages/PublicCatalogPage.tsx` と関連テスト
- `tasks/codex-issue-73-hide-imported-public-catalog.md`

## 実装手順

- [x] shared の公開一覧 contract に `tournamentUuid` を追加する
- [x] API repository と一覧レスポンステストを新 contract に追随させる
- [x] web-app クライアントのレスポンス検証とテストを更新する
- [x] ローカルの取込済み UUID Set を構築して公開一覧ページへ渡す
- [x] 初回・検索・追加読込へ共通の除外処理と空ページ継続取得を実装する
- [x] UIテストと回帰テストを追加する
- [x] package 単位の検証と差分確認を行う

## Validation plan

- `packages/shared`、`packages/public-catalog-api`、`packages/web-app` の型検査または build
- 公開一覧レスポンスが payload の UUID を `tournamentUuid` として返すこと
- `tournamentUuid` の欠落・不正値をクライアントが拒否すること
- 取込済み UUID と一致する公開項目だけが非表示になること
- 未取込項目とローカル作成項目は表示されること
- 初回表示、検索、追加読込の各経路で除外されること
- 全件除外ページの後に未取込項目がある場合、その項目まで取得して表示すること
- 全候補が除外された場合、適切な empty state になり無限取得しないこと
- 表示件数が除外後の件数と一致すること
- 既存の import、delete、chart preview、検索、ページングテストが通ること
- `git diff --check`、`git diff`、`git status` で目的外差分、BOM、改行ノイズがないこと

## ロールバック方針

- shared contract、API の一覧項目追加、web-app の除外処理を同一 PR 単位で戻す
- DB schema や永続データを変更しないため、データ migration や復旧作業は不要

## コミット分割計画

1. shared contract と公開カタログ API の一覧 UUID 対応
2. web-app の取込済み除外とページング対応
3. 関連テストおよび計画 artifact の更新
