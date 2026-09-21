import { describe, it, expect } from "vitest";
import { embedUrl, embedSnippet, paddingTopFor } from "./embed-snippet";
import { buildStudioReviewMail } from "./studio-review-mail";

describe("埋め込みURL", () => {
  it("既定ではパラメータを付けない（貼ったURLを短く保つ）", () => {
    expect(embedUrl("https://locahun3d.com", "abc123")).toBe("https://locahun3d.com/embed/abc123");
    expect(embedUrl("https://locahun3d.com/", "abc123")).toBe("https://locahun3d.com/embed/abc123");
  });
  it("指定した表示だけをパラメータにする", () => {
    expect(embedUrl("https://x.test", "t", { autoplay: true })).toBe("https://x.test/embed/t?autoplay=1");
    expect(embedUrl("https://x.test", "t", { title: false })).toBe("https://x.test/embed/t?title=0");
    expect(embedUrl("https://x.test", "t", { scene: "s1" })).toBe("https://x.test/embed/t?scene=s1");
  });
});

describe("埋め込みコード", () => {
  const code = embedSnippet("https://locahun3d.com/embed/abc?autoplay=1", { title: "スタジオA 3Dツアー" });

  it("比率を保つ入れ物に入れ、幅は親に合わせる（スマホで崩れない）", () => {
    expect(code).toContain("padding-top:56.25%");
    expect(code).toContain("width:100%");
    expect(code).not.toMatch(/height:\s*\d+px/);    // 固定高さにしない
    // aspect-ratio と padding を両方書くと高さが二重になる（実機で確認済み）。
    expect(code).not.toContain("aspect-ratio");
  });

  it("全画面・VR・遅延読み込みを許可する", () => {
    expect(code).toContain("allowfullscreen");
    expect(code).toContain('allow="fullscreen; xr-spatial-tracking"');
    expect(code).toContain('loading="lazy"');
  });

  it("属性に入る値を素通ししない", () => {
    const bad = embedSnippet('https://x.test/embed/t?a="><script>alert(1)</script>', { title: '"><b>' });
    expect(bad).not.toContain("<script>");
    expect(bad).not.toContain('title=""><b>"');
  });

  it("比率から高さの保険を計算する", () => {
    expect(paddingTopFor("16 / 9")).toBe("56.25%");
    expect(paddingTopFor("4 / 3")).toBe("75%");
    expect(paddingTopFor("こわれた値")).toBe("56.25%");
  });
});

describe("公開申請メールの埋め込み案内", () => {
  const base = {
    studioName: "スタジオA",
    previewUrl: "https://locahun3d.com/preview/tok",
    previewExpiresAt: "2026-10-05T00:00:00.000Z",
  };

  it("埋め込みURLを渡すと、貼り付け用コードと期限なしの説明が入る", () => {
    const mail = buildStudioReviewMail({ ...base, embedUrl: "https://locahun3d.com/embed/abc" });
    expect(mail.bodyHtml).toContain("貴社サイトに3Dツアーを貼れます");
    expect(mail.bodyHtml).toContain("期限切れになりません");
    expect(mail.bodyHtml).toContain("https://locahun3d.com/embed/abc");
    // コードは文字参照で入る（メールソフトがタグとして解釈しない）
    expect(mail.bodyHtml).toContain("&lt;iframe");
    expect(mail.bodyHtml).not.toContain("<iframe");
  });

  it("渡さなければ節ごと出ない", () => {
    const mail = buildStudioReviewMail(base);
    expect(mail.bodyHtml).not.toContain("貴社サイトに3Dツアーを貼れます");
  });
});
