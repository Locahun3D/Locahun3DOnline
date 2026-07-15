/**
 * 日本時間（Asia/Tokyo）基準の日時表示ヘルパー。
 *
 * Cloudflare Workers上のJSランタイムはデフォルトタイムゾーンがUTCで、
 * `new Date(iso).getFullYear()`等のローカルゲッターやtimeZone未指定の
 * `toLocaleString()`はすべてUTCとして日時を表示してしまう（実際に本番の
 * 購入履歴・アカウント登録日等がJSTから最大9時間ずれて表示されるバグが
 * あった）。日時を表示する箇所は必ずこのヘルパー経由で Asia/Tokyo を
 * 明示すること。
 */
const TZ = "Asia/Tokyo";

function toDate(input: string | number | Date): Date | null {
  const d = input instanceof Date ? input : new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parts(d: Date, opts: Intl.DateTimeFormatOptions, locale: string) {
  const formatted = new Intl.DateTimeFormat(locale, { ...opts, timeZone: TZ }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) => formatted.find((p) => p.type === type)?.value ?? "";
  return get;
}

/** "YYYY-MM-DD HH:mm"（JST）。管理画面の一覧でよく使う形式。 */
export function fmtDateTimeJST(input: string | number | Date): string {
  const d = toDate(input);
  if (!d) return String(input);
  const get = parts(
    d,
    { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false },
    "ja-JP",
  );
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

/** "YYYY-MM-DD"（JST）。 */
export function fmtDateOnlyJST(input: string | number | Date): string {
  const d = toDate(input);
  if (!d) return String(input);
  const get = parts(d, { year: "numeric", month: "2-digit", day: "2-digit" }, "ja-JP");
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** "YYYY年M月D日 HH:mm"（JST）。 */
export function fmtDateTimeJa(input: string | number | Date): string {
  const d = toDate(input);
  if (!d) return String(input);
  const get = parts(
    d,
    { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false },
    "ja-JP",
  );
  return `${get("year")}年${get("month")}月${get("day")}日 ${get("hour")}:${get("minute")}`;
}

/** "YYYY年M月D日"（JST）。 */
export function fmtDateJa(input: string | number | Date): string {
  const d = toDate(input);
  if (!d) return String(input);
  const get = parts(d, { year: "numeric", month: "numeric", day: "numeric" }, "ja-JP");
  return `${get("year")}年${get("month")}月${get("day")}日`;
}

/** locale対応の "YYYY-MM-DD HH:mm" / "MM/DD/YYYY, HH:mm"（JST基準・toLocaleString代替）。 */
export function fmtDateTimeLocaleJST(input: string | number | Date, locale: "ja-JP" | "en-US" = "ja-JP"): string {
  const d = toDate(input);
  if (!d) return String(input);
  return new Intl.DateTimeFormat(locale, {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** "YYYY年M月D日"（長い月表記・toLocaleDateString代替）。 */
export function fmtDateLongJST(input: string | number | Date, locale: "ja-JP" | "en-US" = "ja-JP"): string {
  const d = toDate(input);
  if (!d) return String(input);
  return new Intl.DateTimeFormat(locale, {
    timeZone: TZ,
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(d);
}

/**
 * アナリティクスの「日別バケット」キー等に使う "YYYY-MM-DD"（JST基準）。
 * `new Date().toISOString().slice(0,10)` はUTC日付になり、JST 0:00〜8:59
 * (前日15:00〜23:59 UTC) のイベントが前日のバケットに誤って集計される
 * バグの元だった。+9時間シフトしてから UTC ゲッターで読む標準的な手法
 * （日本はDSTが無いため安全）。
 */
export function jstDayKey(input: string | number | Date = new Date()): string {
  const d = toDate(input) ?? new Date();
  const jst = new Date(d.getTime() + 9 * 3600 * 1000);
  return jst.toISOString().slice(0, 10);
}
