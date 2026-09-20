# サインイン状態のページの翻訳・レイアウト監査（2026-09-21）

前日 2026-09-20 の監査（`docs/i18n-audit-2026-09-20.md` / `scripts/i18n-audit.mjs`）は
**サインアウトの公開ページ専用**だった。ログインが要るページ（マイページ・ダッシュボード・
カート・物件ページのログイン限定UI）は一度も見ていない。本人の指示
「今のページも翻訳できていない箇所多いのですべてのページをスクショなどで調査」を受けて、
そこを EN / JA × PC1440 / iPad820 / スマホ390 で機械検査した。

## ハーネス

`scripts/i18n-audit-signedin.mjs`（新規）

```
npx next dev -p 3013        # 別ターミナル
node scripts/i18n-audit-signedin.mjs [--base http://localhost:3013] [--out artifacts/i18n-signedin] [--no-shots]
```

- サインインは `header-signedin.mjs` / `admin-shots.mjs` と同じ正規手順
  （Clerk バックエンドAPIで `sign_in_token` → `/sign-in?__clerk_ticket=…`）。
  **開発インスタンス(sk_test)専用**でガードあり。管理者ではない一般ユーザー
  `locahun.usercheck@example.com` を使う（管理ハーネスとは別アドレス）。
- 検出は 2 系統。
  - i18n: EN ページに残る日本語（可視テキスト＋ placeholder / title / aria-label / alt
    ＋ option ＋ document.title ＋ meta description）。`i18n-audit.mjs` と同じ正規表現・
    同じ除外。物件データ由来の日本語は「data, not UI」として別枠。
  - レイアウト: 横スクロール / 画面外はみ出し / overflow:hidden での文字切れ /
    操作要素どうしの 30% 以上の重なり（`layout-overlap-audit.mjs` と同基準）。
- 副作用の無い開閉だけ開く: `<details>` 全部＋`button[aria-expanded="false"]`
  （＝ブックマークのポップオーバー、問い合わせパネル）。`<a>` と `type="submit"` は押さない。
  送信・購入・トークン消費は一切しない。

### 見えない状態をわざわざ作る仕掛け（重要）

素直に回すと「空っぽの無料アカウント」しか見えず、**大半のUIが一度も描かれない**。
そのため以下を仕込んでから回す（いずれも gitignore のローカル dev データ。commit しない）。

| 仕込み | 目的 |
|---|---|
| `data/users.json` の `onboarded: true` | これが false だと `/account` も `/account/upgrade` も `requireOnboarded` で弾かれ、**マイページ本体を一度も見ない** |
| 同 `bookmarks` / `bookmarkFolders` / `assignments` | 保存した物件ページのカード・ボードタブ・タグ編集 |
| `data/purchases.json` に完了購入 1 件 | 購入履歴のカード・ステータスバッジ・領収書まわり |
| `data/view-unlocks.json` にアンロック 1 件 | 閲覧履歴の行・有効期限表示 |
| `localStorage` の `locahun3d:cart:v1` | カートの明細行・ライセンス表記・合計欄 |
| Clerk 側の氏名を ASCII 固定（`I18n Check`） | 日本語氏名だと「ようこそ、〇〇さん」が毎回 4 件の偽の未翻訳になる |
| `/account?notice=…` などクエリ 11 種 | お知らせバナーは**クエリでしか出ない**。素の `/account` だけ見ても気付けない |

## 対象ページ

`/account`（＋ notice/welcome/nda/plan の 11 状態）・`/account/upgrade`・
`/dashboard`・`/dashboard/purchases`・`/dashboard/unlocked`・`/dashboard/bookmarks`・
`/onboarding`・`/cart`・`/pricing`・`/properties/wh-002`・
`/contact`・`/contact/{scan,request,listing,license}`・`/submit-scan`・`/unsubscribe`
を JA と `/en/*` の両方、1440 / 820 / 390 の 3 幅。

## 結果

| | 監査前 | 監査後 |
|---|---|---|
| EN の未翻訳 UI 文字列 | **66**（ユニーク 35） | **0** |
| レイアウト不具合 | **8** | **0** |
| 物件データ由来の日本語（UI ではない） | 8 | 22 ※ |

※ 後半は仕込みで物件カード・購入履歴が描かれるようになった分。`data/properties.json` に
日本語で入っている物件名・説明で、UI の漏れではない。EN 値を持たせるかは掲載データ側の判断。

## 個別の指摘

### i18n

| ページ | 症状 | 場所 | 対応 |
|---|---|---|---|
| `/en/account`, `/en/account/upgrade` | **ページ丸ごと日本語**（31 件 ×2）。オンボーディング未完了のユーザーが `requireOnboarded` で `/onboarding`（JA）へ飛ばされ、`/en` が落ちていた | `src/lib/dal.ts:145` | 修正。`localeRedirect()` を追加し、`requireUser` / `requireOnboarded` / `requireRole` の全リダイレクトを今の言語に合わせる |
| `/en/onboarding` → `/en/account` | 種別登録済みのとき JA の `/account` に着地 | `src/app/onboarding/page.tsx:23` | 修正。`localizedHref` を通す |
| `/en/dashboard/*` | 未ログイン時のサインイン誘導が JA。戻り先も JA | `src/app/dashboard/page.tsx:16`, `bookmarks/page.tsx:17`, `unlocked/page.tsx:18`, `purchases/page.tsx:43` | 修正。サインイン画面・`redirect_url` の両方を言語付きに。`getLocale()` をリダイレクトより前へ移動 |
| `/en/submit-scan` | 補足文の括弧だけ全角（`（up to 5 images, 25MB each）`） | `src/components/scan-submit-form.tsx:282` | 修正。`contact-form.tsx:347` と同じく `en ? "(…)" : "（…）"` に |

`/en/dashboard` などに出ていた「Welcome, 翻訳 検証」の 4 件は検証ユーザーの
**氏名**であって UI の漏れではない。ハーネス側で氏名を ASCII に固定して消した。

### レイアウト

| ページ | 症状 | 場所 | 対応 |
|---|---|---|---|
| `/dashboard/bookmarks` @390 | 既定の「中」サイズが `columns-2`。カード 1 枚 165px しかなく、`WAREHOUSE` バッジが `3DGS` バッジに重なり、価格と「VIEW DETAILS →」が切れ、タイトルが 5 行に折れていた | `src/components/dashboard/bookmarks-manager.tsx:64` | 修正。スマホは S/M/L とも `columns-1`、密度切替は `sm` 以上でだけ効かせる |
| 同上 | 密度トグル S/M/L がスマホでは押しても何も変わらない | 同 `:463` | 修正。`hidden sm:flex` |
| 同上 | 新規ボードの入力欄がタイル幅 110px に横並びで、プレースホルダが「New b」で切れる | 同 `:386` | 修正。スマホは縦積み（`flex-col sm:flex-row`） |
| 物件カード全般 | 細いカードで左のカテゴリバッジが右上の 3DGS バッジに重なる | `src/components/property-card.tsx:45` | 修正。3DGS バッジがある時だけ右に `5.5rem` 空け、溢れは `truncate` |
| `/contact/scan`, `/contact/license`, `/submit-scan` @390, `/dashboard/purchases` @1440 | 「必須」バッジ × 注記が 100% 重なると報告（計 4 件） | — | **実害なし・検出器の偽陽性**。折り返したインライン要素の `getBoundingClientRect` が行の和集合を返すため。ハーネスを `getClientRects()`（行ボックス単位）比較に直して解消 |

## 届かなかった / 確認できなかったもの

- `/s/<token>`（共有ボード）— 実行時には開いていない。トークンの発行にブックマーク →
  フォルダ作成 → 共有の一連の書き込みが要るため。ソースは読んで確認済みで、
  見出し・空状態・CTA すべて `en ? … : …` で分岐しており日本語の直書きは無い
  （`src/app/s/[token]/page.tsx:52-87`）。
- `/onboarding` の未完了状態 — 検証ユーザーを onboarded にした後は `/account` へ飛ぶ。
  onboarded 前の状態は仕込み前の回（run1/run2）で EN / JA とも漏れ 0 を確認済み。
- スタジオ / 制作会社ロール、有料プラン、NDA 締結済みの各状態 — 一般ユーザー（individual /
  free）でのみ検査した。ロール別のカード（`StudioListings` 等）は未検査。
- `/embed`・`/preview`・`/scene-edit`・`/share` — トークンが要るので対象外。
- `/admin/**` は指示どおり対象外。

## 再実行

```
node scripts/i18n-audit-signedin.mjs --out artifacts/i18n-signedin/check
```

終了コードは「EN の未翻訳 + レイアウト不具合」が 1 件でもあれば 1。
2026-09-21 時点で **0 / 0**。
