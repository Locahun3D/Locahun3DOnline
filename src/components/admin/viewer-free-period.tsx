"use client";

import { useState, useTransition } from "react";
import { setViewerFreePeriodAction } from "@/lib/admin-actions";
import { isFreePeriodActive, type FreePeriod } from "@/lib/settings-schema";

/**
 * サイト全体の3DGS閲覧を期間限定で無料にする設定（2026-09-21 本人指示）。
 *
 * 期間中は、プラン・残高に関わらず全ページの3DGSを誰でも見られる。
 * 3Dデータの販売は対象外（販売の無料化は、物件エディターのデータごとの設定）。
 * 日時は日本時間で入力する。終了を空にすると、止めるまで続く。
 */
const toLocalInput = (iso: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // 日本時間の「年月日 時分」に直して <input type="datetime-local"> へ入れる。
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 16);
};

const fmt = (iso: string | null): string =>
  iso
    ? new Date(iso).toLocaleString("ja-JP", { hour12: false, dateStyle: "short", timeStyle: "short" })
    : "指定なし";

export default function ViewerFreePeriod({ initial }: { initial: FreePeriod }) {
  const [saved, setSaved] = useState<FreePeriod>(initial);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [startAt, setStartAt] = useState(toLocalInput(initial.startAt));
  const [endAt, setEndAt] = useState(toLocalInput(initial.endAt));
  const [note, setNote] = useState(initial.note);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const active = isFreePeriodActive(saved, new Date().toISOString());
  const field = "min-h-[40px] border border-line bg-bg px-3 text-[13px]";

  const submit = () =>
    start(async () => {
      setMessage("");
      setError("");
      const result = await setViewerFreePeriodAction({ enabled, startAt, endAt, note });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(result.freePeriod);
      setMessage("保存しました。公開ページへの反映は最大60秒かかります。");
    });

  return (
    <section className="border border-line p-4 space-y-3" data-viewer-free-period={active ? "active" : "off"}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-[13px] font-bold">全ページの3DGS閲覧を無料にする</h2>
        <span
          className={`px-2 py-0.5 border text-[11px] font-bold ${
            active ? "border-[#0f7a4a] bg-[#e3f6ea] text-[#0b6b3a]" : "border-line text-muted"
          }`}
        >
          {active ? "無料期間中" : saved.enabled ? "設定あり（期間外）" : "停止中"}
        </span>
        <span className="text-[11px] text-muted">
          現在の設定: {saved.enabled ? `${fmt(saved.startAt)} 〜 ${fmt(saved.endAt)}` : "無効"}
        </span>
      </header>
      <p className="text-[12px] text-muted leading-[1.8]">
        期間中は、プラン・残高に関わらず、誰でも全ページの3DGSを見られます。
        <br />
        3Dデータの販売は無料になりません（販売の無料化は、物件ごとのデータの設定です）。
        <br />
        日時は日本時間です。終了を空にすると、止めるまで続きます。
      </p>
      <label className="flex items-center gap-2 text-[13px]">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="w-4 h-4 accent-[#5ec8e8]"
        />
        無料期間を有効にする
      </label>
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-[12px] text-muted">
          開始（空＝すぐ）
          <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-muted">
          終了（空＝止めるまで）
          <input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-muted flex-1 basis-[240px]">
          メモ（社内用）
          <input
            type="text"
            value={note}
            maxLength={200}
            onChange={(e) => setNote(e.target.value)}
            placeholder="例: 展示会に合わせた開放"
            className={field}
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={submit}
          className="min-h-[40px] px-4 text-[13px] border border-accent/50 text-accent hover:bg-accent hover:text-bg transition disabled:opacity-40"
        >
          {pending ? "保存中…" : "保存する"}
        </button>
        {message && <span className="text-[12px] text-[#0b6b3a]">{message}</span>}
        {error && <span className="text-[12px] text-red-600">{error}</span>}
      </div>
    </section>
  );
}
