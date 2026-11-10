"use client";

import { useEffect } from "react";
import { USE_PURPOSES, isUsePurpose, type UsePurpose } from "@/lib/use-purpose";

export type IntakeValue = {
  usePurpose: UsePurpose | "";
  buyerCompany: string;
  marketingConsent: boolean;
};

export const EMPTY_INTAKE: IntakeValue = { usePurpose: "", buyerCompany: "", marketingConsent: false };

const STORAGE_KEY = "l3d-purchase-intake";

/** ダウンロード・購入の直前に聞く「用途・会社名・案内メール」（2026-10-13 本人指示）。
    用途と会社名は同じ端末の次回に引き継ぐ。案内メールの同意は毎回オフから始める。 */
export function PurchaseIntakeFields({
  value,
  onChange,
  en,
  className = "",
}: {
  value: IntakeValue;
  onChange: (next: IntakeValue) => void;
  en: boolean;
  className?: string;
}) {
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<IntakeValue> | null;
      if (!saved) return;
      onChange({
        usePurpose: isUsePurpose(saved.usePurpose) ? saved.usePurpose : "",
        buyerCompany: typeof saved.buyerCompany === "string" ? saved.buyerCompany.slice(0, 120) : "",
        marketingConsent: false,
      });
    } catch {
      /* 保存が読めない端末では空のまま */
    }
    // 初回だけ読む。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = (patch: Partial<IntakeValue>) => {
    const next = { ...value, ...patch };
    onChange(next);
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ usePurpose: next.usePurpose, buyerCompany: next.buyerCompany }),
      );
    } catch {
      /* 保存できなくても購入は進められる */
    }
  };

  const field =
    "w-full min-h-[44px] bg-bg border border-line px-3 py-2 text-[14px] text-ink focus:border-accent focus:outline-none";

  return (
    <div data-purchase-intake className={`grid gap-3 sm:grid-cols-2 ${className}`}>
      <label className="block min-w-0">
        <span className="block text-[12px] text-muted mb-1">
          {en ? "How will you use it? (required)" : "ご利用の用途（必須）"}
        </span>
        <select
          value={value.usePurpose}
          onChange={(e) => update({ usePurpose: isUsePurpose(e.target.value) ? e.target.value : "" })}
          className={field}
        >
          <option value="">{en ? "Choose one" : "選択してください"}</option>
          {USE_PURPOSES.map((p) => (
            <option key={p.key} value={p.key}>
              {en ? p.en : p.ja}
            </option>
          ))}
        </select>
      </label>
      <label className="block min-w-0">
        <span className="block text-[12px] text-muted mb-1">
          {en ? "Company / team (optional)" : "会社名・団体名（任意）"}
        </span>
        <input
          type="text"
          value={value.buyerCompany}
          maxLength={120}
          autoComplete="organization"
          onChange={(e) => update({ buyerCompany: e.target.value })}
          className={field}
        />
      </label>
      <label className="flex items-start gap-2 cursor-pointer text-[12px] text-muted sm:col-span-2 min-h-[44px] sm:min-h-0">
        <input
          type="checkbox"
          checked={value.marketingConsent}
          onChange={(e) => update({ marketingConsent: e.target.checked })}
          className="w-4 h-4 mt-0.5 accent-accent shrink-0"
        />
        <span>
          {en
            ? "Email me when new 3D data is released (you can unsubscribe at any time)"
            : "新しい3Dデータの公開をメールで受け取る（いつでも停止できます）"}
        </span>
      </label>
    </div>
  );
}
