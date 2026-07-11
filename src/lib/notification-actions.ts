"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "./dal";
import { markAllRead } from "./notifications";

export async function markNotificationsReadAction(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  await markAllRead(user.id);
  revalidatePath("/account");
}
