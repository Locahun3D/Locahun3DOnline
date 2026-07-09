"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  toggleBookmarkAction,
  getBookmarkContextAction,
  saveBookmarkToFolderAction,
} from "@/lib/bookmark-actions";
import { useLocale } from "@/components/locale-provider";

type Folder = { id: string; name: string };

/**
 * 物件ブックマーク（保存）ボタン — Pinterest 風の保存フロー。
 * - 未サインイン: クリックで /sign-in へ誘導。
 * - サインイン済み: クリックで「保存先（ボード=フォルダ）」を選ぶポップオーバーを開く。
 *   既存フォルダへ保存・未整理へ保存・新規フォルダ作成して保存・保存解除ができる。
 * ポップオーバーはカードの overflow に切られないよう body ポータルへ fixed 描画する。
 * variant="overlay" はカード上のアイコンボタン、"inline" は詳細ページのラベル付き、
 * "hero" は暗いヒーロー画像上の強調ボタン。
 */
export default function BookmarkButton({
  propertyId,
  initialBookmarked,
  signedIn,
  revalidate,
  variant = "inline",
}: {
  propertyId: string;
  initialBookmarked: boolean;
  signedIn: boolean;
  revalidate?: string;
  variant?: "overlay" | "inline" | "hero";
}) {
  const router = useRouter();
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [pending, startTransition] = useTransition();
  const locale = useLocale();
  const en = locale === "en";

  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; left: number; width: number } | null>(null);
  const [ctx, setCtx] = useState<{
    loading: boolean;
    folderId: string | null;
    folders: Folder[];
  }>({ loading: true, folderId: null, folders: [] });
  const [newName, setNewName] = useState("");

  const openPopover = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setAnchor({ top: r.bottom + 6, left: r.left, width: r.width });
    setOpen(true);
    setCtx((c) => ({ ...c, loading: true }));
    getBookmarkContextAction(propertyId).then((res) => {
      setBookmarked(res.bookmarked);
      setCtx({ loading: false, folderId: res.folderId, folders: res.folders });
    });
  };

  const onClick = (e: React.MouseEvent) => {
    // カード全体がリンクの場合、リンク遷移を止める。
    e.preventDefault();
    e.stopPropagation();
    if (!signedIn) {
      router.push(`/sign-in?redirect_url=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    if (open) setOpen(false);
    else openPopover();
  };

  const saveTo = (folderId: string | null, folderName?: string) => {
    setBookmarked(true);
    setOpen(false);
    startTransition(async () => {
      await saveBookmarkToFolderAction(propertyId, folderId, {
        newFolderName: folderName,
        revalidate,
      });
    });
  };

  const createAndSave = () => {
    const name = newName.trim();
    if (!name) return;
    setNewName("");
    saveTo(null, name);
  };

  const removeSave = () => {
    setBookmarked(false);
    setOpen(false);
    startTransition(async () => {
      const res = await toggleBookmarkAction(propertyId, revalidate);
      if (!res.ok) setBookmarked(true);
      else setBookmarked(res.bookmarked);
    });
  };

  const label = bookmarked ? (en ? "Saved" : "保存済み") : (en ? "Save" : "保存する");
  const star = bookmarked ? "★" : "☆";

  const buttonEl = (() => {
    if (variant === "hero") {
      return (
        <button
          ref={btnRef}
          type="button"
          onClick={onClick}
          disabled={pending}
          aria-pressed={bookmarked}
          aria-haspopup="menu"
          aria-expanded={open}
          className={`inline-flex items-center gap-2 text-[13px] font-semibold tracking-[0.04em] rounded-sm border px-4 py-2.5 backdrop-blur-md shadow-lg transition ${
            bookmarked
              ? "border-accent bg-accent text-black"
              : "border-white/60 bg-black/35 text-white hover:bg-white hover:text-black hover:border-white"
          } ${pending ? "opacity-60" : ""}`}
        >
          <span className="text-[16px] leading-none">{star}</span>
          {label}
        </button>
      );
    }
    if (variant === "overlay") {
      return (
        <button
          ref={btnRef}
          type="button"
          onClick={onClick}
          disabled={pending}
          aria-pressed={bookmarked}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={label}
          title={label}
          className={`grid place-items-center w-8 h-8 rounded-sm border backdrop-blur transition ${
            bookmarked
              ? "border-accent bg-accent/90 text-bg"
              : "border-line bg-bg/75 text-ink hover:border-accent hover:text-accent"
          } ${pending ? "opacity-60" : ""}`}
        >
          <span className="text-[15px] leading-none">{star}</span>
        </button>
      );
    }
    return (
      <button
        ref={btnRef}
        type="button"
        onClick={onClick}
        disabled={pending}
        aria-pressed={bookmarked}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`inline-flex items-center gap-2 mono text-[11px] tracking-[0.18em] uppercase border px-4 py-2.5 transition ${
          bookmarked
            ? "border-accent text-accent bg-accent/10"
            : "border-line text-ink hover:border-accent hover:text-accent"
        } ${pending ? "opacity-60" : ""}`}
      >
        <span className="text-[14px] leading-none">{star}</span>
        {label}
      </button>
    );
  })();

  return (
    <>
      {buttonEl}
      {open && anchor && (
        <SavePopover
          anchor={anchor}
          en={en}
          loading={ctx.loading}
          bookmarked={bookmarked}
          folderId={ctx.folderId}
          folders={ctx.folders}
          newName={newName}
          setNewName={setNewName}
          onSaveTo={saveTo}
          onCreateAndSave={createAndSave}
          onRemove={removeSave}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function SavePopover({
  anchor,
  en,
  loading,
  bookmarked,
  folderId,
  folders,
  newName,
  setNewName,
  onSaveTo,
  onCreateAndSave,
  onRemove,
  onClose,
}: {
  anchor: { top: number; left: number; width: number };
  en: boolean;
  loading: boolean;
  bookmarked: boolean;
  folderId: string | null;
  folders: Folder[];
  newName: string;
  setNewName: (v: string) => void;
  onSaveTo: (folderId: string | null) => void;
  onCreateAndSave: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    // 直後の同一クリックで閉じないよう次フレームで購読。
    const t = setTimeout(() => {
      document.addEventListener("mousedown", onDoc);
      document.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // ビューポート右端からはみ出さないよう左位置をクランプ（幅 256px）。
  const W = 256;
  const left = Math.min(anchor.left, (typeof window !== "undefined" ? window.innerWidth : 1440) - W - 12);

  const rowCls =
    "w-full flex items-center gap-2 text-left px-3 py-2 text-[13px] hover:bg-accent/10 transition";

  return createPortal(
    <div
      ref={ref}
      role="menu"
      className="fixed z-[70] bg-bg border border-line shadow-2xl"
      style={{ top: anchor.top, left: Math.max(12, left), width: W }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-3 py-2 border-b border-line mono text-[10px] tracking-[0.22em] uppercase text-muted">
        {en ? "Save to board" : "保存先ボード"}
      </div>

      {loading ? (
        <div className="px-3 py-4 text-[12px] text-muted">{en ? "Loading…" : "読み込み中…"}</div>
      ) : (
        <div className="max-h-[240px] overflow-y-auto py-1">
          <button
            type="button"
            role="menuitem"
            onClick={() => onSaveTo(null)}
            className={rowCls}
          >
            <span className="w-4 text-accent">{bookmarked && !folderId ? "✓" : ""}</span>
            <span className="flex-1">{en ? "Unsorted" : "未整理"}</span>
          </button>
          {folders.map((f) => (
            <button
              key={f.id}
              type="button"
              role="menuitem"
              onClick={() => onSaveTo(f.id)}
              className={rowCls}
            >
              <span className="w-4 text-accent">{folderId === f.id ? "✓" : ""}</span>
              <span className="flex-1 truncate">{f.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* 新規フォルダ作成 */}
      <div className="border-t border-line p-2 flex gap-1.5">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), onCreateAndSave())}
          placeholder={en ? "+ New board" : "+ 新規ボード"}
          maxLength={60}
          className="flex-1 min-w-0 text-[12px] border border-line bg-bg px-2 py-1.5"
        />
        <button
          type="button"
          onClick={onCreateAndSave}
          disabled={!newName.trim()}
          className="mono text-[10px] tracking-[0.14em] uppercase border border-accent text-accent px-2.5 py-1.5 hover:bg-accent hover:text-bg transition disabled:opacity-40 disabled:pointer-events-none shrink-0"
        >
          {en ? "Save" : "保存"}
        </button>
      </div>

      {bookmarked && (
        <button
          type="button"
          onClick={onRemove}
          className="w-full text-left px-3 py-2 border-t border-line text-[12px] text-red-400 hover:bg-red-400/10 transition"
        >
          {en ? "✕ Remove from saved" : "✕ 保存を解除"}
        </button>
      )}
    </div>,
    document.body,
  );
}
