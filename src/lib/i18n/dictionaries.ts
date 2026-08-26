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
  // ⚠ 2026-08-16: /demo は /pricing へ統合（本人指示「料金とデモまとめて」）。
  //   デモ体験・料金シミュレーターは料金ページ内にあるのでラベルも併記に変えた。
  //   旧 "nav.demo" キーは削除済み（ナビ項目も 6→5 に減った）。
  "nav.pricing": "料金・デモ",
  "nav.about": "サービスについて",
  // 実績＆ブログ は web.locahun3d.com/works/ のまま（URL不変・本人指示 2026-08-16）。
  // ラベルはスキャンサイトのヘッダーと同一表記。
  "nav.works": "実績＆ブログ",
  "nav.contact": "お問い合わせ",
  "nav.menuOpen": "メニューを開く",
  "nav.menuClose": "メニューを閉じる",
  "auth.login": "ログイン",
  "auth.signup": "新規登録",
  "auth.mypage": "マイページ",
  "auth.admin": "Admin",
  "auth.adminShort": "管理",
  "lang.toEN": "EN",
  "lang.toJA": "日本語",

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
  // ⚠ 以前は「見積もり依頼」だったが、/contact ページ側は同じ機能を「問い合わせ」と
  //   呼んでおり表記ゆれになっていた。呼び方を統一（2026-08-01 レビュー）。
  "plan.free.f3": "問い合わせ 月 1 件まで",
  "plan.free.f4": "3DGS ウォークスルー 登録時 6 トークン (一度限り)",
  "plan.ind.desc": "個人クリエイター向け。月 16 トークンで案件 4-6 件分のロケハンに。",
  "plan.ind.f1": "3DGS ウォークスルー 月 16 トークン",
  "plan.ind.f2": "ハウス 1 / 中規模 2 / ドーム 3 トークン消費",
  "plan.ind.f3": "図面ダウンロード 無制限",
  "plan.ind.f4": "履歴・ブックマーク 永続保存",
  "plan.ind.f5": "ログイン端末 3 台まで",
  "plan.ind.f6": "問い合わせ 無制限",
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
  "nav.pricing": "Pricing & Demo",
  "nav.about": "About",
  "nav.works": "Work & Blog",
  "nav.contact": "Contact",
  "nav.menuOpen": "Open menu",
  "nav.menuClose": "Close menu",
  "auth.login": "Log in",
  "auth.signup": "Sign up",
  "auth.mypage": "My Page",
  "auth.admin": "Admin",
  "auth.adminShort": "Admin",
  "lang.toEN": "EN",
  "lang.toJA": "JA",

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
  "plan.free.f3": "Up to 1 inquiry / month",
  "plan.free.f4": "3DGS walkthrough — 6 tokens at signup (one-time)",
  "plan.ind.desc":
    "For individual creators. 16 tokens/month — enough scouting for 4–6 projects.",
  "plan.ind.f1": "3DGS walkthrough — 16 tokens / month",
  "plan.ind.f2": "House 1 / mid-size 2 / dome 3 tokens each",
  "plan.ind.f3": "Unlimited floor-plan downloads",
  "plan.ind.f4": "Permanent history & bookmarks",
  "plan.ind.f5": "Up to 3 devices signed in",
  "plan.ind.f6": "Unlimited inquiries",
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
