"use client";

export default function PendingPurchasesToggle({ checked }: { checked: boolean }) {
  return (
    <label className="inline-flex items-center gap-2 text-[12px] min-h-[44px] cursor-pointer">
      <input type="checkbox" name="pending" value="1" defaultChecked={checked}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="accent-accent" />
      処理中を表示
    </label>
  );
}
