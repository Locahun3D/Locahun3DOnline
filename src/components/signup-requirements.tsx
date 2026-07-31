/**
 * スタジオ用アカウントを登録するときの条件を、読まなくても分かる形で示す。
 *
 * ── なぜ作ったか ────────────────────────────────────────────
 * もとは「アカウント種別で『撮影スタジオ』を選択し、会社（スタジオ）の
 * メールアドレスでご登録ください（Gmail等のフリーメールはご利用いただけません）」
 * という 10px のグレー1行だった。条件が2つ入っているうえに小さく、
 * 「分かりにくい」と2度指摘された（2026-07-30）。
 *
 * 文章を言い換えるのではなく、**実例で示す**。使えるアドレス・使えない
 * アドレスを ○/✕ で並べるのが、フリーメール不可を伝える最短の方法。
 *
 * ⚠ 判定の実体は lib/free-email-domains.ts。ここに挙げる例はその代表であって
 *   一覧ではない（新しいフリーメールは今後も出るので「等」を外さない）。
 */
export default function SignupRequirements({
  en,
  /** 既にログイン中の人向け。別アドレスが必要な旨を足す。 */
  needsDifferentAddress = false,
}: {
  en: boolean;
  needsDifferentAddress?: boolean;
}) {
  return (
    <div className="mt-4 border border-line bg-bg/60">
      <div className="mono text-[10px] tracking-[0.2em] uppercase text-accent px-4 pt-3 pb-2">
        {en ? "Two things to get right" : "登録時の2つのポイント"}
      </div>

      <ol className="divide-y divide-line">
        <li className="px-4 py-3 flex gap-3">
          <span className="mono text-[10px] text-accent pt-[3px] shrink-0">1</span>
          <div className="min-w-0">
            <div className="text-[13px] font-bold leading-[1.6]">
              {en ? "Pick “Filming studio” as the account type" : "アカウント種別は「撮影スタジオ」を選ぶ"}
            </div>
            <p className="text-[12px] text-muted leading-[1.8] mt-0.5">
              {en
                ? "It's the first question after sign-up. Personal accounts cannot create listing pages."
                : "登録直後に聞かれます。「個人」で作ると掲載ページを作成できません。"}
            </p>
          </div>
        </li>

        <li className="px-4 py-3 flex gap-3">
          <span className="mono text-[10px] text-accent pt-[3px] shrink-0">2</span>
          <div className="min-w-0">
            <div className="text-[13px] font-bold leading-[1.6]">
              {en ? "Use your company's own email address" : "会社（スタジオ）のメールアドレスで登録する"}
            </div>
            {/* 言葉より実例。○/✕ を並べるだけで「会社ドメイン」が伝わる。 */}
            <div className="mt-2 space-y-1">
              <div className="flex items-center gap-2 text-[12px]">
                <span className="mono text-[11px] text-[#0f766e] font-bold shrink-0" aria-hidden="true">○</span>
                <span className="mono text-[11.5px] text-ink break-all">info@your-studio.co.jp</span>
                <span className="text-[11px] text-muted shrink-0">
                  {en ? "company domain" : "会社のドメイン"}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[12px]">
                <span className="mono text-[11px] text-[#c2410c] font-bold shrink-0" aria-hidden="true">✕</span>
                <span className="mono text-[11.5px] text-muted line-through break-all">your-name@gmail.com</span>
                <span className="text-[11px] text-muted shrink-0">
                  {en ? "free webmail" : "フリーメール"}
                </span>
              </div>
            </div>
            <p className="text-[12px] text-muted leading-[1.8] mt-2">
              {en
                ? "Gmail, Outlook, Yahoo and the like cannot be used — the address is how we confirm the studio exists."
                : "Gmail・Outlook・Yahooメール等はご利用いただけません。掲載主が実在することの確認に使うためです。"}
              {needsDifferentAddress &&
                (en
                  ? " Accounts are identified by email, so use an address different from the one you're signed in with."
                  : "なお、アカウントはメールアドレスで識別されるため、今ログイン中のものとは別のアドレスをご用意ください。")}
            </p>
          </div>
        </li>
      </ol>
    </div>
  );
}
