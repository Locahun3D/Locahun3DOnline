import { describe, it, expect } from "vitest";
import { listedAt } from "./schemas";

describe("listedAt — 並び順「新着」の基準", () => {
  it("初回公開の時刻を使い、更新時刻には左右されない", () => {
    const older = { publishedAt: "2026-09-21T05:12:00.000Z", createdAt: "2026-09-18T00:00:00.000Z", updatedAt: "2026-10-13T04:46:00.000Z" };
    const newer = { publishedAt: "2026-10-13T07:23:00.000Z", createdAt: "2026-10-03T00:00:00.000Z", updatedAt: "2026-10-13T07:27:00.000Z" };
    expect([older, newer].sort((a, b) => listedAt(b).localeCompare(listedAt(a)))[0]).toBe(newer);
    expect(listedAt(older)).toBe("2026-09-21T05:12:00.000Z");
  });
  it("公開時刻の無い旧データは作成時刻で並べる", () => {
    expect(listedAt({ createdAt: "2026-07-04T03:54:00.000Z" })).toBe("2026-07-04T03:54:00.000Z");
    expect(listedAt({})).toBe("");
  });
});
