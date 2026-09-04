import Link from "next/link";
import type { AnchorHTMLAttributes, ReactNode } from "react";

/**
 * ヘッダー/フッター用のリンク。
 *
 * `absolute` が真（＝works ホストで描いている）のときは **素の `<a>`**。
 * `<Link>` のままだと Next.js が `?_rsc=` でプリフェッチし、middleware の
 * 301（web.locahun3d.com → locahun3d.com）を跨いで CORS エラーになる。
 * 詳細は src/lib/online-href.ts。
 *
 * ⚠ "use client" を付けないこと。サーバー（SiteHeader/SiteFooter）とクライアント
 *   （CartLink/NotificationBell）の両方から使う。
 */
export default function SiteLink({
  absolute = false,
  href,
  children,
  ...rest
}: { absolute?: boolean; href: string; children?: ReactNode } & Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "href"
>) {
  if (absolute) {
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} {...rest}>
      {children}
    </Link>
  );
}
