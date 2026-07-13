"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { subscribeAction } from "@/lib/subscribe-actions";
import type { AccountPlan } from "@/lib/account-schema";
import { useT, useHref, useLocale } from "@/components/locale-provider";
import type { DictKey } from "@/lib/i18n/dictionaries";

type BillingMode = "monthly" | "annual";

export interface Plan {
  code: string;
  name: string;
  monthly: number;
  annualMonthly?: number;
  desc: DictKey;
  features: DictKey[];
  cta: string;
  href: string;
  accent: boolean;
  badge?: string;
}

const ANNUAL_DISCOUNT = 0.2;

export const PLANS: Plan[] = [
  {
    code: "FREE",
    name: "Free",
    monthly: 0,
    desc: "plan.free.desc",
    features: ["plan.free.f1", "plan.free.f2", "plan.free.f3", "plan.free.f4"],
    cta: "Sign up",
    href: "/sign-up",
    accent: false,
  },
  {
    code: "INDIVIDUAL",
    name: "Individual",
    monthly: 5200,
    annualMonthly: Math.round(5200 * (1 - ANNUAL_DISCOUNT)),
    desc: "plan.ind.desc",
    features: [
      "plan.ind.f1",
      "plan.ind.f2",
      "plan.ind.f3",
      "plan.ind.f4",
      "plan.ind.f5",
      "plan.ind.f6",
      "plan.ind.f7",
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
    desc: "plan.studio.desc",
    features: [
      "plan.studio.f1",
      "plan.studio.f2",
      "plan.studio.f3",
      "plan.studio.f4",
      "plan.studio.f5b",
      "plan.studio.f5",
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
    desc: "plan.team.desc",
    features: ["plan.team.f1", "plan.team.f2", "plan.team.f3", "plan.team.f4"],
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

export default function PlanCards({
  signedIn = false,
  currentPlan,
  currentRole,
}: {
  signedIn?: boolean;
  currentPlan?: string;
  currentRole?: string;
}) {
  const [mode, setMode] = useState<BillingMode>("monthly");
  const [pending, startTransition] = useTransition();
  const t = useT();
  const lh = useHref();
  const locale = useLocale();

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
            {t("plan.billing.monthly")}
          </button>
          <button
            type="button"
            onClick={() => setMode("annual")}
            className={`px-5 py-2 mono text-[11px] tracking-[0.24em] uppercase transition ${
              mode === "annual" ? "bg-accent text-bg" : "text-muted hover:text-ink"
            }`}
          >
            {t("plan.billing.annual")} <span className="ml-1 opacity-80">-20%</span>
          </button>
        </div>
      </div>

      {/* モバイルは2列で横並び比較（1列だと1画面1プランで比較しづらい実害） */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-5 md:gap-y-9 lg:gap-y-5">
        {PLANS.map((p) => {
          const price = priceFor(p, mode);
          const monthlyEquivalent = price > 0 ? price : 0;
          const annualTotal =
            mode === "annual" && p.annualMonthly ? p.annualMonthly * 12 : null;
          return (
            <div
              key={p.code}
              className={
                "relative border p-2.5 sm:p-6 flex flex-col gap-2.5 sm:gap-4 " +
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
                <div className="serif text-base sm:text-2xl mt-0.5 sm:mt-1">{p.name}</div>
              </div>

              <div className="border-y border-line py-2.5 sm:py-4 min-h-[76px] sm:min-h-[110px]">
                <div className="flex items-baseline gap-1">
                  <span className="serif text-xl sm:text-3xl">
                    {price === 0 ? "¥0" : `¥${price.toLocaleString("ja-JP")}`}
                  </span>
                  {price > 0 && (
                    <span className="mono text-[10px] tracking-[0.18em] opacity-50">
                      {locale === "en" ? "/mo" : "/月"}
                    </span>
                  )}
                </div>
                {annualTotal && (
                  <div className="mono text-[10px] text-muted mt-1">
                    {locale === "en"
                      ? `¥${annualTotal.toLocaleString("en-US")}/yr billed annually ·`
                      : `年 ¥${annualTotal.toLocaleString("ja-JP")} 一括 ·`}
                    <span className="text-accent ml-1">
                      {locale === "en" ? "−" : "月払比 -"}¥
                      {((p.monthly - monthlyEquivalent) * 12).toLocaleString(
                        locale === "en" ? "en-US" : "ja-JP",
                      )}
                      {locale === "en" ? " vs monthly" : ""}
                    </span>
                  </div>
                )}
                {price > 0 && mode === "monthly" && (
                  <div className="mono text-[10px] text-muted mt-1">
                    {locale === "en" ? "−20% with annual billing" : "年払いで -20%"}
                  </div>
                )}
                <p className="text-[10.5px] sm:text-[12px] text-muted mt-2 sm:mt-3 leading-[1.55] sm:leading-[1.65]">
                  {t(p.desc)}
                </p>
              </div>

              <ul className="text-[10.5px] sm:text-[12px] space-y-1 sm:space-y-1.5 leading-[1.5] sm:leading-[1.6] text-muted">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-1.5 sm:gap-2">
                    <span className="text-accent mt-0.5">▸</span>
                    <span>{t(f)}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-auto pt-3">
                {(() => {
                  const planKey = p.code.toLowerCase();
                  const isCurrent = signedIn && currentPlan === planKey;
                  const cls =
                    "block text-center w-full px-2 sm:px-4 py-2 sm:py-2.5 mono text-[9px] sm:text-[11px] tracking-[0.12em] sm:tracking-[0.22em] uppercase border transition " +
                    (p.accent
                      ? "border-accent text-accent hover:bg-accent hover:text-bg"
                      : "border-line hover:border-ink");

                  if (isCurrent) {
                    return (
                      <div className="block text-center w-full px-4 py-2.5 mono text-[11px] tracking-[0.22em] uppercase border border-green-400/50 text-green-400">
                        {t("plan.current")}
                      </div>
                    );
                  }
                  // Team の NDA/制限あり閲覧特典は role==="production" のアカウント
                  // にしか効かない（account-schema.ts）。他ロールに購入させても
                  // 課金だけ発生して特典を得られないため、ここで先に案内する。
                  if (planKey === "team" && signedIn && currentRole && currentRole !== "production" && currentRole !== "admin") {
                    return (
                      <Link
                        href={lh("/account/upgrade")}
                        className="block text-center text-[11px] text-muted leading-[1.6] border border-line px-3 py-2.5 hover:border-accent hover:text-accent transition"
                      >
                        {locale === "en"
                          ? "Production accounts only — apply →"
                          : "制作会社アカウント限定 — 申請する →"}
                      </Link>
                    );
                  }
                  if (signedIn) {
                    return (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          const msg =
                            p.monthly === 0
                              ? t("plan.confirmFree")
                              : locale === "en"
                                ? `Switch to the ${p.name} plan? (Billing is coming soon — changes apply instantly for now.)`
                                : `${p.name} プランに変更しますか？（決済は今後対応・現在は即時反映）`;
                          if (confirm(msg)) {
                            startTransition(() => subscribeAction(planKey as AccountPlan, mode));
                          }
                        }}
                        className={cls + " disabled:opacity-50"}
                      >
                        {pending
                          ? t("plan.processing")
                          : p.monthly === 0
                            ? t("plan.chooseFree")
                            : t("plan.choose")}
                      </button>
                    );
                  }
                  return (
                    <Link href={lh(p.href)} className={cls}>
                      {p.cta}
                    </Link>
                  );
                })()}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
