"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { nanoid } from "nanoid";
import { repo } from "@/lib/store";
import { requireAdmin } from "@/lib/dal";
import {
  propertySchema,
  publishablePropertySchema,
  pageBlockSchema,
  type Property,
} from "@/lib/schemas";

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
  const draft = newDraft();
  await repo.upsert(draft);
  revalidatePath("/admin/properties");
  redirect(`/admin/properties/${draft.id}/edit`);
}

export async function saveDraftAction(input: unknown) {
  const parsed = propertySchema.parse(input);
  await repo.upsert(parsed);
  revalidatePath("/admin/properties");
  revalidatePath(`/admin/properties/${parsed.id}/edit`);
  return { ok: true as const, id: parsed.id };
}

export async function publishAction(input: unknown) {
  const parsed = publishablePropertySchema.parse(input);
  await repo.upsert({ ...parsed, status: "published" });
  revalidatePath("/admin/properties");
  revalidatePath(`/admin/properties/${parsed.id}/edit`);
  revalidatePath("/properties");
  revalidatePath(`/properties/${parsed.id}`);
  revalidatePath("/");
  return { ok: true as const, id: parsed.id };
}

export async function unpublishAction(id: string) {
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
  const existing = await repo.get(id);
  if (!existing) return { ok: false as const, reason: "not_found" as const };
  await repo.upsert({ ...existing, status: "archived" });
  revalidatePath("/admin/properties");
  revalidatePath("/properties");
  return { ok: true as const };
}

export async function deleteAction(id: string) {
  await repo.remove(id);
  revalidatePath("/admin/properties");
  revalidatePath("/properties");
  redirect("/admin/properties");
}

/** Save the studio page builder blocks for a property (admin only). */
export async function saveStudioPageAction(id: string, blocks: unknown) {
  await requireAdmin();
  const existing = await repo.get(id);
  if (!existing) return { ok: false as const, reason: "not_found" as const };
  const pageBlocks = z.array(pageBlockSchema).max(60).parse(blocks);
  await repo.upsert({ ...existing, pageBlocks });
  revalidatePath(`/admin/properties/${id}/page`);
  revalidatePath(`/properties/${id}`);
  return { ok: true as const };
}
