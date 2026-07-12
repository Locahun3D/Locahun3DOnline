import Link from "next/link";
import { getLocale } from "@/lib/i18n/server";
import { localizedHref } from "@/lib/i18n/dictionaries";

export const metadata = {
  title: "特定商取引法に基づく表記｜ロケハン3D",
};

export default async function TokushohoPage() {
  const locale = await getLocale();
  const en = locale === "en";
  if (en) return <TokushohoEN locale={locale} />;
  return (
    <div className="theme-online max-w-3xl mx-auto px-6 pt-12 pb-12 sm:pb-32">
      <div className="chapter-rule">
        <span className="opacity-60">LEGAL</span>
        <span>Specified Commercial Transactions Act</span>
        <span className="flex-1 h-px bg-current opacity-25" />
      </div>

      <header className="mb-12">
        <h1 className="serif text-[clamp(1.8rem,3.4vw,2.8rem)] font-bold">
          特定商取引法に基づく表記
        </h1>
      </header>

      <div className="prose-terms space-y-8 text-[14px] leading-[1.85]">
        <Row label="販売業者" value="KWI株式会社" />
        <Row label="資本金" value="60万円" />
        <Row label="運営統括責任者" value="中村 航" />
        <Row label="所在地" value="〒160-0022 東京都新宿区新宿1-24-12 THE GATE 新宿御苑 1F" />
        <Row label="電話番号" value="080-4623-0377（受付: 平日 10:00–18:00）" />
        <Row label="メールアドレス" value="contact@locahun3d.com" />
        <Row label="URL" value={<a href="https://locahun3d.com" className="text-accent hover:underline">https://locahun3d.com</a>} />
        <Row
          label="販売価格"
          value="各商品ページに表示する価格（税込）。決済時にStripe手数料等の追加料金はかかりません。"
        />
        <Row
          label="商品代金以外の必要料金"
          value="インターネット接続料金・通信料金はお客様のご負担となります。"
        />
        <Row
          label="支払方法"
          value="クレジットカード（Visa / Mastercard / American Express / JCB）— Stripe経由"
        />
        <Row
          label="支払時期"
          value="購入手続き完了時に即時決済されます。"
        />
        <Row
          label="商品の引渡し時期"
          value="決済完了後、即時ダウンロード可能またはオンラインビューアーでの閲覧が可能となります。"
        />
        <Row
          label="返品・キャンセル"
          value="デジタルデータの性質上、購入後の返品・キャンセルは原則として承りません。データの破損等、当方に起因する不具合が確認された場合は、返金または代替データの提供にて対応いたします。"
        />
        <Row
          label="動作環境"
          value="Google Chrome / Safari / Firefox / Edge の最新版。3Dビューアーの利用にはWebGL 2.0対応ブラウザが必要です。"
        />

        <div className="border-t border-line pt-6 mt-10">
          <p className="mono text-[11px] opacity-40">
            制定日: 2026年7月1日<br />
            ロケハン3D（運営：KWI株式会社）
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

function TokushohoEN({ locale }: { locale: "ja" | "en" }) {
  return (
    <div className="theme-online max-w-3xl mx-auto px-6 pt-12 pb-12 sm:pb-32">
      <div className="chapter-rule">
        <span className="opacity-60">LEGAL</span>
        <span>Specified Commercial Transactions Act</span>
        <span className="flex-1 h-px bg-current opacity-25" />
      </div>

      <header className="mb-12">
        <h1 className="serif text-[clamp(1.8rem,3.4vw,2.8rem)] font-bold">
          Notation Based on the Specified Commercial Transactions Act
        </h1>
        <p className="text-[12px] text-amber-400/80 mt-3 border border-amber-400/30 bg-amber-400/5 px-3 py-2 rounded">
          This English text is a reference translation. The Japanese version is the
          legally binding document and prevails in case of any discrepancy.
        </p>
      </header>

      <div className="prose-terms space-y-8 text-[14px] leading-[1.85]">
        <Row label="Seller" value="KWI Inc." />
        <Row label="Capital" value="¥600,000" />
        <Row label="Operations Manager" value="Ko Nakamura" />
        <Row label="Address" value="THE GATE Shinjuku Gyoen 1F, 1-24-12 Shinjuku, Shinjuku-ku, Tokyo 160-0022, Japan" />
        <Row label="Phone" value="+81-80-4623-0377 (Weekdays 10:00–18:00 JST)" />
        <Row label="Email" value="contact@locahun3d.com" />
        <Row label="URL" value={<a href="https://locahun3d.com" className="text-accent hover:underline">https://locahun3d.com</a>} />
        <Row
          label="Pricing"
          value="As displayed on each product page (tax included). No additional fees are charged at checkout."
        />
        <Row
          label="Additional costs"
          value="Internet connection and data charges are borne by the customer."
        />
        <Row
          label="Payment methods"
          value="Credit card (Visa / Mastercard / American Express / JCB) via Stripe"
        />
        <Row
          label="Payment timing"
          value="Payment is charged immediately upon completing the purchase."
        />
        <Row
          label="Delivery"
          value="Available for immediate download or online viewer access upon payment completion."
        />
        <Row
          label="Returns & cancellations"
          value="Due to the nature of digital data, returns and cancellations after purchase are not accepted as a general rule. If a defect attributable to us (e.g. corrupted data) is confirmed, we will provide a refund or replacement data."
        />
        <Row
          label="System requirements"
          value="Latest version of Google Chrome / Safari / Firefox / Edge. WebGL 2.0 compatible browser required for the 3D viewer."
        />

        <div className="border-t border-line pt-6 mt-10">
          <p className="mono text-[11px] opacity-40">
            Established: July 1, 2026<br />
            Locahun 3D (operated by KWI Inc.)
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

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-4 border-b border-line/30 pb-4">
      <dt className="mono text-[12px] tracking-wider opacity-60 uppercase pt-0.5">
        {label}
      </dt>
      <dd className="opacity-80">{value}</dd>
    </div>
  );
}
