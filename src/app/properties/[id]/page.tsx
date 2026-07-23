import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  getPublishedProperty,
  getPublishedProperties,
  getPublishedPropertyIds,
  findRelatedProperties,
} from "@/lib/properties";
import { getCurrentUser } from "@/lib/dal";
import { purchaseRepo } from "@/lib/purchases";
import { viewUnlockRepo } from "@/lib/view-unlocks";
import { commentRepo } from "@/lib/comments";
import { reviewRepo, reviewStats } from "@/lib/reviews";
import { withLiveDisplayNames } from "@/lib/live-names";
import {
  canViewBackyard,
  canViewNdaOnly,
  canPostToBoard,
  publicDisplayName,
} from "@/lib/account-schema";
import PropertyDetailView from "@/components/property-detail-view";
import TrackView from "@/components/track-view";
import PurchaseToast from "@/components/purchase-toast";
import { getSettings } from "@/lib/site-settings";
import { isFreePeriodActive } from "@/lib/settings-schema";
import { localizeProperty } from "@/lib/schemas";
import { getLocale } from "@/lib/i18n/server";

// 限定無料期間 (getSettings) と現在時刻を毎リクエストで読むため動的レンダリング。
// これにより静的生成ワーカーを使わず、無料期間の開始/終了も常に即時反映される。
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const raw = await getPublishedProperty(id);
  if (!raw) return { title: "Not found" };
  const p = localizeProperty(raw, await getLocale());
  // og:image は SNS のクローラが外部から取得するため絶対URL必須。cover が
  // 相対（/api/r2/… や /uploads/…、R2非公開化後の配信経路）だと取得できないので
  // サイトオリジンを前置して絶対化する。
  const site = process.env.NEXT_PUBLIC_APP_URL ?? "https://locahun3d.com";
  const cover = p.cover?.src;
  const ogImage = cover
    ? cover.startsWith("http")
      ? cover
      : `${site}${cover.startsWith("/") ? "" : "/"}${cover}`
    : undefined;
  return {
    title: p.title,
    description: p.summary,
    openGraph: ogImage ? { images: [ogImage] } : undefined,
    // ルートlayoutのtwitter.imagesは汎用の /og-cover.jpg 固定。ここで上書きしないと
    // iMessage等 twitter:image を優先するクローラで物件写真ではなく汎用画像が出る。
    twitter: ogImage ? { card: "summary_large_image", images: [ogImage] } : undefined,
  };
}

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const rawProperty = await getPublishedProperty(id);
  if (!rawProperty) notFound();

  const locale = await getLocale();
  const property = localizeProperty(rawProperty, locale);

  const [allPublished, settings, user] = await Promise.all([
    getPublishedProperties(),
    getSettings(),
    getCurrentUser().catch(() => null),
  ]);

  // 関連判定は原文（タグ等）ベースで行い、表示直前にロケール変換する。
  const others = findRelatedProperties(rawProperty, allPublished, 3).map((p) =>
    localizeProperty(p, locale),
  );
  const nowIso = new Date().toISOString();
  const freeAccess = isFreePeriodActive(settings.freePeriod, nowIso);
  // 3Dデータ販売の限定無料期間はアイテム単位(item.freePeriod)で判定するため、
  // ここでは判定不要 — nowIso を PropertyDetailView に渡すのみ。

  const canViewRestrictedItems = canViewBackyard(user);
  const canViewNdaOnlyItems = canViewNdaOnly(user);
  // 閲覧ゲートはプラン階層ではなくトークン保有量そのもの。フリープランでも
  // トークンさえあれば視聴できる（実際の残高チェック/消費は /api/viewer-asset
  // 側で行う — ここはサインイン済みかどうかだけを見る「試行してよいか」判定）。
  // Team プランの特別扱い（NDA/制限あり閲覧の突破）は canViewRestrictedItems /
  // canViewNdaOnlyItems の方で別途処理される。
  const hasViewerAccess = !!user;
  const signedIn = !!user;
  const bookmarked = user ? (user.bookmarks ?? []).includes(property.id) : false;
  // 購入済みシーンの id 群。splatItem.id で判定する（index だと並び替え/差し替え
  // で対応がズレる）。旧レコード（splatItemId 未設定）は記録時の index から
  // 現在の id を逆引きする。
  const purchasedItemIds: string[] = [];
  // シーン(splatItem)ごとに「1年以内のアンロック済みか」を集計。true のシーンは
  // ViewerGate 側で「視聴済み（無料再視聴）」表示になり、開いても課金されない。
  // splatItem.id で判定する（index だと並び替え/3DGS差し替えで対応がズレる）。
  // 旧レコード（splatItemId 未設定）は記録時の index から現在の id を逆引きする。
  const unlockedItemIds: string[] = [];
  // 掲示板は閲覧: 全員（書き込みのみ有料プラン限定）。通報により非表示になった
  // コメントは、admin 以外にはサーバー側で除外し HTML にも一切含めない
  // （クライアント側フィルタだけでは不十分）。
  const isAdminUser = user?.role === "admin";
  const comments = await withLiveDisplayNames(
    (await commentRepo.list(property.id).catch(() => [])).filter(
      (c) => isAdminUser || !c.hiddenByReports,
    ),
  );
  // レビュー投稿権限。掲示板の書き込みと同じ「有料プラン限定」判定に統一
  // （以前は3DGS視聴済みが条件だった）。
  const canReview = canPostToBoard(user);
  const reviews = signedIn
    ? await withLiveDisplayNames(
        (await reviewRepo.list(property.id).catch(() => [])).filter(
          (r) => isAdminUser || !r.hiddenByReports,
        ),
      )
    : [];
  // 平均★とレビュー件数はカタログと同じく未サインインでも公開（個々のレビュー
  // 本文はサインイン後のみ）。カタログ側は reviewStatsForProperties で常時
  // 計算しているのに、物件ページ側は signedIn の時しか reviews を取得しない
  // ため同じ物件でも数字が食い違う不具合があった。
  const propertyReviewStats = await reviewStats(property.id).catch(() => ({
    average: 0,
    count: 0,
  }));
  if (user) {
    try {
      const mine = await purchaseRepo.list({ userId: user.id, propertyId: property.id });
      for (const p of mine) {
        if (p.status !== "completed") continue;
        const itemId = p.splatItemId || property.splatItems[p.splatItemIndex]?.id;
        if (itemId) purchasedItemIds.push(itemId);
      }
    } catch {
      // purchase lookup failure is non-fatal
    }
    // admin / free-period は課金対象外なので「アンロック済み」表示は不要
    // （常に無料で開ける）。それ以外のサブスク会員のみ判定する。
    if (user.role !== "admin" && !freeAccess) {
      try {
        const unlocks = await viewUnlockRepo.list({ userId: user.id, propertyId: property.id });
        const now = new Date().toISOString();
        for (const u of unlocks) {
          if (u.expiresAt <= now) continue;
          const itemId = u.splatItemId || property.splatItems[u.splatItemIndex]?.id;
          if (itemId) unlockedItemIds.push(itemId);
        }
      } catch {
        // unlock lookup failure is non-fatal（表示が「未アンロック」に倒れるだけ）
      }
    }
  }

  return (
    <>
      <Suspense>
        <PurchaseToast />
      </Suspense>
      <TrackView propertyId={property.id} />
      <PropertyDetailView
        property={property}
        others={others}
        freeAccess={freeAccess}
        nowIso={nowIso}
        canViewRestricted={canViewRestrictedItems}
        canViewNdaOnly={canViewNdaOnlyItems}
        purchasedItemIds={purchasedItemIds}
        unlockedItemIds={unlockedItemIds}
        hasViewerAccess={hasViewerAccess}
        signedIn={signedIn}
        bookmarked={bookmarked}
        locale={locale}
        comments={comments}
        reviews={reviews}
        reviewStats={propertyReviewStats}
        currentUserId={user?.id ?? null}
        currentUserName={user ? publicDisplayName(user) : null}
        isAdminUser={isAdminUser}
        canPostBoard={canPostToBoard(user)}
        canReview={canReview}
      />
    </>
  );
}
