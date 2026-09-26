import Link from "next/link";
import { getLocale } from "@/lib/i18n/server";
import { localizedHref } from "@/lib/i18n/dictionaries";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: locale === "en" ? "Facility Listing Terms" : "施設掲載規約｜ロケハン3D",
  };
}

/**
 * 施設掲載規約（2026-09-26 本人指示「掲載の規約がいるかも」）。
 *
 * 既存の規約でカバーされていなかった「掲載そのものの条件」をここに置く。
 *   - 販売が起きたときの取り分 → /terms/listing-revenue-share
 *   - 購入者が守る条件 → /terms/data-download
 *   - 第三者が撮って持ち込む場合 → /terms/submission
 *   - 本規約 → 費用・撮影・確認と公開・写真の利用許諾・停止/削除・権利・免責
 * スタジオへの確認メールに同送するリンクは src/lib/studio-review-mail.ts の STUDIO_TERMS_DOCS。
 *
 * ⚠ ドラフト。契約書として差し入れる前に弁護士のレビューを通すこと。
 */
export default async function ListingTermsPage() {
  const locale = await getLocale();
  if (locale === "en") return <ListingTermsEN locale={locale} />;
  return (
    <div className="theme-online w-full max-w-3xl mx-auto px-6 ui-page-shell pb-12 sm:pb-32">
      <header className="ui-page-header">
        <h1 className="ui-page-title">施設掲載規約</h1>
        <p className="ui-page-lead text-[14px] text-muted">
          KWI株式会社（以下「当社」）が運営する「ロケハン3D」に、スタジオ・ロケーション施設を掲載いただく際の条件を定めるものです。
          <br />
          3Dデータが売れたときの分配は
          <Link
            href={localizedHref("/terms/listing-revenue-share", locale)}
            className="text-accent hover:underline"
          >
            掲載データ販売分配規約
          </Link>
          に、購入者が守る条件は
          <Link href={localizedHref("/terms/data-download", locale)} className="text-accent hover:underline">
            3Dデータ購入規約
          </Link>
          に定めます。
        </p>
      </header>

      <div className="prose-terms space-y-10 text-[14px] leading-[1.85]">
        <section>
          <h2 className="ui-section-title mb-4">第1条（適用）</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>本規約は、施設の所有者または管理権限を有する運営者（以下「掲載者」）が、自らの施設（以下「対象施設」）を本サービスに掲載する場合に適用します。</li>
            <li>掲載者は、対象施設について掲載および撮影を許諾する正当な権限を有していることを表明し、保証するものとします。</li>
            <li>
              第三者が撮影して持ち込んだデータによる掲載には本規約は適用されず、
              <Link href={localizedHref("/terms/submission", locale)} className="text-accent hover:underline">
                持ち込みスキャン規約
              </Link>
              によります。
            </li>
          </ol>
        </section>

        <section>
          <h2 className="ui-section-title mb-4">第2条（費用）</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>対象施設の3Dスキャン撮影、3Dデータの制作・調整、掲載ページの制作（日本語・英語）、公開後の保管・配信・維持管理は、当社が無償で行います。掲載者に費用のご負担を求めません。</li>
            <li>撮影当日の立会い、施設側の人員・鍵の手配、当社の到着から撤収までに要する時間の確保は、掲載者にご協力いただきます。</li>
          </ol>
        </section>

        <section>
          <h2 className="ui-section-title mb-4">第3条（撮影）</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>撮影の日時および範囲は、当社と掲載者が事前に協議して定めます。</li>
            <li>掲載者は、撮影範囲に、掲載を望まない物品、第三者の権利に関わる展示物、個人情報が記載された書類等が置かれていないことをご確認ください。撮影後に判明した場合は、第6条の手順により修正または非公開とします。</li>
            <li>当社は、撮影にあたり対象施設の設備等を損傷しないよう注意します。当社の責めに帰すべき事由により損害が生じた場合は、当社がその損害を賠償します。</li>
          </ol>
        </section>

        <section>
          <h2 className="ui-section-title mb-4">第4条（掲載内容の確認と公開）</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>当社は、掲載ページを作成し、公開前に掲載者へ確認用のリンク（ログイン不要・期限付き）をお送りします。</li>
            <li>掲載ページは、掲載者が当該リンク上で承認した時点、または掲載者から書面もしくは電子メールで承認の意思表示を受けた時点で公開します。</li>
            <li>公開後の内容の修正・追加は、いつでもお申し付けください。当社は速やかに対応します。</li>
          </ol>
        </section>

        <section>
          <h2 className="ui-section-title mb-4">第5条（写真・情報の利用許諾）</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>掲載者は当社に対し、対象施設の名称・所在地・設備・料金その他の掲載情報、ならびに掲載者が提供し、または掲載者の公式サイト等から当社が引用し掲載者の承認を得た写真を、本サービスの掲載ページ、本サービスの紹介、広告宣伝および報道発表に利用することを許諾します。</li>
            <li>前項の許諾は無償・非独占とし、掲載が継続する期間について有効とします。掲載の終了後、当社は当該写真の新たな利用を行いません（既に配布した印刷物・公開済みの記事等を除きます）。</li>
            <li>当社は、写真の著作権を取得するものではありません。</li>
          </ol>
        </section>

        <section>
          <h2 className="ui-section-title mb-4">第6条（掲載の停止・削除）</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>掲載者は、理由を問わず、いつでも掲載の停止または削除を求めることができます。当社は、求めを受けた日から<strong>5営業日以内</strong>に本サービス上の公開を停止します。</li>
            <li>当社は、対象施設の閉鎖、掲載内容が事実と著しく異なる場合、法令または公序良俗に反するおそれがある場合その他相当の理由がある場合、掲載者へ通知のうえ掲載を停止することがあります。</li>
            <li>
              掲載の停止・削除は、既に販売された3Dデータについて購入者が取得した利用許諾に影響しません（
              <Link href={localizedHref("/terms/data-download", locale)} className="text-accent hover:underline">
                3Dデータ購入規約
              </Link>
              ）。
            </li>
          </ol>
        </section>

        <section>
          <h2 className="ui-section-title mb-4">第7条（3Dデータの権利と販売）</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>当社が撮影・制作した3Dデータ（3D Gaussian Splatting 方式のデータおよびPLY・OBJ等の派生データ）に関する著作権その他の権利は、当社に帰属します。対象施設そのものに関する掲載者の権利は、これにより影響を受けません。</li>
            <li>当社は、3Dデータを第三者へ販売する場合、あらかじめ掲載者の許諾を得るものとします。許諾がない場合、3Dデータは本サービス上での閲覧（ウォークスルー）および掲載者による利用に限って用います。</li>
            <li>
              販売による売上の分配は
              <Link
                href={localizedHref("/terms/listing-revenue-share", locale)}
                className="text-accent hover:underline"
              >
                掲載データ販売分配規約
              </Link>
              によります。
            </li>
            <li>掲載者は、前項の許諾をいつでも撤回することができます。撤回の後、当社は新たな販売を行いません。撤回前に販売された分について購入者が取得した利用許諾は存続します。</li>
            <li>掲載者は、掲載ページの3Dツアーを、自社サイトその他の媒体に無償で埋め込んで利用することができます。</li>
          </ol>
        </section>

        <section>
          <h2 className="ui-section-title mb-4">第8条（非独占）</h2>
          <p className="opacity-80">
            本規約は、掲載者が対象施設について当社以外の第三者に撮影、掲載または3Dデータの制作・販売を許諾することを妨げるものではありません。
          </p>
        </section>

        <section>
          <h2 className="ui-section-title mb-4">第9条（施設の予約・利用契約）</h2>
          <p className="opacity-80">
            本サービスの掲載ページは対象施設の紹介を目的とするものであり、施設の予約・利用契約は掲載者と利用者との間で直接成立します。当社は、当該契約の当事者とならず、その履行について責任を負いません。
          </p>
        </section>

        <section>
          <h2 className="ui-section-title mb-4">第10条（免責）</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>当社は、本サービスの停止、中断、掲載ページの表示不具合等により掲載者に生じた損害について、当社の故意または重過失による場合を除き、責任を負いません。</li>
            <li>当社が掲載者に対して負う損害賠償の責任は、当社の故意または重過失による場合を除き、直接かつ通常の損害に限り、かつ<strong>10万円</strong>を上限とします（掲載を無償で提供していることを考慮したものです）。</li>
          </ol>
        </section>

        <section>
          <h2 className="ui-section-title mb-4">第11条（秘密保持）</h2>
          <p className="opacity-80">
            当社は、撮影および掲載の過程で知り得た掲載者の非公開の情報を、掲載者の承諾なく第三者へ開示しません。ただし、法令に基づく開示を除きます。
          </p>
        </section>

        <section>
          <h2 className="ui-section-title mb-4">第12条（利用規約との関係・規約の変更）</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>
              本規約に定めのない事項は
              <Link href={localizedHref("/terms/service", locale)} className="text-accent hover:underline">
                利用規約
              </Link>
              によります。掲載に関する事項について両者の内容が異なる場合は、本規約が優先します。
            </li>
            <li>当社は、必要と判断した場合、本規約を変更することがあります。変更する場合、変更後の内容および効力発生時期を、効力発生時期の相当期間前までに本ページへの掲示その他適切な方法により周知します。</li>
          </ol>
        </section>

        <section>
          <h2 className="ui-section-title mb-4">第13条（準拠法・管轄裁判所）</h2>
          <p className="opacity-80">
            本規約の解釈にあたっては日本法を準拠法とします。本規約に関して紛争が生じた場合には、東京地方裁判所を第一審の専属的合意管轄裁判所とします。
          </p>
        </section>

        <div className="border-t border-line pt-6 mt-10">
          <p className="mono text-[11px] opacity-40">
            制定日: 2026年9月26日
            <br />
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

function ListingTermsEN({ locale }: { locale: "ja" | "en" }) {
  const link = (href: string, label: string) => (
    <Link href={localizedHref(href, locale)} className="text-accent hover:underline">
      {label}
    </Link>
  );
  return (
    <div className="theme-online w-full max-w-3xl mx-auto px-6 ui-page-shell pb-12 sm:pb-32">
      <header className="ui-page-header">
        <h1 className="ui-page-title">Facility Listing Terms</h1>
        <p className="text-[14px] text-amber-400/80 mt-3 border border-amber-400/30 bg-amber-400/5 px-3 py-2 rounded">
          This English text is a reference translation. The Japanese version is the legally binding
          document and prevails in case of any discrepancy.
        </p>
        <p className="ui-page-lead text-[14px] text-muted">
          These terms govern listing a studio or location facility on &quot;Locahun 3D&quot;, operated by
          KWI Inc. (&quot;we&quot;, &quot;us&quot;). Revenue sharing on data sales is covered by the{" "}
          {link("/terms/listing-revenue-share", "Listing Data Revenue Share Terms")}, and what buyers may
          do with purchased data by the {link("/terms/data-download", "3D Data Purchase Agreement")}.
        </p>
      </header>

      <div className="prose-terms space-y-10 text-[14px] leading-[1.85]">
        <section>
          <h2 className="ui-section-title mb-4">Article 1 (Scope)</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>These terms apply where an owner, or an operator with authority over a facility (&quot;Lister&quot;), lists their own facility (&quot;Target Facility&quot;) on the Service.</li>
            <li>The Lister represents and warrants that they have the authority to permit the listing and the scanning of the Target Facility.</li>
            <li>They do not apply to listings based on data captured and submitted by a third party, which are governed by the {link("/terms/submission", "Scan Submission Agreement")}.</li>
          </ol>
        </section>

        <section>
          <h2 className="ui-section-title mb-4">Article 2 (No charge)</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>We carry out the 3D scan, the production and tuning of the 3D data, the listing page in Japanese and English, and the hosting, delivery and maintenance after publication, free of charge to the Lister.</li>
            <li>Attendance on the shoot day, staff and keys, and securing the time we need on site are provided by the Lister.</li>
          </ol>
        </section>

        <section>
          <h2 className="ui-section-title mb-4">Article 3 (The shoot)</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>The date and the area to be scanned are agreed in advance between us and the Lister.</li>
            <li>Please make sure the area contains no items you do not want published, no exhibits involving third-party rights, and no documents showing personal data. Anything found afterwards is corrected or unpublished under Article 6.</li>
            <li>We take care not to damage the facility. Where damage results from a cause attributable to us, we compensate for it.</li>
          </ol>
        </section>

        <section>
          <h2 className="ui-section-title mb-4">Article 4 (Review and publication)</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>We prepare the listing page and send the Lister a time-limited review link (no login required) before publication.</li>
            <li>The page is published when the Lister approves it on that link, or tells us so in writing or by email.</li>
            <li>Corrections and additions after publication can be requested at any time; we act on them promptly.</li>
          </ol>
        </section>

        <section>
          <h2 className="ui-section-title mb-4">Article 5 (Licence for photos and information)</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>The Lister grants us the right to use the facility&apos;s name, address, facilities, rates and other listed information, together with photos supplied by the Lister or quoted from the Lister&apos;s official site with the Lister&apos;s approval, on the listing page and in describing, advertising and announcing the Service.</li>
            <li>This licence is free of charge and non-exclusive, and lasts as long as the listing continues. After the listing ends we make no new use of those photos (excluding printed material already distributed and articles already published).</li>
            <li>We do not acquire copyright in the photos.</li>
          </ol>
        </section>

        <section>
          <h2 className="ui-section-title mb-4">Article 6 (Suspension and removal)</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>The Lister may ask us to suspend or remove the listing at any time, for any reason. We take it off the Service within <strong>five business days</strong> of the request.</li>
            <li>We may suspend a listing, after notifying the Lister, if the facility closes, if the content is materially inaccurate, if it risks breaching law or public policy, or for other good reason.</li>
            <li>Suspension or removal does not affect the licence already obtained by buyers of the 3D data ({link("/terms/data-download", "3D Data Purchase Agreement")}).</li>
          </ol>
        </section>

        <section>
          <h2 className="ui-section-title mb-4">Article 7 (Rights in the 3D data, and sales)</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>Copyright and other rights in the 3D data we capture and produce (3D Gaussian Splatting data and derived PLY/OBJ files) belong to us. The Lister&apos;s rights in the facility itself are unaffected.</li>
            <li>We obtain the Lister&apos;s permission before selling the 3D data to third parties. Without it, the data is used only for walkthrough viewing on the Service and by the Lister.</li>
            <li>Revenue sharing is governed by the {link("/terms/listing-revenue-share", "Listing Data Revenue Share Terms")}.</li>
            <li>The Lister may withdraw that permission at any time. We then make no further sales; licences already obtained by buyers remain in force.</li>
            <li>The Lister may embed the listing&apos;s 3D tour on their own website or other media, free of charge.</li>
          </ol>
        </section>

        <section>
          <h2 className="ui-section-title mb-4">Article 8 (Non-exclusive)</h2>
          <p className="opacity-80">
            Nothing here prevents the Lister from also permitting other parties to scan, list, or produce and sell 3D data of the same facility.
          </p>
        </section>

        <section>
          <h2 className="ui-section-title mb-4">Article 9 (Bookings)</h2>
          <p className="opacity-80">
            A listing page introduces the facility; any booking or use of the facility is contracted directly between the Lister and the user. We are not a party to that contract and are not responsible for its performance.
          </p>
        </section>

        <section>
          <h2 className="ui-section-title mb-4">Article 10 (Limitation of liability)</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>We are not liable for loss caused by suspension or interruption of the Service or by display faults on a listing page, except where caused by our wilful misconduct or gross negligence.</li>
            <li>Except in cases of our wilful misconduct or gross negligence, our liability to the Lister is limited to direct and ordinary damages and capped at <strong>JPY 100,000</strong>, reflecting that listing is provided free of charge.</li>
          </ol>
        </section>

        <section>
          <h2 className="ui-section-title mb-4">Article 11 (Confidentiality)</h2>
          <p className="opacity-80">
            We do not disclose non-public information about the Lister learned during the shoot or the listing process without the Lister&apos;s consent, except as required by law.
          </p>
        </section>

        <section>
          <h2 className="ui-section-title mb-4">Article 12 (Relationship to the Terms of Service; changes)</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>Matters not covered here are governed by our {link("/terms/service", "Terms of Service")}. On listing matters, these terms prevail where the two differ.</li>
            <li>We may change these terms. We will announce the new text and its effective date on this page, or by other appropriate means, a reasonable period in advance.</li>
          </ol>
        </section>

        <section>
          <h2 className="ui-section-title mb-4">Article 13 (Governing law and jurisdiction)</h2>
          <p className="opacity-80">
            These terms are governed by Japanese law. The Tokyo District Court has exclusive jurisdiction of first instance over any dispute arising from them.
          </p>
        </section>

        <div className="border-t border-line pt-6 mt-10">
          <p className="mono text-[11px] opacity-40">
            Effective: 26 September 2026
            <br />
            Locahun 3D (operated by KWI Inc.)
          </p>
        </div>
      </div>
    </div>
  );
}
