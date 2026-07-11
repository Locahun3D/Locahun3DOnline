import { describe, it, expect } from "vitest";
import { computeAssetUsage } from "./asset-usage";

const props = [
  {
    id: "p1",
    cover: { src: "https://cdn/x/cover.jpg" },
    gallery: [{ src: "https://cdn/x/g1.jpg" }],
    splatUrl: "https://cdn/x/scene.ply",
  },
  {
    id: "p2",
    cover: { src: "https://cdn/x/cover.jpg" }, // reused
    gallery: [],
    splatUrl: "",
  },
  {
    // 現行エディタの主形態: 複数シーンは splatItems[] に入る（トップレベル
    // splatUrl/zipUrl は空のまま）。実機で「使用中なのに未使用と誤判定」
    // されたバグの回帰テスト。
    id: "p3",
    cover: { src: "" },
    gallery: [],
    splatUrl: "",
    zipUrl: "",
    blueprints: [{ label: "1F", url: "https://cdn/x/blueprint.jpg" }],
    splatItems: [
      {
        splatUrl: "https://cdn/x/atrium.zip",
        previewVideoUrl: "https://cdn/x/atrium-preview.mp4",
        downloadFileUrl: "https://cdn/x/atrium-dl.zip",
        downloadFiles: [{ url: "https://cdn/x/atrium-ply.zip" }],
      },
      {
        splatUrl: "https://cdn/x/cafe.zip",
        previewVideoUrl: "",
        downloadFileUrl: "",
        downloadFiles: [],
      },
    ],
  },
] as never[];

const assets = [
  { url: "https://cdn/x/cover.jpg" },
  { url: "https://cdn/x/g1.jpg" },
  { url: "https://cdn/x/scene.ply" },
  { url: "https://cdn/x/unused.jpg" },
  { url: "https://cdn/x/blueprint.jpg" },
  { url: "https://cdn/x/atrium.zip" },
  { url: "https://cdn/x/atrium-preview.mp4" },
  { url: "https://cdn/x/atrium-dl.zip" },
  { url: "https://cdn/x/atrium-ply.zip" },
  { url: "https://cdn/x/cafe.zip" },
] as never[];

describe("computeAssetUsage", () => {
  it("maps each asset url to the property ids that reference it", () => {
    const usage = computeAssetUsage(props, assets);
    expect(usage["https://cdn/x/cover.jpg"].sort()).toEqual(["p1", "p2"]);
    expect(usage["https://cdn/x/g1.jpg"]).toEqual(["p1"]);
    expect(usage["https://cdn/x/scene.ply"]).toEqual(["p1"]);
    expect(usage["https://cdn/x/unused.jpg"]).toBeUndefined();
  });

  it("finds references inside splatItems[] (multi-scene properties)", () => {
    const usage = computeAssetUsage(props, assets);
    expect(usage["https://cdn/x/blueprint.jpg"]).toEqual(["p3"]);
    expect(usage["https://cdn/x/atrium.zip"]).toEqual(["p3"]);
    expect(usage["https://cdn/x/atrium-preview.mp4"]).toEqual(["p3"]);
    expect(usage["https://cdn/x/atrium-dl.zip"]).toEqual(["p3"]);
    expect(usage["https://cdn/x/atrium-ply.zip"]).toEqual(["p3"]);
    expect(usage["https://cdn/x/cafe.zip"]).toEqual(["p3"]);
  });
});
