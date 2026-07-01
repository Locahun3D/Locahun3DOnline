/**
 * Gift code repository — keyed by canonical code.
 *  - dev（書込可FS）: data/gift-codes.json を読み書き。
 *  - deployed（Workers）: D1 テーブル `gift_codes`（R2 から移行）。
 *
 * 引換の原子性: `claim()` が D1 の条件付き UPDATE（楽観ロック: uses が読取り時と
 * 一致 かつ uses<max_uses のときだけ成功）で二重引換 / maxUses 超過の同時実行を
 * 真に防ぐ。dev（単一プロセス）は read-modify-write で十分。
 */
import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { safeWriteFile, canAccessLocalFs } from "./fs-safe";
import { getD1, d1GetData, d1ListData, d1Upsert, d1Delete, type D1 } from "./d1";
import {
  giftCodeSchema,
  normalizeCode,
  redeemableFor,
  type GiftCode,
  type RedeemError,
} from "./gift-schema";
import _giftFallback from "../../data/gift-codes.json";

const DATA_FILE = path.join(process.cwd(), "data", "gift-codes.json");
const TABLE = "gift_codes";

// Unambiguous alphabet (no 0/O/1/I) for human-typed codes.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Generate a friendly code like "LH3D-7QX4-K2M9". */
export function generateGiftCode(): string {
  const block = () =>
    Array.from({ length: 4 }, () =>
      ALPHABET[Math.floor(Math.random() * ALPHABET.length)],
    ).join("");
  return `LH3D-${block()}-${block()}`;
}

interface StoreShape {
  version: 1;
  codes: GiftCode[];
}

export type ClaimResult =
  | { ok: true; code: GiftCode }
  | { ok: false; error: RedeemError };

export interface GiftCodeRepo {
  list(): Promise<GiftCode[]>;
  get(code: string): Promise<GiftCode | null>;
  upsert(c: GiftCode): Promise<GiftCode>;
  remove(code: string): Promise<void>;
  /** 原子的に引換を確定（uses+1 と redemption 追記）。CAS 失敗時はエラー列挙を返す。 */
  claim(
    codeInput: string,
    redemption: { userId: string; email: string; at: string },
  ): Promise<ClaimResult>;
}

// ── dev: local JSON file ──────────────────────────────────────────
async function readStore(): Promise<StoreShape> {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    return JSON.parse(raw) as StoreShape;
  } catch {
    return _giftFallback as unknown as StoreShape;
  }
}
async function writeStore(s: StoreShape): Promise<void> {
  await safeWriteFile(DATA_FILE, JSON.stringify(s, null, 2));
}

// ── D1 の実カラム抽出（id=code 含む） ─────────────────────────────
function giftCols(c: GiftCode): Record<string, string | number | null> {
  return {
    code: normalizeCode(c.code),
    uses: c.uses ?? 0,
    max_uses: c.maxUses ?? 1,
    status: c.status ?? null,
    expires_at: c.expiresAt ?? null,
    created_at: c.createdAt ?? null,
  };
}

class GiftCodeRepoImpl implements GiftCodeRepo {
  async list(): Promise<GiftCode[]> {
    let codes: GiftCode[];
    if (canAccessLocalFs()) {
      codes = (await readStore()).codes;
    } else {
      const db = await getD1();
      codes = db ? await d1ListData<GiftCode>(db, TABLE) : [];
    }
    return [...codes].sort((a, b) =>
      (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
    );
  }

  async get(code: string): Promise<GiftCode | null> {
    const target = normalizeCode(code);
    if (canAccessLocalFs()) {
      const s = await readStore();
      return s.codes.find((c) => normalizeCode(c.code) === target) ?? null;
    }
    const db = await getD1();
    return db ? d1GetData<GiftCode>(db, TABLE, "code", target) : null;
  }

  async upsert(c: GiftCode): Promise<GiftCode> {
    const validated = giftCodeSchema.parse({
      ...c,
      updatedAt: new Date().toISOString(),
      createdAt: c.createdAt ?? new Date().toISOString(),
    });
    if (canAccessLocalFs()) {
      const key = normalizeCode(validated.code);
      const s = await readStore();
      const idx = s.codes.findIndex((x) => normalizeCode(x.code) === key);
      if (idx >= 0) s.codes[idx] = validated;
      else s.codes.push(validated);
      await writeStore(s);
      return validated;
    }
    const db = await getD1();
    if (!db) throw new Error("D1 が利用できません");
    await d1Upsert(db, TABLE, "code", giftCols(validated), validated);
    return validated;
  }

  async remove(code: string): Promise<void> {
    const target = normalizeCode(code);
    if (canAccessLocalFs()) {
      const s = await readStore();
      s.codes = s.codes.filter((c) => normalizeCode(c.code) !== target);
      await writeStore(s);
      return;
    }
    const db = await getD1();
    if (db) await d1Delete(db, TABLE, "code", target);
  }

  async claim(
    codeInput: string,
    redemption: { userId: string; email: string; at: string },
  ): Promise<ClaimResult> {
    const target = normalizeCode(codeInput);
    const db = canAccessLocalFs() ? null : await getD1();

    // dev / D1未接続: read-modify-write（単一プロセス前提で十分）
    if (!db) {
      const c = await this.get(codeInput);
      const err = redeemableFor(c, redemption.userId, redemption.at);
      if (err || !c) return { ok: false, error: err ?? "not_found" };
      const updated = await this.upsert({
        ...c,
        uses: c.uses + 1,
        redemptions: [
          ...c.redemptions,
          { userId: redemption.userId, email: redemption.email, tokens: c.tokens, at: redemption.at },
        ],
      });
      return { ok: true, code: updated };
    }

    // D1: 楽観ロックの CAS リトライ。読取り時の uses と一致 かつ uses<max_uses の
    // ときだけ UPDATE 成功（changes===1）。負けたら最新を読み直して再試行。
    return claimOnD1(db, target, redemption);
  }
}

async function claimOnD1(
  db: D1,
  target: string,
  redemption: { userId: string; email: string; at: string },
): Promise<ClaimResult> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const row = await db
      .prepare(`SELECT uses, data FROM ${TABLE} WHERE code = ?`)
      .bind(target)
      .first();
    if (!row) return { ok: false, error: "not_found" };

    let current: GiftCode;
    try {
      current = JSON.parse((row as { data: string }).data) as GiftCode;
    } catch {
      return { ok: false, error: "not_found" };
    }
    const err = redeemableFor(current, redemption.userId, redemption.at);
    if (err) return { ok: false, error: err };

    const oldUses = (row as { uses: number }).uses;
    const updated: GiftCode = {
      ...current,
      uses: oldUses + 1,
      updatedAt: redemption.at,
      redemptions: [
        ...current.redemptions,
        { userId: redemption.userId, email: redemption.email, tokens: current.tokens, at: redemption.at },
      ],
    };
    const res = await db
      .prepare(
        `UPDATE ${TABLE} SET uses = ?, status = ?, expires_at = ?, data = ? ` +
          `WHERE code = ? AND uses = ? AND uses < max_uses`,
      )
      .bind(
        updated.uses,
        updated.status ?? null,
        updated.expiresAt ?? null,
        JSON.stringify(updated),
        target,
        oldUses,
      )
      .run();
    if ((res?.meta?.changes ?? 0) === 1) return { ok: true, code: updated };
    // 競合で負けた → 次ループで再読込・再検証（already/exhausted を正しく返す）
  }
  return { ok: false, error: "exhausted" };
}

export const giftCodeRepo: GiftCodeRepo = new GiftCodeRepoImpl();
