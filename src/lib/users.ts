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
import { userSchema, oneYearFrom, oneMonthFrom, type User } from "./account-schema";
import { PLAN_TOKEN_BUDGET } from "./schemas";

const DATA_FILE = path.join(process.cwd(), "data", "users.json");
const TABLE = "users";
const R2_PREFIX = "users/"; // 旧本番ストア（D1 への初回シード元）

/** Build-time seed (e.g. bootstrap admin). Empty — bootstrap admins resolve via
 * ADMIN_BOOTSTRAP_EMAILS / isBootstrapAdminEmail() on first sign-in instead. */
const SEED_USERS: User[] = [];

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
  /**
   * トークン残高等をアトミックに加算する（ギフトコード引換の並行実行対策）。
   * 通常の upsert は read-modify-write のため、同一ユーザーが2つの異なる
   * ギフトコードをほぼ同時に引き換えると、片方の加算が後勝ちで消える
   * lost-update が起き得る。ここでは D1 の楽観ロック（読取り時の updatedAt
   * と一致する行だけ更新、競合時は再読込して再試行）で真に安全に加算する。
   */
  grantTokens(userId: string, patch: (u: User) => User): Promise<User | null>;
}

async function readStore(): Promise<StoreShape> {
  if (!canAccessLocalFs()) return { version: 1, users: SEED_USERS };
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    return JSON.parse(raw) as StoreShape;
  } catch {
    return { version: 1, users: SEED_USERS };
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
    const settled = await Promise.all(users.map((u) => this.applyTokenLifecycle(u)));
    return settled.sort((a, b) =>
      (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
    );
  }

  async get(id: string): Promise<User | null> {
    let u: User | null;
    if (canAccessLocalFs()) {
      const s = await readStore();
      u = s.users.find((x) => x.id === id) ?? null;
    } else {
      const db = await getD1();
      if (!db) return SEED_USERS.find((x) => x.id === id) ?? null;
      await ensureSeeded(db);
      u =
        (await d1GetData<User>(db, TABLE, "id", id)) ??
        SEED_USERS.find((x) => x.id === id) ??
        null;
    }
    return u ? this.applyTokenLifecycle(u) : null;
  }

  /**
   * 読み込みのたびにトークンの寿命を精算する（store.ts の splatItem.id 遅延採番
   * と同じ「読み取り時に自己修復して書き戻す」パターン）。
   *
   * 1) 失効判定: tokenExpiresAt を過ぎていたら tokenBalance を 0 にする。
   *    これが無いと、料金ページ/アカウントページで案内している「1年で失効」が
   *    実装として一切効かず、トークンが無期限に使い続けられてしまっていた。
   * 2) 月次補充: 有料プランは tokenRefillAt を過ぎるたびプラン予算まで満タン
   *    補充する。Stripe の invoice.paid(subscription_cycle) は年払いだと年1回
   *    しか発火しないため、それに頼るだけだと年払い会員は「月◯トークン」の
   *    謳い文句どおり毎月補充されない。ここで請求サイクルと独立した月次クロック
   *    を持たせ、年払いでも実際に毎月満タンになるようにする（Stripe側の課金
   *    サイクル自体は変えない。トークン付与だけ月次にする）。
   */
  private async applyTokenLifecycle(u: User): Promise<User> {
    const now = new Date().toISOString();
    let next = u;
    let changed = false;

    if (next.tokenExpiresAt && next.tokenExpiresAt <= now && next.tokenBalance > 0) {
      next = { ...next, tokenBalance: 0, tokenExpiresAt: null };
      changed = true;
    }

    if (next.plan !== "free" && next.tokenRefillAt && next.tokenRefillAt <= now) {
      const budget = PLAN_TOKEN_BUDGET[next.plan];
      next = {
        ...next,
        tokenBalance: budget,
        tokenExpiresAt: budget > 0 ? oneYearFrom(now) : null,
        tokenRefillAt: oneMonthFrom(now),
      };
      changed = true;
    }

    if (!changed) return u;
    return this.upsert(next);
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

  async grantTokens(userId: string, patch: (u: User) => User): Promise<User | null> {
    if (canAccessLocalFs()) {
      const s = await readStore();
      const idx = s.users.findIndex((x) => x.id === userId);
      if (idx < 0) return null;
      const updated = userSchema.parse({
        ...patch(s.users[idx]),
        updatedAt: new Date().toISOString(),
      });
      s.users[idx] = updated;
      await writeStore(s);
      return updated;
    }

    const db = await getD1();
    if (!db) return null;
    await ensureSeeded(db);

    const MAX_ATTEMPTS = 6;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const row = await db.prepare(`SELECT data FROM ${TABLE} WHERE id = ?`).bind(userId).first();
      if (!row) return null;
      let current: User;
      try {
        current = userSchema.parse(JSON.parse((row as { data: string }).data));
      } catch {
        return null;
      }

      // 最終試行は競合が続いても付与自体は必ず届けるため通常 upsert にフォール
      // バックする（トークンを付与し損なう方が、稀な上書き競合より実害が大きい）。
      if (attempt === MAX_ATTEMPTS - 1) {
        return this.upsert(patch(current));
      }

      const guard = current.updatedAt ?? null;
      const next = userSchema.parse({ ...patch(current), updatedAt: new Date().toISOString() });
      const res = await db
        .prepare(
          `UPDATE ${TABLE} SET data = ? WHERE id = ? AND json_extract(data, '$.updatedAt') IS ?`,
        )
        .bind(JSON.stringify(next), userId, guard)
        .run();
      if ((res?.meta?.changes ?? 0) === 1) return next;
      // 競合で負けた → 次ループで最新行を読み直して再試行。
    }
    return null;
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
