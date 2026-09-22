import { describe, it, expect } from "vitest";
import { streamContentEtag } from "./stream-content-etag";

describe("streamContentEtag", () => {
  it("R2 の ETag の引用符を外し、強い ETag として包み直す", () => {
    expect(streamContentEtag('"0123456789abcdef"', 0)).toBe('"l3d-content-0123456789abcdef-0"');
  });

  it("ZIP 内のオフセットを末尾に付ける", () => {
    expect(streamContentEtag('"abcdef0123"', 4096)).toBe('"l3d-content-abcdef0123-4096"');
  });

  it("マルチパートの ETag（-3 付き）はそのまま残す", () => {
    expect(streamContentEtag('"d41d8cd98f00b204e9800998ecf8427e-3"', 77)).toBe(
      '"l3d-content-d41d8cd98f00b204e9800998ecf8427e-3-77"',
    );
  });

  it("英数・_・- 以外の文字は _ に置き換える", () => {
    expect(streamContentEtag('"ab/c+d=e.f"', 1)).toBe('"l3d-content-ab_c_d_e_f-1"');
  });

  it("弱い ETag の W/ は落とす", () => {
    expect(streamContentEtag('W/"abcdef12"', 0)).toBe('"l3d-content-abcdef12-0"');
  });

  it("URL やトークンに依存しない（同じ中身なら同じ値）", () => {
    const a = streamContentEtag('"feedface00"', 128);
    const b = streamContentEtag('"feedface00"', 128);
    expect(a).toBe(b);
    expect(a).toMatch(/^"l3d-content-[A-Za-z0-9_-]{8,200}"$/);
  });
});
