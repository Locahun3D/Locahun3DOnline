import { notFound } from "next/navigation";
import Link from "next/link";
import { repo } from "@/lib/store";
import PropertyEditor from "@/components/admin/property-editor";

export default async function EditPropertyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const property = await repo.get(id);
  if (!property) notFound();

  return (
    <div className="p-8">
      <nav className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-4 flex items-center gap-2">
        <Link href="/admin/properties" className="hover:text-accent">
          ← Properties
        </Link>
        <span>/</span>
        <span className="opacity-50">{property.id}</span>
      </nav>

      <PropertyEditor initial={property} />
    </div>
  );
}
