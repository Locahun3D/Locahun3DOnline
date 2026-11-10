"use client";

/**
 * インディーライセンスの対象者であることの自己申告（2026-11-11）。
 * インディーを選んだ時だけ出す。サーバー（/api/purchase, /api/purchase/cart）でも
 * indieEligible === true を必須に検証し、申告時刻を購入レコードに残す。
 */
export function IndieEligibilityCheck({
  checked,
  onChange,
  en,
  className = "",
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  en: boolean;
  className?: string;
}) {
  return (
    <label data-indie-eligibility className={`flex items-start gap-2 cursor-pointer text-[13px] text-muted ${className}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 mt-0.5 accent-accent shrink-0"
      />
      <span>
        {en
          ? "I am an individual, or my business's revenue in the past 12 months is under JPY 10 million (Indie license)."
          : "個人、または直近1年の売上が1,000万円未満の事業者です（インディーライセンスの対象）"}
      </span>
    </label>
  );
}
