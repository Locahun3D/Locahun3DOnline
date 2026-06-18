"use client";

import { useMemo, useRef, useState } from "react";
import type { Asset, AssetKind } from "@/lib/schemas";
import { uploadAsset } from "./upload-client";
import { renameAssetAction, deleteAssetAction } from "@/app/admin/_actions";

interface Props {
  initialAssets: Asset[];
  usage: Record<string, string[]>;
}

function fmtBytes(n: number) {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default function AssetLibrary({ initialAssets, usage }: Props) {
  const [assets, setAssets] = useState<Asset[]>(initialAssets);
  const [q, setQ] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | AssetKind>("all");
  const [onlyUnused, setOnlyUnused] = useState(false);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    return assets.filter((a) => {
      if (kindFilter !== "all" && a.kind !== kindFilter) return false;
      if (onlyUnused && (usage[a.url]?.length ?? 0) > 0) return false;
      if (q && !`${a.label} ${a.filename}`.toLowerCase().includes(q.toLowerCase()))
        return false;
      return true;
    });
  }, [assets, kindFilter, onlyUnused, q, usage]);

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

  async function onRename(a: Asset) {
    const label = prompt("表示名", a.label);
    if (label == null) return;
    const res = await renameAssetAction(a.id, label);
    if (res.ok) setAssets((prev) => prev.map((x) => (x.id === a.id ? { ...x, label } : x)));
  }

  async function onDelete(a: Asset) {
    const inUse = usage[a.url]?.length ?? 0;
    const msg = inUse
      ? `このアセットは ${inUse} 件の物件で使用中です。削除すると表示が壊れます。削除しますか？`
      : "削除しますか？（R2 のファイルも削除されます）";
    if (!confirm(msg)) return;
    const res = await deleteAssetAction(a.id);
    if (res.ok) setAssets((prev) => prev.filter((x) => x.id !== a.id));
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
          placeholder="検索（名前）"
          className="bg-[#222] border border-line px-2 py-1 text-[13px]"
        />
        <select
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value as "all" | AssetKind)}
          className="bg-[#222] border border-line px-2 py-1 text-[13px]"
        >
          <option value="all">すべて</option>
          <option value="image">画像</option>
          <option value="splat">3DGS</option>
        </select>
        <label className="text-[12px] text-muted flex items-center gap-1">
          <input type="checkbox" checked={onlyUnused} onChange={(e) => setOnlyUnused(e.target.checked)} />
          未使用のみ
        </label>
      </div>

      {error && <div className="text-accent text-[12px] mb-3">{error}</div>}
      {Object.entries(progress).map(([k, pct]) => (
        <div key={k} className="mono text-[11px] text-muted mb-1">
          {k} … {pct}%
        </div>
      ))}

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {filtered.map((a) => {
          const used = usage[a.url]?.length ?? 0;
          return (
            <div key={a.id} className="border border-line bg-[#1d1d1d]">
              <div className="aspect-video bg-[#111] flex items-center justify-center overflow-hidden">
                {a.kind === "image" && a.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.url} alt={a.label} className="object-cover w-full h-full" />
                ) : (
                  <span className="mono text-[28px] opacity-50">◈</span>
                )}
              </div>
              <div className="p-2 text-[12px]">
                <div className="truncate" title={a.label}>{a.label || a.filename}</div>
                <div className="mono text-[10px] text-muted mt-0.5">
                  {a.kind} · {fmtBytes(a.size)} {used > 0 ? `· 使用 ${used}` : "· 未使用"}
                </div>
                <div className="flex gap-2 mt-1.5">
                  <button onClick={() => onRename(a)} className="text-[11px] underline opacity-70 hover:opacity-100">名前</button>
                  <button onClick={() => onDelete(a)} className="text-[11px] underline text-accent">削除</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {filtered.length === 0 && (
        <div className="text-muted text-[13px] py-10 text-center">アセットがありません。</div>
      )}
    </div>
  );
}
