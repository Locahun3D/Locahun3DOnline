import "server-only";

/**
 * 公開の問い合わせフォーム向け軽量スパム対策。外部サービス（Turnstile 等）に
 * 依存しない自己完結の3層防御:
 *   1) ハニーポット（隠しフィールド）
 *   2) 時間ガード（開いてから送信までの経過時間）
 *   3) 送信元レート制限（同一 IP × 同一物件の直近件数）
 *
 * レート制限は Worker インスタンス内のメモリ Map（TTL 付き）で行う。D1 に新テーブルや
 * IP 永続化を持ち込まず、Workers の実行モデルに合わせた実用的な下限として機能する
 * （ハニーポット＋時間ガードと重ねる前提の追加防御）。
 */

/** 送信が速すぎる（人間なら最低これだけかかる）とみなす下限。 */
export const MIN_FILL_MS = 2500;
/** フォームが古すぎる（キャッシュ/リプレイ疑い）とみなす上限。 */
export const MAX_FORM_AGE_MS = 24 * 60 * 60 * 1000;
/** レート制限のウィンドウ。 */
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 時間
/** ウィンドウ内に許可する同一送信元×同一物件の最大件数。 */
const RATE_MAX = 5;

/** ハニーポットに使う隠しフィールド名。フォームと共有する。 */
export const HONEYPOT_FIELD = "website";
/** フォーム描画時刻（ミリ秒 epoch）を入れる隠しフィールド名。 */
export const RENDERED_AT_FIELD = "_rt";

/**
 * ハニーポット判定。人間には見えないフィールドに値が入っていれば bot。
 * true = bot（呼び出し側は「静かに成功」を返して学習させない）。
 */
export function isHoneypotTripped(value: FormDataEntryValue | null): boolean {
  return typeof value === "string" && value.trim() !== "";
}

export type TimingVerdict = "ok" | "too-fast" | "stale";

/**
 * 時間ガード。フォーム描画時刻から現在までの経過で判定する。
 * - 値が無い/壊れている場合は "ok"（旧クライアント互換。ガードは他の層に委ねる）。
 * - 速すぎ → "too-fast"（bot 扱い、静かに成功）。
 * - 古すぎ → "stale"（リロードを促すエラー）。
 */
export function checkTiming(renderedAtRaw: FormDataEntryValue | null): TimingVerdict {
  const renderedAt = Number(renderedAtRaw);
  if (!Number.isFinite(renderedAt) || renderedAt <= 0) return "ok";
  const elapsed = Date.now() - renderedAt;
  // 未来時刻（時計ずれ/改ざん）は判定不能として通す。
  if (elapsed < 0) return "ok";
  if (elapsed < MIN_FILL_MS) return "too-fast";
  if (elapsed > MAX_FORM_AGE_MS) return "stale";
  return "ok";
}

/* --- 送信元レート制限（Worker インスタンス内メモリ） --- */

interface Bucket {
  count: number;
  resetAt: number;
}

// globalThis に載せて HMR/モジュール再評価をまたいで共有する。
const g = globalThis as unknown as { __inquiryRate?: Map<string, Bucket> };
const buckets: Map<string, Bucket> = (g.__inquiryRate ??= new Map());

/**
 * 同一送信元（IP or userId）× 同一物件のレート制限。
 * 呼ぶたびにカウントを 1 進める。上限超過なら false（拒否）を返す。
 * source が空（IP 取得不可）の場合はレート制限を適用しない（誤検知回避）。
 */
export function allowByRate(source: string, propertyId: string): boolean {
  if (!source) return true;
  const key = `${source}::${propertyId}`;
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    // たまに古いエントリを掃除（メモリ肥大化防止）。
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) if (now >= v.resetAt) buckets.delete(k);
    }
    return true;
  }
  if (b.count >= RATE_MAX) return false;
  b.count += 1;
  return true;
}
