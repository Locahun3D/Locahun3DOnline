import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getCurrentUser } from "@/lib/dal";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { saveLocalUpload } from "@/lib/uploads";
import { canAccessLocalFs } from "@/lib/fs-safe";

const R2_PROXY_BASE = "/api/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  // 認証は常に必須（NODE_ENV 分岐は preview/誤設定で誰でも書込可になる）。
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_multipart" }, { status: 400 });
  }

  const file = form.get("file");
  // パストラバーサル対策: propertyId は英数・ハイフン・アンダースコアのみ許可。
  const propertyId = String(form.get("propertyId") ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }
  if (!propertyId) {
    return NextResponse.json({ error: "no_property_id" }, { status: 400 });
  }

  const itemIdx = String(form.get("itemIdx") ?? "").trim();
  const slug = itemIdx || nanoid(6);
  const ext = file.name.endsWith(".mp4") ? "mp4" : "webm";
  const contentType = ext === "mp4" ? "video/mp4" : "video/webm";
  const key = `uploads/${propertyId}/${slug}-preview.${ext}`;

  try {
    // 永続化先は NODE_ENV ではなく実行環境で分岐する。Workers では FS が
    // read-only のため saveLocalUpload は無効（ファイルが消える）。preview/staging で
    // NODE_ENV!=="production" でも Workers 上なら必ず R2 に put する。
    if (!canAccessLocalFs()) {
      const { env } = await getCloudflareContext();
      const r2 = (env as Record<string, unknown>).R2_ASSETS as {
        put(key: string, value: ArrayBuffer, opts?: Record<string, unknown>): Promise<unknown>;
      };
      const buf = await file.arrayBuffer();
      await r2.put(key, buf, {
        httpMetadata: { contentType },
      });
      return NextResponse.json({ url: `${R2_PROXY_BASE}/${key}` });
    }

    const result = await saveLocalUpload(propertyId, file);
    return NextResponse.json({ url: result.url });
  } catch (e) {
    console.error("[capture-upload]", e);
    return NextResponse.json(
      { error: "upload_failed", message: String(e instanceof Error ? e.message : e) },
      { status: 500 },
    );
  }
}
