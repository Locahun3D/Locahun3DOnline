import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { AssetRepoImpl as JsonFileAssetRepo } from "./store";
import type { Asset } from "./schemas";

let dir: string;
let file: string;
let repo: JsonFileAssetRepo;

const sample: Asset = {
  id: "a1",
  kind: "image",
  status: "ready",
  label: "Cover",
  filename: "cover.jpg",
  ext: ".jpg",
  r2Key: "assets/image/a1-cover.jpg",
  url: "https://cdn.test/assets/image/a1-cover.jpg",
  size: 1234,
  contentType: "image/jpeg",
  uploadedAt: "2026-06-18T00:00:00.000Z",
  // zod の .default() は入力では省略可だが z.infer(出力型)では必須になる。
  thumbnailUrl: "",
  tags: [],
};

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "assets-"));
  file = path.join(dir, "assets.json");
  repo = new JsonFileAssetRepo(file);
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("JsonFileAssetRepo", () => {
  it("returns [] when the file does not exist", async () => {
    expect(await repo.list()).toEqual([]);
  });
  it("upserts then gets", async () => {
    await repo.upsert(sample);
    expect(await repo.get("a1")).toMatchObject({ id: "a1", label: "Cover" });
  });
  it("filters list by kind", async () => {
    await repo.upsert(sample);
    await repo.upsert({ ...sample, id: "a2", kind: "splat", ext: ".ply" });
    const splats = await repo.list({ kind: "splat" });
    expect(splats.map((a) => a.id)).toEqual(["a2"]);
  });
  it("removes", async () => {
    await repo.upsert(sample);
    await repo.remove("a1");
    expect(await repo.get("a1")).toBeNull();
  });
});
