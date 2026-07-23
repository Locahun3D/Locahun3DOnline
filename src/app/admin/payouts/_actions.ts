"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/dal";
import {
  payeeRepo,
  payoutSplitRepo,
  payoutSettlementRepo,
  bankInfoSchema,
  PAYEE_KINDS,
  ENTITY_TYPES,
  BANK_ACCOUNT_TYPES,
  findMissingAccruals,
  recordMissingAccrual,
  type Payee,
  type PayoutSplit,
  type PayoutSplitLine,
  type PayoutSettlement,
  type MissingAccrual,
} from "@/lib/payouts";

/**
 * サーバーアクション用の admin チェック。
 * ⚠ requireAdmin()（= requireRole → redirect("/")）をこのファイルのアクションで
 * 使ってはいけない。アクション内の redirect は 303 になり呼び出し元ページごと
 * ホームへ飛ぶ事故クラス（直近の commit 3df0885）。特にこのタブUIは
 * getPayoutSplitAction 等をコンポーネントのマウント/選択変更時に呼ぶため、
 * 非 admin がページを開いた瞬間に追い出されるバグを避ける必要がある
 * （preview-actions.ts の currentAdmin/assertAdmin パターンを踏襲）。
 */
async function currentAdmin(): Promise<boolean> {
  const u = await getCurrentUser();
  return u?.role === "admin";
}

async function assertAdmin(): Promise<void> {
  if (!(await currentAdmin())) throw new Error("forbidden");
}

export type SavePayeeState =
  | { ok: true; payee: Payee }
  | { ok: false; error: string }
  | undefined;

/**
 * 受取者の作成/更新。`<form action={formAction}>` + useActionState 用に
 * (prevState, formData) 形式（gift-actions.ts の createGiftCodeAction と同じ
 * 規約）。formData の "id" が非空なら更新、空なら新規作成。
 */
export async function savePayeeAction(
  _prev: SavePayeeState,
  formData: FormData,
): Promise<SavePayeeState> {
  await assertAdmin();

  const id = String(formData.get("id") ?? "").trim() || undefined;
  const kindRaw = String(formData.get("kind") ?? "");
  const kind = (PAYEE_KINDS as readonly string[]).includes(kindRaw)
    ? (kindRaw as (typeof PAYEE_KINDS)[number])
    : "scanner";
  const entityTypeRaw = String(formData.get("entityType") ?? "");
  const entityType = (ENTITY_TYPES as readonly string[]).includes(entityTypeRaw)
    ? (entityTypeRaw as (typeof ENTITY_TYPES)[number])
    : "individual";
  const name = String(formData.get("name") ?? "").trim();
  const contactEmail = String(formData.get("contactEmail") ?? "").trim();
  const invoiceRegNumber = String(formData.get("invoiceRegNumber") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim().slice(0, 500);

  const accountTypeRaw = String(formData.get("accountType") ?? "");
  const accountType = (BANK_ACCOUNT_TYPES as readonly string[]).includes(accountTypeRaw)
    ? (accountTypeRaw as (typeof BANK_ACCOUNT_TYPES)[number])
    : "普通";

  const bank = bankInfoSchema.safeParse({
    bankName: String(formData.get("bankName") ?? "").trim(),
    branchName: String(formData.get("branchName") ?? "").trim(),
    accountType,
    accountNumber: String(formData.get("accountNumber") ?? "").trim(),
    accountHolder: String(formData.get("accountHolder") ?? "").trim(),
  });
  if (!bank.success) {
    return { ok: false, error: bank.error.issues[0]?.message ?? "口座情報が不正です" };
  }
  if (!name) {
    return { ok: false, error: "氏名/名称は必須です" };
  }

  try {
    const payee = await payeeRepo.upsert({
      id,
      kind,
      entityType,
      name,
      contactEmail,
      bank: bank.data,
      invoiceRegNumber,
      note,
    });
    revalidatePath("/admin/payouts");
    return { ok: true, payee };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "保存に失敗しました" };
  }
}

export async function getPayoutSplitAction(propertyId: string): Promise<PayoutSplit | null> {
  if (!(await currentAdmin())) return null;
  return payoutSplitRepo.get(propertyId);
}

export async function savePayoutSplitAction(
  propertyId: string,
  lines: PayoutSplitLine[],
): Promise<{ ok: true; split: PayoutSplit } | { ok: false; error: string }> {
  await assertAdmin();
  if (!propertyId) return { ok: false, error: "物件を選択してください" };
  const result = await payoutSplitRepo.save(propertyId, lines);
  if (result.ok) revalidatePath("/admin/payouts");
  return result;
}

export async function createSettlementAction(
  payeeId: string,
  periodLabel: string,
): Promise<
  | { ok: true; settlement: PayoutSettlement }
  | { ok: false; error: string; belowMinimum?: boolean }
> {
  await assertAdmin();
  if (!periodLabel.trim()) return { ok: false, error: "精算期間を入力してください" };
  const result = await payoutSettlementRepo.createFromAccrued(payeeId, periodLabel.trim());
  if (result.ok) revalidatePath("/admin/payouts");
  return result;
}

export async function markSettlementPaidAction(
  settlementId: string,
): Promise<{ ok: true; settlement: PayoutSettlement } | { ok: false; error: string }> {
  await assertAdmin();
  const settlement = await payoutSettlementRepo.markPaid(settlementId);
  if (!settlement) return { ok: false, error: "精算が見つからないか、既に処理済みです" };
  revalidatePath("/admin/payouts");
  return { ok: true, settlement };
}

// ──────────────────────────────────────────────────────────────────
// 突合（とりこぼし検知＋再起票）
// ──────────────────────────────────────────────────────────────────
//
// recordPayoutAccruals（台帳自動起票フック）はフェイルセーフのため
// 台帳側の障害を握り潰す。その代償として静かなとりこぼしが起こり得るので、
// ここは purchases と台帳を突合して検知・再起票する管理操作。

export async function findMissingAccrualsAction(): Promise<MissingAccrual[]> {
  await assertAdmin();
  return findMissingAccruals();
}

export type RecordAccrualState = { ok: true } | { ok: false; error: string };

/** 単一の欠落purchaseを再起票する。冪等なのでボタン連打しても安全。 */
export async function recordMissingAccrualAction(purchaseId: string): Promise<RecordAccrualState> {
  await assertAdmin();
  try {
    await recordMissingAccrual(purchaseId);
    revalidatePath("/admin/payouts");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "起票に失敗しました" };
  }
}

export interface RecordAllAccrualsResult {
  succeededIds: string[];
  failed: { purchaseId: string; error: string }[];
}

/** 突合で見つかった欠落を一括で再起票する。1件の失敗が他を止めないよう個別にcatchする。 */
export async function recordAllMissingAccrualsAction(): Promise<RecordAllAccrualsResult> {
  await assertAdmin();
  const missing = await findMissingAccruals();
  const succeededIds: string[] = [];
  const failed: { purchaseId: string; error: string }[] = [];
  for (const m of missing) {
    try {
      await recordMissingAccrual(m.purchaseId);
      succeededIds.push(m.purchaseId);
    } catch (e) {
      failed.push({
        purchaseId: m.purchaseId,
        error: e instanceof Error ? e.message : "起票に失敗しました",
      });
    }
  }
  if (succeededIds.length > 0) revalidatePath("/admin/payouts");
  return { succeededIds, failed };
}
