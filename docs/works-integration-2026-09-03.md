# works（実績＆技術ブログ）のオンライン版統合 — 2026-09-03

本人決定「完全に統合する必要がある」。実績＆技術ブログ（works）を静的サイト
`digiroke3d_Web`（Worker `locahun3dwebsite`）から、オンライン版
`locahun3d_online`（Next.js 16 + OpenNext / Cloudflare Workers）へ移した。

**最重要制約: URL は1文字も変えない。** X で共有済みの記事リンクを全部生かす。

---

## 1. URL 表（変更なし）

| URL | 統合前 | 統合後 |
|---|---|---|
| `https://web.locahun3d.com/works/index.html` | 静的HTML + ヘッダー注入 | `src/app/works/[page]/page.tsx` |
| `https://web.locahun3d.com/works/<slug>.html` | 同上 | 同上 |
| `https://web.locahun3d.com/en/works/index.html` | 静的HTML | 同上（middleware が `/en` を剥がし `x-locale=en`） |
| `https://web.locahun3d.com/en/works/<slug>.html` | 同上 | 同上 |
| `https://web.locahun3d.com/works/images/**` | 静的アセット | `src/app/works/images/[...path]/route.ts` → R2 `works/images/**` |
| `https://web.locahun3d.com/works/videos/**` | 静的アセット | `src/app/works/videos/[...path]/route.ts` → R2 `works/videos/**` |
| `https://web.locahun3d.com/assets/**` | 静的アセット | `src/app/assets/[...path]/route.ts` → R2 `assets/**` |

`.html` 無し（`/works/index`）は**404 のまま**。別URLを生やさない。

`/works/blog.html` と `/works/shibuya-ten-simulations.html` は元々 meta refresh の
転送ページで、統合後はサーバー側 307 リダイレクトに置き換えた（行き先は同じ）。

---

## 2. ホスト振り分け（`src/middleware.ts`）

Clerk 処理より**前**に評価する。

| ホスト | パス | 挙動 |
|---|---|---|
| `web.locahun3d.com` | `/works/**` `/en/works/**` `/assets/**` | 素通し（＝works を配る） |
| | `/_next/**` `/__clerk/**` `/robots.txt` `/sitemap.xml` | 素通し |
| | `/api/contact` `/api/works` | **410 Gone**（旧マーケサイト Worker だけが持っていたAPI） |
| | RETIRE 表にあるパス | **301** → `locahun3d.com` の対応ページ |
| | それ以外すべて（`/` `/index.html` 含む） | **301** → `https://locahun3d.com/` |
| `locahun3d.com` / `www.locahun3d.com` | `/works/**` `/en/works/**` | **301** → `web.locahun3d.com` 同パス（正典を1つに保つ） |
| | それ以外 | 通常どおり |
| `*.workers.dev` / `localhost` | 全部 | 素通し（検証用） |

RETIRE 表（`digiroke3d_Web/worker.js` から移植）:

| 旧 | 新 |
|---|---|
| `/` `/index.html` `/locahun3d_manifesto.html` `/locahun3d_pitch_hub.html` `/locahun3d_online.html` | `/` |
| `/locahun3d_demo.html` | `/pricing` |
| `/locahun3d_contact.html` | `/contact` |
| `/locahun3d_data.html` | `/#service` |
| `/locahun3d_privacy.html` | `/privacy` |
| `/en...` の各対応 | `/en...` の対応先 |

⚠ `middleware` の `matcher` から **`html` を除外リストから外した**。works の正典URLが
`.html` で終わるため、外したままだと EN の rewrite もホスト振り分けも動かない。

---

## 3. 取り込み（記事の追加・修正の運用）

記事の**生成は今までどおり `digiroke3d_Web` 側**（`works/*.html`・`en/works/*.html`）。
そのあと:

```bash
cd F:\Htlml\3DGS\locahun3d_online
node scripts/import-works.mjs
git add content/works src/content/works.generated.ts
git commit -m "works: 記事を取り込み"
```

- 入力: `../digiroke3d_Web/works/*.html`（`admin.html` は除く）と `../digiroke3d_Web/en/works/*.html`
- 出力: `content/works/{ja,en}/<slug>.json` ＋ `content/works/manifest.json`
        ＋ `src/content/works.generated.ts`（Workers にFSが無いので静的 import で焼き込む）
- 冪等。何度回しても同じ結果。

取り込み時にやっていること:

| 捨てる | 残す |
|---|---|
| 静的ヘッダー `<header class="site-header …>` | ページ内 `<style>`（`.works-root` へスコープ） |
| 静的フッター `<footer class="site-foot">` | 本文内 `<script>`（カード生成・ライトボックス・BudouX） |
| `@font-face` / `@import` | Google Fonts の URL（`fontsHref` として保存し、ページが `<link>` で読む） |
| `body{padding-top:56px}`（旧 fixed ヘッダーの予約） | OGP / Twitter / canonical / description |
| — | 相対 `images/` `videos/` は `/works/…` へ正規化 |

改行は **LF に正規化**する。CRLF のままだと SSR HTML（`\r\n`）と RSC ペイロード（`\n`）が
食い違い hydration mismatch になる（実際に踏んだ）。

---

## 4. 記事ゲーティング（KV）

`wrangler.jsonc` の `kv_namespaces` に `WORKS_KV`（id `d864f7aa…`、旧マーケサイト
Worker が使っていたネームスペースを**そのまま流用**）。

- キー `works:<slug>`（JA/EN で1エントリ共有）→ `{status, shareToken?}`
- エントリが無ければ `published`
- `published` → 誰でも / `private` + `?token=` 一致 → 誰でも / `draft`・`private` → 管理者のみ
- 上記以外は 404
- dev（バインディング無し）は全部 `published` 扱い

管理UIは **`/admin/works`**（`requireAdmin()`）。一覧・status 切替・private の
共有リンク表示/トークン再生成をサーバーアクションで行う。
旧 `/works/admin.html` と `/api/works` は作らない（前者は取り込み対象外、後者は 410）。

---

## 5. 撤去したもの

| 対象 | 理由 |
|---|---|
| `src/app/partials/**`（`header` route / `header-frame` page） | ヘッダー注入方式そのものが不要になった |
| `src/lib/header-partial.ts` ＋ そのテスト | 同上 |
| `wrangler.jsonc` の `SELF` service binding | 自己フェッチ回避のためだけの存在だった |
| `src/middleware.ts` の `x-partial` 分岐 / `layout.tsx` の `isPartial` | 同上 |
| `site-header.tsx` の `isPartial` / `header-auth-buttons.tsx` の `alwaysSignedOut`・`data-auth` | 同上 |
| `scripts/sync-header-css.mjs` | マーケサイトの静的ヘッダーが無くなったので同期先が消えた。`src/app/site-header.css` が**正本**になった（直接編集してよい） |

---

## 6. 切替手順（本人が実施）

1. このブランチを push → Cloudflare が `locahun3d-online` を自動デプロイ。
2. デプロイ後、**まだドメインを切り替えずに** workers.dev で確認する:
   `https://locahun3d-online.<sub>.workers.dev/works/index.html` が出ること
   （workers.dev ホストは素通し設定なので works がそのまま見える）。
3. R2 に `works/images/**`・`works/videos/**`・`assets/**` が入っていることを確認。
4. Cloudflare ダッシュボード → Workers → `locahun3dwebsite` → Settings → Domains &
   Routes から **`web.locahun3d.com` を削除**。
5. `locahun3d-online` の Domains & Routes に **`web.locahun3d.com` を追加**（Custom Domain）。
   ⚠ `wrangler.jsonc` の `routes` には**あえて書いていない**。書くと deploy した瞬間に
   切り替わるため。切替後に書き足すかはお好みで（書けば構成がコード側に残る）。
6. 確認:
   - `https://web.locahun3d.com/works/index.html` — 一覧が出る
   - `https://web.locahun3d.com/works/isaacsim-3dgs-robot-demos.html` — 動画が再生できる
   - `https://web.locahun3d.com/en/works/index.html` — 英語で出る
   - `https://web.locahun3d.com/locahun3d_demo.html` — `locahun3d.com/pricing` へ 301
   - `https://locahun3d.com/works/index.html` — `web.locahun3d.com` へ 301
   - `/admin/works` で status を切り替え → 記事が 404 になる/戻る
7. `node scripts/header-live.mjs` と `node scripts/ui-audit.mjs`（既定＝本番）を回す。

## 7. ロールバック

**カスタムドメイン `web.locahun3d.com` を Worker `locahun3dwebsite` へ戻すだけ。**
`digiroke3d_Web` 側は一切変更していない（静的HTML・`worker.js`・アセットは全部そのまま）
ので、ドメインを戻せば統合前の挙動に完全に復帰する。オンライン版側の
`/works/**` は web ドメインが無くなれば誰も踏まない（`locahun3d.com/works/**` は
`web.locahun3d.com` へ 301 するので、戻した先の旧 Worker が受ける）。

DNS 伝播を待つ必要は無い（どちらも同じ Cloudflare のカスタムドメイン機構）。

---

## 8. 検証記録（2026-09-03、切替前・localhost:3005 vs 本番 web.locahun3d.com）

- `npm run lint` / `npx tsc --noEmit` / `npm run build` / `npx opennextjs-cloudflare build` — 全て通過
- `npm test` — 18 ファイル 122 件 通過（`src/lib/works.test.ts` を追加）
- `python scripts/design-fb-audit.py` — 29 OK / 0 NG
- `node scripts/header-signedin.mjs --base http://localhost:3005` — **サインイン状態**
  9ページ × 24幅 = 216 計測、問題 0（works 2ページを追加済み）
- `node scripts/ui-audit.mjs --online http://localhost:3005 --scan http://localhost:3005`
  — 27ページ × 9幅、問題 0
- 1440 / 820 / 390 の3幅で本番と並べて目視比較（JA一覧・JA記事2本・EN一覧・EN記事1本）
  — 崩れ無し。実測でも一致:

| 計測 | local | prod |
|---|---|---|
| 本文 `article p` font-size / line-height / letter-spacing | 17px / 33.15px / 0.34px | 同左 |
| 本文幅・左端X（1440/820/390） | 716/362・716/52・316/37 | 同左 |
| `h1` font-size（1440/820/390） | 46 / 44.28 / 26.52px | 同左 |
| `.card p` 実寸（1440） | 287×157px | 同左 |
| BudouX 適用要素数 / 句点改行 `<br>` 数 | 18 / 5 | 同左 |
| 動画 `readyState` / 再生 | 4 / 再生した | 同左 |
| ドキュメント `scrollWidth` | 一致 | 一致 |

- ヘッダー DOM を `/pricing` と `/works/index.html` で比較 → 言語トグルの `href`
  （`/en/pricing` vs `/en/works/index.html`）以外**完全一致**。
- ブラウザコンソールのエラー 0（`suppressHydrationWarning` が必須。本文同梱の
  script が hydration 前に DOM を書き換えるため）。

---

## 9. 追記 2026-09-04 — works ホストのヘッダー/フッターのリンクを絶対URLに

切替直後の本番 `https://web.locahun3d.com/works/*.html` で、コンソールに CORS の
赤エラーが1ページ4本出ていた。

原因: works ページのヘッダー/フッターは本物の `SiteHeader`/`SiteFooter` なので
`<Link href="/properties">` などが並ぶ。Next.js がそれを**プリフェッチ**して
`web.locahun3d.com/properties?_rsc=…` を叩き、上の §2 のとおり middleware が
`https://locahun3d.com/` へ 301 → クロスオリジンのリダイレクトになり、
`fetch` が CORS で弾かれる（機能は動くがコンソールが汚い）。

対処: **works ホストで描かれるときだけ**、works 以外へ向く内部リンクを
`https://locahun3d.com` 起点の絶対URL＋**素の `<a>`** にする（素の `<a>` は
Next のプリフェッチ対象外）。

- `src/lib/online-href.ts` — `isWorksHostname(host)` / `onlineHref(path, absolute)`
- `src/components/site-link.tsx` — `absolute` が真なら `<a>`、偽なら `<Link>`
  （"use client" は付けない。サーバー/クライアント両方から使う）
- `SiteHeader` / `SiteFooter`（server component）が `headers().get("host")` で判定し、
  `CartLink` / `NotificationBell`（client）へは `absolute` prop で渡す。

そのままにしたもの:

| 対象 | 理由 |
|---|---|
| 言語トグル（`LangToggle`） | 行き先が `/en/works/**`＝同一オリジン。素の `<a>` で元から prefetch しない |
| works 内リンク（記事本文・一覧カード・戻るリンク） | 取り込んだ生HTMLの素の `<a>`。同一オリジン |
| ナビの「実績＆ブログ」 | 元から `https://web.locahun3d.com/...` の素の `<a>` |
| Clerk のログイン/新規登録 | `SignInButton mode="modal"` でページ遷移しない。`fallbackRedirectUrl` は現在のパス（`/works/x.html`）＝**同一オリジンの相対**なので、works に居たまま戻る |
| workers.dev / localhost | 従来どおり相対（＝ローカル検証で本番と同じページ内リンクを踏める） |

### 検証（2026-09-04、ローカル）
Chromium を `--host-resolver-rules=MAP web.locahun3d.com:80 127.0.0.1:<port>` で
起動し、**本物のオリジン `http://web.locahun3d.com` のまま**ローカルサーバへ当てて計測。

| | works ホスト | 通常ホスト |
|---|---|---|
| `?_rsc=` プリフェッチ（`next start` の本番ビルド） | **0 本** | 9 本（従来どおり） |
| ヘッダーの href | 全て `https://locahun3d.com/...`（works ナビと言語トグルを除く） | 相対（`/properties` 等・変更なし） |
| フッターの href | 全て `https://locahun3d.com/...` | 相対 |
| コンソールエラー（dev, works 3ページ） | HMR の WebSocket 以外 **0** | — |

（`next start` 時に出る `clerk.locahun3d.com/v1/client` の 400 は、本番Clerk鍵を
偽オリジン `http://web.locahun3d.com` から叩いたローカル固有の事象。本番の works
ホストは apex cookie で正規に扱われる。）

その他: `design-fb-audit` 29 OK / 0 NG、`header-signedin --base :3005` 216計測 0件、
`ui-audit` 27ページ×9幅 0件、`vitest` 125件（`online-href` のテストを追加）。
