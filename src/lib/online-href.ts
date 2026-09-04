/**
 * works ホスト（web.locahun3d.com）で描くヘッダー/フッターのリンク先を、
 * オンライン版の絶対URLへ寄せるためのヘルパー。
 *
 * ── なぜ要るのか（2026-09-04 本番で発生）────────────────────────
 * works 統合後、works ページのヘッダー/フッターは本物の SiteHeader/SiteFooter に
 * なった。そこに並ぶ `<Link href="/properties">` 等を Next.js が**プリフェッチ**し、
 * `web.locahun3d.com/properties?_rsc=…` を叩く。middleware は works ホストの
 * works 以外を `https://locahun3d.com/` へ 301 するので、
 * クロスオリジンのリダイレクトになり CORS でコンソールに赤エラーが出ていた
 * （1ページ4本。機能は動くが汚い）。
 *
 * 対処: works ホストで描かれるときだけ、works 以外へ向く内部リンクを
 * `https://locahun3d.com` 起点の**絶対URL＋素の `<a>`** にする
 * （→ src/components/site-link.tsx）。素の `<a>` は Next のプリフェッチ対象外。
 *
 * ⚠ works 内リンク（`/works/**`）と言語トグル（`/en/works/**` 切替）は相対のまま。
 *   同一オリジンで完結するので 301 もプリフェッチ事故も起きない。
 * ⚠ workers.dev / localhost では従来どおり相対（＝ローカル検証で本番と同じ
 *   ページ内リンクを踏める）。
 */
export const ONLINE_ORIGIN = "https://locahun3d.com";
export const WORKS_HOST = "web.locahun3d.com";

/** Host ヘッダー（`web.locahun3d.com:443` の形もある）が works ホストか。 */
export function isWorksHostname(host: string | null | undefined): boolean {
  return (host ?? "").split(":")[0].toLowerCase() === WORKS_HOST;
}

/** `absolute` のときだけ locahun3d.com 起点の絶対URLにする（冪等ではない、素のパスを渡すこと）。 */
export function onlineHref(path: string, absolute: boolean): string {
  if (!absolute) return path;
  if (/^https?:\/\//i.test(path)) return path;
  return ONLINE_ORIGIN + path;
}
