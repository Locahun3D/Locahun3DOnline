/**
 * User repository — APP-level account records keyed by Clerk userId.
 * Identity/auth is Clerk's job; this stores role / status / NDA / tokens.
 * Dev impl writes `data/users.json` (gitignored); migrates to D1 later.
 */
import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { safeWriteFile, canAccessLocalFs } from "./fs-safe";
import { r2ColList } from "./r2-store";
import {
  getD1,
  d1GetData,
  d1ListData,
  d1Upsert,
  d1Delete,
  d1IsEmpty,
  type D1,
} from "./d1";
import { userSchema, type User } from "./account-schema";
import _usersFallback from "../../data/users.json";

const DATA_FILE = path.join(process.cwd(), "data", "users.json");
const TABLE = "users";
const R2_PREFIX = "users/"; // 旧本番ストア（D1 への初回シード元）

/** Build-time seed (e.g. bootstrap admin). Resolves on Workers before R2 has the record. */
const SEED_USERS: User[] = (_usersFallback as unknown as StoreShape).users ?? [];

/**
 * Emails that bootstrap as admin on first sign-in. Defaults to the operator's
 * email; override with ADMIN_BOOTSTRAP_EMAILS (comma-separated). Anyone else
 * can be promoted from /admin/accounts.
 */
const ADMIN_EMAILS = (
  process.env.ADMIN_BOOTSTRAP_EMAILS ?? "nakamurakou1108@gmail.com,l3dtools@gmail.com"
)
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export function isBootstrapAdminEmail(email: string): boolean {
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

interface StoreShape {
  version: 1;
  users: User[];
}

export interface UserRepo {
  list(): Promise<User[]>;
  get(id: string): Promise<User | null>;
  getByEmail(email: string): Promise<User | null>;
  upsert(u: User): Promise<User>;
  remove(id: string): Promise<void>;
}

async function readStore(): Promise<StoreShape> {
  if (!canAccessLocalFs()) return _usersFallback as unknown as StoreShape;
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    return JSON.parse(raw) as StoreShape;
  } catch {
    return _usersFallback as unknown as StoreShape;
  }
}

async function writeStore(s: StoreShape): Promise<void> {
  await safeWriteFile(DATA_FILE, JSON.stringify(s, null, 2));
}

/** D1 の実カラム抽出（id 含む）。email は小文字化して unique index に載せる。 */
function userCols(u: User): Record<string, string | number | null> {
  return {
    id: u.id,
    email_lower: u.email.toLowerCase(),
    role: u.role ?? null,
    status: u.status ?? null,
    created_at: u.createdAt ?? null,
  };
}

// D1 が空なら「旧本番(R2 users/*) ＋ ビルド時seed(admin)」を非破壊で初回投入。
// upsert ベースなので再実行しても安全。R2 が id 衝突で seed に勝つ（最新を優先）。
let _seeded = false;
async function ensureSeeded(db: D1): Promise<void> {
  if (_seeded) return;
  if (!(await d1IsEmpty(db, TABLE))) {
    _seeded = true;
    return;
  }
  const r2 = await r2ColList<User>(R2_PREFIX).catch(() => [] as User[]);
  const byId = new Map<string, User>();
  for (const u of SEED_USERS) byId.set(u.id, u);
  for (const u of r2) byId.set(u.id, u);
  for (const u of byId.values()) {
    const v = userSchema.safeParse(u);
    if (v.success) await d1Upsert(db, TABLE, "id", userCols(v.data), v.data);
  }
  _seeded = true;
}

class UserRepoImpl implements UserRepo {
  async list(): Promise<User[]> {
    let users: User[];
    if (canAccessLocalFs()) {
      users = (await readStore()).users;
    } else {
      const db = await getD1();
      if (!db) {
        users = SEED_USERS;
      } else {
        await ensureSeeded(db);
        users = await d1ListData<User>(db, TABLE);
      }
    }
    return [...users].sort((a, b) =>
      (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
    );
  }

  async get(id: string): Promise<User | null> {
    if (canAccessLocalFs()) {
      const s = await readStore();
      return s.users.find((u) => u.id === id) ?? null;
    }
    const db = await getD1();
    if (!db) return SEED_USERS.find((u) => u.id === id) ?? null;
    await ensureSeeded(db);
    return (
      (await d1GetData<User>(db, TABLE, "id", id)) ??
      SEED_USERS.find((u) => u.id === id) ??
      null
    );
  }

  async getByEmail(email: string): Promise<User | null> {
    const target = email.trim().toLowerCase();
    if (canAccessLocalFs()) {
      const s = await readStore();
      return s.users.find((u) => u.email.toLowerCase() === target) ?? null;
    }
    const db = await getD1();
    if (!db) return SEED_USERS.find((u) => u.email.toLowerCase() === target) ?? null;
    await ensureSeeded(db);
    const rows = await d1ListData<User>(db, TABLE, {
      sql: "email_lower = ?",
      binds: [target],
    });
    return (
      rows[0] ??
      SEED_USERS.find((u) => u.email.toLowerCase() === target) ??
      null
    );
  }

  async upsert(u: User): Promise<User> {
    const validated = userSchema.parse({
      ...u,
      email: u.email.toLowerCase(),
      updatedAt: new Date().toISOString(),
      createdAt: u.createdAt ?? new Date().toISOString(),
    });
    if (canAccessLocalFs()) {
      const s = await readStore();
      const idx = s.users.findIndex((x) => x.id === validated.id);
      if (idx >= 0) s.users[idx] = validated;
      else s.users.push(validated);
      await writeStore(s);
      return validated;
    }
    const db = await getD1();
    if (!db) throw new Error("D1 が利用できません");
    await ensureSeeded(db);
    await d1Upsert(db, TABLE, "id", userCols(validated), validated);
    return validated;
  }

  async remove(id: string): Promise<void> {
    if (canAccessLocalFs()) {
      const s = await readStore();
      s.users = s.users.filter((u) => u.id !== id);
      await writeStore(s);
      return;
    }
    const db = await getD1();
    if (db) await d1Delete(db, TABLE, "id", id);
  }
}

export const userRepo: UserRepo = new UserRepoImpl();
