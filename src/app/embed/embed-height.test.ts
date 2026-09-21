import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * 埋め込みページの高さは「実画面基準」で書く（globals.css 冒頭の規約2）。
 *
 * 素の `100dvh` は html の zoom（720–1199px で 0.8 / 1200px以上で 0.9）の影響を
 * 受けないため、掲載者サイトに貼った 16:9 の枠の**下端に黒い帯**が残る
 * （2026-09-21 実測: 幅992px の枠で約115px。別オリジンの検証ページで再現）。
 * dev の同一オリジンプレビューでは気づきにくいので、ここで機械的に止める。
 */
describe("埋め込みページの高さ", () => {
  const src = readFileSync(path.join(process.cwd(), "src/app/embed/[token]/page.tsx"), "utf8");

  it("ズームで割り戻した高さを使う", () => {
    expect(src).toContain("h-[calc(100dvh/var(--z))]");
  });

  it("素の 100dvh を使わない", () => {
    expect(src).not.toContain("h-[100dvh]");
  });
});
