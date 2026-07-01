"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getCart,
  removeFromCart,
  clearCart,
  onCartChange,
  type CartItem,
} from "@/lib/cart";
import { useLocale, useHref } from "@/components/locale-provider";

export default function CartClient() {
  const en = useLocale() === "en";
  const lh = useHref();
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const sync = () => setItems(getCart());
    sync();
    return onCartChange(sync);
  }, []);

  const total = items.reduce((n, i) => n + i.price, 0);

  const checkout = async () => {
    if (!agreed) {
      alert(en ? "Please agree to the purchase terms" : "購入規約に同意してください");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/purchase/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({
            propertyId: i.propertyId,
            splatItemIndex: i.splatItemIndex,
          })),
        }),
      });
      const data = (await res.json()) as {
        url?: string;
        ok?: boolean;
        error?: string;
      };
      if (res.status === 401) {
        window.location.href = lh("/sign-in?redirect=/cart");
        return;
      }
      if (data.url) {
        window.location.href = data.url;
      } else if (data.ok) {
        clearCart();
        window.location.href = lh("/dashboard/purchases");
      } else {
        alert(data.error || (en ? "Purchase failed" : "購入処理に失敗しました"));
      }
    } catch {
      alert(en ? "A network error occurred" : "通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  if (!mounted) return null;

  if (items.length === 0) {
    return (
      <div className="border border-line p-10 text-center">
        <p className="text-sm opacity-50 mb-4">{en ? "Your cart is empty." : "カートは空です。"}</p>
        <Link
          href={lh("/properties")}
          className="mono text-[11px] tracking-[0.22em] uppercase border border-accent text-accent px-4 py-2 hover:bg-accent hover:text-bg transition"
        >
          {en ? "Browse locations →" : "物件を探す →"}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {items.map((i) => (
          <div
            key={`${i.propertyId}:${i.splatItemIndex}`}
            className="border border-line flex items-center gap-4 p-4"
          >
            <div className="flex-1 min-w-0">
              <Link
                href={lh(`/properties/${i.propertyId}`)}
                className="text-sm font-medium hover:text-accent transition"
              >
                {i.title || i.propertyId}
              </Link>
              {i.label && (
                <span className="ml-2 mono text-[10px] tracking-[0.14em] uppercase border border-line px-1.5 py-0.5 opacity-60">
                  {i.label}
                </span>
              )}
              <div className="mono text-[10px] opacity-40 mt-1">{en ? "3DGS data" : "3DGS データ"}</div>
            </div>
            <div className="mono text-[12px] tracking-[0.14em] whitespace-nowrap">
              ¥{i.price.toLocaleString(en ? "en-US" : "ja-JP")}
            </div>
            <button
              type="button"
              onClick={() => removeFromCart(i.propertyId, i.splatItemIndex)}
              className="mono text-[10px] uppercase border border-line px-2 py-1 text-muted hover:border-red-400 hover:text-red-400 transition"
            >
              {en ? "Remove" : "削除"}
            </button>
          </div>
        ))}
      </div>

      <div className="border border-accent/40 bg-[#0a0906] p-5 flex flex-wrap items-center gap-4">
        <div className="flex-1">
          <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-40">
            {en ? `${items.length} item(s) total` : `合計 ${items.length} 点`}
          </div>
          <div className="serif text-2xl text-accent">
            ¥{total.toLocaleString(en ? "en-US" : "ja-JP")}{" "}
            <span className="mono text-[10px] opacity-40">{en ? "tax incl." : "税込"}</span>
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer text-[11px] opacity-70">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="w-4 h-4 accent-accent"
          />
          {en ? (
            <>
              I agree to the{" "}
              <Link href={lh("/terms/data-download")} target="_blank" className="underline">
                3D data purchase terms
              </Link>
            </>
          ) : (
            <>
              <Link href={lh("/terms/data-download")} target="_blank" className="underline">
                3Dデータ購入規約
              </Link>
              に同意
            </>
          )}
        </label>
        <button
          type="button"
          onClick={checkout}
          disabled={loading || !agreed}
          className="px-6 py-3 mono text-[11px] tracking-[0.24em] uppercase border border-accent text-accent hover:bg-accent hover:text-bg transition disabled:opacity-40 disabled:cursor-wait"
        >
          {loading ? (en ? "Processing..." : "処理中...") : en ? "Buy all" : "まとめて購入"}
        </button>
      </div>
    </div>
  );
}
