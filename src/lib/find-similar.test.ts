import { describe, expect, it, vi } from "vitest";

vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: async () => ({ env: {} }) }));
vi.mock("./properties", () => ({ getPublishedProperties: async () => [] }));

import { foldKana, heuristicMatch, normalizeQuery, parseResult, reconcile } from "./find-similar";

const rows = [
  { id: "studio-a", title: "スタジオ A" },
  { id: "snack-b", title: "スナック B" },
];

describe("find-similar AI 検索", () => {
  it("表記ゆれを正規化（URLは大文字小文字を保つ）", () => {
    expect(normalizeQuery("　昭和の  スナック ")).toBe("昭和の スナック");
    expect(normalizeQuery("ABC")).toBe("abc");
    expect(normalizeQuery("https://Ex.com/A")).toBe("https://Ex.com/A");
  });

  it("最後の JSON を拾う", () => {
    const t = '例: {"matches":[]} …\n{"matches":[{"id":"snack-b","reason":"昭和"}],"outside":[]}';
    expect(parseResult(t)?.matches).toEqual([{ id: "snack-b", reason: "昭和" }]);
    expect(parseResult("なし")).toBeNull();
  });

  it("カタログに無い id・検索結果に無い出典・掲載済みと同名は捨てる", () => {
    const raw = {
      matches: [
        { id: "nope", reason: "x" },
        { id: "snack-b", reason: "昭和" },
        { id: "snack-b", reason: "重複" },
      ],
      outside: [
        { name: "実在バー", area: "東京都新宿区", reason: "r", sourceUrl: "https://bar.example/page/" },
        { name: "作られた店", area: "東京都", reason: "r", sourceUrl: "https://fake.example/" },
        { name: "スナック B", area: "東京都", reason: "r", sourceUrl: "https://bar.example/b" },
        { name: "出典なし", area: "東京都", reason: "r", sourceUrl: "" },
      ],
    };
    const seen = new Set(["https://bar.example/page", "https://bar.example/b"]);
    const out = reconcile(raw, rows, seen);
    expect(out.matches).toEqual([{ id: "snack-b", title: "スナック B", reason: "昭和" }]);
    expect(out.outside.map((o) => o.name)).toEqual(["実在バー"]);
  });
  it("ひらがな・言い換えでもカタログに当たる（白ほり→白ホリ／ホリゾント）", () => {
    expect(foldKana("白ほり")).toBe("白ホリ");
    const cat = [
      { id: "w1", title: "スタジオW", category: "撮影スタジオ", area: "東京都", tags: ["白ホリ"], summary: "" },
      { id: "w2", title: "スタジオZ", category: "撮影スタジオ", area: "東京都", tags: [], summary: "広いホリゾントがある。" },
      { id: "k1", title: "黒の部屋", category: "撮影スタジオ", area: "東京都", tags: ["黒ホリ"], summary: "" },
    ];
    expect(heuristicMatch("白ほり", cat, false).map((m) => m.id).sort()).toEqual(["w1", "w2"]);
  });
});
