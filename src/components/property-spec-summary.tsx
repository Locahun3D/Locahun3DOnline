import type { Property } from "@/lib/schemas";
import { propertySpecGroups } from "@/lib/property-spec-groups";
import styles from "./property-spec-summary.module.css";
import Jp from "./jp";
export default function PropertySpecSummary({ property, en }: { property: Property; en: boolean }) {
 const groups = propertySpecGroups(property, en);
 return <section className={styles.section}>
  <h2 className="ui-section-title text-ink mb-5">{en ? "Property information & specifications" : "物件情報・スペック"}</h2>
  {groups.length ? <div className={styles.grid}>
   {groups.map(group => <section key={group.key} className={styles.card} data-property-spec-group={group.key}>
    <h3 className={styles.heading}>{group.label}</h3>
    <dl className={styles.fields}>{group.items.map(item => <div key={item.key} data-property-spec={item.key} className={styles.field}>
     <dt className={styles.label}>{item.label}</dt>
     <dd className={styles.value}>{en ? item.value : <Jp>{item.value}</Jp>}</dd>
    </div>)}</dl>
   </section>)}
  </div> : <p className={styles.empty}>{en ? "Property information is not registered." : "物件情報は未登録です。"}</p>}
 </section>;
}
