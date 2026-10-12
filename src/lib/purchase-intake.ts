import "server-only";
import { userRepo } from "./users";
import type { PurchaseIntake } from "./use-purpose";

/**
 * ダウンロード時に聞いた会社名・案内メールの同意を、会員情報にも反映する（2026-10-13）。
 *
 * - 会社名は、会員情報が空のときだけ入れる（本人がマイページで入れた値を上書きしない）。
 * - 案内メールは「受け取る」にチェックしたときだけ同意にする。未チェックは既存の同意を変えない
 *   （特定電子メール法のオプトイン。ここで同意を外すことはしない）。
 * 失敗しても購入は止めない（呼び出し側で握りつぶす）。
 */
export async function applyPurchaseIntake(userId: string, intake: PurchaseIntake): Promise<void> {
  const u = await userRepo.get(userId);
  if (!u) return;
  const company = !u.company?.trim() && intake.buyerCompany ? intake.buyerCompany : u.company;
  const consentOn = intake.marketingConsent && !u.marketingConsent;
  if (company === u.company && !consentOn) return;
  await userRepo.upsert({
    ...u,
    company,
    ...(consentOn
      ? {
          marketingConsent: true,
          marketingConsentAt: new Date().toISOString(),
          unsubscribeToken: u.unsubscribeToken || crypto.randomUUID(),
        }
      : {}),
  });
}
