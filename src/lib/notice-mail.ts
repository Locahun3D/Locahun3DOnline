/**
 * ダウンロード経験者への「お知らせ」メールの純関数（server-only 依存なし・テスト用に分離）。
 *
 * 2026-11-11 本人指示「送る仕組みを別に作る」:
 * 管理画面の一斉配信（marketing-actions.ts）は広告メールなので、配信に同意した会員にしか
 * 送れない（特定電子メール法）。利用条件の改定など、取引に付随する通知は同意がなくても
 * 送れるので、3Dデータを入手したことのある会員全員に送る経路を別に用意した。
 * ⚠ この経路で宣伝（新商品・値段・キャンペーンの案内）を送らないこと。宣伝は同意者向けの一斉配信で。
 */

export type NoticeRecipient = { userId: string; email: string };

/**
 * 宛先: 3Dデータの入手（無料含む）が完了している、有効な会員。メールアドレスで重複を除く。
 * 並びは userId 順で固定（途中で失敗したときに「何番目から」で再開できるように）。
 */
export function selectNoticeRecipients(
  purchases: { userId: string; status: string }[],
  users: { id: string; email: string; status: string }[],
): NoticeRecipient[] {
  const buyers = new Set(purchases.filter((p) => p.status === "completed").map((p) => p.userId));
  const seen = new Set<string>();
  const out: NoticeRecipient[] = [];
  for (const u of [...users].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    if (!buyers.has(u.id) || u.status !== "active") continue;
    const email = (u.email || "").trim();
    const key = email.toLowerCase();
    if (!email || !key.includes("@") || seen.has(key)) continue;
    seen.add(key);
    out.push({ userId: u.id, email });
  }
  return out;
}

const URL_RE = /https?:\/\/[^\s<>"']+/g;

/**
 * プレーンテキスト本文 → HTML。空行で段落、改行は <br />。
 * URL はリンクにする（本人ルール: メールのURLはリンクに）。エスケープしてから変換する。
 */
export function noticeBodyToHtml(bodyText: string): string {
  const escaped = bodyText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escaped
    .split(/\n{2,}/)
    .map((para) => {
      const linked = para.replace(URL_RE, (u) => `<a href="${u}" style="color:#1a73e8;">${u}</a>`);
      return `<p style="font-size:14px;line-height:1.85;margin:0 0 16px;">${linked.replace(/\n/g, "<br />")}</p>`;
    })
    .join("");
}

/** Resend の batch API は1回100通まで。 */
export const NOTICE_BATCH_SIZE = 100;

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
