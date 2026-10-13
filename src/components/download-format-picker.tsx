"use client";

import { useState } from "react";

export type DownloadChoice = { format: string; sizeMb: number };

/**
 * 購入履歴で、ダウンロードするデータ形式を選ぶ（2026-10-13 本人指示「データ形式を選んでダウンロード」）。
 * 先頭は全部入りの ZIP（format 指定なし＝既定のファイル）。形式別は ?format= で1つずつ取る。
 * 形式が1つしか無い購入では選択欄を出さず、ボタンだけにする。
 */
export default function DownloadFormatPicker({
  purchaseId,
  bundle,
  files,
  en,
}: {
  purchaseId: string;
  /** 全部入り（既定のファイル）。無い購入では null。 */
  bundle: DownloadChoice | null;
  files: DownloadChoice[];
  en: boolean;
}) {
  const options = [
    // 全部入りは「All (ZIP)」で登録している（2026-10-13 本人「これ、Allで」）。その名前ならそのまま出し、
    // 古い名前（中身を並べたもの）のときだけ「全部入り」を頭に付けて区別する。
    ...(bundle
      ? [{ value: "", ...bundle, format: bundle.format.toLowerCase().startsWith("all") ? bundle.format : en ? `Everything — ${bundle.format}` : `全部入り — ${bundle.format}` }]
      : []),
    ...files.map((f) => ({ value: f.format, ...f })),
  ];
  const [value, setValue] = useState(options[0]?.value ?? "");
  if (options.length === 0) return null;
  const href = `/api/purchase/${purchaseId}/download${value ? `?format=${encodeURIComponent(value)}` : ""}`;
  const size = (mb: number) => (mb > 0 ? ` (${mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : `${mb} MB`})` : "");
  const button =
    "inline-flex items-center justify-center min-h-[44px] sm:min-h-0 mono text-[10px] tracking-[0.18em] uppercase border border-green-400/50 bg-green-400/10 text-green-400 px-3 py-1.5 hover:bg-green-400 hover:text-bg transition whitespace-nowrap";

  if (options.length === 1) {
    return (
      <a href={href} className={button}>
        {en ? "↓ Download" : "↓ ダウンロード"}
        {size(options[0].sizeMb)}
      </a>
    );
  }
  return (
    <div data-download-format className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
      <label className="flex items-center gap-2 min-w-0 flex-1 sm:flex-none">
        <span className="mono text-[9px] tracking-[0.18em] uppercase opacity-50 shrink-0">{en ? "Format" : "形式"}</span>
        <select
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="min-w-0 flex-1 sm:flex-none sm:max-w-[280px] min-h-[44px] sm:min-h-[32px] bg-bg border border-line px-2 text-[12px] text-ink focus:border-accent focus:outline-none"
        >
          {options.map((o) => (
            <option key={o.value || "__all"} value={o.value}>
              {o.format}
              {size(o.sizeMb)}
            </option>
          ))}
        </select>
      </label>
      <a href={href} className={button}>
        {en ? "↓ Download" : "↓ ダウンロード"}
      </a>
    </div>
  );
}
