import Link from "next/link";
import { getLocale } from "@/lib/i18n/server";
import { localizedHref } from "@/lib/i18n/dictionaries";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: locale === "en" ? "Terms of Service" : "利用規約｜ロケハン3D",
  };
}

export default async function TermsServicePage() {
  const locale = await getLocale();
  const en = locale === "en";
  if (en) return <TermsServiceEN locale={locale} />;
  return (
    <div className="theme-online max-w-3xl mx-auto px-6 pt-6 sm:pt-12 pb-12 sm:pb-32">
      <div className="chapter-rule">
        <span className="opacity-60">TERMS</span>
        <span>Terms of Service</span>
        <span className="flex-1 h-px bg-current opacity-25" />
      </div>

      <header className="mb-12">
        <h1 className="serif text-[clamp(1.8rem,3.4vw,2.8rem)] font-bold">
          利用規約
        </h1>
        <p className="text-[14px] text-muted mt-3">
          本規約は、KWI株式会社（以下「当社」）が提供する「ロケハン3D オンライン」（以下「本サービス」）の利用条件を定めるものです。利用者は、本サービスを利用することにより本規約に同意したものとみなします。3Dデータの購入に関する条件は別途<Link href={localizedHref("/terms/data-download", locale)} className="text-accent hover:underline">3Dデータ購入規約</Link>に定めます。
        </p>
      </header>

      <div className="prose-terms space-y-10 text-[14px] leading-[1.85]">
        <section>
          <h2 className="serif text-lg mb-4">第1条（適用）</h2>
          <p className="opacity-80">
            本規約は、本サービスの利用に関する当社と利用者との間の一切の関係に適用されます。当社が本サービス上で掲示する個別のガイドライン等は、本規約の一部を構成します。
          </p>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">第2条（アカウント登録）</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>利用者は、真実かつ正確な情報を登録するものとします。</li>
            <li>アカウントは登録者本人のみが利用でき、第三者への譲渡・貸与はできません。</li>
            <li>制作会社（production）区分での登録は、当社の承認をもって有効となります。当社は登録内容に基づき承認可否を判断します。</li>
            <li>撮影スタジオ（studio）区分は、自らの物件（スタジオ・ロケーション施設）の掲載・管理を目的とする区分です。当区分での登録者は、有料プラン（サブスクリプション）への加入、閲覧用トークンの購入、および自己が所有・管理する物件以外の3Dデータの購入・視聴の対象外とします。</li>
            <li>ゲスト（guest）区分は、当社が招待した利用者に付与される区分です。招待時に付与されるトークンには有効期限がありません。</li>
            <li>登録情報に変更が生じた場合、利用者は速やかに最新の内容へ更新するものとします。</li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">第3条（料金・トークン）</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>本サービスの一部機能は有料プラン（サブスクリプション）への加入を要します。料金は<Link href={localizedHref("/pricing", locale)} className="text-accent hover:underline">料金ページ</Link>に表示する金額（税込）とします。</li>
            <li>3DGSウォークスルーの閲覧はトークン消費制です。トークンの付与・失効条件は料金ページおよびアカウント画面の表示に従います。</li>
            <li>決済はStripe, Inc.を通じて処理されます。支払方法の詳細は<Link href={localizedHref("/terms/tokushoho", locale)} className="text-accent hover:underline">特定商取引法に基づく表記</Link>をご確認ください。</li>
            <li>デジタルサービスの性質上、原則として返金には応じません。ただし当社に起因する不具合が確認された場合はこの限りではありません。</li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">第4条（禁止事項）</h2>
          <p className="opacity-80 mb-3">利用者は、本サービスの利用にあたり、以下の行為をしてはなりません。</p>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>法令または公序良俗に違反する行為</li>
            <li>当社、他の利用者、または第三者の知的財産権・肖像権・プライバシー等の権利を侵害する行為</li>
            <li>掲示板機能への虚偽の投稿、誹謗中傷、スパム行為、または通報機能を悪用する行為</li>
            <li>不正アクセス、リバースエンジニアリング、本サービスへの過度な負荷をかける行為</li>
            <li>3Dスキャンデータやアカウント情報を無断で第三者に提供・転売する行為</li>
            <li>複数アカウントの不正取得、または他人になりすます行為</li>
            <li>その他、当社が不適切と判断する行為</li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">第5条（知的財産権）</h2>
          <p className="opacity-80 mb-3">
            本サービスに関する著作権・商標権その他の知的財産権は、当社または正当な権利を有する第三者に帰属します。利用者が投稿した掲示板の著作権は投稿者に留保されますが、利用者は当社に対し、本サービスの提供・運営・宣伝に必要な範囲で当該投稿を利用（複製・表示等）する権利を許諾するものとします。
          </p>
          {/* ⚠ 2段階の穴があった（2026-08-02指摘・対応）。
              ①3Dビューアーのカメラツールは、データを購入していない閲覧者
                （サブスク/トークンで見られる人）でも、カメラ情報付きJPEGを書き出せる。
              ②ウォークスルーは実データ（RAD/splat等）をブラウザへストリーミングする
                以上、技術的な解析・通信傍受等により3Dスキャンデータ自体を
                取得しうる状態も生じる。
              第6条・データ購入規約は「購入したデータ」にしかかからないため、
              購入せずに得た画像・データがAI学習・再配布の縛りを回避できてしまう
              穴があった。第6条と同じ制限をここで及ぼす。禁止事項自体は第4条5号
              （3Dスキャンデータの無断提供・転売の禁止）で既にカバーされているが、
              AI学習利用の扱いが「本データ」＝購入データに限定されていたため、
              閲覧のみで取得したデータには及んでいなかった。 */}
          <p className="opacity-80">
            本サービスの閲覧（ウォークスルー・カメラツールによるJPEG書き出しを含みます）を通じて利用者が取得した画像・スクリーンショット等、および当該閲覧を通じて技術的な手段により取得しうる3Dスキャンデータ自体についても、購入の有無にかかわらず、第6条に定める3Dデータのライセンス分類と同様に、<strong>データ自体の再配布・転売、および機械学習・生成AIモデルの学習データとしての利用</strong>には、当社との事前のご相談・個別の書面合意が必要です。
          </p>
        </section>

        {/* 3Dデータのライセンス分類は「データ購入規約」に詳細があるが、利用規約側に
            一切の説明が無く、買い手が分類の存在に気付けなかったため概要を置く。
            条文の詳細はデータ購入規約が正であることを明記し、重複定義を避ける。 */}
        <section>
          <h2 className="serif text-lg mb-4">第6条（3Dデータのライセンス分類）</h2>
          <p className="opacity-80 mb-3">
            本サービスで販売する3Dデータには、利用できる範囲の異なる次のライセンス分類があります。購入時に分類を選択いただきます。
          </p>
          <ul className="opacity-80 space-y-1.5 list-disc pl-5 mb-3">
            <li>
              <strong>標準ライセンス</strong> — 商用・非商用の制作物（映像・画像等の制作）に利用できます。データ自体の再配布・再販はできません。
            </li>
            <li>
              <strong>拡張ライセンス</strong> — 標準の範囲に加え、テンプレートやソフトウェア製品への同梱・改変配布ができます。ゲーム・アプリケーション等に組み込む場合はこの分類が必要です。
            </li>
            <li>
              <strong>カスタム</strong> — 上記に当てはまらない利用範囲を個別に取り決めます。購入前にお問い合わせください。
            </li>
          </ul>
          <p className="opacity-80 mb-3">
            <strong>いずれの分類においても</strong>、データ自体の再配布・転売・貸与、および
            <strong>機械学習・生成AIモデルの学習データとしての利用</strong>には、当社との事前のご相談・個別の書面合意が必要です。用途によって条件が異なるため、ご希望の場合はお気軽にお問い合わせください。
          </p>
          <p className="opacity-80">
            各分類の詳細な条件・禁止事項は
            <Link href="/terms/data-download" className="text-accent hover:underline">
              データ購入規約
            </Link>
            に定めるところによります。本条と当該規約の内容が異なる場合は、データ購入規約が優先します。
          </p>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">第7条（ホスティング商品）</h2>
          {/* ⚠ 2026-08-10に価格モデルを変更（本人判断）。旧: 一括の「スキャン代金10万円＋交通費」
              → 新: データ販売価格の20%/年（従価）＋ホスティング契約時はスキャン費用無料。
              初期費用という決裁ハードルを消して継続収益へ振り替える設計（D-008の
              「スキャン=資産+CAC、回収はホスティングで」の枠組みに沿う）。 */}
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>当社は、物件ページの3Dツアーを利用者自身のウェブサイト等に埋め込み表示できる機能、およびそのアクセス解析（以下「ホスティング商品」）を、当社が発行するコードを通じて提供します。</li>
            <li>ホスティング商品は、2026年中は無償で提供します。2027年以降の料金は、対象物件の3Dデータ販売価格の<strong>20%に相当する額を年額</strong>とします。販売価格は当社が定めるものとし、当該物件の3Dデータを販売していない場合も、当社が定める参考販売価格を基準として年額を算定します。</li>
            <li>ホスティング商品をお申し込みいただく場合、対象物件のスキャン費用は無償とします。この場合において、ホスティング契約の開始から3年未満で解約されるときは、スキャン費用相当額（10万円・税別）に残存年数を3で除した割合を乗じた額を精算していただきます。</li>
            <li>利用者は、当社が発行した埋め込みコードを、当社の指定する範囲を超えて第三者に譲渡・再配布してはなりません。</li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">第8条（投稿コンテンツの管理）</h2>
          <p className="opacity-80">
            当社は、利用者の投稿が第4条各号に該当すると判断した場合、事前の通知なく当該投稿の削除、非表示化、またはアカウントの利用制限を行うことができます。通報が一定件数に達した投稿は自動的に非表示となる場合があります。
          </p>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">第9条（サービスの停止・変更）</h2>
          <p className="opacity-80">
            当社は、システムの保守・点検、天災その他やむを得ない事由がある場合、利用者への事前告知なく本サービスの全部または一部の提供を停止・変更することがあります。当社は、これにより利用者に生じた損害について、当社の故意または重過失による場合を除き、責任を負いません。
          </p>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">第10条（退会・利用制限・登録抹消）</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>利用者は、当社所定の方法により、いつでもアカウントの削除（退会）を申し出ることができます。退会後の個人情報の取扱いは<Link href={localizedHref("/privacy", locale)} className="text-accent hover:underline">プライバシーポリシー</Link>によります。</li>
            <li>当社は、利用者が本規約に違反した場合、事前の通知なく当該利用者に対する本サービスの利用を制限し、またはアカウント登録を抹消することができます。</li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">第11条（免責事項）</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>当社は、本サービスに掲載される物件情報・3Dスキャンデータの正確性・完全性を保証するものではありません。実際の撮影可否・許可要件は、利用者ご自身で各物件の管理者・関係機関にご確認ください。</li>
            <li>当社は、利用者間または利用者と第三者との間で生じたトラブルについて、一切の責任を負いません。</li>
            {/* ⚠「直近1ヶ月分の利用料金」だけだと無料ユーザーは上限0円=実質全部免責となり、
                消費者契約法8条で条項ごと無効になるリスクがあった（2026-08-04リーガル点検）。
                故意・重過失のカーブアウト明示＋無償利用時の下限額で手当て。 */}
            <li>当社の債務不履行または不法行為により利用者に生じた損害の賠償責任は、当社の故意または重過失による場合を除き、利用者が当該サービスに支払った直近1ヶ月分の利用料金（無償で利用している場合は金10,000円）を上限とします。</li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">第12条（規約の変更）</h2>
          {/* ⚠ 旧文言「通知なく変更できる」は民法548条の4（定型約款の変更）の
              周知要件を満たさず無効リスクがあった（2026-08-04リーガル点検）。
              事前周知＋効力発生時期の明示＋不同意時の退会導線に改めた。 */}
          <p className="opacity-80">
            当社は、民法第548条の4の規定に基づき、本規約を変更することがあります。変更を行う場合、当社は、変更後の規約の内容および効力発生時期を、効力発生時期の相当期間前までに本サービス上への掲示その他適切な方法により周知します。変更後の規約に同意いただけない場合、利用者は効力発生前に第10条の退会を申し出ることができます。
          </p>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">第13条（準拠法・管轄裁判所）</h2>
          <p className="opacity-80">
            本規約の解釈にあたっては日本法を準拠法とします。本サービスに関して紛争が生じた場合には、東京地方裁判所を第一審の専属的合意管轄裁判所とします。
          </p>
        </section>

        <div className="border-t border-line pt-6 mt-10">
          <p className="mono text-[11px] opacity-40">
            制定日: 2026年7月11日<br />
            改定日: 2026年7月23日（第6条として3Dデータのライセンス分類を新設し、以降の条項を繰り下げ。再配布・AI学習利用は事前のご相談・個別合意により可能とする方針を明記）<br />
            改定日: 2026年8月2日（第2条に撮影スタジオ・ゲスト区分の利用条件を追記／第7条としてホスティング商品を新設し、以降の条項を繰り下げ／第5条に、閲覧を通じて取得した画像・スクリーンショットおよび技術的手段により取得しうる3Dデータ自体について、購入データと同様の再配布・AI学習利用制限を追記）<br />
            改定日: 2026年8月4日（第10条に利用者からの退会手続きを追記／第11条3項の賠償上限に故意・重過失の除外と無償利用時の下限額を明記／第12条の規約変更手続きを事前周知方式に変更）<br />
            改定日: 2026年8月10日（第7条のホスティング商品の料金を、2027年以降は3Dデータ販売価格の20%の年額とする従価方式に変更。あわせてホスティング商品をお申し込みの場合のスキャン費用の無償化と、3年未満での解約時の精算を追記）<br />
            ロケハン3D（運営：KWI株式会社）
          </p>
        </div>
      </div>

      <div className="mt-10 text-center">
        <Link
          href={localizedHref("/", locale)}
          className="mono text-[10px] tracking-[0.22em] uppercase opacity-50 hover:opacity-100 transition max-[720px]:inline-flex max-[720px]:items-center max-[720px]:min-h-[44px]"
        >
          ← トップに戻る
        </Link>
      </div>
    </div>
  );
}

function TermsServiceEN({ locale }: { locale: "ja" | "en" }) {
  return (
    <div className="theme-online max-w-3xl mx-auto px-6 pt-6 sm:pt-12 pb-12 sm:pb-32">
      <div className="chapter-rule">
        <span className="opacity-60">TERMS</span>
        <span>Terms of Service</span>
        <span className="flex-1 h-px bg-current opacity-25" />
      </div>

      <header className="mb-12">
        <h1 className="serif text-[clamp(1.8rem,3.4vw,2.8rem)] font-bold">
          Terms of Service
        </h1>
        <p className="text-[14px] text-amber-400/80 mt-3 border border-amber-400/30 bg-amber-400/5 px-3 py-2 rounded">
          This English text is a reference translation. The Japanese version is the
          legally binding document and prevails in case of any discrepancy.
        </p>
        <p className="text-[14px] text-muted mt-3">
          These Terms of Service (&quot;Terms&quot;) set out the conditions for using &quot;Locahun 3D
          Online&quot; (the &quot;Service&quot;) provided by KWI Inc. (&quot;we&quot;, &quot;us&quot;). By
          using the Service, you are deemed to have agreed to these Terms. Terms specific
          to purchasing 3D data are set out separately in the{" "}
          <Link href={localizedHref("/terms/data-download", locale)} className="text-accent hover:underline">
            3D Data Purchase Agreement
          </Link>
          .
        </p>
      </header>

      <div className="prose-terms space-y-10 text-[14px] leading-[1.85]">
        <section>
          <h2 className="serif text-lg mb-4">Article 1 (Application)</h2>
          <p className="opacity-80">
            These Terms apply to all relationships between us and users regarding use of the Service. Any individual guidelines we post on the Service form part of these Terms.
          </p>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">Article 2 (Account Registration)</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>Users must register true and accurate information.</li>
            <li>Accounts may only be used by the registered individual and may not be transferred or lent to third parties.</li>
            <li>Registration as a &quot;production company&quot; requires our approval, which we grant at our discretion based on the submitted information.</li>
            <li>The &quot;studio&quot; account type is for listing and managing your own property (studio or location facility). Studio accounts are not eligible to subscribe to a paid plan, purchase viewing tokens, or purchase/view 3D data for properties other than their own.</li>
            <li>The &quot;guest&quot; account type is granted to users we invite. Tokens granted upon invitation do not expire.</li>
            <li>Users must promptly update their registration information when it changes.</li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">Article 3 (Fees &amp; Tokens)</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>Some features require a paid subscription plan. Fees are as shown (tax included) on the <Link href={localizedHref("/pricing", locale)} className="text-accent hover:underline">Pricing page</Link>.</li>
            <li>Viewing 3DGS walkthroughs consumes tokens. Token grants and expiry follow the terms shown on the Pricing page and account screen.</li>
            <li>Payments are processed via Stripe, Inc. See the <Link href={localizedHref("/terms/tokushoho", locale)} className="text-accent hover:underline">Specified Commercial Transactions Act notice</Link> for payment details.</li>
            <li>Given the nature of digital services, refunds are not provided as a general rule, except where a defect attributable to us is confirmed.</li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">Article 4 (Prohibited Conduct)</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>Acts that violate laws or public order and morals.</li>
            <li>Infringing our, other users&apos;, or third parties&apos; intellectual property, portrait, or privacy rights.</li>
            <li>Posting false content, harassment, spam, or abusing the report function on the board or reviews.</li>
            <li>Unauthorized access, reverse engineering, or placing excessive load on the Service.</li>
            <li>Redistributing or reselling 3D scan data or account information to third parties without authorization.</li>
            <li>Fraudulently obtaining multiple accounts or impersonating another person.</li>
            <li>Any other conduct we deem inappropriate.</li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">Article 5 (Intellectual Property)</h2>
          <p className="opacity-80 mb-3">
            Copyrights, trademarks, and other intellectual property rights relating to the Service belong to us or to third parties with legitimate rights. Copyright in board posts and reviews submitted by users remains with the user, but the user grants us a license to use (reproduce, display, etc.) such content to the extent necessary to provide, operate, and promote the Service.
          </p>
          <p className="opacity-80">
            Images and screenshots obtained by a user through viewing the Service (including JPEGs exported via the camera tool during a walkthrough), and any 3D scan data itself that may be obtainable through technical means during such viewing, are subject to the same restrictions as the 3D data license categories in Article 6 regardless of whether the data was purchased: <strong>redistributing or reselling the data itself, and using it as training data for machine-learning or generative-AI models</strong>, require our prior consultation and individual written agreement.
          </p>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">Article 6 (3D Data License Categories)</h2>
          <p className="opacity-80 mb-3">
            3D data sold on the Service is offered under license categories with different permitted scopes. You select a category at the time of purchase.
          </p>
          <ul className="opacity-80 space-y-1.5 list-disc pl-5 mb-3">
            <li>
              <strong>Standard license</strong> — use in commercial and non-commercial productions (film, imagery, etc.). Redistribution or resale of the data itself is not permitted.
            </li>
            <li>
              <strong>Extended license</strong> — in addition to the Standard scope, bundling into templates or software products and modified redistribution. Embedding into games, applications, and similar products requires this category.
            </li>
            <li>
              <strong>Custom</strong> — scopes not covered above are arranged individually. Please contact us before purchasing.
            </li>
          </ul>
          <p className="opacity-80 mb-3">
            <strong>Under every category</strong>, redistributing, reselling, or lending the data itself, and <strong>using the data as training data for machine-learning or generative-AI models</strong>, require our prior consultation and individual written agreement. Terms vary by intended use, so please feel free to contact us if you are interested.
          </p>
          <p className="opacity-80">
            Detailed conditions and prohibited acts for each category are set out in the{" "}
            <Link href="/en/terms/data-download" className="text-accent hover:underline">
              Data Purchase Terms
            </Link>
            . If this Article and those terms differ, the Data Purchase Terms prevail.
          </p>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">Article 7 (Hosting Product)</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>We provide a feature that lets you embed a property&apos;s 3D tour on your own website or elsewhere, together with access analytics (the &quot;Hosting Product&quot;), via embed code we issue.</li>
            <li>The Hosting Product is provided free of charge through the end of 2026. From 2027 onward, the annual fee is <strong>20% of the 3D data sale price</strong> for the property. We set the sale price; where the property&apos;s 3D data is not offered for sale, the annual fee is calculated against a reference sale price we determine.</li>
            <li>If you subscribe to the Hosting Product, the scan fee for the property is waived. If you cancel within three years of the hosting subscription start date, you will be charged the scan fee equivalent (¥100,000, excl. tax) multiplied by the remaining years divided by three.</li>
            <li>Users may not transfer or redistribute embed codes we issue to third parties beyond the scope we specify.</li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">Article 8 (Content Moderation)</h2>
          <p className="opacity-80">
            If we determine that a post violates Article 4, we may remove or hide it, or restrict the user&apos;s account, without prior notice. Posts that receive a certain number of reports may be automatically hidden.
          </p>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">Article 9 (Suspension &amp; Changes)</h2>
          <p className="opacity-80">
            We may suspend or change all or part of the Service without prior notice for maintenance, inspection, force majeure, or other unavoidable reasons. We are not liable for any resulting damages except where caused by our willful misconduct or gross negligence.
          </p>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">Article 10 (Withdrawal, Restriction &amp; Termination)</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>Users may request deletion of their account (withdrawal) at any time by the method we designate. Handling of personal information after withdrawal is governed by the <Link href={localizedHref("/privacy", locale)} className="text-accent hover:underline">Privacy Policy</Link>.</li>
            <li>We may restrict a user&apos;s access to the Service or terminate their account without prior notice if the user violates these Terms.</li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">Article 11 (Disclaimer)</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>We do not guarantee the accuracy or completeness of listing information or 3D scan data on the Service. Users should confirm actual filming permission requirements directly with each location&apos;s manager or the relevant authorities.</li>
            <li>We are not liable for disputes arising between users or between a user and a third party.</li>
            <li>Except in cases of our willful misconduct or gross negligence, our liability for damages arising from our breach of contract or tort is limited to the amount the user paid for the Service in the most recent one-month period (or ¥10,000 if the user uses the Service free of charge).</li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">Article 12 (Changes to these Terms)</h2>
          <p className="opacity-80">
            We may change these Terms pursuant to Article 548-4 of the Civil Code of Japan. When making changes, we will announce the revised Terms and their effective date a reasonable period in advance by posting on the Service or by other appropriate means. If you do not agree to the revised Terms, you may withdraw your account under Article 10 before they take effect.
          </p>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">Article 13 (Governing Law &amp; Jurisdiction)</h2>
          <p className="opacity-80">
            These Terms are governed by the laws of Japan. The Tokyo District Court shall have exclusive jurisdiction as the court of first instance for any disputes relating to the Service.
          </p>
        </section>

        <div className="border-t border-line pt-6 mt-10">
          <p className="mono text-[11px] opacity-40">
            Established: July 11, 2026<br />
            Revised: July 23, 2026 (added Article 6 on 3D data license categories and the prohibition of AI-training use; renumbered subsequent articles)<br />
            Revised: August 2, 2026 (added studio/guest account terms to Article 2; added Article 7 on the Hosting Product, renumbering subsequent articles; added to Article 5 that images/screenshots obtained while viewing, and 3D data itself obtainable by technical means during viewing, are subject to the same redistribution/AI-training restrictions as purchased data)<br />
            Revised: August 4, 2026 (added user-initiated withdrawal to Article 10; added willful-misconduct/gross-negligence carve-out and a floor amount for free users to the liability cap in Article 11; changed Article 12 to an advance-notice amendment procedure)<br />
            Revised: August 10, 2026 (changed the Hosting Product fee in Article 7 to an ad valorem annual fee of 20% of the 3D data sale price from 2027 onward; added the scan-fee waiver for hosting subscribers and the settlement due on cancellation within three years)<br />
            Locahun 3D (operated by KWI Inc.)
          </p>
        </div>
      </div>

      <div className="mt-10 text-center">
        <Link
          href={localizedHref("/", locale)}
          className="mono text-[10px] tracking-[0.22em] uppercase opacity-50 hover:opacity-100 transition max-[720px]:inline-flex max-[720px]:items-center max-[720px]:min-h-[44px]"
        >
          ← Back to top
        </Link>
      </div>
    </div>
  );
}
