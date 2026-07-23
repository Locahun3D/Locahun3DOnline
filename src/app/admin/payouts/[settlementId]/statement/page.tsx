import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/dal";
import { repo as propertyRepo } from "@/lib/store";
import {
  payeeRepo,
  payoutSettlementRepo,
  payoutLedgerRepo,
  ENTITY_TYPE_LABEL,
} from "@/lib/payouts";
import { fmtDateOnlyJST, fmtDateLongJST } from "@/lib/date-format";
import StatementPrintButton from "@/components/admin/statement-print-button";

export const metadata = { title: "支払明細書" };

function fmtYen(n: number): string {
  return `¥${n.toLocaleString()}`;
}

export default async function PayoutStatementPage({
  params,
}: {
  params: Promise<{ settlementId: string }>;
}) {
  await requireAdmin();
  const { settlementId } = await params;

  const settlement = await payoutSettlementRepo.get(settlementId);
  if (!settlement) notFound();

  const payee = await payeeRepo.get(settlement.payeeId);
  if (!payee) notFound();

  const [settledRows, properties] = await Promise.all([
    payoutLedgerRepo.list({ payeeId: settlement.payeeId, status: "settled" }),
    propertyRepo.list(),
  ]);
  // settlement.ledgerIds が正、settledRows はそこから絞り込む（他の精算の行と
  // 混ざらないように）。
  const idSet = new Set(settlement.ledgerIds);
  const lines = settledRows
    .filter((r) => idSet.has(r.id))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const propertyTitle = new Map(properties.map((p) => [p.id, p.title || p.id]));
  const shortId = settlement.id.slice(-8).toUpperCase();

  return (
    <div className="theme-online min-h-screen bg-white text-[#111]">
      <div className="max-w-[800px] mx-auto px-10 py-12">
        <header className="flex justify-between items-start border-b-2 border-[#111] pb-6 mb-8">
          <div>
            <div className="text-xl font-bold tracking-wider">ロケハン3D</div>
            <div className="text-[11px] opacity-50 tracking-[0.16em] uppercase mt-1">
              運営: KWI株式会社
            </div>
          </div>
          <div className="text-right text-[12px] leading-[1.8] mono">
            <div className="text-[10px] uppercase tracking-[0.2em] opacity-40">Statement No.</div>
            <div>{shortId}</div>
            <div className="text-[10px] uppercase tracking-[0.2em] opacity-40 mt-2">Period</div>
            <div>{settlement.periodLabel}</div>
            <div className="text-[10px] uppercase tracking-[0.2em] opacity-40 mt-2">Issued</div>
            <div>{fmtDateOnlyJST(settlement.createdAt)}</div>
          </div>
        </header>

        <h1 className="text-2xl font-bold tracking-wide mb-8">支払明細書</h1>

        <div className="mb-8">
          <div className="text-[10px] uppercase tracking-[0.2em] opacity-40 mb-1">宛先</div>
          <div className="text-[15px] font-bold">{payee.name} 様</div>
          <div className="text-[12px] opacity-60 mt-1">
            {ENTITY_TYPE_LABEL[payee.entityType]}
            {payee.invoiceRegNumber && ` ／ 適格請求書発行事業者番号: ${payee.invoiceRegNumber}`}
          </div>
        </div>

        <table className="w-full text-sm mb-8 border-collapse">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[0.16em] opacity-40 border-b border-[#ddd]">
              <th className="py-2 font-normal">物件</th>
              <th className="py-2 font-normal">計上日</th>
              <th className="py-2 font-normal text-right">率</th>
              <th className="py-2 font-normal text-right">販売額</th>
              <th className="py-2 font-normal text-right">金額</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-[12px] opacity-50">
                  対象明細がありません。
                </td>
              </tr>
            ) : (
              lines.map((line) => (
                <tr key={line.id} className="border-b border-[#eee]">
                  <td className="py-3">{propertyTitle.get(line.propertyId) ?? line.propertyId}</td>
                  <td className="py-3 mono text-[11px] opacity-60">{fmtDateOnlyJST(line.createdAt)}</td>
                  <td className="py-3 text-right mono text-[11px]">{line.ratePercent}%</td>
                  <td className="py-3 text-right mono text-[11px] opacity-60">{fmtYen(line.baseAmountYen)}</td>
                  <td className="py-3 text-right mono text-[11px]">{fmtYen(line.amountYen)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="ml-auto max-w-[280px] text-[13px] space-y-1.5 mb-2">
          <div className="flex justify-between">
            <span className="opacity-60">小計</span>
            <span className="mono">{fmtYen(settlement.grossYen)}</span>
          </div>
          <div className="flex justify-between">
            <span className="opacity-60">源泉徴収額</span>
            <span className="mono">−{fmtYen(settlement.withholdingYen)}</span>
          </div>
          <div className="flex justify-between border-t-2 border-[#111] pt-2 mt-2 font-bold text-[16px]">
            <span>差引支払額</span>
            <span className="mono">{fmtYen(settlement.netYen)}</span>
          </div>
        </div>

        <p className="text-[11px] opacity-50 mt-6 mb-10">
          ※ 本明細は消費税等込みの支払額を示します。
          {payee.entityType === "individual" &&
            "源泉徴収は著作権使用料としての支払いを想定して計算しています（税務上の最終確認は税理士にご相談ください）。"}
        </p>

        <footer className="border-t border-[#ddd] pt-6 text-[11px] opacity-50 leading-[1.8]">
          <div>発行者: ロケハン3D（運営: KWI株式会社）</div>
          <div>URL: https://locahun3d.com</div>
          <div>お問い合わせ: contact@locahun3d.com</div>
          <div className="mt-2">発行日時: {fmtDateLongJST(settlement.createdAt)}</div>
        </footer>
      </div>

      <StatementPrintButton />
    </div>
  );
}
