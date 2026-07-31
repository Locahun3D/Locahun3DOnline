import Link from "next/link";
import { getCurrentUser } from "@/lib/dal";
import { purchaseRepo, resolvePurchasedItem } from "@/lib/purchases";
import { repo as propertyRepo } from "@/lib/store";
import { resolveDownloadFiles } from "@/lib/downloads";
import { resolveDownloadVersions } from "@/lib/download-versions";
import { redirect } from "next/navigation";
import { getLocale } from "@/lib/i18n/server";
import { localizedHref } from "@/lib/i18n/dictionaries";
import { fmtDateTimeJST } from "@/lib/date-format";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: locale === "en" ? "Purchase History" : "購入履歴" };
}

function fmtPrice(n: number) {
  return `¥${n.toLocaleString()}`;
}

function fmtDate(iso: string) {
  return fmtDateTimeJST(iso);
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
    <div className="theme-online frame pt-6 sm:pt-12 pb-12 sm:pb-32">
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

      {/* ライセンス範囲外利用（特に機械学習・生成AIの学習データ利用）についての案内。
          「禁止」ではなく「要相談」であることを購入者にも伝える（2026-07-23改定）。 */}
      <p className="text-[11px] text-muted mb-4">
        {en ? (
          <>
            Please use purchased data within the scope of its license. Using it as
            training data for machine learning or generative AI needs prior
            consultation and a separate agreement, regardless of license tier —
            we&rsquo;re happy to talk, terms just vary by case. See the{" "}
            <Link href={lh("/terms/data-download")} target="_blank" className="underline hover:text-accent transition">
              data purchase terms
            </Link>{" "}
            or{" "}
            <Link href={lh("/contact/license")} target="_blank" className="underline hover:text-accent transition">
              contact us
            </Link>
            .
          </>
        ) : (
          <>
            購入データはライセンスの範囲内でご利用ください。機械学習・生成AIの学習データとしての利用は、ライセンスを問わず事前のご相談・個別合意が必要です（案件により条件が変わるだけで、前向きにご相談に応じます）。詳細は{" "}
            <Link href={lh("/terms/data-download")} target="_blank" className="underline hover:text-accent transition">
              データ購入規約
            </Link>
            、またはお気軽に{" "}
            <Link href={lh("/contact/license")} target="_blank" className="underline hover:text-accent transition">
              お問い合わせ
            </Link>
            ください。
          </>
        )}
      </p>

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
            const versions = item ? resolveDownloadVersions(item, prop?.scannedAt) : [];
            // 一括DL（全形式まとめZip）= 日付別バージョンの最新、無ければバンドル downloadFileUrl、無ければ先頭形式。
            const bundled = versions[0]?.url || item?.downloadFileUrl || files[0]?.url || "";

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
                        {versions.length > 1 && (
                          <>
                            <span className="mono text-[9px] tracking-[0.18em] uppercase opacity-30 mx-1">
                              {en ? "version" : "日付"}
                            </span>
                            {versions.map((v, vi) => (
                              <a
                                key={vi}
                                href={`/api/purchase/${p.id}/download?date=${encodeURIComponent(v.date)}`}
                                className="mono text-[10px] tracking-[0.18em] uppercase border border-green-400/30 text-green-400/80 px-2.5 py-1.5 hover:bg-green-400 hover:text-bg transition whitespace-nowrap"
                                title={en ? `Download the ${v.date || "undated"} version${v.sizeMb ? ` (${v.sizeMb} MB)` : ""}` : `${v.date || "日付未設定"}時点のバージョンをダウンロード${v.sizeMb ? `（${v.sizeMb} MB）` : ""}`}
                              >
                                ↓ {v.date || (en ? "undated" : "日付未設定")}
                              </a>
                            ))}
                          </>
                        )}
                        <a
                          href={lh(`/api/purchase/${p.id}/license`)}
                          className="mono text-[10px] tracking-[0.18em] uppercase border border-line px-3 py-1.5 hover:border-accent hover:text-accent transition whitespace-nowrap"
                          title={en ? "Terms of use for this license tier (.txt)" : "このライセンス区分の利用規約（.txt）"}
                        >
                          {en ? "↓ Terms (.txt)" : "↓ 利用規約 (.txt)"}
                        </a>
                        <a
                          href={lh(`/api/purchase/${p.id}/license?view=1`)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mono text-[10px] tracking-[0.18em] uppercase opacity-50 hover:opacity-100 hover:text-accent transition whitespace-nowrap underline underline-offset-2"
                          title={en ? "View full terms in browser" : "全文をブラウザで見る"}
                        >
                          {en ? "View full text" : "全文を見る"}
                        </a>
                        <a
                          href={lh(`/api/purchase/${p.id}/receipt`)}
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
