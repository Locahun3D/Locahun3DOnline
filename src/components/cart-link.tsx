"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cartCount, onCartChange } from "@/lib/cart";
import { useLocale } from "@/components/locale-provider";
import { localizedHref } from "@/lib/i18n/dictionaries";

export default function CartLink() {
  const [count, setCount] = useState(0);
  const locale = useLocale();
  const en = locale === "en";

  useEffect(() => {
    const sync = () => setCount(cartCount());
    sync();
    return onCartChange(sync);
  }, []);

  return (
    <Link
      href={localizedHref("/cart", locale)}
      aria-label={en ? `Cart (${count} item${count === 1 ? "" : "s"})` : `カート（${count}点）`}
      className="relative flex items-center text-muted hover:text-accent transition whitespace-nowrap"
      title={en ? "Cart" : "カート"}
    >
      <span className="mono text-[12px] tracking-[0.18em] uppercase">🛒</span>
      {count > 0 && (
        <span className="absolute -top-2 -right-2.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-accent text-bg mono text-[9px] font-bold">
          {count}
        </span>
      )}
    </Link>
  );
}
