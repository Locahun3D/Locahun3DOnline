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
] as never[];

const assets = [
  { url: "https://cdn/x/cover.jpg" },
  { url: "https://cdn/x/g1.jpg" },
  { url: "https://cdn/x/scene.ply" },
  { url: "https://cdn/x/unused.jpg" },
] as never[];

describe("computeAssetUsage", () => {
  it("maps each asset url to the property ids that reference it", () => {
    const usage = computeAssetUsage(props, assets);
    expect(usage["https://cdn/x/cover.jpg"].sort()).toEqual(["p1", "p2"]);
    expect(usage["https://cdn/x/g1.jpg"]).toEqual(["p1"]);
    expect(usage["https://cdn/x/scene.ply"]).toEqual(["p1"]);
    expect(usage["https://cdn/x/unused.jpg"]).toBeUndefined();
  });
});
