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

/**
 * D1 の Read Replication は既定で有効な場合、書き込み直後の読み取りが
 * レプリカのラグにより古い状態を返すことがある（管理画面で削除/更新した直後は
 * 正しく見えるのに、ページを再読み込みすると元に戻って見えるバグの原因）。
 * Sessions API の "first-primary" 制約で、このリクエスト内の最初のクエリを
 * 必ずプライマリへ送り、以降はブックマークで一貫性を保つ = read-your-writes を
 * 保証する。https://developers.cloudflare.com/d1/best-practices/read-replication/
 * withSession が使えない環境（型不一致等）では素の binding にフォールバックする。
 */
export async function getD1(): Promise<D1 | null> {
  try {
    const { env } = await getCloudflareContext();
    const db = (env as Record<string, unknown>).DB as D1 | undefined;
    if (!db) return null;
    if (typeof db.withSession === "function") {
      return db.withSession("first-primary");
    }
    return db;
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

/**
 * 旧R2ストアからの初回シードを「テーブルごとに永久に1回だけ」実行する。
 *
 * ⚠️ 以前は「テーブルが空なら再シード」という判定だったため、管理画面で
 * 全レコードを削除するとテーブルが空になり、別 Worker インスタンスの次回
 * 読み取り時に旧R2ストアから全件が復活する不具合があった
 * (「削除しても後でよみがえる」)。
 *
 * ここでは `_seed_state` という番兵テーブルに「シード済み」の記録を残し、
 * 一度シードした後はテーブルが空になっても二度と再シードしない。
 *
 * 移行安全性: 既存本番はすでにシード済み(データあり)だが番兵記録は無い。
 * その場合 seedFn は実行せず番兵だけを書き込む → 既存データはそのまま、
 * 以後の全削除でも復活しない。真に空 かつ 番兵無し のときだけ seedFn を走らせる。
 */
export async function d1SeedOnce(
  db: D1,
  table: string,
  seedFn: () => Promise<void>,
): Promise<void> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS _seed_state (table_name TEXT PRIMARY KEY, seeded_at TEXT)`,
    )
    .run();
  const mark = await db
    .prepare(`SELECT 1 FROM _seed_state WHERE table_name = ?`)
    .bind(table)
    .first();
  if (mark) return; // 過去に一度シード済み → 二度と再シードしない
  // 番兵が無い初回のみ: 本当に空のときだけ実データをシードする
  if (await d1IsEmpty(db, table)) {
    await seedFn();
  }
  // 既存データがあった場合も含め、以後シード済みとして記録する
  await db
    .prepare(
      `INSERT INTO _seed_state (table_name, seeded_at) VALUES (?, ?) ` +
        `ON CONFLICT(table_name) DO NOTHING`,
    )
    .bind(table, new Date().toISOString())
    .run();
}
