import Link from "next/link";
import {
  DATA_LICENSE_MATRIX,
  dataLicenseLabel,
  dataLicenseDesc,
  type DataLicense,
} from "@/lib/schemas";
import type { LicenseOption } from "@/lib/license-options";

/**
 * 購入画面で「どのライセンスだと何ができるのか」を出す。
 *
 * これまで違いは chip の title 属性（ツールチップ）にしか無く、ホバーできない
 * スマホでは一切読めなかった。買い手が違いを見ないまま選んでしまう状態だった
 * ため、選択中の説明を常時表示し、複数選べる時は可否表も出す。
 *
 * 表の内容は `/terms/data-download` の要約。詳細は必ず規約へ誘導する。
 */
/** 選択中ライセンスの説明。狭いテキスト列の中に置く。 */
export function LicenseDescription({
  selected,
  locale,
}: {
  selected: DataLicense;
  locale: string;
}) {
  return (
    <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
      {dataLicenseDesc(selected, locale)}
    </p>
  );
}

/**
 * 可否の比較表。**パネルの全幅**に置くこと。
 * 狭いテキスト列の中に入れると横スクロールが出て右端の列が切れる（実機で確認）。
 */
export default function LicenseDifference({
  options,
  selected,
  locale,
}: {
  options: LicenseOption[];
  selected: DataLicense;
  locale: string;
}) {
  if (options.length <= 1) return null;
  const en = locale === "en";
  const mark = (v: "yes" | "no" | "ask") =>
    v === "yes" ? "○" : v === "no" ? "×" : en ? "Ask" : "個別";
  const tone = (v: "yes" | "no" | "ask") =>
    v === "yes" ? "text-accent" : v === "no" ? "text-muted/50" : "text-amber-500";

  return (
    <div className="w-full basis-full mt-1">
      {(
        <details className="group">
          <summary className="cursor-pointer list-none mono text-[10px] tracking-[0.14em] uppercase text-accent/80 hover:text-accent">
            {en ? "▸ Compare licenses" : "▸ ライセンスの違いを見る"}
          </summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[380px] border-collapse text-[11px]">
              <thead>
                <tr>
                  <th className="border-b border-line py-1.5 pr-2 text-left font-normal text-muted">
                    {en ? "What you can do" : "できること"}
                  </th>
                  {options.map((o) => (
                    <th
                      key={o.license}
                      className={`border-b border-line px-2 py-1.5 text-center font-normal whitespace-nowrap ${
                        o.license === selected ? "text-accent" : "text-muted"
                      }`}
                    >
                      {dataLicenseLabel(o.license, locale)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DATA_LICENSE_MATRIX.map((row) => (
                  <tr key={row.key}>
                    <td className="border-b border-line/50 py-1.5 pr-2 leading-snug">
                      {en ? row.labelEn : row.labelJa}
                    </td>
                    {options.map((o) => {
                      const v = row.by[o.license];
                      return (
                        <td
                          key={o.license}
                          className={`border-b border-line/50 px-2 py-1.5 text-center ${tone(v)}`}
                        >
                          {mark(v)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1.5 text-[10px] text-muted">
            {en ? "Summary only — see the " : "上記は要約です。詳細は"}
            <Link
              href={en ? "/en/terms/data-download" : "/terms/data-download"}
              className="text-accent hover:underline"
            >
              {en ? "data purchase terms" : "データ購入規約"}
            </Link>
            {en ? " for the full text." : "をご確認ください。"}
          </p>
        </details>
      )}
    </div>
  );
}
