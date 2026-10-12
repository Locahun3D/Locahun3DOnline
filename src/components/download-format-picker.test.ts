// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import DownloadFormatPicker from "./download-format-picker";

const render = (props: Parameters<typeof DownloadFormatPicker>[0]) =>
  renderToStaticMarkup(createElement(DownloadFormatPicker, props));

describe("DownloadFormatPicker — 形式を選んでダウンロード", () => {
  it("全部入りを先頭に、形式別を容量つきで並べる", () => {
    const html = render({
      purchaseId: "p1",
      bundle: { format: "PLY & OBJ & Blender (ZIP)", sizeMb: 1706 },
      files: [{ format: "Blender (.blend)", sizeMb: 126 }, { format: "PLY (3DGS)", sizeMb: 171 }],
      en: false,
    });
    expect(html).toContain("全部入り — PLY &amp; OBJ &amp; Blender (ZIP) (1.7 GB)");
    expect(html).toContain("Blender (.blend) (126 MB)");
    // 初期選択は全部入り＝format 指定なし
    expect(html).toContain('href="/api/purchase/p1/download"');
  });
  it("形式が1つだけなら選択欄を出さない", () => {
    const html = render({ purchaseId: "p1", bundle: { format: "ZIP", sizeMb: 0 }, files: [], en: true });
    expect(html).not.toContain("<select");
    expect(html).toContain("↓ Download");
  });
  it("ダウンロードできるものが無ければ何も描かない", () => {
    expect(render({ purchaseId: "p1", bundle: null, files: [], en: false })).toBe("");
  });
});
