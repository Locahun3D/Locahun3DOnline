import { describe, it, expect } from "vitest";
import { deflateRawSync } from "node:zlib";
import { readStoredRadEntry, readProjectJsonAfter } from "./zip-stored-entry";

/**
 * 本体（.rad）の直後にある project.json を読む（2026-09-21）。
 * これを読まずに本体だけで開くと、方角合わせ（回転）・初期視点・シーン名が消えて保存される
 * （歌舞伎町ゲートの 53.6° が 0° に戻った）。
 */
function local(name: string, data: Buffer, method = 0, flags = 0) {
  const body = method === 8 ? deflateRawSync(data) : data;
  const n = Buffer.from(name, "latin1");
  const h = Buffer.alloc(30);
  h.writeUInt32LE(0x04034b50, 0);
  h.writeUInt16LE(flags, 6);
  h.writeUInt16LE(method, 8);
  h.writeUInt32LE(body.length, 18);
  h.writeUInt32LE(data.length, 22);
  h.writeUInt16LE(n.length, 26);
  return Buffer.concat([h, n, body]);
}
const project = JSON.stringify({ version: 4, projectName: "ShinjukuKabukiGate", layers: [{ id: 1, type: "splat", rot: { x: 0, y: 53.6, z: 0 } }] });
const zip = (method = 0, name = "project.json", flags = 0) =>
  Buffer.concat([local("splat/0_scene.rad", Buffer.alloc(4096, 7)), local(name, Buffer.from(project), method, flags)]);
const reader = (buf: Buffer) => async (offset: number, length: number) =>
  offset >= buf.length ? null : new Uint8Array(buf.subarray(offset, Math.min(buf.length, offset + length)));

describe("本体の直後の project.json", () => {
  it("無圧縮で入っていれば、そのまま読める（パイプラインの ZIP の形）", async () => {
    const buf = zip(0), entry = (await readStoredRadEntry(reader(buf)))!;
    const text = await readProjectJsonAfter(reader(buf), entry);
    expect(JSON.parse(text!).layers[0].rot.y).toBe(53.6);
  });

  it("deflate で圧縮されていても読める", async () => {
    const buf = zip(8), entry = (await readStoredRadEntry(reader(buf)))!;
    expect(JSON.parse((await readProjectJsonAfter(reader(buf), entry))!).projectName).toBe("ShinjukuKabukiGate");
  });

  it("別の名前・データ記述子つき・大きすぎるものは読まない（従来どおりに戻す）", async () => {
    for (const buf of [zip(0, "readme.txt"), zip(0, "project.json", 0x08)]) {
      const entry = (await readStoredRadEntry(reader(buf)))!;
      expect(await readProjectJsonAfter(reader(buf), entry)).toBeNull();
    }
    const buf = zip(0), entry = (await readStoredRadEntry(reader(buf)))!;
    expect(await readProjectJsonAfter(reader(buf), entry, 10)).toBeNull();
  });

  it("後ろに何もなければ null", async () => {
    const buf = local("splat/0_scene.rad", Buffer.alloc(64, 1)), entry = (await readStoredRadEntry(reader(buf)))!;
    expect(await readProjectJsonAfter(reader(buf), entry)).toBeNull();
  });
});
