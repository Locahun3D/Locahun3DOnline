import { expect, it } from "vitest";
import { localizeActionError } from "./action-errors";

it("translates known server-action errors only in English", () => {
  expect(localizeActionError("お名前を入力してください", true)).toBe("Please enter your name.");
  expect(localizeActionError("お名前を入力してください", false)).toBe("お名前を入力してください");
  expect(localizeActionError("サンプル画像は最大 8 枚までです。", true)).toBe("You can attach up to 8 sample images.");
  expect(localizeActionError("画像1枚あたりのサイズ上限は 25MB です。", true)).toBe("Each image can be up to 25 MB.");
});
it("passes unknown messages through and tolerates empty input", () => {
  expect(localizeActionError("未知のエラー", true)).toBe("未知のエラー");
  expect(localizeActionError(undefined, true)).toBe("");
});
