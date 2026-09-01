import { describe, expect, it } from "vitest";
import {
  collectClasses,
  extractHeader,
  extractStylesheetHrefs,
  sanitizeAltLangUrl,
  transformCss,
  transformHeaderHtml,
} from "./header-partial";

const C = "/*".concat("*/"); // 空コメント（このファイル内で `*/` を直書きしないため）
const cmt = (t: string) => `/* ${t} ` + "*/";

describe("transformCss", () => {
  it(":root / html / body を :host へ寄せる", () => {
    const out = transformCss(":root{--a:1}html{--b:2}body{--c:3}", new Set());
    expect(out).toContain(":host{--a:1}");
    expect(out).toContain(":host{--b:2}");
    expect(out).toContain(":host{--c:3}");
  });

  it("zoom と --z は落とし、末尾で --z:1 を与える", () => {
    const out = transformCss("html{--z:.9;zoom:.9;--header-h:56px}", new Set());
    expect(out).not.toMatch(/zoom:\s*\.9/);
    expect(out).toContain("--header-h:56px");
    expect(out.endsWith(":host{--z:1;display:contents}")).toBe(true);
  });

  it("@font-face は落とす（Shadow DOM で効かない＋巨大）", () => {
    const out = transformCss("@font-face{font-family:X;src:url(a.woff2)}.a{color:red}", new Set(["a"]));
    expect(out).not.toContain("font-face");
    expect(out).toContain(".a{color:red}");
  });

  it("コメントが前置された at-rule も at-rule として扱う", () => {
    // ⚠ 実際のビルド出力はこの形。素朴に prelude を見ると @font-face を
    //   セレクタと誤認し、コメント中の `.module.css` をクラス名として拾って
    //   ルールごと落としていた（ヘッダーの1pxボーダー消失の原因）。
    const css = `${cmt("x.module.css")}@font-face{src:url(a)}${cmt("y")}.a{color:red}`;
    const out = transformCss(css, new Set(["a"]));
    expect(out).not.toContain("src:url(a)");
    expect(out).toContain(".a{color:red}");
  });

  it("@layer properties 内の @supports ゲートを外す（@property の代替）", () => {
    const css =
      "@layer properties{@supports (-webkit-hyphens:none){*,:before{--tw-border-style:solid}}}" +
      "@layer utilities{.b{border-bottom-style:var(--tw-border-style)}}";
    const out = transformCss(css, new Set(["b"]));
    expect(out).not.toContain("@supports");
    expect(out).toContain("--tw-border-style:solid");
  });

  it("ヘッダーに出てこないクラスのルールは落とす", () => {
    const out = transformCss(".used{a:1}.unused{a:2}.used .unused{a:3}", new Set(["used"]));
    expect(out).toContain(".used{a:1}");
    expect(out).not.toContain(".unused");
  });

  it("動的に付け外しするクラスは残す", () => {
    const css = String.raw`.max-\[1024px\]\:hidden{display:none}`;
    expect(transformCss(css, new Set())).toContain("display:none");
  });

  it("空になった @media は出さない", () => {
    expect(transformCss("@media (min-width:1px){.x{a:1}}", new Set())).not.toContain("@media");
  });
});

describe("transformHeaderHtml", () => {
  it("ルート相対リンクを絶対URLにし、言語トグルだけ差し替える", () => {
    const html =
      '<header><a href="/pricing">p</a>' +
      '<a href="/en" aria-label="Language">EN</a>' +
      '<a href="https://web.locahun3d.com/works/index.html">w</a>' +
      "<script>x()</" + "script></header>";
    const out = transformHeaderHtml(html, "https://web.locahun3d.com/en/works/a.html");
    expect(out).toContain('href="https://locahun3d.com/pricing"');
    expect(out).toContain('href="https://web.locahun3d.com/en/works/a.html" aria-label="Language"');
    expect(out).toContain('href="https://web.locahun3d.com/works/index.html"');
    expect(out).not.toContain("<script");
  });
});

describe("sanitizeAltLangUrl", () => {
  it("works ドメイン配下だけ通す", () => {
    expect(sanitizeAltLangUrl("https://web.locahun3d.com/works/a.html")).toBe(
      "https://web.locahun3d.com/works/a.html",
    );
    expect(sanitizeAltLangUrl("https://evil.example/x")).toBeNull();
    expect(sanitizeAltLangUrl(null)).toBeNull();
  });
});

describe("抽出", () => {
  it("header / stylesheet / class を拾う", () => {
    const page =
      '<html><head><link rel="stylesheet" href="/a.css"/><link rel="icon" href="/i.svg"/></head>' +
      '<body><header class="x y"><div class="z"></div></header></body></html>';
    expect(extractStylesheetHrefs(page)).toEqual(["/a.css"]);
    const h = extractHeader(page)!;
    expect(h.startsWith("<header")).toBe(true);
    expect([...collectClasses(h)].sort()).toEqual(["x", "y", "z"]);
  });
});

// 参照だけして未使用警告を避ける
void C;
