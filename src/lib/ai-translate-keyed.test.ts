import { describe, it, expect } from "vitest";
import { unkeyed } from "./ai-translate";
import { translationFailureText } from "./publish-flow";

/**
 * 翻訳の受け渡しを「番号つきの辞書」にした件（2026-09-23）。
 * 並びのまま送ると、AI が空欄を飛ばして短く返したときに訳が1つずつずれる／欠けた
 * （STUDIO MONTFORT の設備メモ: 10項目中4項目だけ中身あり → 公開申請が止まった）。
 */
describe("訳の受け取り", () => {
  it("番号つきの辞書を、元の並びの位置に戻す（間の空欄はそのまま空）", () => {
    expect(unkeyed({ "1": "No elevator", "7": " Balcony " }, 10)).toEqual(["", "No elevator", "", "", "", "", "", "Balcony", "", ""]);
  });
  it("旧形式の並びが返ってきても読める", () => {
    expect(unkeyed(["a", "b"], 3)).toEqual(["a", "b", ""]);
  });
  it("壊れた値は空にする", () => {
    expect(unkeyed(null, 2)).toEqual(["", ""]);
    expect(unkeyed({ "0": 5 }, 1)).toEqual([""]);
  });
});

describe("訳せなかった理由の表示", () => {
  it("理由ごとに、次にすることが分かる文にする", () => {
    expect(translationFailureText({ kind: "no_key" })).toContain("ANTHROPIC_API_KEY");
    expect(translationFailureText({ kind: "http", status: 529 })).toContain("HTTP 529");
    expect(translationFailureText({ kind: "truncated" })).toContain("途中で切れました");
    expect(translationFailureText()).toContain("一部の項目を訳しませんでした");
    // キーの問題でないときに、キーを疑わせる文を出さない
    expect(translationFailureText()).not.toContain("ANTHROPIC_API_KEY");
  });
});

describe("キーが無効なときの表示", () => {
  it("401/403 は『待って再実行』ではなく、キーの設定し直しを案内する", () => {
    const t = translationFailureText({ kind: "http", status: 401, message: "authentication_error: invalid x-api-key" });
    expect(t).toContain("キーが無効");
    expect(t).not.toContain("少し待って");
  });
});
