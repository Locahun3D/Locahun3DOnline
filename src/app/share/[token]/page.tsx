import { notFound } from "next/navigation";
import Link from "next/link";
import { repo } from "@/lib/store";
import { viewerShareRepo, isViewerShareExpired } from "@/lib/viewer-shares";
import { getLocale } from "@/lib/i18n/server";
import ShareViewerLauncher from "./share-viewer-launcher";

// トークンの期限を毎リクエストで判定する。共有用の非公開リンクなので検索エンジンには載せない。
export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: locale === "en" ? "Shared 3D view" : "共有された3Dビュー",
    robots: { index: false, follow: false },
  };
}

/**
 * ビューアーの共有URL（ログイン不要・2週間）。Team プランの利用者がビューアー左上の「共有」から発行する。
 * ここではトークンを検証し、物件名だけ見せてビューアーへ入る（署名URLの取得は launcher が
 * /api/viewer-asset?share=<token> で行う。トークン検証はサーバー側でもう一度行われる）。
 */
export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const share = await viewerShareRepo.get(token);
  if (!share) notFound();
  const en = (await getLocale()) === "en";

  if (isViewerShareExpired(share)) {
    return (
      <div className="frame ui-page-shell pb-24 text-center">
        <div className="mono text-[11px] tracking-[0.3em] uppercase text-muted mb-4">Share link expired</div>
        <header className="ui-page-header">
          <h1 className="ui-page-title">{en ? "This share link has expired" : "この共有リンクは期限切れです"}</h1>
          <p className="ui-page-lead text-[14px] text-muted max-w-[40ch] mx-auto">
            {en ? (
              "Please ask the sender for a new link."
            ) : (
              <>
                リンクの有効期限（発行から2週間）が過ぎています。
                <br />
                お手数ですが、共有元の方に新しいリンクの発行をご依頼ください。
              </>
            )}
          </p>
        </header>
        <Link
          href="/"
          className="inline-block px-6 py-3 mono text-[11px] tracking-[0.22em] uppercase border border-line text-muted hover:border-ink hover:text-ink transition"
        >
          {en ? "Locahun 3D top" : "ロケハン3D トップへ"}
        </Link>
      </div>
    );
  }

  const property = await repo.get(share.propertyId);
  const item = property?.splatItems.find((it) => it.id === share.splatItemId);
  if (!property || !item?.splatUrl) notFound();

  return (
    <div className="frame ui-page-shell pb-24 text-center">
      <div className="mono text-[11px] tracking-[0.3em] uppercase text-muted mb-4">Shared 3D view</div>
      <header className="ui-page-header">
        <h1 className="ui-page-title">{property.title.split(/[｜|\n]/)[0]}</h1>
        <p className="ui-page-lead text-[14px] text-muted max-w-[40ch] mx-auto">
          {en ? "A 3D walkthrough has been shared with you." : "3Dウォークスルーが共有されました。"}
        </p>
      </header>
      <ShareViewerLauncher token={token} assetKey={share.assetKey} en={en} />
    </div>
  );
}
