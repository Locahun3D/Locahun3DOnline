"use client";

import { useState, useTransition } from "react";
import { useLocale } from "@/components/locale-provider";
import { acceptNdaAction } from "@/lib/auth-actions";

/**
 * NDA（秘密保持契約）同意モーダル。
 * 「NDAに同意する →」ボタンから開き、規約全文 + チェックボックスで
 * 明示同意を取ってから、既存の acceptNdaAction（ndaAcceptedAt を記録して
 * /account?nda=1 へリダイレクト）を呼ぶ。新しいデータは持たず、既存の
 * User.ndaAcceptedAt フィールド・既存アクションをそのまま再利用する。
 */
export default function NdaConsentModal({
  trigger,
}: {
  trigger?: React.ReactNode;
}) {
  const en = useLocale() === "en";
  const [open, setOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mono text-[10px] tracking-[0.2em] uppercase border border-[#8a5f10] text-[#8a5f10] px-4 py-2 hover:bg-[#8a5f10] hover:text-white transition"
      >
        {trigger ?? (en ? "Agree to NDA →" : "NDAに同意する →")}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="nda-modal-title"
            className="bg-white text-[#14181c] border border-[#e2e7ec] max-w-xl w-full max-h-[calc(85vh/var(--z))] overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 mb-4">
              <h2 id="nda-modal-title" className="text-[16px] font-bold">
                {en ? "NDA — Non-Disclosure Agreement" : "NDA — 秘密保持契約"}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                aria-label={en ? "Close" : "閉じる"}
                className="text-[#7b8794] hover:text-[#14181c] transition text-lg leading-none"
              >
                ✕
              </button>
            </div>

            <div className="text-[13px] leading-[1.85] text-[#14181c]/90 space-y-3 mb-5">
              {en ? (
                <>
                  <p>
                    By agreeing to this NDA, you acknowledge and accept the following terms
                    regarding confidential locations and restricted 3DGS scenes made available
                    through ロケハン3D オンライン (&quot;the Service&quot;).
                  </p>
                  <p>
                    <strong>1. Purpose.</strong> This agreement protects location owners and
                    production partners by restricting access to sensitive filming locations
                    (e.g. private backyards, non-public studios) and NDA-limited 3DGS scenes to
                    verified Production accounts only.
                  </p>
                  <p>
                    <strong>2. Scope of protected information.</strong> Confidential locations,
                    NDA-limited 3DGS scenes, floor plans, access instructions, and any other
                    materials marked as restricted within the Service.
                  </p>
                  <p>
                    <strong>3. Prohibited actions.</strong> You may not redistribute, publish,
                    screenshot for external use, resell, or share access credentials to
                    confidential content with any third party not covered by this agreement.
                    You may not use the information for purposes other than legitimate location
                    scouting for your own productions.
                  </p>
                  <p>
                    <strong>4. Duration.</strong> This agreement remains in effect for as long
                    as your account retains Production status and active access to the Service,
                    and survives termination of your account with respect to information already
                    accessed.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    本NDAへの同意により、ロケハン3D オンライン（以下「本サービス」）が提供する
                    機密ロケ地・NDA限定3DGSシーンに関する以下の条件を確認し、同意したものと
                    みなします。
                  </p>
                  <p>
                    <strong>1. 目的。</strong>
                    本契約は、倉庫裏・非公開スタジオ等の機密性の高い撮影ロケ地、およびNDA限定の
                    3DGSシーンへのアクセスを、承認済みの制作会社アカウントに限定することで、
                    物件所有者および制作パートナーの利益を保護することを目的とします。
                  </p>
                  <p>
                    <strong>2. 保護対象となる情報の範囲。</strong>
                    機密ロケ地、NDA限定の3DGSシーン、図面、アクセス方法、その他本サービス内で
                    非公開・限定と示された一切の資料。
                  </p>
                  <p>
                    <strong>3. 禁止行為。</strong>
                    本契約の対象外の第三者への再配布・公開・外部利用目的でのスクリーンショット
                    撮影・転売・アクセス権限の共有を禁止します。また、自社の正当なロケハン目的
                    以外での情報利用を禁止します。
                  </p>
                  <p>
                    <strong>4. 有効期間。</strong>
                    本契約は、アカウントが制作会社ステータスを保持し本サービスへの有効な
                    アクセス権を有する間、効力を持続します。アカウント終了後も、既に閲覧済みの
                    情報に関する義務は存続します。
                  </p>
                </>
              )}
            </div>

            <label className="flex items-start gap-2.5 text-[13px] mb-5 cursor-pointer">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 shrink-0"
              />
              <span>
                {en
                  ? "I have read and agree to the terms of this NDA."
                  : "上記のNDA条項を読み、同意します。"}
              </span>
            </label>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="mono text-[10px] tracking-[0.2em] uppercase border border-[#e2e7ec] text-[#7b8794] px-4 py-2 hover:border-[#14181c] hover:text-[#14181c] transition"
              >
                {en ? "Cancel" : "キャンセル"}
              </button>
              <button
                type="button"
                disabled={!agreed || pending}
                onClick={() => {
                  startTransition(async () => {
                    await acceptNdaAction();
                  });
                }}
                className="mono text-[10px] tracking-[0.2em] uppercase border border-[#1ea0c4] bg-[#1ea0c4] text-white px-4 py-2 hover:opacity-90 transition disabled:opacity-40 disabled:pointer-events-none"
              >
                {pending ? (en ? "Submitting…" : "送信中…") : en ? "Agree & continue" : "同意して進む"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
