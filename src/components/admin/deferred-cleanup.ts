"use client";

import { cleanupReplacedFileAction } from "@/app/admin/_actions";

/*
 * 差し替え・削除で要らなくなったファイルの後片付けは「保存が通ってから」行う（2026-10-20）。
 *
 * 以前はプレビュー動画の撮り直しや写真の差し替えの瞬間に古いファイルを消していた。
 * その直後の自動保存が衝突（別タブ・シーン編集の保存で updatedAt が進んでいる）で
 * 止まると、データベースには古い URL が残ったまま実体だけが消え、
 * 公開ページのプレビュー動画が空になっていた（渋谷ストリームホール 6F で発生）。
 */
const pending = new Map<string, Set<string>>();

export function deferCleanup(propertyId: string, url: string | null | undefined): void {
  if (!propertyId || !url) return;
  let set = pending.get(propertyId);
  if (!set) pending.set(propertyId, (set = new Set()));
  set.add(url);
}

/** 保存が成功した直後に呼ぶ。保存済みデータがまだ参照しているものはサーバー側で残る。 */
export function flushCleanups(propertyId: string): void {
  const set = pending.get(propertyId);
  if (!set || set.size === 0) return;
  pending.delete(propertyId);
  for (const url of set) cleanupReplacedFileAction(propertyId, url).catch(() => {});
}
