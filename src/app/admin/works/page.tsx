import { requireAdmin } from "@/lib/dal";
import { listWorksSlugs, UNGATED_SLUGS } from "@/lib/works-content";
import { listWorksMeta, type WorksMeta, type WorksStatus } from "@/lib/works-gating";
import {
  regenerateWorksTokenAction,
  setWorksStatusAction,
} from "@/lib/works-admin-actions";

export const metadata = { title: "実績＆技術ブログ" };
export const dynamic = "force-dynamic";

const LABEL: Record<WorksStatus, string> = {
  published: "公開",
  draft: "下書き",
  private: "限定公開",
};

const WORKS_ORIGIN = "https://web.locahun3d.com";

/**
 * /admin/works — works 記事の公開状態。
 *
 * 記事そのものの生成は今までどおりマーケサイト側（digiroke3d_Web/works）で行い、
 * `node scripts/import-works.mjs` で取り込んで commit する。ここで扱うのは
 * 「その記事を今出すかどうか」だけ（保存先は Cloudflare KV `WORKS_KV`）。
 *
 * ⚠ dev には KV バインディングが無い。その場合は全部 published 表示になり、
 *   切替も効かない（保存できないことを画面に出す）。
 */
export default async function AdminWorksPage() {
  await requireAdmin();

  const pages = listWorksSlugs();
  const stored = await listWorksMeta();
  const kvAvailable = Object.keys(stored).length > 0 || (await hasKv());

  return (
    <div className="p-6 md:p-10 max-w-[1000px]">
      <h1 className="serif text-2xl mb-2">実績＆技術ブログ</h1>
      <p className="text-sm text-muted mb-6 leading-[1.9]">
        記事の公開状態を切り替えます。
        <br />
        記事の追加・修正は <code className="mono">digiroke3d_Web/works</code> で行い、
        <code className="mono">node scripts/import-works.mjs</code> で取り込んでください。
      </p>

      {!kvAvailable && (
        <p className="mb-6 border border-line bg-[#1c1c1c] p-4 text-sm text-muted">
          KV バインディング（WORKS_KV）が見つかりません。ローカル開発では全記事が
          「公開」として扱われ、ここでの変更は保存されません。
        </p>
      )}

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-muted mono text-[11px] tracking-[0.14em] uppercase border-b border-line">
            <th className="py-3 pr-3">記事</th>
            <th className="py-3 pr-3 whitespace-nowrap">状態</th>
            <th className="py-3">共有リンク</th>
          </tr>
        </thead>
        <tbody>
          {pages.map(({ slug, title, hasEn }) => {
            const meta: WorksMeta = stored[slug] ?? { status: "published", shareToken: null };
            const ungated = UNGATED_SLUGS.has(slug);
            return (
              <tr key={slug} className="border-b border-line align-top">
                <td className="py-4 pr-3">
                  <a
                    href={`${WORKS_ORIGIN}/works/${slug}.html`}
                    className="hover:text-accent transition"
                    target="_blank"
                    rel="noopener"
                  >
                    {title || slug}
                  </a>
                  <div className="mono text-[11px] text-muted mt-1">
                    /works/{slug}.html{hasEn ? " ・ /en/works/" + slug + ".html" : "（EN なし）"}
                  </div>
                </td>
                <td className="py-4 pr-3 whitespace-nowrap">
                  {ungated ? (
                    <span className="text-muted text-[12px]">常時公開（一覧・転送）</span>
                  ) : (
                    <div className="flex gap-1">
                      {(Object.keys(LABEL) as WorksStatus[]).map((s) => (
                        <form key={s} action={setWorksStatusAction}>
                          <input type="hidden" name="slug" value={slug} />
                          <input type="hidden" name="status" value={s} />
                          <button
                            type="submit"
                            disabled={!kvAvailable}
                            className={`px-2 py-1 text-[11px] mono border transition disabled:opacity-40 ${
                              meta.status === s
                                ? "border-accent text-accent"
                                : "border-line text-muted hover:text-ink"
                            }`}
                          >
                            {LABEL[s]}
                          </button>
                        </form>
                      ))}
                    </div>
                  )}
                </td>
                <td className="py-4">
                  {!ungated && meta.status === "private" && meta.shareToken ? (
                    <div className="flex flex-col gap-2 min-w-0">
                      <code className="mono text-[11px] text-muted break-all">
                        {`${WORKS_ORIGIN}/works/${slug}.html?token=${meta.shareToken}`}
                      </code>
                      <form action={regenerateWorksTokenAction}>
                        <input type="hidden" name="slug" value={slug} />
                        <button
                          type="submit"
                          disabled={!kvAvailable}
                          className="px-2 py-1 text-[11px] mono border border-line text-muted hover:text-accent hover:border-accent transition disabled:opacity-40"
                        >
                          トークン再生成
                        </button>
                      </form>
                    </div>
                  ) : (
                    <span className="text-muted text-[12px]">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** KV が使えるか（空のネームスペースと未バインドを区別するため別に見る）。 */
async function hasKv(): Promise<boolean> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext();
    return Boolean((env as Record<string, unknown>).WORKS_KV);
  } catch {
    return false;
  }
}
