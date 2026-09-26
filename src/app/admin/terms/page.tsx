import { requireAdmin } from "@/lib/dal";
import AdminPageHeader, { AdminPageShell } from "@/components/admin/admin-page-header";
import { TERMS_DOCS, STUDIO_MAIL_TERMS } from "@/lib/terms-catalog";
import { REVENUE_SHARE_PERCENT } from "@/lib/data-sale-consent";

export const metadata = { title: "規約" };
export const dynamic = "force-dynamic";

/**
 * /admin/terms — サイトにある規約をまとめて確認する（2026-09-26 本人指示
 * 「adminに規約確認ができるページ作って」）。
 *
 * 規約は /terms/* に点在し、フッターからは一部しか辿れない。スタジオに何を渡しているのか、
 * どれが最後にいつ改定されたのかを1枚で見えるようにする。一覧の出どころは
 * lib/terms-catalog.ts で、スタジオへの掲載確認メールに同送するリンクと同じ表。
 * ここでは規約の中身は編集しない（本文は各ページのソース＝git 管理）。
 */
export default async function AdminTermsPage() {
  await requireAdmin();
  const fmt = (d: string) => d.replaceAll("-", "/");

  return (
    <AdminPageShell>
      <AdminPageHeader
        title="規約"
        count={`${TERMS_DOCS.length} 本`}
        description={`スタジオへの掲載確認メールには、このうち ${STUDIO_MAIL_TERMS.length} 本のリンクを毎回同送します。`}
        help={
          <>
            本文の修正はソース（<code className="mono">src/app/terms/&lt;名前&gt;/page.tsx</code>）で行い、
            末尾の改定日と <code className="mono">src/lib/terms-catalog.ts</code> の日付を合わせてください。
            同送する規約を変えるときは、同じファイルの <code className="mono">inStudioMail</code> を切り替えます。
          </>
        }
      />

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[12px] text-muted">
              <th className="py-2 pr-3 font-normal">規約</th>
              <th className="py-2 pr-3 font-normal whitespace-nowrap">対象</th>
              <th className="py-2 pr-3 font-normal whitespace-nowrap">制定 / 改定</th>
              <th className="py-2 pr-3 font-normal whitespace-nowrap">確認メール</th>
              <th className="py-2 font-normal whitespace-nowrap">開く</th>
            </tr>
          </thead>
          <tbody>
            {TERMS_DOCS.map((doc) => (
              <tr key={doc.path} className="border-b border-line align-middle">
                <td className="py-2 pr-3">
                  <a
                    href={doc.path}
                    target="_blank"
                    rel="noopener"
                    className="transition hover:text-accent"
                  >
                    {doc.title}
                  </a>
                  <div className="mono text-[11px] text-muted">{doc.path}</div>
                  <div className="text-[12px] text-muted">{doc.note}</div>
                </td>
                <td className="py-2 pr-3 whitespace-nowrap text-[12px]">{doc.audience}</td>
                <td className="py-2 pr-3 whitespace-nowrap text-[12px] text-muted">
                  {fmt(doc.effective)}
                  {doc.updated && (
                    <>
                      <br />
                      改定 {fmt(doc.updated)}
                    </>
                  )}
                </td>
                <td className="py-2 pr-3 whitespace-nowrap text-[12px]">
                  {doc.inStudioMail ? (
                    <span className="text-accent">同送する</span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="py-2 whitespace-nowrap text-[12px]">
                  <a
                    href={doc.path}
                    target="_blank"
                    rel="noopener"
                    className="border border-line px-3 py-1.5 transition hover:border-accent hover:text-accent"
                  >
                    日本語
                  </a>{" "}
                  <a
                    href={`/en${doc.path}`}
                    target="_blank"
                    rel="noopener"
                    className="border border-line px-3 py-1.5 transition hover:border-accent hover:text-accent"
                  >
                    EN
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* スタジオへ実際に何を伝えているかは、規約本文より先に確認したい（2026-09-26）。 */}
      <section className="mt-8 border border-line p-5">
        <h2 className="mb-2 text-[14px] font-bold">掲載確認メールで伝えていること</h2>
        <ul className="ml-5 list-disc space-y-1.5 text-[13px] leading-[1.8] text-muted">
          <li>掲載ページのプレビュー（ログイン不要・期限付き）と、承認ボタンで公開されること。</li>
          <li>自社サイトへ貼れる3Dツアーの埋め込みコード（無料・期限なし）。</li>
          <li>
            3Dデータ（PLY・OBJ）を販売してよいかの確認。提示価格は物件の販売設定から入り、売上の{" "}
            {REVENUE_SHARE_PERCENT}% をスタジオへ分配すると書いています。回答（販売OK／販売しない）は
            物件ごとに記録され、物件編集の「公開設定」で確認できます。
          </li>
          <li>上の表で「同送する」になっている規約のリンク。</li>
        </ul>
      </section>
    </AdminPageShell>
  );
}
