import { describe, it, expect } from "vitest";
import { propertySchema, type Property } from "./schemas";
import {
  canAnswerDataSale,
  dataSaleConsentOf,
  markDataSaleAsked,
  proposedSalePrice,
  recordDataSaleAnswer,
} from "./data-sale-consent";

const base = (over: Record<string, unknown> = {}): Property =>
  propertySchema.parse({
    id: "st-900",
    status: "draft",
    category: "studio",
    title: "スタジオX",
    cover: { src: "", alt: "", width: 1600, height: 1000 },
    ...over,
  });

describe("3Dデータ販売の許諾", () => {
  it("新しい物件は未確認から始まる", () => {
    expect(dataSaleConsentOf(base()).status).toBe("unasked");
  });

  it("確認メールを送ると『確認中』になり、キーと提示価格が残る", () => {
    const asked = markDataSaleAsked(base(), { now: "2026-09-26T00:00:00.000Z", keyHash: "h1", proposedPrice: 150000 });
    expect(asked.dataSaleConsent.status).toBe("asked");
    expect(asked.dataSaleConsent.keyHash).toBe("h1");
    expect(asked.dataSaleConsent.proposedPrice).toBe(150000);
  });

  it("聞き直しても、もらった答えは消えない", () => {
    const granted = recordDataSaleAnswer(
      markDataSaleAsked(base(), { now: "n", keyHash: "h1", proposedPrice: 0 }),
      { answer: "granted", now: "n2", via: "studio-link" },
    );
    const again = markDataSaleAsked(granted, { now: "n3", keyHash: "h2", proposedPrice: 0 });
    expect(again.dataSaleConsent.status).toBe("granted");
    expect(again.dataSaleConsent.keyHash).toBe("h2");
  });

  it("回答できるのは、そのメールのキーを持っている人だけ", () => {
    const asked = markDataSaleAsked(base(), { now: "n", keyHash: "h1", proposedPrice: 0 });
    expect(canAnswerDataSale(asked, "h1").ok).toBe(true);
    expect(canAnswerDataSale(asked, "other").ok).toBe(false);
    expect(canAnswerDataSale(base(), "h1").ok).toBe(false);
  });

  it("答え直し（OK → 不可）を上書きできる。記入欄は400字まで", () => {
    const asked = markDataSaleAsked(base(), { now: "n", keyHash: "h1", proposedPrice: 0 });
    const yes = recordDataSaleAnswer(asked, { answer: "granted", now: "n1", via: "studio-link", note: "あ".repeat(500) });
    expect(yes.dataSaleConsent.note.length).toBe(400);
    const no = recordDataSaleAnswer(yes, { answer: "declined", now: "n2", via: "admin" });
    expect(no.dataSaleConsent.status).toBe("declined");
    expect(no.dataSaleConsent.answeredVia).toBe("admin");
  });

  it("提示価格は販売中の3Dデータから取る（無ければ0）", () => {
    expect(proposedSalePrice(base())).toBe(0);
    const withSale = base({
      splatItems: [
        { id: "s1", label: "本編", url: "/x.rad", forSale: true, salePrice: 150000 },
      ],
    });
    expect(proposedSalePrice(withSale)).toBe(150000);
  });
});
