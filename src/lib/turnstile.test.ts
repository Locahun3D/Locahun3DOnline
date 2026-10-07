import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyTurnstile } from "./turnstile";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const reply = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body)));

describe("verifyTurnstile", () => {
  it("秘密鍵が未設定なら照合せず通す", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    const f = reply({ success: false });
    vi.stubGlobal("fetch", f);
    expect(await verifyTurnstile("", "")).toBe(true);
    expect(f).not.toHaveBeenCalled();
  });

  it("トークンが空なら弾く", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "s");
    expect(await verifyTurnstile("", "1.2.3.4")).toBe(false);
  });

  it("siteverify の結果に従う", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "s");
    vi.stubGlobal("fetch", reply({ success: true }));
    expect(await verifyTurnstile("tok", "1.2.3.4")).toBe(true);
    vi.stubGlobal("fetch", reply({ success: false, "error-codes": ["invalid-input-response"] }));
    expect(await verifyTurnstile("tok", "1.2.3.4")).toBe(false);
  });

  it("Cloudflare 側の障害では通す", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "s");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await verifyTurnstile("tok", "")).toBe(true);
  });
});
