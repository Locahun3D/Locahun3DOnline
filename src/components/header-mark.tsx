import ScanMark from "@/components/scan-mark";

/**
 * ヘッダーのスキャンマーク。
 *
 * ⚠ 2026-08-16（本人指示「ここの色、青だけにして」）: 以前はトップ (`/`) だけ
 *   レティクルを白 (#fafaf6)、他ページを青 (#5ec8e8) に出し分けていた
 *   （スキャン/オンラインの2サイト分岐の名残）。分岐は廃止済みなので全ページ青に統一。
 *   ヘッダー帯は黒地 (--color-bg: #000) なので、明るい方の青 #5ec8e8 を使う
 *   （ライトテーマの accent #1ea0c4 は黒地では沈む）。
 *   これに伴い usePathname が不要になり、client component ではなくなった。
 */
export default function HeaderMark({
  size = 22,
  label,
}: {
  size?: number;
  /** ロゴの alt。site-header から locale 別の brandName を渡す。 */
  label?: string;
}) {
  return <ScanMark size={size} label={label} className="flex-none" />;
}
