import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { safeWriteFile, canAccessLocalFs } from "./fs-safe";
import { getD1, d1ListData, d1Upsert } from "./d1";

/**
 * 問い合わせメールスレッド。/contact の contact_requests とは別テーブルで、
 * counterpart(相手メール小文字)で突き合わせて admin UI にスレッド表示する。
 *
 * 書き込み経路は2つ:
 *  1. email-worker/（Cloudflare Email Routing の受信 Worker）— 本番D1へ直接
 *     INSERT する。このファイルのスキーマと email-worker 側の列・JSON形状を
 *     一致させること（worker は Next.js のコードを import できない）。
 *  2. replyToContactRequestAction（管理画面からの返信）— appendContactMessage。
 *
 * ローカル開発ではメール受信が発生しないため file 側は主に検証シード用。
 */

export const contactMessageSchema = z.object({
  id: z.string(),
  direction: z.enum(["inbound", "outbound"]),
  /** 相手側メールアドレス（小文字）。contact_requests.email と突き合わせる。 */
  counterpart: z.string(),
  fromEmail: z.string().default(""),
  toEmail: z.string().default(""),
  subject: z.string().default(""),
  bodyText: z.string().default(""),
  /** 'email'(Email Routing経由) | 'admin-ui'(管理画面の返信フォーム) */
  source: z.enum(["email", "admin-ui"]).default("email"),
  createdAt: z.string().default(() => new Date().toISOString()),
});
export type ContactMessage = z.infer<typeof contactMessageSchema>;

const DATA_FILE = path.join(process.cwd(), "data", "contact-messages.json");
const TABLE = "contact_messages";

/** 読み出し時のスキーマ正規化（contact-requests の normalize と同じ理由 — 列追加で旧行が500を起こす実害対策）。 */
function normalize(rows: unknown[]): ContactMessage[] {
  const out: ContactMessage[] = [];
  for (const r of rows) {
    const p = contactMessageSchema.safeParse(r);
    if (p.success) out.push(p.data);
    else console.error("[contact-messages] 不正レコードをスキップ:", p.error.issues[0]);
  }
  return out;
}

async function fileReadAll(): Promise<ContactMessage[]> {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const s = JSON.parse(raw) as { messages?: unknown[] };
    return normalize(s.messages ?? []);
  } catch {
    return [];
  }
}

async function fileWriteAll(messages: ContactMessage[]): Promise<void> {
  await safeWriteFile(DATA_FILE, JSON.stringify({ version: 1, messages }, null, 2));
}

export const contactMessageRepo = {
  /** 全件（古い順）。UIでは counterpart ごとにグループして使う。 */
  async list(): Promise<ContactMessage[]> {
    let out: ContactMessage[];
    if (canAccessLocalFs()) {
      out = await fileReadAll();
    } else {
      const db = await getD1();
      if (!db) return [];
      out = normalize(await d1ListData<ContactMessage>(db, TABLE));
    }
    return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  async append(input: Omit<ContactMessage, "id" | "createdAt"> & { id?: string }): Promise<ContactMessage> {
    const validated = contactMessageSchema.parse({
      ...input,
      counterpart: input.counterpart.toLowerCase(),
      id: input.id ?? randomUUID(),
      createdAt: new Date().toISOString(),
    });
    if (canAccessLocalFs()) {
      const all = await fileReadAll();
      if (!all.some((m) => m.id === validated.id)) all.push(validated);
      await fileWriteAll(all);
      return validated;
    }
    const db = await getD1();
    if (!db) throw new Error("メッセージの保存先 (D1) が利用できません");
    await d1Upsert(
      db,
      TABLE,
      "id",
      {
        id: validated.id,
        direction: validated.direction,
        counterpart: validated.counterpart,
        created_at: validated.createdAt,
      },
      validated,
    );
    return validated;
  },
};

/** counterpart(小文字メール) → メッセージ配列（古い順）にグループする。 */
export function groupMessagesByCounterpart(messages: ContactMessage[]): Map<string, ContactMessage[]> {
  const map = new Map<string, ContactMessage[]>();
  for (const m of messages) {
    const list = map.get(m.counterpart) ?? [];
    list.push(m);
    map.set(m.counterpart, list);
  }
  return map;
}
