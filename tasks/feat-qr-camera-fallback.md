# Task Plan: feat-qr-camera-fallback

## 目的
- QR取込モーダルでカメラ起動失敗時に、安全にURL貼り付けフォールバックできるようにする。
- 常設のテキスト取込導線を廃止し、取込導線を「QR」または「URL直アクセス」に寄せる。
- 失敗時のみ最小ヘルプ（原因と対処）をモーダル内アコーディオンで提示する。

## 非目的
- Import payload仕様・DB schema・既存import確定ロジックの変更。
- Web Locks / Single-tab invariant / Service Worker の変更。
- 依存関係更新・CI/CD変更。
- マルチタブ挙動の設計変更。

## 変更点
- FAB押下時の遷移を「カメラ可否判定でページ遷移」から「常にQR取込モーダル表示」に変更。
- QR取込モーダルに `cameraState`（`initializing`/`ready`/`failed`）を導入。
- `getUserMedia` 失敗時にQRプレビューを非表示化し、URL貼り付けフォールバックUIへ切替。
- フォールバックUIにURL入力・取り込みボタン・失敗時のみの「原因と対処」アコーディオンを追加。
- 既存の「テキスト取込」導線（QRモーダル内ボタン）を削除。
- QR読取結果URLと貼り付けURLを同一の取込ハンドラに流す。
- カメラ停止・スキャナ停止処理をモーダルclose時に必ず実行する。

## 影響範囲
- ユーザー:
  - 取込FAB押下時に常にモーダルが開く。
  - カメラ失敗時は同モーダル内でURL貼り付け取り込みが可能になる。
  - 常設テキスト取込導線は表示されなくなる。
- データ:
  - 永続データ形式への変更なし。
- 互換性:
  - 既存のImport Confirmフロー（`/import/confirm?p=`）は維持。
  - QR/URLとも既存の取込処理パスを利用し、挙動互換を保つ。

## 実装方針（対象ファイル単位）
- `packages/web-app/src/components/ImportQrScannerDialog.tsx`
  - カメラ状態管理・例外ハンドリング・フォールバックUI・URLバリデーション・ヘルプアコーディオンを実装。
  - QR読取成功とURL貼り付け送信を同一コールバックで通知。
- `packages/web-app/src/App.tsx`
  - FAB押下時は常にQRモーダルを開くように変更。
  - 既存のテキスト取込遷移コールバックを削除し、共通取込ハンドラへ統合。
- `packages/web-app/src/styles.css`
  - フォールバックUI（見出し、入力行、ヘルプリンク、アコーディオン）の最小スタイルを追加。
- `packages/web-app/src/i18n/locales/ja.json`
- `packages/web-app/src/i18n/locales/en.json`
- `packages/web-app/src/i18n/locales/ko.json`
  - QR取込モーダルのフォールバック文言と入力エラー文言を追加し、不要な文言を整理。
- `packages/web-app/src/components/ImportQrScannerDialog.test.tsx`
  - 成功/失敗表示分岐、ヘルプ表示、入力バリデーション、submit挙動のテストを追加。

## テスト観点
- カメラ成功時:
  - QR UI（video領域）が表示される。
  - URL入力/原因と対処リンクが表示されない。
- カメラ失敗時:
  - QR UIが表示されない。
  - 見出し/説明/URL入力/取り込むボタン/原因と対処リンクが表示される。
  - 原因と対処の展開内容が3行のみ表示される。
- URL貼り付け:
  - 空文字は送信不可またはエラー表示。
  - `http(s)://` 以外はエラー表示。
  - `/import/confirm?p=` 形式に一致しないURLはエラー表示。
  - 失敗時に入力値が保持される。
- リソース解放:
  - モーダルcloseでMediaStream trackとscan loopが停止する。
  - 再open時に再初期化できる。

## ロールバック方針
- 本タスク差分をrevertし、QRモーダルを従来仕様へ戻す。
- `App.tsx` のFAB挙動をrevertし、既存導線へ復帰する。
- 追加したi18nキーとCSSを巻き戻す。

## Commit Plan
1. `plan`: tasksファイル追加（本ファイル）。
2. `qr-dialog-fallback`: QRモーダル状態機械・フォールバックUI・URLバリデーション実装。
3. `app-flow-and-i18n-style`: App導線統合とi18n/CSS更新。
4. `tests`: QRモーダルの分岐/バリデーションテスト追加。
