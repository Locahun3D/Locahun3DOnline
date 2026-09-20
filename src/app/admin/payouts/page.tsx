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
import AdminPageHeader, { AdminPageShell } from "@/components/admin/admin-page-header";
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
    <AdminPageShell className="space-y-5">
      {/* 2026-09-20: 小型ヘッダーへ。英語の内部用語カウンタ(payees / accrued rows)は日本語の件数に、
          制度の説明は「使い方」に畳んだ。 */}
      <AdminPageHeader
        title="精算"
        count={`受取者 ${payees.length} 名・未精算 ${accrued.length} 件`}
        description="撮影者・施設への使用料の後払いを管理します。"
        help="物件ごとに分配率（合計70%まで／当社取り分は最低30%）を設定すると、販売完了時に自動で台帳へ計上されます。受取者ごとの未精算額が最低支払額（¥10,000）以上になったら精算を作成できます。"
      />

      <PayoutsAdmin
        payees={payees}
        properties={propertiesForSelect}
        splits={splits}
        accruedSummaryByPayee={accruedSummaryByPayee}
        settlementsByPayee={settlementsByPayee}
        prefill={prefill}
        studioUsers={studioUsers}
      />
    </AdminPageShell>
  );
}
