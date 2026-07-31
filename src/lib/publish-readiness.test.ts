import { describe, it, expect } from "vitest";
import { publishReadiness } from "./publish-readiness";
import { propertySchema } from "./schemas";

/** 画像未選択の cover。⚠ width/height は positive 必須なので既定値を入れる
    （下書き段階でも 0 は許されない）。公開判定が見るのは src と alt。 */
const EMPTY_COVER = { src: "", alt: "" };
const draft = (over: Record<string, unknown> = {}) =>
  propertySchema.parse({ id: "st-001", category: "studio", cover: EMPTY_COVER, ...over });

/** 3DGS以外を全部埋めた状態。 */
const filled = (over: Record<string, unknown> = {}) =>
  draft({
    title: "検証スタジオ",
    area: "東京23区",
    prefecture: "東京都",
    city: "世田谷区",
    summary: "白ホリのある大スパンスタジオです。",
    hourlyPrice: 15000,
    cover: { src: "/uploads/st-001/cover.jpg", alt: "スタジオ全景", width: 1600, height: 1000 },
    ...over,
  });

describe("publishReadiness — 3DGS以外が揃っているか", () => {
  it("3DGSが無くても、他が揃っていれば申請できる", () => {
    const p = filled({ splatUrl: "" });
    expect(publishReadiness(p)).toEqual({ ready: true, missing: [] });
  });

  it("空の下書きは申請できず、足りない項目が出る", () => {
    const r = publishReadiness(draft());
    expect(r.ready).toBe(false);
    expect(r.missing).toContain("物件名");
    expect(r.missing).toContain("紹介文（サマリー）");
    expect(r.missing).toContain("カバー画像");
  });

  it("項目名は日本語で、同じ項目を重複させない", () => {
    const r = publishReadiness(draft());
    expect(r.missing.every((m) => !m.includes("."))).toBe(true);
    expect(new Set(r.missing).size).toBe(r.missing.length);
  });

  it("カバー画像だけ無いときは、それだけが出る", () => {
    const r = publishReadiness(filled({ cover: EMPTY_COVER }));
    expect(r.ready).toBe(false);
    expect(r.missing).toContain("カバー画像");
    expect(r.missing).not.toContain("物件名");
  });

  it("料金は許可制の場所では不要（撮影に道路使用許可が要る場所など）", () => {
    expect(publishReadiness(filled({ hourlyPrice: 0, permitRequired: true })).ready).toBe(true);
    expect(publishReadiness(filled({ hourlyPrice: 0, permitRequired: false })).missing).toContain("時間料金");
  });

  it("壊れた入力でも例外にせず未準備として返す", () => {
    expect(publishReadiness(null).ready).toBe(false);
    expect(publishReadiness(undefined).ready).toBe(false);
    expect(publishReadiness({}).ready).toBe(false);
  });
});
