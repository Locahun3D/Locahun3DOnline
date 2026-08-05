import Link from "next/link";
import { getLocale } from "@/lib/i18n/server";
import { localizedHref } from "@/lib/i18n/dictionaries";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: locale === "en" ? "Listing Data Revenue Share Terms｜Locahun 3D" : "掲載データ販売分配規約｜ロケハン3D",
  };
}

/**
 * 掲載スタジオ（自ら掲載依頼し、当社が現地スキャンした物件）向けの
 * データ販売収益分配規約。
 *
 * ⚠ 持ち込みスキャン規約(/terms/submission)とは対象が異なる。
 *   - 持ち込みスキャン: 第三者(提出者)が自ら撮影して提出 → 提出者へ分配（30/50%）
 *   - 本規約: スタジオ自身が掲載依頼し、当社が現地スキャン → スタジオへ分配（20%）
 *   持ち込みスキャン経由の物件には本規約は適用されない（提出者への分配のみで
 *   完結し、施設側への二重の分配は行わない。2026-08-02の方針）。
 */
export default async function ListingRevenueSharePage() {
  const locale = await getLocale();
  const en = locale === "en";
  if (en) return <ListingRevenueShareEN locale={locale} />;
  return (
    <div className="theme-online max-w-3xl mx-auto px-6 pt-6 sm:pt-12 pb-12 sm:pb-32">
      <div className="chapter-rule">
        <span className="opacity-60">TERMS</span>
        <span>Listing Data Revenue Share Terms</span>
        <span className="flex-1 h-px bg-current opacity-25" />
      </div>

      <header className="mb-12">
        <h1 className="serif text-[clamp(1.8rem,3.4vw,2.8rem)] font-bold">
          掲載データ販売分配規約
        </h1>
        <p className="text-[14px] text-muted mt-3">
          KWI株式会社（以下「当社」）が提供する「ロケハン3D オンライン」において、<Link href={localizedHref("/contact/listing", locale)} className="text-accent hover:underline">掲載依頼</Link>を通じてご自身の物件（スタジオ・ロケーション施設）を掲載されたオーナー様（以下「掲載者」）向けの、3Dデータ販売時の収益分配に関する規約です。
        </p>
      </header>

      <div className="prose-terms space-y-10 text-[14px] leading-[1.85]">
        <section>
          <h2 className="serif text-lg mb-4">第1条（適用対象）</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>本規約は、掲載者が自ら物件を提供し、当社が現地で3Dスキャンを実施して掲載した物件（以下「対象物件」）を対象とします。</li>
            <li>
              <Link href={localizedHref("/terms/submission", locale)} className="text-accent hover:underline">
                持ち込みスキャン規約
              </Link>
              に基づき、掲載者以外の第三者（提出者）が撮影・提出したデータをもとに掲載された物件には、本規約は適用されません。当該物件のデータ販売収益は、持ち込みスキャン規約に定める提出者への分配のみで完結し、掲載者（施設側）への別枠の分配は行いません。
            </li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">第2条（分配率）</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>対象物件の3Dデータ（PLY/OBJ等）の販売により生じた売上（消費税・決済手数料を除いた金額）のうち、<strong>20%</strong>を掲載者へ分配します。</li>
            <li>本条の分配率は、当社と掲載者が別途書面で個別に合意した場合、その合意を優先します。</li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">第3条（対象範囲）</h2>
          <p className="opacity-80">
            分配の対象は、対象物件の<strong>3Dデータそのものの販売</strong>（PLY/OBJ等のダウンロード販売）による売上に限られます。3DGSウォークスルーの閲覧（トークン消費）による収益、サブスクリプション料金、ホスティング商品の利用料等は、分配の対象に含まれません。
          </p>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">第4条（精算）</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>分配金は四半期ごとに精算します。各四半期（1〜3月・4〜6月・7〜9月・10〜12月）の末日を締め日とし、締め日の属する月の翌月末日までに掲載者の指定口座へお支払いします。</li>
            <li>1回あたりの精算額が<strong>¥10,000未満</strong>の場合は次回精算へ繰り越します。繰越は、対象の売上が生じた四半期の末日から<strong>2年間</strong>を限度とし、当該期間内に¥10,000に達しない場合、以後の請求権は消滅します。</li>
            <li>掲載者が個人事業主である場合、分配金の支払いにあたり法令に基づく源泉徴収税および復興特別所得税を控除いたします。掲載者が法人である場合、源泉徴収は行いません。</li>
            <li>振込手数料は当社が負担します。</li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">第5条（非独占）</h2>
          <p className="opacity-80">
            本規約に基づく分配は、対象物件を本サービスに掲載していることを条件とするものであり、掲載者が同一施設について当社以外の第三者にも3Dスキャンおよびそのデータ販売を許諾することを妨げません。
          </p>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">第6条（本サービス利用規約との関係）</h2>
          <p className="opacity-80">
            本規約に定めのない事項については、<Link href={localizedHref("/terms/service", locale)} className="text-accent hover:underline">利用規約</Link>の定めによります。本規約と利用規約の内容が異なる場合、対象物件のデータ販売分配に関する事項については本規約が優先します。
          </p>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">第7条（規約の変更）</h2>
          <p className="opacity-80">
            当社は、必要と判断した場合、本規約を変更することがあります。変更を行う場合、当社は、変更後の規約の内容および効力発生時期を、効力発生時期の相当期間前までに本ページへの掲示その他適切な方法により周知します。変更後の規約は、既に生じた売上に対応する分配率には遡及して適用しません。
          </p>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">第8条（準拠法・管轄裁判所）</h2>
          <p className="opacity-80">
            本規約の解釈にあたっては日本法を準拠法とします。本規約に関して紛争が生じた場合には、東京地方裁判所を第一審の専属的合意管轄裁判所とします。
          </p>
        </section>

        <div className="border-t border-line pt-6 mt-10">
          <p className="mono text-[11px] opacity-40">
            制定日: 2026年8月2日<br />
            改定日: 2026年8月4日（第7条の規約変更手続きを事前周知方式に変更）<br />
            ロケハン3D（運営：KWI株式会社）
          </p>
        </div>
      </div>

      <div className="mt-10 text-center">
        <Link
          href={localizedHref("/contact/listing", locale)}
          className="mono text-[10px] tracking-[0.22em] uppercase opacity-50 hover:opacity-100 transition"
        >
          ← 掲載依頼に戻る
        </Link>
      </div>
    </div>
  );
}

function ListingRevenueShareEN({ locale }: { locale: "ja" | "en" }) {
  return (
    <div className="theme-online max-w-3xl mx-auto px-6 pt-6 sm:pt-12 pb-12 sm:pb-32">
      <div className="chapter-rule">
        <span className="opacity-60">TERMS</span>
        <span>Listing Data Revenue Share Terms</span>
        <span className="flex-1 h-px bg-current opacity-25" />
      </div>

      <header className="mb-12">
        <h1 className="serif text-[clamp(1.8rem,3.4vw,2.8rem)] font-bold">
          Listing Data Revenue Share Terms
        </h1>
        <p className="text-[14px] text-amber-400/80 mt-3 border border-amber-400/30 bg-amber-400/5 px-3 py-2 rounded">
          This English text is a reference translation. The Japanese version is the
          legally binding document and prevails in case of any discrepancy.
        </p>
        <p className="text-[14px] text-muted mt-3">
          These terms govern revenue sharing on 3D data sales for property owners (&quot;Listers&quot;)
          who list their own studio or location facility on &quot;Locahun 3D Online&quot;, provided by
          KWI Inc. (&quot;we&quot;, &quot;us&quot;), through the{" "}
          <Link href={localizedHref("/contact/listing", locale)} className="text-accent hover:underline">
            listing request
          </Link>{" "}
          process.
        </p>
      </header>

      <div className="prose-terms space-y-10 text-[14px] leading-[1.85]">
        <section>
          <h2 className="serif text-lg mb-4">Article 1 (Scope)</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>These terms apply to properties (&quot;Target Properties&quot;) that a Lister provided themselves and that we scanned on site for listing.</li>
            <li>
              These terms do not apply to properties listed based on data captured and submitted by a third party (Submitter) under the{" "}
              <Link href={localizedHref("/terms/submission", locale)} className="text-accent hover:underline">
                Scan Submission Agreement
              </Link>
              . Revenue from data sales for such properties is settled solely through the Submitter&apos;s share under that agreement; no separate share is paid to the Lister (facility) in that case.
            </li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">Article 2 (Revenue share)</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>Of the revenue generated from sales of a Target Property&apos;s 3D data (PLY/OBJ etc.), net of consumption tax and payment processing fees, <strong>20%</strong> is paid to the Lister.</li>
            <li>Where we and the Lister separately agree a different share in writing, that agreement prevails.</li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">Article 3 (Scope of revenue)</h2>
          <p className="opacity-80">
            Revenue sharing applies only to sales of the <strong>3D data itself</strong> (PLY/OBJ downloads) for the Target Property. It does not apply to revenue from walkthrough viewing (token consumption), subscription fees, or Hosting Product fees.
          </p>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">Article 4 (Settlement)</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>Revenue share is settled quarterly. Each quarter (Jan–Mar, Apr–Jun, Jul–Sep, Oct–Dec) closes on its last day, and payment is made to the Lister&apos;s designated bank account by the end of the following month.</li>
            <li>If a settlement amount is under <strong>¥10,000</strong>, it carries over to the next settlement. Carryover is limited to <strong>2 years</strong> from the end of the quarter in which the underlying sale occurred; any amount that has not reached ¥10,000 within that period is forfeited.</li>
            <li>Where the Lister is a sole proprietor, payments are made net of withholding tax and the special reconstruction income tax as required by law. No withholding applies where the Lister is a corporation.</li>
            <li>We bear the bank transfer fee.</li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">Article 5 (Non-exclusive)</h2>
          <p className="opacity-80">
            The revenue share under these terms is conditioned on the Target Property being listed on the Service, and does not prevent the Lister from also permitting other third parties to scan the same facility or sell 3D data of it.
          </p>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">Article 6 (Relationship to the Terms of Service)</h2>
          <p className="opacity-80">
            Matters not covered by these terms are governed by our{" "}
            <Link href={localizedHref("/terms/service", locale)} className="text-accent hover:underline">
              Terms of Service
            </Link>
            . Where these terms and the Terms of Service conflict on a matter relating to revenue sharing for Target Properties, these terms prevail.
          </p>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">Article 7 (Changes to these terms)</h2>
          <p className="opacity-80">
            We may change these terms when we deem it necessary. When making changes, we will announce the revised terms and their effective date a reasonable period in advance by posting on this page or by other appropriate means. Revised terms do not retroactively apply to the revenue share for sales that have already occurred.
          </p>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">Article 8 (Governing law &amp; jurisdiction)</h2>
          <p className="opacity-80">
            These terms are governed by the laws of Japan. The Tokyo District Court shall have exclusive jurisdiction as the court of first instance for any disputes relating to these terms.
          </p>
        </section>

        <div className="border-t border-line pt-6 mt-10">
          <p className="mono text-[11px] opacity-40">
            Established: August 2, 2026<br />
            Revised: August 4, 2026 (changed Article 7 to an advance-notice amendment procedure)<br />
            Locahun 3D (operated by KWI Inc.)
          </p>
        </div>
      </div>

      <div className="mt-10 text-center">
        <Link
          href={localizedHref("/contact/listing", locale)}
          className="mono text-[10px] tracking-[0.22em] uppercase opacity-50 hover:opacity-100 transition"
        >
          ← Back to listing request
        </Link>
      </div>
    </div>
  );
}
