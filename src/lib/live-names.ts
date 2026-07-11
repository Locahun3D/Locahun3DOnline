/**
 * 掲示板コメント・レビューの表示名を「投稿時点のスナップショット」ではなく
 * 常に現在の displayName/name に解決し直す。
 *
 * 従来は comments.userName / reviews.userName に投稿時点の表示名を保存した
 * ままにしていた（意図的な設計だったが、実機フィードバック「名前を変えたら
 * 書き込みのアイコンも変わるようにしたい（過去の投稿も含めて）」を受けて撤回）。
 * レコード自体のスナップショットは監査ログとして残したまま、表示直前に
 * 現在の userRepo の値で上書きする。退会済み等で該当ユーザーが見つからない
 * 場合のみ、元のスナップショットにフォールバックする。
 */
import "server-only";
import { userRepo } from "./users";
import { publicDisplayName } from "./account-schema";

export async function withLiveDisplayNames<T extends { userId: string; userName: string }>(
  items: T[],
): Promise<T[]> {
  const ids = [...new Set(items.map((i) => i.userId).filter(Boolean))];
  if (ids.length === 0) return items;
  const users = await Promise.all(ids.map((id) => userRepo.get(id).catch(() => null)));
  const nameById = new Map<string, string>();
  users.forEach((u, i) => {
    if (u) nameById.set(ids[i], publicDisplayName(u));
  });
  if (nameById.size === 0) return items;
  return items.map((it) => {
    const live = nameById.get(it.userId);
    return live && live !== it.userName ? { ...it, userName: live } : it;
  });
}
