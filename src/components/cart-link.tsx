"use client";

import { useEffect, useState } from "react";
import { cartCount, onCartChange } from "@/lib/cart";
import { useLocale } from "@/components/locale-provider";
import { localizedHref } from "@/lib/i18n/dictionaries";
import SiteLink from "@/components/site-link";
import { onlineHref } from "@/lib/online-href";

/** `absolute`: works ホストで描かれているか（SiteHeader がサーバー側で判定して渡す）。 */
export default function CartLink({ absolute = false }: { absolute?: boolean }) {
  const [count, setCount] = useState(0);
  const locale = useLocale();
  const en = locale === "en";

  useEffect(() => {
    const sync = () => setCount(cartCount());
    sync();
    return onCartChange(sync);
  }, []);

  return (
    <SiteLink
      absolute={absolute}
      href={onlineHref(localizedHref("/cart", locale), absolute)}
      aria-label={en ? `Cart (${count} item${count === 1 ? "" : "s"})` : `カート（${count}点）`}
      className="relative flex items-center text-muted hover:text-accent transition whitespace-nowrap"
      title={en ? "Cart" : "カート"}
    >
      {/* 絵文字🛒はmonoフォントのフォールバックで豆腐化する環境があるためSVGで描く。 */}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="w-4 h-4 min-[720px]:w-[18px] min-[720px]:h-[18px]"
      >
        <circle cx="9" cy="21" r="1" />
        <circle cx="20" cy="21" r="1" />
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
      </svg>
      {count > 0 && (
        <span className="absolute -top-2 -right-2.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-accent text-bg mono text-[9px] font-bold">
          {count}
        </span>
      )}
    </SiteLink>
  );
}
