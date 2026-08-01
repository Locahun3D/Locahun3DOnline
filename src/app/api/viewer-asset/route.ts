import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/dal";
import { repo as propertyRepo } from "@/lib/store";
import { canViewBackyard, canViewNdaOnly, totalTokens, isStudioPurchaseRestricted } from "@/lib/account-schema";
import { ownsProperty } from "@/lib/listing-funnel";
import { userRepo } from "@/lib/users";
import {
  viewUnlockRepo,
  unlockId,
  oneYearFrom,
} from "@/lib/view-unlocks";
import { getSettings } from "@/lib/site-settings";
import { isFreePeriodActive } from "@/lib/settings-schema";
import { presignViewerAsset, presignConfigured } from "@/lib/r2-presign";
import { allowAssetDownload } from "@/lib/asset-rate-limit";
import { propertyPreviewRepo, isPreviewExpired } from "@/lib/property-previews";
import { propertyEmbedRepo } from "@/lib/property-embeds";

export const runtime = "nodejs";

/**
 * 署名URLの有効期限。実ダウンロードは R2 に直接飛びアプリコードを経由しないため、
 * 発行したURLはこの秒数の間は誰でも(URLを知っていれば)再利用できてしまう。
 * 以前は 3600 (1時間) だったが、流出/転用の窓を絞るため短縮。ビューアーは
 * 1回の視聴セッションで発行された1つの署名URLを使い回すので、極端に短くすると
 * 大容量シーンの読み込み中に失効し得る — 実測の初回ロード(数秒〜十数秒)に対して
 * 十分な余裕を残しつつ、放置後の再利用は防げる値としている。
 */
const PRESIGN_TTL_SECONDS = 900;

/** 保存済みURL（公開r2.dev / 相対 /uploads / /api/r2 ...）から R2 オブジェクトキーを導く。 */
function toR2Key(url: string): string | null {
  if (!url) return null;
  let path = url;
  if (/^https?:\/\//.test(url)) {
    try {
      path = new URL(url).pathname;
    } catch {
      return null;
    }
  }
  path = path.replace(/^\/+/, "").replace(/^api\/r2\//, "");
  return path || null;
}

/**
 * 視聴用3DGSアセットの署名付きGET URLを発行する。
 * - 認証＋閲覧資格（管理者/有料/限定無料期間 ＋ アイテムのアクセスレベル）を判定。
 * - 資格があり、かつ key が「公開中物件の splatItem.splatUrl」に一致する場合のみ署名。
 *   任意キーの署名は拒否（情報漏えい防止）。
 */
export async function GET(req: Request) {
  try {
    const rawKey = new URL(req.url).searchParams.get("key") || "";
    const key = toR2Key(rawKey);
    if (!key) {
      return NextResponse.json({ error: "bad key" }, { status: 400 });
    }
    if (!presignConfigured()) {
      return NextResponse.json({ error: "signing not configured" }, { status: 503 });
    }

    // key -> 物件/シーンの照合は認証前に行う（プレビュートークン検証にも使うため）。
    // list() は draft/archived 含む全物件を返すので、公開前物件の splat も照合できる。
    const props = await propertyRepo.list();
    let matchedItem: (typeof props)[number]["splatItems"][number] | null = null;
    let matchedProperty: (typeof props)[number] | null = null;
    let matchedIndex = -1;
    for (const p of props) {
      for (let i = 0; i < p.splatItems.length; i++) {
        const item = p.splatItems[i];
        if (item.splatUrl && toR2Key(item.splatUrl) === key) {
          matchedItem = item;
          matchedProperty = p;
          matchedIndex = i;
          break;
        }
      }
      if (matchedItem) break;
    }
    if (!matchedItem || !matchedProperty) {
      return NextResponse.json({ error: "視聴対象が見つかりません" }, { status: 404 });
    }

    /* ── 限定プレビュートークン経路（ログイン不要） ───────────────────
     * 先方スタジオへの共有URL(/preview/[token])からの視聴。トークンが有効
     * （存在・未期限切れ・その物件を指す）なら、認証・アクセスレベル・トークン
     * 消費ゲートをすべて外して署名URLを発行する。トークンは物件1件に紐づくため、
     * 他物件の splat キーには使えない（propertyId 一致を必須にする）。無効な
     * トークンは黙って通常の認証経路へフォールバック（情報を漏らさない）。 */
    const previewTokenParam = new URL(req.url).searchParams.get("preview") || "";
    if (previewTokenParam) {
      const preview = await propertyPreviewRepo.get(previewTokenParam);
      if (
        preview &&
        !isPreviewExpired(preview) &&
        preview.propertyId === matchedProperty.id
      ) {
        // 連続発行のレート制限はトークンをキーにして適用（userId の代わり）。
        if (!allowAssetDownload(`preview:${previewTokenParam}`, key)) {
          return NextResponse.json({ error: "rate_limited" }, { status: 429 });
        }
        const signedPreview = await presignViewerAsset(key, PRESIGN_TTL_SECONDS);
        if (!signedPreview) {
          return NextResponse.json({ error: "署名に失敗しました" }, { status: 500 });
        }
        return NextResponse.json(
          { url: signedPreview },
          { headers: { "Cache-Control": "no-store" } },
        );
      }
      // 無効なプレビュートークン → 通常の認証経路へ（下へフォールスルー）。
    }

    /* ── 埋め込みトークン経路（ログイン不要・期限なし） ────────────────
     * 掲載者サイトに貼られた iframe (/embed/[token]) からの視聴。
     * preview と同じくゲートを全て外すが、こちらは期限を持たない代わりに
     * enabled フラグで掲載者が停止できる（DECISION_LOG D-008）。
     * 訪問者に課金しないのは意図的 — この商品の課金相手は掲載者であり、
     * 埋め込みの閲覧者ではない。propertyId 一致は preview と同様に必須。 */
    const embedTokenParam = new URL(req.url).searchParams.get("embed") || "";
    if (embedTokenParam) {
      const embed = await propertyEmbedRepo.get(embedTokenParam);
      if (embed && embed.enabled && embed.propertyId === matchedProperty.id) {
        if (!allowAssetDownload(`embed:${embedTokenParam}`, key)) {
          return NextResponse.json({ error: "rate_limited" }, { status: 429 });
        }
        const signedEmbed = await presignViewerAsset(key, PRESIGN_TTL_SECONDS);
        if (!signedEmbed) {
          return NextResponse.json({ error: "署名に失敗しました" }, { status: 500 });
        }
        return NextResponse.json(
          { url: signedEmbed },
          { headers: { "Cache-Control": "no-store" } },
        );
      }
      // 無効・停止中の埋め込みトークン → 通常の認証経路へフォールスルー。
    }

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }

    const settings = await getSettings();
    const freeAccess = isFreePeriodActive(settings.freePeriod, new Date().toISOString());
    // 閲覧ゲートはプラン階層ではなくトークン保有量そのもの。フリープランでも
    // サインインしてさえいれば試行でき、下のトークン消費ゲートで実際の可否が
    // 決まる（残高不足なら 402）。プラン階層で差が出るのは月額料金とトークン
    // 付与量、および Team の NDA/制限あり閲覧バイパスのみ。

    if (matchedItem.accessLevel === "restricted" && !canViewBackyard(user)) {
      return NextResponse.json({ error: "制限付きデータです" }, { status: 403 });
    }
    if (matchedItem.accessLevel === "nda_only" && !canViewNdaOnly(user)) {
      return NextResponse.json({ error: "NDA限定データです" }, { status: 403 });
    }

    // 撮影スタジオは自分の物件管理専用アカウント。他物件のウォークスルー視聴
    // （トークン消費）は対象外。自分の物件は下の isOwnStudioProperty で
    // admin と同じ「無料・記録あり」扱いにする（掲載内容の確認に使うため）。
    const isOwnStudioProperty =
      isStudioPurchaseRestricted(user.role) &&
      ownsProperty(user, { id: matchedProperty.id, ownerId: matchedProperty.ownerId });
    if (isStudioPurchaseRestricted(user.role) && !isOwnStudioProperty) {
      return NextResponse.json(
        { error: "撮影スタジオアカウントは他物件の視聴対象外です" },
        { status: 403 },
      );
    }

    /* ── トークン消費ゲート ─────────────────────────────────────────
     * 全プラン共通で「シーン(splatItem)単位」で tokenCost トークンを消費して
     * 視聴をアンロックする（フリープランも含む — 月次付与分等で保有していれば
     * 視聴可）。一度アンロックしたシーンは 1 年間無償で再視聴できる
     * （実装は下の oneYearFrom。view-unlocks.ts の記述とも一致）。
     *
     * 管理者は無条件で視聴でき課金もされないが、「何を見たか」の記録
     * (tokensSpent: 0) は他ユーザーと同じ経路で残す。以前は isAdmin が
     * このブロック自体を丸ごとスキップしていたため、運営が自分の管理者
     * アカウントで動作確認しても /dashboard/unlocked が常に空になり、
     * 「閲覧履歴が正しく動いていない」ように見えていた（実際は記録自体が
     * 一度も作られていなかった）。
     *
     * 限定無料期間中 (freeAccess) は従来どおり記録もしない（キャンペーン中は
     * 全員無条件で無制限視聴のため、履歴に残す意味が薄い）。
     */
    const isAdmin = user.role === "admin";
    // 自分の物件は admin と同じ「無料・記録あり」扱い（掲載内容の確認用）。
    const isFreeViewer = isAdmin || isOwnStudioProperty;
    if (!freeAccess) {
      const propertyId = matchedProperty.id;
      const splatItemIndex = matchedIndex;
      const splatItemId = matchedItem.id;
      const tokenCost = matchedProperty.tokenCost ?? 1;

      // 既に有効なアンロックがあれば課金せずそのまま署名へ（1年間の再視聴無償）。
      // splatItemId（永続識別子）で判定。並び替え前の旧レコード向けに、現在の
      // index ベースの旧キーにもフォールバックする（hasValidUnlock 内部で実施）。
      const alreadyUnlocked = await viewUnlockRepo.hasValidUnlock(
        user.id,
        propertyId,
        splatItemId,
        splatItemIndex,
      );
      if (!alreadyUnlocked) {
        // 残高は「stale な user」ではなく直前に取り直す（gift-actions.ts と同様、
        // 二度クリック等の並行リクエストによる二重消費/lost-update を避ける）。
        // 管理者・自分の物件を見る撮影スタジオは残高チェック・減算の対象外
        // （下の if (!isFreeViewer) 参照）。
        const fresh = isFreeViewer ? user : ((await userRepo.get(user.id)) ?? user);
        if (!isFreeViewer) {
          const spendable = totalTokens(fresh); // 月次 + 購入 + 貢献枠
          if (spendable < tokenCost) {
            return NextResponse.json(
              {
                error: "insufficient_tokens",
                tokenBalance: fresh.tokenBalance,
                purchasedTokens: fresh.purchasedTokens ?? 0,
                bonusTokens: fresh.bonusTokens ?? 0,
                tokenCost,
              },
              { status: 402 },
            );
          }
        }

        const now = new Date().toISOString();

        // 順序: ①アンロック記録を先に作成（自然キーで冪等なのでリトライ安全）→
        //       ②残高を減算。理由: 減算を先にして記録作成に失敗すると、リトライ時
        //       hasValidUnlock=false のまま再度減算され「二重課金」になる。逆順なら
        //       最悪でも「無償視聴（課金漏れ）」で、二重課金より遥かに安全。
        await viewUnlockRepo.upsert({
          id: unlockId(user.id, propertyId, splatItemId),
          userId: user.id,
          propertyId,
          splatItemId,
          splatItemIndex,
          tokensSpent: isFreeViewer ? 0 : tokenCost,
          unlockedAt: now,
          expiresAt: oneYearFrom(now),
        });

        if (!isFreeViewer) {
          // 消費順は「先に失効するものから」= 利用者にとって最も損の少ない順。
          //   ①tokenBalance  サブスク付与分。毎月満タンに補充される＝使わないと
          //                   翌月に上書きされて消えるので最優先。
          //   ②purchasedTokens 購入分。購入から1年で失効。
          //   ③bonusTokens   貢献特別枠。失効しないので最後。
          // 購入分を①より先に減らすと、補充で消えるはずの無料分を残したまま
          // 有料分から削ることになり、実質的に利用者へ不利益が出る。
          let remaining = tokenCost;
          const fromBalance = Math.min(fresh.tokenBalance, remaining);
          remaining -= fromBalance;
          const fromPurchased = Math.min(fresh.purchasedTokens ?? 0, remaining);
          remaining -= fromPurchased;
          const fromBonus = Math.min(fresh.bonusTokens ?? 0, remaining);
          remaining -= fromBonus;
          await userRepo.upsert({
            ...fresh,
            tokenBalance: fresh.tokenBalance - fromBalance,
            purchasedTokens: (fresh.purchasedTokens ?? 0) - fromPurchased,
            bonusTokens: (fresh.bonusTokens ?? 0) - fromBonus,
          });
        }
      }
    }

    // 同一ユーザー×同一アセットへの短時間の連続発行要求を検出してレート制限。
    // 唯一の制御点はここ（この先の実ダウンロードはR2直リンクでアプリを経由しない）。
    if (!isAdmin && !allowAssetDownload(user.id, key)) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }

    const signed = await presignViewerAsset(key, PRESIGN_TTL_SECONDS);
    if (!signed) {
      return NextResponse.json({ error: "署名に失敗しました" }, { status: 500 });
    }
    return NextResponse.json({ url: signed }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "internal", detail: msg }, { status: 500 });
  }
}
