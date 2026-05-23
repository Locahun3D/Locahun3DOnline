import Link from "next/link";

export const metadata = {
  title: "サービスについて",
  description: "ロケハン3D オンラインの背景・思想・運営者情報。",
};

export default function AboutPage() {
  return (
    <div className="frame pt-12 pb-32">
      <div className="chapter-rule">
        <span className="opacity-60">ABOUT</span>
        <span>Why this exists</span>
        <span className="flex-1 h-px bg-current opacity-25" />
      </div>

      <article className="max-w-[64ch] space-y-10 text-[15px] leading-[1.95] text-muted">
        <h1 className="serif text-[clamp(2rem,4vw,3.2rem)] font-light text-ink leading-[1.3]">
          ロケハンが、
          <br />
          <em className="not-italic text-accent">画面の中</em> に来た。
        </h1>

        <p>
          ロケハン（撮影前下見）は、映像制作の前工程で最もコストが高い行為のひとつです。
          交通費、半日のスケジュール、判断のためにそこに集まる人数。
          それでも、現場に立たないと光・距離・天井・搬入の動線は分かりません。
        </p>

        <p>
          <strong className="text-ink">ロケハン3D</strong> は
          3D Gaussian Splatting（3DGS）でこの工程を再発明します。
          実空間をブラウザに持ち込み、レンズ画角・カメラ位置・天井高・障害物の検証を
          打合せ前に終わらせる。出張の判断が「行く必要があるか」になります。
        </p>

        <h2 className="serif text-2xl text-ink pt-6 border-t border-line">
          オンライン版が担うもの
        </h2>

        <p>
          <Link href="https://viewer.locahun3d.com/Locahun3D_OfflineViewer" className="text-accent hover:underline" target="_blank" rel="noopener">
            オフラインビューアー
          </Link>
          は、単体の HTML として配布できる「現場渡し用」のツールです。
          <br />
          オンライン版（このサービス）は、その先にある
          <strong className="text-ink">物件カタログ + 認証 + 課金 + マーケットプレイス</strong>
          を担います。
        </p>

        <h2 className="serif text-2xl text-ink pt-6 border-t border-line">
          ロードマップ
        </h2>

        <ul className="space-y-3">
          <li><span className="mono text-[10px] tracking-[0.22em] text-accent mr-3">2026</span>MVP（物件閲覧 + 課金 + 3DGS ビューアー）</li>
          <li><span className="mono text-[10px] tracking-[0.22em] text-accent mr-3">2027</span>正式ローンチ / マーケットプレイス開始</li>
          <li><span className="mono text-[10px] tracking-[0.22em] text-accent mr-3">2027</span>iOS / Android アプリ（撮影現場での閲覧）</li>
          <li><span className="mono text-[10px] tracking-[0.22em] text-accent mr-3">後</span>3DGS データ販売 / Stripe Connect マーケットプレイス</li>
        </ul>

        <h2 className="serif text-2xl text-ink pt-6 border-t border-line">
          運営
        </h2>
        <p>
          中村 航（個人事業主）。東京都清瀬市。<br />
          お問い合わせ:{" "}
          <a href="mailto:contact@locahun3d.com" className="text-accent hover:underline">
            contact@locahun3d.com
          </a>
        </p>
      </article>
    </div>
  );
}
