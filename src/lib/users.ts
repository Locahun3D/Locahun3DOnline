/**
 * User repository — APP-level account records keyed by Clerk userId.
 * Identity/auth is Clerk's job; this stores role / status / NDA / tokens.
 * Dev impl writes `data/users.json` (gitignored); migrates to D1 later.
 */
import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { safeWriteFile, canAccessLocalFs } from "./fs-safe";
import { r2ColGet, r2ColPut, r2ColDelete, r2ColList } from "./r2-store";
import { userSchema, type User } from "./account-schema";
import _usersFallback from "../../data/users.json";

const DATA_FILE = path.join(process.cwd(), "data", "users.json");
const R2_PREFIX = "users/";

/** Build-time seed (e.g. bootstrap admin). Resolves on Workers before R2 has the record. */
const SEED_USERS: User[] = (_usersFallback as unknown as StoreShape).users ?? [];

/**
 * Emails that bootstrap as admin on first sign-in. Defaults to the operator's
 * email; override with ADMIN_BOOTSTRAP_EMAILS (comma-separated). Anyone else
 * can be promoted from /admin/accounts.
 */
const ADMIN_EMAILS = (
  process.env.ADMIN_BOOTSTRAP_EMAILS ?? "nakamurakou1108@gmail.com"
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

/** Merge R2 records over the build-time seed (R2 wins on id collision). */
async function readAllUsers(): Promise<User[]> {
  if (canAccessLocalFs()) return (await readStore()).users;
  const r2 = await r2ColList<User>(R2_PREFIX);
  const byId = new Map<string, User>();
  for (const u of SEED_USERS) byId.set(u.id, u);
  for (const u of r2) byId.set(u.id, u);
  return [...byId.values()];
}

class JsonFileUserRepo implements UserRepo {
  async list(): Promise<User[]> {
    const users = await readAllUsers();
    return [...users].sort((a, b) =>
      (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
    );
  }

  async get(id: string): Promise<User | null> {
    if (canAccessLocalFs()) {
      const s = await readStore();
      return s.users.find((u) => u.id === id) ?? null;
    }
    return (
      (await r2ColGet<User>(R2_PREFIX, id)) ??
      SEED_USERS.find((u) => u.id === id) ??
      null
    );
  }

  async getByEmail(email: string): Promise<User | null> {
    const target = email.trim().toLowerCase();
    const users = await readAllUsers();
    return users.find((u) => u.email.toLowerCase() === target) ?? null;
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
    await r2ColPut(R2_PREFIX, validated.id, validated);
    return validated;
  }

  async remove(id: string): Promise<void> {
    if (canAccessLocalFs()) {
      const s = await readStore();
      s.users = s.users.filter((u) => u.id !== id);
      await writeStore(s);
      return;
    }
    await r2ColDelete(R2_PREFIX, id);
  }
}

export const userRepo: UserRepo = new JsonFileUserRepo();
