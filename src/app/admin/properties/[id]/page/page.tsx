import { notFound } from "next/navigation";
import Link from "next/link";
import { repo } from "@/lib/store";
import { assertPropertyAccess } from "@/lib/dal";
import StudioPageBuilder from "@/components/admin/studio-page-builder";

export const metadata = { title: "スタジオページ編集" };

export default async function StudioPageEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  try {
    await assertPropertyAccess(id);
  } catch {
    notFound();
  }
  const property = await repo.get(id);
  if (!property) notFound();

  return (
    <div className="p-8">
      <nav className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-4 flex items-center gap-2 flex-wrap">
        <Link href="/admin/properties" className="hover:text-accent">
          ← Properties
        </Link>
        <span>/</span>
        <Link href={`/admin/properties/${id}/edit`} className="hover:text-accent">
          {property.id}
        </Link>
        <span>/</span>
        <span className="opacity-50">ページ構成</span>
      </nav>

      <div className="mb-6">
        <div className="mono text-[10px] tracking-[0.32em] uppercase opacity-50 mb-1">
          Studio Page Builder
        </div>
        <h1 className="serif text-3xl">{property.title || "（無題のスタジオ）"}</h1>
      </div>

      <StudioPageBuilder property={property} />
    </div>
  );
}
