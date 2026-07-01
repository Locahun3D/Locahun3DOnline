import { notFound } from "next/navigation";
import Link from "next/link";
import { repo } from "@/lib/store";
import { assertPropertyAccess } from "@/lib/dal";
import PropertyEditor from "@/components/admin/property-editor";
import SlugEditor from "@/components/admin/slug-editor";

export default async function EditPropertyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // 権限チェック: studio オーナーが他社物件を URL 直打ちで開けないように。
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
        <span className="opacity-50">{property.id}</span>
        <Link
          href={`/admin/properties/${property.id}/preview`}
          target="_blank"
          className="ml-auto border border-line text-ink px-3 py-1.5 hover:border-accent hover:text-accent transition"
        >
          プレビュー ↗
        </Link>
      </nav>

      <div className="mb-5">
        <SlugEditor id={property.id} status={property.status} />
      </div>

      <PropertyEditor initial={property} />
    </div>
  );
}
