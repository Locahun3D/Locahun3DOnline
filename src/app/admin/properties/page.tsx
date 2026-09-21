import { repo } from "@/lib/store";
import { getCurrentUser } from "@/lib/dal";
import { createDraftAction } from "../_actions";
import AdminPageHeader from "@/components/admin/admin-page-header";
import PropertiesAdmin, {
  type PropertyListItem,
} from "@/components/admin/properties-admin";
import TranslateMissingButton from "@/components/admin/translate-missing-button";
import { publishStage, reviewSubState } from "@/lib/publish-flow";
import { publishReadiness } from "@/lib/publish-readiness";

export const metadata = { title: "物件管理" };

export default async function AdminPropertiesList() {
  const user = await getCurrentUser();
  const isAdmin = user?.role === "admin";
  let all = await repo.list();

  if (!isAdmin && user) {
    const linked = user.linkedPropertyIds ?? [];
    all = all.filter(
      (p) => p.ownerId === user.id || linked.includes(p.id),
    );
  }

  const items: PropertyListItem[] = all.map((p) => ({
    id: p.id,
    title: p.title,
    city: p.city,
    category: p.category,
    status: p.status,
    updatedAt: p.updatedAt,
    publishRequestedAt: p.publishRequestedAt ?? null,
    reviewState: reviewSubState(p.publishFlow),
    coverSrc: p.cover?.src || undefined,
    // 「申請メールを送る」の確認ダイアログで宛先を見せるために渡す（2026-09-21）。
    contactEmail: p.contactEmail || undefined,
    // 公開に必要な項目が埋まった下書きは「公開申請待ち」と出す（2026-09-21 本人指示）。
    ready: publishReadiness(p).ready,
  }));

  const counts = {
    published: all.filter((p) => p.status === "published").length,
    // 下書きと公開申請中は分けて数える（一覧のタブと同じ区切り。2026-09-20）。
    draft: all.filter((p) => publishStage(p) === "draft" && !publishReadiness(p).ready).length,
    ready: all.filter((p) => publishStage(p) === "draft" && publishReadiness(p).ready).length,
    review: all.filter((p) => publishStage(p) === "review").length,
    archived: all.filter((p) => p.status === "archived").length,
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 pt-5 pb-8">
      {/* 2026-09-20: 管理画面共通の小さい見出しに統一（公開側の 42〜60px 見出しは一覧の1画面目を食うだけ）。 */}
      <AdminPageHeader
        title="物件管理"
        count={`合計 ${all.length} 件（公開 ${counts.published}／公開申請済み ${counts.review}／公開申請待ち ${counts.ready}／下書き ${counts.draft}／アーカイブ ${counts.archived}）`}
        actions={
          <>
            {isAdmin && <TranslateMissingButton />}
            <form action={createDraftAction}>
              <button
                type="submit"
                className="min-h-[40px] px-4 mono text-[11px] tracking-[0.2em] uppercase border border-accent text-accent hover:bg-accent hover:text-bg transition"
              >
                ＋ 新規物件を作成
              </button>
            </form>
          </>
        }
      />


      <PropertiesAdmin items={items} isAdmin={isAdmin} />
    </div>
  );
}
