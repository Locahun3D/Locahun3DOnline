import "./works.css";

/**
 * works（実績＆技術ブログ）のラッパー。
 *
 * 記事本文は取り込み済みの生HTML（content/works/**）をそのまま流し込むため、
 * 独自リセット・黒地・独自CSS変数を持っている。`.works-root` に閉じ込めて
 * 他ページへ漏らさない（CSS のスコープ化は scripts/import-works.mjs 側で実施）。
 *
 * ⚠ ヘッダー/フッターはここでは描かない。ルート layout の本物の
 *   SiteHeader / SiteFooter を使う（取り込み時に静的ヘッダー・静的フッターは
 *   捨ててある）。2026-09-03 の統合まで works は「オンライン版のヘッダーを
 *   配信時に注入する」方式だったが、統合により不要になった。
 */
export default function WorksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="works-scale">
      <div className="works-root">{children}</div>
    </div>
  );
}
