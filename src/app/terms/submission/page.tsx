import Link from "next/link";
import { getLocale } from "@/lib/i18n/server";
import { localizedHref } from "@/lib/i18n/dictionaries";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: locale === "en" ? "Scan Submission Agreement" : "持ち込みスキャン規約｜ロケハン3D",
  };
}

/**
 * 持ち込みスキャン（分配）プログラムの正式規約。
 * これまで /submit-scan のフォームに「正式な規約は整備中です」という注記があった
 * だけで、実際にお金が動く仕組み（四半期精算・分配率・源泉徴収）を定める文書が
 * 存在しなかった（2026-08-02 リーガルチェック準備で発見）。
 * 数値（分配率・精算日・繰越期間等）は本人からの指定値。締め日・支払日のみ
 * 「おすすめで」と一任されたため一般的な商習慣（四半期末締め翌月末払い）を採用—
 * 弁護士確認時にここだけは変更の可能性がある前提で読むこと。
 */
export default async function SubmissionTermsPage() {
  const locale = await getLocale();
  const en = locale === "en";
  if (en) return <SubmissionTermsEN locale={locale} />;
  return (
    <div className="theme-online max-w-3xl mx-auto px-6 pt-6 sm:pt-12 pb-12 sm:pb-32">
      <div className="chapter-rule">
        <span className="opacity-60">TERMS</span>
        <span>Scan Submission Agreement</span>
        <span className="flex-1 h-px bg-current opacity-25" />
      </div>

      <header className="mb-12">
        <h1 className="serif text-[clamp(1.8rem,3.4vw,2.8rem)] font-bold">
          持ち込みスキャン規約
        </h1>
        <p className="text-[14px] text-muted mt-3">
          KWI株式会社（以下「当社」）が提供する「ロケハン3D オンライン」の持ち込みスキャン（分配）プログラム（以下「本プログラム」）に関する規約です。<Link href={localizedHref("/submit-scan", locale)} className="text-accent hover:underline">申請フォーム</Link>からの応募をもって、本規約に同意したものとみなします。
        </p>
      </header>

      <div className="prose-terms space-y-10 text-[14px] leading-[1.85]">
        <section>
          <h2 className="serif text-lg mb-4">第1条（定義）</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>「提出者」とは、本プログラムを通じて自ら撮影した3Dスキャンデータ（サンプル画像を含む、以下「提出データ」）を当社に提供する個人または法人を指します。</li>
            <li>「対象施設」とは、提出データの撮影対象となった施設・場所を指します。</li>
            <li>「成立」とは、当社が対象施設の運営者等から掲載・販売の許諾を取得し、提出データが本サービスの物件として実際に販売可能な状態になることを指します。</li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">第2条（応募資格）</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>本プログラムには、日本国内に居住する個人（未成年者を含みます。ただし未成年者は法定代理人の同意を得るものとします）、または日本法人が応募できます。</li>
            <li>分配金の受け取りには、提出者本人（法人の場合は当該法人）名義の銀行口座が必要です。</li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">第3条（審査と非公開預かり）</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>当社は、提出データを審査のうえ、対象施設の運営者等から掲載・販売の許諾取得を試みます。許諾の取得は当社が対象施設に直接連絡して行う場合と、提出者自身が取得して当社に取り次ぐ場合の双方があります（分配率への影響は第5条）。</li>
            <li>許諾が得られるまでの間、提出データは非公開で取り扱われます。審査・権利調整に必要な範囲での閲覧・複製を除き、第三者に開示することはありません。</li>
            <li>許諾が得られなかった場合、当社は提出データ（サンプル画像を含む）を遅滞なく削除します。</li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">第4条（利用許諾）</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>成立した提出データについて、提出者は当社に対し、本サービスにおける販売・掲載・プロモーション目的での複製・改変・公衆送信その他必要な利用を行う<strong>独占的な利用許諾</strong>を付与します。提出データの著作権は提出者に留保されます。</li>
            <li>提出者は、当社および当社から適法に利用許諾を受けた第三者（本データの購入者等）による提出データの利用について、著作者人格権を行使しないものとします。ただし、提出者の名誉・声望を著しく害する改変については、この限りではありません。</li>
            <li>独占的利用許諾の期間中、提出者は当社の事前の書面による承諾なく、提出データを自ら販売し、または当社以外の第三者に利用許諾することはできません。</li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">第5条（分配率）</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>提出データの販売により生じた売上（消費税・決済手数料を除いた金額）のうち、次の割合を提出者へ分配します。
              <ul className="mt-3 space-y-2 border-l-2 border-line pl-4">
                <li>対象施設の許諾取得を<strong>当社が行った</strong>場合 — <strong>30%</strong></li>
                <li>対象施設の許諾取得を<strong>提出者自身が行い、当社に取り次いだ</strong>場合 — <strong>50%</strong></li>
              </ul>
            </li>
            <li>いずれに該当するかは、成立時に当社が提出者へ通知します。</li>
            <li>本条の分配率は、当社と提出者が別途書面で個別に合意した場合、その合意を優先します。</li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">第6条（精算）</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>
              分配金は四半期ごとに精算します。各四半期（1〜3月・4〜6月・7〜9月・10〜12月）の末日を締め日とし、
              <strong>締め日の属する月の翌月末日までに</strong>提出者の指定口座へお支払いします。
              {/* ⚠ 締め日・支払日は本人から「おすすめで」と一任された唯一の数値。
                  一般的な商習慣（四半期末締め翌月末払い）を採用しているが、
                  他の数値（30%/50%・2年・源泉徴収対象等）と異なり本人の確定指示ではない。
                  弁護士確認時に変更されうる前提で扱うこと。 */}
            </li>
            <li>1回あたりの精算額が<strong>¥10,000未満</strong>の場合は次回精算へ繰り越します。繰越は、対象の売上が生じた四半期の末日から<strong>2年間</strong>を限度とし、当該期間内に¥10,000に達しない場合、以後の請求権は消滅します。</li>
            <li>提出者が個人（フリーランスを含みます）である場合、分配金の支払いにあたり法令に基づく源泉徴収税および復興特別所得税を控除いたします。控除後の金額をお支払いします。</li>
            <li>振込手数料は当社が負担します。</li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">第7条（取り下げ）</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>提出者は、成立前であればいつでも申請を取り下げることができます。取り下げがあった場合、当社は提出データを遅滞なく削除します。</li>
            <li>成立後の取り下げ（掲載停止・データ削除の申し出）についても、当社はこれに応じます。ただし、取り下げ以前に生じた売上に対応する分配金の支払い、および取り下げ時点で既に締結済みの第三者への利用許諾（データ購入者等）には影響しません。</li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">第8条（提出者の表明保証）</h2>
          <p className="opacity-80 mb-3">提出者は、当社に対し、以下を表明し保証します。</p>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>提出データは提出者自らが撮影したものであり、撮影禁止区域への立ち入り等、法令または施設の利用規則に違反する方法で取得したものではないこと。</li>
            <li>提出データは第三者の著作権・商標権・肖像権・プライバシーその他の権利を侵害しないこと。</li>
            <li>提出データについて、当社に本規約に基づく利用許諾を付与する正当な権原を有すること。</li>
          </ol>
          <p className="opacity-80 mt-3">
            前項の表明保証に反したことに起因して当社または第三者に損害が生じた場合、提出者は自己の責任と費用においてこれを賠償するものとします。
          </p>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">第9条（禁止事項）</h2>
          <p className="opacity-80 mb-3">提出者は、本プログラムの利用にあたり、以下の行為をしてはなりません。</p>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>虚偽の情報を申請すること</li>
            <li>第三者が撮影したデータを自らのものとして提出すること</li>
            <li>成立前の提出データ（サンプル画像を含む）を、当社の許諾なく第三者に開示・提供すること</li>
            <li>本プログラムを通じて知り得た対象施設の非公開情報を、正当な理由なく第三者に開示すること</li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">第10条（反社会的勢力の排除）</h2>
          <p className="opacity-80">
            提出者は、自らが暴力団、暴力団員、暴力団関係企業、総会屋その他これらに準ずる者（以下「反社会的勢力」）に該当しないこと、および反社会的勢力と資金提供その他を通じて関与していないことを表明し、保証します。当社は、提出者が本条に違反した場合、催告なく本規約に基づく契約を解除できるものとします。
          </p>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">第11条（本サービス利用規約との関係）</h2>
          <p className="opacity-80">
            本規約に定めのない事項については、<Link href={localizedHref("/terms/service", locale)} className="text-accent hover:underline">利用規約</Link>の定めによります。本規約と利用規約の内容が異なる場合、本プログラムに関する事項については本規約が優先します。
          </p>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">第12条（規約の変更）</h2>
          <p className="opacity-80">
            当社は、必要と判断した場合、本規約を変更することがあります。変更を行う場合、当社は、変更後の規約の内容および効力発生時期を、効力発生時期の相当期間前までに本ページへの掲示その他適切な方法により周知します。変更後の規約は、既に成立した提出データの分配率には遡及して適用しません。
          </p>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">第13条（準拠法・管轄裁判所）</h2>
          <p className="opacity-80">
            本規約の解釈にあたっては日本法を準拠法とします。本規約に関して紛争が生じた場合には、東京地方裁判所を第一審の専属的合意管轄裁判所とします。
          </p>
        </section>

        <div className="border-t border-line pt-6 mt-10">
          <p className="mono text-[11px] opacity-40">
            制定日: 2026年8月2日<br />
            改定日: 2026年8月4日（第12条の規約変更手続きを事前周知方式に変更）<br />
            ロケハン3D（運営：KWI株式会社）
          </p>
        </div>
      </div>

      <div className="mt-10 text-center">
        <Link
          href={localizedHref("/submit-scan", locale)}
          className="mono text-[10px] tracking-[0.22em] uppercase opacity-50 hover:opacity-100 transition"
        >
          ← 申請フォームに戻る
        </Link>
      </div>
    </div>
  );
}

function SubmissionTermsEN({ locale }: { locale: "ja" | "en" }) {
  return (
    <div className="theme-online max-w-3xl mx-auto px-6 pt-6 sm:pt-12 pb-12 sm:pb-32">
      <div className="chapter-rule">
        <span className="opacity-60">TERMS</span>
        <span>Scan Submission Agreement</span>
        <span className="flex-1 h-px bg-current opacity-25" />
      </div>

      <header className="mb-12">
        <h1 className="serif text-[clamp(1.8rem,3.4vw,2.8rem)] font-bold">
          Scan Submission Agreement
        </h1>
        <p className="text-[14px] text-amber-400/80 mt-3 border border-amber-400/30 bg-amber-400/5 px-3 py-2 rounded">
          This English text is a reference translation. The Japanese version is the
          legally binding agreement and prevails in case of any discrepancy.
        </p>
        <p className="text-[14px] text-muted mt-3">
          These terms govern the Scan Submission (revenue-share) Program (the
          &quot;Program&quot;) offered by KWI Inc. (&quot;we&quot;, &quot;us&quot;) as part of
          &quot;Locahun 3D Online&quot;. By applying through the{" "}
          <Link href={localizedHref("/submit-scan", locale)} className="text-accent hover:underline">
            application form
          </Link>
          , you are deemed to have agreed to these terms.
        </p>
      </header>

      <div className="prose-terms space-y-10 text-[14px] leading-[1.85]">
        <section>
          <h2 className="serif text-lg mb-4">Article 1 (Definitions)</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>&quot;Submitter&quot; means the individual or entity that provides us with self-captured 3D scan data (including sample images; the &quot;Submitted Data&quot;) through the Program.</li>
            <li>&quot;Target Facility&quot; means the facility or location that is the subject of the Submitted Data.</li>
            <li>&quot;Closing&quot; means we obtain permission to list and sell from the Target Facility&apos;s operator and the Submitted Data becomes sellable as a property on the Service.</li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">Article 2 (Eligibility)</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>The Program is open to individuals residing in Japan (including minors, who must obtain consent from a legal guardian) or Japanese corporations.</li>
            <li>Receiving payouts requires a bank account in the Submitter&apos;s own name (or the corporation&apos;s name).</li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">Article 3 (Review and confidential holding)</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>We review Submitted Data and attempt to obtain listing/sale permission from the Target Facility&apos;s operator, either by contacting the facility directly or by relaying permission the Submitter obtained themselves (see Article 5 for the effect on revenue share).</li>
            <li>Until permission is obtained, Submitted Data is handled confidentially and is not disclosed to third parties, except for viewing/copying necessary for review and rights clearance.</li>
            <li>If permission cannot be obtained, we will promptly delete the Submitted Data, including sample images.</li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">Article 4 (License grant)</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>For Submitted Data that reaches Closing, the Submitter grants us an <strong>exclusive license</strong> to reproduce, modify, publicly transmit, and otherwise use the Submitted Data as necessary for sale, listing, and promotion on the Service. Copyright in the Submitted Data remains with the Submitter.</li>
            <li>The Submitter agrees not to assert moral rights against our use, or the use by third parties we have lawfully licensed (such as data purchasers), except where a modification would seriously harm the Submitter&apos;s honor or reputation.</li>
            <li>During the exclusive license period, the Submitter may not sell the Submitted Data themselves or license it to any third party other than us without our prior written consent.</li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">Article 5 (Revenue share)</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>Of the revenue generated from sales of Submitted Data (net of consumption tax and payment processing fees), the following share is paid to the Submitter:
              <ul className="mt-3 space-y-2 border-l-2 border-line pl-4">
                <li>Where <strong>we</strong> obtained the Target Facility&apos;s permission — <strong>30%</strong></li>
                <li>Where the <strong>Submitter</strong> obtained the Target Facility&apos;s permission and relayed it to us — <strong>50%</strong></li>
              </ul>
            </li>
            <li>We notify the Submitter which applies at Closing.</li>
            <li>Where we and the Submitter separately agree a different share in writing, that agreement prevails.</li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">Article 6 (Settlement)</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>Revenue share is settled quarterly. Each quarter (Jan–Mar, Apr–Jun, Jul–Sep, Oct–Dec) closes on its last day, and payment is made to the Submitter&apos;s designated bank account <strong>by the end of the following month</strong>.</li>
            <li>If a settlement amount is under <strong>¥10,000</strong>, it carries over to the next settlement. Carryover is limited to <strong>2 years</strong> from the end of the quarter in which the underlying sale occurred; any amount that has not reached ¥10,000 within that period is forfeited.</li>
            <li>Where the Submitter is an individual (including freelancers), payments are made net of withholding tax and the special reconstruction income tax as required by law.</li>
            <li>We bear the bank transfer fee.</li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">Article 7 (Withdrawal)</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>The Submitter may withdraw their application at any time before Closing. We will promptly delete the Submitted Data upon withdrawal.</li>
            <li>We will also honor a withdrawal request (delisting / data deletion) made after Closing. This does not affect revenue share owed for sales made before the withdrawal, or third-party licenses (e.g. to data purchasers) already granted as of the withdrawal.</li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">Article 8 (Submitter representations)</h2>
          <p className="opacity-80 mb-3">The Submitter represents and warrants to us that:</p>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>the Submitted Data was captured by the Submitter and was not obtained in violation of law or facility rules, such as entering restricted areas;</li>
            <li>the Submitted Data does not infringe any third party&apos;s copyright, trademark, portrait, privacy, or other rights; and</li>
            <li>the Submitter holds the legitimate right to grant us the license set out in these terms.</li>
          </ol>
          <p className="opacity-80 mt-3">
            If a breach of the foregoing causes damage to us or a third party, the Submitter shall be liable at their own responsibility and expense.
          </p>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">Article 9 (Prohibited acts)</h2>
          <p className="opacity-80 mb-3">The Submitter shall not:</p>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>submit false information;</li>
            <li>submit data captured by a third party as their own;</li>
            <li>disclose or provide pre-Closing Submitted Data (including sample images) to third parties without our consent; or</li>
            <li>disclose non-public information about the Target Facility learned through the Program to third parties without a legitimate reason.</li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">Article 10 (Exclusion of antisocial forces)</h2>
          <p className="opacity-80">
            The Submitter represents and warrants that they are not, and are not affiliated through funding or otherwise with, organized crime groups, their members, related businesses, or similar entities (&quot;Antisocial Forces&quot;). We may terminate the agreement under these terms without prior notice if the Submitter breaches this Article.
          </p>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">Article 11 (Relationship to the Terms of Service)</h2>
          <p className="opacity-80">
            Matters not covered by these terms are governed by our{" "}
            <Link href={localizedHref("/terms/service", locale)} className="text-accent hover:underline">
              Terms of Service
            </Link>
            . Where these terms and the Terms of Service conflict on a matter relating to the Program, these terms prevail.
          </p>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">Article 12 (Changes to these terms)</h2>
          <p className="opacity-80">
            We may change these terms when we deem it necessary. When making changes, we will announce the revised terms and their effective date a reasonable period in advance by posting on this page or by other appropriate means. Revised terms do not retroactively apply to the revenue share for Submitted Data that has already reached Closing.
          </p>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">Article 13 (Governing law &amp; jurisdiction)</h2>
          <p className="opacity-80">
            These terms are governed by the laws of Japan. The Tokyo District Court shall have exclusive jurisdiction as the court of first instance for any disputes relating to these terms.
          </p>
        </section>

        <div className="border-t border-line pt-6 mt-10">
          <p className="mono text-[11px] opacity-40">
            Established: August 2, 2026<br />
            Revised: August 4, 2026 (changed Article 12 to an advance-notice amendment procedure)<br />
            Locahun 3D (operated by KWI Inc.)
          </p>
        </div>
      </div>

      <div className="mt-10 text-center">
        <Link
          href={localizedHref("/submit-scan", locale)}
          className="mono text-[10px] tracking-[0.22em] uppercase opacity-50 hover:opacity-100 transition"
        >
          ← Back to application form
        </Link>
      </div>
    </div>
  );
}
