import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { TERMS_DOCS, STUDIO_MAIL_TERMS } from "./terms-catalog";

describe("規約の一覧", () => {
  it("一覧に載っている規約のページが実在する（リンク切れのメールを送らない）", () => {
    for (const doc of TERMS_DOCS) {
      const file = `src/app${doc.path}/page.tsx`;
      expect(existsSync(file), `${file} が無い`).toBe(true);
    }
  });

  it("パスは重複しない", () => {
    expect(new Set(TERMS_DOCS.map((d) => d.path)).size).toBe(TERMS_DOCS.length);
  });

  it("日付は YYYY-MM-DD で、改定日は制定日より後", () => {
    for (const doc of TERMS_DOCS) {
      expect(doc.effective).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (doc.updated) {
        expect(doc.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(doc.updated >= doc.effective).toBe(true);
      }
    }
  });

  it("確認メールに入れるのは施設側の規約だけ（持ち込みスキャン規約は混ぜない）", () => {
    expect(STUDIO_MAIL_TERMS.length).toBeGreaterThan(0);
    expect(STUDIO_MAIL_TERMS.map((d) => d.path)).not.toContain("/terms/submission");
    expect(STUDIO_MAIL_TERMS[0].path).toBe("/terms/listing");
  });
});
