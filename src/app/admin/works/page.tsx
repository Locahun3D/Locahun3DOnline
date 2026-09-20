import { requireAdmin } from "@/lib/dal";
import { listWorksSlugs, UNGATED_SLUGS } from "@/lib/works-content";
import { listWorksMeta, type WorksMeta, type WorksStatus } from "@/lib/works-gating";
import {
  regenerateWorksTokenAction,
  setWorksStatusAction,
} from "@/lib/works-admin-actions";
import AdminPageHeader, { AdminPageShell } from "@/components/admin/admin-page-header";

export const metadata = { title: "実績＆技術ブログ" };
export const dynamic = "force-dynamic";

const LABEL: Record<WorksStatus, string> = {
  published: "公開",
  draft: "下書き",
  private: "限定公開",
};

const WORKS_ORIGIN = "https://web.locahun3d.com";

/** 2026-09-20: 一覧では全記事に付く「｜ロケハン3D 技術ブログ」等のサイト名の尾を省く（見分けに不要）。 */
function shortTitle(title: string) {
  const t = title.replace(/\s*[｜|]\s*(ロケハン3D|LOCAHUN\s?3D)[^｜|]*$/i, "").trim();
  return t || title;
}

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
    <AdminPageShell>
      {/* 2026-09-20: 小型ヘッダーへ。記事の取り込み手順は「使い方」に畳んだ。表は横スクロール容器に入れ、
          状態ボタンは iPad 用に高さ 40px。 */}
      <AdminPageHeader
        title="実績＆技術ブログ"
        count={`${pages.length} 件`}
        description="記事の公開状態を切り替えます。"
        help={
          <>
            記事の追加・修正は <code className="mono">digiroke3d_Web/works</code> で行い、
            <code className="mono">node scripts/import-works.mjs</code> で取り込みます。
          </>
        }
      />

      {!kvAvailable && (
        <p className="mb-4 border border-line bg-[#1c1c1c] px-4 py-2 text-[13px] text-muted">
          この環境では公開状態を保存できません（全記事が「公開」として表示されます）。
        </p>
      )}

      <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm border-collapse">
        <thead>
          <tr className="text-left text-muted text-[12px] border-b border-line">
            <th className="py-2 pr-3 font-normal">記事</th>
            <th className="py-2 pr-3 font-normal whitespace-nowrap">状態</th>
            <th className="py-2 font-normal">共有リンク</th>
          </tr>
        </thead>
        <tbody>
          {pages.map(({ slug, title, hasEn }) => {
            const meta: WorksMeta = stored[slug] ?? { status: "published", shareToken: null };
            const ungated = UNGATED_SLUGS.has(slug);
            return (
              <tr key={slug} className="border-b border-line align-middle">
                <td className="py-2 pr-3">
                  <a
                    href={`${WORKS_ORIGIN}/works/${slug}.html`}
                    className="hover:text-accent transition"
                    target="_blank"
                    rel="noopener"
                  >
                    {shortTitle(title) || slug}
                  </a>
                  <div className="mono text-[11px] text-muted">
                    /works/{slug}.html{hasEn ? " ・ /en/works/" + slug + ".html" : "（EN なし）"}
                  </div>
                </td>
                <td className="py-2 pr-3 whitespace-nowrap">
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
                            className={`min-h-[40px] px-3 text-[12px] border transition disabled:opacity-40 ${
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
                <td className="py-2">
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
                          className="min-h-[40px] px-3 text-[12px] border border-line text-muted hover:text-accent hover:border-accent transition disabled:opacity-40"
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
    </AdminPageShell>
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
