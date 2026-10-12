// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import NextDownloads from "./next-downloads";
import type { DataSaleEntry } from "@/lib/data-catalog";

const entry = (over: Partial<DataSaleEntry>): DataSaleEntry => ({
  propertyId: "p1", propertyTitle: "新宿 歌舞伎町ゲート", sceneIndex: 0, sceneId: "s", sceneLabel: "",
  area: "東京23区", prefecture: "東京都", city: "新宿区", category: "street", price: 0, free: true,
  licenses: ["editorial"], formats: ["PLY"], sizeMb: 100, scannedAt: "2026-09-20",
  cover: { src: "/c.jpg", alt: "" }, href: "/properties/p1#scene-0", ...over,
});

describe("NextDownloads — 受け取り直後に次のデータを見せる", () => {
  it("受け取り済みのシーンは出さず、残りが無ければ何も描かない", () => {
    const html = renderToStaticMarkup(
      createElement(NextDownloads, { entries: [entry({})], purchasedKeys: new Set(["p1:0"]), locale: "ja" }),
    );
    expect(html).toBe("");
  });
  it("残りを無料表示つきで並べ、一覧へのリンクを置く", () => {
    const html = renderToStaticMarkup(
      createElement(NextDownloads, {
        entries: [entry({}), entry({ propertyId: "p2", propertyTitle: "スタジオ", price: 200000, free: false })],
        purchasedKeys: new Set(),
        locale: "en",
      }),
    );
    expect(html).toContain("/en/data");
    expect(html).toContain("Free");
    expect(html).toContain("200,000");
  });
});
