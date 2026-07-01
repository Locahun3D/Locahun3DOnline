# バグレポート — 2026-07-02

## 概要

デプロイ済み本番環境で発生していた4件のバグについて、根本原因・修正内容・検証結果をまとめる。

---

## Bug 1: デモRADファイルが視聴者/匿名ユーザーに読み込めない

### 症状
`/properties/wh-002` の3DGSビューアーを開くと、RADファイルが401エラーで読み込み失敗する。

### 根本原因の連鎖

```
data/properties.json
  splatUrl = "/uploads/wh-002/Kousaten_ForDemo_point_cloud.rad"
      ↓
ViewerGate は常に protected=true でビューアーURLを構築
      ↓
offline-viewer.html (line 17785):
  ?protected=1 && URL が http:// で始まらない
  → autoUrl に "/api/viewer-stream/" を自動付与
      ↓
autoUrl = "/api/viewer-stream/uploads/wh-002/Kousaten_ForDemo_point_cloud.rad"
      ↓
/api/viewer-stream/ はClerkによる認証チェックを実行
  → 未ログインユーザー → 401 Unauthorized
  → 有料会員でも R2 に "uploads/wh-002/Kousaten_ForDemo_point_cloud.rad" というキーが存在しない → 404
```

**そもそもの設計問題**: デモファイルは `Kousaten_ForDemo_point_cloud.rad`（ルートキー）として R2 に格納されているが、`splatUrl` は存在しないパス (`uploads/wh-002/...`) を指していた。さらに `?protected=1` が viewer-stream 認証を必要とするルートを強制的に経由させていた。

### 修正内容

**Fix A — `data/properties.json`:**
```diff
- "splatUrl": "/uploads/wh-002/Kousaten_ForDemo_point_cloud.rad"
+ "splatUrl": "/api/demo-asset/Kousaten_ForDemo_point_cloud.rad"
```
（`splatItems[].splatUrl` も同様に変更）

**Fix B — `public/viewer/offline-viewer.html` (line 17785):**
```diff
- if(_protected && !(/^https?:\/\//.test(autoUrl))){
+ if(_protected && !(/^https?:\/\//.test(autoUrl)) && !autoUrl.startsWith('/api/')){
```
`/api/` で始まるURLはすでにAPIパスであるため、`/api/viewer-stream/` を二重付与しない。

`/api/demo-asset/` は認証不要のパブリックエンドポイントなので、viewr-stream を経由させると逆に403になる。

### 検証結果 ✅

- `/api/demo-asset/Kousaten_ForDemo_point_cloud.rad` → 206 Partial Content (Range対応) 確認
- `?autoload=/api/demo-asset/...&protected=1` でビューアーを開くと、Spark が 100+ 件の Range リクエストを発行し、3DGSシーンが完全レンダリング

---

## Bug 2: プレビュー動画キャプチャが403で失敗

### 症状
管理者がエディターから「プレビュー生成」を実行すると、RADファイル取得時に403が返りキャプチャが失敗する。

### 根本原因の連鎖

```
アップロード後の splatUrl = "/api/r2/assets/splat/{id}-filename.rad"
      ↓
use-preview-capture.ts:
  相対URL → CORS プロキシ経由に変換
  directSplatUrl = "https://locahun3d-cors-proxy.workers.dev/api/r2/assets/splat/....rad"
      ↓
CORS プロキシが locahun3d.com/api/r2/... を fetch
      ↓
/api/r2/[...path]/route.ts:
  BLOCKED_3DGS_RE = /\.(splat|ply|ksplat|rad)$/i
  → .rad ファイルは 403 Forbidden で遮断
```

**設計の背景**: `/api/r2/` は R2 の一般公開プロキシだが、3DGSファイルは有料コンテンツのためセキュリティ上ブロックしている。しかし CORS プロキシ経由だと管理者の認証クッキーが届かず、ブロックを回避できない。

### 修正内容

**`src/components/admin/use-preview-capture.ts` (line 79):**
```typescript
// Before
const directSplatUrl = splatUrl.startsWith("/") ? `${CORS_PROXY}${splatUrl}` : splatUrl;

// After
let directSplatUrl: string;
if (/^\/api\/r2\//i.test(splatUrl) && /\.(splat|ply|ksplat|rad)$/i.test(splatUrl)) {
  // /api/r2/ の 3DGS ファイルは viewer-stream 経由へ切り替え
  // (管理者はブラウザセッションに認証クッキーを持っているため通過できる)
  directSplatUrl = splatUrl.replace(/^\/api\/r2\//, "/api/viewer-stream/");
} else if (splatUrl.startsWith("/")) {
  directSplatUrl = `${CORS_PROXY}${splatUrl}`;
} else {
  directSplatUrl = splatUrl;
}
```

---

## Bug 3: splatUrl 公開チェックリストが常に赤表示

### 症状
管理者エディターの「公開する」チェックリストで「3DGS Splat URL」項目が、R2にアップロード済みの場合でも赤く表示される。

### 根本原因

```
アップロード後の splatUrl = "/api/r2/assets/splat/{id}-filename.rad"
      ↓
property-editor.tsx (publishチェック):
  ok: !!data.splatUrl && /^https?:\/\//.test(data.splatUrl)
  → 相対パスは https:// で始まらないため常に false
```

チェックが `https://` URLのみを有効とみなしており、R2 アップロードで生成される `/api/r2/...` 形式の相対パスを考慮していなかった。

### 修正内容

**`src/components/admin/property-editor.tsx` (publishチェック行):**
```diff
- { ok: !!data.splatUrl && /^https?:\/\//.test(data.splatUrl), label: "3DGS Splat URL" }
+ { ok: !!data.splatUrl && (/^https?:\/\//.test(data.splatUrl) || data.splatUrl.startsWith("/api/")), label: "3DGS Splat URL" }
```

---

## Bug 4: アップロード・管理機能が全て 403 (Clerk 本番鍵未設定)

### 症状
本番環境で `/api/admin/*` 系エンドポイントが全て 403。ファイルアップロード、物件保存、管理者操作が不可。

### 根本原因

```
Cloudflare Workers 環境変数:
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_*" (開発用鍵)
  CLERK_SECRET_KEY = "sk_test_*" (開発用鍵)
      ↓
本番ドメイン locahun3d.com に対して開発用鍵を使用
  → Clerk の auth() が null を返す
      ↓
requireAdmin() → "Unauthorized" → 403
```

### 修正方法 (ユーザー作業が必要)

コードでは修正不可。以下の `wrangler secret put` コマンドを実行して本番鍵を投入する必要がある:

```bash
# Clerk ダッシュボード > Production インスタンス > API Keys から取得
wrangler secret put CLERK_SECRET_KEY
wrangler secret put NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
```

**⚠️ これが解決するまで Bug 2 の検証（プレビュー生成）は完全には実施できない。**

---

## バグ発生の共通パターン

| パターン | 影響したバグ |
|---|---|
| ローカル開発パス (`/uploads/...`) が本番JSONに混入 | Bug 1 |
| `?protected=1` が全URLに viewer-stream を強制付与する過度な設計 | Bug 1 |
| `/api/r2/` の 3DGS ブロックが CORS プロキシ経由の管理者にも適用 | Bug 2 |
| チェックリストが `https://` URLのみ想定（アップロード後の相対パスを見落とし） | Bug 3 |
| 本番デプロイに開発用 Clerk 鍵が使われたまま | Bug 4 |

---

## 残タスク (ユーザー側)

| ID | 内容 | 優先度 |
|---|---|---|
| U1 | `wrangler secret put CLERK_SECRET_KEY` + `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | 🔴 最優先 |
| U2 | Google 本番 OAuth 設定 (Clerk ダッシュボード) | 🟡 |
| U3 | Stripe テストカード 4242 最終検証 | 🟡 |
| U4 | GitHub Secrets に `CLOUDFLARE_API_TOKEN` 追加 → CI/CD 自動化 | 🟢 |

---

## 検証済み項目

| 項目 | 結果 |
|---|---|
| `/api/demo-asset/Kousaten_ForDemo_point_cloud.rad` → 206 Range 対応 | ✅ |
| `?autoload=/api/demo-asset/...&protected=1` でビューアー起動 | ✅ |
| Spark が 3DGS を完全レンダリング（交差点シーン表示） | ✅ |
| `/api/r2/` 経由では `.rad` が 403 でブロックされる（設計通り） | ✅ |
| publish チェックリストが `/api/` パスを有効と判定 | ✅ (コード修正済) |
