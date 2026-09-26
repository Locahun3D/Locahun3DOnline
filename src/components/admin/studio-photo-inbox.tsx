"use client";

import { useState, useTransition } from "react";
import { acceptStudioPhotoAction, rejectStudioPhotoAction } from "@/lib/studio-photo-actions";
import type { StudioPhoto } from "@/lib/studio-photo-intake";

/**
 * 「スタジオから届いた写真」（2026-09-26 本人指示）。物件編集の「写真」ステップに出る。
 *
 * 届いた写真は R2 の隔離先にあり、ここ（要ログイン）からしか見えない。
 * 採用を押すとギャラリー（カバー希望ならカバー）へ入り、却下は実体を消す。
 * ⚠ 画像は認証付きの /api/studio-photos/<id>/file で表示する。公開URLではない。
 */
/** 1MB 未満は KB で出す（「0 MB」と出ると壊れて見える）。 */
function formatSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${Math.round(bytes / 1024 / 102.4) / 10} MB`;
}

export default function StudioPhotoInbox({
  initial,
  onChanged,
}: {
  initial: StudioPhoto[];
  /** 採用でギャラリーが変わるので、親に読み直してもらう。 */
  onChanged?: () => void;
}) {
  const [photos, setPhotos] = useState(initial);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [pending, start] = useTransition();

  const pendingPhotos = photos.filter((p) => p.status === "pending");
  const decided = photos.filter((p) => p.status !== "pending");

  const run = (id: string, fn: () => Promise<{ ok: boolean; photos?: StudioPhoto[]; error?: string }>) =>
    start(async () => {
      setBusyId(id);
      setError("");
      const result = await fn();
      setBusyId("");
      if (!result.ok) {
        setError(result.error ?? "処理できませんでした。");
        return;
      }
      if (result.photos) setPhotos(result.photos);
      onChanged?.();
    });

  if (photos.length === 0) return null;

  const btn =
    "px-3 py-2 mono text-[10px] tracking-[0.18em] uppercase border transition disabled:opacity-40";

  return (
    <div className="border border-line p-4 space-y-3" data-studio-inbox={pendingPhotos.length}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[14px] font-bold">スタジオから届いた写真</h3>
        <span className="text-[12px] text-muted">
          未処理 {pendingPhotos.length} 枚 ／ 全 {photos.length} 枚
        </span>
      </div>
      <p className="text-[12px] leading-[1.8] text-muted">
        採用するまでサイトには出ません。
        <br />
        採用するとギャラリーの末尾（カバー希望はカバー）に入ります。
        <br />
        EXIF を落とす再エンコードは、あとで掲載パイプライン側で差し替えます。
      </p>
      {error && <p className="text-[12px] text-red-400">{error}</p>}

      <ul className="grid gap-3 sm:grid-cols-2">
        {pendingPhotos.map((photo) => (
          <li key={photo.id} className="border border-line p-3 space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- next/image は使わない（CLAUDE.md） */}
            <img
              src={`/api/studio-photos/${photo.id}/file`}
              alt={photo.name || "スタジオから届いた写真"}
              className="w-full h-[180px] object-cover bg-[#0f0f0f]"
            />
            <div className="text-[13px] leading-[1.7]">
              <div className="font-bold break-words">{photo.name || "（名前なし）"}</div>
              {photo.note && <div className="text-muted break-words">{photo.note}</div>}
              <div className="mono text-[11px] text-muted">
                {formatSize(photo.size)}
                {photo.width > 0 ? ` ・ ${photo.width}×${photo.height}` : ""}
                {photo.wantCover && <span className="text-accent"> ・ カバー希望</span>}
                {photo.contentType === "image/heic" && (
                  <span className="text-amber-400"> ・ HEIC（変換が必要）</span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending && busyId === photo.id}
                className={`${btn} border-accent text-accent hover:bg-accent hover:text-bg`}
                onClick={() => run(photo.id, () => acceptStudioPhotoAction(photo.id))}
              >
                採用
              </button>
              {!photo.wantCover && (
                <button
                  type="button"
                  disabled={pending && busyId === photo.id}
                  className={`${btn} border-line hover:border-ink`}
                  onClick={() => run(photo.id, () => acceptStudioPhotoAction(photo.id, true))}
                >
                  カバーにする
                </button>
              )}
              <button
                type="button"
                disabled={pending && busyId === photo.id}
                className={`${btn} border-line text-muted hover:border-ink`}
                onClick={() => {
                  if (confirm("この写真を却下します（実体を削除します）。よろしいですか？")) {
                    run(photo.id, () => rejectStudioPhotoAction(photo.id));
                  }
                }}
              >
                却下
              </button>
            </div>
          </li>
        ))}
      </ul>

      {decided.length > 0 && (
        <details className="text-[12px] text-muted">
          <summary className="cursor-pointer">処理済み {decided.length} 枚</summary>
          <ul className="mt-2 space-y-1">
            {decided.map((photo) => (
              <li key={photo.id}>
                {photo.status === "accepted" ? "採用" : "却下"}：{photo.name || "（名前なし）"}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
