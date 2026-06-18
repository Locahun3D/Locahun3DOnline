"use client";

import { useState } from "react";
import Link from "next/link";

type BillingMode = "monthly" | "annual";

interface Plan {
  code: string;
  name: string;
  monthly: number;
  annualMonthly?: number;
  desc: string;
  features: string[];
  cta: string;
  href: string;
  accent: boolean;
  badge?: string;
  note?: string;
}

const ANNUAL_DISCOUNT = 0.15;

const PLANS: Plan[] = [
  {
    code: "FREE",
    name: "Free",
    monthly: 0,
    desc: "登録だけで OK。アカウント作成時 1 トークン付与でハウススタジオを試せる。",
    features: [
      "全物件のサムネイル・写真閲覧",
      "地図・フィルタ・距離検索",
      "見積もり依頼 月 1 件まで",
      "3DGS ウォークスルー 登録時 1 トークン (一度限り)",
    ],
    cta: "Sign up",
    href: "/sign-up",
    accent: false,
  },
  {
    code: "INDIVIDUAL",
    name: "Individual",
    monthly: 5200,
    annualMonthly: Math.round(5200 * (1 - ANNUAL_DISCOUNT)),
    desc: "個人クリエイター向け。月 8 トークンで案件 2-3 件分のロケハンに。",
    features: [
      "3DGS ウォークスルー 月 8 トークン",
      "ハウス 1 / 中規模 2 / ドーム 3 トークン消費",
      "図面ダウンロード 無制限",
      "履歴・ブックマーク 永続保存",
      "ログイン端末制限なし",
      "見積もり依頼 無制限",
    ],
    cta: "Subscribe",
    href: "/sign-up?plan=individual",
    accent: false,
  },
  {
    code: "STUDIO",
    name: "Studio",
    monthly: 9800,
    annualMonthly: Math.round(9800 * (1 - ANNUAL_DISCOUNT)),
    desc: "小規模制作チーム向け。月 12 トークン + 5 端末共有。単発撮影でも余裕。",
    features: [
      "Individual の全機能",
      "3DGS ウォークスルー 月 12 トークン",
      "5 端末まで同時ログイン",
      "チーム履歴の共有",
    ],
    cta: "Subscribe",
    href: "/sign-up?plan=studio",
    accent: true,
    badge: "RECOMMENDED",
  },
  {
    code: "TEAM",
    name: "Team",
    monthly: 29800,
    annualMonthly: Math.round(29800 * (1 - ANNUAL_DISCOUNT)),
    desc: "プロダクション向け。月 30 トークン + 20 端末 + 請求書対応。",
    features: [
      "Studio の全機能",
      "3DGS ウォークスルー 月 30 トークン",
      "20 端末まで同時ログイン",
      "請求書一括 (電子帳簿対応)",
    ],
    cta: "Subscribe",
    href: "/sign-up?plan=team",
    accent: false,
  },
];

function priceFor(plan: Plan, mode: BillingMode): number {
  if (plan.monthly === 0) return 0;
  if (mode === "annual" && plan.annualMonthly) return plan.annualMonthly;
  return plan.monthly;
}

export default function PlanCards() {
  const [mode, setMode] = useState<BillingMode>("monthly");

  return (
    <>
      {/* Billing mode toggle */}
      <div className="flex justify-center mb-10">
        <div className="inline-flex border border-line bg-[#222] p-1">
          <button
            type="button"
            onClick={() => setMode("monthly")}
            className={`px-5 py-2 mono text-[11px] tracking-[0.24em] uppercase transition ${
              mode === "monthly" ? "bg-accent text-bg" : "text-muted hover:text-ink"
            }`}
          >
            月払い
          </button>
          <button
            type="button"
            onClick={() => setMode("annual")}
            className={`px-5 py-2 mono text-[11px] tracking-[0.24em] uppercase transition ${
              mode === "annual" ? "bg-accent text-bg" : "text-muted hover:text-ink"
            }`}
          >
            年払い <span className="ml-1 opacity-80">-15%</span>
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
        {PLANS.map((p) => {
          const price = priceFor(p, mode);
          const monthlyEquivalent = price > 0 ? price : 0;
          const annualTotal =
            mode === "annual" && p.annualMonthly ? p.annualMonthly * 12 : null;
          return (
            <div
              key={p.code}
              className={
                "relative border p-6 flex flex-col gap-4 " +
                (p.accent
                  ? "border-accent bg-[#0e1a20]"
                  : "border-line bg-[#222]")
              }
            >
              {p.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-bg mono text-[9px] tracking-[0.28em] uppercase px-3 py-1">
                  {p.badge}
                </div>
              )}

              <div>
                <div
                  className={
                    "mono text-[10px] tracking-[0.32em] uppercase " +
                    (p.accent ? "text-accent" : "opacity-50")
                  }
                >
                  {p.code}
                </div>
                <div className="serif text-2xl mt-1">{p.name}</div>
              </div>

              <div className="border-y border-line py-4 min-h-[110px]">
                <div className="flex items-baseline gap-1">
                  <span className="serif text-3xl">
                    {price === 0 ? "¥0" : `¥${price.toLocaleString("ja-JP")}`}
                  </span>
                  {price > 0 && (
                    <span className="mono text-[10px] tracking-[0.18em] opacity-50">
                      /月
                    </span>
                  )}
                </div>
                {annualTotal && (
                  <div className="mono text-[10px] text-muted mt-1">
                    年 ¥{annualTotal.toLocaleString("ja-JP")} 一括 ·
                    <span className="text-accent ml-1">
                      月払比 -¥{((p.monthly - monthlyEquivalent) * 12).toLocaleString("ja-JP")}
                    </span>
                  </div>
                )}
                {price > 0 && mode === "monthly" && (
                  <div className="mono text-[10px] text-muted mt-1">
                    年払いで -15%
                  </div>
                )}
                <p className="text-[12px] text-muted mt-3 leading-[1.65]">
                  {p.desc}
                </p>
              </div>

              <ul className="text-[12px] space-y-1.5 leading-[1.6] text-muted">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span className="text-accent mt-0.5">▸</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              {p.note && (
                <p className="text-[10px] text-muted leading-[1.55] border-t border-line pt-3">
                  {p.note}
                </p>
              )}

              <div className="mt-auto pt-3">
                <Link
                  href={p.href}
                  className={
                    "block text-center w-full px-4 py-2.5 mono text-[11px] tracking-[0.22em] uppercase border transition " +
                    (p.accent
                      ? "border-accent text-accent hover:bg-accent hover:text-bg"
                      : "border-line hover:border-ink")
                  }
                >
                  {p.cta}
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
