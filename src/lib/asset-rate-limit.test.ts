import { describe, it, expect } from "vitest";
import { allowAssetDownload } from "./asset-rate-limit";

describe("allowAssetDownload", () => {
  it("allows a handful then blocks the same user+asset", () => {
    const userId = `user-${Math.random()}`;
    const key = `props/${Math.random()}/scene.rad`;
    // First 5 allowed, 6th+ blocked (RATE_MAX = 5).
    const results = Array.from({ length: 7 }, () => allowAssetDownload(userId, key));
    expect(results.slice(0, 5)).toEqual([true, true, true, true, true]);
    expect(results[5]).toBe(false);
    expect(results[6]).toBe(false);
  });

  it("tracks per asset key independently", () => {
    const userId = `user-${Math.random()}`;
    for (let i = 0; i < 5; i++) allowAssetDownload(userId, "scene-a.rad");
    expect(allowAssetDownload(userId, "scene-a.rad")).toBe(false); // a exhausted
    expect(allowAssetDownload(userId, "scene-b.rad")).toBe(true); // b fresh
  });

  it("tracks per user independently", () => {
    const key = `scene-${Math.random()}.rad`;
    for (let i = 0; i < 5; i++) allowAssetDownload("user-a", key);
    expect(allowAssetDownload("user-a", key)).toBe(false); // user-a exhausted
    expect(allowAssetDownload("user-b", key)).toBe(true); // user-b fresh
  });
});
