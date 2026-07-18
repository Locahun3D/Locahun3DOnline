"use client";

/**
 * 要素に効いている実効CSSズーム（祖先の zoom を全て掛け合わせた値）を返す。
 *
 * このサイトは html{zoom:0.7/0.9} + ホーム本文 .home-pc110{×1.1/0.9} の
 * 入れ子ズームで全体スケールしている（globals.css 冒頭のルール参照）。
 * clientX/Y・innerWidth/innerHeight・getBoundingClientRect() は「ズーム後の
 * 実画面座標」を返す一方、position:fixed 要素へ style で与える px は
 * 「ズーム前座標」として解釈され描画時に再度ズーム倍される。そのため
 * fixed 要素を JS で配置する時は、実画面座標をこの値で割り戻すこと
 * （bookmark-button のポップオーバー / gateway-overlay のリップルで実害があった）。
 *
 * currentCSSZoom（Chrome 128+）が使えれば入れ子込みの正確な値、無ければ
 * ルートの zoom へフォールバック（入れ子ズーム外の要素はこれで十分）。
 */
export function effectiveZoom(el?: Element | null): number {
  const viaElement = (el as (Element & { currentCSSZoom?: number }) | null | undefined)
    ?.currentCSSZoom;
  if (typeof viaElement === "number" && viaElement > 0) return viaElement;
  if (typeof document !== "undefined") {
    const root = parseFloat(getComputedStyle(document.documentElement).zoom);
    if (Number.isFinite(root) && root > 0) return root;
  }
  return 1;
}
