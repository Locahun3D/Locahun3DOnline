import { repo } from "@/lib/store";
import { getCurrentUser } from "@/lib/dal";
import { createDraftAction } from "../_actions";
import PropertiesAdmin, {
  type PropertyListItem,
} from "@/components/admin/properties-admin";

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
  }));

  const counts = {
    published: all.filter((p) => p.status === "published").length,
    draft: all.filter((p) => p.status === "draft").length,
    archived: all.filter((p) => p.status === "archived").length,
  };

  return (
    <div className="p-8">
      <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
        <div>
          <div className="mono text-[10px] tracking-[0.32em] uppercase opacity-50 mb-1">
            Properties
          </div>
          <h1 className="serif text-3xl font-bold">物件管理</h1>
          <div className="mt-2 mono text-[11px] text-muted">
            合計 {all.length} 件 ／ 公開 {counts.published} ／ 下書き{" "}
            {counts.draft} ／ アーカイブ {counts.archived}
          </div>
        </div>

        <form action={createDraftAction}>
          <button
            type="submit"
            className="px-5 py-3 mono text-[11px] tracking-[0.24em] uppercase border border-accent text-accent hover:bg-accent hover:text-bg transition"
          >
            ＋ 新規物件を作成
          </button>
        </form>
      </div>

      <PropertiesAdmin items={items} />
    </div>
  );
}
