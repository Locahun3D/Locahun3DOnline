/**
 * 掲載依頼ページの「費用」と「掲載すると何が起きるか」を図で示すブロック。
 *
 * ── なぜ図なのか ────────────────────────────────────────────
 * 費用の説明が文章だと「無料キャンペーン（2026年12月31日まで）」だけが目に入り、
 * **掲載費そのものは期限なしで無料**という一番効く事実が埋もれる。
 * 期限が付くのはスキャン計測費だけなので、2本の帯の長さの違いで一目で分かるようにした。
 *
 * ⚠ 数字・条件はサイト内の他の記述と必ず一致させること（実測の出所）:
 *     app/contact/page.tsx のQ&A  … 「今後もスキャン以降の掲載費は無料です」
 *     app/contact/[type]/page.tsx … 「キャンペーンにより掲載費は無料（2026年12月31日まで）」
 *     app/about/page.tsx          … 「約20分のスキャン1回で掲載」「内覧対応を削減」
 *                                    「問い合わせが直接届く」
 *   ここだけ良く見せるために盛らない（実態と違う約束になる）。
 */
import Link from "next/link";
import { localizedHref } from "@/lib/i18n/dictionaries";

const FREE_UNTIL = "2026年12月31日";
/** データ販売分配率。/terms/listing-revenue-share と必ず一致させること。 */
const DATA_SALE_SHARE = "20%";

export default function ListingValue({ en }: { en: boolean }) {
  const locale = en ? "en" : "ja";
  const rows = [
    {
      label: en ? "3D scan" : "3Dスキャン計測",
      sub: en ? "One ~20-min visit" : "1回・約20分",
      // 期間限定なので帯を途中で止める。
      width: "46%",
      capped: true,
      note: en ? `Free through Dec 31, ${FREE_UNTIL.slice(0, 4)}` : `${FREE_UNTIL}まで`,
    },
    {
      label: en ? "Listing" : "掲載",
      sub: en ? "After publication, ongoing" : "公開後・ずっと",
      width: "100%",
      capped: false,
      note: en ? "No end date" : "期限なし",
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
    <div className="mb-10 space-y-8">
      {/* ── 費用 ── */}
      <section>
        <h2 className="mono text-[10px] tracking-[0.24em] uppercase text-accent mb-3">
          {en ? "What it costs" : "掲載にかかる費用"}
        </h2>

        <div className="border border-line bg-card">
          {rows.map((r, i) => (
            <div
              key={r.label}
              className={`px-5 py-4 sm:flex sm:items-center sm:gap-5 ${i > 0 ? "border-t border-line" : ""}`}
            >
              <div className="sm:w-[150px] shrink-0">
                <div className="text-[13px] font-bold">{r.label}</div>
                <div className="mono text-[10px] text-muted mt-0.5">{r.sub}</div>
              </div>

              {/* 帯の長さ＝無料でいられる期間。止まる/続くを線の終わり方で示す。 */}
              <div className="flex-1 min-w-0 mt-2 sm:mt-0 flex items-center gap-3">
                <div className="relative flex-1 h-[10px] bg-line/40">
                  <div
                    className="absolute inset-y-0 left-0 bg-accent/70"
                    style={{ width: r.width }}
                  />
                  {r.capped ? (
                    // 期限で切れることを示す縦棒
                    <span
                      className="absolute top-[-5px] bottom-[-5px] w-px bg-ink"
                      style={{ left: r.width }}
                      aria-hidden="true"
                    />
                  ) : (
                    <span
                      className="absolute right-[-9px] top-1/2 -translate-y-1/2 text-accent text-[13px] leading-none"
                      aria-hidden="true"
                    >
                      →
                    </span>
                  )}
                </div>
                <div className="serif text-[20px] font-bold text-accent leading-none tabular-nums">
                  ¥0
                </div>
              </div>

              <div className="mono text-[10px] tracking-[0.12em] text-muted sm:w-[150px] sm:text-right mt-1 sm:mt-0">
                {r.note}
              </div>
            </div>
          ))}
        </div>

        <p className="text-[12.5px] text-muted leading-[1.9] mt-3">
          {en ? (
            <>
              Only the scan fee is tied to the campaign. <strong className="text-ink">The listing
              itself stays free with no end date</strong> — there is no monthly fee and no
              commission on bookings.
            </>
          ) : (
            <>
              期限が付くのはスキャン計測費だけです。
              <strong className="text-ink">掲載そのものは期限なしで無料</strong>
              で、月額費用も成約手数料もいただきません。
            </>
          )}
        </p>
      </section>

      {/* ── メリット ── */}
      <section>
        <h2 className="mono text-[10px] tracking-[0.24em] uppercase text-accent mb-3">
          {en ? "What listing does for you" : "掲載するとどうなるか"}
        </h2>
        {/* ⚠ 3カラムにしない。このページの本文カラムは約560pxしかなく、
            3等分すると1行10文字程度で7行に折り返して読めなかった（実測）。
            番号を左に出す縦積みなら、狭いカラムでも1項目が2〜3行に収まる。 */}
        <div className="border border-line bg-card divide-y divide-line">
          {benefits.map((b) => (
            <div key={b.no} className="px-5 py-4 flex gap-4">
              <div className="mono text-[10px] tracking-[0.2em] text-accent pt-1 shrink-0">{b.no}</div>
              <div className="min-w-0">
                <div className="text-[13px] font-bold mb-1 leading-[1.6]">{b.title}</div>
                <p className="text-[12.5px] text-muted leading-[1.9]">{b.body}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted mt-2">
          {en ? "Details: " : "詳細: "}
          <Link href={localizedHref("/terms/listing-revenue-share", locale)} className="text-accent hover:underline">
            {en ? "Listing Data Revenue Share Terms" : "掲載データ販売分配規約"}
          </Link>
        </p>
      </section>
    </div>
  );
}
