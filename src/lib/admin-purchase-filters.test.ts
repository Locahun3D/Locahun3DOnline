import { describe, expect, it } from "vitest";
import { filterAdminPurchases } from "./admin-purchase-filters";
const purchases = [
  { id: "paid", status: "completed", priceYen: 5000, propertyId: "a", propertyTitle: "撮影室", userEmail: "one@example.test", itemLabel: "標準" },
  { id: "waiting", status: "pending", priceYen: 200000, propertyId: "a", propertyTitle: "撮影室", userEmail: "one@example.test", itemLabel: "拡張" },
  { id: "returned", status: "refunded", priceYen: 8000, propertyId: "b", propertyTitle: "倉庫", userEmail: "two@example.test", itemLabel: "" },
  { id: "cancelled", status: "cancelled", priceYen: 10000, propertyId: "b", propertyTitle: "倉庫", userEmail: "two@example.test", itemLabel: "" },
];
describe("admin purchase visibility", () => {
  it("defaults to completed purchases only", () => {
    expect(filterAdminPurchases(purchases, {}).map(p => p.id)).toEqual(["paid"]);
  });
  it("adds pending only on request and never overrides property/query filters", () => {
    expect(filterAdminPurchases(purchases, { showPending: true }).map(p => p.id)).toEqual(["paid", "waiting"]);
    expect(filterAdminPurchases(purchases, { showPending: true, property: "b" })).toEqual([]);
    expect(filterAdminPurchases(purchases, { showPending: true, q: "標準" }).map(p => p.id)).toEqual(["paid"]);
  });
  it("keeps explicit status choices and the all-states choice separate from pending visibility", () => {
    expect(filterAdminPurchases(purchases, { status: "" }).map(p => p.id)).toEqual(["paid", "returned", "cancelled"]);
    expect(filterAdminPurchases(purchases, { status: "refunded" }).map(p => p.id)).toEqual(["returned"]);
    expect(filterAdminPurchases(purchases, { status: "", showPending: true })).toHaveLength(4);
  });
});
