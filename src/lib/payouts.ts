import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { z } from "zod";
import { safeWriteFile, canAccessLocalFs } from "./fs-safe";
import { getD1, d1GetData, d1ListData, d1Upsert, d1Delete } from "./d1";
import { purchaseRepo, type Purchase } from "./purchases";

/**
 * 収益分配システム Phase 1（分配台帳＋精算）。
 *
 * 事業背景: 撮影者（ユーザー）が持ち込んだスキャンデータを、当社が施設と権利
 * 交渉して販売する。**売主は常に当社**であり、撮影者・施設への支払いは
 * 「販売代金の分配」ではなく当社からの使用料の**後払い**という位置づけ。
 * この整理により、買い手側の決済・特商法表記・利用規約は一切変わらず、
 * 資金移動業（為替取引）の論点も生じない。DECISION_LOG D-005（施設への
 * 20%還元・年1回精算・最低支払¥10,000・未満繰越）もこの台帳に統合できる
 * 設計にしてある（rate/最低支払/精算単位はすべて設定可能な値として扱う）。
 *
 * ⚠ 銀行口座情報を含むテーブル。取り扱い注意（.gitignore で data/*.json を
 * 除外済み、D1移行後もアクセス権限は admin のみに限定すること）。
 *
 * 構成（このファイル1つに集約 — property-previews.ts と同じハイブリッド行
 * モデルの repo パターンを踏襲）:
 *   1. zod スキーマ + 型 + 定数ラベル
 *   2. 純粋計算関数（computeWithholding / computeSettlement 等） — vitest対象
 *   3. D1 + ローカルJSON フォールバックの repo
 *   4. 台帳自動起票フック（recordPayoutAccruals / voidPayoutAccrualsForPurchase）
 *   5. 突合（findMissingAccruals / recordMissingAccrual） — フェイルセーフな
 *      起票フックのとりこぼしを検知・再起票する（/admin/payouts「突合」タブ）
 *   6. 物件IDリネーム追従（renamePayoutRecordsForProperty） — 呼び出し配線は
 *      renamePropertyAction 側（統合側の作業）
 *
 * ⚠ このファイルは（d1.ts 経由で）"server-only" に依存する。クライアント
 * コンポーネントから型を使いたい場合は `import type {...} from "@/lib/payouts"`
 * の type-only import のみを使うこと（isolatedModules で実行時コードは
 * バンドルに含まれない。preview-share.tsx が property-previews.ts に対して
 * 使っている手法と同じ）。ランタイム値（ラベル定数など）を素朴に import する
 * と client component のビルドが壊れるため、フォーム選択肢などはコンポーネント
 * 側に小さく複製すること。
 */

// ──────────────────────────────────────────────────────────────────
// 1. スキーマ + 定数
// ──────────────────────────────────────────────────────────────────

export const PAYEE_KINDS = ["scanner", "venue"] as const;
export type PayeeKind = (typeof PAYEE_KINDS)[number];
export const PAYEE_KIND_LABEL: Record<PayeeKind, string> = {
  scanner: "撮影者",
  venue: "施設",
};

export const ENTITY_TYPES = ["individual", "corporation"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];
export const ENTITY_TYPE_LABEL: Record<EntityType, string> = {
  individual: "個人",
  corporation: "法人",
};

export const BANK_ACCOUNT_TYPES = ["普通", "当座"] as const;
export type BankAccountType = (typeof BANK_ACCOUNT_TYPES)[number];

export const bankInfoSchema = z.object({
  bankName: z.string().min(1, "銀行名は必須です"),
  branchName: z.string().min(1, "支店名は必須です"),
  accountType: z.enum(BANK_ACCOUNT_TYPES),
  accountNumber: z.string().min(1, "口座番号は必須です"),
  accountHolder: z.string().min(1, "口座名義は必須です"),
});
export type BankInfo = z.infer<typeof bankInfoSchema>;

export const payeeSchema = z.object({
  id: z.string(),
  kind: z.enum(PAYEE_KINDS),
  entityType: z.enum(ENTITY_TYPES),
  name: z.string().min(1, "氏名/名称は必須です"),
  contactEmail: z.string().default(""),
  bank: bankInfoSchema,
  /** 適格請求書発行事業者番号（インボイス制度）。任意。 */
  invoiceRegNumber: z.string().default(""),
  /**
   * このPayeeが紐づくサイトアカウント(Clerk userId)。空文字 = 旧来どおり
   * 管理者が手動で作成した受取者（サイトアカウントと紐付かない）。
   * 直接掲載スタジオの分配自動作成(publishAction)は、この値でスタジオの
   * userIdと突き合わせてPayeeを検索する。
   */
  userId: z.string().default(""),
  /**
   * マイナンバー（個人番号）の暗号文。@/lib/mynumber-crypto の
   * encryptMyNumber で暗号化した文字列のみを保存する。平文は絶対に
   * 保存しない。空文字 = 未登録。源泉徴収が発生する個人(entityType:
   * "individual")の支払調書提出に必要（2026-08-02 リーガルチェックで追加）。
   */
  myNumberEncrypted: z.string().default(""),
  note: z.string().max(500).default(""),
  createdAt: z.string().default(() => new Date().toISOString()),
  updatedAt: z.string().default(() => new Date().toISOString()),
});
export type Payee = z.infer<typeof payeeSchema>;

/** 口座番号の下4桁のみ表示（一覧画面用のマスク表示）。 */
export function maskAccountNumber(accountNumber: string): string {
  const last4 = accountNumber.slice(-4);
  return `••••${last4}`;
}

export const PAYOUT_ROLES = ["scanner", "venue"] as const;
export type PayoutRole = (typeof PAYOUT_ROLES)[number];

/** 当社取り分の下限（%）。分配率の合計はこれを超えて設定できない。 */
export const MAX_TOTAL_SPLIT_PERCENT = 70;

/**
 * 直接掲載スタジオへのデータ販売分配率（%）。/terms/listing-revenue-share 第2条。
 * 持ち込みスキャン(30%/50%)とは別枠 — 対象は掲載者自身が直接掲載した物件のみ
 * （第1条で持ち込み経由の物件は明示的に除外）。
 */
export const STUDIO_VENUE_SHARE_PERCENT = 20;

export const payoutSplitLineSchema = z.object({
  payeeId: z.string(),
  role: z.enum(PAYOUT_ROLES),
  /** 小数2桁までの率（%）。 */
  ratePercent: z.number().min(0).max(MAX_TOTAL_SPLIT_PERCENT).multipleOf(0.01),
});
export type PayoutSplitLine = z.infer<typeof payoutSplitLineSchema>;

export const payoutSplitSchema = z.object({
  propertyId: z.string(),
  lines: z.array(payoutSplitLineSchema).default([]),
  updatedAt: z.string().default(() => new Date().toISOString()),
});
export type PayoutSplit = z.infer<typeof payoutSplitSchema>;

export const LEDGER_STATUSES = ["accrued", "settled", "voided"] as const;
export type LedgerStatus = (typeof LEDGER_STATUSES)[number];

export const payoutLedgerEntrySchema = z.object({
  id: z.string(),
  purchaseId: z.string(),
  propertyId: z.string(),
  payeeId: z.string(),
  role: z.enum(PAYOUT_ROLES),
  ratePercent: z.number(),
  /** 販売額（円）。台帳起票時点の purchase.priceYen のスナップショット。 */
  baseAmountYen: z.number().int().min(0),
  /** floor(baseAmountYen * ratePercent / 100)。 */
  amountYen: z.number().int().min(0),
  status: z.enum(LEDGER_STATUSES).default("accrued"),
  settlementId: z.string().optional(),
  createdAt: z.string().default(() => new Date().toISOString()),
});
export type PayoutLedgerEntry = z.infer<typeof payoutLedgerEntrySchema>;

export const SETTLEMENT_STATUSES = ["draft", "paid"] as const;
export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number];

export const payoutSettlementSchema = z.object({
  id: z.string(),
  payeeId: z.string(),
  /** 自由入力の精算期間ラベル。例: "2026Q3"。 */
  periodLabel: z.string().min(1),
  grossYen: z.number().int().min(0),
  withholdingYen: z.number().int().min(0),
  netYen: z.number().int().min(0),
  ledgerIds: z.array(z.string()).default([]),
  status: z.enum(SETTLEMENT_STATUSES).default("draft"),
  paidAt: z.string().optional(),
  createdAt: z.string().default(() => new Date().toISOString()),
});
export type PayoutSettlement = z.infer<typeof payoutSettlementSchema>;

// ──────────────────────────────────────────────────────────────────
// 2. 純粋計算関数（vitest対象・副作用なし）
// ──────────────────────────────────────────────────────────────────

/** 最低支払額（円）。これ未満は精算を作成せず accrued のまま繰り越す。 */
export const MIN_SETTLEMENT_YEN = 10_000;

const WITHHOLDING_THRESHOLD_YEN = 1_000_000;
const WITHHOLDING_RATE_LOW = 0.1021; // 100万円以下部分
const WITHHOLDING_RATE_HIGH = 0.2042; // 100万円超部分

/**
 * 源泉徴収額（円）を計算する。**著作権使用料としての支払いを想定**しており、
 * 個人（entityType: "individual"）のみ源泉徴収し、法人は0円。
 * 100万円以下の部分は10.21%、100万円を超える部分は20.42%（円未満切り捨て）。
 * ⚠ 実運用前に必ず税理士へ最終確認すること（区分・税率は税制改正で変わり得る）。
 */
export function computeWithholding(grossYen: number, entityType: EntityType): number {
  if (entityType !== "individual") return 0;
  if (grossYen <= 0) return 0;
  if (grossYen <= WITHHOLDING_THRESHOLD_YEN) {
    return Math.floor(grossYen * WITHHOLDING_RATE_LOW);
  }
  const lowPart = Math.floor(WITHHOLDING_THRESHOLD_YEN * WITHHOLDING_RATE_LOW);
  const highPart = Math.floor((grossYen - WITHHOLDING_THRESHOLD_YEN) * WITHHOLDING_RATE_HIGH);
  return lowPart + highPart;
}

export interface SettlementComputation {
  grossYen: number;
  withholdingYen: number;
  netYen: number;
  /** ¥10,000未満のため精算せず、accrued のまま繰り越す対象であることを示す。 */
  belowMinimum: boolean;
}

/**
 * 未精算(accrued)行の合計から精算内容を計算する。最低支払額(¥10,000)未満
 * なら精算を作らず繰り越す(belowMinimum=true、源泉徴収・差引額は計算しない=0)。
 */
export function computeSettlement(
  accruedRows: { amountYen: number }[],
  payee: { entityType: EntityType },
): SettlementComputation {
  const grossYen = accruedRows.reduce((sum, row) => sum + row.amountYen, 0);
  if (grossYen < MIN_SETTLEMENT_YEN) {
    return { grossYen, withholdingYen: 0, netYen: 0, belowMinimum: true };
  }
  const withholdingYen = computeWithholding(grossYen, payee.entityType);
  const netYen = grossYen - withholdingYen;
  return { grossYen, withholdingYen, netYen, belowMinimum: false };
}

/** 分配設定の行の合計率が当社取り分の下限(30%)を侵さないか検証する。 */
export function validateSplitLines(
  lines: { ratePercent: number }[],
): { ok: true } | { ok: false; error: string } {
  const total = lines.reduce((sum, l) => sum + l.ratePercent, 0);
  // 浮動小数の誤差(例: 0.1+0.2)を避けるため小数2桁に丸めてから比較する。
  const rounded = Math.round(total * 100) / 100;
  if (rounded > MAX_TOTAL_SPLIT_PERCENT) {
    return {
      ok: false,
      error: `分配率の合計が${MAX_TOTAL_SPLIT_PERCENT}%を超えています（現在 ${rounded}%）。当社取り分は最低30%必要です。`,
    };
  }
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────────
// 3. repo（D1 + ローカルJSON フォールバック）
// ──────────────────────────────────────────────────────────────────

const PAYEES_FILE = path.join(process.cwd(), "data", "payees.json");
const SPLITS_FILE = path.join(process.cwd(), "data", "payout-splits.json");
const LEDGER_FILE = path.join(process.cwd(), "data", "payout-ledger.json");
const SETTLEMENTS_FILE = path.join(process.cwd(), "data", "payout-settlements.json");

const PAYEES_TABLE = "payees";
const SPLITS_TABLE = "payout_splits";
const LEDGER_TABLE = "payout_ledger";
const SETTLEMENTS_TABLE = "payout_settlements";

async function readAll<T>(file: string, key: string): Promise<T[]> {
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return (parsed[key] as T[]) ?? [];
  } catch {
    return [];
  }
}

async function writeAll<T>(file: string, key: string, items: T[]): Promise<void> {
  await safeWriteFile(file, JSON.stringify({ version: 1, [key]: items }, null, 2));
}

// ⚠ userId は payees テーブルの実カラムには無い（migrations/0014）。マイグレーション無しで
//   済ませるため、d1Upsert の data(JSON) 列にだけ保持し、検索は payeeRepo.list() 後に
//   メモリ上でフィルタする（現状の件数規模なら十分安価）。
function payeeCols(p: Payee): Record<string, string | number | null> {
  return {
    id: p.id,
    kind: p.kind,
    entity_type: p.entityType,
    name: p.name,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  };
}

export const payeeRepo = {
  async list(): Promise<Payee[]> {
    if (canAccessLocalFs()) return readAll<Payee>(PAYEES_FILE, "payees");
    const db = await getD1();
    if (!db) return [];
    return d1ListData<Payee>(db, PAYEES_TABLE);
  },

  async get(id: string): Promise<Payee | null> {
    if (canAccessLocalFs()) {
      const all = await readAll<Payee>(PAYEES_FILE, "payees");
      return all.find((p) => p.id === id) ?? null;
    }
    const db = await getD1();
    return db ? d1GetData<Payee>(db, PAYEES_TABLE, "id", id) : null;
  },

  async upsert(input: Omit<Payee, "id" | "createdAt" | "updatedAt"> & { id?: string }): Promise<Payee> {
    const now = new Date().toISOString();
    const existing = input.id ? await this.get(input.id) : null;
    const validated = payeeSchema.parse({
      ...input,
      id: input.id ?? `pay-${nanoid(10)}`,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
    if (canAccessLocalFs()) {
      const all = await readAll<Payee>(PAYEES_FILE, "payees");
      const idx = all.findIndex((p) => p.id === validated.id);
      if (idx >= 0) all[idx] = validated;
      else all.push(validated);
      await writeAll(PAYEES_FILE, "payees", all);
      return validated;
    }
    const db = await getD1();
    if (!db) throw new Error("受取者データの保存先 (D1) が利用できません");
    await d1Upsert(db, PAYEES_TABLE, "id", payeeCols(validated), validated);
    return validated;
  },

  /** userId(Clerk) に紐づく受取者を探す。紐付けが無ければ null。 */
  async findByUserId(userId: string): Promise<Payee | null> {
    if (!userId) return null;
    const all = await this.list();
    return all.find((p) => p.userId === userId) ?? null;
  },
};

function splitCols(s: PayoutSplit): Record<string, string | number | null> {
  return {
    property_id: s.propertyId,
    updated_at: s.updatedAt,
  };
}

export const payoutSplitRepo = {
  /** 分配設定を持つ物件をすべて返す(管理画面の一覧表示用)。 */
  async list(): Promise<PayoutSplit[]> {
    if (canAccessLocalFs()) return readAll<PayoutSplit>(SPLITS_FILE, "splits");
    const db = await getD1();
    if (!db) return [];
    return d1ListData<PayoutSplit>(db, SPLITS_TABLE);
  },

  async get(propertyId: string): Promise<PayoutSplit | null> {
    if (canAccessLocalFs()) {
      const all = await readAll<PayoutSplit>(SPLITS_FILE, "splits");
      return all.find((s) => s.propertyId === propertyId) ?? null;
    }
    const db = await getD1();
    return db ? d1GetData<PayoutSplit>(db, SPLITS_TABLE, "property_id", propertyId) : null;
  },

  /** 分配設定を保存する。合計率が70%を超える場合は保存せずエラーを返す。 */
  async save(
    propertyId: string,
    lines: PayoutSplitLine[],
  ): Promise<{ ok: true; split: PayoutSplit } | { ok: false; error: string }> {
    const validation = validateSplitLines(lines);
    if (!validation.ok) return validation;
    const validated = payoutSplitSchema.parse({
      propertyId,
      lines,
      updatedAt: new Date().toISOString(),
    });
    if (canAccessLocalFs()) {
      const all = await readAll<PayoutSplit>(SPLITS_FILE, "splits");
      const idx = all.findIndex((s) => s.propertyId === propertyId);
      if (idx >= 0) all[idx] = validated;
      else all.push(validated);
      await writeAll(SPLITS_FILE, "splits", all);
      return { ok: true, split: validated };
    }
    const db = await getD1();
    if (!db) return { ok: false, error: "分配設定の保存先 (D1) が利用できません" };
    await d1Upsert(db, SPLITS_TABLE, "property_id", splitCols(validated), validated);
    return { ok: true, split: validated };
  },

  /**
   * propertyId をキーとする行を削除する。物件IDリネーム時、新IDへ save() で
   * 作り直した後に旧IDの行を消すために使う（renamePayoutRecordsForProperty 用）。
   */
  async remove(propertyId: string): Promise<void> {
    if (canAccessLocalFs()) {
      const all = await readAll<PayoutSplit>(SPLITS_FILE, "splits");
      await writeAll(SPLITS_FILE, "splits", all.filter((s) => s.propertyId !== propertyId));
      return;
    }
    const db = await getD1();
    if (db) await d1Delete(db, SPLITS_TABLE, "property_id", propertyId);
  },
};

/**
 * 直接掲載スタジオの物件が公開されたタイミングで呼ぶ（publishAction /
 * publishByIdAction から）。ownerId(=スタジオのuserId) に紐づく受取者が
 * 既に登録済みなら、その物件の分配設定に venue 20% 行を自動追加する。
 *
 * ⚠ 冪等・非破壊: 対象payeeの行が既にあれば何もしない。他の受取者の行
 * （持ち込みスキャン経由のscanner行など）には触れない。受取者が未登録なら
 * 何もしない（先に /admin/payouts で受取者登録が必要 — 20%約束は
 * 受取者登録済みのスタジオにのみ実際に適用される）。
 */
export async function autoCreateStudioVenueSplit(
  propertyId: string,
  ownerId: string | null | undefined,
): Promise<void> {
  if (!ownerId) return;
  const payee = await payeeRepo.findByUserId(ownerId);
  if (!payee) return;

  const existing = await payoutSplitRepo.get(propertyId);
  const lines = existing?.lines ?? [];
  if (lines.some((l) => l.payeeId === payee.id)) return;

  const nextLines: PayoutSplitLine[] = [
    ...lines,
    { payeeId: payee.id, role: "venue" as PayoutRole, ratePercent: STUDIO_VENUE_SHARE_PERCENT },
  ];
  // 合計が70%上限を超える場合(既存行が多い等)は自動追加をスキップし、
  // admin が /admin/payouts で手動調整する（サイレント失敗にはしないよう、
  // 呼び出し元はこの関数の結果を待たずに公開処理自体は継続してよい設計）。
  await payoutSplitRepo.save(propertyId, nextLines);
}

function ledgerCols(e: PayoutLedgerEntry): Record<string, string | number | null> {
  return {
    id: e.id,
    purchase_id: e.purchaseId,
    property_id: e.propertyId,
    payee_id: e.payeeId,
    status: e.status,
    settlement_id: e.settlementId ?? null,
    created_at: e.createdAt,
  };
}

export const payoutLedgerRepo = {
  async list(opts?: { payeeId?: string; status?: LedgerStatus; propertyId?: string }): Promise<PayoutLedgerEntry[]> {
    let out: PayoutLedgerEntry[];
    if (canAccessLocalFs()) {
      out = await readAll<PayoutLedgerEntry>(LEDGER_FILE, "ledger");
      if (opts?.payeeId) out = out.filter((e) => e.payeeId === opts.payeeId);
      if (opts?.status) out = out.filter((e) => e.status === opts.status);
      if (opts?.propertyId) out = out.filter((e) => e.propertyId === opts.propertyId);
    } else {
      const db = await getD1();
      if (!db) return [];
      const conds: string[] = [];
      const binds: (string | number)[] = [];
      if (opts?.payeeId) { conds.push("payee_id = ?"); binds.push(opts.payeeId); }
      if (opts?.status) { conds.push("status = ?"); binds.push(opts.status); }
      if (opts?.propertyId) { conds.push("property_id = ?"); binds.push(opts.propertyId); }
      out = await d1ListData<PayoutLedgerEntry>(
        db,
        LEDGER_TABLE,
        conds.length ? { sql: conds.join(" AND "), binds } : undefined,
      );
    }
    return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  async listByPurchase(purchaseId: string): Promise<PayoutLedgerEntry[]> {
    if (canAccessLocalFs()) {
      const all = await readAll<PayoutLedgerEntry>(LEDGER_FILE, "ledger");
      return all.filter((e) => e.purchaseId === purchaseId);
    }
    const db = await getD1();
    if (!db) return [];
    return d1ListData<PayoutLedgerEntry>(db, LEDGER_TABLE, {
      sql: "purchase_id = ?",
      binds: [purchaseId],
    });
  },

  async upsert(entry: PayoutLedgerEntry): Promise<PayoutLedgerEntry> {
    const validated = payoutLedgerEntrySchema.parse(entry);
    if (canAccessLocalFs()) {
      const all = await readAll<PayoutLedgerEntry>(LEDGER_FILE, "ledger");
      const idx = all.findIndex((e) => e.id === validated.id);
      if (idx >= 0) all[idx] = validated;
      else all.push(validated);
      await writeAll(LEDGER_FILE, "ledger", all);
      return validated;
    }
    const db = await getD1();
    if (!db) throw new Error("分配台帳の保存先 (D1) が利用できません");
    await d1Upsert(db, LEDGER_TABLE, "id", ledgerCols(validated), validated);
    return validated;
  },

  /** 指定した行を一括で settled 化し、settlementId を刻む。 */
  async markSettled(ids: string[], settlementId: string): Promise<void> {
    for (const id of ids) {
      const entry = canAccessLocalFs()
        ? (await readAll<PayoutLedgerEntry>(LEDGER_FILE, "ledger")).find((e) => e.id === id)
        : await (async () => {
            const db = await getD1();
            return db ? d1GetData<PayoutLedgerEntry>(db, LEDGER_TABLE, "id", id) : null;
          })();
      if (!entry || entry.status !== "accrued") continue;
      await this.upsert({ ...entry, status: "settled", settlementId });
    }
  },
};

function settlementCols(s: PayoutSettlement): Record<string, string | number | null> {
  return {
    id: s.id,
    payee_id: s.payeeId,
    status: s.status,
    created_at: s.createdAt,
  };
}

export const payoutSettlementRepo = {
  async list(opts?: { payeeId?: string }): Promise<PayoutSettlement[]> {
    let out: PayoutSettlement[];
    if (canAccessLocalFs()) {
      out = await readAll<PayoutSettlement>(SETTLEMENTS_FILE, "settlements");
      if (opts?.payeeId) out = out.filter((s) => s.payeeId === opts.payeeId);
    } else {
      const db = await getD1();
      if (!db) return [];
      out = await d1ListData<PayoutSettlement>(
        db,
        SETTLEMENTS_TABLE,
        opts?.payeeId ? { sql: "payee_id = ?", binds: [opts.payeeId] } : undefined,
      );
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async get(id: string): Promise<PayoutSettlement | null> {
    if (canAccessLocalFs()) {
      const all = await readAll<PayoutSettlement>(SETTLEMENTS_FILE, "settlements");
      return all.find((s) => s.id === id) ?? null;
    }
    const db = await getD1();
    return db ? d1GetData<PayoutSettlement>(db, SETTLEMENTS_TABLE, "id", id) : null;
  },

  async upsert(s: PayoutSettlement): Promise<PayoutSettlement> {
    const validated = payoutSettlementSchema.parse(s);
    if (canAccessLocalFs()) {
      const all = await readAll<PayoutSettlement>(SETTLEMENTS_FILE, "settlements");
      const idx = all.findIndex((x) => x.id === validated.id);
      if (idx >= 0) all[idx] = validated;
      else all.push(validated);
      await writeAll(SETTLEMENTS_FILE, "settlements", all);
      return validated;
    }
    const db = await getD1();
    if (!db) throw new Error("精算データの保存先 (D1) が利用できません");
    await d1Upsert(db, SETTLEMENTS_TABLE, "id", settlementCols(validated), validated);
    return validated;
  },

  /**
   * 未精算(accrued)の台帳行から精算(draft)を作成し、対象行を settled 化する。
   * 最低支払額(¥10,000)未満の場合は精算を作らない（呼び出し元で belowMinimum
   * を見て「繰越中」表示にする）。
   */
  async createFromAccrued(
    payeeId: string,
    periodLabel: string,
  ): Promise<
    | { ok: true; settlement: PayoutSettlement }
    | { ok: false; error: string; belowMinimum?: boolean }
  > {
    const payee = await payeeRepo.get(payeeId);
    if (!payee) return { ok: false, error: "受取者が見つかりません" };
    const accrued = await payoutLedgerRepo.list({ payeeId, status: "accrued" });
    if (accrued.length === 0) return { ok: false, error: "未精算の台帳行がありません" };

    const computation = computeSettlement(accrued, payee);
    if (computation.belowMinimum) {
      return {
        ok: false,
        error: `最低支払額(¥${MIN_SETTLEMENT_YEN.toLocaleString()})未満のため繰り越します（現在 ¥${computation.grossYen.toLocaleString()}）`,
        belowMinimum: true,
      };
    }

    const settlement = payoutSettlementSchema.parse({
      id: `stl-${nanoid(12)}`,
      payeeId,
      periodLabel,
      grossYen: computation.grossYen,
      withholdingYen: computation.withholdingYen,
      netYen: computation.netYen,
      ledgerIds: accrued.map((e) => e.id),
      status: "draft",
      createdAt: new Date().toISOString(),
    });
    const saved = await this.upsert(settlement);
    await payoutLedgerRepo.markSettled(
      accrued.map((e) => e.id),
      saved.id,
    );
    return { ok: true, settlement: saved };
  },

  async markPaid(id: string): Promise<PayoutSettlement | null> {
    const s = await this.get(id);
    if (!s || s.status !== "draft") return null;
    return this.upsert({ ...s, status: "paid", paidAt: new Date().toISOString() });
  },
};

// ──────────────────────────────────────────────────────────────────
// 4. 台帳自動起票フック
// ──────────────────────────────────────────────────────────────────

interface AccrualSourcePurchase {
  id: string;
  propertyId: string;
  priceYen: number;
  status: string;
}

/**
 * 購入が「支払い済み(completed)」になった時点で呼ぶ台帳起票フック。
 * 該当 propertyId に分配設定(payout_splits)が無ければ何もしない。あれば
 * 設定された各受取者ぶんの ledger 行を起票する（1販売×1受取者=1行）。
 *
 * 冪等ガード: 同 purchaseId の行が既にあれば何もしない（webhook と
 * /api/purchase/return がほぼ同時に届く購入完了確定の競合と同じ理由で、
 * この関数も複数箇所から複数回呼ばれ得る）。
 */
export async function recordPayoutAccruals(purchase: AccrualSourcePurchase): Promise<void> {
  // ⚠ フェイルセーフ必須: このフックは購入完了処理(Stripe戻り/Webhook/即時購入)の
  // 中で await される。台帳側の障害(本番D1にマイグレーション未適用・一時的なDB
  // エラー等)で throw すると、**支払い済みユーザーの購入完了までエラーになる**。
  // 台帳は purchases テーブルから後で補填できるが、決済直後のエラー画面は
  // 取り返しがつかないため、ここでは握り潰してログに残すだけにする。
  try {
    await recordPayoutAccrualsUnsafe(purchase);
  } catch (e) {
    console.error("[payouts] 台帳起票に失敗(購入処理は継続):", purchase.id, e);
  }
}

/**
 * throw する版の起票処理本体。recordPayoutAccruals はこれを握り潰して呼ぶが、
 * 管理画面「突合」タブの手動起票（recordMissingAccrual 経由）はエラーを
 * 画面に表示したいため、こちらを直接 export して使う。
 */
export async function recordPayoutAccrualsUnsafe(purchase: AccrualSourcePurchase): Promise<void> {
  if (purchase.status !== "completed") return;
  if (purchase.priceYen <= 0) return; // ¥0購入(無料配布)は分配元の代金が無い

  const split = await payoutSplitRepo.get(purchase.propertyId);
  if (!split || split.lines.length === 0) return;

  const existing = await payoutLedgerRepo.listByPurchase(purchase.id);
  if (existing.length > 0) return; // 冪等ガード

  for (const line of split.lines) {
    const amountYen = Math.floor((purchase.priceYen * line.ratePercent) / 100);
    if (amountYen <= 0) continue;
    await payoutLedgerRepo.upsert({
      id: `ldg-${nanoid(12)}`,
      purchaseId: purchase.id,
      propertyId: purchase.propertyId,
      payeeId: line.payeeId,
      role: line.role,
      ratePercent: line.ratePercent,
      baseAmountYen: purchase.priceYen,
      amountYen,
      status: "accrued",
      createdAt: new Date().toISOString(),
    });
  }
}

/**
 * 返金確定時に呼ぶフック。該当 purchaseId の accrued 行を voided にする。
 * settled 済み（既に精算対象になった行）は Phase 1 では触らない
 * （マイナス調整は Phase 2 で扱う）。
 */
export async function voidPayoutAccrualsForPurchase(purchaseId: string): Promise<void> {
  // recordPayoutAccruals と同じ理由で、返金処理本体を巻き込まない。
  try {
    await voidPayoutAccrualsUnsafe(purchaseId);
  } catch (e) {
    console.error("[payouts] 台帳の返金取消に失敗(返金処理は継続):", purchaseId, e);
  }
}

async function voidPayoutAccrualsUnsafe(purchaseId: string): Promise<void> {
  const rows = await payoutLedgerRepo.listByPurchase(purchaseId);
  for (const row of rows) {
    if (row.status !== "accrued") continue;
    await payoutLedgerRepo.upsert({ ...row, status: "voided" });
  }
}

// ──────────────────────────────────────────────────────────────────
// 5. 突合（とりこぼし検知＋再起票）
// ──────────────────────────────────────────────────────────────────
//
// recordPayoutAccruals はフェイルセーフ（握り潰してログのみ）にしてある
// ため、台帳側の障害（例: 本番D1にマイグレーション未適用のままデプロイした
// 期間）で起票が静かにとりこぼされ得る。purchases と台帳を突合し、
// 「分配設定はあるのに台帳行が無い」購入を検知して手動で再起票できるように
// する（/admin/payouts の「突合」タブから使う）。

export interface MissingAccrual {
  purchaseId: string;
  propertyId: string;
  priceYen: number;
  purchasedAt: string;
}

/**
 * 「起票されているべきなのに、されていない」の判定部分だけを切り出した
 * 純粋関数（DBアクセス無し・vitest対象）。recordPayoutAccrualsUnsafe が
 * 起票対象とみなす条件（completed / priceYen>0 / 分配設定あり）と、
 * 「まだ台帳行が無い」を合わせて判定する。
 */
export function isAccrualMissing(params: {
  purchaseStatus: string;
  priceYen: number;
  hasSplit: boolean;
  hasLedgerEntry: boolean;
}): boolean {
  return (
    params.purchaseStatus === "completed" &&
    params.priceYen > 0 &&
    params.hasSplit &&
    !params.hasLedgerEntry
  );
}

/**
 * 全 purchases(status=completed, priceYen>0) のうち、その propertyId に
 * 分配設定(splits)が存在するのに台帳に該当 purchaseId の行が1件も無い
 * ものを列挙する。管理画面の「突合を実行」ボタンから呼ぶ。
 */
export async function findMissingAccruals(): Promise<MissingAccrual[]> {
  const [purchases, splits, ledger] = await Promise.all([
    purchaseRepo.list({ status: "completed" }),
    payoutSplitRepo.list(),
    payoutLedgerRepo.list(),
  ]);

  const splitPropertyIds = new Set(
    splits.filter((s) => s.lines.length > 0).map((s) => s.propertyId),
  );
  const ledgerPurchaseIds = new Set(ledger.map((e) => e.purchaseId));

  const missing: MissingAccrual[] = [];
  for (const p of purchases) {
    const isMissing = isAccrualMissing({
      purchaseStatus: p.status,
      priceYen: p.priceYen,
      hasSplit: splitPropertyIds.has(p.propertyId),
      hasLedgerEntry: ledgerPurchaseIds.has(p.id),
    });
    if (isMissing) {
      missing.push({
        purchaseId: p.id,
        propertyId: p.propertyId,
        priceYen: p.priceYen,
        purchasedAt: p.completedAt ?? p.createdAt,
      });
    }
  }
  return missing;
}

/**
 * 「突合」タブの「起票する」ボタン用ラッパー。purchase を取得して
 * recordPayoutAccrualsUnsafe を呼ぶ（throw する版。冪等ガードは
 * recordPayoutAccrualsUnsafe 側にあるので二重起票の心配はない）。
 */
export async function recordMissingAccrual(purchaseId: string): Promise<void> {
  const purchase = await purchaseRepo.get(purchaseId);
  if (!purchase) throw new Error(`購入が見つかりません: ${purchaseId}`);
  await recordPayoutAccrualsUnsafe(purchase as Purchase);
}

// ──────────────────────────────────────────────────────────────────
// 6. 物件IDリネームへの追従
// ──────────────────────────────────────────────────────────────────
//
// 物件ID=URL=R2キーで、admin は renamePropertyAction（src/app/admin/
// _actions.ts）で物件IDを変更できる。payout_splits は propertyId を
// キーにしているため、リネームすると分配設定が迷子になり＝以後の販売が
// 起票されなくなる。台帳(ledger)の過去行の propertyId も表示整合のため
// 付け替える。

/**
 * payout_splits のキー付け替え + payout_ledger の propertyId 更新。
 * **renamePropertyAction から呼ぶこと（統合側で配線。このファイルからは
 * 配線しない）**。admin操作の一部として実行される想定のため、
 * recordPayoutAccruals 系と違いフェイルセーフ不要（失敗時は素直に throw）。
 */
export async function renamePayoutRecordsForProperty(
  oldId: string,
  newId: string,
): Promise<void> {
  const split = await payoutSplitRepo.get(oldId);
  if (split && split.lines.length > 0) {
    const result = await payoutSplitRepo.save(newId, split.lines);
    if (!result.ok) {
      throw new Error(`分配設定の付け替えに失敗しました(${oldId} → ${newId}): ${result.error}`);
    }
    await payoutSplitRepo.remove(oldId);
  }

  const ledgerRows = await payoutLedgerRepo.list({ propertyId: oldId });
  for (const row of ledgerRows) {
    await payoutLedgerRepo.upsert({ ...row, propertyId: newId });
  }
}
