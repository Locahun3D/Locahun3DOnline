"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * 管理画面サイドバーのナビ。現在開いているページのリンクをハイライトする。
 * 以前は現在地表示が無く、「既にそのページに居るのにリンクを押して
 * 何も起きない＝壊れている」と誤認される実害があったため導入。
 * ?status= 付きのサブリンクはパスが同一のため、ハイライト対象は
 * パス完全一致の主リンクのみ（サブリンクは従来の淡色のまま）。
 */
export interface AdminNavItem {
  href: string;
  label: string;
  /** true = 「↳ 〜のみ」系のインデント付きサブリンク */
  sub?: boolean;
}

export default function AdminNav({ items }: { items: AdminNavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 text-sm">
      {items.map((item) => {
        const path = item.href.split("?")[0];
        const active = !item.sub && pathname === path;
        const cls = item.sub
          ? "pl-6 py-1.5 text-[12px] text-muted hover:text-ink transition"
          : active
            ? "mt-1 px-3 py-2 bg-[#262626] text-accent rounded-sm"
            : "mt-1 px-3 py-2 hover:bg-[#262626] hover:text-accent transition rounded-sm";
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            aria-current={active ? "page" : undefined}
            className={cls}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
