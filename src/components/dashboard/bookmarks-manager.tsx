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
  setBookmarkTagsAction,
} from "@/lib/bookmark-actions";

type Folder = { id: string; name: string };

const ALL = "__all__";
const UNSORTED = "__unsorted__";

/**
 * ブックマーク管理 UI — Pinterest 風。
 * 上部に「ボード（=フォルダ）」タイルを並べ（カバー画像＋件数）、選ぶと
 * そのボードの物件だけを下のメイソンリー（CSS columns）で表示する。
 * 物件の保存先フォルダ移動はカード上の ☆（BookmarkButton のポップオーバー）で行う。
 * タグはフォルダと違い1物件に複数付けられる横断ラベルで、絞り込みチップとして併設。
 */
export default function BookmarksManager({
  properties,
  initialFolders,
  initialAssignments,
  initialTags,
  locale,
}: {
  properties: Property[];
  initialFolders: Folder[];
  initialAssignments: Record<string, string>;
  initialTags: Record<string, string[]>;
  locale: Locale;
}) {
  const en = locale === "en";
  const lh = (href: string) => localizedHref(href, locale);
  const [folders, setFolders] = useState<Folder[]>(initialFolders);
  const [assignments, setAssignments] = useState<Record<string, string>>(initialAssignments);
  const [tags, setTags] = useState<Record<string, string[]>>(initialTags);
  const [activeBoard, setActiveBoard] = useState<string>(ALL);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [pending, startTransition] = useTransition();
  // ドラッグ&ドロップ（物件カードを掴んでボードのタブへ落とす → 保存先を移動）
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverBoard, setDragOverBoard] = useState<string | null>(null);

  // ── フォルダ別グルーピング ──
  const byFolder = new Map<string, Property[]>();
  byFolder.set(UNSORTED, []);
  for (const f of folders) byFolder.set(f.id, []);
  for (const p of properties) {
    const fid = assignments[p.id];
    const key = fid && byFolder.has(fid) ? fid : UNSORTED;
    byFolder.get(key)!.push(p);
  }
  const unsortedCount = (byFolder.get(UNSORTED) ?? []).length;

  const allTags = [...new Set(Object.values(tags).flat())].sort((a, b) =>
    a.localeCompare(b, "ja"),
  );

  // ── 表示対象の物件（ボード → タグの順に絞り込む） ──
  let shown: Property[];
  if (activeBoard === ALL) shown = properties;
  else if (activeBoard === UNSORTED) shown = byFolder.get(UNSORTED) ?? [];
  else shown = byFolder.get(activeBoard) ?? [];
  if (activeTag) shown = shown.filter((p) => (tags[p.id] ?? []).includes(activeTag));

  const activeFolder = folders.find((f) => f.id === activeBoard) ?? null;

  // ── アクション ──
  const onCreateFolder = () => {
    const name = newFolderName.trim();
    if (!name) return;
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
    const next = window.prompt(en ? "Rename board" : "ボード名を変更", currentName);
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
        ? `Delete board "${name}"? Saved properties move to Unsorted (they stay saved).`
        : `ボード「${name}」を削除しますか？中の物件は未整理に戻りますが、保存自体は解除されません。`,
    );
    if (!ok) return;
    setFolders((f) => f.filter((x) => x.id !== folderId));
    setAssignments((a) => {
      const nextA = { ...a };
      for (const pid of Object.keys(nextA)) if (nextA[pid] === folderId) delete nextA[pid];
      return nextA;
    });
    if (activeBoard === folderId) setActiveBoard(ALL);
    startTransition(async () => {
      await deleteBookmarkFolderAction(folderId);
    });
  };

  const onTagsChange = (propertyId: string, next: string[]) => {
    setTags((t) => {
      const copy = { ...t };
      if (next.length > 0) copy[propertyId] = next;
      else delete copy[propertyId];
      return copy;
    });
    startTransition(async () => {
      await setBookmarkTagsAction(propertyId, next);
    });
  };

  // 物件をボードへ移動（ドロップ時）。ALL への移動は無効、UNSORTED は割り当て解除。
  const moveToBoard = (propertyId: string, boardKey: string) => {
    if (!propertyId || boardKey === ALL) return;
    const target = boardKey === UNSORTED ? null : boardKey;
    if ((assignments[propertyId] ?? null) === target) return; // 既に同じボード
    setAssignments((a) => {
      const next = { ...a };
      if (target) next[propertyId] = target;
      else delete next[propertyId];
      return next;
    });
    startTransition(async () => {
      await assignBookmarkFolderAction(propertyId, target);
    });
  };

  // ── ボードタイル ──
  const boardTiles: { key: string; name: string; count: number; cover?: string }[] = [
    { key: ALL, name: en ? "All" : "すべて", count: properties.length, cover: properties[0]?.cover.src },
    ...folders
      .filter((f) => !f.id.startsWith("__pending_"))
      .map((f) => {
        const items = byFolder.get(f.id) ?? [];
        return { key: f.id, name: f.name, count: items.length, cover: items[0]?.cover.src };
      }),
  ];
  // 未整理タブ: ドロップの受け皿として、フォルダがある間は 0 件でも常に表示する。
  if (unsortedCount > 0 || folders.some((f) => !f.id.startsWith("__pending_"))) {
    boardTiles.push({
      key: UNSORTED,
      name: en ? "Unsorted" : "未整理",
      count: unsortedCount,
      cover: (byFolder.get(UNSORTED) ?? [])[0]?.cover.src,
    });
  }

  // フォルダタブ型のボードタイル。物件カードをドラッグして落とせるドロップ先でもある
  // （ALL は「すべての保存」ビューなのでドロップ不可）。
  const BoardTile = ({
    tile,
  }: {
    tile: { key: string; name: string; count: number; cover?: string };
  }) => {
    const active = activeBoard === tile.key;
    const over = dragOverBoard === tile.key;
    // ALL は「すべての保存」ビューなのでドロップ不可。ハンドラは常時付ける
    // （draggingId でゲートすると再レンダ前の初回 dragover を取りこぼすため）。
    const droppable = tile.key !== ALL;
    return (
      <button
        type="button"
        onClick={() => setActiveBoard(tile.key)}
        onDragOver={
          droppable
            ? (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (dragOverBoard !== tile.key) setDragOverBoard(tile.key);
              }
            : undefined
        }
        onDragLeave={
          droppable
            ? (e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node))
                  setDragOverBoard((k) => (k === tile.key ? null : k));
              }
            : undefined
        }
        onDrop={
          droppable
            ? (e) => {
                e.preventDefault();
                const pid = e.dataTransfer.getData("text/plain");
                setDragOverBoard(null);
                moveToBoard(pid, tile.key);
              }
            : undefined
        }
        className={`group relative block w-full text-left pt-[18px] transition ${
          over ? "scale-[1.03]" : ""
        }`}
        aria-pressed={active}
      >
        {/* タブ */}
        <span
          className={`absolute top-0 left-0 z-10 h-[22px] max-w-[88%] flex items-center pl-2.5 pr-5 text-[11px] font-bold truncate rounded-t-[8px] [clip-path:polygon(0_0,82%_0,100%_100%,0_100%)] transition ${
            active || over ? "bg-accent text-[#062e38]" : "bg-ink/[0.07] text-ink/70"
          }`}
        >
          {tile.name}
        </span>
        {/* フォルダ本体 */}
        <div
          className={`rounded-[2px] rounded-tr-[10px] border p-1.5 shadow-sm transition ${
            active || over
              ? "border-accent bg-accent/[0.06]"
              : "border-line bg-bg group-hover:border-ink/40"
          }`}
        >
          <div className="relative aspect-[16/10] overflow-hidden rounded-[3px] bg-[#141414]">
            {tile.cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={tile.cover}
                alt=""
                draggable={false}
                className={`w-full h-full object-cover transition ${
                  active ? "" : "opacity-85 group-hover:opacity-100"
                }`}
              />
            ) : (
              <div className="w-full h-full grid place-items-center mono text-[10px] opacity-40">
                {en ? "empty" : "空"}
              </div>
            )}
            <span className="absolute bottom-1 right-1 mono text-[10px] leading-[16px] text-white bg-black/55 px-1.5 rounded-full">
              {tile.count}
            </span>
            {over && (
              <div className="absolute inset-0 grid place-items-center border-2 border-dashed border-accent bg-accent/25">
                <span className="text-[11px] font-bold text-[#062e38]">
                  {en ? "Drop here" : "ここにドロップ"}
                </span>
              </div>
            )}
          </div>
        </div>
      </button>
    );
  };

  const TagEditor = ({ propertyId }: { propertyId: string }) => {
    const [draft, setDraft] = useState("");
    const current = tags[propertyId] ?? [];
    const addTag = () => {
      const t = draft.trim().slice(0, 30);
      if (!t || current.includes(t) || current.length >= 10) {
        setDraft("");
        return;
      }
      onTagsChange(propertyId, [...current, t]);
      setDraft("");
    };
    return (
      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
        {current.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onTagsChange(propertyId, current.filter((x) => x !== t))}
            title={en ? `Remove tag "${t}"` : `タグ「${t}」を外す`}
            className="mono text-[9.5px] tracking-[0.08em] border border-accent/40 text-accent px-2 py-0.5 hover:border-red-400 hover:text-red-400 transition"
          >
            {t} ✕
          </button>
        ))}
        {current.length < 10 && (
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
            onBlur={addTag}
            placeholder={en ? "+ tag" : "+ タグ"}
            maxLength={30}
            className="w-16 text-[10.5px] border border-line bg-bg px-1.5 py-0.5"
          />
        )}
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {/* ── ボード一覧 ── */}
      <section>
        <div className="flex items-center gap-3 mb-1.5">
          <h2 className="mono text-[10px] tracking-[0.22em] uppercase text-muted">
            {en ? "Boards" : "ボード"}
          </h2>
          <span className="flex-1 h-px bg-line" />
        </div>
        <p className="mb-3 text-[11px] text-muted">
          {en
            ? "Drag a property onto a board tab to file it. On mobile, use ☆ on each card."
            : "物件をボードのタブへドラッグすると整理できます（スマホは各カードの ☆ から）。"}
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-x-3 gap-y-4 items-start">
          {boardTiles.map((tile) => (
            <BoardTile key={tile.key} tile={tile} />
          ))}
          {/* 新規ボードタイル（フォルダタブと高さを揃える） */}
          <div className="pt-[18px]">
            <div className="border border-dashed border-line rounded-[2px] rounded-tr-[10px] p-1.5">
            <div className="grid place-items-center aspect-[16/10] text-muted text-2xl">＋</div>
            <div className="pt-1.5 flex gap-1">
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onCreateFolder()}
                placeholder={en ? "New board" : "新規ボード"}
                maxLength={60}
                className="min-w-0 flex-1 text-[11px] border border-line bg-bg px-1.5 py-1"
              />
              <button
                type="button"
                onClick={onCreateFolder}
                disabled={pending || !newFolderName.trim()}
                className="mono text-[9px] tracking-[0.12em] uppercase border border-accent text-accent px-2 py-1 hover:bg-accent hover:text-bg transition disabled:opacity-40 disabled:pointer-events-none shrink-0"
              >
                {en ? "Add" : "作成"}
              </button>
            </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 選択中ボードのヘッダ（名前変更・削除） ── */}
      <div className="flex items-center gap-3 pb-2 border-b border-line">
        <h2 className="font-bold text-[16px]">
          {activeBoard === ALL
            ? en
              ? "All saved"
              : "すべての保存"
            : activeBoard === UNSORTED
              ? en
                ? "Unsorted"
                : "未整理"
              : activeFolder?.name}
        </h2>
        <span className="mono text-[11px] text-muted">{shown.length}</span>
        <span className="flex-1" />
        {activeFolder && (
          <>
            <button
              type="button"
              onClick={() => onRenameFolder(activeFolder.id, activeFolder.name)}
              disabled={pending}
              className="mono text-[10px] tracking-[0.14em] uppercase text-muted hover:text-accent transition disabled:opacity-40"
            >
              {en ? "Rename" : "名前変更"}
            </button>
            <button
              type="button"
              onClick={() => onDeleteFolder(activeFolder.id, activeFolder.name)}
              disabled={pending}
              className="mono text-[10px] tracking-[0.14em] uppercase text-muted hover:text-red-400 transition disabled:opacity-40"
            >
              {en ? "Delete" : "削除"}
            </button>
          </>
        )}
      </div>

      {/* ── タグ絞り込み ── */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 -mt-3">
          <span className="mono text-[10px] tracking-[0.2em] uppercase text-muted shrink-0">
            {en ? "Tags" : "タグ"}
          </span>
          {allTags.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setActiveTag((cur) => (cur === t ? null : t))}
              className={`mono text-[10.5px] tracking-[0.08em] border px-2.5 py-1 transition ${
                activeTag === t
                  ? "border-accent bg-accent text-bg"
                  : "border-line text-ink/80 hover:border-accent hover:text-accent"
              }`}
            >
              {t}
            </button>
          ))}
          {activeTag && (
            <button
              type="button"
              onClick={() => setActiveTag(null)}
              className="mono text-[10px] tracking-[0.14em] uppercase text-muted hover:text-accent transition"
            >
              {en ? "✕ clear" : "✕ 解除"}
            </button>
          )}
        </div>
      )}

      {/* ── メイソンリー（Pinterest 風の CSS columns） ── */}
      {shown.length === 0 ? (
        <p className="text-[13px] text-ink/40 py-8 text-center">
          {en ? "No properties here yet." : "ここにはまだ物件がありません。"}
        </p>
      ) : (
        <div className="columns-2 sm:columns-3 xl:columns-4 gap-4 [&>*]:mb-4 [&>*]:break-inside-avoid">
          {shown.map((p) => (
            <div
              key={p.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", p.id);
                e.dataTransfer.effectAllowed = "move";
                setDraggingId(p.id);
              }}
              onDragEnd={() => {
                setDraggingId(null);
                setDragOverBoard(null);
              }}
              className={`cursor-grab active:cursor-grabbing [&_a]:[-webkit-user-drag:none] [&_img]:[-webkit-user-drag:none] transition ${
                draggingId === p.id ? "opacity-40 ring-2 ring-accent ring-offset-2 ring-offset-bg" : ""
              }`}
            >
              <PropertyCard property={p} locale={locale} />
              <TagEditor propertyId={p.id} />
            </div>
          ))}
        </div>
      )}

      <div className="pt-2 text-center">
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
