"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/dal";
import { repo } from "@/lib/store";
import { studioPhotoRepo } from "@/lib/studio-photos";
import { copyToPublic, deleteStudioPhoto } from "@/lib/studio-photo-storage";
import { STUDIO_PHOTO_EXT, needsConversion, type SniffedType, type StudioPhoto } from "@/lib/studio-photo-intake";

/**
 * スタジオから届いた写真の採用・却下（運営専用・2026-09-26 本人指示
 * 「管理画面の物件編集に『スタジオから届いた写真』の枠を出し、採用/却下を1クリック」）。
 *
 * 採用: 隔離先から公開用のキーへ複製し、ギャラリー（カバー希望ならカバー）に入れる。
 *       元の並びは崩さず末尾に足す。alt はスタジオが書いた名前を使い、無ければ物件名。
 * 却下: 実体を消して記録だけ残す（誰がいつ何を送ったかは追える）。
 *
 * ⚠ EXIF を落とす再エンコードは Workers 上でできない（画像を復号できない）。
 *   採用直後は元のバイト列のまま配信されるので、Dropbox 側のパイプラインで
 *   `python scripts/l3d.py photos` と同じ処理を通して差し替える。管理画面には印を出す。
 */

export type PhotoDecision =
  | { ok: true; photos: StudioPhoto[]; updatedAt?: string }
  | { ok: false; error: string };

export async function acceptStudioPhotoAction(id: string, asCover?: boolean): Promise<PhotoDecision> {
  await requireAdmin();
  const photo = await studioPhotoRepo.get(id);
  if (!photo) return { ok: false, error: "写真が見つかりません。" };
  if (photo.status === "accepted") return { ok: false, error: "すでに採用済みです。" };
  if (needsConversion(photo.contentType)) {
    return {
      ok: false,
      error:
        "HEIC（iPhoneの形式）はそのまま掲載できません。ダウンロードして JPEG に変換し、通常のアップロードで入れてください。",
    };
  }
  const property = await repo.get(photo.propertyId);
  if (!property) return { ok: false, error: "物件が見つかりません。" };

  const ext = STUDIO_PHOTO_EXT[photo.contentType as SniffedType] ?? ".jpg";
  const publicKey = `uploads/${photo.propertyId}/studio-${photo.id}${ext}`;
  await copyToPublic(photo.r2Key, publicKey, photo.contentType);

  const image = {
    src: `/api/r2/${publicKey}`,
    alt: photo.name || property.title,
    altEn: "",
    width: photo.width || 1600,
    height: photo.height || 1000,
    focus: "center",
  };
  const cover = asCover ?? photo.wantCover;
  const next = cover
    ? {
        ...property,
        cover: image,
        // 差し替え前のカバーは捨てずにギャラリーへ回す（撮り直しの判断ができるように）。
        gallery: property.cover.src
          ? [...property.gallery, { ...property.cover, altEn: property.cover.altEn ?? "" }]
          : property.gallery,
      }
    : { ...property, gallery: [...property.gallery, image] };
  const saved = await repo.upsert(next);

  await studioPhotoRepo.setStatus(id, "accepted", { publishedUrl: image.src });
  revalidatePath("/admin/properties");
  revalidatePath(`/admin/properties/${photo.propertyId}/edit`);
  return {
    ok: true,
    photos: await studioPhotoRepo.listByProperty(photo.propertyId),
    updatedAt: saved.updatedAt,
  };
}

export async function rejectStudioPhotoAction(id: string): Promise<PhotoDecision> {
  await requireAdmin();
  const photo = await studioPhotoRepo.get(id);
  if (!photo) return { ok: false, error: "写真が見つかりません。" };
  if (photo.status !== "accepted") await deleteStudioPhoto(photo.r2Key);
  await studioPhotoRepo.setStatus(id, "rejected");
  revalidatePath(`/admin/properties/${photo.propertyId}/edit`);
  return { ok: true, photos: await studioPhotoRepo.listByProperty(photo.propertyId) };
}

/** 物件編集を開いたときの一覧（サーバーコンポーネントから呼ぶ）。 */
export async function listStudioPhotosAction(propertyId: string): Promise<StudioPhoto[]> {
  await requireAdmin();
  return studioPhotoRepo.listByProperty(propertyId);
}
