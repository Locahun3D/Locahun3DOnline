import { expect, it } from "vitest";
import { propertySchema } from "./schemas";
import { publishedEnglishUpdates } from "./published-english-updates";

const initial = () => propertySchema.parse({ id: "test", category: "studio", title: "公開前", cover: { src: "/cover.jpg", alt: "全景" }, gallery: [{ src: "/a.jpg", alt: "部屋A" }, { src: "/b.jpg", alt: "部屋B" }], splatItems: [{ id: "scan-a", label: "内部" }, { id: "scan-b", label: "外部" }] });

it("keeps generated English without replacing Japanese input made while publishing", () => {
  const before = initial();
  const current = { ...before, title: "処理中の追加入力" };
  const saved = { ...before, titleEn: "Before publication", summaryEn: "Generated summary" };
  expect(publishedEnglishUpdates(before, current, saved)).toEqual([
    { path: "titleEn", value: "Before publication" },
    { path: "summaryEn", value: "Generated summary" },
  ]);
  expect(current.title).toBe("処理中の追加入力");
});

it("never replaces English edited by the user while publication was pending", () => {
  const before = initial();
  expect(publishedEnglishUpdates(before, { ...before, titleEn: "My edit" }, { ...before, titleEn: "Generated" })).toEqual([]);
});

it("retains translations of unchanged duplicate image rows", () => {
  const before = initial();
  before.gallery = [before.gallery[0], { ...before.gallery[0] }];
  const saved = { ...before, gallery: before.gallery.map(g => ({ ...g, altEn: "Room A" })) };
  expect(publishedEnglishUpdates(before, before, saved)).toEqual([
    { path: "gallery.0.altEn", value: "Room A" },
    { path: "gallery.1.altEn", value: "Room A" },
  ]);
});

it("matches reordered scans and images by identity, not old row indexes", () => {
  const before = initial();
  const current = { ...before, gallery: [...before.gallery].reverse(), splatItems: [...before.splatItems].reverse(), cover: { ...before.cover, src: "/replacement.jpg" } };
  const saved = { ...before, cover: { ...before.cover, altEn: "Old cover" }, gallery: before.gallery.map(g => ({ ...g, altEn: g.src === "/a.jpg" ? "Room A" : "Room B" })), splatItems: before.splatItems.map(s => ({ ...s, labelEn: s.id === "scan-a" ? "Interior" : "Exterior" })) };
  expect(publishedEnglishUpdates(before, current, saved)).toEqual([
    { path: "gallery.0.altEn", value: "Room B" },
    { path: "gallery.1.altEn", value: "Room A" },
    { path: "splatItems.0.labelEn", value: "Exterior" },
    { path: "splatItems.1.labelEn", value: "Interior" },
  ]);
});
