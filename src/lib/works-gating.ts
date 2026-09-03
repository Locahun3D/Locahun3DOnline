import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * works 記事の公開状態。
 *
 * 保存先は Cloudflare KV `WORKS_KV`（旧マーケサイトの Worker が使っていた
 * ネームスペースをそのまま流用する。wrangler.jsonc の id を参照）。
 *   キー: `works:<slug>`  （JA/EN で1エントリを共有する ＝ 旧実装と同じ）
 *   値  : { status, shareToken? }
 * エントリが無い slug は published 扱い（記事を足しただけで公開される）。
 */
export type WorksStatus = "published" | "draft" | "private";

export type WorksMeta = {
  status: WorksStatus;
  shareToken?: string | null;
};

export const WORKS_STATUSES: WorksStatus[] = ["published", "draft", "private"];

const KEY = (slug: string) => `works:${slug}`;
const DEFAULT_META: WorksMeta = { status: "published" };

type KV = {
  get(key: string, type: "json"): Promise<unknown>;
  put(key: string, value: string): Promise<void>;
  list(opts: { prefix: string }): Promise<{ keys: { name: string }[] }>;
};

/**
 * KV バインディングを取る。dev（`next dev`）ではバインディングが無いので null。
 * 呼び出し側は null を「全部 published」として扱うこと。
 */
async function kv(): Promise<KV | null> {
  try {
    const { env } = await getCloudflareContext();
    return ((env as Record<string, unknown>).WORKS_KV as KV | undefined) ?? null;
  } catch {
    return null;
  }
}

function normalize(value: unknown): WorksMeta {
  if (!value || typeof value !== "object") return DEFAULT_META;
  const v = value as Record<string, unknown>;
  const status = WORKS_STATUSES.includes(v.status as WorksStatus)
    ? (v.status as WorksStatus)
    : "published";
  const shareToken = typeof v.shareToken === "string" ? v.shareToken : null;
  return { status, shareToken };
}

export async function getWorksMeta(slug: string): Promise<WorksMeta> {
  const ns = await kv();
  if (!ns) return DEFAULT_META;
  try {
    return normalize(await ns.get(KEY(slug), "json"));
  } catch {
    // KV が落ちているときに記事を巻き添えで404にしない（公開が既定）。
    return DEFAULT_META;
  }
}

/** 管理画面用。KV に無い slug は呼び出し側が既定値で埋める。 */
export async function listWorksMeta(): Promise<Record<string, WorksMeta>> {
  const ns = await kv();
  if (!ns) return {};
  const out: Record<string, WorksMeta> = {};
  try {
    const { keys } = await ns.list({ prefix: "works:" });
    for (const k of keys) {
      out[k.name.slice("works:".length)] = normalize(await ns.get(k.name, "json"));
    }
  } catch {
    return out;
  }
  return out;
}

export async function setWorksMeta(slug: string, meta: WorksMeta): Promise<boolean> {
  const ns = await kv();
  if (!ns) return false;
  await ns.put(KEY(slug), JSON.stringify(meta));
  return true;
}

export function newShareToken(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

/**
 * 表示してよいか。旧 worker.js の handleWorksArticle と同じ判定。
 *   published            → 誰でも
 *   private + token 一致 → 誰でも
 *   draft / private      → 管理者のみ
 */
export function canViewWorks(
  meta: WorksMeta,
  opts: { token?: string | null; isAdmin: boolean },
): boolean {
  if (meta.status === "published") return true;
  if (meta.status === "private" && meta.shareToken && opts.token === meta.shareToken) {
    return true;
  }
  return opts.isAdmin;
}
