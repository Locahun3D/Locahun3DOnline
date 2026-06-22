/**
 * PURE helpers for asset storage keys + upload validation.
 * No `server-only` import — client components and unit tests may import this.
 */
export type AssetKind = "image" | "splat" | "zip" | "document";

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
  "video/webm",
];
export const ALLOWED_SPLAT_EXTENSIONS = [".splat", ".ply", ".ksplat", ".rad", ".zip"];
export const ALLOWED_ZIP_EXTENSIONS = [".zip"];
export const ALLOWED_DOCUMENT_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".webp"];
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024; // 25 MB
export const MAX_SPLAT_BYTES = 3 * 1024 * 1024 * 1024; // 3 GB
export const MAX_ZIP_BYTES = 20 * 1024 * 1024 * 1024; // 20 GB
export const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024; // 50 MB

export function safeName(name: string): string {
  return name
    .normalize("NFKC")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .slice(0, 80);
}

export function extOf(filename: string): string {
  const m = /\.[A-Za-z0-9]+$/.exec(filename);
  return m ? m[0].toLowerCase() : "";
}

export function buildAssetKey(input: {
  kind: AssetKind;
  id: string;
  filename: string;
}): string {
  const ext = extOf(input.filename);
  const stem = input.filename.slice(0, input.filename.length - ext.length);
  return `assets/${input.kind}/${input.id}-${safeName(stem)}${ext}`;
}

export function buildPublicUrl(r2Key: string, publicBase: string): string {
  return `${publicBase.replace(/\/+$/, "")}/${r2Key}`;
}

export type ValidateResult =
  | { ok: true }
  | { ok: false; status: number; error: string; message: string };

export function validateUploadMeta(input: {
  kind: AssetKind;
  filename: string;
  contentType: string;
  size: number;
}): ValidateResult {
  if (input.kind === "image") {
    if (!ALLOWED_IMAGE_TYPES.includes(input.contentType)) {
      return {
        ok: false,
        status: 415,
        error: "bad_image_type",
        message: `画像形式は ${ALLOWED_IMAGE_TYPES.join(" / ")} のいずれかにしてください`,
      };
    }
    if (input.size > MAX_IMAGE_BYTES) {
      return {
        ok: false,
        status: 413,
        error: "image_too_large",
        message: `画像は ${(MAX_IMAGE_BYTES / 1024 / 1024).toFixed(0)} MB 以下にしてください`,
      };
    }
    return { ok: true };
  }
  if (input.kind === "zip") {
    const ext = extOf(input.filename);
    if (!ALLOWED_ZIP_EXTENSIONS.includes(ext)) {
      return {
        ok: false,
        status: 415,
        error: "bad_zip_extension",
        message: "ZIP ファイル (.zip) のみアップロードできます",
      };
    }
    if (input.size > MAX_ZIP_BYTES) {
      return {
        ok: false,
        status: 413,
        error: "zip_too_large",
        message: `ZIP は ${(MAX_ZIP_BYTES / 1024 / 1024 / 1024).toFixed(0)} GB 以下にしてください`,
      };
    }
    return { ok: true };
  }

  if (input.kind === "document") {
    const ext = extOf(input.filename);
    if (!ALLOWED_DOCUMENT_EXTENSIONS.includes(ext)) {
      return {
        ok: false,
        status: 415,
        error: "bad_document_extension",
        message: `図面は ${ALLOWED_DOCUMENT_EXTENSIONS.join(" / ")} のいずれかにしてください`,
      };
    }
    if (input.size > MAX_DOCUMENT_BYTES) {
      return {
        ok: false,
        status: 413,
        error: "document_too_large",
        message: `図面は ${(MAX_DOCUMENT_BYTES / 1024 / 1024).toFixed(0)} MB 以下にしてください`,
      };
    }
    return { ok: true };
  }

  // splat
  const ext = extOf(input.filename);
  if (!ALLOWED_SPLAT_EXTENSIONS.includes(ext)) {
    return {
      ok: false,
      status: 415,
      error: "bad_splat_extension",
      message: `Splat ファイルは ${ALLOWED_SPLAT_EXTENSIONS.join(" / ")} のいずれかにしてください`,
    };
  }
  if (input.size > MAX_SPLAT_BYTES) {
    return {
      ok: false,
      status: 413,
      error: "splat_too_large",
      message: `Splat は ${(MAX_SPLAT_BYTES / 1024 / 1024 / 1024).toFixed(0)} GB 以下にしてください`,
    };
  }
  return { ok: true };
}
