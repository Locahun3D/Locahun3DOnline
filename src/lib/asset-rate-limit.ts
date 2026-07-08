import "server-only";

/**
 * /api/viewer-asset は R2 への署名URLを発行するだけで、以降の実ダウンロードは
 * R2 に直接飛びアプリコードを経由しない。よってアプリ側で唯一制御できるのは
 * 「同一ユーザー×同一アセットに対して短時間にどれだけ発行要求が来たか」だけ。
 *
 * inquiry-guard.ts の allowByRate と同じ方針: Worker インスタンス内メモリの
 * globalThis Map で行う。D1に新テーブルを持ち込まず、Workersの実行モデル
 * （インスタンスが多数リクエストにまたがって生き続ける）に合わせた実用的な
 * 下限として機能する。厳密な全世界一貫性は無いが、この用途は「不正利用の
 * 抑止」であって暗号学的な保証ではないため十分。
 */
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 5;

interface Bucket {
  count: number;
  resetAt: number;
}

const g = globalThis as unknown as { __assetDownloadRate?: Map<string, Bucket> };
const buckets: Map<string, Bucket> = (g.__assetDownloadRate ??= new Map());

/**
 * 同一ユーザー×同一アセットキーのレート制限。呼ぶたびにカウントを1進める。
 * 上限超過なら false（拒否）を返す。
 */
export function allowAssetDownload(userId: string, assetKey: string): boolean {
  const key = `${userId}::${assetKey}`;
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
