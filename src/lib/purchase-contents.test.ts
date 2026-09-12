import { describe, expect, it } from "vitest";
import { resolvePurchaseContents, individualPurchaseDownloads } from "./purchase-contents";

describe("resolvePurchaseContents", () => {
  it("replaces only the schema default bundle label when a legacy URL is a different container", () => {
    expect(resolvePurchaseContents({ downloadFileUrl: "/scan.RAD?sig=secret", downloadFileFormat: "PLY & OBJ (ZIP)" })[0].format).toBe("RAD");
    expect(resolvePurchaseContents({ downloadFileUrl: "/scan.rad", downloadFileFormat: "3DGS RAD (Portalcam)" })[0].format).toBe("3DGS RAD (Portalcam)");
    expect(resolvePurchaseContents({ downloadFileUrl: "/scan.zip", downloadFileFormat: "PLY & OBJ (ZIP)" })[0].format).toBe("PLY & OBJ (ZIP)");
  });
  it("keeps a single individual format when the default download is a different bundle", () => {
    expect(individualPurchaseDownloads([{ format: "RAD", url: "/a.rad", sizeMb: 40 }], "/bundle.zip"))
      .toEqual([{ format: "RAD", url: "/a.rad", sizeMb: 40 }]);
  });
  it("does not duplicate the default download link", () => {
    expect(individualPurchaseDownloads([{ format: "ZIP", url: "/bundle.zip", sizeMb: 40 }], "/bundle.zip")).toEqual([]);
  });
  it("does not advertise viewer data or schema format defaults as included downloads", () => {
    expect(resolvePurchaseContents({ downloadFileFormat: "PLY & OBJ (ZIP)" })).toEqual([]);
  });
  it("lists registered individual formats without inferring other formats", () => {
    expect(resolvePurchaseContents({ downloadFiles: [
      { format: "RAD", url: "/assets/a.rad", sizeMb: 40 },
      { format: "", url: "/assets/not-selectable.obj", sizeMb: 20 },
    ] })).toEqual([{ format: "RAD", sizeMb: 40, date: "", kind: "file" }]);
  });
  it("uses legacy metadata once, without double-counting the version fallback", () => {
    expect(resolvePurchaseContents({ downloadFileUrl: "/a.zip", downloadFileFormat: "PLY + OBJ (ZIP)", downloadFileSizeMb: 120 }))
      .toEqual([{ format: "PLY + OBJ (ZIP)", sizeMb: 120, date: "", kind: "file" }]);
  });
  it("includes dated versions newest first without guessing ZIP contents", () => {
    expect(resolvePurchaseContents({ downloadFileFormat: "PLY & OBJ (ZIP)", downloadVersions: [
      { date: "2026-01-01", url: "/old.zip", sizeMb: 0 },
      { date: "2026-09-01", url: "/new.ZIP?sig=x", sizeMb: 90 },
    ] })).toEqual([
      { format: "ZIP", sizeMb: 90, date: "2026-09-01", kind: "version" },
      { format: "ZIP", sizeMb: null, date: "2026-01-01", kind: "version" },
    ]);
  });
  it("deduplicates registered URLs and never returns private storage paths", () => {
    const result = resolvePurchaseContents({
      downloadFiles: [{ format: "ZIP", url: "/private/a.zip", sizeMb: 25 }],
      downloadVersions: [{ date: "2026-09-01", url: "/private/a.zip", sizeMb: 25 }],
    });
    expect(result).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain("private");
  });
});
