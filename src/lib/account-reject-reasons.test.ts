import { describe, it, expect } from "vitest";
import {
  REJECT_REASONS,
  REJECT_REASON_LABEL,
  rejectNotice,
} from "./account-reject-reasons";

describe("却下理由の通知文", () => {
  it("2つの理由それぞれに別々の文面がある", () => {
    const a = rejectNotice("personal_email");
    const b = rejectNotice("not_eligible");
    expect(a.title).not.toBe(b.title);
    expect(a.body).not.toBe(b.body);
  });

  it("会社メールでない場合は、会社アドレスでの再登録を案内する", () => {
    const n = rejectNotice("personal_email");
    expect(n.body).toContain("会社");
    expect(n.body).toContain("メールアドレス");
    // 変更が先なので再申請ページではなくアカウント設定へ送る
    expect(n.link).toBe("/account");
  });

  it("要件に適合しない場合は、問い合わせで個別確認できることを伝える", () => {
    const n = rejectNotice("not_eligible");
    expect(n.body).toContain("お問い合わせ");
    expect(n.link).toBe("/contact");
  });

  it("どの文面も『次に何をすればいいか』と『今は個人アカウントで使える』を含む", () => {
    for (const r of REJECT_REASONS) {
      const n = rejectNotice(r);
      expect(n.body).toContain("個人アカウント");
      expect(n.body.length).toBeGreaterThan(60);
      expect(n.title.length).toBeGreaterThan(0);
      expect(REJECT_REASON_LABEL[r].length).toBeGreaterThan(0);
    }
  });

  it("未知の値・未指定は『要件に適合しない』へフォールバックする（通知が空になる方が事故）", () => {
    const fallback = rejectNotice("not_eligible");
    for (const bad of ["", "  ", "nope", null, undefined]) {
      expect(rejectNotice(bad as string | null | undefined)).toEqual(fallback);
    }
  });
});
