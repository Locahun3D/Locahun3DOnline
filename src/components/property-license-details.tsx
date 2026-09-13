import Link from "next/link";
import { DATA_LICENSE_MATRIX, DATA_LICENSE_MATRIX_NOTE_JA, DATA_LICENSE_MATRIX_NOTE_EN, dataLicenseLabel } from "@/lib/schemas";
import type { LicenseOption } from "@/lib/license-options";
import styles from "./property-detail-view.module.css";
import Jp from "./jp";
export default function PropertyLicenseDetails({options,en}:{options:LicenseOption[];en:boolean}) {
  return <div className={styles.licenseDetails}><h2>{en ? "Licenses and conditions" : "ライセンスの違い・注意事項"}</h2><div className={styles.tableScroll}><table><thead><tr><th>{en ? "Usage" : "用途・条件"}</th>{options.map(o=><th key={o.license}>{!en && (o.license === "standard" || o.license === "extended") ? <><span style={{whiteSpace:"nowrap"}}>{o.license === "standard" ? "標準" : "拡張"}</span><wbr /><span style={{whiteSpace:"nowrap"}}>ライセンス</span></> : dataLicenseLabel(o.license,en?"en":"ja")}</th>)}</tr></thead><tbody>{DATA_LICENSE_MATRIX.map(row=><tr key={row.key}><th>{en?row.labelEn:<Jp>{row.labelJa}</Jp>}</th>{options.map(o=><td key={o.license}>{row.by[o.license]==="yes"?"○":row.by[o.license]==="no"?"×":en?"Ask":"個別"}</td>)}</tr>)}</tbody></table></div><p>{en?DATA_LICENSE_MATRIX_NOTE_EN:<Jp>{DATA_LICENSE_MATRIX_NOTE_JA}</Jp>}</p><Link href={en?"/en/terms/data-download":"/terms/data-download"}>{en?"See full data purchase terms →":"詳細はデータ購入規約をご確認ください →"}</Link></div>;
}
