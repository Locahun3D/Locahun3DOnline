import { describe, it, expect } from "vitest";
import { r2KeyOf, sceneSizeFixes, runSceneSizeFix } from "./scene-size-job";

const MB = 1024 * 1024;

describe("sceneSizeFixes — 記録が1MB以下の項目だけ R2 の実物に合わせる", () => {
  it("仮ファイルの大きさで登録された 3DGS を実サイズに直す", async () => {
    const fixes = await sceneSizeFixes(
      [{ label: "エントランス", splatUrl: "/api/r2/assets/splat/E_pc-KiraraHoleEntrance.zip", sizeMb: 1 }],
      async (key) => (key === "assets/splat/E_pc-KiraraHoleEntrance.zip" ? 159279627 : null),
    );
    expect(fixes).toEqual([{ index: 0, field: "sizeMb", from: 1, to: 152 }]);
  });

  it("オンライン編集後は入れ物（project.zip）の sizeMb を触らず、streamSizeMb だけ直す", async () => {
    const fixes = await sceneSizeFixes(
      [{ splatUrl: "/api/r2/assets/splat/wf_abc-project.zip", sizeMb: 1, streamUrl: "/api/r2/assets/splat/X-Main.zip", streamSizeMb: 1 }],
      async () => 200 * MB,
    );
    expect(fixes).toEqual([{ index: 0, field: "streamSizeMb", from: 1, to: 200 }]);
  });

  it("正しく記録されたもの・R2 以外・実物が見つからないものは問い合わせも書き換えもしない", async () => {
    const asked: string[] = [];
    const fixes = await sceneSizeFixes(
      [
        { splatUrl: "/api/r2/assets/splat/ok.zip", sizeMb: 300 },
        { splatUrl: "https://example.com/a.zip", sizeMb: 1 },
        { splatUrl: "/api/r2/assets/splat/gone.zip", sizeMb: 1 },
        { splatUrl: "", sizeMb: 0 },
      ],
      async (key) => { asked.push(key); return null; },
    );
    expect(fixes).toEqual([]);
    expect(asked).toEqual(["assets/splat/gone.zip"]);
  });

  it("本当に 1MB 未満の小さいファイルはそのまま（1MB 表示が正しい）", async () => {
    expect(await sceneSizeFixes([{ splatUrl: "/api/r2/assets/splat/tiny.zip", sizeMb: 1 }], async () => 300 * 1024)).toEqual([]);
  });

  it("r2KeyOf は絶対 URL・クエリ付きにも対応し、R2 以外は null", () => {
    expect(r2KeyOf("https://locahun3d.com/api/r2/assets/splat/a%20b.zip?x=1")).toBe("assets/splat/a b.zip");
    expect(r2KeyOf("/uploads/p/a.zip")).toBeNull();
  });
});

describe("runSceneSizeFix — 条件付きで書き、容量の欄以外は変えない", () => {
  it("物件と素材の記録を直す", async () => {
    const prop = { id: "kirara-hole", title: "キララホール", updatedAt: "2026-10-13T16:30:00.000Z",
      splatItems: [{ id: "s1", label: "エントランス", splatUrl: "/api/r2/assets/splat/E.zip", sizeMb: 1 }] };
    const row = { id: "kirara-hole", updated_at: prop.updatedAt, data: JSON.stringify(prop) };
    const asset = { id: "a1", data: JSON.stringify({ kind: "splat", status: "ready", r2Key: "assets/splat/E.zip", size: 66491 }) };
    const writes: { sql: string; args: unknown[] }[] = [];
    const db = {
      prepare(sql: string) {
        const stmt = {
          args: [] as unknown[],
          bind(...v: unknown[]) { stmt.args = v; return stmt; },
          async all() { return { results: sql.includes("FROM properties") ? [row] : [asset] }; },
          async run() { writes.push({ sql, args: stmt.args }); return { meta: { changes: 1 } }; },
        };
        return stmt;
      },
    };
    const r = await runSceneSizeFix(db, { head: async () => ({ size: 159279627 }) }, Date.parse("2026-10-14T00:00:00.000Z"));
    expect(r.report).toEqual([{ id: "kirara-hole", scene: "エントランス", field: "sizeMb", from: 1, to: 152 }]);
    const propWrite = writes.find((w) => w.sql.startsWith("UPDATE properties"))!;
    const saved = JSON.parse(propWrite.args[0] as string);
    expect(saved.splatItems[0].sizeMb).toBe(152);
    expect(saved.title).toBe("キララホール");
    expect(propWrite.args.slice(2)).toEqual(["kirara-hole", row.updated_at, row.data]);
    const assetWrite = writes.find((w) => w.sql.startsWith("UPDATE assets"))!;
    expect(JSON.parse(assetWrite.args[0] as string).size).toBe(159279627);
  });
});
