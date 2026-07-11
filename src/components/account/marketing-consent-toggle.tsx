"use client";

import { useState, useTransition } from "react";
import { updateMarketingConsentAction } from "@/lib/marketing-actions";

/**
 * マイページの配信設定トグル。特定電子メール法のオプトイン原則に沿って、
 * 既定はユーザーレコードの marketingConsent をそのまま表示するだけ（勝手にONにしない）。
 */
export default function MarketingConsentToggle({
  initialConsent,
  en,
}: {
  initialConsent: boolean;
  en: boolean;
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

  return (
    <div className="border border-line p-5">
      <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-2">
        {en ? "Email updates" : "お知らせメール"}
      </div>
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={consent}
          onChange={toggle}
          disabled={pending}
          className="mt-0.5 w-4 h-4 accent-accent"
        />
        <span className="text-[12px] text-muted leading-[1.7]">
          {en
            ? "Receive occasional emails about new locations and offers. You can unsubscribe anytime from a link in every email."
            : "新着ロケ地やお得な情報のメールを受け取ります。メール内のリンクからいつでも配信停止できます。"}
        </span>
      </label>
    </div>
  );
}
