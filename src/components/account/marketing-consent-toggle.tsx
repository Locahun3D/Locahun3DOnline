"use client";

import { useState, useTransition } from "react";
import { updateMarketingConsentAction } from "@/lib/marketing-actions";

/**
 * マイページの配信設定トグル。特定電子メール法のオプトイン原則に沿って、
 * 既定はユーザーレコードの marketingConsent をそのまま表示するだけ（勝手にONにしない）。
 *
 * 未同意(初期OFF)の間は「おすすめ」ハイライト表示で目に留める(同意率2%改善施策)。
 * 一度ONにした後・もともとONの人には従来どおり静かな設定カードとして出す。
 * 表示位置も account-dashboard 側で未同意ならページ上部に置く。
 */
export default function MarketingConsentToggle({
  initialConsent,
  en,
  inline = false,
}: {
  initialConsent: boolean;
  en: boolean;
  /** 他のカードの中に入れる形。外側のカード枠・余白を持たない。 */
  inline?: boolean;
}) {
  const [consent, setConsent] = useState(initialConsent);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    const next = !consent;
    setConsent(next);
    startTransition(async () => {
      await updateMarketingConsentAction(next);
    });
  };

  const highlight = !initialConsent && !consent;

  return (
    <div
      className={
        // 請求書カードの中に置くときは枠を持たない（カードの入れ子を避ける）。
        // 未同意のハイライトも、カード内では上罫線＋見出し色だけで示す。
        inline
          ? "mt-4 pt-4 border-t border-[#e2e7ec]"
          : highlight
            ? "bg-[#eaf7fb] border border-[#1ea0c4]/50 p-5"
            : "bg-white border border-[#e2e7ec] p-5"
      }
    >
      <div className="flex items-center gap-2 mb-2">
        <div
          className={`mono text-[10px] tracking-[0.24em] uppercase ${
            highlight ? "text-[#1ea0c4]" : "text-[#7b8794]"
          }`}
        >
          {en ? "Early access news" : "新着ロケ地の先行案内"}
        </div>
        {highlight && (
          <span className="mono text-[9px] tracking-[0.14em] uppercase border border-[#1ea0c4]/50 text-[#1ea0c4] px-1.5 py-0.5">
            {en ? "Recommended" : "おすすめ"}
          </span>
        )}
      </div>
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={consent}
          onChange={toggle}
          disabled={pending}
          className="mt-0.5 w-4 h-4 accent-[#1ea0c4]"
        />
        <span
          className={`text-[12px] leading-[1.7] ${
            highlight ? "text-[#3d4852]" : "text-[#7b8794]"
          }`}
        >
          {en
            ? "Get an email when new 3DGS locations go live, plus campaign news. Unsubscribe anytime with one click from any email."
            : "新しい3DGS物件の公開やキャンペーンをメールでお知らせします。メール内のリンクからいつでも1クリックで配信停止できます。"}
        </span>
      </label>
    </div>
  );
}
