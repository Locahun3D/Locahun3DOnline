import { describe, it, expect } from "vitest";
import { propertySchema, type Property } from "./schemas";
import { markDataSaleAsked } from "./data-sale-consent";
import {
  MAX_STUDIO_PHOTOS,
  MAX_STUDIO_PHOTO_BYTES,
  canStudioUpload,
  cleanDimension,
  cleanPhotoText,
  needsConversion,
  plausibleDimensions,
  quarantineKey,
  sniffImageType,
  validateStudioPhoto,
} from "./studio-photo-intake";

const bytes = (...head: number[]) => new Uint8Array([...head, ...new Array(32).fill(0)]);
const ascii = (s: string) => Array.from(s).map((c) => c.charCodeAt(0));

const draft = (over: Record<string, unknown> = {}): Property =>
  propertySchema.parse({
    id: "st-700",
    status: "draft",
    category: "studio",
    title: "テストスタジオ",
    cover: { src: "", alt: "", width: 1600, height: 1000 },
    ...over,
  });

/** 公開申請中（確認メールを送った直後）の物件。 */
const inReview = (keyHash = "hash1"): Property =>
  draft({
    publishRequestedAt: "2026-09-26T00:00:00.000Z",
    publishFlow: {
      requestedAt: "2026-09-26T00:00:00.000Z",
      studioNotifiedAt: "2026-09-26T00:00:00.000Z",
      studioNotifyMode: "sent",
      studioApproveKeyHash: keyHash,
    },
  });

describe("受け取ってよいファイルか（先頭バイトで判定）", () => {
  it("JPEG・PNG・WebP・HEIC は通る", () => {
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(sniffImageType(new Uint8Array([...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP"), 0, 0]))).toBe("image/webp");
    expect(sniffImageType(new Uint8Array([0, 0, 0, 0x18, ...ascii("ftypheic"), 0, 0, 0, 0]))).toBe("image/heic");
  });

  it("SVG・HTML・実行ファイル・中身が偽物の画像は拒否", () => {
    expect(sniffImageType(new Uint8Array(ascii("<svg xmlns=\"http://\">")))).toBeNull();
    expect(sniffImageType(new Uint8Array(ascii("<!doctype html><script>")))).toBeNull();
    expect(sniffImageType(new Uint8Array([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0, 4, 0, 0, 0]))).toBeNull(); // .exe
    expect(sniffImageType(new Uint8Array([0x50, 0x4b, 3, 4, 0, 0, 0, 0, 0, 0, 0, 0]))).toBeNull(); // .zip
    // 拡張子が .jpg でも中身がテキストなら通さない（名乗りは見ない）
    expect(sniffImageType(new Uint8Array(ascii("just a text file, really")))).toBeNull();
  });

  it("短すぎるファイルは拒否（判定できないものは受け取らない）", () => {
    expect(sniffImageType(new Uint8Array([0xff, 0xd8]))).toBeNull();
  });

  it("枚数・容量・空ファイルで弾く", () => {
    const jpeg = bytes(0xff, 0xd8, 0xff, 0xe0);
    expect(validateStudioPhoto({ bytes: jpeg, size: 1000, pendingCount: 0 }).ok).toBe(true);
    const many = validateStudioPhoto({ bytes: jpeg, size: 1000, pendingCount: MAX_STUDIO_PHOTOS });
    expect(many.ok).toBe(false);
    const big = validateStudioPhoto({ bytes: jpeg, size: MAX_STUDIO_PHOTO_BYTES + 1, pendingCount: 0 });
    expect(big.ok).toBe(false);
    expect(validateStudioPhoto({ bytes: jpeg, size: 0, pendingCount: 0 }).ok).toBe(false);
  });
});

describe("誰が送れるか", () => {
  it("公開申請中＋メールのキー一致のときだけ受ける", () => {
    expect(canStudioUpload(inReview("hash1"), "hash1").ok).toBe(true);
    expect(canStudioUpload(inReview("hash1"), "別のキー").ok).toBe(false);
    expect(canStudioUpload(inReview("hash1"), "").ok).toBe(false);
  });

  it("販売許諾の回答キーでも受ける（同じメールの1本のキーから作られる）", () => {
    const p = markDataSaleAsked(inReview("approve"), {
      now: "2026-09-26T00:00:00.000Z",
      keyHash: "sale",
      proposedPrice: 0,
    });
    expect(canStudioUpload(p, "sale").ok).toBe(true);
  });

  it("下書き・公開中の物件は受けない（常時開いた投稿口にしない）", () => {
    expect(canStudioUpload(draft(), "hash1").ok).toBe(false);
    const published = { ...inReview("hash1"), status: "published" as const, publishRequestedAt: null };
    expect(canStudioUpload(published, "hash1").ok).toBe(false);
  });
});

describe("保存キーと入力の整形", () => {
  it("キーにユーザー入力を混ぜない（パスを抜けられない）", () => {
    const key = quarantineKey("../../etc", "../id", "image/jpeg");
    expect(key).toBe("quarantine/studio-photos/etc/id.jpg");
    expect(key.includes("..")).toBe(false);
  });

  it("名前・注釈は長さを切り、制御文字を落とす", () => {
    expect(cleanPhotoText("あ".repeat(100), 60).length).toBe(60);
    expect(cleanPhotoText("2F\u0000スタジオ", 60)).toBe("2F スタジオ");
  });

  it("実寸は桁外れなら 0（画像爆弾の申告を信じない）", () => {
    expect(cleanDimension("4000")).toBe(4000);
    expect(cleanDimension("99999")).toBe(0);
    expect(cleanDimension("-1")).toBe(0);
    expect(cleanDimension("abc")).toBe(0);
    expect(plausibleDimensions(4000, 3000)).toBe(true);
    expect(plausibleDimensions(0, 3000)).toBe(false);
    expect(plausibleDimensions(29000, 29000)).toBe(false);
  });

  it("HEIC は変換が必要と分かる", () => {
    expect(needsConversion("image/heic")).toBe(true);
    expect(needsConversion("image/jpeg")).toBe(false);
  });
});
