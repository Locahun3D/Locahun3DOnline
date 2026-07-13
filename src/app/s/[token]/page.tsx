import { notFound } from "next/navigation";
import Link from "next/link";
import { bookmarkShareRepo } from "@/lib/bookmark-shares";
import { userRepo } from "@/lib/users";
import { getPublishedProperties } from "@/lib/properties";
import PropertyCard from "@/components/property-card";
import { getLocale } from "@/lib/i18n/server";
import { localizedHref } from "@/lib/i18n/dictionaries";

export const metadata = { title: "共有フォルダ" };

/**
 * ブックマーク・フォルダの読み取り専用公開ページ（認証不要）。
 * token は bookmark_shares テーブルの逆引きキー。無効/失効していれば404。
 * 下書き・非公開物件は絶対に出さない（getPublishedProperties でフィルタ済み）。
 */
export default async function SharedBookmarkFolderPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const share = await bookmarkShareRepo.get(token);
  if (!share) notFound();

  const owner = await userRepo.get(share.userId);
  const folder = owner?.bookmarkFolders?.find((f) => f.id === share.folderId);
  if (!owner || !folder) notFound();

  const assignments = owner.bookmarkFolderAssignments ?? {};
  const propertyIds = new Set(
    Object.entries(assignments)
      .filter(([, fid]) => fid === share.folderId)
      .map(([pid]) => pid),
  );

  const published = await getPublishedProperties();
  const properties = published.filter((p) => propertyIds.has(p.id));

  const locale = await getLocale();
  const en = locale === "en";
  const lh = (href: string) => localizedHref(href, locale);

  return (
    <div className="theme-online frame pt-6 sm:pt-12 pb-12 sm:pb-32">
      <div className="chapter-rule">
        <span className="opacity-60">SHARED</span>
        <span>{folder.name}</span>
        <span className="flex-1 h-px bg-current opacity-25" />
      </div>

      <header className="mb-10">
        <div className="mono text-[10px] tracking-[0.24em] uppercase text-accent mb-2">
          {en ? "Shared board" : "共有ボード"}
        </div>
        <h1 className="serif text-[clamp(1.8rem,3.4vw,2.8rem)] font-bold">{folder.name}</h1>
        <p className="text-[14px] text-muted mt-2">
          {en
            ? `${properties.length} location(s) shared via a read-only link.`
            : `読み取り専用の共有リンクで公開された ${properties.length} 件の物件です。`}
        </p>
      </header>

      {properties.length === 0 ? (
        <div className="border border-line p-10 text-center">
          <p className="text-sm opacity-50">
            {en
              ? "This board is empty, or its locations are no longer published."
              : "このボードは空か、含まれる物件が非公開になっています。"}
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {properties.map((p) => (
            <PropertyCard key={p.id} property={p} locale={locale} />
          ))}
        </div>
      )}

      <div className="mt-14 text-center">
        <Link
          href={lh("/properties")}
          className="mono text-[11px] tracking-[0.22em] uppercase border border-accent text-accent px-4 py-2 hover:bg-accent hover:text-bg transition"
        >
          {en ? "Browse all locations →" : "すべての物件を見る →"}
        </Link>
      </div>
    </div>
  );
}
