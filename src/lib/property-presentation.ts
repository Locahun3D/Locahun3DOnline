export function propertyTitleSegments(title: string): string[] {
  return Array.from(new Intl.Segmenter("ja", { granularity: "word" }).segment(title), part => part.segment);
}

/** Hide this owner's personal address only in the public presentation. */
export function publicPropertyEmail(id: string, email: string): string {
  return id === "shibuyasq" ? "" : email;
}

/**
 * Google マップの検索語。施設名＋住所を優先する（座標だと施設として出ず、
 * レビューも見られない — 2026-09-19 UI改善会議）。名前・住所が無ければ座標。
 */
export function googleMapsQuery(coords: { lat: number; lng: number } | null, address: string, name = ""): string {
  const cleanName = name.replace(/\s+/g, " ").trim();
  const text = [cleanName, address.trim()].filter(Boolean).join(" ");
  if (text) return text;
  return coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng) ? `${coords.lat},${coords.lng}` : "";
}

export function googleMapsUrl(coords: { lat: number; lng: number } | null, address: string, name = ""): string {
  const query = googleMapsQuery(coords, address, name);
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : "";
}

/** APIキー不要の埋め込み地図 URL（iframe 用）。 */
export function googleMapsEmbedUrl(coords: { lat: number; lng: number } | null, address: string, name = ""): string {
  const query = googleMapsQuery(coords, address, name);
  return query ? `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed` : "";
}

/**
 * 「用途別の目安」（物件ページ概要カード、2026-09-19 本人採用の案18）。
 * 単価だけでは「結局いくら？」に答えないため、撮影の単位（スチール少人数／半日／ムービー1日）で
 * 合計を出す。最低利用時間を下回る行は最低時間に切り上げる。日額があれば1日行はそれを使う。
 * 時間貸し以外（定額・無料）や単価未設定では出さない。
 */
export type UsageEstimate = { key: "still-small" | "still-half" | "movie-day"; hours: number; total: number; daily: boolean };
export function usageEstimates(p: { priceType: string; hourlyPrice: number; minUsageHours: number; dailyPrice: number }): UsageEstimate[] {
  if (p.priceType !== "hourly" || !(p.hourlyPrice > 0)) return [];
  const min = Math.max(0, p.minUsageHours | 0);
  const row = (key: UsageEstimate["key"], base: number): UsageEstimate => {
    const hours = Math.max(base, min);
    return { key, hours, total: hours * p.hourlyPrice, daily: false };
  };
  const day = p.dailyPrice > 0 ? { ...row("movie-day", 9), total: p.dailyPrice, daily: true } : row("movie-day", 9);
  return [row("still-small", 3), row("still-half", 5), day];
}

/**
 * 料金シミュレーション（2026-09-20 本人要望: 時間帯で料金が変わる／用途で変わる）。
 * 1時間ごとに、その時刻に当てはまる割増のうち最も高い率を1つだけ掛ける（夜間と土日祝が重なっても二重にしない —
 * スタジオの料金表は「夜間・土日祝は20%UP」のようにどちらか一方の扱いが一般的）。
 * fromHour > toHour は日をまたぐ時間帯（20→8）。holidays=true の割増は「土日祝」を選んだ時に全時間へ掛かる。
 */
export type RateSurcharge = { label: string; percent: number; fromHour: number; toHour: number; holidays: boolean; includeSaturday?: boolean };
/** 利用日の種類。土曜だけ対象外にする割増（日曜・祝日のみ）があるため、土曜を分けて持つ。 */
export type DayKind = "weekday" | "saturday" | "sunday" | "holiday";
export type PriceLine = { label: string; hours: number; rate: number };
export function simulatePrice(input: { hourlyPrice: number; startHour: number; hours: number; holiday: boolean; day?: DayKind; surcharges: RateSurcharge[] }): { total: number; lines: PriceLine[] } {
  const lines: PriceLine[] = [];
  for (let i = 0; i < input.hours; i++) {
    const h = (input.startHour + i) % 24;
    let best: RateSurcharge | null = null;
    for (const s of input.surcharges) {
      const inWindow = s.fromHour === s.toHour ? false : s.fromHour < s.toHour ? h >= s.fromHour && h < s.toHour : h >= s.fromHour || h < s.toHour;
      const day: DayKind = input.day ?? (input.holiday ? "holiday" : "weekday");
      const dayOff = day === "sunday" || day === "holiday" || (day === "saturday" && s.includeSaturday !== false);
      if ((s.holidays ? dayOff : inWindow) && (!best || s.percent > best.percent)) best = s;
    }
    const label = best ? best.label : "通常";
    const rate = best ? Math.round(input.hourlyPrice * (1 + best.percent / 100)) : input.hourlyPrice;
    const last = lines[lines.length - 1];
    if (last && last.label === label && last.rate === rate) last.hours++;
    else lines.push({ label, hours: 1, rate });
  }
  return { total: lines.reduce((sum, l) => sum + l.rate * l.hours, 0), lines };
}

/**
 * 料金は必ず「選択制」にする（2026-09-20 本人指示「全て選択制になるように」）。
 * 用途別プラン（ratePlans）が無い物件でも、持っている単価から選択肢を作る:
 *   時間単価あり → 「時間貸し」、日額あり → 「1日貸し」。プランがある物件はプラン＋（日額があれば）1日貸し。
 * 時間貸し以外（定額・無料）や、単価が1つも無い物件は空配列（シミュレーター自体を出さない）。
 */
export type PriceChoice = { key: string; kind: "hourly" | "daily"; label: string; labelEn: string; price: number; minHours: number; fromPlan: boolean };
export function priceChoices(p: {
  priceType: string; hourlyPrice: number; minUsageHours: number; dailyPrice: number;
  ratePlans?: { label: string; labelEn?: string; hourlyPrice: number; minHours?: number }[];
}): PriceChoice[] {
  if (p.priceType !== "hourly") return [];
  const baseMin = Math.max(1, p.minUsageHours | 0);
  const plans = (p.ratePlans ?? []).filter((r) => r.label && r.hourlyPrice > 0);
  const out: PriceChoice[] = plans.map((r, i) => ({
    key: `plan-${i}`, kind: "hourly", label: r.label, labelEn: r.labelEn || "", price: r.hourlyPrice,
    minHours: Math.max(1, (r.minHours || baseMin) | 0), fromPlan: true,
  }));
  if (out.length === 0 && p.hourlyPrice > 0) {
    out.push({ key: "hourly", kind: "hourly", label: "時間貸し", labelEn: "Hourly", price: p.hourlyPrice, minHours: baseMin, fromPlan: false });
  }
  if (p.dailyPrice > 0) {
    out.push({ key: "daily", kind: "daily", label: "1日貸し", labelEn: "Full day", price: p.dailyPrice, minHours: 0, fromPlan: false });
  }
  return out;
}

/**
 * 1日貸しの計算。時間帯の割増（夜間など）は日額に含まれる扱いで掛けない。
 * 土日祝の割増（holidays=true）だけを、日ごとの曜日種別に応じて掛ける（複数あれば最も高い率を1つ）。
 * days[i] は i 日目の種別。日付未選択なら全て "weekday" を渡す。
 */
export function simulateDailyPrice(input: { dailyPrice: number; days: DayKind[]; surcharges: RateSurcharge[] }): { total: number; lines: PriceLine[] } {
  const lines: PriceLine[] = [];
  for (const day of input.days) {
    let best: RateSurcharge | null = null;
    for (const s of input.surcharges) {
      if (!s.holidays) continue;
      const dayOff = day === "sunday" || day === "holiday" || (day === "saturday" && s.includeSaturday !== false);
      if (dayOff && (!best || s.percent > best.percent)) best = s;
    }
    const label = best ? best.label : "通常";
    const rate = best ? Math.round(input.dailyPrice * (1 + best.percent / 100)) : input.dailyPrice;
    const last = lines[lines.length - 1];
    if (last && last.label === label && last.rate === rate) last.hours++;
    else lines.push({ label, hours: 1, rate });
  }
  return { total: lines.reduce((sum, l) => sum + l.rate * l.hours, 0), lines };
}

/** 1日貸しを選んだ時の目安表（1〜3日）。PriceLine と違い割増なしの素の合計。 */
export function dailyEstimates(dailyPrice: number): { days: number; total: number }[] {
  return dailyPrice > 0 ? [1, 2, 3].map((days) => ({ days, total: days * dailyPrice })) : [];
}

/**
 * 物件タイトルを「スタジオ名」と「意味のまとまりごとの行」に分ける（2026-09-20 本人指示）。
 *   "Studio Union｜世田谷若林 自然光ハウススタジオ" → name "Studio Union" / lines ["世田谷若林", "自然光ハウススタジオ"]
 * 区切りは「｜」「|」と改行。区切りより後ろは空白（全角含む）でまとまりに分ける。
 * 区切りが無いタイトル（"新宿西口 思い出横丁" 等の地名）は1行のまま — 空白で勝手に割らない。
 */
export function propertyTitleLines(title: string): { name: string; lines: string[] } {
  const parts = (title || "").split(/\s*[｜|\n]\s*/).map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return { name: "", lines: [] };
  const [name, ...rest] = parts;
  return { name, lines: rest.flatMap((r) => r.split(/[\s　]+/).filter(Boolean)) };
}
