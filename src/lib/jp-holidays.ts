/**
 * 日本の祝日判定（2026-09-20。料金シミュレーションの「土日祝」割増に使う）。
 * 外部データを持たず計算で出す: 固定日・ハッピーマンデー・春分/秋分（1980〜2099年の近似式）・
 * 振替休日（祝日が日曜なら次の平日）・国民の休日（祝日に挟まれた平日）。2020・2021年の五輪特例は扱わない。
 */
const FIXED: Record<string, string> = {
  "1-1": "元日", "2-11": "建国記念の日", "2-23": "天皇誕生日", "4-29": "昭和の日", "5-3": "憲法記念日",
  "5-4": "みどりの日", "5-5": "こどもの日", "8-11": "山の日", "11-3": "文化の日", "11-23": "勤労感謝の日",
};
const MONDAYS: [number, number, string][] = [[1, 2, "成人の日"], [7, 3, "海の日"], [9, 3, "敬老の日"], [10, 2, "スポーツの日"]];

function dow(y: number, m: number, d: number): number {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
function nthMonday(y: number, m: number, n: number): number {
  const first = dow(y, m, 1);
  return 1 + ((8 - first) % 7) + (n - 1) * 7;
}
function base(y: number, m: number, d: number): string | null {
  const fixed = FIXED[`${m}-${d}`];
  if (fixed) return fixed;
  for (const [mm, n, name] of MONDAYS) if (m === mm && d === nthMonday(y, mm, n)) return name;
  const k = 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4);
  if (m === 3 && d === Math.floor(20.8431 + k)) return "春分の日";
  if (m === 9 && d === Math.floor(23.2488 + k)) return "秋分の日";
  return null;
}
function shift(y: number, m: number, d: number, by: number): [number, number, number] {
  const t = new Date(Date.UTC(y, m - 1, d + by));
  return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()];
}

export function jpHolidayName(y: number, m: number, d: number): string | null {
  const own = base(y, m, d);
  if (own) return own;
  // 振替休日: 直前に連続する祝日をさかのぼり、その先頭が日曜なら今日が振替
  let [py, pm, pd] = shift(y, m, d, -1);
  while (base(py, pm, pd)) {
    if (dow(py, pm, pd) === 0) return "振替休日";
    [py, pm, pd] = shift(py, pm, pd, -1);
  }
  // 国民の休日: 前日と翌日がともに祝日の平日
  const [ay, am, ad] = shift(y, m, d, -1);
  const [by, bm, bd] = shift(y, m, d, 1);
  if (dow(y, m, d) !== 0 && base(ay, am, ad) && base(by, bm, bd)) return "国民の休日";
  return null;
}

/** "YYYY-MM-DD" が土日または祝日か。 */
export function isJpDayOff(iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const w = dow(y, mo, d);
  return w === 0 || w === 6 || jpHolidayName(y, mo, d) !== null;
}
