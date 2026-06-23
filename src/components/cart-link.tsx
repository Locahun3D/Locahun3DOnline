"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cartCount, onCartChange } from "@/lib/cart";

export default function CartLink() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const sync = () => setCount(cartCount());
    sync();
    return onCartChange(sync);
  }, []);

  return (
    <Link
      href="/cart"
      aria-label={`カート（${count}点）`}
      className="relative flex items-center text-muted hover:text-accent transition whitespace-nowrap"
      title="カート"
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
