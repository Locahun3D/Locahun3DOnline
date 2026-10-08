import { describe, it, expect } from "vitest";
import {
  buildFrameAncestorsCsp,
  embedTokenFromPath,
  isReferrerAllowed,
  MAX_ALLOWED_DOMAINS,
  normalizeAllowedDomain,
  parseAllowedDomains,
  sanitizeAllowedDomains,
} from "./embed-domains";

describe("normalizeAllowedDomain", () => {
  it("スキーム省略は https、パス・末尾スラッシュは捨て、小文字にそろえる", () => {
    expect(normalizeAllowedDomain("Studio-Example.JP")).toBe("https://studio-example.jp");
    expect(normalizeAllowedDomain("https://www.example.com/tour/page?x=1")).toBe("https://www.example.com");
    expect(normalizeAllowedDomain("http://localhost:8080/")).toBe("http://localhost:8080");
  });

  it("サブドメインのワイルドカード（先頭の *. のみ）", () => {
    expect(normalizeAllowedDomain("*.example.com")).toBe("https://*.example.com");
    expect(normalizeAllowedDomain("*.com")).toBeNull();
    expect(normalizeAllowedDomain("www.*.example.com")).toBeNull();
  });

  it("不正な値は null", () => {
    for (const bad of ["", "ftp://example.com", "exa mple.com", "javascript:alert(1)", "'self'", "example.com:99999", "a;b.com"]) {
      expect(normalizeAllowedDomain(bad)).toBeNull();
    }
  });
});

describe("parseAllowedDomains", () => {
  it("カンマ・改行・空白区切り、重複除去、不正は invalid に", () => {
    const r = parseAllowedDomains("example.com, https://example.com/\n*.studio.jp  bad_host!\n");
    expect(r.domains).toEqual(["https://example.com", "https://*.studio.jp"]);
    expect(r.invalid).toEqual(["bad_host!"]);
  });

  it("空なら空（制限なし）", () => {
    expect(parseAllowedDomains("  \n ")).toEqual({ domains: [], invalid: [] });
  });

  it("上限を超えた分は捨てる", () => {
    const text = Array.from({ length: MAX_ALLOWED_DOMAINS + 5 }, (_, i) => `s${i}.example.com`).join(",");
    expect(parseAllowedDomains(text).domains).toHaveLength(MAX_ALLOWED_DOMAINS);
  });
});

describe("buildFrameAncestorsCsp", () => {
  it("空なら null（ヘッダーを付けない＝従来どおり）", () => {
    expect(buildFrameAncestorsCsp([])).toBeNull();
    expect(sanitizeAllowedDomains(undefined)).toEqual([]);
  });

  it("'self' と許可リスト", () => {
    expect(buildFrameAncestorsCsp(["https://example.com", "https://*.studio.jp"])).toBe(
      "frame-ancestors 'self' https://example.com https://*.studio.jp",
    );
  });

  it("保存値に紛れた不正な値（ヘッダー注入など）は捨てる", () => {
    expect(buildFrameAncestorsCsp(["https://ok.com; script-src *", "https://ok.com"])).toBe(
      "frame-ancestors 'self' https://ok.com",
    );
    expect(buildFrameAncestorsCsp(["*"])).toBeNull();
  });
});

describe("isReferrerAllowed（補助チェック）", () => {
  const list = ["https://example.com", "https://*.studio.jp"];
  it("許可リストが空なら常に許可", () => {
    expect(isReferrerAllowed("https://evil.test/", [])).toBe(true);
  });
  it("一致・サブドメイン一致は許可、それ以外は不可", () => {
    expect(isReferrerAllowed("https://example.com/page", list)).toBe(true);
    expect(isReferrerAllowed("https://www.studio.jp/", list)).toBe(true);
    expect(isReferrerAllowed("https://studio.jp/", list)).toBe(false);
    expect(isReferrerAllowed("https://www.example.com/", list)).toBe(false);
    expect(isReferrerAllowed("http://example.com/", list)).toBe(false);
    expect(isReferrerAllowed("https://evil.test/", list)).toBe(false);
  });
  it("referrer が空・自サイトなら止めない", () => {
    expect(isReferrerAllowed("", list)).toBe(true);
    expect(isReferrerAllowed("https://locahun3d.com/admin", list, "https://locahun3d.com")).toBe(true);
  });
});

describe("embedTokenFromPath", () => {
  it("/embed/<token> と /en/embed/<token> だけ", () => {
    expect(embedTokenFromPath("/embed/AbC_123-xyz789")).toBe("AbC_123-xyz789");
    expect(embedTokenFromPath("/en/embed/AbC_123-xyz789/")).toBe("AbC_123-xyz789");
    expect(embedTokenFromPath("/embed/")).toBeNull();
    expect(embedTokenFromPath("/embed/a/b")).toBeNull();
    expect(embedTokenFromPath("/properties/x")).toBeNull();
  });
});
