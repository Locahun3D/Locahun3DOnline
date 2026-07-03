import { describe, it, expect } from "vitest";
import {
  isHoneypotTripped,
  checkTiming,
  allowByRate,
  MIN_FILL_MS,
} from "./inquiry-guard";

describe("isHoneypotTripped", () => {
  it("is false for empty / whitespace / null (real humans leave it blank)", () => {
    expect(isHoneypotTripped(null)).toBe(false);
    expect(isHoneypotTripped("")).toBe(false);
    expect(isHoneypotTripped("   ")).toBe(false);
  });
  it("is true when a bot fills it", () => {
    expect(isHoneypotTripped("http://spam.example")).toBe(true);
  });
});

describe("checkTiming", () => {
  it("passes when no/invalid timestamp (old-client compat)", () => {
    expect(checkTiming(null)).toBe("ok");
    expect(checkTiming("abc")).toBe("ok");
    expect(checkTiming("0")).toBe("ok");
  });
  it("flags too-fast submissions as bots", () => {
    const justNow = String(Date.now() - (MIN_FILL_MS - 500));
    expect(checkTiming(justNow)).toBe("too-fast");
  });
  it("passes a normal human pace", () => {
    const tenSecondsAgo = String(Date.now() - 10_000);
    expect(checkTiming(tenSecondsAgo)).toBe("ok");
  });
  it("flags a stale (24h+) form as replay", () => {
    const twoDaysAgo = String(Date.now() - 2 * 24 * 60 * 60 * 1000);
    expect(checkTiming(twoDaysAgo)).toBe("stale");
  });
  it("passes future timestamps (clock skew) rather than false-flagging", () => {
    const future = String(Date.now() + 5_000);
    expect(checkTiming(future)).toBe("ok");
  });
});

describe("allowByRate", () => {
  it("skips rate limiting when source is unknown", () => {
    for (let i = 0; i < 20; i++) expect(allowByRate("", "prop-x")).toBe(true);
  });
  it("allows a handful then blocks the same source+property", () => {
    const ip = `1.2.3.${Math.floor(Math.random() * 1000)}`;
    const prop = `prop-${Math.random()}`;
    // First 5 allowed, 6th blocked (RATE_MAX = 5).
    const results = Array.from({ length: 7 }, () => allowByRate(ip, prop));
    expect(results.slice(0, 5)).toEqual([true, true, true, true, true]);
    expect(results[5]).toBe(false);
    expect(results[6]).toBe(false);
  });
  it("tracks per property independently", () => {
    const ip = `9.9.9.${Math.floor(Math.random() * 1000)}`;
    for (let i = 0; i < 5; i++) allowByRate(ip, "prop-a");
    expect(allowByRate(ip, "prop-a")).toBe(false); // a exhausted
    expect(allowByRate(ip, "prop-b")).toBe(true); // b fresh
  });
});
