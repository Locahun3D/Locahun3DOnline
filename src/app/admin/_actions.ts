"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { repo, assetRepo } from "@/lib/store";
import { userRepo } from "@/lib/users";
import { purchaseRepo } from "@/lib/purchases";
import { inquiryRepo } from "@/lib/inquiries";
import { deleteR2Object, getUploadMode } from "@/lib/uploads";
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

/**
 * エディタ保存時に、フォームが保持しないサーバ管理フィールドを既存値で保全する。
 * - pageBlocks: 別UI（スタジオページビルダー）の所有物。autosave で消さない。
 * - ownerId: 所有権＝アクセス権の根拠。エディタ保存で空に上書きさせない。
 */
function mergeManaged<T extends Property>(incoming: T, existing: Property | null): T {
  if (!existing) return incoming;
  return {
    ...incoming,
    pageBlocks: existing.pageBlocks,
    ownerId: existing.ownerId || incoming.ownerId,
  };
}

function newDraft(id: string): Property {
  const now = new Date().toISOString();
  // Schema defaults fill in empty strings / zero / empty arrays.
  return propertySchema.parse({
    id,
    status: "draft",
    category: "studio",
    cover: { src: "", alt: "", width: 1600, height: 1000 },
    createdAt: now,
    updatedAt: now,
  });
}

/** カテゴリ別の物件番号プレフィックス（wh-002 形式）。 */
const CATEGORY_ID_PREFIX: Record<string, string> = {
  studio: "st",
  warehouse: "wh",
  house: "hs",
  shop: "sh",
  outdoor: "od",
  venue: "vn",
  school: "sc",
};

/**
 * 既存IDを走査して被らない連番IDを採番する（例: wh-002 → wh-003）。
 * nanoid のランダムIDをやめ、人が読める番号を自動生成する。
 */
async function nextPropertyId(category: string): Promise<string> {
  const prefix = CATEGORY_ID_PREFIX[category] ?? "lc";
  const all = await repo.list();
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  let max = 0;
  for (const p of all) {
    const m = p.id.match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  // 念のため重複を最終チェックし、被っていれば繰り上げる。
  let n = max + 1;
  let id = `${prefix}-${String(n).padStart(3, "0")}`;
  while (await repo.get(id)) {
    n += 1;
    id = `${prefix}-${String(n).padStart(3, "0")}`;
  }
  return id;
}

export async function createDraftAction() {
  const admin = await requireAdmin();
  // 既定カテゴリ(studio)で採番。エディターでカテゴリ変更後も番号は維持される。
  const id = await nextPropertyId("studio");
  const draft = newDraft(id);
  draft.ownerId = admin.id;
  await repo.upsert(draft);
  revalidatePath("/admin/properties");
  redirect(`/admin/properties/${draft.id}/edit`);
}

export async function saveDraftAction(input: unknown) {
  const parsed = propertySchema.parse(input);
  await assertPropertyAccess(parsed.id);
  // 編集フォームが保持しないサーバ管理フィールドは既存値を保全する。
  // pageBlocks（スタジオページビルダー）と ownerId（所有権＝権限の根拠）は
  // エディタの入力対象外なので、autosave で default(空) に上書きさせない。
  const existing = await repo.get(parsed.id);
  await repo.upsert(mergeManaged(parsed, existing));
  revalidatePath("/admin/properties");
  revalidatePath(`/admin/properties/${parsed.id}/edit`);
  return { ok: true as const, id: parsed.id };
}

export async function publishAction(input: unknown) {
  const parsed = publishablePropertySchema.parse(input);
  await assertPropertyAccess(parsed.id);
  const existing = await repo.get(parsed.id);
  await repo.upsert({ ...mergeManaged(parsed, existing), status: "published" });
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
  let done = 0;
  const skipped: string[] = [];
  for (const id of ids) {
    const existing = await repo.get(id);
    if (!existing) {
      skipped.push(id);
      continue;
    }
    if (status === "published") {
      const parsed = publishablePropertySchema.safeParse(existing);
      if (!parsed.success) {
        skipped.push(id); // 公開要件を満たさないものはスキップ
        continue;
      }
      await repo.upsert({ ...parsed.data, status: "published" });
    } else {
      await repo.upsert({ ...existing, status });
    }
    done++;
  }
  revalidatePath("/admin/properties");
  revalidatePath("/properties");
  return { ok: true as const, count: done, total: ids.length, skipped };
}

/** 一括: 選択した物件をまとめて削除。 */
export async function bulkDeleteAction(ids: string[]) {
  await requireAdmin();
  for (const id of ids) await repo.remove(id);
  revalidatePath("/admin/properties");
  revalidatePath("/properties");
  return { ok: true as const, count: ids.length };
}

/** URL（スラッグ＝物件ID）の変更結果。 */
export type RenameState =
  | { ok: true }
  | { ok: false; error: string }
  | undefined;

/** スラッグ（公開URL）を正規化: 英小文字・数字・ハイフンのみ。 */
function normalizeSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * 物件の公開URL（スラッグ＝ID）を変更する。主に公開前の調整用。
 * 安全なリネーム移行: 新IDで作成→旧ID削除し、リンク/ブックマーク/購入/問い合わせの
 * 参照も付け替える。重複・不正形式は弾く。成功時は新しい編集ページへ遷移。
 */
export async function renamePropertyAction(
  _prev: RenameState,
  formData: FormData,
): Promise<RenameState> {
  const oldId = String(formData.get("oldId") ?? "");
  const newId = normalizeSlug(String(formData.get("newId") ?? ""));
  await assertPropertyAccess(oldId);

  if (!newId) {
    return { ok: false, error: "URLは英小文字・数字・ハイフンで入力してください。" };
  }
  if (newId.length < 2 || newId.length > 60) {
    return { ok: false, error: "URLは2〜60文字にしてください。" };
  }
  if (newId === oldId) {
    return { ok: false, error: "現在のURLと同じです。" };
  }
  const existing = await repo.get(oldId);
  if (!existing) {
    return { ok: false, error: "物件が見つかりません。" };
  }
  if (await repo.get(newId)) {
    return { ok: false, error: `「${newId}」は既に使われています。別のURLにしてください。` };
  }

  // 1) 物件レコードを新IDで作成 → 旧IDを削除（先に作成してデータ消失を防ぐ）。
  await repo.upsert({ ...existing, id: newId });
  await repo.remove(oldId);

  // 2) 参照を移行（公開前の下書きなら大半は空。公開済みでも安全に付け替える）。
  const users = await userRepo.list();
  for (const u of users) {
    const linked = u.linkedPropertyIds ?? [];
    const bms = u.bookmarks ?? [];
    const hasLink = linked.includes(oldId);
    const hasBm = bms.includes(oldId);
    if (hasLink || hasBm) {
      await userRepo.upsert({
        ...u,
        linkedPropertyIds: hasLink ? linked.map((x) => (x === oldId ? newId : x)) : linked,
        bookmarks: hasBm ? bms.map((x) => (x === oldId ? newId : x)) : bms,
      });
    }
  }
  for (const p of await purchaseRepo.list({ propertyId: oldId })) {
    await purchaseRepo.upsert({ ...p, propertyId: newId });
  }
  for (const i of await inquiryRepo.list({ propertyId: oldId })) {
    await inquiryRepo.upsert({ ...i, propertyId: newId });
  }

  revalidatePath("/admin/properties");
  revalidatePath("/properties");
  revalidatePath(`/properties/${oldId}`);
  revalidatePath(`/properties/${newId}`);
  redirect(`/admin/properties/${newId}/edit`);
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
  if ((await getUploadMode()) === "r2" && a.r2Key) {
    try {
      await deleteR2Object(a.r2Key);
    } catch (e) {
      console.error("[deleteAsset] R2 delete failed", e);
    }
  }
  await assetRepo.remove(id);
  return { ok: true as const };
}
