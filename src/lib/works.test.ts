import { describe, expect, it } from "vitest";
import { slugFromPageParam, UNGATED_SLUGS } from "./works-content";
import { safeAssetKey } from "./works-assets";
import { canViewWorks } from "./works-gating";
import { isWorksHostname, onlineHref, ONLINE_ORIGIN } from "./online-href";

describe("slugFromPageParam", () => {
  it("`.html` 付きだけを受ける（URL不変の約束）", () => {
    expect(slugFromPageParam("index.html")).toBe("index");
    expect(slugFromPageParam("3dgs-file-formats.html")).toBe("3dgs-file-formats");
  });
  it("拡張子なし・別拡張子・パス区切りは受けない", () => {
    expect(slugFromPageParam("index")).toBeNull();
    expect(slugFromPageParam("index.htm")).toBeNull();
    expect(slugFromPageParam("../secret.html")).toBeNull();
    expect(slugFromPageParam("a/b.html")).toBeNull();
  });
});

describe("safeAssetKey", () => {
  it("正常なパスは prefix 付きで返す", () => {
    expect(safeAssetKey("works/images", ["logos", "a.svg"])).toBe("works/images/logos/a.svg");
  });
  it("パストラバーサルを弾く", () => {
    expect(safeAssetKey("works/images", ["..", "secret"])).toBeNull();
    expect(safeAssetKey("works/images", ["a", "..", "b"])).toBeNull();
    expect(safeAssetKey("assets", ["..\\x"])).toBeNull();
    expect(safeAssetKey("assets", [""])).toBeNull();
    expect(safeAssetKey("assets", [])).toBeNull();
  });
});

describe("canViewWorks", () => {
  const admin = { isAdmin: true };
  const guest = { isAdmin: false };
  it("published は誰でも", () => {
    expect(canViewWorks({ status: "published" }, guest)).toBe(true);
  });
  it("draft は管理者だけ", () => {
    expect(canViewWorks({ status: "draft" }, guest)).toBe(false);
    expect(canViewWorks({ status: "draft" }, admin)).toBe(true);
  });
  it("private はトークン一致か管理者", () => {
    const meta = { status: "private" as const, shareToken: "abc123" };
    expect(canViewWorks(meta, guest)).toBe(false);
    expect(canViewWorks(meta, { ...guest, token: "abc123" })).toBe(true);
    expect(canViewWorks(meta, { ...guest, token: "wrong" })).toBe(false);
    expect(canViewWorks(meta, admin)).toBe(true);
  });
  it("トークン未設定の private を空トークンで開けない", () => {
    expect(canViewWorks({ status: "private", shareToken: null }, { ...guest, token: null })).toBe(false);
  });
});

describe("UNGATED_SLUGS", () => {
  it("一覧と旧ブログ転送はゲーティングしない（旧 worker.js と同じ扱い）", () => {
    expect(UNGATED_SLUGS.has("index")).toBe(true);
    expect(UNGATED_SLUGS.has("blog")).toBe(true);
    expect(UNGATED_SLUGS.has("isaacsim-3dgs-robot-demos")).toBe(false);
  });
});

describe("online-href（works ホストのリンク絶対化）", () => {
  it("Host ヘッダーから works ホストを判定する（ポート付きも）", () => {
    expect(isWorksHostname("web.locahun3d.com")).toBe(true);
    expect(isWorksHostname("web.locahun3d.com:443")).toBe(true);
    expect(isWorksHostname("WEB.Locahun3D.com")).toBe(true);
    expect(isWorksHostname("locahun3d.com")).toBe(false);
    expect(isWorksHostname("localhost:3005")).toBe(false);
    expect(isWorksHostname(null)).toBe(false);
  });
  it("works ホストのときだけ絶対URLにする", () => {
    expect(onlineHref("/properties", false)).toBe("/properties");
    expect(onlineHref("/properties", true)).toBe(`${ONLINE_ORIGIN}/properties`);
    expect(onlineHref("/en/cart", true)).toBe(`${ONLINE_ORIGIN}/en/cart`);
  });
  it("既に絶対URLなら触らない（二重接頭辞を作らない）", () => {
    expect(onlineHref("https://web.locahun3d.com/works/index.html", true)).toBe(
      "https://web.locahun3d.com/works/index.html",
    );
  });
});
