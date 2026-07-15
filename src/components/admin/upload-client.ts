"use client";

import type { Asset, AssetKind } from "@/lib/schemas";

/**
 * 画像アップロードをブラウザ側で WebP に再エンコードして軽量化する。
 * JPEG/PNG のみ対象（既に webp/gif/svg のものは触らない）。長辺 1600px に収め、
 * 品質 0.82 で変換。変換で逆に大きくなる/失敗した場合は元ファイルをそのまま使う。
 * これにより公開ページの画像転送量を大幅に削減する（既存画像は別途一括変換）。
 */
async function toWebpIfImage(file: File): Promise<File> {
  if (!/^image\/(jpeg|png)$/i.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const MAXW = 1600;
    const scale = bmp.width > MAXW ? MAXW / bmp.width : 1;
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bmp.close();
      return file;
    }
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, "image/webp", 0.82),
    );
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.(png|jpe?g)$/i, "") + ".webp";
    return new File([blob], name, { type: "image/webp" });
  } catch {
    return file;
  }
}

async function readImageSize(
  file: File,
): Promise<{ width?: number; height?: number }> {
  if (!file.type.startsWith("image/")) return {};
  try {
    const bmp = await createImageBitmap(file);
    const dims = { width: bmp.width, height: bmp.height };
    bmp.close();
    return dims;
  } catch {
    return {};
  }
}

function xhrSend(
  method: string,
  url: string,
  body: XMLHttpRequestBodyInit,
  headers: Record<string, string>,
  onProgress?: (pct: number) => void,
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });
    xhr.addEventListener("load", () =>
      resolve({ status: xhr.status, text: xhr.responseText }),
    );
    xhr.addEventListener("error", () => reject(new Error("network error")));
    xhr.send(body);
  });
}

/** Upload a file to the asset store; resolves with the finalized Asset. */
export async function uploadAsset(
  file: File,
  kind: AssetKind,
  opts: { onProgress?: (pct: number) => void } = {},
): Promise<Asset> {
  // 画像は送信前に WebP へ再エンコードして軽量化（対象外/失敗時は原本のまま）。
  if (kind === "image") file = await toWebpIfImage(file);
  const dims = await readImageSize(file);

  const presignRes = await fetch("/api/admin/assets/presign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      kind,
      filename: file.name,
      contentType: file.type || "application/octet-stream",
      size: file.size,
    }),
  });
  if (!presignRes.ok) {
    const e = await presignRes.json().catch(() => ({}));
    throw new Error(e.message ?? e.error ?? `presign ${presignRes.status}`);
  }
  const presign = (await presignRes.json()) as
    | { id: string; mode: "r2"; putUrl: string; url: string; contentType: string }
    | { id: string; mode: "binding"; postUrl: string; contentType: string }
    | { id: string; mode: "local"; postUrl: string };

  if (presign.mode === "r2") {
    const put = await xhrSend(
      "PUT",
      presign.putUrl,
      file,
      { "content-type": file.type || "application/octet-stream" },
      opts.onProgress,
    );
    if (put.status < 200 || put.status >= 300) {
      throw new Error(`R2 PUT failed (${put.status})`);
    }
    const commit = await fetch("/api/admin/assets/commit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: presign.id, ...dims }),
    });
    const data = await commit.json();
    if (!commit.ok) throw new Error(data.message ?? data.error ?? "commit failed");
    return data.asset as Asset;
  }

  // local mode、または binding mode（R2バインディング経由でWorkerへPOST）。
  // どちらも multipart で postUrl に送り、サーバーが保存して asset を返す。
  const form = new FormData();
  form.append("id", presign.id);
  form.append("file", file);
  if (dims.width) form.append("width", String(dims.width));
  if (dims.height) form.append("height", String(dims.height));
  const res = await xhrSend("POST", presign.postUrl, form, {}, opts.onProgress);
  // レスポンスが JSON とは限らない。大容量POSTをエッジ(Cloudflare等)が弾くと
  // HTMLの413が返り、素の JSON.parse は "Unexpected token '<'" で落ちて原因が埋もれる。
  // 先に本文を防御的に解析し、status から人間に読めるメッセージを組み立てる。
  let data: { asset?: Asset; message?: string; error?: string } = {};
  try {
    data = res.text ? JSON.parse(res.text) : {};
  } catch {
    /* 非JSON（多くはプラットフォームのHTMLエラーページ）。本文は捨てて status で判断 */
  }
  if (res.status < 200 || res.status >= 300) {
    if (data.message || data.error) throw new Error(data.message ?? data.error);
    if (res.status === 413 || /^\s*</.test(res.text || "")) {
      throw new Error(
        "ファイルが大きすぎてアップロードできません（サーバー経由は約100MBが上限）。" +
          "大容量データはR2直アップロード（presign）の設定が必要です。",
      );
    }
    throw new Error(`アップロード失敗 (${res.status})`);
  }
  return data.asset as Asset;
}

/**
 * 既存アセットの中身だけを差し替える（url/id/r2Keyは不変）。このアセットURLを
 * 参照する全ての物件フィールドが自動的に新しい中身を指すため、差し替え元の
 * 孤立ファイルが残らない（掃除処理も不要）。R2アップロードモード専用。
 */
export async function replaceAssetFile(
  asset: Asset,
  file: File,
  opts: { onProgress?: (pct: number) => void } = {},
): Promise<Asset> {
  const presignRes = await fetch("/api/admin/assets/replace-presign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: asset.id, contentType: file.type || asset.contentType }),
  });
  if (!presignRes.ok) {
    const e = await presignRes.json().catch(() => ({}));
    throw new Error(e.message ?? e.error ?? `replace-presign ${presignRes.status}`);
  }
  const { putUrl } = (await presignRes.json()) as { putUrl: string };

  const put = await xhrSend(
    "PUT",
    putUrl,
    file,
    { "content-type": file.type || "application/octet-stream" },
    opts.onProgress,
  );
  if (put.status < 200 || put.status >= 300) {
    throw new Error(`R2 PUT failed (${put.status})`);
  }

  const commitRes = await fetch("/api/admin/assets/replace-commit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: asset.id, size: file.size, contentType: file.type || asset.contentType }),
  });
  const data = await commitRes.json();
  if (!commitRes.ok) throw new Error(data.message ?? data.error ?? "replace-commit failed");
  return data.asset as Asset;
}
