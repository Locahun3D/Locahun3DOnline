
import { createHash, randomBytes } from "node:crypto";

/**
 * スタジオの承認ボタン用キー（2026-09-21）。
 * キー本体は確認メールのURL（/preview/<token>?approve=<key>）にだけ入れ、DBには SHA-256 だけを残す。
 * 物件データは公開側のクライアントにも渡るため、平文のキーを物件に持たせない。
 */
export function newStudioApproveKey(): { key: string; hash: string } {
  const key = randomBytes(24).toString("hex");
  return { key, hash: hashStudioApproveKey(key) };
}

export function hashStudioApproveKey(key: string): string {
  if (!/^[a-f0-9]{48}$/.test(key)) return "";
  return createHash("sha256").update(key).digest("hex");
}
