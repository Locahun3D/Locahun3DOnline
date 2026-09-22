import { describe, it, expect, vi, afterEach } from "vitest";
import { runEnglishFill, QUIET_MS } from "./english-fill-job";
import { propertySchema } from "./schemas";

/**
 * 英語の自動補完（定期実行）の本体。本物の D1 と Anthropic は使わず、同じ形の偽物で確かめる。
 */
const base = (id: string, extra: Record<string, unknown> = {}) =>
  propertySchema.parse({ id, status: "draft", category: "studio", title: "テスト", titleEn: "Test", cover: {}, ...extra });

function fakeDb(rows: { id: string; status: string; updated_at: string; data: string }[]) {
  const writes: unknown[][] = [];
  return {
    writes,
    prepare(sql: string) {
      let args: unknown[] = [];
      const stmt = {
        bind(...v: unknown[]) { args = v; return stmt; },
        async all() { return { results: rows }; },
        async run() {
          writes.push(args);
          const row = rows.find((r) => r.id === args[2]);
          const ok = !!row && row.updated_at === args[3] && row.data === args[4];
          if (ok && row) { row.data = String(args[0]); row.updated_at = String(args[1]); }
          return { meta: { changes: ok ? 1 : 0 } };
        },
      };
      void sql;
      return stmt;
    },
  };
}

function stubAnthropic(reply: Record<string, unknown>) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(reply) }] }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
afterEach(() => vi.unstubAllGlobals());

describe("英語の自動補完", () => {
  const now = Date.parse("2026-09-23T03:00:00Z");
  const old = new Date(now - QUIET_MS - 1000).toISOString();

  it("欠けている英語だけを訳し、条件付きで書き戻す（設備メモも番号で対応）", async () => {
    const p = base("a", { amenityNotes: { parking: "専用なし", elevator: "", smokingArea: "禁煙" } });
    const db = fakeDb([{ id: "a", status: "draft", updated_at: old, data: JSON.stringify(p) }]);
    const fetchMock = stubAnthropic({ amenityNotesEn: { "0": "No dedicated parking", "7": "No smoking" } });
    const r = await runEnglishFill(db, "key", now);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r.report[0].filled?.length).toBeGreaterThan(0);
    const saved = JSON.parse(String(db.writes[0][0]));
    expect(Object.values(saved.amenityNotesEn).filter(Boolean).length).toBeGreaterThan(0);
  });

  it("直近5分に更新された物件は触らない（編集中の保存と衝突させない）", async () => {
    const p = base("b", { amenityNotes: { parking: "専用なし" } });
    const db = fakeDb([{ id: "b", status: "draft", updated_at: new Date(now - 60_000).toISOString(), data: JSON.stringify(p) }]);
    const fetchMock = stubAnthropic({});
    const r = await runEnglishFill(db, "key", now);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r.report[0].skipped).toBe("recently_edited");
    expect(db.writes.length).toBe(0);
  });

  it("英語が揃っている物件は何もしない", async () => {
    const db = fakeDb([{ id: "c", status: "draft", updated_at: old, data: JSON.stringify(base("c")) }]);
    const fetchMock = stubAnthropic({});
    const r = await runEnglishFill(db, "key", now);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r.translated).toBe(0);
  });

  it("訳せなかったら書かず、理由を残す", async () => {
    const p = base("d", { amenityNotes: { parking: "専用なし" } });
    const db = fakeDb([{ id: "d", status: "draft", updated_at: old, data: JSON.stringify(p) }]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("overloaded", { status: 529 })));
    const r = await runEnglishFill(db, "key", now);
    expect(db.writes.length).toBe(0);
    expect(r.report[0].failure).toMatch(/^http 529/);
  });
});
