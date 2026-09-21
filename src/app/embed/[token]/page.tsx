import { notFound } from "next/navigation";
import { repo } from "@/lib/store";
import { propertyEmbedRepo } from "@/lib/property-embeds";
import EmbedPlayer from "@/components/embed-player";
import { getLocale } from "@/lib/i18n/server";

// トークンの有効状態を毎リクエストで判定するため動的レンダリング。
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: locale === "en" ? "3D Tour" : "3Dツアー",
    // 掲載者サイトの一部として表示される想定。埋め込み用の裸ページ自体が
    // 検索結果に出ると重複コンテンツになるため noindex。
    robots: { index: false, follow: false },
  };
}

/** 停止済み・不明トークン用の静かな案内（iframe 内に出るため最小限）。 */
function UnavailableView({ en }: { en: boolean }) {
  return (
    <div className="w-full h-full min-h-[320px] flex items-center justify-center bg-bg px-6 text-center">
      <p className="text-[13px] text-muted leading-[1.9]">
        {en
          ? "This 3D tour is currently unavailable."
          : "この3Dツアーは現在ご利用いただけません。"}
      </p>
    </div>
  );
}

/**
 * 掲載者サイト埋め込み用の 3D ツアーページ（DECISION_LOG D-008 のホスティング商品）。
 *
 * サイトのヘッダー・フッターは出さない（layout ではなくこのページ単体で完結させる）。
 * iframe の中で二重にナビゲーションが出ると掲載者のサイトデザインを壊すため。
 *
 * 訪問者はログインもトークン消費も不要。この商品の課金相手は掲載者であって
 * 埋め込みの閲覧者ではない（無料で広く見せられることが掲載者にとっての価値）。
 *
 * ⚠ 本番の X-Frame-Options: DENY は next.config.ts で /embed/ のみ除外している。
 * あれが復活すると本番でだけ全ての埋め込みが無言で壊れる。
 */
export default async function EmbedPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  // 2026-09-21: 表示の調整はURLのパラメータで行う（Matterport の埋め込みと同じ考え方）。
  //  autoplay=1 … 読み込み後すぐ3Dを開始する / title=0 … 下端の物件名の帯を出さない
  //  scene=<id> … 複数シーンの物件で開くシーンを指定する
  const q = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const autoplay = one(q.autoplay) === "1";
  const showTitle = one(q.title) !== "0";
  const wantScene = (one(q.scene) || "").trim();
  const locale = await getLocale();
  const en = locale === "en";

  const embed = await propertyEmbedRepo.get(token);
  if (!embed) notFound();
  if (!embed.enabled) return <UnavailableView en={en} />;

  const property = await repo.get(embed.propertyId);
  if (!property) notFound();

  // 3Dシーンの解決: 複数シーン(splatItems)があれば先頭、無ければ単一 splatUrl。
  // 一般公開レベルのシーンのみ埋め込む（restricted/nda_only は掲載者サイトに
  // 出してはいけない — 権限管理の意味がなくなる）。
  const publicItems = (property.splatItems ?? []).filter(
    (s) => !!s.splatUrl?.trim() && (s.accessLevel ?? "public") === "public",
  );
  // scene= が一致しなければ先頭に落とす（貼った先が黙って壊れないように）。
  const publicItem = publicItems.find((s) => s.id === wantScene) || publicItems[0];
  const splatUrl = publicItem?.splatUrl || property.splatUrl || "";
  if (!splatUrl.trim()) return <UnavailableView en={en} />;

  const title = (en && property.titleEn) || property.title;

  return (
    /* ⚠ theme-online（ライトテーマ）で包む。ViewerGate の CTA パネルは物件詳細
       ページと同じ .theme-online 文脈で使われる前提のスタイルを持っており、
       素の暗色背景に置くと「明るいパネルに白文字」で本文が読めなくなる
       （実機スクショで発覚。globals.css の theme-online 節にも同種の注意書きあり）。 */
    /* 2026-09-21: 貼った先のサイトの中でそのまま動かす（Matterport と同じ）。
       以前は物件ページと同じ ViewerGate を置いており、押すと**新しいタブ**が開いた。
       埋め込みとしては「サイトの中で歩ける」ようにならないため、専用の部品に替えた。 */
    /* 高さは実画面基準（globals.css 冒頭の規約2）。素の 100dvh だと html の zoom
       （720–1199px で 0.8 / 1200px以上で 0.9）が掛からない分だけ内容が縮み、
       貼り先の iframe の下端に黒い帯が残る（実測: 幅992pxの16:9 iframe で約115px）。 */
    <div className="theme-online flex flex-col h-[calc(100dvh/var(--z))]">
      <div className="relative flex-1 min-h-0">
        <EmbedPlayer
          splatUrl={splatUrl}
          embedToken={token}
          label={publicItem?.label || title}
          previewVideoUrl={publicItem?.previewVideoUrl || undefined}
          autoplay={autoplay}
          en={en}
        />
        {/* 埋め込みは外部サイトに露出するため、スクレイピング/AI学習への抑止表記を常設する。
            ⚠ 画面に fixed で置くと、狭い枠（スマホ幅の16:9＝約342px）で下端の帯の
            「物件名／Powered by」と重なって三重に潰れる（2026-09-21 別オリジンの
            検証ページで実測）。ビューアー領域の中に収めれば、どの幅でも重ならない。 */}
        {/* ビューアー(暗)とゲート(明)のどちらの背景でも読めるよう、白文字+影にする */}
        <div className="pointer-events-none absolute bottom-2 right-3 z-50 mono text-[9px] tracking-[0.12em] text-white/60 [text-shadow:0_1px_2px_rgba(0,0,0,0.8)]">
          © ロケハン3D — 無断転載・AI学習利用禁止
        </div>
      </div>
      {/* 掲載者サイト上での出所表示。埋め込みを配ることが当社への導線になる
          （掲載者には無料の集客ツール、当社にはブランド露出という交換）。 */}
      <div className="flex items-center justify-between gap-3 px-3 py-2 border-t border-line bg-bg">
        <span className="text-[11px] text-ink/80 truncate">{showTitle ? title : ""}</span>
        <a
          href={`https://locahun3d.com/properties/${property.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mono text-[9.5px] tracking-[0.2em] uppercase text-muted hover:text-accent transition shrink-0"
        >
          {/* 2026-09-20: 商標ロゴ統一。外部サイトに出るブランド表示は欧文ワードマーク */}
          Powered by Locahun 3D
        </a>
      </div>
    </div>
  );
}
