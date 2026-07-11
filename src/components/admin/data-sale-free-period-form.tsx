"use client";

import { useActionState } from "react";
import {
  saveDataSaleFreePeriodAction,
  type FreePeriodState,
} from "@/lib/settings-actions";
import {
  AFTER_FREE_PERIOD_ACTIONS,
  AFTER_FREE_PERIOD_LABEL,
  type DataSaleFreePeriod,
} from "@/lib/settings-schema";

const inputCls =
  "bg-neutral-300 text-black border border-line px-2.5 py-1.5 text-[13px] focus:outline-none focus:border-accent transition";

/** ISO → "YYYY-MM-DD" for a date input prefill (JST day). */
function toDateInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const jst = new Date(d.getTime() + 9 * 3600 * 1000);
  return jst.toISOString().slice(0, 10);
}

const STATUS_LABEL: Record<"off" | "pending" | "active" | "concluded", string> = {
  off: "無効",
  pending: "開始待ち",
  active: "実施中",
  concluded: "終了済み",
};

export default function DataSaleFreePeriodForm({
  freePeriod,
  status,
}: {
  freePeriod: DataSaleFreePeriod;
  status: "off" | "pending" | "active" | "concluded";
}) {
  const [state, formAction, pending] = useActionState<FreePeriodState, FormData>(
    saveDataSaleFreePeriodAction,
    undefined,
  );

  return (
    <div className="space-y-5">
      <div
        className={`border px-4 py-3 text-[13px] ${
          status === "active"
            ? "border-green-400/40 bg-green-400/10 text-green-300"
            : status === "concluded"
              ? "border-amber-400/40 bg-amber-400/10 text-amber-300"
              : "border-line bg-[#1c1c1c] text-muted"
        }`}
      >
        現在の状態: <strong>{STATUS_LABEL[status]}</strong>
        {status === "active" && (
          <span className="block mono text-[11px] opacity-80 mt-1">
            すべての3Dデータ購入が¥0（無料ダウンロード）になっています。
          </span>
        )}
        {status === "concluded" && (
          <span className="block mono text-[11px] opacity-80 mt-1">
            終了後の設定「{AFTER_FREE_PERIOD_LABEL[freePeriod.afterEnd]}」が適用されています。
          </span>
        )}
      </div>

      <form action={formAction} className="space-y-4 border border-line bg-[#1c1c1c] p-5">
        <label className="flex items-center gap-2.5 text-[14px]">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={freePeriod.enabled}
            className="w-4 h-4 accent-[#5ec8e8]"
          />
          3Dデータ販売の無料期間を有効にする
        </label>

        <div className="grid sm:grid-cols-2 gap-4">
          <label className="flex flex-col gap-1">
            <span className="mono text-[10px] tracking-[0.18em] uppercase opacity-60">
              開始日（任意・空＝即時）
            </span>
            <input
              name="startAt"
              type="date"
              defaultValue={toDateInput(freePeriod.startAt)}
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="mono text-[10px] tracking-[0.18em] uppercase opacity-60">
              終了日（任意・空＝無期限）
            </span>
            <input
              name="endAt"
              type="date"
              defaultValue={toDateInput(freePeriod.endAt)}
              className={inputCls}
            />
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className="mono text-[10px] tracking-[0.18em] uppercase opacity-60">
            終了日を過ぎたらどうする？
          </span>
          <select name="afterEnd" defaultValue={freePeriod.afterEnd} className={inputCls}>
            {AFTER_FREE_PERIOD_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {AFTER_FREE_PERIOD_LABEL[a]}
              </option>
            ))}
          </select>
          <span className="text-[11px] text-muted mt-0.5">
            終了日を設定していない場合はこの項目は使われません（無期限に無料のまま）。
          </span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="mono text-[10px] tracking-[0.18em] uppercase opacity-60">
            メモ（任意・キャンペーン名など）
          </span>
          <input
            name="note"
            type="text"
            maxLength={200}
            defaultValue={freePeriod.note}
            placeholder="例: ローンチ記念 3Dデータ無料配布"
            className={inputCls}
          />
        </label>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="mono text-[11px] tracking-[0.2em] uppercase border border-accent text-accent px-5 py-2 hover:bg-accent hover:text-bg transition disabled:opacity-50"
          >
            {pending ? "保存中…" : "保存"}
          </button>
          {state?.ok === true && (
            <span className="text-[12px] text-green-400">{state.message}</span>
          )}
          {state?.ok === false && (
            <span className="text-[12px] text-red-400">{state.error}</span>
          )}
        </div>

        <p className="text-[11px] text-muted leading-[1.8] pt-1">
          日付は日本時間 (JST) で解釈されます。この設定は「販売中」に設定された3Dデータの
          購入価格にのみ影響し、3DGSウォークスルー閲覧の無料期間（上のセクション）とは
          別に管理されます。過去のキャンペーン履歴は保持されません — ここは常に「今の設定」です。
        </p>
      </form>
    </div>
  );
}
