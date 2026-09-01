import SiteHeader from "@/components/site-header";

/**
 * `/partials/header` が内部的に読む「ヘッダーだけのページ」。
 *
 * 直接見せるためのページではない（`/partials/header` が HTML と CSS を取り出す
 * ための素材）。ルートレイアウトは middleware の `x-partial` を見て
 * html/body 以外を出さない骨組みモードになる。
 *
 * ⚠ ここで SiteHeader を「別実装」してはいけない。works に配るヘッダーが
 *   オンライン版と同一DOMであることが、この仕組みの唯一の存在理由。
 */
export const dynamic = "force-dynamic";

export default function HeaderFramePage() {
  return <SiteHeader />;
}
