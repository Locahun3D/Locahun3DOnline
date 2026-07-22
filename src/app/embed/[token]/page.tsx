import { notFound } from "next/navigation";
import { repo } from "@/lib/store";
import { propertyEmbedRepo } from "@/lib/property-embeds";
import ViewerGate from "@/components/viewer-gate";
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
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
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
  const publicItem = (property.splatItems ?? []).find(
    (s) => !!s.splatUrl?.trim() && (s.accessLevel ?? "public") === "public",
  );
  const splatUrl = publicItem?.splatUrl || property.splatUrl || "";
  if (!splatUrl.trim()) return <UnavailableView en={en} />;

  const title = (en && property.titleEn) || property.title;

  return (
    /* ⚠ theme-online（ライトテーマ）で包む。ViewerGate の CTA パネルは物件詳細
       ページと同じ .theme-online 文脈で使われる前提のスタイルを持っており、
       素の暗色背景に置くと「明るいパネルに白文字」で本文が読めなくなる
       （実機スクショで発覚。globals.css の theme-online 節にも同種の注意書きあり）。 */
    <div className="theme-online">
      <ViewerGate
        splatUrl={splatUrl}
        propertyId={property.id}
        label={publicItem?.label || title}
        sizeMb={publicItem?.sizeMb || property.splatSizeMb || 0}
        previewVideoUrl={publicItem?.previewVideoUrl || undefined}
        embedToken={token}
      />
      {/* 掲載者サイト上での出所表示。埋め込みを配ることが当社への導線になる
          （掲載者には無料の集客ツール、当社にはブランド露出という交換）。 */}
      <div className="flex items-center justify-between gap-3 px-3 py-2 border-t border-line bg-bg">
        <span className="text-[11px] text-ink/80 truncate">{title}</span>
        <a
          href={`https://locahun3d.com/properties/${property.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mono text-[9.5px] tracking-[0.2em] uppercase text-muted hover:text-accent transition shrink-0"
        >
          Powered by ロケハン3D
        </a>
      </div>
      {/* 埋め込みは外部サイトに露出するため、スクレイピング/AI学習への
          抑止表記を常設する。ビューアーの邪魔をしないよう右下に固定表示。 */}
      {/* ビューアー(暗)とゲート(明)のどちらの背景でも読めるよう、白文字+影にする */}
      <div className="pointer-events-none fixed bottom-2 right-3 z-50 mono text-[9px] tracking-[0.12em] text-white/60 [text-shadow:0_1px_2px_rgba(0,0,0,0.8)]">
        © ロケハン3D — 無断転載・AI学習利用禁止
      </div>
    </div>
  );
}
