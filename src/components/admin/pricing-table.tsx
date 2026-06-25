"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { bulkUpdateSalePricesAction } from "@/lib/admin-actions";

export type PricingRow = {
  propertyId: string;
  idx: number;
  propertyTitle: string;
  label: string;
  tokenCost: 1 | 2 | 3;
  recommended: number;
  forSale: boolean;
  salePrice: number;
  sizeMb: number;
  hasDownload: boolean;
};

const SIZE_LABEL: Record<1 | 2 | 3, string> = {
  1: "小規模",
  2: "中規模",
  3: "大規模/ドーム",
};

function yen(n: number) {
  return `¥${n.toLocaleString()}`;
}

export default function PricingTable({ rows }: { rows: PricingRow[] }) {
  // 各行の編集状態（forSale / price）をローカルで保持。
  const [state, setState] = useState(() =>
    rows.map((r) => ({ forSale: r.forSale, price: r.salePrice })),
  );

  const liveTotal = useMemo(
    () =>
      state.reduce((sum, s) => (s.forSale ? sum + (s.price || 0) : sum), 0),
    [state],
  );
  const liveCount = useMemo(
    () => state.filter((s) => s.forSale).length,
    [state],
  );

  const setRow = (i: number, patch: Partial<{ forSale: boolean; price: number }>) =>
    setState((prev) =>
      prev.map((s, j) => (j === i ? { ...s, ...patch } : s)),
    );

  const itemsJson = JSON.stringify(
    rows.map((r) => ({ propertyId: r.propertyId, idx: r.idx })),
  );

  if (rows.length === 0) {
    return (
      <p className="text-sm opacity-50">
        販売対象になり得る3DGSデータがまだありません。物件エディタの「3DGSデータ」で
        ダウンロード用ファイルを追加すると、ここに並びます。
      </p>
    );
  }

  return (
    <form action={bulkUpdateSalePricesAction} className="space-y-4">
      <input type="hidden" name="items" value={itemsJson} />

      <div className="flex items-center gap-4 flex-wrap">
        <div className="mono text-[11px] tracking-[0.18em] uppercase opacity-60">
          販売中{" "}
          <span className="text-accent">{liveCount}</span> 件 ／ カタログ総額{" "}
          <span className="text-accent">{yen(liveTotal)}</span>
        </div>
        <button
          type="submit"
          className="ml-auto mono text-[11px] tracking-[0.18em] uppercase border border-accent text-accent px-4 py-2 hover:bg-accent hover:text-black transition"
        >
          一括保存
        </button>
      </div>

      <div className="border border-line overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="mono text-[10px] tracking-[0.2em] uppercase text-left opacity-40 border-b border-line">
              <th className="px-4 py-3 font-normal">物件 / データ</th>
              <th className="px-4 py-3 font-normal">規模</th>
              <th className="px-4 py-3 font-normal text-right">推奨価格</th>
              <th className="px-4 py-3 font-normal text-center">販売</th>
              <th className="px-4 py-3 font-normal text-right">販売価格 (税込)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/50">
            {rows.map((r, i) => {
              const s = state[i];
              return (
                <tr
                  key={`${r.propertyId}:${r.idx}`}
                  className={`transition ${s.forSale ? "" : "opacity-50"} hover:bg-[#1a1a1a]`}
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/properties/${r.propertyId}/edit`}
                      className="hover:text-accent transition"
                    >
                      {r.propertyTitle || r.propertyId}
                    </Link>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="mono text-[9px] tracking-[0.14em] uppercase border border-line px-1 py-0.5 opacity-50">
                        {r.label || `#${r.idx + 1}`}
                      </span>
                      {!r.hasDownload && (
                        <span
                          className="mono text-[9px] text-amber-400/80"
                          title="ダウンロード用ファイル未設定。購入されても配布物がありません。"
                        >
                          ⚠ DLファイル未設定
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="mono text-[10px] tracking-[0.14em] opacity-70">
                      {SIZE_LABEL[r.tokenCost]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setRow(i, { price: r.recommended, forSale: true })}
                      title="推奨価格を入力"
                      className="mono text-[11px] text-muted hover:text-accent underline decoration-dotted underline-offset-2 transition"
                    >
                      {yen(r.recommended)}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      name={`sale:${r.propertyId}:${r.idx}`}
                      checked={s.forSale}
                      onChange={(e) => setRow(i, { forSale: e.target.checked })}
                      className="w-4 h-4 accent-accent"
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <span className="opacity-40">¥</span>
                      <input
                        type="number"
                        name={`price:${r.propertyId}:${r.idx}`}
                        value={s.price || ""}
                        min={0}
                        step={1000}
                        disabled={!s.forSale}
                        onChange={(e) =>
                          setRow(i, { price: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })
                        }
                        placeholder="0"
                        className="w-28 bg-neutral-300 text-black border border-line px-2 py-1.5 text-right text-[13px] focus:outline-none focus:border-accent disabled:opacity-30 disabled:bg-bg disabled:text-ink"
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="mono text-[11px] tracking-[0.18em] uppercase border border-accent text-accent px-4 py-2 hover:bg-accent hover:text-black transition"
        >
          一括保存
        </button>
        <span className="text-[11px] text-muted">
          推奨価格はクリックで入力できます。価格は税込・円。
        </span>
      </div>
    </form>
  );
}
