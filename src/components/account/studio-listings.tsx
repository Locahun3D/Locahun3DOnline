import Link from "next/link";
import type { Property } from "@/lib/schemas";

/**
 * マイページに出す掲載者(スタジオ)向けセクション。
 *
 * 掲載ページを作る権限とエディタは既にあったが、そこへ辿り着く導線が
 * どこにも無く、URL を直接教えない限り使えない状態だった（2026-07-22 発覚）。
 * ここが唯一の入口になる。
 *
 * 運用の流れ（そのまま画面に出す）:
 *   1. 情報を入力  … 掲載者が自分で。3DGS 欄は編集不可
 *   2. 撮影を依頼  … 入力が済んだら「公開を申請」
 *   3. 撮影・データ投入 … 当社が現地撮影して 3DGS を差し込む
 *   4. 公開       … 当社が内容を確認して公開
 */
export default function StudioListings({
  properties,
  locale,
}: {
  properties: Property[];
  locale: string;
}) {
  const en = locale === "en";

  const step = (p: Property) => {
    if (p.status === "published") return { label: en ? "Published" : "公開中", tone: "ok" as const };
    if (p.splatUrl) return { label: en ? "Ready for review" : "公開審査待ち", tone: "wait" as const };
    if (p.publishRequestedAt) return { label: en ? "Scan requested" : "撮影依頼済み", tone: "wait" as const };
    return { label: en ? "Drafting" : "入力中", tone: "draft" as const };
  };

  const tones: Record<string, string> = {
    ok: "border-accent/40 text-accent",
    wait: "border-amber-400/50 text-amber-500",
    draft: "border-line text-muted",
  };

  /** 上の4ステップ「1.情報を入力〜4.公開」のうち、今どこにいるかの番号(1〜4)。
      下の一覧バッジ(step関数)と同じ判定基準。 */
  const stepIndex = (p: Property): 1 | 2 | 3 | 4 => {
    if (p.status === "published") return 4;
    if (p.splatUrl) return 3;
    if (p.publishRequestedAt) return 2;
    return 1;
  };
  // 4つの箱が全部同じ見た目で「今どこにいるか分からない」という指摘（2026-08-01）。
  // 手持ちの物件がどのステップにいるかを箱に反映する（複数物件あれば複数点灯）。
  const activeSteps = new Set(properties.map(stepIndex));

  return (
    <section className="mt-6 border border-line bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="mono text-[11px] tracking-[0.22em] uppercase text-muted">
          {en ? "Your listings" : "掲載管理"}
        </h2>
        <Link
          href="/admin/properties"
          className="text-[12px] text-accent hover:underline whitespace-nowrap"
        >
          {en ? "Open the editor →" : "掲載ページを作る・編集する →"}
        </Link>
      </div>

      {/* 手順を常時表示する。撮影は当社が行うので、掲載者が「入力したのに
          公開されない」と迷わないよう、誰が何をするかを明示する。 */}
      <ol className="mt-4 grid gap-2 sm:grid-cols-4">
        {(en
          ? ["1. Fill in the details", "2. Request a scan", "3. We scan on site", "4. We publish"]
          : ["1. 情報を入力", "2. 撮影を依頼", "3. 当社が現地撮影", "4. 当社が確認して公開"]
        ).map((s, i) => {
          const active = activeSteps.has((i + 1) as 1 | 2 | 3 | 4);
          return (
            <li
              key={s}
              className={`border px-3 py-2 text-[12px] leading-snug transition ${
                active
                  ? "border-accent text-accent bg-accent/[0.06] font-bold"
                  : "border-line text-muted"
              }`}
            >
              {s}
            </li>
          );
        })}
      </ol>

      {properties.length === 0 ? (
        <p className="mt-4 text-[13px] text-muted">
          {en
            ? "No listings yet. Create one and fill in what you know — you can save and come back."
            : "まだ掲載ページがありません。分かる範囲で入力して保存し、後から続きを書けます。"}
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-line border-t border-line">
          {properties.map((p) => {
            const s = step(p);
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
                <Link
                  href={`/admin/properties/${p.id}/edit`}
                  className="flex-1 min-w-0 truncate text-[14px] hover:text-accent transition"
                >
                  {p.title || (en ? "(untitled)" : "（無題）")}
                </Link>
                <span
                  className={`mono text-[10px] tracking-[0.14em] uppercase border px-1.5 py-0.5 whitespace-nowrap ${tones[s.tone]}`}
                >
                  {s.label}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
