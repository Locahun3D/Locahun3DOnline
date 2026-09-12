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
        className="appearance-none bg-neutral-900 border border-amber-300/60 text-amber-100 text-[12px] rounded px-2 py-1 focus:outline-none focus:border-amber-200"
      >
        {PREVIEW_PLAN_OPTIONS.map((o) => (
          <option key={o.value} value={o.value} className="bg-neutral-900 text-amber-100">
            {o.label}
          </option>
        ))}
      </select>
      {plan !== "admin" && (
        <span className="text-[11px] opacity-80">
          表示のみ確認します。残高・購入履歴は再現せず、視聴・購入・送信は実行しません。
        </span>
      )}
      {freeAccessActive && plan !== "admin" && (
        <span className="text-[11px] opacity-80">
          ※ 限定無料期間の表示を適用中です。制限付き・NDA限定の条件は変わりません。
        </span>
      )}
    </span>
  );
}
