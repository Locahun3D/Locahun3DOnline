import { describe, it, expect } from "vitest";
import {
  safeName,
  buildAssetKey,
  buildPublicUrl,
  validateUploadMeta,
  MAX_IMAGE_BYTES,
} from "./asset-keys";

describe("safeName", () => {
  it("strips unsafe chars and lowercases the extension via caller", () => {
    expect(safeName("My Photo (1).JPG")).toBe("My_Photo_1_.JPG");
  });
});

describe("buildAssetKey", () => {
  it("namespaces by kind and id, keeps a lowercased ext", () => {
    const key = buildAssetKey({ kind: "splat", id: "abc123", filename: "Scene.PLY" });
    expect(key).toBe("assets/splat/abc123-Scene.ply");
  });
});

describe("buildPublicUrl", () => {
  it("returns the secure API proxy path (ignores publicBase)", () => {
    expect(buildPublicUrl("assets/image/x.jpg", "https://cdn.test")).toBe(
      "/api/r2/assets/image/x.jpg",
    );
    expect(buildPublicUrl("assets/image/x.jpg")).toBe(
      "/api/r2/assets/image/x.jpg",
    );
  });
});

describe("validateUploadMeta", () => {
  it("accepts a valid image", () => {
    const r = validateUploadMeta({ kind: "image", filename: "a.jpg", contentType: "image/jpeg", size: 1000 });
    expect(r.ok).toBe(true);
  });
  it("rejects a non-image content type", () => {
    const r = validateUploadMeta({ kind: "image", filename: "a.txt", contentType: "text/plain", size: 1000 });
    expect(r.ok).toBe(false);
  });
  it("rejects an oversized image", () => {
    const r = validateUploadMeta({ kind: "image", filename: "a.jpg", contentType: "image/jpeg", size: MAX_IMAGE_BYTES + 1 });
    expect(r.ok).toBe(false);
  });
  it("accepts a .zip splat (zipped splat is a valid upload)", () => {
    const r = validateUploadMeta({ kind: "splat", filename: "a.zip", contentType: "application/zip", size: 1000 });
    expect(r.ok).toBe(true);
  });
  it("rejects a genuinely disallowed splat extension", () => {
    const r = validateUploadMeta({ kind: "splat", filename: "a.exe", contentType: "application/octet-stream", size: 1000 });
    expect(r.ok).toBe(false);
  });
  it("accepts a .ply splat", () => {
    const r = validateUploadMeta({ kind: "splat", filename: "a.ply", contentType: "application/octet-stream", size: 1000 });
    expect(r.ok).toBe(true);
  });
});
