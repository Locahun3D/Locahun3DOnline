import { describe, expect, it } from "vitest";
import { applyStudioPhotoOp, parseStudioPhotoOp, studioPublicKey } from "./studio-photo-edit";

const img = (src: string, alt = src) => ({ src, alt, altEn: "en", width: 1600, height: 1000, focus: "center" });
const base = { cover: img("/c.jpg", "カバー"), gallery: [img("/1.jpg"), img("/2.jpg"), img("/3.jpg")] };
const srcs = (r: ReturnType<typeof applyStudioPhotoOp>) =>
  r.ok ? [r.photos.cover.src, ...r.photos.gallery.map((g) => g.src)] : r.error;

describe("applyStudioPhotoOp", () => {
  it("adds to the end of the gallery", () => {
    expect(srcs(applyStudioPhotoOp(base, { type: "add", image: { src: "/n.jpg", alt: "新", width: 900, height: 600 } })))
      .toEqual(["/c.jpg", "/1.jpg", "/2.jpg", "/3.jpg", "/n.jpg"]);
  });

  it("makes the first added photo the cover when there is none", () => {
    const r = applyStudioPhotoOp({ cover: img(""), gallery: [] }, { type: "add", image: { src: "/n.jpg", alt: "", width: 0, height: 0 } });
    expect(srcs(r)).toEqual(["/n.jpg"]);
  });

  it("replaces a gallery photo or the cover in place", () => {
    const image = { src: "/r.jpg", alt: "差し替え", width: 900, height: 600 };
    expect(srcs(applyStudioPhotoOp(base, { type: "replace", slot: { kind: "gallery", index: 1 }, image }))).toEqual(["/c.jpg", "/1.jpg", "/r.jpg", "/3.jpg"]);
    expect(srcs(applyStudioPhotoOp(base, { type: "replace", slot: { kind: "cover" }, image }))).toEqual(["/r.jpg", "/1.jpg", "/2.jpg", "/3.jpg"]);
  });

  it("removes, moves and clamps the target position", () => {
    expect(srcs(applyStudioPhotoOp(base, { type: "remove", index: 0 }))).toEqual(["/c.jpg", "/2.jpg", "/3.jpg"]);
    expect(srcs(applyStudioPhotoOp(base, { type: "move", index: 2, to: 0 }))).toEqual(["/c.jpg", "/3.jpg", "/1.jpg", "/2.jpg"]);
    expect(srcs(applyStudioPhotoOp(base, { type: "move", index: 0, to: 99 }))).toEqual(["/c.jpg", "/2.jpg", "/3.jpg", "/1.jpg"]);
  });

  it("swaps the chosen photo with the cover instead of dropping the old cover", () => {
    expect(srcs(applyStudioPhotoOp(base, { type: "cover", index: 1 }))).toEqual(["/2.jpg", "/1.jpg", "/c.jpg", "/3.jpg"]);
  });

  it("edits a caption and clears the stale English", () => {
    const r = applyStudioPhotoOp(base, { type: "caption", slot: { kind: "gallery", index: 0 }, alt: " 窓際の自然光 " });
    expect(r.ok && r.photos.gallery[0]).toMatchObject({ alt: "窓際の自然光", altEn: "" });
  });

  it("rejects an index that does not exist", () => {
    expect(applyStudioPhotoOp(base, { type: "remove", index: 3 }).ok).toBe(false);
    expect(applyStudioPhotoOp(base, { type: "cover", index: -1 }).ok).toBe(false);
  });

  it("does not modify the input", () => {
    applyStudioPhotoOp(base, { type: "remove", index: 0 });
    expect(base.gallery).toHaveLength(3);
  });
});

describe("parseStudioPhotoOp", () => {
  it("accepts well-formed ops and rejects others", () => {
    expect(parseStudioPhotoOp({ type: "move", index: 1, to: 0 })).toEqual({ type: "move", index: 1, to: 0 });
    expect(parseStudioPhotoOp({ type: "replace", slot: { kind: "cover" } })).toEqual({ type: "replace", slot: { kind: "cover" } });
    expect(parseStudioPhotoOp({ type: "remove", index: "1" })).toBeNull();
    expect(parseStudioPhotoOp({ type: "drop" })).toBeNull();
  });
});

it("builds a storage key without user input characters", () => {
  expect(studioPublicKey("studio-x/../y", "ab-c.d", ".jpg")).toBe("uploads/studio-xy/studio-abcd.jpg");
});
