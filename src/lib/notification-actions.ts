"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, requireAdmin } from "./dal";
import { markAllRead } from "./notifications";
import type { NotificationScope } from "./notification-scope";

export async function markNotificationsReadAction(scope: NotificationScope = "user"): Promise<void> {
  if (scope !== "user" && scope !== "admin") throw new Error("Invalid notification scope");
  const user = scope === "admin" ? await requireAdmin() : await getCurrentUser();
  if (!user) return;
  await markAllRead(user.id, scope);
  revalidatePath("/", "layout");
  revalidatePath(scope === "admin" ? "/admin/notifications" : "/account");
}
