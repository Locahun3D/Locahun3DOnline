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
| Auth | **Clerk**（本番稼働。`clerk.locahun3d.com` / apex cookie で web.locahun3d.com と横断ログイン） |
| Billing | **Stripe**（本番稼働。Checkout + Webhook 配線済み） |
| DB | **Cloudflare D1** `locahun3d-db`（本番稼働。`wrangler.jsonc` にバインド） |
| Storage | **Cloudflare R2** バケット `locahun3d-assets`（本番稼働） |
| Hosting | Cloudflare Workers via `@opennextjs/cloudflare`（本番稼働・自動デプロイ） |
| Mail | **Resend**（送信のみ。差出人 `contact@locahun3d.com`。SPF/DKIM/DMARC 設定済み。**受信の取り込みは実装していない** → `docs/inbound-email-decision-2026-07-28.md`） |

## ブランド

マーケサイト統一: `#000` / `#fafaf6` / accent `#ffb454` / Noto Serif JP + Noto Sans JP + JetBrains Mono / 映画モチーフ。
詳細は `src/app/globals.css` の `@theme` ブロック。

## ⚠️ 日本語タイポgrafィ・レスポンシブ統一ルール (重要)

完全版は Obsidian `事業/Web日本語タイポグラフィ・レスポンシブ統一ルール.md`。要点:
- 本文は **行間 1.8 / 字間 0.04em**（globals.css の body に実装済、詰めない）。
- **説明文は句点（。）ごとに改行**（2026-08-27 本人ルール化）: リード・カード説明・CTA文・ブログ記事本文など2文以上の日本語段落は、各文末の「。」の後に `<br />`（worksは`<br>`）。全端末共通の意図改行。文中（句点以外）では折らない。ENは自然折り返しのまま。
- 検証は必ず **PC1440 / iPad820 / スマホ390** の 3 幅で（`node scripts/shots.mjs` で自動キャプチャ）。
- **PC 用の改行はスマホで殺す**: 文中の意図改行は `<br className="pc" />`（640px 以下で `display:none`、自然に回り込む）。詩のように行自体が意味を持つ改行のみ通常の `<br/>`。
- 装飾（タイムコード等）はスマホで `hidden sm:block`。ナビは `lg` 未満ハンバーガー（`MobileNav`）。ブランド中央寄せは `flex-1` ゾーンで（absolute 中央は重なるので不可）。

## コピー編集時の改行ルール

ユーザーが提示したテキストの **改行は意図** として扱い `<br />` で再現する
（ただし文中の PC レイアウト都合の改行は上記の `<br className="pc" />` を使う）。
コンテナの自動 wrap に任せない (画面幅で意図しない位置で折り返してしまう)。

例: ユーザーが
```
オンラインで
ロケハン が
出来る時代。
```
と書いたら、`<h1>オンラインで<br /><em>ロケハン</em> が<br />出来る時代。</h1>` と
1 改行 = 1 `<br />` で実装する。

`max-w-[Nch]` でテキスト幅を縛っているコンテナでは、`<br />` がない分は自動 wrap
されるが、改行ポイントが画面幅依存になるため意図と一致しない。
ユーザー指示テキストには必ず `<br />` を入れること。

## ⚠️ Tailwind v4 注意点

- `tailwind.config.js` は使わない。すべて `globals.css` の `@theme` ブロック内。
- **未レイヤーの CSS は @layer utilities より高い詳細度**で適用される。`a { color: inherit }` のようなベースリセットを直書きすると `text-accent` 等が効かなくなる（実害発生済、Tailwind preflight に任せること）。
- カスタムユーティリティは `@utility name { ... }` で定義。

## 現在の状況 (2026-07-28 更新)

> ⚠ この節は 2026-05-23 版が長く放置され、「Clerk/Stripe/D1/R2 未配線」「マーケット
> プレイス・掲示板は完成」など**事実と逆の記述**が残っていた（実際には全部稼働済み、
> 後者2つはルート自体が存在しない）。実装を触る前に、記述を鵜呑みにせず
> `src/app/` の実体を見ること。

**全機能が本番稼働中。** 主要ルートは `src/app/` 直下がそのまま一覧になる:

```
/ /about /account /cart /contact /dashboard /embed /onboarding /preview
/pricing /privacy /properties /s /sign-in /sign-up /submit-scan /terms /unsubscribe
/admin/{accounts,analytics,assets,contact-requests,inquiries,
        marketing,payouts,properties,purchases,reports,submissions,subscriptions}
```

EN版は `/en/*`（middleware の rewrite + 辞書方式）。

**存在しないもの**（過去の記述にあるが未実装 / 廃止）:
`/marketplace` `/community`（掲示板は物件配下）、レビュー・評価機能（削除済み）、
`/admin/gift-codes`（2026-07-29 に `/admin/marketing` へ統合。同ページにあった
「全物件共通の限定無料期間」UIは廃止し、無料化は3DGSデータごとに物件エディターで設定する）。

新設: `/sign-out?redirect=<path>` — サインアウトしてから指定パスへ着地させる中継。
ログイン中に `/sign-up` へ送っても Clerk がサインアップ画面を出さずマイページへ弾くため。

### works（実績＆技術ブログ）— 2026-09-03 に統合

`/works/<slug>.html` ・ `/en/works/<slug>.html` はこのリポのルート
（`src/app/works/[page]/page.tsx`）が出す。ホストは **`web.locahun3d.com` のまま**
（URLを1文字も変えない。X で共有済み）。middleware がホストで振り分ける。

- 記事の**生成は今までどおり `digiroke3d_Web/works` 側** → `node scripts/import-works.mjs`
  → `content/works/**` と `src/content/works.generated.ts` を commit。
- 記事CSSは `.works-root` にスコープ。`.works-scale` が html の zoom を打ち消す。
- 公開状態は Cloudflare KV `WORKS_KV`（`/admin/works` で操作）。
- メディアは R2（`works/images/**`・`works/videos/**`・`assets/**`）。
- 詳細・切替手順・ロールバックは `docs/works-integration-2026-09-03.md`。

**残タスク**は Obsidian の該当ノートと `docs/` を参照。

### データ層
- 物件データの SOT は **`data/properties.json`** (git 管理)
- `src/lib/store.ts` の `PropertyRepoImpl` が **ローカルはJSONファイル / 本番はD1** を
  `canAccessLocalFs()` で自動的に切り替える（移行は完了済み。dev で書いた
  `data/properties.json` を commit しても本番の読み先は D1）。
- `src/lib/schemas.ts` は server / client 両方が import してよい
  pure な zod スキーマ + ラベル定数 + 参照地点プリセット。
  **`server-only` import を入れないこと**（client component が落ちる）。
- `src/lib/properties.ts` は server 専用ヘルパー。client component から
  import しない（リポジトリ経由でしか触らない）。
- `src/lib/distance.ts` は Haversine 距離計算 (km) と整形ヘルパー。

### Property フィールド (2026-05-23 拡張版)

| カテゴリ | フィールド | 補足 |
|---|---|---|
| 基本 | title / category / studioType / area / prefecture / city | studioType は free-text + datalist 候補 |
| 位置 | coords ({lat,lng}) | nullable、null だと地図に出ない |
| 価格 | hourlyPrice | ¥/hr 整数 |
| 仕様 | capacity / floorAreaSqm / ceilingHeightM | フィルタ・ソート対象 |
| 設備 | powerVoltage / hasNaturalLight / parking / loadingDock | powerVoltage は free-text、`/200\s*V/i` で 200V フィルタ |
| 説明 | description / summary / tags | summary は publish 時 10 文字以上 |
| 写真 | cover / gallery[] | 各 {src, alt, width, height} |
| 3DGS | splatUrl / splatSizeMb / scannedAt / annotations[] | annotations は Phase 2 で配置 |
| メタ | id / status / createdAt / updatedAt | status は draft/published/archived |

### カタログ画面 (/properties) の構造
- `CatalogClient` (Client Component) が状態を集約:
  hoveredId / reference / 各種フィルタ / sort
- 2 カラム: 左 = カード一覧 (`<ul>`)、右 = `CatalogMap` (sticky)
- カード ↔ マーカーのホバー連動は両方向
- 参照地点: `REFERENCE_PRESETS` (渋谷駅デフォルト + 7 駅) + 📍 ジオロケ
- ソート: 新着 / 距離近い順 / 料金 / 天井 / 面積 / 収容
- フィルタ: キーワード / カテゴリ / スタジオ種類 / エリア / 距離上限 /
  料金上限 / 最低 収容・面積・天井 / 駐車場必須 / 200V 必須

### エディター運用ワークフロー
1. `npm run dev` → `/admin/properties` でリスト
2. 「＋ 新規物件を作成」 or 既存をクリック
3. 6 ステップに沿って入力 → ⌘S で都度保存（または各種「保存」ボタン）
4. 写真と 3DGS は **ドラッグ&ドロップで自動アップロード**
   (UPLOAD_MODE=local なら `public/uploads/{propertyId}/`、R2 移行後は presigned PUT)
5. 「公開する」で `status='published'` に → 公開側 `/properties` に出る
6. `git add data/properties.json && git commit && git push` で本番反映
   （Cloudflare デプロイ済の場合）

### スキーマの draft / publish 分離
- `propertySchema`: 下書き許容（全フィールド空 OK、`default()` でフォールバック）
- `publishablePropertySchema`: 公開時バリデーション（title>=2, summary>=10,
  cover.src 必須、splatUrl 必須など）
- 「公開する」アクションは `publishablePropertySchema.safeParse` で弾く →
  UI 側で赤いエラーバナー表示

### アップロード
- `src/lib/uploads.ts` の `UPLOAD_MODE` で切替: `local` (デフォルト) / `r2` (TODO)
- 制限: 画像 25 MB、splat 1 GB
- 許可: JPEG/PNG/WebP/AVIF/GIF と `.splat`/`.ply`/`.ksplat`
- `public/uploads/` は git ignore (`.gitkeep` 以外)。本番アセットは R2 に置く前提

### 画像・3DGS の配信
実データは R2 バケット `locahun3d-assets`。配信は `/api/r2/...`（画像）と
`/api/viewer-stream/...`（3DGS。`.rad` は Range ストリーミング）。
**`next/image` は使わない** — Workers + 相対パスの構成で最適化が404になるため、
プレーン `<img>` を使う（該当箇所には理由コメントと eslint 抑止を置いてある）。
seed 当時の picsum モック画像は残っていない。

## 開発コマンド

```bash
npm run dev      # localhost:3000 で起動 (Turbopack)
npm run build    # 本番ビルド
npm run lint     # ESLint
```

## デプロイ

`morning-restored` ブランチへの push で Cloudflare が自動ビルド・デプロイする
（マーケサイト `digiroke3d_Web` は自動デプロイが止まっており `npx wrangler deploy` が別途必要 — 混同しないこと）。

```
locahun3d.com (apex) → Worker `locahun3d-online`（@opennextjs/cloudflare）
web.locahun3d.com    → Worker `locahun3d-online`（2026-09-04 切替済み。works 専用ホスト。
                       works 以外は locahun3d.com へ 301。旧 Worker `locahun3dwebsite`
                       は退役。ロールバックはカスタムドメインを戻すだけ）
```

⚠ works ホストで描くヘッダー/フッターのリンクは `<Link>` ではなく **絶対URL＋素の `<a>`**
（`src/lib/online-href.ts` / `src/components/site-link.tsx`）。`<Link>` のままだと Next の
プリフェッチが 301 を跨いで CORS エラーを出す。

## 検証ハーネス（UIを触ったら必ず実行）

| スクリプト | 役割 |
|---|---|
| `node scripts/header-matrix.mjs` | **実Chrome(headed)**で全ページ×10端末×縦横=500計測。ページ差・端末差・向き差・サイト差を1枚で潰す。⚠ヘッドレスではスクロールバー由来のズレが再現しない。`--local`で手元、`--webkit`でSafari相当 |
| `node scripts/header-signedin.mjs` | **サインイン状態**のヘッダー検査（7ページ×24幅）。右側が重くなる状態でしか出ない重なりを拾う。⚠`next dev -p 3001`に対して回す（`next start`は本番Clerk鍵を読むのでlocalhostでは認証UIが出ない） |
| `node scripts/header-live.mjs` | **本番**の両サイトでブランド中心=50vw・両サイト差0・ヘッダー内重なり0を26幅で検査 |
| `node scripts/header-parity.mjs` | 両サイトのヘッダー共有要素の computed style 照合 |
| `node scripts/header-consistency.mjs` | スキャン19ページ×23幅が1pxも違わないことを機械証明 |
| `node scripts/ui-audit.mjs` | 26ページ×9幅の重なり・はみ出し検査 |
| `python scripts/design-fb-audit.py` | **本人のデザインFB 27項目の回帰検査**。UIを触る作業の完了報告前に必ず実行。台帳=`F:\Claude\docs\デザインFB台帳_locahun3d.md` |
| `node scripts/import-works.mjs` | works 記事の取り込み（`digiroke3d_Web/works` → `content/works/**`）。記事を足したら実行して commit |
