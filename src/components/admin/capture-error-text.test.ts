import { describe, it, expect } from "vitest";
import { captureErrorText } from "./use-preview-capture";

describe("プレビュー撮影の失敗表示", () => {
  it("1粒も読めなかったときは、止めた理由と次の一手を日本語で出す", () => {
    const text = captureErrorText("no-splats");
    expect(text).toContain("撮影を中止");
    expect(text).toContain("配信を確認");
    expect(text).not.toContain("no-splats");
  });

  it("知らない理由はそのまま出す（握りつぶさない）", () => {
    expect(captureErrorText("exception: boom")).toBe("exception: boom");
    expect(captureErrorText()).toBe("キャプチャ失敗");
  });
});
