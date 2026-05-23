@AGENTS.md

# ロケハン3D オンライン — Project context

このリポは locahun3d.com 本体（オンライン版）のソース。マーケサイト (`F:\Htlml\3DGS\digiroke3d_Web`) とは別物。

**Memory references**:
- `project_locahun3d_online_handoff.md` — 全体引き継ぎ（Cloudflare スタック・運営者情報・ドメイン）
- `project_locahun3d_online_architecture.md` — 確定スタック・MVP/将来要件
- `project_locahun3d_viewer.md` — オフラインビューアーのアーキテクチャ
- `project_spark_api_limits.md` / `project_fps_investigation.md` — Spark 2.0 ハマりポイント

## Stack (確定)

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) + TypeScript |
| Styling | Tailwind v4 (CSS-only `@theme` config, no tailwind.config.js) |
| Auth | **Clerk** (未配線。`.env.example` の `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` 参照) |
| Billing | **Stripe** Subscriptions + future Connect for marketplace (未配線) |
| DB | **Cloudflare D1** (未配線、wrangler.toml 未作成) |
| Storage | **Cloudflare R2** バケット `locahun3d-assets`（既存） |
| Hosting | Cloudflare Workers via `@opennextjs/cloudflare`（デプロイ未配線） |

## ブランド

マーケサイト統一: `#000` / `#fafaf6` / accent `#ffb454` / Noto Serif JP + Noto Sans JP + JetBrains Mono / 映画モチーフ。
詳細は `src/app/globals.css` の `@theme` ブロック。

## ⚠️ Tailwind v4 注意点

- `tailwind.config.js` は使わない。すべて `globals.css` の `@theme` ブロック内。
- **未レイヤーの CSS は @layer utilities より高い詳細度**で適用される。`a { color: inherit }` のようなベースリセットを直書きすると `text-accent` 等が効かなくなる（実害発生済、Tailwind preflight に任せること）。
- カスタムユーティリティは `@utility name { ... }` で定義。

## 現在の進捗 (2026-05-23)

### 完成
- ランディング `/`
- 物件カタログ `/properties`（モックデータ 6 件 + フィルタ）
- 物件詳細 `/properties/[id]`（ギャラリー、ビューアーゲート、関連物件）
- 料金 `/pricing`（3 プラン）
- ダッシュボード `/dashboard`、サインイン/サインアップ、マーケットプレイス、About、404

### 未配線 (本配線にはアカウント情報が必要)
- Clerk: ミドルウェア / 認証 UI / `publicMetadata.subscription` 同期
- Stripe: Checkout Session API ルート / Webhook ハンドラ / 顧客同期
- 3DGS ビューアー: `src/components/splat-viewer.tsx` は描画プレースホルダ。
  Three.js + `@sparkjsdev/spark` をインストールして本実装。
  FPS チューニングは `project_fps_investigation.md` 参照。
- D1: `wrangler.toml`、スキーマ、`drizzle` or 生 SQL クエリ層
- R2: 署名 URL 配信（プレビュー用）、独自ドメイン `cdn.locahun3d.com`
- `next/image` 用 `images.remotePatterns`（picsum.photos は今モック表示で `<img>` を直書き）

### モックデータ
`src/lib/properties.ts` に 6 件のサンプル物件。画像は picsum.photos の擬似画像、splat URL は既存 R2 デモファイル `locahun3d_Demo_point_cloud.splat` を指している。

## 開発コマンド

```bash
npm run dev      # localhost:3000 で起動 (Turbopack)
npm run build    # 本番ビルド
npm run lint     # ESLint
```

## デプロイ予定 (未実施)

```
locahun3d.com (apex) → 新 Worker `locahun3d-online`
  ↓
@opennextjs/cloudflare adapter
```

DNS / Worker 名 / Custom Domain の確定は `project_locahun3d_online_handoff.md` 参照。
