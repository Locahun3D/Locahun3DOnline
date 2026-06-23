"use client";

/**
 * 3Dデータ販売の買い物カゴ（localStorage・クライアントのみ）。
 * TurboSquid風に複数物件/フロアのデータをまとめてカートに入れ、一括購入する。
 */

const KEY = "locahun3d:cart:v1";
const EVENT = "locahun3d-cart-change";

export interface CartItem {
  propertyId: string;
  splatItemIndex: number;
  title: string;
  label: string;
  price: number;
}

export function cartKey(propertyId: string, splatItemIndex: number): string {
  return `${propertyId}:${splatItemIndex}`;
}

export function getCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const arr = raw ? (JSON.parse(raw) as CartItem[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function save(items: CartItem[]): void {
  window.localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(EVENT));
}

export function isInCart(propertyId: string, splatItemIndex: number): boolean {
  const k = cartKey(propertyId, splatItemIndex);
  return getCart().some((i) => cartKey(i.propertyId, i.splatItemIndex) === k);
}

export function addToCart(item: CartItem): void {
  const items = getCart();
  const k = cartKey(item.propertyId, item.splatItemIndex);
  if (items.some((i) => cartKey(i.propertyId, i.splatItemIndex) === k)) return;
  items.push(item);
  save(items);
}

export function removeFromCart(propertyId: string, splatItemIndex: number): void {
  const k = cartKey(propertyId, splatItemIndex);
  save(getCart().filter((i) => cartKey(i.propertyId, i.splatItemIndex) !== k));
}

export function clearCart(): void {
  save([]);
}

export function cartCount(): number {
  return getCart().length;
}

/** カート変更を購読する（返り値で解除）。 */
export function onCartChange(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
