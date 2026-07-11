"use client";

import { useMemo, useRef, useState } from "react";
import type { Asset, AssetKind } from "@/lib/schemas";
import { uploadAsset } from "./upload-client";
// アセットのリネーム/削除/サムネ更新を永続化する。以前は localhost 以外で
// 早期 return しており、本番では UI 上は成功してもサーバーに保存されず
// リロードで巻き戻る不具合があった（修正済み）。失敗は握りつぶさず log する。
async function assetApi(body: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch("/api/admin/assets/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error("asset update failed", res.status, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (e) {
    console.error("asset update error", e);
    return false;
  }
}

interface Props {
  initialAssets: Asset[];
  usage: Record<string, string[]>;
}

function fmtBytes(n: number) {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function fmtDate(iso: string) {
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
  } catch {
    return "";
  }
}

const SUGGESTED_TAGS = ["ロケ地", "スタジオ", "倉庫", "屋外", "内装", "外装", "広角", "4K", "テスト", "納品済"];

const kindLabels: Record<AssetKind, string> = {
  image: "画像",
  splat: "3DGS",
  zip: "ZIP",
  document: "書類",
};

const kindIcons: Record<AssetKind, string> = {
  image: "🖼",
  splat: "◈",
  zip: "📦",
  document: "📄",
};

export default function AssetLibrary({ initialAssets, usage }: Props) {
  const [assets, setAssets] = useState<Asset[]>(initialAssets);
  const [q, setQ] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | AssetKind>("all");
  const [tagFilter, setTagFilter] = useState("");
  const [onlyUnused, setOnlyUnused] = useState(false);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [editingTags, setEditingTags] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const a of assets) for (const t of a.tags ?? []) set.add(t);
    return [...set].sort();
  }, [assets]);

  const filtered = useMemo(() => {
    return assets.filter((a) => {
      if (kindFilter !== "all" && a.kind !== kindFilter) return false;
      if (onlyUnused && (usage[a.url]?.length ?? 0) > 0) return false;
      if (tagFilter && !(a.tags ?? []).includes(tagFilter)) return false;
      if (q && !`${a.label} ${a.filename} ${(a.tags ?? []).join(" ")}`.toLowerCase().includes(q.toLowerCase()))
        return false;
      return true;
    });
  }, [assets, kindFilter, onlyUnused, tagFilter, q, usage]);

  // 形式（画像/3DGS/ZIP/書類）ごとにセクション分けして表示する。
  // フィルタ適用後の集合を分配するので、検索・タグ・未使用の絞り込みと共存する。
  const KIND_ORDER: AssetKind[] = ["image", "splat", "zip", "document"];
  const grouped = useMemo(
    () =>
      KIND_ORDER.map((kind) => ({
        kind,
        items: filtered.filter((a) => a.kind === kind),
      })).filter((g) => g.items.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered],
  );

  async function handleFiles(list: FileList | File[]) {
    setError(null);
    for (const file of Array.from(list)) {
      const kind: AssetKind = file.type.startsWith("image/") ? "image" : "splat";
      const tmpKey = `${file.name}-${file.size}`;
      setProgress((p) => ({ ...p, [tmpKey]: 0 }));
      try {
        const asset = await uploadAsset(file, kind, {
          onProgress: (pct) => setProgress((p) => ({ ...p, [tmpKey]: pct })),
        });
        setAssets((prev) => [asset, ...prev]);
      } catch (e) {
        setError(`${file.name}: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setProgress((p) => {
          const { [tmpKey]: _drop, ...rest } = p;
          return rest;
        });
      }
    }
  }

  function onRename(a: Asset) {
    const label = prompt("表示名", a.label);
    if (label == null) return;
    setAssets((prev) => prev.map((x) => (x.id === a.id ? { ...x, label } : x)));
    assetApi({ action: "rename", id: a.id, label });
  }

  function onDelete(a: Asset) {
    const inUse = usage[a.url]?.length ?? 0;
    const msg = inUse
      ? `このアセットは ${inUse} 件の物件で使用中です。削除すると表示が壊れます。削除しますか？`
      : "削除しますか？（R2 のファイルも削除されます）";
    if (!confirm(msg)) return;
    setAssets((prev) => prev.filter((x) => x.id !== a.id));
    assetApi({ action: "delete", id: a.id });
  }

  function onAddTag(a: Asset, tag: string) {
    const trimmed = tag.trim();
    if (!trimmed || (a.tags ?? []).includes(trimmed)) return;
    const newTags = [...(a.tags ?? []), trimmed];
    setAssets((prev) => prev.map((x) => (x.id === a.id ? { ...x, tags: newTags } : x)));
  }

  function onRemoveTag(a: Asset, tag: string) {
    const newTags = (a.tags ?? []).filter((t) => t !== tag);
    setAssets((prev) => prev.map((x) => (x.id === a.id ? { ...x, tags: newTags } : x)));
  }

  function onSetThumbnail(a: Asset) {
    const url = prompt("サムネイルURL（空欄で削除）", a.thumbnailUrl ?? "");
    if (url == null) return;
    setAssets((prev) => prev.map((x) => (x.id === a.id ? { ...x, thumbnailUrl: url } : x)));
    assetApi({ action: "thumbnail", id: a.id, thumbnailUrl: url });
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center mb-4">
        <button
          onClick={() => fileRef.current?.click()}
          className="bg-accent text-black px-3 py-1.5 text-[13px] font-medium"
        >
          ＋ アップロード
        </button>
        <input
          ref={fileRef}
          type="file"
          hidden
          multiple
          accept="image/*,.splat,.ply,.ksplat"
          onChange={(e) => {
            if (e.target.files?.length) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="検索（名前・タグ）"
          className="bg-[#222] border border-line px-2 py-1 text-[13px] w-40"
        />
        <select
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value as "all" | AssetKind)}
          className="bg-[#222] border border-line px-2 py-1 text-[13px]"
        >
          <option value="all">すべて</option>
          <option value="image">画像</option>
          <option value="splat">3DGS</option>
          <option value="zip">ZIP</option>
          <option value="document">書類</option>
        </select>
        <select
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          className="bg-[#222] border border-line px-2 py-1 text-[13px]"
        >
          <option value="">タグ: すべて</option>
          {allTags.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <label className="text-[12px] text-muted flex items-center gap-1">
          <input type="checkbox" checked={onlyUnused} onChange={(e) => setOnlyUnused(e.target.checked)} />
          未使用のみ
        </label>
        <span className="text-[11px] text-muted ml-auto mono">
          {filtered.length} / {assets.length} 件
        </span>
      </div>

      {error && <div className="text-red-400 text-[12px] mb-3">{error}</div>}
      {Object.entries(progress).map(([k, pct]) => (
        <div key={k} className="mono text-[11px] text-muted mb-1">
          {k} … {pct}%
        </div>
      ))}

      {/* Grid */}
      {/* 形式（画像/3DGS/ZIP/書類）ごとのセクション */}
      <div className="space-y-9">
        {grouped.map(({ kind, items }) => (
          <section key={kind}>
            <div className="flex items-baseline gap-2 mb-3 border-b border-line pb-1.5">
              <span className="text-[13px] opacity-60">{kindIcons[kind]}</span>
              <h2 className="mono text-[11px] tracking-[0.22em] uppercase">
                {kindLabels[kind]}
              </h2>
              <span className="mono text-[10px] text-muted">
                {items.length} 件
                {(() => {
                  const usedCount = items.filter((a) => (usage[a.url]?.length ?? 0) > 0).length;
                  const unusedCount = items.length - usedCount;
                  return (
                    <span className="ml-1.5 opacity-70">
                      （使用中 {usedCount} ・ 未使用 {unusedCount}）
                    </span>
                  );
                })()}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {items.map((a) => {
          const used = usage[a.url]?.length ?? 0;
          const hasThumbnail = a.kind === "image" ? !!a.url : !!(a.thumbnailUrl);
          const thumbSrc = a.kind === "image" ? a.url : a.thumbnailUrl;
          const isEditing = editingTags === a.id;
          return (
            <div
              key={a.id}
              className={`border bg-[#1d1d1d] group hover:border-accent/40 transition-colors ${
                used > 0 ? "border-green-800/60" : "border-amber-800/50"
              }`}
            >
              {/* Preview */}
              <div className="aspect-video bg-[#111] flex items-center justify-center overflow-hidden relative">
                {hasThumbnail && thumbSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumbSrc} alt={a.label} className="object-cover w-full h-full" />
                ) : (
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-[28px] opacity-40">{kindIcons[a.kind]}</span>
                    <span className="mono text-[9px] opacity-30 uppercase">{a.ext || a.kind}</span>
                  </div>
                )}
                {/* Kind badge */}
                <span className="absolute top-1.5 right-1.5 bg-black/70 text-[9px] mono px-1.5 py-0.5 uppercase tracking-wider">
                  {kindLabels[a.kind]}
                </span>
                {/* Status indicator */}
                {a.status === "uploading" && (
                  <span className="absolute top-1.5 left-1.5 bg-yellow-600/80 text-[9px] mono px-1.5 py-0.5">
                    アップロード中
                  </span>
                )}
                {used > 0 ? (
                  <span className="absolute bottom-1.5 right-1.5 bg-green-700/80 text-[9px] mono px-1.5 py-0.5">
                    使用 {used}
                  </span>
                ) : (
                  <span className="absolute bottom-1.5 right-1.5 bg-amber-700/70 text-[9px] mono px-1.5 py-0.5">
                    未使用
                  </span>
                )}
              </div>

              {/* Info */}
              <div className="p-2.5 text-[12px] space-y-1.5">
                <div className="truncate font-medium" title={a.label || a.filename}>
                  {a.label || a.filename || "名前なし"}
                </div>
                <div className="mono text-[10px] text-muted flex flex-wrap gap-x-2">
                  <span>{fmtBytes(a.size)}</span>
                  <span>{fmtDate(a.uploadedAt)}</span>
                </div>

                {/* Tags */}
                <div className="flex flex-wrap gap-1 min-h-[20px]">
                  {(a.tags ?? []).map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-0.5 bg-[#2a2a2a] border border-line text-[10px] px-1.5 py-0.5 rounded-sm"
                    >
                      {tag}
                      {isEditing && (
                        <button
                          onClick={() => onRemoveTag(a, tag)}
                          className="text-red-400 hover:text-red-300 ml-0.5 text-[10px]"
                        >
                          ×
                        </button>
                      )}
                    </span>
                  ))}
                  {!isEditing && (
                    <button
                      onClick={() => { setEditingTags(a.id); setTagInput(""); }}
                      className="text-[10px] text-muted hover:text-accent opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      + タグ
                    </button>
                  )}
                </div>

                {/* Tag editor */}
                {isEditing && (
                  <div className="space-y-1">
                    <div className="flex gap-1">
                      <input
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && tagInput.trim()) {
                            e.preventDefault();
                            onAddTag(a, tagInput);
                            setTagInput("");
                          }
                          if (e.key === "Escape") setEditingTags(null);
                        }}
                        placeholder="タグ名…"
                        className="bg-[#111] border border-line px-1.5 py-0.5 text-[10px] flex-1 min-w-0"
                        autoFocus
                      />
                      <button
                        onClick={() => setEditingTags(null)}
                        className="text-[10px] text-muted hover:text-white px-1"
                      >
                        完了
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {SUGGESTED_TAGS.filter((t) => !(a.tags ?? []).includes(t)).slice(0, 5).map((t) => (
                        <button
                          key={t}
                          onClick={() => onAddTag(a, t)}
                          className="bg-[#252525] text-[9px] px-1 py-0.5 text-muted hover:text-accent hover:border-accent/40 border border-transparent transition-colors"
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-0.5 opacity-70 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => onRename(a)} className="text-[11px] hover:text-accent transition-colors">名前</button>
                  {a.kind !== "image" && (
                    <button onClick={() => onSetThumbnail(a)} className="text-[11px] hover:text-accent transition-colors">サムネ</button>
                  )}
                  <button onClick={() => onDelete(a)} className="text-[11px] text-red-400/70 hover:text-red-400 transition-colors ml-auto">削除</button>
                </div>
              </div>
            </div>
          );
        })}
            </div>
          </section>
        ))}
      </div>
      {filtered.length === 0 && (
        <div className="text-muted text-[13px] py-10 text-center">アセットがありません。</div>
      )}
    </div>
  );
}
