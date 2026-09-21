import { describe, it, expect, vi, afterEach } from "vitest";
import { buildStudioReviewMail, formatExpiryJst, STUDIO_REVIEW_CHECKPOINTS } from "./studio-review-mail";

const input = {
  studioName: "スタジオ青空",
  previewUrl: "https://locahun3d.com/preview/abcDEF123456789012",
  previewExpiresAt: "2026-10-20T03:00:00.000Z",
};

describe("buildStudioReviewMail", () => {
  it("件名にスタジオ名が入る。再送は【再送】が付く", () => {
    expect(buildStudioReviewMail(input).subject).toBe("【ロケハン3D】掲載内容ご確認のお願い（スタジオ青空）");
    expect(buildStudioReviewMail({ ...input, resend: true }).subject.startsWith("【再送】")).toBe(true);
  });
  it("プレビューURL・有効期限・確認してほしい点・返信方法が本文にある", () => {
    const { bodyHtml } = buildStudioReviewMail(input);
    expect(bodyHtml).toContain(`href="${input.previewUrl}"`);
    expect(bodyHtml).toContain("2026年10月20日");
    expect(bodyHtml).toContain("ログインは不要");
    for (const c of STUDIO_REVIEW_CHECKPOINTS) expect(bodyHtml).toContain(c);
    for (const word of ["料金", "写真", "設備"]) expect(bodyHtml).toContain(word);
    expect(bodyHtml).toContain("「この内容でOK・公開する」ボタン");
    expect(bodyHtml).toContain("contact@locahun3d.com");
  });
  it("短い英語の案内が付く", () => {
    expect(buildStudioReviewMail(input).bodyHtml).toMatch(/English: .*reply to this email/);
  });
  it("スタジオ名は HTML エスケープされる", () => {
    const { bodyHtml } = buildStudioReviewMail({ ...input, studioName: '<script>alert(1)</script>' });
    expect(bodyHtml).not.toContain("<script>");
    expect(bodyHtml).toContain("&lt;script&gt;");
  });
  it("スタジオ名が空でも宛名が成立する", () => {
    expect(buildStudioReviewMail({ ...input, studioName: " " }).bodyHtml).toContain("貴スタジオ ご担当者様");
  });
  it("期限は日本時間の日付（UTC 15:00 以降は翌日）", () => {
    expect(formatExpiryJst("2026-10-20T14:59:00.000Z")).toBe("2026年10月20日");
    expect(formatExpiryJst("2026-10-20T15:00:00.000Z")).toBe("2026年10月21日");
    expect(formatExpiryJst("not a date")).toBe("");
  });
});

describe("sendStudioReviewMail（実送信しないこと）", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("RESEND_API_KEY が無い環境ではドライラン: fetch を呼ばず dry-run を返す", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const { sendStudioReviewMail } = await import("./email");
    const r = await sendStudioReviewMail({
      to: " studio@example.com ",
      studioName: "スタジオ青空",
      previewPath: "/preview/tok",
      previewExpiresAt: input.previewExpiresAt,
    });
    expect(r).toEqual({ status: "dry-run", to: "studio@example.com" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalled();
    info.mockRestore();
  });

  it("鍵があっても MAIL_DRY_RUN=1 なら送らない", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("MAIL_DRY_RUN", "1");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const { sendStudioReviewMail } = await import("./email");
    const r = await sendStudioReviewMail({ to: "s@example.com", studioName: "x", previewPath: "/preview/t", previewExpiresAt: input.previewExpiresAt });
    expect(r.status).toBe("dry-run");
    expect(fetchSpy).not.toHaveBeenCalled();
    info.mockRestore();
  });

  it("送信時: 差出人 contact@・返信先 contact@・運営へ BCC。失敗は failed で返す", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("MAIL_DRY_RUN", "");
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchSpy);
    const { sendStudioReviewMail } = await import("./email");
    const r = await sendStudioReviewMail({ to: "s@example.com", studioName: "スタジオ青空", previewPath: "/preview/t", previewExpiresAt: input.previewExpiresAt });
    expect(r).toEqual({ status: "sent", to: "s@example.com" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.to).toEqual(["s@example.com"]);
    expect(body.from).toContain("contact@locahun3d.com");
    expect(body.reply_to).toEqual(["contact@locahun3d.com"]);
    expect(body.bcc).toEqual(["contact@locahun3d.com"]);
    expect(body.html).toContain("/preview/t");

    fetchSpy.mockResolvedValueOnce({ ok: false });
    const bad = await sendStudioReviewMail({ to: "s@example.com", studioName: "x", previewPath: "/preview/t", previewExpiresAt: input.previewExpiresAt });
    expect(bad.status).toBe("failed");
  });
});
