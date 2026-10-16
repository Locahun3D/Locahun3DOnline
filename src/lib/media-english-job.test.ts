import { describe, it, expect } from "vitest";
import { deflateRawSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { readZipEntry, collectSceneMedia, sceneImageKey, nextMediaTask, runMediaEnglish } from "./media-english-job";

/** 1ファイルだけの ZIP を作る（method 8 = deflate）。 */
function zipOf(name: string, text: string): ArrayBuffer {
  const data = Buffer.from(text, "utf8");
  const comp = deflateRawSync(data);
  const nameB = Buffer.from(name, "utf8");
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameB.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10); central.writeUInt32LE(comp.length, 20); central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameB.length, 28); central.writeUInt32LE(0, 42);
  const cdOffset = 30 + nameB.length + comp.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(46 + nameB.length, 12); eocd.writeUInt32LE(cdOffset, 16);
  const all = Buffer.concat([local, nameB, comp, central, nameB, eocd]);
  return all.buffer.slice(all.byteOffset, all.byteOffset + all.length);
}

const project = {
  version: 4,
  layers: [
    { type: "event", name: "搬入口", eventGuide: "ここから機材を搬入\n台車可", eventImage: "data:image/png;base64,AAAA", eventImageName: "搬入口の写真" },
    { type: "path", name: "控室", pathLabel: "控室" },
    { type: "cube", name: "Cube 1" },
  ],
};

describe("media-english-job", () => {
  it("ZIP から project.json を取り出せる", async () => {
    const raw = await readZipEntry(zipOf("project.json", JSON.stringify(project)), "project.json");
    expect(JSON.parse(new TextDecoder().decode(raw!)).layers).toHaveLength(3);
  });

  it("日本語の注釈と写真ピンの画像だけを集める", () => {
    const m = collectSceneMedia(project);
    expect(m.texts.sort()).toEqual(["ここから機材を搬入\n台車可", "控室", "搬入口", "搬入口の写真"].sort());
    expect(m.images).toEqual([{ key: sceneImageKey("data:image/png;base64,AAAA"), dataUrl: "data:image/png;base64,AAAA" }]);
  });

  it("画像の鍵の計算がビューアーと同じ", () => {
    // offline-viewer.html の window._sceneImageKey と同じ式であることを、実物の関数を取り出して確かめる。
    const html = readFileSync("public/viewer/offline-viewer.html", "utf8");
    const src = html.match(/window\._sceneImageKey=function\(d\)\{[\s\S]*?\n\};/)![0];
    const w: { _sceneImageKey?: (d: string) => string } = {};
    new Function("window", src)(w);
    for (const d of ["data:image/png;base64,AAAA", "x".repeat(20000)]) expect(w._sceneImageKey!(d)).toBe(sceneImageKey(d));
  });

  it("次に訳すのは、まだ訳していない図面、次に保存し直したシーン", () => {
    expect(nextMediaTask({ blueprints: [{ url: "/api/r2/plan.png", textEnFor: "/api/r2/plan.png" }, { url: "/api/r2/plan2.jpg" }] })).toEqual({ kind: "plan", index: 1 });
    expect(nextMediaTask({ blueprints: [{ url: "/api/r2/a.pdf" }], splatItems: [{ splatUrl: "/api/r2/s-project.zip", sceneTextEn: { source: "/api/r2/old.zip", texts: {}, images: {} } }] }))
      .toEqual({ kind: "scene", index: 0 });
    expect(nextMediaTask({ splatItems: [{ splatUrl: "/api/r2/s.rad" }] })).toBeNull();
  });

  it("図面を訳して英語欄だけを足す（更新日時は進めない）", async () => {
    const row = { id: "p1", updated_at: "2026-01-01T00:00:00.000Z", data: JSON.stringify({ title: "x", blueprints: [{ label: "1F", url: "/api/r2/plan.png" }] }) };
    const writes: unknown[][] = [];
    const db = {
      prepare(sql: string) {
        const st = {
          bind: (...v: unknown[]) => { if (sql.startsWith("UPDATE")) writes.push(v); return st; },
          all: async () => ({ results: [row] }),
          run: async () => ({ meta: { changes: 1 } }),
        };
        return st;
      },
    };
    const bucket = { get: async () => ({ arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer, httpMetadata: { contentType: "image/png" } }) };
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({ content: [{ type: "text", text: '[{"ja":"控室","en":"Green room"}]' }] }))) as typeof fetch;
    try {
      const r = await runMediaEnglish(db, bucket, "k", Date.parse("2026-02-01"));
      expect(r.report).toEqual([{ id: "p1", kind: "plan", index: 0, pairs: 1 }]);
      const saved = JSON.parse(writes[0][0] as string);
      expect(saved.blueprints[0]).toMatchObject({ textEn: [{ ja: "控室", en: "Green room" }], textEnFor: "/api/r2/plan.png" });
      expect(writes[0].slice(1)).toEqual(["p1", row.updated_at, row.data]);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
