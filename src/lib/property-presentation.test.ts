import { expect, it } from "vitest";
import { googleMapsUrl, publicPropertyEmail, propertyTitleSegments } from "./property-presentation";

it("keeps the crossing name in word-sized chunks without losing original title text", () => {
  const title = "渋谷スクランブル交差点";
  const parts = propertyTitleSegments(title);
  expect(parts.join("")).toBe(title);
  expect(parts).toContain("交差点");
  expect(parts).not.toContain("点");
});
it("preserves explicit line breaks and generic titles", () => {
  const title = "Warehouse A\nVeryLongUnbrokenPropertyTitle";
  expect(propertyTitleSegments(title).join("")).toBe(title);
});
it("removes only Shibuya's public email presentation, not another listing's email", () => {
  expect(publicPropertyEmail("shibuyasq", "owner@example.test")).toBe("");
  expect(publicPropertyEmail("studio", "studio@example.test")).toBe("studio@example.test");
});
it("builds Google Maps from real coordinates, with address as fallback only", () => {
  expect(googleMapsUrl({ lat: 35.659, lng: 139.7 }, "東京都渋谷区")).toBe("https://www.google.com/maps/search/?api=1&query=35.659%2C139.7");
  expect(googleMapsUrl(null, "東京都渋谷区")).toBe("https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("東京都渋谷区"));
  expect(googleMapsUrl(null, "")).toBe("");
});
