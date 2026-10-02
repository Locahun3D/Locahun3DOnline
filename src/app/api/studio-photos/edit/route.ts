import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { repo } from "@/lib/store";
import { propertyPreviewRepo, isPreviewExpired } from "@/lib/property-previews";
import { hashStudioApproveKey } from "@/lib/studio-approval";
import { allowByRate, PHOTO_RATE_MAX } from "@/lib/inquiry-guard";
import { studioPhotoRepo } from "@/lib/studio-photos";
import { putStudioPhoto } from "@/lib/studio-photo-storage";
import {
  MAX_STUDIO_PHOTO_BYTES,
  STUDIO_PHOTO_EXT,
  canStudioUpload,
  cleanDimension,
  needsConversion,
  plausibleDimensions,
  validateStudioPhoto,
} from "@/lib/studio-photo-intake";
import {
  MAX_STUDIO_UPLOADS,
  applyStudioPhotoOp,
  parseStudioPhotoOp,
  studioPublicKey,
  type StudioPhotoOp,
} from "@/lib/studio-photo-edit";

export const dynamic = "force-dynamic";

/**
 * POST /api/studio-photos/edit — スタジオが確認ページから掲載写真を直接編集する口
 * （2026-10-02 本人指示。ログイン不要）。追加・差し替え・削除・並べ替え・カバー指定・説明文。
 *
 * 閉め方は /api/studio-photos（写真を送る口）と同じ:
 *   1. プレビュートークンが有効（物件IDはここから決める）
 *   2. 確認メールのキーのハッシュが一致し、かつ**公開申請中**の物件
 *   3. 送信元レート制限
 *   4. 画像は先頭バイトで形式を判定。HEIC はブラウザで表示できないので受けない（画面側で JPEG にして送る）
 *   5. 保存キーにユーザー入力を混ぜない
 * 違いは、隔離せずにその場でページへ反映すること。下書き（非公開）のページなので、
 * 公開前にスタジオ自身と運営の目に必ず入る。誰がいつ何をしたかは studio_photos に残す。
 *
 * 同時編集: 画面が持っている updatedAt と違えば 409 で最新の写真を返し、上書きしない。
 */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  if (!form) return bad(400, "bad_request", "送信内容を読み取れませんでした。");

  const preview = await propertyPreviewRepo.get(String(form.get("token") ?? ""));
  if (!preview || isPreviewExpired(preview)) return bad(403, "bad_link", "このリンクは無効か、有効期限が切れています。");
  const property = await repo.get(preview.propertyId);
  if (!property) return bad(403, "bad_link", "このリンクは無効です。");

  const guard = canStudioUpload(property, hashStudioApproveKey(String(form.get("key") ?? "")));
  if (!guard.ok) return bad(403, guard.code, guard.error);

  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  if (!allowByRate(ip, `studio-photo-edit:${property.id}`, PHOTO_RATE_MAX)) {
    return bad(429, "rate", "短時間に操作が集中しています。しばらくしてからお試しください。");
  }

  const base = String(form.get("updatedAt") ?? "");
  if (base && property.updatedAt && base !== property.updatedAt) {
    return NextResponse.json(
      { ok: false, code: "stale", error: "ほかの画面で写真が更新されました。最新の状態を表示します。", photos: photosOf(property) },
      { status: 409 },
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("op") ?? ""));
  } catch {
    return bad(400, "bad_op", "操作の内容を読み取れませんでした。");
  }
  const parsed = parseStudioPhotoOp(raw);
  if (!parsed) return bad(400, "bad_op", "操作の内容を読み取れませんでした。");

  let op: StudioPhotoOp;
  if (parsed.type === "add" || parsed.type === "replace") {
    const uploaded = await storeUpload(form, property.id, ip);
    if (!uploaded.ok) return bad(uploaded.status, uploaded.code, uploaded.error);
    op = parsed.type === "add" ? { type: "add", image: uploaded.image } : { type: "replace", slot: parsed.slot, image: uploaded.image };
  } else {
    op = parsed;
  }

  const result = applyStudioPhotoOp(property, op);
  if (!result.ok) return bad(400, "bad_op", result.error);

  const saved = await repo.upsert({
    ...property,
    ...result.photos,
    publishFlow: { ...property.publishFlow, studioPhotosEditedAt: new Date().toISOString() },
  });
  revalidatePath(`/admin/properties/${property.id}/edit`);
  return NextResponse.json({ ok: true, photos: photosOf(saved) });

  async function storeUpload(f: FormData, propertyId: string, source: string) {
    const file = f.get("file");
    if (!(file instanceof File)) return { ok: false as const, status: 400, code: "no_file", error: "写真が添付されていません。" };
    if (file.size > MAX_STUDIO_PHOTO_BYTES) {
      return { ok: false as const, status: 413, code: "too_large", error: `1枚あたり ${Math.floor(MAX_STUDIO_PHOTO_BYTES / 1024 / 1024)}MB までです。` };
    }
    const used = (await studioPhotoRepo.listByProperty(propertyId)).length;
    if (used >= MAX_STUDIO_UPLOADS) {
      return { ok: false as const, status: 429, code: "too_many", error: "この物件で送れる写真の上限に達しました。担当者へご連絡ください。" };
    }
    const buf = await file.arrayBuffer();
    const check = validateStudioPhoto({ bytes: new Uint8Array(buf.slice(0, 32)), size: buf.byteLength, pendingCount: 0 });
    if (!check.ok) return { ok: false as const, status: 415, code: check.code, error: check.error };
    if (needsConversion(check.contentType)) {
      return { ok: false as const, status: 415, code: "heic", error: "この形式（HEIC）はページに表示できません。JPEG に書き出してからお送りください。" };
    }
    const width = cleanDimension(f.get("width"));
    const height = cleanDimension(f.get("height"));
    const sized = plausibleDimensions(width, height);
    const id = crypto.randomUUID().replace(/-/g, "");
    const key = studioPublicKey(propertyId, id, STUDIO_PHOTO_EXT[check.contentType]);
    await putStudioPhoto(key, buf, check.contentType);
    const alt = String(f.get("alt") ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 200);
    // 記録だけ残す（採用済みとして）。運営は管理画面の「スタジオから届いた写真」で経緯を追える。
    await studioPhotoRepo
      .create({
        propertyId,
        r2Key: key,
        contentType: check.contentType,
        size: buf.byteLength,
        name: alt,
        note: "確認ページで直接掲載",
        wantCover: false,
        width: sized ? width : 0,
        height: sized ? height : 0,
        sourceHash: source ? createHash("sha256").update(source).digest("hex").slice(0, 12) : "",
      })
      .then((p) => studioPhotoRepo.setStatus(p.id, "accepted", { publishedUrl: `/api/r2/${key}` }))
      .catch(() => {});
    return {
      ok: true as const,
      image: { src: `/api/r2/${key}`, alt, width: sized ? width : 0, height: sized ? height : 0 },
    };
  }
}

function photosOf(p: { cover: unknown; gallery: unknown; updatedAt?: string }) {
  return { cover: p.cover, gallery: p.gallery, updatedAt: p.updatedAt ?? "" };
}

function bad(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, code, error: message }, { status });
}
