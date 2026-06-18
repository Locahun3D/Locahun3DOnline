"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "./dal";
import { getSettings, saveSettings } from "./site-settings";

export type FreePeriodState =
  | { ok: true; message: string }
  | { ok: false; error: string }
  | undefined;

/** Save the 限定無料期間 settings. Dates are interpreted in JST (UTC+9). */
export async function saveFreePeriodAction(
  _prev: FreePeriodState,
  formData: FormData,
): Promise<FreePeriodState> {
  await requireAdmin();

  const enabled = formData.get("enabled") === "on";
  const startRaw = String(formData.get("startAt") ?? "").trim();
  const endRaw = String(formData.get("endAt") ?? "").trim();
  const note = String(formData.get("note") ?? "").slice(0, 200);

  // input type=date gives "YYYY-MM-DD"; anchor to JST day boundaries.
  const startAt = startRaw ? new Date(`${startRaw}T00:00:00+09:00`).toISOString() : null;
  const endAt = endRaw ? new Date(`${endRaw}T23:59:59+09:00`).toISOString() : null;

  if (startAt && endAt && startAt > endAt) {
    return { ok: false, error: "開始日が終了日より後になっています。" };
  }

  const cur = await getSettings();
  await saveSettings({ ...cur, freePeriod: { enabled, startAt, endAt, note } });

  // Free access is read on property pages; refresh broadly.
  revalidatePath("/admin/free-period");
  revalidatePath("/properties", "layout");
  return { ok: true, message: "保存しました。" };
}
