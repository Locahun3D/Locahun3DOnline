/**
 * 軽量 i18n。URL prefix `/en` で英語、それ以外は日本語（既定）。
 * 1コードベース＋ja/en辞書で管理（ページ複製なし）。
 * - サーバ: middleware が `x-locale` リクエストヘッダを付与 → `getLocale()` で読む。
 * - クライアント: `<LocaleProvider>` から `useT()` / `useLocale()`。
 */
export const LOCALES = ["ja", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export function isLocale(v: unknown): v is Locale {
  return v === "ja" || v === "en";
}

/** EN のとき内部パスに `/en` を付ける（外部URL・既に付いている場合は素通し）。 */
export function localizedHref(href: string, locale: Locale): string {
  if (locale !== "en") return href;
  if (typeof href !== "string" || !href.startsWith("/")) return href; // 外部・アンカー等
  if (href === "/en" || href.startsWith("/en/")) return href;
  return href === "/" ? "/en" : `/en${href}`;
}

/** 現在のパスから locale を取り除いた素のパスを返す（トグル用）。 */
export function stripLocale(pathname: string): string {
  if (pathname === "/en") return "/";
  if (pathname.startsWith("/en/")) return pathname.slice(3) || "/";
  return pathname;
}

type Dict = Record<string, string>;

const ja = {
  "nav.properties": "物件を探す",
  "nav.pricing": "料金",
  "nav.about": "サービスについて",
  "nav.contact": "お問い合わせ",
  "nav.menuOpen": "メニューを開く",
  "nav.menuClose": "メニューを閉じる",
  "header.scan": "スキャン",
  "header.online": "オンライン",
  "auth.login": "ログイン",
  "auth.signup": "新規登録",
  "auth.mypage": "マイページ",
  "auth.admin": "Admin",
  "auth.adminShort": "管理",
  "lang.toEN": "EN",
  "lang.toJA": "日本語",

  // --- Home (/) ---
  "home.scan.h2": "スキャン",
  "home.scan.desc":
    "実空間を 3D Gaussian Splatting でスキャンし、現場をまるごとデータ化して持ち帰る。撮影・制作のための実測 3D。",
  "home.scan.cta": "スキャンを見る",
  "home.online.h2": "オンライン",
  "home.online.desc":
    "ブラウザだけで撮影前ロケハン。スタジオ・倉庫・住宅・屋外ロケ地を 3D で検索し、構図・レンズ・光・動線を現場に行かず検証する。",
  "home.online.cta": "オンラインを見る",
  "home.about.eyebrow": "About — ロケハン3D とは",
  "home.about.lead": "ロケハン3D は、実空間を 3D で扱う 2つのサービスです。",
  "home.about.scanTitle": "ロケハン3D スキャン",
  "home.about.scanDesc":
    "現場に出張し、実空間を 3D Gaussian Splatting でデータ化。撮影・制作のための実測 3D を作ります。",
  "home.about.scanCta": "スキャンを見る",
  "home.about.onlineTitle": "ロケハン3D オンライン",
  "home.about.onlineDesc":
    "スキャンした空間をブラウザで検証・共有・貸出。撮影前ロケハンとスタジオ検索を遠隔で完結します。",
  "home.about.onlineCta": "オンラインを見る",
  "home.cta.headline": "あなたの現場を、3Dに。",
  "home.cta.sub":
    "スキャンして持ち帰り、オンラインで活かす。撮影前の往復を、ブラウザの中へ。",
  "home.cta.scanBtn": "スキャンを相談",
  "home.cta.onlineBtn": "オンラインに登録",


  // --- Plan cards (/pricing) ---
  "plan.billing.monthly": "月払い",
  "plan.billing.annual": "年払い",
  "plan.current": "✓ 利用中",
  "plan.processing": "処理中…",
  "plan.chooseFree": "Free にする",
  "plan.choose": "このプランにする",
  "plan.confirmFree": "Free プランに変更しますか？",
  "plan.free.desc": "登録だけで OK。アカウント作成時 6 トークン付与でハウススタジオを試せる。",
  "plan.free.f1": "全物件のサムネイル・写真閲覧",
  "plan.free.f2": "地図・フィルタ・距離検索",
  "plan.free.f3": "見積もり依頼 月 1 件まで",
  "plan.free.f4": "3DGS ウォークスルー 登録時 6 トークン (一度限り)",
  "plan.ind.desc": "個人クリエイター向け。月 16 トークンで案件 4-6 件分のロケハンに。",
  "plan.ind.f1": "3DGS ウォークスルー 月 16 トークン",
  "plan.ind.f2": "ハウス 1 / 中規模 2 / ドーム 3 トークン消費",
  "plan.ind.f3": "図面ダウンロード 無制限",
  "plan.ind.f4": "履歴・ブックマーク 永続保存",
  "plan.ind.f5": "ログイン端末 3 台まで",
  "plan.ind.f6": "見積もり依頼 無制限",
  "plan.ind.f7": "請求書を毎月自動送付 (電子帳簿対応)",
  "plan.studio.desc": "小規模制作チーム向け。月 32 トークン + 10 端末共有。単発撮影でも余裕。",
  "plan.studio.f1": "Individual の全機能",
  "plan.studio.f2": "3DGS ウォークスルー 月 32 トークン",
  "plan.studio.f3": "10 端末まで同時ログイン",
  "plan.studio.f4": "チーム履歴の共有",
  "plan.studio.f5b": "物件掲示板への書き込み（投稿・返信）",
  "plan.studio.f5": "請求書を毎月自動送付 (電子帳簿対応)",
  "plan.team.desc": "プロダクション向け。月 120 トークン + 30 端末 + 請求書対応。",
  "plan.team.f1": "Studio の全機能",
  "plan.team.f2": "3DGS ウォークスルー 月 120 トークン",
  "plan.team.f3": "30 端末まで同時ログイン",
  "plan.team.f4": "請求書を毎月自動送付＋一括 (電子帳簿対応)",
} satisfies Dict;

const en: Record<keyof typeof ja, string> = {
  "nav.properties": "Browse Locations",
  "nav.pricing": "Pricing",
  "nav.about": "About",
  "nav.contact": "Contact",
  "nav.menuOpen": "Open menu",
  "nav.menuClose": "Close menu",
  "header.scan": "Scan",
  "header.online": "Online",
  "auth.login": "Log in",
  "auth.signup": "Sign up",
  "auth.mypage": "My Page",
  "auth.admin": "Admin",
  "auth.adminShort": "Admin",
  "lang.toEN": "EN",
  "lang.toJA": "JA",

  // --- Home (/) ---
  "home.scan.h2": "Scan",
  "home.scan.desc":
    "We scan real spaces with 3D Gaussian Splatting and bring the entire location back as data — measured 3D for shooting and production.",
  "home.scan.cta": "View Scan",
  "home.online.h2": "Online",
  "home.online.desc":
    "Scout before the shoot from your browser. Search studios, warehouses, homes and outdoor locations in 3D, and check framing, lenses, light and movement without visiting the site.",
  "home.online.cta": "View Online",
  "home.about.eyebrow": "About — What is Locahun 3D",
  "home.about.lead": "Locahun 3D is two services for working with real spaces in 3D.",
  "home.about.scanTitle": "Locahun 3D Scan",
  "home.about.scanDesc":
    "We come on site and capture real spaces with 3D Gaussian Splatting — building measured 3D for shooting and production.",
  "home.about.scanCta": "View Scan",
  "home.about.onlineTitle": "Locahun 3D Online",
  "home.about.onlineDesc":
    "Review, share and rent scanned spaces in your browser — completing pre-shoot scouting and studio search remotely.",
  "home.about.onlineCta": "View Online",
  "home.cta.headline": "Bring your location into 3D.",
  "home.cta.sub":
    "Scan it, take it back, and put it to work online — moving the pre-shoot back-and-forth into the browser.",
  "home.cta.scanBtn": "Talk to us about Scan",
  "home.cta.onlineBtn": "Sign up for Online",


  // --- Plan cards (/pricing) ---
  "plan.billing.monthly": "Monthly",
  "plan.billing.annual": "Annual",
  "plan.current": "✓ Current",
  "plan.processing": "Processing…",
  "plan.chooseFree": "Switch to Free",
  "plan.choose": "Choose this plan",
  "plan.confirmFree": "Switch to the Free plan?",
  "plan.free.desc":
    "Just sign up. You get 6 tokens on account creation to try a house studio.",
  "plan.free.f1": "Thumbnails & photos for all locations",
  "plan.free.f2": "Map, filters & distance search",
  "plan.free.f3": "Up to 1 quote request / month",
  "plan.free.f4": "3DGS walkthrough — 6 tokens at signup (one-time)",
  "plan.ind.desc":
    "For individual creators. 16 tokens/month — enough scouting for 4–6 projects.",
  "plan.ind.f1": "3DGS walkthrough — 16 tokens / month",
  "plan.ind.f2": "House 1 / mid-size 2 / dome 3 tokens each",
  "plan.ind.f3": "Unlimited floor-plan downloads",
  "plan.ind.f4": "Permanent history & bookmarks",
  "plan.ind.f5": "Up to 3 devices signed in",
  "plan.ind.f6": "Unlimited quote requests",
  "plan.ind.f7": "Monthly invoice auto-sent (e-bookkeeping ready)",
  "plan.studio.desc":
    "For small production teams. 32 tokens/month + 10 shared devices — ample even for one-off shoots.",
  "plan.studio.f1": "Everything in Individual",
  "plan.studio.f2": "3DGS walkthrough — 32 tokens / month",
  "plan.studio.f3": "Up to 10 devices signed in",
  "plan.studio.f4": "Shared team history",
  "plan.studio.f5b": "Post & reply on location boards",
  "plan.studio.f5": "Monthly invoice auto-sent (e-bookkeeping ready)",
  "plan.team.desc":
    "For production companies. 120 tokens/month + 30 devices + invoice billing.",
  "plan.team.f1": "Everything in Studio",
  "plan.team.f2": "3DGS walkthrough — 120 tokens / month",
  "plan.team.f3": "Up to 30 devices signed in",
  "plan.team.f4": "Monthly + batch invoices auto-sent (e-bookkeeping ready)",
};

export type DictKey = keyof typeof ja;

const DICTS: Record<Locale, Record<DictKey, string>> = { ja, en };

export function translate(locale: Locale, key: DictKey): string {
  return DICTS[locale]?.[key] ?? ja[key] ?? key;
}
