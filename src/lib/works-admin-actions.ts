"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/dal";
import { listWorksSlugs } from "@/lib/works-content";
import {
  getWorksMeta,
  newShareToken,
  setWorksMeta,
  WORKS_STATUSES,
  type WorksStatus,
} from "@/lib/works-gating";

/**
 * works 記事の公開状態を切り替える（旧 `/api/works` の PUT 相当）。
 * 旧実装と同じ規則:
 *   private にしたら shareToken を発行（既にあれば保つ）
 *   private 以外にしたら shareToken を破棄
 */
export async function setWorksStatusAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const slug = String(formData.get("slug") ?? "");
  const status = String(formData.get("status") ?? "") as WorksStatus;
  if (!isKnownSlug(slug) || !WORKS_STATUSES.includes(status)) return;

  const current = await getWorksMeta(slug);
  const next = {
    status,
    shareToken:
      status === "private" ? (current.shareToken ?? newShareToken()) : null,
  };
  await setWorksMeta(slug, next);
  revalidatePath("/admin/works");
}

/** 共有トークンを作り直す（旧 `/api/works/:slug/regenerate-token` 相当）。 */
export async function regenerateWorksTokenAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const slug = String(formData.get("slug") ?? "");
  if (!isKnownSlug(slug)) return;
  const current = await getWorksMeta(slug);
  if (current.status !== "private") return;
  await setWorksMeta(slug, { status: "private", shareToken: newShareToken() });
  revalidatePath("/admin/works");
}

/** 取り込み済みの記事以外のキーを KV に生やさない。 */
function isKnownSlug(slug: string): boolean {
  return listWorksSlugs().some((w) => w.slug === slug);
}
