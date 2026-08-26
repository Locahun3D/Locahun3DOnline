import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * 問い合わせ種別のラベルは2箇所にある:
 *   - src/lib/contact-requests.ts        … 正（サーバー側。メール件名・通知・管理画面の絞り込み）
 *   - src/components/admin/contact-request-row.tsx … client 用の複製（server-only を import できない）
 * 片方だけ足すと管理画面の行バッジが undefined になり「どの窓口の問い合わせか」が消える。
 * 新種別（2026-08-16 の scan＝製作側スキャン依頼）を足したときに実際に踏みかけたので、
 * 2つが一致していることをテストで固定する。
 *
 * ⚠ 実行時 import ではなくソースを読んで突き合わせる。contact-requests.ts は
 *   "server-only" と node:fs に依存しており、vitest から素直に import できないため。
 */
const root = path.join(__dirname, "..", "..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

/** `CONTACT_TYPE_LABEL` オブジェクトのキーを、宣言の本文から拾う。 */
function labelKeys(source: string): string[] {
  const start = source.indexOf("CONTACT_TYPE_LABEL");
  expect(start, "CONTACT_TYPE_LABEL の宣言が見つからない").toBeGreaterThan(-1);
  const open = source.indexOf("{", start);
  const close = source.indexOf("\n};", open);
  const body = source.slice(open, close);
  return [...body.matchAll(/^\s{2}([a-z]+):\s*"/gm)].map((m) => m[1]).sort();
}

describe("contact type labels", () => {
  const lib = read("src/lib/contact-requests.ts");
  const adminRow = read("src/components/admin/contact-request-row.tsx");

  it("管理画面(client)のラベル複製がサーバー側と一致する", () => {
    expect(labelKeys(adminRow)).toEqual(labelKeys(lib));
  });

  it("受付中の種別（LEGACY を除く）にはすべてラベルがある", () => {
    const active = [...lib.matchAll(/export const CONTACT_TYPES = \[([^\]]+)\]/g)][0]?.[1] ?? "";
    const types = [...active.matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
    expect(types).toContain("scan"); // 製作側スキャン依頼（/contact/scan）
    for (const t of types) expect(labelKeys(lib)).toContain(t);
  });
});
