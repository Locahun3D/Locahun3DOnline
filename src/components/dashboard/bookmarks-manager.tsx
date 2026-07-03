"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { Property } from "@/lib/schemas";
import { localizedHref, type Locale } from "@/lib/i18n/dictionaries";
import PropertyCard from "@/components/property-card";
import {
  createBookmarkFolderAction,
  renameBookmarkFolderAction,
  deleteBookmarkFolderAction,
  assignBookmarkFolderAction,
} from "@/lib/bookmark-actions";

type Folder = { id: string; name: string };

const UNSORTED = "__unsorted__";

/**
 * ブックマーク・フォルダ管理 UI（v1）。ドラッグ&ドロップ・ネスト無しの
 * シンプルな構成: フォルダ作成フォーム + フォルダ毎のセクション + 各物件行に
 * 割り当て用セレクト。フォルダ名の変更・削除はセクション見出しの小さな操作。
 */
export default function BookmarksManager({
  properties,
  initialFolders,
  initialAssignments,
  locale,
}: {
  properties: Property[];
  initialFolders: Folder[];
  initialAssignments: Record<string, string>;
  locale: Locale;
}) {
  const en = locale === "en";
  const lh = (href: string) => localizedHref(href, locale);
  const [folders, setFolders] = useState<Folder[]>(initialFolders);
  const [assignments, setAssignments] = useState<Record<string, string>>(initialAssignments);
  const [newFolderName, setNewFolderName] = useState("");
  const [pending, startTransition] = useTransition();

  const onCreateFolder = () => {
    const name = newFolderName.trim();
    if (!name) return;
    // 楽観更新: 一時IDでまず表示し、サーバーの本IDに差し替える。
    const tempId = `__pending_${Date.now()}`;
    setFolders((f) => [...f, { id: tempId, name }]);
    setNewFolderName("");
    startTransition(async () => {
      const res = await createBookmarkFolderAction(name);
      if (res.ok && res.folder) {
        setFolders((f) => f.map((x) => (x.id === tempId ? res.folder! : x)));
      } else {
        setFolders((f) => f.filter((x) => x.id !== tempId));
      }
    });
  };

  const onRenameFolder = (folderId: string, currentName: string) => {
    const next = window.prompt(
      en ? "Rename folder" : "フォルダ名を変更",
      currentName,
    );
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === currentName) return;
    setFolders((f) => f.map((x) => (x.id === folderId ? { ...x, name: trimmed } : x)));
    startTransition(async () => {
      await renameBookmarkFolderAction(folderId, trimmed);
    });
  };

  const onDeleteFolder = (folderId: string, name: string) => {
    const ok = window.confirm(
      en
        ? `Delete folder "${name}"? Saved properties will move to Unsorted (they stay saved).`
        : `フォルダ「${name}」を削除しますか？中の物件は未整理に戻りますが、保存自体は解除されません。`,
    );
    if (!ok) return;
    setFolders((f) => f.filter((x) => x.id !== folderId));
    setAssignments((a) => {
      const next = { ...a };
      for (const pid of Object.keys(next)) {
        if (next[pid] === folderId) delete next[pid];
      }
      return next;
    });
    startTransition(async () => {
      await deleteBookmarkFolderAction(folderId);
    });
  };

  const onAssign = (propertyId: string, folderId: string) => {
    setAssignments((a) => {
      const next = { ...a };
      if (folderId === UNSORTED) delete next[propertyId];
      else next[propertyId] = folderId;
      return next;
    });
    startTransition(async () => {
      await assignBookmarkFolderAction(propertyId, folderId === UNSORTED ? null : folderId);
    });
  };

  const grouped = new Map<string, Property[]>();
  grouped.set(UNSORTED, []);
  for (const f of folders) grouped.set(f.id, []);
  for (const p of properties) {
    const fid = assignments[p.id];
    const key = fid && grouped.has(fid) ? fid : UNSORTED;
    grouped.get(key)!.push(p);
  }

  const AssignSelect = ({ propertyId }: { propertyId: string }) => (
    <select
      value={assignments[propertyId] ?? UNSORTED}
      onChange={(e) => onAssign(propertyId, e.target.value)}
      disabled={pending}
      className="mono text-[10.5px] tracking-[0.08em] border border-line bg-bg px-2 py-1.5 uppercase"
      aria-label={en ? "Move to folder" : "フォルダへ移動"}
    >
      <option value={UNSORTED}>{en ? "Unsorted" : "未整理"}</option>
      {folders
        .filter((f) => !f.id.startsWith("__pending_"))
        .map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
    </select>
  );

  return (
    <div className="space-y-10">
      {/* ── フォルダ作成 ── */}
      <div className="flex flex-wrap items-center gap-2 border border-line p-4">
        <span className="mono text-[10px] tracking-[0.22em] uppercase text-muted shrink-0">
          {en ? "New folder" : "新しいフォルダ"}
        </span>
        <input
          type="text"
          value={newFolderName}
          onChange={(e) => setNewFolderName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onCreateFolder()}
          placeholder={en ? "e.g. Q3 shortlist" : "例: 候補地A班"}
          maxLength={60}
          className="flex-1 min-w-[160px] text-[13px] border border-line bg-bg px-3 py-2"
        />
        <button
          type="button"
          onClick={onCreateFolder}
          disabled={pending || !newFolderName.trim()}
          className="mono text-[11px] tracking-[0.18em] uppercase border border-accent text-accent px-4 py-2 hover:bg-accent hover:text-bg transition disabled:opacity-40 disabled:pointer-events-none"
        >
          {en ? "+ Create" : "+ 作成"}
        </button>
      </div>

      {/* ── フォルダ毎のセクション ── */}
      {folders.map((f) => {
        const items = grouped.get(f.id) ?? [];
        return (
          <section key={f.id}>
            <div className="flex items-center gap-3 mb-4 pb-2 border-b border-line">
              <h2 className="font-bold text-[15px]">{f.name}</h2>
              <span className="mono text-[10px] text-muted">{items.length}</span>
              <span className="flex-1" />
              <button
                type="button"
                onClick={() => onRenameFolder(f.id, f.name)}
                disabled={pending || f.id.startsWith("__pending_")}
                className="mono text-[10px] tracking-[0.14em] uppercase text-muted hover:text-accent transition disabled:opacity-40"
              >
                {en ? "Rename" : "名前変更"}
              </button>
              <button
                type="button"
                onClick={() => onDeleteFolder(f.id, f.name)}
                disabled={pending || f.id.startsWith("__pending_")}
                className="mono text-[10px] tracking-[0.14em] uppercase text-muted hover:text-red-400 transition disabled:opacity-40"
              >
                {en ? "Delete" : "削除"}
              </button>
            </div>
            {items.length === 0 ? (
              <p className="text-[12px] text-ink/40 pb-2">
                {en ? "No properties in this folder yet." : "このフォルダにはまだ物件がありません。"}
              </p>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {items.map((p) => (
                  <div key={p.id} className="space-y-2">
                    <PropertyCard property={p} locale={locale} />
                    <AssignSelect propertyId={p.id} />
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}

      {/* ── 未整理 ── */}
      <section>
        <div className="flex items-center gap-3 mb-4 pb-2 border-b border-line">
          <h2 className="font-bold text-[15px]">{en ? "Unsorted" : "未整理"}</h2>
          <span className="mono text-[10px] text-muted">
            {(grouped.get(UNSORTED) ?? []).length}
          </span>
        </div>
        {(grouped.get(UNSORTED) ?? []).length === 0 ? (
          <p className="text-[12px] text-ink/40 pb-2">
            {en ? "Everything is filed into a folder." : "すべて何らかのフォルダに整理済みです。"}
          </p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {(grouped.get(UNSORTED) ?? []).map((p) => (
              <div key={p.id} className="space-y-2">
                <PropertyCard property={p} locale={locale} />
                {folders.length > 0 && <AssignSelect propertyId={p.id} />}
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="mt-4 text-center">
        <Link
          href={lh("/properties")}
          className="mono text-[11px] tracking-[0.22em] uppercase text-accent hover:underline"
        >
          {en ? "Browse more locations →" : "さらに物件を探す →"}
        </Link>
      </div>
    </div>
  );
}
