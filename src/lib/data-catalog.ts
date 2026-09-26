import type { Property } from "./schemas";
import { resolveLicenseOptions } from "./license-options";
import { resolveDownloadFiles } from "./downloads";
import { isDataSaleDisabled, isDataSaleFree } from "./settings-schema";

/**
 * 3Dデータ販売の一覧（/data）に出す並び（2026-09-26 本人指示「販売一覧ページ /data を新設」）。
 *
 * なぜ要るか: 販売情報が物件ページの奥にしか無く、検索エンジンにも人にも
 * 「ここは3Dデータを売っている店だ」と伝わっていなかった（「渋谷 3Dデータ」で出てこない件）。
 *
 * ここは純関数（server / client 両方から import する。`server-only` 禁止）。
 * 実データの取得はページ側（getPublishedProperties）。
 */

export interface DataSaleEntry {
  propertyId: string;
  propertyTitle: string;
  /** シーンの位置（0始まり）。物件ページの #scene-N と合わせる。 */
  sceneIndex: number;
  sceneId: string;
  sceneLabel: string;
  area: string;
  prefecture: string;
  city: string;
  category: Property["category"];
  /** 税込・円。無料配布中は 0。 */
  price: number;
  free: boolean;
  licenses: string[];
  /** 付属するファイルの形式（PLY / OBJ など）。 */
  formats: string[];
  sizeMb: number;
  scannedAt: string;
  cover: { src: string; alt: string };
  /** 物件ページの該当シーンへのパス（ロケール前）。 */
  href: string;
}

/**
 * 配布ファイルの形式。エディターで付けた format を正とし、無いときだけ拡張子から読む
 * （.rad のような配信用の内部形式ではなく、買い手が受け取る形式を出したい）。
 */
function formatsOf(files: { format?: string; url?: string }[]): string[] {
  const out = new Set<string>();
  for (const f of files) {
    const label = (f.format ?? "").trim();
    if (label && label.toUpperCase() !== "DATA") {
      out.add(label.toUpperCase());
      continue;
    }
    const m = /\.([A-Za-z0-9]{2,6})(?:$|\?)/.exec(f.url ?? "");
    if (m) out.add(m[1].toUpperCase());
  }
  return [...out].sort();
}

/**
 * 公開中の物件から「いま買える3Dデータ」を取り出す。
 * 販売中でも配布ファイルが無いものは出さない（買えない導線を作らない。物件ページと同じ判断）。
 */
export function listDataSales(properties: Property[], nowIso: string): DataSaleEntry[] {
  const entries: DataSaleEntry[] = [];
  for (const p of properties) {
    p.splatItems.forEach((item, index) => {
      if (!item.forSale) return;
      if (isDataSaleDisabled(item.freePeriod, nowIso)) return;
      const files = resolveDownloadFiles(item);
      if (files.length === 0) return;
      const free = isDataSaleFree(item.freePeriod, nowIso);
      const options = resolveLicenseOptions(item);
      const price = free ? 0 : Math.min(...options.map((o) => o.price));
      entries.push({
        propertyId: p.id,
        propertyTitle: p.title,
        sceneIndex: index,
        sceneId: item.id,
        sceneLabel: item.label || `シーン${index + 1}`,
        area: p.area,
        prefecture: p.prefecture,
        city: p.city,
        category: p.category,
        price: Number.isFinite(price) ? price : 0,
        free,
        licenses: options.map((o) => o.license),
        formats: formatsOf(files),
        sizeMb: item.sizeMb ?? 0,
        scannedAt: p.scannedAt ?? "",
        cover: { src: p.cover.src, alt: p.cover.alt || p.title },
        href: `/properties/${p.id}#scene-${index}`,
      });
    });
  }
  // 無料配布を先頭に、そのあとは新しい撮影から。値段順にはしない（安い順は買い方を歪める）。
  return entries.sort((a, b) => {
    if (a.free !== b.free) return a.free ? -1 : 1;
    return (b.scannedAt || "").localeCompare(a.scannedAt || "");
  });
}

/** 一覧の見出しに出す要約（件数・無料の有無・最低価格）。 */
export function summarizeDataSales(entries: DataSaleEntry[]): {
  count: number;
  freeCount: number;
  minPrice: number;
} {
  const paid = entries.filter((e) => !e.free);
  return {
    count: entries.length,
    freeCount: entries.length - paid.length,
    minPrice: paid.length > 0 ? Math.min(...paid.map((e) => e.price)) : 0,
  };
}
