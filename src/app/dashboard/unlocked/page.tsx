import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/dal";
import { repo as propertyRepo } from "@/lib/store";
import { viewUnlockRepo } from "@/lib/view-unlocks";
import { getLocale } from "@/lib/i18n/server";
import { localizedHref } from "@/lib/i18n/dictionaries";
import { fmtDateOnlyJST } from "@/lib/date-format";

export const metadata = { title: "閲覧履歴・解除済みシーン" };

export default async function UnlockedScenesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirect_url=/dashboard/unlocked");

  const locale = await getLocale();
  const en = locale === "en";
  const lh = (href: string) => localizedHref(href, locale);

  const unlocks = await viewUnlockRepo.list({ userId: user.id });
  const now = new Date().toISOString();

  // 物件タイトル・シーン名を解決（物件が削除/非公開化されていても履歴自体は残す）。
  const propertyIds = [...new Set(unlocks.map((u) => u.propertyId))];
  const properties = await Promise.all(propertyIds.map((id) => propertyRepo.get(id)));
  const propertyMap = new Map(properties.filter(Boolean).map((p) => [p!.id, p!]));

  const rows = unlocks.map((u) => {
    const property = propertyMap.get(u.propertyId) ?? null;
    // 新レコードは splatItemId（永続識別子）で解決。旧レコードは記録当時の
    // index にフォールバック（並び替え後はズレ得るが表示上の劣化に留まる）。
    const item = u.splatItemId
      ? property?.splatItems.find((it) => it.id === u.splatItemId)
      : property?.splatItems[u.splatItemIndex];
    const valid = u.expiresAt > now;
    return {
      unlock: u,
      propertyTitle: property?.title || u.propertyId,
      propertyExists: !!property,
      cover: property?.cover?.src || "",
      sceneLabel: item?.label || `#${u.splatItemIndex + 1}`,
      valid,
    };
  });

  return (
    <div className="theme-online frame pt-6 sm:pt-12 pb-12 sm:pb-32">
      <div className="chapter-rule">
        <span className="opacity-60">ACCOUNT</span>
        <span>Unlocked Scenes</span>
        <span className="flex-1 h-px bg-current opacity-25" />
      </div>

      <header className="mb-10">
        <h1 className="serif text-[clamp(1.8rem,3.4vw,2.8rem)] font-bold">
          {en ? "Viewing history" : "閲覧履歴・解除済みシーン"}
        </h1>
        <p className="text-[14px] text-muted mt-2 max-w-[60ch] leading-[1.85]">
          {en
            ? `Scenes you've unlocked with tokens. Each stays free to re-view for 1 year from the unlock date. ${rows.length} item(s).`
            : `トークンで解除した3DGSシーンの一覧です。解除日から1年間は無償で再視聴できます。${rows.length} 件。`}
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="border border-line p-10 text-center">
          <p className="text-sm opacity-50 mb-4">
            {en
              ? "You haven't unlocked any 3DGS scenes yet."
              : "まだ解除した3DGSシーンはありません。"}
          </p>
          <Link
            href={lh("/properties")}
            className="mono text-[11px] tracking-[0.22em] uppercase border border-accent text-accent px-4 py-2 hover:bg-accent hover:text-bg transition"
          >
            {en ? "Browse locations →" : "物件を探す →"}
          </Link>
        </div>
      ) : (
        <div className="border border-line overflow-x-auto">
          <table className="w-full min-w-[620px] text-[13px]">
            <thead>
              <tr className="bg-[#222] border-b border-line">
                <th className="px-4 py-3 w-[76px]" />
                <th className="text-left px-4 py-3 mono text-[10px] tracking-[0.2em] uppercase opacity-60 font-normal">
                  {en ? "Location / scene" : "物件 / シーン"}
                </th>
                <th className="text-left px-4 py-3 mono text-[10px] tracking-[0.2em] uppercase opacity-60 font-normal">
                  {en ? "Unlocked" : "解除日"}
                </th>
                <th className="text-left px-4 py-3 mono text-[10px] tracking-[0.2em] uppercase opacity-60 font-normal">
                  {en ? "Status" : "状態"}
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ unlock, propertyTitle, propertyExists, cover, sceneLabel, valid }, i) => (
                <tr
                  key={unlock.id}
                  className={`border-b border-line ${i % 2 === 1 ? "bg-[#1c1c1c]" : ""}`}
                >
                  <td className="px-4 py-3">
                    <div className="w-14 h-10 shrink-0 bg-[#222] overflow-hidden">
                      {cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={cover} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full grid place-items-center mono text-[8px] opacity-30">
                          {en ? "N/A" : "画像なし"}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-ink/90">{propertyTitle}</div>
                    <div className="mono text-[10px] tracking-[0.14em] uppercase opacity-50 mt-0.5">
                      {sceneLabel}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {fmtDateOnlyJST(unlock.unlockedAt)}
                  </td>
                  <td className="px-4 py-3">
                    {valid ? (
                      <span className="mono text-[10px] tracking-[0.14em] uppercase text-green-500">
                        {en ? `Free until ${fmtDateOnlyJST(unlock.expiresAt)}` : `${fmtDateOnlyJST(unlock.expiresAt)} まで無償`}
                      </span>
                    ) : (
                      <span className="mono text-[10px] tracking-[0.14em] uppercase text-muted">
                        {en ? "Expired — re-view costs tokens" : "期限切れ（再視聴はトークン消費）"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {propertyExists ? (
                      <Link
                        href={lh(`/properties/${unlock.propertyId}`)}
                        className="mono text-[11px] tracking-[0.18em] uppercase border border-line px-3 py-1.5 hover:border-accent hover:text-accent transition"
                      >
                        {en ? "Open →" : "開く →"}
                      </Link>
                    ) : (
                      <span className="mono text-[10px] opacity-40">
                        {en ? "Listing removed" : "掲載終了"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
