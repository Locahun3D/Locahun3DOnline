"use client";

import { useRouter } from "next/navigation";
import {
  PREVIEW_PLAN_OPTIONS,
  type PreviewPlan,
} from "./plan-preview-options";

/**
 * 管理プレビューの「プラン別の見え方」シミュレーター。
 * 選ぶと ?plan=… を付けて再読み込みし、サーバー側でそのプランの
 * 閲覧フラグ（サブスク有無 / 制限あり / NDA限定）を再現して描画する。
 */

export default function PlanPreviewSwitcher({
  plan,
  freeAccessActive,
}: {
  plan: PreviewPlan;
  freeAccessActive: boolean;
}) {
  const router = useRouter();

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <label
        htmlFor="plan-preview"
        className="mono text-[10px] tracking-[0.18em] uppercase opacity-80"
      >
        表示シミュレーション:
      </label>
      <select
        id="plan-preview"
        value={plan}
        onChange={(e) => {
          const v = e.target.value;
          router.replace(v === "admin" ? "?" : `?plan=${v}`, { scroll: false });
        }}
        className="bg-black/40 border border-amber-300/60 text-amber-100 text-[12px] rounded px-2 py-1 focus:outline-none focus:border-amber-200"
      >
        {PREVIEW_PLAN_OPTIONS.map((o) => (
          <option key={o.value} value={o.value} className="bg-neutral-900">
            {o.label}
          </option>
        ))}
      </select>
      {freeAccessActive && plan !== "admin" && (
        <span className="text-[11px] opacity-80">
          ※ 現在「限定無料期間」開催中のため、全プランで 3DGS が視聴可能な状態です
        </span>
      )}
    </span>
  );
}
