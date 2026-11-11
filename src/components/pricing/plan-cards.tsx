"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { subscribeAction } from "@/lib/subscribe-actions";
import type { AccountPlan } from "@/lib/account-schema";
import { useT, useHref, useLocale } from "@/components/locale-provider";
import type { DictKey } from "@/lib/i18n/dictionaries";
import { VIEWING_IS_FREE } from "@/lib/view-pricing";
import { propertyTitleSegments } from "@/lib/property-presentation";

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
    desc: VIEWING_IS_FREE ? "plan.free.descFree" : "plan.free.desc",
    // 2026-10-16 本人「実体にあうように」: 実装と照合して書き直した。「問い合わせ 月 1 件まで」は削除（制限は無い）。
    // 図面・ブックマーク・再視聴無料は全プラン共通なので Free 側に置く（有料の特典のように見せない）。
    // 2026-11-11: 閲覧無料（VIEWING_IS_FREE）ではポイントの文言を出さず「見放題」を先頭に。
    features: VIEWING_IS_FREE
      ? ["plan.free.fView", "plan.free.f1", "plan.free.f2", "plan.free.f5", "plan.free.f6", "plan.free.f8"]
      : ["plan.free.f1", "plan.free.f2", "plan.free.f5", "plan.free.f6", "plan.free.f4", "plan.free.f8"],
    cta: "Sign up",
    href: "/sign-up",
    accent: false,
  },
  {
    code: "INDIVIDUAL",
    name: "Individual",
    monthly: 5200,
    annualMonthly: Math.round(5200 * (1 - ANNUAL_DISCOUNT)),
    desc: VIEWING_IS_FREE ? "plan.ind.descFree" : "plan.ind.desc",
    features: VIEWING_IS_FREE ? ["plan.ind.f8", "plan.ind.f5"] : ["plan.ind.f1", "plan.ind.f8", "plan.ind.f5"],
    cta: "Subscribe",
    href: "/sign-up?plan=individual",
    accent: false,
  },
  {
    code: "STUDIO",
    name: "Studio",
    monthly: 9800,
    annualMonthly: Math.round(9800 * (1 - ANNUAL_DISCOUNT)),
    desc: VIEWING_IS_FREE ? "plan.studio.descFree" : "plan.studio.desc",
    features: VIEWING_IS_FREE
      ? ["plan.studio.f1", "plan.studio.f3", "plan.studio.f4"]
      : ["plan.studio.f1", "plan.studio.f2", "plan.studio.f3", "plan.studio.f4"],
    cta: "Subscribe",
    href: "/sign-up?plan=studio",
    accent: !VIEWING_IS_FREE,
    badge: VIEWING_IS_FREE ? undefined : "RECOMMENDED",
  },
  {
    code: "TEAM",
    name: "Team",
    monthly: 29800,
    annualMonthly: Math.round(29800 * (1 - ANNUAL_DISCOUNT)),
    desc: VIEWING_IS_FREE ? "plan.team.descFree" : "plan.team.desc",
    // 閲覧無料では Team が主役（2026-11-11 本人方針「導入は簡単に、慣れたら使うツール」）。
    // Individual/Studio を畳むので「Studio の全機能」ではなく中身を直接並べる。
    features: VIEWING_IS_FREE
      ? ["plan.team.fTools", "plan.team.f5", "plan.studio.f4", "plan.team.f3", "plan.team.fNda"]
      : ["plan.team.f1", "plan.team.f2", "plan.team.f5", "plan.team.f3"],
    cta: "Subscribe",
    href: "/sign-up?plan=team",
    accent: VIEWING_IS_FREE,
    badge: VIEWING_IS_FREE ? "FOR PRODUCTIONS" : undefined,
  },
];

/**
 * カードの日本語を語の途中で折らない（CLAUDE.md: iPhone Safari は auto-phrase 非対応）。
 * TitleText と同じ Intl.Segmenter だが、Segmenter が「レ|イヤー」のようにカタカナ語を割ることがあるので、
 * 連続するカタカナの断片はつなげてから inline-block にする。
 */
const KATAKANA = /^[ァ-ヺー]+$/; // 中黒（・ U+30FB）は区切りなので含めない
function CardText({ text }: { text: string }) {
  const merged: string[] = [];
  for (const part of propertyTitleSegments(text)) {
    const last = merged[merged.length - 1];
    // 「カメラ|ワーク・」のように後ろに中黒が付いた断片もつなぐ（語の切れ目は中黒の後ろだけにする）。
    if (last && KATAKANA.test(last) && KATAKANA.test(part.replace(/・$/, ""))) merged[merged.length - 1] = last + part;
    else merged.push(part);
  }
  return (
    <>
      {merged.map((part, i) =>
        /^\s+$/.test(part) ? (
          <span key={i}> </span>
        ) : (
          <span key={i} className="inline-block max-w-full align-baseline [overflow-wrap:anywhere]">{part}</span>
        ),
      )}
    </>
  );
}

// 2026-11-11 本人「5000円はあってもいいのでは」: Individual（月¥5,200）を畳みから出して Free と Team の間に置く。Studio は畳んだまま。
const PRIMARY_CODES = ["FREE", "INDIVIDUAL", "TEAM"];
const SECONDARY_CODES = ["STUDIO"];

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
            className={`px-5 py-2 max-[720px]:min-h-[44px] max-[720px]:inline-flex max-[720px]:items-center mono text-[11px] tracking-[0.24em] uppercase transition ${
              mode === "monthly" ? "bg-accent text-bg" : "text-muted hover:text-ink"
            }`}
          >
            {t("plan.billing.monthly")}
          </button>
          <button
            type="button"
            onClick={() => setMode("annual")}
            className={`px-5 py-2 max-[720px]:min-h-[44px] max-[720px]:inline-flex max-[720px]:items-center mono text-[11px] tracking-[0.24em] uppercase transition ${
              mode === "annual" ? "bg-accent text-bg" : "text-muted hover:text-ink"
            }`}
          >
            {t("plan.billing.annual")} <span className="ml-1 opacity-80">-20%</span>
          </button>
        </div>
      </div>

      {/* モバイルは2列で横並び比較（1列だと1画面1プランで比較しづらい実害）。
          閲覧無料のときは Free・Individual・Team の3枚を主役にし（スマホは Team を2列ぶち抜き）、Studio は下に畳む（2026-11-11）。 */}
      {(VIEWING_IS_FREE ? [PRIMARY_CODES, SECONDARY_CODES] : [PLANS.map((p) => p.code)]).map((codes, group) => {
        const grid = (
      <div className={!VIEWING_IS_FREE ? "grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-5 md:gap-y-9 lg:gap-y-5" : group === 0 ? "grid grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-5 md:gap-y-9 lg:gap-y-5 max-w-[1200px] mx-auto" : "grid grid-cols-1 gap-2 sm:gap-5 max-w-[430px] mx-auto"}>
        {PLANS.filter((p) => codes.includes(p.code)).map((p) => {
          const price = priceFor(p, mode);
          const monthlyEquivalent = price > 0 ? price : 0;
          const annualTotal =
            mode === "annual" && p.annualMonthly ? p.annualMonthly * 12 : null;
          return (
            <div
              key={p.code}
              className={
                // ⚠ スマホ(<720px)は p-4(16px) 以上。以前は p-2.5(10px) だったが
                //    html zoom 0.7 のときの実効 7px を前提にした値で、zoom 1.0 では
                //    カード内が窮屈すぎた（2026-08-27 計測 minPad=10px）。
                "relative border p-2.5 max-[720px]:p-4 sm:p-6 flex flex-col gap-2.5 sm:gap-4 " +
                (VIEWING_IS_FREE && group === 0 && p.code === "TEAM" ? "max-lg:col-span-2 " : "") +
                (p.accent
                  ? "border-accent bg-[#0e1a20]"
                  : "border-line bg-[#222]")
              }
            >
              {p.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap bg-accent text-bg mono text-[9px] tracking-[0.12em] sm:tracking-[0.28em] uppercase px-2 sm:px-3 py-1">
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
                <div className="serif ui-card-title mt-1">{p.name}</div>
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
                {/* ⚠ スマホは 12px / 行間 1.6 を下回らせない（10.5px×zoom0.7＝7.35px
                    だった名残。zoom 1.0 では 10.5px がそのまま出て読めない）。 */}
                <p className="text-[10.5px] max-[720px]:text-[12px] sm:text-[12px] text-muted mt-2 sm:mt-3 leading-[1.55] max-[720px]:leading-[1.65] sm:leading-[1.65]">
                  {/* 句点ごとに改行（CLAUDE.md 日本語タイポルール）。EN は自然折り返し。 */}
                  {locale === "en"
                    ? t(p.desc)
                    : t(p.desc).split(/(?<=。)/).filter(Boolean).map((s, i) => <span key={i}>{i > 0 && <br />}<CardText text={s} /></span>)}
                </p>
              </div>

              <ul className="text-[10.5px] max-[720px]:text-[12px] sm:text-[12px] space-y-1 max-[720px]:space-y-1.5 sm:space-y-1.5 leading-[1.5] max-[720px]:leading-[1.6] sm:leading-[1.6] text-muted">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-1.5 sm:gap-2">
                    <span className="text-accent mt-0.5">▸</span>
                    <span>{locale === "en" ? t(f) : <CardText text={t(f)} />}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-auto pt-3">
                {(() => {
                  const planKey = p.code.toLowerCase();
                  const isCurrent = signedIn && currentPlan === planKey;
                  const cls =
                    // ⚠ 主要CTA。スマホは実寸 44px の高さを必ず確保する。
                    "block text-center w-full px-2 sm:px-4 py-2 sm:py-2.5 mono text-[9px] max-[720px]:text-[11px] sm:text-[11px] tracking-[0.12em] max-[720px]:tracking-[0.1em] sm:tracking-[0.22em] uppercase border transition " +
                    "max-[720px]:flex max-[720px]:items-center max-[720px]:justify-center max-[720px]:min-h-[44px] " +
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
                        className="block text-center text-[11px] text-muted leading-[1.6] border border-line px-3 py-2.5 max-[720px]:min-h-[44px] max-[720px]:flex max-[720px]:items-center max-[720px]:justify-center hover:border-accent hover:text-accent transition"
                      >
                        {locale === "en"
                          ? "Production accounts only — apply →"
                          : "制作会社アカウント限定 — 申請する →"}
                      </Link>
                    );
                  }
                  // 撮影スタジオは自分の物件管理専用アカウント。閲覧サブスクは
                  // 対象外（サーバー側は subscribeAction が studio_not_allowed で弾く。
                  // ここではボタンを押させる前に説明を出す、2026-08-01）。
                  if (signedIn && currentRole === "studio") {
                    return (
                      <p className="text-[11px] text-muted leading-[1.6] border border-line px-3 py-2.5">
                        {locale === "en"
                          ? "Not available for studio accounts"
                          : "撮影スタジオアカウントは対象外です"}
                      </p>
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
        );
        if (group === 0) return <div key="primary">{grid}</div>;
        return (
          <details key="others" data-plan-others className="mt-8 max-w-[880px] mx-auto">
            <summary className="cursor-pointer min-h-[44px] flex items-center justify-center text-center text-[13px] text-muted underline hover:text-accent">
              {t("plan.others")}
            </summary>
            <div className="mt-6">{grid}</div>
          </details>
        );
      })}
    </>
  );
}
