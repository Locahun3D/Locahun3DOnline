"use server";

import { z } from "zod";
import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "./dal";
import { userRepo } from "./users";
import { createNotification } from "./notifications";
import { getUploadMode, saveScanSubmissionImage, deleteR2Object } from "./uploads";
import { toR2Key } from "./asset-keys";
import { PROPERTY_CATEGORIES, propertySchema } from "./schemas";
import {
  scanSubmissionSchema,
  scanStatusLabel,
  SCAN_SUBMISSION_STATUSES,
  type ScanSubmission,
  type ScanSubmissionStatus,
} from "./scan-submissions";
import { scanSubmissionRepo } from "./scan-submissions-repo";

/*
 * サーバーアクション用の admin チェック。requireAdmin()（redirect版）は
 * データ変更アクションで使わない（アクション内 redirect は呼び出し元ページ
 * ごとホームへ飛ばしてしまう — preview-actions.ts の currentAdmin/assertAdmin
 * パターンを踏襲）。
 */
async function currentAdmin(): Promise<boolean> {
  const u = await getCurrentUser();
  return u?.role === "admin";
}

async function assertAdmin(): Promise<void> {
  if (!(await currentAdmin())) throw new Error("forbidden");
}

// ─── 公開側: 申請フォーム ───────────────────────────────────────

const MAX_SAMPLE_IMAGES = 5;
const MAX_SAMPLE_IMAGE_BYTES = 25 * 1024 * 1024; // 25MB（既存の画像アップロード上限と揃える）
const SAMPLE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const submitFormSchema = z.object({
  locationName: z.string().trim().min(1, "施設・場所名を入力してください").max(120),
  prefecture: z.string().trim().max(20).optional().default(""),
  city: z.string().trim().max(60).optional().default(""),
  category: z.enum(PROPERTY_CATEGORIES),
  description: z.string().trim().min(1, "空間の説明・撮影範囲を入力してください").max(4000),
  captureDevice: z.string().trim().min(1, "使用した機材を入力してください").max(120),
  capturedAt: z
    .string()
    .trim()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "撮影年月は YYYY-MM 形式で入力してください"),
  facilityContact: z.string().trim().max(300).optional().default(""),
  dataLink: z.string().trim().max(500).optional().default(""),
});

export type ScanSubmitState =
  | { ok: true }
  | { ok: false; error: string }
  | undefined;

/**
 * /submit-scan の申請送信。サインイン必須（ページ側でも未サインインには
 * フォームを出していないが、セッション切れ等に備えてここでも確認する）。
 * ページガードと違い redirect は使わず、エラー状態を返す。
 */
export async function submitScanSubmissionAction(
  _prev: ScanSubmitState,
  formData: FormData,
): Promise<ScanSubmitState> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "サインインが必要です。ページを再読み込みしてください。" };
  }

  if (formData.get("consent") !== "on") {
    return { ok: false, error: "同意事項へのチェックが必要です。" };
  }

  const str = (key: string) => formData.get(key)?.toString() ?? "";
  const parsed = submitFormSchema.safeParse({
    locationName: str("locationName"),
    prefecture: str("prefecture"),
    city: str("city"),
    category: str("category"),
    description: str("description"),
    captureDevice: str("captureDevice"),
    capturedAt: str("capturedAt"),
    facilityContact: str("facilityContact"),
    dataLink: str("dataLink"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "入力内容をご確認ください。" };
  }
  const d = parsed.data;

  const files = formData
    .getAll("sampleImages")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    return { ok: false, error: "サンプル画像を1枚以上添付してください。" };
  }
  if (files.length > MAX_SAMPLE_IMAGES) {
    return { ok: false, error: `サンプル画像は最大 ${MAX_SAMPLE_IMAGES} 枚までです。` };
  }
  for (const file of files) {
    if (!SAMPLE_IMAGE_TYPES.includes(file.type)) {
      return { ok: false, error: "添付できるのは画像（JPEG / PNG / WebP / GIF）のみです。" };
    }
    if (file.size > MAX_SAMPLE_IMAGE_BYTES) {
      return {
        ok: false,
        error: `画像1枚あたりのサイズ上限は ${Math.floor(MAX_SAMPLE_IMAGE_BYTES / 1024 / 1024)}MB です。`,
      };
    }
  }

  const id = `sub-${nanoid(12)}`;
  const sampleImages: { src: string; alt: string }[] = [];
  for (const file of files) {
    try {
      const saved = await saveScanSubmissionImage(id, file);
      sampleImages.push({ src: saved.url, alt: d.locationName });
    } catch (e) {
      console.error("[scan-submission] sample image save failed", e);
      return { ok: false, error: "画像の保存に失敗しました。時間をおいて再度お試しください。" };
    }
  }

  const now = new Date().toISOString();
  const submission: ScanSubmission = scanSubmissionSchema.parse({
    id,
    userId: user.id,
    locationName: d.locationName,
    prefecture: d.prefecture,
    city: d.city,
    category: d.category,
    description: d.description,
    captureDevice: d.captureDevice,
    capturedAt: d.capturedAt,
    facilityContact: d.facilityContact,
    sampleImages,
    dataLink: d.dataLink,
    status: "submitted",
    agreedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  await scanSubmissionRepo.upsert(submission);

  // 運営（全admin）へアプリ内通知（requestPublishAction と同じパターン）。
  const admins = (await userRepo.list()).filter((u) => u.role === "admin");
  for (const a of admins) {
    await createNotification({
      userId: a.id,
      type: "scan_submission",
      title: "持ち込みスキャンの申請が届きました",
      body: `${user.name} さんから「${d.locationName}」の持ち込みスキャン申請が届きました。`,
      link: `/admin/submissions/${id}`,
    });
  }

  revalidatePath("/submit-scan");
  revalidatePath("/admin/submissions");
  return { ok: true };
}

// ─── 管理側 ─────────────────────────────────────────────────

function statusChangeNotification(
  locationName: string,
  newStatus: ScanSubmissionStatus,
): { title: string; body: string } {
  const title = `持ち込みスキャン「${locationName}」の状態が更新されました`;
  if (newStatus === "cleared") {
    return { title, body: "権利調整が成立しました。掲載準備を開始します。" };
  }
  if (newStatus === "rejected") {
    return { title, body: "今回は見送りとなりました。お預かりした内容は削除されます。" };
  }
  return { title, body: `状態が「${scanStatusLabel(newStatus)}」になりました。` };
}

/** rejected 遷移時、R2上のサンプル画像の削除をベストエフォートで試みる。 */
async function deleteSampleImagesBestEffort(submission: ScanSubmission): Promise<void> {
  if ((await getUploadMode()) !== "r2") return; // local: 手動削除（管理画面に表示）
  for (const img of submission.sampleImages) {
    const key = toR2Key(img.src);
    if (!key) continue;
    try {
      await deleteR2Object(key);
    } catch (e) {
      console.error("[scan-submission] sample image delete failed (non-fatal)", img.src, e);
    }
  }
}

/**
 * 状態遷移＋運営メモの保存（1フォームで両方を扱う）。状態が実際に変わった
 * ときだけ申請者へ通知する。rejected への遷移ではサンプル画像の削除も試みる。
 */
export async function updateScanSubmissionAction(
  id: string,
  status: ScanSubmissionStatus,
  adminNote: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertAdmin();
  if (!SCAN_SUBMISSION_STATUSES.includes(status)) {
    return { ok: false, error: "不正な状態です。" };
  }
  const existing = await scanSubmissionRepo.get(id);
  if (!existing) return { ok: false, error: "申請が見つかりません。" };

  const statusChanged = existing.status !== status;
  const updated: ScanSubmission = {
    ...existing,
    status,
    adminNote: adminNote.slice(0, 4000),
    updatedAt: new Date().toISOString(),
  };
  await scanSubmissionRepo.upsert(updated);

  if (statusChanged) {
    const { title, body } = statusChangeNotification(existing.locationName, status);
    await createNotification({
      userId: existing.userId,
      type: "scan_status",
      title,
      body,
      link: "/submit-scan",
    });
    if (status === "rejected") {
      await deleteSampleImagesBestEffort(existing);
    }
  }

  revalidatePath("/admin/submissions");
  revalidatePath(`/admin/submissions/${id}`);
  return { ok: true };
}

/** カテゴリ別の物件番号プレフィックス（admin/_actions.ts の CATEGORY_ID_PREFIX と同一）。 */
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
 * cleared 状態の申請から物件下書きを作成する。admin/_actions.ts の
 * nextPropertyId/newDraft と同じ番号採番・下書き構築ロジックを踏襲する
 * （並行作業の隔離のため _actions.ts 自体は import/変更しない）。
 */
export async function createDraftFromScanSubmissionAction(
  id: string,
): Promise<{ ok: true; propertyId: string } | { ok: false; error: string }> {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "admin") throw new Error("forbidden");

  const submission = await scanSubmissionRepo.get(id);
  if (!submission) return { ok: false, error: "申請が見つかりません。" };
  if (submission.status !== "cleared") {
    return { ok: false, error: "成立（cleared）状態の申請のみ物件下書きを作成できます。" };
  }
  if (submission.createdPropertyId) {
    return { ok: true, propertyId: submission.createdPropertyId };
  }

  const { repo } = await import("./store");

  const prefix = CATEGORY_ID_PREFIX[submission.category] ?? "lc";
  const all = await repo.list();
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  let max = 0;
  for (const p of all) {
    const m = p.id.match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  let n = max + 1;
  let propertyId = `${prefix}-${String(n).padStart(3, "0")}`;
  while (await repo.get(propertyId)) {
    n += 1;
    propertyId = `${prefix}-${String(n).padStart(3, "0")}`;
  }

  const now = new Date().toISOString();
  const draft = propertySchema.parse({
    id: propertyId,
    status: "draft",
    category: submission.category,
    title: submission.locationName,
    prefecture: submission.prefecture,
    city: submission.city,
    description: submission.description,
    cover: { src: "", alt: "", width: 1600, height: 1000 },
    createdAt: now,
    updatedAt: now,
  });
  draft.ownerId = admin.id;
  await repo.upsert(draft);

  await scanSubmissionRepo.upsert({
    ...submission,
    createdPropertyId: propertyId,
    updatedAt: now,
  });

  revalidatePath("/admin/properties");
  revalidatePath("/admin/submissions");
  revalidatePath(`/admin/submissions/${id}`);
  return { ok: true, propertyId };
}
