"use client";

import { useActionState, useEffect, useState } from "react";
import {
  updateDisplayNameAction,
  type DisplayNameState,
} from "@/lib/auth-actions";

/**
 * マイページ・ユーザーヘッダーの氏名をインライン編集する（公開表示名）。
 * 保存先はユーザーレコードの displayName で、掲示板の今後の投稿者名に反映される。
 * 過去の投稿は投稿時スナップショットのまま変わらない（サーバー側仕様）。
 */
export default function DisplayNameEditor({
  initialName,
  en,
}: {
  initialName: string;
  en: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState<DisplayNameState, FormData>(
    updateDisplayNameAction,
    undefined,
  );

  // 保存成功したら編集モードを閉じる（表示は state 側の値を優先）
  useEffect(() => {
    if (state?.ok) setEditing(false);
  }, [state]);

  const name = state?.ok ? state.displayName : initialName;

  if (!editing) {
    return (
      <div className="flex items-center gap-2 min-w-0">
        <h1 className="text-[clamp(1.4rem,2.6vw,2rem)] font-bold leading-tight truncate">
          {name}
        </h1>
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={en ? "Edit display name" : "表示名を変更"}
          title={en ? "Edit display name" : "表示名を変更"}
          className="shrink-0 text-[#7b8794] hover:text-[#1ea0c4] transition p-1"
        >
          <svg
            viewBox="0 0 24 24"
            width="15"
            height="15"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <input
          name="displayName"
          defaultValue={name}
          maxLength={30}
          autoFocus
          className="border border-[#e2e7ec] bg-white px-3 py-1.5 text-[15px] font-bold min-w-0 w-[220px] focus:outline-none focus:border-[#1ea0c4]"
          aria-label={en ? "Display name" : "表示名"}
        />
        <button
          type="submit"
          disabled={pending}
          className="mono text-[10px] tracking-[0.18em] uppercase border border-[#1ea0c4] text-[#1ea0c4] px-3 py-1.5 hover:bg-[#1ea0c4] hover:text-white transition disabled:opacity-50"
        >
          {pending ? (en ? "Saving…" : "保存中…") : en ? "Save" : "保存"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={pending}
          className="mono text-[10px] tracking-[0.18em] uppercase border border-[#e2e7ec] text-[#7b8794] px-3 py-1.5 hover:border-[#14181c]/40 hover:text-[#14181c] transition disabled:opacity-50"
        >
          {en ? "Cancel" : "キャンセル"}
        </button>
      </div>
      <p className="text-[10.5px] text-[#7b8794] mt-1.5 leading-relaxed">
        {en
          ? "This name is shown on the board. Applies to future posts only."
          : "掲示板に表示される名前です。変更は今後の投稿から反映されます。"}
      </p>
      {state && !state.ok && (
        <p className="text-[11px] text-[#c0392b] mt-1">{state.error}</p>
      )}
    </form>
  );
}
