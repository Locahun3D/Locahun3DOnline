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
- 物件カタログ `/properties`（フィルタ、`status='published'` のみ表示）
- 物件詳細 `/properties/[id]`（ギャラリー、ビューアーゲート、関連物件）
- 料金 `/pricing`（3 プラン）
- ダッシュボード `/dashboard`、サインイン/サインアップ、マーケットプレイス、About、404
- **管理 `/admin/properties`** — リスト + status バッジ + 新規作成
- **エディター `/admin/properties/[id]/edit`** — Google Forms 風 6 ステップ
  (基本/仕様/紹介文/写真/3DGS/公開)、autosave (⌘S)、Publish チェックリスト、Draft/Publish/Archive/Delete

### 未配線 (本配線にはアカウント情報が必要)
- Clerk: ミドルウェア / 認証 UI / `publicMetadata.subscription` 同期
- Stripe: Checkout Session API ルート / Webhook ハンドラ / 顧客同期
- 3DGS ビューアー: `src/components/splat-viewer.tsx` は描画プレースホルダ。
  Three.js + `@sparkjsdev/spark` をインストールして本実装。
  FPS チューニングは `project_fps_investigation.md` 参照。
- D1: `wrangler.toml`、スキーマ、`drizzle` or 生 SQL クエリ層
- R2: 署名 URL 配信（プレビュー用）、独自ドメイン `cdn.locahun3d.com`
- `next/image` 用 `images.remotePatterns`（picsum.photos は今モック表示で `<img>` を直書き）

### データ層
- 物件データの SOT は **`data/properties.json`** (git 管理)
- `src/lib/store.ts` の `PropertyRepo` インターフェース + `JsonFilePropertyRepo`
  実装。D1 に移行する時はこの 1 ファイルを差し替えるだけ。
- `src/lib/schemas.ts` は server / client 両方が import してよい
  pure な zod スキーマ + ラベル定数。**`server-only` import を入れないこと**
  （client component が落ちる）。
- `src/lib/properties.ts` は server 専用ヘルパー。client component から
  import しない（リポジトリ経由でしか触らない）。

### エディター運用ワークフロー
1. `npm run dev` → `/admin/properties` でリスト
2. 「＋ 新規物件を作成」 or 既存をクリック
3. 6 ステップに沿って入力 → ⌘S で都度保存（または各種「保存」ボタン）
4. 「公開する」で `status='published'` に → 公開側 `/properties` に出る
5. `git add data/properties.json && git commit && git push` で本番反映
   （Cloudflare デプロイ済の場合）

### モックデータの来歴
seed 時点の 6 件は `picsum.photos/seed/...` の擬似画像、splat は既存 R2 デモ
`locahun3d_Demo_point_cloud.splat`。本番では全件差し替え予定。

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
