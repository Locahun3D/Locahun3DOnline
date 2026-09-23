import { propertySchema, type Property } from "./schemas";
import { missingEnglishFields } from "./property-english";
import { fillPropertyEnglishUsing } from "./property-translate-core";
import { translatePropertyWithFallback, type WorkersAi } from "./ai-translate-core";

/**
 * 英語が欠けた物件を見つけて英訳する処理の本体（2026-09-23 本人ルール「追加時点で翻訳されてほしい」
 * 「3DGSが追加された段階でも英語翻訳チェックしてほしい」）。
 *
 * Worker の定期実行（custom-worker.ts の scheduled、10分ごと）から**直接**呼ぶ。
 * ⚠ 最初はサイトの API（/api/internal/english-fill）を Worker の中から fetch していたが、
 *   自分自身の独自ドメインへの接続になり Cloudflare が 522 で拒否した（本番のログで確認）。
 *   そのため Next の外でも動く部品（*-core.ts・schemas・property-english）だけで組む。
 *   "server-only" や getCloudflareContext を持つモジュールをここで import しないこと
 *   （Next の外で読み込むと Worker ごと起動しなくなる）。
 *
 * 安全策:
 *  - 直近 QUIET_MS に更新された物件は触らない（編集画面を開いている人の保存と衝突させない）。
 *  - 書くのは英語欄だけ。読んだ時点の updated_at と data が一致するときだけ書く（条件付き更新）。更新日時は変えない。
 *  - 1回に訳すのは MAX_PER_RUN 件まで（時間と費用の上限）。
 */
export const MAX_PER_RUN = 3;
export const QUIET_MS = 5 * 60 * 1000;

type Row = { id: string; status: string; updated_at: string; data: string };
type Stmt = { bind(...v: unknown[]): Stmt; all(): Promise<{ results?: unknown[] }>; run(): Promise<{ meta?: { changes?: number } }> };
export type EnglishFillDb = { prepare(sql: string): Stmt };

export type EnglishFillReport = { id: string; filled?: string[]; left?: string[]; skipped?: string; failure?: string };

export async function runEnglishFill(
  db: EnglishFillDb,
  translators: { apiKey?: string | null; ai?: WorkersAi | null },
  now = Date.now(),
): Promise<{ translated: number; report: EnglishFillReport[] }> {
  const rows = ((await db.prepare("SELECT id, status, updated_at, data FROM properties WHERE status != 'archived' ORDER BY updated_at DESC").all()).results ?? []) as Row[];
  const report: EnglishFillReport[] = [];
  let translated = 0;
  for (const row of rows) {
    if (translated >= MAX_PER_RUN) break;
    let p: Property;
    try {
      p = propertySchema.parse(JSON.parse(row.data));
    } catch {
      continue;
    }
    const missing = missingEnglishFields(p);
    if (!missing.length) continue;
    if (now - Date.parse(row.updated_at) < QUIET_MS) {
      report.push({ id: row.id, skipped: "recently_edited" });
      continue;
    }
    translated++;
    const { property, failure } = await fillPropertyEnglishUsing(p, (input) => translatePropertyWithFallback(input, translators));
    const left = missingEnglishFields(property);
    const filled = missing.filter((m) => !left.includes(m));
    if (!filled.length) {
      report.push({ id: row.id, left, failure: failure ? (failure.kind === "http" ? `http ${failure.status} ${failure.message ?? ""}`.trim() : failure.kind) : "none" });
      continue;
    }
    // 更新日時（updated_at / updatedAt）は進めない（2026-09-23）。進めると、編集画面を開いたまま
    // 置いていた人の次の保存が「他の画面で更新されました」で止まる。英語欄だけを静かに足す。
    // 編集中の保存で英語欄が空に戻っても、編集が終われば次の回にまた埋まる。
    const next = JSON.stringify({ ...property, updatedAt: p.updatedAt });
    const res = await db
      .prepare("UPDATE properties SET data = ? WHERE id = ? AND updated_at = ? AND data = ?")
      .bind(next, row.id, row.updated_at, row.data)
      .run();
    if (!res.meta?.changes) {
      report.push({ id: row.id, skipped: "changed_meanwhile" });
      continue;
    }
    report.push({ id: row.id, filled, left });
  }
  return { translated, report };
}
