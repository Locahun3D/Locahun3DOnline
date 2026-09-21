import { describe, it, expect } from "vitest";
import { parseStoredRadHeader, mapRangeIntoEntry } from "./zip-stored-entry";

/**
 * ビューアー用 ZIP の中の .rad を、範囲指定でそのまま配るための計算（2026-09-21）。
 * ここを取り違えると、公開ページ・埋め込み・編集のすべてで
 * 「Invalid RAD magic: 0x04034b50（＝ZIPの先頭）」になる（本番で発生）。
 */
function header({ name = "splat/0_scene.rad", size = 219983184, method = 0, extra = 0 } = {}) {
  const nameBytes = Buffer.from(name, "latin1");
  const head = Buffer.alloc(30 + nameBytes.length + extra);
  head.writeUInt32LE(0x04034b50, 0);
  head.writeUInt16LE(method, 8);
  head.writeUInt32LE(size, 18);
  head.writeUInt32LE(size, 22);
  head.writeUInt16LE(nameBytes.length, 26);
  head.writeUInt16LE(extra, 28);
  nameBytes.copy(head, 30);
  return new Uint8Array(head);
}

describe("ZIP の中の .rad を見つける", () => {
  it("無圧縮の1件目が .rad なら、位置と大きさを返す", () => {
    const e = parseStoredRadHeader(header());
    expect(e).toEqual({ name: "0_scene.rad", offset: 30 + "splat/0_scene.rad".length, size: 219983184 });
  });

  it("拡張フィールドのぶんだけ本体が後ろにずれる", () => {
    const e = parseStoredRadHeader(header({ extra: 12 }));
    expect(e?.offset).toBe(30 + "splat/0_scene.rad".length + 12);
  });

  it("圧縮されている・.rad でない・ZIPでない場合は扱わない", () => {
    expect(parseStoredRadHeader(header({ method: 8 }))).toBeNull();
    expect(parseStoredRadHeader(header({ name: "project.json" }))).toBeNull();
    expect(parseStoredRadHeader(new Uint8Array(40))).toBeNull();
    expect(parseStoredRadHeader(new Uint8Array(4))).toBeNull();
  });
});

describe("範囲の読み替え", () => {
  const entry = { name: "a.rad", offset: 60, size: 1000 };

  it("範囲指定が無ければ本体全体", () => {
    expect(mapRangeIntoEntry(entry, undefined)).toEqual({ offset: 60, length: 1000 });
  });

  it("先頭からの範囲は、ZIP の中の位置へずらす", () => {
    expect(mapRangeIntoEntry(entry, { offset: 0, length: 100 })).toEqual({ offset: 60, length: 100 });
    expect(mapRangeIntoEntry(entry, { offset: 500, length: 100 })).toEqual({ offset: 560, length: 100 });
  });

  it("本体の外にはみ出さない", () => {
    expect(mapRangeIntoEntry(entry, { offset: 900, length: 500 })).toEqual({ offset: 960, length: 100 });
    expect(mapRangeIntoEntry(entry, { offset: 1000, length: 10 })).toEqual({ offset: 1060, length: 0 });
  });

  it("末尾から数える指定にも対応する", () => {
    expect(mapRangeIntoEntry(entry, { suffix: 200 })).toEqual({ offset: 860, length: 200 });
    expect(mapRangeIntoEntry(entry, { suffix: 5000 })).toEqual({ offset: 60, length: 1000 });
  });
});
