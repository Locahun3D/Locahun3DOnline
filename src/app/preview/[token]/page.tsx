import { notFound } from "next/navigation";
import Link from "next/link";
import { repo } from "@/lib/store";
import { propertyPreviewRepo, isPreviewExpired } from "@/lib/property-previews";
import PropertyDetailView from "@/components/property-detail-view";
import { getLocale } from "@/lib/i18n/server";
import StudioApproveBar from "@/components/studio-approve-bar";
import StudioDataSaleBar from "@/components/studio-data-sale-bar";
import StudioPhotoUpload from "@/components/studio-photo-upload";
import { canStudioApprove } from "@/lib/publish-flow";
import { hashStudioApproveKey } from "@/lib/studio-approval";
import { canAnswerDataSale, dataSaleConsentOf } from "@/lib/data-sale-consent";
import { canStudioUpload } from "@/lib/studio-photo-intake";

// トークンの有効期限を毎リクエストで判定するため動的レンダリング。
// noindex: 共有用の非公開リンクなので検索エンジンには載せない。
export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: locale === "en" ? "Private Preview" : "限定プレビュー",
    robots: { index: false, follow: false },
  };
}

/** 期限切れ／失効済みリンク用の案内画面。 */
function ExpiredView() {
  return (
    <div className="frame ui-page-shell pb-24 text-center">
      <div className="mono text-[11px] tracking-[0.3em] uppercase text-muted mb-4">
        Preview link expired
      </div>
      <header className="ui-page-header">
      <h1 className="ui-page-title">
        このプレビューリンクは無効です
      </h1>
      <p className="ui-page-lead text-[14px] text-muted max-w-[40ch] mx-auto">
        リンクの有効期限が切れたか、発行元によって失効されています。
        <br />
        お手数ですが、共有元の担当者に新しいリンクの発行をご依頼ください。
      </p>
      </header>
      <Link
        href="/"
        className="inline-block px-6 py-3 mono text-[11px] tracking-[0.22em] uppercase border border-line text-muted hover:border-ink hover:text-ink transition"
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
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ approve?: string | string[]; sale?: string | string[] }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const approveParam = query.approve;
  const approveKey = typeof approveParam === "string" ? approveParam : "";
  const saleParam = typeof query.sale === "string" ? query.sale : "";
  const preview = await propertyPreviewRepo.get(token);
  if (!preview) notFound();
  if (isPreviewExpired(preview)) return <ExpiredView />;

  const property = await repo.get(preview.propertyId);
  if (!property) notFound();

  const locale = await getLocale();

  // 確認メールのリンク（?approve=キー）から開いたときだけ、スタジオ用の承認バーを出す。
  // プレビューURLだけを知っている人（共有先など）には出ない。
  const canApprove = approveKey !== "" && canStudioApprove(property, hashStudioApproveKey(approveKey)).ok;

  // 承認して公開された直後は、サーバーの再描画でバーが消えてしまう（キーは使い切りで消える）。
  // 確認メールのリンクで開いていて、スタジオの承認で公開済みなら、お礼の表示を出し続ける。
  const approvedHere = approveKey !== "" && property.status === "published" && property.publishFlow?.studioConfirmedVia === "studio-link";

  // 3Dデータ販売の許諾（2026-09-26 本人指示）。確認メールの回答リンクから開いたときだけ出す。
  // 掲載の承認キーは公開で使い切りになるが、こちらは別のハッシュで見るので公開後も答えられる。
  const consent = dataSaleConsentOf(property);
  const canAnswerSale = approveKey !== "" && canAnswerDataSale(property, hashStudioApproveKey(approveKey)).ok;

  // 掲載用の写真を送ってもらう欄（2026-09-26 本人指示）。確認メールのリンクから開いた
  // 公開申請中の物件だけ。公開に必要なのはカバー以外6枚なので、足りない枚数を伝える。
  const canUploadPhotos = approveKey !== "" && canStudioUpload(property, hashStudioApproveKey(approveKey)).ok;
  const missingPhotos = Math.max(0, 6 - property.gallery.length);

  return (
    <>
    {(canApprove || approvedHere) && (
      <StudioApproveBar token={token} approveKey={approveKey} en={locale === "en"} publishedId={approvedHere ? property.id : undefined} />
    )}
    {canAnswerSale && (
      <div className="ui-page-shell pt-6 pb-0">
        <StudioDataSaleBar
          token={token}
          approveKey={approveKey}
          en={locale === "en"}
          initialChoice={saleParam === "yes" ? "granted" : saleParam === "no" ? "declined" : undefined}
          status={consent.status}
          price={consent.proposedPrice}
          savedNote={consent.note}
        />
      </div>
    )}
    {canUploadPhotos && (
      <div className="ui-page-shell pt-6 pb-0">
        <StudioPhotoUpload
          token={token}
          approveKey={approveKey}
          en={locale === "en"}
          missingCount={missingPhotos}
          propertyTitle={property.title.replace(/\n/g, " ")}
        />
      </div>
    )}
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
    />
    </>
  );
}
