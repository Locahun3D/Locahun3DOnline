import Link from "next/link";
import { getLocale } from "@/lib/i18n/server";
import { localizedHref } from "@/lib/i18n/dictionaries";

export const metadata = {
  title: "3Dデータ購入規約｜ロケハン3D",
};

export default async function DataDownloadTermsPage() {
  const locale = await getLocale();
  const en = locale === "en";
  if (en) return <DataDownloadTermsEN locale={locale} />;
  return (
    <div className="theme-online max-w-3xl mx-auto px-6 pt-12 pb-32">
      <div className="chapter-rule">
        <span className="opacity-60">TERMS</span>
        <span>3D Data Purchase Agreement</span>
        <span className="flex-1 h-px bg-current opacity-25" />
      </div>

      <header className="mb-12">
        <h1 className="serif text-[clamp(1.8rem,3.4vw,2.8rem)] font-bold">
          3Dデータ購入規約
        </h1>
        <p className="text-[14px] text-muted mt-3">
          ロケハン3D（以下「本サービス」）で販売する3Dスキャンデータ（PLY / OBJ / その他形式、以下「本データ」）の購入および利用に関する規約です。購入前に必ずお読みください。
        </p>
      </header>

      <div className="prose-terms space-y-10 text-[14px] leading-[1.85]">
        <section>
          <h2 className="serif text-lg mb-4">第1条（定義）</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>「本データ」とは、ロケハン3Dが提供する3Dスキャンデータ（PLY、OBJ、ZIP形式を含む）を指します。</li>
            <li>「購入者」とは、本サービスを通じて本データを購入した法人または個人を指します。</li>
            <li>「スタジオ」とは、本データのスキャン対象となった撮影スタジオ・ロケーション施設を指します。</li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">第2条（利用許諾）</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>購入者は、本データを映像・映画・CM・ドラマ・MV等の制作における<strong>ロケーション検証・プリビズ・バーチャルプロダクション</strong>の目的で利用できます。</li>
            <li>本データの利用は、購入者の所属する制作チーム・プロジェクト内に限定されます。</li>
            <li>利用許諾は非独占的であり、同一データを他の購入者にも提供する場合があります。</li>
            <li>
              具体的な利用範囲は、購入時に選択したライセンス区分により異なります。区分は購入完了時の領収書に記載されます。
              {/* schemas.ts の DATA_LICENSE_LABEL/DATA_LICENSE_DESC と内容を一致させること */}
              <ul className="mt-3 space-y-2 border-l-2 border-line pl-4">
                <li><strong>標準ライセンス</strong> — 商用・非商用の制作物に利用可。データ自体の再配布・再販は不可。</li>
                <li><strong>エディトリアル限定</strong> — 報道・教育・個人利用に限定。広告等の商用利用は不可。</li>
                <li><strong>拡張ライセンス</strong> — 商用利用に加え、テンプレート/組込製品への同梱・改変配布を許諾。</li>
                <li><strong>カスタム（要相談）</strong> — 利用範囲を個別に取り決め。購入前にお問い合わせください。</li>
              </ul>
            </li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">第3条（禁止事項）</h2>
          <p className="opacity-80 mb-3">購入者は、以下の行為を行ってはなりません。</p>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>本データの第三者への再配布・転売・貸与</li>
            <li>本データを用いたスタジオ施設の無断複製・模倣</li>
            <li>スタジオの内部構造・設備情報を競合施設に提供する行為</li>
            <li>本データの改変物を、元のスタジオと誤認させる形で公開する行為</li>
            <li>本データをNFT・デジタルアセットとして販売する行為</li>
            <li>本データに含まれるスタジオの機密情報（バックヤード・搬入口・制御室等）をSNS等で無許可公開する行為</li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">第4条（データの品質と免責）</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>本データは撮影時点の空間を3Dスキャンしたものであり、現在の施設状態との差異が生じる場合があります。</li>
            <li>本データの精度・解像度は撮影条件に依存し、完全な正確性を保証するものではありません。</li>
            <li>本データの利用によって生じた直接的・間接的な損害について、本サービスは責任を負いません。</li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">第5条（返金）</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>デジタルデータの性質上、ダウンロード後の返金は原則として行いません。</li>
            <li>データの破損・欠陥等、本サービスに起因する問題が確認された場合は、返金または代替データの提供を検討します。</li>
            <li>返金の可否は本サービスの判断によるものとします。</li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">第6条（機密情報の取り扱い）</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>バックヤード・搬入動線・制御室等の非公開エリアを含むデータは、制作会社アカウント（Teamプラン）のみに提供されます。</li>
            <li>購入者は、これらの機密情報を適切に管理し、プロジェクト関係者以外に開示しないものとします。</li>
            <li>NDA（秘密保持契約）が必要な場合、別途締結を求めることがあります。</li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">第7条（知的財産権）</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>本データの著作権およびその他の知的財産権は、スタジオの所有者または本サービスに帰属します。</li>
            <li>購入により移転する権利は、第2条に定める利用許諾のみです。</li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">第8条（規約の変更）</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>本規約は予告なく変更される場合があります。</li>
            <li>変更後の規約は、本ページに掲載された時点で効力を生じるものとします。</li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">第9条（準拠法・管轄）</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>本規約は日本法を準拠法とします。</li>
            <li>紛争が生じた場合、東京地方裁判所を第一審の専属的合意管轄裁判所とします。</li>
          </ol>
        </section>

        <div className="border-t border-line pt-6 mt-10">
          <p className="mono text-[11px] opacity-40">
            制定日: 2026年6月23日<br />
            ロケハン3D（運営：Kawaii World Industries株式会社）
          </p>
        </div>
      </div>

      <div className="mt-10 text-center">
        <Link
          href={localizedHref("/properties", locale)}
          className="mono text-[10px] tracking-[0.22em] uppercase opacity-50 hover:opacity-100 transition"
        >
          ← 物件一覧に戻る
        </Link>
      </div>
    </div>
  );
}

function DataDownloadTermsEN({ locale }: { locale: "ja" | "en" }) {
  return (
    <div className="theme-online max-w-3xl mx-auto px-6 pt-12 pb-32">
      <div className="chapter-rule">
        <span className="opacity-60">TERMS</span>
        <span>3D Data Purchase Agreement</span>
        <span className="flex-1 h-px bg-current opacity-25" />
      </div>

      <header className="mb-12">
        <h1 className="serif text-[clamp(1.8rem,3.4vw,2.8rem)] font-bold">
          3D Data Purchase Agreement
        </h1>
        <p className="text-[14px] text-muted mt-3">
          These terms govern the purchase and use of 3D scan data (PLY / OBJ / other
          formats; the &quot;Data&quot;) sold on Locahun 3D (the &quot;Service&quot;). Please read
          before purchasing.
        </p>
        <p className="text-[12px] text-amber-400/80 mt-3 border border-amber-400/30 bg-amber-400/5 px-3 py-2 rounded">
          This English text is a reference translation. The Japanese version is the
          legally binding agreement and prevails in case of any discrepancy.
        </p>
      </header>

      <div className="prose-terms space-y-10 text-[14px] leading-[1.85]">
        <section>
          <h2 className="serif text-lg mb-4">Article 1 (Definitions)</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>&quot;Data&quot; means the 3D scan data provided by Locahun 3D (including PLY, OBJ and ZIP formats).</li>
            <li>&quot;Purchaser&quot; means the corporation or individual that purchases the Data through the Service.</li>
            <li>&quot;Studio&quot; means the filming studio or location facility that is the subject of the scanned Data.</li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">Article 2 (License)</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>The Purchaser may use the Data for <strong>location review, previs and virtual production</strong> in the production of video, film, commercials, drama, music videos and the like.</li>
            <li>Use of the Data is limited to the Purchaser&apos;s own production team and project.</li>
            <li>The license is non-exclusive; the same Data may be provided to other purchasers.</li>
            <li>
              The specific scope of use depends on the license tier selected at purchase. The tier is shown on the purchase receipt.
              <ul className="mt-3 space-y-2 border-l-2 border-line pl-4">
                <li><strong>Standard license</strong> — Use in commercial &amp; non-commercial productions. Redistribution or resale of the data itself is not permitted.</li>
                <li><strong>Editorial only</strong> — Limited to news, education and personal use. Commercial use such as advertising is not permitted.</li>
                <li><strong>Extended license</strong> — Commercial use plus bundling into templates / embedded products and modified redistribution.</li>
                <li><strong>Custom (by arrangement)</strong> — Scope arranged individually. Please contact us before purchasing.</li>
              </ul>
            </li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">Article 3 (Prohibited acts)</h2>
          <p className="opacity-80 mb-3">The Purchaser shall not:</p>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>redistribute, resell or lend the Data to third parties;</li>
            <li>reproduce or imitate the Studio facility without permission using the Data;</li>
            <li>provide the Studio&apos;s internal structure or equipment information to competing facilities;</li>
            <li>publish a modified version of the Data in a way that could be mistaken for the original Studio;</li>
            <li>sell the Data as an NFT or digital asset;</li>
            <li>publish confidential Studio information contained in the Data (backyards, loading docks, control rooms, etc.) on social media or elsewhere without permission.</li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">Article 4 (Data quality and disclaimer)</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>The Data is a 3D scan of the space at the time of capture and may differ from the facility&apos;s current state.</li>
            <li>The accuracy and resolution of the Data depend on capture conditions and are not guaranteed to be fully accurate.</li>
            <li>The Service is not liable for any direct or indirect damages arising from use of the Data.</li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">Article 5 (Refunds)</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>Due to the nature of digital data, refunds are not provided after download as a general rule.</li>
            <li>If a problem attributable to the Service is confirmed (such as corrupted or defective data), we will consider a refund or replacement data.</li>
            <li>Whether a refund is granted is at the Service&apos;s discretion.</li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">Article 6 (Handling of confidential information)</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>Data including non-public areas such as backyards, loading routes and control rooms is provided only to production-company accounts (Team plan).</li>
            <li>The Purchaser shall manage such confidential information appropriately and not disclose it to anyone other than project members.</li>
            <li>Where an NDA is required, we may request that one be signed separately.</li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">Article 7 (Intellectual property)</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>Copyright and other intellectual property rights in the Data belong to the Studio owner or the Service.</li>
            <li>The only right transferred by purchase is the license set out in Article 2.</li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">Article 8 (Changes to these terms)</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>These terms may be changed without notice.</li>
            <li>The amended terms take effect when posted on this page.</li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">Article 9 (Governing law and jurisdiction)</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>These terms are governed by the laws of Japan.</li>
            <li>Any dispute shall be subject to the exclusive jurisdiction of the Tokyo District Court as the court of first instance.</li>
          </ol>
        </section>

        <div className="border-t border-line pt-6 mt-10">
          <p className="mono text-[11px] opacity-40">
            Established: June 23, 2026<br />
            Locahun 3D (operated by Kawaii World Industries Co., Ltd.)
          </p>
        </div>
      </div>

      <div className="mt-10 text-center">
        <Link
          href={localizedHref("/properties", locale)}
          className="mono text-[10px] tracking-[0.22em] uppercase opacity-50 hover:opacity-100 transition"
        >
          ← Back to locations
        </Link>
      </div>
    </div>
  );
}
