import Link from "next/link";
import { getLocale } from "@/lib/i18n/server";
import { localizedHref } from "@/lib/i18n/dictionaries";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: locale === "en" ? "3D Data Purchase Agreement" : "3Dデータ購入規約｜ロケハン3D",
  };
}

export default async function DataDownloadTermsPage() {
  const locale = await getLocale();
  const en = locale === "en";
  if (en) return <DataDownloadTermsEN locale={locale} />;
  return (
    <div className="theme-online w-full max-w-3xl mx-auto px-6 ui-page-shell pb-12 sm:pb-32">

      <header className="ui-page-header">
        <h1 className="ui-page-title">
          3Dデータ購入規約
        </h1>
        <p className="ui-page-lead text-[14px] text-muted">
          ロケハン3D（以下「本サービス」）で販売する3Dスキャンデータ（PLY / OBJ / その他形式、以下「本データ」）の購入および利用に関する規約です。購入前に必ずお読みください。
        </p>
      </header>

      <div className="prose-terms space-y-10 text-[14px] leading-[1.85]">
        <section>
          <h2 className="ui-section-title mb-4">第1条（定義）</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>「本データ」とは、ロケハン3Dが提供する3Dスキャンデータ（PLY、OBJ、ZIP形式を含む）であって、当社が撮影・制作したもの、および撮影者（持ち込みスキャンの提出者）から当社が販売の許諾を受けたものを指します。</li>
            <li>「購入者」とは、本サービスを通じて本データを購入した法人または個人を指します。</li>
            <li>「スタジオ」とは、本データのスキャン対象となった撮影スタジオ・ロケーション施設を指します。</li>
            <li>本サービスの運営者および本データの販売者は、Kawaii World Industries株式会社（KWI株式会社。以下「当社」）です。本規約において本サービスが負う義務・責任は、当社が負います。</li>
          </ol>
        </section>

        <section>
          <h2 className="ui-section-title mb-4">第2条（利用許諾）</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>本規約に基づく本データの購入契約は、購入者が本サービス上で購入手続き（決済代行事業者を通じた決済を含む）を完了した時点で成立します。対価は日本円建てとし、購入手続き画面に表示される金額（消費税込み）とします。</li>
            <li>購入者は、本データを映像・映画・CM・ドラマ・MV等の制作における<strong>ロケーション検証・プリビズ・バーチャルプロダクション</strong>の目的、および購入時に選択したライセンス区分が認めるその他の制作の目的で利用できます。</li>
            <li>本データの利用は、購入者の所属する制作チームおよび第6項により利用できる案件の関係者の範囲内に限定されます。</li>
            <li>利用許諾は非独占的であり、同一データを他の購入者にも提供する場合があります。</li>
            <li>
              具体的な利用範囲は、購入時に選択したライセンス区分により異なります。区分は購入完了時の領収書に記載されます。
              {/* schemas.ts の DATA_LICENSE_LABEL/DATA_LICENSE_DESC と内容を一致させること */}
              <ul className="mt-3 space-y-2 border-l-2 border-line pl-4">
                <li><strong>インディーライセンス</strong> — 個人、または直近1年の売上が1,000万円未満の事業者向け（1購入につき1案件まで）。収益化動画・同人/インディーゲーム・VRChatワールドなど商用利用可。アセットとしての再配布・再販は不可。権利表記は必須です（第8項）。</li>
                <li><strong>標準ライセンス</strong> — 商用・非商用の制作物に利用可（1購入につき1案件まで）。データ自体の再配布・再販は不可。</li>
                <li><strong>エディトリアル限定</strong>（無料） — 報道・教育・個人利用に限定（1件の提供につき1案件まで）。広告等の商用利用は不可。公開時に権利表記が必要です。</li>
                <li><strong>拡張ライセンス</strong> — 利用できる案件数の制限なし。商用利用に加え、テンプレート/組込製品への同梱・改変配布を許諾。</li>
                <li><strong>カスタム（要相談）</strong> — 利用範囲を個別に取り決め。購入前にお問い合わせください。</li>
              </ul>
            </li>
            <li>
              標準ライセンス、インディーライセンスおよびエディトリアル限定で本データを利用できるのは、<strong>1件の購入（無償提供を含みます）につき1案件</strong>に限ります。「案件」とは、同一の企画として制作される1つの制作物（映画1作品、ドラマ・番組1シリーズ、CM・広告1キャンペーン、MV1作品、ゲーム1タイトル、ワールド1つ、アプリケーション1本等）をいい、その再編集版・予告編・他言語版等は同じ案件に含みます。別の案件に利用する場合は、改めて本データを購入するか、拡張ライセンスを購入してください。拡張ライセンスでは、利用できる案件の数に制限はありません。ただし、第4条の禁止事項は案件の数にかかわらず適用されます。本項は2026年11月6日以降に同意された購入に適用し、それより前の購入には購入時の条件を適用します。
            </li>
            <li>
              本データを<strong>ゲーム（Web/PC/その他プラットフォームを問わない）・アプリケーション等のソフトウェア製品に組み込み、当該製品の一部として第三者に提供する形態</strong>（以下「組込利用」）には、拡張ライセンスが必要です。標準ライセンスは、本データを用いて映像・画像等の制作物を作成する利用に限られ、本データ自体をソフトウェア製品に同梱して配布する利用は含みません。ただし、インディーライセンスの購入者は、<strong>購入者自身が制作・公開する1つのゲーム・ワールド・アプリケーション</strong>に限り、組込利用を行うことができます。この場合、当該製品から本データを取り出して利用できる形（素材ファイルの同梱、アセットとしての書き出し機能の提供等）で配布してはなりません。
            </li>
            <li>
              インディーライセンスは、<strong>個人、または購入日の直前1年間の売上高が1,000万円未満の法人・個人事業主</strong>に限り購入できます。購入者は購入時にこれに該当することを申告するものとし、当社は必要に応じて確認を求めることができます。申告が事実と異なる場合、当社は当該購入を標準ライセンスの購入とみなし、差額の支払いを求めることができます。インディーライセンスで利用した制作物を公開する場合、購入者は、概要欄・クレジット・作品やワールドの説明ページ等のいずれか1か所に「3D scan: Locahun 3D（locahun3d.com）」等の権利表記を掲載するものとします。
            </li>
            <li>キャンペーン等により本データを<strong>無償で提供する場合にも、本規約を準用します</strong>。この場合、本規約中の「購入者」は無償提供を受けた者と読み替えます。</li>
            <li>
              購入者は、本データを使用してレンダリング・撮影した<strong>静止画・映像をSNS等で公開できます</strong>。公開の際は「ロケハン3D」のクレジット表記（例: #ロケハン3D タグ、または locahun3d.com への言及）を添えてください。ただし第3条に定める第三者権利物の除去義務、および第4条の禁止事項（機密エリアの公開等）に該当する内容は除きます。
            </li>
            <li>
              本データを購入せずに本サービスの閲覧を通じて取得したプレビュー画像（カメラツールによる書き出し、スクリーンショット、画面録画を含みます）の利用範囲、および3Dツアーの埋め込みの条件は、
              <Link href={localizedHref("/terms/service", locale)} className="text-accent hover:underline">
                利用規約
              </Link>
              第5条・第7条によります。
            </li>
          </ol>
        </section>

        <section>
          <h2 className="ui-section-title mb-4">第3条（第三者の権利物の取り扱い）</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>本データは実在の場所を撮影・スキャンしたものであり、対象空間には<strong>第三者が権利を有する広告物・看板・ポスター・企業ロゴ・商標・キャラクター等</strong>（以下「第三者権利物」）が写り込んでいる場合があります。</li>
            <li>第三者権利物に関する著作権・商標権その他の権利は当該第三者に帰属し、本サービスおよびスタジオは、本データの提供によりこれらの権利について<strong>何らの許諾も行うものではありません</strong>。</li>
            <li>購入者は、本データを用いた制作物を公開・納品・配布する前に、<strong>第三者権利物を削除・除去・ぼかし処理・差し替え等の方法により制作物から取り除く</strong>ものとします。</li>
            <li>購入者が前項の措置を怠ったことに起因して第三者との間に生じた紛争・請求・損害について、本サービスは一切の責任を負わず、購入者が自己の責任と費用において解決するものとします。</li>
          </ol>
        </section>

        <section>
          <h2 className="ui-section-title mb-4">第4条（禁止事項）</h2>
          <p className="opacity-80 mb-3">購入者は、以下の行為を行ってはなりません。</p>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>本データの第三者への再配布・転売・貸与（本サービスの事前の書面による許諾がある場合を除く。用途によって条件が異なるため、ご希望の場合はお問い合わせください）</li>
            <li>
              拡張ライセンスまたはインディーライセンスに基づき組込利用を行う場合、当該ソフトウェア製品の利用者が技術的な解析等により本データを抽出しうる状態にあること自体は、前号の禁止事項に該当しません。ただし、抽出されたデータを本データそのものとして別途配布・転売・貸与する行為は、前号の禁止事項に該当します。
            </li>
            <li>本データを用いたスタジオ施設の無断複製・模倣</li>
                        <li>本データの改変物を、元のスタジオと誤認させる形で公開する行為</li>
            <li>本データをNFT・デジタルアセットとして販売する行為</li>
            <li>本データに含まれるスタジオの機密情報（バックヤード・搬入口・制御室等）をSNS等で無許可公開する行為</li>
            <li>本データおよびその改変物を、<strong>機械学習・生成AIモデルの学習データとして利用する行為</strong>（本サービスの事前の書面による許諾がある場合を除く。用途によって条件が異なるため、ご希望の場合はお問い合わせください）</li>
            <li>第3条に定める第三者権利物を除去せずに制作物を公開・納品・配布する行為</li>
            <li>撮影対象の施設又はその運営者の名誉・信用を傷つける目的での利用</li>
            <li>撮影対象の施設が特定できる形で、犯罪・事故その他の実在の事件を表現する目的での利用</li>
            <li>購入時に物件ページの「施設の利用条件」に表示された条件（改変・破壊表現の禁止、施設名のクレジット等）に反する利用</li>
          </ol>
        </section>

        <section>
          <h2 className="ui-section-title mb-4">第5条（データの品質と免責）</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>本データは撮影時点の空間を3Dスキャンしたものであり、現在の施設状態との差異が生じる場合があります。</li>
            <li>本データの精度・解像度は撮影条件に依存し、完全な正確性を保証するものではありません。</li>
            {/* ⚠ 旧文言は全部免責で、個人購入者がいる以上消費者契約法8条により
                条項ごと無効になるリスクが高かった（2026-08-04リーガル点検）。
                旧書式Cと同じ「上限=支払対価・故意重過失を除く」方式へ是正。 */}
            <li>本データの利用に関して当社が購入者に対して負う損害賠償責任は、請求原因を問わず、当社の故意または重過失による場合を除き、当該本データについて購入者が現実に支払った対価を上限とします。</li>
          </ol>
        </section>

        <section>
          <h2 className="ui-section-title mb-4">第6条（返金）</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            {/* 2026-10-08 本人判断: 「返金の可否は当社の判断」をやめ、当社に起因する不具合なら
                購入から1か月以内に返金または代替データを求められる形にした。特商法表記と一致させること。 */}
            <li>デジタルデータの性質上、ダウンロード後の返金は行いません。ただし、次項の場合を除きます。</li>
            <li>データの破損・欠陥等、当社に起因する不具合が確認された場合、購入者は、購入日から<strong>1か月以内</strong>に限り、返金または代替データの提供を求めることができます。</li>
          </ol>
        </section>

        <section>
          <h2 className="ui-section-title mb-4">第7条（機密情報の取り扱い）</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>バックヤード・搬入動線・制御室等の非公開エリアを含むデータは、制作会社アカウント（Teamプラン）のみに提供されます。</li>
            <li>購入者は、これらの機密情報を適切に管理し、プロジェクト関係者以外に開示しないものとします。</li>
            <li>NDA（秘密保持契約）が必要な場合、別途締結を求めることがあります。</li>
          </ol>
        </section>

        <section>
          <h2 className="ui-section-title mb-4">第8条（知的財産権）</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>本サービスは、本データの提供にあたり、スキャン対象となったスタジオの運営者等から必要な許諾を得るよう努めるものとします。</li>
            <li>本データの著作権およびその他の知的財産権は、スタジオの所有者または本サービスに帰属します。第三者権利物に関する権利の扱いは第3条によります。</li>
            <li>購入により移転する権利は、第2条に定める利用許諾のみです。</li>
          </ol>
        </section>

        <section>
          <h2 className="ui-section-title mb-4">第9条（規約の変更）</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>当社は、必要と判断した場合、本規約を変更することがあります。変更を行う場合、当社は、変更後の規約の内容および効力発生時期を、効力発生時期の相当期間前までに本ページへの掲示その他適切な方法により周知します。</li>
            <li>変更後の規約は、購入済みの本データの利用条件に不利益に遡及して適用されません（第2条5項のとおり、購入時に選択した区分の条件が適用されます）。</li>
          </ol>
        </section>

        <section>
          <h2 className="ui-section-title mb-4">第10条（準拠法・管轄）</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>本規約は日本法を準拠法とします。</li>
            <li>紛争が生じた場合、東京地方裁判所を第一審の専属的合意管轄裁判所とします。</li>
          </ol>
        </section>

        <div className="border-t border-line pt-6 mt-10">
          <p className="mono text-[11px] opacity-40">
            制定日: 2026年6月23日<br />
            改定日: 2026年7月16日（第三者の広告物・看板等の削除義務を明記し第3条として新設、以降の条項を繰り下げ／第2条に対価・契約成立時点、第8条にスタジオ運営者からの許諾取得努力義務を追記／第2条にゲーム等ソフトウェア製品への組込利用は拡張ライセンスが必要である旨、第4条に組込利用時のデータ抽出可能性についての取り扱いを追記）<br />
            改定日: 2026年8月4日（第1条に契約当事者がKWI株式会社である旨を明記／第2条5項にエディトリアル限定区分の新規販売停止を注記／第5条3項の免責を賠償上限方式（支払対価・故意重過失を除く）に変更／第9条の規約変更手続きを事前周知方式に変更し、購入済み分への不遡及を明記）<br />
            改定日: 2026年9月19日（第2条5項のエディトリアル限定区分の販売を再開／第4条から競合施設への情報提供の禁止を削除し、施設の名誉毀損・実在事件の表現・物件ごとの施設の利用条件への違反を禁止事項に追加）<br />
            改定日: 2026年10月8日（第1条の本データに、撮影者から販売の許諾を受けた持ち込みスキャンのデータを含める旨を明記し、運営者を正式な商号で表記／第2条に、閲覧で取得したプレビュー画像と埋め込みの条件は利用規約によることを追加／第6条の返金を、当社に起因する不具合が確認された場合は購入日から1か月以内に返金または代替データの提供を求められる形に改定）<br />
            改定日: 2026年11月6日（第2条に、標準ライセンス・エディトリアル限定は1件の購入につき1案件まで、拡張ライセンスは案件数の制限なしとする項を第6項として新設し、以降の項を繰り下げ。第3項を同項に合わせて変更。同日以降に同意された購入に適用）<br />
            改定日: 2026年11月11日（第2条5項にインディーライセンスを追加し、2項の利用目的・6項の案件・7項の組込利用を同区分に合わせて変更、対象者を定める項を第8項として新設し以降の項を繰り下げ／第4条2号の組込利用の取り扱いをインディーライセンスにも適用。第8項にインディーライセンスの権利表記を定める。同日以降に同意された購入に適用）<br />
            ロケハン3D（運営：Kawaii World Industries株式会社（KWI株式会社））
          </p>
        </div>
      </div>

      <div className="mt-10 text-center">
        <Link
          href={localizedHref("/properties", locale)}
          className="mono text-[10px] tracking-[0.22em] uppercase opacity-50 hover:opacity-100 transition max-[720px]:inline-flex max-[720px]:items-center max-[720px]:min-h-[44px]"
        >
          ← 物件一覧に戻る
        </Link>
      </div>
    </div>
  );
}

function DataDownloadTermsEN({ locale }: { locale: "ja" | "en" }) {
  return (
    <div className="theme-online w-full max-w-3xl mx-auto px-6 ui-page-shell pb-12 sm:pb-32">

      <header className="ui-page-header">
        <h1 className="ui-page-title">
          3D Data Purchase Agreement
        </h1>
        <p className="ui-page-lead text-[14px] text-muted">
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
          <h2 className="ui-section-title mb-4">Article 1 (Definitions)</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>&quot;Data&quot; means the 3D scan data provided by Locahun 3D (including PLY, OBJ and ZIP formats) that we captured and produced, or for which the person who captured it (a scan submitter) has granted us permission to sell it.</li>
            <li>&quot;Purchaser&quot; means the corporation or individual that purchases the Data through the Service.</li>
            <li>&quot;Studio&quot; means the filming studio or location facility that is the subject of the scanned Data.</li>
            <li>The operator of the Service and the seller of the Data is Kawaii World Industries Inc. (KWI Inc.; &quot;we&quot;, &quot;us&quot;). Obligations and liabilities of the Service under these terms are borne by us.</li>
          </ol>
        </section>

        <section>
          <h2 className="ui-section-title mb-4">Article 2 (License)</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>The purchase agreement for the Data under these terms is formed when the Purchaser completes the purchase process on the Service, including payment through a payment processor. The price is denominated in Japanese yen and is the amount shown at checkout (tax included).</li>
            <li>The Purchaser may use the Data for <strong>location review, previs and virtual production</strong> in the production of video, film, commercials, drama, music videos and the like, and for other production purposes permitted by the license tier selected at purchase.</li>
            <li>Use of the Data is limited to the Purchaser&apos;s own production team and the people involved in the projects permitted under paragraph 6.</li>
            <li>The license is non-exclusive; the same Data may be provided to other purchasers.</li>
            <li>
              The specific scope of use depends on the license tier selected at purchase. The tier is shown on the purchase receipt.
              <ul className="mt-3 space-y-2 border-l-2 border-line pl-4">
                <li><strong>Indie license</strong> — For individuals or businesses with revenue under JPY 10 million in the past 12 months (one project per purchase). Commercial use OK, including monetized videos, indie games and VRChat worlds. Redistributing or reselling the data as an asset is not permitted. A rights credit is required (paragraph 8).</li>
                <li><strong>Standard license</strong> — Use in commercial &amp; non-commercial productions (one project per purchase). Redistribution or resale of the data itself is not permitted.</li>
                <li><strong>Editorial only</strong> (free) — Limited to news, education and personal use (one project per copy provided). Commercial use such as advertising is not permitted. A rights credit is required when published.</li>
                <li><strong>Extended license</strong> — Unlimited number of projects. Commercial use plus bundling into templates / embedded products and modified redistribution.</li>
                <li><strong>Custom (by arrangement)</strong> — Scope arranged individually. Please contact us before purchasing.</li>
              </ul>
            </li>
            <li>
              Under the standard license, the Indie license and Editorial only, the Data may be used on <strong>one project per purchase (including Data provided free of charge)</strong>. A &quot;project&quot; means a single work produced under the same concept (such as one film, one drama or program series, one commercial or advertising campaign, one music video, one game title, one world or one application), and includes its re-edits, trailers and other-language versions. To use the Data on another project, purchase the Data again or purchase the extended license. The extended license has no limit on the number of projects, but the Article 4 prohibitions apply regardless of the number of projects. This paragraph applies to purchases agreed on or after November 6, 2026; earlier purchases remain subject to the conditions in effect at the time of purchase.
            </li>
            <li>
              <strong>Embedding the Data into a software product — such as a game (web, PC or any other platform) or application — that is provided to third parties as part of that product</strong> (&quot;Embedded Use&quot;) requires the extended license. The standard license covers using the Data to produce works such as video and images only; it does not cover distributing the Data itself bundled inside a software product. However, a purchaser of the Indie license may make Embedded Use <strong>only in one game, world or application that the purchaser itself creates and publishes</strong>. In that case the product must not be distributed in a form that allows the Data to be taken out and reused (such as bundling the source files or providing an asset-export feature).
            </li>
            <li>
              The Indie license may be purchased only by <strong>individuals, or corporations and sole proprietors whose revenue for the 12 months immediately before the purchase date is under JPY 10 million</strong>. The Purchaser declares at purchase that it meets this condition, and we may ask for confirmation as needed. If the declaration is untrue, we may treat the purchase as a purchase of the standard license and request payment of the difference. When publishing a work that uses the Data under the Indie license, the Purchaser shall include a rights credit such as &quot;3D scan: Locahun 3D (locahun3d.com)&quot; in at least one place, such as the description, credits, or the page describing the work or world.
            </li>
            <li>Where the Data is provided <strong>free of charge</strong> (e.g. through a campaign), these terms apply mutatis mutandis, with &quot;Purchaser&quot; read as the recipient of the free Data.</li>
            <li>The Purchaser may <strong>publish still images and videos rendered from the Data on social media</strong>. When publishing, please include a credit to Locahun 3D (e.g. the <span data-i18n-audit-ignore>#ロケハン3D</span> tag or a mention of locahun3d.com). This is subject to the Article 3 obligation to remove Third-Party Material and the Article 4 prohibitions (such as confidential areas).</li>
            <li>The permitted uses of preview images obtained by viewing the Service without purchasing the Data (including camera-tool exports, screenshots and screen recordings), and the conditions for embedding 3D tours, are set out in Articles 5 and 7 of the <Link href={localizedHref("/terms/service", locale)} className="text-accent hover:underline">Terms of Service</Link>.</li>
          </ol>
        </section>

        <section>
          <h2 className="ui-section-title mb-4">Article 3 (Third-party rights captured in the Data)</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>The Data is a scan of a real, physical location, and the captured space may include <strong>advertisements, signage, posters, corporate logos, trademarks, characters or other material in which third parties hold rights</strong> (&quot;Third-Party Material&quot;).</li>
            <li>Copyright, trademark and other rights in any Third-Party Material belong to the relevant third party. Neither the Service nor the Studio grants any license or permission regarding Third-Party Material by providing the Data.</li>
            <li>Before publishing, delivering or distributing any work created using the Data, the Purchaser shall <strong>remove, obscure, blur or replace</strong> any Third-Party Material contained in that work.</li>
            <li>The Service bears no responsibility for any dispute, claim or damages arising from a third party as a result of the Purchaser&apos;s failure to comply with the preceding paragraph; the Purchaser shall resolve any such matter at its own responsibility and expense.</li>
          </ol>
        </section>

        <section>
          <h2 className="ui-section-title mb-4">Article 4 (Prohibited acts)</h2>
          <p className="opacity-80 mb-3">The Purchaser shall not:</p>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>redistribute, resell or lend the Data to third parties;</li>
            <li>
              (Where Embedded Use is made under the extended license or the Indie license, the mere fact that users of the software product could extract the Data through technical analysis does not itself constitute a breach of the preceding item. However, separately distributing, reselling or lending the extracted Data as the Data itself does constitute such a breach.)
            </li>
            <li>reproduce or imitate the Studio facility without permission using the Data;</li>
                        <li>publish a modified version of the Data in a way that could be mistaken for the original Studio;</li>
            <li>sell the Data as an NFT or digital asset;</li>
            <li>publish confidential Studio information contained in the Data (backyards, loading docks, control rooms, etc.) on social media or elsewhere without permission;</li>
            <li>use the Data or derivatives thereof as <strong>training data for machine-learning or generative-AI models</strong> (except with the Service&apos;s prior written permission);</li>
            <li>publish, deliver or distribute a work without removing Third-Party Material as required under Article 3;</li>
            <li>use the Data to damage the reputation or credibility of the scanned venue or its operator;</li>
            <li>use the Data to depict real crimes, accidents or other actual incidents in a way that identifies the scanned venue;</li>
            <li>use the Data in breach of the &ldquo;Venue conditions&rdquo; shown on the property page at the time of purchase (e.g. no alteration or destruction, venue credit).</li>
          </ol>
        </section>

        <section>
          <h2 className="ui-section-title mb-4">Article 5 (Data quality and disclaimer)</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>The Data is a 3D scan of the space at the time of capture and may differ from the facility&apos;s current state.</li>
            <li>The accuracy and resolution of the Data depend on capture conditions and are not guaranteed to be fully accurate.</li>
            <li>Our liability to the Purchaser for damages relating to use of the Data, regardless of the cause of action, is limited to the amount the Purchaser actually paid for the relevant Data, except in cases of our willful misconduct or gross negligence.</li>
          </ol>
        </section>

        <section>
          <h2 className="ui-section-title mb-4">Article 6 (Refunds)</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>Due to the nature of digital data, refunds are not provided after download, except as set out in the next paragraph.</li>
            <li>Where a defect attributable to us (such as corrupted or defective data) is confirmed, the Purchaser may, within <strong>one month</strong> of the purchase date, request a refund or replacement data.</li>
          </ol>
        </section>

        <section>
          <h2 className="ui-section-title mb-4">Article 7 (Handling of confidential information)</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>Data including non-public areas such as backyards, loading routes and control rooms is provided only to production-company accounts (Team plan).</li>
            <li>The Purchaser shall manage such confidential information appropriately and not disclose it to anyone other than project members.</li>
            <li>Where an NDA is required, we may request that one be signed separately.</li>
          </ol>
        </section>

        <section>
          <h2 className="ui-section-title mb-4">Article 8 (Intellectual property)</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>In providing the Data, the Service uses reasonable efforts to obtain the necessary permission from the operator of the scanned Studio.</li>
            <li>Copyright and other intellectual property rights in the Data belong to the Studio owner or the Service. Rights in Third-Party Material are governed by Article 3.</li>
            <li>The only right transferred by purchase is the license set out in Article 2.</li>
          </ol>
        </section>

        <section>
          <h2 className="ui-section-title mb-4">Article 9 (Changes to these terms)</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>We may change these terms when we deem it necessary. When making changes, we will announce the revised terms and their effective date a reasonable period in advance by posting on this page or by other appropriate means.</li>
            <li>Amended terms do not retroactively apply to the disadvantage of Data already purchased (as stated in Article 2.5, the tier conditions selected at purchase continue to apply).</li>
          </ol>
        </section>

        <section>
          <h2 className="ui-section-title mb-4">Article 10 (Governing law and jurisdiction)</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>These terms are governed by the laws of Japan.</li>
            <li>Any dispute shall be subject to the exclusive jurisdiction of the Tokyo District Court as the court of first instance.</li>
          </ol>
        </section>

        <div className="border-t border-line pt-6 mt-10">
          <p className="mono text-[11px] opacity-40">
            Established: June 23, 2026<br />
            Amended: July 16, 2026 (added Article 3 requiring removal of third-party advertisements/signage before use, renumbered subsequent articles; added payment/contract-formation terms to Article 2 and a studio-permission clause to Article 8; clarified in Articles 2 and 4 that embedding into games/software requires the extended license, with the treatment of incidental data extractability)<br />
            Amended: August 4, 2026 (named KWI Inc. as the contracting party in Article 1; noted in Article 2.5 that the Editorial tier is closed to new purchases; replaced the blanket disclaimer in Article 5.3 with a liability cap equal to the price paid, excluding willful misconduct/gross negligence; changed Article 9 to an advance-notice amendment procedure with non-retroactivity for purchased Data)<br />
            Amended: September 19, 2026 (resumed sales of the Editorial tier in Article 2.5; removed the prohibition on providing information to competing facilities from Article 4, and added prohibitions on harming the venue&apos;s reputation, depicting real incidents at an identifiable venue, and breaching per-property venue conditions)<br />
            Amended: October 8, 2026 (Article 1: the Data includes scan-submitted data whose submitter has granted us permission to sell it, and the operator is shown by its registered name; Article 2: preview images and embedding are governed by the Terms of Service; Article 6: where a defect attributable to us is confirmed, the Purchaser may request a refund or replacement data within one month of purchase)<br />
            Amended: November 6, 2026 (added Article 2.6: the standard license and Editorial only are limited to one project per purchase, and the extended license has no limit on the number of projects; renumbered later paragraphs and aligned Article 2.3; applies to purchases agreed on or after this date)<br />
            Amended: November 11, 2026 (added the Indie license to Article 2.5 and aligned Article 2.2 (purpose of use), 2.6 (projects) and 2.7 (Embedded Use) with it; added Article 2.8 on who may purchase the Indie license and renumbered later paragraphs; extended Article 4 item 2 to the Indie license; applies to purchases agreed on or after this date)<br />
            Locahun 3D (operated by Kawaii World Industries Inc. (KWI Inc.))
          </p>
        </div>
      </div>

      <div className="mt-10 text-center">
        <Link
          href={localizedHref("/properties", locale)}
          className="mono text-[10px] tracking-[0.22em] uppercase opacity-50 hover:opacity-100 transition max-[720px]:inline-flex max-[720px]:items-center max-[720px]:min-h-[44px]"
        >
          ← Back to locations
        </Link>
      </div>
    </div>
  );
}
