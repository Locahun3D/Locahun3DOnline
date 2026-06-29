"use client";

import type { Asset, AssetKind } from "@/lib/schemas";

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
