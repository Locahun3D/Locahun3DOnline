import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/dal";
import { repo as propertyRepo } from "@/lib/store";
import { canViewBackyard, canViewNdaOnly, totalTokens } from "@/lib/account-schema";
import { userRepo } from "@/lib/users";
import {
  viewUnlockRepo,
  unlockId,
  oneYearFrom,
} from "@/lib/view-unlocks";
import { getSettings } from "@/lib/site-settings";
import { isFreePeriodActive } from "@/lib/settings-schema";
import { presignViewerAsset, presignConfigured } from "@/lib/r2-presign";

export const runtime = "nodejs";

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

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }

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

    /* ── トークン消費ゲート ─────────────────────────────────────────
     * 全プラン共通で「シーン(splatItem)単位」で tokenCost トークンを消費して
     * 視聴をアンロックする（フリープランも含む — 月次付与分等で保有していれば
     * 視聴可）。一度アンロックしたシーンは 2 年間無償で再視聴できる。
     *
     * バイパス（無条件で通す）:
     *   - 管理者 (role === "admin")
     *   - 限定無料期間中 (freeAccess)
     */
    const isAdmin = user.role === "admin";
    if (!isAdmin && !freeAccess) {
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
        const fresh = (await userRepo.get(user.id)) ?? user;
        const spendable = totalTokens(fresh); // tokenBalance + bonusTokens
        if (spendable < tokenCost) {
          return NextResponse.json(
            {
              error: "insufficient_tokens",
              tokenBalance: fresh.tokenBalance,
              bonusTokens: fresh.bonusTokens ?? 0,
              tokenCost,
            },
            { status: 402 },
          );
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
          tokensSpent: tokenCost,
          unlockedAt: now,
          expiresAt: oneYearFrom(now),
        });

        // サブスク付与分 (tokenBalance) を優先消費し、不足分のみ貢献特別枠
        // (bonusTokens) から引く。ユーザー要件は「サブスクのプールから消費」なので
        // tokenBalance を先に減らす。ゲスト等の bonusTokens も使えるようにして
        // 有効残高が枯渇しない限りは視聴を止めない。
        let remaining = tokenCost;
        const fromBalance = Math.min(fresh.tokenBalance, remaining);
        remaining -= fromBalance;
        const fromBonus = Math.min(fresh.bonusTokens ?? 0, remaining);
        remaining -= fromBonus;
        await userRepo.upsert({
          ...fresh,
          tokenBalance: fresh.tokenBalance - fromBalance,
          bonusTokens: (fresh.bonusTokens ?? 0) - fromBonus,
        });
      }
    }

    const signed = await presignViewerAsset(key, 3600);
    if (!signed) {
      return NextResponse.json({ error: "署名に失敗しました" }, { status: 500 });
    }
    return NextResponse.json({ url: signed }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "internal", detail: msg }, { status: 500 });
  }
}
