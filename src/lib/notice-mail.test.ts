import { describe, it, expect } from "vitest";
import { selectNoticeRecipients, noticeBodyToHtml, chunk } from "./notice-mail";

describe("selectNoticeRecipients", () => {
  it("completed purchasers who are active, deduped by email, stable order", () => {
    const purchases = [
      { userId: "b", status: "completed" },
      { userId: "a", status: "completed" },
      { userId: "a", status: "completed" },
      { userId: "c", status: "pending" },
      { userId: "d", status: "completed" },
      { userId: "e", status: "completed" },
    ];
    const users = [
      { id: "b", email: "X@ex.com", status: "active" },
      { id: "a", email: "a@ex.com", status: "active" },
      { id: "c", email: "c@ex.com", status: "active" },
      { id: "d", email: "d@ex.com", status: "suspended" },
      { id: "e", email: "x@ex.com", status: "active" },
    ];
    expect(selectNoticeRecipients(purchases, users).map((r) => r.userId)).toEqual(["a", "b"]);
  });
});

describe("noticeBodyToHtml", () => {
  it("escapes, paragraphs, links URLs", () => {
    const html = noticeBodyToHtml("a<b>\n全文\nhttps://locahun3d.com/terms/data-download\n\n次");
    expect(html).toContain("a&lt;b&gt;<br />");
    expect(html).toContain('<a href="https://locahun3d.com/terms/data-download"');
    expect(html.match(/<p /g)?.length).toBe(2);
  });
});

it("chunk", () => {
  expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
});
