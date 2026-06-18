"use client";

import { usePathname } from "next/navigation";
import ScanMark from "@/components/scan-mark";

/**
 * ヘッダーのスキャンマーク。トップ (`/`) はスキャン/オンライン両義のため白、
 * それ以外（オンライン版の全ページ）はオンライン色（青）で表示する。
 */
export default function HeaderMark() {
  const pathname = usePathname();
  const reticle = pathname === "/" ? "#fafaf6" : "#5ec8e8";
  return <ScanMark size={22} reticle={reticle} className="flex-none" />;
}
