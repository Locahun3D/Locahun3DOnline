import { notFound } from "next/navigation";
import Link from "next/link";
import { repo } from "@/lib/store";
import { assertPropertyAccess } from "@/lib/dal";
import PropertyEditor from "@/components/admin/property-editor";

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
      </nav>
      {/* ページ全体プレビューへの導線はエディタのsticky headerパネル内の
          「プレビュー ↗」に一本化した（スクロールしても押せる）。ここに
          重複して置くと、ここは非stickyでスクロールで消えるうえ2つ並ぶ
          ので紛らわしいだけになる。 */}

      {/* 公開URL（スラッグ）はエディタのヘッダー枠内に統合表示される */}
      <PropertyEditor initial={property} />
    </div>
  );
}
