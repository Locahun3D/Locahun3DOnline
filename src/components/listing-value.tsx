/**
 * 掲載依頼ページの「費用」と「掲載すると何が起きるか」を示すブロック。
 *
 * ── 2026-08-13 リデザイン ──────────────────────────────────
 * 以前は 10px の mono ラベルと帯グラフ・3列レイアウトで情報が細かく散っており、
 * 「細々していて見づらい」との指摘を受けた。読み取ってほしい順（①いくらか →
 * ②いつまでか → ③何が起きるか）に沿って、金額を大きな数字で先に出し、
 * 補足を本文サイズに引き上げた。帯グラフは「長さの違い」を読み解く必要があり、
 * 2枚のカードで「期限なし / 2026年12月31日まで」と書く方が速い。
 *
 * ⚠ 数字・条件はサイト内の他の記述と必ず一致させること（実測の出所）:
 *     app/contact/page.tsx のQ&A  … 「今後もスキャン以降の掲載費は無料です」
 *     app/contact/[type]/page.tsx … 「キャンペーンにより掲載費は無料（2026年12月31日まで）」
 *     app/about/page.tsx          … 「約20分のスキャン1回で掲載」「内覧対応を削減」
 *                                    「問い合わせが直接届く」
 *   ここだけ良く見せるために盛らない（実態と違う約束になる）。
 *
 * ⚠ `bg-card` はこのプロジェクトに定義が無く（globals.css の @theme に
 *   --color-card は無い）背景が付かない。カードは `bg-white` を使うこと。
 */
import Link from "next/link";
import { localizedHref } from "@/lib/i18n/dictionaries";

const FREE_UNTIL = "2026年12月31日";
/** データ販売分配率。/terms/listing-revenue-share と必ず一致させること。 */
const DATA_SALE_SHARE = "20%";

export default function ListingValue({ en }: { en: boolean }) {
  const locale = en ? "en" : "ja";

  const costs = [
    {
      label: en ? "Listing" : "掲載",
      term: en ? "No end date" : "期限なし",
      termAccent: true,
      body: en
        ? "No monthly fee and no commission on bookings, for as long as you stay listed."
        : "公開後もずっと無料です。月額費用も成約手数料もいただきません。",
    },
    {
      label: en ? "3D scan" : "3Dスキャン計測",
      term: en ? `Free through Dec 31, ${FREE_UNTIL.slice(0, 4)}` : `${FREE_UNTIL}まで`,
      termAccent: false,
      body: en
        ? "One visit of about 20 minutes. Only this part is tied to the campaign period."
        : "1回・約20分の訪問撮影です。期限が付くのはこの計測費だけです。",
    },
  ];

  const benefits = [
    {
      no: "01",
      title: en ? "Found before the location scout" : "ロケハン前に見つかる",
      body: en
        ? "Your space appears in the catalog that crews search before they visit anywhere."
        : "撮影前に候補を探しているチームのカタログに載ります。現地に行く前の比較検討で候補に入ります。",
    },
    {
      no: "02",
      title: en ? "Fewer walk-in viewings" : "内覧対応を減らせる",
      body: en
        ? "Crews walk the space in 3D first, so only serious candidates ask to visit."
        : "先にブラウザで空間を歩いて確認してもらえるため、実際に見に来るのは本気の候補だけになります。",
    },
    {
      no: "03",
      title: en ? "Inquiries reach you directly" : "問い合わせが直接届く",
      body: en
        ? "Messages from your property page are forwarded to the address you register."
        : "物件ページのフォームから届いた問い合わせは、ご登録のアドレスへそのまま転送されます。",
    },
    {
      no: "04",
      title: en ? `${DATA_SALE_SHARE} of data sales, paid to you` : `データが売れたら${DATA_SALE_SHARE}を分配`,
      body: en
        ? `If your property's 3D data (PLY/OBJ) sells, ${DATA_SALE_SHARE} of the revenue is paid to you. Settled quarterly.`
        : `物件の3Dデータ（PLY/OBJ）が売れた場合、売上の${DATA_SALE_SHARE}を分配します。四半期ごとに精算します。`,
    },
  ];

  return (
    <div className="mb-12 space-y-10">
      {/* ── 費用 ─────────────────────────────────────────── */}
      <section>
        <h2 className="text-[17px] font-bold mb-1.5">
          {en ? "What it costs" : "掲載にかかる費用"}
        </h2>
        <p className="text-[13px] text-muted leading-[1.8] mb-4">
          {en ? (
            <>
              Both are free right now. Only the scan fee is tied to the campaign
              <br className="pc" /> — the listing itself has no end date.
            </>
          ) : (
            <>
              どちらも無料です。期限が付くのはスキャン計測費だけで、
              <br className="pc" />
              掲載そのものに期限はありません。
            </>
          )}
        </p>

        <div className="grid sm:grid-cols-2 gap-3">
          {costs.map((c) => (
            <div key={c.label} className="border border-line bg-white px-6 py-5">
              <div className="text-[13px] font-bold mb-2">{c.label}</div>
              <div className="flex items-baseline gap-3 mb-3">
                <span className="serif text-[36px] leading-none text-accent tabular-nums">¥0</span>
                <span
                  className={`text-[12px] leading-[1.5] ${
                    c.termAccent ? "text-accent font-bold" : "text-muted"
                  }`}
                >
                  {c.term}
                </span>
              </div>
              <p className="text-[13px] text-muted leading-[1.85]">{c.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── メリット ─────────────────────────────────────── */}
      <section>
        <h2 className="text-[17px] font-bold mb-1.5">
          {en ? "What listing does for you" : "掲載するとどうなるか"}
        </h2>
        <p className="text-[13px] text-muted leading-[1.8] mb-4">
          {en
            ? "Four things change once your space is on Locahun 3D."
            : "ロケハン3Dに載ると、次の4つが変わります。"}
        </p>

        {/* 2カラムまで。本文カラムが狭い環境で3等分すると1行10文字程度に
            折り返して読めなくなる（実測済み・過去に差し戻した）。 */}
        <div className="grid sm:grid-cols-2 gap-3">
          {benefits.map((b) => (
            <div key={b.no} className="border border-line bg-white px-6 py-5">
              <div className="mono text-[10px] tracking-[0.24em] text-accent mb-2">{b.no}</div>
              <div className="text-[14px] font-bold leading-[1.6] mb-1.5">{b.title}</div>
              <p className="text-[13px] text-muted leading-[1.9]">{b.body}</p>
            </div>
          ))}
        </div>

        <p className="text-[12px] text-muted mt-3">
          {en ? "Details: " : "詳細: "}
          <Link
            href={localizedHref("/terms/listing-revenue-share", locale)}
            className="text-accent hover:underline"
          >
            {en ? "Listing Data Revenue Share Terms" : "掲載データ販売分配規約"}
          </Link>
        </p>
      </section>
    </div>
  );
}
