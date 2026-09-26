import type { Property } from "./schemas";
import { publishStage } from "./publish-flow";
import { dataSaleConsentOf } from "./data-sale-consent";

/**
 * スタジオからの写真の受け取り（2026-09-26 本人指示）。
 *
 * ── なぜログイン無しで受けるのか ──────────────────────────────
 * スタジオに渡しているのは確認メール1通だけで、そこから掲載内容の確認・公開の承認・
 * 3Dデータ販売の許諾まで済む。写真だけ別のサービスへ誘導すると出し先が分かれ、
 * 回収漏れが出る（これまで gigafile・Dropbox・添付とバラバラだった）。
 *
 * ── 受け入れの条件（本人と合意した線引き。2026-09-26）──────────
 *  1. 確認メールのキーを持っていること（承認ボタン・販売許諾と同じ判定）
 *  2. **公開申請中の物件だけ**。公開したら口を閉じる（常時開いた投稿口にしない）
 *  3. 拡張子や Content-Type は名乗りなので信じない。**先頭バイトで判定**する
 *     （SVG は中にスクリプトが書けるので受けない）
 *  4. 届いた写真は R2 の quarantine/ 配下に置き、採用するまで公開側からは配信しない
 *     （/api/r2 は GET 無認証のため、あちらでも同じ接頭辞を拒否する）
 *
 * ここは純関数だけ（server / client 両方から import する。`server-only` 禁止）。
 * 保存は lib/studio-photos.ts、受け口は app/api/studio-photos/route.ts。
 */

/** 1物件に受け取る枚数の上限（荒らし・容量対策）。 */
export const MAX_STUDIO_PHOTOS = 20;
/** 1枚あたりの上限。25MB は管理画面の画像アップロードと同じ。 */
export const MAX_STUDIO_PHOTO_BYTES = 25 * 1024 * 1024;
/** 画素数の上限。容量が小さくても展開すると巨大になる画像（画像爆弾）を弾く。 */
export const MAX_STUDIO_PHOTO_PIXELS = 80_000_000;
export const MAX_PHOTO_NAME = 60;
export const MAX_PHOTO_NOTE = 200;
/** 未採用のまま置いておく期間。過ぎたものは消す。 */
export const STUDIO_PHOTO_TTL_DAYS = 30;

export type StudioPhotoStatus = "pending" | "accepted" | "rejected";

export interface StudioPhoto {
  id: string;
  propertyId: string;
  status: StudioPhotoStatus;
  /** R2 のキー（quarantine/ 配下。公開URLではない）。 */
  r2Key: string;
  contentType: string;
  size: number;
  /** スタジオが付けた場所の名前（例: 2Fスタジオ 窓側）。 */
  name: string;
  /** スタジオの注釈（例: 午前中の自然光）。 */
  note: string;
  /** カバー（ページ頭）に使ってほしい、という希望。 */
  wantCover: boolean;
  createdAt: string;
  /** 採用/却下した日時と、採用時に入れた公開URL。 */
  decidedAt?: string | null;
  publishedUrl?: string | null;
  /** ブラウザが読んだ実寸（HEIC など読めない形式では 0）。掲載時の縦横比に使う。 */
  width: number;
  height: number;
  /** 記録用。誰が出したかを追えるようにする（個人情報なので生IPは残さない）。 */
  sourceHash?: string;
}

/** 先頭バイトで見分けた画像形式。判別できないものは受け取らない。 */
export type SniffedType = "image/jpeg" | "image/png" | "image/webp" | "image/heic";

export const STUDIO_PHOTO_EXT: Record<SniffedType, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
};

/**
 * 実体の先頭バイトから形式を判定する（マジックバイト）。
 * 名乗り（拡張子・Content-Type）は一切見ない。判別できなければ null＝拒否。
 */
export function sniffImageType(bytes: Uint8Array): SniffedType | null {
  const at = (i: number) => bytes[i];
  const ascii = (start: number, len: number) =>
    String.fromCharCode(...Array.from(bytes.slice(start, start + len)));
  if (bytes.length < 12) return null;
  // JPEG: FF D8 FF
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return "image/jpeg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47 &&
    at(4) === 0x0d && at(5) === 0x0a && at(6) === 0x1a && at(7) === 0x0a
  ) {
    return "image/png";
  }
  // WebP: "RIFF" .... "WEBP"
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return "image/webp";
  // HEIC/HEIF: ....ftyp + heic/heix/hevc/mif1/msf1（iPhone の既定形式）
  if (ascii(4, 4) === "ftyp") {
    const brand = ascii(8, 4);
    if (["heic", "heix", "hevc", "hevx", "mif1", "msf1", "heim", "heis"].includes(brand)) {
      return "image/heic";
    }
  }
  return null;
}

/** HEIC は多くのブラウザが表示できない。採用の前に JPEG へ変換する必要がある。 */
export function needsConversion(contentType: string): boolean {
  return contentType === "image/heic";
}

export type IntakeGuard = { ok: true } | { ok: false; code: string; error: string };

/**
 * この物件へ写真を投稿してよいか。
 * 認可はログインではなく確認メールのキー（承認キー、または販売許諾の回答キー。
 * どちらも同じメールに入れた1本のキーから作られる）。
 */
export function canStudioUpload(property: Property, keyHash: string): IntakeGuard {
  if (publishStage(property) !== "review") {
    return {
      ok: false,
      code: "not_in_review",
      error: "この物件は現在、写真の受け付けをしていません。",
    };
  }
  const approveHash = property.publishFlow?.studioApproveKeyHash ?? null;
  const saleHash = dataSaleConsentOf(property).keyHash;
  if (!keyHash || (keyHash !== approveHash && keyHash !== saleHash)) {
    return {
      ok: false,
      code: "bad_key",
      error: "このリンクからは送れません。最新の確認メールのリンクからお開きください。",
    };
  }
  return { ok: true };
}

/** 受け取ってよいファイルか（枚数・容量・形式）。bytes は先頭だけで足りる。 */
export function validateStudioPhoto(input: {
  bytes: Uint8Array;
  size: number;
  pendingCount: number;
}): { ok: true; contentType: SniffedType } | { ok: false; code: string; error: string } {
  if (input.pendingCount >= MAX_STUDIO_PHOTOS) {
    return {
      ok: false,
      code: "too_many",
      error: `お送りいただける写真は ${MAX_STUDIO_PHOTOS} 枚までです。`,
    };
  }
  if (input.size <= 0) {
    return { ok: false, code: "empty", error: "ファイルが空です。" };
  }
  if (input.size > MAX_STUDIO_PHOTO_BYTES) {
    return {
      ok: false,
      code: "too_large",
      error: `1枚あたり ${Math.floor(MAX_STUDIO_PHOTO_BYTES / 1024 / 1024)}MB までです。`,
    };
  }
  const sniffed = sniffImageType(input.bytes);
  if (!sniffed) {
    return {
      ok: false,
      code: "bad_type",
      error: "写真は JPEG・PNG・WebP・HEIC のいずれかでお送りください。",
    };
  }
  return { ok: true, contentType: sniffed };
}

/**
 * 保存キー。ユーザー入力は一切混ぜない（パスをいじられないため）。
 * ドットも落とす（`..` が残らないようにし、キーを見て意味が読めない形にしない）。
 */
export function quarantineKey(propertyId: string, id: string, contentType: SniffedType): string {
  const safeProperty = propertyId.replace(/[^A-Za-z0-9_-]/g, "");
  const safeId = id.replace(/[^A-Za-z0-9]/g, "");
  return `quarantine/studio-photos/${safeProperty}/${safeId}${STUDIO_PHOTO_EXT[contentType]}`;
}

/** スタジオが書いた名前・注釈の整形（長さを切るだけ。表示側で必ずエスケープする）。 */
export function cleanPhotoText(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, max);
}

/**
 * ブラウザが申告した実寸の検証。信用はしないが、縦横比の参考として受け取る。
 * 桁外れ（画像爆弾のような値）は 0 に倒し、既定値で扱う。
 */
export function cleanDimension(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const i = Math.floor(n);
  return i > 30000 ? 0 : i;
}

export function plausibleDimensions(width: number, height: number): boolean {
  return width > 0 && height > 0 && width * height <= MAX_STUDIO_PHOTO_PIXELS;
}

/** 期限切れ（未採用のまま置きっぱなし）か。 */
export function isStudioPhotoExpired(photo: StudioPhoto, nowMs: number = Date.now()): boolean {
  if (photo.status !== "pending") return false;
  const created = Date.parse(photo.createdAt);
  if (Number.isNaN(created)) return false;
  return nowMs - created > STUDIO_PHOTO_TTL_DAYS * 86_400_000;
}
