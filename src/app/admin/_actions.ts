"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { nanoid } from "nanoid";
import { repo, assetRepo } from "@/lib/store";
import { deleteR2Object, UPLOAD_MODE } from "@/lib/uploads";
import { requireAdmin, requireAdminOrStudioOwner, getCurrentUser } from "@/lib/dal";
import {
  propertySchema,
  publishablePropertySchema,
  pageBlockSchema,
  type Property,
} from "@/lib/schemas";

async function assertPropertyAccess(propertyId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("unauthorized");
  if (user.role === "admin") return user;
  const linked = user.linkedPropertyIds ?? [];
  const prop = await repo.get(propertyId);
  if (prop && (prop.ownerId === user.id || linked.includes(propertyId))) return user;
  throw new Error("forbidden");
}

function newDraft(): Property {
  const now = new Date().toISOString();
  // Schema defaults fill in empty strings / zero / empty arrays.
  return propertySchema.parse({
    id: nanoid(8),
    status: "draft",
    category: "studio",
    cover: { src: "", alt: "", width: 1600, height: 1000 },
    createdAt: now,
    updatedAt: now,
  });
}

export async function createDraftAction() {
  const admin = await requireAdmin();
  const draft = newDraft();
  draft.ownerId = admin.id;
  await repo.upsert(draft);
  revalidatePath("/admin/properties");
  redirect(`/admin/properties/${draft.id}/edit`);
}

export async function saveDraftAction(input: unknown) {
  const parsed = propertySchema.parse(input);
  await assertPropertyAccess(parsed.id);
  await repo.upsert(parsed);
  revalidatePath("/admin/properties");
  revalidatePath(`/admin/properties/${parsed.id}/edit`);
  return { ok: true as const, id: parsed.id };
}

export async function publishAction(input: unknown) {
  const parsed = publishablePropertySchema.parse(input);
  await assertPropertyAccess(parsed.id);
  await repo.upsert({ ...parsed, status: "published" });
  revalidatePath("/admin/properties");
  revalidatePath(`/admin/properties/${parsed.id}/edit`);
  revalidatePath("/properties");
  revalidatePath(`/properties/${parsed.id}`);
  revalidatePath("/");
  return { ok: true as const, id: parsed.id };
}

/** Publish straight from the list by id — validates the stored record first. */
export async function publishByIdAction(id: string) {
  await requireAdmin();
  const existing = await repo.get(id);
  if (!existing) return { ok: false as const, error: "物件が見つかりません" };
  const parsed = publishablePropertySchema.safeParse(existing);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: "公開に必要な項目が未入力です。エディタで入力してください。",
    };
  }
  await repo.upsert({ ...parsed.data, status: "published" });
  revalidatePath("/admin/properties");
  revalidatePath("/properties");
  revalidatePath(`/properties/${id}`);
  revalidatePath("/");
  return { ok: true as const };
}

export async function unpublishAction(id: string) {
  await requireAdmin();
  const existing = await repo.get(id);
  if (!existing) return { ok: false as const, reason: "not_found" as const };
  await repo.upsert({ ...existing, status: "draft" });
  revalidatePath("/admin/properties");
  revalidatePath(`/admin/properties/${id}/edit`);
  revalidatePath("/properties");
  revalidatePath(`/properties/${id}`);
  return { ok: true as const };
}

export async function archiveAction(id: string) {
  await requireAdmin();
  const existing = await repo.get(id);
  if (!existing) return { ok: false as const, reason: "not_found" as const };
  await repo.upsert({ ...existing, status: "archived" });
  revalidatePath("/admin/properties");
  revalidatePath("/properties");
  return { ok: true as const };
}

export async function deleteAction(id: string) {
  await requireAdmin();
  await repo.remove(id);
  revalidatePath("/admin/properties");
  revalidatePath("/properties");
  redirect("/admin/properties");
}

/** 一括: 選択した物件の status をまとめて変更 (publish/draft/archived)。 */
export async function bulkSetStatusAction(
  ids: string[],
  status: "published" | "draft" | "archived",
) {
  await requireAdmin();
  for (const id of ids) {
    const existing = await repo.get(id);
    if (!existing) continue;
    if (status === "published") {
      const parsed = publishablePropertySchema.safeParse(existing);
      if (!parsed.success) continue; // 公開要件を満たさないものはスキップ
      await repo.upsert({ ...parsed.data, status: "published" });
    } else {
      await repo.upsert({ ...existing, status });
    }
  }
  revalidatePath("/admin/properties");
  revalidatePath("/properties");
  return { ok: true as const, count: ids.length };
}

/** 一括: 選択した物件をまとめて削除。 */
export async function bulkDeleteAction(ids: string[]) {
  await requireAdmin();
  for (const id of ids) await repo.remove(id);
  revalidatePath("/admin/properties");
  revalidatePath("/properties");
  return { ok: true as const, count: ids.length };
}

/** Save the studio page builder blocks for a property. */
export async function saveStudioPageAction(id: string, blocks: unknown) {
  await assertPropertyAccess(id);
  const existing = await repo.get(id);
  if (!existing) return { ok: false as const, reason: "not_found" as const };
  const pageBlocks = z.array(pageBlockSchema).max(60).parse(blocks);
  await repo.upsert({ ...existing, pageBlocks });
  revalidatePath(`/admin/properties/${id}/page`);
  revalidatePath(`/properties/${id}`);
  return { ok: true as const };
}

// ─── Asset library actions ───────────────────────────────────────
export async function renameAssetAction(id: string, label: string) {
  await requireAdmin();
  const a = await assetRepo.get(id);
  if (!a) return { ok: false as const, reason: "not_found" as const };
  await assetRepo.upsert({ ...a, label: label.slice(0, 120) });
  return { ok: true as const };
}

export async function updateAssetTagsAction(id: string, tags: string[]) {
  await requireAdmin();
  const a = await assetRepo.get(id);
  if (!a) return { ok: false as const, reason: "not_found" as const };
  const cleaned = tags.map((t) => t.trim().slice(0, 40)).filter(Boolean);
  await assetRepo.upsert({ ...a, tags: [...new Set(cleaned)] });
  return { ok: true as const };
}

export async function updateAssetThumbnailAction(id: string, thumbnailUrl: string) {
  await requireAdmin();
  const a = await assetRepo.get(id);
  if (!a) return { ok: false as const, reason: "not_found" as const };
  await assetRepo.upsert({ ...a, thumbnailUrl });
  return { ok: true as const };
}

export async function deleteAssetAction(id: string) {
  await requireAdmin();
  const a = await assetRepo.get(id);
  if (!a) return { ok: false as const, reason: "not_found" as const };
  if (UPLOAD_MODE === "r2" && a.r2Key) {
    try {
      await deleteR2Object(a.r2Key);
    } catch (e) {
      console.error("[deleteAsset] R2 delete failed", e);
    }
  }
  await assetRepo.remove(id);
  return { ok: true as const };
}
