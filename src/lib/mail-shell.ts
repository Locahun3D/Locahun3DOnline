/**
 * 取引メールの共通レイアウト（純関数・server-only 依存なし）。
 *
 * もとは email.ts の shell()。Worker の定期実行（みなし承認の再確認メール。
 * deemed-approval-job.ts）からも同じ見た目で送るため、2026-10-08 に切り出した。
 * Next の外でも読み込まれるので、"server-only" や getCloudflareContext を import しないこと。
 *
 * 2026-09-20: 商標ロゴ統一（本人ルール）。メール上部の帯はロゴ扱いなので、サイトヘッダーと
 *   同じ欧文ワードマーク「Locahun 3D」にする（marketingShell も同じ）。メールは従来どおり
 *   リモート画像を使わないテキスト表記。件名・差出人名・フッターの製品名「ロケハン3D」は本文扱いで据え置き。
 */
export function mailShell(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"></head>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;background:#f4f4f2;margin:0;padding:24px;color:#111;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e5e5;">
    <div style="background:#111;color:#fff;padding:20px 28px;font-weight:700;letter-spacing:.06em;">
      Locahun 3D <span style="opacity:.5;font-size:11px;font-weight:400;">locahun3d.com</span>
    </div>
    <div style="padding:28px;">
      <h1 style="font-size:18px;margin:0 0 16px;">${title}</h1>
      ${bodyHtml}
    </div>
    <div style="padding:16px 28px;border-top:1px solid #eee;font-size:11px;color:#999;">
      発行者: ロケハン3D（Kawaii World Industries株式会社（KWI株式会社）） / お問い合わせ: contact@locahun3d.com
    </div>
  </div>
</body></html>`;
}
