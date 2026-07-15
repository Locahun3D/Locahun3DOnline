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

/**
 * カート内アイテムの価格スナップショットを最新値へ同期し、販売終了/購入済みに
 * なったアイテムを除去する。localStorage のカートは価格を追加時点のまま保持
 * するため、管理側で価格変更や無料期間の開始/終了があると、表示中の合計金額と
 * 実際にサーバーで確定する金額がズレて見えるUXバグになっていた（決済金額自体は
 * サーバーが再取得するため安全だが、画面表示が古いまま購入に進んでしまう）。
 * `/cart` マウント時に最新情報へ同期するために使う。
 */
export function reconcileCart(
  latest: { propertyId: string; splatItemIndex: number; price: number; available: boolean }[],
): { changed: boolean; removed: CartItem[]; priceChanged: CartItem[] } {
  const current = getCart();
  const latestMap = new Map(
    latest.map((l) => [cartKey(l.propertyId, l.splatItemIndex), l]),
  );
  const removed: CartItem[] = [];
  const priceChanged: CartItem[] = [];
  const next: CartItem[] = [];

  for (const item of current) {
    const k = cartKey(item.propertyId, item.splatItemIndex);
    const l = latestMap.get(k);
    if (!l || !l.available) {
      removed.push(item);
      continue;
    }
    if (l.price !== item.price) {
      priceChanged.push({ ...item, price: l.price });
      next.push({ ...item, price: l.price });
    } else {
      next.push(item);
    }
  }

  const changed = removed.length > 0 || priceChanged.length > 0;
  if (changed) save(next);
  return { changed, removed, priceChanged };
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
