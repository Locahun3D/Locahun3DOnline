import type { Property } from "./schemas";
import type { AccountRole } from "./account-schema";

/**
 * studio ロールが保存できない「運営管理フィールド」を、既存値へ強制的に戻す。
 *
 * なぜサーバー側で必要か:
 * エディタUIで3DGSステップを読み取り専用にしても、Server Action へ細工した
 * ペイロードを直接投げれば splatUrl 等を書き換えられてしまう。UIのロックは
 * 防御にならないので、保存経路の必ず通る場所でサーバーが落とす。
 *
 * 対象:
 *  - 3DGS 一式（運営がスキャン後に差し込む）
 *  - status / publishRequestedAt（公開は admin 限定、申請は専用アクション経由）
 */
export function protectStudioManagedFields<T extends Property>(
  incoming: T,
  existing: Property | null,
  role: AccountRole,
): T {
  if (role === "admin") return incoming;
  return {
    ...incoming,
    splatUrl: existing?.splatUrl ?? "",
    zipUrl: existing?.zipUrl ?? "",
    zipSizeMb: existing?.zipSizeMb ?? 0,
    splatSizeMb: existing?.splatSizeMb ?? 0,
    splatItems: existing?.splatItems ?? [],
    status: existing?.status ?? "draft",
    publishRequestedAt: existing?.publishRequestedAt ?? null,
  };
}
