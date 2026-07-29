/**
 * 制作会社（NDA）アカウント申請を却下するときの理由と、申請者へ出す通知文。
 *
 * ── なぜ理由を持たせるのか ────────────────────────────────
 * 以前は却下通知が「今回は見送りとなりました」の固定文だけで、しかも
 * 遷移先が再申請ページ（/account/upgrade）だった。申請者は何を直せばいいか
 * 分からないまま同じ内容で再申請でき、却下→再申請の往復が起きる。
 * 実際に想定される却下理由はほぼ2つで、どちらも本人が直せる種類のもの:
 *   personal_email … 個人アドレスで申請している（NDAは会社メール限定）
 *   not_eligible   … 制作会社としての要件を満たしていない
 * なので運営は2択から選ぶだけでよく、通知本文がその場で切り替わる。
 *
 * ⚠ この文面は申請者本人が読む唯一の説明。却下の事実だけでなく
 *   「次に何をすればいいか」を必ず1文入れること。
 * ⚠ 却下すると role は individual に戻る。文面はその状態を前提に書く。
 */

/** 却下理由コード。フォームの value と 1:1。 */
export const REJECT_REASONS = ["personal_email", "not_eligible"] as const;
export type RejectReason = (typeof REJECT_REASONS)[number];

/** 管理画面のセレクトに出す短いラベル。 */
export const REJECT_REASON_LABEL: Record<RejectReason, string> = {
  personal_email: "会社メールでない",
  not_eligible: "要件に適合しない",
};

export type RejectNotice = { title: string; body: string; link: string };

const NOTICE: Record<RejectReason, RejectNotice> = {
  personal_email: {
    title: "制作会社アカウントの申請について（メールアドレスのご確認）",
    body:
      "制作会社（NDA）アカウントへの切り替え申請を確認しましたが、" +
      "ご登録のメールアドレスが個人用のアドレスのため、今回は承認を見送りました。" +
      "機密ロケ地の取り扱いを伴うため、所属されている制作会社のドメインのメールアドレスでのご登録をお願いしています。" +
      "会社のメールアドレスに変更のうえ、あらためてお申し込みください。" +
      "現在は個人アカウントとしてそのままご利用いただけます。",
    // 会社アドレスへの変更が先なので、再申請ページではなくアカウント設定へ送る。
    link: "/account",
  },
  not_eligible: {
    title: "制作会社アカウントの申請結果について",
    body:
      "制作会社（NDA）アカウントへの切り替え申請について、" +
      "制作会社としての実体を確認できなかったため、今回は見送りとなりました。" +
      "個人アカウントとして引き続きご利用いただけます。" +
      "制作実績や会社情報などを添えてお問い合わせいただければ、個別に確認いたします。",
    link: "/contact",
  },
};

/** 不正・未指定の値は「要件に適合しない」に寄せる（通知が空になる方が事故）。 */
export function rejectNotice(reason: string | null | undefined): RejectNotice {
  return NOTICE[(REJECT_REASONS as readonly string[]).includes(reason ?? "")
    ? (reason as RejectReason)
    : "not_eligible"];
}
