import Link from "next/link";
import { DATA_LICENSE_MATRIX, DATA_LICENSE_MATRIX_NOTE_JA, DATA_LICENSE_MATRIX_NOTE_EN, dataLicenseLabel } from "@/lib/schemas";
import type { LicenseOption } from "@/lib/license-options";
import styles from "./property-detail-view.module.css";
export default function PropertyLicenseDetails({options,en}:{options:LicenseOption[];en:boolean}) {
  return <div className={styles.licenseDetails}><h2>{en ? "Licenses and conditions" : "ライセンスの違い・注意事項"}</h2><div className={styles.tableScroll}><table><thead><tr><th>{en ? "Usage" : "用途・条件"}</th>{options.map(o=><th key={o.license}>{dataLicenseLabel(o.license,en?"en":"ja")}</th>)}</tr></thead><tbody>{DATA_LICENSE_MATRIX.map(row=><tr key={row.key}><th>{en?row.labelEn:row.labelJa}</th>{options.map(o=><td key={o.license}>{row.by[o.license]==="yes"?"○":row.by[o.license]==="no"?"×":en?"Ask":"個別"}</td>)}</tr>)}</tbody></table></div><p>{en?DATA_LICENSE_MATRIX_NOTE_EN:DATA_LICENSE_MATRIX_NOTE_JA}</p><Link href={en?"/en/terms/data-download":"/terms/data-download"}>{en?"See full data purchase terms →":"詳細はデータ購入規約をご確認ください →"}</Link></div>;
}
