import { expect, it, vi } from "vitest";
import { propertySchema } from "@/lib/schemas";

const { getProperty } = vi.hoisted(() => ({ getProperty: vi.fn() }));
vi.mock("@/lib/store", () => ({ repo: { get: getProperty } }));
vi.mock("@/lib/dal", () => ({ getCurrentUser: async () => null }));
vi.mock("@/lib/purchases", () => ({ purchaseRepo: { hasPurchased: async () => false } }));
import { POST } from "./route";

it("returns current included files and the resolved license without storage URLs", async () => {
  getProperty.mockResolvedValue(propertySchema.parse({ id: "test", category: "warehouse", cover: { src: "", alt: "" }, splatItems: [{ id: "floor", forSale: true, downloadFileUrl: "/private/scan.rad", downloadFileFormat: "RAD", downloadFileSizeMb: 125, license: "extended", salePrice: 1500 }] }));
  const response = await POST(new Request("http://localhost/api/cart/prices", { method: "POST", body: JSON.stringify({ items: [{ propertyId: "test", splatItemIndex: 0 }] }) }));
  const data = await response.json();
  expect(data.items[0]).toMatchObject({ available: true, license: "extended", purchaseContents: [{ format: "RAD", sizeMb: 125, date: "", kind: "file" }] });
  expect(JSON.stringify(data)).not.toContain("private");
});
