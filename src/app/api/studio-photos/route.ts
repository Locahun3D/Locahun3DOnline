import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { repo } from "@/lib/store";
import { propertyPreviewRepo, isPreviewExpired } from "@/lib/property-previews";
import { hashStudioApproveKey } from "@/lib/studio-approval";
import { allowByRate, PHOTO_RATE_MAX } from "@/lib/inquiry-guard";
import { studioPhotoRepo } from "@/lib/studio-photos";
import { putStudioPhoto } from "@/lib/studio-photo-storage";
import { notifyStudioPhotoUpload } from "@/lib/email";
import {
  MAX_PHOTO_NAME,
  MAX_PHOTO_NOTE,
  MAX_STUDIO_PHOTO_BYTES,
  canStudioUpload,
  cleanDimension,
  cleanPhotoText,
  plausibleDimensions,
  quarantineKey,
  validateStudioPhoto,
} from "@/lib/studio-photo-intake";

export const dynamic = "force-dynamic";

/**
 * POST /api/studio-photos — スタジオが確認メールのプレビュー画面から写真を送る口
 * （2026-09-26 本人指示。ログイン不要）。
 *
 * ⚠ サイトで唯一の「ログイン不要で実体を書き込める口」。次の順で閉めてある:
 *   1. プレビュートークンが有効（物件IDはここから決める。リクエストの値は使わない）
 *   2. 確認メールのキーのハッシュが一致し、かつ**公開申請中**の物件であること
 *   3. 送信元レート制限（同一IP×同一物件）
 *   4. 実体の先頭バイトで形式を判定（拡張子・Content-Type は信じない。SVG は受けない）
 *   5. 保存先は R2 の quarantine/ 配下。キーにユーザー入力を混ぜない。
 *      /api/r2 はこの接頭辞を拒否するので、採用するまで誰にも配信されない
 *
 * 返すのは受理/拒否だけ。物件の中身は一切返さない（この口から情報が出ないようにする）。
 */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  if (!form) return bad(400, "bad_request", "送信内容を読み取れませんでした。");

  const token = String(form.get("token") ?? "");
  const key = String(form.get("key") ?? "");
  const preview = await propertyPreviewRepo.get(token);
  if (!preview || isPreviewExpired(preview)) {
    return bad(403, "bad_link", "このリンクは無効か、有効期限が切れています。");
  }
  const property = await repo.get(preview.propertyId);
  if (!property) return bad(403, "bad_link", "このリンクは無効です。");

  const guard = canStudioUpload(property, hashStudioApproveKey(key));
  if (!guard.ok) return bad(403, guard.code, guard.error);

  // 送信元の記録は生IPを残さず、ハッシュだけ（後から同一送信元を追えれば足りる）。
  const ip =
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "";
  if (!allowByRate(ip, `studio-photo:${property.id}`, PHOTO_RATE_MAX)) {
    return bad(429, "rate", "短時間に送信が集中しています。しばらくしてからお試しください。");
  }

  const file = form.get("file");
  if (!(file instanceof File)) return bad(400, "no_file", "写真が添付されていません。");
  if (file.size > MAX_STUDIO_PHOTO_BYTES) {
    return bad(413, "too_large", `1枚あたり ${Math.floor(MAX_STUDIO_PHOTO_BYTES / 1024 / 1024)}MB までです。`);
  }

  const buf = await file.arrayBuffer();
  const check = validateStudioPhoto({
    bytes: new Uint8Array(buf.slice(0, 32)),
    size: buf.byteLength,
    pendingCount: await studioPhotoRepo.countPending(property.id),
  });
  if (!check.ok) return bad(415, check.code, check.error);

  const id = crypto.randomUUID().replace(/-/g, "");
  const r2Key = quarantineKey(property.id, id, check.contentType);
  await putStudioPhoto(r2Key, buf, check.contentType);

  const width = cleanDimension(form.get("width"));
  const height = cleanDimension(form.get("height"));
  const sized = plausibleDimensions(width, height);

  const photo = await studioPhotoRepo.create({
    propertyId: property.id,
    r2Key,
    contentType: check.contentType,
    size: buf.byteLength,
    name: cleanPhotoText(form.get("name"), MAX_PHOTO_NAME),
    note: cleanPhotoText(form.get("note"), MAX_PHOTO_NOTE),
    wantCover: String(form.get("wantCover") ?? "") === "1",
    width: sized ? width : 0,
    height: sized ? height : 0,
    sourceHash: ip ? createHash("sha256").update(ip).digest("hex").slice(0, 12) : "",
  });

  // 届いたことは必ず運営へ知らせる（本人指示 2026-09-26「通知メールが飛ぶ」）。
  await notifyStudioPhotoUpload({
    propertyId: property.id,
    title: property.title,
    name: photo.name,
    note: photo.note,
    wantCover: photo.wantCover,
  }).catch(() => {});

  return NextResponse.json({ ok: true, id: photo.id, name: photo.name });
}

function bad(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, code, error: message }, { status });
}
