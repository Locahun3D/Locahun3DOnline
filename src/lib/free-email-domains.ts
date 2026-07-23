/**
 * フリーメール判定 — PURE（server-only/node依存なし。server action・
 * クライアント両方から安全にimportできる）。
 *
 * 制作会社（NDA締結）アカウントは、会社が実在する裏付けとして会社ドメインの
 * メールアドレスを必須にする（D-012関連の運用強化）。Gmail・Outlook等の
 * 個人向け無料メールサービスでは申請・NDA締結ともにブロックする。
 *
 * 網羅的なリストではない（新しい無料メールサービスは今後も出てくる）ので、
 * これは性善説の一次フィルタ。完全な本人確認はしない。
 */
const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "outlook.jp",
  "hotmail.com",
  "hotmail.co.jp",
  "live.com",
  "live.jp",
  "msn.com",
  "yahoo.com",
  "yahoo.co.jp",
  "ymail.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "protonmail.com",
  "proton.me",
  "pm.me",
  "gmx.com",
  "gmx.net",
  "zoho.com",
  "yandex.com",
  "yandex.ru",
  "mail.com",
  "163.com",
  "126.com",
  "qq.com",
  "naver.com",
  "docomo.ne.jp",
  "ezweb.ne.jp",
  "au.com",
  "softbank.ne.jp",
  "i.softbank.jp",
]);

export function emailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at === -1 ? "" : email.slice(at + 1).trim().toLowerCase();
}

export function isFreeEmailDomain(email: string): boolean {
  const domain = emailDomain(email);
  return domain !== "" && FREE_EMAIL_DOMAINS.has(domain);
}
