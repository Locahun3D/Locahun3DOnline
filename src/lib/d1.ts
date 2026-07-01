/**
 * D1 (Cloudflare SQLite) access helpers.
 *
 * 本番の永続化を R2-JSON から D1 へ移すための共通層。各リポジトリは
 * `canAccessLocalFs()` の分岐で「dev = JSONファイル / deployed = D1」を選ぶ。
 *
 * ハイブリッド行モデル: 各テーブルは「クエリ/原子更新に使う実カラム + data(完全な
 * 検証済みJSON)」。ここでは data の入出力と実カラムの UPSERT を汎用化する。
 * テーブル名・カラム名は呼び出し側のコード定数(ユーザ入力ではない)なので識別子の
 * 文字列補間は安全。値は必ず bind でプレースホルダ経由に渡す。
 */
import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type D1 = any;

export async function getD1(): Promise<D1 | null> {
  try {
    const { env } = await getCloudflareContext();
    return (env as Record<string, unknown>).DB ?? null;
  } catch {
    return null;
  }
}

type ColVal = string | number | null;

/**
 * ハイブリッド行の UPSERT。`cols` は id(主キー)を含む「実カラム名→値」。
 * `data` は完全なレコードで JSON 文字列として `data` 列に保存する。
 */
export async function d1Upsert(
  db: D1,
  table: string,
  idCol: string,
  cols: Record<string, ColVal>,
  data: unknown,
): Promise<void> {
  const colNames = [...Object.keys(cols), "data"];
  const placeholders = colNames.map(() => "?").join(", ");
  const values = [...Object.values(cols), JSON.stringify(data)];
  const updateSet = colNames
    .filter((c) => c !== idCol)
    .map((c) => `${c}=excluded.${c}`)
    .join(", ");
  const sql =
    `INSERT INTO ${table} (${colNames.join(", ")}) VALUES (${placeholders}) ` +
    `ON CONFLICT(${idCol}) DO UPDATE SET ${updateSet}`;
  await db.prepare(sql).bind(...values).run();
}

/** 1行の data(JSON) を取得して parse する。無ければ null。 */
export async function d1GetData<T>(
  db: D1,
  table: string,
  idCol: string,
  id: string,
): Promise<T | null> {
  const row = await db
    .prepare(`SELECT data FROM ${table} WHERE ${idCol} = ?`)
    .bind(id)
    .first();
  if (!row) return null;
  try {
    return JSON.parse((row as { data: string }).data) as T;
  } catch {
    return null;
  }
}

/** 複数行の data(JSON) を取得。where を渡すと絞り込む。 */
export async function d1ListData<T>(
  db: D1,
  table: string,
  where?: { sql: string; binds: ColVal[] },
): Promise<T[]> {
  const sql = `SELECT data FROM ${table}` + (where ? ` WHERE ${where.sql}` : "");
  const stmt = where ? db.prepare(sql).bind(...where.binds) : db.prepare(sql);
  const res = await stmt.all();
  const rows = ((res?.results ?? []) as { data: string }[]) || [];
  const out: T[] = [];
  for (const r of rows) {
    try {
      out.push(JSON.parse(r.data) as T);
    } catch {
      /* skip corrupt row */
    }
  }
  return out;
}

export async function d1Delete(
  db: D1,
  table: string,
  idCol: string,
  id: string,
): Promise<void> {
  await db.prepare(`DELETE FROM ${table} WHERE ${idCol} = ?`).bind(id).run();
}

/** テーブルが空か(初回シード判定用)。 */
export async function d1IsEmpty(db: D1, table: string): Promise<boolean> {
  const row = await db.prepare(`SELECT 1 FROM ${table} LIMIT 1`).first();
  return !row;
}
