import Link from "next/link";

export const metadata = {
  title: "3Dデータ購入規約｜ロケハン3D",
};

export default function DataDownloadTermsPage() {
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
            ロケハン3D — 中村 航
          </p>
        </div>
      </div>

      <div className="mt-10 text-center">
        <Link
          href="/properties"
          className="mono text-[10px] tracking-[0.22em] uppercase opacity-50 hover:opacity-100 transition"
        >
          ← 物件一覧に戻る
        </Link>
      </div>
    </div>
  );
}
