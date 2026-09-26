import { describe, it, expect } from "vitest";
import { propertySchema, type Property } from "./schemas";
import { listDataSales, summarizeDataSales } from "./data-catalog";

const NOW = "2026-09-26T00:00:00.000Z";

const prop = (over: Record<string, unknown> = {}): Property =>
  propertySchema.parse({
    id: "st-1",
    status: "published",
    category: "studio",
    title: "テストスタジオ",
    prefecture: "東京都",
    city: "渋谷区",
    scannedAt: "2026-09-01",
    cover: { src: "/api/r2/c.jpg", alt: "外観", width: 1600, height: 1000 },
    ...over,
  });

const scene = (over: Record<string, unknown> = {}) => ({
  id: "s1",
  label: "1F スタジオ",
  url: "/api/r2/a.rad",
  forSale: true,
  salePrice: 150000,
  downloadFiles: [
    { format: "PLY", url: "/api/r2/a.ply", sizeMb: 800 },
    { format: "OBJ", url: "/api/r2/a.obj", sizeMb: 400 },
  ],
  ...over,
});

describe("3Dデータ販売の一覧", () => {
  it("販売中のシーンを、価格・形式つきで拾う", () => {
    const [entry] = listDataSales([prop({ splatItems: [scene()] })], NOW);
    expect(entry.price).toBe(150000);
    expect(entry.formats).toEqual(["OBJ", "PLY"]);
    expect(entry.href).toBe("/properties/st-1#scene-0");
    expect(entry.sceneLabel).toBe("1F スタジオ");
  });

  it("販売していないシーンと、配布ファイルが無いシーンは出さない（買えない導線を作らない）", () => {
    const p = prop({
      splatItems: [
        scene({ id: "s1", forSale: false }),
        scene({ id: "s2", downloadFiles: [], downloadFileUrl: "" }),
      ],
    });
    expect(listDataSales([p], NOW)).toHaveLength(0);
  });

  it("無料配布中は価格0で、一覧の先頭に来る", () => {
    const free = prop({
      id: "st-2",
      scannedAt: "2026-08-01",
      splatItems: [scene({ freePeriod: { enabled: true, startAt: "", endAt: "", afterEnd: "stay_free" } })],
    });
    const paid = prop({ id: "st-3", scannedAt: "2026-09-20", splatItems: [scene()] });
    const list = listDataSales([paid, free], NOW);
    expect(list[0].propertyId).toBe("st-2");
    expect(list[0].free).toBe(true);
    expect(list[0].price).toBe(0);
  });

  it("販売終了（期間後に停止）のシーンは出さない", () => {
    const ended = prop({
      splatItems: [
        scene({
          freePeriod: { enabled: true, startAt: "", endAt: "2026-09-01T00:00:00.000Z", afterEnd: "disable_sales" },
        }),
      ],
    });
    expect(listDataSales([ended], NOW)).toHaveLength(0);
  });

  it("要約は件数・無料件数・最低価格を返す", () => {
    const list = listDataSales(
      [
        prop({ splatItems: [scene()] }),
        prop({ id: "st-9", splatItems: [scene({ salePrice: 90000, licenseOptions: [] })] }),
      ],
      NOW,
    );
    expect(summarizeDataSales(list)).toEqual({ count: 2, freeCount: 0, minPrice: 90000 });
  });
});
