"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, requireAdmin } from "./dal";
import { markAllRead, markOneRead } from "./notifications";
import type { NotificationScope } from "./notification-scope";

export async function markNotificationsReadAction(scope: NotificationScope = "user"): Promise<void> {
  if (scope !== "user" && scope !== "admin") throw new Error("Invalid notification scope");
  const user = scope === "admin" ? await requireAdmin() : await getCurrentUser();
  if (!user) return;
  await markAllRead(user.id, scope);
  revalidatePath("/", "layout");
  revalidatePath(scope === "admin" ? "/admin/notifications" : "/account");
}

/** 通知を開いたときに、その 1 件を既読にする。対象はログイン中の本人宛の行だけ。 */
export async function markNotificationReadAction(id: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user || typeof id !== "string") return;
  await markOneRead(user.id, id);
  revalidatePath("/", "layout");
}
