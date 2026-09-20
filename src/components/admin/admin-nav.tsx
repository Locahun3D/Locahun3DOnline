"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * 管理画面のナビ。2026-09-20 に見直し（本人指示「メニューが多い。まとめられるものはまとめたい」
 * 「PC と iPad で見る」）:
 *   - 14 本の平たい並びを 4 つのまとまり（物件／連絡／売上／運営）にした。
 *   - 「↳ 下書きのみ」などの絞り込みリンクは各ページのタブと重複していたので外した。
 *   - 1024px 以上は左のサイドバー、それ未満（iPad 縦）は上部の折りたたみメニューにして、本文に横幅を返す。
 * 現在地のハイライトは従来どおり（「押しても何も起きない＝壊れている」の誤認を防ぐ）。
 */
export interface AdminNavItem {
  href: string;
  label: string;
  /** 未読数などの小さな数字バッジ */
  badge?: number;
}
export interface AdminNavGroup {
  title: string;
  items: AdminNavItem[];
}

export default function AdminNav({ groups, heading }: { groups: AdminNavGroup[]; heading: string }) {
  const pathname = usePathname();
  const isActive = (href: string) => {
    const path = href.split("?")[0];
    return pathname === path || pathname.startsWith(path + "/");
  };
  const current = groups.flatMap((g) => g.items).find((i) => isActive(i.href));

  const list = (
    <div className="grid gap-x-6 gap-y-4 max-lg:grid-cols-2 max-lg:sm:grid-cols-4">
      {groups.map((g) => (
        <div key={g.title}>
          <div className="mono text-[10px] tracking-[0.2em] uppercase text-muted/80 mb-1.5 px-3">{g.title}</div>
          <nav className="flex flex-col gap-0.5 text-[13.5px]">
            {g.items.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center justify-between gap-2 px-3 min-h-[40px] rounded-sm transition ${
                    active ? "bg-[#262626] text-accent" : "hover:bg-[#262626] hover:text-accent"
                  }`}
                >
                  <span>{item.label}</span>
                  {!!item.badge && (
                    <span className="mono text-[10px] px-1.5 py-0.5 rounded-full bg-accent text-bg leading-none">{item.badge}</span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      ))}
    </div>
  );

  return (
    <>
      {/* iPad 縦など（<1024px）: 上部の折りたたみメニュー */}
      <details className="lg:hidden border-b border-line bg-[#141414] group">
        <summary className="flex items-center justify-between gap-3 px-4 min-h-[48px] cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <span className="flex items-baseline gap-3">
            <span className="serif text-base">{heading}</span>
            {current && <span className="text-[13px] text-accent">{current.label}</span>}
          </span>
          <span className="mono text-[11px] tracking-[0.18em] text-muted group-open:hidden">メニュー ▾</span>
          <span className="mono text-[11px] tracking-[0.18em] text-muted hidden group-open:inline">閉じる ▴</span>
        </summary>
        <div className="px-2 pb-4 pt-1">{list}</div>
      </details>

      {/* PC・iPad 横（≥1024px）: 左サイドバー */}
      <aside className="hidden lg:block border-r border-line px-3 py-5 bg-[#141414] sticky top-[calc(var(--header-h)/var(--z))] self-start max-h-[calc(100dvh-var(--header-h))] overflow-y-auto">
        <div className="serif text-lg mb-4 px-3">{heading}</div>
        {list}
      </aside>
    </>
  );
}
