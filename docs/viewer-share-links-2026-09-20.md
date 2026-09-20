# ビューアーの共有URL（2026-09-20）

本人指示の内容:

- オンライン版ビューアーの左上に、共有URLを発行するUIを追加する。
- 発行できるのは最上位プランだけにする。
- あわせて、オンライン版ではスタジオ名を編集できないようにする。

## 仕様（質問せずに決めた初期値。変えたい場合はここを直す）

| 項目 | 決めた内容 | 変更箇所 |
|---|---|---|
| 発行できる人 | Team プラン（`ACCOUNT_PLANS` の末尾＝最上位）と管理者。役割は問わない。 | `src/lib/account-schema.ts` の `canShareViewerLink` |
| 発行の条件 | 発行者が、そのシーンを視聴できる状態であること。アンロック済み、管理者、自分の物件、限定無料期間のいずれか。 | `src/app/api/viewer-share/route.ts` |
| 共有できないもの | アクセスレベルが「制限付き」「NDA限定」のシーン。 | 発行API（`src/app/api/viewer-share/route.ts`）と `viewer-asset` の両方 |
| 受け取った人 | ログイン不要。トークン消費なし。`/share/<token>` から「3Dビューを開く」を押して視聴する。 | `src/app/share/[token]/` |
| 期限 | 発行から2週間（2026-09-20 に7日から変更）。同じシーンを再発行すると、URLはそのままで期限が「今から2週間」に延びる。 | `src/lib/viewer-shares.ts` の `VIEWER_SHARE_TTL_DAYS` |
| 同じシーンの再発行 | 同じ人が同じシーンを共有すると、期限が残っているリンクをそのまま返す。リンクは増えない。 | `src/lib/viewer-shares.ts` の `viewerShareRepo.create` |
| 再共有 | 受け取った側のビューアーには、共有ボタンを出さない（`shared=1`）。 | `Locahun3D/src/js/433_online_share_link.js` |
| 連続アクセスの制限 | トークン単位で、60秒に5回まで（既存の `allowAssetDownload`）。 | `viewer-asset` |

## 構成

- D1 のテーブルは `viewer_shares`（`migrations/0019_viewer_shares.sql`）。デプロイ時に自動で適用される。
- 発行は `POST /api/viewer-share` に `{ src }` を送る。
  - `src` は、ビューアーが今開いているデータのURL。
  - サーバーは、そのURLを物件のシーンと照合する。
  - 一致しないURLには 404 を返す（任意のファイルは共有させない）。
- 視聴は `GET /api/viewer-asset?key=…&share=<token>` で行う。署名URLの有効期限は15分。既存のプレビュートークン、埋め込みトークンと同じ形。
- ビューアー側の実装は、正本の `Locahun3D/src/js/433_online_share_link.js`。
  - `?protected=1`（オンライン版）のときだけ動く。
  - 単体配布版は変わらない。

## 未実装（必要になったら）

- 発行済みリンクの一覧と失効を行う画面。今は、2週間の期限切れを待つか、D1 の該当行を削除して失効させる。
- 共有リンクの閲覧回数の記録。
- 発行時のカメラ位置を共有リンクに含めること。
