"use client";

import { useCallback, useState } from "react";
import EstimateSimulator from "@/components/demo/estimate-simulator";
import ContactForm from "@/components/contact-form";

/**
 * /contact/scan（製作側スキャン依頼）の本体。
 *
 * 概算シミュレーターとお問い合わせフォームを1つのクライアント境界に入れて、
 * **選択内容を持ったままフォームまで運ぶ**。
 * - シミュレーターの「詳細見積を依頼 →」は下のフォームへのアンカー（#scan-form）。
 *   ページ遷移すると選択が消えるため、/contact へ飛ばす旧挙動はここでは使わない。
 * - 選択内容は hidden で送り、サーバー側（contact-actions）が本文の先頭に足す。
 *   本文欄へ直接書き込まないのは、利用者の文章と混ざらないようにするためと、
 *   書いた後にシミュレーターを触られても内容が食い違わないようにするため。
 * - 送信経路は新設しない。既存の submitContactRequestAction（type="scan"）に乗せる。
 */
export default function ScanRequest({ en }: { en: boolean }) {
  const [summary, setSummary] = useState("");
  // ⚠ useState の setter は同一参照なので、そのまま渡すと
  //   EstimateSimulator 側の effect が毎レンダー走らない（意図どおり）。
  const handleEstimate = useCallback((s: string) => setSummary(s), []);

  return (
    <>
      <EstimateSimulator en={en} ctaHref="#scan-form" onEstimate={handleEstimate} />

      <section id="scan-form" className="mt-14 sm:mt-20 scroll-mt-20">
        <h2 className="serif text-[clamp(1.15rem,2vw,1.44rem)] font-bold leading-[1.35] mb-3">
          {en ? "Send us your request" : "この内容で依頼する"}
        </h2>
        <p className="text-[13px] text-muted leading-[1.9] mb-6">
          {en
            ? "Your selections above are attached to the message automatically. The estimate is a ballpark — we'll confirm the final quote after talking through the details."
            : "上で選んだ内容は、そのままお問い合わせ本文に添えて送信されます。金額は概算です。最終見積は内容をうかがったうえでご提示します。"}
        </p>

        {/* 送信前に「何が添付されるか」を本人にも見せる（データ販売の
            問い合わせと同じ考え方。運営にも同じ文字列が届く）。 */}
        {summary && (
          <div className="border border-accent/30 bg-accent/5 px-4 py-3.5 mb-6">
            <div className="mono text-[9.5px] tracking-[0.18em] uppercase text-accent/80 mb-2">
              {en ? "Attached to your message" : "本文に添付される内容"}
            </div>
            <pre className="text-[12px] text-ink leading-[1.9] whitespace-pre-wrap font-sans m-0">
              {summary}
            </pre>
          </div>
        )}

        <ContactForm type="scan" estimateSummary={summary} />
      </section>
    </>
  );
}
