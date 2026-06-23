/**
 * User repository — APP-level account records keyed by Clerk userId.
 * Identity/auth is Clerk's job; this stores role / status / NDA / tokens.
 * Dev impl writes `data/users.json` (gitignored); migrates to D1 later.
 */
import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { safeWriteFile, canAccessLocalFs } from "./fs-safe";
import { userSchema, type User } from "./account-schema";
import _usersFallback from "../../data/users.json";

const DATA_FILE = path.join(process.cwd(), "data", "users.json");

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

class JsonFileUserRepo implements UserRepo {
  async list(): Promise<User[]> {
    const s = await readStore();
    return [...s.users].sort((a, b) =>
      (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
    );
  }

  async get(id: string): Promise<User | null> {
    const s = await readStore();
    return s.users.find((u) => u.id === id) ?? null;
  }

  async getByEmail(email: string): Promise<User | null> {
    const s = await readStore();
    const target = email.trim().toLowerCase();
    return s.users.find((u) => u.email.toLowerCase() === target) ?? null;
  }

  async upsert(u: User): Promise<User> {
    const validated = userSchema.parse({
      ...u,
      email: u.email.toLowerCase(),
      updatedAt: new Date().toISOString(),
      createdAt: u.createdAt ?? new Date().toISOString(),
    });
    const s = await readStore();
    const idx = s.users.findIndex((x) => x.id === validated.id);
    if (idx >= 0) s.users[idx] = validated;
    else s.users.push(validated);
    await writeStore(s);
    return validated;
  }

  async remove(id: string): Promise<void> {
    const s = await readStore();
    s.users = s.users.filter((u) => u.id !== id);
    await writeStore(s);
  }
}

export const userRepo: UserRepo = new JsonFileUserRepo();
