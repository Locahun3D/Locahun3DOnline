"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  publishByIdAction,
  unpublishAction,
  deleteAction,
} from "@/app/admin/_actions";
import type { PropertyStatus } from "@/lib/schemas";

const BTN =
  "mono text-[10px] tracking-[0.22em] uppercase border px-2.5 py-1.5 transition disabled:opacity-40 disabled:cursor-not-allowed";

/** Per-row quick actions for the admin property list. */
export default function PropertyRowActions({
  id,
  status,
}: {
  id: string;
  status: PropertyStatus;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const publish = () => {
    setError(null);
    start(async () => {
      const r = await publishByIdAction(id);
      if (!r.ok) setError(r.error);
    });
  };
  const unpublish = () => {
    setError(null);
    start(async () => {
      await unpublishAction(id);
    });
  };
  const remove = () => {
    if (
      !window.confirm(
        "この物件を削除します。元に戻せません。本当によろしいですか？",
      )
    )
      return;
    setError(null);
    start(async () => {
      await deleteAction(id);
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1.5 justify-end flex-wrap">
        <Link
          href={`/admin/properties/${id}/preview`}
          target="_blank"
          className={`${BTN} border-line hover:border-accent hover:text-accent`}
        >
          プレビュー
        </Link>
        <Link
          href={`/admin/properties/${id}/edit`}
          className={`${BTN} border-line hover:border-accent hover:text-accent`}
        >
          編集
        </Link>
        {status === "published" ? (
          <button
            type="button"
            onClick={unpublish}
            disabled={pending}
            className={`${BTN} border-line hover:border-ink`}
          >
            非公開
          </button>
        ) : (
          <button
            type="button"
            onClick={publish}
            disabled={pending}
            className={`${BTN} border-accent text-accent hover:bg-accent hover:text-bg`}
          >
            公開
          </button>
        )}
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          className={`${BTN} border-red-500/40 text-red-400 hover:bg-red-500 hover:text-bg`}
        >
          削除
        </button>
      </div>
      {error && (
        <div className="mono text-[9px] text-red-400 max-w-[240px] text-right leading-tight">
          {error}
        </div>
      )}
    </div>
  );
}
