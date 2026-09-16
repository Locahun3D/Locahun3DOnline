import { describe, it, expect } from "vitest";
import { propertySchema, DATA_SALE_PRICE, TOKEN_COST_VALUES } from "@/lib/schemas";

const base = { id: "p1", category: "studio", cover: {} };

describe("tokenCost scale", () => {
  it("accepts every value in TOKEN_COST_VALUES", () => {
    for (const n of TOKEN_COST_VALUES) {
      expect(propertySchema.parse({ ...base, tokenCost: n }).tokenCost).toBe(n);
    }
  });

  it("maps the legacy 5 to 20 so stored domes survive list()", () => {
    expect(propertySchema.parse({ ...base, tokenCost: 5 }).tokenCost).toBe(20);
  });

  it("keeps the legacy 3 as 3 (meaning changed, value still valid)", () => {
    expect(propertySchema.parse({ ...base, tokenCost: 3 }).tokenCost).toBe(3);
  });

  it("rejects a value outside the scale", () => {
    expect(propertySchema.safeParse({ ...base, tokenCost: 4 }).success).toBe(false);
  });

  it("prices every scale step per D-010", () => {
    expect(DATA_SALE_PRICE).toEqual({
      1: 100_000, 2: 250_000, 3: 400_000, 10: 800_000, 20: 1_200_000,
    });
  });
});
