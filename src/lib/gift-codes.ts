/**
 * Gift code repository — keyed by canonical code.
 * Dev impl writes `data/gift-codes.json` (gitignored); migrates to D1 later.
 */
import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { safeWriteFile, canAccessLocalFs } from "./fs-safe";
import { giftCodeSchema, normalizeCode, type GiftCode } from "./gift-schema";
import _giftFallback from "../../data/gift-codes.json";

const DATA_FILE = path.join(process.cwd(), "data", "gift-codes.json");

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

export interface GiftCodeRepo {
  list(): Promise<GiftCode[]>;
  get(code: string): Promise<GiftCode | null>;
  upsert(c: GiftCode): Promise<GiftCode>;
  remove(code: string): Promise<void>;
}

async function readStore(): Promise<StoreShape> {
  if (!canAccessLocalFs()) return _giftFallback as unknown as StoreShape;
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

class JsonFileGiftCodeRepo implements GiftCodeRepo {
  async list(): Promise<GiftCode[]> {
    const s = await readStore();
    return [...s.codes].sort((a, b) =>
      (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
    );
  }

  async get(code: string): Promise<GiftCode | null> {
    const s = await readStore();
    const target = normalizeCode(code);
    return s.codes.find((c) => normalizeCode(c.code) === target) ?? null;
  }

  async upsert(c: GiftCode): Promise<GiftCode> {
    const validated = giftCodeSchema.parse({
      ...c,
      updatedAt: new Date().toISOString(),
      createdAt: c.createdAt ?? new Date().toISOString(),
    });
    const s = await readStore();
    const key = normalizeCode(validated.code);
    const idx = s.codes.findIndex((x) => normalizeCode(x.code) === key);
    if (idx >= 0) s.codes[idx] = validated;
    else s.codes.push(validated);
    await writeStore(s);
    return validated;
  }

  async remove(code: string): Promise<void> {
    const s = await readStore();
    const target = normalizeCode(code);
    s.codes = s.codes.filter((c) => normalizeCode(c.code) !== target);
    await writeStore(s);
  }
}

export const giftCodeRepo: GiftCodeRepo = new JsonFileGiftCodeRepo();
