import { requireAdmin } from "@/lib/dal";
import { repo as propertyRepo } from "@/lib/store";
import { userRepo } from "@/lib/users";
import {
  payeeRepo,
  payoutSplitRepo,
  payoutLedgerRepo,
  payoutSettlementRepo,
  computeSettlement,
  type PayoutSettlement,
} from "@/lib/payouts";
import PayoutsAdmin from "@/components/admin/payouts-admin";

export const metadata = { title: "精算" };

export default async function AdminPayoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ payeeName?: string; payeeEmail?: string; payeeNote?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  // 持ち込みスキャン詳細の「受取者として登録」からのプリフィル（銀行口座は
  // 必須スキーマのため不完全レコードを作らず、フォーム事前入力で引き継ぐ）
  const prefill =
    sp.payeeName || sp.payeeEmail
      ? {
          name: sp.payeeName ?? "",
          contactEmail: sp.payeeEmail ?? "",
          note: sp.payeeNote ?? "",
        }
      : null;

  const [payees, properties, splits, accrued, settlements, users] = await Promise.all([
    payeeRepo.list(),
    propertyRepo.list(),
    payoutSplitRepo.list(),
    payoutLedgerRepo.list({ status: "accrued" }),
    payoutSettlementRepo.list(),
    userRepo.list(),
  ]);

  const propertiesForSelect = properties
    .map((p) => ({ id: p.id, title: p.title || p.id }))
    .sort((a, b) => a.title.localeCompare(b.title, "ja"));

  // 直接掲載スタジオの分配自動設定(userId紐付け)用の選択肢。
  const studioUsers = users
    .filter((u) => u.role === "studio")
    .map((u) => ({ id: u.id, label: u.name || u.email || u.id }))
    .sort((a, b) => a.label.localeCompare(b.label, "ja"));

  const accruedByPayee = new Map<string, { amountYen: number }[]>();
  for (const row of accrued) {
    const list = accruedByPayee.get(row.payeeId) ?? [];
    list.push({ amountYen: row.amountYen });
    accruedByPayee.set(row.payeeId, list);
  }

  const accruedSummaryByPayee: Record<
    string,
    { count: number; grossYen: number; withholdingYen: number; netYen: number; belowMinimum: boolean }
  > = {};
  for (const payee of payees) {
    const rows = accruedByPayee.get(payee.id) ?? [];
    const computation = computeSettlement(rows, payee);
    accruedSummaryByPayee[payee.id] = { count: rows.length, ...computation };
  }

  const settlementsByPayee: Record<string, PayoutSettlement[]> = {};
  for (const s of settlements) {
    (settlementsByPayee[s.payeeId] ??= []).push(s);
  }

  return (
    <div className="p-6 md:p-10 space-y-8">
      <header className="flex items-baseline gap-4 flex-wrap">
        <h1 className="serif text-2xl tracking-wider">収益分配・精算</h1>
        <span className="mono text-[10px] tracking-[0.28em] uppercase opacity-40">
          {payees.length} payees / {accrued.length} accrued rows
        </span>
      </header>

      <p className="text-[13px] text-muted leading-[1.8] max-w-[70ch]">
        撮影者・施設への支払いは、当社が売主として販売した代金からの
        <strong className="text-ink">使用料の後払い</strong>です。物件ごとに分配率
        （合計70%まで／当社取り分は最低30%）を設定すると、販売完了時に自動で
        台帳へ計上されます。受取者ごとに未精算額が最低支払額(¥10,000)以上に
        なったら精算を作成できます。
      </p>

      <PayoutsAdmin
        payees={payees}
        properties={propertiesForSelect}
        splits={splits}
        accruedSummaryByPayee={accruedSummaryByPayee}
        settlementsByPayee={settlementsByPayee}
        prefill={prefill}
        studioUsers={studioUsers}
      />
    </div>
  );
}
