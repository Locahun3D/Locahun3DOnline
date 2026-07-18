"use client";

import { useEffect, useState } from "react";
import type { Asset, AssetKind } from "@/lib/schemas";

interface Props {
  kind: AssetKind;
  open: boolean;
  onClose: () => void;
  onPick: (asset: Asset) => void;
}

export default function AssetPickerModal({ kind, open, onClose, onPick }: Props) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/admin/assets?kind=${kind}`)
      .then((r) => r.json())
      .then((d) => setAssets(d.assets ?? []))
      .finally(() => setLoading(false));
  }, [open, kind]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#1a1a1a] border border-line max-w-3xl w-full max-h-[calc(80vh/var(--z))] overflow-auto p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-[15px]">ライブラリから選択（{kind === "image" ? "画像" : "3DGS"}）</h2>
          <button onClick={onClose} className="text-muted hover:text-ink">✕</button>
        </div>
        {loading ? (
          <div className="text-muted text-[13px] py-8 text-center">読み込み中…</div>
        ) : assets.length === 0 ? (
          <div className="text-muted text-[13px] py-8 text-center">
            アセットがありません。<a href="/admin/assets" className="text-accent underline">ライブラリ</a>でアップロードしてください。
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {assets.map((a) => (
              <button
                key={a.id}
                onClick={() => { onPick(a); onClose(); }}
                className="border border-line bg-[#1d1d1d] text-left hover:border-accent"
              >
                <div className="aspect-video bg-[#111] flex items-center justify-center overflow-hidden">
                  {a.kind === "image" && a.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.url} alt={a.label} className="object-cover w-full h-full" />
                  ) : (
                    <span className="mono text-[24px] opacity-50">◈</span>
                  )}
                </div>
                <div className="p-2 text-[12px] truncate">{a.label || a.filename}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
