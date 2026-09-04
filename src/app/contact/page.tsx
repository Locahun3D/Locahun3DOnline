import { Fragment } from "react";
import Link from "next/link";
import { getLocale } from "@/lib/i18n/server";
import { localizedHref } from "@/lib/i18n/dictionaries";
import { CONTACT_TYPES, CONTACT_TYPE_LABEL, type ContactType } from "@/lib/contact-requests";

// showcase=1 = 自動機能ツアー（本人指示 2026-08-16。未対応ビューアーでは無視され通常デモ）
const DEMO_URL = "https://viewer.locahun3d.com/Locahun3D_OfflineViewer?demo=1&showcase=1";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: locale === "en" ? "Contact" : "お問い合わせ｜ロケハン3D" };
}

/* 日本語の説明文は「句点（。）ごとに改行」する（本人指示 2026-08-27）。
   最終文の後には入れない。全端末共通の意図改行なので素の <br />。
   英語は句点が無いので素通りする（EN は自然折り返しのまま）。文言は変えない。 */
function sentenceBreaks(text: string) {
  const parts = text.split("。");
  const tail = parts.pop() ?? "";
  if (parts.length === 0) return text;
  return (
    <>
      {parts.map((s, i) => (
        <Fragment key={i}>
          {s}。
          {i < parts.length - 1 || tail !== "" ? <br /> : null}
        </Fragment>
      ))}
      {tail}
    </>
  );
}

const HUB_CARDS: { type: ContactType; desc: string; descEn: string; go: string; goEn: string }[] = [
  // バグ報告の窓口は 2026-07-29 に廃止（不具合は「ご相談」で受ける）。
  {
    type: "request",
    desc: "「このエリア・この種類の物件を3Dで見たい」というリクエストを受け付けています。",
    descEn: "Tell us a location or area you'd like to see scanned in 3D.",
    go: "リクエストフォームへ",
    goEn: "Go to request form",
  },
  {
    type: "listing",
    desc: "スタジオ・ロケ地のオーナー様。物件を3Dスキャンして掲載しませんか。掲載費は期限なしで無料、3Dスキャンの計測費も2026年12月31日まで無料です。",
    descEn:
      "Studio and location owners — list your space with a 3D scan. Listing is free with no expiry, and the 3D scan fee is also free through Dec 31, 2026.",
    go: "掲載のご案内へ",
    goEn: "Go to listing inquiry",
  },
  // 汎用の「ご相談」窓口は 2026-07-30 に廃止（内容別の窓口へ寄せた）。
  {
    type: "license",
    desc: "データの再配布・AI学習利用・API/データ連携のご相談はこちら。案件ごとに条件が異なるため、まずはお気軽に。",
    descEn: "Redistribution, AI-training use, API / data partnerships — terms vary by case, so just ask.",
    go: "相談フォームへ",
    goEn: "Go to consultation form",
  },
  {
    // 2026-08-16 新設。概算シミュレーターは元 /demo → /pricing から移設。
    type: "scan",
    desc: "撮影・映像制作のためのロケ地・施設スキャンのご依頼。概算シミュレーター付き。",
    descEn: "Request a scan of a location or facility for your shoot. Comes with an estimate simulator.",
    go: "依頼フォームへ",
    goEn: "Go to scan request",
  },
];

export default async function ContactHubPage() {
  const locale = await getLocale();
  const en = locale === "en";
  const lh = (href: string) => localizedHref(href, locale);

  return (
    <div className="theme-online frame pt-6 sm:pt-12 pb-12 sm:pb-32">
      <div className="chapter-rule">
        <span className="opacity-60">CONTACT</span>
        <span>0.4</span>
        <span className="flex-1 h-px bg-current opacity-25" />
      </div>

      <header className="text-center max-w-[60ch] mx-auto mb-14">
        <div className="mono text-[10px] tracking-[0.4em] uppercase text-accent mb-3">
          LOCAHUN 3D / ONLINE
        </div>
        <h1 className="serif text-[clamp(1.5rem,4.5vw,3rem)] font-bold leading-[1.3] mb-4">
          {en ? "Contact" : "お問い合わせ"}
        </h1>
        <p className="text-[14px] text-muted leading-[1.95]">
          {en ? "Please choose the topic that fits your request." : "ご用件をお選びください。"}
        </p>
      </header>

      {/* ピックアップ — 掲載依頼（無料キャンペーン中）を優先訴求 */}
      <Link
        href={lh("/contact/listing")}
        className="block max-w-[760px] mx-auto mb-6 bg-white border-2 border-accent px-7 py-7 hover:bg-accent/[0.04] transition relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 mono text-[9.5px] tracking-[0.2em] uppercase bg-accent text-white px-3 py-1">
          {en ? "Featured" : "ピックアップ"}
        </div>
        <div className="mono text-[10px] tracking-[0.3em] uppercase text-accent mb-3">
          /contact/listing
        </div>
        <div className="flex flex-wrap items-center gap-2.5 mb-2">
          <div className="text-[18px] font-bold">
            {en ? CONTACT_TYPE_LABEL_EN.listing : CONTACT_TYPE_LABEL.listing}
          </div>
          <span className="mono text-[9.5px] tracking-[0.16em] uppercase bg-accent/10 text-accent border border-accent/40 rounded-full px-2.5 py-0.5">
            {/* ⚠ 掲載費に期限は無い。長い1行にすると見出しの横で折り返して窮屈になり、
                「掲載費も期限つき」と誤読される。期限の話は下の説明文へ回す。 */}
            {en ? "Listing always free" : "掲載費はずっと無料"}
          </span>
        </div>
        <p className="text-[12.5px] text-muted leading-[1.85] mb-3 max-w-[56ch]">
          {sentenceBreaks(
            en
              ? HUB_CARDS.find((c) => c.type === "listing")!.descEn
              : HUB_CARDS.find((c) => c.type === "listing")!.desc
          )}
        </p>
        <div className="mono text-[10px] tracking-[0.24em] uppercase text-accent">
          {(en ? HUB_CARDS.find((c) => c.type === "listing")!.goEn : HUB_CARDS.find((c) => c.type === "listing")!.go)} →
        </div>
      </Link>

      {/* ⚠ 列数は残っている窓口の数に合わせる。「ご相談」を廃止した際に
          sm:grid-cols-3 のままだったので、2枚が細いまま右1枠が空いていた。
          2026-08-16 に「制作側スキャン依頼」を追加して3枚になったので3列へ戻した。 */}
      <div className="grid sm:grid-cols-3 gap-4 max-w-[760px] mx-auto">
        {CONTACT_TYPES.filter((type) => type !== "listing").map((type) => {
          const card = HUB_CARDS.find((c) => c.type === type)!;
          return (
            <Link
              key={type}
              href={lh(`/contact/${type}`)}
              className="block bg-white border border-line px-6 py-6 hover:border-accent transition"
            >
              <div className="mono text-[10px] tracking-[0.3em] uppercase text-accent mb-3">
                /contact/{type}
              </div>
              <div className="text-[16px] font-bold mb-2">
                {en ? CONTACT_TYPE_LABEL_EN[type] : CONTACT_TYPE_LABEL[type]}
              </div>
              <p className="text-[12px] text-muted leading-[1.8] mb-3">
                {sentenceBreaks(en ? card.descEn : card.desc)}
              </p>
              <div className="mono text-[10px] tracking-[0.24em] uppercase text-accent">
                {(en ? card.goEn : card.go)} →
              </div>
            </Link>
          );
        })}
      </div>

      {/* 持ち込みスキャン導線 — 問い合わせ種別ではなく専用申請フォームへ誘導 */}
      <Link
        href={lh("/submit-scan")}
        className="block max-w-[760px] mx-auto mt-6 bg-white border border-line px-7 py-6 hover:border-accent transition"
      >
        <div className="mono text-[10px] tracking-[0.3em] uppercase text-accent mb-3">
          /submit-scan
        </div>
        <div className="text-[16px] font-bold mb-2">
          {en ? "Bring your own scan" : "持ち込みスキャン"}
        </div>
        <p className="text-[12px] text-muted leading-[1.8] mb-3 max-w-[56ch]">
          {sentenceBreaks(
            en
              ? "Captured a scan of a real space yourself? We negotiate rights with the facility and sell it on Locahun 3D, sharing the revenue with you."
              : "あなたが撮影したスキャンデータを、ロケハン3Dが施設と権利調整のうえ販売し、売上を分配するプログラムです。"
          )}
        </p>
        <div className="mono text-[10px] tracking-[0.24em] uppercase text-accent">
          {en ? "Apply" : "申請フォームへ"} →
        </div>
      </Link>

      {/* よくある疑問（Q&A）— 2026-07-25に /about から移設 */}
      <section className="max-w-[760px] mx-auto mt-16">
        <div className="chapter-rule">
          <span className="opacity-60">Q&amp;A</span>
          <span>{en ? "Common questions" : "よくある疑問"}</span>
          <span className="flex-1 h-px bg-current opacity-25" />
        </div>
        <div>
          {[
            {
              q: ["現地に行かなくても、本当に分かりますか？", "Can I really judge a location without visiting?"],
              a: [
                <>
                  3DGS は写真の貼り合わせではなく実寸の空間記録です。広さ・天井高・光の入り方を、
                  ブラウザ内を歩いて確認できます。まずは{" "}
                  <a href={DEMO_URL} target="_blank" rel="noopener" className="text-accent hover:underline">
                    登録不要のデモ
                  </a>
                  でお確かめください。
                </>,
                <>
                  3DGS is a true-to-scale spatial capture, not stitched photos. You can walk
                  the space in your browser to check size, ceiling height and lighting. Try
                  the{" "}
                  <a href={DEMO_URL} target="_blank" rel="noopener" className="text-accent hover:underline">
                    no-sign-up demo
                  </a>{" "}
                  first.
                </>,
              ],
            },
            {
              q: ["費用はいくらかかりますか？", "How much does it cost?"],
              a: [
                <>
                  プランは Free / Individual / Studio / Team の 4 段階。視聴はトークン制で、
                  年払いは -20% です。詳細は{" "}
                  <Link href={lh("/pricing")} className="text-accent hover:underline">
                    料金ページ
                  </Link>
                  をご覧ください。
                </>,
                <>
                  Four plans: Free / Individual / Studio / Team. Viewing is token-based and
                  annual billing saves 20%. See the{" "}
                  <Link href={lh("/pricing")} className="text-accent hover:underline">
                    pricing page
                  </Link>
                  .
                </>,
              ],
            },
            {
              q: ["どうやって 3D にしているのですか？", "How are locations turned into 3D?"],
              a: [
                <>
                  専用機材 PortalCam で現場を約 20 分歩いて撮影し、3D Gaussian Splatting
                  として再構成しています。CG モデリングではなく、実物の寸法・質感・照明の記録です。
                </>,
                <>
                  We walk the space for about 20 minutes with PortalCam, then reconstruct the
                  capture as 3D Gaussian Splatting — a record of the real dimensions, textures
                  and lighting, not CG modeling.
                </>,
              ],
            },
            {
              q: ["自分の物件も掲載できますか？", "Can I list my own space?"],
              a: [
                <>
                  できます。約 20 分のスキャン 1 回で掲載でき、現在はキャンペーンにより掲載費は無料です
                  （2026年12月31日まで）。
                  <br />
                  ロケハン3Dでは、今後もスキャン以降の掲載費は無料です。
                  <Link href={lh("/contact/listing")} className="text-accent hover:underline">
                    掲載依頼フォーム
                  </Link>
                  からお申し込みください。
                </>,
                <>
                  Yes. One ~20-minute scan gets you listed, and listing is currently free
                  during our launch campaign (through Dec 31, 2026).
                  <br />
                  At Locahun 3D, listing stays free going forward once you&apos;ve completed a
                  scan. Apply via the{" "}
                  <Link href={lh("/contact/listing")} className="text-accent hover:underline">
                    listing request form
                  </Link>
                  .
                </>,
              ],
            },
            {
              q: ["購入したデータは何に使えますか？", "What can I use the purchased data for?"],
              a: [
                <>
                  PLY / RAD / OBJ 形式の実寸データを、プリビズ・絵コンテ・カメラ設計・VFX
                  の背景検討に使えます。Unreal Engine などへの取り込みにも対応しています。
                </>,
                <>
                  The true-to-scale PLY / RAD / OBJ data works for previz, storyboards, camera
                  planning and VFX background studies, including import into Unreal Engine.
                </>,
              ],
            },
            {
              q: [
                "購入データをVRChat等に組み込んで公開したり、再配布・AI学習に使ったりできますか？",
                "Can I embed the data in VRChat, redistribute it, or use it for AI training?",
              ],
              // ⚠ 結論（標準は不可・拡張なら可）を必ず最初の1文に置くこと。
              //   前置きから始めると、最初の1文だけ読んで離脱した人が「できる」と
              //   誤解する（2026-08-01 レビュー）。
              //   長すぎて読まれないという指摘を受け、要点3行に短縮（2026-08-13）。
              a: [
                <>
                  標準ライセンスでは不可、拡張ライセンスなら可能な場合が多いです。
                  標準は映像・画像などの制作物を作る利用まで。データ自体をソフトウェアに
                  組み込んで配布する利用（VRChatワールドの公開など）は拡張の範囲です。
                  <br />
                  AI学習利用も禁止ではなく個別のご相談です。
                  <Link href={lh("/contact/license")} className="text-accent hover:underline">
                    お問い合わせ
                  </Link>
                  ください。
                </>,
                <>
                  Not under the standard license; usually yes under the extended one.
                  Standard covers making productions like film and images. Embedding the data
                  itself into software for distribution (e.g. publishing a VRChat world) needs
                  the extended license.
                  <br />
                  AI-training use isn&apos;t a flat no either — we work it out case by case.{" "}
                  <Link href={lh("/contact/license")} className="text-accent hover:underline">
                    Just ask
                  </Link>
                  .
                </>,
              ],
            },
          ].map((item, i) => (
            <div key={i} className={`py-5 ${i > 0 ? "border-t border-line" : ""}`}>
              <div className="mono text-[10px] tracking-[0.24em] uppercase text-accent mb-1.5">
                Q.{String(i + 1).padStart(2, "0")}
              </div>
              <h3 className="text-[15px] font-bold mb-2">{item.q[en ? 1 : 0]}</h3>
              <p className="text-[12.5px] text-muted leading-[1.9]">{item.a[en ? 1 : 0]}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/** 受付中の窓口のみ（受付終了した種別は HUB_CARDS に無いので不要）。 */
const CONTACT_TYPE_LABEL_EN: Record<(typeof CONTACT_TYPES)[number], string> = {
  request: "Request a location",
  listing: "List your space",
  license: "Data use & partnerships",
  scan: "Scan request",
};
