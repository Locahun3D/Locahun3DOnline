"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getCart,
  removeFromCart,
  clearCart,
  onCartChange,
  reconcileCart,
  type CartItem,
} from "@/lib/cart";
import { dataLicenseLabel, dataLicenseDesc } from "@/lib/schemas";
import { useLocale, useHref } from "@/components/locale-provider";

export default function CartClient() {
  const en = useLocale() === "en";
  const lh = useHref();
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [mounted, setMounted] = useState(false);
  // 価格変更/販売終了の再検証結果（マウント時の1回だけ表示するバナー）。
  const [notice, setNotice] = useState<{ removedCount: number; priceChangedCount: number } | null>(null);

  // ⚠ react-hooks/set-state-in-effect はここでは誤検知。
  //    カートの実体は localStorage。SSR では読めないのでマウント後に同期する。
  //    外部ストアの購読開始と初回同期であり、effect 以外に置き場所が無い。
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    const sync = () => setItems(getCart());
    sync();
    return onCartChange(sync);
  }, []);

  // マウント時に現在の価格・販売可否をサーバーへ照会し、古いスナップショット
  // (localStorage)を最新化する。価格変更や販売終了に気付かず決済へ進む
  // UXバグを防ぐ（決済金額自体はサーバーが再確定するため安全だが、表示が
  // 古いままだとユーザーが混乱する）。
  useEffect(() => {
    const cart = getCart();
    if (cart.length === 0) return;
    (async () => {
      try {
        const res = await fetch("/api/cart/prices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: cart.map((i) => ({
              propertyId: i.propertyId,
              splatItemIndex: i.splatItemIndex,
              license: i.license,
            })),
          }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          items: { propertyId: string; splatItemIndex: number; price: number; available: boolean }[];
        };
        const { changed, removed, priceChanged } = reconcileCart(data.items);
        if (changed) {
          setItems(getCart());
          setNotice({ removedCount: removed.length, priceChangedCount: priceChanged.length });
        }
      } catch {
        // 照会失敗時は何もしない（表示中のスナップショットのまま。決済時の
        // サーバー側再検証で最終的な安全性は担保される）。
      }
    })();
     
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
            license: i.license,
          })),
          // サーバー側でも必須検証され、同意時刻が購入レコードに記録される。
          agreedTerms: agreed,
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

  const noticeBanner = notice && (
    <div className="border border-amber-400/40 bg-amber-400/5 px-4 py-3 text-[12.5px] text-amber-300 flex items-start justify-between gap-3">
      <span>
        {en
          ? `Cart updated: ${notice.removedCount > 0 ? `${notice.removedCount} item(s) no longer available` : ""}${notice.removedCount > 0 && notice.priceChangedCount > 0 ? ", " : ""}${notice.priceChangedCount > 0 ? `${notice.priceChangedCount} item(s) price changed` : ""}.`
          : `カートを最新情報に更新しました：${notice.removedCount > 0 ? `${notice.removedCount}件が購入不可（購入済み/販売終了）のため削除` : ""}${notice.removedCount > 0 && notice.priceChangedCount > 0 ? "、" : ""}${notice.priceChangedCount > 0 ? `${notice.priceChangedCount}件の価格が変更` : ""}。`}
      </span>
      <button
        type="button"
        onClick={() => setNotice(null)}
        className="mono text-[10px] uppercase opacity-60 hover:opacity-100 shrink-0"
      >
        {en ? "Dismiss" : "閉じる"}
      </button>
    </div>
  );

  if (items.length === 0) {
    return (
      <div className="space-y-4">
        {noticeBanner}
        <div className="border border-line p-10 text-center">
          <p className="text-sm opacity-50 mb-4">{en ? "Your cart is empty." : "カートは空です。"}</p>
          <Link
            href={lh("/properties")}
            className="mono text-[11px] tracking-[0.22em] uppercase border border-accent text-accent px-4 py-2 hover:bg-accent hover:text-bg transition"
          >
            {en ? "Browse locations →" : "物件を探す →"}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {noticeBanner}
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
              <div className="mono text-[10px] opacity-40 mt-1">
                {en ? "3DGS data" : "3DGS データ"}
                {i.license && ` ・ ${dataLicenseLabel(i.license, en ? "en" : "ja")}`}
              </div>
              {/* 決済直前にも、そのライセンスで何ができるのかを明示する。
                  ここまで名称だけで来ると、買った後で「使えない用途だった」に
                  なりかねない。 */}
              {i.license && (
                <p className="mt-1 text-[10.5px] leading-relaxed text-muted max-w-[52ch]">
                  {dataLicenseDesc(i.license, en ? "en" : "ja")}
                </p>
              )}
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
