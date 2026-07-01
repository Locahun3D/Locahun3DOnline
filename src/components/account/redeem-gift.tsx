"use client";

import { useActionState } from "react";
import { redeemGiftCodeAction, type RedeemState } from "@/lib/gift-actions";
import { GIFT_BUCKET_LABEL } from "@/lib/gift-schema";
import { useLocale } from "@/components/locale-provider";

export default function RedeemGift() {
  const en = useLocale() === "en";
  const [state, formAction, pending] = useActionState<RedeemState, FormData>(
    redeemGiftCodeAction,
    undefined,
  );

  return (
    <div className="border border-line p-5">
      <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-3">
        {en ? "Redeem a gift code" : "ギフトコードを引き換え"}
      </div>
      <form action={formAction} className="flex flex-wrap gap-2">
        <input
          name="code"
          type="text"
          placeholder="LH3D-XXXX-XXXX"
          autoComplete="off"
          className="flex-1 min-w-[150px] bg-neutral-300 text-black border border-line px-2.5 py-1.5 text-[13px] mono tracking-[0.08em] focus:outline-none focus:border-accent transition placeholder:text-black/40"
        />
        <button
          type="submit"
          disabled={pending}
          className="mono text-[10px] tracking-[0.2em] uppercase border border-accent text-accent px-4 py-1.5 hover:bg-accent hover:text-bg transition disabled:opacity-50"
        >
          {pending ? (en ? "Checking…" : "確認中…") : en ? "Redeem" : "引き換え"}
        </button>
      </form>

      {state?.ok === false && (
        <p className="mt-2 text-[12px] text-red-400">{state.error}</p>
      )}
      {state?.ok === true && (
        <p className="mt-2 text-[12px] text-green-400">
          {en
            ? `✓ Granted ${state.granted} tokens (${GIFT_BUCKET_LABEL[state.bucket]}).`
            : `✓ ${state.granted} トークン（${GIFT_BUCKET_LABEL[state.bucket]}）を付与しました。`}
        </p>
      )}
    </div>
  );
}
