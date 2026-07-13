import { notFound } from "next/navigation";
import Link from "next/link";
import { repo } from "@/lib/store";
import { propertyPreviewRepo, isPreviewExpired } from "@/lib/property-previews";
import PropertyDetailView from "@/components/property-detail-view";
import { getLocale } from "@/lib/i18n/server";

// トークンの有効期限を毎リクエストで判定するため動的レンダリング。
// noindex: 共有用の非公開リンクなので検索エンジンには載せない。
export const dynamic = "force-dynamic";
export const metadata = {
  title: "限定プレビュー",
  robots: { index: false, follow: false },
};

/** 期限切れ／失効済みリンク用の案内画面。 */
function ExpiredView() {
  return (
    <div className="frame py-24 text-center">
      <div className="mono text-[11px] tracking-[0.3em] uppercase text-muted mb-4">
        Preview link expired
      </div>
      <h1 className="serif text-2xl sm:text-3xl font-bold mb-4">
        このプレビューリンクは無効です
      </h1>
      <p className="text-[14px] text-muted leading-[1.9] max-w-[40ch] mx-auto">
        リンクの有効期限が切れたか、発行元によって失効されています。
        <br />
        お手数ですが、共有元の担当者に新しいリンクの発行をご依頼ください。
      </p>
      <Link
        href="/"
        className="mt-8 inline-block px-6 py-3 mono text-[11px] tracking-[0.22em] uppercase border border-line text-muted hover:border-ink hover:text-ink transition"
      >
        ロケハン3D トップへ
      </Link>
    </div>
  );
}

/**
 * 限定プレビュー共有ページ（ログイン不要）。
 * token -> property を解決し、公開状態(draft/archived/confidential)に関わらず
 * 物件詳細を表示する。3DGS ビューアは preview トークンで課金ゲートを外して閲覧可能
 * （/api/viewer-asset がトークンを検証して署名URLを発行する）。掲示板・レビュー・
 * 問い合わせ・購入・関連物件は sharePreview で抑制し、確認用途に専念させる。
 */
export default async function PreviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const preview = await propertyPreviewRepo.get(token);
  if (!preview) notFound();
  if (isPreviewExpired(preview)) return <ExpiredView />;

  const property = await repo.get(preview.propertyId);
  if (!property) notFound();

  const locale = await getLocale();

  return (
    <PropertyDetailView
      property={property}
      others={[]}
      preview
      sharePreview
      previewToken={token}
      previewExpiresAt={preview.expiresAt}
      locale={locale}
      signedIn={false}
      hasViewerAccess
      dataSaleDisabled
    />
  );
}
