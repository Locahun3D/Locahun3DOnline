import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/dal";
import { getPublishedProperties } from "@/lib/properties";
import BookmarksManager from "@/components/dashboard/bookmarks-manager";
import { getLocale } from "@/lib/i18n/server";
import { localizedHref } from "@/lib/i18n/dictionaries";

export const metadata = { title: "保存した物件" };

export default async function BookmarksPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirect_url=/dashboard/bookmarks");

  const locale = await getLocale();
  const en = locale === "en";
  const lh = (href: string) => localizedHref(href, locale);

  const ids = new Set(user.bookmarks ?? []);
  const all = await getPublishedProperties();
  // ブックマーク順（登録順）を保つ。
  const order = new Map((user.bookmarks ?? []).map((id, i) => [id, i]));
  const saved = all
    .filter((p) => ids.has(p.id))
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  return (
    <div className="theme-online frame pt-12 pb-32">
      <div className="chapter-rule">
        <span className="opacity-60">ACCOUNT</span>
        <span>Saved Properties</span>
        <span className="flex-1 h-px bg-current opacity-25" />
      </div>

      <header className="mb-10">
        <h1 className="serif text-[clamp(1.8rem,3.4vw,2.8rem)] font-bold">
          {en ? "Saved locations" : "保存した物件"}
        </h1>
        <p className="text-[14px] text-muted mt-2">
          {en
            ? `Locations you saved with ★. ${saved.length} item(s).`
            : `★ で保存した物件の一覧です。${saved.length} 件。`}
        </p>
      </header>

      {saved.length === 0 ? (
        <div className="border border-line p-10 text-center">
          <p className="text-sm opacity-50 mb-4">
            {en
              ? "You haven't saved any locations yet. Save them from the ☆ on a card or detail page."
              : "まだ保存した物件はありません。物件カードや詳細ページの ☆ から保存できます。"}
          </p>
          <Link
            href={lh("/properties")}
            className="mono text-[11px] tracking-[0.22em] uppercase border border-accent text-accent px-4 py-2 hover:bg-accent hover:text-bg transition"
          >
            {en ? "Browse locations →" : "物件を探す →"}
          </Link>
        </div>
      ) : (
        <BookmarksManager
          properties={saved}
          initialFolders={user.bookmarkFolders ?? []}
          initialAssignments={user.bookmarkFolderAssignments ?? {}}
          locale={locale}
        />
      )}

      <div className="mt-10 text-center">
        <Link
          href={lh("/account")}
          className="mono text-[10px] tracking-[0.22em] uppercase opacity-50 hover:opacity-100 transition"
        >
          {en ? "← Back to account" : "← アカウントに戻る"}
        </Link>
      </div>
    </div>
  );
}
