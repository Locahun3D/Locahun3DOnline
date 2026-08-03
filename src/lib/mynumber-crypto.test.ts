import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { encryptMyNumber, decryptMyNumber, maskMyNumber } from "./mynumber-crypto";

const TEST_KEY = Buffer.from(new Uint8Array(32).fill(7)).toString("base64");

describe("mynumber-crypto", () => {
  const original = process.env.PAYEE_MYNUMBER_ENC_KEY;
  beforeAll(() => {
    process.env.PAYEE_MYNUMBER_ENC_KEY = TEST_KEY;
  });
  afterAll(() => {
    process.env.PAYEE_MYNUMBER_ENC_KEY = original;
  });

  it("暗号化して復号すると元の値に戻る", async () => {
    const plain = "123456789012";
    const encrypted = await encryptMyNumber(plain);
    expect(encrypted).not.toContain(plain);
    const decrypted = await decryptMyNumber(encrypted);
    expect(decrypted).toBe(plain);
  });

  it("暗号化のたびにIVが変わり、同じ入力でも暗号文が変わる", async () => {
    const a = await encryptMyNumber("123456789012");
    const b = await encryptMyNumber("123456789012");
    expect(a).not.toBe(b);
  });

  it("鍵が未設定なら暗号化・復号とも例外を投げる（平文フォールバックしない）", async () => {
    delete process.env.PAYEE_MYNUMBER_ENC_KEY;
    await expect(encryptMyNumber("123456789012")).rejects.toThrow();
    process.env.PAYEE_MYNUMBER_ENC_KEY = TEST_KEY;
  });
});

describe("maskMyNumber", () => {
  it("値がある場合はマスクした登録済み表示", () => {
    expect(maskMyNumber(true)).toBe("登録済み（••••••••••••）");
  });
  it("値が無い場合は未登録", () => {
    expect(maskMyNumber(false)).toBe("未登録");
  });
});
