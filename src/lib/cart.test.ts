import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { addToCart, getCart, removeFromCart, restoreRemovedCartItem, reconcileCart, type CartItem } from "./cart";

const a: CartItem = { propertyId: "a", splatItemIndex: 0, title: "A", label: "1F", price: 100, license: "standard" };
const b: CartItem = { ...a, propertyId: "b", title: "B" };
beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("window", { localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) }, dispatchEvent: () => true });
});
afterEach(() => vi.unstubAllGlobals());

it("restores multiple removals without discarding items added afterwards", () => {
  addToCart(a); addToCart(b);
  removeFromCart("a", 0); removeFromCart("b", 0);
  addToCart({ ...a, propertyId: "c" });
  restoreRemovedCartItem({ item: b, index: 0 });
  restoreRemovedCartItem({ item: a, index: 0 });
  expect(getCart().map(i => i.propertyId)).toEqual(["a", "b", "c"]);
});
it("does not duplicate or overwrite a re-added item with a newer license", () => {
  addToCart({ ...a, license: "extended", price: 200 });
  restoreRemovedCartItem({ item: a, index: 0 });
  expect(getCart()).toEqual([{ ...a, license: "extended", price: 200 }]);
});
it("keeps newly added items outside an older in-flight price response", () => {
  addToCart(a); addToCart(b);
  reconcileCart([{ propertyId: "a", splatItemIndex: 0, price: 150, available: true }]);
  expect(getCart()).toEqual([{ ...a, price: 150 }, b]);
});
