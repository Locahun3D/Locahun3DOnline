# アセットライブラリ＋R2ストレージ基盤 — 設計仕様 (Phase 1)

- **日付**: 2026-06-18
- **対象リポジトリ**: `F:\Htlml\3DGS\locahun3d_online`（locahun3d.com オンライン版 / Next.js 16 App Router + TS + Tailwind v4）
- **ステータス**: 承認済み（実装計画 writing-plans へ）
- **位置づけ**: 物件管理ツール刷新の **Phase 1（土台）**。Phase 2＝管理の完全化（プレビュー・公開/非公開・一覧強化）、Phase 3＝画像/説明文の編集体験、は別仕様。

---

## 1. 背景と課題

現状の物件管理（`/admin/properties` の6ステップエディタ）には、削除・公開・非公開・画像/説明文編集・3DGSアップロードが**既に実装済み**だが、次の根本課題がある：

- 画像は仮素材（picsum）、3DGSは全6件が同一の壊れたR2 URLを共有 → **実アセットを持つ物件を"まともに追加"できない**。
- アップロードが**物件ごとの6ステップフォーム内に埋め込まれている** → 3DGSを量産する運用では「物件を開いて毎回アップして待つ」摩擦が大きい。
- 保存先がローカル（`public/uploads/`、`UPLOAD_MODE=local`）のみで、100MB〜1GB級のsplatをgit管理するのは非現実的。R2スタブ（`UPLOAD_MODE=r2`）は未実装。

**ユーザー決定事項**：
1. 3フェーズ分解で進める。Phase 1＝R2ストレージ基盤から。
2. 3DGSの保存先は **R2 直アップロード**（本番想定）。
3. **コードを先に作り、R2鍵は後で投入**（テスト段階で有効化）。
4. ファイル運用は **アプリ内「アセットライブラリ」中心**（外部ドライブ/CLIではなく、管理画面内で一括アップ・一覧・選択）。

---

## 2. ゴールと非ゴール

### ゴール
- 管理画面に**アセットライブラリ** `/admin/assets` を新設し、画像・3DGSファイルを**物件と切り離して**一括アップロード・一覧・検索・リネーム・削除できる。
- ファイル実体は **R2**（バケット `locahun3d-assets`）に置き、正しい公開URLで配信。アップロードは **presigned PUT でブラウザ→R2 直送**（サーバ帯域を消費しない、1GB級対応）。
- 物件エディタの写真/3DGSステップから **「ライブラリから選択」** でアセットを紐付け。物件側の作業は「アップして待つ」から「選ぶだけ」へ。
- **R2鍵が無い間も同じUIが動く**ローカルフォールバック（dev用）。

### 非ゴール（後フェーズ／スコープ外）
- D1移行（索引は当面 `data/assets.json`。`AssetRepo` 抽象化で後日差し替え可）。
- 画像の自動リサイズ/最適化、サムネ生成サーバ処理（当面はブラウザ表示時の縮小で対応）。
- 3DGSビューアー本実装（`splat-viewer.tsx` は別件）。
- Clerk/Stripe 本配線。
- 公開・非公開・下書きプレビュー・visibility切替UI（= Phase 2）。
- 外部ドライブ（rclone）/CLI連携やR2ライブ列挙の自動反映（今回は不採用。索引はアプリ書き込みでSOT管理）。

---

## 3. 既存コードの前提（踏襲するパターン）

- データ層は `src/lib/store.ts` の `PropertyRepo` インターフェース＋`JsonFilePropertyRepo`（`data/properties.json` を `fs` 読み書き）。**同じパターンで `AssetRepo` を作る**。
- `src/lib/schemas.ts` は **server-only を import しない**ピュアな zod スキーマ（client も import 可）。アセットのスキーマもここに置く。
- `src/lib/uploads.ts`（server-only）に `UPLOAD_MODE`・`ALLOWED_IMAGE_TYPES`・`ALLOWED_SPLAT_EXTENSIONS`・`MAX_IMAGE_BYTES(25MB)`・`MAX_SPLAT_BYTES(1GB)` 既存。R2分岐はここに実装。
- 認可は `src/lib/dal.ts` の `requireAdmin()`。`/admin` レイアウトで適用済。**新規アセット系ルート/アクションも `requireAdmin()` でゲート**。
- 管理操作は server actions（`src/app/admin/_actions.ts`）＋アップロードは API route（`/api/admin/upload`）の混在パターン。これに倣う。
- Tailwind v4（`@theme` in `globals.css`、config.js無し）。ブランド：`#191919`系ダーク / 文字 `#fafaf6` / accent `#ffb454`。日本語タイポは globals.css 実装済（詰めない）。
- **Next.js 16**（破壊的変更あり）。実装時は `node_modules/next/dist/docs/` の該当ガイドを確認（`AGENTS.md`）。

---

## 4. データモデル

### 4.1 索引ファイル `data/assets.json`
```json
{ "version": 1, "assets": [ /* Asset[] */ ] }
```

### 4.2 Asset スキーマ（`src/lib/schemas.ts` に追加、zod）
```ts
assetSchema = {
  id: string,                       // nanoid(10)
  kind: "image" | "splat",
  status: "uploading" | "ready",    // presign時=uploading、commit時=ready
  label: string,                    // 表示名。既定=元ファイル名のstem
  filename: string,                 // 元ファイル名
  ext: string,                      // ".jpg" / ".splat" 等（小文字）
  r2Key: string,                    // "assets/{kind}/{id}-{safeName}{ext}"
  url: string,                      // 公開URL（R2_PUBLIC_URL + "/" + r2Key）or local "/uploads/..."
  size: number,                     // bytes（presign時=申告値、commit時=確定）
  contentType: string,
  width?: number,                   // 画像のみ（commit時にクライアントから）
  height?: number,
  uploadedAt: string,               // ISO datetime
}
```
- **`linkedPropertyIds` は持たない**。使用状況は**都度計算**（`data/properties.json` を走査し `asset.url` が `cover.src` / `gallery[].src` / `splatUrl` に一致する物件を集計）。索引の同期ズレを避ける。

### 4.3 `AssetRepo`（`src/lib/store.ts` に追加）
```ts
interface AssetRepo {
  list(opts?: { kind?: "image" | "splat"; status?: AssetStatus }): Promise<Asset[]>;
  get(id: string): Promise<Asset | null>;
  upsert(a: Asset): Promise<Asset>;   // 検証→更新 or 追記→書き込み（updatedAt等は不要、uploadedAt保持）
  remove(id: string): Promise<void>;
}
// JsonFileAssetRepo: data/assets.json を fs 読み書き。list は uploadedAt 降順。
```

### 4.4 使用状況ヘルパー（`src/lib/properties.ts` 付近, server-only）
```ts
getAssetUsage(): Promise<Map<assetUrl, propertyId[]>>  // 全物件を走査して url→物件ID群
```

---

## 5. アップロードフロー（presign + commit）

```
[クライアント FileDropzone/ライブラリ]                 [サーバ]                    [R2]
  1. POST /api/admin/assets/presign  ───────────────▶ requireAdmin
     {kind, filename, contentType, size}               検証(型/拡張子/サイズ)
                                                        id/r2Key/url 生成
                                                        AssetRepo.upsert(status:"uploading")
                                                        mode=r2: 署名PUT URL発行
  ◀─────── {id, mode:"r2", putUrl, url} ──────────────
  2. XHR PUT file ───────────────────────────────────────────────────────────▶ (直送・進捗)
  3. POST /api/admin/assets/commit ─────────────────▶ requireAdmin
     {id, width?, height?}                              status:"ready" に確定
                                                        (任意: HEAD で実サイズ照合)
  ◀─────── {ok, asset} ───────────────────────────────
```

- **localモード**（`UPLOAD_MODE=local`、鍵前のdev）：presign が `{id, mode:"local", postUrl:"/api/admin/assets/local"}` を返す → クライアントは multipart で `postUrl` に送信 → サーバが `public/uploads/...` に書き、`status:"ready"`＋`url`/`size` を確定（commit不要）。**同じUIで動く**。
- 失敗時：presignしたが PUT/commit されない索引は `status:"uploading"` のまま残る → ライブラリで「未完了」表示＋手動削除、もしくは一定時間後の掃除（任意・後回し可）。

---

## 6. API / サーバアクション

| 種別 | パス/関数 | 認可 | 役割 |
|---|---|---|---|
| API | `POST /api/admin/assets/presign` | requireAdmin | 検証→索引仮登録→PUT URL（r2）or postUrl（local）返却 |
| API | `POST /api/admin/assets/local` | requireAdmin | localモードのバイト受領→`public/uploads`書込→索引確定 |
| API | `POST /api/admin/assets/commit` | requireAdmin | アップロード完了→`status:"ready"`、width/height確定 |
| API | `GET /api/admin/assets?kind=` | requireAdmin | ライブラリ/ピッカー用一覧（ピッカーはこれを fetch） |
| action | `renameAssetAction(id, label)` | requireAdmin | 表示名変更 |
| action | `deleteAssetAction(id)` | requireAdmin | R2 DeleteObject ＋索引除去。使用中なら確認/警告 |

- ページ `/admin/assets/page.tsx` は **server component**（`requireAdmin` → `AssetRepo.list()`＋`getAssetUsage()` → `<AssetLibrary>` client へ）。
- 既存 `/api/admin/upload` は当面温存（段階移行）。最終的に assets 系へ寄せる。

---

## 7. R2 配線（`src/lib/uploads.ts`）

- 追加実装：
  - `createPresignedUpload({ r2Key, contentType }): Promise<{ putUrl: string }>` — `@aws-sdk/client-s3` の `S3Client`（endpoint=`https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, region=`auto`）＋ `@aws-sdk/s3-request-presigner` の `getSignedUrl(PutObjectCommand, {expiresIn: 600})`。
  - `deleteR2Object(r2Key): Promise<void>` — `DeleteObjectCommand`。
- 公開URL：`${R2_PUBLIC_URL}/${r2Key}`（既定 `pub-…r2.dev`、将来 `cdn.locahun3d.com`）。
- 依存追加：`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`。
- **サイズ強制の制約**：署名PUT URLではサーバ側の厳密なサイズ強制が難しい → presign時にクライアント申告 `size` を検証＋commit時に任意でHEAD照合。管理者専用ツールのため許容。必要なら将来 `createPresignedPost`（content-length-range）へ切替。

---

## 8. 物件エディタ連携（最小改修）

- 新規 client component `<AssetPickerModal kind onPick>`：`GET /api/admin/assets?kind=` を読み、グリッドから1つ選んで `onPick(asset)`。
- `src/components/admin/property-editor.tsx`：
  - 写真ステップ：**「ライブラリから選択」**ボタン → 画像ピッカー → `cover.src`/`cover.alt`(=label) 設定 or `gallery[]` へ追加。
  - 3DGSステップ：**「ライブラリから選択」**ボタン → splatピッカー → `splatUrl`＋`splatSizeMb`(=size/1MB) 設定。
  - 既存のインラインD&D（FileDropzone）も残す。インラインアップロードも assets 索引に登録される（＝ライブラリと一元化）。
- `onUploaded({url,size,contentType})` 契約は不変。`FileDropzone` をpresign→PUT（local時はpostUrl）方式へ内部変更（進捗バー維持）。

---

## 9. 設定・セットアップ（鍵が来てから有効化）

1. `.env.local`：`R2_ACCOUNT_ID=9ad06a76157fb2f40dfef1f4b7a14a93` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET=locahun3d-assets` / `R2_PUBLIC_URL=https://pub-6fe11fc6301a424ba739695a7c4d2dd9.r2.dev` / `UPLOAD_MODE=r2`。
2. **R2バケットCORS**（ブラウザ直PUTに必須）：`AllowedOrigins=[http://localhost:3000, https://locahun3d.com]`, `AllowedMethods=[PUT,GET,HEAD]`, `AllowedHeaders=[*]`, `ExposeHeaders=[ETag]`。Cloudflareダッシュボード or `wrangler r2 bucket cors` で設定（手順は実装時に付録化）。
3. `next.config.ts`：`images.remotePatterns` にR2公開ホスト追加（next/image表示用）。
4. R2 API トークン発行（S3互換 Access Key/Secret、`locahun3d-assets` への Object Read & Write スコープ）。**未発行＝Phase 1のテスト前提条件**。コード実装自体は鍵不要。

---

## 10. 検証計画

- **dev（localモード, 鍵不要）**：ライブラリで画像を複数アップ→一覧表示→物件エディタの写真ステップで「ライブラリから選択」→保存→物件詳細で表示。3DGSは小さなテストsplatで同様。
- **鍵投入後（r2モード）**：小画像でpresign→直PUT→公開URLがnext/imageで表示されることを確認。R2にオブジェクトが存在、`deleteAssetAction` でR2からも消えることを確認。1GB級splatは時間をおいて実ファイルで疎通。
- **型/ビルド**：`npm run lint`、`npm run build` 通過。
- 検証手法はビューアー同様、実機（dev server）で目視＋数値確認。スクショは PC/iPad/スマホ3幅（`scripts/shots.mjs`）はUIフェーズ（Phase 2/3）で重視。

---

## 11. 依存・未決事項

- **R2 S3 APIトークン**（Access Key/Secret）：ユーザーが後で発行・投入。コードは鍵なしで完成させる。
- **R2 CORS設定**：鍵発行と同時。手順提示。
- **公開ドメイン**：当面 `pub-…r2.dev`。将来 `cdn.locahun3d.com` に切替（`R2_PUBLIC_URL` 変更のみ）。
- 既存デモsplat 404 ブロッカーは、本基盤で「自分でアップしたファイルが正しいURLで配信される」形に自然解消。

---

## 12. リスク

- 署名URLのサイズ強制が緩い（§7）→ 管理者専用＋commit時HEADで緩和。
- 索引(`assets.json`)とR2実体のズレ（アプリ外でR2を操作した場合）→ 今回はアプリ書込をSOTとし対象外。将来「R2再スキャン」アクションで吸収可能。
- 大容量PUTのネットワーク失敗→ XHR進捗＋失敗表示＋再試行。`status:"uploading"` 残骸は手動/自動掃除。
