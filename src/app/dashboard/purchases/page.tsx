import Link from "next/link";
import { getCurrentUser } from "@/lib/dal";
import { purchaseRepo, resolvePurchasedItem } from "@/lib/purchases";
import { repo as propertyRepo } from "@/lib/store";
import { resolveDownloadFiles } from "@/lib/downloads";
import { redirect } from "next/navigation";
import { getLocale } from "@/lib/i18n/server";
import { localizedHref } from "@/lib/i18n/dictionaries";

export const metadata = { title: "購入履歴" };

function fmtPrice(n: number) {
  return `¥${n.toLocaleString()}`;
}

function fmtDate(iso: string) {
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return iso;
  }
}

function statusBadge(status: string, en: boolean) {
  const map: Record<string, { cls: string; label: string; labelEn: string }> = {
    completed: { cls: "border-green-400/40 text-green-400", label: "完了", labelEn: "Completed" },
    pending: { cls: "border-yellow-400/40 text-yellow-400", label: "処理中", labelEn: "Pending" },
    cancelled: { cls: "border-red-400/40 text-red-400", label: "キャンセル", labelEn: "Cancelled" },
    refunded: { cls: "border-purple-400/40 text-purple-400", label: "返金済", labelEn: "Refunded" },
  };
  const s = map[status] ?? map.pending;
  return (
    <span className={`inline-block px-2 py-0.5 mono text-[10px] tracking-[0.16em] uppercase border ${s.cls}`}>
      {en ? s.labelEn : s.label}
    </span>
  );
}

export default async function UserPurchasesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const locale = await getLocale();
  const en = locale === "en";
  const lh = (href: string) => localizedHref(href, locale);

  const purchases = await purchaseRepo.list({ userId: user.id });

  // Look up download URLs for completed purchases
  const allProps = await propertyRepo.list();
  const propMap = new Map(allProps.map((p) => [p.id, p]));

  return (
    <div className="theme-online frame pt-12 pb-32">
      <div className="chapter-rule">
        <span className="opacity-60">ACCOUNT</span>
        <span>Purchase History</span>
        <span className="flex-1 h-px bg-current opacity-25" />
      </div>

      <header className="mb-10">
        <h1 className="serif text-[clamp(1.8rem,3.4vw,2.8rem)] font-bold">
          {en ? "Purchase history" : "購入履歴"}
        </h1>
        <p className="text-[14px] text-muted mt-2">
          {en
            ? "Manage your 3DGS data purchases, downloads and receipts."
            : "3DGSデータの購入履歴・ダウンロード・領収書の管理ができます。"}
        </p>
      </header>

      {/* Purchase list */}
      {purchases.length === 0 ? (
        <div className="border border-line p-10 text-center">
          <p className="text-sm opacity-50 mb-4">{en ? "No purchases yet." : "まだ購入はありません。"}</p>
          <Link
            href={lh("/properties")}
            className="mono text-[11px] tracking-[0.22em] uppercase border border-accent text-accent px-4 py-2 hover:bg-accent hover:text-bg transition"
          >
            {en ? "Browse locations →" : "物件を探す →"}
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {purchases.map((p) => {
            const prop = propMap.get(p.propertyId);
            const item = prop ? resolvePurchasedItem(prop.splatItems, p) : null;
            const files = item ? resolveDownloadFiles(item) : [];
            // 一括DL（全形式まとめZip）= バンドル downloadFileUrl、無ければ先頭形式。
            const bundled = item?.downloadFileUrl || files[0]?.url || "";

            return (
              <div key={p.id} className="border border-line hover:border-line/80 transition">
                <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4 p-4 sm:p-5">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                      <Link
                        href={lh(`/properties/${p.propertyId}`)}
                        className="text-sm font-medium hover:text-accent transition truncate"
                      >
                        {p.propertyTitle || p.propertyId}
                      </Link>
                      {p.itemLabel && (
                        <span className="mono text-[10px] tracking-[0.14em] uppercase border border-line px-1.5 py-0.5 opacity-60 shrink-0">
                          {p.itemLabel}
                        </span>
                      )}
                      {statusBadge(p.status, en)}
                    </div>
                    <div className="mono text-[11px] opacity-40">
                      {fmtDate(p.createdAt)}
                    </div>
                    {p.status === "refunded" && (
                      <div className="mono text-[10px] text-purple-400/60">
                        {en ? "Refunded" : "返金済"}{p.refundedAt ? ` (${fmtDate(p.refundedAt)})` : ""}
                        {p.refundReason ? ` — ${p.refundReason}` : ""}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <div className={`mono text-[11px] tracking-[0.14em] ${p.status === "refunded" ? "line-through opacity-50" : ""}`}>
                        {fmtPrice(p.priceYen)}
                      </div>
                      <div className="mono text-[9px] opacity-30 mt-0.5">{en ? "tax incl." : "税込"}</div>
                    </div>

                    {p.status === "completed" && (
                      <div className="flex flex-wrap gap-2 items-center justify-end">
                        {bundled && (
                          <a
                            href={`/api/purchase/${p.id}/download`}
                            className="mono text-[10px] tracking-[0.18em] uppercase border border-green-400/50 bg-green-400/10 text-green-400 px-3 py-1.5 hover:bg-green-400 hover:text-bg transition whitespace-nowrap"
                            title={en ? "Download all formats together (ZIP)" : "全形式まとめてダウンロード（ZIP）"}
                          >
                            {en ? "↓ Download all (ZIP)" : "↓ 一括ダウンロード (ZIP)"}
                          </a>
                        )}
                        {files.length > 1 && (
                          <>
                            <span className="mono text-[9px] tracking-[0.18em] uppercase opacity-30 mx-1">
                              {en ? "each" : "個別"}
                            </span>
                            {files.map((f, fi) => (
                              <a
                                key={fi}
                                href={`/api/purchase/${p.id}/download?format=${encodeURIComponent(f.format)}`}
                                className="mono text-[10px] tracking-[0.18em] uppercase border border-green-400/30 text-green-400/80 px-2.5 py-1.5 hover:bg-green-400 hover:text-bg transition whitespace-nowrap"
                                title={en ? `Download ${f.format}${f.sizeMb ? ` (${f.sizeMb} MB)` : ""} separately` : `${f.format}${f.sizeMb ? ` (${f.sizeMb} MB)` : ""} を個別ダウンロード`}
                              >
                                ↓ {f.format}
                              </a>
                            ))}
                          </>
                        )}
                        <a
                          href={`/api/purchase/${p.id}/receipt`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mono text-[10px] tracking-[0.18em] uppercase border border-line px-3 py-1.5 hover:border-accent hover:text-accent transition whitespace-nowrap"
                        >
                          {en ? "Receipt" : "領収書"}
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
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
