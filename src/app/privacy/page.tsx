import Link from "next/link";
import { getLocale } from "@/lib/i18n/server";
import { localizedHref } from "@/lib/i18n/dictionaries";

export const metadata = {
  title: "プライバシーポリシー｜ロケハン3D",
};

export default async function PrivacyPage() {
  const locale = await getLocale();
  const en = locale === "en";
  if (en) return <PrivacyEN locale={locale} />;
  return (
    <div className="theme-online max-w-3xl mx-auto px-6 pt-12 pb-12 sm:pb-32">
      <div className="chapter-rule">
        <span className="opacity-60">LEGAL</span>
        <span>Privacy Policy</span>
        <span className="flex-1 h-px bg-current opacity-25" />
      </div>

      <header className="mb-12">
        <h1 className="serif text-[clamp(1.8rem,3.4vw,2.8rem)] font-bold">
          プライバシーポリシー
        </h1>
        <p className="text-[14px] text-muted mt-3">
          Kawaii World Industries株式会社（以下「当社」）は、当社が提供する「ロケハン3D オンライン」（以下「本サービス」）における利用者の個人情報の取扱いについて、以下のとおりプライバシーポリシー（以下「本ポリシー」）を定めます。
        </p>
      </header>

      <div className="prose-terms space-y-10 text-[14px] leading-[1.85]">
        <section>
          <h2 className="serif text-lg mb-4">第1条（取得する情報）</h2>
          <p className="opacity-80 mb-3">当社は本サービスの提供にあたり、以下の情報を取得します。</p>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>アカウント情報: 氏名（表示名）、メールアドレス、認証情報（認証基盤 Clerk を経由して取得）</li>
            <li>登録情報: アカウント種別（個人／撮影スタジオ／制作会社）、会社名・電話番号（任意入力）</li>
            <li>決済情報: 購入履歴、サブスクリプションプラン。クレジットカード番号そのものは当社では保持せず、決済代行会社 Stripe, Inc. が管理します。</li>
            <li>投稿情報: 物件掲示板への投稿、レビュー・評価、ブックマーク、NDA（秘密保持契約）の同意記録</li>
            <li>お問い合わせ情報: お問い合わせフォームに入力された氏名・メールアドレス・電話番号（任意）・利用目的・メッセージ内容</li>
            <li>アクセス情報: ページ閲覧数、参照元、デバイス種別などの統計情報（個人を特定しない集計データ）</li>
            <li>Cookie等: ログイン状態の維持のため、認証基盤が発行するCookieを使用します</li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">第2条（利用目的）</h2>
          <p className="opacity-80 mb-3">取得した情報は、以下の目的で利用します。</p>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>本人確認・ログイン認証のため</li>
            <li>3DGSウォークスルーの閲覧、掲示板・レビュー機能など本サービスの提供のため</li>
            <li>決済処理、請求書発行、購入履歴の管理のため</li>
            <li>お問い合わせへの対応、および掲載物件の連絡先への転送のため</li>
            <li>不正利用・荒らし行為の防止、通報への対応のため</li>
            <li>サービス品質向上のための統計分析のため</li>
            <li>重要なお知らせ（規約改定、メンテナンス等）の通知のため</li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">第3条（第三者提供・委託）</h2>
          <p className="opacity-80 mb-3">当社は、以下の外部サービスに業務を委託し、その範囲で必要な情報を提供します。法令に基づく場合を除き、これら以外の第三者へ個人情報を提供することはありません。</p>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>Clerk（認証基盤）— アカウント登録・ログイン処理</li>
            <li>Stripe, Inc.（決済代行）— クレジットカード決済処理</li>
            <li>Cloudflare, Inc.（インフラ）— サーバー・データベース・ストレージの提供</li>
            <li>Resend（メール配信）— お問い合わせの転送メール送信</li>
            <li>Anthropic, PBC（AI機能）— 物件情報入力時の要約・タグ候補生成の補助（入力内容の一部を処理）</li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">第4条（保存期間）</h2>
          <p className="opacity-80">
            アカウント情報は、退会または削除の申し出があるまで保存します。購入履歴は関連法令に基づく保存義務期間、お問い合わせ情報は対応完了後合理的な期間、それぞれ保存の上で削除します。
          </p>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">第5条（開示・訂正・削除の請求）</h2>
          <p className="opacity-80">
            利用者は、当社が保有する自己の個人情報について、開示・訂正・削除・利用停止を請求できます。アカウント設定画面から直接変更できる項目のほか、第7条のお問い合わせ窓口までご連絡ください。本人確認の上、法令に従い合理的な期間内に対応します。
          </p>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">第6条（本ポリシーの改定）</h2>
          <p className="opacity-80">
            当社は、必要に応じて本ポリシーを改定することがあります。重要な変更を行う場合は、本サービス上での掲示その他適切な方法により利用者に周知します。
          </p>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">第7条（お問い合わせ窓口）</h2>
          <p className="opacity-80">
            本ポリシーに関するお問い合わせは、以下までご連絡ください。
          </p>
          <div className="mt-4 border-t border-line/30 pt-4 space-y-2 opacity-80">
            <p>Kawaii World Industries株式会社</p>
            <p>〒160-0022 東京都新宿区新宿1-24-12 THE GATE 新宿御苑 1F</p>
            <p>
              メールアドレス:{" "}
              <a href="mailto:contact@locahun3d.com" className="text-accent hover:underline">
                contact@locahun3d.com
              </a>
            </p>
          </div>
        </section>

        <div className="border-t border-line pt-6 mt-10">
          <p className="mono text-[11px] opacity-40">
            制定日: 2026年7月11日<br />
            ロケハン3D（運営：Kawaii World Industries株式会社）
          </p>
        </div>
      </div>

      <div className="mt-10 text-center">
        <Link
          href={localizedHref("/", locale)}
          className="mono text-[10px] tracking-[0.22em] uppercase opacity-50 hover:opacity-100 transition"
        >
          ← トップに戻る
        </Link>
      </div>
    </div>
  );
}

function PrivacyEN({ locale }: { locale: "ja" | "en" }) {
  return (
    <div className="theme-online max-w-3xl mx-auto px-6 pt-12 pb-12 sm:pb-32">
      <div className="chapter-rule">
        <span className="opacity-60">LEGAL</span>
        <span>Privacy Policy</span>
        <span className="flex-1 h-px bg-current opacity-25" />
      </div>

      <header className="mb-12">
        <h1 className="serif text-[clamp(1.8rem,3.4vw,2.8rem)] font-bold">
          Privacy Policy
        </h1>
        <p className="text-[14px] text-amber-400/80 mt-3 border border-amber-400/30 bg-amber-400/5 px-3 py-2 rounded">
          This English text is a reference translation. The Japanese version is the
          legally binding document and prevails in case of any discrepancy.
        </p>
        <p className="text-[14px] text-muted mt-3">
          Kawaii World Industries Inc. (&quot;we&quot;, &quot;us&quot;) sets out this Privacy Policy regarding
          the handling of users&apos; personal information in &quot;Locahun 3D Online&quot; (the &quot;Service&quot;).
        </p>
      </header>

      <div className="prose-terms space-y-10 text-[14px] leading-[1.85]">
        <section>
          <h2 className="serif text-lg mb-4">Article 1 (Information We Collect)</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>Account information: name (display name), email address, and authentication data (via our authentication provider, Clerk).</li>
            <li>Registration details: account type (individual / photo studio / production company), company name and phone number (optional).</li>
            <li>Payment information: purchase history and subscription plan. Credit card numbers are not held by us and are managed by our payment processor, Stripe, Inc.</li>
            <li>Content you post: location board comments, reviews and ratings, bookmarks, and NDA (non-disclosure agreement) acceptance records.</li>
            <li>Inquiry information: name, email, phone number (optional), purpose, and message content submitted via contact forms.</li>
            <li>Access information: page views, referrers, and device type as aggregate statistics that do not identify individuals.</li>
            <li>Cookies: cookies issued by our authentication provider to maintain your signed-in session.</li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">Article 2 (Purpose of Use)</h2>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>Identity verification and login authentication.</li>
            <li>Providing the Service, including 3DGS walkthroughs, the board, and reviews.</li>
            <li>Payment processing, invoicing, and purchase history management.</li>
            <li>Responding to inquiries and forwarding them to the relevant listed location.</li>
            <li>Preventing abuse and spam, and handling reports.</li>
            <li>Statistical analysis to improve service quality.</li>
            <li>Sending important notices (terms updates, maintenance, etc.).</li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">Article 3 (Third-Party Sharing &amp; Subprocessors)</h2>
          <p className="opacity-80 mb-3">We use the following external services and share the minimum necessary information with them. We do not share personal information with any other third party except as required by law.</p>
          <ol className="list-decimal pl-6 space-y-2 opacity-80">
            <li>Clerk — account registration and sign-in.</li>
            <li>Stripe, Inc. — credit card payment processing.</li>
            <li>Cloudflare, Inc. — server, database, and storage infrastructure.</li>
            <li>Resend — sending inquiry forwarding emails.</li>
            <li>Anthropic, PBC — AI-assisted summary/tag suggestions when editing listing information.</li>
          </ol>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">Article 4 (Retention Period)</h2>
          <p className="opacity-80">
            Account information is retained until you request account deletion. Purchase history is retained for the period required by applicable law, and inquiry information is retained for a reasonable period after resolution before deletion.
          </p>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">Article 5 (Access, Correction &amp; Deletion Requests)</h2>
          <p className="opacity-80">
            You may request disclosure, correction, deletion, or suspension of use of your personal information that we hold. Some items can be changed directly from your account settings; otherwise, contact us at the address in Article 7. We will respond within a reasonable period after identity verification, in accordance with applicable law.
          </p>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">Article 6 (Changes to this Policy)</h2>
          <p className="opacity-80">
            We may revise this Policy as necessary. Material changes will be announced on the Service or through other appropriate means.
          </p>
        </section>

        <section>
          <h2 className="serif text-lg mb-4">Article 7 (Contact)</h2>
          <div className="mt-4 border-t border-line/30 pt-4 space-y-2 opacity-80">
            <p>Kawaii World Industries Inc.</p>
            <p>THE GATE Shinjuku Gyoen 1F, 1-24-12 Shinjuku, Shinjuku-ku, Tokyo 160-0022, Japan</p>
            <p>
              Email:{" "}
              <a href="mailto:contact@locahun3d.com" className="text-accent hover:underline">
                contact@locahun3d.com
              </a>
            </p>
          </div>
        </section>

        <div className="border-t border-line pt-6 mt-10">
          <p className="mono text-[11px] opacity-40">
            Established: July 11, 2026<br />
            Locahun 3D (operated by Kawaii World Industries Inc.)
          </p>
        </div>
      </div>

      <div className="mt-10 text-center">
        <Link
          href={localizedHref("/", locale)}
          className="mono text-[10px] tracking-[0.22em] uppercase opacity-50 hover:opacity-100 transition"
        >
          ← Back to top
        </Link>
      </div>
    </div>
  );
}
