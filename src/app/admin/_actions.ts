"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { nanoid } from "nanoid";
import { repo } from "@/lib/store";
import {
  propertySchema,
  publishablePropertySchema,
  type Property,
} from "@/lib/schemas";

function newDraft(): Property {
  const now = new Date().toISOString();
  return propertySchema.parse({
    id: nanoid(8),
    status: "draft",
    title: "新規物件 (下書き)",
    category: "studio",
    area: "東京中心エリア",
    prefecture: "東京都",
    city: "",
    hourlyPrice: 0,
    summary: "summary placeholder for the new draft. Replace me.",
    capacity: 0,
    floorAreaSqm: 0,
    ceilingHeightM: 0,
    hasNaturalLight: false,
    parking: false,
    loadingDock: false,
    tags: [],
    description: "",
    cover: {
      src: "https://picsum.photos/seed/draft/1600/1000",
      alt: "未設定",
      width: 1600,
      height: 1000,
    },
    gallery: [],
    splatUrl: "",
    splatSizeMb: 0,
    scannedAt: "",
    annotations: [],
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
